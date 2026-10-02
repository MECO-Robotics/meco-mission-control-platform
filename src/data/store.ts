import { DEFAULT_PROJECT_TEAM_ID } from "../domain/types";
import { uniqueIds } from "../domain/ids";
import { isTaskWaitingOnDependencies } from "../domain/taskDependencyState";
import { derivePartInstanceReadiness } from "../domain/readiness";
import { partInstanceSubsystemId, partInstanceMechanismId } from "../domain/partInstanceLocation";
import { AsyncLocalStorage } from "node:async_hooks";
import { resolve } from "node:path";

import { createTutorialSnapshot } from "./tutorialSnapshot";
import type { ResponsibleGroupInput } from "./storeTypes";
import type { ReadonlyData, SnapshotView } from "../domain/types";
import type {
  AuditAction,
  AuditActionOperation,
  Artifact,
  DesignIteration,
  Discipline,
  DomainReference,
  MilestoneRequirement,
  Milestone,
  Material,
  Mechanism,
  ManufacturingProcessRecord,
  Member,
  PartDefinition,
  PartInstance,
  PlatformSnapshot,
  Project,
  ResponsibleGroup,
  PurchaseItem,
  Report,
  Risk,
  QaReport,
  QaRequest,
  QaFinding,
  Season,
  Subsystem,
  Task,
  TeamReport,
  TaskDependency,
  TestResult,
  TestFinding,
  Workstream,
  WorkLog,
} from "../domain/types";
import {
  isManualPmCadImportSource,
  markPmCadEditedAfterImport,
  normalizePmCadProvenance,
} from "../domain/pmCadProvenance";
import {
  normalizeMeetingSchedule,
} from "./store/meetingSchedule";
import {
  buildFindings,
  buildReports,
  reportFindingFromFinding,
  reportFromQaReport,
  type FindingListItem,
} from "./store/reportDerivations";
import { assertSnapshotTaskTargets, loadOrArchiveIncompatibleSnapshot, savePlatformSnapshotFile } from "./platformSnapshotFile";
import type {
  ArtifactInput,
  MilestoneInput,
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
  TaskDependencyInput,
  TaskInput,
  TestResultInput,
  WorkLogInput,
  WorkstreamInput,
} from "./storeTypes";

export type {
  ArtifactInput,
  MilestoneInput,
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
  TaskDependencyInput,
  TaskInput,
  TestResultInput,
  WorkLogInput,
  WorkstreamInput,
} from "./storeTypes";

export interface MilestoneMatch {
  milestoneId: string;
  matchedRequirementIds: string[];
  isExplicitScheduleRef: boolean;
}

export interface TaskMilestoneMatch {
  taskId: string;
  matchedRequirementIds: string[];
  isExplicitScheduleRef: boolean;
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

function extractComparableState(targetRef: MilestoneRequirement["targetRefs"][number]) {
  if (targetRef.kind === "artifact") {
    const artifact = currentSnapshot.artifacts.find((candidate) => candidate.id === targetRef.id);
    if (!artifact) {
      return null;
    }

    return normalizeStateValue(artifact.status);
  }

  if (targetRef.kind === "part-instance") {
    const partInstance = currentSnapshot.partInstances.find(
      (candidate) => candidate.id === targetRef.id,
    );
    if (!partInstance) {
      return null;
    }

    return normalizeStateValue(derivePartInstanceReadiness(partInstance, currentSnapshot));
  }

  return null;
}

function extractComparableIteration(targetRef: MilestoneRequirement["targetRefs"][number]) {
  if (targetRef.kind === "subsystem") {
    const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === targetRef.id);
    return subsystem?.iteration;
  }

  if (targetRef.kind === "mechanism") {
    const mechanism = currentSnapshot.mechanisms.find((candidate) => candidate.id === targetRef.id);
    return mechanism?.iteration;
  }

  return undefined;
}

function isConditionSatisfied({
  targetRef,
  conditionType,
  conditionValue,
}: { targetRef: MilestoneRequirement["targetRefs"][number] } & Pick<MilestoneRequirement, "conditionType" | "conditionValue">) {
  if (conditionType === "custom") {
    return conditionValue.trim().toLowerCase() === "in_scope";
  }

  if (conditionType === "iteration") {
    const parsed = parseIterationCondition(conditionValue);
    if (!parsed) {
      return false;
    }

    const actualIteration = extractComparableIteration(targetRef);
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

  const actualState = extractComparableState(targetRef);
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
  milestoneRequirement: ReadonlyData<MilestoneRequirement>;
  targetType: string;
  targetId: string;
}) {
  const targetRef = milestoneRequirement.targetRefs.find((ref) => ref.kind === targetType && ref.id === targetId);
  if (!targetRef) {
    return false;
  }

  if (milestoneRequirement.conditionType === "custom") {
    return true;
  }

  return isConditionSatisfied({ targetRef, conditionType: milestoneRequirement.conditionType, conditionValue: milestoneRequirement.conditionValue });
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
    const bucket = tasksBySubsystemId.get(task.subsystemIds[0] ?? "");
    if (bucket) {
      bucket.push(task);
    } else {
      tasksBySubsystemId.set(task.subsystemIds[0] ?? "", [task]);
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

function deriveTaskSummaries(snapshot: PlatformSnapshot): PlatformSnapshot {
  const hours = new Map<string, number>();
  for (const log of snapshot.workLogs) hours.set(log.taskId, (hours.get(log.taskId) ?? 0) + log.hours);
  const blockedTaskIds = new Set(snapshot.risks.filter((risk) => risk.blocksWork && risk.status !== "resolved")
    .flatMap((risk) => risk.relatedTargets.filter((target) => target.kind === "task").map((target) => target.id)));
  return { ...snapshot, tasks: snapshot.tasks.map((task) => ({
    ...task, actualHours: hours.get(task.id) ?? 0, checklistItems: task.checklistItems ?? [], isBlocked: blockedTaskIds.has(task.id),
  })) };
}

function canonicalizeSnapshot(snapshot: SnapshotView): PlatformSnapshot {
  const clonedSnapshot = structuredClone(snapshot) as PlatformSnapshot;
  assertSnapshotTaskTargets(clonedSnapshot);
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
      status: milestone.status ?? "planned",
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
    purchaseItems: clonedSnapshot.purchaseItems.map((item) => ({
      ...item,
      approvedById: item.approvedById ?? null,
      approvedAt: item.approvedAt ?? null,
      deliveredAt: item.deliveredAt ?? null,
    })),
    meetings: clonedSnapshot.meetings.map((meeting) =>
      normalizeMeetingSchedule(meeting, fallbackSeasonId),
    ),
  });

  return deriveTaskSummaries(normalizeSnapshotTaskSerials({
    ...normalizedSnapshot,
    actions: normalizedSnapshot.actions ?? [],
  }));
}

function ownSnapshot(snapshot: PlatformSnapshot): PlatformSnapshot {
  const owned = structuredClone(snapshot);
  const ancestors = new WeakSet<object>();
  const freeze = (value: unknown): void => {
    if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") {
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return;
    }
    if (typeof value !== "object" ||
      (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) {
      throw new TypeError("Platform snapshots require plain JSON data.");
    }
    if (ancestors.has(value)) {
      throw new TypeError("Platform snapshots cannot contain cyclic data.");
    }
    if (Object.isFrozen(value)) {
      return;
    }
    ancestors.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
    ancestors.delete(value);
  };
  freeze(owned);
  return owned;
}

interface SnapshotState {
  current: PlatformSnapshot;
  interactive: PlatformSnapshot | null;
  mutation?: {
    userKey?: string;
    destination: "global" | "tutorial" | "end-tutorial";
    dirty: boolean;
  };
}

const platformSnapshotPath = resolve(
  process.cwd(),
  process.env.PLATFORM_SNAPSHOT_PATH ?? "data/platform-snapshot.json",
);
const persistedProductionSnapshot = loadOrArchiveIncompatibleSnapshot(platformSnapshotPath);
const globalSnapshotState: SnapshotState = {
  current: ownSnapshot(canonicalizeSnapshot(persistedProductionSnapshot ?? createTutorialSnapshot())),
  interactive: null,
};
const tutorialSnapshotStates = new Map<string, SnapshotState>();
const snapshotContext = new AsyncLocalStorage<SnapshotState>();
const globalMutationKey = Symbol("global snapshot");
const mutationTails = new Map<string | symbol, Promise<void>>();

function activeSnapshotState() {
  return snapshotContext.getStore() ?? globalSnapshotState;
}

const currentSnapshot = new Proxy({} as PlatformSnapshot, {
  get: (_target, property) => Reflect.get(activeSnapshotState().current, property),
  set: () => false,
  defineProperty: () => false,
  deleteProperty: () => false,
  ownKeys: () => Reflect.ownKeys(activeSnapshotState().current),
  getOwnPropertyDescriptor: (_target, property) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(activeSnapshotState().current, property);
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  },
});

function replaceCurrentSnapshot(snapshot: PlatformSnapshot) {
  const state = activeSnapshotState();
  if (state === globalSnapshotState && process.env.NODE_ENV === "production") {
    throw new Error("Production platform mutations require a durable request transaction.");
  }
  state.current = ownSnapshot(deriveTaskSummaries(snapshot));
  if (state.mutation) {
    state.mutation.dirty = true;
  }
}

