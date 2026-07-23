import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { resolvePaseoHome } from "./paseo-home.js";
import { PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE } from "./private-files.js";

const MODE_MASK = 0o777;

function modeOf(filePath: string): number {
  return statSync(filePath).mode & MODE_MASK;
}

describe.skipIf(process.platform === "win32")("Codius home permissions and defaults", () => {
  test("creates CODIUS_HOME with a private default ACP provider config", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "codius-home-parent-"));
    const codiusHome = path.join(parent, "home");
    try {
      expect(resolvePaseoHome({ CODIUS_HOME: codiusHome })).toBe(codiusHome);
      expect(modeOf(codiusHome)).toBe(PRIVATE_DIRECTORY_MODE);

      const configPath = path.join(codiusHome, "config.json");
      expect(modeOf(configPath)).toBe(PRIVATE_FILE_MODE);
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      expect(config.daemon.relay.enabled).toBe(false);
      expect(config.agents.providers.codius).toMatchObject({
        extends: "acp",
        command: ["codius", "acp"],
        enabled: true,
      });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("prefers CODIUS_HOME and keeps PASEO_HOME as a compatibility fallback", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "codius-home-precedence-"));
    try {
      expect(
        resolvePaseoHome({
          CODIUS_HOME: path.join(parent, "codius"),
          PASEO_HOME: path.join(parent, "paseo"),
        }),
      ).toBe(path.join(parent, "codius"));

      expect(resolvePaseoHome({ PASEO_HOME: path.join(parent, "legacy") })).toBe(
        path.join(parent, "legacy"),
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
