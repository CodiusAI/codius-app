import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildBoundaryBaseline,
  checkDownstreamBoundaries,
} from "./check-downstream-boundaries.mjs";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "codius-boundary-"));
  mkdirSync(join(root, "packages/website"), { recursive: true });
  mkdirSync(join(root, "packages/server"), { recursive: true });
  mkdirSync(join(root, "public-docs"), { recursive: true });
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "packages/website/index.ts"), "legacy website\n");
  writeFileSync(join(root, "public-docs/index.md"), "# Codius App\n");
  writeFileSync(join(root, ".github/workflows/deploy-website.yml"), "name: legacy\n");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      workspaces: ["packages/server", "packages/website"],
      scripts: { "dev:website": "example" },
    }),
  );
  const policy = {
    phase: "migration",
    baseline: "config/baseline.json",
    frozenRoots: ["packages/website", "public-docs"],
    frozenFiles: [".github/workflows/deploy-website.yml"],
    retiredRoots: ["packages/website", "public-docs"],
    retiredFiles: [".github/workflows/deploy-website.yml"],
    forbiddenWorkspaceEntries: ["packages/website"],
    forbiddenScripts: ["dev:website"],
  };
  const baseline = buildBoundaryBaseline(root, policy);
  writeFileSync(join(root, policy.baseline), JSON.stringify(baseline));
  return {
    root,
    policy,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("migration guard detects an upstream modification to a frozen website file", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.root, "packages/website/index.ts"), "upstream rewrite\n");
    assert.deepEqual(checkDownstreamBoundaries(fixture.root, fixture.policy), [
      { code: "modified-frozen-path", path: "packages/website/index.ts" },
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("migration guard detects new website files", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.root, "packages/website/new-campaign.tsx"), "upstream campaign\n");
    assert.deepEqual(checkDownstreamBoundaries(fixture.root, fixture.policy), [
      { code: "added-frozen-path", path: "packages/website/new-campaign.tsx" },
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("mixed product and website changes only report the excluded website boundary", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.root, "packages/server/product.ts"), "valid product change\n");
    writeFileSync(join(fixture.root, "packages/website/index.ts"), "excluded website change\n");
    assert.deepEqual(checkDownstreamBoundaries(fixture.root, fixture.policy), [
      { code: "modified-frozen-path", path: "packages/website/index.ts" },
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("retired guard rejects restored paths and registrations", () => {
  const fixture = createFixture();
  try {
    const policy = { ...fixture.policy, phase: "retired" };
    const issues = checkDownstreamBoundaries(fixture.root, policy);
    assert(issues.some((issue) => issue.code === "retired-path-restored"));
    assert(
      issues.some(
        (issue) =>
          issue.code === "retired-workspace-registered" &&
          issue.path === "package.json#workspaces:packages/website",
      ),
    );
    assert(
      issues.some(
        (issue) =>
          issue.code === "retired-script-restored" &&
          issue.path === "package.json#scripts.dev:website",
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

test("harmless upstream attribution outside public website boundaries is accepted", () => {
  const fixture = createFixture();
  try {
    writeFileSync(
      join(fixture.root, "THIRD_PARTY_NOTICES.md"),
      "This downstream retains required upstream attribution.\n",
    );
    assert.deepEqual(checkDownstreamBoundaries(fixture.root, fixture.policy), []);
  } finally {
    fixture.cleanup();
  }
});

test("retired guard allows the supported Codius CLI product name", () => {
  const fixture = createFixture();
  try {
    const policy = {
      phase: "retired",
      retiredRoots: [],
      retiredFiles: [],
      forbiddenWorkspaceEntries: [],
      forbiddenScripts: [],
      forbiddenTextFragments: [
        {
          id: "retired-control-command",
          parts: ["codius", "ctl"],
        },
      ],
    };
    writeFileSync(
      join(fixture.root, "packages/server/product.ts"),
      `export const label = "Codius ${String.fromCharCode(67, 76, 73)}";\n`,
    );
    assert.deepEqual(checkDownstreamBoundaries(fixture.root, policy), []);
  } finally {
    fixture.cleanup();
  }
});

test("retired guard rejects the removed controller command", () => {
  const fixture = createFixture();
  try {
    const policy = {
      phase: "retired",
      retiredRoots: [],
      retiredFiles: [],
      forbiddenWorkspaceEntries: [],
      forbiddenScripts: [],
      forbiddenTextFragments: [
        {
          id: "retired-control-command",
          parts: ["codius", "ctl"],
        },
      ],
    };
    writeFileSync(
      join(fixture.root, "packages/server/product.ts"),
      `export const command = "${["codius", "ctl"].join("")}";\n`,
    );
    assert.deepEqual(checkDownstreamBoundaries(fixture.root, policy), [
      {
        code: "forbidden-text-restored:retired-control-command",
        path: "packages/server/product.ts:1",
      },
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("retired guard scans packaging and shell configuration", () => {
  const fixture = createFixture();
  try {
    const policy = {
      phase: "retired",
      retiredRoots: [],
      retiredFiles: [],
      forbiddenWorkspaceEntries: [],
      forbiddenScripts: [],
      forbiddenTextFragments: [
        {
          id: "retired-control-workspace",
          parts: ["packages/", "control"],
        },
      ],
    };
    writeFileSync(
      join(fixture.root, "config.nix"),
      `src = ./${["packages", "control"].join("/")};\n`,
    );
    assert.deepEqual(checkDownstreamBoundaries(fixture.root, policy), [
      {
        code: "forbidden-text-restored:retired-control-workspace",
        path: "config.nix:1",
      },
    ]);
  } finally {
    fixture.cleanup();
  }
});
