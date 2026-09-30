import {
  reportFromQaReport,
  reportFromTestResult,
  reportFindingFromFinding,
} from "../../data/store/reportDerivations";
import type {
  ReadonlyData,
  AuditAction,
  Milestone,
  MilestoneRequirement,
  SnapshotView,
  Report,
  ReportFinding,
  QaFinding,
  QaReport,
  QaRequest,
  TestFinding,
  TestResult,
  Task,
  TaskDependency,
  WorkItem,
} from "../../domain/types";
import { normalizePmCadProvenance } from "../../domain/pmCadProvenance";
import { isTaskWaitingOnDependencies, isWorkItemWaitingOnDependencies } from "../../domain/taskDependencyState";
import { isActiveInSeason } from "../../domain/seasonMembership";

export interface BootstrapSelection {
  personId: string | null;
  seasonId: string | null;
  projectId: string | null;
}

export interface BootstrapResponseOptions {
  sanitizeEscalations?: boolean;
}

function getPairedManufacturingTasks(tasks: readonly ReadonlyData<Task>[], manufacturingItems: SnapshotView["manufacturingItems"]) {
  const linkedTasksByManufacturingId = new Map<string, ReadonlyData<Task>[]>();
  for (const task of tasks) for (const id of task.linkedManufacturingIds) {
    const matches = linkedTasksByManufacturingId.get(id) ?? [];
    matches.push(task);
    linkedTasksByManufacturingId.set(id, matches);
  }
  const pairedTasks = new Map<string, ReadonlyData<Task>>();
  for (const item of manufacturingItems) {
    const linked = linkedTasksByManufacturingId.get(item.id) ?? [];
    const typedManufacturingTasks = linked.filter((task) => task.workType === "Manufacturing");
    const sameTitleTasks = linked.filter((task) => task.title.trim().toLocaleLowerCase() === item.title.trim().toLocaleLowerCase());
    const candidates = typedManufacturingTasks.length > 0 ? typedManufacturingTasks : sameTitleTasks;
    if (candidates.length === 1) pairedTasks.set(item.id, candidates[0]);
  }
  return pairedTasks;
}

export function toWorkItems(tasks: readonly ReadonlyData<Task>[], manufacturingItems: SnapshotView["manufacturingItems"]): WorkItem[] {
  const taskByManufacturingId = getPairedManufacturingTasks(tasks, manufacturingItems);
  const manufacturingIds = new Set(manufacturingItems.map((item) => item.id));
  const taskItems = tasks
    .filter((task) => !task.linkedManufacturingIds.some((id) => manufacturingIds.has(id) && taskByManufacturingId.get(id)?.id === task.id))
    .map((task): WorkItem => ({
      id: `task:${task.id}`, sourceType: "task", sourceId: task.id, taskId: task.id,
      title: task.title, workType: task.workType ?? "Design", responsibleGroup: task.responsibleGroup ?? null,
      manufacturingProcess: null, subsystemId: task.subsystemIds[0] ?? "", dueDate: task.dueDate, status: task.status, isWaitingOnDependency: false,
      quantity: null, material: null, materialId: null, partDefinitionId: null,
      partInstanceIds: [...task.partInstanceIds], batchLabel: null, mentorReviewed: null,
    }));
  const manufacturingWork = manufacturingItems.map((item): WorkItem => {
    const task = taskByManufacturingId.get(item.id);
    return {
      id: `manufacturing:${item.id}`, sourceType: "manufacturing", sourceId: item.id,
      taskId: task?.id ?? null, title: item.title, workType: "Manufacturing",
      responsibleGroup: task?.responsibleGroup ?? item.responsibleGroup ?? "Mechanical",
      manufacturingProcess: item.process, subsystemId: item.subsystemId, dueDate: item.dueDate,
      status: item.status, isWaitingOnDependency: false, quantity: item.quantity, material: item.material, materialId: item.materialId ?? null,
      partDefinitionId: item.partDefinitionId ?? null, partInstanceIds: [...item.partInstanceIds],
      batchLabel: item.batchLabel ?? null, mentorReviewed: item.mentorReviewed,
    };
  });
  return [...taskItems, ...manufacturingWork];
}