async function acquireSnapshotLock(key: string | symbol) {
  let releaseLock!: () => void;
  const previous = mutationTails.get(key) ?? Promise.resolve();
  const tail = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  mutationTails.set(key, tail);
  await previous;
  return () => {
    if (mutationTails.get(key) === tail) {
      mutationTails.delete(key);
    }
    releaseLock();
  };
}

export async function acquireSnapshotMutation(userKey?: string) {
  // Resolve the destination after the user queue, so a preceding reset/end wins.
  const releaseUser = userKey ? await acquireSnapshotLock(userKey) : undefined;
  const tutorial = userKey ? tutorialSnapshotStates.get(userKey) : undefined;
  const releaseGlobal = tutorial ? undefined : await acquireSnapshotLock(globalMutationKey);
  const source = tutorial ?? globalSnapshotState;
  const mutation: NonNullable<SnapshotState["mutation"]> = {
    userKey,
    destination: tutorial ? "tutorial" : "global",
    dirty: false,
  };
  const state: SnapshotState = {
    current: source.current,
    interactive: source.interactive,
    mutation,
  };
  let released = false;

  return {
    enter() {
      snapshotContext.enterWith(state);
    },
    hasChanges() {
      return mutation.dirty;
    },
    async commit() {
      if (released) {
        throw new Error("Cannot commit a released snapshot mutation.");
      }
      if (!mutation.dirty) {
        return;
      }
      try {
        if (mutation.destination === "global") {
          if (process.env.NODE_ENV === "production") {
            await savePlatformSnapshotFile(platformSnapshotPath, state.current);
          }
          globalSnapshotState.current = state.current;
          globalSnapshotState.interactive = state.interactive;
        } else if (userKey) {
          if (mutation.destination === "end-tutorial") {
            tutorialSnapshotStates.delete(userKey);
          } else {
            tutorialSnapshotStates.set(userKey, {
              current: state.current,
              interactive: state.interactive,
            });
          }
        }
      } finally {
        mutation.dirty = false;
      }
    },
    release() {
      if (!released) {
        released = true;
        snapshotContext.enterWith(userKey
          ? tutorialSnapshotStates.get(userKey) ?? globalSnapshotState
          : globalSnapshotState);
        releaseGlobal?.();
        releaseUser?.();
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

function tutorialStateForMutation(userKey: string) {
  const state = activeSnapshotState();
  return state.mutation?.userKey === userKey
    ? state.mutation.destination === "tutorial" ? state : undefined
    : tutorialSnapshotStates.get(userKey);
}

export function runWithInteractiveTutorialSession<T>(userKey: string, run: () => T): T {
  return snapshotContext.run(tutorialSnapshotStates.get(userKey) ?? globalSnapshotState, run);
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

function normalizePartInstanceSnapshot(snapshot: PlatformSnapshot) {
  return {
    ...snapshot,
    partInstances: snapshot.partInstances.map((partInstance) => ({
      ...partInstance,
      photoUrl: typeof partInstance.photoUrl === "string" ? partInstance.photoUrl : "",
    })),
  };
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
  const assigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
  return {
    ...task,
    workstreamIds: uniqueIds(task.workstreamIds),
    subsystemIds: uniqueIds(task.subsystemIds),
    mechanismIds: uniqueIds(task.mechanismIds),
    partInstanceIds: uniqueIds(task.partInstanceIds),
    assigneeIds: uniqueIds(assigneeIds.length > 0 ? assigneeIds : [task.ownerId]),
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
  const appendTargets = (targetType: TaskTargetType, targetIds: string[]) => {
    for (const targetId of targetIds) {
      links.push({
        id: `${task.id}:${targetType}:${targetId}`,
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.projectId,
        workstreamId: task.workstreamIds[0] ?? null,
        subsystemId: task.subsystemIds[0] ?? "",
        targetType,
        targetId,
      });
    }
  };

  appendTargets("project", [task.projectId]);
  appendTargets("workstream", uniqueIds(task.workstreamIds));
  appendTargets("subsystem", uniqueIds(task.subsystemIds));
  appendTargets("mechanism", uniqueIds(task.mechanismIds));
  appendTargets("part-instance", uniqueIds(task.partInstanceIds));
  appendTargets("milestone", task.scheduleRefs.filter((ref) => ref.kind === "milestone").map(({ id }) => id));

  return links;
}

const DEFAULT_SEASON_PROJECTS: Array<{
  key: string;
  name: Project["name"];
  projectType: Project["projectType"];
}> = [
  { key: "robot", name: "Robot", projectType: "robot" },
  { key: "media", name: "Media", projectType: "media" },
  { key: "outreach", name: "Outreach", projectType: "outreach" },
  { key: "operations", name: "Operations", projectType: "operations" },
  { key: "strategy", name: "Strategy", projectType: "strategy" },
  { key: "training", name: "Training", projectType: "training" },
];

const TUTORIAL_SEASON_ID = "default-season";
const TUTORIAL_SEASON_NAME = "Tutorial Season";
const EXPECTED_TUTORIAL_PROJECT_NAMES = [
  "Robot",
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

  return { projectId };
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
    workTypeId: workTypeIdForProject(ownership.projectId, "electrical-wiring"),
    responsibleGroupId: null,
    requestedById: null,
    scheduleRefs: [],
    manufacturingDetails: null,
    workstreamIds: [],
    title: `Wire ${mechanism.name}`,
    summary: `Complete wiring and harness verification for ${mechanism.name}.`,
    subsystemIds: [subsystem.id],
    mechanismIds: [mechanism.id],
    partInstanceIds: [],
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

    requiresDocumentation: true,
  };

  return task;
}

function workTypeIdForProject(projectId: string, code: string) {
  const project = currentSnapshot.projects.find((candidate) => candidate.id === projectId);
  const requestedId = project ? `${project.projectType}:${code}` : "";
  return currentSnapshot.workTypes.some((workType) => workType.id === requestedId && workType.isActive)
    ? requestedId
    : currentSnapshot.workTypes.find((workType) => workType.projectType === project?.projectType && workType.isActive)?.id ?? "robot:planning";
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
    workTypeId: workTypeIdForProject(ownership.projectId, "testing"),
    responsibleGroupId: null,
    requestedById: null,
    scheduleRefs: [],
    manufacturingDetails: null,
    workstreamIds: [],
    title: `Integrate ${subsystem.name}`,
    summary: `Complete integration and interface verification for ${subsystem.name}.`,
    subsystemIds: [parentSubsystem.id],
    mechanismIds: [],
    partInstanceIds: [],
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

    requiresDocumentation: true,
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

export function getSnapshot(): SnapshotView {
  return activeSnapshotState().current;
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

export function resetStore(snapshot?: SnapshotView) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  globalSnapshotState.current = ownSnapshot(canonicalizeSnapshot(snapshot ?? createTutorialSnapshot()));
  globalSnapshotState.interactive = null;
  tutorialSnapshotStates.clear();
}

export function resetTutorialBaseline(userKey?: string) {
  if (userKey) {
    const state = tutorialStateForMutation(userKey);
    if (!state) {
      return buildTutorialBaselineState(createTutorialSnapshot());
    }

    state.current = ownSnapshot(canonicalizeSnapshot(createTutorialSnapshot()));
    if (state.mutation) {
      state.mutation.dirty = true;
    }
    return buildTutorialBaselineState(state.current);
  }

  const tutorialSnapshot = getInteractiveTutorialSnapshot();
  replaceCurrentSnapshot(canonicalizeSnapshot(createTutorialSnapshot()));
  setInteractiveTutorialSnapshot(tutorialSnapshot);
  return getTutorialBaselineState();
}

export function startInteractiveTutorialSession(userKey?: string) {
  if (userKey) {
    const current = ownSnapshot(canonicalizeSnapshot(createTutorialSnapshot()));
    const state = activeSnapshotState();
    if (state.mutation?.userKey === userKey) {
      state.current = current;
      state.interactive = current;
      state.mutation.destination = "tutorial";
      state.mutation.dirty = true;
    } else {
      tutorialSnapshotStates.set(userKey, { current, interactive: current });
    }
    return;
  }

  setInteractiveTutorialSnapshot(activeSnapshotState().current);
  replaceCurrentSnapshot(canonicalizeSnapshot(createTutorialSnapshot()));
}

export function resetInteractiveTutorialSession(userKey?: string) {
  if (userKey) {
    const state = tutorialStateForMutation(userKey);
    if (!state?.interactive) {
      return false;
    }

    if (state.mutation) {
      state.current = globalSnapshotState.current;
      state.interactive = null;
      state.mutation.destination = "end-tutorial";
      state.mutation.dirty = true;
    } else {
      tutorialSnapshotStates.delete(userKey);
    }
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

export function getSeasons(): SnapshotView["seasons"] {
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

export function getProjects(): SnapshotView["projects"] {
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
  if (!previousProject) {
    return null;
  }

  const updatedProject: Project = {
    ...previousProject,
    ...input,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    projects: currentSnapshot.projects.map((project) =>
      project.id === projectId ? updatedProject : project,
    ),
  });

  recordAuditAction({
    operation: "update",
    entityType: "project",
    entityId: updatedProject.id,
    entityLabel: updatedProject.name,
    projectId: updatedProject.id,
    changedFields: collectChangedFields(
      previousProject,
      updatedProject,
    ),
  });

  return updatedProject;
}

export function getWorkstreams(): SnapshotView["workstreams"] {
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
  if (!previousWorkstream) {
    return null;
  }
  const nextColor =
    input.color === undefined ? undefined : normalizeWorkspaceColor(input.color);

  const updatedWorkstream: Workstream = {
    ...previousWorkstream,
    ...input,
    color: input.color === undefined ? previousWorkstream.color : nextColor,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    workstreams: currentSnapshot.workstreams.map((workstream) =>
      workstream.id === workstreamId ? updatedWorkstream : workstream,
    ),
  });

  recordAuditAction({
    operation: "update",
    entityType: "workstream",
    entityId: updatedWorkstream.id,
    entityLabel: updatedWorkstream.name,
    projectId: updatedWorkstream.projectId,
    changedFields: collectChangedFields(
      previousWorkstream,
      updatedWorkstream,
    ),
  });

  return updatedWorkstream;
}

export function getResponsibleGroups(): SnapshotView["responsibleGroups"] {
  return currentSnapshot.responsibleGroups;
}

function normalizeResponsibleGroupPrimaries(
  groups: ResponsibleGroup[],
  preferredGroupId: string,
  preferredMemberIds: string[],
) {
  const membersById = new Map(currentSnapshot.members.map((member) => [member.id, member]));
  const preferred = new Set(preferredMemberIds);
  const primaryBySeasonAndMember = new Map<string, string>();
  for (const member of currentSnapshot.members) {
    if (member.role !== "student" && member.role !== "lead") continue;
    const seasons = new Set(groups.filter((group) => group.memberIds.includes(member.id)).map((group) => group.seasonId));
    for (const seasonId of seasons) {
      const key = `${seasonId}\u0000${member.id}`;
      const eligibleGroups = groups.filter((group) => !group.isArchived && group.seasonId === seasonId && group.memberIds.includes(member.id) && (member.activeSeasonIds ?? [member.seasonId]).includes(seasonId));
      const preferredGroup = preferred.has(member.id) ? eligibleGroups.find((group) => group.id === preferredGroupId) : undefined;
      const existingPrimary = eligibleGroups.find((group) => (group.primaryMemberIds ?? []).includes(member.id));
      const primary = preferredGroup ?? existingPrimary ?? eligibleGroups[0];
      if (primary) primaryBySeasonAndMember.set(key, primary.id);
    }
  }
  return groups.map((group) => ({
    ...group,
    primaryMemberIds: group.memberIds.filter((memberId) => {
      const member = membersById.get(memberId);
      return (member?.role === "student" || member?.role === "lead") && primaryBySeasonAndMember.get(`${group.seasonId}\u0000${memberId}`) === group.id;
    }),
  }));
}

export function createResponsibleGroup(input: ResponsibleGroupInput) {
  const previousGroups = currentSnapshot.responsibleGroups;
  const ids = new Set(currentSnapshot.responsibleGroups.map((group) => group.id));
  const id = uniqueId(toSlug(input.name) || "team", ids);
  const groups = normalizeResponsibleGroupPrimaries([
    ...currentSnapshot.responsibleGroups,
    { ...input, workTypeIds: input.workTypeIds ?? [], projectIds: uniqueIds(input.projectIds), memberIds: uniqueIds(input.memberIds), primaryMemberIds: uniqueIds(input.primaryMemberIds), id, isArchived: input.isArchived ?? false },
  ], id, input.primaryMemberIds);
  const created = groups.find((group) => group.id === id)!;
  replaceCurrentSnapshot({ ...currentSnapshot, responsibleGroups: groups });
  for (const group of groups) {
    const previous = previousGroups.find((candidate) => candidate.id === group.id);
    if (previous && previous.primaryMemberIds.join("\u0000") !== group.primaryMemberIds.join("\u0000")) {
      recordAuditAction({ operation: "update", entityType: "responsible-group", entityId: group.id, entityLabel: group.name, memberIds: group.memberIds, changedFields: ["primaryMemberIds"] });
    }
  }
  recordAuditAction({ operation: "create", entityType: "responsible-group", entityId: created.id, entityLabel: created.name, memberIds: created.memberIds });
  return created;
}

export function updateResponsibleGroup(groupId: string, input: Partial<ResponsibleGroupInput>, auditContext: AuditMutationContext = {}) {
  const previousGroups = currentSnapshot.responsibleGroups;
  const previous = previousGroups.find((group) => group.id === groupId);
  if (!previous) return null;
  const name = input.name ?? previous.name;
  const projectIds = input.projectIds === undefined ? previous.projectIds : uniqueIds(input.projectIds);
  const updated = { ...previous, ...input, name, workTypeIds: input.workTypeIds === undefined ? previous.workTypeIds : uniqueIds(input.workTypeIds), projectIds, memberIds: input.memberIds === undefined ? previous.memberIds : uniqueIds(input.memberIds), primaryMemberIds: input.primaryMemberIds === undefined ? previous.primaryMemberIds : uniqueIds(input.primaryMemberIds) };
  const groups = normalizeResponsibleGroupPrimaries(currentSnapshot.responsibleGroups.map((group) => group.id === groupId ? updated : group), groupId, input.primaryMemberIds ?? []);
  const normalizedUpdated = groups.find((group) => group.id === groupId)!;
  replaceCurrentSnapshot({ ...currentSnapshot, responsibleGroups: groups });
  for (const group of groups) {
    if (group.id === groupId) continue;
    const previousGroup = previousGroups.find((candidate) => candidate.id === group.id);
    if (previousGroup && previousGroup.primaryMemberIds.join("\u0000") !== group.primaryMemberIds.join("\u0000")) {
      recordAuditAction({ operation: "update", entityType: "responsible-group", entityId: group.id, entityLabel: group.name, actorMemberId: auditContext.actorMemberId ?? null, requestId: auditContext.requestId ?? null, memberIds: group.memberIds, changedFields: ["primaryMemberIds"] });
    }
  }
  recordAuditAction({ operation: "update", entityType: "responsible-group", entityId: normalizedUpdated.id, entityLabel: normalizedUpdated.name, actorMemberId: auditContext.actorMemberId ?? null, requestId: auditContext.requestId ?? null, memberIds: normalizedUpdated.memberIds, changedFields: collectChangedFields(previous, normalizedUpdated) });
  return normalizedUpdated;
}

export function removeResponsibleGroup(groupId: string, auditContext: AuditMutationContext = {}) {
  const group = currentSnapshot.responsibleGroups.find((candidate) => candidate.id === groupId);
  if (!group) return null;
  const previousGroups = currentSnapshot.responsibleGroups;
  const unassignedTaskCount = currentSnapshot.tasks.filter((task) => task.responsibleGroupId === groupId).length;
  const remainingGroups = normalizeResponsibleGroupPrimaries(
    currentSnapshot.responsibleGroups.filter((candidate) => candidate.id !== groupId),
    "",
    [],
  );
  replaceCurrentSnapshot({
    ...currentSnapshot,
    responsibleGroups: remainingGroups,
    tasks: currentSnapshot.tasks.map((task) => task.responsibleGroupId === groupId ? { ...task, responsibleGroupId: null } : task),
    artifacts: withoutResponsibleGroupTarget(currentSnapshot.artifacts, groupId),
    milestoneRequirements: currentSnapshot.milestoneRequirements?.map((item) => ({ ...item, targetRefs: withoutResponsibleGroupRef(item.targetRefs, groupId) })),
    qaReports: withoutResponsibleGroupTarget(currentSnapshot.qaReports, groupId),
    teamReports: withoutResponsibleGroupTarget(currentSnapshot.teamReports, groupId),
    qaRequests: currentSnapshot.qaRequests?.map((item) => ({ ...item, targetRefs: withoutResponsibleGroupRef(item.targetRefs, groupId) })),
    testResults: withoutResponsibleGroupTarget(currentSnapshot.testResults, groupId),
    qaFindings: withoutResponsibleGroupTarget(currentSnapshot.qaFindings, groupId),
    testFindings: withoutResponsibleGroupTarget(currentSnapshot.testFindings, groupId),
    designIterations: withoutResponsibleGroupTarget(currentSnapshot.designIterations, groupId),
    risks: currentSnapshot.risks.map((risk) => ({
      ...risk,
      ownerGroupId: risk.ownerGroupId === groupId ? null : risk.ownerGroupId,
      relatedTargets: withoutResponsibleGroupRef(risk.relatedTargets, groupId),
    })),
  });
  for (const remaining of remainingGroups) {
    const previous = previousGroups.find((candidate) => candidate.id === remaining.id);
    if (previous && previous.primaryMemberIds.join("\u0000") !== remaining.primaryMemberIds.join("\u0000")) {
      recordAuditAction({ operation: "update", entityType: "responsible-group", entityId: remaining.id, entityLabel: remaining.name, actorMemberId: auditContext.actorMemberId ?? null, requestId: auditContext.requestId ?? null, memberIds: remaining.memberIds, changedFields: ["primaryMemberIds"] });
    }
  }
  recordAuditAction({
    operation: "delete",
    entityType: "responsible-group",
    entityId: group.id,
    entityLabel: group.name,
    actorMemberId: auditContext.actorMemberId ?? null,
    requestId: auditContext.requestId ?? null,
    projectIds: group.projectIds,
    memberIds: group.memberIds,
    detailsJson: { unassignedTaskCount },
  });
  return group;
}

function withoutResponsibleGroupRef(refs: DomainReference[], groupId: string) {
  return refs.filter((ref) => ref.kind !== "responsible-group" || ref.id !== groupId);
}

function withoutResponsibleGroupTarget<T extends { targetRefs: DomainReference[] }>(records: T[], groupId: string) {
  return records.map((record) => ({ ...record, targetRefs: withoutResponsibleGroupRef(record.targetRefs, groupId) }));
}

export function getMembers(): SnapshotView["members"] {
  return currentSnapshot.members;
}

export function getSubsystems(): SnapshotView["subsystems"] {
  return currentSnapshot.subsystems;
}

export function getMechanisms(): SnapshotView["mechanisms"] {
  return currentSnapshot.mechanisms;
}

export function getMaterials(): SnapshotView["materials"] {
  return currentSnapshot.materials;
}

export function getArtifacts(): SnapshotView["artifacts"] {
  return currentSnapshot.artifacts;
}

export function getPartDefinitions(): SnapshotView["partDefinitions"] {
  return currentSnapshot.partDefinitions;
}

export function getPartInstances(): SnapshotView["partInstances"] {
  return currentSnapshot.partInstances;
}

export function getTasks(): SnapshotView["tasks"] {
  return currentSnapshot.tasks;
}

export function getMilestones(): SnapshotView["milestones"] {
  return currentSnapshot.milestones;
}

export function getMilestoneRequirements(): NonNullable<SnapshotView["milestoneRequirements"]> {
  return currentSnapshot.milestoneRequirements ?? [];
}

export function getTaskDependencies(): SnapshotView["taskDependencies"] {
  return currentSnapshot.taskDependencies;
}

export function getQaReports(): SnapshotView["qaReports"] {
  return currentSnapshot.qaReports;
}

export function getQaRequests(): NonNullable<SnapshotView["qaRequests"]> {
  return currentSnapshot.qaRequests ?? [];
}

export function getTestResults(): SnapshotView["testResults"] {
  return currentSnapshot.testResults;
}

export function getDesignIterations(): SnapshotView["designIterations"] {
  return currentSnapshot.designIterations;
}

export function getReports() {
  return buildReports(currentSnapshot);
}

export function getFindings(): FindingListItem[] {
  return buildFindings(currentSnapshot);
}

export function getTaskTargets() {
  const taskTargets = currentSnapshot.tasks.flatMap((task) => flattenTaskTargets(task));
  const taskById = new Map(currentSnapshot.tasks.map((task) => [task.id, task]));
  const evidenceTargets = currentSnapshot.artifacts.flatMap((artifact) =>
    artifact.targetRefs.flatMap((ref) => {
      if (ref.kind !== "task") return [];
      const task = taskById.get(ref.id);
      if (!task) return [];
      return [{
        id: `${task.id}:artifact:${artifact.id}`,
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.projectId,
        workstreamId: task.workstreamIds[0] ?? null,
        subsystemId: task.subsystemIds[0] ?? "",
        targetType: "artifact" as const,
        targetId: artifact.id,
      }];
    }),
  );
  return [...taskTargets, ...evidenceTargets];
}

function matchTaskTargetsToMilestoneRequirements(
  targets: ReturnType<typeof flattenTaskTargets>,
  requirements: readonly ReadonlyData<MilestoneRequirement>[],
) {
  const matchedRequirementIdsByMilestone = new Map<string, Set<string>>();

  for (const target of targets) {
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

      const matchedRequirementIds =
        matchedRequirementIdsByMilestone.get(requirement.milestoneId) ?? new Set<string>();
      matchedRequirementIds.add(requirement.id);
      matchedRequirementIdsByMilestone.set(requirement.milestoneId, matchedRequirementIds);
    }
  }

  return matchedRequirementIdsByMilestone;
}

export function getMilestonesForTask(taskId: string): MilestoneMatch[] {
  const task = currentSnapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return [];
  }

  const taskTargets = flattenTaskTargets(task);
  const matchedMilestoneIds = matchTaskTargetsToMilestoneRequirements(
    taskTargets,
    getMilestoneRequirements(),
  );
  const explicitScheduleMilestoneIds = new Set(
    taskTargets
      .filter((target) => target.targetType === "milestone")
      .map((target) => target.targetId),
  );

  for (const milestoneId of explicitScheduleMilestoneIds) {
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
      isExplicitScheduleRef: explicitScheduleMilestoneIds.has(milestoneId),
    }));
}

export function getTasksForMilestone(milestoneId: string): TaskMilestoneMatch[] {
  const requirements = getMilestoneRequirements().filter(
    (requirement) => requirement.milestoneId === milestoneId,
  );

  return currentSnapshot.tasks
    .map((task) => {
      const taskTargets = flattenTaskTargets(task);
      const matchedRequirementIds =
        matchTaskTargetsToMilestoneRequirements(taskTargets, requirements).get(milestoneId) ??
        new Set<string>();
      const isExplicitScheduleRef = taskTargets.some(
        (target) => target.targetType === "milestone" && target.targetId === milestoneId,
      );

      if (matchedRequirementIds.size > 0 || isExplicitScheduleRef) {
        return {
          taskId: task.id,
          matchedRequirementIds: Array.from(matchedRequirementIds),
          isExplicitScheduleRef,
        };
      }

      return null;
    })
    .filter((match): match is TaskMilestoneMatch => match !== null);
}

export function getRisks(): SnapshotView["risks"] {
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
  return [risk.projectId];
}

export function createRisk(input: RiskInput) {
  const riskIds = new Set(currentSnapshot.risks.map((risk) => risk.id));
  const risk: Risk = {
    id: uniqueId(toSlug(input.title) || "risk", riskIds),
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: input.resolvedAt ?? (input.status === "resolved" ? new Date().toISOString() : null),
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
  if (!previousRisk) {
    return null;
  }

  const updatedRisk: Risk = {
    ...previousRisk,
    ...input,
    updatedAt: new Date().toISOString(),
    resolvedAt: input.status === "resolved" ? input.resolvedAt ?? new Date().toISOString() : input.status ? null : previousRisk.resolvedAt,
    mitigationTaskId:
      input.mitigationTaskId === undefined
        ? previousRisk.mitigationTaskId
        : input.mitigationTaskId,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    risks: currentSnapshot.risks.map((risk) =>
      risk.id === riskId ? updatedRisk : risk,
    ),
  });

  const projectIds = uniqueIds([
    ...getRiskProjectIds(previousRisk),
    ...getRiskProjectIds(updatedRisk),
  ]);
  recordAuditAction({
    operation: "update",
    entityType: "risk",
    entityId: updatedRisk.id,
    entityLabel: updatedRisk.title,
    projectIds,
    taskId: updatedRisk.mitigationTaskId,
    changedFields: collectChangedFields(
      previousRisk,
      updatedRisk,
    ),
  });

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
      source: risk.source,
      relatedTargets: risk.relatedTargets,
      projectIds,
    },
  });

  return risk;
}

