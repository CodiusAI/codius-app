import type {
  AgentSnapshotPayload,
  CodiusModelAccessStatus,
  CreateAgentRequestMessage,
  FetchWorkspacesRequestMessage,
  FetchWorkspacesResponseMessage,
  GetProvidersSnapshotResponseMessage,
  ListAvailableProvidersResponse,
  ListProviderFeaturesRequestMessage,
  ListProviderFeaturesResponseMessage,
  ListProviderModelsResponseMessage,
  ListProviderModesResponseMessage,
  MutableDaemonConfig,
  MutableDaemonConfigPatch,
  ProviderDiagnosticResponseMessage,
  ProjectPlacementPayload,
  RefreshProvidersSnapshotResponseMessage,
  SendAgentMessageRequest,
  SessionOutboundMessage,
  UpdateCodiusModelAccessInput,
  WorkspaceDescriptorPayload,
} from "@codius.ai/protocol/messages";
import { DaemonClient } from "./daemon-client.js";
import type {
  FetchAgentTimelineCursor,
  FetchAgentTimelineDirection,
  FetchAgentTimelinePayload,
  FetchAgentTimelineProjection,
} from "./daemon-client.js";

export { DaemonClient };
export type {
  DaemonClientConfig,
  DaemonEvent,
  BrowserAutomationExecuteRequestMessage,
  BrowserAutomationExecuteResponseMessage,
  WebSocketFactory,
  WebSocketLike,
} from "./daemon-client.js";

export type ConnectionState =
  | { status: "idle" }
  | { status: "connecting"; attempt: number }
  | { status: "connected" }
  | { status: "disconnected"; reason?: string }
  | { status: "disposed" };

