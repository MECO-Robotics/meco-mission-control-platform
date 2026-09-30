import assert from "node:assert/strict";
import { test } from "node:test";

import type { ManufacturingItem, Task } from "../src/domain/types";
import { toWorkItems } from "../src/routes/helpers/bootstrapSelection";
import { getSnapshot } from "../src/data/store";
import { isWorkItemWaitingOnDependencies } from "../src/domain/taskDependencyState";
import { taskDependencySchema } from "../src/routes/routeSchemas";

const task = (overrides: Partial<Task>): Task => ({
  id: "task-1", title: "Make sensor bracket", workstreamIds: [], subsystemIds: ["drive"], partInstanceIds: [],
  linkedManufacturingIds: ["bracket-cnc"], workType: "Manufacturing", responsibleGroup: "Mechanical",
  dueDate: "2026-10-01", status: "in-progress", ...overrides,
} as Task);

const item = (overrides: Partial<ManufacturingItem> = {}): ManufacturingItem => ({
  id: "bracket-cnc", title: "Make sensor bracket", subsystemId: "drive", requestedById: null,
  process: "cnc", dueDate: "2026-10-01", material: "Aluminum", materialId: "aluminum",
  partDefinitionId: "bracket", partInstanceId: null, partInstanceIds: [], quantity: 4,
  status: "approved", mentorReviewed: true, inHouse: true, batchLabel: "Run 2", ...overrides,
});

test("WorkItem projects preserve manufacturing detail and collapse a duplicate task", () => {
  const work = toWorkItems([task({})], [item()]);
  assert.equal(work.length, 1);
  assert.deepEqual(work[0], {
    id: "manufacturing:bracket-cnc", sourceType: "manufacturing", sourceId: "bracket-cnc", taskId: "task-1",
    title: "Make sensor bracket", workType: "Manufacturing", responsibleGroup: "Mechanical",
    manufacturingProcess: "cnc", subsystemId: "drive", dueDate: "2026-10-01", status: "approved", isWaitingOnDependency: false,
    quantity: 4, material: "Aluminum", materialId: "aluminum", partDefinitionId: "bracket",
    partInstanceIds: [], batchLabel: "Run 2", mentorReviewed: true,
  });
});

test("WorkItem keeps a task when its manufacturing link represents different work", () => {
  const work = toWorkItems([task({ title: "Design sensor bracket", workType: "Design" })], [item()]);
  assert.deepEqual(work.map(({ sourceType }) => sourceType), ["task", "manufacturing"]);
});

test("Manufacturing work type plus explicit manufacturing link collapses the paired task", () => {
  const work = toWorkItems([task({ title: "Produce bracket", workType: "Manufacturing" })], [item()]);
  assert.equal(work.length, 1);
  assert.equal(work[0].sourceType, "manufacturing");
  assert.equal(work[0].taskId, "task-1");
});

test("WorkItem only collapses a uniquely linked task with the same title", () => {
  const sameTitle = task({ id: "task-2" });
  const work = toWorkItems([task({}), sameTitle], [item()]);
  assert.equal(work.length, 3);
  assert.equal(work.filter((entry) => entry.sourceType === "task").length, 2);
  assert.equal(work.find((entry) => entry.sourceType === "manufacturing")?.taskId, null);
});

test("dependency contract and readiness cover both Task and ManufacturingItem", () => {
  const snapshot = getSnapshot();
  const task = snapshot.tasks.find((item) => item.status !== "complete")!;
  const manufacturingItem = snapshot.manufacturingItems.find((item) => item.status !== "complete")!;
  const taskEdge = {
    id: "task-to-manufacturing", workItemId: task.id, sourceType: "task" as const,
    kind: "work_item" as const, refType: "manufacturing" as const, refId: manufacturingItem.id,
    requiredState: "complete", dependencyType: "hard" as const, createdAt: "2026-09-30",
  };
  const manufacturingEdge = {
    id: "manufacturing-to-task", workItemId: manufacturingItem.id, sourceType: "manufacturing" as const,
    kind: "work_item" as const, refType: "task" as const, refId: task.id,
    requiredState: "complete", dependencyType: "hard" as const, createdAt: "2026-09-30",
  };
  const { workItemId, sourceType, kind, refType, refId, requiredState, dependencyType } = taskEdge;
  const taskCommand = { workItemId, sourceType, kind, refType, refId, requiredState, dependencyType };
  const manufacturingCommand = {
    workItemId: manufacturingEdge.workItemId, sourceType: manufacturingEdge.sourceType,
    kind: manufacturingEdge.kind, refType: manufacturingEdge.refType, refId: manufacturingEdge.refId,
    requiredState: manufacturingEdge.requiredState, dependencyType: manufacturingEdge.dependencyType,
  };
  assert.equal(taskDependencySchema.safeParse(taskCommand).success, true);
  assert.equal(taskDependencySchema.safeParse(manufacturingCommand).success, true);
  const withTaskEdge = { ...snapshot, taskDependencies: [taskEdge] };
  assert.equal(isWorkItemWaitingOnDependencies(task.id, "task", withTaskEdge), true);
  const completedManufacturing = {
    ...snapshot,
    manufacturingItems: snapshot.manufacturingItems.map((item) => item.id === manufacturingItem.id ? { ...item, status: "complete" as const } : item),
    taskDependencies: [taskEdge],
  };
  assert.equal(isWorkItemWaitingOnDependencies(task.id, "task", completedManufacturing), false);
  assert.equal(isWorkItemWaitingOnDependencies(manufacturingItem.id, "manufacturing", { ...snapshot, taskDependencies: [manufacturingEdge] }), true);
});
