import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("supervisor lifecycle intents", () => {
  test("uses explicit shutdown and restart IPC intents", () => {
    const source = readFileSync(new URL("./supervisor.ts", import.meta.url), "utf8");
    const legacyShutdownReason = ["cli", "shutdown"].join("_");

    expect(source).toContain('"codius:shutdown"');
    expect(source).toContain('"codius:restart"');
    expect(source).not.toContain(legacyShutdownReason);
  });
});
