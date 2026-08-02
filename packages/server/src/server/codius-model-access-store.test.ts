import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CodiusModelAccessStore } from "./codius-model-access-store.js";

describe("CodiusModelAccessStore", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createHome(): string {
    const home = mkdtempSync(path.join(tmpdir(), "codius-model-access-"));
    tempDirs.push(home);
    return home;
  }

  test("validates and stores the key without returning it to clients", async () => {
    const home = createHome();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "codius-code-large", name: "Codius Code Large" },
            { id: "codius-code-fast", name: "Codius Code Fast" },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const store = new CodiusModelAccessStore(home, {
      fetch: fetcher,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    const status = await store.update({ apiKey: "codius_secret_1234" });

    expect(status).toEqual({
      configured: true,
      maskedApiKey: "•••• 1234",
      baseUrl: "https://api.codius.ai/v1",
      defaultForAgents: true,
      defaultModel: "codius-code-large",
      models: [
        { id: "codius-code-large", name: "Codius Code Large" },
        { id: "codius-code-fast", name: "Codius Code Fast" },
      ],
      lastValidatedAt: "2026-07-29T12:00:00.000Z",
    });
    expect(JSON.stringify(status)).not.toContain("codius_secret");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.codius.ai/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer codius_secret_1234",
        }),
      }),
    );

    const filePath = path.join(home, "model-access.json");
    if (process.platform !== "win32") {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(filePath, "utf8")).toContain("codius_secret_1234");
  });

  test("does not replace a working key when validation fails", async () => {
    const home = createHome();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "model-a" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const store = new CodiusModelAccessStore(home, { fetch: fetcher });
    await store.update({ apiKey: "working-key" });

    await expect(store.update({ apiKey: "broken-key" })).rejects.toThrow(
      "The API key was not accepted.",
    );
    expect(store.getStatus().maskedApiKey).toBe("•••• -key");
    expect(readFileSync(path.join(home, "model-access.json"), "utf8")).toContain("working-key");
    expect(readFileSync(path.join(home, "model-access.json"), "utf8")).not.toContain("broken-key");
  });

  test("never returns a short API key in its masked status", async () => {
    const home = createHome();
    const store = new CodiusModelAccessStore(home, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "model-a" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });

    const status = await store.update({ apiKey: "tiny" });

    expect(status.maskedApiKey).toBe("••••");
    expect(JSON.stringify(status)).not.toContain("tiny");
  });

  test("builds isolated launch defaults for compatible agents", async () => {
    const home = createHome();
    const store = new CodiusModelAccessStore(home, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "model-a", name: "Model A" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });
    await store.update({ apiKey: "host-key" });

    const openCode = store.resolveAgentDefaults("opencode");
    expect(openCode?.model).toBe("codius/model-a");
    expect(JSON.parse(openCode?.env.OPENCODE_CONFIG_CONTENT ?? "{}")).toMatchObject({
      model: "codius/model-a",
      provider: {
        codius: {
          name: "Codius",
          options: { baseURL: "https://api.codius.ai/v1" },
        },
      },
    });

    expect(store.resolveAgentDefaults("claude")?.env).toMatchObject({
      ANTHROPIC_AUTH_TOKEN: "host-key",
      ANTHROPIC_BASE_URL: "https://api.codius.ai",
      ANTHROPIC_MODEL: "model-a",
    });
    expect(store.resolveAgentDefaults("codex")?.env).toMatchObject({
      OPENAI_API_KEY: "host-key",
      OPENAI_BASE_URL: "https://api.codius.ai/v1",
      CODIUS_MODEL_ACCESS_PROVIDER_ID: "codius",
    });
    expect(store.resolveAgentDefaults("pi")?.model).toBe("codius/model-a");
    expect(store.resolveAgentDefaults("omp")).toBeNull();
  });

  test("never combines stored credentials with caller-controlled launch environment", async () => {
    const home = createHome();
    const store = new CodiusModelAccessStore(home, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "model-a" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });
    await store.update({ apiKey: "host-key" });

    expect(
      store.resolveAgentDefaults("codex", {
        OPENAI_BASE_URL: "https://attacker.invalid/v1",
      }),
    ).toBeNull();
    expect(
      store.resolveAgentDefaults("claude", {
        HTTPS_PROXY: "https://attacker.invalid",
      }),
    ).toBeNull();
    expect(
      store.resolveAgentDefaults("opencode", {
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ theme: "system" }),
      }),
    ).toBeNull();
  });

  test("pins validation and migrated settings to the Codius API origin", async () => {
    const home = createHome();
    writeFileSync(
      path.join(home, "model-access.json"),
      JSON.stringify({
        version: 1,
        apiKey: "stored-key",
        baseUrl: "https://attacker.invalid/v1",
        defaultForAgents: true,
        defaultModel: "model-a",
        models: [{ id: "model-a" }],
      }),
      { mode: 0o600 },
    );
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "model-a" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const store = new CodiusModelAccessStore(home, { fetch: fetcher });

    const status = await store.update({ defaultForAgents: false });

    expect(status.baseUrl).toBe("https://api.codius.ai/v1");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.codius.ai/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer stored-key",
        }),
      }),
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("attacker.invalid");
    expect(readFileSync(path.join(home, "model-access.json"), "utf8")).not.toContain(
      "attacker.invalid",
    );
  });

  test("clears the key and disables automatic defaults", async () => {
    const home = createHome();
    const store = new CodiusModelAccessStore(home, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "model-a" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });
    await store.update({ apiKey: "host-key" });

    const status = await store.update({ clearApiKey: true });

    expect(status.configured).toBe(false);
    expect(status.maskedApiKey).toBeNull();
    expect(status.defaultForAgents).toBe(false);
    expect(store.resolveAgentDefaults("opencode")).toBeNull();
  });
});
