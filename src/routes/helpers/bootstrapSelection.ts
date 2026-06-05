import type {
  AuditAction,
  Milestone,
  MilestoneRequirement,
  Member,
  PlatformSnapshot,
  PmCadImportSource,
  PmCadProvenance,
  PmCadSource,
  QaFinding,
  QaReport,
  QaRequest,
  TestFinding,
  TestResult,
  Task,
  TaskDependency,
} from "../../domain/types";
import { isTaskWaitingOnDependencies } from "../../domain/taskDependencyState";
import { uniqueIds } from "./taskTargets";

export interface BootstrapSelection {
  personId: string | null;
  seasonId: string | null;
  projectId: string | null;
}

export interface BootstrapResponseOptions {
  sanitizeEscalations?: boolean;
}

export interface BootstrapReportRecord {
  id: string;
  reportType: "QA" | "MilestoneTest";
  projectId: string;
  taskId: string | null;
  milestoneId: string | null;
  workstreamId: string | null;
  createdByMemberId: string | null;
  result: string;
  summary: string;
  notes: string;
  createdAt: string;
  participantIds?: string[];
  mentorApproved?: boolean;
  reviewedAt?: string;
  title?: string;
  status?: "pass" | "fail" | "blocked";
  findings?: string[];
}

export interface BootstrapReportFindingRecord {
  id: string;
  reportId: string;
  mechanismId: string | null;
  partInstanceId: string | null;
  artifactInstanceId: string | null;
  issueType: string;
  severity: "high" | "medium" | "low";
  notes: string;
  spawnedTaskId: string | null;
  spawnedIterationId: string | null;
  spawnedRiskId: string | null;
  title?: string;
  detail?: string;
  status?: "open" | "resolved";
  projectId?: string;
  workstreamId?: string | null;
  subsystemId?: string | null;
  taskId?: string | null;
  milestoneId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BootstrapTaskDependencyRecord {
  id: string;
  taskId: string;
  kind: TaskDependency["kind"];
  refId: string;
  requiredState?: string;
  dependencyType: TaskDependency["dependencyType"];
  createdAt: string;
}

export interface BootstrapTaskBlockerRecord {
  id: string;
  blockedTaskId: string;
  blockerType: "external" | "internal";
  blockerId: string | null;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "resolved";
  createdByMemberId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

function readScopedId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isMemberActiveInSeason(member: Pick<Member, "seasonId" | "activeSeasonIds">, seasonId: string) {
  return uniqueIds([...(member.activeSeasonIds ?? []), member.seasonId]).includes(seasonId);
}

function isPartDefinitionActiveInSeason(
  partDefinition: Pick<PlatformSnapshot["partDefinitions"][number], "seasonId" | "activeSeasonIds">,
  seasonId: string,
) {
  return uniqueIds([...(partDefinition.activeSeasonIds ?? []), partDefinition.seasonId]).includes(
    seasonId,
  );
}

function buildTaskDependencyRecords(tasks: Task[]) {
  return tasks.flatMap<BootstrapTaskDependencyRecord>((task) =>
    uniqueIds(task.dependencyIds).map((refId, dependencyIndex) => ({
      id: `${task.id}:dependency:${dependencyIndex + 1}`,
      taskId: task.id,
      kind: "task",
      refId,
      requiredState: "complete",
      dependencyType: "hard",
      createdAt: task.startDate,
    })),
  );
}

function normalizeTaskDependencyRecord(
  dependency: Partial<TaskDependency> & {
    upstreamTaskId?: string;
    downstreamTaskId?: string;
    dependencyType?: TaskDependency["dependencyType"] | "blocks" | "finish_to_start";
  },
): BootstrapTaskDependencyRecord {
  const kind = dependency.kind ?? "task";

  return {
    id: dependency.id ?? "",
    taskId: dependency.taskId ?? dependency.downstreamTaskId ?? "",
    kind,
    refId: dependency.refId ?? dependency.upstreamTaskId ?? "",
    requiredState: dependency.requiredState ?? (kind === "part_instance" ? "ready" : "complete"),
    dependencyType: dependency.dependencyType === "soft" ? "soft" : "hard",
    createdAt: dependency.createdAt ?? new Date().toISOString(),
  };
}

function buildTaskBlockerRecords(tasks: Task[]) {
  return tasks.flatMap<BootstrapTaskBlockerRecord>((task) =>
    task.blockers.map((description, blockerIndex) => ({
      id: `${task.id}:blocker:${blockerIndex + 1}`,
      blockedTaskId: task.id,
      blockerType: "external",
      blockerId: null,
      description,
      severity: "medium",
      status: "open",
      createdByMemberId: null,
      createdAt: task.startDate,
      resolvedAt: null,
    })),
  );
}

function buildReports(args: {
  qaReports: QaReport[];
  tasksById: Map<string, Task>;
  testResults: TestResult[];
  milestonesById: Map<string, Milestone>;
  activeProjectIds: Set<string>;
}) {
  const qaReports = args.qaReports
    .map<BootstrapReportRecord | null>((report) => {
      const task = args.tasksById.get(report.taskId);
      if (!task || !args.activeProjectIds.has(task.projectId)) {
        return null;
      }

      return {
        id: report.id,
        reportType: "QA",
        projectId: task.projectId,
        taskId: report.taskId,
        milestoneId: null,
        workstreamId: task.workstreamId,
        createdByMemberId: null,
        result: report.result,
        summary: report.notes,
        notes: report.notes,
        createdAt: report.reviewedAt,
        participantIds: report.participantIds,
        mentorApproved: report.mentorApproved,
        reviewedAt: report.reviewedAt,
        title: task.title,
      };
    })
    .filter((report): report is BootstrapReportRecord => report !== null);

  const milestoneTestReports = args.testResults
    .map<BootstrapReportRecord | null>((result) => {
      const milestone = args.milestonesById.get(result.milestoneId);
      const projectId =
        milestone?.projectIds.find((candidate) => args.activeProjectIds.has(candidate)) ??
        milestone?.projectIds[0] ??
        null;
      if (!projectId || !args.activeProjectIds.has(projectId)) {
        return null;
      }

      return {
        id: result.id,
        reportType: "MilestoneTest",
        projectId,
        taskId: null,
        milestoneId: result.milestoneId,
        workstreamId: null,
        createdByMemberId: null,
        result: result.status,
        summary: result.title,
        notes: result.findings.join("\n"),
        createdAt: milestone?.startDateTime.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        title: result.title,
        status: result.status,
        findings: result.findings,
      };
    })
    .filter((report): report is BootstrapReportRecord => report !== null);

  return [...qaReports, ...milestoneTestReports];
}

function buildReportFindings(args: {
  qaFindings: QaFinding[];
  testFindings: TestFinding[];
  reportIds: Set<string>;
}) {
  const qaFindings = args.qaFindings
    .map<BootstrapReportFindingRecord | null>((finding) => {
      if (!finding.qaReportId || !args.reportIds.has(finding.qaReportId)) {
        return null;
      }

      return {
        id: finding.id,
        reportId: finding.qaReportId,
        mechanismId: finding.mechanismId,
        partInstanceId: finding.partInstanceId,
        artifactInstanceId: finding.artifactId,
        issueType: finding.title,
        severity: finding.severity,
        notes: finding.detail,
        spawnedTaskId: finding.taskId,
        spawnedIterationId: null,
        spawnedRiskId: null,
        title: finding.title,
        detail: finding.detail,
        status: finding.status === "resolved" ? "resolved" : "open",
        projectId: finding.projectId,
        workstreamId: finding.workstreamId,
        subsystemId: finding.subsystemId,
        taskId: finding.taskId,
        createdAt: finding.createdAt,
        updatedAt: finding.updatedAt,
      };
    })
    .filter((finding): finding is BootstrapReportFindingRecord => finding !== null);

  const testFindings = args.testFindings
    .map<BootstrapReportFindingRecord | null>((finding) => {
      if (!finding.testResultId || !args.reportIds.has(finding.testResultId)) {
        return null;
      }

      return {
        id: finding.id,
        reportId: finding.testResultId,
        mechanismId: finding.mechanismId,
        partInstanceId: finding.partInstanceId,
        artifactInstanceId: finding.artifactId,
        issueType: finding.title,
        severity: finding.severity,
        notes: finding.detail,
        spawnedTaskId: finding.taskId,
        spawnedIterationId: null,
        spawnedRiskId: null,
        title: finding.title,
        detail: finding.detail,
        status: finding.status === "resolved" ? "resolved" : "open",
        projectId: finding.projectId,
        workstreamId: finding.workstreamId,
        subsystemId: finding.subsystemId,
        taskId: finding.taskId,
        milestoneId: finding.milestoneId,
        createdAt: finding.createdAt,
        updatedAt: finding.updatedAt,
      };
    })
    .filter((finding): finding is BootstrapReportFindingRecord => finding !== null);

  return [...qaFindings, ...testFindings];
}

function parseDateMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cadImportSourceFromText(value: string | null | undefined): PmCadImportSource {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") ?? "";
  if (normalized === "STEP" || normalized === "STEP_UPLOAD" || normalized === "STP") {
    return "STEP_UPLOAD";
  }
  if (
    normalized === "ONSHAPE" ||
    normalized === "ONSHAPE_API" ||
    normalized === "ONSHAPE_BOM" ||
    normalized === "ONSHAPE_BOM_CSV"
  ) {
    return normalized === "ONSHAPE_BOM_CSV" ? "ONSHAPE_BOM_CSV" : "ONSHAPE_API";
  }
  if (normalized === "MANUAL_BOM_CSV") {
    return "MANUAL_BOM_CSV";
  }
  return "MANUAL";
}

function normalizeCadImportSource(
  value: string | null | undefined,
  fallbackValue: string | null | undefined,
): PmCadImportSource {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") ?? "";
  if (
    normalized === "MANUAL" ||
    normalized === "STEP_UPLOAD" ||
    normalized === "ONSHAPE_API" ||
    normalized === "ONSHAPE_BOM_CSV" ||
    normalized === "MANUAL_BOM_CSV"
  ) {
    return normalized;
  }
  return cadImportSourceFromText(fallbackValue ?? value);
}

function cadSourceFromImportSource(cadImportSource: PmCadImportSource): PmCadSource {
  if (cadImportSource === "STEP_UPLOAD") {
    return "step";
  }
  if (cadImportSource === "ONSHAPE_API" || cadImportSource === "ONSHAPE_BOM_CSV") {
    return "onshape";
  }
  return "manual";
}

function cadSourceLabelFromImportSource(cadImportSource: PmCadImportSource) {
  if (cadImportSource === "STEP_UPLOAD") {
    return "STEP";
  }
  if (cadImportSource === "ONSHAPE_API" || cadImportSource === "ONSHAPE_BOM_CSV") {
    return "Onshape";
  }
  return "Manual";
}

function withCadProvenance<T extends Partial<PmCadProvenance> & { source?: string }>(
  item: T,
) {
  const cadImportSource = normalizeCadImportSource(
    item.cadImportSource,
    item.source ?? item.cadSource,
  );
  return {
    ...item,
    cadSource: item.cadSource ?? cadSourceFromImportSource(cadImportSource),
    cadImportSource,
    cadEditedAfterImport: item.cadEditedAfterImport ?? false,
    cadSourceLabel: item.cadSourceLabel ?? cadSourceLabelFromImportSource(cadImportSource),
    cadUpdatedAt: item.cadUpdatedAt ?? null,
  };
}

function isSeasonScopedByProjectLinks(args: {
  selectedSeasonId: string | null;
  recordSeasonId?: string;
  projectIds: string[];
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
  snapshot: PlatformSnapshot,
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
    .map(withCadProvenance);
  const scopedSubsystemIds = new Set(scopedSubsystems.map((subsystem) => subsystem.id));
  const scopedPartDefinitions = (selectedSeasonId
    ? snapshot.partDefinitions.filter((partDefinition) =>
        isPartDefinitionActiveInSeason(partDefinition, selectedSeasonId),
      )
    : snapshot.partDefinitions).map(withCadProvenance);
  const scopedMechanisms = snapshot.mechanisms
    .filter((mechanism) => scopedSubsystemIds.has(mechanism.subsystemId))
    .map(withCadProvenance);
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
    .map(withCadProvenance);
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
      (scopedSubsystemIds.has(task.subsystemId) ||
        task.subsystemIds.some((subsystemId) => scopedSubsystemIds.has(subsystemId))),
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
  const scopedQaRequests = (snapshot.qaRequests ?? []).filter((request: QaRequest) => {
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
    ? snapshot.members.filter((member) => isMemberActiveInSeason(member, selectedSeasonId))
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
  const scopedExplicitTaskDependencies = snapshot.taskDependencies
    .map((dependency) => normalizeTaskDependencyRecord(dependency as Partial<TaskDependency>))
    .filter((dependency) => {
      if (!scopedTaskIds.has(dependency.taskId)) {
        return false;
      }

      if (dependency.kind === "task") {
        return scopedTaskIds.has(dependency.refId);
      }

      if (dependency.kind === "milestone") {
        return scopedMilestoneIds.has(dependency.refId);
      }

      if (dependency.kind === "part_instance") {
        return scopedPartInstanceIds.has(dependency.refId);
      }

      return false;
    });
  const explicitTaskDependencyKeys = new Set(
    scopedExplicitTaskDependencies.map(
      (dependency) => `${dependency.taskId}:${dependency.kind}:${dependency.refId}:${dependency.dependencyType}:${dependency.requiredState ?? ""}`,
    ),
  );
  const scopedTaskDependencies = [
    ...scopedExplicitTaskDependencies,
    ...buildTaskDependencyRecords(snapshot.tasks).filter(
      (dependency) =>
        scopedTaskIds.has(dependency.taskId) &&
        scopedTaskIds.has(dependency.refId) &&
        !explicitTaskDependencyKeys.has(
          `${dependency.taskId}:${dependency.kind}:${dependency.refId}:${dependency.dependencyType}:${dependency.requiredState ?? ""}`,
        ),
    ),
  ];
  const scopedExplicitTaskBlockers = snapshot.taskBlockers.filter((blocker) =>
    scopedTaskIds.has(blocker.blockedTaskId),
  );
  const explicitTaskBlockerKeys = new Set(
    scopedExplicitTaskBlockers.map(
      (blocker) => `${blocker.blockedTaskId}:${blocker.description}`,
    ),
  );
  const scopedTaskBlockers = [
    ...scopedExplicitTaskBlockers,
    ...buildTaskBlockerRecords(scopedTasks).filter(
      (blocker) =>
        !explicitTaskBlockerKeys.has(`${blocker.blockedTaskId}:${blocker.description}`),
    ),
  ];
  const scopedSnapshot = {
    ...snapshot,
    tasks: scopedTasks,
    taskDependencies: scopedTaskDependencies,
    taskBlockers: scopedTaskBlockers,
  } as PlatformSnapshot;
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
    tasks: scopedTasks.map((task) => ({
      ...task,
      isBlocked: scopedTaskBlockers.some(
        (blocker) => blocker.blockedTaskId === task.id && blocker.status === "open",
      ),
      isWaitingOnDependency: isTaskWaitingOnDependencies(task, scopedSnapshot),
    })),
    taskDependencies: scopedTaskDependencies,
    taskBlockers: scopedTaskBlockers,
    workLogs: scopedWorkLogs,
    meetings: scopedMeetings,
    attendanceRecords: scopedAttendanceRecords,
    manufacturingItems: scopedManufacturingItems.map((item) => ({
      ...item,
      qaReviewCount: manufacturingQaReviewCounts.get(item.id) ?? 0,
    })),
    purchaseItems: scopedPurchaseItems,
    qaReviews: scopedQaReviews,
    escalations: options.sanitizeEscalations ? [] : snapshot.escalations,
    actions: scopedActions as AuditAction[],
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
