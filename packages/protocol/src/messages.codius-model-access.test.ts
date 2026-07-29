import { describe, expect, test } from "vitest";

import { SessionInboundMessageSchema } from "./messages.js";

describe("Codius model access messages", () => {
  test("rejects a client-controlled API base URL", () => {
    const result = SessionInboundMessageSchema.safeParse({
      type: "models.codius.update_access.request",
      requestId: "request-1",
      input: {
        baseUrl: "https://attacker.invalid/v1",
      },
    });

    expect(result.success).toBe(false);
  });
});
