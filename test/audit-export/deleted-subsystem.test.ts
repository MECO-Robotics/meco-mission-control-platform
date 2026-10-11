import assert from "node:assert/strict";
import { test } from "node:test";

import { auditAdminMember, authEnv, signTestToken } from "./helpers";
import { withIntegrationApp } from "../helpers/appIntegrationHarness";

test("audit export preserves subsystem-owned rows after subsystem deletion", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const {
        createProject,
        createMechanism,
        createPartDefinition,
        createPartInstance,
        createSubsystem,
        getSnapshot,
        removeSubsystem,
        updateMechanism,
        updatePartInstance,
      } = require("../../src/data/store") as typeof import("../../src/data/store");
      const adminToken = await signTestToken({
        email: "maya.ortiz@mecorobotics.org",
        role: "admin",
      });
      const admin = getSnapshot().members.find((member) => member.email === auditAdminMember.email);
      assert.ok(admin);
      const robotProject = createProject({ name: "Robot Audit Test", seasonId: "default-season", projectType: "robot" });
      const operationsProject = createProject({ name: "Operations Audit Test", seasonId: "default-season", projectType: "operations" });

      const subsystem = createSubsystem({
        projectId: robotProject.id,
        name: "Audit Export Deleted Subsystem",
        color: "#4F86C6",
        description: "Temporary subsystem for audit export retention coverage.",
        parentSubsystemId: null,
        responsibleEngineerId: "ava",
        mentorIds: [],
      }, { actorMemberId: admin.id });
      const operationsSubsystem = createSubsystem({
        projectId: operationsProject.id,
        name: "Operations Audit Subsystem",
        color: "#4F86C6",
        description: "Destination for audit export move coverage.",
        parentSubsystemId: null,
        responsibleEngineerId: "ava",
        mentorIds: [],
      }, { actorMemberId: admin.id });
      const sourceSubsystem = createSubsystem({
        projectId: robotProject.id,
        name: "Robot Audit Move Source",
        color: "#4F86C6",
        description: "Source for audit export move coverage.",
        parentSubsystemId: null,
        responsibleEngineerId: "ava",
        mentorIds: [],
      }, { actorMemberId: admin.id });
      const mechanism = createMechanism({
        subsystemId: subsystem.id,
        name: "Audit Export Deleted Mechanism",
        description: "Mechanism audit row should keep project scope.",
      }, { actorMemberId: admin.id });
      const partDefinition = createPartDefinition({
        name: "Audit Export Deleted Subsystem Part",
        partNumber: "AUD-EXP-SUB",
        revision: "A",
        type: "custom",
        defaultAcquisitionMethod: "stock",
        materialId: "mat-onyx-filament",
        description: "Part fixture for deleted subsystem audit coverage.",
        seasonId: "default-season",
      });
      const partInstance = createPartInstance({
        intendedSubsystemId: subsystem.id,
        intendedMechanismId: mechanism.id,
        partDefinitionId: partDefinition.id,
        location: { kind: "stock", location: "Audit fixture" },
      });

      assert.ok(removeSubsystem(subsystem.id));

      resetLimits();

      const mechanismProjectResponse = await app.inject({
        method: "GET",
        url: `/api/audit/export?entityType=mechanism&projectId=${robotProject.id}`,
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

      const movedMechanism = createMechanism({
        subsystemId: sourceSubsystem.id,
        name: "Audit Export Moved Mechanism",
        description: "Mechanism audit row should keep old and new project scope.",
      });
      assert.throws(() => updateMechanism(movedMechanism.id, { subsystemId: operationsSubsystem.id }), /cannot move between projects/);
      assert.ok(updateMechanism(movedMechanism.id, { description: "Rejected move retains original project ownership." }));

      resetLimits();

      const oldMechanismProjectResponse = await app.inject({
        method: "GET",
        url: `/api/audit/export?entityType=mechanism&projectId=${robotProject.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(oldMechanismProjectResponse.statusCode, 200);
      assert.ok(
        oldMechanismProjectResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedMechanism.id && item.operation === "update",
          ),
      );

      resetLimits();

      const newMechanismProjectResponse = await app.inject({
        method: "GET",
        url: `/api/audit/export?entityType=mechanism&projectId=${operationsProject.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(newMechanismProjectResponse.statusCode, 200);
      assert.equal(
        newMechanismProjectResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedMechanism.id && item.operation === "update",
          ),
        false,
      );

      const movedPartDefinition = createPartDefinition({
        name: "Audit Export Moved Part",
        partNumber: "AUD-EXP-MOVE",
        revision: "A",
        type: "custom",
        defaultAcquisitionMethod: "stock",
        materialId: "mat-onyx-filament",
        description: "Part definition for moved part instance audit coverage.",
        seasonId: "default-season",
      });
      const movedPartInstance = createPartInstance({
        intendedSubsystemId: sourceSubsystem.id,
        intendedMechanismId: null,
        partDefinitionId: movedPartDefinition.id,
        location: { kind: "stock", location: "Audit export bin" },
      });
      assert.ok(updatePartInstance(movedPartInstance.id, { intendedSubsystemId: operationsSubsystem.id }));

      resetLimits();

      const oldPartProjectResponse = await app.inject({
        method: "GET",
        url: `/api/audit/export?entityType=part-instance&projectId=${robotProject.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(oldPartProjectResponse.statusCode, 200);
      assert.ok(
        oldPartProjectResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedPartInstance.id && item.operation === "update",
          ),
      );

      resetLimits();

      const newPartProjectResponse = await app.inject({
        method: "GET",
        url: `/api/audit/export?entityType=part-instance&projectId=${operationsProject.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(newPartProjectResponse.statusCode, 200);
      assert.ok(
        newPartProjectResponse
          .json()
          .items.some(
            (item: { entityId: string; operation: string }) =>
              item.entityId === movedPartInstance.id && item.operation === "update",
          ),
      );
    },
    { env: authEnv, members: [auditAdminMember] },
  );
});
