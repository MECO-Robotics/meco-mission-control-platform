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
      store.createWorkLog({ taskId: source.tasks[0].id, date: "2026-09-09", hours: 1.25, participantIds: [source.members[0].id], notes: "Durable hours" });
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
      process.stdout.write(JSON.stringify({ task: snapshot.tasks[0], hours: snapshot.workLogs.filter((log) => log.taskId === snapshot.tasks[0].id).reduce((sum, log) => sum + log.hours, 0), layout: snapshot.subsystems[0], report, risk: snapshot.risks.find((risk) => risk.id === report.targetRiskId) }));
    `));
    assert.equal(restored.task.actualHours, restored.hours);
    assert.ok(persisted.workLogs.some((log: { notes: string }) => log.notes === "Durable hours"));
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


test("QA workflow effects survive restart and roll back together when persistence fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-qa-durable-"));
  const path = join(directory, "snapshot.json");
  const submit = `
    const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
    const before = JSON.stringify(store.getSnapshot());
    const transaction = await store.acquireGlobalSnapshotMutation(); transaction.enter();
    const source = store.getSnapshot(); const task = source.tasks[0];
    store.createQaRequest({ taskId: task.id, subject: task.title, mentorId: source.members[0].id });
    const result = store.submitQaReport({ taskId: task.id, participantIds: [source.members[0].id], result: "iteration-worthy", mentorApproved: false, notes: "Durable QA", evidenceNotes: "Broken lead", followUpTaskTitle: "Durable repair", reviewedAt: "2026-09-09" });
    if (result.error) throw new Error(result.error);
    let failed = false;
    try { await transaction.commit(); } catch { failed = true; } finally { transaction.release(); }
    if (failed && JSON.stringify(store.getSnapshot()) !== before) throw new Error("Partial QA effects published");
    process.stdout.write(failed ? "rolled-back" : "saved");
  `;
  try {
    assert.equal(runProductionStoreScript(path, submit), "saved");
    const restored = JSON.parse(runProductionStoreScript(path, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const snapshot = store.getSnapshot();
      const report = snapshot.qaReports.find(item => item.notes === "Durable QA");
      process.stdout.write(JSON.stringify({ report, followup: snapshot.tasks.find(item => item.title === "Durable repair"), blockers: snapshot.taskBlockers.filter(item => item.blockedTaskId === report.taskId && item.issueType === "qa-failed"), requests: snapshot.qaRequests.filter(item => item.taskId === report.taskId) }));
    `));
    assert.equal(restored.report.evidenceNotes, "Broken lead");
    assert.equal(restored.followup.status, "not-started");
    assert.ok(restored.blockers.length > 0);
    assert.deepEqual(restored.requests, []);
    assert.equal(runProductionStoreScript("/dev/null/qa-snapshot.json", submit), "rolled-back");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("favorite destinations discard retired IDs and persist canonical IDs per user across restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-navigation-snapshot-"));
  const path = join(directory, "snapshot.json");
  try {
    runProductionStoreScript(path, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const transaction = await store.acquireGlobalSnapshotMutation(); transaction.enter();
      store.setFavoriteView("first@example.test", "work-tasks", true);
      store.setFavoriteView("second@example.test", "team-people", true);
      await transaction.commit(); transaction.release();
    `);
    const persisted = JSON.parse(readFileSync(path, "utf8"));
    persisted.favoriteViews.push({ id: "retired", userKey: "first@example.test", viewId: "tasks-board", createdAt: "2026-09-10T00:00:00Z" });
    writeFileSync(path, JSON.stringify(persisted));
    const readFavorites = `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      process.stdout.write(JSON.stringify([store.getFavoriteViews("first@example.test").map(item => item.viewId), store.getFavoriteViews("second@example.test").map(item => item.viewId), store.getFavoriteViews("third@example.test")]));
    `;
    assert.deepEqual(JSON.parse(runProductionStoreScript(path, readFavorites)), [["work-tasks"], ["team-people"], []]);
    runProductionStoreScript(path, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const transaction = await store.acquireGlobalSnapshotMutation(); transaction.enter();
      store.setFavoriteView("first@example.test", "work-schedule", true);
      await transaction.commit(); transaction.release();
    `);
    const restored = JSON.parse(runProductionStoreScript(path, readFavorites));
    assert.deepEqual(restored[0].sort(), ["work-schedule", "work-tasks"]);
    assert.deepEqual(restored.slice(1), [["team-people"], []]);
    assert.ok(JSON.parse(readFileSync(path, "utf8")).favoriteViews.every((item: { viewId: string }) => item.viewId !== "tasks-board"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
