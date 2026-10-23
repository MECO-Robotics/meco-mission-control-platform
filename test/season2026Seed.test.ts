import assert from "node:assert/strict";
import { test } from "node:test";

import { snapshot } from "../src/data/mockData";

test("2026 seed preserves sourced activity and derives stock from receipt transactions", () => {
  const season = snapshot.seasons.find((item) => item.id === "season-2026-meco");
  assert.ok(season);
  assert.equal(season.startDate, "2026-01-08");
  assert.equal(season.endDate, "2026-12-19");
  assert.match(season.description ?? "", /documented activity only/);
  assert.equal(snapshot.tasks.length, 741);
  assert.ok(snapshot.tasks.every((task) => task.status !== "unrecorded" && task.status !== "not-started"));
  assert.ok(snapshot.tasks.every((task) => task.startDate && task.dueDate));
  assert.ok(snapshot.tasks.every((task) => /Progress context:|Status inference:/.test(task.summary)));
  assert.equal(snapshot.meetings.length, 133);
  assert.ok(snapshot.meetings.some((meeting) => meeting.date === null && meeting.dateLabel === "Tue, 11/0"));
  assert.ok(snapshot.members.every((member) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(member.name)));
  const sourcedRoles = new Map(snapshot.members.map(({ id, role }) => [id, role]));
  for (const id of ["member-person-13", "member-person-15", "member-person-18", "member-person-20", "member-person-21", "member-person-26", "member-person-30", "member-person-32", "member-person-33", "member-person-34"]) {
    assert.equal(sourcedRoles.get(id), "student", `${id} is listed in a student shift or as a student ambassador`);
  }
  for (const id of ["member-person-14", "member-person-25"]) assert.equal(sourcedRoles.get(id), "lead");
  for (const id of ["member-person-16", "member-person-17", "member-person-23", "member-person-24", "member-person-27", "member-person-28", "member-person-29", "member-person-39"]) {
    assert.equal(sourcedRoles.get(id), "mentor", `${id} is identified as a mentor in Slack`);
  }
  assert.equal(snapshot.members.filter((member) => member.role === "unknown").length, 8);
  assert.equal(new Set(snapshot.members.map((member) => member.name)).size, snapshot.members.length);
  assert.ok(snapshot.tasks.some((task) => task.assigneeIds.length > 0));
  assert.ok(snapshot.tasks.every((task) => task.assigneeIds.every((id) => snapshot.members.some((member) => member.id === id))));
  assert.ok(snapshot.tasks.every((task) => snapshot.projects.some((project) => project.id === task.projectId)));
  const taskIndex = new Map(snapshot.tasks.map((task, index) => [task.id, index]));
  for (const dependency of snapshot.taskDependencies) {
    assert.ok(taskIndex.get(dependency.refId)! < taskIndex.get(dependency.taskId)!);
  }
  assert.equal(snapshot.taskDependencies.length, 3);
  assert.ok(snapshot.taskDependencies.every((dependency) => dependency.dependencyType === "hard" && dependency.requiredState === "complete"));
  assert.ok(snapshot.tasks.find((task) => task.id === "task-src-4ecd2c87f9718c")?.summary.includes("after programming it"));
  const criticalPathTask = snapshot.tasks.find((task) => task.id === "task-slack-orlando-counter-roller-endcaps");
  assert.equal(criticalPathTask?.priority, "high");
  assert.match(criticalPathTask?.summary ?? "", /critical path/i);

  const quantities = new Map<string, number>();
  const unknown = new Set<string>();
  for (const transaction of snapshot.materialTransactions) {
    assert.equal(transaction.movementType, "receipt");
    assert.equal(transaction.actorMemberId, null);
    if (transaction.quantityDelta === null) unknown.add(transaction.materialId);
    else quantities.set(transaction.materialId, (quantities.get(transaction.materialId) ?? 0) + transaction.quantityDelta);
  }
  for (const material of snapshot.materials) {
    assert.equal(material.onHandQuantity, unknown.has(material.id) ? null : quantities.get(material.id) ?? 0);
  }
  assert.equal(snapshot.partInstances.length, 0, "installed STEP assembly components are not stock quantities");
  assert.ok(snapshot.mechanisms.every((mechanism) => mechanism.cadSource === "step"));
  assert.ok(snapshot.materials.some((material) => material.photoUrl));
  assert.ok(snapshot.materials.some((material) => material.onHandQuantity === null));
  assert.ok(snapshot.materials.every((material) => material.reorderPoint === null));
});
