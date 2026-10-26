import { validateTaskLinks } from "../src/domain/taskLinks";
import assert from "node:assert/strict";
import { test } from "node:test";

import { getResponsibleGroups, getSnapshot, resetStore } from "../src/data/store";
import { validatePurchaseItemLinks } from "../src/routes/helpers/linkValidation";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("canonical projects are unique by type within a season", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { seasonId: "season-2026-meco", projectType: "robot", name: "Robot", description: "duplicate", status: "active" },
    });
    assert.equal(duplicate.statusCode, 409);
    resetLimits();

    const mismatch = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { seasonId: "season-2026-meco", projectType: "robot", name: "Strategy", description: "wrong canonical name", status: "active" },
    });
    assert.equal(mismatch.statusCode, 409);
  });
});

test("responsible groups must match the task project and season", () => {
  const task = getSnapshot().tasks.find((candidate) => candidate.status !== "complete");
  assert.ok(task);
  const wrongProjectGroup = getSnapshot().responsibleGroups.find((group) => !group.projectIds.includes(task.projectId));
  assert.ok(wrongProjectGroup);
  const invalid = validateTaskLinks(getSnapshot(), {
    projectId: task.projectId,
    workTypeId: task.workTypeId,
    responsibleGroupId: wrongProjectGroup.id,
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
  const initial = getSnapshot();
  const manufacturingTask = initial.tasks.find((candidate) => candidate.workTypeId === "robot:manufacturing");
  assert.ok(manufacturingTask);
  const manufacturingDetails = {
    part: { kind: "part-definition" as const, partDefinitionId: initial.partDefinitions[0]!.id },
    quantity: 1,
    processId: initial.manufacturingProcesses[0]!.id,
    fulfillmentSource: "outsourced" as const,
    material: { kind: "specified-material" as const, name: "Aluminum" },
    fileArtifactIds: [], tolerances: [], qaRequirements: [],
  };
  resetStore({ ...initial, tasks: initial.tasks.map((task) => task.id === manufacturingTask.id ? { ...task, manufacturingDetails } : task) });
  const snapshot = getSnapshot();
  const outsourcedTask = snapshot.tasks.find((candidate) => candidate.id === manufacturingTask.id);
  const cotsPurchase = snapshot.purchaseItems.find((candidate) => candidate.kind === "cots-goods");
  const cotsTask = snapshot.tasks.find((candidate) => candidate.id !== outsourcedTask?.id && candidate.manufacturingDetails === null);
  assert.ok(outsourcedTask);
  assert.ok(cotsPurchase);
  assert.ok(cotsTask);
  const common = { quotes: [], selectedQuoteId: null, partDefinitionId: null, materialId: null };
  assert.equal(validatePurchaseItemLinks({ ...common, taskId: outsourcedTask.id, kind: "manufacturing-service" }), null);
  assert.equal(validatePurchaseItemLinks({ ...common, taskId: cotsTask.id, kind: "cots-goods" }), null);
  assert.match(validatePurchaseItemLinks({ ...common, taskId: cotsTask.id, kind: "manufacturing-service" }) ?? "", /outsourced Robot manufacturing task/);
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

test("teams require explicit identity and retain it across unrelated updates", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const payload = { seasonId: getSnapshot().seasons[0]!.id, name: "Custom identity", icon: "megaphone", color: "#123aBc", projectIds: [], memberIds: [] };
    const created = await app.inject({ method: "POST", url: "/api/responsible-groups", payload });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().item.id as string;
    assert.equal(created.json().item.icon, "megaphone");
    assert.equal(created.json().item.color, "#123aBc");
    for (const invalid of [{ icon: "unknown" }, { color: "red" }, { color: "#123" }, { icon: null }, { color: null }]) {
      resetLimits();
      const response = await app.inject({ method: "PATCH", url: `/api/responsible-groups/${id}`, payload: invalid });
      assert.equal(response.statusCode, 400, response.body);
    }
    for (const missing of ["icon", "color"] as const) {
      resetLimits();
      const incomplete: Partial<typeof payload> = { ...payload };
      delete incomplete[missing];
      assert.equal((await app.inject({ method: "POST", url: "/api/responsible-groups", payload: incomplete })).statusCode, 400);
    }
    resetLimits();
    const edited = await app.inject({ method: "PATCH", url: `/api/responsible-groups/${id}`, payload: { icon: "graduation-cap", color: "#ABCDEF" } });
    assert.equal(edited.statusCode, 200, edited.body);
    resetLimits();
    const renamed = await app.inject({ method: "PATCH", url: `/api/responsible-groups/${id}`, payload: { name: "Renamed identity", isArchived: true } });
    assert.equal(renamed.statusCode, 200, renamed.body);
    assert.equal(renamed.json().item.icon, "graduation-cap");
    assert.equal(renamed.json().item.color, "#ABCDEF");
    assert.equal(renamed.json().item.isArchived, true);
    resetLimits();
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200, bootstrap.body);
    const saved = bootstrap.json().responsibleGroups.find((group: { id: string }) => group.id === id);
    assert.equal(saved.icon, "graduation-cap");
    assert.equal(saved.color, "#ABCDEF");
  });
});

