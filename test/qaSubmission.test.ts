import assert from "node:assert/strict";
import { test } from "node:test";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { createQaRequest, getSnapshot, updateTask, createTaskDependency, removeTaskDependency } from "../src/data/store";

const env = { API_RATE_LIMIT_MAX_REQUESTS: "100" };
test("QA submission persists evidence, completes ready task and closes its pending requests", async () => {
  await withIntegrationApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => !snapshot.risks.some((risk) => risk.blocksWork && risk.relatedTargets.some((target) => target.kind === "task" && target.id === item.id)) && !snapshot.taskDependencies.some((edge) => edge.taskId === item.id))!;
    updateTask(task.id, { status: "waiting-for-qa" });
    const request = createQaRequest({ projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], subject: task.title, mentorId: snapshot.members[0].id, requestedById: snapshot.members[1].id });
    const payload = { reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }, { kind: "qa-request", id: request.id }], createdByMemberId: snapshot.members[0].id, participantIds: [snapshot.members[0].id], mentorId: snapshot.members[0].id, requestedById: snapshot.members[1].id, result: "pass", summary: "Checked", notes: "Checked", evidenceNotes: "Measured 12V", createdAt: new Date().toISOString(), status: "submitted", reviewedById: null, reviewedAt: null };
    const response = await app.inject({ method: "POST", url: "/api/qa-reports/submit", payload });
    assert.equal(response.statusCode, 201, response.body);
    const bootstrap = (await app.inject({ method: "GET", url: "/api/bootstrap" })).json();
    const report = bootstrap.reports.find((item: { id: string }) => item.id === response.json().item.id);
    assert.equal(report.evidenceNotes, "Measured 12V");
    assert.equal(report.requestedById, snapshot.members[1].id);
    assert.equal(bootstrap.reports.find((item: { id: string }) => item.id === report.id).evidenceNotes, "Measured 12V");
    assert.equal(bootstrap.tasks.find((item: { id: string }) => item.id === task.id).status, "complete");
    assert.ok(!bootstrap.qaRequests.some((item: { id: string }) => item.id === request.id));
    const before = JSON.parse(JSON.stringify(getSnapshot()));
    assert.equal((await app.inject({ method: "POST", url: "/api/qa-reports/submit", payload })).statusCode, 400);
    assert.deepEqual(JSON.parse(JSON.stringify(getSnapshot())), before);
  }, { env });
});

test("failed QA produces persisted follow-up and only iteration results create blockers", async () => {
  await withIntegrationApp(async ({ app }) => {
    for (const result of ["minor-fix", "iteration-worthy"]) {
      const before = JSON.parse(JSON.stringify(getSnapshot()));
      const task = before.tasks[0];
      const response = await app.inject({ method: "POST", url: "/api/qa-reports/submit", payload: {
        reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], createdByMemberId: before.members[0].id, participantIds: [before.members[0].id], mentorId: null, requestedById: null, result, summary: "Inspect connector", notes: "Inspect connector", evidenceNotes: "Continuity failed", createdAt: new Date().toISOString(), status: "submitted", reviewedById: null, reviewedAt: new Date().toISOString(), followUpTaskTitle: `Repair ${result}`,
      } });
      assert.equal(response.statusCode, 201, response.body);
      const after = getSnapshot();
      assert.equal(after.qaReports.length, before.qaReports.length + 1);
      assert.equal(after.tasks.length, before.tasks.length + 1);
      const followUp = after.tasks.find((item) => item.title === `Repair ${result}`)!;
      assert.match(followUp.summary, /Continuity failed/);
      assert.equal(followUp.status, "not-started");
      assert.equal(after.risks.length, before.risks.length + (result === "iteration-worthy" ? 1 : 0));
    }
  }, { env });
});

test("QA pass uses authoritative readiness and rejects stale task/request links without writes", async () => {
  await withIntegrationApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => !snapshot.risks.some((risk) => risk.blocksWork && risk.relatedTargets.some((target) => target.kind === "task" && target.id === item.id)) && !snapshot.taskDependencies.some((edge) => edge.taskId === item.id))!;
    const payload = { reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], createdByMemberId: snapshot.members[0].id, participantIds: [snapshot.members[0].id], mentorId: null, requestedById: null, result: "pass", summary: "Checked", notes: "Checked", createdAt: new Date().toISOString(), status: "submitted", reviewedById: null, reviewedAt: new Date().toISOString() };
    updateTask(task.id, { status: "not-started" });
    const reject = async (extra = {}) => {
      const before = JSON.parse(JSON.stringify(getSnapshot()));
      assert.equal((await app.inject({ method: "POST", url: "/api/qa-reports/submit", payload: { ...payload, ...extra } })).statusCode, 409);
      assert.deepEqual(JSON.parse(JSON.stringify(getSnapshot())), before);
    };
    await reject();
    updateTask(task.id, { status: "waiting-for-qa" });
    const dependency = createTaskDependency({ taskId: task.id, kind: "task", refId: "missing", requiredState: "complete", dependencyType: "hard" });
    await reject();
    removeTaskDependency(dependency.id);
    const projectId = task.projectId;
    const { createRisk } = await import("../src/data/store");
    createRisk({ projectId, title: "Open issue", detail: "Blocks completion", category: "dependency", severity: "high", status: "open", blocksWork: true, source: { kind: "manual" }, relatedTargets: [{ kind: "task", id: task.id }], mitigationTaskId: null, ownerGroupId: null });
    await reject();
  }, { env });
});
