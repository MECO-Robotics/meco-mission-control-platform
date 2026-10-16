import assert from "node:assert/strict";
import { test } from "node:test";
import { withWorkflowAuthApp, createWorkflowAuthHeaders } from "./helpers/workflowAuth";
import { createPartInstance, createQaReport, createQaRequest, createReportFinding, createRisk, createSubsystem, createTask, createTaskDependency, createTestResult, createWorkLog, getSnapshot, resetStore, updateRisk, updateTask, updateTaskDependency } from "../src/data/store";
import { derivePartInstanceReadiness } from "../src/domain/readiness";
import { evaluateTaskCompletion } from "../src/domain/workflows";
import { reportFromQaReport } from "../src/data/store/reportDerivations";
import type { SnapshotView } from "../src/domain/types";

const env = { API_RATE_LIMIT_MAX_REQUESTS: "100" };

test("task create and resulting-target completion cannot bypass frozen QA coverage", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => !item.isBlocked)!;
    const mentor = await createWorkflowAuthHeaders("mentor");
    const completePayload = { projectId: task.projectId, workTypeId: task.workTypeId, title: "Premature completion", summary: "No evidence", workstreamIds: [...task.workstreamIds], subsystemIds: [...task.subsystemIds], mechanismIds: [...task.mechanismIds], partInstanceIds: [...task.partInstanceIds], ownerId: task.ownerId, assigneeIds: [...task.assigneeIds], mentorId: task.mentorId, dueDate: task.dueDate, priority: task.priority, status: "complete", estimatedHours: 0, checklistItems: [], requiresDocumentation: false, photoUrl: "" };
    const beforeCount = getSnapshot().tasks.length;
    const response = await app.inject({ method: "POST", url: "/api/tasks", headers: mentor, payload: completePayload });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(getSnapshot().tasks.length, beforeCount, "complete creation has no published task");
    assert.throws(() => createTask({ ...task, status: "complete" } as unknown as Parameters<typeof createTask>[0]), /cannot be created complete/);

    const current = getSnapshot();
    const qaTask = current.tasks.find((item) => item.partInstanceIds.length > 0 && !item.isBlocked && !current.taskDependencies.some((edge) => edge.taskId === item.id))!;
    const inspectedIds = [...qaTask.partInstanceIds];
    const originalPart = current.partInstances.find((item) => item.id === inspectedIds[0])!;
    const addedPartId = `${originalPart.id}-added-after-qa`;
    resetStore({ ...current, partInstances: [...current.partInstances, { ...originalPart, id: addedPartId }] });
    updateTask(qaTask.id, { status: "waiting-for-qa", requiresDocumentation: false });
    createWorkLog({ taskId: qaTask.id, date: "2026-10-15", hours: 1, participantIds: [current.members[0]!.id], notes: "Synthetic completion evidence" });
    const reviewed = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: { reportType: "qa", projectId: qaTask.projectId, targetRefs: [{ kind: "task", id: qaTask.id }], createdByMemberId: current.members[0]!.id, participantIds: [current.members[0]!.id], mentorId: null, requestedById: null, result: "pass", summary: "Frozen target gate", notes: "Checked preexisting targets", status: "reviewed", createdAt: new Date().toISOString(), reviewedById: null, reviewedAt: null } });
    assert.equal(reviewed.statusCode, 201, reviewed.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === qaTask.id)?.status, "complete");
    const retarget = await app.inject({ method: "PATCH", url: `/api/tasks/${qaTask.id}`, headers: mentor, payload: { status: "complete", partInstanceIds: [...inspectedIds, addedPartId] } });
    assert.equal(retarget.statusCode, 409, retarget.body);
    assert.deepEqual(getSnapshot().tasks.find((item) => item.id === qaTask.id)?.partInstanceIds, inspectedIds);

    const resultingTask = { ...task, partInstanceIds: ["newly-added-instance"], requiresDocumentation: false };
    const approval = { id: "old-pass", status: "reviewed", result: "pass", reviewedById: "mentor", reviewedAt: "2026-01-01T00:00:00.000Z", reviewOrder: 1, targetRefs: [{ kind: "task", id: task.id }], inspectedPartInstanceIds: ["old-instance"], targetRevisions: { def: "A" } };
    const completion = evaluateTaskCompletion(resultingTask as never, { ...snapshot, tasks: [resultingTask], workLogs: [{ taskId: task.id }], artifacts: [], qaReports: [approval], partInstances: [{ id: "newly-added-instance", partDefinitionId: "def" }], partDefinitions: [{ id: "def", revision: "A" }] } as never);
    assert.equal(completion.canFinalize, false, "old QA approval cannot cover a target added before completion");
    const laterFailure = { ...approval, id: "later-failure", result: "iteration-worthy", reviewOrder: 2 };
    assert.equal(evaluateTaskCompletion(task as never, { ...snapshot, tasks: [task], workLogs: [{ taskId: task.id }], artifacts: [], qaReports: [approval, laterFailure], partInstances: snapshot.partInstances, partDefinitions: snapshot.partDefinitions } as never).canFinalize, false, "a later server-ordered failure supersedes an older pass for completion");
  }, { env });
});

test("completed tasks allow unrelated edits while reapproval changes stay gated", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const initial = getSnapshot();
    const candidate = initial.tasks.find((item) => item.partInstanceIds.length > 0)!;
    const addedPartId = `${candidate.partInstanceIds[0]}-completion-scope-change`;
    const baseTask = { ...candidate, status: "complete" as const, requiresDocumentation: false };
    const withoutTaskEvidence = {
      ...initial,
      partInstances: [...initial.partInstances, { ...initial.partInstances.find((part) => part.id === candidate.partInstanceIds[0])!, id: addedPartId }],
      tasks: initial.tasks.map((item) => item.id === candidate.id ? baseTask : item),
      workLogs: initial.workLogs.filter((item) => item.taskId !== candidate.id),
      artifacts: initial.artifacts.filter((item) => !item.targetRefs.some((ref) => ref.kind === "task" && ref.id === candidate.id)),
      qaReports: initial.qaReports.filter((item) => !item.targetRefs.some((ref) => ref.kind === "task" && ref.id === candidate.id)),
    };
    resetStore(withoutTaskEvidence);
    const mentor = await createWorkflowAuthHeaders("mentor");
    const historyBefore = getSnapshot();
    const metadata = await app.inject({ method: "PATCH", url: `/api/tasks/${candidate.id}`, headers: mentor, payload: { checklistItems: ["Historical completion retained"] } });
    assert.equal(metadata.statusCode, 200, metadata.body);
    assert.equal(metadata.json().item.status, "complete");
    assert.deepEqual(metadata.json().item.checklistItems, ["Historical completion retained"]);
    assert.equal(getSnapshot().tasks.find((item) => item.id === candidate.id)?.completionScopeReviewOrder, undefined, "legacy completion is not invalidated by an unrelated edit");
    assert.deepEqual(getSnapshot().workLogs, historyBefore.workLogs, "metadata edit preserves work history");
    assert.deepEqual(getSnapshot().qaReports, historyBefore.qaReports, "metadata edit does not rewrite historical reviews");

    const beforeRejectedScope = getSnapshot();
    const retarget = await app.inject({ method: "PATCH", url: `/api/tasks/${candidate.id}`, headers: mentor, payload: { partInstanceIds: [...baseTask.partInstanceIds, addedPartId] } });
    assert.equal(retarget.statusCode, 409, retarget.body);
    assert.deepEqual(getSnapshot().tasks.find((item) => item.id === candidate.id), beforeRejectedScope.tasks.find((item) => item.id === candidate.id), "retarget failure is atomic");
    const requireDocs = await app.inject({ method: "PATCH", url: `/api/tasks/${candidate.id}`, headers: mentor, payload: { requiresDocumentation: true } });
    assert.equal(requireDocs.statusCode, 409, requireDocs.body);
    assert.deepEqual(getSnapshot().tasks.find((item) => item.id === candidate.id), beforeRejectedScope.tasks.find((item) => item.id === candidate.id), "documentation gate failure is atomic");

    const reopened = { ...getSnapshot(), tasks: getSnapshot().tasks.map((item) => item.id === candidate.id ? { ...item, status: "in-progress" as const } : item) };
    resetStore(reopened);
    const beforeCompletionAttempt = getSnapshot();
    const premature = await app.inject({ method: "PATCH", url: `/api/tasks/${candidate.id}`, headers: mentor, payload: { status: "complete" } });
    assert.equal(premature.statusCode, 409, premature.body);
    assert.deepEqual(getSnapshot().tasks.find((item) => item.id === candidate.id), beforeCompletionAttempt.tasks.find((item) => item.id === candidate.id));
    assert.throws(() => updateTask(candidate.id, { status: "complete" }), /cannot be completed/ , "direct domain command uses the same completion policy");
  }, { env });
});

