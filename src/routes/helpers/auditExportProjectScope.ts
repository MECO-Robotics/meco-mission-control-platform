import type { AuditAction, PlatformSnapshot } from "../../domain/types";

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

export function getRelatedProjectIds(
  action: AuditAction,
  snapshot: PlatformSnapshot,
) {
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

export function actionMatchesProject(
  action: AuditAction,
  projectId: string,
  snapshot: PlatformSnapshot,
) {
  return getRelatedProjectIds(action, snapshot).has(projectId);
}