function projectWorkDependencies(tasks: readonly ReadonlyData<Task>[], manufacturingItems: SnapshotView["manufacturingItems"], dependencies: readonly ReadonlyData<TaskDependency>[]) {
  const taskToManufacturingId = new Map(
    [...getPairedManufacturingTasks(tasks, manufacturingItems)].map(([itemId, task]) => [task.id, itemId]),
  );
  const projected = new Map<string, TaskDependency>();
  for (const dependency of dependencies) {
    const sourceType = dependency.sourceType === "task" && taskToManufacturingId.has(dependency.workItemId) ? "manufacturing" : dependency.sourceType;
    const workItemId = dependency.sourceType === "task" ? taskToManufacturingId.get(dependency.workItemId) ?? dependency.workItemId : dependency.workItemId;
    const refType = dependency.kind === "work_item" && dependency.refType === "task" && taskToManufacturingId.has(dependency.refId) ? "manufacturing" : dependency.refType;
    const refId = dependency.kind === "work_item" && dependency.refType === "task" ? taskToManufacturingId.get(dependency.refId) ?? dependency.refId : dependency.refId;
    const item: TaskDependency = { ...dependency, sourceType, workItemId, ...(dependency.kind === "work_item" ? { refType, refId } : {}) };
    const key = [item.workItemId, item.sourceType, item.kind, item.refType ?? "", item.refId, item.requiredState, item.dependencyType].join(":");
    if (!projected.has(key)) projected.set(key, item);
  }
  return [...projected.values()];
}

function readScopedId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// Bootstrap chooses an in-scope milestone project and intentionally omits photos.
function buildReports(args: {
  qaReports: ReadonlyData<QaReport[]>;
  tasksById: Map<string, ReadonlyData<Task>>;
  testResults: ReadonlyData<TestResult[]>;
  milestonesById: Map<string, ReadonlyData<Milestone>>;
  activeProjectIds: Set<string>;
}) {
  return [
    ...args.qaReports.map((report) => {
      const task = args.tasksById.get(report.taskId);
      return task && args.activeProjectIds.has(task.projectId)
        ? reportFromQaReport(task, report, { includePhoto: false })
        : null;
    }),
    ...args.testResults.map((result) => {
      const milestone = args.milestonesById.get(result.milestoneId);
      const projectId = milestone?.projectIds.find((id) => args.activeProjectIds.has(id)) ?? null;
      return projectId ? reportFromTestResult(milestone, result, projectId, { includePhoto: false }) : null;
    }),
  ].filter((report): report is ReadonlyData<Report> => report !== null);
}

function buildReportFindings(args: {
  qaFindings: ReadonlyData<QaFinding[]>;
  testFindings: ReadonlyData<TestFinding[]>;
  reportIds: Set<string>;
}) {
  return [
    ...args.qaFindings.map(reportFindingFromFinding),
    ...args.testFindings.map(reportFindingFromFinding),
  ].filter((finding): finding is ReadonlyData<ReportFinding> => finding !== null && args.reportIds.has(finding.reportId));
}

function parseDateMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSeasonScopedByProjectLinks(args: {
  selectedSeasonId: string | null;
  recordSeasonId?: string;
  projectIds: readonly string[];
  activeProjectIds: Set<string>;
}) {
  if (!args.selectedSeasonId) {
    return true;
  }

  if (args.recordSeasonId) {
    return args.recordSeasonId === args.selectedSeasonId;
  }

  return (
    args.projectIds.length > 0 &&
    args.projectIds.some((projectId) => args.activeProjectIds.has(projectId))
  );
}

