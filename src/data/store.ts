import { AsyncLocalStorage } from "node:async_hooks";
import { resolve } from "node:path";

import { createTutorialSnapshot } from "./tutorialSnapshot";
import { DEFAULT_PROJECT_TEAM_ID } from "../domain/types";
import type {
  AuditAction,
  AuditActionOperation,
  Artifact,
  DesignIteration,
  Discipline,
  FavoriteView,
  MilestoneRequirement,
  Milestone,
  MilestoneStatus,
  ManufacturingItem,
  Material,
  Meeting,
  Mechanism,
  Member,
  PartDefinition,
  PartInstance,
  PlatformSnapshot,
  Project,
  PurchaseItem,
  Report,
  ReportFinding,
  Risk,
  QaReport,
  QaRequest,
  QaFinding,
  Season,
  Subsystem,
  Task,
  TaskBlocker,
  TaskDependency,
  TestResult,
  TestFinding,
  Workstream,
  WorkLog,
} from "../domain/types";
import {
  getDefaultTaskDisciplineIdForProject,
  isTaskDisciplineAllowedForProject,
} from "../domain/taskDisciplines";
import {
  isManualPmCadImportSource,
  markPmCadEditedAfterImport,
  normalizePmCadProvenance,
} from "../domain/pmCadProvenance";
import {
  dateOnlyFromDateTime,
  formatTimeFromDateTime,
  normalizeMeetingSchedule,
} from "./store/meetingSchedule";
import {
  buildFindings,
  buildReports,
  reportFindingFromQaFinding,
  reportFindingFromTestFinding,
  reportFromQaReport,
  reportFromTestResult,
  type FindingListItem,
} from "./store/reportDerivations";
import { loadPlatformSnapshotFile, savePlatformSnapshotFile } from "./platformSnapshotFile";
import type {
  ArtifactInput,
  MilestoneInput,
  ManufacturingItemInput,
  MaterialInput,
  MeetingInput,
  MechanismInput,
  MemberInput,
  PartDefinitionInput,
  PartInstanceInput,
  ProjectInput,
  QaReportInput,
  QaRequestInput,
  ReportFindingInput,
  ReportInput,
  RiskInput,
  PurchaseItemInput,
  SeasonInput,
  SubsystemInput,
  TaskBlockerInput,
  TaskDependencyInput,
  TaskInput,
  TestResultInput,
  WorkLogInput,
  WorkstreamInput,
} from "./storeTypes";

export type {
  ArtifactInput,
  MilestoneInput,
  ManufacturingItemInput,
  MaterialInput,
  MeetingInput,
  MechanismInput,
  MemberInput,
  PartDefinitionInput,
  PartInstanceInput,
  ProjectInput,
  QaReportInput,
  QaRequestInput,
  ReportFindingInput,
  ReportInput,
  RiskInput,
  PurchaseItemInput,
  SeasonInput,
  SubsystemInput,
  TaskBlockerInput,
  TaskDependencyInput,
  TaskInput,
  TestResultInput,
  WorkLogInput,
  WorkstreamInput,
} from "./storeTypes";

export interface MilestoneMatch {
  milestoneId: string;
  matchedRequirementIds: string[];
  isLegacyLink: boolean;
}

export interface TaskMilestoneMatch {
  taskId: string;
  matchedRequirementIds: string[];
  isLegacyLink: boolean;
}

export interface AuditMutationContext {
  actorMemberId?: string | null;
  requestId?: string | null;
}

const REDACTED_AUDIT_VALUE = "[redacted]";
const SENSITIVE_AUDIT_FIELD_PATTERN =
  /(password|passcode|secret|token|credential|authorization|authHeader|cookie|session|privateKey|apiKey)/i;

function parseIterationCondition(conditionValue: string) {
  const normalized = conditionValue.trim().toLowerCase();
  const match = normalized.match(/^iteration\s*(?:([<>]=?|==|=)\s*)?(\d+)$/);
  if (!match) {
    return null;
  }

  const [, rawOperator, iterationText] = match;
  const parsedIteration = Number.parseInt(iterationText, 10);
  if (!Number.isFinite(parsedIteration)) {
    return null;
  }

  return {
    operator: rawOperator === "==" || rawOperator === "=" || rawOperator === undefined ? "=" : rawOperator,
    iteration: Math.max(1, Math.trunc(parsedIteration)),
  };
}

function normalizeStateValue(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function extractComparableState(targetType: MilestoneRequirement["targetType"], targetId: string) {
  if (targetType === "artifact") {
    const artifact = currentSnapshot.artifacts.find((candidate) => candidate.id === targetId);
    if (!artifact) {
      return null;
    }

    return normalizeStateValue(artifact.status);
  }

  if (targetType === "part-instance") {
    const partInstance = currentSnapshot.partInstances.find(
      (candidate) => candidate.id === targetId,
    );
    if (!partInstance) {
      return null;
    }

    return normalizeStateValue(partInstance.status);
  }

  return null;
}

function extractComparableIteration(targetType: MilestoneRequirement["targetType"], targetId: string) {
  if (targetType === "subsystem") {
    const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === targetId);
    return subsystem?.iteration;
  }

  if (targetType === "mechanism") {
    const mechanism = currentSnapshot.mechanisms.find((candidate) => candidate.id === targetId);
    return mechanism?.iteration;
  }

  return undefined;
}

function isConditionSatisfied({
  targetType,
  targetId,
  conditionType,
  conditionValue,
}: Pick<MilestoneRequirement, "targetType" | "targetId" | "conditionType" | "conditionValue">) {
  if (conditionType === "custom") {
    return conditionValue.trim().toLowerCase() === "in_scope";
  }

  if (conditionType === "iteration") {
    const parsed = parseIterationCondition(conditionValue);
    if (!parsed) {
      return false;
    }

    const actualIteration = extractComparableIteration(targetType, targetId);
    if (typeof actualIteration !== "number") {
      return false;
    }

    if (parsed.operator === "=") {
      return actualIteration === parsed.iteration;
    }
    if (parsed.operator === ">=") {
      return actualIteration >= parsed.iteration;
    }
    if (parsed.operator === ">") {
      return actualIteration > parsed.iteration;
    }
    if (parsed.operator === "<=") {
      return actualIteration <= parsed.iteration;
    }
    if (parsed.operator === "<") {
      return actualIteration < parsed.iteration;
    }

    return false;
  }

  const parsedState = normalizeStateValue(conditionValue.replace(/^state\s*=\s*/i, ""));
  if (!parsedState.length || parsedState === "STATE") {
    return false;
  }

  const actualState = extractComparableState(targetType, targetId);
  if (!actualState) {
    return false;
  }

  const stateAliases: Record<string, string[]> = {
    COMPLETE: ["COMPLETE", "DONE", "PASS", "PASSED", "OK", "PUBLISHED", "INSTALLED"],
    IN_REVIEW: ["IN_REVIEW", "REVIEW", "UNDER_REVIEW", "REVIEWING"],
    QA_PASSED: ["QA_PASSED", "PASSED", "APPROVED", "COMPLETE", "PUBLISHED"],
  };

  return (
    actualState === parsedState ||
    (stateAliases[parsedState] ?? []).includes(actualState)
  );
}

function matchesMilestoneRequirement({
  milestoneRequirement,
  targetType,
  targetId,
}: {
  milestoneRequirement: MilestoneRequirement;
  targetType: string;
  targetId: string;
}) {
  if (milestoneRequirement.targetType !== targetType || milestoneRequirement.targetId !== targetId) {
    return false;
  }

  if (milestoneRequirement.conditionType === "custom") {
    return true;
  }

  return isConditionSatisfied(milestoneRequirement);
}

function normalizeMemberSeasonMembership(
  member: Member,
  fallbackSeasonId: string,
): Member {
  const seasonId = member.seasonId || fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(member.activeSeasonIds ?? []), seasonId]);
  return {
    ...member,
    seasonId,
    activeSeasonIds: activeSeasonIds.length > 0 ? activeSeasonIds : [seasonId],
    plannedWeeklyAttendanceHours: normalizePlannedWeeklyAttendanceHours(
      member.plannedWeeklyAttendanceHours,
    ),
    plannedAttendanceDays: normalizePlannedAttendanceDays(member.plannedAttendanceDays),
    plannedAttendanceNotes:
      typeof member.plannedAttendanceNotes === "string"
        ? member.plannedAttendanceNotes.trim()
        : "",
  };
}

const PLANNED_ATTENDANCE_DAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const);

function normalizePlannedWeeklyAttendanceHours(value: number | undefined) {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return 0;
  }

  return Number(value.toFixed(2));
}

function normalizePlannedAttendanceDays(days: Member["plannedAttendanceDays"] | undefined) {
  return uniqueIds(days ?? []).filter((day): day is NonNullable<Member["plannedAttendanceDays"]>[number] =>
    PLANNED_ATTENDANCE_DAYS.has(day as NonNullable<Member["plannedAttendanceDays"]>[number]),
  );
}

function normalizePartDefinitionSeasonMembership(
  partDefinition: PartDefinition,
  fallbackSeasonId: string,
): PartDefinition {
  const seasonId = partDefinition.seasonId || fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(partDefinition.activeSeasonIds ?? []), seasonId]);
  return {
    ...partDefinition,
    seasonId,
    activeSeasonIds: activeSeasonIds.length > 0 ? activeSeasonIds : [seasonId],
  };
}

function normalizeSubsystemSerialAlias(value: string | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length > 0 ? normalized.slice(0, 8) : undefined;
}

function deriveSubsystemSerialAlias(name: string) {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return "SYS";
  }

  const words = trimmedName
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const initials = words.map((word) => word[0] ?? "").join("").toUpperCase();
  if (initials.length >= 2) {
    return initials.slice(0, 8);
  }

  const lettersOnly = trimmedName.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (lettersOnly.slice(0, 2) || "SY").slice(0, 8);
}

function normalizeTaskCreatedAt(task: Task) {
  if (typeof task.createdAt === "string" && task.createdAt.trim()) {
    return task.createdAt;
  }

  const candidateDate = task.startDate || task.dueDate;
  if (typeof candidateDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidateDate)) {
    return new Date(`${candidateDate}T00:00:00.000Z`).toISOString();
  }

  return new Date().toISOString();
}

function formatTaskSerial(task: Task, subsystem: Subsystem | undefined) {
  const serialNumber = typeof task.serialNumber === "number" ? task.serialNumber : 0;
  const alias = subsystem?.serialAlias ?? deriveSubsystemSerialAlias(subsystem?.name ?? "");
  return `T-${alias}${serialNumber}`;
}

function normalizeSnapshotTaskSerials(snapshot: PlatformSnapshot): PlatformSnapshot {
  const normalizedSubsystems = snapshot.subsystems.map((subsystem) => ({
    ...subsystem,
    serialAlias: normalizeSubsystemSerialAlias(subsystem.serialAlias),
  }));
  const subsystemsById = new Map(
    normalizedSubsystems.map((subsystem) => [subsystem.id, subsystem] as const),
  );

  const tasksWithCreatedAt = snapshot.tasks.map((task) => ({
    ...task,
    createdAt: normalizeTaskCreatedAt(task),
  }));

  const tasksBySubsystemId = new Map<string, Task[]>();
  for (const task of tasksWithCreatedAt) {
    const bucket = tasksBySubsystemId.get(task.subsystemId);
    if (bucket) {
      bucket.push(task);
    } else {
      tasksBySubsystemId.set(task.subsystemId, [task]);
    }
  }

  const normalizedTasks = tasksWithCreatedAt.map((task) => task);
  const taskIndexById = new Map(normalizedTasks.map((task, index) => [task.id, index] as const));

  for (const [subsystemId, tasks] of tasksBySubsystemId) {
    const subsystem = subsystemsById.get(subsystemId);
    const usedNumbers = new Set<number>();
    let maxSerialNumber = 0;
    const missingSerialTasks: Task[] = [];

    for (const task of tasks) {
      if (typeof task.serialNumber !== "number" || !Number.isFinite(task.serialNumber)) {
        missingSerialTasks.push(task);
        continue;
      }

      const serialNumber = Math.trunc(task.serialNumber);
      if (serialNumber < 1 || usedNumbers.has(serialNumber)) {
        missingSerialTasks.push({ ...task, serialNumber: undefined });
        continue;
      }

      usedNumbers.add(serialNumber);
      maxSerialNumber = Math.max(maxSerialNumber, serialNumber);
    }

    const nextMissingSerialTasks = missingSerialTasks
      .map((task) => ({
        ...task,
        createdAt: normalizeTaskCreatedAt(task),
      }))
      .sort((a, b) => {
        const diff = a.createdAt!.localeCompare(b.createdAt!);
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });

    let nextSerialNumber = maxSerialNumber;
    for (const task of nextMissingSerialTasks) {
      nextSerialNumber += 1;
      usedNumbers.add(nextSerialNumber);

      const index = taskIndexById.get(task.id);
      if (index === undefined) {
        continue;
      }

      normalizedTasks[index] = {
        ...normalizedTasks[index],
        createdAt: task.createdAt,
        serialNumber: nextSerialNumber,
      };
    }

    for (const task of tasks) {
      const index = taskIndexById.get(task.id);
      if (index === undefined) {
        continue;
      }

      const updated = normalizedTasks[index];
      const serialNumber = typeof updated.serialNumber === "number" ? updated.serialNumber : 0;
      normalizedTasks[index] = {
        ...updated,
        serialNumber,
        serial: formatTaskSerial({ ...updated, serialNumber }, subsystem),
      };
    }
  }

  return {
    ...snapshot,
    subsystems: normalizedSubsystems,
    tasks: normalizedTasks,
  };
}

function deriveTaskBlockerSummaries(snapshot: PlatformSnapshot): PlatformSnapshot {
  const summaries = new Map<string, Set<string>>();
  for (const blocker of snapshot.taskBlockers) {
    if (blocker.status !== "open") continue;
    const descriptions = summaries.get(blocker.blockedTaskId) ?? new Set<string>();
    descriptions.add(blocker.description);
    summaries.set(blocker.blockedTaskId, descriptions);
  }
  return { ...snapshot, tasks: snapshot.tasks.map((task) => ({
    ...task, checklistItems: task.checklistItems ?? [], blockers: [...(summaries.get(task.id) ?? [])],
  })) };
}

function canonicalizeSnapshot(snapshot: PlatformSnapshot): PlatformSnapshot {
  const clonedSnapshot = structuredClone(snapshot);
  const fallbackSeasonId = clonedSnapshot.seasons[0]?.id ?? "default-season";
  const normalizedProjects = clonedSnapshot.projects.map((project) => ({
    ...project,
    teamId: normalizeProjectTeamId(project.teamId),
  }));
  const projectsById = new Map(normalizedProjects.map((project) => [project.id, project] as const));

  const normalizeMilestoneSeasonId = (milestone: Milestone) => {
    if (milestone.seasonId) {
      return milestone.seasonId;
    }

    const projectSeasonId =
      (milestone.projectIds ?? [])
        .map((projectId) => projectsById.get(projectId)?.seasonId ?? null)
        .find((seasonId): seasonId is string => Boolean(seasonId)) ?? null;

    return projectSeasonId ?? fallbackSeasonId;
  };

  const normalizedMilestones = clonedSnapshot.milestones.map((milestone) => {
    return {
      ...milestone,
      seasonId: normalizeMilestoneSeasonId(milestone),
      status: normalizeMilestoneStatus(milestone.status),
      isBlocked: milestone.isBlocked ?? false,
      blockedReason: milestone.blockedReason ?? null,
      blockedByType: milestone.blockedByType ?? null,
      blockedById: milestone.blockedById ?? null,
      photoUrl: typeof milestone.photoUrl === "string" ? milestone.photoUrl : "",
    };
  });

  const normalizedSnapshot = normalizePartInstanceSnapshot({
    ...clonedSnapshot,
    projects: normalizedProjects,
    subsystems: clonedSnapshot.subsystems.map((subsystem) => ({
      ...subsystem,
      ...normalizePmCadProvenance(subsystem),
    })),
    members: clonedSnapshot.members.map((member) =>
      normalizeMemberSeasonMembership(member, fallbackSeasonId),
    ),
    mechanisms: clonedSnapshot.mechanisms.map((mechanism) => ({
      ...mechanism,
      ...normalizePmCadProvenance(mechanism),
    })),
    partDefinitions: clonedSnapshot.partDefinitions.map((partDefinition) =>
      normalizePartDefinitionSeasonMembership(
        {
          ...partDefinition,
          ...normalizePmCadProvenance(partDefinition),
        },
        fallbackSeasonId,
      ),
    ),
    partInstances: clonedSnapshot.partInstances.map((partInstance) => ({
      ...partInstance,
      ...normalizePmCadProvenance(partInstance),
    })),
    milestones: normalizedMilestones,
    milestoneRequirements: clonedSnapshot.milestoneRequirements,
    qaRequests: clonedSnapshot.qaRequests ?? [],
    workLogs: clonedSnapshot.workLogs.map((workLog) => ({
      ...workLog,
      createdById: workLog.createdById ?? null,
    })),
    manufacturingItems: clonedSnapshot.manufacturingItems.map((item) => ({
      ...item,
      reviewedById: item.reviewedById ?? null,
      reviewedAt: item.reviewedAt ?? null,
    })),
    purchaseItems: clonedSnapshot.purchaseItems.map((item) => ({
      ...item,
      approvedById: item.approvedById ?? null,
      approvedAt: item.approvedAt ?? null,
      purchasedAt: item.purchasedAt ?? null,
      deliveredAt: item.deliveredAt ?? null,
    })),
    meetings: clonedSnapshot.meetings.map((meeting) =>
      normalizeMeetingSchedule(meeting, fallbackSeasonId),
    ),
  });

  return deriveTaskBlockerSummaries(normalizeSnapshotTaskSerials({
    ...normalizedSnapshot,
    favoriteViews: normalizedSnapshot.favoriteViews ?? [],
    actions: normalizedSnapshot.actions ?? [],
  }));
}

