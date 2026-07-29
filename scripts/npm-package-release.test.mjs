import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ROOT_DIR,
  deriveDistTag,
  findForbiddenPackedContent,
  findForbiddenPackedFiles,
  findMissingPackedFiles,
  resolveSourceIdentity,
  validateSourceIdentity,
  validateReleaseState,
} from "./npm-package-release.mjs";

const releaseConfig = JSON.parse(
  readFileSync(path.join(ROOT_DIR, "config/npm-package-release.json"), "utf8"),
);

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "codius-npm-release-"));
  mkdirSync(path.join(root, "config"), { recursive: true });
  copyFileSync(path.join(ROOT_DIR, "package.json"), path.join(root, "package.json"));
  copyFileSync(path.join(ROOT_DIR, "package-lock.json"), path.join(root, "package-lock.json"));
  copyFileSync(
    path.join(ROOT_DIR, "config/npm-package-release.json"),
    path.join(root, "config/npm-package-release.json"),
  );

  for (const entry of [...releaseConfig.packages, ...releaseConfig.privateWorkspaces]) {
    const sourceDirectory = path.join(ROOT_DIR, entry.workspace);
    const targetDirectory = path.join(root, entry.workspace);
    mkdirSync(targetDirectory, { recursive: true });
    copyFileSync(
      path.join(sourceDirectory, "package.json"),
      path.join(targetDirectory, "package.json"),
    );
    for (const requiredFile of ["README.md", "LICENSE"]) {
      const source = path.join(sourceDirectory, requiredFile);
      try {
        copyFileSync(source, path.join(targetDirectory, requiredFile));
      } catch {
        // Private workspaces are not required to include npm publication files.
      }
    }
    for (const relativeTarget of Object.values(entry.bin ?? {})) {
      const source = path.join(sourceDirectory, relativeTarget);
      const target = path.join(targetDirectory, relativeTarget);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(source, target);
      chmodSync(target, 0o755);
    }
  }

  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("current repository satisfies the coordinated npm release contract", () => {
  const result = validateReleaseState(ROOT_DIR, releaseConfig);
  assert.deepEqual(result.issues, []);
  assert.equal(releaseConfig.packages.length, 6);
  assert.deepEqual(
    releaseConfig.packages.map((entry) => entry.name),
    [
      "@codius.ai/highlight",
      "@codius.ai/relay",
      "@codius.ai/protocol",
      "@codius.ai/client",
      "@codius.ai/server",
      "@codius.ai/cli",
    ],
  );
});

test("uses beta for prereleases and latest only for stable releases", () => {
  assert.equal(deriveDistTag("0.2.0-beta.5"), "beta");
  assert.equal(deriveDistTag("0.2.0"), "latest");
  assert.throws(() => deriveDistTag("latest"), /Invalid release version/);
});

test("server package contract requires the daemon web UI entry assets", () => {
  const server = releaseConfig.packages.find((entry) => entry.name === "@codius.ai/server");
  assert.deepEqual(server.requiredPackedFiles, [
    "dist/server/web-ui/index.html",
    "dist/server/web-ui/index.html.br",
    "dist/server/web-ui/index.html.gz",
  ]);

  const missing = findMissingPackedFiles(
    {},
    server,
    new Set(["package.json", "README.md", "LICENSE"]),
  );
  assert.deepEqual(missing, server.requiredPackedFiles);
});

test("server package excludes compiled test helpers and its development launcher", () => {
  const server = JSON.parse(
    readFileSync(path.join(ROOT_DIR, "packages/server/package.json"), "utf8"),
  );
  assert(server.files.includes("!dist/**/test-utils/**"));
  assert(server.files.includes("!dist/**/test-*"));
  assert(server.files.includes("!dist/scripts/dev-runner.*"));
});

