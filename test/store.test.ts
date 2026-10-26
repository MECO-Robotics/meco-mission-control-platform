import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  createPlatformStore,
  startInteractiveTutorialSession,
  runWithInteractiveTutorialSession,
  createTask,
  createPurchaseItem,
  acquireSnapshotMutation,
  createMaterial,
  createMaterialTransaction,
  updateProject,
  updateWorkstream,
  updateRisk,
  updateMaterial,
  updateArtifact,
  updateMechanism,
  updatePurchaseItem,
  receivePurchaseItem,
  createWorkLog,
  updateWorkLog,
  removeWorkLog,
  createProject,
  createSeason,
  createMechanism,
  createSubsystem,
  createWorkstream,
  createPartDefinition,
  createPartInstance,
  createQaRequest,
  createRisk,
  createMember,
  createMilestone,
  getQaRequests,
  getSnapshot,
  getTaskTargets,
  getTutorialBaselineState,
  getMilestonesForTask,
  getTasksForMilestone,
  removeMember,
  removePartDefinition,
  removeSubsystem,
  removeTask,
  recordAuditAction,
  resetStore,
  updateSubsystem,
  updatePartDefinition,
  updateMember,
  updatePartInstance,
  updateTask,
} from "../src/data/store";
import { deriveMilestoneReadiness, derivePartInstanceReadiness } from "../src/domain/readiness";

const seed = getSnapshot();
const ROBOT_PROJECT_ID = seed.projects.find((project) => project.projectType === "robot" && project.seasonId === "season-2026-meco")!.id;
const ROBOT_SEASON_ID = seed.projects.find((project) => project.id === ROBOT_PROJECT_ID)!.seasonId;
const ROBOT_PART_INSTANCE_ID = seed.partInstances.find((part) => part.intendedSubsystemId)!.id;
const ROBOT_SUBSYSTEM_ID = seed.partInstances.find((part) => part.id === ROBOT_PART_INSTANCE_ID)!.intendedSubsystemId!;
const OTHER_ROBOT_SUBSYSTEM_ID = seed.subsystems.find((subsystem) => subsystem.projectId === ROBOT_PROJECT_ID && subsystem.id !== ROBOT_SUBSYSTEM_ID)!.id;
const ROBOT_MECHANISM_ID = seed.partInstances.find((part) => part.id === ROBOT_PART_INSTANCE_ID)!.intendedMechanismId!;
const ROBOT_PART_DEFINITION_ID = seed.partInstances.find((part) => part.id === ROBOT_PART_INSTANCE_ID)!.partDefinitionId;
const ROBOT_TASK_ID = seed.tasks.find((task) => task.projectId === ROBOT_PROJECT_ID && task.status !== "complete" && !seed.taskDependencies.some((edge) => edge.taskId === task.id))!.id;
const OTHER_ROBOT_TASK_ID = seed.tasks.find((task) => task.projectId === ROBOT_PROJECT_ID && task.id !== ROBOT_TASK_ID && task.status !== "complete")!.id;
const STUDENT_ID = seed.members.find((member) => member.role === "student")!.id;
const OTHER_STUDENT_ID = seed.members.find((member) => member.role === "student" && member.id !== STUDENT_ID)!.id;
const MENTOR_ID = seed.members.find((member) => member.role === "mentor")!.id;
const ADMIN_ID = seed.members.find((member) => member.role === "lead")!.id;
const ROBOT_MATERIAL_ID = seed.materials[0]!.id;
const ROBOT_WORKLOG_ID = seed.workLogs.find((workLog) => workLog.participantIds.includes(MENTOR_ID))?.id ?? seed.workLogs[0]!.id;

beforeEach(() => {
  resetStore();
});

function hasCorrectiveHistory(snapshot: ReturnType<typeof getSnapshot>, taskId: string) {
  const linkedReports = snapshot.qaReports.filter((report) => report.targetRefs.some((ref) => ref.kind === "task" && ref.id === taskId));
  return snapshot.qaReports.some((report) => report.followUpTaskId === taskId) ||
    snapshot.qaFindings.some((finding) => finding.correctiveTaskId === taskId) ||
    snapshot.testFindings.some((finding) => finding.correctiveTaskId === taskId) ||
    snapshot.risks.some((risk) => risk.mitigationTaskId === taskId) ||
    linkedReports.some((report) => report.followUpTaskId != null || report.followUpRiskId != null ||
      snapshot.qaFindings.some((finding) => finding.reportId === report.id) ||
      snapshot.testFindings.some((finding) => finding.reportId === report.id));
}

function mutableTaskInput(task: ReturnType<typeof getSnapshot>["tasks"][number]) {
  return {
    ...task,
    assigneeIds: [...task.assigneeIds],
    checklistItems: [...task.checklistItems],
    mechanismIds: [...task.mechanismIds],
    partInstanceIds: [...task.partInstanceIds],
    scheduleRefs: [...task.scheduleRefs],
    subsystemIds: [...task.subsystemIds],
    workstreamIds: [...task.workstreamIds],
    manufacturingDetails: null,
  };
}

test("purchase commands keep receipt history owned by receiving", () => {
  const task = getSnapshot().tasks[0]!;
  const material = createMaterial({ name: "Receipt ownership stock", category: "hardware", unit: "each", reorderPoint: 0, location: "Receiving shelf", preferredVendorId: null, notes: "" });
  const createInput = {
    taskId: task.id, kind: "cots-goods" as const, partDefinitionId: null, materialId: material.id, title: "Receipt ownership test", quantity: 10,
    quotes: [], selectedQuoteId: null, approvalStatus: "approved" as const, approvedById: null, approvedAt: null, purchaseOrderNumber: null,
    orderStatus: "ordered" as const, finalCost: null, expectedDeliveryDate: null, trackingNumber: null, trackingUrl: null, orderedAt: null, deliveredAt: null,
  };
  const beforeCreate = getSnapshot();
  const forgedReceipt = { id: "forged-receipt", quantity: 99, location: "Forged shelf", receivedAt: new Date().toISOString(), partInstanceIds: ["forged-instance"] };
  const created = createPurchaseItem({ ...createInput, receipts: [forgedReceipt] } as unknown as Parameters<typeof createPurchaseItem>[0]);
  assert.deepEqual(created.receipts, []);
  assert.equal(getSnapshot().partInstances.length, beforeCreate.partInstances.length);
  assert.equal(getSnapshot().actions?.length, (beforeCreate.actions?.length ?? 0) + 1);

  assert.ok(!("error" in createMaterialTransaction(material.id, { operationId: "collision-id", movementType: "receipt", quantity: 1, reason: "Separate receipt" })));
  assert.equal(receivePurchaseItem(created.id, { operationId: "collision-id", quantity: 1, location: "Receiving shelf" }).error, "operation-conflict");
  assert.equal(getSnapshot().materials.find((item) => item.id === material.id)?.onHandQuantity, 1);
  const received = receivePurchaseItem(created.id, { operationId: "domain-receipt", quantity: 4, location: "Receiving shelf" });
  assert.ok("receipt" in received);
  assert.equal(getSnapshot().materials.find((item) => item.id === material.id)?.onHandQuantity, 5);
  assert.equal(getSnapshot().materialTransactions.filter((row) => row.purchaseItemId === created.id).length, 1);
  const afterReceive = getSnapshot();
  const beforeReplayActions = afterReceive.actions?.length ?? 0;
  const replay = receivePurchaseItem(created.id, { operationId: "domain-receipt", quantity: 4, location: "Receiving shelf" });
  assert.ok("replayed" in replay && replay.replayed);
  assert.equal(getSnapshot().actions?.length, beforeReplayActions, "idempotent replay does not add stock or audit actions");

  const storedReceipt = getSnapshot().purchaseItems.find((item) => item.id === created.id)!.receipts;
  const beforeUnsafeUpdate = getSnapshot();
  const unsafeReceiptValues = [undefined, [], [{ ...forgedReceipt, id: "replacement-receipt" }]];
  unsafeReceiptValues.forEach((receipts, index) => {
    updatePurchaseItem(created.id, { title: `Legitimate purchase edit ${index + 1}`, receipts } as unknown as Parameters<typeof updatePurchaseItem>[1]);
    assert.deepEqual(getSnapshot().purchaseItems.find((item) => item.id === created.id)!.receipts, storedReceipt);
    assert.deepEqual(getSnapshot().actions?.at(-1)?.changedFields, ["title"]);
  });
  const afterUnsafeUpdate = getSnapshot();
  const updated = afterUnsafeUpdate.purchaseItems.find((item) => item.id === created.id)!;
  assert.equal(updated.title, "Legitimate purchase edit 3");
  assert.deepEqual(updated.receipts, storedReceipt);
  assert.equal(updated.quantity, beforeUnsafeUpdate.purchaseItems.find((item) => item.id === created.id)!.quantity);
  assert.equal(afterUnsafeUpdate.partInstances.length, beforeUnsafeUpdate.partInstances.length);
  assert.deepEqual(afterUnsafeUpdate.partInstances, beforeUnsafeUpdate.partInstances);
  assert.deepEqual(afterUnsafeUpdate.actions?.at(-1)?.changedFields, ["title"]);
});

