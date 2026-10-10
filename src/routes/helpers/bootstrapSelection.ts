import { reportFromQaReport } from "../../data/store/reportDerivations";
import type {
  ReadonlyData,
  AuditAction,
  Milestone,
  MilestoneRequirement,
  SnapshotView,
  Report,
  QaFinding,
  QaReport,
  QaRequest,
  TestFinding,
  TestResult,
  Task,
} from "../../domain/types";
import { normalizePmCadProvenance } from "../../domain/pmCadProvenance";
import { isTaskWaitingOnDependencies } from "../../domain/taskDependencyState";
import { isActiveInSeason } from "../../domain/seasonMembership";
import { partInstanceSubsystemId, partInstanceMechanismId } from "../../domain/partInstanceLocation";
import { deriveMilestoneReadiness, derivePartInstanceReadiness } from "../../domain/readiness";

export interface BootstrapSelection {
  personId: string | null;
  seasonId: string | null;
  projectId: string | null;
}

function readScopedId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// Bootstrap chooses an in-scope milestone project and intentionally omits photos.
function buildReports(args: {
  qaReports: ReadonlyData<QaReport[]>;
  teamReports: ReadonlyData<Report[]>;
  activeProjectIds: Set<string>;
}) {
  return [
    ...args.qaReports.map((report) => {
      return args.activeProjectIds.has(report.projectId)
        ? reportFromQaReport(undefined, report, { includePhoto: false })
        : null;
    }),
    ...args.teamReports.filter((report) => args.activeProjectIds.has(report.projectId)).map((report) => {
      const { photoUrl: _photoUrl, ...withoutPhoto } = report;
      return withoutPhoto;
    }),
  ].filter((report): report is ReadonlyData<Report> => report !== null);
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
  const activeProjectTypes = new Set(seasonScopedProjects.filter((project) => activeProjectIds.has(project.id)).map((project) => project.projectType));
  const scopedWorkTypes = snapshot.workTypes.filter((workType) => activeProjectTypes.has(workType.projectType));
  const scopedWorkTypeIds = new Set(scopedWorkTypes.map((workType) => workType.id));
  const scopedResponsibleGroups = snapshot.responsibleGroups
    .filter((group) =>
      (!selectedSeasonId || group.seasonId === selectedSeasonId) &&
      (group.projectIds.length === 0 || group.projectIds.some((projectId) => activeProjectIds.has(projectId))),
    )
    .map((group) => ({ ...group, workTypeIds: group.workTypeIds.filter((workTypeId) => scopedWorkTypeIds.has(workTypeId)) }));
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
        scopedSubsystemIds.has(partInstanceSubsystemId(partInstance) ?? "") &&
        (!partInstanceMechanismId(partInstance) || scopedMechanismIds.has(partInstanceMechanismId(partInstance)!)),
    )
    .map((partInstance) => ({
      ...normalizePmCadProvenance(partInstance),
      readinessStatus: derivePartInstanceReadiness(partInstance, snapshot),
    }));
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
  }).map((milestone) => ({
    ...milestone,
    readinessStatus: deriveMilestoneReadiness(milestone, snapshot),
  }));
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
  const scopedEvents = snapshot.events.filter((event) =>
    (!selectedSeasonId || event.seasonId === selectedSeasonId) &&
    (event.projectIds.length === 0 || event.projectIds.some((projectId) => activeProjectIds.has(projectId))),
  );
  const scopedMilestoneIds = new Set(scopedMilestones.map((milestone) => milestone.id));
  const scopedMilestonesById = new Map(scopedMilestones.map((milestone) => [milestone.id, milestone] as const));
  const scopedMilestoneRequirements = (snapshot.milestoneRequirements ?? []).filter((requirement) => {
    if (!scopedMilestoneIds.has(requirement.milestoneId)) {
      return false;
    }

    return requirement.targetRefs.length > 0 && requirement.targetRefs.every((ref) => {
      switch (ref.kind) {
        case "project": return activeProjectIds.has(ref.id);
        case "subsystem": return scopedSubsystemIds.has(ref.id);
        case "mechanism": return scopedMechanismIds.has(ref.id);
        case "artifact": return scopedArtifacts.some((artifact) => artifact.id === ref.id);
        case "part-instance": return scopedPartInstanceIds.has(ref.id);
        default: return true;
      }
    });
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
      scopedTasksById.has(item.taskId) &&
      (selection.personId === null || [scopedTasksById.get(item.taskId)?.requestedById, scopedTasksById.get(item.taskId)?.ownerId, ...(scopedTasksById.get(item.taskId)?.assigneeIds ?? [])].includes(selection.personId)),
  );
  const scopedQaReports = snapshot.qaReports.filter((report) => {
    return activeProjectIds.has(report.projectId);
  });
  const isProjectScoped = selection.projectId !== null;
  const scopedQaRequests = (snapshot.qaRequests ?? []).filter((request: ReadonlyData<QaRequest>) => {
    const isTaskInScope = request.targetRefs.some((ref) => ref.kind === "task" && scopedTaskIds.has(ref.id)) || !isProjectScoped;
    const isPersonInScope =
      selection.personId === null ||
      request.mentorId === selection.personId ||
      request.requestedById === selection.personId;
    return isTaskInScope && isPersonInScope;
  });
  const scopedTeamReports = snapshot.teamReports.filter((report) => activeProjectIds.has(report.projectId));
  const scopedTestResults = snapshot.testResults.filter((result) => activeProjectIds.has(result.projectId));
  const scopedReports = buildReports({
    qaReports: scopedQaReports,
    teamReports: scopedTeamReports,
    activeProjectIds,
  });
  const scopedRisks = snapshot.risks.filter((risk) => {
    if (!activeProjectIds.has(risk.projectId)) return false;
    if (risk.mitigationTaskId && !scopedTaskIds.has(risk.mitigationTaskId)) {
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
    scopedTaskIds.has(dependency.taskId),
  );
  const scopedSnapshot = {
    ...snapshot,
    tasks: scopedTasks,
    taskDependencies: scopedTaskDependencies,
  } as SnapshotView;
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
      ...scopedTasks.flatMap((task) => task.manufacturingDetails?.material.kind === "inventory-material" ? [task.manufacturingDetails.material.materialId] : []),
    ].filter((materialId): materialId is string => Boolean(materialId)),
  );
  const scopedMaterials = selectedSeasonId
    ? snapshot.materials.filter((material) => scopedMaterialIds.has(material.id))
    : snapshot.materials;
  return {
    seasons: scopedSeasons,
    projects: seasonScopedProjects,
    workTypes: scopedWorkTypes,
    responsibleGroups: scopedResponsibleGroups,
    workstreams: scopedWorkstreams,
    vendors: snapshot.vendors,
    members: scopedMembers,
    subsystems: scopedSubsystems,
    mechanisms: scopedMechanisms,
    materials: scopedMaterials,
    artifacts: scopedArtifacts,
    partDefinitions: scopedPartDefinitions,
    partInstances: scopedPartInstances,
    milestones: scopedMilestones,
    milestoneRequirements: scopedMilestoneRequirements as MilestoneRequirement[],
    reports: scopedReports,
    qaRequests: scopedQaRequests,
    qaFindings: snapshot.qaFindings.filter((finding) => activeProjectIds.has(finding.projectId)),
    testResults: scopedTestResults,
    testFindings: snapshot.testFindings.filter((finding) => activeProjectIds.has(finding.projectId)),
    risks: scopedRisks,
    tasks: scopedTasks.map((task) => ({
        id: task.id,
        ...(task.createdAt ? { createdAt: task.createdAt } : {}),
        ...(task.serialNumber !== undefined ? { serialNumber: task.serialNumber } : {}),
        ...(task.serial !== undefined ? { serial: task.serial } : {}),
        projectId: task.projectId,
        workTypeId: task.workTypeId,
        responsibleGroupId: task.responsibleGroupId,
        workstreamIds: task.workstreamIds,
        title: task.title,
        summary: task.summary,
        ...(task.photoUrl !== undefined ? { photoUrl: task.photoUrl } : {}),
        subsystemIds: task.subsystemIds,
        mechanismIds: task.mechanismIds,
        partInstanceIds: task.partInstanceIds,
        scheduleRefs: task.scheduleRefs,
        requestedById: task.requestedById,
        ownerId: task.ownerId,
        assigneeIds: task.assigneeIds,
        mentorId: task.mentorId,
        startDate: task.startDate,
        dueDate: task.dueDate,
        priority: task.priority,
        status: task.status,
        checklistItems: task.checklistItems,
        estimatedHours: task.estimatedHours,
        actualHours: task.actualHours,
        requiresDocumentation: task.requiresDocumentation,
        manufacturingDetails: task.manufacturingDetails,
        isBlocked: task.isBlocked ?? false,
        isWaitingOnDependency: isTaskWaitingOnDependencies(task, scopedSnapshot),
      })),
    taskDependencies: scopedTaskDependencies,
    workLogs: scopedWorkLogs,
    meetings: scopedMeetings,
    events: scopedEvents,
    attendanceRecords: scopedAttendanceRecords,
    manufacturingProcesses: snapshot.manufacturingProcesses,
    purchaseItems: scopedPurchaseItems,
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