export function getPurchaseItems(): SnapshotView["purchaseItems"] {
  return currentSnapshot.purchaseItems;
}

export function createManufacturingProcess(input: Pick<ManufacturingProcessRecord, "code" | "name">) {
  const id = uniqueId(toSlug(input.code) || "manufacturing-process", new Set(currentSnapshot.manufacturingProcesses.map((item) => item.id)));
  const process = { id, code: input.code, name: input.name, isActive: true } satisfies ManufacturingProcessRecord;
  replaceCurrentSnapshot({ ...currentSnapshot, manufacturingProcesses: [...currentSnapshot.manufacturingProcesses, process] });
  return process;
}

export function archiveManufacturingProcess(processId: string) {
  const process = currentSnapshot.manufacturingProcesses.find((item) => item.id === processId);
  if (!process) return null;
  const archived = { ...process, isActive: false };
  replaceCurrentSnapshot({ ...currentSnapshot, manufacturingProcesses: currentSnapshot.manufacturingProcesses.map((item) => item.id === processId ? archived : item) });
  return archived;
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
    preferredVendorId: input.preferredVendorId,
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
  if (!previousMaterial) {
    return null;
  }

  const updatedMaterial: Material = {
    ...previousMaterial,
    ...input,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    materials: currentSnapshot.materials.map((material) =>
      material.id === materialId ? updatedMaterial : material,
    ),
  });

  recordAuditAction({
    operation: "update",
    entityType: "material",
    entityId: updatedMaterial.id,
    entityLabel: updatedMaterial.name,
    changedFields: collectChangedFields(
      previousMaterial,
      updatedMaterial,
    ),
  });

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
    targetRefs: input.targetRefs?.map((ref) => ({ ...ref })) ?? [{ kind: "project", id: input.projectId }],
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    status: input.status,
    uri: input.uri,
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
  if (!previousArtifact) {
    return null;
  }

  const updatedArtifact: Artifact = {
    ...previousArtifact,
    ...input,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    artifacts: currentSnapshot.artifacts.map((artifact) =>
      artifact.id === artifactId ? updatedArtifact : artifact,
    ),
  });

  recordAuditAction({
    operation: "update",
    entityType: "artifact",
    entityId: updatedArtifact.id,
    entityLabel: updatedArtifact.title,
    projectId: updatedArtifact.projectId,
    changedFields: collectChangedFields(
      previousArtifact,
      updatedArtifact,
    ),
  });

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
    designIterations: currentSnapshot.designIterations,
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
      subsystemId: integrationTask.subsystemIds[0] ?? "",
      taskId: integrationTask.id,
      memberIds: [integrationTask.ownerId, ...integrationTask.assigneeIds, integrationTask.mentorId],
      actorMemberId: integrationTask.ownerId,
    });
  }

  return subsystem;
}

