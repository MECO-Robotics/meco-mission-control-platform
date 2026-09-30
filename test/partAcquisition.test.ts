import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPartDefinitionWithAcquisition, getSnapshot, resetStore,
  runWithInteractiveTutorialSession, startInteractiveTutorialSession,
} from "../src/data/store";
import { preparePartAcquisition } from "../src/routes/helpers/partAcquisition";
import { partDefinitionSchema } from "../src/routes/routeSchemas";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { issueTestMobileToken } from "./helpers/sessionAuth";
import { createWorkflowAuthHeaders, withWorkflowAuthApp } from "./helpers/workflowAuth";

function payload(method: "stock" | "manufacture" | "purchase-cots" = "manufacture") {
  const snapshot = getSnapshot();
  const subsystem = snapshot.subsystems.find((item) => !item.isArchived && snapshot.projects.some((project) => project.id === item.projectId && project.projectType === "robot"))!;
  const mentorId = snapshot.members.find((member) => member.id === "jordan")?.id ??
    snapshot.members.find((member) => member.role === "mentor")!.id;
  return {
    name: "Acquisition Plate", revision: "A", defaultAcquisitionMethod: method, type: "custom",
    materialId: snapshot.materials[0].id,
    acquisition: method === "stock" ? { method } : {
      method, subsystemId: subsystem.id, workTypeId: method === "manufacture" ? "robot:manufacturing" : "robot:planning",
      ownerId: "ava", mentorId, dueDate: "2026-10-01",
    },
  };
}

test("part acquisition creates linked records with trusted workflow defaults and distinct actor/owner", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const headers = await createWorkflowAuthHeaders("lead");
    for (const method of ["stock", "manufacture", "purchase-cots"] as const) {
      const before = getSnapshot();
      const response = await app.inject({ method: "POST", url: "/api/part-definitions", headers, payload: payload(method) });
      assert.equal(response.statusCode, 201, response.body);
      const { item, purchaseItem, task } = response.json();
      assert.equal(getSnapshot().partDefinitions.length, before.partDefinitions.length + 1);
      if (method === "stock") {
        assert.equal(purchaseItem, null);
        assert.equal(task, null);
        assert.equal(getSnapshot().tasks.length, before.tasks.length);
      } else {
        assert.equal(task.ownerId, "ava");
        assert.equal(task.mentorId, "jordan");
        assert.equal(task.requestedById, "priya");
        assert.equal(task.manufacturingDetails !== null, method === "manufacture");
        if (method === "manufacture") {
          assert.equal(task.manufacturingDetails.fulfillmentSource, "in-house");
          assert.equal(purchaseItem, null);
        } else {
          assert.equal(purchaseItem.partDefinitionId, item.id);
          assert.equal(purchaseItem.kind, "cots-goods");
          assert.equal(purchaseItem.taskId, task.id);
        }
        const audits = (getSnapshot().actions ?? []).slice((before.actions ?? []).length);
        assert.equal(audits.length, method === "manufacture" ? 2 : 3);
        assert.ok(audits.every((audit) => audit.actorMemberId === "priya" && audit.requestId));
      }
      resetLimits();
    }
  });
});

test("part acquisition rejects forbidden or inconsistent input without publishing any records", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const before = getSnapshot();
    const denied = await app.inject({ method: "POST", url: "/api/part-definitions", headers: await createWorkflowAuthHeaders("student"), payload: payload() });
    assert.equal(denied.statusCode, 403);
    assert.equal(getSnapshot(), before);
    const headers = await createWorkflowAuthHeaders("mentor");
    const valid = payload();
    for (const patch of [
      { subsystemId: "missing" }, { disciplineId: "missing" }, { ownerId: "missing" },
      { mentorId: "ava" }, { dueDate: "not-a-date" }, { approvedByMentor: true },
    ]) {
      resetLimits();
      const response = await app.inject({ method: "POST", url: "/api/part-definitions", headers, payload: { ...valid, acquisition: { ...valid.acquisition, ...patch } } });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(getSnapshot(), before);
    }
    for (const patch of [
      { materialId: "missing" }, { seasonId: "missing" }, { activeSeasonIds: ["missing"] },
      { defaultAcquisitionMethod: "invalid" }, { isArchived: true },
    ]) {
      resetLimits();
      const response = await app.inject({ method: "POST", url: "/api/part-definitions", headers, payload: { ...valid, ...patch } });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(getSnapshot(), before);
    }
    resetStore({ ...before, members: before.members.map((member) => member.id === "ava" ? { ...member, seasonId: "another-season", activeSeasonIds: ["another-season"] } : member) });
    const scopedBefore = getSnapshot();
    resetLimits();
    const wrongSeason = await app.inject({ method: "POST", url: "/api/part-definitions", headers, payload: valid });
    assert.equal(wrongSeason.statusCode, 400, wrongSeason.body);
    assert.equal(getSnapshot(), scopedBefore);
  });
});

test("acquisition draft failures discard earlier commands globally and inside isolated tutorials", () => {
  resetStore();
  const global = getSnapshot();
  const exercise = () => {
    const before = getSnapshot();
    const tutorialPayload = payload();
    tutorialPayload.acquisition.mentorId = "marco";
    const prepared = preparePartAcquisition(partDefinitionSchema.parse(tutorialPayload), null);
    assert.ok(!("error" in prepared));
    assert.ok(prepared.plan);
    // Force publication failure in the last command, after definition and acquisition creation.
    prepared.plan.task.checklistItems = [() => {}] as unknown as string[];
    assert.throws(() => createPartDefinitionWithAcquisition(prepared.definition, prepared.plan, { actorMemberId: null }));
    assert.equal(getSnapshot(), before);
    prepared.plan.task.checklistItems = [];
    const result = createPartDefinitionWithAcquisition(prepared.definition, prepared.plan, { actorMemberId: null });
    assert.equal(result.task?.requestedById, null);
    assert.equal(getSnapshot().tasks.length, before.tasks.length + 1);
  };
  startInteractiveTutorialSession("acquisition-user");
  runWithInteractiveTutorialSession("acquisition-user", exercise);
  assert.equal(getSnapshot(), global);
  exercise();
  resetStore();
});


test("auth-off and unmatched authenticated acquisition requesters remain unattributed", async () => {
  for (const authenticated of [false, true]) {
    const run = async ({ app }: { app: import("fastify").FastifyInstance }) => {
      const headers = authenticated ? {
        authorization: `Bearer ${await issueTestMobileToken({
          accountId: "unmatched-mentor", authProvider: "email", email: "unmatched@mecorobotics.org",
          name: "Unmatched mentor", picture: null, hostedDomain: "mecorobotics.org", role: "mentor", taskSubteamIds: [],
        })}`,
      } : undefined;
      const before = getSnapshot();
      const response = await app.inject({ method: "POST", url: "/api/part-definitions", headers, payload: payload("purchase-cots") });
      assert.equal(response.statusCode, 201, response.body);
      assert.equal(response.json().task.requestedById, null);
      assert.equal(response.json().task.ownerId, "ava");
      const audits = (getSnapshot().actions ?? []).slice((before.actions ?? []).length);
      assert.equal(audits.length, 3);
      assert.ok(audits.every((audit) => audit.actorMemberId === null));
    };
    if (authenticated) {
      await withWorkflowAuthApp(run, { env: { AUTH_MENTOR_EMAILS: "unmatched@mecorobotics.org" } });
    } else {
      await withIntegrationApp(run);
    }
  }
});
