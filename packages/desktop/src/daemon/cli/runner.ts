import { spawnProcess } from "@codius.ai/server";
import log from "electron-log/main";
import type { NodeEntrypointInvocation } from "../node-entrypoint-launcher.js";
import { createNodeEntrypointInvocation } from "../runtime-paths.js";
import { resolveCliEntrypoint } from "./entrypoints.js";

function createCliInvocation(args: string[]): NodeEntrypointInvocation {
  return createNodeEntrypointInvocation({
    entrypoint: resolveCliEntrypoint(),
    argvMode: "node-script",
    args,
    baseEnv: process.env,
  });
}

function spawnCli(
  invocation: NodeEntrypointInvocation,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(invocation.command, invocation.args, {
      envMode: "internal",
      env: invocation.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout!.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr!.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

function cliFailureMessage(exitCode: number | null, stdout: string, stderr: string): string {
  if (stderr.length > 0) {
    return stderr;
  }

  return `Codius CLI command failed with exit code ${exitCode}${stdout.length > 0 ? `\nstdout: ${stdout.slice(0, 200)}` : ""}`;
}

export async function runCliTextCommand(args: string[]): Promise<string> {
  const invocation = createCliInvocation(args);
  const result = await spawnCli(invocation);

  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    log.warn("[desktop cli]", "Codius CLI text command failed", {
      args,
      exitCode: result.exitCode,
      stdout: stdout.slice(0, 500),
      stderr: stderr.slice(0, 500),
    });
    throw new Error(cliFailureMessage(result.exitCode, stdout, stderr));
  }

  return result.stdout.trimEnd();
}

export async function runCliJsonCommand(args: string[]): Promise<unknown> {
  const invocation = createCliInvocation(args);
  const result = await spawnCli(invocation);

  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    log.warn("[desktop cli]", "Codius CLI JSON command failed", {
      args,
      exitCode: result.exitCode,
      stdout: stdout.slice(0, 500),
      stderr: stderr.slice(0, 500),
      command: invocation.command,
    });
    throw new Error(cliFailureMessage(result.exitCode, stdout, stderr));
  }

  const stdout = result.stdout.trim();
  if (stdout.length === 0) {
    log.warn("[desktop cli]", "Codius CLI command produced no output", { args });
    throw new Error("Codius CLI command did not produce JSON output.");
  }

  const jsonStart = stdout.search(/[{[]/);
  if (jsonStart < 0) {
    log.warn("[desktop cli]", "Codius CLI command output contained no JSON", {
      args,
      stdout: stdout.slice(0, 500),
    });
    throw new Error(`Codius CLI command output contained no JSON. Output: ${stdout.slice(0, 200)}`);
  }

  try {
    return JSON.parse(stdout.slice(jsonStart)) as unknown;
  } catch (error) {
    throw new Error(
      `Codius CLI command returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