test("reviewed nonpass closes only its request and creates genuinely linked corrective records", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => item.status === "in-progress" && !item.isBlocked && !snapshot.taskDependencies.some((edge) => edge.taskId === item.id))!;
    const mentorMember = snapshot.members.find((item) => item.role === "mentor")!;
    const request = createQaRequest({ projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], subject: "Reviewed request closure", mentorId: mentorMember.id, requestedById: task.ownerId });
    const mentor = await createWorkflowAuthHeaders("mentor");
    const response = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: { reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }, { kind: "qa-request", id: request.id }], createdByMemberId: task.ownerId, participantIds: [task.ownerId], mentorId: mentorMember.id, requestedById: task.ownerId, result: "iteration-worthy", summary: "Reviewed failure", notes: "Synthetic reviewed failure", status: "reviewed", createdAt: "2099-01-01T00:00:00.000Z", reviewedById: "spoof", reviewedAt: "2099-01-01T00:00:00.000Z" } });
    assert.equal(response.statusCode, 201, response.body);
    const report = response.json().item;
    assert.equal(getSnapshot().qaRequests?.some((item) => item.id === request.id), false);
    const finding = getSnapshot().qaFindings.find((item) => item.reportId === report.id)!;
    const followUp = getSnapshot().tasks.find((item) => item.id === finding.correctiveTaskId)!;
    const risk = getSnapshot().risks.find((item) => item.id === finding.riskId)!;
    assert.ok(followUp);
    assert.equal(risk.source.kind, "report");
    assert.equal(risk.source.kind === "report" ? risk.source.id : null, report.id);
    assert.equal(risk.mitigationTaskId, followUp.id);
    assert.ok(followUp.partInstanceIds.every((id) => task.partInstanceIds.includes(id)));
  }, { env });
});

test("QA and test corrective links block task, hierarchy, and risk deletion without blocking retest", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const mentor = await createWorkflowAuthHeaders("mentor");
    const subsystem = createSubsystem({
      projectId: "project-robot-2026", name: "Corrective deletion fixture",
      description: "Corrective QA links must survive deletion attempts.",
      parentSubsystemId: null, responsibleEngineerId: "ava", mentorIds: ["marco"],
    });
    const childSubsystem = createSubsystem({
      projectId: "project-robot-2026", name: "Corrective deletion fixture child",
      description: "Creates an integration task under the deletable hierarchy.",
      parentSubsystemId: subsystem.id, responsibleEngineerId: null, mentorIds: [],
    });
    const sourceTask = getSnapshot().tasks.find((item) => item.title === `Integrate ${childSubsystem.name}`)!;
    assert.ok(sourceTask);
    const reportResponse = await app.inject({
      method: "POST", url: "/api/qa-reports/submit", headers: mentor,
      payload: {
        reportType: "qa", projectId: sourceTask.projectId, targetRefs: [{ kind: "task", id: sourceTask.id }],
        createdByMemberId: sourceTask.ownerId, participantIds: sourceTask.ownerId ? [sourceTask.ownerId] : [],
        mentorId: sourceTask.mentorId, requestedById: sourceTask.ownerId,
        result: "iteration-worthy", summary: "Corrective deletion guard", notes: "Synthetic reviewed failure",
        status: "reviewed", createdAt: new Date().toISOString(), reviewedById: null, reviewedAt: null,
      },
    });
    assert.equal(reportResponse.statusCode, 201, reportResponse.body);
    const report = reportResponse.json().item;
    const snapshot = getSnapshot();
    const followUpTask = snapshot.tasks.find((item) => item.id === report.followUpTaskId)!;
    const risk = snapshot.risks.find((item) => item.id === report.followUpRiskId)!;
    const finding = snapshot.qaFindings.find((item) => item.reportId === report.id)!;
    assert.ok(followUpTask && risk && finding);
    assert.equal(risk.mitigationTaskId, followUpTask.id);
    assert.equal(finding.correctiveTaskId, followUpTask.id);
    assert.equal(finding.riskId, risk.id);
    const testResult = createTestResult({ projectId: sourceTask.projectId, targetRefs: [{ kind: "task", id: sourceTask.id }], title: "Corrective link test control", status: "fail" });
    const testFinding = {
      id: "corrective-link-test-finding", reportId: null, testResultId: testResult.id,
      targetRefs: [{ kind: "task" as const, id: sourceTask.id }], projectId: sourceTask.projectId,
      title: "Corrective test finding", detail: "Exercise the test-finding deletion reference.",
      severity: "medium" as const, status: "open" as const, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), correctiveTaskId: followUpTask.id, riskId: risk.id,
    };
    resetStore({ ...getSnapshot(), testFindings: [...getSnapshot().testFindings, testFinding] });

    const beforeTaskDelete = getSnapshot();
    const taskDelete = await app.inject({ method: "DELETE", url: `/api/tasks/${followUpTask.id}`, headers: mentor });
    assert.equal(taskDelete.statusCode, 409, taskDelete.body);
    assert.match(taskDelete.json().message, /corrective QA.*risk-mitigation/i);
    assert.deepEqual(getSnapshot(), beforeTaskDelete, "rejected task deletion preserves links and audit history");

    const destination = createSubsystem({
      projectId: sourceTask.projectId, name: "Corrective retarget destination",
      description: "Keeps the corrective task outside the reviewed source scope.",
      parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [],
    });
    assert.ok(updateTask(followUpTask.id, { workstreamIds: [], subsystemIds: [destination.id], mechanismIds: [], partInstanceIds: [] }));
    const beforeSourceTaskDelete = getSnapshot();
    const sourceTaskDelete = await app.inject({ method: "DELETE", url: `/api/tasks/${sourceTask.id}`, headers: mentor });
    assert.equal(sourceTaskDelete.statusCode, 409, sourceTaskDelete.body);
    assert.deepEqual(getSnapshot(), beforeSourceTaskDelete, "source task deletion retains its corrective report and finding history");

    const beforeHierarchyDelete = getSnapshot();
    const hierarchyDelete = await app.inject({ method: "DELETE", url: `/api/subsystems/${subsystem.id}`, headers: mentor });
    assert.equal(hierarchyDelete.statusCode, 409, hierarchyDelete.body);
    assert.deepEqual(getSnapshot(), beforeHierarchyDelete, "rejected hierarchy cascade preserves the corrective workflow");

    const beforeRiskDelete = getSnapshot();
    const riskDelete = await app.inject({ method: "DELETE", url: `/api/risks/${risk.id}`, headers: mentor });
    assert.equal(riskDelete.statusCode, 409, riskDelete.body);
    assert.match(riskDelete.json().message, /referenced by corrective QA/i);
    assert.deepEqual(getSnapshot(), beforeRiskDelete, "rejected risk deletion preserves report/finding IDs and audit history");

    const retest = await app.inject({
      method: "POST", url: `/api/report-findings/${finding.id}/retest`, headers: mentor,
      payload: { sourceType: "qa", result: "pass", notes: "Synthetic corrective retest passed" },
    });
    assert.equal(retest.statusCode, 200, retest.body);
    assert.equal(getSnapshot().qaFindings.find((item) => item.id === finding.id)?.status, "resolved");

    const riskTargetSubsystem = createSubsystem({
      projectId: sourceTask.projectId, name: "Corrective risk target cleanup",
      description: "Deletion target for a linked risk with an external mitigation task.",
      parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [],
    });
    const riskTargetPart = createPartInstance({
      partDefinitionId: getSnapshot().partDefinitions[0]!.id,
      intendedSubsystemId: riskTargetSubsystem.id, intendedMechanismId: null,
      location: { kind: "stock", location: "Corrective risk deletion test stock" },
    });
    updateRisk(risk.id, { relatedTargets: [{ kind: "part-instance", id: riskTargetPart.id }] });
    assert.equal(getSnapshot().risks.find((item) => item.id === risk.id)?.mitigationTaskId, followUpTask.id);
    const beforeRiskTargetDelete = getSnapshot();
    const riskTargetDelete = await app.inject({ method: "DELETE", url: `/api/subsystems/${riskTargetSubsystem.id}`, headers: mentor });
    assert.equal(riskTargetDelete.statusCode, 409, riskTargetDelete.body);
    assert.deepEqual(getSnapshot(), beforeRiskTargetDelete, "linked risk deletion through a related physical target is atomic");

    const unreferencedRisk = createRisk({
      projectId: sourceTask.projectId, title: "Unreferenced deletion control", detail: "Manual control.",
      category: "other", severity: "low", status: "open", blocksWork: false,
      source: { kind: "manual" }, relatedTargets: [], mitigationTaskId: null,
      ownerGroupId: null,
    });
    const allowedRiskDelete = await app.inject({ method: "DELETE", url: `/api/risks/${unreferencedRisk.id}`, headers: mentor });
    assert.equal(allowedRiskDelete.statusCode, 200, allowedRiskDelete.body);
  }, { env });
});