interface SnapshotState {
  current: PlatformSnapshot;
  interactive: PlatformSnapshot | null;
  isGlobalTransaction?: boolean;
  dirty?: boolean;
}

const platformSnapshotPath = resolve(
  process.cwd(),
  process.env.PLATFORM_SNAPSHOT_PATH ?? "data/platform-snapshot.json",
);
const persistedProductionSnapshot = process.env.NODE_ENV === "production"
  ? loadPlatformSnapshotFile(platformSnapshotPath)
  : null;
const globalSnapshotState: SnapshotState = {
  current: canonicalizeSnapshot(persistedProductionSnapshot ?? createTutorialSnapshot()),
  interactive: null,
};
const tutorialSnapshotStates = new Map<string, SnapshotState>();
const snapshotContext = new AsyncLocalStorage<SnapshotState>();
let globalMutationTail = Promise.resolve();

function activeSnapshotState() {
  return snapshotContext.getStore() ?? globalSnapshotState;
}

const currentSnapshot = new Proxy({} as PlatformSnapshot, {
  get: (_target, property) => Reflect.get(activeSnapshotState().current, property),
  set: (_target, property, value) => {
    const state = activeSnapshotState();
    const updated = Reflect.set(state.current, property, value);
    if (updated && state.isGlobalTransaction) {
      state.dirty = true;
    }
    return updated;
  },
  ownKeys: () => Reflect.ownKeys(activeSnapshotState().current),
  getOwnPropertyDescriptor: (_target, property) =>
    Reflect.getOwnPropertyDescriptor(activeSnapshotState().current, property),
});

function replaceCurrentSnapshot(snapshot: PlatformSnapshot) {
  const state = activeSnapshotState();
  if (state === globalSnapshotState && process.env.NODE_ENV === "production") {
    throw new Error("Production platform mutations require a durable request transaction.");
  }
  state.current = deriveTaskBlockerSummaries(snapshot);
  if (state.isGlobalTransaction) {
    state.dirty = true;
  }
}

export async function acquireGlobalSnapshotMutation() {
  let releaseLock!: () => void;
  const previous = globalMutationTail;
  globalMutationTail = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previous;

  const state: SnapshotState = {
    current: structuredClone(globalSnapshotState.current),
    interactive: null,
    isGlobalTransaction: true,
    dirty: false,
  };
  let released = false;

  return {
    enter() {
      snapshotContext.enterWith(state);
    },
    hasChanges() {
      return state.dirty === true;
    },
    async commit() {
      if (!state.dirty) {
        return;
      }
      try {
        if (process.env.NODE_ENV === "production") {
          await savePlatformSnapshotFile(platformSnapshotPath, state.current);
        }
        globalSnapshotState.current = state.current;
      } finally {
        state.dirty = false;
      }
    },
    release() {
      if (!released) {
        released = true;
        snapshotContext.enterWith(globalSnapshotState);
        releaseLock();
      }
    },
  };
}

function getInteractiveTutorialSnapshot() {
  return activeSnapshotState().interactive;
}

function setInteractiveTutorialSnapshot(snapshot: PlatformSnapshot | null) {
  activeSnapshotState().interactive = snapshot;
}

export function hasInteractiveTutorialSession(userKey: string) {
  return tutorialSnapshotStates.has(userKey);
}

export function runWithInteractiveTutorialSession<T>(userKey: string, run: () => T): T {
  const state = tutorialSnapshotStates.get(userKey);
  return state ? snapshotContext.run(state, run) : run();
}

function normalizeProjectTeamId(teamId: string | null | undefined) {
  const normalized = teamId?.trim();
  return normalized ? normalized : DEFAULT_PROJECT_TEAM_ID;
}

function getDefaultProjectTeamId(snapshot: Pick<PlatformSnapshot, "projects">) {
  const firstTeamId = snapshot.projects.find((project) => project.teamId?.trim())?.teamId;
  return normalizeProjectTeamId(firstTeamId);
}

function isElevatedMemberRole(role: Member["role"]): boolean {
  return role === "lead" || role === "admin";
}

function normalizeIteration(iteration: number | undefined) {
  return Number.isFinite(iteration) && iteration && iteration >= 1
    ? Math.trunc(iteration)
    : 1;
}

function normalizeWorkspaceColor(color: string | undefined) {
  if (typeof color !== "string") {
    return undefined;
  }

  const trimmedColor = color.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmedColor) ? trimmedColor : undefined;
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function uniqueId(base: string, existingIds: Set<string>) {
  if (!existingIds.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }

  return `${base}-${counter}`;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function getPartInstanceMergeKey(
  partInstance: Pick<PartInstance, "subsystemId" | "mechanismId" | "partDefinitionId">,
) {
  return [partInstance.subsystemId, partInstance.mechanismId ?? "", partInstance.partDefinitionId].join(
    "::",
  );
}

function remapPartInstanceReferences(
  snapshot: PlatformSnapshot,
  remappedPartInstanceIds: Map<string, string>,
) {
  if (remappedPartInstanceIds.size === 0) {
    return snapshot;
  }

  const remapId = (value: string | null | undefined) => {
    if (!value) {
      return null;
    }

    return remappedPartInstanceIds.get(value) ?? value;
  };

  const remapIdList = (values: string[]) => uniqueIds(values.map((value) => remapId(value)));

  return {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => {
      const partInstanceId = remapId(task.partInstanceId);
      const partInstanceIds = remapIdList(task.partInstanceIds);

      if (partInstanceId === task.partInstanceId && partInstanceIds.length === task.partInstanceIds.length) {
        let matches = true;
        for (let index = 0; index < partInstanceIds.length; index += 1) {
          if (partInstanceIds[index] !== task.partInstanceIds[index]) {
            matches = false;
            break;
          }
        }

        if (matches) {
          return task;
        }
      }

      return normalizeTaskTargets({
        ...task,
        partInstanceId,
        partInstanceIds,
      });
    }),
    manufacturingItems: snapshot.manufacturingItems.map((item) => {
      const partInstanceId = remapId(item.partInstanceId);
      const partInstanceIds = remapIdList(item.partInstanceIds);

      if (partInstanceId === item.partInstanceId && partInstanceIds.length === item.partInstanceIds.length) {
        let matches = true;
        for (let index = 0; index < partInstanceIds.length; index += 1) {
          if (partInstanceIds[index] !== item.partInstanceIds[index]) {
            matches = false;
            break;
          }
        }

        if (matches) {
          return item;
        }
      }

      return {
        ...item,
        partInstanceId,
        partInstanceIds,
      };
    }),
    risks: snapshot.risks.map((risk) =>
      risk.attachmentType === "part-instance"
        ? {
            ...risk,
            attachmentId: remappedPartInstanceIds.get(risk.attachmentId) ?? risk.attachmentId,
          }
        : risk,
    ),
    qaFindings: snapshot.qaFindings.map((finding) => ({
      ...finding,
      partInstanceId: remapId(finding.partInstanceId),
    })),
    testFindings: snapshot.testFindings.map((finding) => ({
      ...finding,
      partInstanceId: remapId(finding.partInstanceId),
    })),
    designIterations: snapshot.designIterations.map((iteration) => ({
      ...iteration,
      partInstanceId: remapId(iteration.partInstanceId),
    })),
  };
}

function normalizePartInstanceSnapshot(snapshot: PlatformSnapshot) {
  const remappedPartInstanceIds = new Map<string, string>();
  const partInstanceByKey = new Map<string, PartInstance>();
  const normalizedPartInstances: PartInstance[] = [];

  for (const partInstance of snapshot.partInstances) {
    const normalizedPartInstance = {
      ...partInstance,
      status: normalizePartInstanceStatus(partInstance.status),
      photoUrl: typeof partInstance.photoUrl === "string" ? partInstance.photoUrl : "",
    };
    const mergeKey = getPartInstanceMergeKey(normalizedPartInstance);
    const existingPartInstance = partInstanceByKey.get(mergeKey);

    if (existingPartInstance) {
      const existingProvenance = normalizePmCadProvenance(existingPartInstance);
      const incomingProvenance = normalizePmCadProvenance(normalizedPartInstance);
      if (
        isManualPmCadImportSource(existingProvenance.cadImportSource) ||
        !isManualPmCadImportSource(incomingProvenance.cadImportSource)
      ) {
        existingPartInstance.cadSource = incomingProvenance.cadSource;
        existingPartInstance.cadImportSource = incomingProvenance.cadImportSource;
        existingPartInstance.cadEditedAfterImport = incomingProvenance.cadEditedAfterImport;
        existingPartInstance.cadSourceLabel = incomingProvenance.cadSourceLabel;
        existingPartInstance.cadUpdatedAt = incomingProvenance.cadUpdatedAt;
      }
      existingPartInstance.quantity += normalizedPartInstance.quantity;
      remappedPartInstanceIds.set(normalizedPartInstance.id, existingPartInstance.id);
      continue;
    }

    partInstanceByKey.set(mergeKey, normalizedPartInstance);
    normalizedPartInstances.push(normalizedPartInstance);
  }

  return remapPartInstanceReferences(
    {
      ...snapshot,
      partInstances: normalizedPartInstances,
    },
    remappedPartInstanceIds,
  );
}

function normalizeMilestoneStatus(
  status: MilestoneStatus | "not-started" | "in-progress" | "waiting-for-qa" | "complete" | undefined,
): MilestoneStatus {
  if (status === "not ready" || status === "blocked" || status === "qa" || status === "ready") {
    return status;
  }

  if (status === "not-started") {
    return "not ready";
  }

  if (status === "in-progress") {
    return "blocked";
  }

  if (status === "waiting-for-qa") {
    return "qa";
  }

  if (status === "complete") {
    return "ready";
  }

  return "not ready";
}

function normalizePartInstanceStatus(
  status: PartInstance["status"] | "planned" | "needed" | "available" | "installed" | "retired" | undefined,
): PartInstance["status"] {
  if (status === "not ready" || status === "blocked" || status === "qa" || status === "ready") {
    return status;
  }

  if (status === "planned" || status === "retired") {
    return "not ready";
  }

  if (status === "needed") {
    return "blocked";
  }

  if (status === "available" || status === "installed") {
    return "ready";
  }

  return "not ready";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getNextPartNumberForPrefix(prefixInput: string) {
  const prefix = prefixInput.trim().toUpperCase();
  if (!prefix) {
    return "P-001";
  }

  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, "i");
  let maxSerial = 0;
  for (const partDefinition of currentSnapshot.partDefinitions) {
    const match = pattern.exec(partDefinition.partNumber.trim());
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    maxSerial = Math.max(maxSerial, parsed);
  }

  const nextSerial = maxSerial + 1;
  return `${prefix}-${String(nextSerial).padStart(3, "0")}`;
}

function resolvePartNumberForNewPartDefinition(
  requestedPartNumber: string | undefined,
  isHardware: boolean,
) {
  const trimmed = (requestedPartNumber ?? "").trim();
  if (!trimmed) {
    return getNextPartNumberForPrefix(isHardware ? "H" : "P");
  }

  const normalized = trimmed.toUpperCase();
  const prefixMatch = /^([A-Z0-9]{2,10})-?$/.exec(normalized);
  const hasDigits = /\d/.test(normalized);
  if (prefixMatch && !hasDigits) {
    return getNextPartNumberForPrefix(prefixMatch[1]);
  }

  return trimmed;
}

function normalizeTaskTargets(task: Task): Task {
  const workstreamIds = uniqueIds(
    task.workstreamIds.length > 0 ? task.workstreamIds : [task.workstreamId],
  );
  const subsystemIds = uniqueIds(
    task.subsystemIds.length > 0 ? task.subsystemIds : [task.subsystemId],
  );
  const mechanismIds = uniqueIds(
    task.mechanismIds.length > 0 ? task.mechanismIds : [task.mechanismId],
  );
  const partInstanceIds = uniqueIds(
    task.partInstanceIds.length > 0 ? task.partInstanceIds : [task.partInstanceId],
  );
  const artifactIds = uniqueIds(
    task.artifactIds.length > 0 ? task.artifactIds : [task.artifactId],
  );
  const taskAssigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
  const assigneeIds = uniqueIds(
    taskAssigneeIds.length > 0 ? taskAssigneeIds : [task.ownerId],
  );

  return {
    ...task,
    workstreamId: workstreamIds[0] ?? null,
    workstreamIds,
    subsystemId: subsystemIds[0] ?? task.subsystemId,
    subsystemIds,
    mechanismId: mechanismIds[0] ?? null,
    mechanismIds,
    partInstanceId: partInstanceIds[0] ?? null,
    partInstanceIds,
    artifactId: artifactIds[0] ?? null,
    artifactIds,
    assigneeIds,
  };
}

export type { FindingListItem } from "./store/reportDerivations";

export type TaskTargetType =
  | "project"
  | "workstream"
  | "subsystem"
  | "mechanism"
  | "part-instance"
  | "artifact"
  | "milestone";

export interface TaskTargetLink {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  workstreamId: string | null;
  subsystemId: string;
  targetType: TaskTargetType;
  targetId: string;
}

