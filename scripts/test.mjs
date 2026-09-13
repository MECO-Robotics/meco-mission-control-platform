import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const files = readdirSync("test", { recursive: true })
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => join("test", file))
  .sort();
if (!files.length) throw new Error("No test files found.");
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...process.argv.slice(2), ...files], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