export interface CodiusLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface CodiusClientConfig {
  url: string;
  clientId?: string;
  appVersion?: string;
  runtimeGeneration?: number | null;
  password?: string;
  authHeader?: string;
  suppressSendErrors?: boolean;
  logger?: CodiusLogger;
  connectTimeoutMs?: number;
  e2ee?: {
    enabled?: boolean;
    daemonPublicKeyB64?: string;
  };
  reconnect?: {
    enabled?: boolean;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
  runtimeMetricsIntervalMs?: number;
  runtimeMetricsWindowMs?: number;
}

export type CodiusWorkspace = WorkspaceDescriptorPayload;
export type CodiusAgent = AgentSnapshotPayload;
export type CodiusWorkspaceListOptions = Omit<
  FetchWorkspacesRequestMessage,
  "type" | "requestId"
> & {
  requestId?: string;
};

export interface CodiusWorkspaceListResult {
  requestId: string;
  subscriptionId?: string | null;
  entries: CodiusWorkspace[];
  pageInfo: FetchWorkspacesResponseMessage["payload"]["pageInfo"];
}

export interface CodiusWorkspaceOpenOptions {
  cwd: string;
  requestId?: string;
}

export interface CodiusWorkspaceOpenResult {
  requestId: string;
  workspace: CodiusWorkspaceHandle | null;
  error: string | null;
}

export interface CodiusWorkspaceArchiveResult {
  requestId: string;
  workspaceId: string;
  archivedAt: string | null;
  error: string | null;
}

export type CodiusWorkspaceUpdate = Extract<
  SessionOutboundMessage,
  { type: "workspace_update" }
>["payload"];

export type CodiusWorkspaceUpdateHandler = (update: CodiusWorkspaceUpdate) => void;

/**
 * A handle is a stable typed reference to a daemon resource. Its identity is the
 * daemon id, and `latest()` only returns the most recent snapshot this handle has
 * seen through construction, `refetch()`, or this handle's local subscription.
 */
export interface CodiusWorkspaceHandle {
  readonly id: string;
  latest(): CodiusWorkspace | null;
  /**
   * Fetches a fresh workspace snapshot through the existing workspace list RPC,
   * exact-matches this handle id from the result, and updates `latest()`.
   */
  refetch(options?: { requestId?: string }): Promise<CodiusWorkspace | null>;
  archive(requestId?: string): Promise<CodiusWorkspaceArchiveResult>;
  /**
   * Subscribes to already-emitted daemon workspace_update events for this id.
   * This returns a local unsubscribe function; it does not own app cache state or
   * send a daemon unsubscribe RPC. Call `workspaces.list({ subscribe: {} })` when
   * the daemon should start streaming workspace directory updates.
   */
  subscribe(handler: (update: CodiusWorkspaceUpdate) => void): () => void;
}

export interface CodiusWorkspaceActions {
  list(options?: CodiusWorkspaceListOptions): Promise<CodiusWorkspaceListResult>;
  ref(workspace: string | CodiusWorkspace): CodiusWorkspaceHandle;
  open(
    input: string | CodiusWorkspaceOpenOptions,
    requestId?: string,
  ): Promise<CodiusWorkspaceOpenResult>;
  create(
    input: string | CodiusWorkspaceOpenOptions,
    requestId?: string,
  ): Promise<CodiusWorkspaceOpenResult>;
  archive(
    workspace: string | CodiusWorkspaceHandle,
    requestId?: string,
  ): Promise<CodiusWorkspaceArchiveResult>;
  /**
   * Local event subscription over the low-level driver's workspace_update stream.
   * The returned function only removes this SDK listener.
   */
  subscribe(handler: CodiusWorkspaceUpdateHandler): () => void;
}

type CodiusAgentSessionConfig = CreateAgentRequestMessage["config"];
type CodiusAgentProvider = CodiusAgentSessionConfig["provider"];
type CodiusAgentConfigOverrides = Partial<Omit<CodiusAgentSessionConfig, "provider" | "cwd">>;

export interface CodiusAgentCreateOptions extends CodiusAgentConfigOverrides {
  config?: CodiusAgentSessionConfig;
  provider?: CreateAgentRequestMessage["config"]["provider"];
  cwd?: string;
  workspaceId?: string;
  callerAgentId?: string;
  initialPrompt?: string;
  clientMessageId?: string;
  outputSchema?: Record<string, unknown>;
  images?: CreateAgentRequestMessage["images"];
  attachments?: CreateAgentRequestMessage["attachments"];
  git?: CreateAgentRequestMessage["git"];
  requestId?: string;
  labels?: Record<string, string>;
}

export interface CodiusAgentRefetchResult {
  agent: CodiusAgent;
  project: ProjectPlacementPayload | null;
}

export interface CodiusAgentTimelineRefetchOptions {
  direction?: FetchAgentTimelineDirection;
  cursor?: FetchAgentTimelineCursor;
  limit?: number;
  projection?: FetchAgentTimelineProjection;
  requestId?: string;
}

export interface CodiusAgentSendOptions {
  messageId?: string;
  images?: Array<{ data: string; mimeType: string }>;
  attachments?: SendAgentMessageRequest["attachments"];
}

export type CodiusAgentUpdate = Extract<
  SessionOutboundMessage,
  { type: "agent_update" }
>["payload"];

export type CodiusAgentStream = Extract<
  SessionOutboundMessage,
  { type: "agent_stream" }
>["payload"];

export type CodiusAgentUpdateHandler = (update: CodiusAgentUpdate) => void;

export interface CodiusAgentTimelineHandle {
  /**
   * Fetches a fresh timeline page through the existing daemon RPC. If the daemon
   * includes an agent snapshot in the response, the parent handle's `latest()`
   * is updated to that snapshot.
   */
  refetch(options?: CodiusAgentTimelineRefetchOptions): Promise<FetchAgentTimelinePayload>;
  /**
   * Local listener for agent_stream events matching this handle id. It does not
   * retain timeline entries or own application cache state.
   */
  subscribe(handler: (event: CodiusAgentStream) => void): () => void;
}

/**
 * Agent handles follow the same identity/snapshot rule as workspace handles:
 * `id` is stable, while `latest()` is only the newest snapshot observed by this
 * handle through construction, `refetch()`, timeline refetch, archive, or local
 * agent_update subscription.
 */
export interface CodiusAgentHandle {
  readonly id: string;
  readonly timeline: CodiusAgentTimelineHandle;
  latest(): CodiusAgent | null;
  refetch(requestId?: string): Promise<CodiusAgentRefetchResult | null>;
  send(text: string, options?: CodiusAgentSendOptions): Promise<void>;
  archive(): Promise<{ archivedAt: string }>;
  detach(): Promise<void>;
  subscribe(handler: (update: CodiusAgentUpdate) => void): () => void;
}

export interface CodiusAgentActions {
  ref(agent: string | CodiusAgent): CodiusAgentHandle;
  create(options: CodiusAgentCreateOptions): Promise<CodiusAgentHandle>;
  /**
   * Local event subscription over the low-level driver's agent_update stream.
   * The returned function only removes this SDK listener.
   */
  subscribe(handler: CodiusAgentUpdateHandler): () => void;
}

export interface CodiusProviderConfig extends CodiusProviderConfigInput {
  provider: CodiusAgentProvider;
}
export type CodiusProviderFeatureValues = Record<string, unknown>;

export interface CodiusProviderConfigInput {
  model?: string;
  modeId?: string;
  thinkingOptionId?: string;
  featureValues?: CodiusProviderFeatureValues;
}

export type CodiusProviderModelsResult = ListProviderModelsResponseMessage["payload"];
export type CodiusProviderModesResult = ListProviderModesResponseMessage["payload"];
export type CodiusProviderFeaturesInput = ListProviderFeaturesRequestMessage["draftConfig"];
export type CodiusProviderFeaturesResult = ListProviderFeaturesResponseMessage["payload"];
export type CodiusProviderAvailabilityResult = ListAvailableProvidersResponse["payload"];
export type CodiusProviderSnapshotResult = GetProvidersSnapshotResponseMessage["payload"];
export type CodiusProviderSnapshotUpdate = Extract<
  SessionOutboundMessage,
  { type: "providers_snapshot_update" }
>["payload"];
export type CodiusProviderRefreshResult = RefreshProvidersSnapshotResponseMessage["payload"];
export type CodiusProviderDiagnosticResult = ProviderDiagnosticResponseMessage["payload"];

export interface CodiusProviderListOptions {
  cwd?: string;
  requestId?: string;
}

export interface CodiusProviderRefreshOptions {
  cwd?: string;
  providers?: CodiusAgentProvider[];
  requestId?: string;
}

export interface CodiusProviderActions {
  codex(input?: CodiusProviderConfigInput): CodiusProviderConfig;
  claude(input?: CodiusProviderConfigInput): CodiusProviderConfig;
  opencode(input?: CodiusProviderConfigInput): CodiusProviderConfig;
  copilot(input?: CodiusProviderConfigInput): CodiusProviderConfig;
  config(provider: CodiusAgentProvider, input?: CodiusProviderConfigInput): CodiusProviderConfig;
  listModels(
    provider: CodiusAgentProvider,
    options?: CodiusProviderListOptions,
  ): Promise<CodiusProviderModelsResult>;
  listModes(
    provider: CodiusAgentProvider,
    options?: CodiusProviderListOptions,
  ): Promise<CodiusProviderModesResult>;
  listFeatures(
    draftConfig: CodiusProviderFeaturesInput,
    options?: { requestId?: string },
  ): Promise<CodiusProviderFeaturesResult>;
  listAvailable(options?: { requestId?: string }): Promise<CodiusProviderAvailabilityResult>;
  snapshot(options?: CodiusProviderListOptions): Promise<CodiusProviderSnapshotResult>;
  refresh(options?: CodiusProviderRefreshOptions): Promise<CodiusProviderRefreshResult>;
  diagnostic(
    provider: CodiusAgentProvider,
    options?: { requestId?: string },
  ): Promise<CodiusProviderDiagnosticResult>;
  subscribe(handler: (update: CodiusProviderSnapshotUpdate) => void): () => void;
}

export interface CodiusConfigActions {
  /**
   * Reads daemon config through the existing config RPC. Provider profiles,
   * custom provider entries, keys/env, custom binaries, and provider enablement
   * are currently config-file-shaped daemon state, so the SDK exposes this raw
   * typed surface instead of pretending there are higher-level provider-settings
   * RPCs.
   */
  get(requestId?: string): Promise<{ requestId: string; config: MutableDaemonConfig }>;
  /**
   * Patches daemon config through the existing config RPC. The daemon validates
   * and persists supported fields; unsupported provider/settings workflows remain
   * daemon gaps until first-class RPCs exist.
   */
  patch(
    config: MutableDaemonConfigPatch,
    requestId?: string,
  ): Promise<{ requestId: string; config: MutableDaemonConfig }>;
}

export interface CodiusModelAccessActions {
  get(
    requestId?: string,
  ): Promise<{ requestId: string; status: CodiusModelAccessStatus; error: string | null }>;
  update(
    input: UpdateCodiusModelAccessInput,
    requestId?: string,
  ): Promise<{ requestId: string; status: CodiusModelAccessStatus; error: string | null }>;
}

export interface CodiusClient {
  readonly workspaces: CodiusWorkspaceActions;
  readonly agents: CodiusAgentActions;
  readonly providers: CodiusProviderActions;
  readonly config: CodiusConfigActions;
  readonly modelAccess: CodiusModelAccessActions;
  connect(): Promise<void>;
  close(): Promise<void>;
  ensureConnected(): void;
  getConnectionState(): ConnectionState;
}

export function createCodiusClient(config: CodiusClientConfig): CodiusClient {
  const daemonClient = new DaemonClient({
    ...config,
    clientId: config.clientId ?? createGeneratedClientId(),
    clientType: "cli",
  });
  const createWorkspaceHandle = createWorkspaceHandleFactory(daemonClient);
  const createAgentHandle = createAgentHandleFactory(daemonClient);

  return {
    workspaces: {
      list: (options) => daemonClient.fetchWorkspaces(options),
      ref: (workspace) => createWorkspaceHandle(workspace),
      open: (input, requestId) =>
        openWorkspace(daemonClient, createWorkspaceHandle, input, requestId),
      create: (input, requestId) =>
        openWorkspace(daemonClient, createWorkspaceHandle, input, requestId),
      archive: (workspace, requestId) =>
        daemonClient.archiveWorkspace(resolveWorkspaceId(workspace), requestId),
      subscribe: (handler) =>
        daemonClient.on("workspace_update", (message) => {
          handler(message.payload);
        }),
    },
    agents: {
      ref: (agent) => createAgentHandle(agent),
      create: async (options) => {
        const agent = await daemonClient.createAgent(options);
        return createAgentHandle(agent);
      },
      subscribe: (handler) =>
        daemonClient.on("agent_update", (message) => {
          handler(message.payload);
        }),
    },
    providers: {
      codex: (input) => providerConfig("codex", input),
      claude: (input) => providerConfig("claude", input),
      opencode: (input) => providerConfig("opencode", input),
      copilot: (input) => providerConfig("copilot", input),
      config: (provider, input) => providerConfig(provider, input),
      listModels: (provider, options) => daemonClient.listProviderModels(provider, options),
      listModes: (provider, options) => daemonClient.listProviderModes(provider, options),
      listFeatures: (draftConfig, options) =>
        daemonClient.listProviderFeatures(draftConfig, options),
      listAvailable: (options) => daemonClient.listAvailableProviders(options),
      snapshot: (options) => daemonClient.getProvidersSnapshot(options),
      refresh: (options) => daemonClient.refreshProvidersSnapshot(options),
      diagnostic: (provider, options) => daemonClient.getProviderDiagnostic(provider, options),
      subscribe: (handler) =>
        daemonClient.on("providers_snapshot_update", (message) => {
          handler(message.payload);
        }),
    },
    config: {
      get: (requestId) => daemonClient.getDaemonConfig(requestId),
      patch: (patch, requestId) => daemonClient.patchDaemonConfig(patch, requestId),
    },
    modelAccess: {
      get: (requestId) => daemonClient.getCodiusModelAccess(requestId),
      update: (input, requestId) => daemonClient.updateCodiusModelAccess(input, requestId),
    },
    connect: () => daemonClient.connect(),
    close: () => daemonClient.close(),
    ensureConnected: () => daemonClient.ensureConnected(),
    getConnectionState: () => daemonClient.getConnectionState(),
  };
}

type WorkspaceHandleFactory = (workspace: string | CodiusWorkspace) => CodiusWorkspaceHandle;
type AgentHandleFactory = (agent: string | CodiusAgent) => CodiusAgentHandle;

function createWorkspaceHandleFactory(daemonClient: DaemonClient): WorkspaceHandleFactory {
  return (workspace) => {
    const id = typeof workspace === "string" ? workspace : workspace.id;
    let latest = typeof workspace === "string" ? null : workspace;

    return {
      id,
      latest: () => latest,
      refetch: async (options) => {
        // Best-effort: fetches one page and matches by id client-side, so a workspace beyond
        // the first page won't be found. TODO: add a "get workspace by id" lookup and resolve
        // by exact id instead of paging.
        const result = await daemonClient.fetchWorkspaces({
          requestId: options?.requestId,
          page: { limit: 25 },
        });
        latest = result.entries.find((entry) => entry.id === id) ?? null;
        return latest;
      },
      archive: async (requestId) => {
        const result = await daemonClient.archiveWorkspace(id, requestId);
        if (latest) {
          latest = { ...latest, archivingAt: result.archivedAt };
        }
        return result;
      },
      subscribe: (handler) =>
        daemonClient.on("workspace_update", (message) => {
          const update = message.payload;
          if (update.kind === "upsert" && update.workspace.id === id) {
            latest = update.workspace;
            handler(update);
          }
          if (update.kind === "remove" && update.id === id) {
            latest = null;
            handler(update);
          }
        }),
    };
  };
}

function createAgentHandleFactory(daemonClient: DaemonClient): AgentHandleFactory {
  return (agent) => {
    const id = typeof agent === "string" ? agent : agent.id;
    let latest = typeof agent === "string" ? null : agent;

    const handle: CodiusAgentHandle = {
      id,
      timeline: {
        refetch: async (options) => {
          const result = await daemonClient.fetchAgentTimeline(id, options);
          if (result.agent) {
            latest = result.agent;
          }
          return result;
        },
        subscribe: (handler) =>
          daemonClient.on("agent_stream", (message) => {
            if (message.payload.agentId === id) {
              handler(message.payload);
            }
          }),
      },
      latest: () => latest,
      refetch: async (requestId) => {
        const result = await daemonClient.fetchAgent({ agentId: id, requestId });
        latest = result?.agent ?? null;
        return result;
      },
      send: async (text, options) => {
        await daemonClient.sendAgentMessage(id, text, options);
      },
      archive: async () => {
        const result = await daemonClient.archiveAgent(id);
        if (latest) {
          latest = { ...latest, archivedAt: result.archivedAt };
        }
        return result;
      },
      detach: async () => {
        await daemonClient.detachAgent(id);
      },
      subscribe: (handler) =>
        daemonClient.on("agent_update", (message) => {
          const update = message.payload;
          if (update.kind === "upsert" && update.agent.id === id) {
            latest = update.agent;
            handler(update);
          }
          if (update.kind === "remove" && update.agentId === id) {
            latest = null;
            handler(update);
          }
        }),
    };

    return handle;
  };
}

async function openWorkspace(
  daemonClient: DaemonClient,
  createWorkspaceHandle: WorkspaceHandleFactory,
  input: string | CodiusWorkspaceOpenOptions,
  requestId?: string,
): Promise<CodiusWorkspaceOpenResult> {
  const options = typeof input === "string" ? { cwd: input, requestId } : input;
  const result = await daemonClient.openProject(options.cwd, options.requestId);
  return {
    ...result,
    workspace: result.workspace ? createWorkspaceHandle(result.workspace) : null,
  };
}

function resolveWorkspaceId(workspace: string | CodiusWorkspaceHandle): string {
  return typeof workspace === "string" ? workspace : workspace.id;
}

function providerConfig(
  provider: CodiusAgentProvider,
  input: CodiusProviderConfigInput = {},
): CodiusProviderConfig {
  return {
    provider,
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.modeId !== undefined ? { modeId: input.modeId } : {}),
    ...(input.thinkingOptionId !== undefined ? { thinkingOptionId: input.thinkingOptionId } : {}),
    ...(input.featureValues !== undefined ? { featureValues: input.featureValues } : {}),
  };
}

function createGeneratedClientId(): string {
  const randomId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `codius-sdk-${randomId}`;
}
