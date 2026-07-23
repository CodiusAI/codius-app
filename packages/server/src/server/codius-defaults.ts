import { existsSync } from "node:fs";
import path from "node:path";
import { writePrivateFileAtomicSync } from "./private-files.js";

const CODIUS_DEFAULT_CONFIG = {
  version: 1,
  daemon: {
    listen: "127.0.0.1:6767",
    cors: {
      allowedOrigins: ["https://codius.ai", "https://dev.codius.dev"],
    },
    relay: {
      // Codius does not use Paseo's hosted relay. A Codius relay can be enabled
      // explicitly after its own deployment and privacy policy are available.
      enabled: false,
    },
  },
  app: {
    baseUrl: "https://codius.ai",
  },
  agents: {
    providers: {
      codius: {
        extends: "acp",
        label: "Codius",
        description: "Codius CLI with Codius coding plans and model routing",
        command: ["codius", "acp"],
        enabled: true,
        order: -100,
        params: {
          supportsMcpServers: true,
          clientCapabilities: {
            fs: {
              readTextFile: true,
              writeTextFile: true,
            },
            terminal: true,
          },
        },
      },
    },
  },
} as const;

/**
 * Creates the first-run Codius configuration without overwriting an existing
 * user configuration. The normal persisted-config parser remains the source of
 * truth and validates this file immediately after creation.
 */
export function ensureCodiusHomeDefaults(codiusHome: string): void {
  const configPath = path.join(codiusHome, "config.json");
  if (existsSync(configPath)) {
    return;
  }

  writePrivateFileAtomicSync(configPath, `${JSON.stringify(CODIUS_DEFAULT_CONFIG, null, 2)}\n`);
}

export function getCodiusDefaultConfigForTest() {
  return structuredClone(CODIUS_DEFAULT_CONFIG);
}
