import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (existsSync(".git") && existsSync(".githooks")) {
  const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
