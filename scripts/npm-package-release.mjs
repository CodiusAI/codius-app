#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const RELEASE_CONFIG_PATH = "config/npm-package-release.json";
const RETIRED_SCOPE = ["@codius", "-ai/"].join("");
const RETIRED_CONTROL_COMMAND = ["codius", "ctl"].join("");
const RETIRED_CONTROL_NAME = ["Codius", " Control"].join("");
const RETIRED_REPOSITORY = ["CodiusAI/codius", "-cli"].join("");
const STALE_UPSTREAM_BRAND = String.fromCharCode(112, 97, 115, 101, 111);
const UPSTREAM_COMMERCIAL_SERVICE = ["OpenCode", " (?:Zen|Go)"].join("");
const INTERNAL_PROVIDER = String.fromCharCode(114, 117, 110, 119, 97, 114, 101);
const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const GIT_COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PACKED_TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".d.ts",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".txt",
]);
const FORBIDDEN_PACKED_PATH_RULES = [
  {
    id: "source-map",
    pattern: /\.map$/i,
  },
  {
    id: "compiled-test-directory",
    pattern: /(?:^|\/)(?:__tests__|test-utils)(?:\/|$)/i,
  },
  {
    id: "compiled-test-module",
    pattern: /(?:^|\/)[^/]*\.(?:test|spec|e2e)\.(?:[cm]?js|d\.ts)$/i,
  },
  {
    id: "compiled-test-helper",
    pattern: /(?:^|\/)test-[^/]*\.(?:[cm]?js|d\.ts)$/i,
  },
  {
    id: "development-entrypoint",
    pattern: /^dist\/scripts\/dev-runner\.(?:[cm]?js|d\.ts)$/i,
  },
  {
    id: "environment-file",
    pattern: /(?:^|\/)\.env(?:\.(?!example$)[^/]+)?$/i,
  },
  {
    id: "credential-file",
    pattern: /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:key|p12|pfx|pem))$/i,
  },
];
const FORBIDDEN_PACKED_CONTENT_RULES = [
  {
    id: "internal-provider",
    pattern: new RegExp(`\\b${INTERNAL_PROVIDER}\\b`, "i"),
  },
  {
    id: "retired-npm-scope",
    pattern: new RegExp(RETIRED_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  },
  {
    id: "retired-control-command",
    pattern: new RegExp(`\\b${RETIRED_CONTROL_COMMAND}\\b`, "i"),
  },
  {
    id: "retired-control-name",
    pattern: new RegExp(`\\b${RETIRED_CONTROL_NAME}\\b`, "i"),
  },
  {
    id: "retired-repository",
    pattern: new RegExp(RETIRED_REPOSITORY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  },
  {
    id: "stale-upstream-brand",
    pattern: new RegExp(`\\b${STALE_UPSTREAM_BRAND}\\b`, "i"),
  },
  {
    id: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    id: "github-token",
    pattern: /(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})/,
  },
  {
    id: "provider-token",
    pattern: /(?:sk-ant-|sk-proj-)[A-Za-z0-9_-]{20,}/,
  },
  {
    id: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
];
const FORBIDDEN_PACKED_PUBLIC_COPY_RULES = [
  {
    id: "upstream-commercial-service",
    pattern: new RegExp(UPSTREAM_COMMERCIAL_SERVICE, "i"),
  },
  {
    id: "personal-path",
    pattern: /(?:^|[\s("'`])(?:\/Users\/|[A-Z]:\\Users\\)[^\s"'`]+/im,
  },
  {
    id: "testimonial-copy",
    pattern: /\b(?:testimonials?|what (?:developers|customers) (?:say|are saying))\b/i,
  },
];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT_DIR,
    encoding: options.encoding ?? "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}.${detail ? `\n${detail}` : ""}`,
    );
  }
  return result;
}

function loadReleaseConfig(root = ROOT_DIR) {
  return readJson(path.join(root, RELEASE_CONFIG_PATH));
}

function packageJsonPath(root, workspace) {
  return path.join(root, workspace, "package.json");
}

function addIssue(issues, code, target, detail) {
  issues.push({ code, target, detail });
}

function flattenExportTargets(value, targets = []) {
  if (typeof value === "string") {
    targets.push(value);
    return targets;
  }
  if (!value || typeof value !== "object") return targets;
  for (const child of Object.values(value)) flattenExportTargets(child, targets);
  return targets;
}

function hasPackedPath(files, target) {
  const normalized = target.replace(/^\.\//, "");
  if (!normalized.includes("*")) return files.has(normalized);
  const [prefix, suffix] = normalized.split("*");
  return [...files].some((file) => file.startsWith(prefix) && file.endsWith(suffix));
}

function normalizePackedFiles(packedFilesInput) {
  return [...packedFilesInput].map((file) =>
    toPosix(typeof file === "string" ? file : file.path).replace(/^\.\//, ""),
  );
}

function isPackedTextFile(file) {
  const basename = path.posix.basename(file);
  return (
    PACKED_TEXT_EXTENSIONS.has(path.posix.extname(file)) ||
    basename === "LICENSE" ||
    basename === ".env.example"
  );
}

function isPackedPublicCopy(file) {
  const basename = path.posix.basename(file);
  return basename === "README.md" || basename === "package.json";
}

export function findForbiddenPackedFiles(packedFilesInput) {
  const issues = [];
  for (const file of normalizePackedFiles(packedFilesInput)) {
    for (const rule of FORBIDDEN_PACKED_PATH_RULES) {
      if (rule.pattern.test(file)) {
        issues.push({ file, rule: rule.id });
      }
    }
  }
  return issues;
}

export function findForbiddenPackedContent(packedFilesInput, readText) {
  const issues = [];
  for (const file of normalizePackedFiles(packedFilesInput)) {
    if (!isPackedTextFile(file)) continue;
    const text = readText(file);
    if (typeof text !== "string") continue;
    const rules = isPackedPublicCopy(file)
      ? [...FORBIDDEN_PACKED_CONTENT_RULES, ...FORBIDDEN_PACKED_PUBLIC_COPY_RULES]
      : FORBIDDEN_PACKED_CONTENT_RULES;
    for (const rule of rules) {
      if (rule.pattern.test(text)) {
        issues.push({ file, rule: rule.id });
      }
    }
  }
  return issues;
}

// oxlint-disable complexity -- linear release checklist: every independent metadata
// assertion adds a branch; splitting it into helpers would obscure the sequence.
function validatePackageMetadata(root, releaseConfig, entry, rootVersion, rootWorkspaces, issues) {
  const manifestPath = packageJsonPath(root, entry.workspace);
  if (!existsSync(manifestPath)) {
    addIssue(issues, "missing-package-json", entry.workspace, manifestPath);
    return;
  }

  if (!rootWorkspaces.has(entry.workspace)) {
    addIssue(issues, "workspace-not-registered", entry.name, entry.workspace);
  }

  const pkg = readJson(manifestPath);
  if (pkg.name !== entry.name) {
    addIssue(issues, "package-name-mismatch", entry.workspace, `${pkg.name} !== ${entry.name}`);
  }
  if (pkg.version !== rootVersion) {
    addIssue(issues, "package-version-mismatch", entry.name, `${pkg.version} !== ${rootVersion}`);
  }
  if (pkg.private === true) {
    addIssue(issues, "public-package-marked-private", entry.name, "private is true");
  }
  if (pkg.license !== "AGPL-3.0-or-later") {
    addIssue(issues, "invalid-license-metadata", entry.name, String(pkg.license));
  }
  if (!pkg.description || !pkg.homepage || !pkg.repository || !pkg.bugs || !pkg.author) {
    addIssue(
      issues,
      "incomplete-package-metadata",
      entry.name,
      "description, homepage, repository, bugs, and author are required",
    );
  }
  if (pkg.repository?.directory !== entry.workspace) {
    addIssue(
      issues,
      "repository-directory-mismatch",
      entry.name,
      `${pkg.repository?.directory ?? "<missing>"} !== ${entry.workspace}`,
    );
  }
  if (pkg.publishConfig?.access !== "public") {
    addIssue(issues, "package-not-public", entry.name, "publishConfig.access must be public");
  }
  if (pkg.publishConfig?.registry !== releaseConfig.registry) {
    addIssue(
      issues,
      "registry-mismatch",
      entry.name,
      `${pkg.publishConfig?.registry ?? "<missing>"} !== ${releaseConfig.registry}`,
    );
  }
  if (
    !Array.isArray(pkg.files) ||
    !pkg.files.includes("README.md") ||
    !pkg.files.includes("LICENSE")
  ) {
    addIssue(
      issues,
      "required-package-files-not-declared",
      entry.name,
      "files must include README.md and LICENSE",
    );
  }
  for (const requiredFile of ["README.md", "LICENSE"]) {
    if (!existsSync(path.join(root, entry.workspace, requiredFile))) {
      addIssue(issues, "missing-package-file", entry.name, requiredFile);
    }
  }

  const declaredDependencies = new Set(entry.dependsOn ?? []);
  for (const dependencyName of declaredDependencies) {
    if (pkg.dependencies?.[dependencyName] !== rootVersion) {
      addIssue(
        issues,
        "internal-dependency-version-mismatch",
        `${entry.name} -> ${dependencyName}`,
        `${pkg.dependencies?.[dependencyName] ?? "<missing>"} !== ${rootVersion}`,
      );
    }
  }

  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [dependencyName, range] of Object.entries(pkg[section] ?? {})) {
      if (dependencyName.startsWith(RETIRED_SCOPE)) {
        addIssue(issues, "retired-scope-reference", `${entry.name}#${section}`, dependencyName);
      }
      if (!dependencyName.startsWith(`${releaseConfig.scope}/`)) continue;
      if (!releaseConfig.packages.some((candidate) => candidate.name === dependencyName)) {
        addIssue(issues, "unknown-public-internal-dependency", entry.name, dependencyName);
        continue;
      }
      if (section === "dependencies" && !declaredDependencies.has(dependencyName)) {
        addIssue(issues, "undeclared-release-dependency", entry.name, dependencyName);
      }
      if (range !== rootVersion) {
        addIssue(
          issues,
          "internal-dependency-version-mismatch",
          `${entry.name}#${section}.${dependencyName}`,
          `${range} !== ${rootVersion}`,
        );
      }
    }
  }

  if (entry.bin) {
    if (JSON.stringify(pkg.bin) !== JSON.stringify(entry.bin)) {
      addIssue(
        issues,
        "binary-contract-mismatch",
        entry.name,
        `${JSON.stringify(pkg.bin)} !== ${JSON.stringify(entry.bin)}`,
      );
    }
    for (const [command, relativeTarget] of Object.entries(entry.bin)) {
      const absoluteTarget = path.join(root, entry.workspace, relativeTarget);
      if (!existsSync(absoluteTarget)) {
        addIssue(issues, "missing-binary-target", `${entry.name}:${command}`, relativeTarget);
        continue;
      }
      const firstLine = readFileSync(absoluteTarget, "utf8").split(/\r?\n/, 1)[0];
      if (!firstLine.startsWith("#!")) {
        addIssue(issues, "binary-missing-shebang", `${entry.name}:${command}`, relativeTarget);
      }
      if (process.platform !== "win32" && (statSync(absoluteTarget).mode & 0o111) === 0) {
        addIssue(issues, "binary-not-executable", `${entry.name}:${command}`, relativeTarget);
      }
    }
  }
}

// oxlint-disable complexity -- linear release checklist: every independent state
// assertion adds a branch; splitting it into helpers would obscure the sequence.
export function validateReleaseState(root = ROOT_DIR, releaseConfig = loadReleaseConfig(root)) {
  const issues = [];
  const rootPackagePath = path.join(root, "package.json");
  const lockfilePath = path.join(root, "package-lock.json");
  const rootPackage = readJson(rootPackagePath);
  const rootVersion = String(rootPackage.version ?? "");
  const rootWorkspaces = new Set(rootPackage.workspaces ?? []);

  if (!VERSION_PATTERN.test(rootVersion)) {
    addIssue(issues, "invalid-root-version", "package.json", rootVersion || "<missing>");
  }
  if (rootPackage.private !== true) {
    addIssue(issues, "root-must-be-private", "package.json", String(rootPackage.private));
  }
  if (releaseConfig.scope !== "@codius.ai") {
    addIssue(issues, "invalid-release-scope", RELEASE_CONFIG_PATH, releaseConfig.scope);
  }
  if (releaseConfig.registry !== "https://registry.npmjs.org/") {
    addIssue(issues, "invalid-release-registry", RELEASE_CONFIG_PATH, releaseConfig.registry);
  }

  const packageNames = new Set();
  for (const entry of releaseConfig.packages ?? []) {
    if (packageNames.has(entry.name)) {
      addIssue(issues, "duplicate-release-package", RELEASE_CONFIG_PATH, entry.name);
    }
    packageNames.add(entry.name);
    validatePackageMetadata(root, releaseConfig, entry, rootVersion, rootWorkspaces, issues);
  }

  for (const [index, entry] of (releaseConfig.packages ?? []).entries()) {
    for (const dependencyName of entry.dependsOn ?? []) {
      const dependencyIndex = releaseConfig.packages.findIndex(
        (candidate) => candidate.name === dependencyName,
      );
      if (dependencyIndex < 0) {
        addIssue(issues, "unknown-release-dependency", entry.name, dependencyName);
      } else if (dependencyIndex >= index) {
        addIssue(issues, "invalid-release-order", entry.name, dependencyName);
      }
    }
  }

  for (const entry of releaseConfig.privateWorkspaces ?? []) {
    const manifestPath = packageJsonPath(root, entry.workspace);
    if (!existsSync(manifestPath)) {
      addIssue(issues, "missing-private-package-json", entry.workspace, manifestPath);
      continue;
    }
    const pkg = readJson(manifestPath);
    if (!rootWorkspaces.has(entry.workspace)) {
      addIssue(issues, "private-workspace-not-registered", entry.name, entry.workspace);
    }
    if (pkg.name !== entry.name) {
      addIssue(issues, "private-package-name-mismatch", entry.workspace, String(pkg.name));
    }
    if (pkg.private !== true) {
      addIssue(issues, "private-workspace-publishable", entry.name, "private must be true");
    }
    if (pkg.version !== rootVersion) {
      addIssue(
        issues,
        "private-package-version-mismatch",
        entry.name,
        `${pkg.version} !== ${rootVersion}`,
      );
    }
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      for (const [dependencyName, range] of Object.entries(pkg[section] ?? {})) {
        if (dependencyName.startsWith(RETIRED_SCOPE)) {
          addIssue(issues, "retired-scope-reference", `${entry.name}#${section}`, dependencyName);
        }
        if (packageNames.has(dependencyName) && range !== "*") {
          addIssue(
            issues,
            "private-internal-dependency-range",
            `${entry.name}#${section}.${dependencyName}`,
            `${range} !== *`,
          );
        }
      }
    }
  }

  if (!existsSync(lockfilePath)) {
    addIssue(issues, "missing-lockfile", "package-lock.json", "required");
  } else {
    const lockfile = readJson(lockfilePath);
    if (lockfile.version !== rootVersion || lockfile.packages?.[""]?.version !== rootVersion) {
      addIssue(
        issues,
        "lockfile-root-version-mismatch",
        "package-lock.json",
        `${lockfile.version}/${lockfile.packages?.[""]?.version} !== ${rootVersion}`,
      );
    }
    for (const entry of [
      ...(releaseConfig.packages ?? []),
      ...(releaseConfig.privateWorkspaces ?? []),
    ]) {
      const locked = lockfile.packages?.[entry.workspace];
      if (!locked) {
        addIssue(issues, "workspace-missing-from-lockfile", entry.name, entry.workspace);
        continue;
      }
      if (locked.name !== entry.name || locked.version !== rootVersion) {
        addIssue(
          issues,
          "lockfile-workspace-mismatch",
          entry.workspace,
          `${locked.name}@${locked.version} !== ${entry.name}@${rootVersion}`,
        );
      }
    }
  }

  return { issues, rootVersion, releaseConfig };
}

function formatIssues(issues) {
  return issues.map((issue) => `- ${issue.code}: ${issue.target} (${issue.detail})`).join("\n");
}

function assertValidReleaseState(root = ROOT_DIR) {
  const result = validateReleaseState(root);
  if (result.issues.length > 0) {
    throw new Error(
      `npm package release validation failed with ${result.issues.length} issue(s):\n${formatIssues(result.issues)}`,
    );
  }
  return result;
}

export function deriveDistTag(version) {
  if (!VERSION_PATTERN.test(version)) throw new Error(`Invalid release version: ${version}`);
  return version.includes("-") ? "beta" : "latest";
}

function buildPackages(releaseConfig) {
  for (const entry of releaseConfig.packages) {
    console.log(`\nBuilding ${entry.name}...`);
    run("npm", ["run", "build:clean", `--workspace=${entry.name}`]);
  }

  console.log("\nBuilding the daemon web UI for @codius.ai/server...");
  run("npm", ["run", "build:daemon-web-ui"]);
}

function parseNpmJson(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new Error(`npm did not return JSON output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1));
}

export function findMissingPackedFiles(pkg, entry, packedFilesInput) {
  const packedFiles = new Set(normalizePackedFiles(packedFilesInput));
  const missing = [];
  for (const requiredPath of [
    "package.json",
    "README.md",
    "LICENSE",
    ...(entry.requiredPackedFiles ?? []),
  ]) {
    if (!packedFiles.has(requiredPath)) missing.push(requiredPath);
  }
  for (const target of [
    pkg.main,
    pkg.types,
    ...Object.values(pkg.bin ?? {}),
    ...flattenExportTargets(pkg.exports),
  ].filter(Boolean)) {
    if (!hasPackedPath(packedFiles, target)) missing.push(target);
  }
  return [...new Set(missing)];
}

function validatePackedPackage(root, entry, packed) {
  const pkg = readJson(packageJsonPath(root, entry.workspace));
  const packedFiles = packed.files ?? [];
  const missing = findMissingPackedFiles(pkg, entry, packedFiles);
  if (missing.length > 0) {
    throw new Error(`${entry.name} tarball is missing declared files: ${missing.join(", ")}`);
  }
  const forbiddenFiles = findForbiddenPackedFiles(packedFiles);
  if (forbiddenFiles.length > 0) {
    throw new Error(
      `${entry.name} tarball contains forbidden files: ${forbiddenFiles
        .map((issue) => `${issue.file} [${issue.rule}]`)
        .join(", ")}`,
    );
  }
  const forbiddenContent = findForbiddenPackedContent(packedFiles, (file) => {
    const absolutePath = path.join(root, entry.workspace, file);
    return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
  });
  if (forbiddenContent.length > 0) {
    throw new Error(
      `${entry.name} tarball contains forbidden public content: ${forbiddenContent
        .map((issue) => `${issue.file} [${issue.rule}]`)
        .join(", ")}`,
    );
  }
}

function digestFile(filePath) {
  const digest = createHash("sha512").update(readFileSync(filePath)).digest();
  return {
    sha512: digest.toString("hex"),
    integrity: `sha512-${digest.toString("base64")}`,
  };
}

function artifactDirectory(root, version, override) {
  return path.resolve(root, override ?? path.join("artifacts", "npm", version));
}

export function resolveSourceIdentity(root, version, env = process.env) {
  const gitHead = run("git", ["rev-parse", "HEAD"], {
    cwd: root,
    stdio: "pipe",
  }).stdout.trim();
  if (!GIT_COMMIT_PATTERN.test(gitHead)) {
    throw new Error(`git returned an invalid source commit: ${gitHead || "<missing>"}`);
  }

  const githubCommit = env.GITHUB_SHA?.trim();
  if (githubCommit && githubCommit !== gitHead) {
    throw new Error(`GITHUB_SHA ${githubCommit} does not match checked-out commit ${gitHead}.`);
  }

  const expectedTag = `v${version}`;
  let sourceTag = null;
  if (env.GITHUB_REF_TYPE === "tag") {
    sourceTag = env.GITHUB_REF_NAME?.trim() || null;
    if (sourceTag !== expectedTag) {
      throw new Error(
        `GitHub tag ${sourceTag ?? "<missing>"} does not match release version ${expectedTag}.`,
      );
    }
  } else {
    const tagResult = run("git", ["tag", "--points-at", gitHead, "--list", expectedTag], {
      cwd: root,
      stdio: "pipe",
    });
    sourceTag = tagResult.stdout.trim() || null;
  }

  return {
    sourceCommit: gitHead,
    sourceTag,
  };
}

export function validateSourceIdentity(releaseRecord, version) {
  if (!GIT_COMMIT_PATTERN.test(releaseRecord.sourceCommit ?? "")) {
    throw new Error("Release record has an invalid source commit.");
  }
  const expectedTag = `v${version}`;
  if (releaseRecord.sourceTag !== null && releaseRecord.sourceTag !== expectedTag) {
    throw new Error(`Release record source tag does not match ${expectedTag}.`);
  }
}

function packPackages(root, releaseConfig, version, options = {}) {
  if (!options.skipBuild) buildPackages(releaseConfig);
  const outputDirectory = artifactDirectory(root, version, options.artifactDirectory);
  mkdirSync(outputDirectory, { recursive: true });

  const artifacts = [];
  for (const entry of releaseConfig.packages) {
    console.log(`\nPacking ${entry.name}...`);
    const result = run(
      "npm",
      [
        "pack",
        `--workspace=${entry.name}`,
        "--ignore-scripts",
        "--json",
        `--pack-destination=${outputDirectory}`,
      ],
      { stdio: "pipe" },
    );
    const [packed] = parseNpmJson(result.stdout);
    if (!packed?.filename) throw new Error(`npm pack did not report a filename for ${entry.name}`);
    validatePackedPackage(root, entry, packed);
    const absolutePath = path.join(outputDirectory, packed.filename);
    if (!existsSync(absolutePath)) throw new Error(`Missing packed artifact: ${absolutePath}`);
    const digest = digestFile(absolutePath);
    artifacts.push({
      name: entry.name,
      workspace: entry.workspace,
      version,
      filename: packed.filename,
      size: statSync(absolutePath).size,
      sha512: digest.sha512,
      integrity: digest.integrity,
    });
  }

  const sourceIdentity = resolveSourceIdentity(root, version);
  const releaseRecord = {
    schemaVersion: 3,
    version,
    registry: releaseConfig.registry,
    distTag: deriveDistTag(version),
    ...sourceIdentity,
    generatedAt: new Date().toISOString(),
    artifacts,
  };
  const releaseRecordPath = path.join(outputDirectory, `npm-release-${version}.json`);
  writeFileSync(releaseRecordPath, `${JSON.stringify(releaseRecord, null, 2)}\n`);
  console.log(`\nWrote ${toPosix(path.relative(root, releaseRecordPath))}`);
  return { outputDirectory, releaseRecord, releaseRecordPath };
}

function loadAndVerifyArtifacts(root, releaseConfig, version, artifactDirectoryOverride) {
  const outputDirectory = artifactDirectory(root, version, artifactDirectoryOverride);
  const releaseRecordPath = path.join(outputDirectory, `npm-release-${version}.json`);
  if (!existsSync(releaseRecordPath)) {
    throw new Error(
      `Missing ${releaseRecordPath}. Run the pack action and review its artifacts before publishing.`,
    );
  }
  const releaseRecord = readJson(releaseRecordPath);
  if (releaseRecord.schemaVersion !== 3) {
    throw new Error(`Unsupported npm release record schema: ${releaseRecord.schemaVersion}.`);
  }
  if (releaseRecord.version !== version || releaseRecord.registry !== releaseConfig.registry) {
    throw new Error(`Release record does not match ${version} on ${releaseConfig.registry}.`);
  }
  if (releaseRecord.distTag !== deriveDistTag(version)) {
    throw new Error(`Release record has the wrong npm dist-tag for ${version}.`);
  }
  validateSourceIdentity(releaseRecord, version);
  const currentSourceIdentity = resolveSourceIdentity(root, version);
  if (releaseRecord.sourceCommit !== currentSourceIdentity.sourceCommit) {
    throw new Error(
      `Release record source commit ${releaseRecord.sourceCommit} does not match checked-out commit ${currentSourceIdentity.sourceCommit}.`,
    );
  }
  if (
    currentSourceIdentity.sourceTag !== null &&
    releaseRecord.sourceTag !== currentSourceIdentity.sourceTag
  ) {
    throw new Error(
      `Release record source tag ${releaseRecord.sourceTag ?? "<missing>"} does not match checked-out tag ${currentSourceIdentity.sourceTag}.`,
    );
  }
  const expectedNames = releaseConfig.packages.map((entry) => entry.name);
  if (
    JSON.stringify(releaseRecord.artifacts?.map((artifact) => artifact.name)) !==
    JSON.stringify(expectedNames)
  ) {
    throw new Error("Release record package order does not match the release manifest.");
  }
  for (const artifact of releaseRecord.artifacts) {
    const absolutePath = path.join(outputDirectory, artifact.filename);
    if (!existsSync(absolutePath)) throw new Error(`Missing packed artifact: ${absolutePath}`);
    const digest = digestFile(absolutePath);
    if (
      statSync(absolutePath).size !== artifact.size ||
      digest.sha512 !== artifact.sha512 ||
      digest.integrity !== artifact.integrity
    ) {
      throw new Error(`Packed artifact changed after review: ${absolutePath}`);
    }
  }
  return { outputDirectory, releaseRecord };
}

function getPublishedIntegrity(name, version, registry) {
  const result = run(
    "npm",
    ["view", `${name}@${version}`, "dist.integrity", "--json", `--registry=${registry}`],
    { stdio: "pipe", allowFailure: true },
  );
  if (result.status === 0) {
    const integrity = JSON.parse(result.stdout);
    if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
      throw new Error(`Registry returned invalid integrity metadata for ${name}@${version}.`);
    }
    return integrity;
  }
  const errorOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/\bE404\b|404 Not Found/i.test(errorOutput)) return null;
  throw new Error(`Unable to query ${name}@${version}:\n${errorOutput.trim()}`);
}

function publishPackages(root, releaseConfig, version, options) {
  if (!options.dryRun) {
    if (options.confirm !== version) {
      throw new Error(`Publishing requires --confirm ${version}.`);
    }
    if (process.env.CODIUS_NPM_PUBLISH !== "true") {
      throw new Error("Publishing requires CODIUS_NPM_PUBLISH=true.");
    }
  }

  const { outputDirectory, releaseRecord } = loadAndVerifyArtifacts(
    root,
    releaseConfig,
    version,
    options.artifactDirectory,
  );
  const tag = deriveDistTag(version);

  for (const artifact of releaseRecord.artifacts) {
    if (!options.dryRun) {
      const publishedIntegrity = getPublishedIntegrity(
        artifact.name,
        version,
        releaseConfig.registry,
      );
      if (publishedIntegrity) {
        if (publishedIntegrity !== artifact.integrity) {
          throw new Error(
            `${artifact.name}@${version} already exists with different tarball integrity.`,
          );
        }
        console.log(
          `Skipping ${artifact.name}@${version}; the exact tarball is already published.`,
        );
        continue;
      }
    }
    const args = [
      "publish",
      path.join(outputDirectory, artifact.filename),
      "--access=public",
      `--tag=${tag}`,
      `--registry=${releaseConfig.registry}`,
    ];
    if (options.dryRun) args.push("--dry-run");
    if (options.provenance) args.push("--provenance");
    console.log(
      `${options.dryRun ? "Dry-running" : "Publishing"} ${artifact.name}@${version} with tag ${tag}...`,
    );
    run("npm", args);
  }
}

function printStatus(releaseConfig, version) {
  for (const entry of releaseConfig.packages) {
    const integrity = getPublishedIntegrity(entry.name, version, releaseConfig.registry);
    console.log(`${integrity ? "published" : "missing"}\t${entry.name}@${version}`);
  }
}

function usage(exitCode = 1) {
  const message = `Usage:
  node scripts/npm-package-release.mjs validate [--expected-version <version>]
  node scripts/npm-package-release.mjs build [--expected-version <version>]
  node scripts/npm-package-release.mjs pack [--expected-version <version>] [--artifact-dir <path>] [--skip-build]
  node scripts/npm-package-release.mjs status [--expected-version <version>]
  node scripts/npm-package-release.mjs publish [--expected-version <version>] [--artifact-dir <path>] [--dry-run] [--provenance] [--confirm <version>]
`;
  (exitCode === 0 ? process.stdout : process.stderr).write(message);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    action: argv[0] ?? "",
    expectedVersion: "",
    artifactDirectory: "",
    confirm: "",
    dryRun: false,
    provenance: false,
    skipBuild: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--expected-version") {
      args.expectedVersion = argv[++index] ?? "";
    } else if (arg === "--artifact-dir") {
      args.artifactDirectory = argv[++index] ?? "";
    } else if (arg === "--confirm") {
      args.confirm = argv[++index] ?? "";
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--provenance") {
      args.provenance = true;
    } else if (arg === "--skip-build") {
      args.skipBuild = true;
    } else if (arg === "--help" || arg === "-h") {
      usage(0);
    } else {
      usage(1);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!["validate", "build", "pack", "status", "publish"].includes(args.action)) usage(1);

  const { rootVersion, releaseConfig } = assertValidReleaseState(ROOT_DIR);
  if (args.expectedVersion && args.expectedVersion !== rootVersion) {
    throw new Error(
      `Expected release version ${args.expectedVersion}, but package.json is ${rootVersion}.`,
    );
  }

  if (args.action === "validate") {
    console.log(
      `Validated ${releaseConfig.packages.length} npm packages at ${rootVersion} in dependency order.`,
    );
  } else if (args.action === "build") {
    buildPackages(releaseConfig);
  } else if (args.action === "pack") {
    packPackages(ROOT_DIR, releaseConfig, rootVersion, {
      artifactDirectory: args.artifactDirectory || undefined,
      skipBuild: args.skipBuild,
    });
  } else if (args.action === "status") {
    printStatus(releaseConfig, rootVersion);
  } else if (args.action === "publish") {
    publishPackages(ROOT_DIR, releaseConfig, rootVersion, {
      artifactDirectory: args.artifactDirectory || undefined,
      confirm: args.confirm,
      dryRun: args.dryRun,
      provenance: args.provenance,
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
