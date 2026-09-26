import type { TaskTargets } from "../../domain/taskTargets";
import type { ReadonlyData } from "../../domain/types";
import {
  findMechanism,
  findPartInstance,
  findSubsystem,
  getProjects,
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

export function uniqueIds(values: ReadonlyArray<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

export function normalizeTaskTargets(
  input: Partial<ReadonlyData<TaskTargets>>,
  fallback?: ReadonlyData<TaskTargets>,
) {
  const partInstanceIds = uniqueIds(input.partInstanceIds ?? fallback?.partInstanceIds ?? []);
  const partInstances = partInstanceIds.flatMap((id) => findPartInstance(id) ?? []);
  const mechanismIds = uniqueIds([
    ...(input.mechanismIds ?? fallback?.mechanismIds ?? []),
    ...partInstances.map((part) => part.mechanismId),
  ]);
  const mechanisms = mechanismIds.flatMap((id) => findMechanism(id) ?? []);
  return {
    workstreamIds: uniqueIds(input.workstreamIds ?? fallback?.workstreamIds ?? []),
    subsystemIds: uniqueIds([
      ...(input.subsystemIds ?? fallback?.subsystemIds ?? []),
      ...mechanisms.map((mechanism) => mechanism.subsystemId),
      ...partInstances.map((part) => part.subsystemId),
    ]),
    mechanismIds,
    partInstanceIds,
    artifactIds: uniqueIds(input.artifactIds ?? fallback?.artifactIds ?? []),
  };
}
