import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { authEnv, signTestToken } from "./auditExport.helpers";

test("audit export filters by entity type project season and date range", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const { createRisk, getSnapshot, recordAuditAction } = require("../src/data/store") as typeof import("../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      recordAuditAction({
        operation: "update",
        entityType: "task",
        entityId: "audit-export-task",
        entityLabel: "Audit Export Task",
        changedFields: ["status"],
        beforeJson: { status: "in-progress" },
        afterJson: { status: "complete" },
        projectId: "project-robot-2026",
        actorMemberId: "maya",
        requestId: "req-audit-export-task",
      });
      recordAuditAction({
        operation: "create",
        entityType: "risk",
        entityId: "audit-export-risk",
        entityLabel: "Audit Export Risk",
        changedFields: ["status"],
        afterJson: { status: "open" },
        projectId: "project-operations-2026",
        actorMemberId: "maya",
        requestId: "req-audit-export-risk",
      });
      recordAuditAction({
        operation: "update",
        entityType: "member",
        entityId: "maya",
        entityLabel: "Maya Ortiz",
        changedFields: ["role"],
        afterJson: { role: "admin" },
        actorMemberId: "maya",
        memberIds: ["maya"],
        requestId: "req-audit-export-member",
      });

      const robotSubsystem = getSnapshot().subsystems.find(
        (subsystem) => subsystem.projectId === "project-robot-2026",
      );
      assert.ok(robotSubsystem);
      recordAuditAction({
        operation: "update",
        entityType: "mechanism",
        entityId: "audit-export-mechanism",
        entityLabel: "Audit Export Mechanism",
        changedFields: ["iteration"],
        afterJson: { iteration: 2 },
        subsystemId: robotSubsystem.id,
        actorMemberId: "maya",
        requestId: "req-audit-export-mechanism",
      });

      const robotWorkstream = getSnapshot().workstreams.find(
        (workstream) => workstream.projectId === "project-robot-2026",
      );
      assert.ok(robotWorkstream);
      const workstreamRisk = createRisk({
        title: "Audit Export Workstream Risk",
        detail: "Risk attached through a project workstream.",
        severity: "medium",
        sourceType: "qa-report",
        sourceId: "qa-report-audit-export",
        attachmentType: "workstream",
        attachmentId: robotWorkstream.id,
        mitigationTaskId: null,
      });
      recordAuditAction({
        operation: "update",
        entityType: "risk",
        entityId: workstreamRisk.id,
        entityLabel: workstreamRisk.title,
        changedFields: ["severity"],
        afterJson: { severity: "high" },
        actorMemberId: "maya",
        requestId: "req-audit-export-workstream-risk",
      });

      const targetAction = getSnapshot().actions?.find(
        (action) => action.requestId === "req-audit-export-task",
      );
      assert.ok(targetAction);

      const response = await app.inject({
        method: "GET",
        url: `/api/audit/export?entityType=task&projectId=project-robot-2026&seasonId=default-season&from=${encodeURIComponent(targetAction.timestamp)}&to=${encodeURIComponent(targetAction.timestamp)}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(response.statusCode, 200);
      const body = response.json() as {
        count: number;
        filters: Record<string, string>;
        items: Array<{ requestId: string; entityType: string; projectId: string }>;
      };

      assert.equal(body.count, 1);
      assert.equal(body.filters.entityType, "task");
      assert.deepEqual(body.items.map((item) => item.requestId), ["req-audit-export-task"]);
      assert.equal(body.items[0]?.entityType, "task");
      assert.equal(body.items[0]?.projectId, "project-robot-2026");

      resetLimits();

      const emptyDateResponse = await app.inject({
        method: "GET",
        url: `/api/audit/export?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(emptyDateResponse.statusCode, 200);
      assert.equal(emptyDateResponse.json().count, 0);

      resetLimits();

      const memberSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=member&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(memberSeasonResponse.statusCode, 200);
      assert.deepEqual(
        memberSeasonResponse.json().items.map((item: { requestId: string }) => item.requestId),
        ["req-audit-export-member"],
      );

      resetLimits();

      const subsystemProjectResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=mechanism&projectId=project-robot-2026",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(subsystemProjectResponse.statusCode, 200);
      assert.deepEqual(
        subsystemProjectResponse.json().items.map((item: { requestId: string }) => item.requestId),
        ["req-audit-export-mechanism"],
      );

      resetLimits();

      const subsystemSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=mechanism&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(subsystemSeasonResponse.statusCode, 200);
      assert.deepEqual(
        subsystemSeasonResponse.json().items.map((item: { requestId: string }) => item.requestId),
        ["req-audit-export-mechanism"],
      );

      resetLimits();

      const workstreamRiskProjectResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=risk&projectId=project-robot-2026",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(workstreamRiskProjectResponse.statusCode, 200);
      assert.ok(
        workstreamRiskProjectResponse
          .json()
          .items.some(
            (item: { requestId: string | null }) =>
              item.requestId === "req-audit-export-workstream-risk",
          ),
      );

      resetLimits();

      const workstreamRiskSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=risk&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(workstreamRiskSeasonResponse.statusCode, 200);
      assert.ok(
        workstreamRiskSeasonResponse
          .json()
          .items.some(
            (item: { requestId: string | null }) =>
              item.requestId === "req-audit-export-workstream-risk",
          ),
      );

    },
    { env: authEnv },
  );
});