test("material stock movements are idempotent, append-only, and reject negative balances", () => {
  const material = createMaterial({ name: "Ledger wire", category: "consumable", unit: "ft", reorderPoint: 1, location: "Rack", preferredVendorId: null, notes: "" });
  const receipt = createMaterialTransaction(material.id, { operationId: "ledger-receipt-1", movementType: "receipt", quantity: 8, reason: "Received stock" });
  assert.ok(!("error" in receipt));
  assert.equal(receipt.material?.onHandQuantity, 8);
  const replay = createMaterialTransaction(material.id, { operationId: "ledger-receipt-1", movementType: "receipt", quantity: 8, reason: "Received stock" });
  assert.ok(!("error" in replay));
  assert.equal(replay.replayed, true);
  const consumption = createMaterialTransaction(material.id, { operationId: "ledger-consumption-1", movementType: "consumption", quantity: 3, reason: "Cut wire for robot" });
  assert.ok(!("error" in consumption));
  assert.equal(consumption.material?.onHandQuantity, 5);
  assert.equal(createMaterialTransaction(material.id, { operationId: "ledger-consumption-2", movementType: "consumption", quantity: 6, reason: "Too much" }).error, "insufficient-stock");
  assert.equal(getSnapshot().materialTransactions.filter((transaction) => transaction.materialId === material.id).length, 2);
});

test("readiness ignores stale QA and test outcomes after a part revision changes", () => {
  const seed = getSnapshot();
  const part = seed.partInstances.find((item) => item.id === ROBOT_PART_INSTANCE_ID)!;
  const definition = seed.partDefinitions.find((item) => item.id === part.partDefinitionId)!;
  const relatedTasks = seed.tasks.filter((item) => item.partInstanceIds.includes(part.id)).map((item) => ({ ...item, status: "complete" as const }));
  const snapshot = {
    ...seed,
    tasks: relatedTasks,
    risks: [],
    qaFindings: [],
    testFindings: [],
    qaReports: [],
    partDefinitions: seed.partDefinitions.map((item) => item.id === definition.id ? { ...item, revision: "C" } : item),
  };
  const staleFail = {
    id: "stale-fail", projectId: ROBOT_PROJECT_ID, targetRefs: [{ kind: "part-instance" as const, id: part.id }],
    title: "Old revision test", status: "fail" as const, createdAt: "2026-04-01T00:00:00.000Z", verificationOrder: 1, targetRevisions: { [definition.id]: definition.revision }, inspectedPartInstanceIds: [part.id],
  };
  assert.equal(derivePartInstanceReadiness(part, { ...snapshot, testResults: [staleFail] }), "not-ready");
  const currentPass = { ...staleFail, status: "pass" as const, createdAt: "2026-04-02T00:00:00.000Z", verificationOrder: 2, targetRevisions: { [definition.id]: "C" } };
  assert.equal(derivePartInstanceReadiness(part, { ...snapshot, testResults: [staleFail, currentPass] }), "ready");
  const currentFail = { ...currentPass, status: "fail" as const, createdAt: "2026-04-03T00:00:00.000Z", verificationOrder: 3 };
  assert.equal(derivePartInstanceReadiness(part, { ...snapshot, testResults: [currentPass, currentFail] }), "blocked");
  const differentTestPass = { ...currentPass, title: "Independent inspection", createdAt: "2026-04-04T00:00:00.000Z", verificationOrder: 4 };
  assert.equal(derivePartInstanceReadiness(part, { ...snapshot, testResults: [currentFail, differentTestPass] }), "blocked");
  const retestPass = { ...currentPass, createdAt: "2026-04-05T00:00:00.000Z", verificationOrder: 5 };
  assert.equal(derivePartInstanceReadiness(part, { ...snapshot, testResults: [currentFail, differentTestPass, retestPass] }), "ready");
  const staleQa = {
    ...seed.qaReports[0]!, id: "stale-qa", targetRefs: [{ kind: "part-instance" as const, id: part.id }],
    status: "reviewed" as const, result: "iteration-worthy" as const,
    targetRevisions: { [definition.id]: definition.revision }, reviewOrder: 1, inspectedPartInstanceIds: [part.id],
  };
  assert.equal(derivePartInstanceReadiness(part, { ...snapshot, qaReports: [staleQa], testResults: [] }), "not-ready");
  const currentQaPass = { ...staleQa, result: "pass" as const, reviewOrder: 2, createdAt: "2026-04-02T00:00:00.000Z", targetRevisions: { [definition.id]: "C" } };
  assert.equal(derivePartInstanceReadiness(part, { ...snapshot, qaReports: [staleQa, currentQaPass], testResults: [] }), "ready");
  assert.equal(derivePartInstanceReadiness(part, { ...snapshot, qaReports: [currentQaPass], testResults: [currentFail] }), "blocked");
});

test("milestone readiness requires at least one required criterion", () => {
  const snapshot = getSnapshot();
  const milestone = snapshot.milestones[0]!;
  assert.equal(deriveMilestoneReadiness(milestone, {
    ...snapshot,
    risks: [],
    milestoneRequirements: (snapshot.milestoneRequirements ?? []).filter((item) => item.milestoneId !== milestone.id),
  }), "not-ready");
});

test("project scope markers do not make a newly created milestone ready without verification criteria", () => {
  const milestone = createMilestone({
    title: "Robot Acceptance Checkpoint",
    type: "deadline",
    startAt: "2026-06-10T10:00:00-04:00",
    endAt: null,
    isExternal: false,
    description: "Acceptance checkpoint with automatic project scope.",
    projectIds: [ROBOT_PROJECT_ID],
  });
  const scoped = getSnapshot();
  const scopeMarkers = (scoped.milestoneRequirements ?? []).filter((item) => item.milestoneId === milestone.id);
  assert.equal(scopeMarkers.length, 1);
  assert.equal(scopeMarkers[0]?.conditionValue, "in_scope");
  assert.equal(deriveMilestoneReadiness(milestone, scoped), "not-ready");

  const criterion = {
    id: "robot-acceptance-iteration",
    milestoneId: milestone.id,
    targetRefs: [{ kind: "subsystem" as const, id: ROBOT_SUBSYSTEM_ID }],
    conditionType: "iteration" as const,
    conditionValue: "iteration>=2",
    required: true,
    sortOrder: 2,
    notes: "Drive subsystem must reach iteration 2.",
  };
  resetStore({ ...scoped, milestoneRequirements: [...(scoped.milestoneRequirements ?? []), criterion] });
  assert.equal(deriveMilestoneReadiness(milestone, getSnapshot()), "not-ready");

  updateSubsystem(ROBOT_SUBSYSTEM_ID, { iteration: 2 });
  assert.equal(deriveMilestoneReadiness(milestone, getSnapshot()), "ready");
});

function nonRobotProjectNamesForSeason(seasonId: string) {
  return getSnapshot()
    .projects.filter(
      (project) => project.seasonId === seasonId && project.projectType !== "robot",
    )
    .map((project) => project.name);
}

test("seed and created seasons only use the canonical non-robot projects", () => {
  assert.deepEqual(nonRobotProjectNamesForSeason(ROBOT_SEASON_ID).sort(), [
    "Media",
    "Outreach",
    "Operations",
    "Strategy",
    "Training",
  ].sort());

  const season = createSeason({
    name: "2027 Season",
    type: "season",
    startDate: "2027-01-01",
    endDate: "2027-04-30",
  });

  assert.deepEqual(nonRobotProjectNamesForSeason(season.id).sort(), [
    "Media",
    "Outreach",
    "Operations",
    "Strategy",
    "Training",
  ].sort());
});

test("createSeason seeds drivetrain defaults for the robot project", () => {
  const season = createSeason({
    name: "2028 Season",
    type: "season",
    startDate: "2028-01-01",
    endDate: "2028-04-30",
  });
  const snapshot = getSnapshot();
  const robotProject = snapshot.projects.find(
    (project) => project.seasonId === season.id && project.projectType === "robot",
  );

  assert.ok(robotProject);

  const drivetrain = snapshot.subsystems.find(
    (subsystem) =>
      subsystem.projectId === robotProject.id && subsystem.name === "Drivetrain",
  );
  assert.ok(drivetrain);

  const mechanismNames = snapshot.mechanisms
    .filter((mechanism) => mechanism.subsystemId === drivetrain.id)
    .map((mechanism) => mechanism.name);

  assert.deepEqual(mechanismNames, [
    "Left Front Module",
    "Right Front Module",
    "Left Back Module",
    "Right Back Module",
    "Chassis",
  ]);
});

test("createProject seeds drivetrain defaults for robot projects", () => {
  const project = createProject({
    seasonId: ROBOT_SEASON_ID,
    name: "Practice Bot",
    projectType: "robot",
  });
  const snapshot = getSnapshot();
  const drivetrain = snapshot.subsystems.find(
    (subsystem) =>
      subsystem.projectId === project.id && subsystem.name === "Drivetrain",
  );

  assert.ok(drivetrain);

  const mechanismNames = snapshot.mechanisms
    .filter((mechanism) => mechanism.subsystemId === drivetrain.id)
    .map((mechanism) => mechanism.name);

  assert.deepEqual(mechanismNames, [
    "Left Front Module",
    "Right Front Module",
    "Left Back Module",
    "Right Back Module",
    "Chassis",
  ]);
});

