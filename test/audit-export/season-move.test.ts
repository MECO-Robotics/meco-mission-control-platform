import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "../helpers/appIntegrationHarness";
import { authEnv, signTestToken } from "./helpers";

test("audit export retains old season scope after member and part moves", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const {
        createMeeting,
        createMember,
        createMilestone,
        createPartDefinition,
        createSeason,
        getSnapshot,
        updateMeeting,
        updateMember,
        updateMilestone,
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
      const futureProject = getSnapshot().projects.find(
        (project) => project.seasonId === futureSeason.id && project.projectType === "robot",
      );
      assert.ok(futureProject);
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
      const movedMilestone = createMilestone({
        title: "Audit Export Moved Milestone",
        type: "deadline",
        startDateTime: "2031-02-01T09:00:00-05:00",
        endDateTime: null,
        isExternal: false,
        description: "Milestone moved between audit export seasons.",
        projectIds: ["project-robot-2026"],
      });
      assert.ok(
        updateMilestone(movedMilestone.id, {
          projectIds: [futureProject.id],
        }),
      );
      const movedMeeting = createMeeting({
        title: "Audit Export Moved Meeting",
        meetingType: "general",
        seasonId: "default-season",
        projectIds: [],
        startDateTime: "2031-02-02T18:00:00-05:00",
        endDateTime: null,
        location: "Shop",
        description: "Meeting moved between audit export seasons.",
      });
      assert.ok(
        updateMeeting(movedMeeting.id, {
          seasonId: futureSeason.id,
          projectIds: [],
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

      resetLimits();

      const oldMilestoneSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=milestone&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(oldMilestoneSeasonResponse.statusCode, 200);
      assert.ok(
        oldMilestoneSeasonResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedMilestone.id && item.operation === "update",
          ),
      );

      resetLimits();

      const oldMeetingSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=meeting&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(oldMeetingSeasonResponse.statusCode, 200);
      assert.ok(
        oldMeetingSeasonResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedMeeting.id && item.operation === "update",
          ),
      );
    },
    { env: authEnv },
  );
});