test("finding scope cannot be self-authorized by an unrelated same-project task", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const projectTasks = snapshot.tasks.filter((item) => item.projectId === "project-robot-2026");
    const scopeIds = (task: typeof projectTasks[number]) => new Set([
      ...task.workstreamIds.map((id) => `workstream:${id}`), ...task.subsystemIds.map((id) => `subsystem:${id}`),
      ...task.mechanismIds.map((id) => `mechanism:${id}`), ...task.partInstanceIds.map((id) => `part-instance:${id}`),
    ]);
    const reviewedTask = projectTasks[0];
    const reviewedScope = reviewedTask && scopeIds(reviewedTask);
    const unrelatedTask = projectTasks.find((candidate) => candidate.id !== reviewedTask?.id &&
      [...scopeIds(candidate)].every((ref) => !reviewedScope?.has(ref)));
    assert.ok(reviewedTask && unrelatedTask);
    const report = createQaReport({ projectId: reviewedTask.projectId, targetRefs: [{ kind: "task", id: reviewedTask.id }], participantIds: [], result: "minor-fix", notes: "Reviewed scope", mentorId: null, requestedById: null });
    const current = getSnapshot();
    const reviewed = { ...report, status: "reviewed" as const, reviewedById: current.members.find((item) => item.role === "mentor")!.id, reviewedAt: new Date().toISOString(), reviewOrder: (current.qaReviewSequence ?? 0) + 1 };
    const correctiveTask = { ...reviewedTask, id: "scoped-corrective-task", title: "Scoped corrective work" };
    resetStore({ ...current, tasks: [...current.tasks, correctiveTask], qaReviewSequence: reviewed.reviewOrder, qaReports: current.qaReports.map((item) => item.id === report.id ? reviewed : item) });
    const before = getSnapshot();
    const response = await app.inject({ method: "POST", url: "/api/report-findings", headers: await createWorkflowAuthHeaders("student"), payload: {
      reportId: report.id, targetRefs: [{ kind: "task", id: unrelatedTask.id }], issueType: "Unrelated task issue", severity: "medium", notes: "Synthetic scope abuse", spawnedTaskId: unrelatedTask.id, spawnedRiskId: null, spawnedIterationId: null,
    } });
    assert.equal(response.statusCode, 400, response.body);
    assert.deepEqual(getSnapshot(), before, "rejected finding does not publish any data or corrective task attribution");
    const unrelatedWithoutTask = await app.inject({ method: "POST", url: "/api/report-findings", headers: await createWorkflowAuthHeaders("student"), payload: {
      reportId: report.id, targetRefs: [{ kind: "task", id: unrelatedTask.id }], issueType: "Unrelated target issue", severity: "medium", notes: "Synthetic target abuse", spawnedTaskId: null, spawnedRiskId: null, spawnedIterationId: null,
    } });
    assert.equal(unrelatedWithoutTask.statusCode, 400, unrelatedWithoutTask.body);
    assert.deepEqual(getSnapshot(), before, "unlinked findings use the same reviewed report scope without publishing");
    const validFinding = await app.inject({ method: "POST", url: "/api/report-findings", headers: await createWorkflowAuthHeaders("student"), payload: {
      reportId: report.id, targetRefs: [{ kind: "task", id: correctiveTask.id }], issueType: "Scoped issue", severity: "medium", notes: "Synthetic covered issue", spawnedTaskId: correctiveTask.id, spawnedRiskId: null, spawnedIterationId: null,
    } });
    assert.equal(validFinding.statusCode, 201, validFinding.body);
    const finding = validFinding.json().item;
    const retest = await app.inject({ method: "POST", url: `/api/report-findings/${finding.id}/retest`, headers: await createWorkflowAuthHeaders("mentor"), payload: { sourceType: "qa", result: "fail", notes: "Verified covered corrective work" } });
    assert.equal(retest.statusCode, 200, retest.body);
    const audit = getSnapshot().actions?.find((item) => item.entityType === "qa-finding-retest" && item.entityId === finding.id);
    assert.equal(audit?.taskId, correctiveTask.id, "valid corrective task remains the retest audit attribution");
    const parentFinding = await app.inject({ method: "POST", url: "/api/report-findings", headers: await createWorkflowAuthHeaders("student"), payload: {
      reportId: report.id, targetRefs: [{ kind: "task", id: reviewedTask.id }], issueType: "Parent task issue", severity: "low", notes: "Synthetic parent task finding", spawnedTaskId: null, spawnedRiskId: null, spawnedIterationId: null,
    } });
    assert.equal(parentFinding.statusCode, 201, "findings can still directly reference the reviewed parent task");
  }, { env });
});

test("QA submission rejects multiple task targets atomically while retaining multi-part targets", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const snapshot = getSnapshot();
    const tasks = snapshot.tasks.filter((item) => item.projectId === snapshot.tasks[0]?.projectId).slice(0, 2);
    assert.equal(tasks.length, 2);
    const task = tasks[0]!;
    const mentor = await createWorkflowAuthHeaders("mentor");
    const payload = {
      reportType: "qa", projectId: task.projectId,
      targetRefs: [
        { kind: "task", id: tasks[0]!.id }, { kind: "task", id: tasks[1]!.id },
        ...snapshot.partInstances.slice(0, 2).map((part) => ({ kind: "part-instance", id: part.id })),
      ],
      createdByMemberId: task.ownerId, participantIds: task.ownerId ? [task.ownerId] : [],
      mentorId: null, requestedById: null, result: "minor-fix", summary: "Check two tasks",
      notes: "Atomic scope check", status: "reviewed", createdAt: new Date().toISOString(),
      reviewedById: null, reviewedAt: null,
    };
    const before = getSnapshot();
    const rejected = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload });
    assert.equal(rejected.statusCode, 400, rejected.body);
    assert.match(rejected.json().message, /one task at a time/i);
    assert.deepEqual(getSnapshot(), before, "rejected submission publishes no report, finding, follow-up, risk, or request change");

    resetLimits();
    const single = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: {
      ...payload, targetRefs: [payload.targetRefs[0]!, ...payload.targetRefs.slice(2)],
    } });
    assert.equal(single.statusCode, 201, single.body);
    assert.equal(single.json().item.targetRefs.filter((ref: { kind: string }) => ref.kind === "task").length, 1);
    assert.equal(single.json().item.targetRefs.filter((ref: { kind: string }) => ref.kind === "part-instance").length, 2);
  });
});