function flattenTaskTargets(task: Task): TaskTargetLink[] {
  const links: TaskTargetLink[] = [];

  links.push({
    id: `${task.id}:project:${task.projectId}`,
    taskId: task.id,
    taskTitle: task.title,
    projectId: task.projectId,
    workstreamId: task.workstreamId,
    subsystemId: task.subsystemId,
    targetType: "project",
    targetId: task.projectId,
  });

  const workstreamIds = uniqueIds([...task.workstreamIds, task.workstreamId]);
  for (const workstreamId of workstreamIds) {
    links.push({
      id: `${task.id}:workstream:${workstreamId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "workstream",
      targetId: workstreamId,
    });
  }

  const subsystemIds = uniqueIds([...task.subsystemIds, task.subsystemId]);
  for (const subsystemId of subsystemIds) {
    links.push({
      id: `${task.id}:subsystem:${subsystemId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "subsystem",
      targetId: subsystemId,
    });
  }

  const mechanismIds = uniqueIds([...task.mechanismIds, task.mechanismId]);
  for (const mechanismId of mechanismIds) {
    links.push({
      id: `${task.id}:mechanism:${mechanismId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "mechanism",
      targetId: mechanismId,
    });
  }

  const partInstanceIds = uniqueIds([...task.partInstanceIds, task.partInstanceId]);
  for (const partInstanceId of partInstanceIds) {
    links.push({
      id: `${task.id}:part-instance:${partInstanceId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "part-instance",
      targetId: partInstanceId,
    });
  }

  const artifactIds = uniqueIds([...task.artifactIds, task.artifactId]);
  for (const artifactId of artifactIds) {
    links.push({
      id: `${task.id}:artifact:${artifactId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "artifact",
      targetId: artifactId,
    });
  }

  if (task.targetMilestoneId) {
    links.push({
      id: `${task.id}:milestone:${task.targetMilestoneId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "milestone",
      targetId: task.targetMilestoneId,
    });
  }

  return links;
}

const DEFAULT_SEASON_PROJECTS: Array<{
  key: string;
  name: string;
  projectType: Project["projectType"];
}> = [
  { key: "robot", name: "Robot", projectType: "robot" },
  { key: "media", name: "Media", projectType: "other" },
  { key: "outreach", name: "Outreach", projectType: "outreach" },
  { key: "operations", name: "Operations", projectType: "operations" },
  { key: "strategy", name: "Strategy", projectType: "other" },
  { key: "training", name: "Training", projectType: "other" },
];

const TUTORIAL_SEASON_ID = "default-season";
const TUTORIAL_SEASON_NAME = "Tutorial Season";
const EXPECTED_TUTORIAL_PROJECT_NAMES = [
  "Tutorial Robot 2026",
  "Media",
  "Outreach",
  "Operations",
  "Strategy",
  "Training",
] as const;

const ROBOT_DEFAULT_MECHANISM_TEMPLATES: Array<{
  key: string;
  name: string;
  description: string;
}> = [
  {
    key: "left-front-module",
    name: "Left Front Module",
    description: "Swerve drive and steering assembly for the front-left corner.",
  },
  {
    key: "right-front-module",
    name: "Right Front Module",
    description: "Swerve drive and steering assembly for the front-right corner.",
  },
  {
    key: "left-back-module",
    name: "Left Back Module",
    description: "Swerve drive and steering assembly for the rear-left corner.",
  },
  {
    key: "right-back-module",
    name: "Right Back Module",
    description: "Swerve drive and steering assembly for the rear-right corner.",
  },
  {
    key: "chassis",
    name: "Chassis",
    description: "Primary frame rails and structural mounting interfaces.",
  },
];

function buildRobotProjectDefaults(
  projectId: string,
  subsystemIds: Set<string>,
  mechanismIds: Set<string>,
) {
  const subsystemId =
    uniqueId(toSlug(`${projectId}-drivetrain`) || "drivetrain", subsystemIds);
  subsystemIds.add(subsystemId);

  const subsystem: Subsystem = {
    id: subsystemId,
    projectId,
    name: "Drivetrain",
    description:
      "Core drivetrain with four swerve modules and chassis integration.",
    iteration: 1,
    isArchived: false,
    isCore: true,
    parentSubsystemId: null,
    responsibleEngineerId: null,
    mentorIds: [],
    risks: [],
  };

  const mechanisms: Mechanism[] = ROBOT_DEFAULT_MECHANISM_TEMPLATES.map(
    (template) => {
      const mechanismId =
        uniqueId(
          toSlug(`${projectId}-${template.key}`) || template.key,
          mechanismIds,
        );
      mechanismIds.add(mechanismId);

      return {
        id: mechanismId,
        subsystemId,
        name: template.name,
        description: template.description,
        iteration: 1,
        isArchived: false,
      };
    },
  );

  return {
    subsystems: [subsystem],
    mechanisms,
  };
}

function resolveTaskOwnershipForSubsystem(subsystemId: string) {
  const subsystem = currentSnapshot.subsystems.find(
    (candidate) => candidate.id === subsystemId,
  );
  if (!subsystem) {
    return null;
  }

  const projectId = currentSnapshot.projects.some(
    (project) => project.id === subsystem.projectId,
  )
    ? subsystem.projectId
    : currentSnapshot.projects[0]?.id;
  if (!projectId) {
    return null;
  }

  const matchingWorkstream = subsystem
    ? currentSnapshot.workstreams.find(
        (workstream) =>
          workstream.projectId === projectId &&
          workstream.name.toLowerCase() === subsystem.name.toLowerCase(),
      ) ?? null
    : null;

  return {
    projectId,
    workstreamId: matchingWorkstream?.id ?? null,
  };
}

function createMechanismWiringTask(mechanism: Mechanism): Task | null {
  const subsystem = currentSnapshot.subsystems.find(
    (candidate) => candidate.id === mechanism.subsystemId,
  );
  if (!subsystem) {
    return null;
  }

  const ownership = resolveTaskOwnershipForSubsystem(subsystem.id);
  if (!ownership) {
    return null;
  }

  const taskIds = new Set(currentSnapshot.tasks.map((task) => task.id));
  const task: Task = {
    id: uniqueId(toSlug(`Wire ${mechanism.name}`) || "wire-task", taskIds),
    createdAt: new Date().toISOString(),
    projectId: ownership.projectId,
    workstreamId: ownership.workstreamId,
    workstreamIds: uniqueIds([ownership.workstreamId]),
    title: `Wire ${mechanism.name}`,
    summary: `Complete wiring and harness verification for ${mechanism.name}.`,
    subsystemId: subsystem.id,
    subsystemIds: [subsystem.id],
    disciplineId: "electrical",
    mechanismId: mechanism.id,
    mechanismIds: [mechanism.id],
    partInstanceId: null,
    partInstanceIds: [],
    artifactId: null,
    artifactIds: [],
    targetMilestoneId: null,
    ownerId: subsystem.responsibleEngineerId,
    assigneeIds: uniqueIds([subsystem.responsibleEngineerId]),
    mentorId: subsystem.mentorIds[0] ?? null,
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "medium",
    status: "not-started",
    estimatedHours: 4,
    actualHours: 0,
    checklistItems: [],
    blockers: [],

    linkedManufacturingIds: [],
    linkedPurchaseIds: [],
    requiresDocumentation: true,
    documentationLinked: false,
  };

  return task;
}

function normalizeDisciplineIdForProject(projectId: string, disciplineId: string) {
  const project = currentSnapshot.projects.find((candidate) => candidate.id === projectId);
  return isTaskDisciplineAllowedForProject(project, disciplineId)
    ? disciplineId
    : getDefaultTaskDisciplineIdForProject(project);
}

function createSubsystemIntegrationTask(subsystem: Subsystem): Task | null {
  if (!subsystem.parentSubsystemId) {
    return null;
  }

  const parentSubsystem = currentSnapshot.subsystems.find(
    (candidate) => candidate.id === subsystem.parentSubsystemId,
  );
  if (!parentSubsystem) {
    return null;
  }

  const ownership = resolveTaskOwnershipForSubsystem(parentSubsystem.id);
  if (!ownership) {
    return null;
  }

  const taskIds = new Set(currentSnapshot.tasks.map((task) => task.id));
  const task: Task = {
    id: uniqueId(toSlug(`Integrate ${subsystem.name}`) || "integration-task", taskIds),
    createdAt: new Date().toISOString(),
    projectId: ownership.projectId,
    workstreamId: null,
    workstreamIds: [],
    title: `Integrate ${subsystem.name}`,
    summary: `Complete integration and interface verification for ${subsystem.name}.`,
    subsystemId: parentSubsystem.id,
    subsystemIds: [parentSubsystem.id],
    disciplineId: "testing",
    mechanismId: null,
    mechanismIds: [],
    partInstanceId: null,
    partInstanceIds: [],
    artifactId: null,
    artifactIds: [],
    targetMilestoneId: null,
    ownerId: parentSubsystem.responsibleEngineerId,
    assigneeIds: uniqueIds([parentSubsystem.responsibleEngineerId]),
    mentorId: parentSubsystem.mentorIds[0] ?? null,
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "medium",
    status: "not-started",
    estimatedHours: 4,
    actualHours: 0,
    checklistItems: [],
    blockers: [],

    linkedManufacturingIds: [],
    linkedPurchaseIds: [],
    requiresDocumentation: true,
    documentationLinked: false,
  };

  return task;
}

function nextWorkLogId() {
  const highestSequence = currentSnapshot.workLogs.reduce((max, workLog) => {
    const match = /^log-(\d+)$/.exec(workLog.id);
    if (!match) {
      return max;
    }

    return Math.max(max, Number(match[1]));
  }, 0);

  return `log-${highestSequence + 1}`;
}

function nextActionId() {
  const highestSequence = (currentSnapshot.actions ?? []).reduce((max, action) => {
    const match = /^action-(\d+)$/.exec(action.id);
    if (!match) {
      return max;
    }

    return Math.max(max, Number(match[1]));
  }, 0);

  return `action-${highestSequence + 1}`;
}

function resolveEntityLabel(value: string | null | undefined, fallbackId: string) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallbackId;
}

function formatEntityTypeLabel(entityType: string) {
  const normalized = entityType.replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return "record";
  }

  return normalized;
}

function buildActionMessage(args: {
  operation: AuditActionOperation;
  entityType: string;
  entityLabel: string;
  changedFields: string[];
}) {
  const verb =
    args.operation === "create"
      ? "Created"
      : args.operation === "update"
        ? "Updated"
        : "Deleted";
  const entityTypeLabel = formatEntityTypeLabel(args.entityType);

  if (args.operation === "update" && args.changedFields.length > 0) {
    return `${verb} ${entityTypeLabel} ${args.entityLabel} (${args.changedFields.join(", ")})`;
  }

  return `${verb} ${entityTypeLabel} ${args.entityLabel}`;
}

function collectChangedFields(previous: object, next: object) {
  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
  return Array.from(keys)
    .filter((key) => {
      const previousValue = previousRecord[key];
      const nextValue = nextRecord[key];

      if (typeof previousValue === "function" || typeof nextValue === "function") {
        return false;
      }

      return JSON.stringify(previousValue) !== JSON.stringify(nextValue);
    })
    .sort((left, right) => left.localeCompare(right));
}

function collectProvidedFields(input: Record<string, unknown>) {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort((left, right) => left.localeCompare(right));
}

function isSensitiveAuditField(fieldName: string) {
  return SENSITIVE_AUDIT_FIELD_PATTERN.test(fieldName);
}

function summarizeAuditValue(fieldName: string, value: unknown): unknown {
  if (isSensitiveAuditField(fieldName)) {
    return REDACTED_AUDIT_VALUE;
  }

  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      count: value.length,
      values: value
        .slice(0, 10)
        .map((item) => summarizeAuditValue(fieldName, item)),
    };
  }

  if (typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value as Record<string, unknown>).sort((left, right) =>
        left.localeCompare(right),
      ),
    };
  }

  return String(value);
}

function buildAuditSummary(
  record: object,
  changedFields: string[],
) {
  const auditRecord = record as Record<string, unknown>;
  return Object.fromEntries(
    changedFields.map((fieldName) => [
      fieldName,
      summarizeAuditValue(fieldName, auditRecord[fieldName]),
    ]),
  );
}

export function recordAuditAction(args: {
  operation: AuditActionOperation;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  changedFields?: string[];
  beforeJson?: object;
  afterJson?: object;
  projectId?: string | null;
  projectIds?: Array<string | null | undefined>;
  taskId?: string | null;
  subsystemId?: string | null;
  actorMemberId?: string | null;
  requestId?: string | null;
  memberIds?: Array<string | null | undefined>;
  detailsJson?: Record<string, unknown>;
}) {
  const entityLabel = resolveEntityLabel(args.entityLabel, args.entityId);
  const changedFields = uniqueIds(args.changedFields ?? []).sort((left, right) =>
    left.localeCompare(right),
  );
  const projectIds = uniqueIds([...(args.projectIds ?? []), args.projectId]);
  const action: AuditAction = {
    id: nextActionId(),
    timestamp: new Date().toISOString(),
    operation: args.operation,
    entityType: args.entityType,
    entityId: args.entityId,
    entityLabel,
    message: buildActionMessage({
      operation: args.operation,
      entityType: args.entityType,
      entityLabel,
      changedFields,
    }),
    changedFields,
    ...(args.beforeJson ? { beforeJson: buildAuditSummary(args.beforeJson, changedFields) } : {}),
    ...(args.afterJson ? { afterJson: buildAuditSummary(args.afterJson, changedFields) } : {}),
    ...(args.detailsJson ? { detailsJson: args.detailsJson } : {}),
    requestId: args.requestId ?? null,
    projectId: projectIds[0] ?? null,
    ...(projectIds.length > 0 ? { projectIds } : {}),
    taskId: args.taskId ?? null,
    subsystemId: args.subsystemId ?? null,
    actorMemberId: args.actorMemberId ?? null,
    memberIds: uniqueIds(args.memberIds ?? []),
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    actions: [...(currentSnapshot.actions ?? []), action],
  });
}

export function getSnapshot() {
  return currentSnapshot;
}

export function getFavoriteViews(userKey: string) {
  return (currentSnapshot.favoriteViews ?? [])
    .filter((favorite) => favorite.userKey === userKey)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function setFavoriteView(
  userKey: string,
  viewId: string,
  isFavorite: boolean,
) {
  const favoriteViews = currentSnapshot.favoriteViews ?? [];
  const existingFavorite = favoriteViews.find(
    (favorite) => favorite.userKey === userKey && favorite.viewId === viewId,
  );

  if (isFavorite && !existingFavorite) {
    const favorite: FavoriteView = {
      id: uniqueId(`favorite-${toSlug(userKey)}-${viewId}`, new Set(favoriteViews.map((item) => item.id))),
      userKey,
      viewId,
      createdAt: new Date().toISOString(),
    };

    replaceCurrentSnapshot({
      ...currentSnapshot,
      favoriteViews: [...favoriteViews, favorite],
    });
  }

  if (!isFavorite && existingFavorite) {
    replaceCurrentSnapshot({
      ...currentSnapshot,
      favoriteViews: favoriteViews.filter((favorite) => favorite.id !== existingFavorite.id),
    });
  }

  return getFavoriteViews(userKey);
}

export interface TutorialBaselineState {
  seasonId: string | null;
  seasonName: string | null;
  expectedProjectNames: string[];
  projectIdsByName: Record<string, string>;
  missingProjectNames: string[];
}

function buildTutorialBaselineState(snapshot: PlatformSnapshot): TutorialBaselineState {
  const tutorialSeason =
    snapshot.seasons.find((season) => season.id === TUTORIAL_SEASON_ID) ??
    snapshot.seasons.find((season) => season.name === TUTORIAL_SEASON_NAME) ??
    null;
  const tutorialSeasonId = tutorialSeason?.id ?? null;
  const tutorialSeasonName = tutorialSeason?.name ?? null;
  const seasonProjects =
    tutorialSeasonId === null
      ? []
      : snapshot.projects.filter((project) => project.seasonId === tutorialSeasonId);
  const projectIdsByName: Record<string, string> = {};

  for (const expectedProjectName of EXPECTED_TUTORIAL_PROJECT_NAMES) {
    const project = seasonProjects.find(
      (candidate) => candidate.name === expectedProjectName,
    );

    if (project) {
      projectIdsByName[expectedProjectName] = project.id;
    }
  }

  const missingProjectNames = EXPECTED_TUTORIAL_PROJECT_NAMES.filter(
    (name) => projectIdsByName[name] === undefined,
  );

  return {
    seasonId: tutorialSeasonId,
    seasonName: tutorialSeasonName,
    expectedProjectNames: [...EXPECTED_TUTORIAL_PROJECT_NAMES],
    projectIdsByName,
    missingProjectNames,
  };
}

export function getTutorialBaselineState() {
  return buildTutorialBaselineState(currentSnapshot);
}

export function resetStore() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  globalSnapshotState.current = canonicalizeSnapshot(createTutorialSnapshot());
  globalSnapshotState.interactive = null;
  tutorialSnapshotStates.clear();
}

export function resetTutorialBaseline(userKey?: string) {
  if (userKey) {
    const state = tutorialSnapshotStates.get(userKey);
    if (!state) {
      return buildTutorialBaselineState(createTutorialSnapshot());
    }

    state.current = canonicalizeSnapshot(createTutorialSnapshot());
    return buildTutorialBaselineState(state.current);
  }

  const tutorialSnapshot = getInteractiveTutorialSnapshot();
  replaceCurrentSnapshot(canonicalizeSnapshot(createTutorialSnapshot()));
  setInteractiveTutorialSnapshot(tutorialSnapshot);
  return getTutorialBaselineState();
}

export function startInteractiveTutorialSession(userKey?: string) {
  if (userKey) {
    const current = canonicalizeSnapshot(createTutorialSnapshot());
    tutorialSnapshotStates.set(userKey, {
      current,
      interactive: structuredClone(current),
    });
    return;
  }

  setInteractiveTutorialSnapshot(structuredClone(activeSnapshotState().current));
  replaceCurrentSnapshot(canonicalizeSnapshot(createTutorialSnapshot()));
}

export function resetInteractiveTutorialSession(userKey?: string) {
  if (userKey) {
    const state = tutorialSnapshotStates.get(userKey);
    if (!state?.interactive) {
      return false;
    }

    state.current = structuredClone(state.interactive);
    state.interactive = null;
    tutorialSnapshotStates.delete(userKey);
    return true;
  }

  const tutorialSnapshot = getInteractiveTutorialSnapshot();
  if (!tutorialSnapshot) {
    return false;
  }

  replaceCurrentSnapshot(structuredClone(tutorialSnapshot));
  setInteractiveTutorialSnapshot(null);
  return true;
}

export function getSeasons() {
  return currentSnapshot.seasons;
}

export function createSeason(input: SeasonInput) {
  const seasonIds = new Set(currentSnapshot.seasons.map((season) => season.id));
  const seasonId = uniqueId(toSlug(input.name) || "season", seasonIds);
  const season: Season = {
    id: seasonId,
    name: input.name,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
  };

  const projectIds = new Set(currentSnapshot.projects.map((project) => project.id));
  const teamId = getDefaultProjectTeamId(currentSnapshot);
  const projects: Project[] = DEFAULT_SEASON_PROJECTS.map((template) => {
    const projectId = uniqueId(`${seasonId}-${template.key}`, projectIds);
    projectIds.add(projectId);

    return {
      id: projectId,
      teamId,
      seasonId: season.id,
      name: template.name,
      projectType: template.projectType,
      description: `${template.name} scope for ${season.name}.`,
      status: "active",
    };
  });

  const subsystemIds = new Set(currentSnapshot.subsystems.map((subsystem) => subsystem.id));
  const mechanismIds = new Set(currentSnapshot.mechanisms.map((mechanism) => mechanism.id));
  const subsystems: Subsystem[] = [];
  const mechanisms: Mechanism[] = [];

  projects.forEach((project) => {
    if (project.projectType !== "robot") {
      return;
    }

    const defaults = buildRobotProjectDefaults(project.id, subsystemIds, mechanismIds);
    subsystems.push(...defaults.subsystems);
    mechanisms.push(...defaults.mechanisms);
  });

  replaceCurrentSnapshot({
    ...currentSnapshot,
    seasons: [...currentSnapshot.seasons, season],
    projects: [...currentSnapshot.projects, ...projects],
    subsystems: [...currentSnapshot.subsystems, ...subsystems],
    mechanisms: [...currentSnapshot.mechanisms, ...mechanisms],
  });

  recordAuditAction({
    operation: "create",
    entityType: "season",
    entityId: season.id,
    entityLabel: season.name,
  });

  return season;
}

export function getProjects() {
  return currentSnapshot.projects;
}

export function createProject(input: ProjectInput) {
  const projectIds = new Set(currentSnapshot.projects.map((project) => project.id));
  const season = currentSnapshot.seasons.find((candidate) => candidate.id === input.seasonId);
  const teamId = normalizeProjectTeamId(input.teamId ?? getDefaultProjectTeamId(currentSnapshot));
  const project: Project = {
    id: uniqueId(toSlug(`${input.seasonId}-${input.name}`) || "project", projectIds),
    teamId,
    seasonId: input.seasonId,
    name: input.name,
    projectType: input.projectType,
    description: input.description ?? `${input.name} scope${season ? ` for ${season.name}` : ""}.`,
    status: input.status ?? "active",
  };

  const subsystemIds = new Set(currentSnapshot.subsystems.map((subsystem) => subsystem.id));
  const mechanismIds = new Set(currentSnapshot.mechanisms.map((mechanism) => mechanism.id));
  const defaults =
    project.projectType === "robot"
      ? buildRobotProjectDefaults(project.id, subsystemIds, mechanismIds)
      : { subsystems: [] as Subsystem[], mechanisms: [] as Mechanism[] };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    projects: [...currentSnapshot.projects, project],
    subsystems: [...currentSnapshot.subsystems, ...defaults.subsystems],
    mechanisms: [...currentSnapshot.mechanisms, ...defaults.mechanisms],
  });

  recordAuditAction({
    operation: "create",
    entityType: "project",
    entityId: project.id,
    entityLabel: project.name,
    projectId: project.id,
  });

  return project;
}

export function updateProject(
  projectId: string,
  input: Partial<Pick<ProjectInput, "description" | "name" | "status">>,
) {
  const previousProject = currentSnapshot.projects.find((project) => project.id === projectId);
  let updatedProject: Project | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    projects: currentSnapshot.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      updatedProject = {
        ...project,
        ...input,
      };

      return updatedProject;
    }),
  });

  const savedProject = currentSnapshot.projects.find((project) => project.id === projectId);
  if (previousProject && savedProject) {
    recordAuditAction({
      operation: "update",
      entityType: "project",
      entityId: savedProject.id,
      entityLabel: savedProject.name,
      projectId: savedProject.id,
      changedFields: collectChangedFields(
        previousProject,
        savedProject,
      ),
    });
  }

  return updatedProject;
}

export function getWorkstreams() {
  return currentSnapshot.workstreams;
}

