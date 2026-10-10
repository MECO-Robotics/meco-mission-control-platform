import { preparePartAcquisition } from "./helpers/partAcquisition";
import { parseRouteInput } from "./helpers/parseRouteInput";
import { FastifyInstance, type FastifyRequest } from "fastify";
import { requestLimitConfig } from "../config/env";
import { createRequestLimitGuard } from "../security/requestLimits";
import {
  getSessionFromRequest,
  isAuthEnabled,
  requireSession,
} from "../auth/authService";
import {
  createArtifact,
  createManufacturingProcess,
  archiveManufacturingProcess,
  createMilestone,
  createMaterial,
  createMember,
  createResponsibleGroup,
  createMechanism,
  createReport,
  createReportFinding,
  createQaReport,
  submitQaReport,
  createQaRequest,
  createPartDefinitionWithAcquisition,
  createPartInstance,
  createProject,
  createSeason,
  createSubsystem,
  createPurchaseItem,
  createRisk,
  createTask,
  createTaskDependency,
  createTestResult,
  createWorkLog,
  createWorkstream,
  findMilestone,
  findArtifact,
  findMaterial,
  findProject,
  getDesignIterations,
  getMilestones,
  getFindings,
  findMechanism,
  findPartDefinition,
  findPartInstance,
  findRisk,
  findSubsystem,
  findWorkstream,
  getMembers,
  getResponsibleGroups,
  getArtifacts,
  getMaterials,
  getPartDefinitions,
  getPartInstances,
  getProjects,
  getPurchaseItems,
  getQaReports,
  getQaRequests,
  getReports,
  getRisks,
  getSnapshot,
  getSeasons,
  getTaskTargets,
  getMilestonesForTask,
  getTasks,
  getTaskDependencies,
  getTasksForMilestone,
  getTestResults,
  getTutorialBaselineState,
  type TutorialBaselineState,
  getWorkstreams,
  removeMilestone,
  removeArtifact,
  removeMaterial,
  removeMember,
  removeMechanism,
  removePartDefinition,
  removePartInstance,
  removePurchaseItem,
  removeResponsibleGroup,
  removeRisk,
  removeSubsystem,
  removeTask,
  removeTaskDependency,
  removeWorkLog,
  resetInteractiveTutorialSession,
  resetTutorialBaseline,
  updateArtifact,
  updateMaterial,
  updateMember,
  updateResponsibleGroup,
  updateMechanism,
  updateMilestone,
  updatePartDefinition,
  updatePartInstance,
  updateProject,
  updateSubsystem,
  updatePurchaseItem,
  updateRisk,
  startInteractiveTutorialSession,
  updateTask,
  updateTaskDependency,
  updateWorkLog,
  updateWorkstream,
} from "../data/store";
import {
  buildDashboard,
  buildMetrics,
  evaluateTaskCompletion,
  formatTaskStatus,
} from "../domain/workflows";
import { isTaskWaitingOnDependencies } from "../domain/taskDependencyState";
import {
  filterPurchaseItemsForPerson,
  filterTasksForPerson,
  paginateItems,
  readPersonFilter,
} from "./helpers/paginationFilters";

import {
  getDefaultProjectId,
  normalizeTaskTargets,
  resolveProjectId,
} from "./helpers/taskTargets";
import { uniqueIds } from "../domain/ids";

import {
  validateArtifactLinks,
  validateMilestoneProjectLinks,
  validatePartDefinitionMaterialId,
  validatePartInstanceLinks,
  validatePurchaseItemLinks,
  validateQaReportLinks,
  validateQaRequestLinks,
  validateRiskLinks,
  validateSubsystemPeople,
  validateTaskPeople,
  validateTestResultLinks,
  validateWorkLogLinks,
  wouldCreateSubsystemCycle,
} from "./helpers/linkValidation";
import {
  buildBootstrapResponse,
  readBootstrapSelection,
} from "./helpers/bootstrapSelection";
import {
  bootstrapPayloadSchema,
} from "../contracts/bootstrap";
import { buildRosterInsights } from "./helpers/rosterInsights";
import { parseDateValue } from "./helpers/rosterInsightsMemberMetrics";
import { filterAuditActions, formatAuditActionsCsv } from "./helpers/auditExport";
import {
  auditExportQuerySchema,
  artifactPatchSchema,
  artifactSchema,
  milestonePatchSchema,
  milestoneSchema,
  materialPatchSchema,
  materialSchema,
  mediaUploadRequestSchema,
  memberPatchSchema,
  memberSchema,
  responsibleGroupPatchSchema,
  responsibleGroupSchema,
  profilePatchSchema,
  mechanismPatchSchema,
  mechanismSchema,
  partDefinitionPatchSchema,
  partDefinitionSchema,
  partInstancePatchSchema,
  partInstanceSchema,
  projectPatchSchema,
  projectSchema,
  qaReportSchema,
  qaSubmitSchema,
  qaRequestSchema,
  reportFindingSchema,
  reportSchema,
  riskPatchSchema,
  riskSchema,
  purchaseItemPatchSchema,
  purchaseItemSchema,
  manufacturingProcessCreateSchema,
  manufacturingProcessArchiveSchema,
  purchaseApprovalSchema,
  purchaseTransitionSchema,
  seasonSchema,
  subsystemPatchSchema,
  subsystemSchema,
  taskClaimSchema,
  taskPatchSchema,
  taskReassignSchema,
  taskSchema,
  taskDependencyPatchSchema,
  taskDependencySchema,
  testResultSchema,
  tutorialSessionResetSchema,
  workLogPatchSchema,
  workLogSchema,
  workstreamPatchSchema,
  workstreamSchema,
} from "./routeSchemas";
import {
  assessGenericPatch,
  isWorkflowApproverRole,
  isNoopPatch,
  validatePurchaseApproval,
  validatePurchaseTransition,
} from "./workflowAuthorization";
import {
  MediaUploadError,
  presignImageUpload,
  presignVideoUpload,
} from "../storage/mediaUploadService";
import { buildSlackHomeResponse } from "../slack/homeService";
import { registerCadRoutes } from "../cad/cadRoutes";
import { registerOnshapeRoutes } from "../onshape/onshapeRoutes";
import { registerAuthRoutes } from "./authRoutes";
import { registerMobileAuthRoutes } from "./mobileAuthRoutes";
import type { MobileSessionService } from "../auth/mobileSessionService";
import type { WebSessionService } from "../auth/webSessionService";
import { registerWebAuthRoutes } from "./webAuthRoutes";
import { registerMeetingRoutes } from "./meetingRoutes";

const allowApiRouteRequest = createRequestLimitGuard({
  scope: "api",
  ...requestLimitConfig.api,
});
const allowAuthRouteRequest = createRequestLimitGuard({
  scope: "auth",
  ...requestLimitConfig.auth,
});
const allowAuthEmailRouteRequest = createRequestLimitGuard({
  scope: "auth-email",
  ...requestLimitConfig.authEmail,
});
const allowMediaPresignRequest = createRequestLimitGuard({
  scope: "media-presign",
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
});
const PUBLIC_DEMO_SEASON_ID = "default-season";

function rewriteDemoMemberId(
  memberId: string | null | undefined,
  memberIdsByOriginalId: Map<string, string>,
) {
  if (!memberId) {
    return memberId ?? null;
  }

  return memberIdsByOriginalId.get(memberId) ?? null;
}

function rewriteDemoMemberIds(
  memberIds: readonly string[] | undefined,
  memberIdsByOriginalId: Map<string, string>,
) {
  return (memberIds ?? []).flatMap((memberId) => {
    const demoMemberId = rewriteDemoMemberId(memberId, memberIdsByOriginalId);
    return demoMemberId === null ? [] : [demoMemberId];
  });
}

function sanitizePublicDemoBootstrap(selectedBootstrap: ReturnType<typeof buildBootstrapResponse>) {
  const memberIdsByOriginalId = new Map(
    selectedBootstrap.members.map((member, memberIndex) => [
      member.id,
      `demo-member-${memberIndex + 1}`,
    ]),
  );

  // Fictional names keep the public roster natural without exposing member identities.
  const firstNames = ["Emma", "Liam", "Isabella", "Mason", "Grace", "Daniel", "Chloe", "Owen", "Zara", "Caleb", "Nora", "Adrian", "Elena", "Miles", "Leila", "Nathan", "Hannah", "Julian", "Naomi", "Gabriel", "Audrey", "Isaac", "Vivian", "Sebastian", "Amara", "Leo"];
  const lastNames = ["Bennett", "Nguyen", "Ramirez", "Sullivan", "Okafor", "Kim", "Anderson", "Mitchell", "Hassan", "Torres", "Thompson", "Reyes", "Petrov", "Johnson", "Rahman", "Campbell", "Wilson", "Moreau", "Tanaka", "Santos", "Clarke", "Mensah", "Lin", "Romero", "Davis", "Williams"];
  const members = selectedBootstrap.members.map((member, memberIndex) => ({
    id: rewriteDemoMemberId(member.id, memberIdsByOriginalId),
    name: `${firstNames[memberIndex % firstNames.length]} ${lastNames[(memberIndex + Math.floor(memberIndex / firstNames.length)) % lastNames.length]}`,
    // Public roster categories support directory grouping, never elevated permissions.
    role: member.role === "mentor" || member.role === "admin"
      ? "mentor"
      : member.role === "external" ? "external" : "student",
    // Synthetic availability supports local demo planning without revealing schedules.
    plannedWeeklyAttendanceHours: 6,
    plannedAttendanceDays: ["tuesday", "thursday"],
    seasonId: member.seasonId,
    activeSeasonIds: member.activeSeasonIds,
  }));

  return {
    ...selectedBootstrap,
    members,
    responsibleGroups: selectedBootstrap.responsibleGroups.map((group) => ({
      ...group,
      memberIds: rewriteDemoMemberIds(group.memberIds, memberIdsByOriginalId),
      primaryMemberIds: rewriteDemoMemberIds(group.primaryMemberIds, memberIdsByOriginalId),
    })),
    subsystems: selectedBootstrap.subsystems.map((subsystem) => ({
      ...subsystem,
      responsibleEngineerId: rewriteDemoMemberId(
        subsystem.responsibleEngineerId,
        memberIdsByOriginalId,
      ),
      mentorIds: rewriteDemoMemberIds(subsystem.mentorIds, memberIdsByOriginalId),
    })),
    reports: selectedBootstrap.reports.map((report) => ({
      ...report,
      mentorId: rewriteDemoMemberId(report.mentorId, memberIdsByOriginalId),
      requestedById: rewriteDemoMemberId(report.requestedById, memberIdsByOriginalId),
      createdByMemberId: rewriteDemoMemberId(report.createdByMemberId, memberIdsByOriginalId),
      participantIds:
        report.participantIds === undefined
          ? report.participantIds
          : rewriteDemoMemberIds(report.participantIds, memberIdsByOriginalId),
    })),
    tasks: selectedBootstrap.tasks.map((task) => ({
      ...task,
      requestedById: rewriteDemoMemberId(task.requestedById, memberIdsByOriginalId),
      ownerId: rewriteDemoMemberId(task.ownerId, memberIdsByOriginalId),
      assigneeIds: rewriteDemoMemberIds(task.assigneeIds, memberIdsByOriginalId),
      mentorId: rewriteDemoMemberId(task.mentorId, memberIdsByOriginalId),
    })),
    workLogs: selectedBootstrap.workLogs.map((workLog) => ({
      ...workLog,
      participantIds: rewriteDemoMemberIds(workLog.participantIds, memberIdsByOriginalId),
      createdById: rewriteDemoMemberId(workLog.createdById, memberIdsByOriginalId),
    })),
    attendanceRecords: selectedBootstrap.attendanceRecords.map((record) => ({
      ...record,
      memberId: rewriteDemoMemberId(record.memberId, memberIdsByOriginalId),
    })),
    purchaseItems: selectedBootstrap.purchaseItems.map((item) => ({
      ...item,
      approvedById: rewriteDemoMemberId(item.approvedById, memberIdsByOriginalId),
    })),
    qaRequests: selectedBootstrap.qaRequests.map((request) => ({
      ...request,
      mentorId: rewriteDemoMemberId(request.mentorId, memberIdsByOriginalId),
      requestedById: rewriteDemoMemberId(request.requestedById, memberIdsByOriginalId),
    })),
    actions: [],
  };
}

