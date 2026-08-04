import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { isPlatform } from "../test-utils/platform.js";
import {
  evictStaleCodiusPortOwners,
  findListeningPortOwnerPids,
  isCodiusProcessTitle,
  terminateStaleCodiusProcess,
} from "./port-owner.js";

const execFileAsync = promisify(execFile);

const spawned: ChildProcess[] = [];

afterEach(() => {
  for (const child of spawned.splice(0)) {
    child.kill("SIGKILL");
  }
});

function spawnFixture(source: string): ChildProcess {
  const child = spawn(process.execPath, ["-e", source], { stdio: ["ignore", "pipe", "ignore"] });
  spawned.push(child);
  return child;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCommand(pid: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "command=", "-p", String(pid)]);
    return stdout.trim();
  } catch {
    return "";
  }
}

/** process.title lands asynchronously from the spawner's point of view. */
async function waitForProcessTitle(pid: number, title: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await readCommand(pid)).startsWith(title)) {
      return;
    }
    await sleep(50);
  }
  throw new Error(`process ${pid} never reported the title ${title}`);
}

function readFirstLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("fixture produced no output")), 5000);
    child.stdout?.setEncoding("utf8");
    child.stdout?.once("data", (chunk: string) => {
      clearTimeout(timeout);
      resolve(chunk.trim());
    });
  });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const IDLE_DAEMON = `process.title = "Codius Daemon"; setInterval(() => {}, 1000);`;
const IDLE_FOREIGN = `setInterval(() => {}, 1000);`;
const WEDGED_DAEMON_LISTENER = `
  process.title = "Codius Daemon";
  const net = require("node:net");
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    process.stdout.write(server.address().port + "\\n");
  });
`;

// POSIX-only: identifying a process by title needs ps, and the port lookup needs lsof.
describe.skipIf(isPlatform("win32"))("port owner eviction", () => {
  test("recognizes our own process titles", () => {
    expect(isCodiusProcessTitle("Codius Daemon")).toBe(true);
    expect(isCodiusProcessTitle("Codius Supervisor   ")).toBe(true);
    expect(isCodiusProcessTitle("node /usr/local/bin/vite")).toBe(false);
    expect(isCodiusProcessTitle("MyCodius Daemon")).toBe(false);
    expect(isCodiusProcessTitle("Codius DaemonRunner")).toBe(false);
  });

  test("terminates an abandoned Codius process", async () => {
    const child = spawnFixture(IDLE_DAEMON);
    const pid = child.pid as number;
    await waitForProcessTitle(pid, "Codius Daemon");

    const terminated = await terminateStaleCodiusProcess(pid);

    expect(terminated?.pid).toBe(pid);
    expect(isAlive(pid)).toBe(false);
  });

  test("leaves a process that is not ours running", async () => {
    const child = spawnFixture(IDLE_FOREIGN);
    const pid = child.pid as number;
    // The fixture keeps the default node title, so it must never be treated as ours.
    await sleep(250);

    const terminated = await terminateStaleCodiusProcess(pid);

    expect(terminated).toBeNull();
    expect(isAlive(pid)).toBe(true);
  });

  test("reports no termination for a pid that is already gone", async () => {
    const child = spawnFixture(IDLE_DAEMON);
    const pid = child.pid as number;
    await waitForProcessTitle(pid, "Codius Daemon");
    child.kill("SIGKILL");
    await sleep(250);

    await expect(terminateStaleCodiusProcess(pid)).resolves.toBeNull();
  });

  test("evicts a wedged Codius process holding the port", async () => {
    const child = spawnFixture(WEDGED_DAEMON_LISTENER);
    const pid = child.pid as number;
    const port = Number.parseInt(await readFirstLine(child), 10);
    await waitForProcessTitle(pid, "Codius Daemon");

    expect(await findListeningPortOwnerPids(port)).toContain(pid);

    const result = await evictStaleCodiusPortOwners(port);

    expect(result.evicted.map((owner) => owner.pid)).toEqual([pid]);
    expect(result.blocked).toEqual([]);
    expect(isAlive(pid)).toBe(false);
    expect(await findListeningPortOwnerPids(port)).toEqual([]);
  });

  test("reports a foreign port holder instead of killing it", async () => {
    const child = spawnFixture(`
      const net = require("node:net");
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        process.stdout.write(server.address().port + "\\n");
      });
    `);
    const pid = child.pid as number;
    const port = Number.parseInt(await readFirstLine(child), 10);

    const result = await evictStaleCodiusPortOwners(port);

    expect(result.evicted).toEqual([]);
    expect(result.blocked.map((owner) => owner.pid)).toEqual([pid]);
    expect(isAlive(pid)).toBe(true);
  });
});
