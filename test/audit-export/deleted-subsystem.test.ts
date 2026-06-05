import assert from "node:assert/strict";
import { test } from "node:test";

import { authEnv, signTestToken } from "./helpers";
import { withIntegrationApp } from "../helpers/appIntegrationHarness";

test("audit export preserves subsystem-owned rows after subsystem deletion", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const {
        createMechanism,
        createPartDefinition,
        createPartInstance,
        createSubsystem,
        removeSubsystem,
      } = require("../../src/data/store") as typeof import("../../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });

      const subsystem = createSubsystem({
        projectId: "project-robot-2026",
        name: "Audit Export Deleted Subsystem",
        color: "#4F86C6",
        description: "Temporary subsystem for audit export retention coverage.",
        parentSubsystemId: "drive",
        responsibleEngineerId: "maya",
        mentorIds: ["jordan"],
        risks: [],
      });
      const mechanism = createMechanism({
        subsystemId: subsystem.id,
        name: "Audit Export Deleted Mechanism",
        description: "Mechanism audit row should keep project scope.",
      });
      const partDefinition = createPartDefinition({
        name: "Audit Export Deleted Subsystem Part",
        partNumber: "AUD-EXP-SUB",
        revision: "A",
        type: "custom",
        source: "Onshape",
        materialId: "mat-onyx-filament",
        description: "Part fixture for deleted subsystem audit coverage.",
        seasonId: "default-season",
      });
      const partInstance = createPartInstance({
        subsystemId: subsystem.id,
        mechanismId: mechanism.id,
        partDefinitionId: partDefinition.id,
        name: "Audit Export Deleted Part Instance",
        quantity: 1,
        trackIndividually: false,
        status: "not ready",
      });

      assert.ok(removeSubsystem(subsystem.id));

      resetLimits();

      const mechanismProjectResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=mechanism&projectId=project-robot-2026",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(mechanismProjectResponse.statusCode, 200);
      assert.ok(
        mechanismProjectResponse
          .json()
          .items.some((item: { entityId: string }) => item.entityId === mechanism.id),
      );

      resetLimits();

      const partInstanceSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/audit/export?entityType=part-instance&seasonId=default-season",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(partInstanceSeasonResponse.statusCode, 200);
      assert.ok(
        partInstanceSeasonResponse
          .json()
          .items.some((item: { entityId: string }) => item.entityId === partInstance.id),
      );
    },
    { env: authEnv },
  );
});