export function createWorkstream(input: WorkstreamInput) {
  const workstreamIds = new Set(
    currentSnapshot.workstreams.map((workstream) => workstream.id),
  );
  const workstream: Workstream = {
    id: uniqueId(toSlug(input.name) || "workstream", workstreamIds),
    projectId: input.projectId,
    name: input.name,
    color: normalizeWorkspaceColor(input.color),
    description: input.description,
    isArchived: input.isArchived ?? false,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    workstreams: [...currentSnapshot.workstreams, workstream],
  });

  recordAuditAction({
    operation: "create",
    entityType: "workstream",
    entityId: workstream.id,
    entityLabel: workstream.name,
    projectId: workstream.projectId,
  });

  return workstream;
}

export function updateWorkstream(workstreamId: string, input: Partial<WorkstreamInput>) {
  const previousWorkstream = currentSnapshot.workstreams.find(
    (workstream) => workstream.id === workstreamId,
  );
  let updatedWorkstream: Workstream | null = null;
  const nextColor =
    input.color === undefined ? undefined : normalizeWorkspaceColor(input.color);

  replaceCurrentSnapshot({
    ...currentSnapshot,
    workstreams: currentSnapshot.workstreams.map((workstream) => {
      if (workstream.id !== workstreamId) {
        return workstream;
      }

      updatedWorkstream = {
        ...workstream,
        ...input,
        color: input.color === undefined ? workstream.color : nextColor,
      };

      return updatedWorkstream;
    }),
  });

  const savedWorkstream = currentSnapshot.workstreams.find(
    (workstream) => workstream.id === workstreamId,
  );
  if (previousWorkstream && savedWorkstream) {
    recordAuditAction({
      operation: "update",
      entityType: "workstream",
      entityId: savedWorkstream.id,
      entityLabel: savedWorkstream.name,
      projectId: savedWorkstream.projectId,
      changedFields: collectChangedFields(
        previousWorkstream,
        savedWorkstream,
      ),
    });
  }

  return updatedWorkstream;
}

export function getMembers() {
  return currentSnapshot.members;
}

export function getSubsystems() {
  return currentSnapshot.subsystems;
}

export function getDisciplines() {
  return currentSnapshot.disciplines;
}

export function getMechanisms() {
  return currentSnapshot.mechanisms;
}

export function getMaterials() {
  return currentSnapshot.materials;
}

export function getArtifacts() {
  return currentSnapshot.artifacts;
}

export function getPartDefinitions() {
  return currentSnapshot.partDefinitions;
}

export function getPartInstances() {
  return currentSnapshot.partInstances;
}

export function getTasks() {
  return currentSnapshot.tasks;
}

export function getMilestones() {
  return currentSnapshot.milestones;
}

export function getMilestoneRequirements() {
  return currentSnapshot.milestoneRequirements ?? [];
}

export function getTaskDependencies() {
  return currentSnapshot.taskDependencies;
}

export function getTaskBlockers() {
  return currentSnapshot.taskBlockers;
}

export function getQaReports() {
  return currentSnapshot.qaReports;
}

export function getQaRequests() {
  return currentSnapshot.qaRequests ?? [];
}

export function getTestResults() {
  return currentSnapshot.testResults;
}

export function getDesignIterations(): DesignIteration[] {
  return currentSnapshot.designIterations;
}

export function getReports(): Report[] {
  return buildReports(currentSnapshot);
}

export function getFindings(): FindingListItem[] {
  return buildFindings(currentSnapshot);
}

export function getTaskTargets() {
  return currentSnapshot.tasks.flatMap((task) => flattenTaskTargets(task));
}

export function getMilestonesForTask(taskId: string): MilestoneMatch[] {
  const task = currentSnapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return [];
  }

  const taskTargets = flattenTaskTargets(task);
  const matchedMilestoneIds = new Map<string, Set<string>>();
  const hasLegacyMilestoneTarget = new Set(
    taskTargets
      .filter((target) => target.targetType === "milestone")
      .map((target) => target.targetId),
  );
  const requirements = getMilestoneRequirements();

  for (const target of taskTargets) {
    for (const requirement of requirements) {
      if (
        !matchesMilestoneRequirement({
          milestoneRequirement: requirement,
          targetType: target.targetType,
          targetId: target.targetId,
        })
      ) {
        continue;
      }

      const previous = matchedMilestoneIds.get(requirement.milestoneId) ?? new Set<string>();
      previous.add(requirement.id);
      matchedMilestoneIds.set(requirement.milestoneId, previous);
    }
  }

  for (const milestoneId of hasLegacyMilestoneTarget) {
    if (!matchedMilestoneIds.has(milestoneId)) {
      matchedMilestoneIds.set(milestoneId, new Set<string>());
    }
  }

  const milestoneOrder = new Map(
    currentSnapshot.milestones.map((milestone, index) => [milestone.id, index] as const),
  );

  return Array.from(matchedMilestoneIds.entries())
    .sort(([left], [right]) => {
      return (milestoneOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (milestoneOrder.get(right) ?? Number.MAX_SAFE_INTEGER);
    })
    .map(([milestoneId, requirementIds]) => ({
      milestoneId,
      matchedRequirementIds: Array.from(requirementIds),
      isLegacyLink: hasLegacyMilestoneTarget.has(milestoneId),
    }));
}

export function getTasksForMilestone(milestoneId: string): TaskMilestoneMatch[] {
  const requirements = getMilestoneRequirements().filter((requirement) => requirement.milestoneId === milestoneId);
  if (requirements.length === 0) {
    return currentSnapshot.tasks
      .filter((task) =>
        flattenTaskTargets(task).some(
          (target) => target.targetType === "milestone" && target.targetId === milestoneId,
        ),
      )
      .map((task) => ({
        taskId: task.id,
        matchedRequirementIds: [],
        isLegacyLink: true,
      }));
  }

  const matches = currentSnapshot.tasks
    .map((task) => {
      const taskTargets = flattenTaskTargets(task);
      const matchedRequirementIds = new Set<string>();
      let isLegacyLink = false;

      for (const target of taskTargets) {
        if (target.targetType === "milestone" && target.targetId === milestoneId) {
          isLegacyLink = true;
        }

        for (const requirement of requirements) {
          if (
            matchesMilestoneRequirement({
              milestoneRequirement: requirement,
              targetType: target.targetType,
              targetId: target.targetId,
            })
          ) {
            matchedRequirementIds.add(requirement.id);
          }
        }
      }

      if (matchedRequirementIds.size > 0 || isLegacyLink) {
        return {
          taskId: task.id,
          matchedRequirementIds: Array.from(matchedRequirementIds),
          isLegacyLink,
        };
      }

      return null;
    })
    .filter((match): match is TaskMilestoneMatch => match !== null);

  return matches;
}

export function getRisks() {
  return currentSnapshot.risks;
}

function getSubsystemProjectId(subsystemId: string | null | undefined) {
  return currentSnapshot.subsystems.find((subsystem) => subsystem.id === subsystemId)
    ?.projectId;
}

function getSeasonAuditDetails(...records: Array<{
  seasonId?: string | null;
  activeSeasonIds?: string[];
}>) {
  const seasonIds = uniqueIds(
    records.flatMap((record) => [
      record.seasonId,
      ...(record.activeSeasonIds ?? []),
    ]),
  );
  const latestRecord = records[records.length - 1];
  return {
    ...(typeof latestRecord?.seasonId === "string" ? { seasonId: latestRecord.seasonId } : {}),
    activeSeasonIds: seasonIds,
  };
}

function getRiskProjectIds(risk: Risk) {
  const projectIds: Array<string | null | undefined> = [];

  if (risk.attachmentType === "project") {
    projectIds.push(risk.attachmentId);
  }

  if (risk.attachmentType === "workstream") {
    const workstream = currentSnapshot.workstreams.find(
      (candidate) => candidate.id === risk.attachmentId,
    );
    projectIds.push(workstream?.projectId);
  }

  if (risk.attachmentType === "mechanism") {
    const mechanism = currentSnapshot.mechanisms.find(
      (candidate) => candidate.id === risk.attachmentId,
    );
    const subsystem = currentSnapshot.subsystems.find(
      (candidate) => candidate.id === mechanism?.subsystemId,
    );
    projectIds.push(subsystem?.projectId);
  }

  if (risk.attachmentType === "part-instance") {
    const partInstance = currentSnapshot.partInstances.find(
      (candidate) => candidate.id === risk.attachmentId,
    );
    const subsystem = currentSnapshot.subsystems.find(
      (candidate) => candidate.id === partInstance?.subsystemId,
    );
    projectIds.push(subsystem?.projectId);
  }

  const mitigationTask = currentSnapshot.tasks.find(
    (candidate) => candidate.id === risk.mitigationTaskId,
  );
  projectIds.push(mitigationTask?.projectId);

  return uniqueIds(projectIds);
}

export function createRisk(input: RiskInput) {
  const riskIds = new Set(currentSnapshot.risks.map((risk) => risk.id));
  const risk: Risk = {
    id: uniqueId(toSlug(input.title) || "risk", riskIds),
    title: input.title,
    detail: input.detail,
    severity: input.severity,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    attachmentType: input.attachmentType,
    attachmentId: input.attachmentId,
    mitigationTaskId: input.mitigationTaskId,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    risks: [...currentSnapshot.risks, risk],
  });

  recordAuditAction({
    operation: "create",
    entityType: "risk",
    entityId: risk.id,
    entityLabel: risk.title,
    projectIds: getRiskProjectIds(risk),
    taskId: risk.mitigationTaskId,
  });

  return risk;
}

export function updateRisk(riskId: string, input: Partial<RiskInput>) {
  const previousRisk = currentSnapshot.risks.find((risk) => risk.id === riskId);
  let updatedRisk: Risk | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    risks: currentSnapshot.risks.map((risk) => {
      if (risk.id !== riskId) {
        return risk;
      }

      updatedRisk = {
        ...risk,
        ...input,
        mitigationTaskId:
          input.mitigationTaskId === undefined
            ? risk.mitigationTaskId
            : input.mitigationTaskId,
      };

      return updatedRisk;
    }),
  });

  const savedRisk = currentSnapshot.risks.find((risk) => risk.id === riskId);
  if (previousRisk && savedRisk) {
    const projectIds = uniqueIds([
      ...getRiskProjectIds(previousRisk),
      ...getRiskProjectIds(savedRisk),
    ]);
    recordAuditAction({
      operation: "update",
      entityType: "risk",
      entityId: savedRisk.id,
      entityLabel: savedRisk.title,
      projectIds,
      taskId: savedRisk.mitigationTaskId,
      changedFields: collectChangedFields(
        previousRisk,
        savedRisk,
      ),
    });
  }

  return updatedRisk;
}

export function removeRisk(riskId: string) {
  const risk = currentSnapshot.risks.find((candidate) => candidate.id === riskId);
  if (!risk) {
    return null;
  }
  const projectIds = getRiskProjectIds(risk);

  replaceCurrentSnapshot({
    ...currentSnapshot,
    risks: currentSnapshot.risks.filter((candidate) => candidate.id !== riskId),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "risk",
    entityId: risk.id,
    entityLabel: risk.title,
    projectIds,
    taskId: risk.mitigationTaskId,
    detailsJson: {
      attachmentType: risk.attachmentType,
      attachmentId: risk.attachmentId,
      projectIds,
    },
  });

  return risk;
}

export function getPurchaseItems() {
  return currentSnapshot.purchaseItems;
}

export function getManufacturingItems() {
  return currentSnapshot.manufacturingItems;
}

export function createMaterial(input: MaterialInput) {
  const materialIds = new Set(currentSnapshot.materials.map((material) => material.id));
  const material: Material = {
    id: uniqueId(toSlug(input.name) || "material", materialIds),
    name: input.name,
    category: input.category,
    unit: input.unit,
    onHandQuantity: input.onHandQuantity,
    reorderPoint: input.reorderPoint,
    location: input.location,
    vendor: input.vendor,
    notes: input.notes,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    materials: [...currentSnapshot.materials, material],
  });

  recordAuditAction({
    operation: "create",
    entityType: "material",
    entityId: material.id,
    entityLabel: material.name,
  });

  return material;
}

export function updateMaterial(materialId: string, input: Partial<MaterialInput>) {
  const previousMaterial = currentSnapshot.materials.find((material) => material.id === materialId);
  let updatedMaterial: Material | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    materials: currentSnapshot.materials.map((material) => {
      if (material.id !== materialId) {
        return material;
      }

      updatedMaterial = {
        ...material,
        ...input,
      };

      return updatedMaterial;
    }),
  });

  const savedMaterial = currentSnapshot.materials.find((material) => material.id === materialId);
  if (previousMaterial && savedMaterial) {
    recordAuditAction({
      operation: "update",
      entityType: "material",
      entityId: savedMaterial.id,
      entityLabel: savedMaterial.name,
      changedFields: collectChangedFields(
        previousMaterial,
        savedMaterial,
      ),
    });
  }

  return updatedMaterial;
}

export function removeMaterial(materialId: string) {
  const material = currentSnapshot.materials.find(
    (candidate) => candidate.id === materialId,
  );
  if (!material) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    materials: currentSnapshot.materials.filter(
      (candidate) => candidate.id !== materialId,
    ),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "material",
    entityId: material.id,
    entityLabel: material.name,
  });

  return material;
}

export function createArtifact(input: ArtifactInput) {
  const artifactIds = new Set(currentSnapshot.artifacts.map((artifact) => artifact.id));
  const artifact: Artifact = {
    id: uniqueId(toSlug(input.title) || "artifact", artifactIds),
    projectId: input.projectId,
    workstreamId: input.workstreamId,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    status: input.status,
    link: input.link,
    isArchived: input.isArchived ?? false,
    updatedAt: input.updatedAt,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    artifacts: [...currentSnapshot.artifacts, artifact],
  });

  recordAuditAction({
    operation: "create",
    entityType: "artifact",
    entityId: artifact.id,
    entityLabel: artifact.title,
    projectId: artifact.projectId,
  });

  return artifact;
}

export function updateArtifact(artifactId: string, input: Partial<ArtifactInput>) {
  const previousArtifact = currentSnapshot.artifacts.find((artifact) => artifact.id === artifactId);
  let updatedArtifact: Artifact | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    artifacts: currentSnapshot.artifacts.map((artifact) => {
      if (artifact.id !== artifactId) {
        return artifact;
      }

      updatedArtifact = {
        ...artifact,
        ...input,
      };

      return updatedArtifact;
    }),
  });

  const savedArtifact = currentSnapshot.artifacts.find((artifact) => artifact.id === artifactId);
  if (previousArtifact && savedArtifact) {
    recordAuditAction({
      operation: "update",
      entityType: "artifact",
      entityId: savedArtifact.id,
      entityLabel: savedArtifact.title,
      projectId: savedArtifact.projectId,
      changedFields: collectChangedFields(
        previousArtifact,
        savedArtifact,
      ),
    });
  }

  return updatedArtifact;
}

export function removeArtifact(artifactId: string) {
  const artifact = currentSnapshot.artifacts.find(
    (candidate) => candidate.id === artifactId,
  );
  if (!artifact) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    artifacts: currentSnapshot.artifacts.filter(
      (candidate) => candidate.id !== artifactId,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      if (task.artifactId !== artifactId && !task.artifactIds.includes(artifactId)) {
        return task;
      }

      const artifactIds = task.artifactIds.filter(
        (candidateArtifactId) => candidateArtifactId !== artifactId,
      );
      return normalizeTaskTargets({
        ...task,
        artifactId: artifactIds[0] ?? null,
        artifactIds,
      });
    }),
    designIterations: currentSnapshot.designIterations.map((iteration) =>
      iteration.artifactId === artifactId
        ? {
            ...iteration,
            artifactId: null,
          }
        : iteration,
    ),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "artifact",
    entityId: artifact.id,
    entityLabel: artifact.title,
    projectId: artifact.projectId,
  });

  return artifact;
}

export function createSubsystem(input: SubsystemInput) {
  const subsystemIds = new Set(currentSnapshot.subsystems.map((subsystem) => subsystem.id));
  const subsystem: Subsystem = {
    id: uniqueId(toSlug(input.name) || "subsystem", subsystemIds),
    ...normalizePmCadProvenance(input),
    layoutX: input.layoutX ?? null,
    layoutY: input.layoutY ?? null,
    layoutZone: input.layoutZone ?? "unplaced",
    layoutView: input.layoutView ?? "top",
    sortOrder: input.sortOrder ?? null,
    projectId: input.projectId,
    name: input.name,
    serialAlias: normalizeSubsystemSerialAlias(input.serialAlias),
    color: normalizeWorkspaceColor(input.color),
    description: input.description,
    photoUrl: input.photoUrl ?? "",
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
    isCore: false,
    parentSubsystemId: input.parentSubsystemId,
    responsibleEngineerId: input.responsibleEngineerId,
    mentorIds: input.mentorIds,
    risks: input.risks,
  };

  const integrationTask = createSubsystemIntegrationTask(subsystem);

  replaceCurrentSnapshot(normalizeSnapshotTaskSerials({
    ...currentSnapshot,
    subsystems: [...currentSnapshot.subsystems, subsystem],
    tasks: integrationTask ? [...currentSnapshot.tasks, integrationTask] : currentSnapshot.tasks,
  }));

  recordAuditAction({
    operation: "create",
    entityType: "subsystem",
    entityId: subsystem.id,
    entityLabel: subsystem.name,
    projectId: subsystem.projectId,
    subsystemId: subsystem.id,
    memberIds: [subsystem.responsibleEngineerId, ...subsystem.mentorIds],
    actorMemberId: subsystem.responsibleEngineerId,
  });

  if (integrationTask) {
    recordAuditAction({
      operation: "create",
      entityType: "task",
      entityId: integrationTask.id,
      entityLabel: integrationTask.title,
      projectId: integrationTask.projectId,
      subsystemId: integrationTask.subsystemId,
      taskId: integrationTask.id,
      memberIds: [integrationTask.ownerId, ...integrationTask.assigneeIds, integrationTask.mentorId],
      actorMemberId: integrationTask.ownerId,
    });
  }

  return subsystem;
}

