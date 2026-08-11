import type { AuditAction, PlatformSnapshot } from "../../domain/types";
import { getRelatedProjectIds } from "./auditExportProjectScope";

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

function getEntitySeasonMaps(snapshot: PlatformSnapshot) {
  return new Map<string, Map<string, Set<string>>>([
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
}

export function actionMatchesSeason(
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

  const entitySeasonsByType = getEntitySeasonMaps(snapshot);
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
