import { normalizeTaskTargetIds, type TaskTargets } from "../../domain/taskTargets";
import type { ReadonlyData } from "../../domain/types";
import {
  findSubsystem,
  getProjects,
  getSnapshot,
} from "../../data/store";

export function getDefaultProjectId() {
  return getProjects()[0]?.id ?? null;
}

export function resolveProjectId(input: {
  projectId?: string | null;
  subsystemId?: string | null;
}) {
  if (input.projectId) {
    return input.projectId;
  }

  if (input.subsystemId) {
    const subsystem = findSubsystem(input.subsystemId);
    if (subsystem) {
      return subsystem.projectId;
    }
  }

  return getDefaultProjectId();
}

export function normalizeTaskTargets(
  input: Partial<ReadonlyData<TaskTargets>>,
  fallback?: ReadonlyData<TaskTargets>,
) {
  return normalizeTaskTargetIds(getSnapshot(), input, fallback);
}
