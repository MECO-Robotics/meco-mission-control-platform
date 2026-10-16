import assert from "node:assert/strict";
import { test } from "node:test";
import { taskRecordTargetsSchema } from "../src/domain/taskTargets";
import { getSnapshot, resetStore, createPartInstance, createSubsystem, createWorkstream, updateTask, updateMechanism, removeMechanism, removeSubsystem, updateWorkstream } from "../src/data/store";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const targetFields = ["workstreamIds", "subsystemIds", "mechanismIds", "partInstanceIds"] as const;

test("task commands infer ordered ancestors, preserve omitted targets, and keep workstreams independent", async () => {
  await withIntegrationApp(async ({ app }) => {
    const controlsWorkstream = await app.inject({
      method: "POST",
      url: "/api/workstreams",
      payload: { projectId: "project-robot-2026", name: "Controls", description: "Test-local workstream." },
    });
    assert.equal(controlsWorkstream.statusCode, 201, controlsWorkstream.body);
    const payload = {
      title: "Array target task", summary: "Exercise ordered nested targets", workTypeId: "robot:design",
      partInstanceIds: ["pi-swerve-encoder-bracket-front-left", "pi-swerve-encoder-bracket-front-left"],
      scheduleRefs: [], ownerId: "ava", mentorId: "marco", dueDate: "2026-10-01",
      priority: "medium", status: "not-started", estimatedHours: 2,
    };
    const created = await app.inject({ method: "POST", url: "/api/tasks", payload });
    assert.equal(created.statusCode, 201, created.body);
    const task = created.json().item;
    assert.equal(task.projectId, "project-robot-2026");
    assert.deepEqual(task.partInstanceIds, ["pi-swerve-encoder-bracket-front-left"]);
    assert.deepEqual(task.mechanismIds, ["swerve-module"]);
    assert.deepEqual(task.subsystemIds, ["drive"]);
    assert.deepEqual(task.workstreamIds, []);
    for (const field of targetFields) assert.equal(field.slice(0, -1) in task, false);
    const url = `/api/tasks/${task.id}`;
    const patch = (body: object) => app.inject({ method: "PATCH", url, payload: body });
    const selected = await patch({ workstreamIds: [controlsWorkstream.json().item.id, "workstream-drive", controlsWorkstream.json().item.id] });
    assert.equal(selected.statusCode, 200, selected.body);
    assert.deepEqual(selected.json().item.workstreamIds, [controlsWorkstream.json().item.id, "workstream-drive"]);
    const renamed = await patch({ title: "Renamed array task" });
    assert.equal(renamed.statusCode, 200, renamed.body);
    for (const field of targetFields) assert.deepEqual(renamed.json().item[field], selected.json().item[field]);
    const cleared = await patch({ workstreamIds: [], mechanismIds: [], partInstanceIds: [] });
    assert.equal(cleared.statusCode, 200, cleared.body);
    assert.deepEqual(cleared.json().item.workstreamIds, []);
    assert.deepEqual(cleared.json().item.mechanismIds, []);
    assert.deepEqual(cleared.json().item.partInstanceIds, []);
    assert.deepEqual(cleared.json().item.subsystemIds, ["drive"]);
    for (const invalid of [{ subsystemId: "drive" }, { subsystemIds: [] }, { subsystemIds: ["missing"] }, { workstreamIds: null }]) {
      const before = getSnapshot();
      const rejected = await patch(invalid);
      assert.equal(rejected.statusCode, 400, rejected.body);
      assert.equal(getSnapshot(), before);
    }
    const list = (await app.inject({ method: "GET", url: "/api/tasks?pageSize=100" })).json();
    assert.ok(list.items.every((record: unknown) => taskRecordTargetsSchema.safeParse(record).success));
    const bootstrap = (await app.inject({ method: "GET", url: "/api/bootstrap" })).json();
    assert.ok(bootstrap.tasks.length > 0);
    assert.ok(bootstrap.tasks.every((record: unknown) => taskRecordTargetsSchema.safeParse(record).success));
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});

test("snapshot targets reject obsolete mirrors and missing arrays without replacing current state", () => {
  resetStore();
  const before = getSnapshot();
  for (const field of targetFields) {
    const missing = { ...before.tasks[0] };
    Reflect.deleteProperty(missing, field);
    const legacy = { ...before.tasks[0], [field.slice(0, -1)]: null };
    const duplicate = { ...before.tasks[0], [field]: ["duplicate", "duplicate"] };
    for (const invalid of [missing, legacy, duplicate]) {
      assert.equal(taskRecordTargetsSchema.safeParse(invalid).success, false);
      assert.throws(() => resetStore({ ...before, tasks: [invalid] }), /Unsupported task targets.*snapshot:reset/);
      assert.equal(getSnapshot(), before);
    }
  }
  resetStore({ ...before, tasks: [{ ...before.tasks[0], assigneeIds: [] }] });
  assert.equal(getSnapshot().tasks[0].ownerId, before.tasks[0].ownerId);
  assert.deepEqual(getSnapshot().tasks[0].assigneeIds, []);
});

test("first target owns serial and audit context while reparenting and deletion retain all selected targets", () => {
  resetStore();
  const controls = createSubsystem({
    projectId: "project-robot-2026", name: "Controls", description: "Test-local subsystem.",
    parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [],
  });
  const manipulator = createSubsystem({
    projectId: "project-robot-2026", name: "Manipulator", description: "Test-local subsystem.",
    parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [],
  });
  const snapshot = getSnapshot();
  const task = snapshot.tasks.find((candidate) => {
    const targetedReports = snapshot.qaReports.filter((report) => report.targetRefs.some((ref) => ref.kind === "task" && ref.id === candidate.id));
    const targetedReportIds = new Set(targetedReports.map((report) => report.id));
    return !snapshot.qaReports.some((report) => report.followUpTaskId === candidate.id) &&
      ![...snapshot.qaFindings, ...snapshot.testFindings].some((finding) => finding.correctiveTaskId === candidate.id) &&
      !snapshot.risks.some((risk) => risk.mitigationTaskId === candidate.id) &&
      !targetedReports.some((report) => report.followUpTaskId != null || report.followUpRiskId != null) &&
      ![...snapshot.qaFindings, ...snapshot.testFindings].some((finding) => finding.reportId != null && targetedReportIds.has(finding.reportId));
  });
  assert.ok(task, "fixture uses a task without corrective QA history");
  updateTask(task.id, { status: "in-progress" });
  const updated = updateTask(task.id, { subsystemIds: [controls.id, "drive"], mechanismIds: ["swerve-module"], partInstanceIds: [] });
  assert.ok(updated);
  assert.match(updated.serial ?? "", /^T-CO/);
  assert.equal(getSnapshot().actions?.at(-1)?.subsystemId, controls.id);
  resetStore({ ...getSnapshot(), tasks: getSnapshot().tasks.map((item) => item.id === task.id ? { ...item, completionScopeReviewOrder: undefined } : item) });
  resetStore({
    ...getSnapshot(),
    tasks: getSnapshot().tasks.map((item) => item.mechanismIds.includes("swerve-module") && item.status === "complete"
      ? { ...item, status: "in-progress" }
      : item),
  });
  updateMechanism("swerve-module", { subsystemId: manipulator.id });
  const reparented = getSnapshot().tasks.find((item) => item.id === task.id)!;
  assert.deepEqual(reparented.subsystemIds, [manipulator.id, controls.id]);
  assert.equal(typeof reparented.completionScopeReviewOrder, "number", "mechanism reparenting updates surviving task subsystem scope watermark");
  resetStore({ ...getSnapshot(), tasks: getSnapshot().tasks.map((item) => item.id === task.id ? { ...item, completionScopeReviewOrder: undefined } : item) });
  removeMechanism("swerve-module");
  const afterMechanismRemoval = getSnapshot().tasks.find((item) => item.id === task.id)!;
  assert.deepEqual(afterMechanismRemoval.mechanismIds, []);
  assert.equal(typeof afterMechanismRemoval.completionScopeReviewOrder, "number", "mechanism deletion updates surviving task target watermark");
  const workstream = createWorkstream({ projectId: task.projectId, name: "Scoped workstream", description: "Task target scope move fixture." });
  updateTask(task.id, { workstreamIds: [workstream.id] });
  resetStore({ ...getSnapshot(), tasks: getSnapshot().tasks.map((item) => item.id === task.id ? { ...item, completionScopeReviewOrder: undefined } : item) });
  updateWorkstream(workstream.id, { projectId: "project-media-2026" });
  assert.equal(typeof getSnapshot().tasks.find((item) => item.id === task.id)?.completionScopeReviewOrder, "number", "moving a linked workstream project invalidates task scope approval");
  const loosePart = createPartInstance({
    intendedSubsystemId: controls.id, intendedMechanismId: null,
    partDefinitionId: getSnapshot().partDefinitions[0].id, location: { kind: "stock", location: "Controls" },
  });
  const snapshotBeforeSubsystemRemoval = getSnapshot();
  const retainedTask = snapshotBeforeSubsystemRemoval.tasks.find((item) =>
    item.id !== task.id && item.projectId === task.projectId && !item.subsystemIds.includes(controls.id),
  );
  assert.ok(retainedTask);
  resetStore({
    ...snapshotBeforeSubsystemRemoval,
    purchaseItems: snapshotBeforeSubsystemRemoval.purchaseItems.map((item) =>
      item.taskId === task.id ? { ...item, taskId: retainedTask.id } : item,
    ),
  });
  removeSubsystem(controls.id);
  assert.equal(getSnapshot().partInstances.some((item) => item.id === loosePart.id), false);
  assert.equal(getSnapshot().tasks.some((item) => item.id === task.id), false);
});
