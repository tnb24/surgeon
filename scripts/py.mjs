// Run the Python interpreter of the project virtual environment on any OS.
// Usage: node scripts/py.mjs <python arguments>
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const python = join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
if (!existsSync(python)) {
  console.error(`No virtual environment at ${python}. See README.md, Install.`);
  process.exit(1);
}
const result = spawnSync(python, process.argv.slice(2), {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
