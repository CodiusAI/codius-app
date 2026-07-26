import { spawnSync } from "node:child_process";

process.env.CODIUS_SEED_DEFAULTS ??= "0";

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["tsx", "tests/run-all.ts", ...process.argv.slice(2)], {
  cwd: new URL("..", import.meta.url),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