export function updateSubsystem(subsystemId: string, input: Partial<SubsystemInput>) {
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

  const updatedSubsystem: Subsystem = {
    ...currentSubsystem,
    ...input,
    ...normalizePmCadProvenance({
      ...currentSubsystem,
      ...input,
      cadEditedAfterImport: markPmCadEditedAfterImport(currentSubsystem, input),
    }),
    serialAlias: nextSerialAlias,
    color: nextColor,
    iteration:
      input.iteration === undefined
        ? currentSubsystem.iteration
        : normalizeIteration(input.iteration),
    parentSubsystemId: nextParentSubsystemId,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    subsystems: currentSnapshot.subsystems.map((subsystem) =>
      subsystem.id === subsystemId ? updatedSubsystem : subsystem,
    ),
  });

  replaceCurrentSnapshot(normalizeSnapshotTaskSerials(currentSnapshot));

  recordAuditAction({
    operation: "update",
    entityType: "subsystem",
    entityId: updatedSubsystem.id,
    entityLabel: updatedSubsystem.name,
    projectId: updatedSubsystem.projectId,
    subsystemId: updatedSubsystem.id,
    memberIds: [updatedSubsystem.responsibleEngineerId, ...updatedSubsystem.mentorIds],
    actorMemberId: updatedSubsystem.responsibleEngineerId,
    changedFields: collectChangedFields(
      currentSubsystem,
      updatedSubsystem,
    ),
  });

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
          subsystemIdsToRemove.has(partInstanceSubsystemId(partInstance) ?? "") ||
          mechanismIdsToRemove.has(partInstanceMechanismId(partInstance) ?? ""),
      )
      .map((partInstance) => partInstance.id),
  );
  const purchaseItemIdsToRemove = new Set(
    currentSnapshot.purchaseItems
      .filter((item) => subsystemIdsToRemove.has(currentSnapshot.tasks.find((task) => task.id === item.taskId)?.subsystemIds[0] ?? ""))
      .map((item) => item.id),
  );
  const taskIdsToRemove = new Set(
    currentSnapshot.tasks
      .filter(
        (task) =>
          task.subsystemIds.some((candidate) => subsystemIdsToRemove.has(candidate)) ||
          task.mechanismIds.some((candidate) => mechanismIdsToRemove.has(candidate)) ||
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
    tasks: currentSnapshot.tasks.filter((task) => !taskIdsToRemove.has(task.id)),
    workLogs: currentSnapshot.workLogs.filter(
      (workLog) => !taskIdsToRemove.has(workLog.taskId),
    ),
    milestones: currentSnapshot.milestones.map((milestone) => milestone),
    qaReports: currentSnapshot.qaReports.filter(
      (report) => !report.targetRefs.some((ref) => ref.kind === "task" && taskIdsToRemove.has(ref.id)),
    ),
    qaRequests: getQaRequests().map((request) => ({ ...request, targetRefs: request.targetRefs.map((ref) => ({ ...ref })) })).filter(
      (request) => !request.targetRefs.some((ref) => ref.kind === "task" && taskIdsToRemove.has(ref.id)),
    ),
    risks: currentSnapshot.risks.filter((risk) => {
      if (risk.mitigationTaskId && taskIdsToRemove.has(risk.mitigationTaskId)) {
        return false;
      }
      if (risk.relatedTargets.some((target) => (target.kind === "mechanism" && mechanismIdsToRemove.has(target.id)) || (target.kind === "part-instance" && partInstanceIdsToRemove.has(target.id)))) return false;

      return true;
    }),
    purchaseItems: currentSnapshot.purchaseItems.filter(
      (item) => !purchaseItemIdsToRemove.has(item.id),
    ),
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

export function createPartDefinition(input: PartDefinitionInput, auditContext: AuditMutationContext = {}) {
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
    defaultAcquisitionMethod: input.defaultAcquisitionMethod,
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
    ...auditContext,
  });

  return partDefinition;
}