export function updateSubsystem(subsystemId: string, input: Partial<SubsystemInput>) {
  let updatedSubsystem: Subsystem | null = null;
  const currentSubsystem = currentSnapshot.subsystems.find(
    (subsystem) => subsystem.id === subsystemId,
  );
  if (!currentSubsystem) {
    return null;
  }

  const nextParentSubsystemId = currentSubsystem.isCore
    ? null
    : input.parentSubsystemId === undefined
      ? currentSubsystem.parentSubsystemId
      : input.parentSubsystemId;
  const nextColor =
    input.color === undefined ? currentSubsystem.color : normalizeWorkspaceColor(input.color);
  const nextSerialAlias =
    input.serialAlias === undefined
      ? currentSubsystem.serialAlias
      : normalizeSubsystemSerialAlias(input.serialAlias);

  replaceCurrentSnapshot({
    ...currentSnapshot,
    subsystems: currentSnapshot.subsystems.map((subsystem) => {
      if (subsystem.id !== subsystemId) {
        return subsystem;
      }

      updatedSubsystem = {
        ...subsystem,
        ...input,
        ...normalizePmCadProvenance({
          ...subsystem,
          ...input,
          cadEditedAfterImport: markPmCadEditedAfterImport(subsystem, input),
        }),
        serialAlias: nextSerialAlias,
        color: nextColor,
        iteration:
          input.iteration === undefined
            ? subsystem.iteration
            : normalizeIteration(input.iteration),
        parentSubsystemId: nextParentSubsystemId,
      };

      return updatedSubsystem;
    }),
  });

  replaceCurrentSnapshot(normalizeSnapshotTaskSerials(currentSnapshot));

  const savedSubsystem = currentSnapshot.subsystems.find((subsystem) => subsystem.id === subsystemId);
  if (savedSubsystem) {
    recordAuditAction({
      operation: "update",
      entityType: "subsystem",
      entityId: savedSubsystem.id,
      entityLabel: savedSubsystem.name,
      projectId: savedSubsystem.projectId,
      subsystemId: savedSubsystem.id,
      memberIds: [savedSubsystem.responsibleEngineerId, ...savedSubsystem.mentorIds],
      actorMemberId: savedSubsystem.responsibleEngineerId,
      changedFields: collectChangedFields(
        currentSubsystem,
        savedSubsystem,
      ),
    });
  }

  return updatedSubsystem;
}

export function removeSubsystem(subsystemId: string) {
  const subsystem = currentSnapshot.subsystems.find(
    (candidate) => candidate.id === subsystemId,
  );
  if (!subsystem) {
    return null;
  }

  const subsystemIdsToRemove = new Set([subsystemId]);
  let foundDescendant = true;
  while (foundDescendant) {
    foundDescendant = false;
    for (const candidate of currentSnapshot.subsystems) {
      if (
        candidate.parentSubsystemId &&
        subsystemIdsToRemove.has(candidate.parentSubsystemId) &&
        !subsystemIdsToRemove.has(candidate.id)
      ) {
        subsystemIdsToRemove.add(candidate.id);
        foundDescendant = true;
      }
    }
  }

  const mechanismIdsToRemove = new Set(
    currentSnapshot.mechanisms
      .filter((mechanism) => subsystemIdsToRemove.has(mechanism.subsystemId))
      .map((mechanism) => mechanism.id),
  );
  const partInstanceIdsToRemove = new Set(
    currentSnapshot.partInstances
      .filter(
        (partInstance) =>
          subsystemIdsToRemove.has(partInstance.subsystemId) ||
          mechanismIdsToRemove.has(partInstance.mechanismId ?? ""),
      )
      .map((partInstance) => partInstance.id),
  );
  const manufacturingItemIdsToRemove = new Set(
    currentSnapshot.manufacturingItems
      .filter((item) => subsystemIdsToRemove.has(item.subsystemId))
      .map((item) => item.id),
  );
  const purchaseItemIdsToRemove = new Set(
    currentSnapshot.purchaseItems
      .filter((item) => subsystemIdsToRemove.has(item.subsystemId))
      .map((item) => item.id),
  );
  const taskIdsToRemove = new Set(
    currentSnapshot.tasks
      .filter(
        (task) =>
          subsystemIdsToRemove.has(task.subsystemId) ||
          task.subsystemIds.some((candidate) => subsystemIdsToRemove.has(candidate)) ||
          mechanismIdsToRemove.has(task.mechanismId ?? "") ||
          task.mechanismIds.some((candidate) => mechanismIdsToRemove.has(candidate)) ||
          partInstanceIdsToRemove.has(task.partInstanceId ?? "") ||
          task.partInstanceIds.some((candidate) => partInstanceIdsToRemove.has(candidate)),
      )
      .map((task) => task.id),
  );

  replaceCurrentSnapshot({
    ...currentSnapshot,
    subsystems: currentSnapshot.subsystems.filter(
      (candidate) => !subsystemIdsToRemove.has(candidate.id),
    ),
    mechanisms: currentSnapshot.mechanisms.filter(
      (mechanism) => !mechanismIdsToRemove.has(mechanism.id),
    ),
    partInstances: currentSnapshot.partInstances.filter(
      (partInstance) => !partInstanceIdsToRemove.has(partInstance.id),
    ),
    tasks: currentSnapshot.tasks
      .filter((task) => !taskIdsToRemove.has(task.id))
      .map((task) => ({
        ...task,
        linkedManufacturingIds: task.linkedManufacturingIds.filter(
          (itemId) => !manufacturingItemIdsToRemove.has(itemId),
        ),
        linkedPurchaseIds: task.linkedPurchaseIds.filter(
          (itemId) => !purchaseItemIdsToRemove.has(itemId),
        ),
      })),
    workLogs: currentSnapshot.workLogs.filter(
      (workLog) => !taskIdsToRemove.has(workLog.taskId),
    ),
    milestones: currentSnapshot.milestones.map((milestone) => milestone),
    qaReports: currentSnapshot.qaReports.filter(
      (report) => !taskIdsToRemove.has(report.taskId),
    ),
    qaRequests: getQaRequests().filter(
      (request) => !request.taskId || !taskIdsToRemove.has(request.taskId),
    ),
    risks: currentSnapshot.risks.filter((risk) => {
      if (risk.mitigationTaskId && taskIdsToRemove.has(risk.mitigationTaskId)) {
        return false;
      }

      if (
        risk.attachmentType === "mechanism" &&
        mechanismIdsToRemove.has(risk.attachmentId)
      ) {
        return false;
      }

      if (
        risk.attachmentType === "part-instance" &&
        partInstanceIdsToRemove.has(risk.attachmentId)
      ) {
        return false;
      }

      return true;
    }),
    manufacturingItems: currentSnapshot.manufacturingItems.filter(
      (item) => !manufacturingItemIdsToRemove.has(item.id),
    ),
    purchaseItems: currentSnapshot.purchaseItems.filter(
      (item) => !purchaseItemIdsToRemove.has(item.id),
    ),
    qaReviews: currentSnapshot.qaReviews.filter((review) => {
      if (review.subjectType === "task" && taskIdsToRemove.has(review.subjectId)) {
        return false;
      }

      if (
        review.subjectType === "manufacturing" &&
        manufacturingItemIdsToRemove.has(review.subjectId)
      ) {
        return false;
      }

      return true;
    }),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "subsystem",
    entityId: subsystem.id,
    entityLabel: subsystem.name,
    projectId: subsystem.projectId,
    subsystemId: subsystem.id,
    memberIds: [subsystem.responsibleEngineerId, ...subsystem.mentorIds],
    actorMemberId: subsystem.responsibleEngineerId,
  });

  return subsystem;
}

export function createPartDefinition(input: PartDefinitionInput) {
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId = input.seasonId ?? fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(input.activeSeasonIds ?? []), seasonId]);
  const partDefinitionIds = new Set(
    currentSnapshot.partDefinitions.map((partDefinition) => partDefinition.id),
  );
  const partNumber = resolvePartNumberForNewPartDefinition(
    input.partNumber,
    input.isHardware ?? false,
  );
  const partDefinition: PartDefinition = {
    id: uniqueId(toSlug(input.name) || "part-definition", partDefinitionIds),
    ...normalizePmCadProvenance(input),
    seasonId,
    activeSeasonIds: activeSeasonIds.length > 0 ? activeSeasonIds : [seasonId],
    name: input.name,
    partNumber,
    isHardware: input.isHardware ?? false,
    revision: input.revision,
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
    type: input.type,
    source: input.source,
    materialId: input.materialId,
    description: input.description,
    photoUrl: input.photoUrl ?? "",
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    partDefinitions: [...currentSnapshot.partDefinitions, partDefinition],
  });

  recordAuditAction({
    operation: "create",
    entityType: "part-definition",
    entityId: partDefinition.id,
    entityLabel: partDefinition.name,
    detailsJson: getSeasonAuditDetails(partDefinition),
  });

  return partDefinition;
}

export function updatePartDefinition(
  partDefinitionId: string,
  input: Partial<PartDefinitionInput>,
) {
  const previousPartDefinition = currentSnapshot.partDefinitions.find(
    (partDefinition) => partDefinition.id === partDefinitionId,
  );
  let updatedPartDefinition: PartDefinition | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    partDefinitions: currentSnapshot.partDefinitions.map((partDefinition) => {
      if (partDefinition.id !== partDefinitionId) {
        return partDefinition;
      }

      const seasonId = input.seasonId ?? partDefinition.seasonId;
      const activeSeasonIds =
        input.activeSeasonIds === undefined
          ? uniqueIds([...(partDefinition.activeSeasonIds ?? []), seasonId])
          : uniqueIds([...(input.activeSeasonIds ?? []), seasonId]);
      updatedPartDefinition = {
        ...partDefinition,
        ...input,
        ...normalizePmCadProvenance({
          ...partDefinition,
          ...input,
          cadEditedAfterImport: markPmCadEditedAfterImport(partDefinition, input),
        }),
        seasonId,
        activeSeasonIds,
        iteration:
          input.iteration === undefined
            ? partDefinition.iteration
            : normalizeIteration(input.iteration),
      };

      return updatedPartDefinition;
    }),
  });

  const savedPartDefinition = currentSnapshot.partDefinitions.find(
    (partDefinition) => partDefinition.id === partDefinitionId,
  );
  if (previousPartDefinition && savedPartDefinition) {
    recordAuditAction({
      operation: "update",
      entityType: "part-definition",
      entityId: savedPartDefinition.id,
      entityLabel: savedPartDefinition.name,
      detailsJson: getSeasonAuditDetails(previousPartDefinition, savedPartDefinition),
      changedFields: collectChangedFields(
        previousPartDefinition,
        savedPartDefinition,
      ),
    });
  }

  return updatedPartDefinition;
}

export function removePartDefinition(partDefinitionId: string) {
  const partDefinition = currentSnapshot.partDefinitions.find(
    (candidate) => candidate.id === partDefinitionId,
  );
  if (!partDefinition) {
    return null;
  }

  const removedPartInstanceIds = new Set(
    currentSnapshot.partInstances
      .filter((partInstance) => partInstance.partDefinitionId === partDefinitionId)
      .map((partInstance) => partInstance.id),
  );

  replaceCurrentSnapshot({
    ...currentSnapshot,
    partDefinitions: currentSnapshot.partDefinitions.filter(
      (candidate) => candidate.id !== partDefinitionId,
    ),
    partInstances: currentSnapshot.partInstances.filter(
      (partInstance) => partInstance.partDefinitionId !== partDefinitionId,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      const partInstanceIds = task.partInstanceIds.filter(
        (partInstanceId) => !removedPartInstanceIds.has(partInstanceId),
      );
      if (
        partInstanceIds.length === task.partInstanceIds.length &&
        !removedPartInstanceIds.has(task.partInstanceId ?? "")
      ) {
        return task;
      }

      return normalizeTaskTargets({
        ...task,
        partInstanceId: partInstanceIds[0] ?? null,
        partInstanceIds,
      });
    }),
    manufacturingItems: currentSnapshot.manufacturingItems.map((item) =>
      item.partDefinitionId === partDefinitionId
        ? {
            ...item,
            partDefinitionId: null,
          }
        : item,
    ),
    purchaseItems: currentSnapshot.purchaseItems.map((item) =>
      item.partDefinitionId === partDefinitionId
        ? {
            ...item,
            partDefinitionId: null,
          }
        : item,
    ),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "part-definition",
    entityId: partDefinition.id,
    entityLabel: partDefinition.name,
    detailsJson: getSeasonAuditDetails(partDefinition),
  });

  return partDefinition;
}

export function createMechanism(input: MechanismInput) {
  const mechanismIds = new Set(currentSnapshot.mechanisms.map((mechanism) => mechanism.id));
  const mechanism: Mechanism = {
    id: uniqueId(toSlug(input.name) || "mechanism", mechanismIds),
    ...normalizePmCadProvenance(input),
    subsystemId: input.subsystemId,
    name: input.name,
    description: input.description,
    googleSheetsUrl: input.googleSheetsUrl ?? "",
    photoUrl: input.photoUrl ?? "",
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
  };

  const wiringTask = createMechanismWiringTask(mechanism);

  replaceCurrentSnapshot(normalizeSnapshotTaskSerials({
    ...currentSnapshot,
    mechanisms: [...currentSnapshot.mechanisms, mechanism],
    tasks: wiringTask ? [...currentSnapshot.tasks, wiringTask] : currentSnapshot.tasks,
  }));

  recordAuditAction({
    operation: "create",
    entityType: "mechanism",
    entityId: mechanism.id,
    entityLabel: mechanism.name,
    projectId: getSubsystemProjectId(mechanism.subsystemId),
    subsystemId: mechanism.subsystemId,
  });

  if (wiringTask) {
    recordAuditAction({
      operation: "create",
      entityType: "task",
      entityId: wiringTask.id,
      entityLabel: wiringTask.title,
      projectId: wiringTask.projectId,
      subsystemId: wiringTask.subsystemId,
      taskId: wiringTask.id,
      memberIds: [wiringTask.ownerId, ...wiringTask.assigneeIds, wiringTask.mentorId],
      actorMemberId: wiringTask.ownerId,
    });
  }

  return mechanism;
}

export function createPartInstance(input: PartInstanceInput) {
  const partInstanceIds = new Set(
    currentSnapshot.partInstances.map((partInstance) => partInstance.id),
  );
  const partInstance: PartInstance = {
    id: uniqueId(toSlug(input.name) || "part-instance", partInstanceIds),
    ...normalizePmCadProvenance(input),
    subsystemId: input.subsystemId,
    mechanismId: input.mechanismId,
    partDefinitionId: input.partDefinitionId,
    name: input.name,
    quantity: input.quantity,
    trackIndividually: input.trackIndividually,
    status: normalizePartInstanceStatus(input.status),
    photoUrl: input.photoUrl ?? "",
  };

  replaceCurrentSnapshot(normalizePartInstanceSnapshot({
    ...currentSnapshot,
    partInstances: [...currentSnapshot.partInstances, partInstance],
  }));

  const savedPartInstance =
    currentSnapshot.partInstances.find(
      (candidate) => getPartInstanceMergeKey(candidate) === getPartInstanceMergeKey(partInstance),
    ) ?? partInstance;

  recordAuditAction({
    operation: "create",
    entityType: "part-instance",
    entityId: savedPartInstance.id,
    entityLabel: savedPartInstance.name,
    projectId: getSubsystemProjectId(savedPartInstance.subsystemId),
    subsystemId: savedPartInstance.subsystemId,
  });

  return savedPartInstance;
}

export function updatePartInstance(
  partInstanceId: string,
  input: Partial<PartInstanceInput>,
) {
  let updatedPartInstance: PartInstance | null = null;

  const currentPartInstance = currentSnapshot.partInstances.find(
    (partInstance) => partInstance.id === partInstanceId,
  );
  if (!currentPartInstance) {
    return null;
  }

  const nextMechanismId =
    input.mechanismId === undefined ? currentPartInstance.mechanismId : input.mechanismId;
  const nextSubsystemId =
    input.subsystemId ??
    (nextMechanismId
      ? findMechanism(nextMechanismId)?.subsystemId ?? currentPartInstance.subsystemId
      : currentPartInstance.subsystemId);

  replaceCurrentSnapshot({
    ...currentSnapshot,
    partInstances: currentSnapshot.partInstances.map((partInstance) => {
      if (partInstance.id !== partInstanceId) {
        return partInstance;
      }

      updatedPartInstance = {
        ...partInstance,
        ...input,
        ...normalizePmCadProvenance({
          ...partInstance,
          ...input,
          cadEditedAfterImport: markPmCadEditedAfterImport(partInstance, input),
        }),
        subsystemId: nextSubsystemId,
        mechanismId: nextMechanismId,
        status:
          input.status === undefined
            ? partInstance.status
            : normalizePartInstanceStatus(input.status),
      };

      return updatedPartInstance;
    }),
  });

  replaceCurrentSnapshot(normalizePartInstanceSnapshot(currentSnapshot));

  const savedPartInstance =
    currentSnapshot.partInstances.find(
      (candidate) =>
        candidate.id === partInstanceId ||
        getPartInstanceMergeKey(candidate) ===
          getPartInstanceMergeKey(updatedPartInstance ?? currentPartInstance),
    ) ?? updatedPartInstance;

  if (savedPartInstance) {
    recordAuditAction({
      operation: "update",
      entityType: "part-instance",
      entityId: savedPartInstance.id,
      entityLabel: savedPartInstance.name,
      projectIds: uniqueIds([
        getSubsystemProjectId(currentPartInstance.subsystemId),
        getSubsystemProjectId(savedPartInstance.subsystemId),
      ]),
      subsystemId: savedPartInstance.subsystemId,
      changedFields: updatedPartInstance
        ? collectChangedFields(
            currentPartInstance,
            updatedPartInstance,
          )
        : collectProvidedFields(input),
    });
  }

  return savedPartInstance;
}

