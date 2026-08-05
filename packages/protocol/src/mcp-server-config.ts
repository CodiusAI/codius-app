import { z } from "zod";

// Leaf module: no imports from messages.ts or schedule/*. schedule/types.ts and
// messages.ts both consume these schemas — importing them from messages.ts creates
// a circular dependency (messages -> schedule/rpc-schemas -> schedule/types ->
// messages) that crashes at module init with "Cannot access 'McpServerConfigSchema'
// before initialization".

export const McpStdioServerConfigSchema = z.object({
  type: z.literal("stdio"),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

export const McpHttpServerConfigSchema = z.object({
  type: z.literal("http"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

export const McpSseServerConfigSchema = z.object({
  type: z.literal("sse"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

export const McpServerConfigSchema = z.discriminatedUnion("type", [
  McpStdioServerConfigSchema,
  McpHttpServerConfigSchema,
  McpSseServerConfigSchema,
]);