export function buildBootstrapResponse(
  snapshot: SnapshotView,
  selection: BootstrapSelection,
  options: BootstrapResponseOptions = {},
) {
  const selectedSeasonId = selection.seasonId;
  const selectedSeason = selectedSeasonId
    ? snapshot.seasons.find((season) => season.id === selectedSeasonId) ?? null
    : null;
  const scopedSeasons = selectedSeasonId
    ? snapshot.seasons.filter((season) => season.id === selectedSeasonId)
    : snapshot.seasons;
  const seasonScopedProjects = selection.seasonId
    ? snapshot.projects.filter((project) => project.seasonId === selection.seasonId)
    : snapshot.projects;
  const selectedProjectIsValid =
    selection.projectId !== null &&
    seasonScopedProjects.some((project) => project.id === selection.projectId);
  const activeProjectIds = new Set(
    (selectedProjectIsValid
      ? seasonScopedProjects.filter((project) => project.id === selection.projectId)
      : seasonScopedProjects
    ).map((project) => project.id),
  );
  const scopedWorkstreams = snapshot.workstreams.filter((workstream) =>
    activeProjectIds.has(workstream.projectId),
  );
  const scopedWorkstreamIds = new Set(scopedWorkstreams.map((workstream) => workstream.id));
  const scopedSubsystems = snapshot.subsystems
    .filter((subsystem) => activeProjectIds.has(subsystem.projectId))
    .map(normalizePmCadProvenance);
  const scopedSubsystemIds = new Set(scopedSubsystems.map((subsystem) => subsystem.id));
  const scopedPartDefinitions = (selectedSeasonId
    ? snapshot.partDefinitions.filter((partDefinition) =>
        isActiveInSeason(partDefinition, selectedSeasonId),
      )
    : snapshot.partDefinitions).map(normalizePmCadProvenance);
  const scopedMechanisms = snapshot.mechanisms
    .filter((mechanism) => scopedSubsystemIds.has(mechanism.subsystemId))
    .map(normalizePmCadProvenance);
  const scopedMechanismIds = new Set(scopedMechanisms.map((mechanism) => mechanism.id));
  const scopedArtifacts = snapshot.artifacts.filter((artifact) =>
    activeProjectIds.has(artifact.projectId),
  );
  const scopedPartInstances = snapshot.partInstances
    .filter(
      (partInstance) =>
        scopedSubsystemIds.has(partInstance.subsystemId) &&
        (!partInstance.mechanismId || scopedMechanismIds.has(partInstance.mechanismId)),
    )
    .map(normalizePmCadProvenance);
  const scopedPartInstanceIds = new Set(
    scopedPartInstances.map((partInstance) => partInstance.id),
  );
  const scopedMilestones = snapshot.milestones.filter((milestone) => {
    const milestoneProjectIds = milestone.projectIds ?? [];
    if (
      !isSeasonScopedByProjectLinks({
        selectedSeasonId,
        recordSeasonId: milestone.seasonId,
        projectIds: milestoneProjectIds,
        activeProjectIds,
      })
    ) {
      return false;
    }

    return milestoneProjectIds.length === 0
      ? true
      : milestoneProjectIds.some((projectId) => activeProjectIds.has(projectId));
  });
  const scopedMeetings = snapshot.meetings.filter((meeting) => {
    const meetingProjectIds = meeting.projectIds ?? [];
    if (
      !isSeasonScopedByProjectLinks({
        selectedSeasonId,
        recordSeasonId: meeting.seasonId,
        projectIds: meetingProjectIds,
        activeProjectIds,
      })
    ) {
      return false;
    }

    return meetingProjectIds.length === 0
      ? true
      : meetingProjectIds.some((projectId) => activeProjectIds.has(projectId));
  });
  const scopedMilestoneIds = new Set(scopedMilestones.map((milestone) => milestone.id));
  const scopedMilestonesById = new Map(scopedMilestones.map((milestone) => [milestone.id, milestone] as const));
  const scopedMilestoneRequirements = (snapshot.milestoneRequirements ?? []).filter((requirement) => {
    if (!scopedMilestoneIds.has(requirement.milestoneId)) {
      return false;
    }

    switch (requirement.targetType) {
      case "project":
        return activeProjectIds.has(requirement.targetId);
      case "subsystem":
        return scopedSubsystemIds.has(requirement.targetId);
      case "mechanism":
        return scopedMechanismIds.has(requirement.targetId);
      case "artifact":
        return scopedArtifacts.some((artifact) => artifact.id === requirement.targetId);
      case "part-instance":
        return scopedPartInstanceIds.has(requirement.targetId);
      case "workflow":
        // Not currently modeled in the seed store; allow requirements through for forward compatibility.
        return true;
    }
  });
  const scopedTasks = snapshot.tasks.filter(
    (task) =>
      activeProjectIds.has(task.projectId) &&
      task.subsystemIds.some((subsystemId) => scopedSubsystemIds.has(subsystemId)),
  );
  const scopedTaskIds = new Set(scopedTasks.map((task) => task.id));
  const scopedTasksById = new Map(scopedTasks.map((task) => [task.id, task] as const));
  const scopedWorkLogs = snapshot.workLogs.filter(
    (workLog) =>
      scopedTaskIds.has(workLog.taskId) &&
      (selection.personId === null || workLog.participantIds.includes(selection.personId)),
  );
  const scopedPurchaseItems = snapshot.purchaseItems.filter(
    (item) =>
      scopedSubsystemIds.has(item.subsystemId) &&
      (selection.personId === null || item.requestedById === selection.personId),
  );
  const scopedManufacturingItems = snapshot.manufacturingItems.filter(
    (item) =>
      scopedSubsystemIds.has(item.subsystemId) &&
      (selection.personId === null || item.requestedById === selection.personId),
  );
  const scopedManufacturingItemIds = new Set(
    scopedManufacturingItems.map((item) => item.id),
  );
  const scopedQaReports = snapshot.qaReports.filter((report) => {
    const task = scopedTasksById.get(report.taskId);
    return Boolean(task);
  });
  const isProjectScoped = selection.projectId !== null;
  const scopedQaRequests = (snapshot.qaRequests ?? []).filter((request: ReadonlyData<QaRequest>) => {
    if (selectedSeasonId && !request.taskId) {
      return false;
    }

    const isTaskInScope = request.taskId
      ? scopedTaskIds.has(request.taskId)
      : !isProjectScoped;
    const isPersonInScope =
      selection.personId === null ||
      request.mentorId === selection.personId ||
      request.requestedById === selection.personId;
    return isTaskInScope && isPersonInScope;
  });
  const scopedTestResults = snapshot.testResults.filter((result) => {
    const milestone = scopedMilestonesById.get(result.milestoneId);
    return Boolean(milestone);
  });
  const scopedReports = buildReports({
    qaReports: scopedQaReports,
    tasksById: scopedTasksById,
    testResults: scopedTestResults,
    milestonesById: scopedMilestonesById,
    activeProjectIds,
  });
  const scopedReportIds = new Set(scopedReports.map((report) => report.id));
  const scopedReportFindings = buildReportFindings({
    qaFindings: snapshot.qaFindings,
    testFindings: snapshot.testFindings,
    reportIds: scopedReportIds,
  });
  const scopedRisks = snapshot.risks.filter((risk) => {
    if (risk.attachmentType === "project" && !activeProjectIds.has(risk.attachmentId)) {
      return false;
    }

    if (risk.attachmentType === "workstream" && !scopedWorkstreamIds.has(risk.attachmentId)) {
      return false;
    }

    if (risk.attachmentType === "mechanism" && !scopedMechanismIds.has(risk.attachmentId)) {
      return false;
    }

    if (risk.attachmentType === "part-instance" && !scopedPartInstanceIds.has(risk.attachmentId)) {
      return false;
    }

    if (risk.mitigationTaskId && !scopedTaskIds.has(risk.mitigationTaskId)) {
      return false;
    }

    if (risk.sourceType === "qa-report" && !scopedReportIds.has(risk.sourceId)) {
      return false;
    }

    if (risk.sourceType === "test-result" && !scopedReportIds.has(risk.sourceId)) {
      return false;
    }

    return true;
  });
  const scopedMembers = selectedSeasonId
    ? snapshot.members.filter((member) => isActiveInSeason(member, selectedSeasonId))
    : snapshot.members;
  const scopedMemberIds = new Set(scopedMembers.map((member) => member.id));
  const scopedAttendanceRecords = snapshot.attendanceRecords.filter((record) => {
    if (selection.personId !== null && record.memberId !== selection.personId) {
      return false;
    }

    if (selectedSeasonId && !scopedMemberIds.has(record.memberId)) {
      return false;
    }

    if (selectedSeason) {
      const attendanceDate = parseDateMs(record.date);
      const seasonStart = parseDateMs(selectedSeason.startDate);
      const seasonEnd = parseDateMs(selectedSeason.endDate);
      if (attendanceDate === null || seasonStart === null || seasonEnd === null) {
        return false;
      }

      return attendanceDate >= seasonStart && attendanceDate <= seasonEnd;
    }

    return true;
  });
  const scopedTaskDependencies = snapshot.taskDependencies.filter((dependency) =>
    dependency.sourceType === "task" ? scopedTaskIds.has(dependency.workItemId) : scopedManufacturingItemIds.has(dependency.workItemId),
  );
  const projectedTaskDependencies = projectWorkDependencies(scopedTasks, scopedManufacturingItems, scopedTaskDependencies);
  const scopedTaskBlockers = snapshot.taskBlockers.filter((blocker) =>
    scopedTaskIds.has(blocker.blockedTaskId),
  );
  const scopedSnapshot = {
    ...snapshot,
    tasks: scopedTasks,
    manufacturingItems: scopedManufacturingItems,
    taskDependencies: projectedTaskDependencies,
    taskBlockers: scopedTaskBlockers,
  } as SnapshotView;
  const scopedQaReviews = snapshot.qaReviews.filter((review) => {
    if (review.subjectType === "task") {
      return scopedTaskIds.has(review.subjectId);
    }

    return scopedManufacturingItemIds.has(review.subjectId);
  });
  const manufacturingQaReviewCounts = new Map<string, number>();
  for (const review of snapshot.qaReviews) {
    if (review.subjectType !== "manufacturing") {
      continue;
    }

    manufacturingQaReviewCounts.set(
      review.subjectId,
      (manufacturingQaReviewCounts.get(review.subjectId) ?? 0) + 1,
    );
  }
  const tasks = scopedTasks.map((task) => ({
    ...task,
    isBlocked: scopedTaskBlockers.some((blocker) => blocker.blockedTaskId === task.id && blocker.status === "open"),
    isWaitingOnDependency: isTaskWaitingOnDependencies(task, scopedSnapshot),
  }));
  const manufacturingItems = scopedManufacturingItems.map((item) => ({
    ...item,
    qaReviewCount: manufacturingQaReviewCounts.get(item.id) ?? 0,
  }));
  const scopedActions = (snapshot.actions ?? [])
    .filter((action) => {
      const actionProjectIds =
        action.projectIds && action.projectIds.length > 0
          ? action.projectIds
          : action.projectId
            ? [action.projectId]
            : [];
      if (
        actionProjectIds.length > 0 &&
        !actionProjectIds.some((projectId) => activeProjectIds.has(projectId))
      ) {
        return false;
      }

      const requiresExistingScopeEntities = action.operation !== "delete";

      if (requiresExistingScopeEntities && action.taskId && !scopedTaskIds.has(action.taskId)) {
        return false;
      }

      if (
        requiresExistingScopeEntities &&
        action.subsystemId &&
        !scopedSubsystemIds.has(action.subsystemId)
      ) {
        return false;
      }

      if (
        selection.personId &&
        action.actorMemberId !== selection.personId &&
        !action.memberIds.includes(selection.personId)
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  const scopedMaterialIds = new Set(
    [
      ...scopedPartDefinitions.map((partDefinition) => partDefinition.materialId),
      ...scopedManufacturingItems.map((item) => item.materialId),
    ].filter((materialId): materialId is string => Boolean(materialId)),
  );
  const scopedMaterials = selectedSeasonId
    ? snapshot.materials.filter((material) => scopedMaterialIds.has(material.id))
    : snapshot.materials;
  const scopedDisciplineIds = new Set(
    [
      ...scopedTasks.map((task) => task.disciplineId),
      ...scopedMembers.map((member) => member.disciplineId ?? null),
    ].filter((disciplineId): disciplineId is string => Boolean(disciplineId)),
  );
  const scopedDisciplines = selectedSeasonId
    ? snapshot.disciplines.filter((discipline) => scopedDisciplineIds.has(discipline.id))
    : snapshot.disciplines;

  return {
    seasons: scopedSeasons,
    projects: seasonScopedProjects,
    workstreams: scopedWorkstreams,
    members: scopedMembers,
    subsystems: scopedSubsystems,
    disciplines: scopedDisciplines,
    mechanisms: scopedMechanisms,
    materials: scopedMaterials,
    artifacts: scopedArtifacts,
    partDefinitions: scopedPartDefinitions,
    partInstances: scopedPartInstances,
    milestones: scopedMilestones,
    milestoneRequirements: scopedMilestoneRequirements as MilestoneRequirement[],
    reports: scopedReports,
    reportFindings: scopedReportFindings,
    qaReports: scopedQaReports,
    qaRequests: scopedQaRequests,
    testResults: scopedTestResults,
    risks: scopedRisks,
    tasks,
    workItems: toWorkItems(tasks, manufacturingItems).map((item) => ({
      ...item,
      isWaitingOnDependency: isWorkItemWaitingOnDependencies(item.sourceId, item.sourceType, scopedSnapshot),
    })),
    taskDependencies: projectedTaskDependencies,
    taskBlockers: scopedTaskBlockers,
    workLogs: scopedWorkLogs,
    meetings: scopedMeetings,
    attendanceRecords: scopedAttendanceRecords,
    manufacturingItems,
    purchaseItems: scopedPurchaseItems,
    qaReviews: scopedQaReviews,
    escalations: options.sanitizeEscalations ? [] : snapshot.escalations,
    actions: scopedActions as ReadonlyData<AuditAction[]>,
  };
}

export function readBootstrapSelection(query: unknown): BootstrapSelection {
  const candidate = query as {
    personId?: unknown;
    seasonId?: unknown;
    projectId?: unknown;
  } | null;

  return {
    personId: readScopedId(candidate?.personId),
    seasonId: readScopedId(candidate?.seasonId),
    projectId: readScopedId(candidate?.projectId),
  };
}
