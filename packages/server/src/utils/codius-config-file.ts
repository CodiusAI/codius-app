import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  CodiusConfigRawSchema,
  type CodiusConfigRaw,
  type CodiusConfigRevision,
  type ProjectConfigRpcError,
} from "@codius.ai/protocol/codius-config-schema";
export {
  CodiusConfigRevisionSchema,
  ProjectConfigRpcErrorSchema,
  type CodiusConfigRevision,
  type ProjectConfigRpcError,
} from "@codius.ai/protocol/codius-config-schema";

export const CODIUS_CONFIG_FILE_NAME = "codius.json";

export type ReadCodiusConfigForEditResult =
  | { ok: true; config: CodiusConfigRaw | null; revision: CodiusConfigRevision | null }
  | { ok: false; error: ProjectConfigRpcError };

export type WriteCodiusConfigForEditResult =
  | { ok: true; config: CodiusConfigRaw; revision: CodiusConfigRevision }
  | { ok: false; error: ProjectConfigRpcError };

export interface WriteCodiusConfigForEditInput {
  repoRoot: string;
  config: CodiusConfigRaw;
  expectedRevision: CodiusConfigRevision | null;
}

export function resolveCodiusConfigPath(repoRoot: string): string {
  return join(repoRoot, CODIUS_CONFIG_FILE_NAME);
}

export function statCodiusConfigPath(repoRoot: string): CodiusConfigRevision | null {
  const configPath = resolveCodiusConfigPath(repoRoot);
  if (!existsSync(configPath)) {
    return null;
  }
  const stats = statSync(configPath);
  return {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
}

export function readCodiusConfigJson(repoRoot: string): unknown {
  const configPath = resolveCodiusConfigPath(repoRoot);
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(readFileSync(configPath, "utf8"));
}

export function readCodiusConfigForEdit(repoRoot: string): ReadCodiusConfigForEditResult {
  try {
    const json = readCodiusConfigJson(repoRoot);
    if (json === null) {
      return { ok: true, config: null, revision: null };
    }
    return {
      ok: true,
      config: CodiusConfigRawSchema.parse(json),
      revision: statCodiusConfigPath(repoRoot),
    };
  } catch {
    return {
      ok: false,
      error: { code: "invalid_project_config" },
    };
  }
}

export function writeCodiusConfigForEdit(
  input: WriteCodiusConfigForEditInput,
): WriteCodiusConfigForEditResult {
  const parsed = CodiusConfigRawSchema.safeParse(input.config);
  if (!parsed.success) {
    return { ok: false, error: { code: "invalid_project_config" } };
  }

  const configPath = resolveCodiusConfigPath(input.repoRoot);
  const tempPath = join(
    input.repoRoot,
    `.${CODIUS_CONFIG_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    writeFileSync(tempPath, `${JSON.stringify(parsed.data, null, 2)}\n`);
    const currentRevision = statCodiusConfigPath(input.repoRoot);
    if (!codiusConfigRevisionsEqual(currentRevision, input.expectedRevision)) {
      removeTempCodiusConfig(tempPath);
      return {
        ok: false,
        error: { code: "stale_project_config", currentRevision },
      };
    }

    renameSync(tempPath, configPath);
    const revision = statCodiusConfigPath(input.repoRoot);
    if (!revision) {
      return { ok: false, error: { code: "write_failed" } };
    }
    return { ok: true, config: parsed.data, revision };
  } catch {
    removeTempCodiusConfig(tempPath);
    return { ok: false, error: { code: "write_failed" } };
  }
}

function codiusConfigRevisionsEqual(
  left: CodiusConfigRevision | null,
  right: CodiusConfigRevision | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

function removeTempCodiusConfig(tempPath: string): void {
  try {
    rmSync(tempPath, { force: true });
  } catch {
    // Best-effort cleanup only; callers need the original write outcome.
  }
}
