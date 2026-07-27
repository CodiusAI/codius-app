#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const args = ["--config", "electron-builder.yml", ...process.argv.slice(2)];
const require = createRequire(import.meta.url);
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");
const isUnsigned =
  process.env.CODIUS_UNSIGNED === "true" || process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false";
const hasHardenedRuntimeOverride = args.some((arg) =>
  arg.startsWith("--config.mac.hardenedRuntime="),
);

if (isUnsigned && !hasHardenedRuntimeOverride) {
  args.push("--config.mac.hardenedRuntime=false");
}

const result = spawnSync(process.execPath, [electronBuilderCli, ...args], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
