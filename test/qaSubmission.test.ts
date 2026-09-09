import assert from "node:assert/strict";
import { test } from "node:test";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { createQaRequest, getSnapshot, updateTask, createTaskDependency, createTaskBlocker } from "../src/data/store";

const env = { API_RATE_LIMIT_MAX_REQUESTS: "100" };
test("QA submission persists evidence, completes ready task and closes its pending requests", async () => {
  await withIntegrationApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => item.blockers.length === 0 && !snapshot.taskDependencies.some((edge) => edge.taskId === item.id))!;
    updateTask(task.id, { status: "waiting-for-qa" });
    const request = createQaRequest({ taskId: task.id, subject: task.title, mentorId: snapshot.members[0].id, requestedById: snapshot.members[1].id });
    const payload = { taskId: task.id, participantIds: [snapshot.members[0].id], result: "pass", mentorApproved: false, notes: "Checked", evidenceNotes: "Measured 12V", reviewedAt: "2026-09-09", qaRequestId: request.id };
    const response = await app.inject({ method: "POST", url: "/api/qa-reports/submit", payload });
    assert.equal(response.statusCode, 201, response.body);
    const bootstrap = (await app.inject({ method: "GET", url: "/api/bootstrap" })).json();
    const report = bootstrap.qaReports.find((item: { id: string }) => item.id === response.json().item.id);
    assert.equal(report.evidenceNotes, "Measured 12V");
    assert.equal(report.requestedById, snapshot.members[1].id);
    assert.equal(bootstrap.reports.find((item: { id: string }) => item.id === report.id).evidenceNotes, "Measured 12V");
    assert.equal(bootstrap.tasks.find((item: { id: string }) => item.id === task.id).status, "complete");
    assert.ok(!bootstrap.qaRequests.some((item: { id: string }) => item.id === request.id));
    const before = JSON.parse(JSON.stringify(getSnapshot()));
    assert.equal((await app.inject({ method: "POST", url: "/api/qa-reports/submit", payload })).statusCode, 409);
    assert.deepEqual(JSON.parse(JSON.stringify(getSnapshot())), before);
  }, { env });
});

test("failed QA produces persisted follow-up and only iteration results create blockers", async () => {
  await withIntegrationApp(async ({ app }) => {
    for (const result of ["minor-fix", "iteration-worthy"]) {
      const before = JSON.parse(JSON.stringify(getSnapshot()));
      const task = before.tasks[0];
      const response = await app.inject({ method: "POST", url: "/api/qa-reports/submit", payload: {
        taskId: task.id, participantIds: [before.members[0].id], result, notes: "Inspect connector", evidenceNotes: "Continuity failed", followUpTaskTitle: `Repair ${result}`, reviewedAt: "2026-09-09",
      } });
      assert.equal(response.statusCode, 201, response.body);
      const after = getSnapshot();
      assert.equal(after.qaReports.length, before.qaReports.length + 1);
      assert.equal(after.tasks.length, before.tasks.length + 1);
      const followUp = after.tasks.find((item) => item.title === `Repair ${result}`)!;
      assert.match(followUp.summary, /Continuity failed/);
      assert.equal(followUp.status, "not-started");
      assert.equal(after.taskBlockers.length, before.taskBlockers.length + (result === "iteration-worthy" ? 1 : 0));
    }
  }, { env });
});

test("QA pass uses authoritative readiness and rejects stale task/request links without writes", async () => {
  await withIntegrationApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => item.blockers.length === 0 && !snapshot.taskDependencies.some((edge) => edge.taskId === item.id))!;
    const payload = { taskId: task.id, participantIds: [snapshot.members[0].id], result: "pass", notes: "Checked", reviewedAt: "2026-09-09" };
    updateTask(task.id, { status: "not-started" });
    const reject = async (extra = {}) => {
      const before = JSON.parse(JSON.stringify(getSnapshot()));
      assert.equal((await app.inject({ method: "POST", url: "/api/qa-reports/submit", payload: { ...payload, ...extra } })).statusCode, 409);
      assert.deepEqual(JSON.parse(JSON.stringify(getSnapshot())), before);
    };
    await reject();
    updateTask(task.id, { status: "waiting-for-qa" });
    await reject({ qaRequestId: "missing" });
    createTaskDependency({ taskId: task.id, kind: "task", refId: "missing", requiredState: "complete", dependencyType: "hard" });
    await reject();
    createTaskBlocker({ blockedTaskId: task.id, blockerType: "external", blockerId: null, description: "Open issue", severity: "high" });
    await reject();
  }, { env });
});
