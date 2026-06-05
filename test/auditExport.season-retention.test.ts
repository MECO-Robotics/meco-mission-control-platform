import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { authEnv, signTestToken } from "./auditExport.helpers";

test("audit export retains deleted entities for active season filters", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const {
        createMember,
        createPartDefinition,
        createSeason,
        getSnapshot,
        recordAuditAction,
        removeMember,
        removePartDefinition,
        updateMember,
        updatePartDefinition,
      } = require("../src/data/store") as typeof import("../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      const futureSeason = createSeason({
        name: "Audit Export Future Season",
        type: "season",
        startDate: "2030-01-01",
        endDate: "2030-12-31",
      });
      const updatedMaya = updateMember("maya", {
        activeSeasonIds: ["default-season", futureSeason.id],
      });
      assert.ok(updatedMaya);
      recordAuditAction({
        operation: "update",
        entityType: "member",
        entityId: "maya",
        entityLabel: "Maya Ortiz",
        changedFields: ["activeSeasonIds"],
        afterJson: { activeSeasonIds: ["default-season", futureSeason.id] },
        actorMemberId: "maya",
        memberIds: ["maya"],
        requestId: "req-audit-export-future-member",
      });

      const sharedPartDefinition = createPartDefinition({
        name: "Audit Export Shared Part",
        partNumber: "AUD-EXP-001",
        revision: "A",
        type: "custom",
        source: "Onshape",
        materialId: "mat-onyx-filament",
        description: "Shared across audit export seasons.",
        seasonId: "default-season",
      });
      const updatedPartDefinition = updatePartDefinition(sharedPartDefinition.id, {
        activeSeasonIds: ["default-season", futureSeason.id],
      });
      assert.ok(updatedPartDefinition);
      recordAuditAction({
        operation: "update",
        entityType: "part-definition",
        entityId: sharedPartDefinition.id,
        entityLabel: sharedPartDefinition.name,
        changedFields: ["activeSeasonIds"],
        afterJson: { activeSeasonIds: ["default-season", futureSeason.id] },
        actorMemberId: "maya",
        requestId: "req-audit-export-future-part-definition",
      });

      const deletedMember = createMember({
        name: "Audit Export Delete Member",
        role: "student",
        seasonId: "default-season",
      });
      const updatedDeletedMember = updateMember(deletedMember.id, {
        activeSeasonIds: ["default-season", futureSeason.id],
      });
      assert.ok(updatedDeletedMember);
      assert.ok(removeMember(deletedMember.id));

      const deletedPartDefinition = createPartDefinition({
        name: "Audit Export Deleted Part",
        partNumber: "AUD-EXP-DEL",
        revision: "A",
        type: "custom",
        source: "Onshape",
        materialId: "mat-onyx-filament",
        description: "Deleted after being active in another season.",
        seasonId: "default-season",
      });
      const updatedDeletedPartDefinition = updatePartDefinition(deletedPartDefinition.id, {
        activeSeasonIds: ["default-season", futureSeason.id],
      });
      assert.ok(updatedDeletedPartDefinition);
      assert.ok(removePartDefinition(deletedPartDefinition.id));

      const futureProject = getSnapshot().projects.find(
        (project) => project.seasonId === futureSeason.id && project.projectType === "robot",
      );
      assert.ok(futureProject);
      recordAuditAction({
        operation: "update",
        entityType: "cad",
        entityId: "audit-export-future-cad",
        entityLabel: "Audit Export Future CAD",
        changedFields: ["status"],
        afterJson: { status: "synced" },
        projectId: futureProject.id,
        actorMemberId: "maya",
        requestId: "req-audit-export-future-cad",
      });

      resetLimits();

      const defaultSeasonCadResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=cad&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(defaultSeasonCadResponse.statusCode, 200);
      assert.equal(defaultSeasonCadResponse.json().count, 0);

      resetLimits();

      const futureSeasonCadResponse = await app.inject({
        method: "GET",
        url: `/api/audit/export?entityType=cad&seasonId=${encodeURIComponent(futureSeason.id)}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(futureSeasonCadResponse.statusCode, 200);
      assert.deepEqual(
        futureSeasonCadResponse.json().items.map((item: { requestId: string }) => item.requestId),
        ["req-audit-export-future-cad"],
      );

      resetLimits();

      const futureSeasonMemberResponse = await app.inject({
        method: "GET",
        url: `/api/audit/export?entityType=member&seasonId=${encodeURIComponent(futureSeason.id)}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(futureSeasonMemberResponse.statusCode, 200);
      assert.ok(
        futureSeasonMemberResponse
          .json()
          .items.some(
            (item: { requestId: string | null }) =>
              item.requestId === "req-audit-export-future-member",
          ),
      );
      assert.ok(
        futureSeasonMemberResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === deletedMember.id && item.operation === "delete",
          ),
      );

      resetLimits();

      const futureSeasonPartDefinitionResponse = await app.inject({
        method: "GET",
        url:
          "/api/audit/export?entityType=part-definition" +
          `&seasonId=${encodeURIComponent(futureSeason.id)}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(futureSeasonPartDefinitionResponse.statusCode, 200);
      assert.ok(
        futureSeasonPartDefinitionResponse
          .json()
          .items.some(
            (item: { requestId: string | null }) =>
              item.requestId === "req-audit-export-future-part-definition",
          ),
      );
      assert.ok(
        futureSeasonPartDefinitionResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === deletedPartDefinition.id && item.operation === "delete",
          ),
      );
    },
    { env: authEnv },
  );
});
