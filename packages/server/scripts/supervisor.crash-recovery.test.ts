import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const supervisorPath = fileURLToPath(new URL("./supervisor.ts", import.meta.url));

interface SupervisorFixtureResult {
  code: number | null;
  log: string;
}

/**
 * Run the supervisor against a throwaway worker. `stopAfterMs` sends SIGTERM so a restart loop
 * ends with the log stream flushed; without it the fixture waits for the supervisor to exit.
 */
async function runSupervisorFixture(options: {
  workerSource: string;
  onWorkerFatalSource?: string;
  stopAfterMs?: number;
}): Promise<SupervisorFixtureResult> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "codius-supervisor-crash-"));
  const logPath = path.join(tempDir, "daemon.log");
  const workerPath = path.join(tempDir, "worker.mjs");
  const runnerPath = path.join(tempDir, "runner.mjs");

  await writeFile(workerPath, options.workerSource);
  await writeFile(
    runnerPath,
    `
      import { runSupervisor } from ${JSON.stringify(pathToFileURL(supervisorPath).href)};

      runSupervisor({
        name: "TestSupervisor",
        startupMessage: "starting fixture",
        resolveWorkerEntry: () => ${JSON.stringify(workerPath)},
        workerArgs: [],
        workerEnv: process.env,
        workerExecArgv: [],
        restartOnCrash: true,
        ${options.onWorkerFatalSource ? `onWorkerFatal: ${options.onWorkerFatalSource},` : ""}
        logFile: {
          path: ${JSON.stringify(logPath)},
          rotate: { maxSize: "1m", maxFiles: 2 },
        },
      });
    `,
  );

  const child = spawn(process.execPath, ["--import", "tsx", runnerPath], {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.resume();
  child.stderr.resume();

  const stopTimer =
    options.stopAfterMs === undefined
      ? null
      : setTimeout(() => child.kill("SIGTERM"), options.stopAfterMs);

  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("supervisor fixture timed out"));
    }, 20000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });

  if (stopTimer) {
    clearTimeout(stopTimer);
  }

  return { code, log: await readFile(logPath, "utf8") };
}

const CRASHING_WORKER = `process.exit(1);`;

const FATAL_WORKER = `
  process.send?.({
    type: "codius:fatal",
    reason: "listen_addr_in_use",
    detail: "127.0.0.1:6767",
  });
  setTimeout(() => process.exit(1), 50);
`;

describe("supervisor crash recovery", () => {
  test("backs off instead of restarting a crash-looping worker at spawn speed", async () => {
    const result = await runSupervisorFixture({
      workerSource: CRASHING_WORKER,
      stopAfterMs: 3000,
    });

    expect(result.log).toContain('"msg":"Restarting worker after crash"');
    expect(result.log).toContain('"delayMs":250,"consecutiveFastCrashes":1');
    expect(result.log).toContain('"delayMs":500,"consecutiveFastCrashes":2');
    expect(result.log).toContain('"delayMs":1000,"consecutiveFastCrashes":3');
  });

  test("records the worker's fatal reason on exit", async () => {
    const result = await runSupervisorFixture({
      workerSource: FATAL_WORKER,
      stopAfterMs: 2000,
    });

    expect(result.log).toContain('"msg":"Worker reported fatal error"');
    expect(result.log).toContain('"reason":"listen_addr_in_use"');
    expect(result.log).toContain('"detail":"127.0.0.1:6767"');
    expect(result.log).toContain('"fatalReason":"listen_addr_in_use"');
  });

  test("backs off after a fatal exit when no handler is configured", async () => {
    const result = await runSupervisorFixture({
      workerSource: FATAL_WORKER,
      stopAfterMs: 2000,
    });

    expect(result.log).toContain('"disposition":"backoff"');
  });

  test("restarts without backoff when the handler clears the blocker", async () => {
    const result = await runSupervisorFixture({
      workerSource: FATAL_WORKER,
      onWorkerFatalSource: `(report, context) => {
        context.log("test handler cleared the blocker", { reason: report.reason });
        return "retry";
      }`,
      stopAfterMs: 3000,
    });

    expect(result.log).toContain('"msg":"test handler cleared the blocker"');
    expect(result.log).toContain('"disposition":"retry"');
    // The counter resets on every retry, so the delay never grows past the first step.
    expect(result.log).toContain('"delayMs":250,"consecutiveFastCrashes":1');
    expect(result.log).not.toContain('"delayMs":500');
  });

  test("exits instead of restarting when the handler gives up", async () => {
    const result = await runSupervisorFixture({
      workerSource: FATAL_WORKER,
      onWorkerFatalSource: `() => "stop"`,
    });

    expect(result.code).toBe(1);
    expect(result.log).toContain('"disposition":"stop"');
    expect(result.log).toContain("Worker reported a fatal error (listen_addr_in_use)");
    expect(result.log).not.toContain('"msg":"Restarting worker after crash"');
  });
});
