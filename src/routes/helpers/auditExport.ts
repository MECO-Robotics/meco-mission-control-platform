import type { AuditAction, PlatformSnapshot } from "../../domain/types";
export { formatAuditActionsCsv } from "./auditExportCsv";

export interface AuditExportFilters {
  seasonId?: string;
  projectId?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

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

function readActionSeasonIds(action: AuditAction) {
  const seasonIds = new Set<string>();
  const detailSeasonId = action.detailsJson?.seasonId;
  if (typeof detailSeasonId === "string") {
    seasonIds.add(detailSeasonId);
  }

  const detailActiveSeasonIds = action.detailsJson?.activeSeasonIds;
  if (Array.isArray(detailActiveSeasonIds)) {
    for (const seasonId of detailActiveSeasonIds) {
      if (typeof seasonId === "string") {
        seasonIds.add(seasonId);
      }
    }
  }

  return seasonIds;
}

function getRelatedProjectIds(action: AuditAction, snapshot: PlatformSnapshot) {
  const projectIds = getActionProjectIds(action);
  const subsystemsById = new Map(
    snapshot.subsystems.map((subsystem) => [subsystem.id, subsystem] as const),
  );
  const workstreamsById = new Map(
    snapshot.workstreams.map((workstream) => [workstream.id, workstream] as const),
  );
  const mechanismsById = new Map(
    snapshot.mechanisms.map((mechanism) => [mechanism.id, mechanism] as const),
  );
  const partInstancesById = new Map(
    snapshot.partInstances.map((partInstance) => [partInstance.id, partInstance] as const),
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
  if (action.entityType === "risk") {
    const risk = snapshot.risks.find((candidate) => candidate.id === action.entityId);
    if (risk?.attachmentType === "project") {
      addIfPresent(projectIds, risk.attachmentId);
    }
    if (risk?.attachmentType === "workstream") {
      addIfPresent(projectIds, workstreamsById.get(risk.attachmentId)?.projectId);
    }
    if (risk?.attachmentType === "mechanism") {
      const mechanism = mechanismsById.get(risk.attachmentId);
      addIfPresent(
        projectIds,
        mechanism ? subsystemsById.get(mechanism.subsystemId)?.projectId : null,
      );
    }
    if (risk?.attachmentType === "part-instance") {
      const partInstance = partInstancesById.get(risk.attachmentId);
      addIfPresent(
        projectIds,
        partInstance ? subsystemsById.get(partInstance.subsystemId)?.projectId : null,
      );
    }
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

  const entitySeasonsByType = new Map<string, Map<string, Set<string>>>([
    [
      "meeting",
      new Map(
        snapshot.meetings.map((meeting) => [
          meeting.id,
          new Set([meeting.seasonId].filter((value): value is string => Boolean(value))),
        ]),
      ),
    ],
    [
      "milestone",
      new Map(
        snapshot.milestones.map((milestone) => [
          milestone.id,
          new Set([milestone.seasonId].filter((value): value is string => Boolean(value))),
        ]),
      ),
    ],
    [
      "part-definition",
      new Map(
        snapshot.partDefinitions.map((part) => [
          part.id,
          new Set([part.seasonId, ...(part.activeSeasonIds ?? [])]),
        ]),
      ),
    ],
    [
      "member",
      new Map(
        snapshot.members.map((member) => [
          member.id,
          new Set([member.seasonId, ...(member.activeSeasonIds ?? [])]),
        ]),
      ),
    ],
  ]);

  if (entitySeasonsByType.get(action.entityType)?.get(action.entityId)?.has(seasonId)) {
    return true;
  }
  if (readActionSeasonIds(action).has(seasonId)) {
    return true;
  }

  const memberSeasons = entitySeasonsByType.get("member");
  if (action.entityType !== "member") {
    return false;
  }

  return [action.entityId, ...(action.memberIds ?? [])].some(
    (memberId) => memberId && memberSeasons?.get(memberId)?.has(seasonId),
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
