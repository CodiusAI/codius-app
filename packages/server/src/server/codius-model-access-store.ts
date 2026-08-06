import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { AgentProvider } from "@codius.ai/protocol/agent-types";
import {
  CodiusModelAccessStatusSchema,
  type CodiusModelAccessStatus,
  type UpdateCodiusModelAccessInput,
} from "@codius.ai/protocol/messages";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "./private-files.js";
import type { AgentModelDefinition } from "./agent/agent-sdk-types.js";

export const DEFAULT_CODIUS_API_BASE_URL = "https://api.codius.ai/v1";

const MODEL_LIST_STALE_MS = 5 * 60 * 1000;

const CodiusModelSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
});

const CodiusModelsResponseSchema = z.object({
  data: z.array(CodiusModelSchema).min(1),
});

const PersistedCodiusModelAccessSchema = z.object({
  version: z.literal(1),
  apiKey: z.string().trim().min(1).optional(),
  baseUrl: z.string().url(),
  defaultForAgents: z.boolean(),
  defaultModel: z.string().trim().min(1).optional(),
  models: z.array(CodiusModelSchema),
  lastValidatedAt: z.string().datetime().optional(),
});

type PersistedCodiusModelAccess = z.infer<typeof PersistedCodiusModelAccessSchema>;

export interface CodiusAgentModelDefaults {
  env: Record<string, string>;
  model: string;
}

interface LoggerLike {
  child(bindings: Record<string, unknown>): LoggerLike;
  info(...args: unknown[]): void;
}

export interface CodiusModelAccessStoreOptions {
  fetch?: typeof fetch;
  logger?: LoggerLike;
  now?: () => Date;
}

function defaultState(): PersistedCodiusModelAccess {
  return {
    version: 1,
    baseUrl: DEFAULT_CODIUS_API_BASE_URL,
    defaultForAgents: true,
    models: [],
  };
}

function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

function anthropicBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}

function maskApiKey(apiKey: string | undefined): string | null {
  if (!apiKey) {
    return null;
  }
  if (apiKey.length <= 4) {
    return "••••";
  }
  return `•••• ${apiKey.slice(-4)}`;
}

function openCodeConfig(current: string | undefined, state: PersistedCodiusModelAccess): string {
  let parsed: Record<string, unknown> = {};
  if (current?.trim()) {
    try {
      const candidate = JSON.parse(current) as unknown;
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      // Keep the user's invalid value untouched outside this isolated session.
      // The generated session config below remains valid and never edits disk.
    }
  }

  const providers =
    parsed.provider && typeof parsed.provider === "object" && !Array.isArray(parsed.provider)
      ? (parsed.provider as Record<string, unknown>)
      : {};
  const models = Object.fromEntries(
    state.models.map((model) => {
      const slashIndex = model.id.indexOf("/");
      const family = slashIndex > 0 ? model.id.slice(0, slashIndex) : "codius";
      return [model.id, { name: model.name ?? model.id, family }];
    }),
  );

  return JSON.stringify({
    ...parsed,
    model: `codius/${state.defaultModel}`,
    provider: {
      ...providers,
      codius: {
        npm: "@ai-sdk/openai-compatible",
        name: "Codius",
        env: ["CODIUS_API_KEY"],
        options: {
          baseURL: state.baseUrl,
          apiKey: "{env:CODIUS_API_KEY}",
        },
        models,
      },
    },
  });
}

export class CodiusModelAccessStore {
  private readonly filePath: string;
  private readonly fetcher: typeof fetch;
  private readonly logger: LoggerLike | undefined;
  private readonly now: () => Date;
  private current: PersistedCodiusModelAccess;

  constructor(codiusHome: string, options: CodiusModelAccessStoreOptions = {}) {
    this.filePath = path.join(codiusHome, "model-access.json");
    this.fetcher = options.fetch ?? fetch;
    this.logger = options.logger?.child({ module: "codius-model-access" });
    this.now = options.now ?? (() => new Date());
    this.current = this.load();
  }

  public isStale(): boolean {
    if (!this.current.apiKey || !this.current.lastValidatedAt) {
      return true;
    }
    const lastValidated = Date.parse(this.current.lastValidatedAt);
    if (Number.isNaN(lastValidated)) {
      return true;
    }
    return this.now().getTime() - lastValidated > MODEL_LIST_STALE_MS;
  }

