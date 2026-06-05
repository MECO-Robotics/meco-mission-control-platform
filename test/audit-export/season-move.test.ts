import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "../helpers/appIntegrationHarness";
import { authEnv, signTestToken } from "./helpers";

test("audit export retains old season scope after member and part moves", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const {
        createMember,
        createPartDefinition,
        createSeason,
        updateMember,
        updatePartDefinition,
      } = require("../../src/data/store") as typeof import("../../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      const futureSeason = createSeason({
        name: "Audit Export Move Season",
        type: "season",
        startDate: "2031-01-01",
        endDate: "2031-12-31",
      });
      const movedMember = createMember({
        name: "Audit Export Moved Member",
        role: "student",
        seasonId: "default-season",
      });
      assert.ok(
        updateMember(movedMember.id, {
          seasonId: futureSeason.id,
          activeSeasonIds: [futureSeason.id],
        }),
      );

      const movedPartDefinition = createPartDefinition({
        name: "Audit Export Moved Season Part",
        partNumber: "AUD-EXP-SEASON-MOVE",
        revision: "A",
        type: "custom",
        source: "Onshape",
        materialId: "mat-onyx-filament",
        description: "Part definition moved between audit export seasons.",
        seasonId: "default-season",
      });
      assert.ok(
        updatePartDefinition(movedPartDefinition.id, {
          seasonId: futureSeason.id,
          activeSeasonIds: [futureSeason.id],
        }),
      );

      resetLimits();

      const oldMemberSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=member&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(oldMemberSeasonResponse.statusCode, 200);
      assert.ok(
        oldMemberSeasonResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedMember.id && item.operation === "update",
          ),
      );

      resetLimits();

      const oldPartSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=part-definition&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(oldPartSeasonResponse.statusCode, 200);
      assert.ok(
        oldPartSeasonResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedPartDefinition.id && item.operation === "update",
          ),
      );
    },
    { env: authEnv },
  );
});
