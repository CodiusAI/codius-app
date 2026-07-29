import assert from "node:assert/strict";
import test from "node:test";
import { scanPublicText } from "./check-public-content.mjs";

test("rejects internal provider names and stale mobile identities", () => {
  const internalName = String.fromCharCode(82, 117, 110, 119, 97, 114, 101);
  const issues = scanPublicText(
    `${internalName} routes requests for sh.codius.`,
    "docs/install.md",
  );
  assert.deepEqual(
    issues.map((found) => found.rule),
    ["internal-provider", "stale-android-id"],
  );
});

test("allows the required README upstream attribution", () => {
  assert.deepEqual(
    scanPublicText("Upstream note: Codius began as a fork of Paseo.", "README.md"),
    [],
  );
});

test("rejects Paseo branding outside the attribution location", () => {
  const issues = scanPublicText("Download Paseo.", "docs/install.md");
  assert.deepEqual(
    issues.map((found) => found.rule),
    ["paseo-brand"],
  );
});
