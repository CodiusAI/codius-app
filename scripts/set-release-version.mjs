import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertReleaseTagUnused,
  computeAvailableReleaseVersion,
  parseRemoteTagRefs,
} from "./release-version-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const rootPackagePath = path.join(rootDir, "package.json");

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
    timeout: 15_000,
    ...options,
  }).trim();
}

function readLocalTags() {
  const output = runGit(["tag", "--list", "v*"]);
  return output ? output.split(/\r?\n/).map((tag) => tag.trim()) : [];
}

function readRemoteTags() {
  try {
    return parseRemoteTagRefs(runGit(["ls-remote", "--tags", "origin"]));
  } catch (error) {
    throw new Error(
      "Unable to inspect release tags on origin. Refusing to run npm version without a remote tag preflight.",
      { cause: error },
    );
  }
}

function readLocalTagCommit(tag) {
  try {
    return runGit(["rev-list", "-n", "1", tag]);
  } catch (error) {
    throw new Error(
      `Unable to resolve existing local release tag ${tag}. Refusing to run npm version.`,
      { cause: error },
    );
  }
}

function usageAndExit(code = 1) {
  process.stderr.write(`Usage: node scripts/set-release-version.mjs --mode <mode> [--print]\n`);
  process.stderr.write(
    "Modes: patch, minor, major, beta-patch, beta-minor, beta-major, beta-next, promote\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    mode: "",
    print: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") {
      args.mode = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--print") {
      args.print = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usageAndExit(0);
    }
    usageAndExit();
  }

  if (!args.mode) {
    usageAndExit();
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8"));
const currentVersion = typeof rootPackage.version === "string" ? rootPackage.version.trim() : "";

if (!currentVersion) {
  throw new Error('Root package.json must contain a valid "version".');
}

const localTags = readLocalTags();
const remoteTags = readRemoteTags();
const nextVersion = computeAvailableReleaseVersion(currentVersion, args.mode, [
  ...localTags,
  ...remoteTags.keys(),
]);
const nextTag = `v${nextVersion}`;
const headCommit = runGit(["rev-parse", "HEAD"]);

assertReleaseTagUnused({
  tag: nextTag,
  headCommit,
  localTagCommit: localTags.includes(nextTag) ? readLocalTagCommit(nextTag) : "",
  remoteTagCommit: remoteTags.get(nextTag) ?? "",
});

if (args.print) {
  process.stdout.write(`${nextVersion}\n`);
  process.exit(0);
}

execFileSync(
  "npm",
  ["version", nextVersion, "--include-workspace-root", "--message", "chore(release): cut %s"],
  { cwd: rootDir, stdio: "inherit" },
);
