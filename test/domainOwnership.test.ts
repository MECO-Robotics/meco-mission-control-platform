import { validateTaskLinks } from "../src/domain/taskLinks";
import assert from "node:assert/strict";
import { test } from "node:test";

import { getResponsibleGroups, getSnapshot } from "../src/data/store";
import { validatePurchaseItemLinks } from "../src/routes/helpers/linkValidation";
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
  const invalid = validateTaskLinks(getSnapshot(), {
    projectId: task.projectId,
    workTypeId: task.workTypeId,
    responsibleGroupId: "wrong-season-group",
    ownerId: task.ownerId,
    mentorId: task.mentorId,
    assigneeIds: task.assigneeIds,
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
    const member = snapshot.members.find((item) => (item.role === "student" || item.role === "lead") && (item.activeSeasonIds ?? [item.seasonId]).includes(seasonId));
    const created = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Drive Team", projectIds: [project.id], memberIds: member ? [member.id] : [], primaryMemberIds: member ? [member.id] : [],
    } });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().item.id as string;
    assert.deepEqual(created.json().item.primaryMemberIds, member ? [member.id] : []);
    assert.deepEqual(created.json().item.workTypeIds, []);
    assert.equal(getSnapshot().workTypes.some((workType) => workType.id === "robot:drive-team"), false);
    resetLimits();
    const secondary = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Programming Team", projectIds: [project.id], memberIds: member ? [member.id] : [], primaryMemberIds: [],
    } });
    assert.equal(secondary.statusCode, 201, secondary.body);
    const secondaryId = secondary.json().item.id as string;
    resetLimits();
    const transfer = await app.inject({ method: "PATCH", url: `/api/responsible-groups/${secondaryId}`, payload: { primaryMemberIds: member ? [member.id] : [] } });
    assert.equal(transfer.statusCode, 200, transfer.body);
    assert.deepEqual(transfer.json().item.primaryMemberIds, member ? [member.id] : []);
    assert.deepEqual(transfer.json().item.workTypeIds, []);
    assert.deepEqual(getResponsibleGroups().find((group) => group.id === id)?.primaryMemberIds, []);
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
    const invalidPrimary = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Invalid Primary", projectIds: [], memberIds: [], primaryMemberIds: member ? [member.id] : [],
    } });
    assert.equal(invalidPrimary.statusCode, 400);
    resetLimits();
    const archived = await app.inject({ method: "PATCH", url: `/api/responsible-groups/${secondaryId}`, payload: { isArchived: true } });
    assert.equal(archived.statusCode, 200, archived.body);
    assert.equal(archived.json().item.isArchived, true);
    if (member) assert.equal(getResponsibleGroups().filter((group) => !group.isArchived && group.primaryMemberIds.includes(member.id)).length, 1);
    resetLimits();
    const task = snapshot.tasks.find((item) => item.projectId === project.id);
    assert.ok(task);
    const assignment = {
      projectId: task.projectId, workTypeId: task.workTypeId, responsibleGroupId: secondaryId,
      ownerId: member?.id ?? null,
      workstreamIds: task.workstreamIds, subsystemIds: task.subsystemIds,
      mechanismIds: task.mechanismIds, partInstanceIds: task.partInstanceIds,
    };
    assert.match(validateTaskLinks(getSnapshot(), assignment) ?? "", /responsible group/);
    assert.equal(validateTaskLinks(getSnapshot(), { ...assignment, allowArchivedResponsibleGroup: true }), null);
    const missing = await app.inject({ method: "DELETE", url: `/api/responsible-groups/${secondaryId}-missing` });
    assert.equal(missing.statusCode, 404);
  });
});

test("seeded team divisions are the seven editable FRC disciplines", async () => {
  const groups = getResponsibleGroups().filter((group) => group.id.startsWith("team-"));
  assert.deepEqual(groups.map((group) => group.name).sort(), ["Admin", "Business", "Electrical", "Mechanical", "Media", "Programming", "Strategy"].sort());
  for (const group of groups) {
    assert.ok(group.memberIds.some((id) => getSnapshot().members.find((member) => member.id === id)?.role === "student"), `${group.name} has a student`);
    assert.ok(group.memberIds.some((id) => getSnapshot().members.find((member) => member.id === id)?.role === "mentor"), `${group.name} has a mentor`);
  }
  const mechanical = groups.find((group) => group.id === "team-mechanical")!;
  const taskIds = getSnapshot().tasks.filter((task) => task.responsibleGroupId === mechanical.id).map((task) => task.id);
  const studentId = mechanical.primaryMemberIds[0]!;
  await withIntegrationApp(async ({ app }) => {
    const deleted = await app.inject({ method: "DELETE", url: `/api/responsible-groups/${mechanical.id}` });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(getResponsibleGroups().some((group) => group.id === mechanical.id), false);
    const capacityFallback = getResponsibleGroups().find((group) => group.primaryMemberIds.includes(studentId));
    assert.ok(capacityFallback?.memberIds.includes(studentId), "capacity transfers to a remaining team membership");
    for (const taskId of taskIds) assert.equal(getSnapshot().tasks.find((task) => task.id === taskId)?.responsibleGroupId, null);
  });
});

test("member records and bootstrap do not expose class year grouping data", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const create = await app.inject({ method: "POST", url: "/api/members", payload: {
      name: "Year Member", role: "student", classYear: "junior", seasonId: getSnapshot().seasons[0]!.id,
    } });
    assert.equal(create.statusCode, 201, create.body);
    assert.equal("classYear" in create.json().item, false);
    resetLimits();
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200, bootstrap.body);
    const member = bootstrap.json().members.find((item: { id: string }) => item.id === create.json().item.id);
    assert.equal("classYear" in member, false);
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
