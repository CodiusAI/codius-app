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
    from: '`Paseo-${devWorktreeName}`',
    to: '`Codius-${devWorktreeName}`',
  },
];

let source = await readFile(mainFile, "utf8");
for (const replacement of replacements) {
  if (!source.includes(replacement.from)) {
    throw new Error(
      `Unable to apply Codius branding for ${replacement.name}; expected emitted source was not found in ${mainFile}`,
    );
  }
  source = source.replace(replacement.from, replacement.to);
}

await writeFile(mainFile, source, "utf8");
console.log("Applied Codius Electron runtime identity");
