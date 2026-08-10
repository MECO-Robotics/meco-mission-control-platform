import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "../helpers/appIntegrationHarness";
import { createWorkflowAuthHeaders, workflowAuthEnv } from "../helpers/workflowAuth";

test("work-log mutation requires mentor or admin and records the authenticated actor", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const studentHeaders = createWorkflowAuthHeaders("student");
    const leadHeaders = createWorkflowAuthHeaders("lead");
    const mentorHeaders = createWorkflowAuthHeaders("mentor");
    const adminHeaders = createWorkflowAuthHeaders("admin");

    const created = await app.inject({
      method: "POST",
      url: "/api/work-logs",
      headers: studentHeaders,
      payload: {
        taskId: "swerve-sensor-bundle",
        date: "2026-08-10",
        hours: 1,
        participantIds: ["ava"],
        notes: "Student-created authorization fixture",
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().item.createdById, "ava");
    const workLogId = created.json().item.id as string;

    resetLimits();
    const deniedStudentUpdate = await app.inject({
      method: "PATCH",
      url: `/api/work-logs/${workLogId}`,
      headers: studentHeaders,
      payload: { hours: 2 },
    });
    assert.equal(deniedStudentUpdate.statusCode, 403);

    resetLimits();
    const deniedUnsignedUpdate = await app.inject({
      method: "PATCH",
      url: `/api/work-logs/${workLogId}`,
      payload: { hours: 2 },
    });
    assert.equal(deniedUnsignedUpdate.statusCode, 401);

    resetLimits();
    const deniedLeadDelete = await app.inject({
      method: "DELETE",
      url: `/api/work-logs/${workLogId}`,
      headers: leadHeaders,
    });
    assert.equal(deniedLeadDelete.statusCode, 403);

    resetLimits();
    const allowedMentorUpdate = await app.inject({
      method: "PATCH",
      url: `/api/work-logs/${workLogId}`,
      headers: mentorHeaders,
      payload: { hours: 2 },
    });
    assert.equal(allowedMentorUpdate.statusCode, 200);
    assert.equal(allowedMentorUpdate.json().item.hours, 2);

    const { getSnapshot } = require("../../src/data/store") as typeof import("../../src/data/store");
    const action = [...(getSnapshot().actions ?? [])]
      .reverse()
      .find((candidate) => candidate.entityId === workLogId && candidate.operation === "update");
    assert.equal(action?.actorMemberId, "jordan");
    assert.ok(action?.requestId);

    resetLimits();
    const missing = await app.inject({
      method: "PATCH",
      url: "/api/work-logs/missing-work-log",
      headers: mentorHeaders,
      payload: { hours: 2 },
    });
    assert.equal(missing.statusCode, 404);

    resetLimits();
    const allowedAdminDelete = await app.inject({
      method: "DELETE",
      url: `/api/work-logs/${workLogId}`,
      headers: adminHeaders,
    });
    assert.equal(allowedAdminDelete.statusCode, 200);
  }, { env: workflowAuthEnv });
});
