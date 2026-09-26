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

test("production snapshots reject external mutation and retain only committed command values", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-snapshot-ownership-"));
  const snapshotPath = join(directory, "snapshot.json");
  try {
    const createdId = runProductionStoreScript(snapshotPath, `
      const { default: assert } = await import("node:assert/strict");
      const { readFileSync } = await import("node:fs");
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      const before = store.getSnapshot();
      assert.equal(Reflect.set(before, "members", []), false);
      assert.equal(Reflect.set(store.getTasks()[0], "title", "outside command"), false);
      assert.equal(Reflect.set(store.findSubsystem(before.subsystems[0].id), "name", "outside command"), false);
      assert.equal(Reflect.set(before.tasks[0].assigneeIds, "0", "outside command"), false);

      const transaction = await store.acquireGlobalSnapshotMutation();
      transaction.enter();
      assert.equal(Reflect.set(store.getMembers()[0], "name", "nested transaction write"), false);
      assert.equal(transaction.hasChanges(), false);
      const participantIds = [before.members[0].id];
      const workLog = store.createWorkLog({
        taskId: before.tasks[0].id, date: "2026-09-26", hours: 1.25,
        participantIds, notes: "Owned command values",
      });
      assert.equal(before.workLogs.some(item => item.id === workLog.id), false);
      assert.equal(transaction.hasChanges(), true);
      const heldDraft = store.getSnapshot();
      await transaction.commit();
      transaction.release();
      const persisted = readFileSync(process.env.PLATFORM_SNAPSHOT_PATH, "utf8");

      participantIds.push("unvalidated-member");
      workLog.hours = 99;
      assert.equal(Reflect.set(heldDraft.workLogs.find(item => item.id === workLog.id), "hours", 88), false);
      const saved = store.getSnapshot().workLogs.find(item => item.id === workLog.id);
      assert.equal(saved.hours, 1.25);
      assert.deepEqual(saved.participantIds, [before.members[0].id]);

      const rejected = await store.acquireGlobalSnapshotMutation();
      rejected.enter();
      const cyclic = {}; cyclic.self = cyclic;
      for (const value of [new Date(), new Map(), new Set(), NaN, Infinity, 1n, cyclic]) {
        assert.throws(() => store.recordAuditAction({
          operation: "update", entityType: "probe", entityId: "probe", detailsJson: { value },
        }), /plain JSON|cyclic/);
      }
      assert.equal(rejected.hasChanges(), false);
      await rejected.commit();
      rejected.release();
      assert.equal(readFileSync(process.env.PLATFORM_SNAPSHOT_PATH, "utf8"), persisted);
      process.stdout.write(workLog.id);
    `);
    const restored = JSON.parse(runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      process.stdout.write(JSON.stringify(store.getSnapshot().workLogs.find(item => item.id === ${JSON.stringify(createdId)})));
    `));
    assert.equal(restored.hours, 1.25);
    assert.equal(restored.participantIds.length, 1);
    assert.equal(restored.notes, "Owned command values");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("atomic acquisition persists all linked records or rolls back the entire durable commit", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-acquisition-persistence-"));
  const snapshotPath = join(directory, "snapshot.json");
  const submit = `
    const { default: assert } = await import("node:assert/strict");
    const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
    const helper = await import("./src/routes/helpers/partAcquisition.ts");
    const schemas = await import("./src/routes/routeSchemas.ts");
    const before = store.getSnapshot();
    const subsystem = before.subsystems.find(item => before.projects.some(project => project.id === item.projectId && project.projectType === "robot"));
    const prepared = (helper.default ?? helper).preparePartAcquisition((schemas.default ?? schemas).partDefinitionSchema.parse({
      name: "Durable acquisition", revision: "A", type: "custom", source: "Onshape",
      acquisition: { method: "purchase", subsystemId: subsystem.id, disciplineId: "design", ownerId: "ava", mentorId: "jordan", dueDate: "2026-10-01" },
    }), "priya");
    assert.ok(!prepared.error);
    const transaction = await store.acquireGlobalSnapshotMutation(); transaction.enter();
    const result = store.createPartDefinitionWithAcquisition(prepared.definition, prepared.plan, { actorMemberId: "priya", requestId: "atomic-proof" });
    assert.equal(transaction.hasChanges(), true);
    try {
      await transaction.commit(); transaction.release();
      process.stdout.write(JSON.stringify({ definitionId: result.item.id, acquisitionId: result.acquisitionItem.id, taskId: result.task.id }));
    } catch {
      transaction.release();
      assert.equal(store.getSnapshot(), before);
      process.stdout.write("rolled-back");
    }
  `;
  try {
    const ids = JSON.parse(runProductionStoreScript(snapshotPath, submit));
    const restored = JSON.parse(runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const snapshot = store.getSnapshot();
      process.stdout.write(JSON.stringify({
        definition: snapshot.partDefinitions.find(item => item.id === ${JSON.stringify(ids.definitionId)}),
        acquisition: snapshot.purchaseItems.find(item => item.id === ${JSON.stringify(ids.acquisitionId)}),
        task: snapshot.tasks.find(item => item.id === ${JSON.stringify(ids.taskId)}),
        audits: snapshot.actions.filter(item => item.requestId === "atomic-proof"),
      }));
    `));
    assert.equal(restored.acquisition.partDefinitionId, restored.definition.id);
    assert.deepEqual(restored.task.linkedPurchaseIds, [restored.acquisition.id]);
    assert.equal(restored.audits.length, 3);
    assert.equal(runProductionStoreScript("/dev/null/acquisition.json", submit), "rolled-back");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("QA and test findings preserve separate IDs, audits and durable transaction rollback", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-findings-persistence-"));
  const snapshotPath = join(directory, "snapshot.json");
  const submit = `
    const { default: assert } = await import("node:assert/strict");
    const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
    const before = store.getSnapshot();
    const transaction = await store.acquireGlobalSnapshotMutation(); transaction.enter();
    const outputs = [];
    for (const reportType of ["QA", "MilestoneTest"]) {
      const report = store.getReports().find(item => item.reportType === reportType);
      assert.ok(report);
      for (const spawnedTaskId of [null, before.tasks[0].id]) {
        const result = store.createReportFinding({
          reportId: report.id, mechanismId: null, partInstanceId: null,
          artifactInstanceId: null, issueType: "Durable finding", severity: "medium",
          notes: "Preserved finding", spawnedTaskId, spawnedIterationId: null, spawnedRiskId: null,
        });
        assert.equal(result.taskId, spawnedTaskId ?? report.taskId);
        assert.equal(Object.hasOwn(result, "milestoneId"), reportType !== "QA");
        if (reportType !== "QA") assert.equal(result.milestoneId, report.milestoneId);
        outputs.push(result);
      }
    }
    assert.equal(outputs[0].id, outputs[2].id);
    assert.equal(outputs[1].id, outputs[3].id);
    assert.notEqual(outputs[0].id, outputs[1].id);
    const draft = store.getSnapshot();
    assert.equal(store.createReportFinding({ reportId: "missing" }), null);
    assert.equal(store.getSnapshot(), draft);
    assert.equal(draft.actions.length - before.actions.length, 4);
    assert.ok(draft.actions.slice(before.actions.length).every(item => item.entityType === "report-finding" && item.operation === "create"));
    try {
      await transaction.commit(); transaction.release();
      process.stdout.write(JSON.stringify({ qa: draft.qaFindings.slice(before.qaFindings.length), test: draft.testFindings.slice(before.testFindings.length) }));
    } catch {
      transaction.release();
      assert.equal(store.getSnapshot(), before);
      process.stdout.write("rolled-back");
    }
  `;
  try {
    const created = JSON.parse(runProductionStoreScript(snapshotPath, submit));
    const restored = JSON.parse(runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const snapshot = store.getSnapshot();
      process.stdout.write(JSON.stringify({
        qa: snapshot.qaFindings.filter(item => item.title === "Durable finding"),
        test: snapshot.testFindings.filter(item => item.title === "Durable finding"),
      }));
    `));
    assert.deepEqual(restored, created);
    assert.equal(runProductionStoreScript("/dev/null/findings.json", submit), "rolled-back");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
