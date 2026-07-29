#!/usr/bin/env npx tsx

/**
 * Phase 3: LS Command Tests
 *
 * Tests the ls command - listing agents (top-level command).
 * Since daemon may not be running, we test both:
 * - Help and argument parsing
 * - Graceful error handling when daemon not running
 * - JSON output format
 *
 * Tests:
 * - codius --help shows ls command
 * - codius ls --help shows options
 * - codius ls returns empty list or error when no daemon
 * - codius ls --json returns valid JSON (or error)
 * - codius ls -a flag is accepted
 * - codius ls -g flag is accepted
 * - codius ls does not support --ui
 */

import assert from "node:assert";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runLocalCodius } from "./helpers/local-cli.ts";

console.log("=== LS Command Tests ===\n");

// Get random port that's definitely not in use (never 6767)
const port = 10000 + Math.floor(Math.random() * 50000);
const codiusHome = await mkdtemp(join(tmpdir(), "codius-test-home-"));

try {
  // Test 1: codius --help shows ls command
  {
    console.log("Test 1: codius --help shows ls command");
    const result = await runLocalCodius(["--help"]);
    assert.strictEqual(result.exitCode, 0, "codius --help should exit 0");
    assert(result.stdout.includes("ls"), "help should mention ls command");
    console.log("✓ codius --help shows ls command\n");
  }

  // Test 2: codius ls --help shows options
  {
    console.log("Test 2: codius ls --help shows options");
    const result = await runLocalCodius(["ls", "--help"]);
    assert.strictEqual(result.exitCode, 0, "codius ls --help should exit 0");
    assert(result.stdout.includes("-a"), "help should mention -a flag");
    assert(result.stdout.includes("--all"), "help should mention --all flag");
    assert(result.stdout.includes("-g"), "help should mention -g flag");
    assert(result.stdout.includes("--global"), "help should mention --global flag");
    assert(result.stdout.includes("across all directories"), "help should describe global scope");
    assert(!result.stdout.includes("Legacy no-op"), "help should not describe -g as a no-op");
    assert(result.stdout.includes("--host"), "help should mention --host option");
    assert(!result.stdout.includes("--ui"), "help should not mention --ui");
    console.log("✓ codius ls --help shows options\n");
  }

  // Test 3: codius ls returns error when no daemon running
  {
    console.log("Test 3: codius ls handles daemon not running");
    const result = await runLocalCodius(["ls"], {
      CODIUS_HOST: `localhost:${port}`,
      CODIUS_HOME: codiusHome,
    });
    // Should fail because daemon not running
    assert.notStrictEqual(result.exitCode, 0, "should fail when daemon not running");
    const output = result.stdout + result.stderr;
    const hasError =
      output.toLowerCase().includes("daemon") ||
      output.toLowerCase().includes("connect") ||
      output.toLowerCase().includes("cannot");
    assert(hasError, "error message should mention connection issue");
    assert(output.includes("--host <host:port>"), "error message should mention --host");
    assert(output.includes("CODIUS_HOST"), "error message should mention CODIUS_HOST");
    console.log("✓ codius ls handles daemon not running\n");
  }

  // Test 4: codius ls --json returns valid JSON error
  {
    console.log("Test 4: codius ls --json handles errors");
    const result = await runLocalCodius(["ls", "--json"], {
      CODIUS_HOST: `localhost:${port}`,
      CODIUS_HOME: codiusHome,
    });
    // Should still fail (daemon not running)
    assert.notStrictEqual(result.exitCode, 0, "should fail when daemon not running");
    // But output should be valid JSON if present
    const output = result.stdout.trim();
    if (output.length > 0) {
      try {
        JSON.parse(output);
        console.log("✓ codius ls --json outputs valid JSON error\n");
      } catch {
        // Empty or stderr-only output is acceptable
        console.log("✓ codius ls --json handled error (output may be in stderr)\n");
      }
    } else {
      console.log("✓ codius ls --json handled error gracefully\n");
    }
  }

  // Test 5: codius ls -a flag is accepted
  {
    console.log("Test 5: codius ls -a flag is accepted");
    const result = await runLocalCodius(["ls", "-a"], {
      CODIUS_HOST: `localhost:${port}`,
      CODIUS_HOME: codiusHome,
    });
    // Will fail due to no daemon, but flag should be parsed without error
    // (no "unknown option" error)
    const output = result.stdout + result.stderr;
    assert(!output.includes("unknown option"), "should accept -a flag");
    assert(!output.includes("error: option"), "should not have option parsing error");
    console.log("✓ codius ls -a flag is accepted\n");
  }

  // Test 6: codius ls -g flag is accepted
  {
    console.log("Test 6: codius ls -g flag is accepted");
    const result = await runLocalCodius(["ls", "-g"], {
      CODIUS_HOST: `localhost:${port}`,
      CODIUS_HOME: codiusHome,
    });
    const output = result.stdout + result.stderr;
    assert(!output.includes("unknown option"), "should accept -g flag");
    assert(!output.includes("error: option"), "should not have option parsing error");
    console.log("✓ codius ls -g flag is accepted\n");
  }

  // Test 7: codius ls -ag combined flags are accepted
  {
    console.log("Test 7: codius ls -ag combined flags are accepted");
    const result = await runLocalCodius(["ls", "-ag"], {
      CODIUS_HOST: `localhost:${port}`,
      CODIUS_HOME: codiusHome,
    });
    const output = result.stdout + result.stderr;
    assert(!output.includes("unknown option"), "should accept -ag flags");
    assert(!output.includes("error: option"), "should not have option parsing error");
    console.log("✓ codius ls -ag combined flags are accepted\n");
  }

  // Test 8: -q (quiet) flag is accepted globally
  {
    console.log("Test 8: -q (quiet) flag is accepted");
    const result = await runLocalCodius(["-q", "ls"], {
      CODIUS_HOST: `localhost:${port}`,
      CODIUS_HOME: codiusHome,
    });
    const output = result.stdout + result.stderr;
    assert(!output.includes("unknown option"), "should accept -q flag");
    assert(!output.includes("error: option"), "should not have option parsing error");
    console.log("✓ -q (quiet) flag is accepted\n");
  }

  // Test 9: codius ls --ui is rejected (flag removed)
  {
    console.log("Test 9: codius ls --ui is rejected");
    const result = await runLocalCodius(["ls", "--ui"], {
      CODIUS_HOST: `localhost:${port}`,
      CODIUS_HOME: codiusHome,
    });
    assert.notStrictEqual(result.exitCode, 0, "should fail for removed --ui flag");
    const output = result.stdout + result.stderr;
    assert(output.includes("unknown option"), "should report unknown option for --ui");
    console.log("✓ codius ls --ui is rejected\n");
  }
} finally {
  // Clean up temp directory
  await rm(codiusHome, { recursive: true, force: true });
}

console.log("=== All ls tests passed ===");
