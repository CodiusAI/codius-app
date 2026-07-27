#!/usr/bin/env node
// Cross-repo ACP integration check between Codius and the Codius CLI.
//
// It launches the Codius CLI exactly the way Desktop's built-in provider does
// (the `["codius", "acp"]` command declared in
// packages/server/src/server/codius-defaults.ts), speaks the real Agent Client
// Protocol handshake over ndjson stdio, and asserts the Codius identity,
// capabilities, authentication instructions, model discovery, cancellation
// resilience, and clean shutdown.
//
// Behaviour:
//   * The "missing binary produces a clear error" path is ALWAYS exercised, so
//     the check is meaningful even on machines/CI without the Codius CLI.
//   * The full live handshake runs when a `codius` executable is resolvable on
//     PATH (or via CODIUS_ACP_BIN). Otherwise that portion is skipped with a
//     clear message and the script still exits 0.
//   * Set CODIUS_ACP_REQUIRE=1 to turn a missing CLI into a failure (used when
//     the environment is expected to provide the compiled binary).
//
// Usage:
//   node packages/desktop/scripts/codius-acp-integration.mjs
//   CODIUS_ACP_BIN=/path/to/codius CODIUS_ACP_REQUIRE=1 node .../codius-acp-integration.mjs
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS = path.resolve(__dirname, "../../server/src/server/codius-defaults.ts");

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Derive the launch command from Desktop's own source of truth.
function readProviderCommand() {
  const src = readFileSync(DEFAULTS, "utf8");
  const match = src.match(/command:\s*\[([^\]]*)\]/);
  if (!match) throw new Error(`could not find provider command in ${DEFAULTS}`);
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const command = readProviderCommand();
record(
  'Desktop provider command is ["codius","acp"]',
  command.length === 2 && command[0] === "codius" && command[1] === "acp",
  JSON.stringify(command),
);

// 2. A missing CLI must fail fast with a clear, actionable error (ENOENT),
//    never hang. This is what Desktop surfaces when `codius` is not installed.
async function missingBinaryError() {
  const missing = "codius-definitely-not-installed-xyz";
  return await new Promise((resolve) => {
    const child = spawn(missing, ["acp"], { stdio: ["pipe", "pipe", "pipe"] });
    child.on("error", (err) => resolve(err));
    child.on("exit", () => resolve(null));
  });
}

const err = await missingBinaryError();
record(
  "missing Codius binary yields a clear ENOENT error",
  err && err.code === "ENOENT",
  err ? `${err.code}: ${err.message}` : "no error emitted",
);

// 3. Resolve the real CLI. Skip the live portion cleanly if unavailable.
function resolveBin() {
  if (process.env.CODIUS_ACP_BIN) return process.env.CODIUS_ACP_BIN;
  return "codius"; // rely on PATH, exactly like Desktop
}

async function canSpawn(bin) {
  return await new Promise((resolve) => {
    const child = spawn(bin, ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

const bin = resolveBin();
const available = await canSpawn(bin);

if (!available) {
  const required = process.env.CODIUS_ACP_REQUIRE === "1";
  console.log(
    `\n  Codius CLI ("${bin}") is not available on PATH; skipping the live ACP handshake.` +
      (required
        ? " CODIUS_ACP_REQUIRE=1 -> failing."
        : " Install the Codius CLI or set CODIUS_ACP_BIN to run it."),
  );
  const failedSoFar = results.filter((r) => !r.ok);
  if (failedSoFar.length > 0) process.exit(1);
  process.exit(required ? 1 : 0);
}

// 4. Drive the real ACP handshake over ndjson, as Desktop's client does.
const child = spawn(bin, command.slice(1), { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map();
let nextId = 1;
child.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 20000);
  });
}
function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

try {
  const init = await rpc("initialize", {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
      _meta: { "terminal-auth": true },
    },
  });
  const r = init.result || {};
  record(
    "initialize returns a result",
    !!init.result,
    init.error ? JSON.stringify(init.error) : "",
  );
  record("agentInfo.name === Codius", r.agentInfo?.name === "Codius", r.agentInfo?.name);
  record(
    "protocolVersion is negotiated",
    typeof r.protocolVersion === "number",
    String(r.protocolVersion),
  );
  record("agent version present", !!r.agentInfo?.version, r.agentInfo?.version);

  const am = (r.authMethods || [])[0] || {};
  record("auth method id === codius-login", am.id === "codius-login", am.id);
  record("auth method is Codius-branded", /codius/i.test(am.name || ""), am.name);
  const termAuth = am._meta?.["terminal-auth"];
  record(
    "terminal auth invokes the codius command",
    termAuth?.command === "codius" && Array.isArray(termAuth?.args),
    termAuth ? `${termAuth.command} ${(termAuth.args || []).join(" ")}` : "absent",
  );

  const caps = r.agentCapabilities || {};
  record("advertises loadSession", caps.loadSession === true);
  record(
    "advertises session resume/close/fork/list",
    !!(
      caps.sessionCapabilities?.resume &&
      caps.sessionCapabilities?.close &&
      caps.sessionCapabilities?.fork &&
      caps.sessionCapabilities?.list
    ),
    JSON.stringify(caps.sessionCapabilities || {}),
  );
  record(
    "advertises image + embedded prompt context",
    caps.promptCapabilities?.image === true && caps.promptCapabilities?.embeddedContext === true,
  );

  const session = await rpc("session/new", {
    cwd: process.cwd(),
    mcpServers: [],
  });
  const availableModels = session.result?.models?.availableModels ?? [];
  const modelOptions =
    session.result?.configOptions?.find(
      (option) => option.category === "model" && option.type === "select",
    )?.options ?? [];
  const selectableModelCount = Math.max(availableModels.length, modelOptions.length);
  record(
    "session/new returns selectable models",
    selectableModelCount > 0,
    `models=${selectableModelCount}`,
  );

  // Cancellation for an unknown session must be handled without crashing.
  notify("session/cancel", { sessionId: "codius-integration-nonexistent" });
  await sleep(700);
  record(
    "agent survives cancellation of an unknown session",
    child.exitCode === null,
    `exitCode=${child.exitCode}`,
  );

  // Clean shutdown when the client disconnects (stdin closes).
  child.stdin.end();
  const code = await new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      settle(-1);
    }, 8000);
    child.on("exit", (c) => {
      clearTimeout(t);
      settle(c);
    });
  });
  record("clean exit when stdin closes", code === 0, `exit=${code}`);
} catch (e) {
  record("live ACP handshake completed", false, e.message);
  try {
    child.kill("SIGKILL");
  } catch {}
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${failed.length ? `FAILED ${failed.length}/${results.length}` : `OK ${results.length}/${results.length}`}`,
);
process.exit(failed.length ? 1 : 0);
