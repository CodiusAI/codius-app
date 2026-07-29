#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_POLICY_PATH = "config/downstream-boundary-policy.json";
const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", "dist", ".expo"]);
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mdx",
  ".mjs",
  ".nix",
  ".ps1",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function toPosix(value) {
  return value.split(sep).join("/");
}

function digestFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function walkFiles(root, relativeRoot) {
  const absoluteRoot = resolve(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const stat = statSync(absoluteRoot);
  if (stat.isFile()) return [toPosix(relative(root, absoluteRoot))];

  const files = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const absoluteEntry = join(absoluteRoot, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, toPosix(relative(root, absoluteEntry))));
    } else if (entry.isFile()) {
      files.push(toPosix(relative(root, absoluteEntry)));
    }
  }
  return files.sort();
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function fragmentPattern(fragment) {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?![A-Za-z0-9])`, "i");
}

export function buildBoundaryBaseline(root, policy) {
  const paths = new Set();
  for (const frozenRoot of policy.frozenRoots ?? []) {
    for (const path of walkFiles(root, frozenRoot)) paths.add(path);
  }
  for (const frozenFile of policy.frozenFiles ?? []) {
    if (existsSync(resolve(root, frozenFile))) paths.add(frozenFile);
  }

  return {
    version: 1,
    generatedFrom: "reviewed downstream migration state",
    files: Object.fromEntries(
      [...paths].sort().map((path) => [path, digestFile(resolve(root, path))]),
    ),
  };
}

function checkFrozenState(root, policy) {
  const baseline = readJson(root, policy.baseline);
  const currentPaths = new Set();
  for (const frozenRoot of policy.frozenRoots ?? []) {
    for (const path of walkFiles(root, frozenRoot)) currentPaths.add(path);
  }
  for (const frozenFile of policy.frozenFiles ?? []) {
    if (existsSync(resolve(root, frozenFile))) currentPaths.add(frozenFile);
  }

  const baselinePaths = new Set(Object.keys(baseline.files));
  const issues = [];

  for (const path of [...currentPaths].sort()) {
    if (!baselinePaths.has(path)) {
      issues.push({ code: "added-frozen-path", path });
      continue;
    }
    const actualDigest = digestFile(resolve(root, path));
    if (actualDigest !== baseline.files[path]) {
      issues.push({ code: "modified-frozen-path", path });
    }
  }
  for (const path of [...baselinePaths].sort()) {
    if (!currentPaths.has(path)) {
      issues.push({ code: "deleted-frozen-path", path });
    }
  }

  return issues;
}

function checkRetiredPaths(root, policy) {
  const issues = [];
  for (const retiredRoot of policy.retiredRoots ?? []) {
    for (const path of walkFiles(root, retiredRoot)) {
      issues.push({ code: "retired-path-restored", path });
    }
  }
  for (const retiredFile of policy.retiredFiles ?? []) {
    if (existsSync(resolve(root, retiredFile))) {
      issues.push({ code: "retired-path-restored", path: retiredFile });
    }
  }
  return issues;
}

function checkRetiredPackageEntries(root, policy) {
  const issues = [];
  const packageJsonPath = resolve(root, "package.json");
  if (!existsSync(packageJsonPath)) return issues;

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const workspaces = Array.isArray(packageJson.workspaces) ? packageJson.workspaces : [];
  for (const workspace of policy.forbiddenWorkspaceEntries ?? []) {
    if (workspaces.includes(workspace)) {
      issues.push({
        code: "retired-workspace-registered",
        path: `package.json#workspaces:${workspace}`,
      });
    }
  }
  for (const scriptName of policy.forbiddenScripts ?? []) {
    if (packageJson.scripts?.[scriptName]) {
      issues.push({
        code: "retired-script-restored",
        path: `package.json#scripts.${scriptName}`,
      });
    }
  }
  return issues;
}

function checkForbiddenText(root, policy) {
  const issues = [];
  const textPaths = walkFiles(root, ".").filter((path) => TEXT_EXTENSIONS.has(extname(path)));
  for (const rule of policy.forbiddenTextFragments ?? []) {
    const fragment = rule.parts.join("");
    const pattern = fragmentPattern(fragment);
    for (const path of textPaths) {
      const text = readFileSync(resolve(root, path), "utf8");
      const match = pattern.exec(text);
      if (!match || match.index === undefined) continue;
      const index = match.index;
      const line = text.slice(0, index).split("\n").length;
      issues.push({
        code: `forbidden-text-restored:${rule.id}`,
        path: `${path}:${line}`,
      });
    }
  }
  return issues;
}

function checkRetiredState(root, policy) {
  return [
    ...checkRetiredPaths(root, policy),
    ...checkRetiredPackageEntries(root, policy),
    ...checkForbiddenText(root, policy),
  ];
}

export function checkDownstreamBoundaries(root, policy) {
  if (policy.phase === "migration") return checkFrozenState(root, policy);
  if (policy.phase === "retired") return checkRetiredState(root, policy);
  return [{ code: "invalid-policy-phase", path: String(policy.phase) }];
}

export function formatBoundaryReport(policy, issues) {
  if (issues.length === 0) {
    return [
      `Downstream boundary check passed (${policy.phase}).`,
      policy.phase === "migration"
        ? "Legacy website and public docs match the reviewed frozen baseline."
        : "Retired website paths, deployment configuration, and workspace registrations remain absent.",
    ].join("\n");
  }

  return [
    `Downstream boundary check failed (${policy.phase}) with ${issues.length} issue(s):`,
    ...issues.map((issue) => `- ${issue.code}: ${issue.path}`),
    "",
    policy.phase === "migration"
      ? "Restore the reviewed downstream versions or complete the codius.ai migration and switch the policy to retired."
      : "Keep the downstream deletion. Remove restored website files/configuration before validation or push.",
  ].join("\n");
}

function parseArgs(argv) {
  return {
    writeBaseline: argv.includes("--write-baseline"),
    root: resolve(argv.find((arg) => arg.startsWith("--root="))?.slice(7) ?? DEFAULT_ROOT),
    policyPath: argv.find((arg) => arg.startsWith("--policy="))?.slice(9) ?? DEFAULT_POLICY_PATH,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const policy = readJson(args.root, args.policyPath);
  if (args.writeBaseline) {
    const baseline = buildBoundaryBaseline(args.root, policy);
    const outputPath = resolve(args.root, policy.baseline);
    writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote downstream boundary baseline: ${toPosix(relative(args.root, outputPath))}`);
    return;
  }

  const issues = checkDownstreamBoundaries(args.root, policy);
  console.log(formatBoundaryReport(policy, issues));
  if (issues.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
