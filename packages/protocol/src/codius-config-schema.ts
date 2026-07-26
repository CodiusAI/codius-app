import { z } from "zod";

const TCP_PORT_RANGE_PATTERN = /^(\d{1,5})-(\d{1,5})$/;

export const CodiusServicePortAllocationSchema = z
  .object({
    range: z.string().trim().regex(TCP_PORT_RANGE_PATTERN).optional(),
    portScript: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine(
    (value) => value.range !== undefined || value.portScript !== undefined,
    "Expected range or portScript",
  )
  .refine((value) => {
    if (!value.range) return true;
    const match = TCP_PORT_RANGE_PATTERN.exec(value.range);
    if (!match) return false;
    const start = Number(match[1]);
    const end = Number(match[2]);
    return start >= 1 && end <= 65_535 && start <= end;
  }, "Expected an inclusive TCP port range from 1-65535");

export function normalizeLifecycleCommands(commands: unknown): string[] {
  if (typeof commands === "string") {
    return commands.trim().length > 0 ? [commands] : [];
  }
  if (!Array.isArray(commands)) {
    return [];
  }
  return commands.filter((command): command is string => {
    return typeof command === "string" && command.trim().length > 0;
  });
}

export const CodiusLifecycleCommandRawSchema = z.union([z.string(), z.array(z.string())]);

export const CodiusScriptEntryRawSchema = z
  .object({
    type: z.unknown().optional(),
    command: z.unknown().optional(),
    port: z.unknown().optional(),
  })
  .passthrough();

export const CodiusWorktreeConfigRawSchema = z
  .object({
    setup: CodiusLifecycleCommandRawSchema.optional(),
    teardown: CodiusLifecycleCommandRawSchema.optional(),
    terminals: z.unknown().optional(),
    servicePorts: CodiusServicePortAllocationSchema.optional(),
  })
  .passthrough();

export const CodiusMetadataGenerationEntrySchema = z
  .object({
    instructions: z.string().optional(),
  })
  .passthrough()
  .catch({});

export const CodiusMetadataGenerationSchema = z
  .object({
    title: CodiusMetadataGenerationEntrySchema.optional(),
    branchName: CodiusMetadataGenerationEntrySchema.optional(),
    commitMessage: CodiusMetadataGenerationEntrySchema.optional(),
    pullRequest: CodiusMetadataGenerationEntrySchema.optional(),
  })
  // COMPAT(projectMetadataAgentTitle): `agentTitle` project metadata prompts were removed
  // in v0.1.96; keep legacy codius.json parseable until 2026-12-16.
  .passthrough()
  .catch({});

export const CodiusConfigRawSchema = z
  .object({
    worktree: CodiusWorktreeConfigRawSchema.optional(),
    scripts: z.record(z.string(), CodiusScriptEntryRawSchema).optional(),
    metadataGeneration: CodiusMetadataGenerationSchema.optional(),
  })
  .passthrough();

export const WorktreeConfigSchema = CodiusWorktreeConfigRawSchema.extend({
  setup: z.unknown().optional().transform(normalizeLifecycleCommands),
  teardown: z.unknown().optional().transform(normalizeLifecycleCommands),
})
  .passthrough()
  .catch({ setup: [], teardown: [] });

export const ScriptEntrySchema = CodiusScriptEntryRawSchema.catch({});

export const CodiusConfigSchema = CodiusConfigRawSchema.extend({
  worktree: WorktreeConfigSchema.optional(),
  scripts: z.record(z.string(), ScriptEntrySchema).optional().catch({}),
  metadataGeneration: CodiusMetadataGenerationSchema.optional(),
})
  .passthrough()
  .catch({});

export const CodiusConfigRevisionSchema = z.object({
  mtimeMs: z.number(),
  size: z.number(),
});

export const ProjectConfigRpcErrorSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("project_not_found") }),
  z.object({ code: z.literal("invalid_project_config") }),
  z.object({
    code: z.literal("stale_project_config"),
    currentRevision: CodiusConfigRevisionSchema.nullable(),
  }),
  z.object({ code: z.literal("write_failed") }),
]);

export type CodiusScriptEntryRaw = z.infer<typeof CodiusScriptEntryRawSchema>;
export type CodiusMetadataGenerationEntry = z.infer<typeof CodiusMetadataGenerationEntrySchema>;
export type CodiusMetadataGeneration = z.infer<typeof CodiusMetadataGenerationSchema>;
export type CodiusServicePortAllocation = z.infer<typeof CodiusServicePortAllocationSchema>;
export type CodiusConfigRaw = z.infer<typeof CodiusConfigRawSchema>;
export type CodiusConfig = z.infer<typeof CodiusConfigSchema>;
export type CodiusConfigRevision = z.infer<typeof CodiusConfigRevisionSchema>;
export type ProjectConfigRpcError = z.infer<typeof ProjectConfigRpcErrorSchema>;
