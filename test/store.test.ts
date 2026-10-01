import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  createMaterial,
  updateProject,
  updateWorkstream,
  updateRisk,
  updateMaterial,
  updateArtifact,
  updateMechanism,
  updatePurchaseItem,
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
  recordAuditAction,
  resetStore,
  updateSubsystem,
  updatePartDefinition,
  updateMember,
  updatePartInstance,
  updateTask,
} from "../src/data/store";

beforeEach(() => {
  resetStore();
});

function nonRobotProjectNamesForSeason(seasonId: string) {
  return getSnapshot()
    .projects.filter(
      (project) => project.seasonId === seasonId && project.projectType !== "robot",
    )
    .map((project) => project.name);
}

test("seed and created seasons only use the canonical non-robot projects", () => {
  assert.deepEqual(nonRobotProjectNamesForSeason("default-season"), [
    "Media",
    "Outreach",
    "Operations",
    "Strategy",
    "Training",
  ]);

  const season = createSeason({
    name: "2027 Season",
    type: "season",
    startDate: "2027-01-01",
    endDate: "2027-04-30",
  });

  assert.deepEqual(nonRobotProjectNamesForSeason(season.id), [
    "Media",
    "Outreach",
    "Operations",
    "Strategy",
    "Training",
  ]);
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
    seasonId: "default-season",
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
    getSnapshot().projects.map((project) => project.name).sort(),
    ["Media", "Operations", "Outreach", "Robot", "Strategy", "Training"].sort(),
  );
});

test("tutorial baseline keeps the canonical visible season name", () => {
  const baseline = getTutorialBaselineState();

  assert.equal(baseline.seasonId, "default-season");
  assert.equal(baseline.seasonName, "Tutorial Season");
});

test("tutorial seed keeps a planning milestone linked to the robot project", () => {
  const snapshot = getSnapshot();
  const milestone = snapshot.milestones.find((candidate) => candidate.id === "tutorial-robot-checkpoint-feb-21");

  assert.ok(milestone);
  assert.equal(milestone.title, "Robot Checkpoint");
  assert.deepEqual(milestone.projectIds, ["project-robot-2026"]);
});

test("restored tutorial seed includes its planning milestones", () => {
  const snapshot = getSnapshot();
  const tutorialMilestones = snapshot.milestones.filter(
    (milestone) => milestone.seasonId === "default-season",
  );

  assert.ok(tutorialMilestones.some((milestone) => milestone.id === "tutorial-robot-checkpoint-feb-21"));
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
    seasonId: "default-season",
  });

  const updatedMember = updateMember(member.id, {
    activeSeasonIds: [...(member.activeSeasonIds ?? []), season.id],
  });

  assert.ok(updatedMember);
  const refreshedMember = getSnapshot().members.find((candidate) => candidate.id === member.id);
  assert.ok(refreshedMember);
  assert.deepEqual([...(refreshedMember?.activeSeasonIds ?? [])].sort(), ["default-season", season.id].sort());
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
    materialId: "mat-onyx-filament",
    description: "Season-scoped part definition.",
    seasonId: "default-season",
  });

  assert.deepEqual(created.activeSeasonIds, ["default-season"]);

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
    ["default-season", season.id].sort(),
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
  const mechanism = createMechanism({
    subsystemId: "drive",
    name: "Test Mechanism",
    description: "Temporary mechanism for coverage.",
  });

  assert.equal(mechanism.isArchived, false);

  const wiringTask = getSnapshot().tasks.find(
    (task) => (task.mechanismIds[0] ?? null) === mechanism.id && task.title === "Wire Test Mechanism",
  );

  assert.ok(wiringTask);
  assert.equal((wiringTask.subsystemIds[0] ?? ""), "drive");
  assert.equal(wiringTask?.workTypeId, "robot:electrical-wiring");
});

test("createSubsystem auto-generates a testing task for its parent subsystem", () => {
  const subsystem = createSubsystem({
    projectId: "default-season-robot",
    name: "Test Subsystem",
    color: "#4F86C6",
    description: "Temporary subsystem for coverage.",
    parentSubsystemId: "drive",
    responsibleEngineerId: "ava",
    mentorIds: ["marco"],
  });

  const integrationTask = getSnapshot().tasks.find(
    (task) => task.title === "Integrate Test Subsystem",
  );

  assert.equal(subsystem.color, "#4F86C6");
  assert.equal(subsystem.parentSubsystemId, "drive");
  assert.ok(integrationTask);
  assert.equal((integrationTask.subsystemIds[0] ?? ""), "drive");
  assert.equal(integrationTask?.workTypeId, "robot:testing");
  assert.equal((integrationTask.mechanismIds[0] ?? null), null);
  assert.equal(integrationTask?.ownerId, "ava");
  assert.equal(integrationTask?.mentorId, "marco");
});

