import type { MilestoneStatus, PlatformSnapshot, Task, TaskDependency } from "./types";

const MILESTONE_STATUS_ORDER: Record<MilestoneStatus, number> = {
  "not ready": 0,
  blocked: 1,
  qa: 2,
  ready: 3,
};

const PART_INSTANCE_STATUS_ORDER: Record<MilestoneStatus, number> = {
  "not ready": 0,
  blocked: 1,
  qa: 2,
  ready: 3,
};

function getTaskById(snapshot: PlatformSnapshot, taskId: string) {
  return snapshot.tasks.find((task) => task.id === taskId) ?? null;
}

function getMilestoneById(snapshot: PlatformSnapshot, milestoneId: string) {
  return snapshot.milestones.find((milestone) => milestone.id === milestoneId) ?? null;
}

function getPartInstanceById(snapshot: PlatformSnapshot, partInstanceId: string) {
  return snapshot.partInstances.find((partInstance) => partInstance.id === partInstanceId) ?? null;
}

function isMilestoneDependencySatisfied(
  snapshot: PlatformSnapshot,
  milestoneId: string,
  requiredState: string | undefined,
) {
  const milestone = getMilestoneById(snapshot, milestoneId);
  if (!milestone) {
    return false;
  }

  const requiredOrder = MILESTONE_STATUS_ORDER[requiredState as MilestoneStatus];
  const targetOrder = MILESTONE_STATUS_ORDER[milestone.status ?? "not ready"];

  return targetOrder >= requiredOrder;
}

function isPartInstanceDependencySatisfied(
  snapshot: PlatformSnapshot,
  partInstanceId: string,
  requiredState: string | undefined,
) {
  const partInstance = getPartInstanceById(snapshot, partInstanceId);
  if (!partInstance) {
    return false;
  }

  const requiredOrder = PART_INSTANCE_STATUS_ORDER[requiredState as MilestoneStatus];
  const targetOrder = PART_INSTANCE_STATUS_ORDER[partInstance.status];

  return targetOrder >= requiredOrder;
}

function isTaskDependencySatisfied(dependency: TaskDependency, snapshot: PlatformSnapshot, now: Date) {
  if (dependency.dependencyType === "soft") {
    return true;
  }

  if (dependency.kind === "task") {
    return getTaskById(snapshot, dependency.refId)?.status === dependency.requiredState;
  }

  if (dependency.kind === "part_instance") {
    return isPartInstanceDependencySatisfied(snapshot, dependency.refId, dependency.requiredState);
  }

  if (dependency.kind === "milestone") {
    return isMilestoneDependencySatisfied(snapshot, dependency.refId, dependency.requiredState);
  }

  return false;
}

export function getTaskWaitingOnDependencyRecords(
  taskId: string,
  snapshot: PlatformSnapshot,
  now: Date = new Date(),
) {
  return snapshot.taskDependencies.filter(
    (dependency) =>
      dependency.taskId === taskId &&
      dependency.dependencyType !== "soft" &&
      !isTaskDependencySatisfied(dependency, snapshot, now),
  );
}

export function isTaskWaitingOnDependencies(
  task: Pick<Task, "id" | "status">,
  snapshot: PlatformSnapshot,
  now: Date = new Date(),
) {
  return (
    task.status !== "complete" && getTaskWaitingOnDependencyRecords(task.id, snapshot, now).length > 0
  );
}
