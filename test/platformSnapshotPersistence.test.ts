import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { loadOrArchiveIncompatibleSnapshot, loadPlatformSnapshotFile } from "../src/data/platformSnapshotFile";
import { snapshot } from "../src/data/mockData";

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

test("snapshot loading rejects parseable JSON missing a required collection", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-incomplete-snapshot-"));
  const snapshotPath = join(directory, "platform-snapshot.json");

  try {
    writeFileSync(snapshotPath, JSON.stringify({ seasons: [], projects: [], members: [], tasks: [] }), "utf8");
    assert.throws(
      () => loadPlatformSnapshotFile(snapshotPath),
      /incompatible with supported schema/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("incompatible snapshots are archived unchanged and startup can reseed", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-incompatible-snapshot-"));
  const snapshotPath = join(directory, "platform-snapshot.json");
  const original = JSON.stringify({
    snapshotSchemaVersion: 0,
    tasks: [{ id: "legacy-task", targetMilestoneId: "legacy-milestone" }],
  });
  writeFileSync(snapshotPath, original, "utf8");
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (message: string) => messages.push(message);

  try {
    assert.equal(loadOrArchiveIncompatibleSnapshot(snapshotPath), null);
    assert.equal(existsSync(snapshotPath), false);
    const archive = readdirSync(directory).find((name) => name.includes("incompatible-v0"));
    assert.ok(archive);
    assert.equal(readFileSync(join(directory, archive), "utf8"), original);
    assert.match(messages[0] ?? "", /schema 0.*Archived unchanged.*clean canonical seed/);
  } finally {
    console.error = originalError;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("current schema snapshots load without rewriting and reset archives the configured file", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-current-snapshot-"));
  const snapshotPath = join(directory, "platform-snapshot.json");
  const contents = `${JSON.stringify(snapshot)}\n`;
  writeFileSync(snapshotPath, contents, "utf8");

  try {
    assert.equal(loadPlatformSnapshotFile(snapshotPath)?.snapshotSchemaVersion, 1);
    assert.equal(readFileSync(snapshotPath, "utf8"), contents);
    const { archivePlatformSnapshotFile } = await import("../src/data/platformSnapshotFile");
    const archive = archivePlatformSnapshotFile(snapshotPath);
    assert.ok(archive);
    assert.equal(readFileSync(archive, "utf8"), contents);
    assert.equal(existsSync(snapshotPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("snapshot member schema rejects removed class grouping fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-member-schema-"));
  const snapshotPath = join(directory, "platform-snapshot.json");
  const legacy = structuredClone(snapshot) as typeof snapshot & { members: Array<typeof snapshot.members[number] & { classYear?: string }> };
  legacy.members[0]!.classYear = "junior";
  writeFileSync(snapshotPath, JSON.stringify(legacy), "utf8");
  try {
    assert.throws(() => loadPlatformSnapshotFile(snapshotPath), /does not match schema/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("snapshot:reset archives the configured snapshot and is safe when it is absent", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-reset-command-"));
  const snapshotPath = join(directory, "custom-snapshot.json");
  const original = `${JSON.stringify(snapshot)}\n`;
  const runReset = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/snapshot-reset.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PLATFORM_SNAPSHOT_PATH: snapshotPath },
  });

  try {
    writeFileSync(snapshotPath, original, "utf8");
    const first = runReset();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(existsSync(snapshotPath), false);
    const archive = readdirSync(directory).find((name) => name.startsWith("custom-snapshot.json.reset-"));
    assert.ok(archive);
    assert.equal(readFileSync(join(directory, archive), "utf8"), original);
    const second = runReset();
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /No platform snapshot exists/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production platform state survives a fresh process", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-snapshot-"));
  const snapshotPath = join(directory, "platform-snapshot.json");

  try {
    runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      const initial = store.getSnapshot();
      if (initial.projects.length !== 6 || initial.tasks.length < 35) throw new Error("Fresh process did not bootstrap the restored demo scenario");
      const transaction = await store.acquireSnapshotMutation();
      transaction.enter();
      const operationsProject = initial.projects.find(project => project.projectType === "operations");
      if (!operationsProject) throw new Error("Canonical Operations project is missing");
      store.updateProject(operationsProject.id, { description: "Persists across process restarts" });
      const subsystem = store.getSnapshot().subsystems[0];
      store.updateSubsystem(subsystem.id, { layoutX: 0.25, layoutY: 0.75, layoutZone: "front", layoutView: "top", sortOrder: 7 });
      const source = store.getSnapshot();
      store.createWorkLog({ taskId: source.tasks[0].id, date: "2026-09-09", hours: 1.25, participantIds: [source.members[0].id], notes: "Durable hours" });
      store.createQaReport({ projectId: source.tasks[0].projectId, targetRefs: [{ kind: "task", id: source.tasks[0].id }], participantIds: [source.members[0].id], result: "pass", notes: "Persistent report", reviewedAt: "2026-09-08T00:00:00.000Z" });
      store.createRisk({
        projectId: store.getTasks()[0].projectId, title: "Durable issue category",
        detail: "A blocking risk survives restart.", category: "dependency", severity: "high",
        status: "open", blocksWork: true, source: { kind: "manual" },
        relatedTargets: [{ kind: "task", id: store.getTasks()[0].id }],
        mitigationTaskId: null, ownerGroupId: null,
      });
      await transaction.commit();
      transaction.release();
      process.exit(0);
    `);

    assert.doesNotThrow(() => loadPlatformSnapshotFile(snapshotPath));

    const loadedProjectName = runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      process.stdout.write(store.getProjects().find((item) => item.projectType === "operations")?.description ?? "");
      process.exit(0);
    `);

    assert.equal(loadedProjectName, "Persists across process restarts");
    const loadedIssue = runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts");
      const store = imported.default ?? imported;
      const risk = store.getRisks().find((item) => item.title === "Durable issue category");
      process.stdout.write(JSON.stringify([risk.category, risk.blocksWork, risk.source.kind]));
      process.exit(0);
    `);
    assert.deepEqual(JSON.parse(loadedIssue), ["dependency", true, "manual"]);
    const persisted = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const restored = JSON.parse(runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const snapshot = store.getSnapshot();
      const report = snapshot.qaReports.find((item) => item.notes === "Persistent report");
      process.stdout.write(JSON.stringify({ task: snapshot.tasks[0], hours: snapshot.workLogs.filter((log) => log.taskId === snapshot.tasks[0].id).reduce((sum, log) => sum + log.hours, 0), layout: snapshot.subsystems[0], report, risks: snapshot.risks }));
    `));
    assert.equal(restored.task.actualHours, restored.hours);
    assert.ok(persisted.workLogs.some((log: { notes: string }) => log.notes === "Durable hours"));
    assert.equal(restored.layout.layoutX, 0.25); assert.equal(restored.layout.layoutY, 0.75);
    assert.equal(restored.layout.layoutZone, "front"); assert.equal(restored.layout.layoutView, "top"); assert.equal(restored.layout.sortOrder, 7);
    assert.equal("targetRiskId" in restored.report, false);
    assert.equal("proposedRiskStatus" in restored.report, false);
    assert.equal(restored.risks.find((risk: { title: string }) => risk.title === "Durable issue category").severity, "high");
    assert.equal(restored.report.id, persisted.qaReports.find((item: {notes: string}) => item.notes === "Persistent report").id);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed production persistence does not publish staged state", () => {
  const impossiblePath = "/dev/null/platform-snapshot.json";
  const result = runProductionStoreScript(impossiblePath, `
    const imported = await import("./src/data/store.ts");
    const store = imported.default ?? imported;
    const transaction = await store.acquireSnapshotMutation();
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

test("production startup archives a corrupt durable snapshot and reseeds", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-platform-corrupt-snapshot-"));
  const snapshotPath = join(directory, "platform-snapshot.json");

  try {
    writeFileSync(snapshotPath, "{not-json}\n", "utf8");
    const seeded = JSON.parse(runProductionStoreScript(snapshotPath, `const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported; process.stdout.write(JSON.stringify(store.getSnapshot()));`));
    assert.equal(seeded.projects.length, 6);
    assert.equal(existsSync(snapshotPath), false);
    const archives = readdirSync(directory).filter((name) => name.includes("incompatible-vunknown"));
    assert.equal(archives.length, 1);
    assert.equal(readFileSync(join(directory, archives[0]!), "utf8"), "{not-json}\n");
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
    const transaction = await store.acquireSnapshotMutation(); transaction.enter();
    const source = store.getSnapshot(); const task = source.tasks[0];
    store.updateTask(task.id, { status: "in-progress" });
    const qaRequest = store.createQaRequest({ projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], subject: task.title, mentorId: source.members.find(member => member.role === "mentor").id });
    const result = store.submitQaReport({ reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }, { kind: "qa-request", id: qaRequest.id }], createdByMemberId: source.members[0].id, participantIds: [source.members[0].id], mentorId: source.members[0].id, requestedById: null, result: "iteration-worthy", status: "submitted", reviewedById: null, notes: "Durable QA", evidenceNotes: "Broken lead", followUpTaskTitle: "Durable repair", reviewedAt: new Date().toISOString() });
    if (result.error) throw new Error(result.error);
    if (!store.getSnapshot().qaReports.some(item => item.notes === "Durable QA")) throw new Error("QA report was not staged");
    let failed = false;
    try { await transaction.commit(); } catch { failed = true; } finally { transaction.release(); }
    if (failed && JSON.stringify(store.getSnapshot()) !== before) throw new Error("Partial QA effects published");
    process.stdout.write(failed ? "rolled-back" : "saved");
  `;
  try {
    assert.equal(runProductionStoreScript(path, submit), "saved");
    assert.doesNotThrow(() => loadPlatformSnapshotFile(path));
    const restored = JSON.parse(runProductionStoreScript(path, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const snapshot = store.getSnapshot();
      const report = snapshot.qaReports.find(item => item.notes === "Durable QA");
      process.stdout.write(JSON.stringify({ report, allReports: snapshot.qaReports, followup: snapshot.tasks.find(item => item.title === "Durable repair"), risks: snapshot.risks.filter(item => item.source.kind === "report" && item.source.id === report?.id), requests: snapshot.qaRequests.filter(item => report && item.targetRefs.some(ref => report.targetRefs.some(target => target.kind === ref.kind && target.id === ref.id))) }));
    `));
    assert.ok(restored.report, JSON.stringify(restored));
    assert.equal(restored.report.evidenceNotes, "Broken lead");
    assert.equal(restored.followup.status, "not-started");
    assert.ok(restored.risks.length > 0);
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

      const transaction = await store.acquireSnapshotMutation();
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

      const rejected = await store.acquireSnapshotMutation();
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
      name: "Durable acquisition", revision: "A", type: "custom", defaultAcquisitionMethod: "purchase-cots",
      acquisition: { method: "purchase-cots", subsystemId: subsystem.id, workTypeId: "robot:planning", ownerId: "ava", mentorId: "marco", dueDate: "2026-10-01" },
    }), "priya");
    assert.ok(!prepared.error);
    const transaction = await store.acquireSnapshotMutation(); transaction.enter();
    const result = store.createPartDefinitionWithAcquisition(prepared.definition, prepared.plan, { actorMemberId: "marco", requestId: "atomic-proof" });
    assert.equal(transaction.hasChanges(), true);
    try {
      await transaction.commit(); transaction.release();
      process.stdout.write(JSON.stringify({ definitionId: result.item.id, acquisitionId: result.purchaseItem.id, taskId: result.task.id }));
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
    assert.equal(restored.task.id, restored.acquisition.taskId);
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
    const transaction = await store.acquireSnapshotMutation(); transaction.enter();
    const outputs = [];
    const report = store.getReports().find(item => item.reportType === "qa");
    assert.ok(report);
    for (const spawnedTaskId of [null, before.tasks[0].id]) {
      const result = store.createReportFinding({
        reportId: report.id, targetRefs: [{ kind: "part-instance", id: "pi-swerve-encoder-bracket-front-left" }, ...(spawnedTaskId ? [{ kind: "task", id: spawnedTaskId }] : [])], issueType: "Durable finding", severity: "medium",
        notes: "Preserved finding", spawnedTaskId, spawnedIterationId: null, spawnedRiskId: null,
      });
      assert.ok(result.targetRefs.some(ref => ref.kind === "part-instance"));
      assert.equal(result.spawnedTaskId, spawnedTaskId);
      outputs.push(result);
    }
    assert.notEqual(outputs[0].id, outputs[1].id);
    const draft = store.getSnapshot();
    assert.equal(store.createReportFinding({ reportId: "missing" }), null);
    assert.equal(store.getSnapshot(), draft);
    assert.equal(draft.actions.length - before.actions.length, 2);
    assert.ok(draft.actions.slice(before.actions.length).every(item => item.entityType === "report-finding" && item.operation === "create"));
    try {
      await transaction.commit(); transaction.release();
      process.stdout.write(JSON.stringify({ qa: draft.qaFindings.slice(before.qaFindings.length) }));
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
      }));
    `));
    assert.deepEqual(restored, created);
    assert.equal(runProductionStoreScript("/dev/null/findings.json", submit), "rolled-back");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("production tutorial commits and lifecycle changes stay off disk while global writes survive restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-tutorial-publication-"));
  const snapshotPath = join(directory, "snapshot.json");
  try {
    runProductionStoreScript(snapshotPath, `
      const { default: assert } = await import("node:assert/strict");
      const { existsSync, readFileSync } = await import("node:fs");
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const mutate = async (userKey, command) => {
        const transaction = await store.acquireSnapshotMutation(userKey);
        try { transaction.enter(); command(); await transaction.commit(); }
        finally { transaction.release(); }
      };
      const write = notes => {
        const snapshot = store.getSnapshot();
        store.createWorkLog({ taskId: snapshot.tasks[0].id, participantIds: [snapshot.members[0].id], date: "2026-09-26", hours: 1, notes });
      };
      await mutate("tutorial-user", () => store.startInteractiveTutorialSession("tutorial-user"));
      await mutate("tutorial-user", () => write("Memory-only tutorial work"));
      const tutorial = store.runWithInteractiveTutorialSession("tutorial-user", () => store.getSnapshot());
      assert.equal(tutorial.workLogs.filter(item => item.notes === "Memory-only tutorial work").length, 1);
      assert.equal(existsSync(process.env.PLATFORM_SNAPSHOT_PATH), false);
      await mutate(undefined, () => write("Durable global work"));
      const persisted = readFileSync(process.env.PLATFORM_SNAPSHOT_PATH, "utf8");
      assert.equal(persisted.includes("Memory-only tutorial work"), false);
      await mutate("tutorial-user", () => store.resetTutorialBaseline("tutorial-user"));
      await mutate("tutorial-user", () => store.resetInteractiveTutorialSession("tutorial-user"));
      assert.equal(readFileSync(process.env.PLATFORM_SNAPSHOT_PATH, "utf8"), persisted);
    `);
    const restored = JSON.parse(runProductionStoreScript(snapshotPath, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      process.stdout.write(JSON.stringify(store.getSnapshot().workLogs.map(item => item.notes)));
    `));
    assert.ok(restored.includes("Durable global work"));
    assert.ok(!restored.includes("Memory-only tutorial work"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("obsolete task snapshots are archived and startup restores canonical bootstrap", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-array-target-reset-"));
  const path = join(directory, "snapshot.json");
  const readSnapshot = `
    const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
    process.stdout.write(JSON.stringify(store.getSnapshot()));
  `;
  try {
    const snapshot = JSON.parse(runProductionStoreScript(path, readSnapshot));
    for (const obsolete of [
      { ...snapshot.tasks[0], subsystemId: snapshot.tasks[0].subsystemIds[0] },
    ]) {
      writeFileSync(path, JSON.stringify({ ...snapshot, tasks: [obsolete] }));
      const restored = JSON.parse(runProductionStoreScript(path, readSnapshot));
      assert.equal(restored.projects.length, 6);
      assert.equal(existsSync(path), false);
    }
    const restored = JSON.parse(runProductionStoreScript(path, readSnapshot));
    assert.deepEqual(restored.tasks.map((task: { id: string }) => task.id), snapshot.tasks.map((task: { id: string }) => task.id));
    assert.ok(restored.tasks.every((task: Record<string, unknown>) =>
      ["workstreamIds", "subsystemIds", "mechanismIds", "partInstanceIds"].every((field) =>
        Array.isArray(task[field]) && !(field.slice(0, -1) in task),
      ),
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production apps sharing a durable snapshot coordinate sequential and concurrent HTTP writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-shared-durable-owner-"));
  const path = join(directory, "snapshot.json");
  try {
    const taskIds = JSON.parse(runProductionStoreScript(path, `
      process.env.API_RATE_LIMIT_MAX_REQUESTS = "1000";
      const appModule = await import("./src/app.ts"); const { buildApp } = appModule.default ?? appModule;
      const mobileModule = await import("./test/helpers/mobileSessionMemoryStore.ts"); const { MobileSessionMemoryStore } = mobileModule.default ?? mobileModule;
      const webModule = await import("./test/helpers/webSessionMemoryStore.ts"); const { MemoryWebSessionStore } = webModule.default ?? webModule;
      const serviceModule = await import("./src/auth/mobileSessionService.ts"); const { MobileSessionService } = serviceModule.default ?? serviceModule;
      const storeModule = await import("./src/data/store.ts"); const store = storeModule.default ?? storeModule;
      const cadModule = await import("./src/cad/cadStore.ts"); const { createCadRuntimeStore } = cadModule.default ?? cadModule;
      const mobileSessionStore = new MobileSessionMemoryStore();
      const first = await buildApp({ mobileSessionStore, webSessionStore: new MemoryWebSessionStore(), cadStore: createCadRuntimeStore(), userPreferencesPath: ${JSON.stringify(join(directory, "first-preferences.json"))} });
      const second = await buildApp({ mobileSessionStore, webSessionStore: new MemoryWebSessionStore(), cadStore: createCadRuntimeStore(), userPreferencesPath: ${JSON.stringify(join(directory, "second-preferences.json"))} });
      first.log.level = "silent"; second.log.level = "silent";
      try {
        const snapshot = store.getSnapshot();
        const mentor = snapshot.members.find(member => member.role === "mentor");
        const session = await new MobileSessionService(mobileSessionStore).create({ accountId: mentor.id, authProvider: "email", email: mentor.email, name: mentor.name, picture: null, hostedDomain: "mecorobotics.org", role: "mentor", taskSubteamIds: [] }, "shared-owner-test", "Tests");
        const headers = { authorization: "Bearer " + session.token };
        const [a,b] = snapshot.tasks.slice(0, 2);
        const patch = async (app, id, payload) => {
          const response = await app.inject({ method: "PATCH", url: "/api/tasks/" + id, headers, payload });
          if (response.statusCode !== 200) throw new Error(response.body);
        };
        await patch(first, a.id, { title: "Sequential first app" });
        await patch(second, b.id, { title: "Sequential second app" });
        await Promise.all([patch(first, a.id, { summary: "Concurrent first app" }), patch(second, b.id, { summary: "Concurrent second app" })]);
        for (const app of [first, second]) {
          const response = await app.inject({ method: "GET", url: "/api/bootstrap", headers });
          const tasks = response.json().tasks;
          if (tasks.find(task => task.id === a.id)?.title !== "Sequential first app" || tasks.find(task => task.id === b.id)?.title !== "Sequential second app") throw new Error("An app lost a committed write");
        }
        process.stdout.write(JSON.stringify([a.id,b.id]));
      } finally { await first.close(); await second.close(); }
    `));
    const restored = JSON.parse(runProductionStoreScript(path, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      process.stdout.write(JSON.stringify(store.getSnapshot().tasks.filter(task => ${JSON.stringify(taskIds)}.includes(task.id))));
    `));
    assert.deepEqual(restored.map((task: { title: string }) => task.title), ["Sequential first app", "Sequential second app"]);
    assert.deepEqual(restored.map((task: { summary: string }) => task.summary), ["Concurrent first app", "Concurrent second app"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("task QA requests and their task transition survive restart or roll back as one durable command", () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-task-qa-request-"));
  const path = join(directory, "snapshot.json");
  const request = `
    const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
    const before = JSON.stringify(store.getSnapshot());
    const transaction = await store.acquireSnapshotMutation(); transaction.enter();
    const source = store.getSnapshot(); const task = source.tasks[0];
    store.updateTask(task.id, { status: "in-progress" });
    const input = { projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], subject: "Durable task QA request", mentorId: source.members.find(member => member.role === "mentor").id };
    const created = store.createQaRequest(input);
    const staged = store.getSnapshot();
    if (staged.tasks.find(record => record.id === task.id).status !== "waiting-for-qa") throw new Error("Task transition was not staged with request");
    let failed = false;
    try { await transaction.commit(); } catch { failed = true; } finally { transaction.release(); }
    if (failed) {
      if (JSON.stringify(store.getSnapshot()) !== before) throw new Error("Failed request published partial state");
      process.stdout.write("rolled-back");
    } else {
      const published = store.getSnapshot();
      const retry = await store.acquireSnapshotMutation(); retry.enter();
      const same = store.createQaRequest(input);
      if (same.id !== created.id || retry.hasChanges()) throw new Error("Retry created duplicate state");
      await retry.commit(); retry.release();
      if (store.getSnapshot() !== published) throw new Error("Retry republished state");
      process.stdout.write(JSON.stringify({ id: created.id, taskId: task.id, mentorId: created.mentorId }));
    }
  `;
  try {
    const saved = JSON.parse(runProductionStoreScript(path, request));
    const restored = JSON.parse(runProductionStoreScript(path, `
      const imported = await import("./src/data/store.ts"); const store = imported.default ?? imported;
      const snapshot = store.getSnapshot();
      process.stdout.write(JSON.stringify({ request: snapshot.qaRequests.find(record => record.id === ${JSON.stringify(saved.id)}), task: snapshot.tasks.find(record => record.id === ${JSON.stringify(saved.taskId)}) }));
    `));
    assert.equal(restored.request.mentorId, saved.mentorId);
    assert.equal(restored.task.mentorId, saved.mentorId);
    assert.equal(restored.task.status, "waiting-for-qa");
    assert.equal(runProductionStoreScript("/dev/null/task-qa-request.json", request), "rolled-back");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
