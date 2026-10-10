import assert from "node:assert/strict";
import { test } from "node:test";

import { auditAdminMember, authEnv, signTestToken } from "./helpers";
import { withIntegrationApp } from "../helpers/appIntegrationHarness";

test("audit export preserves workstream risk scope after deletion", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const {
        createRisk,
        getSnapshot,
        removeRisk,
        updateRisk,
      } = require("../../src/data/store") as typeof import("../../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      const robotWorkstream = getSnapshot().workstreams.find(
        (workstream) => workstream.projectId === "project-robot-2026",
      );
      assert.ok(robotWorkstream);
      const workstreamRisk = createRisk({
        projectId: robotWorkstream.projectId,
        title: "Audit Export Deleted Workstream Risk",
        detail: "Deleted risk attached through a project workstream.",
        severity: "medium", category: "supply", status: "open", blocksWork: false,
        source: { kind: "manual" }, relatedTargets: [{ kind: "workstream", id: robotWorkstream.id }],
        mitigationTaskId: null, ownerGroupId: null,
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

      const movedRisk = createRisk({
        projectId: "project-robot-2026",
        title: "Audit Export Moved Project Risk",
        detail: "Risk moved between projects.",
        severity: "medium", category: "supply", status: "open", blocksWork: false,
        source: { kind: "manual" }, relatedTargets: [{ kind: "project", id: "project-robot-2026" }],
        mitigationTaskId: null, ownerGroupId: null,
      });
      assert.ok(
        updateRisk(movedRisk.id, {
          projectId: "project-operations-2026",
          relatedTargets: [{ kind: "project", id: "project-operations-2026" }],
        }),
      );

      resetLimits();

      const oldProjectResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=risk&projectId=project-robot-2026",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(oldProjectResponse.statusCode, 200);
      assert.ok(
        oldProjectResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedRisk.id && item.operation === "update",
          ),
      );

      resetLimits();

      const newProjectResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=risk&projectId=project-operations-2026",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(newProjectResponse.statusCode, 200);
      assert.ok(
        newProjectResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedRisk.id && item.operation === "update",
          ),
      );
    },
    { env: authEnv, members: [auditAdminMember] },
  );
});
