import { execFile } from "node:child_process";
import { promisify } from "node:util";
import treeKill from "tree-kill";

const execFileAsync = promisify(execFile);

// Both the worker and the supervisor set process.title, so `ps` reports these names for our own
// processes. Eviction matches on the title because anything else listening on the daemon port is
// someone else's server and must never be killed.
const CODIUS_PROCESS_TITLE = /^Codius (Daemon|Supervisor)\b/;

const DEFAULT_GRACEFUL_TIMEOUT_MS = 3_000;
const DEFAULT_KILL_TIMEOUT_MS = 2_000;
const PID_POLL_INTERVAL_MS = 50;

export interface ProcessIdentity {
  pid: number;
  command: string;
}

export interface PortEvictionResult {
  /** Codius process trees that were terminated and confirmed dead. */
  evicted: ProcessIdentity[];
  /** Port holders left running: not ours, or they survived SIGKILL. */
  blocked: ProcessIdentity[];
}

export interface EvictPortOwnersOptions {
  gracefulTimeoutMs?: number;
  killTimeoutMs?: number;
}

export function isCodiusProcessTitle(command: string): boolean {
  return CODIUS_PROCESS_TITLE.test(command.trim());
}

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return isErrnoCode(error, "EPERM");
  }
}

function isSignalablePid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 1 && pid !== process.pid && pid !== process.ppid;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readProcessField(pid: number, field: "command" | "ppid"): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", `${field}=`, "-p", String(pid)]);
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    // ps exits non-zero when the pid is gone.
    return null;
  }
}

async function readProcessIdentity(pid: number): Promise<ProcessIdentity | null> {
  const command = await readProcessField(pid, "command");
  return command === null ? null : { pid, command };
}

async function readParentPid(pid: number): Promise<number | null> {
  const raw = await readProcessField(pid, "ppid");
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * PIDs holding a listening socket on `port`. Returns an empty list on Windows, where the daemon
 * has no equivalent lookup — callers fall back to reporting the conflict instead of clearing it.
 */
export async function findListeningPortOwnerPids(port: number): Promise<number[]> {
  if (process.platform === "win32") {
    return [];
  }

  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    const pids = stdout
      .split("\n")
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
    return [...new Set(pids)];
  } catch {
    // lsof exits non-zero when nothing matches, and is absent on some minimal systems.
    return [];
  }
}

/**
 * Killing only the wedged worker lets its supervisor respawn a replacement that grabs the port
 * again, so eviction targets the supervisor when the holder has one.
 */
async function resolveEvictionTarget(holder: ProcessIdentity): Promise<ProcessIdentity> {
  const parentPid = await readParentPid(holder.pid);
  if (parentPid === null || !isSignalablePid(parentPid)) {
    return holder;
  }

  const parent = await readProcessIdentity(parentPid);
  if (parent === null || !isCodiusProcessTitle(parent.command)) {
    return holder;
  }

  return parent;
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isPidAlive(pid)) {
    if (Date.now() >= deadline) {
      return !isPidAlive(pid);
    }
    await sleep(PID_POLL_INTERVAL_MS);
  }
  return true;
}

export function terminateProcessTree(pid: number, signal: NodeJS.Signals): Promise<void> {
  return new Promise((resolve) => {
    treeKill(pid, signal, () => resolve());
  });
}

async function terminateAndConfirm(pid: number, options: EvictPortOwnersOptions): Promise<boolean> {
  await terminateProcessTree(pid, "SIGTERM");
  if (await waitForPidExit(pid, options.gracefulTimeoutMs ?? DEFAULT_GRACEFUL_TIMEOUT_MS)) {
    return true;
  }

  await terminateProcessTree(pid, "SIGKILL");
  return waitForPidExit(pid, options.killTimeoutMs ?? DEFAULT_KILL_TIMEOUT_MS);
}

/**
 * Terminate `pid` and its children, but only when the process is still one of ours. PIDs are
 * recycled, so a stale record can name a process that now belongs to something else entirely.
 * Returns the terminated process, or null when nothing was killed.
 */
export async function terminateStaleCodiusProcess(
  pid: number,
  options: EvictPortOwnersOptions = {},
): Promise<ProcessIdentity | null> {
  if (!isSignalablePid(pid) || !isPidAlive(pid)) {
    return null;
  }

  const identity = await readProcessIdentity(pid);
  if (identity === null || !isCodiusProcessTitle(identity.command)) {
    return null;
  }

  return (await terminateAndConfirm(pid, options)) ? identity : null;
}

/**
 * Terminate abandoned Codius processes holding `port`. A daemon whose event loop has wedged keeps
 * its listening socket bound while answering nothing, which leaves every replacement stuck on
 * EADDRINUSE. Foreign processes are reported, never signalled.
 */
export async function evictStaleCodiusPortOwners(
  port: number,
  options: EvictPortOwnersOptions = {},
): Promise<PortEvictionResult> {
  const result: PortEvictionResult = { evicted: [], blocked: [] };
  const seenTargets = new Set<number>();

  for (const holderPid of await findListeningPortOwnerPids(port)) {
    if (!isSignalablePid(holderPid)) {
      continue;
    }

    const holder = await readProcessIdentity(holderPid);
    if (holder === null) {
      continue;
    }

    if (!isCodiusProcessTitle(holder.command)) {
      result.blocked.push(holder);
      continue;
    }

    const target = await resolveEvictionTarget(holder);
    if (seenTargets.has(target.pid) || !isSignalablePid(target.pid)) {
      continue;
    }
    seenTargets.add(target.pid);

    if (await terminateAndConfirm(target.pid, options)) {
      result.evicted.push(target);
    } else {
      result.blocked.push(target);
    }
  }

  return result;
}