test("reviewed task QA rejects a different existing project before publishing workflow records", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => snapshot.projects.some((project) => project.id !== item.projectId))!;
    const otherProject = snapshot.projects.find((project) => project.id !== task.projectId)!;
    const mentor = await createWorkflowAuthHeaders("mentor");
    const payload = {
      reportType: "qa", projectId: otherProject.id, targetRefs: [{ kind: "task", id: task.id }],
      createdByMemberId: task.ownerId, participantIds: task.ownerId ? [task.ownerId] : [],
      mentorId: null, requestedById: null, result: "iteration-worthy", summary: "Project ownership check",
      notes: "Synthetic cross-project QA submission", status: "reviewed", createdAt: new Date().toISOString(),
      reviewedById: null, reviewedAt: null,
    };
    const before = getSnapshot();
    const rejected = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload });
    assert.equal(rejected.statusCode, 400, rejected.body);
    assert.deepEqual(getSnapshot(), before, "rejection publishes no report, corrective task, finding, risk, request change, or action");

    const accepted = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: { ...payload, projectId: task.projectId } });
    assert.equal(accepted.statusCode, 201, accepted.body);
    const report = accepted.json().item;
    const after = getSnapshot();
    assert.equal(report.projectId, task.projectId);
    assert.ok(report.followUpTaskId && after.tasks.some((item) => item.id === report.followUpTaskId), "matching-project review creates its corrective task");
    assert.ok(report.followUpRiskId && after.risks.some((item) => item.id === report.followUpRiskId), "matching-project review creates its linked risk");
    assert.ok(after.qaFindings.some((finding) => finding.reportId === report.id && finding.correctiveTaskId === report.followUpTaskId), "matching-project review creates its linked finding");
    assert.ok(after.actions?.some((action) => action.entityType === "report" && action.entityId === report.id), "matching-project review records its action");
  }, { env });
});

test("only roster-linked mentor review applies QA approval and completion gate", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => !item.isBlocked && !snapshot.taskDependencies.some((edge) => edge.taskId === item.id))!;
    const member = snapshot.members[0]!;
    const existingOrders = [
      ...snapshot.qaReports.map((report) => report.reviewOrder ?? 0),
      ...snapshot.testResults.map((result) => result.verificationOrder ?? 0),
      ...[...snapshot.qaFindings, ...snapshot.testFindings].flatMap((finding) => (finding.retests ?? []).map((retest) => retest.verificationOrder ?? 0)),
    ];
    const restoredScopeWatermark = Math.max(snapshot.qaReviewSequence ?? 0, ...existingOrders) + 17;
    resetStore({
      ...snapshot,
      qaReviewSequence: 1,
      tasks: snapshot.tasks.map((item) => item.id === task.id ? { ...item, completionScopeReviewOrder: restoredScopeWatermark } : item),
      workLogs: snapshot.workLogs.filter((item) => item.taskId !== task.id),
    });
    updateTask(task.id, { status: "waiting-for-qa", requiresDocumentation: false });
    const initialTaskCount = getSnapshot().tasks.length;
    const payload = { reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], createdByMemberId: member.id, participantIds: [member.id], mentorId: null, requestedById: null, result: "pass", summary: "QA", notes: "Pass", evidenceNotes: "Synthetic only", createdAt: "2099-01-01T00:00:00.000Z", status: "submitted", reviewedById: "spoofed-reviewer", reviewedAt: "2099-01-01T00:00:00.000Z" };
    const lead = await createWorkflowAuthHeaders("lead");
    const draft = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: lead, payload: { ...payload, status: "draft" } });
    assert.equal(draft.statusCode, 201, draft.body);
    assert.equal(draft.json().item.status, "draft");
    assert.equal(getSnapshot().tasks.length, initialTaskCount, "draft evidence creates no corrective task");
    const submitted = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: lead, payload });
    assert.equal(submitted.statusCode, 201, submitted.body);
    assert.equal(submitted.json().item.status, "submitted");
    assert.equal(getSnapshot().tasks.length, initialTaskCount, "a submitted pass creates no corrective task");
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "waiting-for-qa");
    const mentor = await createWorkflowAuthHeaders("mentor");
    assert.equal((await app.inject({ method: "POST", url: "/api/qa-reports", headers: mentor, payload: { ...payload, status: "reviewed" } })).statusCode, 400, "report creation cannot bypass the reviewed transition");
    const genericReviewed = await app.inject({ method: "POST", url: "/api/reports", headers: mentor, payload: { ...payload, reportType: "qa", status: "reviewed", summary: payload.summary } });
    assert.equal(genericReviewed.statusCode, 400, "generic report creation rejects direct reviewed status with transition-route guidance");
    assert.match(genericReviewed.json().message, /POST \/api\/qa-reports\/submit/);
    const insufficient = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: { ...payload, status: "reviewed" } });
    assert.equal(insufficient.statusCode, 201, insufficient.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "waiting-for-qa", "review approval alone cannot bypass required work log");
    createWorkLog({ taskId: task.id, date: "2026-10-15", hours: 1, participantIds: [member.id], notes: "Synthetic verification evidence" });
    const reviewed = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: { ...payload, status: "reviewed" } });
    assert.equal(reviewed.statusCode, 201, reviewed.body);
    const saved = reviewed.json().item;
    const reviewer = getSnapshot().members.find((item) => item.email === "jordan.lee@mecorobotics.org")!;
    assert.equal(saved.reviewedById, reviewer.id);
    assert.notEqual(saved.reviewedAt, payload.reviewedAt);
    assert.ok(restoredScopeWatermark > (snapshot.qaReviewSequence ?? 0));
    assert.ok(saved.reviewOrder > restoredScopeWatermark, "fresh authenticated approval follows a restored task scope watermark");
    assert.equal(getSnapshot().qaReviewSequence, saved.reviewOrder);
    assert.equal(saved.createdAt, payload.createdAt);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete");
  }, { env });
});

test("part deletion invalidates task completion scope atomically until reviewed again", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const initial = getSnapshot();
    const task = initial.tasks.find((item) => item.id === "swerve-sensor-bundle")!;
    const partInstanceId = task.partInstanceIds[0]!;
    const mentor = await createWorkflowAuthHeaders("mentor");

    const completedBefore = getSnapshot();
    const rejectedDelete = await app.inject({ method: "DELETE", url: `/api/part-instances/${partInstanceId}`, headers: mentor });
    assert.equal(rejectedDelete.statusCode, 409, rejectedDelete.body);
    assert.deepEqual(getSnapshot(), completedBefore, "completed-task deletion publishes no part, target, or audit changes");

    const unreferencedPart = createPartInstance({
      partDefinitionId: initial.partDefinitions[0]!.id,
      intendedSubsystemId: null,
      intendedMechanismId: null,
      location: { kind: "stock", location: "Unreferenced test bin" },
    });
    const unreferencedDelete = await app.inject({ method: "DELETE", url: `/api/part-instances/${unreferencedPart.id}`, headers: mentor });
    assert.equal(unreferencedDelete.statusCode, 200, unreferencedDelete.body);
    assert.equal(getSnapshot().partInstances.some((item) => item.id === unreferencedPart.id), false, "unreferenced part deletion remains available");

    const reopened = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "in-progress", requiresDocumentation: false } });
    assert.equal(reopened.statusCode, 200, reopened.body);
    const beforeDelete = getSnapshot();
    const removed = await app.inject({ method: "DELETE", url: `/api/part-instances/${partInstanceId}`, headers: mentor });
    assert.equal(removed.statusCode, 200, removed.body);
    const afterDelete = getSnapshot();
    const changedTask = afterDelete.tasks.find((item) => item.id === task.id)!;
    assert.deepEqual(changedTask.partInstanceIds, []);
    assert.equal(afterDelete.partInstances.some((item) => item.id === partInstanceId), false);
    assert.equal(typeof changedTask.completionScopeReviewOrder, "number", "surviving task records a review watermark after its part target is removed");
    assert.ok(changedTask.completionScopeReviewOrder! >= (beforeDelete.tasks.find((item) => item.id === task.id)?.completionScopeReviewOrder ?? 0));

    const beforeOldApprovalCompletion = getSnapshot();
    const oldApprovalCompletion = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "complete" } });
    assert.equal(oldApprovalCompletion.statusCode, 409, oldApprovalCompletion.body);
    assert.deepEqual(getSnapshot(), beforeOldApprovalCompletion, "old approval cannot complete the task with no remaining part targets");

    updateTask(task.id, { status: "waiting-for-qa" });
    const reviewer = afterDelete.members.find((item) => item.email === "jordan.lee@mecorobotics.org")!;
    const freshPass = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: {
      reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }],
      createdByMemberId: task.ownerId ?? reviewer.id, participantIds: [task.ownerId ?? reviewer.id],
      mentorId: null, requestedById: null, result: "pass", summary: "Reviewed remaining scope", notes: "Synthetic passing review",
      status: "reviewed", createdAt: new Date().toISOString(), reviewedById: null, reviewedAt: null,
    } });
    assert.equal(freshPass.statusCode, 201, freshPass.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete", "fresh reviewed QA can complete the updated scope");
    assert.ok(freshPass.json().item.reviewOrder > changedTask.completionScopeReviewOrder!);
  }, { env });
});

