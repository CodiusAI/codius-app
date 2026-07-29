import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { writePrivateFileAtomicSync } from "./private-files.js";

const CODIUS_DEFAULT_CONFIG = {
  version: 1,
  daemon: {
    listen: "127.0.0.1:6767",
    cors: {
      // The browser client connects to this local daemon over WebSocket, and
      // the upgrade is rejected unless its Origin is listed here. The app is
      // served from its own subdomain, so the marketing origins are not enough.
      allowedOrigins: [
        "https://codius.ai",
        "https://app.codius.ai",
        "https://dev.codius.dev",
        "https://devapp.codius.ai",
      ],
    },
    relay: {
      // Codius does not enable a hosted relay by default. One can be enabled
      // explicitly after its deployment and privacy policy are available.
      enabled: false,
    },
  },
  app: {
    baseUrl: "https://codius.ai",
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeRetiredProvider(configPath: string): void {
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return;
  }

  if (!isRecord(config) || !isRecord(config.agents)) {
    return;
  }

  const agents = config.agents;
  if (!isRecord(agents.providers) || !Object.hasOwn(agents.providers, "codius")) {
    return;
  }

  delete agents.providers.codius;
  if (Object.keys(agents.providers).length === 0) {
    delete agents.providers;
  }
  if (Object.keys(agents).length === 0) {
    delete config.agents;
  }

  writePrivateFileAtomicSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

export function shouldSeedCodiusHomeDefaults(env: NodeJS.ProcessEnv): boolean {
  const explicit = env.CODIUS_SEED_DEFAULTS?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;

  // Most server tests create isolated CODIUS_HOME directories and expect an
  // empty filesystem. Avoid introducing a product config into those unrelated
  // fixtures; the dedicated Codius test opts in explicitly.
  return env.NODE_ENV !== "test" && env.VITEST !== "true";
}

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

export function removeRetiredCodiusAgentProvider(codiusHome: string): void {
  const configPath = path.join(codiusHome, "config.json");
  if (existsSync(configPath)) {
    removeRetiredProvider(configPath);
  }
}