test("the tutorial baseline retains its six canonical projects", () => {
  assert.deepEqual(
    getSnapshot().projects.filter((project) => project.seasonId === ROBOT_SEASON_ID).map((project) => project.name).sort(),
    ["Media", "Operations", "Outreach", "Robot", "Strategy", "Training"].sort(),
  );
});

test("tutorial baseline keeps the canonical visible season name", () => {
  const baseline = getTutorialBaselineState();

  assert.equal(baseline.seasonId, ROBOT_SEASON_ID);
  assert.equal(baseline.seasonName, "MECO Robotics 2026 season and documented offseason");
});

test("tutorial seed keeps a planning milestone linked to the robot project", () => {
  const snapshot = getSnapshot();
  const milestone = snapshot.milestones.find((candidate) => candidate.seasonId === ROBOT_SEASON_ID && candidate.projectIds.includes(ROBOT_PROJECT_ID));

  assert.ok(milestone);
  assert.ok(milestone.projectIds.includes(ROBOT_PROJECT_ID));
});

test("restored tutorial seed includes its planning milestones", () => {
  const snapshot = getSnapshot();
  const tutorialMilestones = snapshot.milestones.filter(
    (milestone) => milestone.seasonId === ROBOT_SEASON_ID,
  );

  assert.ok(tutorialMilestones.length > 0);
});

test("demo seed references are internally consistent", () => {
  const snapshot = getSnapshot();
  const ids = {
    artifacts: new Set(snapshot.artifacts.map((item) => item.id)),
    materials: new Set(snapshot.materials.map((item) => item.id)),
    mechanisms: new Set(snapshot.mechanisms.map((item) => item.id)),
    members: new Set(snapshot.members.map((item) => item.id)),
    milestones: new Set(snapshot.milestones.map((item) => item.id)),
    partDefinitions: new Set(snapshot.partDefinitions.map((item) => item.id)),
    partInstances: new Set(snapshot.partInstances.map((item) => item.id)),
    projects: new Set(snapshot.projects.map((item) => item.id)),
    purchases: new Set(snapshot.purchaseItems.map((item) => item.id)),
    qaFindings: new Set(snapshot.qaFindings.map((item) => item.id)),
    qaReports: new Set(snapshot.qaReports.map((item) => item.id)),
    subsystems: new Set(snapshot.subsystems.map((item) => item.id)),
    tasks: new Set(snapshot.tasks.map((item) => item.id)),
    testFindings: new Set(snapshot.testFindings.map((item) => item.id)),
    testResults: new Set(snapshot.testResults.map((item) => item.id)),
    workstreams: new Set(snapshot.workstreams.map((item) => item.id)),
  };

  const expectId = (set: Set<string>, id: string | null | undefined, label: string) => {
    if (id) {
      assert.ok(set.has(id), `${label} references missing id ${id}`);
    }
  };

  for (const task of snapshot.tasks) {
    expectId(ids.projects, task.projectId, `task ${task.id} projectId`);
    expectId(ids.workstreams, (task.workstreamIds[0] ?? null), `task ${task.id} workstreamId`);
    expectId(ids.subsystems, (task.subsystemIds[0] ?? ""), `task ${task.id} subsystemId`);
    expectId(ids.mechanisms, (task.mechanismIds[0] ?? null), `task ${task.id} mechanismId`);
    expectId(ids.partInstances, (task.partInstanceIds[0] ?? null), `task ${task.id} partInstanceId`);
    task.scheduleRefs.filter((ref) => ref.kind === "milestone").forEach((ref) => expectId(ids.milestones, ref.id, `task ${task.id} scheduleRefs`));
    expectId(ids.members, task.ownerId, `task ${task.id} ownerId`);
    expectId(ids.members, task.mentorId, `task ${task.id} mentorId`);
    task.assigneeIds.forEach((id) => expectId(ids.members, id, `task ${task.id} assigneeIds`));

  }

  for (const purchaseItem of snapshot.purchaseItems) {
    expectId(ids.tasks, purchaseItem.taskId, `purchase ${purchaseItem.id} taskId`);
    expectId(ids.partDefinitions, purchaseItem.partDefinitionId, `purchase ${purchaseItem.id} partDefinitionId`);
  }

  for (const partDefinition of snapshot.partDefinitions) {
    expectId(ids.materials, partDefinition.materialId, `part definition ${partDefinition.id} materialId`);
  }

  for (const partInstance of snapshot.partInstances) {
    expectId(ids.subsystems, partInstance.intendedSubsystemId, `part instance ${partInstance.id} intendedSubsystemId`);
    expectId(ids.mechanisms, partInstance.intendedMechanismId, `part instance ${partInstance.id} intendedMechanismId`);
    if (partInstance.location.kind === "installed") {
      expectId(ids.subsystems, partInstance.location.subsystemId, `part instance ${partInstance.id} location subsystemId`);
      expectId(ids.mechanisms, partInstance.location.mechanismId, `part instance ${partInstance.id} location mechanismId`);
    }
    expectId(ids.partDefinitions, partInstance.partDefinitionId, `part instance ${partInstance.id} partDefinitionId`);
  }

  for (const milestone of snapshot.milestones) {
    milestone.projectIds.forEach((id) => expectId(ids.projects, id, `milestone ${milestone.id} projectIds`));
  }

  for (const meeting of snapshot.meetings) {
    meeting.projectIds?.forEach((id) => expectId(ids.projects, id, `meeting ${meeting.id} projectIds`));
  }

  for (const attendanceRecord of snapshot.attendanceRecords) {
    expectId(ids.members, attendanceRecord.memberId, `attendance record ${attendanceRecord.id} memberId`);
  }

  for (const workLog of snapshot.workLogs) {
    expectId(ids.tasks, workLog.taskId, `work log ${workLog.id} taskId`);
    workLog.participantIds.forEach((id) => expectId(ids.members, id, `work log ${workLog.id} participantIds`));
  }

  for (const qaReport of snapshot.qaReports) {
    qaReport.targetRefs.forEach((ref) => { if (ref.kind === "task") expectId(ids.tasks, ref.id, `qa report ${qaReport.id} task target`); });
    qaReport.participantIds.forEach((id) => expectId(ids.members, id, `qa report ${qaReport.id} participantIds`));
  }

  for (const testResult of snapshot.testResults) {
    expectId(ids.projects, testResult.projectId, `test result ${testResult.id} projectId`);
  }

  for (const taskDependency of snapshot.taskDependencies) {
    expectId(ids.tasks, taskDependency.taskId, `task dependency ${taskDependency.id} taskId`);
    if (taskDependency.kind === "task") {
      expectId(ids.tasks, taskDependency.refId, `task dependency ${taskDependency.id} refId`);
    } else if (taskDependency.kind === "milestone") {
      expectId(ids.milestones, taskDependency.refId, `task dependency ${taskDependency.id} refId`);
    } else {
      expectId(ids.partInstances, taskDependency.refId, `task dependency ${taskDependency.id} refId`);
    }
  }

  for (const qaFinding of snapshot.qaFindings) {
    if (qaFinding.reportId) expectId(ids.qaReports, qaFinding.reportId, `qa finding ${qaFinding.id} reportId`);
    expectId(ids.projects, qaFinding.projectId, `qa finding ${qaFinding.id} projectId`);
    assert.ok(qaFinding.targetRefs.length > 0);
  }

  for (const testFinding of snapshot.testFindings) {
    expectId(ids.testResults, testFinding.testResultId, `test finding ${testFinding.id} testResultId`);
    expectId(ids.projects, testFinding.projectId, `test finding ${testFinding.id} projectId`);
    assert.ok(testFinding.targetRefs.length > 0);
  }

  for (const designIteration of snapshot.designIterations) {
    const findingIds = designIteration.sourceType === "qa" ? ids.qaFindings : ids.testFindings;
    expectId(findingIds, designIteration.findingId, `design iteration ${designIteration.id} findingId`);
    expectId(ids.projects, designIteration.projectId, `design iteration ${designIteration.id} projectId`);
    assert.ok(designIteration.targetRefs.length > 0);
  }

  for (const risk of snapshot.risks) {
    if (risk.source.kind === "qa-finding") expectId(ids.qaFindings, risk.source.id, `risk ${risk.id} source`);
    else if (risk.source.kind === "test-finding") expectId(ids.testFindings, risk.source.id, `risk ${risk.id} source`);
    else if (risk.source.kind === "task" || risk.source.kind === "manufacturing-details") expectId(ids.tasks, risk.source.id, `risk ${risk.id} source`);
    else if (risk.source.kind === "part-instance") expectId(ids.partInstances, risk.source.id, `risk ${risk.id} source`);
    expectId(ids.projects, risk.projectId, `risk ${risk.id} projectId`);
    risk.relatedTargets.forEach((target) => {
      if (target.kind === "task") expectId(ids.tasks, target.id, `risk ${risk.id} target`);
      if (target.kind === "project") expectId(ids.projects, target.id, `risk ${risk.id} target`);
      if (target.kind === "part-instance") expectId(ids.partInstances, target.id, `risk ${risk.id} target`);
      if (target.kind === "workstream") expectId(ids.workstreams, target.id, `risk ${risk.id} target`);
    });
    expectId(ids.tasks, risk.mitigationTaskId, `risk ${risk.id} mitigationTaskId`);
  }
});