interface TutorialResetResponse {
  ok: boolean;
  mode: "session" | "baseline";
  restored: boolean;
  tutorial: TutorialBaselineState;
}

interface RegisterRoutesOptions {
  mobileSessionService: MobileSessionService;
  webSessionService: WebSessionService;
}

export async function registerRoutes(
  app: FastifyInstance,
  options: RegisterRoutesOptions,
) {
  const sharedHierarchyPrefixes = [
    "/api/seasons",
    "/api/projects",
    "/api/workstreams",
    "/api/subsystems",
    "/api/mechanisms",
    "/api/part-definitions",
    "/api/part-instances",
    "/api/cad",
    "/api/onshape",
  ];
  const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const requireApiSessionIfEnabled = (
    request: Parameters<typeof requireSession>[0],
    reply: Parameters<typeof requireSession>[1],
  ) => {
    if (!allowApiRouteRequest(request, reply)) {
      return false;
    }

    if (!isAuthEnabled()) {
      return true;
    }

    const session = requireSession(request, reply);
    if (!session) {
      return false;
    }

    if (session.role === "external") {
      reply.code(403).send({
        message: "External roster sessions cannot access internal platform API routes.",
      });
      return false;
    }

    const path = request.url.split("?", 1)[0];
    if (
      session.role === "student" &&
      mutationMethods.has(request.method) &&
      sharedHierarchyPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ) {
      reply.code(403).send({
        message: "Only leads, mentors, and admins can modify shared planning or CAD hierarchy.",
      });
      return false;
    }

    return true;
  };

  const hasMentorPermission = (request: Parameters<typeof requireSession>[0]) => {
    if (!isAuthEnabled()) {
      return true;
    }

    const session = getSessionFromRequest(request);
    return session?.role === "lead" || session?.role === "mentor" || session?.role === "admin";
  };

  const requireMentorPermission = (
    request: Parameters<typeof requireSession>[0],
    reply: Parameters<typeof requireSession>[1],
    message: string,
  ) => {
    if (hasMentorPermission(request)) {
      return true;
    }

    reply.code(403).send({ message });
    return false;
  };

  const requireAdminPermission = (
    request: Parameters<typeof requireSession>[0],
    reply: Parameters<typeof requireSession>[1],
    message: string,
  ) => {
    if (!isAuthEnabled()) {
      return true;
    }

    const session = getSessionFromRequest(request);
    if (session?.role === "admin") {
      return true;
    }

    reply.code(403).send({ message });
    return false;
  };

  const hasWorkflowApprovalPermission = (
    request: Parameters<typeof requireSession>[0],
  ) => {
    if (!isAuthEnabled()) {
      return true;
    }

    return isWorkflowApproverRole(getSessionFromRequest(request)?.role);
  };

  const requireWorkflowApprovalPermission = (
    request: Parameters<typeof requireSession>[0],
    reply: Parameters<typeof requireSession>[1],
    message: string,
  ) => {
    if (hasWorkflowApprovalPermission(request)) {
      return true;
    }

    reply.code(403).send({ message });
    return false;
  };

  const getTaskActionMember = (request: Parameters<typeof requireSession>[0]) => {
    const members = getMembers();

    if (!isAuthEnabled()) {
      return (
        members.find((member) => member.role === "student" || member.role === "lead") ??
        members[0] ??
        null
      );
    }

    const session = getSessionFromRequest(request);
    const accountId = session?.accountId?.trim().toLowerCase();
    const email = session?.email?.trim().toLowerCase();
    const exactMatch = members.find((member) => {
      return (
        member.id.trim().toLowerCase() === accountId ||
        member.email?.trim().toLowerCase() === email
      );
    });

    if (exactMatch) {
      return exactMatch;
    }

    return null;
  };

  const getWorkflowApprovalMember = (request: Parameters<typeof requireSession>[0]) => {
    if (!isAuthEnabled()) {
      return getMembers().find((member) => member.role === "mentor" || member.role === "admin") ?? null;
    }

    const actor = getTaskActionMember(request);
    return actor && isWorkflowApproverRole(actor.role) ? actor : null;
  };

  const readAuditRequestId = (request: FastifyRequest) => {
    const requestId = request.id;
    return typeof requestId === "string" && requestId.trim().length > 0
      ? requestId
      : null;
  };

  const buildTaskAuditContext = (
    request: FastifyRequest,
    actorMemberId?: string | null,
  ) => ({
    actorMemberId: actorMemberId ?? getTaskActionMember(request)?.id ?? null,
    requestId: readAuditRequestId(request),
  });

  const canManageTaskAssignment = hasMentorPermission;

  const buildTaskActionItem = (taskId: string) => {
    const task = getTasks().find((candidate) => candidate.id === taskId);
    return task
      ? {
          ...task,
          isBlocked: Boolean(task.isBlocked),
          isWaitingOnDependency: isTaskWaitingOnDependencies(task, getSnapshot()),
        }
      : null;
  };

  const isTaskStartReady = (task: ReturnType<typeof getTasks>[number]) => {
    return (
      task.status !== "complete" &&
      !task.isBlocked &&
      !isTaskWaitingOnDependencies(task, getSnapshot())
    );
  };

  const isValidTaskDependencyTarget = (
    kind: "task" | "milestone" | "part-instance",
    refId: string,
  ) => {
    if (kind === "task") {
      return getTasks().some((task) => task.id === refId);
    }

    if (kind === "milestone") {
      return getMilestones().some((milestone) => milestone.id === refId);
    }

    if (kind === "part-instance") {
      return getPartInstances().some((partInstance) => partInstance.id === refId);
    }

    return false;
  };

  const getWorkspaceUserKey = (
    request: Parameters<typeof getSessionFromRequest>[0],
  ) => {
    if (!isAuthEnabled()) {
      return "local-development";
    }

    const session = getSessionFromRequest(request);
    const email = session?.email?.trim().toLowerCase();
    return email || session?.accountId || "authenticated-user";
  };

  const allowDemoBootstrapRequest = (
    request: Parameters<typeof requireSession>[0],
    reply: Parameters<typeof requireSession>[1],
    selection: ReturnType<typeof readBootstrapSelection>,
  ) => {
    if (!allowApiRouteRequest(request, reply)) {
      return false;
    }

    if (!isAuthEnabled()) {
      return true;
    }

    const session = getSessionFromRequest(request);
    if (selection.personId !== null && (!session || session.isPublicDemo)) {
      requireSession(request, reply);
      return false;
    }

    if (!session) {
      if (selection.seasonId === PUBLIC_DEMO_SEASON_ID) {
        return true;
      }

      requireSession(request, reply);
      return false;
    }

    if (session.role === "external") {
      reply.code(403).send({
        message: "External roster sessions cannot access internal platform API routes.",
      });
      return false;
    }

    return true;
  };

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "meco-platform",
      timestamp: new Date().toISOString(),
    };
  });

  registerAuthRoutes(app, {
    allowApiRouteRequest,
    allowAuthEmailRouteRequest,
    allowAuthRouteRequest,
  });
  registerMobileAuthRoutes(app, {
    allowAuthEmailRouteRequest,
    allowAuthRouteRequest,
    service: options.mobileSessionService,
  });
  registerWebAuthRoutes(app, {
    allowAuthEmailRouteRequest,
    allowAuthRouteRequest,
    webSessionService: options.webSessionService,
  });

  app.get("/api/dashboard", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return buildDashboard(getSnapshot());
  });

  app.get("/api/home", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const session = isAuthEnabled() ? getSessionFromRequest(request) : null;

    return buildSlackHomeResponse({
      members: getMembers(),
      userEmail: session?.email ?? null,
    });
  });

  app.get("/api/bootstrap", async (request, reply) => {
    const selection = readBootstrapSelection(request.query);
    if (!allowDemoBootstrapRequest(request, reply, selection)) {
      return;
    }

    const snapshot = getSnapshot();
    const session = isAuthEnabled() ? getSessionFromRequest(request) : null;
    const isPublicDemoBootstrap = session?.isPublicDemo === true ||
      (!session && (isAuthEnabled() || selection.seasonId === PUBLIC_DEMO_SEASON_ID));
    const selectedBootstrap = buildBootstrapResponse(snapshot, selection);
    const responseBootstrap = isPublicDemoBootstrap
      ? sanitizePublicDemoBootstrap(selectedBootstrap)
      : selectedBootstrap;
    const bootstrapPayload = bootstrapPayloadSchema.safeParse(responseBootstrap);

    if (!bootstrapPayload.success) {
      return reply.code(500).send({
        message: "Bootstrap response payload does not match platform contract.",
        issues: bootstrapPayload.error.flatten(),
      });
    }

    return bootstrapPayload.data;
  });

  app.get("/api/audit/export", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireAdminPermission(request, reply, "Only admins can export audit history.")) {
      return;
    }

    const parsed = parseRouteInput(
      auditExportQuerySchema, request.query ?? {}, reply,
      "Audit export query is invalid.",
    );
    if (!parsed) {
      return reply;
    }
    const { format, ...filters } = parsed.data;
    const actions = filterAuditActions(getSnapshot(), filters);

    if (format === "csv") {
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", "attachment; filename=\"meco-audit-actions.csv\"")
        .send(formatAuditActionsCsv(actions));
    }

    return {
      items: actions,
      count: actions.length,
      filters,
    };
  });

  app.post("/api/tutorial/session/start", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can start global tutorial sessions.")) {
      return;
    }

    const userKey = getWorkspaceUserKey(request);
    startInteractiveTutorialSession(isAuthEnabled() ? userKey : undefined);
    return {
      ok: true,
      mode: "session" as const,
      tutorial: isAuthEnabled()
        ? resetTutorialBaseline(userKey)
        : getTutorialBaselineState(),
    };
  });

  app.post<{ Body: unknown }>("/api/tutorial/session/reset", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can reset global tutorial sessions.")) {
      return;
    }

    const parsed = parseRouteInput(
      tutorialSessionResetSchema, request.body ?? {}, reply,
      "Tutorial reset payload is invalid.",
    );
    if (!parsed) {
      return reply;
    }

    if (parsed.data.mode === "baseline") {
      const tutorial = resetTutorialBaseline(
        isAuthEnabled() ? getWorkspaceUserKey(request) : undefined,
      );
      const baselineReady =
        tutorial.seasonId !== null && tutorial.missingProjectNames.length === 0;

      if (!baselineReady) {
        const response: TutorialResetResponse & { message: string } = {
          ok: false,
          mode: "baseline",
          restored: true,
          tutorial,
          message:
            "Tutorial baseline is missing required season or project records.",
        };
        return reply.code(500).send(response);
      }

      const response: TutorialResetResponse = {
        ok: true,
        mode: "baseline",
        restored: true,
        tutorial,
      };
      return response;
    }

    const restored = resetInteractiveTutorialSession(
      isAuthEnabled() ? getWorkspaceUserKey(request) : undefined,
    );

    const response: TutorialResetResponse = {
      ok: restored,
      mode: "session",
      restored,
      tutorial: getTutorialBaselineState(),
    };
    return response;
  });

  app.get("/api/seasons", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getSeasons(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/seasons", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }
    if (!requireMentorPermission(request, reply, "Only mentors can create seasons.")) {
      return;
    }

    const parsed = parseRouteInput(seasonSchema, request.body, reply, "Season payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const currentYear = new Date().toISOString().slice(0, 4);
    const startDate = parsed.data.startDate ?? `${currentYear}-01-01`;
    const endDate = parsed.data.endDate ?? `${currentYear}-12-31`;

    if (startDate > endDate) {
      return reply.code(400).send({
        message: "Season start date must be on or before the end date.",
      });
    }

    const season = createSeason({
      name: parsed.data.name,
      type: parsed.data.type,
      startDate,
      endDate,
    });

    return reply.code(201).send({
      item: season,
    });
  });

  app.get("/api/projects", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getProjects(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/projects", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }
    if (!requireMentorPermission(request, reply, "Only mentors can create projects.")) {
      return;
    }

    const parsed = parseRouteInput(projectSchema, request.body, reply, "Project payload is invalid.");
    if (!parsed) {
      return reply;
    }

    if (!getSeasons().some((season) => season.id === parsed.data.seasonId)) {
      return reply.code(400).send({
        message: "The selected season does not exist.",
      });
    }

    const duplicateProject = getProjects().some((project) => project.seasonId === parsed.data.seasonId && project.projectType === parsed.data.projectType);
    const expectedNames = { robot: "Robot", media: "Media", outreach: "Outreach", operations: "Operations", strategy: "Strategy", training: "Training" } as const;
    if (parsed.data.name !== expectedNames[parsed.data.projectType] || duplicateProject) {
      return reply.code(409).send({ message: "Each season has exactly one canonical project for each project type." });
    }

    const project = createProject(parsed.data);

    return reply.code(201).send({
      item: project,
    });
  });

  app.patch<{ Body: unknown; Params: { projectId: string } }>(
    "/api/projects/:projectId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }
      if (!requireMentorPermission(request, reply, "Only mentors can edit projects.")) {
        return;
      }

      const parsed = parseRouteInput(projectPatchSchema, request.body, reply, "Project update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const existingProject = findProject(request.params.projectId);
      if (!existingProject) {
        return reply.code(404).send({
          message: "Project not found.",
        });
      }

      const canonicalName = { robot: "Robot", media: "Media", outreach: "Outreach", operations: "Operations", strategy: "Strategy", training: "Training" } as const;
      if (parsed.data.name !== undefined && parsed.data.name !== canonicalName[existingProject.projectType]) {
        return reply.code(400).send({ message: "Project names are canonical and determined by project type." });
      }

      const project = updateProject(request.params.projectId, parsed.data);

      return {
        item: project,
      };
    },
  );

  app.get("/api/workstreams", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getWorkstreams(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/workstreams", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }
    if (!requireMentorPermission(request, reply, "Only mentors can create workstreams.")) {
      return;
    }

    const parsed = parseRouteInput(workstreamSchema, request.body, reply, "Workstream payload is invalid.");
    if (!parsed) {
      return reply;
    }

    if (!findProject(parsed.data.projectId)) {
      return reply.code(400).send({
        message: "The selected project does not exist.",
      });
    }

    const workstream = createWorkstream(parsed.data);

    return reply.code(201).send({
      item: workstream,
    });
  });

  app.patch<{ Body: unknown; Params: { workstreamId: string } }>(
    "/api/workstreams/:workstreamId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }
      if (!requireMentorPermission(request, reply, "Only mentors can edit workstreams.")) {
        return;
      }

      const parsed = parseRouteInput(
        workstreamPatchSchema, request.body, reply,
        "Workstream update payload is invalid.",
      );
      if (!parsed) {
        return reply;
      }

      const currentWorkstream = findWorkstream(request.params.workstreamId);
      if (!currentWorkstream) {
        return reply.code(404).send({
          message: "Workstream not found.",
        });
      }

      const nextProjectId = parsed.data.projectId ?? currentWorkstream.projectId;
      if (!findProject(nextProjectId)) {
        return reply.code(400).send({
          message: "The selected project does not exist.",
        });
      }

      const workstream = updateWorkstream(request.params.workstreamId, {
        ...parsed.data,
        projectId: nextProjectId,
      });

      return {
        item: workstream,
      };
    },
  );

  app.get("/api/reports", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const bootstrap = buildBootstrapResponse(
      getSnapshot(),
      readBootstrapSelection(request.query),
    );
    const paginated = paginateItems(bootstrap.reports, request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/reports", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(reportSchema, request.body, reply, "Report payload is invalid.");
    if (!parsed) {
      return reply;
    }

    if (
      parsed.data.reportType === "qa" &&
      parsed.data.status === "reviewed" &&
      !requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors or admins can approve QA.",
      )
    ) {
      return;
    }

    const taskId = parsed.data.targetRefs.find((ref) => ref.kind === "task")?.id;
    const validationError = parsed.data.reportType === "qa"
      ? taskId ? validateQaReportLinks({ taskId, targetRefs: parsed.data.targetRefs, participantIds: parsed.data.participantIds }) : validateTestResultLinks({ projectId: parsed.data.projectId, targetRefs: parsed.data.targetRefs })
      : validateTestResultLinks({ projectId: parsed.data.projectId, targetRefs: parsed.data.targetRefs });
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const report = createReport(parsed.data);
    if (!report) {
      return reply.code(400).send({
        message: "Report payload could not be created.",
      });
    }

    return reply.code(201).send({
      item: report,
    });
  });

  app.get("/api/report-findings", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const bootstrap = buildBootstrapResponse(
      getSnapshot(),
      readBootstrapSelection(request.query),
    );
    const projectIds = new Set(bootstrap.projects.map((project) => project.id));
    const paginated = paginateItems(getFindings().filter((finding) => projectIds.has(finding.projectId)), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/report-findings", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(reportFindingSchema, request.body, reply, "Report finding payload is invalid.");
    if (!parsed) {
      return reply;
    }

    if (!getReports().some((report) => report.id === parsed.data.reportId)) {
      return reply.code(400).send({
        message: "The selected report does not exist.",
      });
    }

    const finding = createReportFinding(parsed.data);

    return reply.code(201).send({
      item: finding,
    });
  });

  app.get("/api/qa-reports", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getQaReports(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/qa-reports", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(qaReportSchema, request.body, reply, "QA report payload is invalid.");
    if (!parsed) {
      return reply;
    }

    if (
      parsed.data.status === "reviewed" &&
      !requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors or admins can approve QA.",
      )
    ) {
      return;
    }

    const taskId = parsed.data.targetRefs.find((ref) => ref.kind === "task")?.id;
    const validationError = taskId
      ? validateQaReportLinks({ taskId, targetRefs: parsed.data.targetRefs, participantIds: parsed.data.participantIds })
      : validateTestResultLinks({ projectId: parsed.data.projectId, targetRefs: parsed.data.targetRefs });
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const report = createQaReport({
      ...parsed.data,
      participantIds: Array.from(new Set(parsed.data.participantIds)),
    });

    return reply.code(201).send({
      item: report,
    });
  });

  app.post<{ Body: unknown }>("/api/qa-reports/submit", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) return;
    if (!requireMentorPermission(request, reply, "Only leads, mentors or admins can submit task QA.")) return;
    const parsed = parseRouteInput(qaSubmitSchema, request.body, reply, "QA submission is invalid.");
    if (!parsed) {
      return reply;
    }
    if (parsed.data.status === "reviewed" && !requireWorkflowApprovalPermission(request, reply, "Only mentors or admins can approve QA.")) return;
    const taskId = parsed.data.targetRefs.find((ref) => ref.kind === "task")?.id;
    const validationError = taskId
      ? validateQaReportLinks({ taskId, targetRefs: parsed.data.targetRefs, participantIds: parsed.data.participantIds })
      : validateTestResultLinks({ projectId: parsed.data.projectId, targetRefs: parsed.data.targetRefs });
    if (validationError) return reply.code(400).send({ message: validationError });
    const result = submitQaReport({ ...parsed.data, participantIds: Array.from(new Set(parsed.data.participantIds)) });
    if (result.error) return reply.code(409).send({ message: result.error });
    return reply.code(201).send({ item: result.item });
  });

  app.get("/api/qa-requests", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getQaRequests(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/qa-requests", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(qaRequestSchema, request.body, reply, "QA request payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const validationError = validateQaRequestLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const taskTargeted = parsed.data.targetRefs.some((ref) => ref.kind === "task");
    const actor = taskTargeted && isAuthEnabled() ? getTaskActionMember(request) : null;
    if (taskTargeted && isAuthEnabled() && !actor) {
      return reply.code(403).send({ message: "A roster member is required to request task QA." });
    }
    const requestItem = createQaRequest({
      ...parsed.data,
      subject: parsed.data.subject.trim(),
      requestedById: taskTargeted && isAuthEnabled()
        ? actor!.id
        : parsed.data.requestedById ?? null,
    });

    const taskId = requestItem.targetRefs.find((ref) => ref.kind === "task")?.id;
    return reply.code(201).send({
      item: requestItem,
      task: taskId ? buildTaskActionItem(taskId) : null,
    });
  });

  app.get("/api/test-results", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getTestResults(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/test-results", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(testResultSchema, request.body, reply, "Test result payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const validationError = validateTestResultLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const testResult = createTestResult({
      ...parsed.data,
    });

    return reply.code(201).send({
      item: testResult,
    });
  });

  app.get("/api/risks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getRisks(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/risks", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(riskSchema, request.body, reply, "Risk payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const validationError = validateRiskLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const risk = createRisk({ ...parsed.data, mitigationTaskId: parsed.data.mitigationTaskId ?? null, ownerGroupId: parsed.data.ownerGroupId ?? null, ownerMemberId: parsed.data.ownerMemberId ?? null, mitigationDueDate: parsed.data.mitigationDueDate ?? null });

    return reply.code(201).send({
      item: risk,
    });
  });

  app.patch<{ Body: unknown; Params: { riskId: string } }>(
    "/api/risks/:riskId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(riskPatchSchema, request.body, reply, "Risk update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentRisk = findRisk(request.params.riskId);
      if (!currentRisk) {
        return reply.code(404).send({
          message: "Risk not found.",
        });
      }

      const nextRiskShape = { ...currentRisk, ...parsed.data };

      const validationError = validateRiskLinks(nextRiskShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const risk = updateRisk(request.params.riskId, parsed.data);

      return {
        item: risk,
      };
    },
  );

  app.delete<{ Params: { riskId: string } }>(
    "/api/risks/:riskId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const risk = removeRisk(request.params.riskId);
      if (!risk) {
        return reply.code(404).send({
          message: "Risk not found.",
        });
      }

      return {
        item: risk,
      };
    },
  );

  app.post<{ Body: unknown }>("/api/work-logs", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(workLogSchema, request.body, reply, "Work log payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const validationError = validateWorkLogLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const workLog = createWorkLog({
      ...parsed.data,
      notes: parsed.data.notes.trim(),
      participantIds: Array.from(new Set(parsed.data.participantIds)),
      createdById: getTaskActionMember(request)?.id ?? null,
    }, buildTaskAuditContext(request));

    return reply.code(201).send({
      item: workLog,
    });
  });

  app.patch<{ Body: unknown; Params: { workLogId: string } }>(
    "/api/work-logs/:workLogId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors and admins can update work logs.",
      )) {
        return;
      }

      const parsed = parseRouteInput(workLogPatchSchema, request.body, reply, "Work log update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentWorkLog = getSnapshot().workLogs.find(
        (workLog) => workLog.id === request.params.workLogId,
      );
      if (!currentWorkLog) {
        return reply.code(404).send({
          message: "Work log not found.",
        });
      }

      const nextWorkLogShape = {
        taskId: parsed.data.taskId ?? currentWorkLog.taskId,
        participantIds: parsed.data.participantIds ?? currentWorkLog.participantIds,
      };
      const validationError = validateWorkLogLinks(nextWorkLogShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const workLog = updateWorkLog(request.params.workLogId, {
        ...parsed.data,
        ...(parsed.data.participantIds === undefined
          ? {}
          : { participantIds: Array.from(new Set(parsed.data.participantIds)) }),
      }, buildTaskAuditContext(request));

      return {
        item: workLog,
      };
    },
  );

  app.delete<{ Params: { workLogId: string } }>(
    "/api/work-logs/:workLogId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors and admins can delete work logs.",
      )) {
        return;
      }

      const workLog = removeWorkLog(
        request.params.workLogId,
        buildTaskAuditContext(request),
      );
      if (!workLog) {
        return reply.code(404).send({
          message: "Work log not found.",
        });
      }

      return {
        item: workLog,
      };
    },
  );

  app.get("/api/tasks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const snapshot = getSnapshot();
    const personId = readPersonFilter(request);
    const items = filterTasksForPerson(personId).map((task) => ({
      id: task.id,
      projectId: task.projectId,
      workTypeId: task.workTypeId,
      responsibleGroupId: task.responsibleGroupId,
      requestedById: task.requestedById,
      scheduleRefs: task.scheduleRefs,
      manufacturingDetails: task.manufacturingDetails,
      workstreamIds: task.workstreamIds,
      title: task.title,
      summary: task.summary,
      subsystemIds: task.subsystemIds,
      mechanismIds: task.mechanismIds,
      partInstanceIds: task.partInstanceIds,
      ownerId: task.ownerId,
      assigneeIds: task.assigneeIds ?? [],
      mentorId: task.mentorId,
      startDate: task.startDate,
      dueDate: task.dueDate,
      status: formatTaskStatus(task.status),
      rawStatus: task.status,
      priority: task.priority,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      gate: evaluateTaskCompletion(task, snapshot),
      isBlocked: Boolean(task.isBlocked),
      isWaitingOnDependency: isTaskWaitingOnDependencies(task, snapshot),
                  requiresDocumentation: task.requiresDocumentation,
    }));
    const paginated = paginateItems(items, request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.get("/api/iterations", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getDesignIterations(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.get("/api/findings", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getFindings(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.get("/api/task-targets", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getTaskTargets(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.get<{ Params: { taskId: string } }>("/api/tasks/:taskId/milestones", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const task = getTasks().find((candidate) => candidate.id === request.params.taskId);
    if (!task) {
      return reply.code(404).send({
        message: "Task not found.",
      });
    }

    return {
      taskId: task.id,
      items: getMilestonesForTask(task.id),
    };
  });

  app.get("/api/milestones", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getMilestones(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.get<{ Params: { milestoneId: string } }>("/api/milestones/:milestoneId/tasks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const milestone = findMilestone(request.params.milestoneId);
    if (!milestone) {
      return reply.code(404).send({
        message: "Milestone not found.",
      });
    }

    return {
      milestoneId: milestone.id,
      items: getTasksForMilestone(milestone.id),
    };
  });

  app.post<{ Body: unknown }>("/api/milestones", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(milestoneSchema, request.body, reply, "Milestone payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const projectIds = Array.from(new Set(parsed.data.projectIds));
    const milestoneProjectValidation = validateMilestoneProjectLinks(projectIds);
    if (milestoneProjectValidation) {
      return reply.code(400).send({
        message: milestoneProjectValidation,
      });
    }

    const milestone = createMilestone({
      ...parsed.data,
      endAt: parsed.data.endAt ?? null,
      description: parsed.data.description ?? "",
      projectIds,
      photoUrl: parsed.data.photoUrl ?? "",
    });

    return reply.code(201).send({
      item: milestone,
    });
  });

  app.patch<{ Body: unknown; Params: { milestoneId: string } }>(
    "/api/milestones/:milestoneId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(milestonePatchSchema, request.body, reply, "Milestone update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentMilestone = findMilestone(request.params.milestoneId);
      if (!currentMilestone) {
        return reply.code(404).send({
          message: "Milestone not found.",
        });
      }

      const nextProjectIds =
        parsed.data.projectIds === undefined
          ? currentMilestone.projectIds ?? []
          : Array.from(new Set(parsed.data.projectIds));
      const milestoneProjectValidation = validateMilestoneProjectLinks(nextProjectIds);
      if (milestoneProjectValidation) {
        return reply.code(400).send({
          message: milestoneProjectValidation,
        });
      }

      const milestone = updateMilestone(request.params.milestoneId, {
        ...parsed.data,
        endAt:
          parsed.data.endAt === undefined
            ? currentMilestone.endAt
            : parsed.data.endAt,
        description:
          parsed.data.description === undefined
            ? currentMilestone.description
            : parsed.data.description,
        projectIds: [...nextProjectIds],
        photoUrl:
          parsed.data.photoUrl === undefined
            ? currentMilestone.photoUrl
            : parsed.data.photoUrl,
      });

      return {
        item: milestone,
      };
    },
  );

  app.delete<{ Params: { milestoneId: string } }>(
    "/api/milestones/:milestoneId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const milestone = removeMilestone(request.params.milestoneId);
      if (!milestone) {
        return reply.code(404).send({
          message: "Milestone not found.",
        });
      }

      return {
        item: milestone,
      };
    },
  );

  app.get("/api/materials", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getMaterials(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/materials", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(materialSchema, request.body, reply, "Material payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const material = createMaterial({
      ...parsed.data,
      notes: parsed.data.notes ?? "",
    });

    return reply.code(201).send({
      item: material,
    });
  });

  app.patch<{ Body: unknown; Params: { materialId: string } }>(
    "/api/materials/:materialId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(materialPatchSchema, request.body, reply, "Material update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentMaterial = findMaterial(request.params.materialId);
      if (!currentMaterial) {
        return reply.code(404).send({
          message: "Material not found.",
        });
      }

      const material = updateMaterial(request.params.materialId, parsed.data);
      return {
        item: material,
      };
    },
  );

  app.delete<{ Params: { materialId: string } }>(
    "/api/materials/:materialId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const material = removeMaterial(request.params.materialId);
      if (!material) {
        return reply.code(404).send({
          message: "Material not found.",
        });
      }

      return {
        item: material,
      };
    },
  );

  app.get("/api/artifacts", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getArtifacts(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/media/presign-upload", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }
    if (!allowMediaPresignRequest(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(mediaUploadRequestSchema, request.body, reply, "Media upload payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const project = findProject(parsed.data.projectId);
    if (!project) {
      return reply.code(400).send({
        message: "The selected project does not exist.",
      });
    }

    try {
      return await presignImageUpload({
        ...parsed.data,
        quotaKey: getSessionFromRequest(request)?.accountId ?? request.ip,
        teamId: project.teamId,
      });
    } catch (error) {
      if (error instanceof MediaUploadError) {
        return reply.code(error.statusCode).send({
          message: error.message,
        });
      }

      request.log.error({ err: error }, "Media upload presign failed");
      return reply.code(500).send({
        message: "Media upload failed unexpectedly.",
      });
    }
  });

  app.post<{ Body: unknown }>("/api/media/presign-video-upload", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }
    if (!allowMediaPresignRequest(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(mediaUploadRequestSchema, request.body, reply, "Media upload payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const project = findProject(parsed.data.projectId);
    if (!project) {
      return reply.code(400).send({
        message: "The selected project does not exist.",
      });
    }

    try {
      return await presignVideoUpload({
        ...parsed.data,
        quotaKey: getSessionFromRequest(request)?.accountId ?? request.ip,
        teamId: project.teamId,
      });
    } catch (error) {
      if (error instanceof MediaUploadError) {
        return reply.code(error.statusCode).send({
          message: error.message,
        });
      }

      request.log.error({ err: error }, "Media upload presign failed");
      return reply.code(500).send({
        message: "Media upload failed unexpectedly.",
      });
    }
  });

  app.post<{ Body: unknown }>("/api/artifacts", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(artifactSchema, request.body, reply, "Artifact payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const validationError = validateArtifactLinks({
      projectId: parsed.data.projectId,
      targetRefs: parsed.data.targetRefs,
    });
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const artifact = createArtifact({
      ...parsed.data,
      summary: parsed.data.summary ?? "",
      status: parsed.data.status ?? "draft",
      uri: parsed.data.uri ?? "",
      updatedAt: parsed.data.updatedAt ?? new Date().toISOString(),
    });

    return reply.code(201).send({
      item: artifact,
    });
  });

  app.patch<{ Body: unknown; Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(artifactPatchSchema, request.body, reply, "Artifact update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentArtifact = findArtifact(request.params.artifactId);
      if (!currentArtifact) {
        return reply.code(404).send({
          message: "Artifact not found.",
        });
      }

      const nextProjectId = parsed.data.projectId ?? currentArtifact.projectId;
      const nextTargetRefs = parsed.data.targetRefs ?? currentArtifact.targetRefs;
      const validationError = validateArtifactLinks({
        projectId: nextProjectId,
        targetRefs: nextTargetRefs.map((ref) => ({ ...ref })),
      });
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const artifact = updateArtifact(request.params.artifactId, {
        ...parsed.data,
        projectId: nextProjectId,
        targetRefs: nextTargetRefs.map((ref) => ({ ...ref })),
        updatedAt: parsed.data.updatedAt ?? new Date().toISOString(),
      });

      return {
        item: artifact,
      };
    },
  );

  app.delete<{ Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const artifact = removeArtifact(request.params.artifactId);
      if (!artifact) {
        return reply.code(404).send({
          message: "Artifact not found.",
        });
      }

      return {
        item: artifact,
      };
    },
  );

  app.post<{ Body: unknown }>("/api/tasks", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can create tasks.")) {
      return;
    }

    const parsed = parseRouteInput(taskSchema, request.body, reply, "Task payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const targetIds = normalizeTaskTargets(parsed.data);
    const projectId = resolveProjectId({
      projectId: parsed.data.projectId,
      subsystemId: targetIds.subsystemIds[0],
    });
    if (!projectId) {
      return reply.code(400).send({
        message: "Task payload references an unknown project.",
      });
    }

    const taskInput = {
      ...parsed.data,
      projectId,
      ...targetIds,
      assigneeIds: uniqueIds(parsed.data.assigneeIds ?? []),
      startDate: parsed.data.startDate ?? parsed.data.dueDate,
      requiresDocumentation: parsed.data.requiresDocumentation ?? false,
    };

    const createdTask = createTask(taskInput);
    return reply.code(201).send({
      item: {
        ...createdTask,
        isBlocked: Boolean(createdTask.isBlocked),
        isWaitingOnDependency: isTaskWaitingOnDependencies(createdTask, getSnapshot()),
      },
    });
  });

  app.post<{ Body: unknown; Params: { taskId: string } }>(
    "/api/tasks/:taskId/claim",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(taskClaimSchema, request.body ?? {}, reply, "Task claim payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentTask = getTasks().find((task) => task.id === request.params.taskId);
      if (!currentTask) {
        return reply.code(404).send({
          message: "Task not found.",
        });
      }

      const member = getTaskActionMember(request);
      if (!member || (member.role !== "student" && member.role !== "lead")) {
        return reply.code(403).send({
          message: "Only roster students can claim tasks.",
        });
      }

      if (currentTask.ownerId && currentTask.ownerId !== member.id) {
        return reply.code(409).send({
          code: "task_already_claimed",
          message: "Task is already claimed.",
          ownerId: currentTask.ownerId,
          taskId: currentTask.id,
        });
      }

      const updatedTask = updateTask(currentTask.id, {
        ownerId: member.id,
        assigneeIds: uniqueIds([...(currentTask.assigneeIds ?? []), member.id]),
        status:
          parsed.data.start && isTaskStartReady(currentTask)
            ? "in-progress"
            : currentTask.status,
      }, buildTaskAuditContext(request, member.id));

      return {
        item: updatedTask ? buildTaskActionItem(updatedTask.id) : updatedTask,
      };
    },
  );

  app.post<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId/release", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const currentTask = getTasks().find((task) => task.id === request.params.taskId);
      if (!currentTask) {
        return reply.code(404).send({
          message: "Task not found.",
        });
      }

      const member = getTaskActionMember(request);
      const canManage = canManageTaskAssignment(request);
      if (!member && !canManage) {
        return reply.code(403).send({
          message: "Only roster members can release tasks.",
        });
      }

      if (currentTask.ownerId !== member?.id && !canManage) {
        return reply.code(403).send({
          message: "Only the task owner or mentors can release this task.",
        });
      }

      const nextAssigneeIds = (currentTask.assigneeIds ?? []).filter(
        (assigneeId) => assigneeId !== currentTask.ownerId,
      );
      const assignmentError = validateTaskPeople({
        ownerId: null,
        assigneeIds: nextAssigneeIds,
        mentorId: currentTask.mentorId,
      });
      if (assignmentError) {
        return reply.code(409).send({
          message: "Assign another student, lead, or mentor before releasing this task.",
        });
      }

      const updatedTask = updateTask(currentTask.id, {
        ownerId: null,
        assigneeIds: nextAssigneeIds,
      }, buildTaskAuditContext(request, member?.id ?? null));

      return {
        item: updatedTask ? buildTaskActionItem(updatedTask.id) : updatedTask,
      };
    },
  );

  app.post<{ Body: unknown; Params: { taskId: string } }>(
    "/api/tasks/:taskId/reassign",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can reassign tasks.")) {
        return;
      }

      const parsed = parseRouteInput(taskReassignSchema, request.body, reply, "Task reassign payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentTask = getTasks().find((task) => task.id === request.params.taskId);
      if (!currentTask) {
        return reply.code(404).send({
          message: "Task not found.",
        });
      }

      const nextOwner = parsed.data.ownerId
        ? getMembers().find((member) => member.id === parsed.data.ownerId)
        : null;
      if (parsed.data.ownerId && (!nextOwner || (nextOwner.role !== "student" && nextOwner.role !== "lead"))) {
        return reply.code(400).send({
          message: "Task owner must be a student or lead.",
        });
      }

      const existingAssigneeIds = uniqueIds(currentTask.assigneeIds ?? []);
      const assigneeIdsWithoutPreviousOwner =
        currentTask.ownerId && currentTask.ownerId !== parsed.data.ownerId
          ? existingAssigneeIds.filter((assigneeId) => assigneeId !== currentTask.ownerId)
          : existingAssigneeIds;
      const nextAssigneeIds = parsed.data.ownerId
        ? uniqueIds([...assigneeIdsWithoutPreviousOwner, parsed.data.ownerId])
        : assigneeIdsWithoutPreviousOwner;
      const assignmentError = validateTaskPeople({
        ownerId: parsed.data.ownerId,
        assigneeIds: nextAssigneeIds,
        mentorId: currentTask.mentorId,
      });
      if (assignmentError) {
        return reply.code(400).send({ message: assignmentError });
      }

      const updatedTask = updateTask(currentTask.id, {
        ownerId: parsed.data.ownerId,
        assigneeIds: nextAssigneeIds,
      }, buildTaskAuditContext(request));

      return {
        item: updatedTask ? buildTaskActionItem(updatedTask.id) : updatedTask,
      };
    },
  );

  app.patch<{ Body: unknown; Params: { taskId: string } }>(
    "/api/tasks/:taskId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can edit tasks.")) {
        return;
      }

      const parsed = parseRouteInput(taskPatchSchema, request.body, reply, "Task update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentTask = getTasks().find((task) => task.id === request.params.taskId);
      if (!currentTask) {
        return reply.code(404).send({
          message: "Task not found.",
        });
      }

      const targetIds = normalizeTaskTargets(parsed.data, currentTask);
      const nextProjectId = resolveProjectId({
        projectId: parsed.data.projectId,
        subsystemId: targetIds.subsystemIds[0],
      }) ?? currentTask.projectId;
      const updatedTask = updateTask(request.params.taskId, {
        ...parsed.data,
        projectId: nextProjectId,
        ...targetIds,
      }, buildTaskAuditContext(request));
      return {
        item: updatedTask
          ? {
              ...updatedTask,
              isBlocked: Boolean(updatedTask.isBlocked),
              isWaitingOnDependency: isTaskWaitingOnDependencies(updatedTask, getSnapshot()),
            }
          : updatedTask,
      };
    },
  );

  app.delete<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can delete tasks.")) {
        return;
      }

      const task = removeTask(request.params.taskId);
      if (!task) {
        return reply.code(404).send({
          message: "Task not found.",
        });
      }

      return {
        item: {
          ...task,
          isBlocked: Boolean(task.isBlocked),
          isWaitingOnDependency: isTaskWaitingOnDependencies(task, getSnapshot()),
        },
      };
    },
  );

  app.get("/api/task-dependencies", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const bootstrap = buildBootstrapResponse(
      getSnapshot(),
      readBootstrapSelection(request.query),
    );
    const paginated = paginateItems(bootstrap.taskDependencies, request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/task-dependencies", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(taskDependencySchema, request.body, reply, "Task dependency payload is invalid.");
    if (!parsed) {
      return reply;
    }

    if (!getTasks().some((task) => task.id === parsed.data.taskId)) {
      return reply.code(400).send({
        message: "The selected dependency task does not exist.",
      });
    }

    if (parsed.data.kind === "task" && parsed.data.taskId === parsed.data.refId) {
      return reply.code(400).send({
        message: "A task cannot depend on itself.",
      });
    }

    if (!isValidTaskDependencyTarget(parsed.data.kind, parsed.data.refId)) {
      return reply.code(400).send({
        message: "The selected dependency target does not exist.",
      });
    }

    const dependency = createTaskDependency(parsed.data);
    return reply.code(201).send({
      item: dependency,
    });
  });

  app.patch<{ Body: unknown; Params: { dependencyId: string } }>(
    "/api/task-dependencies/:dependencyId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(
        taskDependencyPatchSchema, request.body, reply,
        "Task dependency update payload is invalid.",
      );
      if (!parsed) {
        return reply;
      }

      const currentDependency = getTaskDependencies().find(
        (dependency) => dependency.id === request.params.dependencyId,
      );
      if (!currentDependency) {
        return reply.code(404).send({
          message: "Task dependency not found.",
        });
      }

      const nextTaskId = parsed.data.taskId ?? currentDependency.taskId;
      const nextKind = parsed.data.kind ?? currentDependency.kind;
      const nextRefId = parsed.data.refId ?? currentDependency.refId;
      if (!getTasks().some((task) => task.id === nextTaskId)) {
        return reply.code(400).send({
          message: "The selected dependency task does not exist.",
        });
      }

      if (nextKind === "task" && nextTaskId === nextRefId) {
        return reply.code(400).send({
          message: "A task cannot depend on itself.",
        });
      }

      if (!isValidTaskDependencyTarget(nextKind, nextRefId)) {
        return reply.code(400).send({
          message: "The selected dependency target does not exist.",
        });
      }

      const mergedPayload = {
        taskId: nextTaskId,
        kind: nextKind,
        refId: nextRefId,
        dependencyType: parsed.data.dependencyType ?? currentDependency.dependencyType,
        ...(nextKind === "part-instance"
          ? { requiredCondition: parsed.data.requiredCondition ?? (currentDependency.kind === "part-instance" ? currentDependency.requiredCondition : undefined) }
          : { requiredState: parsed.data.requiredState ?? (currentDependency.kind !== "part-instance" ? currentDependency.requiredState : undefined) }),
      };
      const merged = taskDependencySchema.safeParse(mergedPayload);
      if (!merged.success) {
        return reply.code(400).send({
          message: "Task dependency update payload is invalid.",
          issues: merged.error.flatten(),
        });
      }
      const dependency = updateTaskDependency(request.params.dependencyId, merged.data);
      return {
        item: dependency,
      };
    },
  );

  app.delete<{ Params: { dependencyId: string } }>(
    "/api/task-dependencies/:dependencyId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const dependency = removeTaskDependency(request.params.dependencyId);
      if (!dependency) {
        return reply.code(404).send({
          message: "Task dependency not found.",
        });
      }

      return {
        item: dependency,
      };
    },
  );

  app.get("/api/responsible-groups", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) return;
    const paginated = paginateItems(getResponsibleGroups(), request.query);
    return { items: paginated.items, pagination: paginated.pagination };
  });

  app.post<{ Body: unknown }>("/api/responsible-groups", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) return;
    if (!requireMentorPermission(request, reply, "Only mentors can manage teams.")) return;
    const parsed = parseRouteInput(responsibleGroupSchema, request.body, reply, "Team payload is invalid.");
    if (!parsed) return reply;
    const { seasonId, projectIds, memberIds, primaryMemberIds } = parsed.data;
    const snapshot = getSnapshot();
    if (!snapshot.seasons.some((season) => season.id === seasonId) || projectIds.some((id) => !snapshot.projects.some((project) => project.id === id && project.seasonId === seasonId)) || memberIds.some((id) => !snapshot.members.some((member) => member.id === id && (member.activeSeasonIds ?? [member.seasonId]).includes(seasonId)))) {
      return reply.code(400).send({ message: "Teams must reference projects and members in the selected season." });
    }
    if (primaryMemberIds.some((id) => !memberIds.includes(id) || !snapshot.members.some((member) => member.id === id && (member.role === "student" || member.role === "lead")))) {
      return reply.code(400).send({ message: "Primary team membership must be selected members who are students or student leads." });
    }
    return reply.code(201).send({ item: createResponsibleGroup({ ...parsed.data, isArchived: false }) });
  });

  app.patch<{ Body: unknown; Params: { groupId: string } }>("/api/responsible-groups/:groupId", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) return;
    if (!requireMentorPermission(request, reply, "Only mentors can manage teams.")) return;
    const parsed = parseRouteInput(responsibleGroupPatchSchema, request.body, reply, "Team update payload is invalid.");
    if (!parsed) return reply;
    const current = getResponsibleGroups().find((group) => group.id === request.params.groupId);
    if (!current) return reply.code(404).send({ message: "Team not found." });
    const next = { ...current, ...parsed.data };
    const snapshot = getSnapshot();
    if (!snapshot.seasons.some((season) => season.id === next.seasonId) || next.projectIds.some((id) => !snapshot.projects.some((project) => project.id === id && project.seasonId === next.seasonId)) || next.memberIds.some((id) => !snapshot.members.some((member) => member.id === id && (member.activeSeasonIds ?? [member.seasonId]).includes(next.seasonId)))) {
      return reply.code(400).send({ message: "Teams must reference projects and members in the selected season." });
    }
    if (next.primaryMemberIds.some((id) => !next.memberIds.includes(id) || !snapshot.members.some((member) => member.id === id && (member.role === "student" || member.role === "lead")))) {
      return reply.code(400).send({ message: "Primary team membership must be selected members who are students or student leads." });
    }
    if (snapshot.tasks.some((task) => task.responsibleGroupId === current.id && (snapshot.projects.find((project) => project.id === task.projectId)?.seasonId !== next.seasonId || (next.projectIds.length > 0 && !next.projectIds.includes(task.projectId))))) {
      return reply.code(409).send({ message: "Team changes cannot invalidate existing task ownership." });
    }
    return { item: updateResponsibleGroup(current.id, parsed.data, buildTaskAuditContext(request)) };
  });

  app.delete<{ Params: { groupId: string } }>("/api/responsible-groups/:groupId", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) return;
    if (!requireMentorPermission(request, reply, "Only mentors can manage teams.")) return;
    const removed = removeResponsibleGroup(request.params.groupId, buildTaskAuditContext(request));
    if (!removed) return reply.code(404).send({ message: "Team not found." });
    return { item: removed };
  });

  app.get("/api/members", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getMembers(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.patch<{ Body: unknown }>(
    "/api/users/me/profile",
    { config: { snapshotMutation: true } },
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) return;
      const session = requireSession(request, reply);
      if (!session) return;

      const parsed = parseRouteInput(profilePatchSchema, request.body, reply, "Profile payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const member = getMembers().find(
        (candidate) => candidate.email.trim().toLowerCase() === session.email.trim().toLowerCase(),
      );
      if (!member) {
        return reply.code(404).send({ message: "No roster profile is linked to this account." });
      }

      const updated = updateMember(member.id, parsed.data, buildTaskAuditContext(request));
      if (!updated) return reply.code(404).send({ message: "Profile not found." });
      return { item: updated };
    },
  );

  app.post<{ Body: unknown }>("/api/members", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can invite people.")) {
      return;
    }

    const parsed = parseRouteInput(memberSchema, request.body, reply, "Roster payload is invalid.");
    if (!parsed) {
      return reply;
    }
    if (
      (parsed.data.role === "mentor" || parsed.data.role === "admin" || parsed.data.elevated) &&
      !requireAdminPermission(
        request,
        reply,
        "Only admins can create elevated roster accounts.",
      )
    ) {
      return;
    }
    if (
      parsed.data.seasonId !== undefined &&
      !getSeasons().some((season) => season.id === parsed.data.seasonId)
    ) {
      return reply.code(400).send({
        message: "Roster payload references an unknown season.",
      });
    }
    if (
      parsed.data.activeSeasonIds !== undefined &&
      parsed.data.activeSeasonIds.some(
        (seasonId) => !getSeasons().some((season) => season.id === seasonId),
      )
    ) {
      return reply.code(400).send({
        message: "Roster payload references an unknown active season.",
      });
    }

    const member = createMember(parsed.data);
    return reply.code(201).send({
      item: member,
    });
  });

  app.patch<{ Body: unknown; Params: { memberId: string } }>(
    "/api/members/:memberId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can edit people.")) {
        return;
      }

      const parsed = parseRouteInput(memberPatchSchema, request.body, reply, "Roster update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const changesProtectedIdentity =
        parsed.data.role !== undefined ||
        parsed.data.email !== undefined ||
        parsed.data.elevated !== undefined;
      if (
        changesProtectedIdentity &&
        !requireAdminPermission(
          request,
          reply,
          "Only admins can change member roles or sign-in identities.",
        )
      ) {
        return;
      }

      const currentMember = getMembers().find(
        (member) => member.id === request.params.memberId,
      );
      if (!currentMember) {
        return reply.code(404).send({ message: "Member not found." });
      }
      if (
        currentMember.role === "admin" &&
        parsed.data.role !== undefined &&
        parsed.data.role !== "admin" &&
        getMembers().filter((member) => member.role === "admin").length === 1
      ) {
        return reply.code(409).send({
          message: "The final administrator cannot be demoted.",
        });
      }
      if (
        parsed.data.seasonId !== undefined &&
        !getSeasons().some((season) => season.id === parsed.data.seasonId)
      ) {
        return reply.code(400).send({
          message: "Roster update payload references an unknown season.",
        });
      }
      if (
        parsed.data.activeSeasonIds !== undefined &&
        parsed.data.activeSeasonIds.some(
          (seasonId) => !getSeasons().some((season) => season.id === seasonId),
        )
      ) {
        return reply.code(400).send({
          message: "Roster update payload references an unknown active season.",
        });
      }
      const nextActiveSeasons = parsed.data.activeSeasonIds ?? currentMember.activeSeasonIds ?? [parsed.data.seasonId ?? currentMember.seasonId];
      const nextSeasonId = parsed.data.seasonId ?? currentMember.seasonId;
      if (getResponsibleGroups().some((group) => group.memberIds.includes(currentMember.id) && group.seasonId !== nextSeasonId && !nextActiveSeasons.includes(group.seasonId))) {
        return reply.code(409).send({ message: "Remove the member from teams in other seasons before changing their season membership." });
      }

      const member = updateMember(
        request.params.memberId,
        parsed.data,
        buildTaskAuditContext(request),
      );
      if (!member) {
        return reply.code(404).send({
          message: "Member not found.",
        });
      }

      return {
        item: member,
      };
    },
  );

  app.delete<{ Params: { memberId: string } }>(
    "/api/members/:memberId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireAdminPermission(request, reply, "Only admins can delete people.")) {
        return;
      }

      const currentMember = getMembers().find(
        (member) => member.id === request.params.memberId,
      );
      if (
        currentMember?.role === "admin" &&
        getMembers().filter((member) => member.role === "admin").length === 1
      ) {
        return reply.code(409).send({
          message: "The final administrator cannot be deleted.",
        });
      }

      const member = removeMember(request.params.memberId, buildTaskAuditContext(request));
      if (!member) {
        return reply.code(404).send({
          message: "Member not found.",
        });
      }

      return {
        item: member,
      };
    },
  );

  app.post<{ Body: unknown }>("/api/subsystems", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(subsystemSchema, request.body, reply, "Subsystem payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const projectId = parsed.data.projectId ?? getDefaultProjectId();
    if (!projectId || !findProject(projectId)) {
      return reply.code(400).send({
        message: "The selected project does not exist.",
      });
    }

    const validationError = validateSubsystemPeople({
      ...parsed.data,
      projectId,
    });
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    if (parsed.data.parentSubsystemId) {
      const parentSubsystem = findSubsystem(parsed.data.parentSubsystemId);
      if (!parentSubsystem) {
        return reply.code(400).send({
          message: "The selected parent subsystem does not exist.",
        });
      }
      if (parentSubsystem.projectId !== projectId) {
        return reply.code(400).send({
          message: "The selected parent subsystem does not belong to the selected project.",
        });
      }
    }

    const subsystem = createSubsystem({
      ...parsed.data,
      projectId,
      parentSubsystemId: parsed.data.parentSubsystemId ?? null,
      mentorIds: parsed.data.mentorIds ?? [],
      responsibleEngineerId: parsed.data.responsibleEngineerId ?? null,
    }, buildTaskAuditContext(request));

    return reply.code(201).send({
      item: subsystem,
    });
  });

  app.patch<{ Body: unknown; Params: { subsystemId: string } }>(
    "/api/subsystems/:subsystemId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(subsystemPatchSchema, request.body, reply, "Subsystem update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentSubsystem = findSubsystem(request.params.subsystemId);
      if (!currentSubsystem) {
        return reply.code(404).send({
          message: "Subsystem not found.",
        });
      }
      const nextProjectId = parsed.data.projectId ?? currentSubsystem.projectId;
      const nextParentSubsystemId =
        parsed.data.parentSubsystemId === undefined
          ? currentSubsystem.parentSubsystemId
          : parsed.data.parentSubsystemId;
      const nextResponsibleEngineerId =
        parsed.data.responsibleEngineerId === undefined
          ? currentSubsystem.responsibleEngineerId
          : parsed.data.responsibleEngineerId;
      const nextMentorIds = parsed.data.mentorIds ?? currentSubsystem.mentorIds;
      if (!findProject(nextProjectId)) {
        return reply.code(400).send({
          message: "The selected project does not exist.",
        });
      }

      if (currentSubsystem.isCore && nextParentSubsystemId !== null) {
        return reply.code(400).send({
          message: "Drivetrain cannot have a parent subsystem.",
        });
      }

      const validationError = validateSubsystemPeople({
        projectId: nextProjectId,
        responsibleEngineerId: nextResponsibleEngineerId,
        mentorIds: [...nextMentorIds],
      });
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      if (nextParentSubsystemId && nextParentSubsystemId === currentSubsystem.id) {
        return reply.code(400).send({
          message: "A subsystem cannot be its own parent.",
        });
      }

      if (nextParentSubsystemId && !findSubsystem(nextParentSubsystemId)) {
        return reply.code(400).send({
          message: "The selected parent subsystem does not exist.",
        });
      }
      if (nextParentSubsystemId) {
        const parentSubsystem = findSubsystem(nextParentSubsystemId);
        if (parentSubsystem && parentSubsystem.projectId !== nextProjectId) {
          return reply.code(400).send({
            message: "The selected parent subsystem does not belong to the selected project.",
          });
        }
      }
      if (
        wouldCreateSubsystemCycle(currentSubsystem.id, nextParentSubsystemId)
      ) {
        return reply.code(400).send({
          message: "A subsystem cannot use one of its descendants as its parent.",
        });
      }

      const subsystem = updateSubsystem(request.params.subsystemId, {
        ...parsed.data,
        projectId: nextProjectId,
        mentorIds: [...nextMentorIds],
        parentSubsystemId: nextParentSubsystemId,
        responsibleEngineerId: nextResponsibleEngineerId,
      });

      return {
        item: subsystem,
      };
    },
  );

  app.delete<{ Params: { subsystemId: string } }>(
    "/api/subsystems/:subsystemId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can delete subsystems.")) {
        return;
      }

      const currentSubsystem = findSubsystem(request.params.subsystemId);
      if (!currentSubsystem) {
        return reply.code(404).send({
          message: "Subsystem not found.",
        });
      }

      if (currentSubsystem.isCore) {
        return reply.code(400).send({
          message: "Core subsystems cannot be deleted.",
        });
      }

      const subsystem = removeSubsystem(request.params.subsystemId);
      return {
        item: subsystem,
      };
    },
  );

  app.post<{ Body: unknown }>("/api/mechanisms", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(mechanismSchema, request.body, reply, "Mechanism payload is invalid.");
    if (!parsed) {
      return reply;
    }

    if (!findSubsystem(parsed.data.subsystemId)) {
      return reply.code(400).send({
        message: "The selected subsystem does not exist.",
      });
    }

    const mechanism = createMechanism(parsed.data, buildTaskAuditContext(request));
    return reply.code(201).send({
      item: mechanism,
    });
  });

  app.patch<{ Body: unknown; Params: { mechanismId: string } }>(
    "/api/mechanisms/:mechanismId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(mechanismPatchSchema, request.body, reply, "Mechanism update payload is invalid.");
      if (!parsed) {
        return reply;
      }

      const currentMechanism = findMechanism(request.params.mechanismId);
      if (!currentMechanism) {
        return reply.code(404).send({
          message: "Mechanism not found.",
        });
      }

      const nextSubsystemId = parsed.data.subsystemId ?? currentMechanism.subsystemId;
      if (!findSubsystem(nextSubsystemId)) {
        return reply.code(400).send({
          message: "The selected subsystem does not exist.",
        });
      }

      const mechanism = updateMechanism(request.params.mechanismId, parsed.data);
      return {
        item: mechanism,
      };
    },
  );

  app.delete<{ Params: { mechanismId: string } }>(
    "/api/mechanisms/:mechanismId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const mechanism = removeMechanism(request.params.mechanismId);
      if (!mechanism) {
        return reply.code(404).send({
          message: "Mechanism not found.",
        });
      }

      return {
        item: mechanism,
      };
    },
  );

  app.get("/api/part-definitions", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getPartDefinitions(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/part-definitions", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(partDefinitionSchema, request.body, reply, "Part definition payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const actorMemberId = isAuthEnabled() ? getTaskActionMember(request)?.id ?? null : null;
    const prepared = preparePartAcquisition(parsed.data, actorMemberId);
    if ("error" in prepared) {
      return reply.code(400).send({ message: prepared.error });
    }
    const result = createPartDefinitionWithAcquisition(prepared.definition, prepared.plan, {
      actorMemberId,
      requestId: readAuditRequestId(request),
    });
    return reply.code(201).send(result);
  });

  app.patch<{ Body: unknown; Params: { partDefinitionId: string } }>(
    "/api/part-definitions/:partDefinitionId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(
        partDefinitionPatchSchema, request.body, reply,
        "Part definition update payload is invalid.",
      );
      if (!parsed) {
        return reply;
      }

      const currentPartDefinition = findPartDefinition(request.params.partDefinitionId);
      if (!currentPartDefinition) {
        return reply.code(404).send({
          message: "Part definition not found.",
        });
      }

      const nextMaterialId =
        parsed.data.materialId === undefined
          ? currentPartDefinition.materialId
          : parsed.data.materialId;
      const materialError = validatePartDefinitionMaterialId(nextMaterialId);
      if (materialError) {
        return reply.code(400).send({
          message: materialError,
        });
      }

      const partDefinition = updatePartDefinition(request.params.partDefinitionId, {
        ...parsed.data,
        materialId: nextMaterialId ?? null,
        description: parsed.data.description ?? currentPartDefinition.description,
      });

      return {
        item: partDefinition,
      };
    },
  );

  app.delete<{ Params: { partDefinitionId: string } }>(
    "/api/part-definitions/:partDefinitionId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const partDefinition = removePartDefinition(request.params.partDefinitionId);
      if (!partDefinition) {
        return reply.code(404).send({
          message: "Part definition not found.",
        });
      }

      return {
        item: partDefinition,
      };
    },
  );

  app.get("/api/part-instances", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getPartInstances(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/part-instances", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(partInstanceSchema, request.body, reply, "Part instance payload is invalid.");
    if (!parsed) {
      return reply;
    }

    const validationError = validatePartInstanceLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const partInstance = createPartInstance(parsed.data);

    return reply.code(201).send({
      item: partInstance,
    });
  });

  app.patch<{ Body: unknown; Params: { partInstanceId: string } }>(
    "/api/part-instances/:partInstanceId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(
        partInstancePatchSchema, request.body, reply,
        "Part instance update payload is invalid.",
      );
      if (!parsed) {
        return reply;
      }

      const currentPartInstance = findPartInstance(request.params.partInstanceId);
      if (!currentPartInstance) {
        return reply.code(404).send({
          message: "Part instance not found.",
        });
      }

      const nextPartInstanceShape = {
        location: parsed.data.location ?? currentPartInstance.location,
        intendedSubsystemId: parsed.data.intendedSubsystemId ?? currentPartInstance.intendedSubsystemId,
        intendedMechanismId: parsed.data.intendedMechanismId ?? currentPartInstance.intendedMechanismId,
        partDefinitionId:
          parsed.data.partDefinitionId === undefined
            ? currentPartInstance.partDefinitionId
            : parsed.data.partDefinitionId,
      };

      const validationError = validatePartInstanceLinks(nextPartInstanceShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const partInstance = updatePartInstance(request.params.partInstanceId, {
        ...parsed.data,
        partDefinitionId: nextPartInstanceShape.partDefinitionId,
      });

      return {
        item: partInstance,
      };
    },
  );

  app.delete<{ Params: { partInstanceId: string } }>(
    "/api/part-instances/:partInstanceId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const partInstance = removePartInstance(request.params.partInstanceId);
      if (!partInstance) {
        return reply.code(404).send({
          message: "Part instance not found.",
        });
      }

      return {
        item: partInstance,
      };
    },
  );

  registerMeetingRoutes(app, { requireApiSessionIfEnabled, requireMentorPermission });

  app.get("/api/roster/insights", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const selection = readBootstrapSelection(request.query);
    const snapshot = buildBootstrapResponse(getSnapshot(), selection);
    const scopedMemberIds = new Set(snapshot.members.map((member) => member.id));
    const season = selection.seasonId
      ? snapshot.seasons.find((candidate) => candidate.id === selection.seasonId) ?? null
      : null;
    const seasonStart = season ? parseDateValue(season.startDate) : null;
    const seasonEnd = season ? parseDateValue(season.endDate) : null;
    const scopedAttendance = snapshot.attendanceRecords.filter((record) => {
      if (!scopedMemberIds.has(record.memberId)) {
        return false;
      }

      if (!seasonStart || !seasonEnd) {
        return true;
      }

      const attendanceDate = parseDateValue(record.date);
      if (!attendanceDate) {
        return false;
      }

      return (
        attendanceDate.getTime() >= seasonStart.getTime() &&
        attendanceDate.getTime() <= seasonEnd.getTime()
      );
    });

    return buildRosterInsights({
      attendanceRecords: scopedAttendance,
      members: snapshot.members,
      projects: snapshot.projects,
            tasks: snapshot.tasks,
    });
  });

  app.get("/api/manufacturing/processes", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) return;
    return { items: getSnapshot().manufacturingProcesses };
  });

  app.post<{ Body: unknown }>("/api/manufacturing/processes", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) return;
    if (!requireMentorPermission(request, reply, "Only mentors can configure manufacturing processes.")) return;
    const parsed = parseRouteInput(manufacturingProcessCreateSchema, request.body, reply, "Manufacturing process payload is invalid.");
    if (!parsed) return reply;
    if (getSnapshot().manufacturingProcesses.some((process) => process.code === parsed.data.code)) return reply.code(409).send({ message: "A manufacturing process with this code already exists." });
    return reply.code(201).send({ item: createManufacturingProcess(parsed.data) });
  });

  app.patch<{ Body: unknown; Params: { processId: string } }>("/api/manufacturing/processes/:processId", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) return;
    if (!requireMentorPermission(request, reply, "Only mentors can configure manufacturing processes.")) return;
    const parsed = parseRouteInput(manufacturingProcessArchiveSchema, request.body, reply, "Manufacturing process update is invalid.");
    if (!parsed) return reply;
    if (getSnapshot().tasks.some((task) => task.manufacturingDetails?.processId === request.params.processId)) {
      return reply.code(409).send({ message: "A process referenced by manufacturing Tasks cannot be archived." });
    }
    const item = archiveManufacturingProcess(request.params.processId);
    if (!item) return reply.code(404).send({ message: "Manufacturing process not found." });
    return { item };
  });

  app.get("/api/purchases", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const personId = readPersonFilter(request);
    const paginated = paginateItems(filterPurchaseItemsForPerson(personId), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/purchases", { config: { snapshotMutation: true } }, async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = parseRouteInput(purchaseItemSchema, request.body, reply, "Purchase payload is invalid.");
    if (!parsed) {
      return reply;
    }

    if (
      parsed.data.approvalStatus !== "pending" || parsed.data.approvedById !== null ||
      parsed.data.approvedAt !== null || parsed.data.orderStatus !== "not-ordered" ||
      parsed.data.purchaseOrderNumber !== null || parsed.data.finalCost !== null ||
      parsed.data.orderedAt !== null || parsed.data.deliveredAt !== null
    ) {
      return reply.code(403).send({ message: "Approval and order state must use the purchasing workflow." });
    }

    const validationError = validatePurchaseItemLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const item = createPurchaseItem(parsed.data, buildTaskAuditContext(request));
    return reply.code(201).send({
      item,
    });
  });

  app.patch<{ Body: unknown; Params: { itemId: string } }>(
    "/api/purchases/:itemId",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = parseRouteInput(
        purchaseItemPatchSchema, request.body, reply,
        "Purchase update payload is invalid.",
      );
      if (!parsed) {
        return reply;
      }

      const currentItem = getPurchaseItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({
          message: "Purchase item not found.",
        });
      }


      const policyFailure = assessGenericPatch({
        current: currentItem as unknown as Record<string, unknown>,
        patch: parsed.data as Record<string, unknown>,
        protectedFields: [
          "taskId",
          "kind",
          "approvalStatus",
          "finalCost",
          "approvedById",
          "approvedAt",
          "orderStatus",
          "purchaseOrderNumber",
          "orderedAt",
          "deliveredAt",
        ],
        isApprover: hasWorkflowApprovalPermission(request),
        isPending: currentItem.approvalStatus === "pending" && currentItem.orderStatus === "not-ordered",
        entityLabel: "Purchase item",
      });
      if (policyFailure) {
        return reply.code(policyFailure.statusCode).send({ message: policyFailure.message });
      }
      if (isNoopPatch(
        currentItem as unknown as Record<string, unknown>,
        parsed.data as Record<string, unknown>,
      )) {
        return { item: currentItem };
      }

      const nextItemShape = { ...currentItem, ...parsed.data };

      const validationError = validatePurchaseItemLinks(nextItemShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const item = updatePurchaseItem(request.params.itemId, {
        ...parsed.data,
      }, buildTaskAuditContext(request));

      return {
        item,
      };
    },
  );

  app.put<{ Body: unknown; Params: { itemId: string } }>(
    "/api/purchases/:itemId/approval",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }
      if (!requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors and admins can approve purchases.",
      )) {
        return;
      }

      const parsed = parseRouteInput(
        purchaseApprovalSchema, request.body, reply,
        "Purchase approval payload is invalid.",
      );
      if (!parsed) {
        return reply;
      }

      const currentItem = getPurchaseItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({ message: "Purchase item not found." });
      }

      if (currentItem.approvalStatus === parsed.data.approvalStatus) {
        return { item: currentItem };
      }

      const policyFailure = validatePurchaseApproval(currentItem, parsed.data.approvalStatus);
      if (policyFailure) {
        return reply.code(policyFailure.statusCode).send({ message: policyFailure.message });
      }

      const actor = getWorkflowApprovalMember(request);
      if (!actor) {
        return reply.code(403).send({ message: "A mentor or admin roster profile is required." });
      }
      const item = updatePurchaseItem(request.params.itemId, {
        approvalStatus: parsed.data.approvalStatus,
        approvedById: actor.id,
        approvedAt: new Date().toISOString(),
      }, buildTaskAuditContext(request, actor.id));

      return { item };
    },
  );

  app.post<{ Body: unknown; Params: { itemId: string } }>(
    "/api/purchases/:itemId/transition",
    { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }
      if (!requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors and admins can progress purchases.",
      )) {
        return;
      }

      const parsed = parseRouteInput(
        purchaseTransitionSchema, request.body, reply,
        "Purchase transition payload is invalid.",
      );
      if (!parsed) {
        return reply;
      }

      const currentItem = getPurchaseItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({ message: "Purchase item not found." });
      }

      if (parsed.data.orderStatus === "ordered" && currentItem.approvalStatus !== "approved") {
        return reply.code(409).send({ message: "A purchase must be approved before ordering." });
      }
      const policyFailure = validatePurchaseTransition(currentItem.orderStatus, parsed.data.orderStatus);
      if (policyFailure) {
        return reply.code(policyFailure.statusCode).send({ message: policyFailure.message });
      }

      const actor = getWorkflowApprovalMember(request);
      if (!actor) {
        return reply.code(403).send({ message: "A mentor or admin roster profile is required." });
      }
      const now = new Date().toISOString();
      const item = updatePurchaseItem(request.params.itemId, {
        orderStatus: parsed.data.orderStatus,
        finalCost: parsed.data.finalCost === undefined ? currentItem.finalCost : parsed.data.finalCost,
        orderedAt: parsed.data.orderStatus === "ordered" ? now : currentItem.orderedAt,
        deliveredAt: parsed.data.orderStatus === "delivered" ? now : currentItem.deliveredAt,
      }, buildTaskAuditContext(request, actor.id));

      return { item };
    },
  );

  app.delete<{ Params: { itemId: string } }>(
    "/api/purchases/:itemId", { config: { snapshotMutation: true } }, async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors and admins can delete purchases.",
      )) {
        return;
      }

      const item = removePurchaseItem(
        request.params.itemId,
        buildTaskAuditContext(request),
      );
      if (!item) {
        return reply.code(404).send({
          message: "Purchase item not found.",
        });
      }

      return {
        item,
      };
    },
  );

  app.get("/api/metrics", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return buildMetrics(getSnapshot());
  });

  await registerCadRoutes(app, requireApiSessionIfEnabled);
  await registerOnshapeRoutes(app, requireApiSessionIfEnabled, requireMentorPermission);
}
