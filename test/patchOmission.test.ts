import assert from "node:assert/strict";
import { test } from "node:test";
import * as schemas from "../src/routes/routeSchemas";
import { getSnapshot, resetStore } from "../src/data/store";
import type { PlatformSnapshot } from "../src/domain/types";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("PATCH schemas preserve omission and supplied values without create defaults", () => {
  for (const [name, schema] of Object.entries(schemas)) {
    if (name.endsWith("PatchSchema")) assert.deepEqual(schema.parse({}), {}, name);
  }
  assert.deepEqual(schemas.taskPatchSchema.parse({ title: "  Rename only  " }), { title: "Rename only" });
  assert.deepEqual(schemas.taskPatchSchema.parse({ checklistItems: [], mentorId: null, requiresDocumentation: false }), {
    checklistItems: [], mentorId: null, requiresDocumentation: false,
  });
  assert.deepEqual(schemas.meetingPatchSchema.parse({ projectIds: [], endDateTime: null }), {
    projectIds: [], endDateTime: null,
  });
  assert.deepEqual(schemas.materialPatchSchema.parse({ onHandQuantity: "4" }), { onHandQuantity: 4 });
  assert.equal(schemas.taskPatchSchema.safeParse({ unexpected: true }).success, false);
  assert.deepEqual(schemas.materialPatchSchema.parse({ unexpected: true }), {});
  assert.equal(schemas.partDefinitionPatchSchema.safeParse({ partNumber: " " }).success, false);
  assert.equal(schemas.partDefinitionPatchSchema.safeParse({ iteration: 0 }).success, false);
  assert.deepEqual(schemas.projectPatchSchema.parse({ projectType: "robot", seasonId: "another-season" }), {});
  assert.deepEqual(schemas.partDefinitionPatchSchema.parse({ acquisition: { method: "stock" } }), {});
});

test("create schemas still supply defaults and preserve create-only commands", () => {
  const part = schemas.partDefinitionSchema.parse({
    name: "New bracket", revision: "A", type: "custom", source: "manual", acquisition: { method: "stock" },
  });
  assert.equal(part.partNumber, "");
  assert.equal(part.iteration, 1);
  assert.equal(part.isHardware, false);
  assert.equal(part.isArchived, false);
  assert.equal(part.description, "");
  assert.equal(part.photoUrl, "");
  assert.deepEqual(part.acquisition, { method: "stock" });
  const project = schemas.projectSchema.parse({ name: "New project", seasonId: "season" });
  assert.equal(project.projectType, "robot");
  assert.equal(project.status, "active");
  assert.equal(project.description, "");
});

test("unrelated HTTP patches retain saved fields; explicit clears apply and invalid input publishes nothing", async () => {
  await withIntegrationApp(async ({ app }) => {
    const fixture = structuredClone(getSnapshot()) as PlatformSnapshot;
    Object.assign(fixture.tasks[0], { photoUrl: "task-photo", checklistItems: ["Keep checklist"], requiresDocumentation: true, documentationLinked: true });
    Object.assign(fixture.subsystems[0], { photoUrl: "subsystem-photo", iteration: 4 });
    Object.assign(fixture.mechanisms[0], { googleSheetsUrl: "sheet-link", photoUrl: "mechanism-photo", iteration: 3, isArchived: true });
    Object.assign(fixture.partDefinitions[0], { iteration: 5 });
    Object.assign(fixture.partInstances[0], { photoUrl: "instance-photo", trackIndividually: true });
    Object.assign(fixture.workstreams[0], { isArchived: true });
    Object.assign(fixture.meetings[0], { meetingType: "review", projectIds: [fixture.projects[0].id], location: "Workshop", description: "Keep agenda" });
    Object.assign(fixture.artifacts[0], { isArchived: true });
    Object.assign(fixture.manufacturingItems[0], { process: "cnc", inHouse: false, status: "requested" });
    Object.assign(fixture.workLogs[0], { photoUrl: "work-photo" });
    resetStore(fixture);
    const cases = [
      ["tasks", "tasks", { title: "Renamed task" }, ["photoUrl", "assigneeIds", "checklistItems", "linkedManufacturingIds", "linkedPurchaseIds", "requiresDocumentation", "documentationLinked"]],
      ["subsystems", "subsystems", { name: "Renamed subsystem" }, ["photoUrl", "iteration", "mentorIds", "risks"]],
      ["mechanisms", "mechanisms", { name: "Renamed mechanism" }, ["googleSheetsUrl", "photoUrl", "iteration", "isArchived"]],
      ["partDefinitions", "part-definitions", { name: "Renamed part" }, ["iteration"]],
      ["partInstances", "part-instances", { name: "Renamed instance" }, ["photoUrl", "trackIndividually"]],
      ["workstreams", "workstreams", { name: "Renamed workstream" }, ["isArchived"]],
      ["meetings", "meetings", { title: "Renamed meeting" }, ["meetingType", "projectIds", "location", "description"]],
      ["artifacts", "artifacts", { title: "Renamed artifact" }, ["summary", "status", "link", "isArchived"]],
      ["materials", "materials", { onHandQuantity: 4 }, ["notes"]],
      ["manufacturingItems", "manufacturing", { quantity: 4 }, ["inHouse", "mentorReviewed"]],
      ["workLogs", "work-logs", { hours: 4 }, ["notes", "photoUrl", "participantIds"]],
      ["risks", "risks", { severity: "low" }, ["title", "detail", "sourceId", "attachmentId", "mitigationTaskId"]],
    ] as const;
    for (const [collection, path, payload, retained] of cases) {
      const original = getSnapshot()[collection][0];
      const response = await app.inject({ method: "PATCH", url: `/api/${path}/${original.id}`, payload });
      assert.equal(response.statusCode, 200, `${path}: ${response.body}`);
      const item = response.json().item;
      for (const key of retained) assert.deepEqual(item[key], Reflect.get(original, key), `${path}.${key}`);
    }
    const task = getSnapshot().tasks[0];
    const clear = { checklistItems: [], linkedManufacturingIds: [], linkedPurchaseIds: [], mentorId: null, requiresDocumentation: false, documentationLinked: false };
    const cleared = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: clear });
    assert.equal(cleared.statusCode, 200, cleared.body);
    for (const [key, value] of Object.entries(clear)) assert.deepEqual(cleared.json().item[key], value);
    const before = getSnapshot();
    const invalid = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { title: "", checklistItems: [] } });
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.equal(getSnapshot(), before);
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});
