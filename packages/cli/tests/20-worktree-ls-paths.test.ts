#!/usr/bin/env npx tsx

import assert from "node:assert";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveCodiusHomePath, resolveCodiusWorktreesDir } from "../src/commands/worktree/ls.js";

console.log("=== Worktree LS Path Helper Tests ===\n");

const originalCodiusHome = process.env.CODIUS_HOME;

try {
  {
    console.log("Test 1: resolves explicit CODIUS_HOME when set");
    process.env.CODIUS_HOME = "/tmp/codius-explicit-home";

    assert.strictEqual(resolveCodiusHomePath(), "/tmp/codius-explicit-home");
    assert.strictEqual(resolveCodiusWorktreesDir(), "/tmp/codius-explicit-home/worktrees");
    console.log("\u2713 explicit CODIUS_HOME is respected\n");
  }

  {
    console.log("Test 2: falls back to homedir/.codius when CODIUS_HOME is unset");
    delete process.env.CODIUS_HOME;

    assert.strictEqual(resolveCodiusHomePath(), join(homedir(), ".codius"));
    assert.strictEqual(resolveCodiusWorktreesDir(), join(homedir(), ".codius", "worktrees"));
    console.log("\u2713 fallback home path is derived from os.homedir()\n");
  }
} finally {
  if (originalCodiusHome === undefined) {
    delete process.env.CODIUS_HOME;
  } else {
    process.env.CODIUS_HOME = originalCodiusHome;
  }
}

console.log("=== All worktree ls path helper tests passed ===");
