import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const mainFile = path.join(desktopDir, "dist", "main.js");

const replacements = [
  {
    name: "application protocol",
    from: 'const APP_SCHEME = "paseo";',
    to: 'const APP_SCHEME = "codius";',
  },
  {
    name: "application name",
    from: 'const APP_NAME = process.env.PASEO_TEST_APP_NAME?.trim() || "Paseo";',
    to: 'const APP_NAME = process.env.CODIUS_TEST_APP_NAME?.trim() || process.env.PASEO_TEST_APP_NAME?.trim() || "Codius Desktop";',
  },
  {
    name: "development worktree user-data prefix",
    from: "`Paseo-${devWorktreeName}`",
    to: "`Codius-${devWorktreeName}`",
  },
];

let source = await readFile(mainFile, "utf8");
let changed = false;
for (const replacement of replacements) {
  if (source.includes(replacement.from)) {
    source = source.replace(replacement.from, replacement.to);
    changed = true;
  } else if (source.includes(replacement.to)) {
    // Already branded. `tsc` builds incrementally, so a repeated `build:main`
    // can leave a previously branded dist/main.js in place without re-emitting
    // the upstream source. Re-running must therefore be a no-op, not a failure.
    continue;
  } else {
    throw new Error(
      `Unable to apply Codius branding for ${replacement.name}; neither the upstream nor the branded form was found in ${mainFile}`,
    );
  }
}

if (changed) {
  await writeFile(mainFile, source, "utf8");
  console.log("Applied Codius Electron runtime identity");
} else {
  console.log("Codius Electron runtime identity already applied; nothing to do");
}
