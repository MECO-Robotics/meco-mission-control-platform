import assert from "node:assert/strict";
import { test } from "node:test";
import { taskRecordTargetsSchema } from "../src/domain/taskTargets";
import { getSnapshot, resetStore, createPartInstance, createSubsystem, updateTask, updateMechanism, removeMechanism, removeSubsystem } from "../src/data/store";
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
      targetMilestoneId: null, ownerId: "ava", mentorId: "marco", dueDate: "2026-10-01",
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
    parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [], risks: [],
  });
  const manipulator = createSubsystem({
    projectId: "project-robot-2026", name: "Manipulator", description: "Test-local subsystem.",
    parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [], risks: [],
  });
  const task = getSnapshot().tasks[0];
  const updated = updateTask(task.id, { subsystemIds: [controls.id, "drive"], mechanismIds: ["swerve-module"], partInstanceIds: [] });
  assert.ok(updated);
  assert.match(updated.serial ?? "", /^T-CO/);
  assert.equal(getSnapshot().actions?.at(-1)?.subsystemId, controls.id);
  updateMechanism("swerve-module", { subsystemId: manipulator.id });
  const reparented = getSnapshot().tasks.find((item) => item.id === task.id)!;
  assert.deepEqual(reparented.subsystemIds, [manipulator.id, controls.id]);
  removeMechanism("swerve-module");
  assert.deepEqual(getSnapshot().tasks.find((item) => item.id === task.id)?.mechanismIds, []);
  const loosePart = createPartInstance({
    intendedSubsystemId: controls.id, intendedMechanismId: null,
    partDefinitionId: getSnapshot().partDefinitions[0].id, location: { kind: "stock", location: "Controls" },
  });
  removeSubsystem(controls.id);
  assert.equal(getSnapshot().partInstances.some((item) => item.id === loosePart.id), false);
  assert.equal(getSnapshot().tasks.some((item) => item.id === task.id), false);
});