export interface PartAcquisitionPlan {
  method: "manufacture" | "purchase-cots";
  requestedById: string | null;
  task: TaskInput;
}

// Compose in a private synchronous draft: even tutorial sessions publish only
// after every command succeeds. The enclosing request owns durable commit.
export function createPartDefinitionWithAcquisition(
  definition: PartDefinitionInput,
  plan: PartAcquisitionPlan | null,
  auditContext: AuditMutationContext,
) {
  const draft: SnapshotState = { current: activeSnapshotState().current, interactive: null };
  const result = snapshotContext.run(draft, () => {
    const item = createPartDefinition(definition, auditContext);
    if (!plan) {
      return { item, purchaseItem: null, task: null };
    }
    const task = createTask({
      ...plan.task,
      manufacturingDetails: plan.method === "manufacture" && plan.task.manufacturingDetails
        ? { ...plan.task.manufacturingDetails, part: { kind: "part-definition", partDefinitionId: item.id } }
        : null,
        }, auditContext);
    const needsPurchasing = plan.method === "purchase-cots" ||
      (plan.method === "manufacture" && task.manufacturingDetails?.fulfillmentSource === "outsourced");
    const purchaseItem = needsPurchasing ? createPurchaseItem({
      taskId: task.id,
      kind: plan.method === "purchase-cots" ? "cots-goods" : "manufacturing-service",
      partDefinitionId: item.id,
      materialId: item.materialId,
      title: plan.method === "purchase-cots" ? item.name : `${item.name} outsourced fabrication`,
      quantity: plan.method === "purchase-cots" ? 1 : task.manufacturingDetails?.quantity ?? 1,
      quotes: [],
      selectedQuoteId: null,
      approvalStatus: "pending",
      approvedById: null,
      approvedAt: null,
      purchaseOrderNumber: null,
      orderStatus: "not-ordered",
      finalCost: null,
      expectedDeliveryDate: null,
      trackingNumber: null,
      trackingUrl: null,
      orderedAt: null,
      deliveredAt: null,
    }, auditContext) : null;
    return { item, purchaseItem, task };
  });
  replaceCurrentSnapshot(draft.current);
  return result;
}

export function updatePartDefinition(
  partDefinitionId: string,
  input: Partial<PartDefinitionInput>,
) {
  const previousPartDefinition = currentSnapshot.partDefinitions.find(
    (partDefinition) => partDefinition.id === partDefinitionId,
  );
  if (!previousPartDefinition) {
    return null;
  }

  const seasonId = input.seasonId ?? previousPartDefinition.seasonId;
  const activeSeasonIds =
    input.activeSeasonIds === undefined
      ? uniqueIds([...(previousPartDefinition.activeSeasonIds ?? []), seasonId])
      : uniqueIds([...(input.activeSeasonIds ?? []), seasonId]);
  const updatedPartDefinition: PartDefinition = {
    ...previousPartDefinition,
    ...input,
    ...normalizePmCadProvenance({
      ...previousPartDefinition,
      ...input,
      cadEditedAfterImport: markPmCadEditedAfterImport(previousPartDefinition, input),
    }),
    seasonId,
    activeSeasonIds,
    iteration:
      input.iteration === undefined
        ? previousPartDefinition.iteration
        : normalizeIteration(input.iteration),
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    partDefinitions: currentSnapshot.partDefinitions.map((partDefinition) =>
      partDefinition.id === partDefinitionId ? updatedPartDefinition : partDefinition,
    ),
  });

  recordAuditAction({
    operation: "update",
    entityType: "part-definition",
    entityId: updatedPartDefinition.id,
    entityLabel: updatedPartDefinition.name,
    detailsJson: getSeasonAuditDetails(previousPartDefinition, updatedPartDefinition),
    changedFields: collectChangedFields(
      previousPartDefinition,
      updatedPartDefinition,
    ),
  });

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
        partInstanceIds.length === task.partInstanceIds.length
      ) {
        return task;
      }

      return normalizeTaskTargets({
        ...task,
        partInstanceIds,
      });
    }),
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
      subsystemId: wiringTask.subsystemIds[0] ?? "",
      taskId: wiringTask.id,
      memberIds: [wiringTask.ownerId, ...wiringTask.assigneeIds, wiringTask.mentorId],
      actorMemberId: wiringTask.ownerId,
    });
  }

  return mechanism;
}

export function createPartInstance(input: PartInstanceInput): ReadonlyData<PartInstance> {
  const id = uniqueId(`part-instance-${input.partDefinitionId}`, new Set(currentSnapshot.partInstances.map((part) => part.id)));
  const partInstance: PartInstance = {
    id,
    ...normalizePmCadProvenance(input),
    partDefinitionId: input.partDefinitionId,
    intendedSubsystemId: input.intendedSubsystemId,
    intendedMechanismId: input.intendedMechanismId,
    location: input.location,
    photoUrl: input.photoUrl ?? "",
  };
  replaceCurrentSnapshot({ ...currentSnapshot, partInstances: [...currentSnapshot.partInstances, partInstance] });
  const subsystemId = input.location.kind === "installed" ? input.location.subsystemId : input.intendedSubsystemId;
  recordAuditAction({ operation: "create", entityType: "part-instance", entityId: id,
    entityLabel: currentSnapshot.partDefinitions.find((part) => part.id === input.partDefinitionId)?.name ?? input.partDefinitionId,
    projectId: getSubsystemProjectId(subsystemId), subsystemId: subsystemId ?? undefined });
  return partInstance;
}

