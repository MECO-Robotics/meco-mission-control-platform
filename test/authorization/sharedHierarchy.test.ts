import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "../helpers/appIntegrationHarness";
import { createWorkflowAuthHeaders, workflowAuthEnv } from "../helpers/workflowAuth";

test("students cannot mutate shared planning or CAD hierarchy", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const studentHeaders = await createWorkflowAuthHeaders("student");
    const attempts = [
      ["POST", "/api/subsystems"],
      ["PATCH", "/api/subsystems/manipulator"],
      ["POST", "/api/mechanisms"],
      ["DELETE", "/api/mechanisms/intake-roller"],
      ["POST", "/api/part-definitions"],
      ["PATCH", "/api/part-definitions/frame-rail"],
      ["POST", "/api/part-instances"],
      ["POST", "/api/cad/mapping-rules"],
      ["POST", "/api/onshape/document-refs"],
    ] as const;

    for (const [method, url] of attempts) {
      const response = await app.inject({ method, url, headers: studentHeaders, payload: {} });
      assert.equal(response.statusCode, 403, `${method} ${url}`);
      resetLimits();
    }
  }, { env: workflowAuthEnv });
});

test("mentors retain legitimate shared hierarchy mutation access", async () => {
  await withIntegrationApp(async ({ app }) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      headers: await createWorkflowAuthHeaders("mentor"),
      payload: {
        name: "Authorization fixture subsystem",
        projectId: "project-robot-2026",
        description: "Mentor-created authorization fixture",
        responsibleEngineerId: null,
      },
    });
    assert.equal(response.statusCode, 201);
  }, { env: workflowAuthEnv });
});
