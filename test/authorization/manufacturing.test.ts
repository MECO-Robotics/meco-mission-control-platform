import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkflowAuthHeaders, withWorkflowAuthApp } from "../helpers/workflowAuth";

test("manufacturing detail updates use Task authorization and no separate review queue", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const studentHeaders = await createWorkflowAuthHeaders("student");
    const response = await app.inject({ method: "GET", url: "/api/manufacturing", headers: studentHeaders });
    assert.equal(response.statusCode, 404);
    resetLimits();
    const tasks = await app.inject({ method: "GET", url: "/api/bootstrap", headers: studentHeaders });
    assert.equal(tasks.statusCode, 200);
    const manufacturingTask = tasks.json().tasks.find((task: { manufacturingDetails: unknown }) => task.manufacturingDetails);
    assert.ok(manufacturingTask);
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});
