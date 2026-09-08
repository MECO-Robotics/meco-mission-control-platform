import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  createProject,
  createSeason,
  createManufacturingItem,
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
  updateManufacturingItem,
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

test("seeded training records stay in Training while strategy has its own seeded coverage", () => {
  const snapshot = getSnapshot();
  const trainingProject = snapshot.projects.find(
    (project) => project.id === "project-training-2026",
  );

  assert.ok(trainingProject);
  assert.equal(trainingProject.name, "Training");
  assert.equal(
    snapshot.workstreams.find((workstream) => workstream.id === "workstream-scouting-training")
      ?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.workstreams.find((workstream) => workstream.id === "workstream-scouting-data")
      ?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.subsystems.find((subsystem) => subsystem.id === "scouting")?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.artifacts.find((artifact) => artifact.id === "artifact-scouting-rubric")
      ?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.artifacts.find((artifact) => artifact.id === "artifact-scouting-ingest-notes")
      ?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "scouting-rubric-training")?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "scouting-tablet-refresh")?.projectId,
    trainingProject.id,
  );
  assert.deepEqual(
    snapshot.workstreams
      .filter((workstream) => workstream.projectId === "project-strategy-2026")
      .map((workstream) => workstream.id)
      .sort(),
    ["workstream-strategy-playbooks", "workstream-strategy-scouting"].sort(),
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "strategy-opponent-model-update")?.projectId,
    "project-strategy-2026",
  );
  assert.equal(
    snapshot.artifacts.find((artifact) => artifact.id === "artifact-strategy-picklist-board")
      ?.projectId,
    "project-strategy-2026",
  );
});

test("tutorial baseline keeps the canonical visible season name", () => {
  const baseline = getTutorialBaselineState();

  assert.equal(baseline.seasonId, "default-season");
  assert.equal(baseline.seasonName, "Tutorial Season");
});

test("seed data includes an Outreach milestone linked to the outreach subsystem", () => {
  const snapshot = getSnapshot();
  const milestone = snapshot.milestones.find((candidate) => candidate.id === "outreach-milestone-may-05");

  assert.ok(milestone);
  assert.equal(milestone.title, "Outreach Milestone");
  assert.equal(milestone.type, "demo");
  assert.equal(milestone.isExternal, true);
  assert.deepEqual(milestone.projectIds, ["project-outreach-2026"]);
});

test("tutorial season seed includes milestone events", () => {
  const snapshot = getSnapshot();
  const tutorialMilestones = snapshot.milestones.filter(
    (milestone) => milestone.seasonId === "default-season",
  );

  assert.ok(tutorialMilestones.some((milestone) => milestone.id === "tutorial-season-kickoff-jan-10"));
  assert.ok(tutorialMilestones.some((milestone) => milestone.id === "tutorial-robot-checkpoint-feb-21"));
  assert.ok(tutorialMilestones.some((milestone) => milestone.id === "tutorial-training-showcase-mar-21"));
});