export function updatePartInstance(
  partInstanceId: string,
  input: Partial<PartInstanceInput>,
): ReadonlyData<PartInstance> | null {
  const currentPartInstance = currentSnapshot.partInstances.find(
    (partInstance) => partInstance.id === partInstanceId,
  );
  if (!currentPartInstance) {
    return null;
  }

  const updatedPartInstance: PartInstance = {
    ...currentPartInstance,
    ...input,
    ...normalizePmCadProvenance({ ...currentPartInstance, ...input,
      cadEditedAfterImport: markPmCadEditedAfterImport(currentPartInstance, input) }),
  };
  replaceCurrentSnapshot({
    ...currentSnapshot,
    partInstances: currentSnapshot.partInstances.map((part) => part.id === partInstanceId ? updatedPartInstance : part),
  });
  const savedPartInstance = updatedPartInstance;
  {
    const subsystemId = savedPartInstance.location.kind === "installed" ? savedPartInstance.location.subsystemId : savedPartInstance.intendedSubsystemId;
    recordAuditAction({
      operation: "update",
      entityType: "part-instance",
      entityId: savedPartInstance.id,
      entityLabel: currentSnapshot.partDefinitions.find((part) => part.id === savedPartInstance.partDefinitionId)?.name ?? savedPartInstance.partDefinitionId,
      projectIds: uniqueIds([
        getSubsystemProjectId(currentPartInstance.intendedSubsystemId),
        getSubsystemProjectId(subsystemId),
      ]),
      subsystemId: subsystemId ?? undefined,
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
        !task.partInstanceIds.includes(partInstanceId)
      ) {
        return task;
      }

      const partInstanceIds = task.partInstanceIds.filter(
        (candidate) => candidate !== partInstanceId,
      );
      return normalizeTaskTargets({
        ...task,
        partInstanceIds,
      });
    }),
  });

  recordAuditAction({
    operation: "delete",
    entityType: "part-instance",
    entityId: partInstance.id,
    entityLabel: currentSnapshot.partDefinitions.find((part) => part.id === partInstance.partDefinitionId)?.name ?? partInstance.partDefinitionId,
    projectId: getSubsystemProjectId(partInstance.intendedSubsystemId),
    subsystemId: partInstance.intendedSubsystemId ?? undefined,
  });

  return partInstance;
}

