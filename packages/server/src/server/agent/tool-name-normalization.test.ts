import { describe, expect, it } from "vitest";

import {
  getCodiusToolLeafName,
  isCodiusToolName,
} from "@codius-ai/protocol/tool-name-normalization";

describe("isCodiusToolName", () => {
  it("detects Claude Code format", () => {
    expect(isCodiusToolName("mcp__codius__create_agent")).toBe(true);
    expect(isCodiusToolName("mcp__codius__list_agents")).toBe(true);
  });

  it("detects codius_voice variant", () => {
    expect(isCodiusToolName("mcp__codius_voice__create_agent")).toBe(true);
    expect(isCodiusToolName("codius_voice.create_agent")).toBe(true);
  });

  it("excludes speak tools", () => {
    expect(isCodiusToolName("mcp__codius_voice__speak")).toBe(false);
    expect(isCodiusToolName("mcp__codius__speak")).toBe(false);
    expect(isCodiusToolName("codius.speak")).toBe(false);
  });

  it("detects Codex dot format", () => {
    expect(isCodiusToolName("codius.create_agent")).toBe(true);
  });

  it("rejects non-codius tools", () => {
    expect(isCodiusToolName("Bash")).toBe(false);
    expect(isCodiusToolName("Read")).toBe(false);
    expect(isCodiusToolName("mcp__other_server__some_tool")).toBe(false);
  });
});

describe("getCodiusToolLeafName", () => {
  it("extracts leaf from Claude Code format", () => {
    expect(getCodiusToolLeafName("mcp__codius__create_agent")).toBe("create_agent");
  });

  it("extracts leaf from Codex format", () => {
    expect(getCodiusToolLeafName("codius.create_agent")).toBe("create_agent");
    expect(getCodiusToolLeafName("codius.list_agents")).toBe("list_agents");
  });

  it("returns null for non-codius tools", () => {
    expect(getCodiusToolLeafName("Bash")).toBeNull();
  });
});
