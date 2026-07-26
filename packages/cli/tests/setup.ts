/**
 * Test setup utilities for Codius CLI E2E tests
 *
 * Critical rules from design doc:
 * 1. Port: Random port via 10000 + Math.floor(Math.random() * 50000) - NEVER 6767
 * 2. Protocol: WebSocket ONLY - daemon has no HTTP endpoints
 * 3. Temp dirs: Create temp directories for CODIUS_HOME and agent --cwd
 * 4. Model: Always --provider claude with haiku model for agent tests
 * 5. Cleanup: Kill daemon and remove temp dirs after each test
 */

import { $, ProcessPromise, sleep } from "zx";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const TEST_ENV_DEFAULTS = {
  CODIUS_LOCAL_SPEECH_AUTO_DOWNLOAD: process.env.CODIUS_LOCAL_SPEECH_AUTO_DOWNLOAD ?? "0",
  CODIUS_DICTATION_ENABLED: process.env.CODIUS_DICTATION_ENABLED ?? "0",
  CODIUS_VOICE_MODE_ENABLED: process.env.CODIUS_VOICE_MODE_ENABLED ?? "0",
};

function killPidTree(pid: number, signal: NodeJS.Signals): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        return;
      }
    }
  }

  try {
    process.kill(pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") {
      throw error;
    }
  }
}

export interface TestContext {
  /** Random port for test daemon (never 6767) */
  port: number;
  /** Temp directory for CODIUS_HOME */
  codiusHome: string;
  /** Temp directory for agent working directory */
  workDir: string;
  /** Running daemon process */
  daemon: ProcessPromise | null;
  /** Run a codiusctl CLI command against the test daemon */
  codius: (args: string[]) => ProcessPromise;
  /** Clean up all resources */
  cleanup: () => Promise<void>;
}

/**
 * Generate a random port for test daemon
 * NEVER uses 6767 (user's running daemon)
 */
export function getRandomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

/**
 * Create isolated temp directories for testing
 */
export async function createTempDirs(): Promise<{ codiusHome: string; workDir: string }> {
  const codiusHome = await mkdtemp(join(tmpdir(), "codius-test-home-"));
  const workDir = await mkdtemp(join(tmpdir(), "codius-test-work-"));
  return { codiusHome, workDir };
}

/**
 * Wait for daemon to be ready by testing WebSocket connection
 * Uses `codiusctl agent ls` which connects via WebSocket
 */
async function probeDaemon(port: number): Promise<boolean> {
  try {
    const result = await $`CODIUS_HOST=localhost:${port} codiusctl agent ls`.nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function waitForDaemon(port: number, timeout = 30000): Promise<void> {
  const deadline = Date.now() + timeout;
  async function poll(): Promise<void> {
    if (await probeDaemon(port)) return;
    if (Date.now() >= deadline) {
      throw new Error(`Daemon failed to start on port ${port} within ${timeout}ms`);
    }
    await sleep(100);
    return poll();
  }
  return poll();
}

/**
 * Start an isolated test daemon
 */
export async function startDaemon(port: number, codiusHome: string): Promise<ProcessPromise> {
  $.verbose = false;
  const daemon =
    $`CODIUS_HOME=${codiusHome} CODIUS_LISTEN=127.0.0.1:${port} CODIUS_RELAY_ENABLED=false CODIUS_LOCAL_SPEECH_AUTO_DOWNLOAD=${TEST_ENV_DEFAULTS.CODIUS_LOCAL_SPEECH_AUTO_DOWNLOAD} CODIUS_DICTATION_ENABLED=${TEST_ENV_DEFAULTS.CODIUS_DICTATION_ENABLED} CODIUS_VOICE_MODE_ENABLED=${TEST_ENV_DEFAULTS.CODIUS_VOICE_MODE_ENABLED} CI=true codiusctl daemon start --foreground`.nothrow();
  return daemon;
}

/**
 * Create a full test context with daemon, temp dirs, and helpers
 */
export async function createTestContext(): Promise<TestContext> {
  const port = getRandomPort();
  const { codiusHome, workDir } = await createTempDirs();

  // Helper to run CLI commands against test daemon
  const codius = (args: string[]): ProcessPromise => {
    $.verbose = false;
    return $`CODIUS_HOST=localhost:${port} CODIUS_LOCAL_SPEECH_AUTO_DOWNLOAD=${TEST_ENV_DEFAULTS.CODIUS_LOCAL_SPEECH_AUTO_DOWNLOAD} CODIUS_DICTATION_ENABLED=${TEST_ENV_DEFAULTS.CODIUS_DICTATION_ENABLED} CODIUS_VOICE_MODE_ENABLED=${TEST_ENV_DEFAULTS.CODIUS_VOICE_MODE_ENABLED} codiusctl ${args}`.nothrow();
  };

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    if (ctx.daemon) {
      if (typeof ctx.daemon.pid === "number") {
        killPidTree(ctx.daemon.pid, "SIGTERM");
        await sleep(250);
        killPidTree(ctx.daemon.pid, "SIGKILL");
      } else {
        ctx.daemon.kill();
      }
    }
    await rm(codiusHome, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  };

  const ctx: TestContext = {
    port,
    codiusHome,
    workDir,
    daemon: null,
    codius,
    cleanup,
  };

  return ctx;
}

/**
 * Create a test context and start the daemon
 * Use this for tests that need a running daemon
 */
export async function createTestContextWithDaemon(): Promise<TestContext> {
  const ctx = await createTestContext();
  ctx.daemon = await startDaemon(ctx.port, ctx.codiusHome);
  await waitForDaemon(ctx.port);
  return ctx;
}

/**
 * Register cleanup handlers for process exit
 */
export function registerCleanupHandlers(cleanup: () => Promise<void>): void {
  const handler = async () => {
    await cleanup();
    process.exit(0);
  };

  process.on("exit", () => {
    // Can't await in exit handler, but at least try to kill daemon
  });
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
