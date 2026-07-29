import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReleaseTagUnused,
  computeAvailableReleaseVersion,
  computeNextReleaseVersion,
  getReleaseInfoFromSourceTag,
  parseReleaseVersion,
  parseRemoteTagRefs,
} from "./release-version-utils.mjs";

test("computes the next beta patch from a stable version", () => {
  assert.equal(computeNextReleaseVersion("0.1.59", "beta-patch"), "0.1.60-beta.1");
});

test("advances beta versions", () => {
  assert.equal(computeNextReleaseVersion("0.1.60-beta.1", "beta-next"), "0.1.60-beta.2");
});

test("advances beta-next to the first release tag unused locally and remotely", () => {
  assert.equal(
    computeAvailableReleaseVersion("0.2.0-beta.3", "beta-next", [
      "v0.2.0-beta.4",
      "refs/tags/v0.2.0-beta.5",
      "desktop-v0.2.0-beta.6",
      "v9.9.9",
    ]),
    "0.2.0-beta.6",
  );
});

test("does not silently skip occupied tags for non-beta-next modes", () => {
  assert.equal(
    computeAvailableReleaseVersion("0.1.59", "beta-patch", ["v0.1.60-beta.1"]),
    "0.1.60-beta.1",
  );
});

test("promotes beta versions to stable", () => {
  assert.equal(computeNextReleaseVersion("0.1.60-beta.2", "promote"), "0.1.60");
});

test("parses beta release metadata", () => {
  assert.deepEqual(parseReleaseVersion("0.1.60-beta.1"), {
    version: "0.1.60-beta.1",
    major: 0,
    minor: 1,
    patch: 60,
    prerelease: "beta.1",
    baseVersion: "0.1.60",
    isPrerelease: true,
    isBeta: true,
    betaNumber: 1,
  });
});

test("emits beta release info from tags", () => {
  assert.deepEqual(getReleaseInfoFromSourceTag("v0.1.60-beta.1"), {
    sourceTag: "v0.1.60-beta.1",
    releaseTag: "v0.1.60-beta.1",
    version: "0.1.60-beta.1",
    baseVersion: "0.1.60",
    prerelease: "beta.1",
    isPrerelease: true,
    isBeta: true,
    betaNumber: 1,
    releaseType: "prerelease",
    releaseChannel: "beta",
    isSmokeTag: false,
  });
});

test("rejects non-beta prerelease versions", () => {
  assert.throws(() => parseReleaseVersion("0.1.60-canary.1"), /Expected beta prerelease versions/);
});

test("parses lightweight and annotated remote tags to their commit targets", () => {
  assert.deepEqual(
    parseRemoteTagRefs(
      [
        "1111111111111111111111111111111111111111\trefs/tags/v0.2.0-beta.4",
        "2222222222222222222222222222222222222222\trefs/tags/v0.2.0-beta.5",
        "3333333333333333333333333333333333333333\trefs/tags/v0.2.0-beta.5^{}",
      ].join("\n"),
    ),
    new Map([
      ["v0.2.0-beta.4", "1111111111111111111111111111111111111111"],
      ["v0.2.0-beta.5", "3333333333333333333333333333333333333333"],
    ]),
  );
});

test("rejects malformed remote tag output instead of overlooking a collision", () => {
  assert.throws(() => parseRemoteTagRefs("not-a-git-ref"), /Unable to parse remote tag ref/);
});

test("allows an unused release tag", () => {
  assert.doesNotThrow(() =>
    assertReleaseTagUnused({
      tag: "v0.2.0-beta.5",
      headCommit: "aaaaaaaa",
    }),
  );
});

test("rejects a local release tag on another commit before version mutation", () => {
  assert.throws(
    () =>
      assertReleaseTagUnused({
        tag: "v0.2.0-beta.5",
        headCommit: "aaaaaaaa",
        localTagCommit: "bbbbbbbb",
      }),
    /local tag points to bbbbbbbb, not current HEAD aaaaaaaa.*unused before npm version/,
  );
});

test("rejects a remote release tag even when it already points to current HEAD", () => {
  assert.throws(
    () =>
      assertReleaseTagUnused({
        tag: "v0.2.0-beta.5",
        headCommit: "aaaaaaaa",
        remoteTagCommit: "aaaaaaaa",
      }),
    /origin tag already points to current HEAD aaaaaaaa.*unused before npm version/,
  );
});
