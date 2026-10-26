import assert from "node:assert/strict";
import { test } from "node:test";

import { getSnapshot, resetStore, updateTask } from "../../src/data/store";
import { createWorkflowAuthHeaders, withWorkflowAuthApp } from "../helpers/workflowAuth";

test("authenticated work-log edits retain the last completion record", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const initial = getSnapshot();
    const task = initial.tasks.find((item) => item.status !== "complete")!;
    const destination = initial.tasks.find((item) => item.id !== task.id && item.status !== "complete")!;
    const mentor = await createWorkflowAuthHeaders("mentor");
    const memberId = task.ownerId ?? initial.members.find((member) => member.role === "student")!.id;
    resetStore({ ...initial, workLogs: initial.workLogs.filter((log) => log.taskId !== task.id) });
    updateTask(task.id, { status: "waiting-for-qa", requiresDocumentation: false });
    const createdLog = await app.inject({ method: "POST", url: "/api/work-logs", headers: mentor, payload: {
      taskId: task.id, date: "2026-10-16", hours: 1, participantIds: [memberId], notes: "Work-log mutation fixture",
    } });
    assert.equal(createdLog.statusCode, 201, createdLog.body);
    const originalLog = createdLog.json().item;
    resetLimits();
    const reviewed = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: {
      reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }],
      createdByMemberId: memberId, participantIds: [memberId], mentorId: null, requestedById: null,
      result: "pass", summary: "Work-log mutation fixture", notes: "Synthetic fresh review", status: "reviewed",
      createdAt: new Date().toISOString(), reviewedById: null, reviewedAt: null,
    } });
    assert.equal(reviewed.statusCode, 201, reviewed.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete", "fixture completion is supported by fresh reviewed QA");

    const beforeMoveReject = getSnapshot();
    const rejectedMove = await app.inject({ method: "PATCH", url: `/api/work-logs/${originalLog.id}`, headers: mentor, payload: { taskId: destination.id } });
    assert.equal(rejectedMove.statusCode, 409, rejectedMove.body);
    assert.deepEqual(getSnapshot(), beforeMoveReject, "moving the sole completion work log publishes no record or audit mutation");
    resetLimits();
    const rejectedDelete = await app.inject({ method: "DELETE", url: `/api/work-logs/${originalLog.id}`, headers: mentor });
    assert.equal(rejectedDelete.statusCode, 409, rejectedDelete.body);
    assert.deepEqual(getSnapshot(), beforeMoveReject, "deleting the sole completion work log publishes no record or audit mutation");

    resetLimits();
    const additional = await app.inject({ method: "POST", url: "/api/work-logs", headers: mentor, payload: {
      taskId: task.id, date: originalLog.date, hours: 0.5, participantIds: originalLog.participantIds,
      notes: "Second completion work log",
    } });
    assert.equal(additional.statusCode, 201, additional.body);
    resetLimits();
    const contentEdit = await app.inject({ method: "PATCH", url: `/api/work-logs/${originalLog.id}`, headers: mentor, payload: { notes: "Updated completion evidence" } });
    assert.equal(contentEdit.statusCode, 200, contentEdit.body);
    resetLimits();
    const moveWithAnotherLog = await app.inject({ method: "PATCH", url: `/api/work-logs/${originalLog.id}`, headers: mentor, payload: { taskId: destination.id } });
    assert.equal(moveWithAnotherLog.statusCode, 200, moveWithAnotherLog.body);
    assert.equal(getSnapshot().workLogs.filter((log) => log.taskId === task.id).length, 1);
    resetLimits();
    const remainingId = additional.json().item.id as string;
    const rejectedLastDelete = await app.inject({ method: "DELETE", url: `/api/work-logs/${remainingId}`, headers: mentor });
    assert.equal(rejectedLastDelete.statusCode, 409, rejectedLastDelete.body);
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});

test("work-log mutation requires mentor or admin and records the authenticated actor", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const student = getSnapshot().members.find((member) => member.email === "ava.chen@mecorobotics.org")!;
    const task = getSnapshot().tasks.find((candidate) => candidate.status !== "complete")!;
    const studentHeaders = await createWorkflowAuthHeaders("student");
    const leadHeaders = await createWorkflowAuthHeaders("lead");
    const mentorHeaders = await createWorkflowAuthHeaders("mentor");
    const adminHeaders = await createWorkflowAuthHeaders("admin");

    const created = await app.inject({
      method: "POST",
      url: "/api/work-logs",
      headers: studentHeaders,
      payload: {
        taskId: task.id,
        date: "2026-08-10",
        hours: 1,
        participantIds: [student.id],
        notes: "Student-created authorization fixture",
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().item.createdById, student.id);
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
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" }, members: [{ name: "Ava Chen", email: "ava.chen@mecorobotics.org", role: "student", seasonId: "season-2026-meco" }] });
});
