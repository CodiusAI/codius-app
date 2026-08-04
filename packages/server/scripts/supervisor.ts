import { fork, spawn, type ChildProcess } from "child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createStream as createRotatingFileStream } from "rotating-file-stream";

interface SupervisorLogFileOptions {
  path: string;
  rotate: {
    maxSize: string;
    maxFiles: number;
  };
}

type WorkerLifecycleMessage =
  | {
      type: "codius:shutdown";
      reason?: string;
    }
  | {
      type: "codius:ready";
      listen: string;
    }
  | {
      type: "codius:restart";
      reason?: string;
    }
  | ({
      type: "codius:fatal";
    } & WorkerFatalReport);

/** A worker failure that restarting cannot fix on its own, such as a port already bound. */
export interface WorkerFatalReport {
  reason: string;
  detail?: string;
}

/**
 * What the supervisor should do after a fatal worker exit: `retry` when the handler cleared the
 * blocker, `backoff` to keep retrying slowly, `stop` to give up and exit.
 */
export type WorkerFatalDisposition = "retry" | "backoff" | "stop";

/** Lets a fatal-error handler record what it did in the same log as the rest of the lifecycle. */
export interface WorkerFatalContext {
  log: (message: string, fields?: Record<string, unknown>) => void;
}

interface SupervisorHeartbeatMessage {
  type: "codius:supervisor-heartbeat";
}

// A worker that dies on startup dies instantly, so an unthrottled restart loop spins at process
// spawn speed and floods the log. Back off instead of giving up, so the daemon still recovers on
// its own once whatever blocked it clears.
const CRASH_BACKOFF_BASE_MS = 250;
const CRASH_BACKOFF_MAX_MS = 15_000;
const HEALTHY_WORKER_UPTIME_MS = 30_000;

interface SupervisorOptions {
  name: string;
  startupMessage: string;
  resolveWorkerEntry: () => string;
  workerArgs?: string[];
  workerEnv?: NodeJS.ProcessEnv;
  workerExecArgv?: string[];
  resolveWorkerSpawnSpec?: (workerEntry: string) => {
    command: string;
    args: string[];
    env?: NodeJS.ProcessEnv;
  } | null;
  onWorkerReady?: (message: { listen: string }) => Promise<void> | void;
  onWorkerFatal?: (
    report: WorkerFatalReport,
    context: WorkerFatalContext,
  ) => Promise<WorkerFatalDisposition> | WorkerFatalDisposition;
  restartOnCrash?: boolean;
  onSupervisorExit?: () => Promise<void> | void;
  logFile?: SupervisorLogFileOptions;
}

export interface SupervisorController {
  requestShutdown(reason: string): void;
}

function describeExit(code: number | null, signal: NodeJS.Signals | null): string {
  return signal ?? (typeof code === "number" ? `code ${code}` : "unknown");
}

function parseLifecycleMessage(msg: unknown): WorkerLifecycleMessage | null {
  if (typeof msg !== "object" || msg === null || !("type" in msg)) {
    return null;
  }
  const type = (msg as { type?: unknown }).type;
  if (type === "codius:shutdown") {
    const reason = (msg as { reason?: unknown }).reason;
    return {
      type: "codius:shutdown",
      ...(typeof reason === "string" && reason.trim().length > 0 ? { reason } : {}),
    };
  }
  if (type === "codius:ready") {
    const listen = (msg as { listen?: unknown }).listen;
    if (typeof listen !== "string" || listen.trim().length === 0) {
      return null;
    }
    return { type: "codius:ready", listen };
  }
  if (type === "codius:restart") {
    const reason = (msg as { reason?: unknown }).reason;
    return {
      type: "codius:restart",
      ...(typeof reason === "string" && reason.trim().length > 0 ? { reason } : {}),
    };
  }
  if (type === "codius:fatal") {
    const reason = (msg as { reason?: unknown }).reason;
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return null;
    }
    const detail = (msg as { detail?: unknown }).detail;
    return {
      type: "codius:fatal",
      reason,
      ...(typeof detail === "string" && detail.trim().length > 0 ? { detail } : {}),
    };
  }
  return null;
}

function toRotatingFileStreamSize(size: string): string {
  const trimmed = size.trim();
  const match = trimmed.match(/^(\d+)\s*([bBkKmMgG])?$/);
  if (!match) {
    return trimmed;
  }

  const value = match[1];
  const unit = (match[2] ?? "M").toUpperCase();
  return `${value}${unit}`;
}

function createSupervisorLogStream(options: SupervisorLogFileOptions | undefined) {
  if (!options) {
    return null;
  }

  mkdirSync(path.dirname(options.path), { recursive: true });
  return createRotatingFileStream(path.basename(options.path), {
    path: path.dirname(options.path),
    size: toRotatingFileStreamSize(options.rotate.maxSize),
    maxFiles: options.rotate.maxFiles,
  });
}

