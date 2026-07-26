import type { z } from "zod";

export interface CodiusToolExecutionContext {
  signal?: AbortSignal;
  sendUpdate?: (update: CodiusToolResult) => void;
}

export interface CodiusToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface CodiusToolConfig {
  title?: string;
  description?: string;
  inputSchema?: z.ZodRawShape | z.ZodType;
  outputSchema?: z.ZodRawShape;
}

export interface CodiusToolDefinition extends CodiusToolConfig {
  name: string;
  description: string;
  handler: (input: unknown, context: CodiusToolExecutionContext) => Promise<CodiusToolResult>;
}

export interface CodiusToolCatalog {
  tools: ReadonlyMap<string, CodiusToolDefinition>;
  getTool(name: string): CodiusToolDefinition | undefined;
  executeTool(
    name: string,
    input: unknown,
    context?: CodiusToolExecutionContext,
  ): Promise<CodiusToolResult>;
}

export interface CodiusToolRuntimeContext {
  callerAgentId?: string;
  enableVoiceTools?: boolean;
  voiceOnly?: boolean;
}

export type CodiusToolCatalogFactory = (
  context: CodiusToolRuntimeContext,
) => CodiusToolCatalog | Promise<CodiusToolCatalog>;