export function removePartInstance(partInstanceId: string) {
  const partInstance = currentSnapshot.partInstances.find(
    (candidate) => candidate.id === partInstanceId,
  );
  if (!partInstance) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    partInstances: currentSnapshot.partInstances.filter(
      (candidate) => candidate.id !== partInstanceId,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      if (
        task.partInstanceId !== partInstanceId &&
        !task.partInstanceIds.includes(partInstanceId)
      ) {
        return task;
      }

      const partInstanceIds = task.partInstanceIds.filter(
        (candidate) => candidate !== partInstanceId,
      );
      return normalizeTaskTargets({
        ...task,
        partInstanceId: partInstanceIds[0] ?? null,
        partInstanceIds,
      });
    }),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "part-instance",
    entityId: partInstance.id,
    entityLabel: partInstance.name,
    projectId: getSubsystemProjectId(partInstance.subsystemId),
    subsystemId: partInstance.subsystemId,
  });

  return partInstance;
}

export function updateMechanism(mechanismId: string, input: Partial<MechanismInput>) {
  let updatedMechanism: Mechanism | null = null;

  const currentMechanism = currentSnapshot.mechanisms.find(
    (mechanism) => mechanism.id === mechanismId,
  );
  if (!currentMechanism) {
    return null;
  }

  const nextSubsystemId = input.subsystemId ?? currentMechanism.subsystemId;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    mechanisms: currentSnapshot.mechanisms.map((mechanism) => {
      if (mechanism.id !== mechanismId) {
        return mechanism;
      }

      updatedMechanism = {
        ...mechanism,
        ...input,
        ...normalizePmCadProvenance({
          ...mechanism,
          ...input,
          cadEditedAfterImport: markPmCadEditedAfterImport(mechanism, input),
        }),
        googleSheetsUrl:
          input.googleSheetsUrl === undefined
            ? mechanism.googleSheetsUrl ?? ""
            : input.googleSheetsUrl,
        iteration:
          input.iteration === undefined
            ? mechanism.iteration
            : normalizeIteration(input.iteration),
      };

      return updatedMechanism;
    }),
    tasks: currentSnapshot.tasks.map((task) => {
      if (task.mechanismId !== mechanismId && !task.mechanismIds.includes(mechanismId)) {
        return task;
      }

      return normalizeTaskTargets({
        ...task,
        subsystemId: nextSubsystemId,
        subsystemIds: uniqueIds([
          nextSubsystemId,
          ...task.subsystemIds.filter(
            (subsystemId) => subsystemId !== currentMechanism.subsystemId,
          ),
        ]),
      });
    }),
    partInstances: currentSnapshot.partInstances.map((partInstance) =>
      partInstance.mechanismId === mechanismId
        ? {
            ...partInstance,
            subsystemId: nextSubsystemId,
          }
        : partInstance,
    ),
  });

  const savedMechanism = currentSnapshot.mechanisms.find((mechanism) => mechanism.id === mechanismId);
  if (savedMechanism) {
    recordAuditAction({
      operation: "update",
      entityType: "mechanism",
      entityId: savedMechanism.id,
      entityLabel: savedMechanism.name,
      projectIds: uniqueIds([
        getSubsystemProjectId(currentMechanism.subsystemId),
        getSubsystemProjectId(savedMechanism.subsystemId),
      ]),
      subsystemId: savedMechanism.subsystemId,
      changedFields: collectChangedFields(
        currentMechanism,
        savedMechanism,
      ),
    });
  }

  return updatedMechanism;
}

export function removeMechanism(mechanismId: string) {
  const mechanism = currentSnapshot.mechanisms.find(
    (candidate) => candidate.id === mechanismId,
  );
  if (!mechanism) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    mechanisms: currentSnapshot.mechanisms.filter(
      (candidate) => candidate.id !== mechanismId,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      if (task.mechanismId !== mechanismId && !task.mechanismIds.includes(mechanismId)) {
        return task;
      }

      const mechanismIds = task.mechanismIds.filter(
        (candidate) => candidate !== mechanismId,
      );
      return normalizeTaskTargets({
        ...task,
        mechanismId: mechanismIds[0] ?? null,
        mechanismIds,
      });
    }),
    partInstances: currentSnapshot.partInstances.map((partInstance) =>
      partInstance.mechanismId === mechanismId
        ? {
            ...partInstance,
            mechanismId: null,
          }
        : partInstance,
    ),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "mechanism",
    entityId: mechanism.id,
    entityLabel: mechanism.name,
    projectId: getSubsystemProjectId(mechanism.subsystemId),
    subsystemId: mechanism.subsystemId,
  });

  return mechanism;
}

export function createTask(input: TaskInput) {
  const taskIds = new Set(currentSnapshot.tasks.map((task) => task.id));
  const nextSerialNumber =
    currentSnapshot.tasks.reduce((max, task) => {
      if (task.subsystemId !== input.subsystemId) {
        return max;
      }

      const serialNumber = typeof task.serialNumber === "number" ? Math.trunc(task.serialNumber) : 0;
      return Number.isFinite(serialNumber) ? Math.max(max, serialNumber) : max;
    }, 0) + 1;
  const task: Task = {
    id: uniqueId(toSlug(input.title) || "task", taskIds),
    createdAt: new Date().toISOString(),
    serialNumber: nextSerialNumber,
    projectId: input.projectId,
    workstreamId: input.workstreamId,
    workstreamIds: input.workstreamIds,
    title: input.title,
    summary: input.summary,
    subsystemId: input.subsystemId,
    subsystemIds: input.subsystemIds,
    disciplineId: normalizeDisciplineIdForProject(input.projectId, input.disciplineId),
    mechanismId: input.mechanismId,
    mechanismIds: input.mechanismIds,
    partInstanceId: input.partInstanceId,
    partInstanceIds: input.partInstanceIds,
    artifactId: input.artifactId,
    artifactIds: input.artifactIds,
    targetMilestoneId: input.targetMilestoneId,
    photoUrl: input.photoUrl ?? "",
    ownerId: input.ownerId,
    assigneeIds: input.assigneeIds,
    mentorId: input.mentorId,
    startDate: input.startDate,
    dueDate: input.dueDate,
    priority: input.priority,
    status: input.status,
    checklistItems: input.checklistItems ?? [],
    blockers: [],

    linkedManufacturingIds: input.linkedManufacturingIds,
    linkedPurchaseIds: input.linkedPurchaseIds,
    estimatedHours: input.estimatedHours,
    actualHours: input.actualHours,
    requiresDocumentation: input.requiresDocumentation,
    documentationLinked: input.documentationLinked,
  };

  const normalizedTask = normalizeTaskTargets(task);

  replaceCurrentSnapshot(normalizeSnapshotTaskSerials({
    ...currentSnapshot,
    tasks: [...currentSnapshot.tasks, normalizedTask],
  }));

  const savedTask = currentSnapshot.tasks.find((task) => task.id === normalizedTask.id) ?? normalizedTask;

  recordAuditAction({
    operation: "create",
    entityType: "task",
    entityId: savedTask.id,
    entityLabel: savedTask.title,
    projectId: savedTask.projectId,
    subsystemId: savedTask.subsystemId,
    taskId: savedTask.id,
    memberIds: [savedTask.ownerId, ...savedTask.assigneeIds, savedTask.mentorId],
    actorMemberId: savedTask.ownerId,
  });

  return savedTask;
}

function buildScopeRequirementsForMilestone(input: {
  milestoneId: string;
  projectIds: string[];
}) {
  const requirements: MilestoneRequirement[] = [];
  let sortOrder = 1;

  for (const projectId of uniqueIds(input.projectIds)) {
    requirements.push({
      id: `${input.milestoneId}:scope:project:${projectId}`,
      milestoneId: input.milestoneId,
      targetType: "project",
      targetId: projectId,
      conditionType: "custom",
      conditionValue: "in_scope",
      required: true,
      sortOrder: sortOrder++,
      notes: "",
    });
  }

  return requirements;
}

export function createMilestone(input: MilestoneInput) {
  const milestoneIds = new Set(currentSnapshot.milestones.map((milestone) => milestone.id));
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId =
    input.projectIds
      .map((projectId) => findProject(projectId)?.seasonId ?? null)
      .find((candidate): candidate is string => Boolean(candidate)) ??
    fallbackSeasonId;
  const milestone: Milestone = {
    id: uniqueId(toSlug(`${input.title} ${input.startDateTime.slice(0, 10)}`) || "milestone", milestoneIds),
    seasonId,
    title: input.title,
    type: input.type,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    isExternal: input.isExternal,
    description: input.description,
    projectIds: input.projectIds,
    status: normalizeMilestoneStatus(input.status),
    isBlocked: false,
    blockedReason: null,
    blockedByType: null,
    blockedById: null,
    photoUrl: input.photoUrl ?? "",
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    milestones: [...currentSnapshot.milestones, milestone],
    milestoneRequirements: [
      ...(currentSnapshot.milestoneRequirements ?? []),
      ...buildScopeRequirementsForMilestone({
        milestoneId: milestone.id,
        projectIds: milestone.projectIds ?? [],
      }),
    ],
  });

  recordAuditAction({
    operation: "create",
    entityType: "milestone",
    entityId: milestone.id,
    entityLabel: milestone.title,
    projectIds: milestone.projectIds,
    detailsJson: getSeasonAuditDetails(milestone),
  });

  return milestone;
}

export function createQaReport(input: QaReportInput) {
  const reportIds = new Set(currentSnapshot.qaReports.map((report) => report.id));
  const report: QaReport = {
    id: uniqueId(toSlug(`${input.taskId} qa`) || "qa-report", reportIds),
    taskId: input.taskId,
    participantIds: input.participantIds,
    result: input.result,
    mentorApproved: input.mentorApproved,
    notes: input.notes,
    photoUrl: input.photoUrl ?? "",
    reviewedAt: input.reviewedAt,
    targetRiskId: input.targetRiskId ?? null,
    proposedRiskSeverity: input.proposedRiskSeverity ?? null,
    proposedRiskStatus: input.proposedRiskStatus ?? null,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    qaReports: [...currentSnapshot.qaReports, report],
    risks: currentSnapshot.risks.map((risk) => report.mentorApproved && risk.id === report.targetRiskId
      ? { ...risk, severity: report.proposedRiskStatus === "full-mitigation" ? "low" : report.proposedRiskSeverity ?? risk.severity,
          mitigationTaskId: risk.mitigationTaskId ?? report.taskId }
      : risk),
  });

  const task = currentSnapshot.tasks.find((candidate) => candidate.id === report.taskId);
  recordAuditAction({
    operation: "create",
    entityType: "report",
    entityId: report.id,
    entityLabel: task ? `QA: ${task.title}` : `QA report ${report.id}`,
    projectId: task?.projectId ?? null,
    subsystemId: task?.subsystemId ?? null,
    taskId: report.taskId,
    memberIds: report.participantIds,
  });

  return report;
}

export function createQaRequest(input: QaRequestInput) {
  const task = input.taskId
    ? currentSnapshot.tasks.find((candidate) => candidate.id === input.taskId)
    : null;
  const requestIds = new Set(getQaRequests().map((request) => request.id));
  const subject = input.subject.trim();
  const request: QaRequest = {
    id: uniqueId(toSlug(`${subject} qa request`) || "qa-request", requestIds),
    taskId: input.taskId ?? null,
    subject,
    mentorId: input.mentorId,
    requestedById: input.requestedById ?? null,
    createdAt: new Date().toISOString(),
    status: "requested",
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    qaRequests: [request, ...getQaRequests()],
  });

  recordAuditAction({
    operation: "create",
    entityType: "qa_request",
    entityId: request.id,
    entityLabel: request.subject,
    projectId: task?.projectId ?? null,
    subsystemId: task?.subsystemId ?? null,
    taskId: request.taskId,
    actorMemberId: request.requestedById,
    memberIds: [request.requestedById, request.mentorId],
  });

  return request;
}

export function createTestResult(input: TestResultInput) {
  const resultIds = new Set(currentSnapshot.testResults.map((result) => result.id));
  const testResult: TestResult = {
    id: uniqueId(toSlug(`${input.title} ${input.milestoneId}`) || "test-result", resultIds),
    milestoneId: input.milestoneId,
    title: input.title,
    status: input.status,
    findings: input.findings,
    photoUrl: input.photoUrl ?? "",
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    testResults: [...currentSnapshot.testResults, testResult],
  });

  const milestone = currentSnapshot.milestones.find((candidate) => candidate.id === testResult.milestoneId);
  recordAuditAction({
    operation: "create",
    entityType: "report",
    entityId: testResult.id,
    entityLabel: testResult.title,
    projectId: milestone?.projectIds[0] ?? null,
  });

  return testResult;
}

export function createReport(input: ReportInput) {
  if (input.reportType === "QA") {
    if (!input.taskId) {
      return null;
    }

    const report = createQaReport({
      taskId: input.taskId,
      participantIds: uniqueIds(input.participantIds ?? []),
      result:
        input.result === "minor-fix" || input.result === "iteration-worthy"
          ? input.result
          : "pass",
      mentorApproved: input.mentorApproved ?? false,
      notes: input.notes || input.summary,
      photoUrl: input.photoUrl,
      reviewedAt: input.reviewedAt ?? input.createdAt.slice(0, 10),
      targetRiskId: input.targetRiskId,
      proposedRiskSeverity: input.proposedRiskSeverity,
      proposedRiskStatus: input.proposedRiskStatus,
    });

    return reportFromQaReport(currentSnapshot.tasks.find((task) => task.id === report.taskId), report);
  }

  if (!input.milestoneId) {
    return null;
  }

  const testResult = createTestResult({
    milestoneId: input.milestoneId,
    title: input.title ?? input.summary,
    status: input.status ?? (input.result === "fail" || input.result === "blocked" ? input.result : "pass"),
    findings: uniqueIds(input.findings ?? input.notes.split("\n")),
    photoUrl: input.photoUrl,
  });

  const milestone = currentSnapshot.milestones.find((item) => item.id === testResult.milestoneId);
  return reportFromTestResult(milestone, testResult, milestone?.projectIds[0] ?? currentSnapshot.projects[0]?.id ?? null);
}

export function createReportFinding(input: ReportFindingInput) {
  const report = getReports().find((candidate) => candidate.id === input.reportId);
  if (!report) {
    return null;
  }

  const now = new Date().toISOString();
  if (report.reportType === "QA") {
    const findingIds = new Set(currentSnapshot.qaFindings.map((finding) => finding.id));
    const finding: QaFinding = {
      id: uniqueId(toSlug(input.issueType) || "qa-finding", findingIds),
      qaReportId: input.reportId,
      taskId: input.spawnedTaskId ?? report.taskId,
      projectId: report.projectId,
      workstreamId: report.workstreamId,
      subsystemId: null,
      mechanismId: input.mechanismId,
      partInstanceId: input.partInstanceId,
      artifactId: input.artifactInstanceId,
      title: input.issueType,
      detail: input.notes,
      severity: input.severity,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    replaceCurrentSnapshot({
      ...currentSnapshot,
      qaFindings: [...currentSnapshot.qaFindings, finding],
    });

    recordAuditAction({
      operation: "create",
      entityType: "report-finding",
      entityId: finding.id,
      entityLabel: finding.title,
      projectId: finding.projectId,
      taskId: finding.taskId,
      subsystemId: finding.subsystemId,
    });

    return reportFindingFromQaFinding(finding);
  }

  const findingIds = new Set(currentSnapshot.testFindings.map((finding) => finding.id));
  const finding: TestFinding = {
    id: uniqueId(toSlug(input.issueType) || "test-finding", findingIds),
    testResultId: input.reportId,
    milestoneId: report.milestoneId,
    taskId: input.spawnedTaskId ?? report.taskId,
    projectId: report.projectId,
    workstreamId: report.workstreamId,
    subsystemId: null,
    mechanismId: input.mechanismId,
    partInstanceId: input.partInstanceId,
    artifactId: input.artifactInstanceId,
    title: input.issueType,
    detail: input.notes,
    severity: input.severity,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  replaceCurrentSnapshot({
    ...currentSnapshot,
    testFindings: [...currentSnapshot.testFindings, finding],
  });

  recordAuditAction({
    operation: "create",
    entityType: "report-finding",
    entityId: finding.id,
    entityLabel: finding.title,
    projectId: finding.projectId,
    taskId: finding.taskId,
    subsystemId: finding.subsystemId,
  });

  return reportFindingFromTestFinding(finding);
}

export function createTaskDependency(input: TaskDependencyInput) {
  const dependencyIds = new Set(currentSnapshot.taskDependencies.map((dependency) => dependency.id));
  const dependency: TaskDependency = {
    id: uniqueId(`${input.taskId}-dependency`, dependencyIds),
    taskId: input.taskId,
    kind: input.kind,
    refId: input.refId,
    requiredState: input.requiredState,
    dependencyType: input.dependencyType,
    createdAt: new Date().toISOString(),
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    taskDependencies: [...currentSnapshot.taskDependencies, dependency],
  });

  const task = currentSnapshot.tasks.find((candidate) => candidate.id === dependency.taskId);
  recordAuditAction({
    operation: "create",
    entityType: "task-dependency",
    entityId: dependency.id,
    entityLabel: `${dependency.kind}:${dependency.refId}`,
    projectId: task?.projectId ?? null,
    taskId: dependency.taskId,
    subsystemId: task?.subsystemId ?? null,
  });

  return dependency;
}

export function updateTaskDependency(
  dependencyId: string,
  input: Partial<TaskDependencyInput>,
) {
  const originalDependency = currentSnapshot.taskDependencies.find(
    (dependency) => dependency.id === dependencyId,
  );
  if (!originalDependency) {
    return null;
  }
  const savedDependency: TaskDependency = {
    ...originalDependency,
    ...input,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    taskDependencies: currentSnapshot.taskDependencies.map((dependency) =>
      dependency.id === dependencyId ? savedDependency : dependency,
    ),
  });

  const task = currentSnapshot.tasks.find((candidate) => candidate.id === savedDependency.taskId);
  recordAuditAction({
    operation: "update",
    entityType: "task-dependency",
    entityId: savedDependency.id,
    entityLabel: `${savedDependency.kind}:${savedDependency.refId}`,
    projectId: task?.projectId ?? null,
    taskId: savedDependency.taskId,
    subsystemId: task?.subsystemId ?? null,
    changedFields: collectChangedFields(
      originalDependency,
      savedDependency,
    ),
  });

  return savedDependency;
}