test("rejects compiled tests, development entries, credentials, and source maps in tarballs", () => {
  assert.deepEqual(findForbiddenPackedFiles(["dist/server/server/exports.js"]), []);
  assert.deepEqual(
    findForbiddenPackedFiles([
      "dist/server/server/test-utils/fake-agent-client.js",
      "dist/server/server/agent.test.js",
      "dist/scripts/dev-runner.js",
      "dist/server/server/exports.js.map",
      ".env.production",
      "secrets/signing-key.pem",
    ]),
    [
      {
        file: "dist/server/server/test-utils/fake-agent-client.js",
        rule: "compiled-test-directory",
      },
      {
        file: "dist/server/server/agent.test.js",
        rule: "compiled-test-module",
      },
      {
        file: "dist/scripts/dev-runner.js",
        rule: "development-entrypoint",
      },
      {
        file: "dist/server/server/exports.js.map",
        rule: "source-map",
      },
      {
        file: ".env.production",
        rule: "environment-file",
      },
      {
        file: "secrets/signing-key.pem",
        rule: "credential-file",
      },
    ],
  );
});

test("rejects prohibited content in packed code and public package copy", () => {
  const retiredCommand = ["codius", "ctl"].join("");
  const staleBrand = String.fromCharCode(80, 97, 115, 101, 111);
  const issues = findForbiddenPackedContent(["dist/index.js", "README.md", "LICENSE"], (file) => {
    if (file === "dist/index.js") return `spawn("${retiredCommand}")`;
    if (file === "README.md") return `Download ${staleBrand}.`;
    return "GNU AFFERO GENERAL PUBLIC LICENSE";
  });
  assert.deepEqual(issues, [
    { file: "dist/index.js", rule: "retired-control-command" },
    { file: "README.md", rule: "stale-upstream-brand" },
  ]);
});

test("release records carry source commit and tag traceability", () => {
  const identity = resolveSourceIdentity(ROOT_DIR, releaseConfig.packages[0].version);
  assert.match(identity.sourceCommit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
  assert(
    identity.sourceTag === null || identity.sourceTag === `v${releaseConfig.packages[0].version}`,
  );
  assert.doesNotThrow(() =>
    validateSourceIdentity(
      {
        sourceCommit: identity.sourceCommit,
        sourceTag: identity.sourceTag,
      },
      releaseConfig.packages[0].version,
    ),
  );
  assert.throws(
    () =>
      validateSourceIdentity(
        {
          sourceCommit: "not-a-commit",
          sourceTag: null,
        },
        releaseConfig.packages[0].version,
      ),
    /invalid source commit/,
  );
});

test("rejects an unsynchronized public package version", () => {
  const fixture = createFixture();
  try {
    const clientPath = path.join(fixture.root, "packages/client/package.json");
    const client = JSON.parse(readFileSync(clientPath, "utf8"));
    client.version = "9.9.9";
    writeJson(clientPath, client);
    const issues = validateReleaseState(fixture.root, releaseConfig).issues;
    assert(
      issues.some(
        (issue) =>
          issue.code === "package-version-mismatch" && issue.target === "@codius.ai/client",
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

test("rejects a retired npm scope in package dependencies", () => {
  const fixture = createFixture();
  try {
    const serverPath = path.join(fixture.root, "packages/server/package.json");
    const server = JSON.parse(readFileSync(serverPath, "utf8"));
    server.dependencies[[["@codius", "-ai"].join(""), "protocol"].join("/")] = server.version;
    writeJson(serverPath, server);
    const issues = validateReleaseState(fixture.root, releaseConfig).issues;
    assert(issues.some((issue) => issue.code === "retired-scope-reference"));
  } finally {
    fixture.cleanup();
  }
});

test("rejects a publishable internal-only workspace", () => {
  const fixture = createFixture();
  try {
    const packagePath = path.join(fixture.root, "packages/expo-two-way-audio/package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    delete pkg.private;
    writeJson(packagePath, pkg);
    const issues = validateReleaseState(fixture.root, releaseConfig).issues;
    assert(
      issues.some(
        (issue) =>
          issue.code === "private-workspace-publishable" &&
          issue.target === "@codius.ai/expo-two-way-audio",
      ),
    );
  } finally {
    fixture.cleanup();
  }
});