test("authenticated completion rejects unresolved hard dependencies on the candidate task", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const initial = getSnapshot();
    const task = initial.tasks.find((item) => item.id === "swerve-sensor-bundle")!;
    const prerequisite = initial.tasks.find((item) => item.id !== task.id && item.status === "complete")!;
    const memberId = task.ownerId ?? initial.members[0]!.id;
    const mentor = await createWorkflowAuthHeaders("mentor");

    const reopened = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "in-progress", requiresDocumentation: false } });
    assert.equal(reopened.statusCode, 200, reopened.body);
    updateTask(task.id, { status: "waiting-for-qa" });
    const freshPass = await app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: {
      reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }],
      createdByMemberId: memberId, participantIds: [memberId], mentorId: null, requestedById: null,
      result: "pass", summary: "Prerequisite guard", notes: "Synthetic passing review", status: "reviewed",
      createdAt: new Date().toISOString(), reviewedById: null, reviewedAt: null,
    } });
    assert.equal(freshPass.statusCode, 201, freshPass.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete");

    const reopenedAgain = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "in-progress" } });
    assert.equal(reopenedAgain.statusCode, 200, reopenedAgain.body);
    const dependency = createTaskDependency({ taskId: task.id, kind: "task", refId: prerequisite.id, requiredState: "in-progress", dependencyType: "hard" });
    const beforeRejectedCompletion = getSnapshot();
    const rejected = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "complete" } });
    assert.equal(rejected.statusCode, 409, rejected.body);
    assert.deepEqual(getSnapshot(), beforeRejectedCompletion, "unresolved hard dependency rejection publishes no task or audit changes");

    updateTaskDependency(dependency.id, { requiredState: "complete" });
    const accepted = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "complete" } });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete", "completion succeeds after the prerequisite condition is satisfied");
  }, { env });
});

test("part revision and definition reassignment require fresh QA on completed task targets", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const initial = getSnapshot();
    const task = initial.tasks.find((item) => item.id === "swerve-sensor-bundle")!;
    const partInstance = initial.partInstances.find((item) => item.id === task.partInstanceIds[0])!;
    const originalDefinition = initial.partDefinitions.find((item) => item.id === partInstance.partDefinitionId)!;
    const replacementDefinition = initial.partDefinitions.find((item) => item.id !== originalDefinition.id && !initial.partInstances.some((part) => part.partDefinitionId === item.id))!;
    const mentor = await createWorkflowAuthHeaders("mentor");
    const evidence = { ...initial.artifacts[0]!, id: "synthetic-task-documentation", projectId: task.projectId, targetRefs: [{ kind: "task" as const, id: task.id }], title: "Synthetic task documentation" };
    resetStore({ ...initial, artifacts: [...initial.artifacts, evidence] });

    const beforeRevisionRejection = getSnapshot();
    const rejectedRevision = await app.inject({ method: "PATCH", url: `/api/part-definitions/${originalDefinition.id}`, headers: mentor, payload: { revision: "REV-C" } });
    assert.equal(rejectedRevision.statusCode, 409, rejectedRevision.body);
    assert.deepEqual(getSnapshot(), beforeRevisionRejection, "revision change rejected for completed inspection task is atomic");

    const beforeReassignmentRejection = getSnapshot();
    const rejectedReassignment = await app.inject({ method: "PATCH", url: `/api/part-instances/${partInstance.id}`, headers: mentor, payload: { partDefinitionId: replacementDefinition.id } });
    assert.equal(rejectedReassignment.statusCode, 409, rejectedReassignment.body);
    assert.deepEqual(getSnapshot(), beforeReassignmentRejection, "definition reassignment rejected for completed task is atomic");

    const reopen = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "in-progress" } });
    assert.equal(reopen.statusCode, 200, reopen.body);
    const revisionChange = await app.inject({ method: "PATCH", url: `/api/part-definitions/${originalDefinition.id}`, headers: mentor, payload: { revision: "REV-C" } });
    assert.equal(revisionChange.statusCode, 200, revisionChange.body);
    const revisionWatermark = getSnapshot().tasks.find((item) => item.id === task.id)!.completionScopeReviewOrder;
    assert.equal(typeof revisionWatermark, "number", "reopened task is marked when its inspected definition revision changes");
    const beforeOldRevisionCompletion = getSnapshot();
    const oldRevisionCompletion = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "complete" } });
    assert.equal(oldRevisionCompletion.statusCode, 409, oldRevisionCompletion.body);
    assert.deepEqual(getSnapshot(), beforeOldRevisionCompletion);

    const submitPass = async () => {
      updateTask(task.id, { status: "waiting-for-qa" });
      return app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: {
        reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }],
        createdByMemberId: task.ownerId, participantIds: task.ownerId ? [task.ownerId] : [initial.members[0]!.id],
        mentorId: null, requestedById: null, result: "pass", summary: "Revision matched review", notes: "Synthetic passing review",
        status: "reviewed", createdAt: new Date().toISOString(), reviewedById: null, reviewedAt: null,
      } });
    };
    const revisionPass = await submitPass();
    assert.equal(revisionPass.statusCode, 201, revisionPass.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete");

    const beforeCompletedReassignment = getSnapshot();
    const staleReassignment = await app.inject({ method: "PATCH", url: `/api/part-instances/${partInstance.id}`, headers: mentor, payload: { partDefinitionId: replacementDefinition.id } });
    assert.equal(staleReassignment.statusCode, 409, staleReassignment.body);
    assert.deepEqual(getSnapshot(), beforeCompletedReassignment, "reassignment cannot leave reviewed task complete with stale definition coverage");

    const reopenForReassignment = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "in-progress" } });
    assert.equal(reopenForReassignment.statusCode, 200, reopenForReassignment.body);
    const reassigned = await app.inject({ method: "PATCH", url: `/api/part-instances/${partInstance.id}`, headers: mentor, payload: { partDefinitionId: replacementDefinition.id } });
    assert.equal(reassigned.statusCode, 200, reassigned.body);
    const reassignmentWatermark = getSnapshot().tasks.find((item) => item.id === task.id)!.completionScopeReviewOrder;
    assert.equal(typeof reassignmentWatermark, "number", "reopened task is marked when its part instance changes definition");
    const beforeOldDefinitionCompletion = getSnapshot();
    const oldDefinitionCompletion = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "complete" } });
    assert.equal(oldDefinitionCompletion.statusCode, 409, oldDefinitionCompletion.body);
    assert.deepEqual(getSnapshot(), beforeOldDefinitionCompletion);

    const reassignmentPass = await submitPass();
    assert.equal(reassignmentPass.statusCode, 201, reassignmentPass.body);
    assert.equal(reassignmentPass.json().item.targetRevisions[replacementDefinition.id], replacementDefinition.revision);
    const completed = getSnapshot().tasks.find((item) => item.id === task.id)!;
    assert.equal(completed.status, "complete");
    const metadataUpdate = await app.inject({ method: "PATCH", url: `/api/part-definitions/${replacementDefinition.id}`, headers: mentor, payload: { name: "Harmless metadata rename" } });
    assert.equal(metadataUpdate.statusCode, 200, metadataUpdate.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete");
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.completionScopeReviewOrder, completed.completionScopeReviewOrder, "metadata-only definition edit does not invalidate completion approval");
  }, { env });
});

