import assert from "node:assert/strict";
import { test } from "node:test";
import { withWorkflowAuthApp, createWorkflowAuthHeaders } from "./helpers/workflowAuth";
import { createQaReport, createQaRequest, createReportFinding, createRisk, createTask, createTestResult, createWorkLog, getSnapshot, resetStore, updateTask } from "../src/data/store";
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

test("only roster-linked mentor review applies QA approval and completion gate", async () => {
  await withWorkflowAuthApp(async ({ app }) => {
    const snapshot = getSnapshot();
    const task = snapshot.tasks.find((item) => !item.isBlocked && !snapshot.taskDependencies.some((edge) => edge.taskId === item.id))!;
    const member = snapshot.members[0]!;
    resetStore({ ...snapshot, workLogs: snapshot.workLogs.filter((item) => item.taskId !== task.id) });
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
    assert.ok(saved.reviewOrder > (snapshot.qaReviewSequence ?? 0));
    assert.equal(getSnapshot().qaReviewSequence, saved.reviewOrder);
    assert.equal(saved.createdAt, payload.createdAt);
    assert.equal(getSnapshot().tasks.find((item) => item.id === task.id)?.status, "complete");
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
    resetStore({ ...taskSnapshot, tasks: taskSnapshot.tasks.map((item) => item.id === task.id ? { ...item, status: "complete" as const } : item) });
    assert.equal(getSnapshot().qaFindings.find((item) => item.id === finding.id)?.status, "open", "task completion does not resolve inspection finding");
    const route = `/api/report-findings/${finding.id}/retest`;
    const lead = await createWorkflowAuthHeaders("lead");
    assert.equal((await app.inject({ method: "POST", url: route, headers: lead, payload: { result: "pass", notes: "rechecked" } })).statusCode, 403);
    const mentor = await createWorkflowAuthHeaders("mentor");
    const response = await app.inject({ method: "POST", url: route, headers: mentor, payload: { result: "pass", notes: "Verified repair", evidenceNotes: "Synthetic continuity pass" } });
    assert.equal(response.statusCode, 200, response.body);
    const after = getSnapshot();
    const saved = after.qaFindings.find((item) => item.id === finding.id)!;
    assert.equal(saved.status, "resolved");
    assert.equal(saved.retests?.[0]?.reviewedById, after.members.find((item) => item.email === "jordan.lee@mecorobotics.org")?.id);
    assert.equal(after.risks.find((item) => item.id === risk.id)?.status, "open", "one finding cannot resolve a risk still linked to another open finding");
    assert.equal(after.risks.find((item) => item.id === otherRisk.id)?.status, "open");
    assert.ok(after.actions?.some((item) => item.entityType === "qa-finding-retest" && item.entityId === finding.id && item.actorMemberId === saved.retests?.[0]?.reviewedById));
    const secondPass = await app.inject({ method: "POST", url: `/api/report-findings/${sharedFinding.id}/retest`, headers: mentor, payload: { result: "pass", notes: "Verified second issue" } });
    assert.equal(secondPass.statusCode, 200, secondPass.body);
    assert.equal(getSnapshot().risks.find((item) => item.id === risk.id)?.status, "open", "a risk shared by multiple findings is never owned by one finding's retest");
    const keyedPayload = { operationId: "retry-key", result: "fail", notes: "Keyed verification" };
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
    const beforeCollision = getSnapshot();
    const qaCollision = beforeCollision.qaFindings.find((item) => item.id === finding.id)!;
    resetStore({ ...beforeCollision, testFindings: [...beforeCollision.testFindings, { ...qaCollision, reportId: null, testResultId: "collision-source", id: finding.id }] });
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
    resetStore({ ...snapshot, testResults: [...snapshot.testResults, { ...result, id: "legacy-test-result", verificationOrder: undefined, targetRevisions: undefined, inspectedPartInstanceIds: undefined }], testFindings: [...snapshot.testFindings, { id: "test-finding-fixture", testResultId: result.id, reportId: null, targetRefs: [{ kind: "part-instance", id: part.id }], projectId: getSnapshot().projects[0]!.id, title: "Failed test", detail: "Synthetic", severity: "medium", status: "open", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
    const mentor = await createWorkflowAuthHeaders("mentor");
    const legacyList = await app.inject({ method: "GET", url: "/api/test-results", headers: mentor });
    assert.equal(legacyList.statusCode, 200);
    assert.equal(legacyList.json().items.find((item: { id: string }) => item.id === "legacy-test-result").needsReverification, true, "legacy evidence remains visible and is not given invented stamps");
    assert.equal(derivePartInstanceReadiness(part, getSnapshot()), "blocked");
    const response = await app.inject({ method: "POST", url: "/api/report-findings/test-finding-fixture/retest", headers: mentor, payload: { result: "pass", notes: "Synthetic retest", observedAt: "2099-01-01T00:00:00.000Z" } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().item.sourceType, "test");
    const saved = getSnapshot().testFindings.find((finding) => finding.id === "test-finding-fixture")!;
    assert.equal(saved.status, "resolved");
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