test("teams enforce season, project and member integrity and can be archived", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const snapshot = getSnapshot();
    const seasonId = "season-2026-meco";
    const project = snapshot.projects.find((item) => item.seasonId === seasonId && item.projectType === "robot")!;
    const member = snapshot.members.find((item) => (item.role === "student" || item.role === "lead") && (item.activeSeasonIds ?? [item.seasonId]).includes(seasonId));
    const created = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Drive Team", icon: "target", color: "#2563EB", projectIds: [project.id], memberIds: member ? [member.id] : [], primaryMemberIds: member ? [member.id] : [],
    } });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().item.id as string;
    assert.deepEqual(created.json().item.primaryMemberIds, member ? [member.id] : []);
    assert.deepEqual(created.json().item.workTypeIds, []);
    assert.ok(getSnapshot().workTypes.some((workType) => workType.projectType === "robot"));
    resetLimits();
    const secondary = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Programming Team", icon: "code", color: "#7C3AED", projectIds: [project.id], memberIds: member ? [member.id] : [], primaryMemberIds: [],
    } });
    assert.equal(secondary.statusCode, 201, secondary.body);
    const secondaryId = secondary.json().item.id as string;
    resetLimits();
    const transfer = await app.inject({ method: "PATCH", url: `/api/responsible-groups/${secondaryId}`, payload: { primaryMemberIds: member ? [member.id] : [] } });
    assert.equal(transfer.statusCode, 200, transfer.body);
    assert.deepEqual(transfer.json().item.primaryMemberIds, member ? [member.id] : []);
    assert.deepEqual(transfer.json().item.workTypeIds, []);
    assert.equal(transfer.json().item.icon, "code");
    assert.equal(transfer.json().item.color, "#7C3AED");
    assert.deepEqual(getResponsibleGroups().find((group) => group.id === id)?.primaryMemberIds, []);
    resetLimits();
    const invalid = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Invalid Team", icon: "users", color: "#2563EB", projectIds: ["missing"], memberIds: [],
    } });
    assert.equal(invalid.statusCode, 400);
    resetLimits();
    const invalidMember = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Invalid Membership", icon: "users", color: "#2563EB", projectIds: [], memberIds: ["missing-member"],
    } });
    assert.equal(invalidMember.statusCode, 400);
    resetLimits();
    const invalidPrimary = await app.inject({ method: "POST", url: "/api/responsible-groups", payload: {
      seasonId, name: "Invalid Primary", icon: "users", color: "#2563EB", projectIds: [], memberIds: [], primaryMemberIds: member ? [member.id] : [],
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

test("seeded responsibility groups stay linked to canonical projects and seasons", async () => {
  const groups = getResponsibleGroups();
  const snapshot = getSnapshot();
  assert.ok(groups.length > 0);
  for (const group of groups) {
    assert.ok(snapshot.seasons.some((season) => season.id === group.seasonId), `${group.name} has a season`);
    assert.ok(group.projectIds.every((id) => snapshot.projects.some((project) => project.id === id && project.seasonId === group.seasonId)), `${group.name} project scopes match`);
    assert.ok(group.memberIds.every((id) => snapshot.members.some((member) => member.id === id)), `${group.name} member links resolve`);
  }
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
