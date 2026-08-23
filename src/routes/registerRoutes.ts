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
  createMilestone,
  createManufacturingItem,
  createMaterial,
  createMember,
  createMechanism,
  createReport,
  createReportFinding,
  createQaReport,
  createQaRequest,
  createPartDefinition,
  createPartInstance,
  createProject,
  createSeason,
  createSubsystem,
  createPurchaseItem,
  createRisk,
  createTask,
  createTaskBlocker,
  createTaskDependency,
  createTestResult,
  createWorkLog,
  createWorkstream,
  findDiscipline,
  getFavoriteViews,
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
  getDisciplines,
  getMembers,
  getMechanisms,
  getManufacturingItems,
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
  getSubsystems,
  getTaskTargets,
  getMilestonesForTask,
  getTasks,
  getTaskBlockers,
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
  removeManufacturingItem,
  removePartDefinition,
  removePartInstance,
  removePurchaseItem,
  removeRisk,
  removeSubsystem,
  removeTask,
  removeTaskBlocker,
  removeTaskDependency,
  removeWorkLog,
  resetInteractiveTutorialSession,
  resetTutorialBaseline,
  setFavoriteView,
  updateManufacturingItem,
  updateArtifact,
  updateMaterial,
  updateMember,
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
  updateTaskBlocker,
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
import type { Member } from "../domain/types";
import { isTaskWaitingOnDependencies } from "../domain/taskDependencyState";
import {
  filterManufacturingItemsForPerson,
  filterPurchaseItemsForPerson,
  filterTasksForPerson,
  filterWorkLogsForPerson,
  getDefaultProjectId,
  normalizeTaskTargets,
  paginateItems,
  readPersonFilter,
  resolveProjectId,
  resolveWorkstreamId,
  uniqueIds,
  validateArtifactLinks,
  validateManufacturingItemLinks,
  validatePartDefinitionMaterialId,
  validatePartInstanceLinks,
  validatePurchaseItemLinks,
  validateQaReportLinks,
  validateQaRequestLinks,
  validateRiskLinks,
  validateMilestoneProjectLinks,
  validateSubsystemPeople,
  validateTaskBlockerLinks,
  validateTaskLinks,
  validateTestResultLinks,
  validateWorkLogLinks,
  withManufacturingQaReviewCounts,
  wouldCreateSubsystemCycle,
} from "./routeHelpers";
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
  favoriteNavigationViewIdSchema,
  favoriteViewToggleSchema,
  milestonePatchSchema,
  milestoneSchema,
  manufacturingItemPatchSchema,
  manufacturingItemSchema,
  manufacturingReviewSchema,
  manufacturingTransitionSchema,
  materialPatchSchema,
  materialSchema,
  mediaUploadRequestSchema,
  memberPatchSchema,
  memberSchema,
  mechanismPatchSchema,
  mechanismSchema,
  partDefinitionPatchSchema,
  partDefinitionSchema,
  partInstancePatchSchema,
  partInstanceSchema,
  projectPatchSchema,
  projectSchema,
  qaReportSchema,
  qaRequestSchema,
  reportFindingSchema,
  reportSchema,
  riskPatchSchema,
  riskSchema,
  purchaseItemPatchSchema,
  purchaseItemSchema,
  purchaseApprovalSchema,
  purchaseTransitionSchema,
  seasonSchema,
  subsystemPatchSchema,
  subsystemSchema,
  taskClaimSchema,
  taskPatchSchema,
  taskReassignSchema,
  taskSchema,
  taskBlockerPatchSchema,
  taskBlockerSchema,
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
  validateManufacturingReview,
  validateManufacturingTransition,
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
  memberIds: string[] | undefined,
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

  const members = selectedBootstrap.members.map((member, memberIndex) => ({
    id: rewriteDemoMemberId(member.id, memberIdsByOriginalId),
    name: `Demo Member ${memberIndex + 1}`,
    seasonId: member.seasonId,
    activeSeasonIds: member.activeSeasonIds,
    ...(member.disciplineId !== undefined ? { disciplineId: member.disciplineId } : null),
  }));

  return {
    ...selectedBootstrap,
    members,
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
      createdByMemberId: rewriteDemoMemberId(report.createdByMemberId, memberIdsByOriginalId),
      participantIds:
        report.participantIds === undefined
          ? report.participantIds
          : rewriteDemoMemberIds(report.participantIds, memberIdsByOriginalId),
    })),
    tasks: selectedBootstrap.tasks.map((task) => ({
      ...task,
      ownerId: rewriteDemoMemberId(task.ownerId, memberIdsByOriginalId),
      assigneeIds: rewriteDemoMemberIds(task.assigneeIds, memberIdsByOriginalId),
      mentorId: rewriteDemoMemberId(task.mentorId, memberIdsByOriginalId),
    })),
    taskBlockers: selectedBootstrap.taskBlockers.map((blocker) => ({
      ...blocker,
      createdByMemberId: rewriteDemoMemberId(
        blocker.createdByMemberId,
        memberIdsByOriginalId,
      ),
    })),
    workLogs: selectedBootstrap.workLogs.map((workLog) => ({
      ...workLog,
      participantIds: rewriteDemoMemberIds(workLog.participantIds, memberIdsByOriginalId),
    })),
    attendanceRecords: selectedBootstrap.attendanceRecords.map((record) => ({
      ...record,
      memberId: rewriteDemoMemberId(record.memberId, memberIdsByOriginalId),
    })),
    manufacturingItems: selectedBootstrap.manufacturingItems.map((item) => ({
      ...item,
      requestedById: rewriteDemoMemberId(item.requestedById, memberIdsByOriginalId),
    })),
    purchaseItems: selectedBootstrap.purchaseItems.map((item) => ({
      ...item,
      requestedById: rewriteDemoMemberId(item.requestedById, memberIdsByOriginalId),
    })),
    qaReports: selectedBootstrap.qaReports.map((report) => ({
      ...report,
      participantIds: rewriteDemoMemberIds(report.participantIds, memberIdsByOriginalId),
    })),
    qaRequests: selectedBootstrap.qaRequests.map((request) => ({
      ...request,
      mentorId: rewriteDemoMemberId(request.mentorId, memberIdsByOriginalId),
      requestedById: rewriteDemoMemberId(request.requestedById, memberIdsByOriginalId),
    })),
    qaReviews: selectedBootstrap.qaReviews.map((review) => ({
      ...review,
      participantIds: rewriteDemoMemberIds(review.participantIds, memberIdsByOriginalId),
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

  const canManageTaskAssignment = (request: Parameters<typeof requireSession>[0]) =>
    hasMentorPermission(request);

  const buildTaskActionItem = (taskId: string) => {
    const task = getTasks().find((candidate) => candidate.id === taskId);
    return task
      ? {
          ...task,
          isBlocked: (task.blockers ?? []).length > 0,
          isWaitingOnDependency: isTaskWaitingOnDependencies(task, getSnapshot()),
        }
      : null;
  };

  const isTaskStartReady = (task: ReturnType<typeof getTasks>[number]) => {
    return (
      task.status !== "complete" &&
      task.blockers.length === 0 &&
      !isTaskWaitingOnDependencies(task, getSnapshot())
    );
  };

  const isValidTaskDependencyTarget = (
    kind: "task" | "milestone" | "part_instance",
    refId: string,
  ) => {
    if (kind === "task") {
      return getTasks().some((task) => task.id === refId);
    }

    if (kind === "milestone") {
      return getMilestones().some((milestone) => milestone.id === refId);
    }

    if (kind === "part_instance") {
      return getPartInstances().some((partInstance) => partInstance.id === refId);
    }

    return false;
  };

  const getNavigationPreferenceUserKey = (
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
    const isPublicDemoBootstrap = isAuthEnabled() && (session?.isPublicDemo || !session);
    const userKey = isPublicDemoBootstrap
      ? "public-demo"
      : getNavigationPreferenceUserKey(request);
    const selectedBootstrap = buildBootstrapResponse(snapshot, selection, {
      sanitizeEscalations: isPublicDemoBootstrap,
    });
    const responseBootstrap = isPublicDemoBootstrap
      ? sanitizePublicDemoBootstrap(selectedBootstrap)
      : selectedBootstrap;
    const bootstrapPayload = bootstrapPayloadSchema.safeParse({
      ...responseBootstrap,
      favoriteViews: getFavoriteViews(userKey),
    });

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

    const parsed = auditExportQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Audit export query is invalid.",
        issues: parsed.error.flatten(),
      });
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

  app.patch<{ Body: unknown; Params: { viewId: string } }>(
    "/api/navigation/favorites/:viewId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsedViewId = favoriteNavigationViewIdSchema.safeParse(request.params.viewId);
      const parsedBody = favoriteViewToggleSchema.safeParse(request.body);
      if (!parsedViewId.success || !parsedBody.success) {
        return reply.code(400).send({
          message: "Favorite view payload is invalid.",
          issues: {
            params: parsedViewId.success ? undefined : parsedViewId.error.flatten(),
            body: parsedBody.success ? undefined : parsedBody.error.flatten(),
          },
        });
      }

      return {
        favoriteViews: setFavoriteView(
          getNavigationPreferenceUserKey(request),
          parsedViewId.data,
          parsedBody.data.isFavorite,
        ),
      };
    },
  );

  app.post("/api/tutorial/session/start", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can start global tutorial sessions.")) {
      return;
    }

    const userKey = getNavigationPreferenceUserKey(request);
    startInteractiveTutorialSession(isAuthEnabled() ? userKey : undefined);
    return {
      ok: true,
      mode: "session" as const,
      tutorial: isAuthEnabled()
        ? resetTutorialBaseline(userKey)
        : getTutorialBaselineState(),
    };
  });

  app.post<{ Body: unknown }>("/api/tutorial/session/reset", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can reset global tutorial sessions.")) {
      return;
    }

    const parsed = tutorialSessionResetSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Tutorial reset payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (parsed.data.mode === "baseline") {
      const tutorial = resetTutorialBaseline(
        isAuthEnabled() ? getNavigationPreferenceUserKey(request) : undefined,
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
      isAuthEnabled() ? getNavigationPreferenceUserKey(request) : undefined,
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

  app.post<{ Body: unknown }>("/api/seasons", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }
    if (!requireMentorPermission(request, reply, "Only mentors can create seasons.")) {
      return;
    }

    const parsed = seasonSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Season payload is invalid.",
        issues: parsed.error.flatten(),
      });
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

  app.post<{ Body: unknown }>("/api/projects", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }
    if (!requireMentorPermission(request, reply, "Only mentors can create projects.")) {
      return;
    }

    const parsed = projectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Project payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (!getSeasons().some((season) => season.id === parsed.data.seasonId)) {
      return reply.code(400).send({
        message: "The selected season does not exist.",
      });
    }

    const project = createProject(parsed.data);

    return reply.code(201).send({
      item: project,
    });
  });

  app.patch<{ Body: unknown; Params: { projectId: string } }>(
    "/api/projects/:projectId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }
      if (!requireMentorPermission(request, reply, "Only mentors can edit projects.")) {
        return;
      }

      const parsed = projectPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Project update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      if (!findProject(request.params.projectId)) {
        return reply.code(404).send({
          message: "Project not found.",
        });
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

  app.post<{ Body: unknown }>("/api/workstreams", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }
    if (!requireMentorPermission(request, reply, "Only mentors can create workstreams.")) {
      return;
    }

    const parsed = workstreamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Workstream payload is invalid.",
        issues: parsed.error.flatten(),
      });
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
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }
      if (!requireMentorPermission(request, reply, "Only mentors can edit workstreams.")) {
        return;
      }

      const parsed = workstreamPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Workstream update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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

  app.post<{ Body: unknown }>("/api/reports", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Report payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (
      parsed.data.reportType === "QA" &&
      parsed.data.mentorApproved === true &&
      !requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors or admins can approve QA.",
      )
    ) {
      return;
    }

    const validationError =
      parsed.data.reportType === "QA"
        ? parsed.data.taskId
          ? validateQaReportLinks({
              taskId: parsed.data.taskId,
              participantIds: parsed.data.participantIds ?? [],
            })
          : "The selected task does not exist."
        : parsed.data.milestoneId
          ? validateTestResultLinks({ milestoneId: parsed.data.milestoneId })
          : "The selected milestone does not exist.";
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
    const paginated = paginateItems(bootstrap.reportFindings, request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/report-findings", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = reportFindingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Report finding payload is invalid.",
        issues: parsed.error.flatten(),
      });
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

  app.post<{ Body: unknown }>("/api/qa-reports", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = qaReportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "QA report payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (
      parsed.data.mentorApproved &&
      !requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors or admins can approve QA.",
      )
    ) {
      return;
    }

    const validationError = validateQaReportLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const report = createQaReport({
      ...parsed.data,
      participantIds: Array.from(new Set(parsed.data.participantIds)),
      notes: parsed.data.notes.trim(),
    });

    return reply.code(201).send({
      item: report,
    });
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

  app.post<{ Body: unknown }>("/api/qa-requests", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = qaRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "QA request payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validateQaRequestLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const requestItem = createQaRequest({
      ...parsed.data,
      subject: parsed.data.subject.trim(),
      requestedById: parsed.data.requestedById ?? null,
    });

    return reply.code(201).send({
      item: requestItem,
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

  app.post<{ Body: unknown }>("/api/test-results", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = testResultSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Test result payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validateTestResultLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const testResult = createTestResult({
      ...parsed.data,
      findings: Array.from(new Set(parsed.data.findings.map((finding) => finding.trim()))).filter(
        (finding) => finding.length > 0,
      ),
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

  app.post<{ Body: unknown }>("/api/risks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = riskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Risk payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validateRiskLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const risk = createRisk({
      ...parsed.data,
      title: parsed.data.title.trim(),
      detail: parsed.data.detail.trim(),
      sourceId: parsed.data.sourceId.trim(),
      attachmentId: parsed.data.attachmentId.trim(),
      mitigationTaskId: parsed.data.mitigationTaskId ?? null,
    });

    return reply.code(201).send({
      item: risk,
    });
  });

  app.patch<{ Body: unknown; Params: { riskId: string } }>(
    "/api/risks/:riskId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = riskPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Risk update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentRisk = findRisk(request.params.riskId);
      if (!currentRisk) {
        return reply.code(404).send({
          message: "Risk not found.",
        });
      }

      const nextRiskShape = {
        sourceType: parsed.data.sourceType ?? currentRisk.sourceType,
        sourceId: parsed.data.sourceId ?? currentRisk.sourceId,
        attachmentType: parsed.data.attachmentType ?? currentRisk.attachmentType,
        attachmentId: parsed.data.attachmentId ?? currentRisk.attachmentId,
        mitigationTaskId:
          parsed.data.mitigationTaskId === undefined
            ? currentRisk.mitigationTaskId
            : parsed.data.mitigationTaskId,
      };

      const validationError = validateRiskLinks(nextRiskShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const risk = updateRisk(request.params.riskId, {
        ...parsed.data,
        title: parsed.data.title === undefined ? undefined : parsed.data.title.trim(),
        detail: parsed.data.detail === undefined ? undefined : parsed.data.detail.trim(),
        sourceId: parsed.data.sourceId === undefined ? undefined : parsed.data.sourceId.trim(),
        attachmentId:
          parsed.data.attachmentId === undefined
            ? undefined
            : parsed.data.attachmentId.trim(),
        mitigationTaskId:
          parsed.data.mitigationTaskId === undefined
            ? undefined
            : parsed.data.mitigationTaskId,
      });

      return {
        item: risk,
      };
    },
  );

  app.delete<{ Params: { riskId: string } }>(
    "/api/risks/:riskId",
    async (request, reply) => {
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

  app.post<{ Body: unknown }>("/api/work-logs", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = workLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Work log payload is invalid.",
        issues: parsed.error.flatten(),
      });
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
    async (request, reply) => {
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

      const parsed = workLogPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Work log update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
        notes:
          parsed.data.notes === undefined
            ? undefined
            : parsed.data.notes.trim(),
        participantIds:
          parsed.data.participantIds === undefined
            ? undefined
            : Array.from(new Set(parsed.data.participantIds)),
      }, buildTaskAuditContext(request));

      return {
        item: workLog,
      };
    },
  );

  app.delete<{ Params: { workLogId: string } }>(
    "/api/work-logs/:workLogId",
    async (request, reply) => {
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
      workstreamId: task.workstreamId,
      workstreamIds: task.workstreamIds,
      title: task.title,
      summary: task.summary,
      subsystemId: task.subsystemId,
      subsystemIds: task.subsystemIds,
      disciplineId: task.disciplineId,
      mechanismId: task.mechanismId,
      mechanismIds: task.mechanismIds,
      partInstanceId: task.partInstanceId,
      partInstanceIds: task.partInstanceIds,
      artifactId: task.artifactId,
      artifactIds: task.artifactIds,
      targetMilestoneId: task.targetMilestoneId,
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
      dependencyIds: task.dependencyIds,
      gate: evaluateTaskCompletion(task, snapshot),
      blockers: task.blockers,
      isBlocked: (task.blockers ?? []).length > 0,
      isWaitingOnDependency: isTaskWaitingOnDependencies(task, snapshot),
      linkedManufacturingIds: task.linkedManufacturingIds,
      linkedPurchaseIds: task.linkedPurchaseIds,
      requiresDocumentation: task.requiresDocumentation,
      documentationLinked: task.documentationLinked,
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

  app.post<{ Body: unknown }>("/api/milestones", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = milestoneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Milestone payload is invalid.",
        issues: parsed.error.flatten(),
      });
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
      endDateTime: parsed.data.endDateTime ?? null,
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
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = milestonePatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Milestone update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
        endDateTime:
          parsed.data.endDateTime === undefined
            ? currentMilestone.endDateTime
            : parsed.data.endDateTime,
        description:
          parsed.data.description === undefined
            ? currentMilestone.description
            : parsed.data.description,
        projectIds: nextProjectIds,
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
    "/api/milestones/:milestoneId",
    async (request, reply) => {
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

  app.post<{ Body: unknown }>("/api/materials", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = materialSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Material payload is invalid.",
        issues: parsed.error.flatten(),
      });
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
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = materialPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Material update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
    "/api/materials/:materialId",
    async (request, reply) => {
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

    const parsed = mediaUploadRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Media upload payload is invalid.",
        issues: parsed.error.flatten(),
      });
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

    const parsed = mediaUploadRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Media upload payload is invalid.",
        issues: parsed.error.flatten(),
      });
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

  app.post<{ Body: unknown }>("/api/artifacts", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = artifactSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Artifact payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validateArtifactLinks({
      projectId: parsed.data.projectId,
      workstreamId: parsed.data.workstreamId ?? null,
    });
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const artifact = createArtifact({
      ...parsed.data,
      workstreamId: parsed.data.workstreamId ?? null,
      summary: parsed.data.summary ?? "",
      status: parsed.data.status ?? "draft",
      link: parsed.data.link ?? "",
      isArchived: parsed.data.isArchived ?? false,
      updatedAt: parsed.data.updatedAt ?? new Date().toISOString(),
    });

    return reply.code(201).send({
      item: artifact,
    });
  });

  app.patch<{ Body: unknown; Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = artifactPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Artifact update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentArtifact = findArtifact(request.params.artifactId);
      if (!currentArtifact) {
        return reply.code(404).send({
          message: "Artifact not found.",
        });
      }

      const nextProjectId = parsed.data.projectId ?? currentArtifact.projectId;
      const nextWorkstreamId =
        parsed.data.workstreamId === undefined
          ? currentArtifact.workstreamId
          : parsed.data.workstreamId;
      const validationError = validateArtifactLinks({
        projectId: nextProjectId,
        workstreamId: nextWorkstreamId,
      });
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const artifact = updateArtifact(request.params.artifactId, {
        ...parsed.data,
        projectId: nextProjectId,
        workstreamId: nextWorkstreamId ?? null,
        updatedAt: parsed.data.updatedAt ?? new Date().toISOString(),
      });

      return {
        item: artifact,
      };
    },
  );

  app.delete<{ Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId",
    async (request, reply) => {
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

  app.post<{ Body: unknown }>("/api/tasks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can create tasks.")) {
      return;
    }

    const parsed = taskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Task payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const targetIds = normalizeTaskTargets(parsed.data);
    const projectId = resolveProjectId({
      projectId: parsed.data.projectId,
      subsystemId: targetIds.subsystemId,
    });
    if (!projectId) {
      return reply.code(400).send({
        message: "Task payload references an unknown project.",
      });
    }

    const defaultWorkstreamId = resolveWorkstreamId({
      projectId,
      requestedWorkstreamId: parsed.data.workstreamId,
      subsystemId: targetIds.subsystemId,
    });
    const workstreamIds =
      targetIds.workstreamIds.length > 0
        ? targetIds.workstreamIds
        : uniqueIds([defaultWorkstreamId]);
    const taskInput = {
      ...parsed.data,
      projectId,
      ...targetIds,
      workstreamId: workstreamIds[0] ?? null,
      workstreamIds,
      assigneeIds: uniqueIds(parsed.data.assigneeIds ?? []),
      startDate: parsed.data.startDate ?? parsed.data.dueDate,
      requiresDocumentation: parsed.data.requiresDocumentation ?? false,
      documentationLinked: parsed.data.documentationLinked ?? false,
    };

    const taskValidationError = validateTaskLinks(taskInput);
    if (taskValidationError) {
      return reply.code(400).send({
        message: taskValidationError,
      });
    }

    const createdTask = createTask(taskInput);
    return reply.code(201).send({
      item: {
        ...createdTask,
        isBlocked: (createdTask.blockers ?? []).length > 0,
        isWaitingOnDependency: isTaskWaitingOnDependencies(createdTask, getSnapshot()),
      },
    });
  });

  app.post<{ Body: unknown; Params: { taskId: string } }>(
    "/api/tasks/:taskId/claim",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = taskClaimSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Task claim payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
    "/api/tasks/:taskId/release",
    async (request, reply) => {
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

      const updatedTask = updateTask(currentTask.id, {
        ownerId: null,
        assigneeIds: (currentTask.assigneeIds ?? []).filter(
          (assigneeId) => assigneeId !== currentTask.ownerId,
        ),
      }, buildTaskAuditContext(request, member?.id ?? null));

      return {
        item: updatedTask ? buildTaskActionItem(updatedTask.id) : updatedTask,
      };
    },
  );

  app.post<{ Body: unknown; Params: { taskId: string } }>(
    "/api/tasks/:taskId/reassign",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can reassign tasks.")) {
        return;
      }

      const parsed = taskReassignSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Task reassign payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can edit tasks.")) {
        return;
      }

      const parsed = taskPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Task update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
        subsystemId: targetIds.subsystemId,
      }) ?? currentTask.projectId;
      const workstreamWasProvided =
        parsed.data.workstreamId !== undefined || parsed.data.workstreamIds !== undefined;
      const subsystemWasProvided =
        parsed.data.subsystemId !== undefined || parsed.data.subsystemIds !== undefined;
      const defaultWorkstreamId =
        !workstreamWasProvided && subsystemWasProvided
          ? resolveWorkstreamId({
              projectId: nextProjectId,
              subsystemId: targetIds.subsystemId,
            })
          : targetIds.workstreamId;
      const workstreamIds =
        workstreamWasProvided || !subsystemWasProvided
          ? targetIds.workstreamIds
          : uniqueIds([defaultWorkstreamId]);
      const nextTaskShape = {
        projectId: nextProjectId,
        ...targetIds,
        workstreamId: workstreamIds[0] ?? null,
        workstreamIds,
        assigneeIds:
          parsed.data.assigneeIds === undefined
            ? currentTask.assigneeIds ?? []
            : uniqueIds(parsed.data.assigneeIds),
        disciplineId: parsed.data.disciplineId ?? currentTask.disciplineId,
        targetMilestoneId:
          parsed.data.targetMilestoneId === undefined
            ? currentTask.targetMilestoneId
            : parsed.data.targetMilestoneId,
      };

      const taskValidationError = validateTaskLinks(nextTaskShape);
      if (taskValidationError) {
        return reply.code(400).send({
          message: taskValidationError,
        });
      }

      const updatedTask = updateTask(request.params.taskId, {
        ...parsed.data,
        projectId: nextTaskShape.projectId,
        workstreamId: nextTaskShape.workstreamId,
        workstreamIds: nextTaskShape.workstreamIds,
        subsystemId: nextTaskShape.subsystemId,
        subsystemIds: nextTaskShape.subsystemIds,
        mechanismId: nextTaskShape.mechanismId,
        mechanismIds: nextTaskShape.mechanismIds,
        partInstanceId: nextTaskShape.partInstanceId,
        partInstanceIds: nextTaskShape.partInstanceIds,
        artifactId: nextTaskShape.artifactId,
        artifactIds: nextTaskShape.artifactIds,
      }, buildTaskAuditContext(request));
      return {
        item: updatedTask
          ? {
              ...updatedTask,
              isBlocked: (updatedTask.blockers ?? []).length > 0,
              isWaitingOnDependency: isTaskWaitingOnDependencies(updatedTask, getSnapshot()),
            }
          : updatedTask,
      };
    },
  );

  app.delete<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId",
    async (request, reply) => {
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
          isBlocked: (task.blockers ?? []).length > 0,
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

  app.post<{ Body: unknown }>("/api/task-dependencies", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = taskDependencySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Task dependency payload is invalid.",
        issues: parsed.error.flatten(),
      });
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
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = taskDependencyPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Task dependency update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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

      const dependency = updateTaskDependency(request.params.dependencyId, {
        ...parsed.data,
        taskId: nextTaskId,
        kind: nextKind,
        refId: nextRefId,
      });
      return {
        item: dependency,
      };
    },
  );

  app.delete<{ Params: { dependencyId: string } }>(
    "/api/task-dependencies/:dependencyId",
    async (request, reply) => {
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

  app.get("/api/task-blockers", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const bootstrap = buildBootstrapResponse(
      getSnapshot(),
      readBootstrapSelection(request.query),
    );
    const paginated = paginateItems(bootstrap.taskBlockers, request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/task-blockers", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = taskBlockerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Task blocker payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validateTaskBlockerLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const blocker = createTaskBlocker(parsed.data);
    return reply.code(201).send({
      item: blocker,
    });
  });

  app.patch<{ Body: unknown; Params: { blockerId: string } }>(
    "/api/task-blockers/:blockerId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = taskBlockerPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Task blocker update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentBlocker = getTaskBlockers().find(
        (blocker) => blocker.id === request.params.blockerId,
      );
      if (!currentBlocker) {
        return reply.code(404).send({
          message: "Task blocker not found.",
        });
      }

      const nextBlockedTaskId = parsed.data.blockedTaskId ?? currentBlocker.blockedTaskId;
      const validationError = validateTaskBlockerLinks({
        blockedTaskId: nextBlockedTaskId,
        blockerType: parsed.data.blockerType ?? currentBlocker.blockerType,
        blockerId:
          parsed.data.blockerId === undefined
            ? currentBlocker.blockerId
            : parsed.data.blockerId,
      });
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const blocker = updateTaskBlocker(request.params.blockerId, parsed.data);
      return {
        item: blocker,
      };
    },
  );

  app.delete<{ Params: { blockerId: string } }>(
    "/api/task-blockers/:blockerId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const blocker = removeTaskBlocker(request.params.blockerId);
      if (!blocker) {
        return reply.code(404).send({
          message: "Task blocker not found.",
        });
      }

      return {
        item: blocker,
      };
    },
  );

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

  app.post<{ Body: unknown }>("/api/members", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    if (!requireMentorPermission(request, reply, "Only mentors can invite people.")) {
      return;
    }

    const parsed = memberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Roster payload is invalid.",
        issues: parsed.error.flatten(),
      });
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

    if (
      parsed.data.disciplineId !== undefined &&
      parsed.data.disciplineId !== null &&
      !findDiscipline(parsed.data.disciplineId)
    ) {
      return reply.code(400).send({
        message: "Roster payload references an unknown discipline.",
      });
    }

    const member = createMember(parsed.data);
    return reply.code(201).send({
      item: member,
    });
  });

  app.patch<{ Body: unknown; Params: { memberId: string } }>(
    "/api/members/:memberId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireMentorPermission(request, reply, "Only mentors can edit people.")) {
        return;
      }

      const parsed = memberPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Roster update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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

      if (
        parsed.data.disciplineId !== undefined &&
        parsed.data.disciplineId !== null &&
        !findDiscipline(parsed.data.disciplineId)
      ) {
        return reply.code(400).send({
          message: "Roster update payload references an unknown discipline.",
        });
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
    "/api/members/:memberId",
    async (request, reply) => {
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

      const member = removeMember(request.params.memberId);
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

  app.post<{ Body: unknown }>("/api/subsystems", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = subsystemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Subsystem payload is invalid.",
        issues: parsed.error.flatten(),
      });
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
      risks: parsed.data.risks ?? [],
      responsibleEngineerId: parsed.data.responsibleEngineerId ?? null,
    });

    return reply.code(201).send({
      item: subsystem,
    });
  });

  app.patch<{ Body: unknown; Params: { subsystemId: string } }>(
    "/api/subsystems/:subsystemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = subsystemPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Subsystem update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
        mentorIds: nextMentorIds,
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
        mentorIds: nextMentorIds,
        risks: parsed.data.risks ?? currentSubsystem.risks,
        parentSubsystemId: nextParentSubsystemId,
        responsibleEngineerId: nextResponsibleEngineerId,
      });

      return {
        item: subsystem,
      };
    },
  );

  app.delete<{ Params: { subsystemId: string } }>(
    "/api/subsystems/:subsystemId",
    async (request, reply) => {
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

  app.post<{ Body: unknown }>("/api/mechanisms", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = mechanismSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Mechanism payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (!findSubsystem(parsed.data.subsystemId)) {
      return reply.code(400).send({
        message: "The selected subsystem does not exist.",
      });
    }

    const mechanism = createMechanism(parsed.data);
    return reply.code(201).send({
      item: mechanism,
    });
  });

  app.patch<{ Body: unknown; Params: { mechanismId: string } }>(
    "/api/mechanisms/:mechanismId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = mechanismPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Mechanism update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
    "/api/mechanisms/:mechanismId",
    async (request, reply) => {
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

  app.post<{ Body: unknown }>("/api/part-definitions", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = partDefinitionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Part definition payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const materialError = validatePartDefinitionMaterialId(parsed.data.materialId ?? null);
    if (materialError) {
      return reply.code(400).send({
        message: materialError,
      });
    }

    const partDefinition = createPartDefinition({
      ...parsed.data,
      materialId: parsed.data.materialId ?? null,
      description: parsed.data.description ?? "",
    });

    return reply.code(201).send({
      item: partDefinition,
    });
  });

  app.patch<{ Body: unknown; Params: { partDefinitionId: string } }>(
    "/api/part-definitions/:partDefinitionId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = partDefinitionPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Part definition update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
    "/api/part-definitions/:partDefinitionId",
    async (request, reply) => {
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

  app.post<{ Body: unknown }>("/api/part-instances", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = partInstanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Part instance payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validatePartInstanceLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const partInstance = createPartInstance({
      ...parsed.data,
      mechanismId: parsed.data.mechanismId ?? null,
    });

    return reply.code(201).send({
      item: partInstance,
    });
  });

  app.patch<{ Body: unknown; Params: { partInstanceId: string } }>(
    "/api/part-instances/:partInstanceId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = partInstancePatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Part instance update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentPartInstance = findPartInstance(request.params.partInstanceId);
      if (!currentPartInstance) {
        return reply.code(404).send({
          message: "Part instance not found.",
        });
      }

      const nextPartInstanceShape = {
        subsystemId: parsed.data.subsystemId ?? currentPartInstance.subsystemId,
        mechanismId:
          parsed.data.mechanismId === undefined
            ? currentPartInstance.mechanismId
            : parsed.data.mechanismId,
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
        subsystemId: nextPartInstanceShape.subsystemId,
        mechanismId: nextPartInstanceShape.mechanismId ?? null,
        partDefinitionId: nextPartInstanceShape.partDefinitionId,
      });

      return {
        item: partInstance,
      };
    },
  );

  app.delete<{ Params: { partInstanceId: string } }>(
    "/api/part-instances/:partInstanceId",
    async (request, reply) => {
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
      taskBlockers: snapshot.taskBlockers,
      tasks: snapshot.tasks,
    });
  });

  app.get("/api/manufacturing", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const snapshot = getSnapshot();
    const personId = readPersonFilter(request);
    const paginated = paginateItems(
      filterManufacturingItemsForPerson(personId),
      request.query,
    );

    return {
      items: withManufacturingQaReviewCounts(paginated.items, snapshot),
      pagination: paginated.pagination,
      qaReviews: snapshot.qaReviews.filter(
        (review) => review.subjectType === "manufacturing",
      ),
    };
  });

  app.post<{ Body: unknown }>("/api/manufacturing", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = manufacturingItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Manufacturing payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const initialPolicyFailure = assessGenericPatch({
      current: { status: "requested", mentorReviewed: false },
      patch: {
        status: parsed.data.status,
        mentorReviewed: parsed.data.mentorReviewed,
      },
      protectedFields: ["status", "mentorReviewed"],
      isApprover: hasWorkflowApprovalPermission(request),
      isPending: true,
      entityLabel: "Manufacturing item",
    });
    if (initialPolicyFailure) {
      return reply.code(initialPolicyFailure.statusCode).send({
        message: initialPolicyFailure.message,
      });
    }

    const validationError = validateManufacturingItemLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }
    const partDefinition = parsed.data.partDefinitionId
      ? findPartDefinition(parsed.data.partDefinitionId)
      : null;
    if (parsed.data.partDefinitionId && !partDefinition) {
      return reply.code(400).send({
        message: "Please select a real part from the Parts tab.",
      });
    }
    if (
      partDefinition &&
      parsed.data.materialId !== undefined &&
      parsed.data.materialId !== (partDefinition.materialId ?? null)
    ) {
      return reply.code(400).send({
        message: "The selected material does not match the selected part.",
      });
    }
    const resolvedMaterialId = partDefinition
      ? partDefinition.materialId ?? null
      : parsed.data.materialId ?? null;
    const materialError = validatePartDefinitionMaterialId(resolvedMaterialId);
    if (materialError) {
      return reply.code(400).send({
        message: materialError,
      });
    }

    const partInstanceIds = uniqueIds([
      ...(parsed.data.partInstanceIds ?? []),
      parsed.data.partInstanceId,
    ]);
    const item = createManufacturingItem({
      ...parsed.data,
      status: "requested",
      mentorReviewed: false,
      reviewedById: null,
      reviewedAt: null,
      materialId: resolvedMaterialId,
      partDefinitionId: parsed.data.partDefinitionId ?? null,
      partInstanceId: partInstanceIds[0] ?? null,
      partInstanceIds,
      title:
        parsed.data.process === "fabrication" || !partDefinition
          ? parsed.data.title
          : partDefinition.name,
    }, buildTaskAuditContext(request));
    return reply.code(201).send({
      item: withManufacturingQaReviewCounts([item])[0],
    });
  });

  app.patch<{ Body: unknown; Params: { itemId: string } }>(
    "/api/manufacturing/:itemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = manufacturingItemPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Manufacturing update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentItem = getManufacturingItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({
          message: "Manufacturing item not found.",
        });
      }


      const policyFailure = assessGenericPatch({
        current: currentItem as unknown as Record<string, unknown>,
        patch: parsed.data as Record<string, unknown>,
        protectedFields: ["status", "mentorReviewed", "reviewedById", "reviewedAt"],
        isApprover: hasWorkflowApprovalPermission(request),
        isPending: currentItem.status === "requested",
        entityLabel: "Manufacturing item",
      });
      if (policyFailure) {
        return reply.code(policyFailure.statusCode).send({ message: policyFailure.message });
      }
      if (isNoopPatch(
        currentItem as unknown as Record<string, unknown>,
        parsed.data as Record<string, unknown>,
      )) {
        return { item: withManufacturingQaReviewCounts([currentItem])[0] };
      }

      const nextItemShape = {
        subsystemId: parsed.data.subsystemId ?? currentItem.subsystemId,
        process: parsed.data.process ?? currentItem.process,
        partDefinitionId:
          parsed.data.partDefinitionId === undefined
            ? currentItem.partDefinitionId
            : parsed.data.partDefinitionId,
        partInstanceId:
          parsed.data.partInstanceId === undefined
            ? currentItem.partInstanceId
            : parsed.data.partInstanceId,
        partInstanceIds:
          parsed.data.partInstanceIds === undefined &&
          parsed.data.partInstanceId === undefined
            ? currentItem.partInstanceIds ?? uniqueIds([currentItem.partInstanceId])
            : uniqueIds([
                ...(parsed.data.partInstanceIds ?? []),
                parsed.data.partInstanceId,
              ]),
      };

      const validationError = validateManufacturingItemLinks(nextItemShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }
      const partDefinition = nextItemShape.partDefinitionId
        ? findPartDefinition(nextItemShape.partDefinitionId)
        : null;
      if (nextItemShape.partDefinitionId && !partDefinition) {
        return reply.code(400).send({
          message: "Please select a real part from the Parts tab.",
        });
      }
      const requestedMaterialId =
        parsed.data.materialId === undefined ? currentItem.materialId : parsed.data.materialId;
      if (
        partDefinition &&
        parsed.data.materialId !== undefined &&
        parsed.data.materialId !== (partDefinition.materialId ?? null)
      ) {
        return reply.code(400).send({
          message: "The selected material does not match the selected part.",
        });
      }
      const nextMaterialId = partDefinition
        ? partDefinition.materialId ?? null
        : requestedMaterialId ?? null;
      const materialError = validatePartDefinitionMaterialId(nextMaterialId);
      if (materialError) {
        return reply.code(400).send({
          message: materialError,
        });
      }

      const item = updateManufacturingItem(request.params.itemId, {
        ...parsed.data,
        materialId: nextMaterialId ?? null,
        partDefinitionId: nextItemShape.partDefinitionId ?? null,
        partInstanceId: nextItemShape.partInstanceIds[0] ?? null,
        partInstanceIds: nextItemShape.partInstanceIds,
        title:
          nextItemShape.process === "fabrication" || !partDefinition
            ? parsed.data.title ?? currentItem.title
            : partDefinition.name,
      }, buildTaskAuditContext(request));

      return {
        item: item ? withManufacturingQaReviewCounts([item])[0] : item,
      };
    },
  );

  app.put<{ Body: unknown; Params: { itemId: string } }>(
    "/api/manufacturing/:itemId/review",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }
      if (!requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors and admins can review manufacturing items.",
      )) {
        return;
      }

      const parsed = manufacturingReviewSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Manufacturing review payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentItem = getManufacturingItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({ message: "Manufacturing item not found." });
      }

      if (
        currentItem.mentorReviewed === parsed.data.reviewed &&
        ((parsed.data.reviewed && currentItem.status === "approved") ||
          (!parsed.data.reviewed && currentItem.status === "requested"))
      ) {
        return { item: withManufacturingQaReviewCounts([currentItem])[0] };
      }

      const policyFailure = validateManufacturingReview(currentItem, parsed.data.reviewed);
      if (policyFailure) {
        return reply.code(policyFailure.statusCode).send({ message: policyFailure.message });
      }

      const actor = getWorkflowApprovalMember(request);
      if (!actor) {
        return reply.code(403).send({ message: "A mentor or admin roster profile is required." });
      }
      const reviewedAt = parsed.data.reviewed ? new Date().toISOString() : null;
      const item = updateManufacturingItem(request.params.itemId, {
        mentorReviewed: parsed.data.reviewed,
        status: parsed.data.reviewed ? "approved" : "requested",
        reviewedById: parsed.data.reviewed ? actor.id : null,
        reviewedAt,
      }, buildTaskAuditContext(request, actor.id));

      return { item: item ? withManufacturingQaReviewCounts([item])[0] : item };
    },
  );

  app.post<{ Body: unknown; Params: { itemId: string } }>(
    "/api/manufacturing/:itemId/transition",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = manufacturingTransitionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Manufacturing transition payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentItem = getManufacturingItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({ message: "Manufacturing item not found." });
      }

      const policyFailure = validateManufacturingTransition(currentItem, parsed.data.status);
      if (policyFailure) {
        return reply.code(policyFailure.statusCode).send({ message: policyFailure.message });
      }

      const item = updateManufacturingItem(
        request.params.itemId,
        { status: parsed.data.status },
        buildTaskAuditContext(request),
      );
      return { item: item ? withManufacturingQaReviewCounts([item])[0] : item };
    },
  );

  app.delete<{ Params: { itemId: string } }>(
    "/api/manufacturing/:itemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      if (!requireWorkflowApprovalPermission(
        request,
        reply,
        "Only mentors and admins can delete manufacturing items.",
      )) {
        return;
      }

      const item = removeManufacturingItem(
        request.params.itemId,
        buildTaskAuditContext(request),
      );
      if (!item) {
        return reply.code(404).send({
          message: "Manufacturing item not found.",
        });
      }

      return {
        item,
      };
    },
  );

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

  app.post<{ Body: unknown }>("/api/purchases", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = purchaseItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Purchase payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const initialPolicyFailure = assessGenericPatch({
      current: { status: "requested", approvedByMentor: false, finalCost: undefined },
      patch: {
        status: parsed.data.status,
        approvedByMentor: parsed.data.approvedByMentor,
        finalCost: parsed.data.finalCost,
      },
      protectedFields: ["status", "approvedByMentor", "finalCost"],
      isApprover: hasWorkflowApprovalPermission(request),
      isPending: true,
      entityLabel: "Purchase item",
    });
    if (initialPolicyFailure) {
      return reply.code(initialPolicyFailure.statusCode).send({
        message: initialPolicyFailure.message,
      });
    }

    const validationError = validatePurchaseItemLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const partDefinition = parsed.data.partDefinitionId
      ? findPartDefinition(parsed.data.partDefinitionId)
      : null;
    if (parsed.data.partDefinitionId && !partDefinition) {
      return reply.code(400).send({
        message: "Please select a real part from the Parts tab.",
      });
    }

    const item = createPurchaseItem({
      ...parsed.data,
      status: "requested",
      approvedByMentor: false,
      finalCost: undefined,
      approvedById: null,
      approvedAt: null,
      purchasedAt: null,
      deliveredAt: null,
      partDefinitionId: parsed.data.partDefinitionId ?? null,
      title: partDefinition?.name ?? parsed.data.title,
    }, buildTaskAuditContext(request));
    return reply.code(201).send({
      item,
    });
  });

  app.patch<{ Body: unknown; Params: { itemId: string } }>(
    "/api/purchases/:itemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = purchaseItemPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Purchase update payload is invalid.",
          issues: parsed.error.flatten(),
        });
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
          "status",
          "approvedByMentor",
          "finalCost",
          "approvedById",
          "approvedAt",
          "purchasedAt",
          "deliveredAt",
        ],
        isApprover: hasWorkflowApprovalPermission(request),
        isPending: currentItem.status === "requested",
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

      const nextItemShape = {
        subsystemId: parsed.data.subsystemId ?? currentItem.subsystemId,
        partDefinitionId:
          parsed.data.partDefinitionId === undefined
            ? currentItem.partDefinitionId
            : parsed.data.partDefinitionId,
      };

      const validationError = validatePurchaseItemLinks(nextItemShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const partDefinition = nextItemShape.partDefinitionId
        ? findPartDefinition(nextItemShape.partDefinitionId)
        : null;
      if (nextItemShape.partDefinitionId && !partDefinition) {
        return reply.code(400).send({
          message: "Please select a real part from the Parts tab.",
        });
      }

      const item = updatePurchaseItem(request.params.itemId, {
        ...parsed.data,
        partDefinitionId: nextItemShape.partDefinitionId ?? null,
        title: partDefinition?.name ?? parsed.data.title ?? currentItem.title,
      }, buildTaskAuditContext(request));

      return {
        item,
      };
    },
  );

  app.put<{ Body: unknown; Params: { itemId: string } }>(
    "/api/purchases/:itemId/approval",
    async (request, reply) => {
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

      const parsed = purchaseApprovalSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Purchase approval payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentItem = getPurchaseItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({ message: "Purchase item not found." });
      }

      if (
        currentItem.approvedByMentor === parsed.data.approved &&
        ((parsed.data.approved && currentItem.status === "approved") ||
          (!parsed.data.approved && currentItem.status === "requested"))
      ) {
        return { item: currentItem };
      }

      const policyFailure = validatePurchaseApproval(currentItem, parsed.data.approved);
      if (policyFailure) {
        return reply.code(policyFailure.statusCode).send({ message: policyFailure.message });
      }

      const actor = getWorkflowApprovalMember(request);
      if (!actor) {
        return reply.code(403).send({ message: "A mentor or admin roster profile is required." });
      }
      const item = updatePurchaseItem(request.params.itemId, {
        approvedByMentor: parsed.data.approved,
        status: parsed.data.approved ? "approved" : "requested",
        approvedById: parsed.data.approved ? actor.id : null,
        approvedAt: parsed.data.approved ? new Date().toISOString() : null,
      }, buildTaskAuditContext(request, actor.id));

      return { item };
    },
  );

  app.post<{ Body: unknown; Params: { itemId: string } }>(
    "/api/purchases/:itemId/transition",
    async (request, reply) => {
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

      const parsed = purchaseTransitionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Purchase transition payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentItem = getPurchaseItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({ message: "Purchase item not found." });
      }

      const policyFailure = validatePurchaseTransition(currentItem.status, parsed.data.status);
      if (policyFailure) {
        return reply.code(policyFailure.statusCode).send({ message: policyFailure.message });
      }

      const actor = getWorkflowApprovalMember(request);
      if (!actor) {
        return reply.code(403).send({ message: "A mentor or admin roster profile is required." });
      }
      const now = new Date().toISOString();
      const item = updatePurchaseItem(request.params.itemId, {
        status: parsed.data.status,
        finalCost: parsed.data.finalCost ?? currentItem.finalCost,
        purchasedAt: parsed.data.status === "purchased" ? now : currentItem.purchasedAt,
        deliveredAt: parsed.data.status === "delivered" ? now : currentItem.deliveredAt,
      }, buildTaskAuditContext(request, actor.id));

      return { item };
    },
  );

  app.delete<{ Params: { itemId: string } }>(
    "/api/purchases/:itemId",
    async (request, reply) => {
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

  app.get("/api/qa", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      reviews: getSnapshot().qaReviews,
      mentorBackedPasses: getSnapshot().qaReviews.filter((review) => {
        return review.result === "pass" && review.mentorApproved;
      }).length,
    };
  });

  app.get("/api/metrics", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return buildMetrics(getSnapshot());
  });

  await registerCadRoutes(app, requireApiSessionIfEnabled);
  await registerOnshapeRoutes(app, requireApiSessionIfEnabled, requireMentorPermission);
}
