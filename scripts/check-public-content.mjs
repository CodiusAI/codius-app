#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
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
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".expo",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const PUBLIC_TARGETS = [
  "README.md",
  "docs",
  "packages/app/app.config.js",
  "packages/app/eas.json",
  "packages/app/maestro",
  "packages/desktop/electron-builder.yml",
];

const internalProviderPattern = new RegExp(
  `\\b${String.fromCharCode(114, 117, 110, 119, 97, 114, 101)}\\b`,
  "i",
);

export const publicPatterns = [
  {
    id: "stale-android-id",
    pattern: /\bsh\.codius(?:\.debug)?\b/i,
    message: "stale Android package identity",
  },
  {
    id: "personal-path",
    pattern: /(?:^|[\s("'`])(?:\/Users\/|[A-Z]:\\Users\\)[^\s"'`]+/im,
    message: "personal machine path",
  },
  {
    id: "upstream-commercial-service",
    pattern: /(?:opencode\.ai\/(?:zen|go)|\bOpenCode (?:Zen|Go)\b)/i,
    message: "upstream commercial-service branding",
  },
  {
    id: "testimonial-copy",
    pattern: /\b(?:testimonials?|what (?:developers|customers) (?:say|are saying))\b/i,
    message: "unreviewed testimonial language",
  },
];

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(child)));
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(child);
  }
  return files;
}

async function expandTarget(target) {
  const path = resolve(ROOT, target);
  if (TEXT_EXTENSIONS.has(extname(path))) return [path];
  return walk(path);
}

function issue(text, pattern, rule, message, file) {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return null;
  return {
    file,
    line: text.slice(0, match.index).split("\n").length,
    rule,
    message,
  };
}

export function scanPublicText(text, file = "fixture") {
  const issues = [];
  const internalIssue = issue(
    text,
    internalProviderPattern,
    "internal-provider",
    "internal provider name",
    file,
  );
  if (internalIssue) issues.push(internalIssue);
  for (const rule of publicPatterns) {
    const found = issue(text, rule.pattern, rule.id, rule.message, file);
    if (found) issues.push(found);
  }
  if (/\bpaseo\b/i.test(text) && file !== "README.md") {
    const found = issue(
      text,
      /\bpaseo\b/i,
      "paseo-brand",
      "stale Paseo branding outside the required README attribution",
      file,
    );
    if (found) issues.push(found);
  }
  return issues;
}

export async function scanPublicFiles(targets = PUBLIC_TARGETS) {
  const files = [
    ...new Set((await Promise.all(targets.map((target) => expandTarget(target)))).flat()),
  ];
  const issues = [];
  for (const file of files) {
    const relativePath = relative(ROOT, file);
    const text = await readFile(file, "utf8");
    issues.push(...scanPublicText(text, relativePath));
  }
  return issues;
}

export async function scanRepositoryForInternalProvider() {
  const files = await walk(ROOT);
  const issues = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const found = issue(
      text,
      internalProviderPattern,
      "internal-provider",
      "internal provider name",
      relative(ROOT, file),
    );
    if (found) issues.push(found);
  }
  return issues;
}

async function main() {
  const [publicIssues, repositoryIssues] = await Promise.all([
    scanPublicFiles(),
    scanRepositoryForInternalProvider(),
  ]);
  const issues = [
    ...publicIssues,
    ...repositoryIssues.filter(
      (candidate) =>
        !publicIssues.some(
          (existing) => existing.file === candidate.file && existing.rule === candidate.rule,
        ),
    ),
  ];
  if (issues.length > 0) {
    console.error("Forbidden public content detected:");
    for (const found of issues) {
      console.error(`- ${found.file}:${found.line} [${found.rule}] ${found.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Codius App public-content boundary check passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
