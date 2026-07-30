#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const args = ["--config", "electron-builder.yml", ...process.argv.slice(2)];
const require = createRequire(import.meta.url);
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");

// An explicitly empty CSC_LINK (e.g. CI passing ${{ secrets.APPLE_CERTIFICATE }} when the
// secret is not configured) is kept as "" by electron-builder and resolves to the project
// directory, failing with "<dir> not a file". Treat it as "no certificate": drop it and
// fall back to an unsigned build — there is nothing to sign or notarize with.
const cscLink = process.env.CSC_LINK;
const hasEmptyCscLink = typeof cscLink === "string" && cscLink.trim().length === 0;
if (hasEmptyCscLink) {
  delete process.env.CSC_LINK;
}

const isUnsigned =
  hasEmptyCscLink ||
  process.env.CODIUS_UNSIGNED === "true" ||
  process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false";
const hasHardenedRuntimeOverride = args.some((arg) =>
  arg.startsWith("--config.mac.hardenedRuntime="),
);
const hasNotarizeOverride = args.some((arg) => arg.startsWith("--config.mac.notarize="));

if (isUnsigned && !hasHardenedRuntimeOverride) {
  args.push("--config.mac.hardenedRuntime=false");
}

if (isUnsigned && !hasNotarizeOverride) {
  args.push("--config.mac.notarize=false");
}

if (isUnsigned && !process.env.CSC_IDENTITY_AUTO_DISCOVERY) {
  // Skip the pointless keychain scan on unsigned builds.
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}

const result = spawnSync(process.execPath, [electronBuilderCli, ...args], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