export function removeTaskDependency(dependencyId: string) {
  const dependency = currentSnapshot.taskDependencies.find(
    (candidate) => candidate.id === dependencyId,
  );
  if (!dependency) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    taskDependencies: currentSnapshot.taskDependencies.filter(
      (candidate) => candidate.id !== dependencyId,
    ),
  });

  const task = currentSnapshot.tasks.find((candidate) => candidate.id === dependency.taskId);
  recordAuditAction({
    operation: "delete",
    entityType: "task-dependency",
    entityId: dependency.id,
    entityLabel: `${dependency.kind}:${dependency.refId}`,
    projectId: task?.projectId ?? null,
    taskId: dependency.taskId,
    subsystemId: task?.subsystemId ?? null,
  });

  return dependency;
}

export function createTaskBlocker(input: TaskBlockerInput) {
  const blockerIds = new Set(currentSnapshot.taskBlockers.map((blocker) => blocker.id));
  const blocker: TaskBlocker = {
    id: uniqueId(`${input.blockedTaskId}-blocker`, blockerIds),
    blockedTaskId: input.blockedTaskId,
    blockerType: input.blockerType,
    issueType: input.issueType ?? "external",
    blockerId: input.blockerId,
    description: input.description,
    severity: input.severity,
    status: input.status ?? "open",
    createdByMemberId: input.createdByMemberId ?? null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    taskBlockers: [...currentSnapshot.taskBlockers, blocker],
  });

  const blockedTask = currentSnapshot.tasks.find((candidate) => candidate.id === blocker.blockedTaskId);
  recordAuditAction({
    operation: "create",
    entityType: "task-blocker",
    entityId: blocker.id,
    entityLabel: blocker.description,
    projectId: blockedTask?.projectId ?? null,
    taskId: blocker.blockedTaskId,
    subsystemId: blockedTask?.subsystemId ?? null,
    actorMemberId: blocker.createdByMemberId,
  });

  return blocker;
}

export function updateTaskBlocker(blockerId: string, input: Partial<TaskBlockerInput>) {
  const originalBlocker = currentSnapshot.taskBlockers.find(
    (blocker) => blocker.id === blockerId,
  );
  if (!originalBlocker) {
    return null;
  }
  const savedBlocker: TaskBlocker = {
    ...originalBlocker,
    ...input,
    resolvedAt: input.status === "resolved" ? new Date().toISOString() : originalBlocker.resolvedAt,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    taskBlockers: currentSnapshot.taskBlockers.map((blocker) =>
      blocker.id === blockerId ? savedBlocker : blocker,
    ),
  });

  const blockedTask = currentSnapshot.tasks.find((candidate) => candidate.id === savedBlocker.blockedTaskId);
  recordAuditAction({
    operation: "update",
    entityType: "task-blocker",
    entityId: savedBlocker.id,
    entityLabel: savedBlocker.description,
    projectId: blockedTask?.projectId ?? null,
    taskId: savedBlocker.blockedTaskId,
    subsystemId: blockedTask?.subsystemId ?? null,
    actorMemberId: savedBlocker.createdByMemberId,
    changedFields: collectChangedFields(
      originalBlocker,
      savedBlocker,
    ),
  });

  return savedBlocker;
}

export function removeTaskBlocker(blockerId: string) {
  const blocker = currentSnapshot.taskBlockers.find(
    (candidate) => candidate.id === blockerId,
  );
  if (!blocker) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    taskBlockers: currentSnapshot.taskBlockers.filter((candidate) => candidate.id !== blockerId),
  });

  const blockedTask = currentSnapshot.tasks.find((candidate) => candidate.id === blocker.blockedTaskId);
  recordAuditAction({
    operation: "delete",
    entityType: "task-blocker",
    entityId: blocker.id,
    entityLabel: blocker.description,
    projectId: blockedTask?.projectId ?? null,
    taskId: blocker.blockedTaskId,
    subsystemId: blockedTask?.subsystemId ?? null,
    actorMemberId: blocker.createdByMemberId,
  });

  return blocker;
}

export function updateMilestone(milestoneId: string, input: Partial<MilestoneInput>) {
  const currentMilestone = currentSnapshot.milestones.find((milestone) => milestone.id === milestoneId);
  if (!currentMilestone) {
    return null;
  }

  let updatedMilestone: Milestone | null = null;
  const desiredProjectIds = input.projectIds === undefined ? undefined : uniqueIds(input.projectIds);
  const nextProjectIds = desiredProjectIds ?? (currentMilestone.projectIds ?? []);
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const nextSeasonId =
    nextProjectIds
      .map((projectId) => findProject(projectId)?.seasonId ?? null)
      .find((candidate): candidate is string => Boolean(candidate)) ??
    currentMilestone.seasonId ??
    fallbackSeasonId;

  updatedMilestone = {
    ...currentMilestone,
    ...input,
    seasonId: nextSeasonId,
    projectIds: nextProjectIds,
    status:
      input.status === undefined
        ? currentMilestone.status
        : normalizeMilestoneStatus(input.status),
    photoUrl: input.photoUrl === undefined ? currentMilestone.photoUrl : input.photoUrl,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    milestones: currentSnapshot.milestones.map((milestone) =>
      milestone.id === milestoneId ? updatedMilestone! : milestone,
    ),
  });

  if (updatedMilestone) {
    const desiredScopeRequirementIds = new Set(
      buildScopeRequirementsForMilestone({
        milestoneId: updatedMilestone.id,
        projectIds: updatedMilestone.projectIds ?? [],
      }).map((req) => req.id),
    );

    const existing = currentSnapshot.milestoneRequirements ?? [];
    const retained = existing.filter((req) => {
      if (req.milestoneId !== updatedMilestone!.id) {
        return true;
      }

      // Keep non-scope requirements untouched. Scope requirements are synced to legacy fields.
      if (!req.id.startsWith(`${updatedMilestone!.id}:scope:`)) {
        return true;
      }

      return desiredScopeRequirementIds.has(req.id);
    });

    const retainedIds = new Set(retained.map((req) => req.id));
    const additions = buildScopeRequirementsForMilestone({
      milestoneId: updatedMilestone.id,
      projectIds: updatedMilestone.projectIds ?? [],
    }).filter((req) => !retainedIds.has(req.id));

    replaceCurrentSnapshot({
      ...currentSnapshot,
      milestoneRequirements: [...retained, ...additions],
    });

    recordAuditAction({
      operation: "update",
      entityType: "milestone",
      entityId: updatedMilestone.id,
      entityLabel: updatedMilestone.title,
      projectIds: updatedMilestone.projectIds,
      detailsJson: getSeasonAuditDetails(currentMilestone, updatedMilestone),
      changedFields: collectChangedFields(
        currentMilestone,
        updatedMilestone,
      ),
    });
  }

  return updatedMilestone;
}

export function removeMilestone(milestoneId: string) {
  const milestone = currentSnapshot.milestones.find((candidate) => candidate.id === milestoneId);
  if (!milestone) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    milestones: currentSnapshot.milestones.filter((candidate) => candidate.id !== milestoneId),
    milestoneRequirements: (currentSnapshot.milestoneRequirements ?? []).filter(
      (requirement) => requirement.milestoneId !== milestoneId,
    ),
    testResults: currentSnapshot.testResults.filter((result) => result.milestoneId !== milestoneId),
    tasks: currentSnapshot.tasks.map((task) =>
      task.targetMilestoneId === milestoneId
        ? {
            ...task,
            targetMilestoneId: null,
          }
        : task,
    ),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "milestone",
    entityId: milestone.id,
    entityLabel: milestone.title,
    projectIds: milestone.projectIds,
    detailsJson: getSeasonAuditDetails(milestone),
  });

  return milestone;
}

export function createMeeting(input: MeetingInput) {
  const meetingIds = new Set(currentSnapshot.meetings.map((meeting) => meeting.id));
  const projectIds = uniqueIds(input.projectIds ?? []);
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId =
    input.seasonId ??
    projectIds
      .map((projectId) => findProject(projectId)?.seasonId ?? null)
      .find((candidate): candidate is string => Boolean(candidate)) ??
    fallbackSeasonId;
  const meeting = normalizeMeetingSchedule(
    {
      id: uniqueId(toSlug(`${input.title} ${input.startDateTime.slice(0, 10)}`) || "meeting", meetingIds),
      title: input.title,
      meetingType: input.meetingType ?? "general",
      seasonId,
      projectIds,
      startDateTime: input.startDateTime,
      endDateTime: input.endDateTime ?? null,
      location: input.location ?? "",
      description: input.description ?? "",
      date: dateOnlyFromDateTime(input.startDateTime),
      time: formatTimeFromDateTime(input.startDateTime),
      rsvpsYes: 0,
      rsvpsMaybe: 0,
      openSignIns: 0,
    },
    fallbackSeasonId,
  );

  replaceCurrentSnapshot({
    ...currentSnapshot,
    meetings: [...currentSnapshot.meetings, meeting],
  });

  recordAuditAction({
    operation: "create",
    entityType: "meeting",
    entityId: meeting.id,
    entityLabel: meeting.title,
    projectIds: meeting.projectIds,
    detailsJson: getSeasonAuditDetails(meeting),
  });

  return meeting;
}

export function updateMeeting(meetingId: string, input: Partial<MeetingInput>) {
  const currentMeeting = currentSnapshot.meetings.find((meeting) => meeting.id === meetingId);
  if (!currentMeeting) {
    return null;
  }

  const projectIds = input.projectIds === undefined ? currentMeeting.projectIds ?? [] : uniqueIds(input.projectIds);
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId =
    input.seasonId ??
    projectIds
      .map((projectId) => findProject(projectId)?.seasonId ?? null)
      .find((candidate): candidate is string => Boolean(candidate)) ??
    currentMeeting.seasonId ??
    fallbackSeasonId;
  const startDateTime = input.startDateTime ?? currentMeeting.startDateTime ?? `${currentMeeting.date}T18:00:00`;
  const updatedMeeting = normalizeMeetingSchedule(
    {
      ...currentMeeting,
      ...input,
      seasonId,
      projectIds,
      startDateTime,
      endDateTime:
        input.endDateTime === undefined
          ? currentMeeting.endDateTime ?? null
          : input.endDateTime,
      location: input.location === undefined ? currentMeeting.location ?? "" : input.location,
      description:
        input.description === undefined ? currentMeeting.description ?? "" : input.description,
      date: dateOnlyFromDateTime(startDateTime),
      time: formatTimeFromDateTime(startDateTime) || currentMeeting.time,
    },
    fallbackSeasonId,
  );

  replaceCurrentSnapshot({
    ...currentSnapshot,
    meetings: currentSnapshot.meetings.map((meeting) =>
      meeting.id === meetingId ? updatedMeeting : meeting,
    ),
  });

  recordAuditAction({
    operation: "update",
    entityType: "meeting",
    entityId: updatedMeeting.id,
    entityLabel: updatedMeeting.title,
    projectIds: updatedMeeting.projectIds,
    detailsJson: getSeasonAuditDetails(currentMeeting, updatedMeeting),
    changedFields: collectChangedFields(currentMeeting, updatedMeeting),
  });

  return updatedMeeting;
}

export function removeMeeting(meetingId: string) {
  const meeting = currentSnapshot.meetings.find((candidate) => candidate.id === meetingId);
  if (!meeting) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    meetings: currentSnapshot.meetings.filter((candidate) => candidate.id !== meetingId),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "meeting",
    entityId: meeting.id,
    entityLabel: meeting.title,
    projectIds: meeting.projectIds ?? [],
    detailsJson: getSeasonAuditDetails(meeting),
  });

  return meeting;
}

export function createWorkLog(
  input: WorkLogInput,
  auditContext: AuditMutationContext = {},
) {
  const workLog: WorkLog = {
    id: nextWorkLogId(),
    taskId: input.taskId,
    date: input.date,
    hours: input.hours,
    participantIds: input.participantIds,
    notes: input.notes,
    photoUrl: input.photoUrl ?? "",
    createdById: input.createdById ?? null,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    workLogs: [...currentSnapshot.workLogs, workLog],
  });

  const task = currentSnapshot.tasks.find((candidate) => candidate.id === workLog.taskId);
  recordAuditAction({
    operation: "create",
    entityType: "worklog",
    entityId: workLog.id,
    entityLabel: task ? task.title : workLog.taskId,
    projectId: task?.projectId ?? null,
    taskId: workLog.taskId,
    subsystemId: task?.subsystemId ?? null,
    memberIds: workLog.participantIds,
    actorMemberId: auditContext.actorMemberId ?? workLog.createdById,
    requestId: auditContext.requestId ?? null,
  });

  return workLog;
}

export function updateWorkLog(
  workLogId: string,
  input: Partial<WorkLogInput>,
  auditContext: AuditMutationContext = {},
) {
  const previousWorkLog = currentSnapshot.workLogs.find((workLog) => workLog.id === workLogId);
  let updatedWorkLog: WorkLog | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    workLogs: currentSnapshot.workLogs.map((workLog) => {
      if (workLog.id !== workLogId) {
        return workLog;
      }

      updatedWorkLog = {
        ...workLog,
        ...input,
      };

      return updatedWorkLog;
    }),
  });

  const savedWorkLog = currentSnapshot.workLogs.find((workLog) => workLog.id === workLogId);
  if (previousWorkLog && savedWorkLog) {
    const task = currentSnapshot.tasks.find((candidate) => candidate.id === savedWorkLog.taskId);
    recordAuditAction({
      operation: "update",
      entityType: "worklog",
      entityId: savedWorkLog.id,
      entityLabel: task ? task.title : savedWorkLog.taskId,
      projectId: task?.projectId ?? null,
      taskId: savedWorkLog.taskId,
      subsystemId: task?.subsystemId ?? null,
      memberIds: savedWorkLog.participantIds,
      actorMemberId: auditContext.actorMemberId ?? savedWorkLog.createdById,
      requestId: auditContext.requestId ?? null,
      changedFields: collectChangedFields(
        previousWorkLog,
        savedWorkLog,
      ),
    });
  }

  return updatedWorkLog;
}

export function removeWorkLog(
  workLogId: string,
  auditContext: AuditMutationContext = {},
) {
  const workLog = currentSnapshot.workLogs.find(
    (candidate) => candidate.id === workLogId,
  );
  if (!workLog) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    workLogs: currentSnapshot.workLogs.filter(
      (candidate) => candidate.id !== workLogId,
    ),
  });

  const task = currentSnapshot.tasks.find((candidate) => candidate.id === workLog.taskId);
  recordAuditAction({
    operation: "delete",
    entityType: "worklog",
    entityId: workLog.id,
    entityLabel: task ? task.title : workLog.taskId,
    projectId: task?.projectId ?? null,
    taskId: workLog.taskId,
    subsystemId: task?.subsystemId ?? null,
    memberIds: workLog.participantIds,
    actorMemberId: auditContext.actorMemberId ?? workLog.createdById,
    requestId: auditContext.requestId ?? null,
  });

  return workLog;
}

export function updateTask(
  taskId: string,
  input: Partial<TaskInput>,
  auditContext: AuditMutationContext = {},
): Task | null {
  const currentTask = currentSnapshot.tasks.find((task) => task.id === taskId);
  if (!currentTask) {
    return null;
  }

  const scalarTargetUpdates: Partial<TaskInput> = {};
  if (input.workstreamId !== undefined && input.workstreamIds === undefined) {
    scalarTargetUpdates.workstreamIds = uniqueIds([input.workstreamId]);
  }
  if (input.subsystemId !== undefined && input.subsystemIds === undefined) {
    scalarTargetUpdates.subsystemIds = uniqueIds([input.subsystemId]);
  }
  if (input.mechanismId !== undefined && input.mechanismIds === undefined) {
    scalarTargetUpdates.mechanismIds = uniqueIds([input.mechanismId]);
  }
  if (input.partInstanceId !== undefined && input.partInstanceIds === undefined) {
    scalarTargetUpdates.partInstanceIds = uniqueIds([input.partInstanceId]);
  }
  if (input.artifactId !== undefined && input.artifactIds === undefined) {
    scalarTargetUpdates.artifactIds = uniqueIds([input.artifactId]);
  }

  let updatedTask = normalizeTaskTargets({
    ...currentTask,
    ...input,
    ...(input.disciplineId !== undefined
      ? {
          disciplineId: normalizeDisciplineIdForProject(
            input.projectId ?? currentTask.projectId,
            input.disciplineId,
          ),
        }
      : {}),
    ...scalarTargetUpdates,
  });

  if (updatedTask.subsystemId !== currentTask.subsystemId) {
    updatedTask = {
      ...updatedTask,
      serialNumber: undefined,
      serial: undefined,
    };
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    tasks: currentSnapshot.tasks.map((task) => (task.id === taskId ? updatedTask : task)),
  });

  replaceCurrentSnapshot(normalizeSnapshotTaskSerials(currentSnapshot));

  const savedTask = currentSnapshot.tasks.find((task) => task.id === updatedTask.id) ?? updatedTask;
  recordAuditAction({
    operation: "update",
    entityType: "task",
    entityId: savedTask.id,
    entityLabel: savedTask.title,
    projectId: savedTask.projectId,
    subsystemId: savedTask.subsystemId,
    taskId: savedTask.id,
    memberIds: [savedTask.ownerId, ...savedTask.assigneeIds, savedTask.mentorId],
    actorMemberId: auditContext.actorMemberId ?? savedTask.ownerId,
    requestId: auditContext.requestId ?? null,
    changedFields: collectChangedFields(
      currentTask,
      savedTask,
    ),
    beforeJson: currentTask,
    afterJson: savedTask,
  });

  return savedTask;
}