test("completion approval is invalidated by every normalized task and artifact scope change", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const initial = getSnapshot();
    const task = initial.tasks.find((item) => item.partInstanceIds.length > 0 && !item.isBlocked &&
      initial.workstreams.some((workstream) => workstream.projectId === item.projectId && !item.workstreamIds.includes(workstream.id)))!;
    const originalWorkstreams = [...task.workstreamIds];
    const addedWorkstream = initial.workstreams.find((workstream) => workstream.projectId === task.projectId && !originalWorkstreams.includes(workstream.id))!;
    const addedSubsystem = initial.subsystems.find((subsystem) => subsystem.projectId === task.projectId && !task.subsystemIds.includes(subsystem.id))!;
    const addedMechanism = initial.mechanisms.find((mechanism) => initial.subsystems.some((subsystem) => subsystem.id === mechanism.subsystemId && subsystem.projectId === task.projectId) && !task.mechanismIds.includes(mechanism.id))!;
    const addedPart = initial.partInstances.find((part) => part.intendedSubsystemId === task.subsystemIds[0] && part.intendedMechanismId === task.mechanismIds[0] && !task.partInstanceIds.includes(part.id));
    const otherProject = initial.projects.find((project) => project.id !== task.projectId)!;
    const otherSubsystem = initial.subsystems.find((subsystem) => subsystem.projectId === otherProject.id)!;
    const otherWorkType = initial.workTypes.find((workType) => workType.projectType === otherProject.projectType && workType.isActive)!;
    const mentor = await createWorkflowAuthHeaders("mentor");

    updateTask(task.id, {
      status: "in-progress", requiresDocumentation: false,
      workstreamIds: [...originalWorkstreams, addedWorkstream.id],
    });
    const scopedTask = getSnapshot().tasks.find((item) => item.id === task.id)!;
    const priorScopeOrder = scopedTask.completionScopeReviewOrder;
    assert.equal(typeof priorScopeOrder, "number", "scope change stores a durable review watermark");
    createWorkLog({ taskId: task.id, date: "2026-10-16", hours: 1, participantIds: task.ownerId ? [task.ownerId] : [initial.members[0]!.id], notes: "Synthetic completion evidence" });
    updateTask(task.id, { status: "waiting-for-qa" });
    const submitPass = () => app.inject({ method: "POST", url: "/api/qa-reports/submit", headers: mentor, payload: {
      reportType: "qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }],
      createdByMemberId: task.ownerId, participantIds: task.ownerId ? [task.ownerId] : [initial.members[0]!.id],
      mentorId: null, requestedById: null, result: "pass", summary: "Reviewed scope", notes: "Synthetic passing review",
      status: "reviewed", createdAt: new Date().toISOString(), reviewedById: null, reviewedAt: null,
    } });
    const firstPass = await submitPass();
    assert.equal(firstPass.statusCode, 201, firstPass.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete");

    const completeTask = getSnapshot().tasks.find((item) => item.id === task.id)!;
    const harmlessReorder = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: {
      workstreamIds: [...completeTask.workstreamIds].reverse(), title: `${completeTask.title} reviewed`,
    } });
    assert.equal(harmlessReorder.statusCode, 200, harmlessReorder.body);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.completionScopeReviewOrder, priorScopeOrder, "set reordering and metadata edits retain the existing watermark");

    const moveProject = {
      projectId: otherProject.id, workTypeId: otherWorkType.id, responsibleGroupId: null,
      workstreamIds: [], subsystemIds: [otherSubsystem.id], mechanismIds: [], partInstanceIds: [], manufacturingDetails: null,
    };
    const scopeChanges: Array<Record<string, unknown>> = [
      { workstreamIds: [addedWorkstream.id] },
      { workstreamIds: [...completeTask.workstreamIds, initial.workstreams.find((item) => item.projectId === task.projectId && !completeTask.workstreamIds.includes(item.id) && item.id !== addedWorkstream.id)!.id] },
      { subsystemIds: [...completeTask.subsystemIds, addedSubsystem.id] },
      { mechanismIds: [...completeTask.mechanismIds, addedMechanism.id], subsystemIds: [...completeTask.subsystemIds, addedMechanism.subsystemId] },
      ...(addedPart ? [{ partInstanceIds: [...completeTask.partInstanceIds, addedPart.id] }] : []),
      moveProject,
    ];
    for (const scopeChange of scopeChanges) {
      const before = getSnapshot();
      const rejected = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: scopeChange });
      assert.equal(rejected.statusCode, 409, rejected.body);
      assert.deepEqual(getSnapshot(), before, "completed-task scope rejection is atomic");
    }
    const beforeArtifactAddition = getSnapshot();
    const rejectedArtifactAddition = await app.inject({ method: "POST", url: "/api/artifacts", headers: mentor, payload: {
      projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], kind: "evidence",
      title: "Unreviewed added evidence", summary: "Synthetic", status: "published", uri: "",
    } });
    assert.equal(rejectedArtifactAddition.statusCode, 409, rejectedArtifactAddition.body);
    assert.deepEqual(getSnapshot(), beforeArtifactAddition, "adding task-linked evidence to a completed task is atomic");

    const beforeCompleteScopeChange = getSnapshot();
    const reopenedAndChanged = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: {
      status: "in-progress", workstreamIds: [addedWorkstream.id],
    } });
    assert.equal(reopenedAndChanged.statusCode, 200, reopenedAndChanged.body);
    const changedScope = getSnapshot().tasks.find((item) => item.id === task.id)!;
    assert.equal(typeof changedScope.completionScopeReviewOrder, "number");
    assert.ok(changedScope.completionScopeReviewOrder! >= (beforeCompleteScopeChange.qaReviewSequence ?? 0));
    assert.deepEqual(changedScope.partInstanceIds, task.partInstanceIds, "non-part scope change retains the reviewed part instances");
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap", headers: mentor });
    assert.equal(bootstrap.json().tasks.find((item: { id: string }) => item.id === task.id)?.completionScopeReviewOrder, changedScope.completionScopeReviewOrder);
    const beforeOldApprovalCompletion = getSnapshot();
    const oldApprovalCompletion = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, headers: mentor, payload: { status: "complete" } });
    assert.equal(oldApprovalCompletion.statusCode, 409, oldApprovalCompletion.body);
    assert.deepEqual(getSnapshot(), beforeOldApprovalCompletion, "failed completion attempt does not publish partial task or audit changes");
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "in-progress", "old approval cannot complete the changed scope");

    const artifactPayload = {
      projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], kind: "evidence",
      title: "Scope review evidence", summary: "Synthetic", status: "published", uri: "",
    };
    const artifact = await app.inject({ method: "POST", url: "/api/artifacts", headers: mentor, payload: artifactPayload });
    assert.equal(artifact.statusCode, 201, artifact.body);
    const artifactScopeOrder = getSnapshot().tasks.find((item) => item.id === task.id)?.completionScopeReviewOrder;
    assert.equal(typeof artifactScopeOrder, "number");
    assert.ok(artifactScopeOrder! >= (changedScope.completionScopeReviewOrder ?? 0), "task-linked artifact addition advances the watermark");

    updateTask(task.id, { status: "waiting-for-qa" });
    const freshPass = await submitPass();
    assert.equal(freshPass.statusCode, 201, freshPass.body);
    const latestTask = getSnapshot().tasks.find((item) => item.id === task.id)!;
    const latestReport = getSnapshot().qaReports.filter((report) => report.targetRefs.some((ref) => ref.kind === "task" && ref.id === task.id)).sort((left, right) => (right.reviewOrder ?? 0) - (left.reviewOrder ?? 0))[0]!;
    assert.equal(latestTask.status, "complete");
    assert.equal(typeof latestReport.reviewOrder, "number");
    assert.ok(latestReport.reviewOrder! > latestTask.completionScopeReviewOrder!);

    const beforeArtifactDelete = getSnapshot();
    const rejectedArtifactDelete = await app.inject({ method: "DELETE", url: `/api/artifacts/${artifact.json().item.id}`, headers: mentor });
    assert.equal(rejectedArtifactDelete.statusCode, 409, rejectedArtifactDelete.body);
    assert.deepEqual(getSnapshot(), beforeArtifactDelete, "removing task-linked artifact from a completed task is atomic");
  }, { env });
});