test("createMember generates unique slugs for repeated names", () => {
  const first = createMember({
    name: "Ava Chen",
    role: "student",
    photoUrl: "https://cdn.example.test/people/ava-chen.png",
  });
  const second = createMember({
    name: "Ava Chen",
    role: "mentor",
  });

  assert.equal(first.id, "ava-chen");
  assert.equal(first.photoUrl, "https://cdn.example.test/people/ava-chen.png");
  assert.deepEqual(first.activeSeasonIds, [first.seasonId]);
  assert.equal(second.id, "ava-chen-2");
  assert.deepEqual(second.activeSeasonIds, [second.seasonId]);
  assert.equal(getSnapshot().members.slice(-2).map((member) => member.id).join(","), "ava-chen,ava-chen-2");
});

test("createMember and updateMember preserve profile pictures", () => {
  const member = createMember({
    name: "Profile Person",
    role: "mentor",
    photoUrl: "https://cdn.example.test/people/profile-person.png",
  });

  assert.equal(member.photoUrl, "https://cdn.example.test/people/profile-person.png");

  const updatedMember = updateMember(member.id, {
    photoUrl: "https://cdn.example.test/people/profile-person-v2.png",
  });

  assert.ok(updatedMember);
  assert.equal(
    getSnapshot().members.find((candidate) => candidate.id === member.id)?.photoUrl,
    "https://cdn.example.test/people/profile-person-v2.png",
  );
});

test("updateMember can reactivate an existing person for another season", () => {
  const season = createSeason({
    name: "2027 Offseason",
    type: "offseason",
    startDate: "2027-05-01",
    endDate: "2027-08-31",
  });
  const member = createMember({
    name: "Season Hopper",
    role: "student",
    seasonId: ROBOT_SEASON_ID,
  });

  const updatedMember = updateMember(member.id, {
    activeSeasonIds: [...(member.activeSeasonIds ?? []), season.id],
  });

  assert.ok(updatedMember);
  const refreshedMember = getSnapshot().members.find((candidate) => candidate.id === member.id);
  assert.ok(refreshedMember);
  assert.deepEqual([...(refreshedMember?.activeSeasonIds ?? [])].sort(), [ROBOT_SEASON_ID, season.id].sort());
});

test("createPartDefinition defaults active season membership and can be reactivated for another season", () => {
  const season = createSeason({
    name: "2027 Offseason",
    type: "offseason",
    startDate: "2027-05-01",
    endDate: "2027-08-31",
  });

  const created = createPartDefinition({
    name: "Seasoned Plate",
    partNumber: "SEA-001",
    revision: "A",
    type: "custom",
    defaultAcquisitionMethod: "stock",
    materialId: ROBOT_MATERIAL_ID,
    description: "Season-scoped part definition.",
    seasonId: ROBOT_SEASON_ID,
  });

  assert.deepEqual(created.activeSeasonIds, [ROBOT_SEASON_ID]);

  const updatedPartDefinition = updatePartDefinition(created.id, {
    activeSeasonIds: [...(created.activeSeasonIds ?? []), season.id],
  });

  assert.ok(updatedPartDefinition);
  const refreshedPartDefinition = getSnapshot().partDefinitions.find(
    (candidate) => candidate.id === created.id,
  );
  assert.ok(refreshedPartDefinition);
  assert.deepEqual(
    [...(refreshedPartDefinition?.activeSeasonIds ?? [])].sort(),
    [ROBOT_SEASON_ID, season.id].sort(),
  );
});

test("createWorkstream adds a project-scoped workflow", () => {
  const workstream = createWorkstream({
    projectId: "project-operations-2026",
    name: "Awards",
    color: "#E76F51",
    description: "Awards submission workflow.",
  });

  assert.equal(workstream.color, "#E76F51");
  assert.equal(workstream.id, "awards");
  assert.equal(workstream.isArchived, false);
  assert.equal(workstream.projectId, "project-operations-2026");
  assert.equal(
    getSnapshot().workstreams.some((candidate) => candidate.id === workstream.id),
    true,
  );
});

test("createMechanism auto-generates a wiring task for the new mechanism", () => {
  updateSubsystem(ROBOT_SUBSYSTEM_ID, { responsibleEngineerId: STUDENT_ID, mentorIds: [MENTOR_ID] });
  const mechanism = createMechanism({
    subsystemId: ROBOT_SUBSYSTEM_ID,
    name: "Test Mechanism",
    description: "Temporary mechanism for coverage.",
  });

  assert.equal(mechanism.isArchived, false);

  const wiringTask = getSnapshot().tasks.find(
    (task) => (task.mechanismIds[0] ?? null) === mechanism.id && task.title === "Wire Test Mechanism",
  );

  assert.ok(wiringTask);
  assert.equal((wiringTask.subsystemIds[0] ?? ""), ROBOT_SUBSYSTEM_ID);
  assert.equal(wiringTask?.workTypeId, "robot:electrical-wiring");
});

test("createSubsystem auto-generates a testing task for its parent subsystem", () => {
  updateSubsystem(ROBOT_SUBSYSTEM_ID, { responsibleEngineerId: STUDENT_ID, mentorIds: [MENTOR_ID] });
  const subsystem = createSubsystem({
    projectId: ROBOT_PROJECT_ID,
    name: "Test Subsystem",
    color: "#4F86C6",
    description: "Temporary subsystem for coverage.",
    parentSubsystemId: ROBOT_SUBSYSTEM_ID,
    responsibleEngineerId: STUDENT_ID,
    mentorIds: [MENTOR_ID],
  });

  const integrationTask = getSnapshot().tasks.find(
    (task) => task.title === "Integrate Test Subsystem",
  );

  assert.equal(subsystem.color, "#4F86C6");
  assert.equal(subsystem.parentSubsystemId, ROBOT_SUBSYSTEM_ID);
  assert.ok(integrationTask);
  assert.equal((integrationTask.subsystemIds[0] ?? ""), ROBOT_SUBSYSTEM_ID);
  assert.equal(integrationTask?.workTypeId, "robot:testing");
  assert.equal((integrationTask.mechanismIds[0] ?? null), null);
  assert.equal(integrationTask?.ownerId, STUDENT_ID);
  assert.equal(integrationTask?.mentorId, MENTOR_ID);
});

test("updateTask patches an existing task in place", () => {
  assert.throws(() => updateTask(ROBOT_TASK_ID, { status: "complete" }), /cannot be completed/);
  updateTask(ROBOT_TASK_ID, { status: "in-progress", assigneeIds: [STUDENT_ID, OTHER_STUDENT_ID] });

  const updatedTask = getSnapshot().tasks.find((task) => task.id === ROBOT_TASK_ID);
  assert.ok(updatedTask);
  assert.equal(updatedTask.status, "in-progress");
  assert.equal(updatedTask.actualHours, getSnapshot().workLogs.filter((log) => log.taskId === updatedTask.id).reduce((sum, log) => sum + log.hours, 0));
  assert.deepEqual(updatedTask.assigneeIds, [STUDENT_ID, OTHER_STUDENT_ID]);
});

test("task updates append an audit action entry", () => {
  const initialActionCount = getSnapshot().actions?.length ?? 0;
  const originalTask = getSnapshot().tasks.find((task) => task.id === ROBOT_TASK_ID);
  assert.ok(originalTask);

  const updatedTask = updateTask(ROBOT_TASK_ID, {
    status: "waiting-for-qa",
    estimatedHours: 7,
  }, {
    actorMemberId: MENTOR_ID,
    requestId: "req-audit-task-update",
  });

  assert.ok(updatedTask);
  const snapshot = getSnapshot();
  const actions = snapshot.actions ?? [];
  assert.equal(actions.length, initialActionCount + 1);

  const lastAction = actions[actions.length - 1];
  assert.equal(lastAction.entityType, "task");
  assert.equal(lastAction.operation, "update");
  assert.equal(lastAction.taskId, ROBOT_TASK_ID);
  assert.equal(lastAction.projectId, updatedTask.projectId);
  assert.equal(lastAction.subsystemId, (updatedTask.subsystemIds[0] ?? ""));
  assert.equal(lastAction.entityLabel, updatedTask.title);
  assert.equal(lastAction.actorMemberId, MENTOR_ID);
  assert.equal(lastAction.requestId, "req-audit-task-update");
  assert.ok(lastAction.changedFields.includes("estimatedHours"));
  assert.ok(lastAction.changedFields.includes("status"));
  assert.equal(lastAction.beforeJson?.status, "in-progress");
  assert.equal(lastAction.afterJson?.status, "waiting-for-qa");
  assert.equal(lastAction.beforeJson?.estimatedHours, originalTask.estimatedHours);
  assert.equal(lastAction.afterJson?.estimatedHours, 7);
});

