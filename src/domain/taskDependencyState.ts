import type { ReadonlyData, ReadinessStatus, SnapshotView, Task, TaskDependency } from "./types";
import { deriveMilestoneReadiness, derivePartInstanceReadiness } from "./readiness";

const WORKFLOW_STATUS_ORDER: Record<ReadinessStatus, number> = {
  "not-ready": 0,
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
  requiredState: ReadinessStatus | undefined,
) {
  const milestone = getMilestoneById(snapshot, milestoneId);
  if (!milestone) {
    return false;
  }

  const requiredOrder = WORKFLOW_STATUS_ORDER[requiredState ?? "not-ready"];
  const targetOrder = WORKFLOW_STATUS_ORDER[deriveMilestoneReadiness(milestone, snapshot)];

  return targetOrder >= requiredOrder;
}

function isPartInstanceDependencySatisfied(snapshot: SnapshotView, partInstanceId: string, condition: Extract<TaskDependency, { kind: "part-instance" }>['requiredCondition']) {
  const partInstance = getPartInstanceById(snapshot, partInstanceId);
  if (!partInstance) {
    return false;
  }
  if (condition.kind === "physical-location") return partInstance.location.kind === condition.value;
  const requiredOrder = WORKFLOW_STATUS_ORDER[condition.value];
  const targetOrder = WORKFLOW_STATUS_ORDER[derivePartInstanceReadiness(partInstance, snapshot)];
  return targetOrder >= requiredOrder;
}

function isTaskDependencySatisfied(dependency: TaskDependency, snapshot: SnapshotView) {
  if (dependency.dependencyType === "soft") {
    return true;
  }

  if (dependency.kind === "task") {
    return getTaskById(snapshot, dependency.refId)?.status === dependency.requiredState;
  }

  if (dependency.kind === "part-instance") {
    return isPartInstanceDependencySatisfied(snapshot, dependency.refId, dependency.requiredCondition);
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
      dependency.taskId === taskId &&
      dependency.dependencyType !== "soft" &&
      !isTaskDependencySatisfied(dependency, snapshot),
  );
}

export function isTaskWaitingOnDependencies(
  task: Pick<ReadonlyData<Task>, "id" | "status">,
  snapshot: SnapshotView,
) {
  return (
    task.status !== "complete" && getTaskWaitingOnDependencyRecords(task.id, snapshot).length > 0
  );
}