test("review ordering ignores future observation dates and frozen target scope", () => {
  const part = { id: "p1", partDefinitionId: "d1" };
  const task = { id: "t1", partInstanceIds: ["p1", "p2"], status: "complete" };
  const base = { partInstances: [part, { id: "p2", partDefinitionId: "d1" }], partDefinitions: [{ id: "d1", revision: "A" }], tasks: [task], risks: [], qaFindings: [], testFindings: [], testResults: [], milestoneRequirements: [] };
  const futurePass = { id: "future", status: "reviewed", reviewOrder: 1, createdAt: "2099-01-01T00:00:00.000Z", result: "pass", targetRefs: [{ kind: "task", id: "t1" }], targetRevisions: { d1: "A" }, inspectedPartInstanceIds: ["p1"] };
  const laterFail = { ...futurePass, id: "later-fail", reviewOrder: 2, createdAt: "2000-01-01T00:00:00.000Z", result: "minor-fix" };
  const snapshot = { ...base, qaReports: [futurePass, laterFail] } as unknown as SnapshotView;
  assert.equal(derivePartInstanceReadiness(part as never, snapshot), "qa", "server approval order selects the later failure despite older observation date");
  const onlyPass = { ...base, qaReports: [futurePass] } as unknown as SnapshotView;
  assert.equal(derivePartInstanceReadiness(part as never, onlyPass), "ready", "reviewed report covers the instance captured at approval");
  const testPass = { id: "test-pass", title: "Voltage", status: "pass", createdAt: "2099-01-01T00:00:00Z", verificationOrder: 1, targetRefs: [{ kind: "part-instance", id: "p1" }], targetRevisions: { d1: "A" }, inspectedPartInstanceIds: ["p1"] };
  const testFail = { ...testPass, id: "test-fail", status: "fail", createdAt: "2000-01-01T00:00:00Z", verificationOrder: 2 };
  assert.equal(derivePartInstanceReadiness(part as never, { ...base, qaReports: [], testResults: [testPass, testFail] } as unknown as SnapshotView), "blocked", "test server order wins over future observation dates");
  assert.equal(derivePartInstanceReadiness({ id: "p2", partDefinitionId: "d1" } as never, onlyPass), "not-ready", "future task target does not inherit old QA");
  assert.equal(derivePartInstanceReadiness(part as never, { ...base, qaReports: [], testResults: [testPass] } as unknown as SnapshotView), "ready");
  assert.equal(derivePartInstanceReadiness({ id: "p2", partDefinitionId: "d1" } as never, { ...base, qaReports: [], testResults: [testPass] } as unknown as SnapshotView), "not-ready", "a test pass cannot cover a later instance absent from frozen membership");
  const legacy = { ...base, qaReports: [{ ...futurePass, reviewOrder: undefined, inspectedPartInstanceIds: undefined }] } as unknown as SnapshotView;
  assert.equal(derivePartInstanceReadiness(part as never, legacy), "not-ready", "legacy unstamped evidence requires re-verification");
  const legacyReport = { ...futurePass, reviewOrder: undefined, inspectedPartInstanceIds: undefined, reviewedAt: null, reviewedById: null, targetRevisions: undefined } as never;
  assert.equal(reportFromQaReport(undefined, legacyReport)?.needsReverification, true, "legacy review exposes an explicit re-verification hint");
  assert.equal(derivePartInstanceReadiness({ ...part, id: "p2" } as never, { ...base, qaReports: [], tasks: [{ ...task, status: "complete" }] } as unknown as SnapshotView), "not-ready", "completed task alone is insufficient evidence");
});

test("finding retest is authorized, attributed, audited and closes only its linked risk", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks[0]!;
    const report = createQaReport({ projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], participantIds: [], result: "minor-fix", notes: "Synthetic issue", mentorId: null, requestedById: null });
    const reportSnapshot = getSnapshot();
    const reportWithApproval = { ...report, status: "reviewed" as const, reviewedById: reportSnapshot.members.find((item) => item.role === "mentor")!.id, reviewedAt: new Date().toISOString(), reviewOrder: (reportSnapshot.qaReviewSequence ?? 0) + 1, inspectedPartInstanceIds: task.partInstanceIds, targetRevisions: Object.fromEntries(task.partInstanceIds.flatMap((id) => { const part = reportSnapshot.partInstances.find((item) => item.id === id); const definition = part && reportSnapshot.partDefinitions.find((item) => item.id === part.partDefinitionId); return part && definition ? [[definition.id, definition.revision]] : []; })), followUpTaskId: task.id, followUpRiskId: "pending" };
    resetStore({ ...reportSnapshot, qaReviewSequence: reportWithApproval.reviewOrder, qaReports: reportSnapshot.qaReports.map((item) => item.id === report.id ? reportWithApproval : item) });
    const risk = createRisk({ projectId: task.projectId, title: "Finding risk", detail: "Synthetic", category: "qa", severity: "medium", status: "open", blocksWork: true, source: { kind: "report", id: report.id }, relatedTargets: [{ kind: "task", id: task.id }], mitigationTaskId: task.id, ownerGroupId: null });
    const approvedReport = getSnapshot().qaReports.find((item) => item.id === report.id)!;
    resetStore({ ...getSnapshot(), qaReports: getSnapshot().qaReports.map((item) => item.id === report.id ? { ...approvedReport, followUpRiskId: risk.id } : item) });
    const otherRisk = createRisk({ projectId: task.projectId, title: "Unrelated risk", detail: "Keep open", category: "qa", severity: "low", status: "open", blocksWork: false, source: { kind: "manual" }, relatedTargets: [{ kind: "task", id: task.id }], mitigationTaskId: null, ownerGroupId: null });
    const finding = createReportFinding({ reportId: report.id, targetRefs: [{ kind: "task", id: task.id }], issueType: "Connector check", severity: "medium", notes: "Synthetic finding", spawnedTaskId: task.id, spawnedRiskId: risk.id, spawnedIterationId: null })!;
    const sharedFinding = createReportFinding({ reportId: report.id, targetRefs: [{ kind: "task", id: task.id }], issueType: "Shared risk issue", severity: "low", notes: "Keep shared risk open", spawnedTaskId: task.id, spawnedRiskId: risk.id, spawnedIterationId: null })!;
    assert.equal(getSnapshot().risks.find((item) => item.id === risk.id)?.mitigationTaskId, task.id);
    const taskSnapshot = getSnapshot();
    const crossCategoryFinding = { id: finding.id, reportId: null, testResultId: "same-id-test-result", targetRefs: finding.targetRefs, projectId: task.projectId, title: "Same ID test finding", detail: "Cross-category risk owner", severity: "medium" as const, status: "open" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), riskId: risk.id };
    resetStore({ ...taskSnapshot, tasks: taskSnapshot.tasks.map((item) => item.id === task.id ? { ...item, status: "complete" as const } : item), testFindings: [...taskSnapshot.testFindings, crossCategoryFinding] });
    assert.equal(getSnapshot().qaFindings.find((item) => item.id === finding.id)?.status, "open", "task completion does not resolve inspection finding");
    const route = `/api/report-findings/${finding.id}/retest`;
    const lead = await createWorkflowAuthHeaders("lead");
    assert.equal((await app.inject({ method: "POST", url: route, headers: lead, payload: { sourceType: "qa", result: "pass", notes: "rechecked" } })).statusCode, 403);
    const mentor = await createWorkflowAuthHeaders("mentor");
    const ambiguous = await app.inject({ method: "POST", url: route, headers: mentor, payload: { result: "pass", notes: "Verified repair" } });
    assert.equal(ambiguous.statusCode, 409, "same-ID findings still require category disambiguation");
    const response = await app.inject({ method: "POST", url: route, headers: mentor, payload: { sourceType: "qa", result: "pass", notes: "Verified repair", evidenceNotes: "Synthetic continuity pass" } });
    assert.equal(response.statusCode, 200, response.body);
    const after = getSnapshot();
    const saved = after.qaFindings.find((item) => item.id === finding.id)!;
    assert.equal(saved.status, "resolved");
    assert.equal(after.testFindings.find((item) => item.id === finding.id)?.status, "open", "the same-ID finding in the other category remains open");
    assert.equal(saved.retests?.[0]?.reviewedById, after.members.find((item) => item.email === "jordan.lee@mecorobotics.org")?.id);
    assert.equal(after.risks.find((item) => item.id === risk.id)?.status, "open", "one finding cannot resolve a risk still linked to another open finding");
    assert.equal(after.risks.find((item) => item.id === otherRisk.id)?.status, "open");
    assert.ok(after.actions?.some((item) => item.entityType === "qa-finding-retest" && item.entityId === finding.id && item.actorMemberId === saved.retests?.[0]?.reviewedById));
    const secondPass = await app.inject({ method: "POST", url: `/api/report-findings/${sharedFinding.id}/retest`, headers: mentor, payload: { result: "pass", notes: "Verified second issue" } });
    assert.equal(secondPass.statusCode, 200, secondPass.body);
    assert.equal(getSnapshot().risks.find((item) => item.id === risk.id)?.status, "open", "a risk shared by multiple findings is never owned by one finding's retest");
    const keyedPayload = { operationId: "retry-key", sourceType: "qa", result: "fail", notes: "Keyed verification" };
    const keyedFirst = await app.inject({ method: "POST", url: route, headers: mentor, payload: keyedPayload });
    assert.equal(keyedFirst.statusCode, 200, keyedFirst.body);
    const countAfterFirst = getSnapshot().qaFindings.find((item) => item.id === finding.id)!.retests!.length;
    const replay = await app.inject({ method: "POST", url: route, headers: mentor, payload: keyedPayload });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(getSnapshot().qaFindings.find((item) => item.id === finding.id)!.retests!.length, countAfterFirst);
    assert.equal(replay.json().item.retests.at(-1).operationId, "retry-key");
    const changed = await app.inject({ method: "POST", url: route, headers: mentor, payload: { ...keyedPayload, notes: "Changed payload" } });
    assert.equal(changed.statusCode, 409);
    assert.equal(getSnapshot().qaFindings.find((item) => item.id === finding.id)!.retests!.length, countAfterFirst);
    const admin = await createWorkflowAuthHeaders("admin");
    assert.equal((await app.inject({ method: "POST", url: route, headers: admin, payload: keyedPayload })).statusCode, 200, "same key is independent across authenticated reviewers");
    assert.equal(getSnapshot().qaFindings.find((item) => item.id === finding.id)!.retests!.length, countAfterFirst + 1);
    assert.equal((await app.inject({ method: "POST", url: route, headers: mentor, payload: { result: "fail", notes: "Ambiguous" } })).statusCode, 409);
    const explicitTest = await app.inject({ method: "POST", url: route, headers: mentor, payload: { sourceType: "test", result: "fail", notes: "Disambiguated" } });
    assert.equal(explicitTest.statusCode, 200, explicitTest.body);
    assert.equal(explicitTest.json().item.sourceType, "test");
  }, { env });
});