test("audit summaries redact sensitive before and after fields", () => {
  recordAuditAction({
    operation: "update",
    entityType: "integration-secret",
    entityId: "integration-secret-1",
    changedFields: ["apiToken", "name"],
    beforeJson: {
      apiToken: "old-token",
      name: "Practice API",
    },
    afterJson: {
      apiToken: "new-token",
      name: "Practice API v2",
    },
    actorMemberId: "jordan",
    requestId: "req-redaction-check",
  });

  const lastAction = getSnapshot().actions?.at(-1);
  assert.ok(lastAction);
  assert.deepEqual(lastAction.changedFields, ["apiToken", "name"]);
  assert.equal(lastAction.actorMemberId, "jordan");
  assert.equal(lastAction.requestId, "req-redaction-check");
  assert.equal(lastAction.beforeJson?.apiToken, "[redacted]");
  assert.equal(lastAction.afterJson?.apiToken, "[redacted]");
  assert.equal(lastAction.beforeJson?.name, "Practice API");
  assert.equal(lastAction.afterJson?.name, "Practice API v2");
});

test("PartInstance records one physical item's location separately from readiness", () => {
  const seeded = getSnapshot().partInstances.find((part) => part.id === ROBOT_PART_INSTANCE_ID);
  assert.ok(seeded);
  assert.equal(seeded.location.kind, "installed");

  const updated = updatePartInstance(seeded.id, { location: { kind: "repair", location: "Pit repair cart" } });
  assert.equal(updated?.location.kind, "repair");
  assert.equal("readinessStatus" in (updated ?? {}), false);
});

test("manufacturing technical state belongs to the Robot Kanban Task", () => {
  const task = createTask({ ...mutableTaskInput(getSnapshot().tasks.find((candidate) => candidate.id === ROBOT_TASK_ID)!), title: "Manufacturing state owner", status: "not-started", workTypeId: "robot:manufacturing", manufacturingDetails: {
    part: { kind: "part-definition", partDefinitionId: ROBOT_PART_DEFINITION_ID }, quantity: 1,
    processId: "3d-print", fulfillmentSource: "outsourced", material: { kind: "specified-material", name: "PETG" },
    fileArtifactIds: [], tolerances: [], qaRequirements: [],
  } });
  assert.equal(task.workTypeId, "robot:manufacturing");
  assert.equal(task.manufacturingDetails?.processId, "3d-print");
  assert.equal(task.manufacturingDetails?.fulfillmentSource, "outsourced");
  assert.deepEqual(task.manufacturingDetails?.part, { kind: "part-definition", partDefinitionId: ROBOT_PART_DEFINITION_ID });
});

test("removePartDefinition clears linked part instances and task references", () => {
  const createdPartDefinition = createPartDefinition({
    name: "Temporary Test Part",
    partNumber: "TMP-001",
    revision: "A",
    type: "custom",
    defaultAcquisitionMethod: "stock",
    materialId: ROBOT_MATERIAL_ID,
    description: "Temporary fixture for store coverage.",
  });
  assert.equal(createdPartDefinition.isArchived, false);
  const createdPartInstance = createPartInstance({
    partDefinitionId: createdPartDefinition.id,
    intendedSubsystemId: ROBOT_SUBSYSTEM_ID,
    intendedMechanismId: ROBOT_MECHANISM_ID,
    location: { kind: "stock", location: "Test bin" },
  });

  const taskBeforeRetarget = getSnapshot().tasks.find((task) => task.id === ROBOT_TASK_ID)!;
  if (taskBeforeRetarget.status === "complete") resetStore({ ...getSnapshot(), tasks: getSnapshot().tasks.map((task) => task.id === taskBeforeRetarget.id ? { ...task, status: "in-progress" as const } : task) });
  updateTask(ROBOT_TASK_ID, {
    partInstanceIds: [createdPartInstance.id],
  });
  resetStore({ ...getSnapshot(), tasks: getSnapshot().tasks.map((task) => task.id === ROBOT_TASK_ID ? { ...task, completionScopeReviewOrder: undefined } : task) });

  const removed = removePartDefinition(createdPartDefinition.id);
  const snapshot = getSnapshot();

  assert.equal(removed?.id, createdPartDefinition.id);
  assert.equal(
    snapshot.partDefinitions.some((partDefinition) => partDefinition.id === createdPartDefinition.id),
    false,
  );
  assert.equal(
    snapshot.partInstances.some((partInstance) => partInstance.id === createdPartInstance.id),
    false,
  );
  assert.deepEqual(
    snapshot.tasks.find((task) => task.id === ROBOT_TASK_ID)?.partInstanceIds,
    [],
  );
  assert.equal(typeof snapshot.tasks.find((task) => task.id === ROBOT_TASK_ID)?.completionScopeReviewOrder, "number", "part-definition cleanup invalidates the surviving task target scope");
});

test("removeSubsystem clears QA requests for removed tasks", () => {
  const subsystem = createSubsystem({
    projectId: ROBOT_PROJECT_ID,
    name: "QA cleanup root",
    description: "Scenario for QA request cascade behavior.",
    parentSubsystemId: null,
    responsibleEngineerId: STUDENT_ID,
    mentorIds: [MENTOR_ID],
  });
  const childSubsystem = createSubsystem({
    projectId: ROBOT_PROJECT_ID,
    name: "QA cleanup child",
    description: "Creates the task removed with its parent.",
    parentSubsystemId: subsystem.id,
    responsibleEngineerId: null,
    mentorIds: [],
  });
  const generatedTask = getSnapshot().tasks.find((task) =>
    task.title === `Integrate ${childSubsystem.name}`,
  );
  assert.ok(generatedTask);
  updateTask(generatedTask.id, { status: "in-progress", ownerId: STUDENT_ID, assigneeIds: [STUDENT_ID], mentorId: MENTOR_ID });
  const taskRequest = createQaRequest({
    projectId: generatedTask.projectId,
    targetRefs: [{ kind: "task", id: generatedTask.id }],
    subject: "Tablet refresh QA",
    mentorId: MENTOR_ID,
    requestedById: STUDENT_ID,
  });
  const tasklessRequest = createQaRequest({
    projectId: getSnapshot().projects[0]!.id,
    targetRefs: [{ kind: "project", id: getSnapshot().projects[0]!.id }],
    subject: "General QA",
    mentorId: MENTOR_ID,
    requestedById: STUDENT_ID,
  });

  assert.ok(getQaRequests().some((request) => request.id === taskRequest.id));
  assert.ok(getQaRequests().some((request) => request.id === tasklessRequest.id));

  const removed = removeSubsystem(subsystem.id);

  assert.ok(removed);
  assert.equal(
    getQaRequests().some((request) => request.id === taskRequest.id),
    false,
  );
  assert.ok(getQaRequests().some((request) => request.id === tasklessRequest.id));
});

test("removeMember clears linked references across the snapshot", () => {
  const coreStatus = getSnapshot().subsystems.find((subsystem) => subsystem.id === ROBOT_SUBSYSTEM_ID)?.isCore;
  updateSubsystem(ROBOT_SUBSYSTEM_ID, { mentorIds: [MENTOR_ID] });
  updateTask(ROBOT_TASK_ID, {
    assigneeIds: [STUDENT_ID, MENTOR_ID],
  });
  updateWorkLog(ROBOT_WORKLOG_ID, { participantIds: [STUDENT_ID, MENTOR_ID] });
  const risk = createRisk({ projectId: ROBOT_PROJECT_ID, title: "Owner cleanup", detail: "The owner is being removed.", category: "other", severity: "low", status: "open", blocksWork: false, source: { kind: "manual" }, relatedTargets: [], mitigationTaskId: null, ownerGroupId: null, ownerMemberId: MENTOR_ID, mitigationDueDate: null });

  const removed = removeMember(MENTOR_ID);
  const snapshot = getSnapshot();

  assert.equal(removed?.id, MENTOR_ID);
  assert.equal(snapshot.members.some((member) => member.id === MENTOR_ID), false);
  assert.deepEqual(
    snapshot.subsystems.find((subsystem) => subsystem.id === ROBOT_SUBSYSTEM_ID)?.mentorIds,
    [],
  );
  assert.equal(
    snapshot.subsystems.find((subsystem) => subsystem.id === ROBOT_SUBSYSTEM_ID)?.isCore,
    coreStatus,
  );
  assert.equal(
    snapshot.subsystems.find((subsystem) => subsystem.id === OTHER_ROBOT_SUBSYSTEM_ID)?.mentorIds.includes(MENTOR_ID),
    false,
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === ROBOT_TASK_ID)?.mentorId,
    null,
  );
  assert.equal(
    snapshot.tasks.filter((task) => task.mentorId === MENTOR_ID).length,
    0,
  );
  assert.deepEqual(
    snapshot.tasks.find((task) => task.id === ROBOT_TASK_ID)?.assigneeIds,
    [STUDENT_ID],
  );
  assert.deepEqual(
    snapshot.workLogs.find((workLog) => workLog.id === ROBOT_WORKLOG_ID)?.participantIds,
    [STUDENT_ID],
  );
  assert.equal(
    snapshot.attendanceRecords.some((record) => record.memberId === MENTOR_ID),
    false,
  );
  assert.ok(snapshot.qaReports.every((report) => !report.participantIds.includes(MENTOR_ID)));
  assert.equal(snapshot.risks.find((item) => item.id === risk.id)?.ownerMemberId, null);
});

