import type { AuditAction, PlatformSnapshot } from "../../domain/types";

export interface AuditExportFilters {
  seasonId?: string;
  projectId?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

const CSV_COLUMNS = [
  "id",
  "timestamp",
  "operation",
  "entityType",
  "entityId",
  "entityLabel",
  "message",
  "changedFields",
  "projectId",
  "projectIds",
  "taskId",
  "subsystemId",
  "actorMemberId",
  "memberIds",
  "requestId",
] as const;

function getActionProjectIds(action: AuditAction) {
  return new Set(
    [...(action.projectIds ?? []), action.projectId].filter(
      (value): value is string => Boolean(value),
    ),
  );
}

function addIfPresent(values: Set<string>, value: string | null | undefined) {
  if (value) {
    values.add(value);
  }
}

function getRelatedProjectIds(action: AuditAction, snapshot: PlatformSnapshot) {
  const projectIds = getActionProjectIds(action);
  const subsystemsById = new Map(
    snapshot.subsystems.map((subsystem) => [subsystem.id, subsystem] as const),
  );
  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task] as const));

  if (action.entityType === "project") {
    addIfPresent(projectIds, action.entityId);
  }
  if (action.entityType === "subsystem") {
    addIfPresent(projectIds, subsystemsById.get(action.entityId)?.projectId);
  }
  if (action.entityType === "task") {
    addIfPresent(projectIds, tasksById.get(action.entityId)?.projectId);
  }
  addIfPresent(
    projectIds,
    action.subsystemId ? subsystemsById.get(action.subsystemId)?.projectId : null,
  );
  addIfPresent(projectIds, action.taskId ? tasksById.get(action.taskId)?.projectId : null);

  return projectIds;
}

function actionMatchesProject(
  action: AuditAction,
  projectId: string,
  snapshot: PlatformSnapshot,
) {
  return getRelatedProjectIds(action, snapshot).has(projectId);
}

function actionMatchesSeason(
  action: AuditAction,
  seasonId: string,
  snapshot: PlatformSnapshot,
) {
  if (action.entityType === "season" && action.entityId === seasonId) {
    return true;
  }

  const projectsById = new Map(
    snapshot.projects.map((project) => [project.id, project] as const),
  );
  for (const projectId of getRelatedProjectIds(action, snapshot)) {
    if (projectsById.get(projectId)?.seasonId === seasonId) {
      return true;
    }
  }

  const entitySeasonByType = new Map<string, Map<string, string | undefined>>([
    ["meeting", new Map(snapshot.meetings.map((meeting) => [meeting.id, meeting.seasonId]))],
    ["milestone", new Map(snapshot.milestones.map((milestone) => [milestone.id, milestone.seasonId]))],
    ["part-definition", new Map(snapshot.partDefinitions.map((part) => [part.id, part.seasonId]))],
    ["member", new Map(snapshot.members.map((member) => [member.id, member.seasonId]))],
  ]);

  if (entitySeasonByType.get(action.entityType)?.get(action.entityId) === seasonId) {
    return true;
  }

  const memberSeasons = entitySeasonByType.get("member");
  return [...(action.memberIds ?? []), action.actorMemberId].some(
    (memberId) => memberId && memberSeasons?.get(memberId) === seasonId,
  );
}

export function filterAuditActions(
  snapshot: PlatformSnapshot,
  filters: AuditExportFilters,
) {
  return [...(snapshot.actions ?? [])]
    .filter((action) => {
      if (filters.entityType && action.entityType !== filters.entityType) {
        return false;
      }
      if (filters.projectId && !actionMatchesProject(action, filters.projectId, snapshot)) {
        return false;
      }
      if (filters.seasonId && !actionMatchesSeason(action, filters.seasonId, snapshot)) {
        return false;
      }
      const actionTime = Date.parse(action.timestamp);
      if (filters.from && actionTime < Date.parse(filters.from)) {
        return false;
      }
      if (filters.to && actionTime > Date.parse(filters.to)) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        right.timestamp.localeCompare(left.timestamp) ||
        right.id.localeCompare(left.id),
    );
}

function csvValue(value: unknown) {
  if (Array.isArray(value)) {
    return csvValue(value.join(";"));
  }
  if (value === null || value === undefined) {
    return "";
  }

  const rawText = String(value);
  const text = /^[=+\-@\t\r\n]/.test(rawText) ? `'${rawText}` : rawText;
  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function actionCsvRow(action: AuditAction) {
  const values: Record<(typeof CSV_COLUMNS)[number], unknown> = {
    id: action.id,
    timestamp: action.timestamp,
    operation: action.operation,
    entityType: action.entityType,
    entityId: action.entityId,
    entityLabel: action.entityLabel,
    message: action.message,
    changedFields: action.changedFields,
    projectId: action.projectId,
    projectIds: action.projectIds ?? [],
    taskId: action.taskId,
    subsystemId: action.subsystemId,
    actorMemberId: action.actorMemberId,
    memberIds: action.memberIds,
    requestId: action.requestId,
  };

  return CSV_COLUMNS.map((column) => csvValue(values[column])).join(",");
}

export function formatAuditActionsCsv(actions: AuditAction[]) {
  return [CSV_COLUMNS.join(","), ...actions.map(actionCsvRow)].join("\r\n");
}