  public async refresh(): Promise<CodiusModelAccessStatus | null> {
    const apiKey = this.current.apiKey;
    if (!apiKey) {
      return null;
    }

    try {
      const models = await this.validate(apiKey);
      const defaultModel =
        this.current.defaultModel && models.some((m) => m.id === this.current.defaultModel)
          ? this.current.defaultModel
          : models[0]?.id;
      this.persist({
        version: 1,
        apiKey,
        baseUrl: DEFAULT_CODIUS_API_BASE_URL,
        defaultForAgents: this.current.defaultForAgents,
        defaultModel,
        models,
        lastValidatedAt: this.now().toISOString(),
      });
      this.logger?.info({ modelCount: models.length }, "Codius model catalog refreshed");
      return this.getStatus();
    } catch (error) {
      this.logger?.info(
        { err: error },
        "Failed to refresh Codius model catalog; keeping cached list",
      );
      return null;
    }
  }

  public async refreshIfStale(): Promise<CodiusModelAccessStatus | null> {
    if (!this.isStale()) {
      return null;
    }
    return this.refresh();
  }

  public getStatus(): CodiusModelAccessStatus {
    return CodiusModelAccessStatusSchema.parse({
      configured: Boolean(this.current.apiKey),
      maskedApiKey: maskApiKey(this.current.apiKey),
      baseUrl: this.current.baseUrl,
      defaultForAgents: this.current.defaultForAgents,
      defaultModel: this.current.defaultModel ?? null,
      models: this.current.models,
      lastValidatedAt: this.current.lastValidatedAt ?? null,
    });
  }

  public async update(input: UpdateCodiusModelAccessInput): Promise<CodiusModelAccessStatus> {
    if (input.clearApiKey === true) {
      this.persist({
        ...this.current,
        apiKey: undefined,
        defaultForAgents: false,
        defaultModel: undefined,
        models: [],
        lastValidatedAt: undefined,
      });
      return this.getStatus();
    }

    const apiKey = input.apiKey?.trim() || this.current.apiKey;
    if (!apiKey) {
      throw new Error("Enter a Codius API key before enabling Codius models.");
    }

    const models = await this.validate(apiKey);
    const requestedModel = input.defaultModel?.trim();
    if (requestedModel && !models.some((model) => model.id === requestedModel)) {
      throw new Error(`Model '${requestedModel}' is not available to this Codius account.`);
    }
    const previousModel = this.current.defaultModel;
    const defaultModel =
      requestedModel ??
      (previousModel && models.some((model) => model.id === previousModel)
        ? previousModel
        : models[0]?.id);
    if (!defaultModel) {
      throw new Error("The Codius account did not return any available coding models.");
    }

    this.persist({
      version: 1,
      apiKey,
      baseUrl: DEFAULT_CODIUS_API_BASE_URL,
      defaultForAgents: input.defaultForAgents ?? this.current.defaultForAgents,
      defaultModel,
      models,
      lastValidatedAt: this.now().toISOString(),
    });
    return this.getStatus();
  }

  public isCodiusManagedModel(provider: AgentProvider, modelId: string | undefined): boolean {
    if (!modelId) return false;
    const state = this.current;
    if (!state.apiKey || !state.defaultForAgents || state.models.length === 0) return false;
    const prefix = provider === "opencode" || provider === "pi" ? "codius/" : "";
    return state.models.some((model) => `${prefix}${model.id}` === modelId);
  }

