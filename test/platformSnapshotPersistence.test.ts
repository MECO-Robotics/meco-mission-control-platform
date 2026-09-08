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
      const transaction = await store.acquireGlobalSnapshotMutation();
      transaction.enter();
      store.createProject({
          name: "Durable restart project",
          seasonId: "default-season",
          projectType: "operations",
          description: "Persists across process restarts",
          status: "active",
      });
      const subsystem = store.getSnapshot().subsystems[0];
      store.updateSubsystem(subsystem.id, { layoutX: 0.25, layoutY: 0.75, layoutZone: "front", layoutView: "top", sortOrder: 7 });
      const source = store.getSnapshot();
      store.createQaReport({ taskId: source.tasks[0].id, participantIds: [source.members[0].id], result: "pass", mentorApproved: true, notes: "Persistent proposal", reviewedAt: "2026-09-08", targetRiskId: source.risks[0].id, proposedRiskSeverity: "low", proposedRiskStatus: "full-mitigation" });
      store.createTaskBlocker({
        blockedTaskId: store.getTasks()[0].id,
        blockerType: "external", blockerId: null, issueType: "broken-part",
        description: "Durable issue category", severity: "high",
      });
      await transaction.commit();
      transaction.release();
      process.exit(0);
    `);

    const loadedProjectName = runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      process.stdout.write(store.getProjects().find((item) => item.name === "Durable restart project")?.name ?? "");
      process.exit(0);
    `);

    assert.equal(loadedProjectName, "Durable restart project");
    const loadedIssue = runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      const blocker = store.getTaskBlockers().find((item) => item.description === "Durable issue category");
      process.stdout.write(JSON.stringify([blocker.issueType, blocker.blockerType, blocker.blockerId]));
      process.exit(0);
    `);
    assert.deepEqual(JSON.parse(loadedIssue), ["broken-part", "external", null]);
    const persisted = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const restored = JSON.parse(runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const snapshot = store.getSnapshot();
      const report = snapshot.qaReports.find((item) => item.notes === "Persistent proposal");
      process.stdout.write(JSON.stringify({ layout: snapshot.subsystems[0], report, risk: snapshot.risks.find((risk) => risk.id === report.targetRiskId) }));
    `));
    assert.equal(restored.layout.layoutX, 0.25); assert.equal(restored.layout.layoutY, 0.75);
    assert.equal(restored.layout.layoutZone, "front"); assert.equal(restored.layout.layoutView, "top"); assert.equal(restored.layout.sortOrder, 7);
    assert.equal(restored.report.proposedRiskStatus, "full-mitigation"); assert.equal(restored.risk.severity, "low");
    assert.equal(restored.report.id, persisted.qaReports.find((item: {notes: string}) => item.notes === "Persistent proposal").id);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed production persistence does not publish staged state", () => {
  const impossiblePath = "/dev/null/platform-snapshot.json";
  const result = runProductionStoreScript(impossiblePath, `
    const imported = await import("./src/data/store.ts");
    const store = imported.default ?? imported;
    const transaction = await store.acquireGlobalSnapshotMutation();
    transaction.enter();
    store.createProject({
        name: "Rejected durable project",
        seasonId: "default-season",
        projectType: "operations",
        description: "Must not reach global memory",
        status: "active",
    });
    try {
      await transaction.commit();
    } catch {
      // Expected persistence failure.
    } finally {
      transaction.release();
    }
    process.stdout.write(store.getProjects().some((item) => item.name === "Rejected durable project") ? "published" : "not-published");
    process.exit(0);
  `);
  assert.equal(result, "not-published");
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
