import assert from "node:assert/strict";
import { test } from "node:test";

import { snapshot } from "../src/data/mockData";

test("2026 seed preserves sourced activity and derives stock from receipt transactions", () => {
  const season = snapshot.seasons.find((item) => item.id === "season-2026-meco");
  assert.ok(season);
  assert.equal(season.startDate, "2026-01-08");
  assert.equal(season.endDate, "2026-12-19");
  assert.match(season.description ?? "", /documented activity only/);
  assert.equal(snapshot.tasks.length, 733);
  assert.equal(snapshot.meetings.length, 133);
  assert.ok(snapshot.meetings.some((meeting) => meeting.date === null && meeting.dateLabel === "Tue, 11/0"));
  assert.ok(snapshot.members.every((member) => member.role === "unknown" && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(member.name)));
  assert.equal(new Set(snapshot.members.map((member) => member.name)).size, snapshot.members.length);
  assert.ok(snapshot.tasks.some((task) => task.assigneeIds.length > 0));
  assert.ok(snapshot.tasks.every((task) => task.assigneeIds.every((id) => snapshot.members.some((member) => member.id === id))));
  assert.ok(snapshot.tasks.every((task) => snapshot.projects.some((project) => project.id === task.projectId)));

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