export function runSupervisor(options: SupervisorOptions): SupervisorController {
  const restartOnCrash = options.restartOnCrash ?? false;
  const workerArgs = options.workerArgs ?? process.argv.slice(2);
  const workerEnv = options.workerEnv ?? process.env;
  const workerExecArgv = options.workerExecArgv ?? ["--import", "tsx"];
  const resolveWorkerSpawnSpec = options.resolveWorkerSpawnSpec;

  let child: ChildProcess | null = null;
  let restarting = false;
  let shuttingDown = false;
  let exiting = false;
  let consecutiveFastCrashes = 0;
  const logStream = createSupervisorLogStream(options.logFile);

  const writeDurableChunk = (chunk: string | Buffer): void => {
    logStream?.write(chunk);
  };

  const writeLifecycleLog = (message: string, fields: Record<string, unknown> = {}): void => {
    writeDurableChunk(
      `${JSON.stringify({
        level: "info",
        time: new Date().toISOString(),
        pid: process.pid,
        name: options.name,
        msg: message,
        ...fields,
      })}\n`,
    );
  };

  const log = (message: string): void => {
    process.stderr.write(`[${options.name}] ${message}\n`);
    writeLifecycleLog(message);
  };

  const closeLogStream = (): Promise<void> =>
    new Promise((resolve) => {
      if (!logStream) {
        resolve();
        return;
      }
      logStream.end(resolve);
    });

  const exitSupervisor = (code: number): void => {
    if (exiting) {
      return;
    }
    exiting = true;
    Promise.resolve(options.onSupervisorExit?.())
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log(`Supervisor exit cleanup failed: ${message}`);
      })
      .then(closeLogStream)
      .finally(() => {
        process.exit(code);
      });
  };

  const spawnWorker = () => {
    let workerEntry: string;
    try {
      // Resolve at spawn time so restarts pick up current filesystem state.
      workerEntry = options.resolveWorkerEntry();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Failed to resolve worker entry: ${message}`);
      exitSupervisor(1);
      return;
    }

    const spawnSpec = resolveWorkerSpawnSpec?.(workerEntry) ?? null;
    writeLifecycleLog("Spawning worker", { workerEntry });
    if (spawnSpec) {
      child = spawn(spawnSpec.command, spawnSpec.args, {
        stdio: ["inherit", "pipe", "pipe", "ipc"],
        env: spawnSpec.env ?? workerEnv,
      });
    } else {
      child = fork(workerEntry, workerArgs, {
        stdio: ["inherit", "pipe", "pipe", "ipc"],
        env: workerEnv,
        execArgv: workerExecArgv,
      });
    }

    const currentChild = child;
    const startedAt = Date.now();
    let pendingFatal: WorkerFatalReport | null = null;
    const heartbeat = setInterval(() => {
      const message: SupervisorHeartbeatMessage = { type: "codius:supervisor-heartbeat" };
      if (currentChild.connected) {
        currentChild.send?.(message, (error) => {
          if (error) {
            writeLifecycleLog("Worker heartbeat IPC send failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      } else {
        writeLifecycleLog("Worker heartbeat skipped because IPC channel is disconnected");
      }
    }, 1000);
    heartbeat.unref();

    child.on("disconnect", () => {
      writeLifecycleLog("Worker IPC channel disconnected");
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      writeDurableChunk(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      writeDurableChunk(chunk);
    });

    child.on("message", (msg: unknown) => {
      const lifecycleMessage = parseLifecycleMessage(msg);
      if (!lifecycleMessage) {
        return;
      }

      if (lifecycleMessage.type === "codius:ready") {
        writeLifecycleLog("Worker ready", { listen: lifecycleMessage.listen });
        Promise.resolve(options.onWorkerReady?.({ listen: lifecycleMessage.listen })).catch(
          (error) => {
            const message = error instanceof Error ? error.message : String(error);
            log(`Worker ready callback failed: ${message}`);
          },
        );
        return;
      }

      if (lifecycleMessage.type === "codius:fatal") {
        pendingFatal = {
          reason: lifecycleMessage.reason,
          ...(lifecycleMessage.detail ? { detail: lifecycleMessage.detail } : {}),
        };
        writeLifecycleLog("Worker reported fatal error", { ...pendingFatal });
        return;
      }

      if (lifecycleMessage.type === "codius:shutdown") {
        const reason = lifecycleMessage.reason ?? "worker_requested_shutdown";
        writeLifecycleLog("Worker requested shutdown", { reason });
        requestShutdown(reason);
        return;
      }

      const reason = lifecycleMessage.reason ?? "worker_requested_restart";
      writeLifecycleLog("Worker requested restart", { reason });
      requestRestart(reason);
    });

    child.on("close", (code, signal) => {
      clearInterval(heartbeat);
      child = null;
      const uptimeMs = Date.now() - startedAt;
      const fatal = pendingFatal;
      pendingFatal = null;
      const exitDescriptor = describeExit(code, signal);
      writeLifecycleLog("Worker exited", {
        code,
        signal,
        exit: exitDescriptor,
        uptimeMs,
        ...(fatal ? { fatalReason: fatal.reason } : {}),
      });

      void handleWorkerClose({ code, signal, exitDescriptor, uptimeMs, fatal }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log(`Worker exit handling failed: ${message}`);
        exitSupervisor(1);
      });
    });
  };

  const scheduleRestart = (exitDescriptor: string, uptimeMs: number): void => {
    // A worker that ran long enough to be healthy starts the backoff over.
    if (uptimeMs >= HEALTHY_WORKER_UPTIME_MS) {
      consecutiveFastCrashes = 0;
    }
    consecutiveFastCrashes += 1;
    const delayMs = Math.min(
      CRASH_BACKOFF_BASE_MS * 2 ** (consecutiveFastCrashes - 1),
      CRASH_BACKOFF_MAX_MS,
    );

    log(`Worker crashed (${exitDescriptor}). Restarting worker in ${delayMs}ms...`);
    writeLifecycleLog("Restarting worker after crash", {
      delayMs,
      consecutiveFastCrashes,
      uptimeMs,
    });
    setTimeout(() => {
      if (shuttingDown || exiting) {
        return;
      }
      spawnWorker();
    }, delayMs);
  };

  const resolveFatalDisposition = async (
    fatal: WorkerFatalReport,
  ): Promise<WorkerFatalDisposition> => {
    if (!options.onWorkerFatal) {
      return "backoff";
    }
    try {
      return await options.onWorkerFatal(fatal, { log: writeLifecycleLog });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Fatal worker error handler failed: ${message}`);
      return "backoff";
    }
  };

  const handleWorkerClose = async (exit: {
    code: number | null;
    signal: NodeJS.Signals | null;
    exitDescriptor: string;
    uptimeMs: number;
    fatal: WorkerFatalReport | null;
  }): Promise<void> => {
    const { code, signal, exitDescriptor, uptimeMs, fatal } = exit;

    if (shuttingDown) {
      log(`Worker exited (${exitDescriptor}). Supervisor shutting down.`);
      exitSupervisor(0);
      return;
    }

    if (restarting) {
      restarting = false;
      consecutiveFastCrashes = 0;
      log(`Worker exited (${exitDescriptor}). Restarting worker...`);
      spawnWorker();
      return;
    }

    const crashed =
      restartOnCrash &&
      ((code !== 0 && code !== null) || (signal !== null && signal !== "SIGTERM"));

    if (!crashed) {
      log(`Worker exited (${exitDescriptor}). Supervisor exiting.`);
      exitSupervisor(typeof code === "number" ? code : 1);
      return;
    }

    if (fatal) {
      const disposition = await resolveFatalDisposition(fatal);
      writeLifecycleLog("Resolved fatal worker error", { reason: fatal.reason, disposition });

      if (disposition === "stop") {
        log(`Worker reported a fatal error (${fatal.reason}). Supervisor exiting.`);
        exitSupervisor(1);
        return;
      }

      // The handler cleared what blocked the worker, so the next start is not a repeat failure.
      if (disposition === "retry") {
        consecutiveFastCrashes = 0;
      }
    }

    scheduleRestart(exitDescriptor, uptimeMs);
  };

  const signalWorker = (signal: NodeJS.Signals, reason: string): void => {
    if (!child) {
      return;
    }
    writeLifecycleLog("Supervisor sending signal to worker", {
      reason,
      signal,
      supervisorPid: process.pid,
      workerPid: child.pid ?? null,
    });
    child.kill(signal);
  };

  const requestRestart = (reason: string) => {
    if (!child || restarting || shuttingDown) {
      return;
    }
    restarting = true;
    writeLifecycleLog("Restart requested", { reason });
    log(`${reason}. Stopping worker for restart...`);
    signalWorker("SIGTERM", reason);
  };

  const requestShutdown = (reason: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    restarting = false;
    writeLifecycleLog("Supervisor shutdown requested", { reason });
    log(`${reason}. Stopping worker...`);
    if (!child) {
      exitSupervisor(0);
      return;
    }
    signalWorker("SIGTERM", reason);
  };

  const forwardSignal = (signal: NodeJS.Signals) => {
    requestShutdown(`supervisor_received_${signal}`);
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  process.stdout.write(`[${options.name}] ${options.startupMessage}\n`);
  writeLifecycleLog(options.startupMessage);
  spawnWorker();

  return { requestShutdown };
}
