import type { AgentHookPluginFileInstallStrategy } from "../agent-hook-installer.js";

export const OPENCODE_PLUGIN_SOURCE = [
  "const STATUS_EVENTS = {",
  '  busy: "session.status.busy",',
  '  retry: "session.status.retry",',
  '  idle: "session.status.idle",',
  "};",
  "",
  "function codiusEventFor(event) {",
  '  if (event?.type === "permission.asked") return "permission.asked";',
  '  if (event?.type === "permission.replied") return "permission.replied";',
  '  if (event?.type !== "session.status") return null;',
  "  return STATUS_EVENTS[event?.properties?.status?.type] ?? null;",
  "}",
  "",
  "function runCodiusHook(event) {",
  "  if (!process.env.CODIUS_TERMINAL_ID) return;",
  "  try {",
  '    const child = Bun.spawn(["codius", "hooks", "opencode", event], {',
  '      stdin: "ignore",',
  '      stdout: "ignore",',
  '      stderr: "ignore",',
  "    });",
  "    void child.exited.catch(() => {});",
  "  } catch {}",
  "}",
  "",
  "export default async () => ({",
  "  event: async ({ event }) => {",
  "    const codiusEvent = codiusEventFor(event);",
  "    if (codiusEvent) runCodiusHook(codiusEvent);",
  "  },",
  "});",
  "",
].join("\n");

export function createOpenCodePluginInstallStrategy(): AgentHookPluginFileInstallStrategy {
  return {
    kind: "plugin-file",
    configDir: "opencode",
    configDirBase: "xdg-config",
    configFile: "plugins/codius-terminal-activity.js",
    configDirEnvOverride: "OPENCODE_CONFIG_DIR",
    hookMarker: "codius hooks opencode",
    source: OPENCODE_PLUGIN_SOURCE,
  };
}