test("updateTask patches an existing task in place", () => {
  updateTask("wire-swerve-module", {
    status: "complete",
    assigneeIds: ["ava", "ethan"],
  });

  const updatedTask = getSnapshot().tasks.find((task) => task.id === "wire-swerve-module");
  assert.ok(updatedTask);
  assert.equal(updatedTask.status, "complete");
  assert.equal(updatedTask.actualHours, getSnapshot().workLogs.filter((log) => log.taskId === updatedTask.id).reduce((sum, log) => sum + log.hours, 0));
  assert.deepEqual(updatedTask.assigneeIds, ["ava", "ethan"]);
});

test("task updates append an audit action entry", () => {
  const initialActionCount = getSnapshot().actions?.length ?? 0;
  const originalTask = getSnapshot().tasks.find((task) => task.id === "wire-swerve-module");
  assert.ok(originalTask);

  const updatedTask = updateTask("wire-swerve-module", {
    status: "complete",
    estimatedHours: 7,
  }, {
    actorMemberId: "marco",
    requestId: "req-audit-task-update",
  });

  assert.ok(updatedTask);
  const snapshot = getSnapshot();
  const actions = snapshot.actions ?? [];
  assert.equal(actions.length, initialActionCount + 1);

  const lastAction = actions[actions.length - 1];
  assert.equal(lastAction.entityType, "task");
  assert.equal(lastAction.operation, "update");
  assert.equal(lastAction.taskId, "wire-swerve-module");
  assert.equal(lastAction.projectId, updatedTask.projectId);
  assert.equal(lastAction.subsystemId, (updatedTask.subsystemIds[0] ?? ""));
  assert.equal(lastAction.entityLabel, updatedTask.title);
  assert.equal(lastAction.actorMemberId, "marco");
  assert.equal(lastAction.requestId, "req-audit-task-update");
  assert.ok(lastAction.changedFields.includes("estimatedHours"));
  assert.ok(lastAction.changedFields.includes("status"));
  assert.equal(lastAction.beforeJson?.status, "not-started");
  assert.equal(lastAction.afterJson?.status, "complete");
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
  const seeded = getSnapshot().partInstances.find((part) => part.id === "pi-swerve-encoder-bracket-front-left");
  assert.ok(seeded);
  assert.equal(seeded.location.kind, "installed");

  const updated = updatePartInstance(seeded.id, { location: { kind: "repair", location: "Pit repair cart" } });
  assert.equal(updated?.location.kind, "repair");
  assert.equal("readinessStatus" in (updated ?? {}), false);
});

test("manufacturing technical state belongs to the Robot Kanban Task", () => {
  const task = getSnapshot().tasks.find((candidate) => candidate.id === "swerve-sensor-bundle");
  assert.ok(task);
  assert.equal(task.workTypeId, "robot:manufacturing");
  assert.equal(task.manufacturingDetails?.processId, "3d-print");
  assert.equal(task.manufacturingDetails?.fulfillmentSource, "outsourced");
  assert.deepEqual(task.manufacturingDetails?.part, { kind: "part-definition", partDefinitionId: "pd-swerve-encoder-bracket" });

  const outsourcedTask = task;
  assert.ok(getSnapshot().purchaseItems.some((item) => item.taskId === outsourcedTask.id && item.kind === "manufacturing-service"));
});

test("removePartDefinition clears linked part instances and task references", () => {
  const createdPartDefinition = createPartDefinition({
    name: "Temporary Test Part",
    partNumber: "TMP-001",
    revision: "A",
    type: "custom",
    defaultAcquisitionMethod: "stock",
    materialId: "mat-onyx-filament",
    description: "Temporary fixture for store coverage.",
  });
  assert.equal(createdPartDefinition.isArchived, false);
  const createdPartInstance = createPartInstance({
    partDefinitionId: createdPartDefinition.id,
    intendedSubsystemId: "drive",
    intendedMechanismId: "swerve-module",
    location: { kind: "stock", location: "Test bin" },
  });

  updateTask("swerve-sensor-bundle", {
    partInstanceIds: [createdPartInstance.id],
  });

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
    snapshot.tasks.find((task) => task.id === "swerve-sensor-bundle")?.partInstanceIds,
    [],
  );
});

