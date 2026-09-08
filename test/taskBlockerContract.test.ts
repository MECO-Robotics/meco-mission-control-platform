import assert from "node:assert/strict";
import { test } from "node:test";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { getTasks } from "../src/data/store";

test("task blocker issue categories round-trip separately from validated source links", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const tasks = getTasks();
    assert.ok(tasks.length >= 2);
    const payload = {
      blockedTaskId: tasks[0].id,
      blockerType: "task",
      blockerId: tasks[1].id,
      issueType: "broken-part",
      description: "Replace damaged part before assembly",
      severity: "high",
    };
    const created = await app.inject({ method: "POST", url: "/api/task-blockers", payload });
    assert.equal(created.statusCode, 201, created.body);
    const blocker = created.json().item;
    assert.equal(blocker.issueType, "broken-part");
    assert.equal(blocker.blockerType, "task");
    assert.equal(blocker.blockerId, tasks[1].id);
    resetLimits();
    const edited = await app.inject({ method: "PATCH", url: `/api/task-blockers/${blocker.id}`, payload: { issueType: "shipping-delay" } });
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(edited.json().item.blockerId, tasks[1].id);
    resetLimits();
    const read = await app.inject({ method: "GET", url: "/api/task-blockers?seasonId=default-season" });
    assert.equal(read.statusCode, 200, read.body);
    assert.equal(read.json().items.find((item: { id: string }) => item.id === blocker.id)?.issueType, "shipping-delay");
    for (const invalid of [
      { ...payload, blockerId: "missing-task" },
      { ...payload, blockerType: "external" },
      { ...payload, issueType: "unrecognized-category" },
      { ...payload, blockerType: "broken-part" },
    ]) {
      resetLimits();
      const response = await app.inject({ method: "POST", url: "/api/task-blockers", payload: invalid });
      assert.equal(response.statusCode, 400, response.body);
    }
  });
});
