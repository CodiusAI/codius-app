import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const codiusRelease = readFileSync(".github/workflows/codius-release.yml", "utf8");
const desktopRelease = readFileSync(".github/workflows/desktop-release.yml", "utf8");
const androidRelease = readFileSync(".github/workflows/android-apk-release.yml", "utf8");

test("tag releases have one canonical desktop asset publisher", () => {
  assert.match(
    codiusRelease,
    /if \[\[ "\$GITHUB_EVENT_NAME" == "push" \]\]; then\s+echo "Desktop Release owns canonical v\* release assets;/,
  );
  assert.match(
    codiusRelease,
    /find release-assets -type f -print0 \| xargs -0 gh release upload/,
    "manual Release Codius runs should retain their explicit publication path",
  );
});

test("the canonical desktop workflow creates useful release notes", () => {
  assert.match(desktopRelease, /gh release create[\s\S]*--generate-notes/);
  assert.doesNotMatch(desktopRelease, /--notes ""/);
});

test("the Android workflow does not race-create an empty release", () => {
  assert.doesNotMatch(androidRelease, /^\s*push:/m);
  assert.match(androidRelease, /^\s*workflow_dispatch:/m);
  assert.match(androidRelease, /release create[\s\S]*--generate-notes/);
  assert.doesNotMatch(androidRelease, /--notes ""/);
});

test("desktop signing gate fails closed only when signing is enabled", () => {
  // The credential gate is armed by the DESKTOP_SIGNING_ENABLED repo variable;
  // without it, desktop releases build unsigned (current practice — Gatekeeper
  // warning on first open) until signing credentials are provisioned.
  assert.match(desktopRelease, /vars\.DESKTOP_SIGNING_ENABLED == 'true'/);
  assert.match(desktopRelease, /DESKTOP_SIGNING_ENABLED is true but credentials are missing/);
  assert.match(
    desktopRelease,
    /DESKTOP_SIGNING_ENABLED is not set — this release ships an UNSIGNED macOS build/,
  );
  assert.match(
    desktopRelease,
    /DESKTOP_SIGNING_ENABLED is not set — this release ships an UNSIGNED Windows build/,
  );
  assert.match(desktopRelease, /secrets\.CODIUS_CSC_LINK/);
  assert.match(desktopRelease, /secrets\.CODIUS_WINDOWS_CSC_LINK/);
  assert.match(codiusRelease, /vars\.DESKTOP_SIGNING_ENABLED != 'true'/);
  assert.match(codiusRelease, /Missing required macOS signing\/notarization credentials/);
  assert.match(codiusRelease, /Missing required Windows signing credentials/);
});
