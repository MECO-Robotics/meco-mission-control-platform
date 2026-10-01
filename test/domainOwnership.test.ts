import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot } from "../src/data/store";
import { validatePurchaseItemLinks, validateTaskLinks } from "../src/routes/helpers/linkValidation";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("canonical projects are unique by type within a season", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { seasonId: "default-season", projectType: "robot", name: "Robot", description: "duplicate", status: "active" },
    });
    assert.equal(duplicate.statusCode, 409);
    resetLimits();

    const mismatch = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { seasonId: "default-season", projectType: "robot", name: "Strategy", description: "wrong canonical name", status: "active" },
    });
    assert.equal(mismatch.statusCode, 409);
  });
});

test("responsible groups must match the task project and season", () => {
  const task = getSnapshot().tasks.find((candidate) => candidate.id === "swerve-sensor-bundle");
  assert.ok(task);
  const invalid = validateTaskLinks({
    projectId: task.projectId,
    workTypeId: task.workTypeId,
    responsibleGroupId: "wrong-season-group",
    workstreamIds: task.workstreamIds,
    subsystemIds: task.subsystemIds,
    mechanismIds: task.mechanismIds,
    partInstanceIds: task.partInstanceIds,
  });
  assert.equal(invalid, "The selected responsible group does not belong to the selected season and project.");
});

test("purchases distinguish outsourced manufacturing services from COTS", () => {
  const snapshot = getSnapshot();
  const outsourcedTask = snapshot.tasks.find((candidate) => candidate.id === "swerve-sensor-bundle");
  const cotsPurchase = snapshot.purchaseItems.find((candidate) => candidate.kind === "cots-goods");
  assert.ok(outsourcedTask);
  assert.ok(cotsPurchase);
  const common = { quotes: [], selectedQuoteId: null, partDefinitionId: null, materialId: null };
  assert.equal(validatePurchaseItemLinks({ ...common, taskId: outsourcedTask.id, kind: "manufacturing-service" }), null);
  assert.equal(validatePurchaseItemLinks({ ...common, taskId: cotsPurchase.taskId, kind: "cots-goods" }), null);
  assert.match(validatePurchaseItemLinks({ ...common, taskId: cotsPurchase.taskId, kind: "manufacturing-service" }) ?? "", /outsourced Robot manufacturing task/);
});

test("manufacturing process catalog supports create and archive", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const created = await app.inject({ method: "POST", url: "/api/manufacturing/processes", payload: { code: "laser-cut", name: "Laser Cut" } });
    assert.equal(created.statusCode, 201);
    const processId = created.json().item.id as string;
    resetLimits();
    const archived = await app.inject({ method: "PATCH", url: `/api/manufacturing/processes/${processId}`, payload: { isActive: false } });
    assert.equal(archived.statusCode, 200);
    assert.equal(archived.json().item.isActive, false);
  });
});

test("teams enforce season, project and member integrity and can be archived", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const snapshot = getSnapshot();
    const seasonId = snapshot.seasons[0]!.id;
    const project = snapshot.projects.find((item) => item.seasonId === seasonId)!;
    const member = snapshot.members.find((item) => (item.activeSeasonIds ?? [item.seasonId]).includes(seasonId));
    const created = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Drive Team", projectIds: [project.id], memberIds: member ? [member.id] : [],
    } });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().item.id as string;
    resetLimits();
    const invalid = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Invalid Team", projectIds: ["missing"], memberIds: [],
    } });
    assert.equal(invalid.statusCode, 400);
    resetLimits();
    const invalidMember = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Invalid Membership", projectIds: [], memberIds: ["missing-member"],
    } });
    assert.equal(invalidMember.statusCode, 400);
    resetLimits();
    const archived = await app.inject({ method: "PATCH", url: `/api/responsible-groups/${id}`, payload: { isArchived: true } });
    assert.equal(archived.statusCode, 200, archived.body);
    assert.equal(archived.json().item.isArchived, true);
    const task = snapshot.tasks.find((item) => item.projectId === project.id);
    assert.ok(task);
    const assignment = {
      projectId: task.projectId, workTypeId: task.workTypeId, responsibleGroupId: id,
      workstreamIds: task.workstreamIds, subsystemIds: task.subsystemIds,
      mechanismIds: task.mechanismIds, partInstanceIds: task.partInstanceIds,
    };
    assert.match(validateTaskLinks(assignment) ?? "", /responsible group/);
    assert.equal(validateTaskLinks({ ...assignment, allowArchivedResponsibleGroup: true }), null);
  });
});

test("class year is available to students and student leads and is returned by bootstrap", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const create = await app.inject({ method: "POST", url: "/api/members", payload: {
      name: "Year Member", role: "student", classYear: "junior", seasonId: getSnapshot().seasons[0]!.id,
    } });
    assert.equal(create.statusCode, 201, create.body);
    assert.equal(create.json().item.classYear, "junior");
    resetLimits();
    const lead = await app.inject({ method: "POST", url: "/api/members", payload: {
      name: "Student Lead", role: "lead", classYear: "senior", seasonId: getSnapshot().seasons[0]!.id,
    } });
    assert.equal(lead.statusCode, 201, lead.body);
    assert.equal(lead.json().item.classYear, "senior");
    resetLimits();
    const invalid = await app.inject({ method: "POST", url: "/api/members", payload: {
      name: "Non Student", role: "mentor", classYear: "junior", seasonId: getSnapshot().seasons[0]!.id,
    } });
    assert.equal(invalid.statusCode, 400);
    resetLimits();
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200, bootstrap.body);
    assert.equal(bootstrap.json().members.find((member: { id: string }) => member.id === create.json().item.id).classYear, "junior");
  });
});

test("readiness is projected and not persisted on domain records", async () => {
  await withIntegrationApp(async ({ app }) => {
    const snapshot = getSnapshot();
    assert.equal("risks" in (snapshot.subsystems[0] ?? {}), false);
    assert.equal("readinessStatus" in (snapshot.milestones[0] ?? {}), false);
    assert.equal("readinessStatus" in (snapshot.partInstances[0] ?? {}), false);
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200);
    assert.equal(typeof bootstrap.json().milestones[0]?.readinessStatus, "string");
    assert.equal(typeof bootstrap.json().partInstances[0]?.readinessStatus, "string");
  });
});
