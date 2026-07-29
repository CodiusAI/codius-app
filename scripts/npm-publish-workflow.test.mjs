import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(path.join(ROOT, ".github/workflows/npm-publish.yml"), "utf8");
const releaseConfig = JSON.parse(
  readFileSync(path.join(ROOT, "config/npm-package-release.json"), "utf8"),
);

test("npm publishing uses the npmjs registry and no long-lived token", () => {
  assert.match(workflow, /https:\/\/registry\.npmjs\.org\//);
  assert.doesNotMatch(workflow, /npm\.pkg\.github\.com/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|npm-token/i);
});

test("npm publishing is staged behind the protected OIDC environment", () => {
  const prepareIndex = workflow.indexOf("  prepare:");
  const publishIndex = workflow.indexOf("  publish:");
  const uploadIndex = workflow.indexOf("Upload reviewed npm tarballs");
  const environmentIndex = workflow.indexOf("environment: npm-production");
  const oidcIndex = workflow.indexOf("id-token: write");

  assert(prepareIndex >= 0);
  assert(publishIndex > prepareIndex);
  assert(uploadIndex > prepareIndex && uploadIndex < publishIndex);
  assert(environmentIndex > publishIndex);
  assert(oidcIndex > publishIndex);
});

test("workflow runtime matches the trusted-publishing contract", () => {
  assert.match(
    workflow,
    new RegExp(
      `node-version: "${releaseConfig.trustedPublishing.nodeVersion.replaceAll(".", "\\.")}"`,
    ),
  );
  assert.match(
    workflow,
    new RegExp(
      `npm install --global npm@${releaseConfig.trustedPublishing.npmVersion.replaceAll(".", "\\.")}`,
    ),
  );
  assert.match(workflow, /scripts\/npm-package-release\.mjs pack/);
  assert.match(workflow, /scripts\/npm-package-release\.mjs publish/);
  assert.match(workflow, /--provenance/);
});
