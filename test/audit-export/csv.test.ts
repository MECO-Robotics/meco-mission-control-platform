import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "../helpers/appIntegrationHarness";
import { authEnv, signTestToken } from "./helpers";

test("audit export supports csv format", async () => {
  await withIntegrationApp(
    async ({ app }) => {
      const { recordAuditAction } = require("../../src/data/store") as typeof import("../../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      recordAuditAction({
        operation: "update",
        entityType: "task",
        entityId: "audit-export-csv-task",
        entityLabel: "\t=Audit Export, CSV Task",
        changedFields: ["status"],
        afterJson: { status: "complete" },
        projectId: "project-robot-2026",
        requestId: "req-audit-export-csv",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/audit/export?format=csv&entityType=task&projectId=project-robot-2026",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(response.statusCode, 200);
      assert.match(response.headers["content-type"] as string, /text\/csv/);
      assert.match(response.headers["content-disposition"] as string, /meco-audit-actions\.csv/);
      assert.match(response.body, /^id,timestamp,operation,entityType/m);
      assert.match(response.body, /req-audit-export-csv/);
      assert.match(response.body, /"'=Audit Export, CSV Task"/);
    },
    { env: authEnv },
  );
});