export function updateMechanism(mechanismId: string, input: Partial<MechanismInput>) {

  const currentMechanism = currentSnapshot.mechanisms.find(
    (mechanism) => mechanism.id === mechanismId,
  );
  if (!currentMechanism) {
    return null;
  }

  const nextSubsystemId = input.subsystemId ?? currentMechanism.subsystemId;

  const updatedMechanism: Mechanism = {
    ...currentMechanism,
    ...input,
    ...normalizePmCadProvenance({
      ...currentMechanism,
      ...input,
      cadEditedAfterImport: markPmCadEditedAfterImport(currentMechanism, input),
    }),
    googleSheetsUrl:
      input.googleSheetsUrl === undefined
        ? currentMechanism.googleSheetsUrl ?? ""
        : input.googleSheetsUrl,
    iteration:
      input.iteration === undefined
        ? currentMechanism.iteration
        : normalizeIteration(input.iteration),
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    mechanisms: currentSnapshot.mechanisms.map((mechanism) =>
      mechanism.id === mechanismId ? updatedMechanism : mechanism,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      if (!task.mechanismIds.includes(mechanismId)) {
        return task;
      }

      return normalizeTaskTargets({
        ...task,
        subsystemIds: uniqueIds([
          nextSubsystemId,
          ...task.subsystemIds.filter(
            (subsystemId) => subsystemId !== currentMechanism.subsystemId,
          ),
        ]),
      });
    }),
    partInstances: currentSnapshot.partInstances.map((partInstance) =>
      partInstanceMechanismId(partInstance) === mechanismId
        ? {
            ...partInstance,
            intendedSubsystemId: nextSubsystemId,
            ...(partInstance.location.kind === "installed" ? { location: { ...partInstance.location, subsystemId: nextSubsystemId } } : {}),
          }
        : partInstance,
    ),
  });

  recordAuditAction({
    operation: "update",
    entityType: "mechanism",
    entityId: updatedMechanism.id,
    entityLabel: updatedMechanism.name,
    projectIds: uniqueIds([
      getSubsystemProjectId(currentMechanism.subsystemId),
      getSubsystemProjectId(updatedMechanism.subsystemId),
    ]),
    subsystemId: updatedMechanism.subsystemId,
    changedFields: collectChangedFields(
      currentMechanism,
      updatedMechanism,
    ),
  });

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
      if (!task.mechanismIds.includes(mechanismId)) {
        return task;
      }

      const mechanismIds = task.mechanismIds.filter(
        (candidate) => candidate !== mechanismId,
      );
      return normalizeTaskTargets({
        ...task,
        mechanismIds,
      });
    }),
    partInstances: currentSnapshot.partInstances.map((partInstance) =>
      partInstanceMechanismId(partInstance) === mechanismId
        ? {
            ...partInstance,
            intendedMechanismId: null,
            ...(partInstance.location.kind === "installed" ? { location: { ...partInstance.location, mechanismId: null } } : {}),
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

export function createTask(input: TaskInput, auditContext: AuditMutationContext = {}): ReadonlyData<Task> {
  const taskIds = new Set(currentSnapshot.tasks.map((task) => task.id));
  const nextSerialNumber =
    currentSnapshot.tasks.reduce((max, task) => {
      if (task.subsystemIds[0] !== input.subsystemIds[0]) {
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
    workTypeId: input.workTypeId,
    responsibleGroupId: input.responsibleGroupId ?? null,
    requestedById: input.requestedById ?? null,
    scheduleRefs: input.scheduleRefs ?? [],
    manufacturingDetails: input.manufacturingDetails ?? null,
    workstreamIds: input.workstreamIds,
    title: input.title,
    summary: input.summary,
    subsystemIds: input.subsystemIds,
    mechanismIds: input.mechanismIds,
    partInstanceIds: input.partInstanceIds,
    photoUrl: input.photoUrl ?? "",
    ownerId: input.ownerId,
    assigneeIds: input.assigneeIds,
    mentorId: input.mentorId,
    startDate: input.startDate,
    dueDate: input.dueDate,
    priority: input.priority,
    status: input.status,
    checklistItems: input.checklistItems ?? [],

    estimatedHours: input.estimatedHours,
    actualHours: 0,
    requiresDocumentation: input.requiresDocumentation,
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
    subsystemId: savedTask.subsystemIds[0] ?? "",
    taskId: savedTask.id,
    memberIds: [savedTask.ownerId, ...savedTask.assigneeIds, savedTask.mentorId],
    actorMemberId: savedTask.ownerId,
    ...auditContext,
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
      targetRefs: [{ kind: "project", id: projectId }],
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
    id: uniqueId(toSlug(`${input.title} ${input.startAt.slice(0, 10)}`) || "milestone", milestoneIds),
    seasonId,
    title: input.title,
    type: input.type,
    startAt: input.startAt,
    endAt: input.endAt,
    isExternal: input.isExternal,
    description: input.description,
    projectIds: input.projectIds,
    status: input.status ?? "planned",
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
  const taskId = input.targetRefs.find((ref) => ref.kind === "task")?.id;
  const task = currentSnapshot.tasks.find((candidate) => candidate.id === taskId);
  const reportIds = new Set(currentSnapshot.qaReports.map((report) => report.id));
  const now = new Date().toISOString();
  const report: QaReport = {
    id: uniqueId(toSlug(`${input.targetRefs[0]?.kind ?? "project"}-${input.targetRefs[0]?.id ?? input.projectId} qa`) || "qa-report", reportIds),
    reportType: "qa",
    projectId: input.projectId,
    createdByMemberId: input.createdByMemberId ?? input.requestedById ?? null,
    summary: input.notes,
    status: input.status ?? "submitted",
    reviewedById: input.reviewedById ?? null,
    createdAt: input.createdAt ?? now,
    targetRefs: input.targetRefs.map((ref) => ({ ...ref })),
    participantIds: input.participantIds,
    result: input.result,
    notes: input.notes,
    photoUrl: input.photoUrl ?? "",
    reviewedAt: input.reviewedAt ?? null,
    evidenceNotes: input.evidenceNotes ?? "",
    mentorId: input.mentorId ?? null,
    requestedById: input.requestedById ?? null,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    qaReports: [...currentSnapshot.qaReports, report],
  });

  const reportTask = task;
  recordAuditAction({
    operation: "create",
    entityType: "report",
    entityId: report.id,
    entityLabel: reportTask ? `QA: ${reportTask.title}` : `QA report ${report.id}`,
    projectId: report.projectId,
    subsystemId: reportTask?.subsystemIds[0] ?? null,
    taskId: task?.id ?? null,
    memberIds: report.participantIds,
  });

  return report;
}

// Called inside the route's snapshot transaction: the report and its workflow
// effects must become durable together, or none of them may be published.
export function submitQaReport(input: QaReportInput & { followUpTaskTitle?: string }) {
  const taskId = input.targetRefs.find((ref) => ref.kind === "task")?.id;
  const task = currentSnapshot.tasks.find((item) => item.id === taskId);
  const requestedQaId = input.targetRefs.find((ref) => ref.kind === "qa-request")?.id;
  const request = requestedQaId
    ? getQaRequests().find((item) => item.id === requestedQaId)
    : getQaRequests().find((item) => item.targetRefs.some((ref) => input.targetRefs.some((target) => target.kind === ref.kind && target.id === ref.id)));
  if (requestedQaId && !request) {
    return { error: "The selected QA request is no longer available for these targets." };
  }
    if (task && input.result === "pass" && (task.status !== "waiting-for-qa" ||
      task.isBlocked || isTaskWaitingOnDependencies(task, currentSnapshot))) {
    return { error: "A pass requires a task waiting for QA with no blocking risks or unfinished dependencies." };
  }
  const report = createQaReport({ ...input,
    mentorId: request?.mentorId ?? task?.mentorId ?? input.mentorId,
    requestedById: request?.requestedById ?? null });
  if (task && input.result === "pass") {
    updateTask(task.id, { status: "complete" });
  } else if (task) {
    const reviewedDate = input.reviewedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    createTask({ ...task,
      title: input.followUpTaskTitle?.trim() || `${input.result === "iteration-worthy" ? "Iterate after QA" : "Fix QA finding"}: ${task.title}`,
      summary: [`Created from QA on "${task.title}".`, `Result: ${input.result}.`, input.notes,
        input.evidenceNotes ? `Evidence: ${input.evidenceNotes}` : ""].filter(Boolean).join("\n"),
      startDate: reviewedDate, dueDate: reviewedDate,
      status: "not-started", priority: input.result === "iteration-worthy" ? "high" : "medium",
      checklistItems: [], estimatedHours: 0,
    });
    if (input.result === "iteration-worthy") createRisk({
      projectId: task.projectId, title: `QA iteration: ${task.title}`,
      detail: "QA identified iteration-worthy follow-up.", severity: "medium", category: "qa",
      status: "open", blocksWork: true, source: { kind: "report", id: report.id },
      relatedTargets: [{ kind: "task", id: task.id }], mitigationTaskId: null,
      ownerGroupId: task.responsibleGroupId,
    });
  }
  replaceCurrentSnapshot({ ...currentSnapshot,
    qaRequests: getQaRequests().map((request) => ({ ...request, targetRefs: request.targetRefs.map((ref) => ({ ...ref })) })).filter((item) => item.id !== request?.id) });
  return { item: report };
}

export function createQaRequest(input: QaRequestInput) {
  const taskId = input.targetRefs?.find((ref) => ref.kind === "task")?.id;
  const task = taskId
    ? currentSnapshot.tasks.find((candidate) => candidate.id === taskId)
    : null;
  const requestIds = new Set(getQaRequests().map((request) => request.id));
  const subject = input.subject.trim();
  const request: QaRequest = {
    id: uniqueId(toSlug(`${subject} qa request`) || "qa-request", requestIds),
    projectId: input.projectId ?? task?.projectId ?? "",
    targetRefs: input.targetRefs?.map((ref) => ({ ...ref })) ?? (taskId ? [{ kind: "task", id: taskId }] : []),
    subject,
    mentorId: input.mentorId ?? null,
    requestedById: input.requestedById ?? null,
    createdAt: new Date().toISOString(),
    status: "requested",
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    qaRequests: [request, ...getQaRequests().map((item) => ({ ...item, targetRefs: item.targetRefs.map((ref) => ({ ...ref })) }))],
  });

  recordAuditAction({
    operation: "create",
    entityType: "qa_request",
    entityId: request.id,
    entityLabel: request.subject,
    projectId: task?.projectId ?? null,
    subsystemId: task?.subsystemIds[0] ?? null,
    taskId,
    actorMemberId: request.requestedById,
    memberIds: [request.requestedById, request.mentorId],
  });

  return request;
}

export function createTestResult(input: TestResultInput) {
  const resultIds = new Set(currentSnapshot.testResults.map((result) => result.id));
  const testResult: TestResult = {
    id: uniqueId(toSlug(input.title) || "test-result", resultIds),
    projectId: input.projectId ?? "",
    targetRefs: input.targetRefs.map((ref) => ({ ...ref })),
    title: input.title,
    status: input.status,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    testResults: [...currentSnapshot.testResults, testResult],
  });

  recordAuditAction({
    operation: "create",
    entityType: "report",
    entityId: testResult.id,
    entityLabel: testResult.title,
    projectId: testResult.projectId || null,
  });

  return testResult;
}

export function createReport(input: ReportInput) {
  if (input.reportType === "qa") {
    const report = createQaReport({
      projectId: input.projectId,
      createdByMemberId: input.createdByMemberId,
      targetRefs: input.targetRefs,
      participantIds: uniqueIds(input.participantIds ?? []),
      result:
        input.result === "minor-fix" || input.result === "iteration-worthy"
          ? input.result
          : "pass",
      status: input.status,
      notes: input.notes || input.summary,
      photoUrl: input.photoUrl,
      reviewedAt: input.reviewedAt,
      mentorId: input.mentorId,
      requestedById: input.requestedById,
      reviewedById: input.reviewedById,
    });

    return reportFromQaReport(undefined, report);
  }
  const report: TeamReport = { ...input, id: uniqueId(toSlug(input.summary) || "team-report", new Set(currentSnapshot.teamReports.map((item) => item.id))) };
  replaceCurrentSnapshot({ ...currentSnapshot, teamReports: [...currentSnapshot.teamReports, report] });
  return report;
}

export function createReportFinding(input: ReportFindingInput) {
  const report = getReports().find((candidate) => candidate.id === input.reportId);
  if (!report) {
    return null;
  }

  const now = new Date().toISOString();
  if (report.reportType !== "qa") return null;
  const existingFindings = currentSnapshot.qaFindings;
  const findingIds = new Set(existingFindings.map((finding) => finding.id));
  const fields = {
    id: uniqueId(
      toSlug(input.issueType) || "qa-finding",
      findingIds,
    ),
    targetRefs: input.targetRefs,
    projectId: report.projectId,
    title: input.issueType,
    detail: input.notes,
    severity: input.severity,
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
    reportId: input.reportId,
  };
  const finding: QaFinding = fields;
  replaceCurrentSnapshot({ ...currentSnapshot, qaFindings: [...currentSnapshot.qaFindings, finding] });

  recordAuditAction({
    operation: "create",
    entityType: "report-finding",
    entityId: finding.id,
    entityLabel: finding.title,
    projectId: finding.projectId,
  });

  return reportFindingFromFinding(finding);
}

export function createTaskDependency(input: TaskDependencyInput) {
  const dependencyIds = new Set(currentSnapshot.taskDependencies.map((dependency) => dependency.id));
  const dependency: TaskDependency = {
    ...input,
    id: uniqueId(`${input.taskId}-dependency`, dependencyIds),
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
    subsystemId: task?.subsystemIds[0] ?? null,
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
  const savedDependency = {
    ...originalDependency,
    ...input,
  } as TaskDependency;

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
    subsystemId: task?.subsystemIds[0] ?? null,
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
    subsystemId: task?.subsystemIds[0] ?? null,
  });

  return dependency;
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
    status: input.status ?? currentMilestone.status,
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

      // Keep non-scope requirements untouched. Scope requirements track milestone project membership.
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
    testResults: currentSnapshot.testResults.filter((result) => !result.targetRefs.some((ref) => ref.kind === "milestone" && ref.id === milestoneId)),
    tasks: currentSnapshot.tasks.map((task) => ({
      ...task,
      scheduleRefs: task.scheduleRefs.filter((ref) => ref.kind !== "milestone" || ref.id !== milestoneId),
    })),
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
      id: uniqueId(toSlug(`${input.title} ${input.startAt.slice(0, 10)}`) || "meeting", meetingIds),
      title: input.title,
      meetingType: input.meetingType ?? "general",
      seasonId,
      projectIds,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      location: input.location ?? "",
      description: input.description ?? "",
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
  const startAt = input.startAt ?? currentMeeting.startAt;
  const updatedMeeting = normalizeMeetingSchedule(
    {
      ...currentMeeting,
      ...input,
      seasonId,
      projectIds,
      startAt,
      endAt:
        input.endAt === undefined
          ? currentMeeting.endAt ?? null
          : input.endAt,
      location: input.location === undefined ? currentMeeting.location ?? "" : input.location,
      description:
        input.description === undefined ? currentMeeting.description ?? "" : input.description,
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
    subsystemId: task?.subsystemIds[0] ?? null,
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
  if (!previousWorkLog) {
    return null;
  }

  const updatedWorkLog: WorkLog = {
    ...previousWorkLog,
    ...input,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    workLogs: currentSnapshot.workLogs.map((workLog) =>
      workLog.id === workLogId ? updatedWorkLog : workLog,
    ),
  });

  const task = currentSnapshot.tasks.find((candidate) => candidate.id === updatedWorkLog.taskId);
  recordAuditAction({
    operation: "update",
    entityType: "worklog",
    entityId: updatedWorkLog.id,
    entityLabel: task ? task.title : updatedWorkLog.taskId,
    projectId: task?.projectId ?? null,
    taskId: updatedWorkLog.taskId,
    subsystemId: task?.subsystemIds[0] ?? null,
    memberIds: updatedWorkLog.participantIds,
    actorMemberId: auditContext.actorMemberId ?? updatedWorkLog.createdById,
    requestId: auditContext.requestId ?? null,
    changedFields: collectChangedFields(
      previousWorkLog,
      updatedWorkLog,
    ),
  });

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
    subsystemId: task?.subsystemIds[0] ?? null,
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
): ReadonlyData<Task> | null {
  const currentTask = currentSnapshot.tasks.find((task) => task.id === taskId);
  if (!currentTask) {
    return null;
  }

  let updatedTask = normalizeTaskTargets({
    ...currentTask,
    ...input,
  });

  if (updatedTask.subsystemIds[0] !== currentTask.subsystemIds[0]) {
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
    subsystemId: savedTask.subsystemIds[0] ?? "",
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
    qaReports: currentSnapshot.qaReports.filter((report) => !report.targetRefs.some((ref) => ref.kind === "task" && ref.id === taskId)),
    qaRequests: getQaRequests().map((request) => ({ ...request, targetRefs: request.targetRefs.map((ref) => ({ ...ref })) })).filter(
      (request) => !request.targetRefs.some((ref) => ref.kind === "task" && ref.id === taskId),
    ),
    taskDependencies: currentSnapshot.taskDependencies.filter(
      (dependency) => dependency.taskId !== taskId && dependency.refId !== taskId,
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
    subsystemId: task.subsystemIds[0] ?? "",
    taskId: task.id,
    memberIds: [task.ownerId, ...task.assigneeIds, task.mentorId],
    actorMemberId: task.ownerId,
  });

  return task;
}

function recordProductionItemAudit(
  entityType: "purchase-item",
  operation: "create" | "update" | "delete",
  item: { id: string; title: string; taskId?: string; subsystemId?: string; requestedById?: string | null },
  auditContext: AuditMutationContext,
  changedFields?: string[],
) {
  const task = item.taskId ? currentSnapshot.tasks.find((candidate) => candidate.id === item.taskId) : null;
  const subsystem = item.subsystemId ? currentSnapshot.subsystems.find((candidate) => candidate.id === item.subsystemId) : null;
  recordAuditAction({
    operation,
    entityType,
    entityId: item.id,
    entityLabel: item.title,
    projectId: task?.projectId ?? subsystem?.projectId ?? null,
    subsystemId: item.subsystemId ?? task?.subsystemIds[0] ?? "",
    actorMemberId: auditContext.actorMemberId ?? item.requestedById,
    requestId: auditContext.requestId ?? null,
    memberIds: [item.requestedById],
    ...(changedFields === undefined ? {} : { changedFields }),
  });
}

export function createPurchaseItem(
  input: PurchaseItemInput,
  auditContext: AuditMutationContext = {},
) {
  const itemIds = new Set(currentSnapshot.purchaseItems.map((item) => item.id));
  const item: PurchaseItem = {
    id: uniqueId(toSlug(input.title) || "purchase-item", itemIds),
    ...input,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    purchaseItems: [...currentSnapshot.purchaseItems, item],
  });

  recordProductionItemAudit("purchase-item", "create", item, auditContext);

  return item;
}

export function updatePurchaseItem(
  itemId: string,
  input: Partial<PurchaseItemInput>,
  auditContext: AuditMutationContext = {},
) {
  const previousItem = currentSnapshot.purchaseItems.find((item) => item.id === itemId);
  if (!previousItem) {
    return null;
  }

  const updatedItem: PurchaseItem = {
    ...previousItem,
    ...input,
  };

  replaceCurrentSnapshot({
    ...currentSnapshot,
    purchaseItems: currentSnapshot.purchaseItems.map((item) =>
      item.id === itemId ? updatedItem : item,
    ),
  });

  recordProductionItemAudit(
    "purchase-item",
    "update",
    updatedItem,
    auditContext,
    collectChangedFields(previousItem, updatedItem),
  );

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
  });

  recordProductionItemAudit("purchase-item", "delete", item, auditContext);

  return item;
}