test("test finding retest preserves category and supersedes only the linked frozen failure", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const part = getSnapshot().partInstances[0]!;
    const result = createTestResult({ projectId: getSnapshot().projects[0]!.id, targetRefs: [{ kind: "part-instance", id: part.id }], title: "Synthetic retest fixture", status: "fail" });
    const unrelatedResult = createTestResult({ projectId: getSnapshot().projects[0]!.id, targetRefs: [{ kind: "part-instance", id: part.id }], title: "Unrelated failure", status: "fail" });
    const snapshot = getSnapshot();
    const testFinding = { id: "test-finding-fixture", testResultId: result.id, reportId: null, targetRefs: [{ kind: "part-instance" as const, id: part.id }], projectId: getSnapshot().projects[0]!.id, title: "Failed test", detail: "Synthetic", severity: "medium" as const, status: "open" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    resetStore({ ...snapshot, testResults: [...snapshot.testResults, { ...result, id: "legacy-test-result", verificationOrder: undefined, targetRevisions: undefined, inspectedPartInstanceIds: undefined }], testFindings: [...snapshot.testFindings, testFinding] });
    const generatedRisk = createRisk({ projectId: testFinding.projectId, title: "Test finding risk", detail: "Synthetic exclusive risk source", category: "qa", severity: "medium", status: "open", blocksWork: true, source: { kind: "test-result", id: result.id }, relatedTargets: testFinding.targetRefs, mitigationTaskId: null, ownerGroupId: null });
    resetStore({ ...getSnapshot(), testFindings: getSnapshot().testFindings.map((item) => item.id === testFinding.id ? { ...item, riskId: generatedRisk.id } : item), qaFindings: [...getSnapshot().qaFindings, { id: testFinding.id, reportId: "same-id-qa-source", targetRefs: testFinding.targetRefs, projectId: testFinding.projectId, title: "Same ID QA finding", detail: "Cross-category risk owner", severity: "medium" as const, status: "open" as const, createdAt: testFinding.createdAt, updatedAt: testFinding.updatedAt, riskId: generatedRisk.id }] });
    const mentor = await createWorkflowAuthHeaders("mentor");
    const legacyList = await app.inject({ method: "GET", url: "/api/test-results", headers: mentor });
    assert.equal(legacyList.statusCode, 200);
    assert.equal(legacyList.json().items.find((item: { id: string }) => item.id === "legacy-test-result").needsReverification, true, "legacy evidence remains visible and is not given invented stamps");
    assert.equal(derivePartInstanceReadiness(part, getSnapshot()), "blocked");
    const testFindingRoute = "/api/report-findings/test-finding-fixture/retest";
    const ambiguous = await app.inject({ method: "POST", url: testFindingRoute, headers: mentor, payload: { result: "pass", notes: "Synthetic retest" } });
    assert.equal(ambiguous.statusCode, 409, "cross-category ID collision remains disambiguated for test findings");
    const response = await app.inject({ method: "POST", url: testFindingRoute, headers: mentor, payload: { sourceType: "test", result: "pass", notes: "Synthetic retest", observedAt: "2099-01-01T00:00:00.000Z" } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().item.sourceType, "test");
    const saved = getSnapshot().testFindings.find((finding) => finding.id === "test-finding-fixture")!;
    assert.equal(saved.status, "resolved");
    assert.equal(getSnapshot().qaFindings.find((finding) => finding.id === testFinding.id)?.status, "open", "cross-category QA finding remains open after test retest");
    assert.equal(getSnapshot().risks.find((risk) => risk.id === generatedRisk.id)?.status, "open", "test retest cannot clear a risk shared with its same-ID QA finding");
    assert.equal(saved.retests?.[0]?.supersedesId, result.id);
    assert.equal(saved.retests?.[0]?.observedAt, "2099-01-01T00:00:00.000Z");
    assert.ok(saved.retests?.[0]?.verificationOrder);
    assert.ok(saved.retests![0]!.verificationOrder! > result.verificationOrder!);
    const isolatedAfter = getSnapshot();
    assert.deepEqual(saved.retests?.[0]?.inspectedPartInstanceIds, [part.id]);
    assert.equal(saved.retests?.[0]?.targetRevisions?.[part.partDefinitionId], isolatedAfter.partDefinitions.find((item) => item.id === part.partDefinitionId)?.revision);
    const isolatedReadiness = { ...isolatedAfter, tasks: [], risks: [], qaReports: [], qaFindings: [], testResults: [isolatedAfter.testResults.find((item) => item.id === result.id)!] };
    assert.equal(derivePartInstanceReadiness(part, isolatedReadiness), "not-ready", "a passing retest clears its linked failure without claiming overall readiness");
    assert.equal(derivePartInstanceReadiness(part, { ...isolatedReadiness, testResults: [isolatedReadiness.testResults[0]!, isolatedAfter.testResults.find((item) => item.id === unrelatedResult.id)!] }), "blocked", "an unrelated failure remains blocking after this finding passes retest");
  }, { env });
});
