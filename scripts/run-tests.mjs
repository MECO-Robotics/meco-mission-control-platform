import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(repoRoot, "test");

function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return discoverTests(entryPath);
    }

    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      return [path.relative(repoRoot, entryPath).split(path.sep).join(path.posix.sep)];
    }

    return [];
  });
}

const testFiles = discoverTests(testRoot).sort();

if (testFiles.length === 0) {
  console.error("No test files found under ./test.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { cwd: repoRoot, stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
