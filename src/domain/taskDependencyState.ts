import type { ReadonlyData, MilestoneStatus, SnapshotView, Task, TaskDependency, WorkItemSourceType } from "./types";

const WORKFLOW_STATUS_ORDER: Record<MilestoneStatus, number> = {
  "not ready": 0,
  blocked: 1,
  qa: 2,
  ready: 3,
};

function getTaskById(snapshot: SnapshotView, taskId: string) {
  return snapshot.tasks.find((task) => task.id === taskId) ?? null;
}

function getMilestoneById(snapshot: SnapshotView, milestoneId: string) {
  return snapshot.milestones.find((milestone) => milestone.id === milestoneId) ?? null;
}

function getPartInstanceById(snapshot: SnapshotView, partInstanceId: string) {
  return snapshot.partInstances.find((partInstance) => partInstance.id === partInstanceId) ?? null;
}

function isMilestoneDependencySatisfied(
  snapshot: SnapshotView,
  milestoneId: string,
  requiredState: string | undefined,
) {
  const milestone = getMilestoneById(snapshot, milestoneId);
  if (!milestone) {
    return false;
  }

  const requiredOrder = WORKFLOW_STATUS_ORDER[requiredState as MilestoneStatus];
  const targetOrder = WORKFLOW_STATUS_ORDER[milestone.status ?? "not ready"];

  return targetOrder >= requiredOrder;
}

function isPartInstanceDependencySatisfied(
  snapshot: SnapshotView,
  partInstanceId: string,
  requiredState: string | undefined,
) {
  const partInstance = getPartInstanceById(snapshot, partInstanceId);
  if (!partInstance) {
    return false;
  }

  const requiredOrder = WORKFLOW_STATUS_ORDER[requiredState as MilestoneStatus];
  const targetOrder = WORKFLOW_STATUS_ORDER[partInstance.status];

  return targetOrder >= requiredOrder;
}

function isTaskDependencySatisfied(dependency: TaskDependency, snapshot: SnapshotView) {
  if (dependency.dependencyType === "soft") {
    return true;
  }

  if (dependency.kind === "work_item") {
    if (dependency.refType === "manufacturing") {
      const item = snapshot.manufacturingItems.find((candidate) => candidate.id === dependency.refId);
      const stateByManufacturingStatus = { requested: "not-started", approved: "not-started", "in-progress": "in-progress", qa: "waiting-for-qa", complete: "complete" } as const;
      return item ? stateByManufacturingStatus[item.status] === dependency.requiredState : false;
    }
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
  snapshot: SnapshotView,
) {
  return snapshot.taskDependencies.filter(
    (dependency) =>
      dependency.workItemId === taskId && dependency.sourceType === "task" &&
      dependency.dependencyType !== "soft" &&
      !isTaskDependencySatisfied(dependency, snapshot),
  );
}

export function getWorkItemWaitingOnDependencyRecords(workItemId: string, sourceType: WorkItemSourceType, snapshot: SnapshotView) {
  return snapshot.taskDependencies.filter((dependency) =>
    dependency.workItemId === workItemId && dependency.sourceType === sourceType &&
    dependency.dependencyType !== "soft" && !isTaskDependencySatisfied(dependency, snapshot));
}

export function isWorkItemWaitingOnDependencies(workItemId: string, sourceType: WorkItemSourceType, snapshot: SnapshotView) {
  const status = sourceType === "task"
    ? getTaskById(snapshot, workItemId)?.status
    : snapshot.manufacturingItems.find((item) => item.id === workItemId)?.status;
  return status !== "complete" && getWorkItemWaitingOnDependencyRecords(workItemId, sourceType, snapshot).length > 0;
}

export function isTaskWaitingOnDependencies(
  task: Pick<ReadonlyData<Task>, "id" | "status">,
  snapshot: SnapshotView,
) {
  return (
    task.status !== "complete" && getTaskWaitingOnDependencyRecords(task.id, snapshot).length > 0
  );
}