test("task milestone requirements infer milestone matches from explicit target requirements", () => {
  const milestone = createMilestone({
    title: "Drive Checkpoint",
    type: "deadline",
    startAt: "2026-06-10T10:00:00-04:00",
    endAt: null,
    isExternal: false,
    description: "Checkpoint for drive subsystem readiness.",
    projectIds: [],
  });

  updateSubsystem(ROBOT_SUBSYSTEM_ID, {
    iteration: 3,
  });

  const snapshot = getSnapshot();
  resetStore({
    ...snapshot,
    milestoneRequirements: [
    ...(snapshot.milestoneRequirements ?? []),
    {
      id: "drive-check-iteration",
      milestoneId: milestone.id,
      targetRefs: [{ kind: "subsystem", id: ROBOT_SUBSYSTEM_ID }],
      conditionType: "iteration",
      conditionValue: "iteration>=2",
      required: true,
      sortOrder: 1,
      notes: "Drive subsystem must be at least iteration 2.",
    },
    {
      id: "drive-check-part-state",
      milestoneId: milestone.id,
      targetRefs: [{ kind: "part-instance", id: ROBOT_PART_INSTANCE_ID }],
      conditionType: "workflow-state",
      conditionValue: "state=READY",
      required: true,
      sortOrder: 2,
      notes: "Encoder bracket part instance must be ready.",
    },
    ],
  });

  const matches = getMilestonesForTask(ROBOT_TASK_ID);

  const driveMatch = matches.find((match) => match.milestoneId === milestone.id);
  assert.ok(driveMatch);
  assert.equal(driveMatch.isExplicitScheduleRef, false);
  assert.deepEqual(driveMatch.matchedRequirementIds, ["drive-check-iteration"]);
});

test("project-scoped requirements match through project task target inference", () => {
  const milestone = createMilestone({
    title: "Robot Scope Checkpoint",
    type: "deadline",
    startAt: "2026-06-18T09:00:00-04:00",
    endAt: null,
    isExternal: false,
    description: "Scope requirement inferred from milestone project membership.",
    projectIds: [],
  });

  const snapshot = getSnapshot();
  resetStore({
    ...snapshot,
    milestoneRequirements: [
    ...(snapshot.milestoneRequirements ?? []),
    {
      id: "robot-scope-match",
      milestoneId: milestone.id,
      targetRefs: [{ kind: "project", id: ROBOT_PROJECT_ID }],
      conditionType: "custom",
      conditionValue: "in_scope",
      required: true,
      sortOrder: 1,
      notes: "Robot-project-scoped checkpoint.",
    },
    ],
  });

  const matches = getMilestonesForTask(ROBOT_TASK_ID);
  const scopeMatch = matches.find((match) => match.milestoneId === milestone.id);

  assert.ok(scopeMatch);
  assert.equal(scopeMatch.isExplicitScheduleRef, false);
  assert.ok(scopeMatch.matchedRequirementIds.includes("robot-scope-match"));
});

test("explicit schedule milestone references are preserved when no requirement match exists", () => {
  const milestone = createMilestone({
    title: "Direct-Reference Milestone",
    type: "deadline",
    startAt: "2026-07-10T09:00:00-04:00",
    endAt: null,
    isExternal: false,
    description: "Direct schedule reference validation fixture.",
    projectIds: [],
  });

  const updated = updateTask(ROBOT_TASK_ID, {
    scheduleRefs: [{ kind: "milestone", id: milestone.id }],
  });
  assert.ok(updated);

  const matches = getMilestonesForTask(updated.id);

  const explicitMatch = matches.find((match) => match.milestoneId === milestone.id);
  assert.ok(explicitMatch);
  assert.equal(explicitMatch.isExplicitScheduleRef, true);
  assert.deepEqual(explicitMatch.matchedRequirementIds, []);
});

test("getTasksForMilestone aggregates inferred and explicit schedule references", () => {
  const milestone = createMilestone({
    title: "Drive Milestone",
    type: "deadline",
    startAt: "2026-08-12T11:00:00-04:00",
    endAt: null,
    isExternal: false,
    description: "Drive milestone that supports inferred and explicit task references.",
    projectIds: [],
  });

  updateSubsystem(ROBOT_SUBSYSTEM_ID, {
    iteration: 2,
  });

  const snapshot = getSnapshot();
  resetStore({
    ...snapshot,
    milestoneRequirements: [
    ...(snapshot.milestoneRequirements ?? []),
    {
      id: "drive-readiness-iteration",
      milestoneId: milestone.id,
      targetRefs: [{ kind: "subsystem", id: ROBOT_SUBSYSTEM_ID }],
      conditionType: "iteration",
      conditionValue: "iteration>=2",
      required: true,
      sortOrder: 1,
      notes: "Drive subsystem must meet the first major milestone.",
    },
    ],
  });

  const auxiliary = createSubsystem({ projectId: ROBOT_PROJECT_ID, name: "Auxiliary", description: "Explicit milestone-only fixture", parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [] });
  const explicitTask = updateTask(OTHER_ROBOT_TASK_ID, {
    subsystemIds: [auxiliary.id],
    mechanismIds: [],
    partInstanceIds: [],
    scheduleRefs: [{ kind: "milestone", id: milestone.id }],
  });
  assert.ok(explicitTask);

  const matches = getTasksForMilestone(milestone.id);

  const inferredTask = matches.find((match) =>
    match.taskId === ROBOT_TASK_ID,
  );
  const explicitTaskMatch = matches.find((match) => match.taskId === explicitTask.id);

  assert.ok(inferredTask);
  assert.equal(inferredTask.isExplicitScheduleRef, false);
  assert.deepEqual(inferredTask.matchedRequirementIds, ["drive-readiness-iteration"]);

  assert.ok(explicitTaskMatch);
  assert.equal(explicitTaskMatch.isExplicitScheduleRef, true);
  assert.deepEqual(explicitTaskMatch.matchedRequirementIds, []);
});


test("task hours follow work log create, resize, move and delete", () => {
  const hours = (id: string) => getSnapshot().tasks.find((task) => task.id === id)!.actualHours;
  const first = ROBOT_TASK_ID;
  const second = OTHER_ROBOT_TASK_ID;
  const beforeFirst = hours(first);
  const beforeSecond = hours(second);
  const log = createWorkLog({ taskId: first, date: "2026-09-09", hours: 2, participantIds: [STUDENT_ID], notes: "Evidence" });
  assert.equal(hours(first), beforeFirst + 2);
  updateWorkLog(log.id, { hours: 3 });
  assert.equal(hours(first), beforeFirst + 3);
  updateWorkLog(log.id, { taskId: second });
  assert.equal(hours(first), beforeFirst);
  assert.equal(hours(second), beforeSecond + 3);
  removeWorkLog(log.id);
  assert.equal(hours(second), beforeSecond);
});


test("task targets preserve kind order, first-target context, and unique array links", () => {
  const snapshot = getSnapshot();
  const task = snapshot.tasks[0];
  const targets = {
    workstreamIds: ["shared", "shared", "primary-workstream"],
    subsystemIds: ["shared", "primary-subsystem"],
    mechanismIds: ["mechanism", "mechanism"],
    partInstanceIds: ["part"],
    scheduleRefs: [{ kind: "milestone" as const, id: "milestone" }],
  };
  resetStore({
    ...snapshot,
    tasks: snapshot.tasks.map((item) => item.id === task.id ? { ...item, status: "in-progress" as const } : item),
    workstreams: [...snapshot.workstreams, ...["shared", "primary-workstream"].map((id) => ({ ...snapshot.workstreams[0], id, projectId: task.projectId }))],
    subsystems: [...snapshot.subsystems, ...["shared", "primary-subsystem"].map((id) => ({ ...snapshot.subsystems[0], id, projectId: task.projectId }))],
    mechanisms: [...snapshot.mechanisms, { ...snapshot.mechanisms[0], id: "mechanism", subsystemId: "shared" }],
    partInstances: [...snapshot.partInstances, { ...snapshot.partInstances[0], id: "part", intendedSubsystemId: "shared", intendedMechanismId: "mechanism", location: { kind: "installed", subsystemId: "shared", mechanismId: "mechanism" } }],
    milestones: [...snapshot.milestones, { ...snapshot.milestones[0], id: "milestone" }],
  });
  updateTask(task.id, targets);

  const links = getTaskTargets().filter((link) => link.taskId === task.id);
  assert.deepEqual(links.map((link) => [link.targetType, link.targetId]), [
    ["project", task.projectId],
    ["workstream", "shared"],
    ["workstream", "primary-workstream"],
    ["subsystem", "shared"],
    ["subsystem", "primary-subsystem"],
    ["mechanism", "mechanism"],
    ["part-instance", "part"],
    ["milestone", "milestone"],
  ]);
  for (const link of links) {
    assert.equal(link.id, `${task.id}:${link.targetType}:${link.targetId}`);
    assert.equal(link.taskTitle, task.title);
    assert.equal(link.projectId, task.projectId);
    assert.equal(link.workstreamId, "shared");
    assert.equal(link.subsystemId, "shared");
  }

  updateTask(task.id, { scheduleRefs: [] });
  assert.deepEqual(getTaskTargets().filter((link) => link.taskId === task.id), links.slice(0, -1));
});


