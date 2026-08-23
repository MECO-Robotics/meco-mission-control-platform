import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function runProductionStoreScript(snapshotPath: string, source: string) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", source],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public",
        CORS_ORIGIN: "https://mission-control.example.test",
        AUTH_JWT_SECRET: "production-test-secret-that-is-long-enough",
        AUTH_TOKEN_TTL: "1h",
        AUTH_EMAIL_SMTP_HOST: "smtp.example.test",
        AUTH_EMAIL_FROM: "noreply@example.test",
        PLATFORM_SNAPSHOT_PATH: snapshotPath,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("production platform state survives a fresh process", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-snapshot-"));
  const snapshotPath = join(directory, "platform-snapshot.json");

  try {
    runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      store.createProject({
        name: "Durable restart project",
        seasonId: "default-season",
        projectType: "operations",
        description: "Persists across process restarts",
        status: "active",
      });
    `);

    const loadedProjectName = runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      process.stdout.write(store.getProjects().find((item) => item.name === "Durable restart project")?.name ?? "");
    `);

    assert.equal(loadedProjectName, "Durable restart project");
    assert.doesNotThrow(() => JSON.parse(readFileSync(snapshotPath, "utf8")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production startup rejects a corrupt durable snapshot instead of reseeding", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-corrupt-snapshot-"));
  const snapshotPath = join(directory, "platform-snapshot.json");

  try {
    writeFileSync(snapshotPath, "{not-json}\n", "utf8");
    assert.throws(
      () => runProductionStoreScript(snapshotPath, `await import("./src/data/store.ts");`),
      /Platform snapshot .* could not be read/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
