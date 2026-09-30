import assert from "node:assert/strict";
import { test } from "node:test";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("unresolved risks are the canonical source of task blocking", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200);
    const task = bootstrap.json().tasks[0];
    const created = await app.inject({ method: "POST", url: "/api/risks", payload: {
      projectId: task.projectId, title: "Broken part before assembly", detail: "Replace damaged part before assembly.",
      category: "manufacturing", severity: "high", status: "open", blocksWork: true,
      source: { kind: "manual" }, relatedTargets: [{ kind: "task", id: task.id }],
      mitigationTaskId: null, ownerGroupId: null,
    }});
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().item.relatedTargets[0].kind, "task");
    resetLimits();
    const taskResponse = await app.inject({ method: "GET", url: "/api/tasks" });
    assert.equal(taskResponse.statusCode, 200);
    assert.equal(taskResponse.json().items.find((item: { id: string }) => item.id === task.id).isBlocked, true);
    resetLimits();
    assert.equal((await app.inject({ method: "GET", url: "/api/task-blockers" })).statusCode, 404);
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});