test("missing update targets leave the published snapshot and audit trail untouched", () => {
  const before = getSnapshot();
  for (const update of [
    updateProject, updateWorkstream, updateRisk, updateMaterial, updateArtifact,
    updateMember, updatePartDefinition, updateSubsystem, updateMechanism,
    updateWorkLog, updatePurchaseItem,
  ]) {
    assert.equal(update("missing-update-target", {}), null);
    assert.equal(getSnapshot(), before);
  }
});

test("prepared updates retain detached results, audit changes, and reject invalid publication", () => {
  const material = createMaterial({
    name: "Update contract stock", category: "metal", unit: "sheet",
    reorderPoint: 1, location: "Rack", preferredVendorId: "vendor-tutorial-supplier", notes: "Retain notes",
  });
  createMaterialTransaction(material.id, { operationId: "opening-five", movementType: "receipt", quantity: 5, reason: "Initial receipt" });
  const before = getSnapshot();
  const updated = updateMaterial(material.id, { notes: "Retain notes updated" });
  assert.ok(updated);
  assert.equal(updated.notes, "Retain notes updated");
  assert.equal(before.materials.find((item) => item.id === material.id)?.onHandQuantity, 5);
  const published = getSnapshot();
  assert.deepEqual(published.materials.find((item) => item.id === material.id), updated);
  assert.deepEqual(published.actions?.at(-1)?.changedFields, ["notes"]);
  updated.onHandQuantity = 99;
  assert.equal(getSnapshot().materials.find((item) => item.id === material.id)?.onHandQuantity, 5);
  updateMaterial(material.id, { onHandQuantity: 3 } as unknown as Parameters<typeof updateMaterial>[1]);
  assert.equal(getSnapshot().materials.find((item) => item.id === material.id)?.onHandQuantity, 5);
  const afterQuantityAttempt = getSnapshot();

  const unchanged = updateMaterial(material.id, {});
  assert.equal(unchanged?.onHandQuantity, 5);
  assert.equal(getSnapshot().actions?.length, (afterQuantityAttempt.actions?.length ?? 0) + 1);
  assert.deepEqual(getSnapshot().actions?.at(-1)?.changedFields, []);
});


test("task commands reject invalid links and people without publishing data or audits", () => {
  const before = getSnapshot();
  const task = before.tasks[0];
  for (const input of [{ projectId: "missing-project" }, { workTypeId: "missing-work-type" }, { ownerId: "missing-member" }, { scheduleRefs: [{ kind: "event" as const, id: "missing-event" }] }]) {
    assert.throws(() => updateTask(task.id, input), /does not exist|do not exist|does not belong/);
    assert.equal(getSnapshot(), before);
    assert.throws(() => createTask({ ...JSON.parse(JSON.stringify(task)), ...input, status: "not-started" }), /does not exist|do not exist|does not belong/);
    assert.equal(getSnapshot(), before);
  }
});

test("snapshot owners isolate records, tutorial sessions and mutation queues", async () => {
  const first = createPlatformStore({ durability: "memory" });
  const second = createPlatformStore({ durability: "memory" });
  await first.run(async () => {
    const transaction = await acquireSnapshotMutation();
    transaction.enter();
    updateTask(getSnapshot().tasks[0].id, { title: "First owner edit" });
    await second.run(async () => {
      const otherTransaction = await acquireSnapshotMutation();
      otherTransaction.enter();
      assert.notEqual(getSnapshot().tasks[0].title, "First owner edit");
      updateTask(getSnapshot().tasks[0].id, { title: "Second owner edit" });
      await otherTransaction.commit();
      otherTransaction.release();
    });
    assert.equal(getSnapshot().tasks[0].title, "First owner edit");
    await transaction.commit();
    transaction.release();
  });
  assert.equal(first.run(() => getSnapshot().tasks[0].title), "First owner edit");
  assert.equal(second.run(() => getSnapshot().tasks[0].title), "Second owner edit");
  first.run(() => startInteractiveTutorialSession("shared-user"));
  first.run(() => runWithInteractiveTutorialSession("shared-user", () => {
    updateTask(getSnapshot().tasks[0].id, { title: "First owner tutorial" });
  }));
  second.run(() => startInteractiveTutorialSession("shared-user"));
  assert.equal(first.run(() => runWithInteractiveTutorialSession("shared-user", () => getSnapshot().tasks[0].title)), "First owner tutorial");
  assert.notEqual(second.run(() => runWithInteractiveTutorialSession("shared-user", () => getSnapshot().tasks[0].title)), "First owner tutorial");
});


test("task commands infer ancestors for nested targets before validating links", () => {
  const before = getSnapshot();
  const part = before.partInstances.find((record) => record.intendedMechanismId)!;
  assert.ok(part);
  const task = before.tasks.find((record) => record.projectId === before.subsystems.find((subsystem) => subsystem.id === part.intendedSubsystemId)?.projectId)!;
  updateTask(task.id, { status: "in-progress" });
  const updated = updateTask(task.id, { subsystemIds: [], mechanismIds: [], partInstanceIds: [part.id] });
  assert.ok(updated);
  assert.ok(updated.subsystemIds.includes(part.intendedSubsystemId!));
  assert.ok(updated.mechanismIds.includes(part.intendedMechanismId!));
});


test("generated tasks inherit eligible contributors or an explicit creator before atomic publication", () => {
  const parent = createSubsystem({ projectId: ROBOT_PROJECT_ID, name: "Unassigned parent", description: "Creator ownership fixture", parentSubsystemId: null, responsibleEngineerId: null, mentorIds: [] });
  const initial = getSnapshot();
  assert.throws(() => createMechanism({ subsystemId: "missing-parent", name: "Invalid parent", description: "Atomic fixture" }, { actorMemberId: STUDENT_ID }), /subsystem does not exist/);
  assert.equal(getSnapshot(), initial);
  const mechanismInput = { subsystemId: parent.id, name: "Creator wiring", description: "Generated task fixture" };
  const childInput = { projectId: parent.projectId, name: "Creator integration", description: "Generated task fixture", parentSubsystemId: parent.id, responsibleEngineerId: null, mentorIds: [] };
  for (const actorMemberId of [undefined, "maya", "missing-creator"]) {
    const before = getSnapshot();
    assert.throws(() => createMechanism(mechanismInput, { actorMemberId }), /Assign a student\/lead engineer or mentor/);
    assert.equal(getSnapshot(), before);
    assert.throws(() => createSubsystem(childInput, { actorMemberId }), /Assign a student\/lead engineer or mentor/);
    assert.equal(getSnapshot(), before);
  }
  const mechanism = createMechanism(mechanismInput, { actorMemberId: STUDENT_ID, requestId: "creator-wiring" });
  const wiring = getSnapshot().tasks.find((task) => task.mechanismIds.includes(mechanism.id))!;
  assert.equal(wiring.ownerId, STUDENT_ID);
  assert.equal(wiring.mentorId, null);
  updateSubsystem(ROBOT_SUBSYSTEM_ID, { responsibleEngineerId: STUDENT_ID, mentorIds: [MENTOR_ID] });
  const child = createSubsystem(childInput, { actorMemberId: MENTOR_ID, requestId: "creator-integration" });
  const integration = getSnapshot().tasks.find((task) => task.title === `Integrate ${child.name}`)!;
  assert.equal(integration.ownerId, null);
  assert.equal(integration.mentorId, MENTOR_ID);
  for (const requestId of ["creator-wiring", "creator-integration"]) {
    const audits = getSnapshot().actions!.filter((action) => action.requestId === requestId);
    assert.equal(audits.length, 2);
    assert.equal(new Set(audits.map((action) => action.id)).size, 2);
    assert.ok(audits.every((action) => action.actorMemberId === (requestId === "creator-wiring" ? STUDENT_ID : MENTOR_ID)));
  }
  const inherited = createMechanism({ ...mechanismInput, subsystemId: ROBOT_SUBSYSTEM_ID, name: "Inherited wiring" }, { actorMemberId: ADMIN_ID });
  const inheritedTask = getSnapshot().tasks.find((task) => task.mechanismIds.includes(inherited.id))!;
  assert.equal(inheritedTask.ownerId, STUDENT_ID);
  assert.equal(inheritedTask.mentorId, MENTOR_ID);
});


test("generated tasks reject missing or inactive workflow work types without publishing", () => {
  const seed = getSnapshot();
  for (const remove of [false, true]) {
    resetStore({ ...seed, workTypes: remove
      ? seed.workTypes.filter((type) => !["robot:electrical-wiring", "robot:testing"].includes(type.id))
      : seed.workTypes.map((type) => ["robot:electrical-wiring", "robot:testing"].includes(type.id) ? { ...type, isActive: false } : type),
    });
    const before = getSnapshot();
    assert.throws(() => createMechanism({ subsystemId: ROBOT_SUBSYSTEM_ID, name: "Missing wiring workflow", description: "No fallback" }), /active electrical-wiring work type/);
    assert.equal(getSnapshot(), before);
    assert.throws(() => createSubsystem({ projectId: ROBOT_PROJECT_ID, parentSubsystemId: ROBOT_SUBSYSTEM_ID, name: "Missing integration workflow", description: "No fallback", responsibleEngineerId: null, mentorIds: [] }), /active testing work type/);
    assert.equal(getSnapshot(), before);
  }
});