  public resolveAgentDefaults(
    provider: AgentProvider,
    existingEnv: Record<string, string> = {},
  ): CodiusAgentModelDefaults | null {
    const state = this.current;
    if (
      !state.apiKey ||
      !state.defaultForAgents ||
      !state.defaultModel ||
      Object.keys(existingEnv).length > 0
    ) {
      return null;
    }

    switch (provider) {
      case "opencode":
        return {
          model: `codius/${state.defaultModel}`,
          env: {
            CODIUS_API_KEY: state.apiKey,
            OPENCODE_CONFIG_CONTENT: openCodeConfig(undefined, state),
          },
        };
      case "pi":
        return {
          model: `codius/${state.defaultModel}`,
          env: {
            CODIUS_API_KEY: state.apiKey,
            CODIUS_API_BASE_URL: state.baseUrl,
            CODIUS_MODEL_CATALOG: Buffer.from(
              JSON.stringify({ models: state.models }),
              "utf8",
            ).toString("base64url"),
          },
        };
      case "copilot":
        return {
          model: state.defaultModel,
          env: {
            COPILOT_PROVIDER_BASE_URL: state.baseUrl,
            COPILOT_PROVIDER_TYPE: "openai",
            COPILOT_PROVIDER_API_KEY: state.apiKey,
            COPILOT_MODEL: state.defaultModel,
          },
        };
      case "codex":
        return {
          model: state.defaultModel,
          env: {
            OPENAI_API_KEY: state.apiKey,
            OPENAI_BASE_URL: state.baseUrl,
            CODIUS_MODEL_ACCESS_PROVIDER_ID: "codius",
            CODIUS_MODEL_ACCESS_DEFAULT_MODEL: state.defaultModel,
          },
        };
      case "claude":
        return {
          model: state.defaultModel,
          env: {
            ANTHROPIC_API_KEY: state.apiKey,
            ANTHROPIC_AUTH_TOKEN: state.apiKey,
            ANTHROPIC_BASE_URL: anthropicBaseUrl(state.baseUrl),
            ANTHROPIC_MODEL: state.defaultModel,
            ANTHROPIC_DEFAULT_HAIKU_MODEL: state.defaultModel,
            ANTHROPIC_DEFAULT_SONNET_MODEL: state.defaultModel,
            ANTHROPIC_DEFAULT_OPUS_MODEL: state.defaultModel,
          },
        };
      default:
        return null;
    }
  }

  public buildModelDefinitions(
    provider: AgentProvider,
    existingModelIds: ReadonlySet<string>,
  ): AgentModelDefinition[] {
    const state = this.current;
    if (!state.apiKey || !state.defaultForAgents || state.models.length === 0) {
      return [];
    }

    const supportsCodius =
      provider === "opencode" ||
      provider === "pi" ||
      provider === "claude" ||
      provider === "codex" ||
      provider === "copilot";
    if (!supportsCodius) {
      return [];
    }

    const prefix = provider === "opencode" || provider === "pi" ? "codius/" : "";
    const models: AgentModelDefinition[] = [];
    for (const model of state.models) {
      const id = `${prefix}${model.id}`;
      if (existingModelIds.has(id)) {
        continue;
      }
      const slashIndex = model.id.indexOf("/");
      const vendor = slashIndex > 0 ? model.id.slice(0, slashIndex) : "Codius";
      const modelShortId = slashIndex > 0 ? model.id.slice(slashIndex + 1) : model.id;
      models.push({
        provider,
        id,
        label: model.name ?? modelShortId,
        description: `Codius - ${vendor}`,
        isDefault: model.id === state.defaultModel,
        metadata: { codiusManaged: true, family: vendor },
      });
    }
    return models;
  }

  private load(): PersistedCodiusModelAccess {
    if (!existsSync(this.filePath)) {
      return defaultState();
    }
    try {
      const parsed = PersistedCodiusModelAccessSchema.parse(
        JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
      );
      ensurePrivateFile(this.filePath);
      return {
        ...parsed,
        baseUrl: DEFAULT_CODIUS_API_BASE_URL,
      };
    } catch (error) {
      this.logger?.info({ err: error }, "Ignoring invalid Codius model access settings");
      return defaultState();
    }
  }

  private persist(next: PersistedCodiusModelAccess): void {
    const parsed = PersistedCodiusModelAccessSchema.parse({
      ...next,
      baseUrl: DEFAULT_CODIUS_API_BASE_URL,
    });
    writePrivateFileAtomicSync(this.filePath, `${JSON.stringify(parsed, null, 2)}\n`);
    this.current = parsed;
  }

  private async validate(apiKey: string): Promise<PersistedCodiusModelAccess["models"]> {
    const response = await this.fetcher(modelsUrl(DEFAULT_CODIUS_API_BASE_URL), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      const detail =
        response.status === 401 || response.status === 403
          ? "The API key was not accepted."
          : `Codius returned HTTP ${response.status}.`;
      throw new Error(`Could not connect Codius models. ${detail}`);
    }
    const body = CodiusModelsResponseSchema.safeParse(await response.json());
    if (!body.success) {
      throw new Error("Codius returned an invalid model catalog.");
    }
    return body.data.data;
  }
}
