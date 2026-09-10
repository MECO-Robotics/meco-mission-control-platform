import type { PlatformSnapshot } from "../../domain/types";
import { actionMatchesProject } from "./auditExportProjectScope";
import { actionMatchesSeason } from "./auditExportSeasonScope";
export { formatAuditActionsCsv } from "./auditExportCsv";

export interface AuditExportFilters {
  seasonId?: string;
  projectId?: string;
  entityType?: string;
  from?: string;
  to?: string;
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
