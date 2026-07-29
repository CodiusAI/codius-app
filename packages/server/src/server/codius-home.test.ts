import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { resolveCodiusHome } from "./codius-home.js";
import { PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE } from "./private-files.js";

const MODE_MASK = 0o777;

function modeOf(filePath: string): number {
  return statSync(filePath).mode & MODE_MASK;
}

describe.skipIf(process.platform === "win32")("Codius home permissions and defaults", () => {
  test("creates CODIUS_HOME without a product-specific coding agent", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "codius-home-parent-"));
    const codiusHome = path.join(parent, "home");
    try {
      expect(resolveCodiusHome({ CODIUS_HOME: codiusHome, CODIUS_SEED_DEFAULTS: "1" })).toBe(
        codiusHome,
      );
      expect(modeOf(codiusHome)).toBe(PRIVATE_DIRECTORY_MODE);

      const configPath = path.join(codiusHome, "config.json");
      expect(modeOf(configPath)).toBe(PRIVATE_FILE_MODE);
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      expect(config.daemon.relay.enabled).toBe(false);
      expect(config.agents).toBeUndefined();
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("removes the retired provider from an existing config", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "codius-home-migration-parent-"));
    const codiusHome = path.join(parent, "home");
    try {
      expect(resolveCodiusHome({ CODIUS_HOME: codiusHome, CODIUS_SEED_DEFAULTS: "0" })).toBe(
        codiusHome,
      );
      const configPath = path.join(codiusHome, "config.json");
      writeFileSync(
        configPath,
        `${JSON.stringify({
          version: 1,
          agents: {
            providers: {
              codius: { retired: true },
              custom: { extends: "acp", command: ["custom-agent", "acp"] },
            },
          },
        })}\n`,
        { mode: PRIVATE_FILE_MODE },
      );

      expect(resolveCodiusHome({ CODIUS_HOME: codiusHome, CODIUS_SEED_DEFAULTS: "0" })).toBe(
        codiusHome,
      );

      const config = JSON.parse(readFileSync(configPath, "utf8"));
      expect(config.agents.providers.codius).toBeUndefined();
      expect(config.agents.providers.custom).toEqual({
        extends: "acp",
        command: ["custom-agent", "acp"],
      });
      expect(modeOf(configPath)).toBe(PRIVATE_FILE_MODE);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("uses CODIUS_HOME when configured", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "codius-home-precedence-"));
    try {
      expect(
        resolveCodiusHome({
          CODIUS_HOME: path.join(parent, "codius"),
          CODIUS_SEED_DEFAULTS: "0",
        }),
      ).toBe(path.join(parent, "codius"));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
