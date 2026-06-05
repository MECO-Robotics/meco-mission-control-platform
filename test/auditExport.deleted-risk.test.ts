import assert from "node:assert/strict";
import { test } from "node:test";

import { authEnv, signTestToken } from "./auditExport.helpers";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("audit export preserves workstream risk scope after deletion", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const { createRisk, getSnapshot, removeRisk } = require("../src/data/store") as typeof import("../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      const robotWorkstream = getSnapshot().workstreams.find(
        (workstream) => workstream.projectId === "project-robot-2026",
      );
      assert.ok(robotWorkstream);
      const workstreamRisk = createRisk({
        title: "Audit Export Deleted Workstream Risk",
        detail: "Deleted risk attached through a project workstream.",
        severity: "medium",
        sourceType: "qa-report",
        sourceId: "qa-report-audit-export-delete",
        attachmentType: "workstream",
        attachmentId: robotWorkstream.id,
        mitigationTaskId: null,
      });

      assert.ok(removeRisk(workstreamRisk.id));

      resetLimits();

      const projectResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=risk&projectId=project-robot-2026",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(projectResponse.statusCode, 200);
      assert.ok(
        projectResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === workstreamRisk.id && item.operation === "delete",
          ),
      );

      resetLimits();

      const seasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=risk&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(seasonResponse.statusCode, 200);
      assert.ok(
        seasonResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === workstreamRisk.id && item.operation === "delete",
          ),
      );
    },
    { env: authEnv },
  );
});