test("removeSubsystem clears QA requests for removed tasks", () => {
  const subsystem = createSubsystem({
    projectId: "project-robot-2026",
    name: "QA cleanup root",
    description: "Scenario for QA request cascade behavior.",
    parentSubsystemId: null,
    responsibleEngineerId: null,
    mentorIds: [],
  });
  const childSubsystem = createSubsystem({
    projectId: "project-robot-2026",
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
  const taskRequest = createQaRequest({
    projectId: generatedTask.projectId,
    targetRefs: [{ kind: "task", id: generatedTask.id }],
    subject: "Tablet refresh QA",
    mentorId: "marco",
    requestedById: "ava",
  });
  const tasklessRequest = createQaRequest({
    projectId: getSnapshot().projects[0]!.id,
    targetRefs: [{ kind: "project", id: getSnapshot().projects[0]!.id }],
    subject: "General QA",
    mentorId: "marco",
    requestedById: "ava",
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
  updateTask("swerve-sensor-bundle", {
    assigneeIds: ["ava", "marco"],
  });

  const removed = removeMember("marco");
  const snapshot = getSnapshot();

  assert.equal(removed?.id, "marco");
  assert.equal(snapshot.members.some((member) => member.id === "marco"), false);
  assert.deepEqual(
    snapshot.subsystems.find((subsystem) => subsystem.id === "drive")?.mentorIds,
    [],
  );
  assert.equal(
    snapshot.subsystems.find((subsystem) => subsystem.id === "drive")?.isCore,
    true,
  );
  assert.equal(
    snapshot.subsystems.some((subsystem) => subsystem.id === "electrical"),
    false,
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "swerve-sensor-bundle")?.mentorId,
    null,
  );
  assert.equal(
    snapshot.tasks.filter((task) => task.mentorId === "marco").length,
    0,
  );
  assert.deepEqual(
    snapshot.tasks.find((task) => task.id === "swerve-sensor-bundle")?.assigneeIds,
    ["ava"],
  );
  assert.deepEqual(
    snapshot.workLogs.find((workLog) => workLog.id === "log-1")?.participantIds,
    ["ava"],
  );
  assert.equal(
    snapshot.attendanceRecords.some((record) => record.memberId === "marco"),
    false,
  );
  assert.ok(snapshot.qaReports.every((report) => !report.participantIds.includes("marco")));
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

  updateSubsystem("drive", {
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
      targetRefs: [{ kind: "subsystem", id: "drive" }],
      conditionType: "iteration",
      conditionValue: "iteration>=2",
      required: true,
      sortOrder: 1,
      notes: "Drive subsystem must be at least iteration 2.",
    },
    {
      id: "drive-check-part-state",
      milestoneId: milestone.id,
      targetRefs: [{ kind: "part-instance", id: "pi-swerve-encoder-bracket-front-left" }],
      conditionType: "workflow-state",
      conditionValue: "state=READY",
      required: true,
      sortOrder: 2,
      notes: "Encoder bracket part instance must be ready.",
    },
    ],
  });

  const matches = getMilestonesForTask("swerve-sensor-bundle");

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
      targetRefs: [{ kind: "project", id: "project-robot-2026" }],
      conditionType: "custom",
      conditionValue: "in_scope",
      required: true,
      sortOrder: 1,
      notes: "Robot-project-scoped checkpoint.",
    },
    ],
  });

  const matches = getMilestonesForTask("swerve-sensor-bundle");
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

  const updated = updateTask("wire-swerve-module", {
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

  updateSubsystem("drive", {
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
      targetRefs: [{ kind: "subsystem", id: "drive" }],
      conditionType: "iteration",
      conditionValue: "iteration>=2",
      required: true,
      sortOrder: 1,
      notes: "Drive subsystem must meet the first major milestone.",
    },
    ],
  });

  const explicitTask = updateTask("wire-swerve-module", {
    subsystemIds: ["outreach"],
    scheduleRefs: [{ kind: "milestone", id: milestone.id }],
  });
  assert.ok(explicitTask);

  const matches = getTasksForMilestone(milestone.id);

  const inferredTask = matches.find((match) =>
    match.taskId === "swerve-sensor-bundle",
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
  const first = "wire-swerve-module";
  const second = "swerve-sensor-bundle";
  const beforeFirst = hours(first);
  const beforeSecond = hours(second);
  const log = createWorkLog({ taskId: first, date: "2026-09-09", hours: 2, participantIds: ["ava"], notes: "Evidence" });
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
    onHandQuantity: 5, reorderPoint: 1, location: "Rack", preferredVendorId: "vendor-tutorial-supplier", notes: "Retain notes",
  });
  const before = getSnapshot();
  const updated = updateMaterial(material.id, { onHandQuantity: 3 });
  assert.ok(updated);
  assert.equal(updated.notes, "Retain notes");
  assert.equal(before.materials.find((item) => item.id === material.id)?.onHandQuantity, 5);
  const published = getSnapshot();
  assert.deepEqual(published.materials.find((item) => item.id === material.id), updated);
  assert.deepEqual(published.actions?.at(-1)?.changedFields, ["onHandQuantity"]);
  updated.onHandQuantity = 99;
  assert.equal(getSnapshot().materials.find((item) => item.id === material.id)?.onHandQuantity, 3);
  assert.throws(() => updateMaterial(material.id, { onHandQuantity: Number.NaN }), /plain JSON data/);
  assert.equal(getSnapshot(), published);

  const unchanged = updateMaterial(material.id, {});
  assert.equal(unchanged?.onHandQuantity, 3);
  assert.equal(getSnapshot().actions?.length, (published.actions?.length ?? 0) + 1);
  assert.deepEqual(getSnapshot().actions?.at(-1)?.changedFields, []);
});