export function removeTask(taskId: string) {
  const task = currentSnapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    tasks: currentSnapshot.tasks.filter((candidate) => candidate.id !== taskId),
    workLogs: currentSnapshot.workLogs.filter((workLog) => workLog.taskId !== taskId),
    qaReports: currentSnapshot.qaReports.filter((report) => report.taskId !== taskId),
    qaRequests: getQaRequests().filter(
      (request) => !request.taskId || request.taskId !== taskId,
    ),
    taskDependencies: currentSnapshot.taskDependencies.filter(
      (dependency) => dependency.taskId !== taskId && dependency.refId !== taskId,
    ),
    taskBlockers: currentSnapshot.taskBlockers.filter(
      (blocker) => blocker.blockedTaskId !== taskId,
    ),
    qaReviews: currentSnapshot.qaReviews.filter(
      (review) => review.subjectType !== "task" || review.subjectId !== taskId,
    ),
    risks: currentSnapshot.risks.filter((risk) => risk.mitigationTaskId !== taskId),
  });

  replaceCurrentSnapshot(normalizeSnapshotTaskSerials(currentSnapshot));

  recordAuditAction({
    operation: "delete",
    entityType: "task",
    entityId: task.id,
    entityLabel: task.title,
    projectId: task.projectId,
    subsystemId: task.subsystemId,
    taskId: task.id,
    memberIds: [task.ownerId, ...task.assigneeIds, task.mentorId],
    actorMemberId: task.ownerId,
  });

  return task;
}

export function createPurchaseItem(
  input: PurchaseItemInput,
  auditContext: AuditMutationContext = {},
) {
  const itemIds = new Set(currentSnapshot.purchaseItems.map((item) => item.id));
  const item: PurchaseItem = {
    id: uniqueId(toSlug(input.title) || "purchase-item", itemIds),
    title: input.title,
    subsystemId: input.subsystemId,
    requestedById: input.requestedById,
    partDefinitionId: input.partDefinitionId,
    quantity: input.quantity,
    vendor: input.vendor,
    linkLabel: input.linkLabel,
    estimatedCost: input.estimatedCost,
    finalCost: input.finalCost,
    approvedByMentor: input.approvedByMentor,
    approvedById: input.approvedById ?? null,
    approvedAt: input.approvedAt ?? null,
    purchasedAt: input.purchasedAt ?? null,
    deliveredAt: input.deliveredAt ?? null,
    status: input.status,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    purchaseItems: [...currentSnapshot.purchaseItems, item],
  });

  const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === item.subsystemId);
  recordAuditAction({
    operation: "create",
    entityType: "purchase-item",
    entityId: item.id,
    entityLabel: item.title,
    projectId: subsystem?.projectId ?? null,
    subsystemId: item.subsystemId,
    actorMemberId: auditContext.actorMemberId ?? item.requestedById,
    requestId: auditContext.requestId ?? null,
    memberIds: [item.requestedById],
  });

  return item;
}

export function updatePurchaseItem(
  itemId: string,
  input: Partial<PurchaseItemInput>,
  auditContext: AuditMutationContext = {},
) {
  const previousItem = currentSnapshot.purchaseItems.find((item) => item.id === itemId);
  let updatedItem: PurchaseItem | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    purchaseItems: currentSnapshot.purchaseItems.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      updatedItem = {
        ...item,
        ...input,
      };

      return updatedItem;
    }),
  });

  const savedPurchaseItem = currentSnapshot.purchaseItems.find((item) => item.id === itemId);
  if (previousItem && savedPurchaseItem) {
    const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === savedPurchaseItem.subsystemId);
    recordAuditAction({
      operation: "update",
      entityType: "purchase-item",
      entityId: savedPurchaseItem.id,
      entityLabel: savedPurchaseItem.title,
      projectId: subsystem?.projectId ?? null,
      subsystemId: savedPurchaseItem.subsystemId,
      actorMemberId: auditContext.actorMemberId ?? savedPurchaseItem.requestedById,
      requestId: auditContext.requestId ?? null,
      memberIds: [savedPurchaseItem.requestedById],
      changedFields: collectChangedFields(
        previousItem,
        savedPurchaseItem,
      ),
    });
  }

  return updatedItem;
}

export function removePurchaseItem(
  itemId: string,
  auditContext: AuditMutationContext = {},
) {
  const item = currentSnapshot.purchaseItems.find(
    (candidate) => candidate.id === itemId,
  );
  if (!item) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    purchaseItems: currentSnapshot.purchaseItems.filter(
      (candidate) => candidate.id !== itemId,
    ),
    tasks: currentSnapshot.tasks.map((task) => ({
      ...task,
      linkedPurchaseIds: task.linkedPurchaseIds.filter(
        (linkedItemId) => linkedItemId !== itemId,
      ),
    })),
  });

  const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === item.subsystemId);
  recordAuditAction({
    operation: "delete",
    entityType: "purchase-item",
    entityId: item.id,
    entityLabel: item.title,
    projectId: subsystem?.projectId ?? null,
    subsystemId: item.subsystemId,
    actorMemberId: auditContext.actorMemberId ?? item.requestedById,
    requestId: auditContext.requestId ?? null,
    memberIds: [item.requestedById],
  });

  return item;
}

export function createManufacturingItem(
  input: ManufacturingItemInput,
  auditContext: AuditMutationContext = {},
) {
  const itemIds = new Set(currentSnapshot.manufacturingItems.map((item) => item.id));
  const partInstanceIds = uniqueIds([
    ...(input.partInstanceIds ?? []),
    input.partInstanceId,
  ]);
  const item: ManufacturingItem = {
    id: uniqueId(toSlug(input.title) || "manufacturing-item", itemIds),
    title: input.title,
    subsystemId: input.subsystemId,
    requestedById: input.requestedById,
    process: input.process,
    dueDate: input.dueDate,
    material: input.material,
    materialId: input.materialId ?? null,
    partDefinitionId: input.partDefinitionId,
    partInstanceId: partInstanceIds[0] ?? null,
    partInstanceIds,
    quantity: input.quantity,
    status: input.status,
    mentorReviewed: input.mentorReviewed,
    reviewedById: input.reviewedById ?? null,
    reviewedAt: input.reviewedAt ?? null,
    inHouse: input.process === "cnc" ? input.inHouse ?? true : true,
    batchLabel: input.batchLabel,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    manufacturingItems: [...currentSnapshot.manufacturingItems, item],
  });

  const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === item.subsystemId);
  recordAuditAction({
    operation: "create",
    entityType: "manufacturing-item",
    entityId: item.id,
    entityLabel: item.title,
    projectId: subsystem?.projectId ?? null,
    subsystemId: item.subsystemId,
    actorMemberId: auditContext.actorMemberId ?? item.requestedById,
    requestId: auditContext.requestId ?? null,
    memberIds: [item.requestedById],
  });

  return item;
}

export function updateManufacturingItem(
  itemId: string,
  input: Partial<ManufacturingItemInput>,
  auditContext: AuditMutationContext = {},
) {
  const previousItem = currentSnapshot.manufacturingItems.find((item) => item.id === itemId);
  let updatedItem: ManufacturingItem | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    manufacturingItems: currentSnapshot.manufacturingItems.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      const receivedPartInstanceUpdate =
        input.partInstanceIds !== undefined || input.partInstanceId !== undefined;
      const partInstanceIds = receivedPartInstanceUpdate
        ? uniqueIds([...(input.partInstanceIds ?? []), input.partInstanceId])
        : item.partInstanceIds ?? uniqueIds([item.partInstanceId]);

      updatedItem = {
        ...item,
        ...input,
        partInstanceId: partInstanceIds[0] ?? null,
        partInstanceIds,
        inHouse:
          (input.process ?? item.process) === "cnc"
            ? input.inHouse ?? item.inHouse ?? true
            : true,
      };

      return updatedItem;
    }),
  });

  const savedManufacturingItem = currentSnapshot.manufacturingItems.find((item) => item.id === itemId);
  if (previousItem && savedManufacturingItem) {
    const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === savedManufacturingItem.subsystemId);
    recordAuditAction({
      operation: "update",
      entityType: "manufacturing-item",
      entityId: savedManufacturingItem.id,
      entityLabel: savedManufacturingItem.title,
      projectId: subsystem?.projectId ?? null,
      subsystemId: savedManufacturingItem.subsystemId,
      actorMemberId: auditContext.actorMemberId ?? savedManufacturingItem.requestedById,
      requestId: auditContext.requestId ?? null,
      memberIds: [savedManufacturingItem.requestedById],
      changedFields: collectChangedFields(
        previousItem,
        savedManufacturingItem,
      ),
    });
  }

  return updatedItem;
}

export function removeManufacturingItem(
  itemId: string,
  auditContext: AuditMutationContext = {},
) {
  const item = currentSnapshot.manufacturingItems.find(
    (candidate) => candidate.id === itemId,
  );
  if (!item) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    manufacturingItems: currentSnapshot.manufacturingItems.filter(
      (candidate) => candidate.id !== itemId,
    ),
    tasks: currentSnapshot.tasks.map((task) => ({
      ...task,
      linkedManufacturingIds: task.linkedManufacturingIds.filter(
        (linkedItemId) => linkedItemId !== itemId,
      ),
    })),
    qaReviews: currentSnapshot.qaReviews.filter(
      (review) =>
        review.subjectType !== "manufacturing" || review.subjectId !== itemId,
    ),
  });

  const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === item.subsystemId);
  recordAuditAction({
    operation: "delete",
    entityType: "manufacturing-item",
    entityId: item.id,
    entityLabel: item.title,
    projectId: subsystem?.projectId ?? null,
    subsystemId: item.subsystemId,
    actorMemberId: auditContext.actorMemberId ?? item.requestedById,
    requestId: auditContext.requestId ?? null,
    memberIds: [item.requestedById],
  });

  return item;
}

export function createMember(input: MemberInput) {
  const memberIds = new Set(currentSnapshot.members.map((member) => member.id));
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId = input.seasonId ?? fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(input.activeSeasonIds ?? []), seasonId]);
  const disciplineId = input.disciplineId === undefined ? undefined : input.disciplineId;
  const member: Member = {
    id: uniqueId(toSlug(input.name) || "member", memberIds),
    name: input.name,
    email: (input.email ?? "").trim(),
    photoUrl: (input.photoUrl ?? "").trim(),
    role: input.role,
    elevated: isElevatedMemberRole(input.role),
    ...(disciplineId !== undefined ? { disciplineId } : null),
    seasonId,
    activeSeasonIds: activeSeasonIds.length > 0 ? activeSeasonIds : [seasonId],
    plannedWeeklyAttendanceHours: normalizePlannedWeeklyAttendanceHours(
      input.plannedWeeklyAttendanceHours,
    ),
    plannedAttendanceDays: normalizePlannedAttendanceDays(input.plannedAttendanceDays),
    plannedAttendanceNotes: (input.plannedAttendanceNotes ?? "").trim(),
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    members: [...currentSnapshot.members, member],
  });

  recordAuditAction({
    operation: "create",
    entityType: "member",
    entityId: member.id,
    entityLabel: member.name,
    actorMemberId: member.id,
    memberIds: [member.id],
    detailsJson: getSeasonAuditDetails(member),
  });

  return member;
}

export function updateMember(
  memberId: string,
  input: Partial<MemberInput>,
  auditContext: AuditMutationContext = {},
) {
  const previousMember = currentSnapshot.members.find((member) => member.id === memberId);
  let updatedMember: Member | null = null;

  replaceCurrentSnapshot({
    ...currentSnapshot,
    members: currentSnapshot.members.map((member) => {
      if (member.id !== memberId) {
        return member;
      }

      const nextRole = input.role ?? member.role;
      const nextEmail = input.email === undefined ? member.email : input.email.trim();
      const nextPhotoUrl =
        input.photoUrl === undefined ? member.photoUrl : input.photoUrl.trim();
      const nextSeasonId = input.seasonId ?? member.seasonId;
      const nextActiveSeasonIds = uniqueIds([
        ...(input.activeSeasonIds ?? member.activeSeasonIds ?? [member.seasonId]),
        nextSeasonId,
      ]);
      const nextPlannedWeeklyAttendanceHours =
        input.plannedWeeklyAttendanceHours === undefined
          ? normalizePlannedWeeklyAttendanceHours(member.plannedWeeklyAttendanceHours)
          : normalizePlannedWeeklyAttendanceHours(input.plannedWeeklyAttendanceHours);
      const nextPlannedAttendanceDays =
        input.plannedAttendanceDays === undefined
          ? normalizePlannedAttendanceDays(member.plannedAttendanceDays)
          : normalizePlannedAttendanceDays(input.plannedAttendanceDays);
      const nextPlannedAttendanceNotes =
        input.plannedAttendanceNotes === undefined
          ? member.plannedAttendanceNotes ?? ""
          : input.plannedAttendanceNotes.trim();
      updatedMember = {
        ...member,
        ...input,
        role: nextRole,
        email: nextEmail,
        photoUrl: nextPhotoUrl,
        seasonId: nextSeasonId,
        activeSeasonIds:
          nextActiveSeasonIds.length > 0 ? nextActiveSeasonIds : [nextSeasonId],
        elevated: isElevatedMemberRole(nextRole),
        plannedWeeklyAttendanceHours: nextPlannedWeeklyAttendanceHours,
        plannedAttendanceDays: nextPlannedAttendanceDays,
        plannedAttendanceNotes: nextPlannedAttendanceNotes,
      };

      return updatedMember;
    }),
  });

  const savedMember = currentSnapshot.members.find((member) => member.id === memberId);
  if (previousMember && savedMember) {
    recordAuditAction({
      operation: "update",
      entityType: "member",
      entityId: savedMember.id,
      entityLabel: savedMember.name,
      actorMemberId: auditContext.actorMemberId ?? savedMember.id,
      requestId: auditContext.requestId ?? null,
      memberIds: [savedMember.id],
      detailsJson: getSeasonAuditDetails(previousMember, savedMember),
      changedFields: collectChangedFields(
        previousMember,
        savedMember,
      ),
    });
  }

  return updatedMember;
}

export function removeMember(memberId: string) {
  const member = currentSnapshot.members.find((candidate) => candidate.id === memberId);
  if (!member) {
    return null;
  }

  replaceCurrentSnapshot({
    ...currentSnapshot,
    members: currentSnapshot.members.filter((candidate) => candidate.id !== memberId),
    subsystems: currentSnapshot.subsystems.map((subsystem) => ({
      ...subsystem,
      responsibleEngineerId:
        subsystem.responsibleEngineerId === memberId
          ? null
          : subsystem.responsibleEngineerId,
      mentorIds: subsystem.mentorIds.filter((mentorId) => mentorId !== memberId),
    })),
    tasks: currentSnapshot.tasks.map((task) => ({
      ...task,
      ownerId: task.ownerId === memberId ? null : task.ownerId,
      assigneeIds: (task.assigneeIds ?? []).filter(
        (assigneeId) => assigneeId !== memberId,
      ),
      mentorId: task.mentorId === memberId ? null : task.mentorId,
    })),
    workLogs: currentSnapshot.workLogs.map((workLog) => ({
      ...workLog,
      createdById: workLog.createdById === memberId ? null : workLog.createdById,
      participantIds: workLog.participantIds.filter(
        (participantId) => participantId !== memberId,
      ),
    })),
    attendanceRecords: currentSnapshot.attendanceRecords.filter(
      (record) => record.memberId !== memberId,
    ),
    manufacturingItems: currentSnapshot.manufacturingItems.map((item) => ({
      ...item,
      requestedById: item.requestedById === memberId ? null : item.requestedById,
      reviewedById: item.reviewedById === memberId ? null : item.reviewedById,
    })),
    purchaseItems: currentSnapshot.purchaseItems.map((item) => ({
      ...item,
      requestedById: item.requestedById === memberId ? null : item.requestedById,
      approvedById: item.approvedById === memberId ? null : item.approvedById,
    })),
    qaRequests: getQaRequests()
      .filter((request) => request.mentorId !== memberId)
      .map((request) => ({
        ...request,
        requestedById: request.requestedById === memberId ? null : request.requestedById,
      })),
    qaReviews: currentSnapshot.qaReviews.map((review) => ({
      ...review,
      participantIds: review.participantIds.filter(
        (participantId) => participantId !== memberId,
      ),
    })),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "member",
    entityId: member.id,
    entityLabel: member.name,
    actorMemberId: member.id,
    memberIds: [member.id],
    detailsJson: getSeasonAuditDetails(member),
  });

  return member;
}

export function findSubsystem(subsystemId: string): Subsystem | undefined {
  return currentSnapshot.subsystems.find((subsystem) => subsystem.id === subsystemId);
}

export function findMilestone(milestoneId: string): Milestone | undefined {
  return currentSnapshot.milestones.find((milestone) => milestone.id === milestoneId);
}

export function findDiscipline(disciplineId: string): Discipline | undefined {
  return currentSnapshot.disciplines.find((discipline) => discipline.id === disciplineId);
}

export function findMechanism(mechanismId: string): Mechanism | undefined {
  return currentSnapshot.mechanisms.find((mechanism) => mechanism.id === mechanismId);
}

export function findProject(projectId: string): Project | undefined {
  return currentSnapshot.projects.find((project) => project.id === projectId);
}

export function findWorkstream(workstreamId: string): Workstream | undefined {
  return currentSnapshot.workstreams.find((workstream) => workstream.id === workstreamId);
}

export function findPartDefinition(partDefinitionId: string): PartDefinition | undefined {
  return currentSnapshot.partDefinitions.find((partDefinition) => partDefinition.id === partDefinitionId);
}

export function findPartInstance(partInstanceId: string): PartInstance | undefined {
  return currentSnapshot.partInstances.find((partInstance) => partInstance.id === partInstanceId);
}

export function findMaterial(materialId: string): Material | undefined {
  return currentSnapshot.materials.find((material) => material.id === materialId);
}

export function findArtifact(artifactId: string): Artifact | undefined {
  return currentSnapshot.artifacts.find((artifact) => artifact.id === artifactId);
}

export function findRisk(riskId: string): Risk | undefined {
  return currentSnapshot.risks.find((risk) => risk.id === riskId);
}
