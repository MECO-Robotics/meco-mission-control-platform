import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkflowAuthHeaders, withWorkflowAuthApp } from "../helpers/workflowAuth";

test("manufacturing has no separate read endpoint or review queue", async () => {
  await withWorkflowAuthApp(async ({ app, resetLimits }) => {
    const studentHeaders = await createWorkflowAuthHeaders("student");
    const response = await app.inject({ method: "GET", url: "/api/manufacturing", headers: studentHeaders });
    assert.equal(response.statusCode, 404);
    resetLimits();
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap", headers: studentHeaders });
    assert.equal(bootstrap.statusCode, 200);
    assert.ok(Array.isArray(bootstrap.json().tasks));
  }, { env: { API_RATE_LIMIT_MAX_REQUESTS: "100" } });
});