test("offseason FRC sample data has internally consistent references", () => {
  const snapshot = getSnapshot();
  const ids = {
    artifacts: new Set(snapshot.artifacts.map((item) => item.id)),
    manufacturing: new Set(snapshot.manufacturingItems.map((item) => item.id)),
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
    expectId(ids.workstreams, task.workstreamId, `task ${task.id} workstreamId`);
    expectId(ids.subsystems, task.subsystemId, `task ${task.id} subsystemId`);
    expectId(ids.mechanisms, task.mechanismId, `task ${task.id} mechanismId`);
    expectId(ids.partInstances, task.partInstanceId, `task ${task.id} partInstanceId`);
    expectId(ids.artifacts, task.artifactId, `task ${task.id} artifactId`);
    expectId(ids.milestones, task.targetMilestoneId, `task ${task.id} targetMilestoneId`);
    expectId(ids.members, task.ownerId, `task ${task.id} ownerId`);
    expectId(ids.members, task.mentorId, `task ${task.id} mentorId`);
    task.assigneeIds.forEach((id) => expectId(ids.members, id, `task ${task.id} assigneeIds`));
    task.linkedManufacturingIds.forEach((id) =>
      expectId(ids.manufacturing, id, `task ${task.id} linkedManufacturingIds`),
    );
    task.linkedPurchaseIds.forEach((id) =>
      expectId(ids.purchases, id, `task ${task.id} linkedPurchaseIds`),
    );
  }

  for (const manufacturingItem of snapshot.manufacturingItems) {
    expectId(ids.subsystems, manufacturingItem.subsystemId, `manufacturing ${manufacturingItem.id} subsystemId`);
    expectId(ids.members, manufacturingItem.requestedById, `manufacturing ${manufacturingItem.id} requestedById`);
    expectId(ids.materials, manufacturingItem.materialId, `manufacturing ${manufacturingItem.id} materialId`);
    expectId(ids.partDefinitions, manufacturingItem.partDefinitionId, `manufacturing ${manufacturingItem.id} partDefinitionId`);
    expectId(ids.partInstances, manufacturingItem.partInstanceId, `manufacturing ${manufacturingItem.id} partInstanceId`);
    manufacturingItem.partInstanceIds.forEach((id) =>
      expectId(ids.partInstances, id, `manufacturing ${manufacturingItem.id} partInstanceIds`),
    );
  }

  for (const purchaseItem of snapshot.purchaseItems) {
    expectId(ids.subsystems, purchaseItem.subsystemId, `purchase ${purchaseItem.id} subsystemId`);
    expectId(ids.members, purchaseItem.requestedById, `purchase ${purchaseItem.id} requestedById`);
    expectId(ids.partDefinitions, purchaseItem.partDefinitionId, `purchase ${purchaseItem.id} partDefinitionId`);
  }

  for (const partDefinition of snapshot.partDefinitions) {
    expectId(ids.materials, partDefinition.materialId, `part definition ${partDefinition.id} materialId`);
  }

  for (const partInstance of snapshot.partInstances) {
    expectId(ids.subsystems, partInstance.subsystemId, `part instance ${partInstance.id} subsystemId`);
    expectId(ids.mechanisms, partInstance.mechanismId, `part instance ${partInstance.id} mechanismId`);
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
    expectId(ids.tasks, qaReport.taskId, `qa report ${qaReport.id} taskId`);
    qaReport.participantIds.forEach((id) => expectId(ids.members, id, `qa report ${qaReport.id} participantIds`));
  }

  for (const testResult of snapshot.testResults) {
    expectId(ids.milestones, testResult.milestoneId, `test result ${testResult.id} milestoneId`);
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

  for (const taskBlocker of snapshot.taskBlockers) {
    expectId(ids.tasks, taskBlocker.blockedTaskId, `task blocker ${taskBlocker.id} blockedTaskId`);
    expectId(ids.members, taskBlocker.createdByMemberId, `task blocker ${taskBlocker.id} createdByMemberId`);
  }

  for (const qaFinding of snapshot.qaFindings) {
    expectId(ids.qaReports, qaFinding.qaReportId, `qa finding ${qaFinding.id} qaReportId`);
    expectId(ids.tasks, qaFinding.taskId, `qa finding ${qaFinding.id} taskId`);
    expectId(ids.projects, qaFinding.projectId, `qa finding ${qaFinding.id} projectId`);
    expectId(ids.workstreams, qaFinding.workstreamId, `qa finding ${qaFinding.id} workstreamId`);
    expectId(ids.subsystems, qaFinding.subsystemId, `qa finding ${qaFinding.id} subsystemId`);
    expectId(ids.mechanisms, qaFinding.mechanismId, `qa finding ${qaFinding.id} mechanismId`);
    expectId(ids.partInstances, qaFinding.partInstanceId, `qa finding ${qaFinding.id} partInstanceId`);
    expectId(ids.artifacts, qaFinding.artifactId, `qa finding ${qaFinding.id} artifactId`);
  }

  for (const testFinding of snapshot.testFindings) {
    expectId(ids.testResults, testFinding.testResultId, `test finding ${testFinding.id} testResultId`);
    expectId(ids.milestones, testFinding.milestoneId, `test finding ${testFinding.id} milestoneId`);
    expectId(ids.tasks, testFinding.taskId, `test finding ${testFinding.id} taskId`);
    expectId(ids.projects, testFinding.projectId, `test finding ${testFinding.id} projectId`);
    expectId(ids.workstreams, testFinding.workstreamId, `test finding ${testFinding.id} workstreamId`);
    expectId(ids.subsystems, testFinding.subsystemId, `test finding ${testFinding.id} subsystemId`);
    expectId(ids.mechanisms, testFinding.mechanismId, `test finding ${testFinding.id} mechanismId`);
    expectId(ids.partInstances, testFinding.partInstanceId, `test finding ${testFinding.id} partInstanceId`);
    expectId(ids.artifacts, testFinding.artifactId, `test finding ${testFinding.id} artifactId`);
  }

  for (const designIteration of snapshot.designIterations) {
    const findingIds = designIteration.sourceType === "qa" ? ids.qaFindings : ids.testFindings;
    expectId(findingIds, designIteration.findingId, `design iteration ${designIteration.id} findingId`);
    expectId(ids.projects, designIteration.projectId, `design iteration ${designIteration.id} projectId`);
    expectId(ids.workstreams, designIteration.workstreamId, `design iteration ${designIteration.id} workstreamId`);
    expectId(ids.subsystems, designIteration.subsystemId, `design iteration ${designIteration.id} subsystemId`);
    expectId(ids.mechanisms, designIteration.mechanismId, `design iteration ${designIteration.id} mechanismId`);
    expectId(ids.partInstances, designIteration.partInstanceId, `design iteration ${designIteration.id} partInstanceId`);
    expectId(ids.artifacts, designIteration.artifactId, `design iteration ${designIteration.id} artifactId`);
    expectId(ids.tasks, designIteration.taskId, `design iteration ${designIteration.id} taskId`);
  }

  for (const risk of snapshot.risks) {
    const sourceSet = risk.sourceType === "qa-report" ? ids.qaReports : ids.testResults;
    expectId(sourceSet, risk.sourceId, `risk ${risk.id} sourceId`);
    if (risk.attachmentType === "project") {
      expectId(ids.projects, risk.attachmentId, `risk ${risk.id} attachmentId`);
    } else if (risk.attachmentType === "workstream") {
      expectId(ids.workstreams, risk.attachmentId, `risk ${risk.id} attachmentId`);
    } else if (risk.attachmentType === "mechanism") {
      expectId(ids.mechanisms, risk.attachmentId, `risk ${risk.id} attachmentId`);
    } else {
      expectId(ids.partInstances, risk.attachmentId, `risk ${risk.id} attachmentId`);
    }
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
  assert.deepEqual(refreshedMember?.activeSeasonIds?.sort(), ["default-season", season.id].sort());
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
    source: "Onshape",
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
    refreshedPartDefinition?.activeSeasonIds?.sort(),
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
    (task) => task.mechanismId === mechanism.id && task.title === "Wire Test Mechanism",
  );

  assert.ok(wiringTask);
  assert.equal(wiringTask?.subsystemId, "drive");
  assert.equal(wiringTask?.disciplineId, "electrical");
});

test("createSubsystem auto-generates a testing task for its parent subsystem", () => {
  const subsystem = createSubsystem({
    projectId: "default-season-robot",
    name: "Test Subsystem",
    color: "#4F86C6",
    description: "Temporary subsystem for coverage.",
    parentSubsystemId: "drive",
    responsibleEngineerId: "ava",
    mentorIds: ["jordan"],
    risks: ["Temporary integration risk"],
  });

  const integrationTask = getSnapshot().tasks.find(
    (task) => task.title === "Integrate Test Subsystem",
  );

  assert.equal(subsystem.color, "#4F86C6");
  assert.equal(subsystem.parentSubsystemId, "drive");
  assert.ok(integrationTask);
  assert.equal(integrationTask?.subsystemId, "drive");
  assert.equal(integrationTask?.disciplineId, "testing");
  assert.equal(integrationTask?.mechanismId, null);
  assert.equal(integrationTask?.ownerId, "ava");
  assert.equal(integrationTask?.mentorId, "jordan");
});

test("updateTask patches an existing task in place", () => {
  updateTask("intake-guard", {
    status: "complete",
    actualHours: 8,
    assigneeIds: ["ava", "ethan"],
  });

  const updatedTask = getSnapshot().tasks.find((task) => task.id === "intake-guard");
  assert.ok(updatedTask);
  assert.equal(updatedTask.status, "complete");
  assert.equal(updatedTask.actualHours, 8);
  assert.deepEqual(updatedTask.assigneeIds, ["ava", "ethan"]);
});

test("task updates append an audit action entry", () => {
  const initialActionCount = getSnapshot().actions?.length ?? 0;
  const originalTask = getSnapshot().tasks.find((task) => task.id === "intake-guard");
  assert.ok(originalTask);

  const updatedTask = updateTask("intake-guard", {
    status: "complete",
    actualHours: 7,
  }, {
    actorMemberId: "jordan",
    requestId: "req-audit-task-update",
  });

  assert.ok(updatedTask);
  const snapshot = getSnapshot();
  const actions = snapshot.actions ?? [];
  assert.equal(actions.length, initialActionCount + 1);

  const lastAction = actions[actions.length - 1];
  assert.equal(lastAction.entityType, "task");
  assert.equal(lastAction.operation, "update");
  assert.equal(lastAction.taskId, "intake-guard");
  assert.equal(lastAction.projectId, updatedTask.projectId);
  assert.equal(lastAction.subsystemId, updatedTask.subsystemId);
  assert.equal(lastAction.entityLabel, updatedTask.title);
  assert.equal(lastAction.actorMemberId, "jordan");
  assert.equal(lastAction.requestId, "req-audit-task-update");
  assert.ok(lastAction.changedFields.includes("actualHours"));
  assert.ok(lastAction.changedFields.includes("status"));
  assert.equal(lastAction.beforeJson?.status, "in-progress");
  assert.equal(lastAction.afterJson?.status, "complete");
  assert.equal(lastAction.beforeJson?.actualHours, originalTask.actualHours);
  assert.equal(lastAction.afterJson?.actualHours, 7);
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

test("updatePartInstance keeps the subsystem aligned with the selected mechanism", () => {
  updatePartInstance("pi-swerve-encoder-bracket-front-left", {
    mechanismId: "intake-roller",
  });

  const updatedPartInstance = getSnapshot().partInstances.find(
    (item) => item.id === "pi-swerve-encoder-bracket-front-left",
  );
  assert.ok(updatedPartInstance);
  assert.equal(updatedPartInstance.mechanismId, "intake-roller");
  assert.equal(updatedPartInstance.subsystemId, "manipulator");
});

test("createPartInstance merges duplicate part and mechanism quantities", () => {
  const temporaryPartDefinition = createPartDefinition({
    name: "Temporary Merge Part",
    partNumber: "TMP-MERGE-000",
    revision: "A",
    type: "custom",
    source: "Onshape",
    materialId: "mat-onyx-filament",
    description: "Temporary fixture for merge coverage.",
  });

  const firstPartInstance = createPartInstance({
    subsystemId: "drive",
    mechanismId: "swerve-module",
    partDefinitionId: temporaryPartDefinition.id,
    name: "Encoder bracket set",
    quantity: 2,
    trackIndividually: false,
    status: "not ready",
  });

  const mergedPartInstance = createPartInstance({
    subsystemId: "drive",
    mechanismId: "swerve-module",
    partDefinitionId: temporaryPartDefinition.id,
    name: "Encoder bracket set",
    quantity: 3,
    trackIndividually: true,
    status: "ready",
  });

  const matchingPartInstances = getSnapshot().partInstances.filter(
    (partInstance) =>
      partInstance.subsystemId === "drive" &&
      partInstance.mechanismId === "swerve-module" &&
      partInstance.partDefinitionId === temporaryPartDefinition.id,
  );

  assert.equal(matchingPartInstances.length, 1);
  assert.equal(mergedPartInstance.id, firstPartInstance.id);
  assert.equal(matchingPartInstances[0].quantity, 5);
});

test("createPartInstance keeps shared definitions separate by mechanism ownership", () => {
  const sharedPartDefinition = createPartDefinition({
    name: "Temporary Shared Hardware",
    partNumber: "TMP-SHARED-000",
    revision: "A",
    type: "hardware",
    source: "COTS",
    materialId: "mat-onyx-filament",
    description: "Temporary fixture for mechanism ownership coverage.",
  });

  const drivePartInstance = createPartInstance({
    subsystemId: "drive",
    mechanismId: "swerve-module",
    partDefinitionId: sharedPartDefinition.id,
    name: "Drive shared hardware",
    quantity: 2,
    trackIndividually: false,
    status: "not ready",
  });
  const intakePartInstance = createPartInstance({
    subsystemId: "manipulator",
    mechanismId: "intake-roller",
    partDefinitionId: sharedPartDefinition.id,
    name: "Intake shared hardware",
    quantity: 3,
    trackIndividually: false,
    status: "ready",
  });

  const matchingPartInstances = getSnapshot().partInstances.filter(
    (partInstance) => partInstance.partDefinitionId === sharedPartDefinition.id,
  );

  assert.notEqual(drivePartInstance.id, intakePartInstance.id);
  assert.equal(matchingPartInstances.length, 2);
  assert.deepEqual(
    matchingPartInstances.map((partInstance) => ({
      mechanismId: partInstance.mechanismId,
      quantity: partInstance.quantity,
      subsystemId: partInstance.subsystemId,
    })),
    [
      { mechanismId: "swerve-module", quantity: 2, subsystemId: "drive" },
      { mechanismId: "intake-roller", quantity: 3, subsystemId: "manipulator" },
    ],
  );
});

test("updatePartInstance merges onto an existing part and retargets task references", () => {
  const temporaryPartDefinition = createPartDefinition({
    name: "Temporary Merge Part",
    partNumber: "TMP-MERGE-001",
    revision: "A",
    type: "custom",
    source: "Onshape",
    materialId: "mat-onyx-filament",
    description: "Temporary fixture for merge coverage.",
  });

  const drivePartInstance = createPartInstance({
    subsystemId: "drive",
    mechanismId: "swerve-module",
    partDefinitionId: temporaryPartDefinition.id,
    name: "Drive merge part",
    quantity: 2,
    trackIndividually: false,
    status: "not ready",
  });
  const intakePartInstance = createPartInstance({
    subsystemId: "manipulator",
    mechanismId: "intake-roller",
    partDefinitionId: temporaryPartDefinition.id,
    name: "Intake merge part",
    quantity: 3,
    trackIndividually: false,
    status: "blocked",
  });

  updateTask("swerve-sensor-bundle", {
    partInstanceId: intakePartInstance.id,
  });

  const mergedPartInstance = updatePartInstance(intakePartInstance.id, {
    mechanismId: "swerve-module",
  });

  const matchingPartInstances = getSnapshot().partInstances.filter(
    (partInstance) => partInstance.partDefinitionId === temporaryPartDefinition.id,
  );
  const updatedTask = getSnapshot().tasks.find((task) => task.id === "swerve-sensor-bundle");

  assert.ok(mergedPartInstance);
  assert.equal(mergedPartInstance.id, drivePartInstance.id);
  assert.equal(matchingPartInstances.length, 1);
  assert.equal(matchingPartInstances[0].quantity, 5);
  assert.equal(matchingPartInstances[0].mechanismId, "swerve-module");
  assert.equal(updatedTask?.partInstanceId, drivePartInstance.id);
});

test("fabrication manufacturing items stay seeded and update cleanly", () => {
  const seededFabricationItem = getSnapshot().manufacturingItems.find(
    (item) => item.id === "frame-weldment",
  );

  assert.ok(seededFabricationItem);
  assert.equal(seededFabricationItem?.process, "fabrication");
  assert.equal(seededFabricationItem?.partDefinitionId, null);

  const createdFabricationItem = createManufacturingItem({
    title: "Temporary Weldment",
    subsystemId: "drive",
    requestedById: "ava",
    process: "fabrication",
    dueDate: "2026-04-30",
    material: "1/8 aluminum tube",
    partDefinitionId: null,
    quantity: 1,
    status: "requested",
    mentorReviewed: false,
    batchLabel: "FAB-99",
  });

  assert.equal(createdFabricationItem.process, "fabrication");
  assert.equal(createdFabricationItem.partDefinitionId, null);
  assert.equal(createdFabricationItem.batchLabel, "FAB-99");

  updateManufacturingItem(createdFabricationItem.id, {
    title: "Temporary Weldment Rev B",
    status: "approved",
  });

  const updatedFabricationItem = getSnapshot().manufacturingItems.find(
    (item) => item.id === createdFabricationItem.id,
  );
  assert.ok(updatedFabricationItem);
  assert.equal(updatedFabricationItem.process, "fabrication");
  assert.equal(updatedFabricationItem.title, "Temporary Weldment Rev B");
  assert.equal(updatedFabricationItem.status, "approved");
});

test("cnc manufacturing items keep the in-house flag through create and update", () => {
  const createdCncItem = createManufacturingItem({
    title: "Temporary CNC Plate",
    subsystemId: "drive",
    requestedById: "ava",
    process: "cnc",
    dueDate: "2026-05-01",
    material: "6061 aluminum",
    partDefinitionId: "pd-swerve-encoder-bracket",
    quantity: 2,
    status: "requested",
    mentorReviewed: false,
    batchLabel: "CNC-99",
    inHouse: false,
  });

  assert.equal(createdCncItem.inHouse, false);

  updateManufacturingItem(createdCncItem.id, {
    inHouse: true,
  });

  const updatedCncItem = getSnapshot().manufacturingItems.find(
    (item) => item.id === createdCncItem.id,
  );
  assert.ok(updatedCncItem);
  assert.equal(updatedCncItem.inHouse, true);
});

test("manufacturing items keep linked part instances through create and update", () => {
  const createdCncItem = createManufacturingItem({
    title: "Temporary Encoder Bracket",
    subsystemId: "drive",
    requestedById: "ava",
    process: "cnc",
    dueDate: "2026-05-01",
    material: "6061 aluminum",
    partDefinitionId: "pd-swerve-encoder-bracket",
    partInstanceId: "pi-swerve-encoder-bracket-front-left",
    partInstanceIds: ["pi-swerve-encoder-bracket-front-left"],
    quantity: 2,
    status: "requested",
    mentorReviewed: false,
    batchLabel: "CNC-100",
    inHouse: true,
  });

  assert.equal(createdCncItem.partInstanceId, "pi-swerve-encoder-bracket-front-left");
  assert.deepEqual(createdCncItem.partInstanceIds, ["pi-swerve-encoder-bracket-front-left"]);

  updateManufacturingItem(createdCncItem.id, {
    subsystemId: "manipulator",
    partDefinitionId: "pd-intake-guard",
    partInstanceId: "pi-intake-guard-set",
    partInstanceIds: ["pi-intake-guard-set"],
  });

  const updatedCncItem = getSnapshot().manufacturingItems.find(
    (item) => item.id === createdCncItem.id,
  );
  assert.ok(updatedCncItem);
  assert.equal(updatedCncItem.partInstanceId, "pi-intake-guard-set");
  assert.deepEqual(updatedCncItem.partInstanceIds, ["pi-intake-guard-set"]);
});

test("removePartDefinition clears linked part instances and task references", () => {
  const createdPartDefinition = createPartDefinition({
    name: "Temporary Test Part",
    partNumber: "TMP-001",
    revision: "A",
    type: "custom",
    source: "Onshape",
    materialId: "mat-onyx-filament",
    description: "Temporary fixture for store coverage.",
  });
  assert.equal(createdPartDefinition.isArchived, false);
  const createdPartInstance = createPartInstance({
    subsystemId: "drive",
    mechanismId: "swerve-module",
    partDefinitionId: createdPartDefinition.id,
    name: "Temporary test part instance",
    quantity: 1,
    trackIndividually: false,
    status: "not ready",
  });

  updateTask("swerve-sensor-bundle", {
    partInstanceId: createdPartInstance.id,
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
  assert.equal(
    snapshot.tasks.find((task) => task.id === "swerve-sensor-bundle")?.partInstanceId,
    null,
  );
});

test("removeSubsystem clears QA requests for removed tasks", () => {
  const taskRequest = createQaRequest({
    taskId: "scouting-tablet-refresh",
    subject: "Tablet refresh QA",
    mentorId: "maria",
    requestedById: "avery",
  });
  const tasklessRequest = createQaRequest({
    subject: "General QA",
    mentorId: "maria",
    requestedById: "avery",
  });

  assert.ok(getQaRequests().some((request) => request.id === taskRequest.id));
  assert.ok(getQaRequests().some((request) => request.id === tasklessRequest.id));

  const removed = removeSubsystem("scouting");

  assert.ok(removed);
  assert.equal(
    getQaRequests().some((request) => request.id === taskRequest.id),
    false,
  );
  assert.ok(getQaRequests().some((request) => request.id === tasklessRequest.id));
});

test("removeMember clears linked references across the snapshot", () => {
  updateTask("swerve-sensor-bundle", {
    assigneeIds: ["ava", "jordan"],
  });

  const removed = removeMember("jordan");
  const snapshot = getSnapshot();

  assert.equal(removed?.id, "jordan");
  assert.equal(snapshot.members.some((member) => member.id === "jordan"), false);
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
    snapshot.tasks.find((task) => task.id === "pit-checklist")?.mentorId,
    null,
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
    snapshot.attendanceRecords.some((record) => record.memberId === "jordan"),
    false,
  );
  assert.deepEqual(
    snapshot.qaReviews.find((review) => review.id === "qa-1")?.participantIds,
    ["priya"],
  );
  assert.deepEqual(
    snapshot.qaReviews.find((review) => review.id === "qa-2")?.participantIds,
    ["ava"],
  );
});

test("task milestone requirements infer milestone matches from explicit target requirements", () => {
  const milestone = createMilestone({
    title: "Drive Checkpoint",
    type: "deadline",
    startDateTime: "2026-06-10T10:00:00-04:00",
    endDateTime: null,
    isExternal: false,
    description: "Checkpoint for drive subsystem readiness.",
    projectIds: [],
  });

  updateSubsystem("drive", {
    iteration: 3,
  });

  const snapshot = getSnapshot();
  snapshot.milestoneRequirements = [
    ...(snapshot.milestoneRequirements ?? []),
    {
      id: "drive-check-iteration",
      milestoneId: milestone.id,
      targetType: "subsystem",
      targetId: "drive",
      conditionType: "iteration",
      conditionValue: "iteration>=2",
      required: true,
      sortOrder: 1,
      notes: "Drive subsystem must be at least iteration 2.",
    },
    {
      id: "drive-check-part-state",
      milestoneId: milestone.id,
      targetType: "part-instance",
      targetId: "pi-swerve-encoder-bracket-front-left",
      conditionType: "workflow_state",
      conditionValue: "state=READY",
      required: true,
      sortOrder: 2,
      notes: "Encoder bracket part instance must be ready.",
    },
  ];

  const matches = getMilestonesForTask("swerve-sensor-bundle");

  const driveMatch = matches.find((match) => match.milestoneId === milestone.id);
  assert.ok(driveMatch);
  assert.equal(driveMatch.isLegacyLink, false);
  assert.deepEqual(
    new Set(driveMatch.matchedRequirementIds),
    new Set(["drive-check-iteration", "drive-check-part-state"]),
  );
});

test("project-scoped requirements match through project task target inference", () => {
  const milestone = createMilestone({
    title: "Robot Scope Checkpoint",
    type: "deadline",
    startDateTime: "2026-06-18T09:00:00-04:00",
    endDateTime: null,
    isExternal: false,
    description: "Scope requirement inferred from milestone project membership.",
    projectIds: [],
  });

  const snapshot = getSnapshot();
  snapshot.milestoneRequirements = [
    ...(snapshot.milestoneRequirements ?? []),
    {
      id: "robot-scope-match",
      milestoneId: milestone.id,
      targetType: "project",
      targetId: "project-robot-2026",
      conditionType: "custom",
      conditionValue: "in_scope",
      required: true,
      sortOrder: 1,
      notes: "Robot-project-scoped checkpoint.",
    },
  ];

  const matches = getMilestonesForTask("swerve-sensor-bundle");
  const scopeMatch = matches.find((match) => match.milestoneId === milestone.id);

  assert.ok(scopeMatch);
  assert.equal(scopeMatch.isLegacyLink, false);
  assert.ok(scopeMatch.matchedRequirementIds.includes("robot-scope-match"));
});

test("legacy target-milestone links are preserved when no requirement match exists", () => {
  const milestone = createMilestone({
    title: "Legacy-Only Milestone",
    type: "deadline",
    startDateTime: "2026-07-10T09:00:00-04:00",
    endDateTime: null,
    isExternal: false,
    description: "Legacy-only mapping validation fixture.",
    projectIds: [],
  });

  const updated = updateTask("outreach-kiosk-assembly", {
    targetMilestoneId: milestone.id,
  });
  assert.ok(updated);

  const matches = getMilestonesForTask(updated.id);

  const legacyMatch = matches.find((match) => match.milestoneId === milestone.id);
  assert.ok(legacyMatch);
  assert.equal(legacyMatch.isLegacyLink, true);
  assert.deepEqual(legacyMatch.matchedRequirementIds, []);
});

test("getTasksForMilestone aggregates inferred and legacy task matches", () => {
  const milestone = createMilestone({
    title: "Drive Milestone",
    type: "deadline",
    startDateTime: "2026-08-12T11:00:00-04:00",
    endDateTime: null,
    isExternal: false,
    description: "Drive milestone that supports inferred and legacy matches.",
    projectIds: [],
  });

  updateSubsystem("drive", {
    iteration: 2,
  });

  const snapshot = getSnapshot();
  snapshot.milestoneRequirements = [
    ...(snapshot.milestoneRequirements ?? []),
    {
      id: "drive-readiness-iteration",
      milestoneId: milestone.id,
      targetType: "subsystem",
      targetId: "drive",
      conditionType: "iteration",
      conditionValue: "iteration>=2",
      required: true,
      sortOrder: 1,
      notes: "Drive subsystem must meet the first major milestone.",
    },
  ];

  const legacyTask = updateTask("outreach-kiosk-assembly", {
    targetMilestoneId: milestone.id,
  });
  assert.ok(legacyTask);

  const matches = getTasksForMilestone(milestone.id);

  const inferredTask = matches.find((match) =>
    match.taskId === "swerve-sensor-bundle",
  );
  const legacyTaskMatch = matches.find((match) => match.taskId === legacyTask.id);

  assert.ok(inferredTask);
  assert.equal(inferredTask.isLegacyLink, false);
  assert.deepEqual(
    new Set(inferredTask.matchedRequirementIds),
    new Set(["drive-readiness-iteration"]),
  );

  assert.ok(legacyTaskMatch);
  assert.equal(legacyTaskMatch.isLegacyLink, true);
  assert.deepEqual(legacyTaskMatch.matchedRequirementIds, []);
});
