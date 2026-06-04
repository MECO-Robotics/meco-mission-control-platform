import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import type { MemberRole } from "../src/domain/types";

const authEnv = {
  AUTH_JWT_SECRET: "test-audit-export-secret-1234567",
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  AUTH_MENTOR_EMAILS: "mentor@mecorobotics.org",
} as const;

async function signTestToken(args: {
  email: string;
  role: MemberRole;
  hostedDomain?: string;
}) {
  const { signSessionToken } = require("../src/auth/authService") as typeof import("../src/auth/authService");

  return signSessionToken({
    accountId: args.email,
    authProvider: "google",
    email: args.email,
    hostedDomain: args.hostedDomain ?? "mecorobotics.org",
    name: args.email,
    picture: null,
    role: args.role,
    taskSubteamIds: [],
  });
}

test("audit export requires an admin session", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const mentorToken = await signTestToken({
        email: "mentor@mecorobotics.org",
        role: "mentor",
      });
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      const mentorResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export",
        headers: {
          authorization: `Bearer ${mentorToken}`,
        },
      });

      assert.equal(mentorResponse.statusCode, 403);
      assert.match(mentorResponse.json().message, /Only admins can export audit history/i);

      resetLimits();

      const adminResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(adminResponse.statusCode, 200);
      assert.equal(Array.isArray(adminResponse.json().items), true);
    },
    { env: authEnv },
  );
});

test("audit export filters by entity type project season and date range", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const { getSnapshot, recordAuditAction } = require("../src/data/store") as typeof import("../src/data/store");
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
    },
    { env: authEnv },
  );
});

test("audit export supports csv format", async () => {
  await withIntegrationApp(
    async ({ app }) => {
      const { recordAuditAction } = require("../src/data/store") as typeof import("../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      recordAuditAction({
        operation: "update",
        entityType: "task",
        entityId: "audit-export-csv-task",
        entityLabel: "=Audit Export, CSV Task",
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