test("member commands preserve task people across role changes and deletion", () => {
  const baseTask = getSnapshot().tasks.find((record) => record.projectId === ROBOT_PROJECT_ID && record.status !== "complete")!;
  const taskOwner = createMember({ name: "Role-change owner", role: "student" });
  const taskMentor = createMember({ name: "Role-change mentor", role: "mentor" });
  const task = createTask({ ...mutableTaskInput(baseTask), title: "Role-change fixture", status: "not-started", ownerId: taskOwner.id, assigneeIds: [taskOwner.id], mentorId: taskMentor.id });
  const before = getSnapshot();
  assert.throws(() => updateMember(task.ownerId!, { role: "mentor" }), /Reassign.*before changing this person's role/);
  assert.equal(getSnapshot(), before);
  assert.throws(() => updateMember(task.mentorId!, { role: "student" }), /Reassign.*before changing this person's role/);
  assert.equal(getSnapshot(), before);
  const contributor = createMember({ name: "Only Task Contributor", role: "student" });
  const sole = createTask({ ...mutableTaskInput(task), status: "not-started", title: "Sole contributor task", ownerId: contributor.id, assigneeIds: [contributor.id], mentorId: null });
  assert.ok(removeMember(contributor.id));
  const removedContributorTask = getSnapshot().tasks.find((record) => record.id === sole.id)!;
  assert.equal(removedContributorTask.ownerId, null);
  assert.deepEqual(removedContributorTask.assigneeIds, []);
  updateTask(sole.id, { mentorId: task.mentorId });
  const retained = getSnapshot().tasks.find((record) => record.id === sole.id)!;
  assert.equal(retained.ownerId, null);
  assert.deepEqual(retained.assigneeIds, []);
  assert.equal(retained.mentorId, task.mentorId);
});

test("removing a QA mentor atomically cancels the request and reopens work for its remaining contributor", () => {
  const snapshot = getSnapshot();
  const originalTask = snapshot.tasks.find((record) => record.status === "in-progress" && !record.isBlocked && !snapshot.taskDependencies.some((dependency) => dependency.taskId === record.id))!;
  updateTask(originalTask.id, { ownerId: STUDENT_ID, assigneeIds: [STUDENT_ID] });
  const task = getSnapshot().tasks.find((record) => record.id === originalTask.id)!;
  const mentor = createMember({ name: "Temporary QA Mentor", role: "mentor" });
  const request = createQaRequest({ targetRefs: [{ kind: "task", id: task.id }], subject: "Mentor removal QA", mentorId: mentor.id, requestedById: task.ownerId });
  const removed = removeMember(mentor.id, { actorMemberId: ADMIN_ID, requestId: "cancel-mentor-qa" });
  assert.ok(removed);
  const after = getSnapshot();
  assert.ok(!after.qaRequests!.some((record) => record.id === request.id));
  const reopened = after.tasks.find((record) => record.id === task.id)!;
  assert.equal(reopened.status, "in-progress");
  assert.equal(reopened.mentorId, null);
  assert.equal(reopened.ownerId, task.ownerId);
  assert.equal(after.actions!.at(-1)!.actorMemberId, ADMIN_ID);
  assert.deepEqual(after.actions!.at(-1)!.detailsJson?.cancelledQaTaskIds, [task.id]);
});

test("hierarchy deletion removes dependency owners while retaining missing-target blockers", () => {
  const snapshot = getSnapshot();
  const removableSubsystem = snapshot.subsystems.find((subsystem) => {
    const scopedTasks = snapshot.tasks.filter((task) => task.subsystemIds.includes(subsystem.id));
    return scopedTasks.length > 0 && scopedTasks.every((task) => !hasCorrectiveHistory(snapshot, task.id));
  })!;
  const removedTask = snapshot.tasks.find((task) => task.subsystemIds.includes(removableSubsystem.id))!;
  const remainingTask = snapshot.tasks.find((task) => task.projectId !== removedTask.projectId && task.id !== removedTask.id)!;
  assert.ok(removedTask && remainingTask);
  resetStore({ ...snapshot, tasks: snapshot.tasks.map((task) => task.id === remainingTask.id ? { ...task, status: "in-progress" as const } : task), purchaseItems: snapshot.purchaseItems.map((item) => ({ ...item, taskId: remainingTask.id })), taskDependencies: [
    { id: "removed-owner", dependencyType: "hard", taskId: removedTask.id, kind: "task", refId: remainingTask.id, requiredState: "complete", createdAt: new Date().toISOString() },
    { id: "remaining-owner", dependencyType: "hard", taskId: remainingTask.id, kind: "task", refId: removedTask.id, requiredState: "complete", createdAt: new Date().toISOString() },
  ] });
  removeSubsystem(removableSubsystem.id);
  assert.deepEqual(getSnapshot().taskDependencies.map((dependency) => dependency.id), ["remaining-owner"]);
});

test("manufacturing part definitions require retargeting before deletion", () => {
  const task = createTask({ ...mutableTaskInput(getSnapshot().tasks.find((candidate) => candidate.id === ROBOT_TASK_ID)!), title: "Manufacturing deletion guard", status: "not-started", workTypeId: "robot:manufacturing", manufacturingDetails: {
    part: { kind: "part-definition", partDefinitionId: ROBOT_PART_DEFINITION_ID }, quantity: 1,
    processId: "3d-print", fulfillmentSource: "in-house", material: { kind: "specified-material", name: "PETG" },
    fileArtifactIds: [], tolerances: [], qaRequirements: [],
  } });
  assert.ok(task.manufacturingDetails?.part.kind === "part-definition");
  const partId = task.manufacturingDetails.part.partDefinitionId;
  assert.throws(() => removePartDefinition(partId), /used by manufacturing/);
  assert.ok(getSnapshot().partDefinitions.some((part) => part.id === partId));
});

test("mechanism cross-project moves reject without changing tasks or placements", () => {
  const before = getSnapshot();
  const mechanism = before.mechanisms[0]!;
  const oldSubsystem = before.subsystems.find((subsystem) => subsystem.id === mechanism.subsystemId)!;
  const destination = before.subsystems.find((subsystem) => subsystem.projectId !== oldSubsystem.projectId)!;
  assert.ok(destination);
  assert.throws(() => updateMechanism(mechanism.id, { subsystemId: destination.id }), /cannot move between projects/);
  assert.deepEqual(getSnapshot(), before);
});

test("within-project mechanism moves retain ancestors required by other task targets", () => {
  const before = getSnapshot();
  const mechanism = before.mechanisms[0]!;
  const source = before.subsystems.find((subsystem) => subsystem.id === mechanism.subsystemId)!;
  const destination = before.subsystems.find((subsystem) => subsystem.projectId === source.projectId && subsystem.id !== source.id)!;
  const otherMechanism = { ...mechanism, id: "unmoved-mechanism" };
  const task = before.tasks.find((task) => task.projectId === source.projectId)!;
  resetStore({
    ...before,
    mechanisms: [...before.mechanisms, otherMechanism],
    tasks: before.tasks.map((item) => {
      const affected = item.id === task.id
        ? { ...item, subsystemIds: [source.id], mechanismIds: [mechanism.id, otherMechanism.id], partInstanceIds: [] }
        : item;
      return affected.mechanismIds.includes(mechanism.id) ? { ...affected, status: "in-progress" as const } : affected;
    }),
  });
  updateMechanism(mechanism.id, { subsystemId: destination.id });
  const saved = getSnapshot().tasks.find((item) => item.id === task.id)!;
  assert.deepEqual(new Set(saved.subsystemIds), new Set([destination.id, source.id]));
  assert.equal(saved.projectId, task.projectId);
  assert.deepEqual(saved.workstreamIds, task.workstreamIds);
  assert.doesNotThrow(() => updateTask(task.id, { title: "Moved mechanism remains editable" }));
});

test("task removal removes attributed help and retains missing hard dependency targets", () => {
  const snapshot = getSnapshot();
  const task = snapshot.tasks.find((item) => !hasCorrectiveHistory(snapshot, item.id))!;
  const remaining = snapshot.tasks.find((item) => item.id !== task.id)!;
  createRisk({ projectId: task.projectId, title: "Help requested", detail: "Need a mentor", category: "help", severity: "medium", status: "open", blocksWork: false, source: { kind: "task", id: task.id }, relatedTargets: [{ kind: "task", id: task.id }], mitigationTaskId: null, ownerGroupId: null });
  const before = getSnapshot();
  resetStore({ ...before, tasks: before.tasks.map((record) => record.id === remaining.id ? { ...record, status: "in-progress" as const } : record),
    purchaseItems: before.purchaseItems.map((item) => item.taskId === task.id ? { ...item, taskId: remaining.id } : item),
    taskDependencies: [{ id: "missing-blocker", taskId: remaining.id, kind: "task", refId: task.id, requiredState: "complete", dependencyType: "hard", createdAt: new Date().toISOString() }],
  });
  removeTask(task.id);
  assert.ok(!getSnapshot().risks.some((risk) => risk.source.kind === "task" && risk.source.id === task.id));
  assert.equal(getSnapshot().taskDependencies[0]?.refId, task.id);
});
