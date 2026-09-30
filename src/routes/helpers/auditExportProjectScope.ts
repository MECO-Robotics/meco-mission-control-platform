import type { ReadonlyData, AuditAction, SnapshotView } from "../../domain/types";
import { partInstanceSubsystemId } from "../../domain/partInstanceLocation";

function getActionProjectIds(action: ReadonlyData<AuditAction>) {
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

export function getRelatedProjectIds(
  action: ReadonlyData<AuditAction>,
  snapshot: SnapshotView,
) {
  const projectIds = getActionProjectIds(action);
  const subsystemsById = new Map(
    snapshot.subsystems.map((subsystem) => [subsystem.id, subsystem] as const),
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
    addIfPresent(projectIds, risk?.projectId);
  }
  addIfPresent(
    projectIds,
    action.subsystemId ? subsystemsById.get(action.subsystemId)?.projectId : null,
  );
  addIfPresent(projectIds, action.taskId ? tasksById.get(action.taskId)?.projectId : null);

  return projectIds;
}

export function actionMatchesProject(
  action: ReadonlyData<AuditAction>,
  projectId: string,
  snapshot: SnapshotView,
) {
  return getRelatedProjectIds(action, snapshot).has(projectId);
}
