import os from "node:os";
import path from "node:path";
import {
  ensureCodiusHomeDefaults,
  shouldSeedCodiusHomeDefaults,
} from "./codius-defaults.js";
import { ensurePrivateDirectory } from "./private-files.js";

function expandHomeDir(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  if (input === "~") {
    return os.homedir();
  }
  return input;
}

export function resolvePaseoHome(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CODIUS_HOME ?? env.PASEO_HOME ?? "~/.codius";
  const resolved = path.resolve(expandHomeDir(raw));
  ensurePrivateDirectory(resolved);
  if (shouldSeedCodiusHomeDefaults(env)) {
    ensureCodiusHomeDefaults(resolved);
  }
  return resolved;
}