export function createMember(input: MemberInput) {
  const memberIds = new Set(currentSnapshot.members.map((member) => member.id));
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId = input.seasonId ?? fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(input.activeSeasonIds ?? []), seasonId]);
  const member: Member = {
    id: uniqueId(toSlug(input.name) || "member", memberIds),
    name: input.name,
    email: (input.email ?? "").trim(),
    photoUrl: (input.photoUrl ?? "").trim(),
    role: input.role,
    elevated: isElevatedMemberRole(input.role),
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
  if (!previousMember) {
    return null;
  }

  const nextRole = input.role ?? previousMember.role;
  const nextEmail = input.email === undefined ? previousMember.email : input.email.trim();
  const nextPhotoUrl =
    input.photoUrl === undefined ? previousMember.photoUrl : input.photoUrl.trim();
  const nextSeasonId = input.seasonId ?? previousMember.seasonId;
  const nextActiveSeasonIds = uniqueIds([
    ...(input.activeSeasonIds ?? previousMember.activeSeasonIds ?? [previousMember.seasonId]),
    nextSeasonId,
  ]);
  const nextPlannedWeeklyAttendanceHours =
    input.plannedWeeklyAttendanceHours === undefined
      ? normalizePlannedWeeklyAttendanceHours(previousMember.plannedWeeklyAttendanceHours)
      : normalizePlannedWeeklyAttendanceHours(input.plannedWeeklyAttendanceHours);
  const nextPlannedAttendanceDays =
    input.plannedAttendanceDays === undefined
      ? normalizePlannedAttendanceDays(previousMember.plannedAttendanceDays)
      : normalizePlannedAttendanceDays(input.plannedAttendanceDays);
  const nextPlannedAttendanceNotes =
    input.plannedAttendanceNotes === undefined
      ? previousMember.plannedAttendanceNotes ?? ""
      : input.plannedAttendanceNotes.trim();
  const updatedMember: Member = {
    ...previousMember,
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

  replaceCurrentSnapshot({
    ...currentSnapshot,
    members: currentSnapshot.members.map((member) =>
      member.id === memberId ? updatedMember : member,
    ),
  });

  recordAuditAction({
    operation: "update",
    entityType: "member",
    entityId: updatedMember.id,
    entityLabel: updatedMember.name,
    actorMemberId: auditContext.actorMemberId ?? updatedMember.id,
    requestId: auditContext.requestId ?? null,
    memberIds: [updatedMember.id],
    detailsJson: getSeasonAuditDetails(previousMember, updatedMember),
    changedFields: collectChangedFields(
      previousMember,
      updatedMember,
    ),
  });

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
    responsibleGroups: currentSnapshot.responsibleGroups.map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((id) => id !== memberId),
      primaryMemberIds: group.primaryMemberIds.filter((id) => id !== memberId),
    })),
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
    purchaseItems: currentSnapshot.purchaseItems.map((item) => ({
      ...item,
      approvedById: item.approvedById === memberId ? null : item.approvedById,
    })),
    qaReports: currentSnapshot.qaReports.map((report) => ({
      ...report,
      createdByMemberId: report.createdByMemberId === memberId ? null : report.createdByMemberId,
      participantIds: report.participantIds.filter((participantId) => participantId !== memberId),
      mentorId: report.mentorId === memberId ? null : report.mentorId,
      requestedById: report.requestedById === memberId ? null : report.requestedById,
      ...(report.reportType === "qa" ? { reviewedById: report.reviewedById === memberId ? null : report.reviewedById } : {}),
    })),
    teamReports: currentSnapshot.teamReports.map((report) => ({
      ...report,
      createdByMemberId: report.createdByMemberId === memberId ? null : report.createdByMemberId,
      participantIds: report.participantIds.filter((participantId) => participantId !== memberId),
      mentorId: report.mentorId === memberId ? null : report.mentorId,
      requestedById: report.requestedById === memberId ? null : report.requestedById,
    })),
    qaRequests: getQaRequests()
      .filter((request) => request.mentorId !== memberId)
      .map((request) => ({
        ...request,
        targetRefs: request.targetRefs.map((ref) => ({ ...ref })),
        requestedById: request.requestedById === memberId ? null : request.requestedById,
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

export function findSubsystem(subsystemId: string): SnapshotView["subsystems"][number] | undefined {
  return currentSnapshot.subsystems.find((subsystem) => subsystem.id === subsystemId);
}

export function findMilestone(milestoneId: string): SnapshotView["milestones"][number] | undefined {
  return currentSnapshot.milestones.find((milestone) => milestone.id === milestoneId);
}

export function findMechanism(mechanismId: string): SnapshotView["mechanisms"][number] | undefined {
  return currentSnapshot.mechanisms.find((mechanism) => mechanism.id === mechanismId);
}

export function findProject(projectId: string): SnapshotView["projects"][number] | undefined {
  return currentSnapshot.projects.find((project) => project.id === projectId);
}

export function findWorkstream(workstreamId: string): SnapshotView["workstreams"][number] | undefined {
  return currentSnapshot.workstreams.find((workstream) => workstream.id === workstreamId);
}

export function findPartDefinition(partDefinitionId: string): SnapshotView["partDefinitions"][number] | undefined {
  return currentSnapshot.partDefinitions.find((partDefinition) => partDefinition.id === partDefinitionId);
}

export function findPartInstance(partInstanceId: string): SnapshotView["partInstances"][number] | undefined {
  return currentSnapshot.partInstances.find((partInstance) => partInstance.id === partInstanceId);
}

export function findMaterial(materialId: string): SnapshotView["materials"][number] | undefined {
  return currentSnapshot.materials.find((material) => material.id === materialId);
}

export function findArtifact(artifactId: string): SnapshotView["artifacts"][number] | undefined {
  return currentSnapshot.artifacts.find((artifact) => artifact.id === artifactId);
}

export function findRisk(riskId: string): SnapshotView["risks"][number] | undefined {
  return currentSnapshot.risks.find((risk) => risk.id === riskId);
}
