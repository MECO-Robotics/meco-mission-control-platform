import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { createMember, createWorkLog, getSnapshot } from "../src/data/store";

test("planning entity endpoints round-trip hierarchy and archive defaults", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const snapshot = getSnapshot();
    const participant = createMember({
      name: "Planning Filter Member",
      email: "planning-filter@mecorobotics.org",
      role: "student",
      seasonId: "default-season",
    });
    const participantId = participant.id;
    const workLog = createWorkLog({
      taskId: snapshot.tasks[0].id,
      date: "2026-09-27",
      hours: 1,
      participantIds: [participantId],
      notes: "Planning endpoint filter scenario",
    });
    const filteredBootstrapResponse = await app.inject({
      method: "GET",
      url: `/api/bootstrap?personId=${participantId}`,
    });

    assert.equal(filteredBootstrapResponse.statusCode, 200);
    const filteredBootstrapBody = filteredBootstrapResponse.json() as {
      workLogs: Array<{
        id: string;
        participantIds: string[];
      }>;
    };
    assert.deepEqual(
      filteredBootstrapBody.workLogs.map((workLog) => workLog.id),
      [workLog.id],
    );

    resetLimits();

    const ownershipBootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?projectId=project-robot-2026",
    });
    assert.equal(ownershipBootstrapResponse.statusCode, 200);
    const ownershipBootstrapBody = ownershipBootstrapResponse.json() as {
      mechanisms: Array<{ id: string; subsystemId?: string; name?: string }>;
      partDefinitions: Array<{
        id: string;
        name?: string;
        partNumber?: string;
        revision?: string;
        defaultAcquisitionMethod?: string;
        type?: string;
      }>;
      partInstances: Array<{
        id: string;
        partDefinitionId?: string;
        location?: { kind: string; subsystemId?: string; mechanismId?: string | null };
        readinessStatus?: string;
      }>;
    };
    const bootstrapMechanism = ownershipBootstrapBody.mechanisms.find(
      (mechanism) => mechanism.id === "swerve-module",
    );
    const bootstrapPartDefinition = ownershipBootstrapBody.partDefinitions.find(
      (partDefinition) => partDefinition.id === "pd-swerve-encoder-bracket",
    );
    const bootstrapPartInstance = ownershipBootstrapBody.partInstances.find(
      (partInstance) => partInstance.id === "pi-swerve-encoder-bracket-front-left",
    );

    assert.deepEqual(
      {
        id: bootstrapMechanism?.id,
        subsystemId: bootstrapMechanism?.subsystemId,
      },
      {
        id: "swerve-module",
        subsystemId: "drive",
      },
    );
    assert.deepEqual(
      {
        id: bootstrapPartDefinition?.id,
        partNumber: bootstrapPartDefinition?.partNumber,
        revision: bootstrapPartDefinition?.revision,
        defaultAcquisitionMethod: bootstrapPartDefinition?.defaultAcquisitionMethod,
        type: bootstrapPartDefinition?.type,
      },
      {
        id: "pd-swerve-encoder-bracket",
        partNumber: "DRV-101",
        revision: "B",
        defaultAcquisitionMethod: "manufacture",
        type: "custom",
      },
    );
    assert.deepEqual(
      {
        id: bootstrapPartInstance?.id,
        partDefinitionId: bootstrapPartInstance?.partDefinitionId,
        location: bootstrapPartInstance?.location,
      },
      {
        id: "pi-swerve-encoder-bracket-front-left",
        partDefinitionId: "pd-swerve-encoder-bracket",
        location: { kind: "installed", subsystemId: "drive", mechanismId: "swerve-module" },
      },
    );

    resetLimits();

    const partDefinitionResponse = await app.inject({
      method: "POST",
      url: "/api/part-definitions",
      payload: {
        name: "Route Test Part",
        partNumber: "TST-900",
        revision: "A",
        iteration: 4,
        type: "custom",
        defaultAcquisitionMethod: "stock",
        materialId: "mat-onyx-filament",
        description: "Created from the app test suite.",
        photoUrl: "https://cdn.example.test/parts/route-test-part.png",
      },
    });

    assert.equal(partDefinitionResponse.statusCode, 201);
    const partDefinitionBody = partDefinitionResponse.json() as {
      item: {
        description: string;
        id: string;
        isArchived: boolean;
        iteration: number;
        materialId: string | null;
        photoUrl: string;
      };
    };
    assert.equal(partDefinitionBody.item.isArchived, false);
    assert.equal(partDefinitionBody.item.iteration, 4);
    assert.equal(partDefinitionBody.item.materialId, "mat-onyx-filament");
    assert.equal(partDefinitionBody.item.description, "Created from the app test suite.");
    assert.equal(
      partDefinitionBody.item.photoUrl,
      "https://cdn.example.test/parts/route-test-part.png",
    );

    resetLimits();

    const autoPartDefinitionResponse = await app.inject({
      method: "POST",
      url: "/api/part-definitions",
      payload: {
        name: "Auto Serial Part",
        isHardware: true,
        revision: "A",
        iteration: 1,
        type: "custom",
        defaultAcquisitionMethod: "stock",
        materialId: "mat-onyx-filament",
        description: "Created without part number to validate auto serialization.",
        photoUrl: "",
      },
    });

    assert.equal(autoPartDefinitionResponse.statusCode, 201);
    assert.match(autoPartDefinitionResponse.json().item.partNumber, /^H-\d{3}$/);

    resetLimits();

    const partDefinitionIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/part-definitions/${partDefinitionBody.item.id}`,
      payload: {
        iteration: 5,
        isArchived: true,
        photoUrl: "https://cdn.example.test/parts/route-test-part-v2.png",
      },
    });

    assert.equal(partDefinitionIterationUpdateResponse.statusCode, 200);
    assert.equal(partDefinitionIterationUpdateResponse.json().item.iteration, 5);
    assert.equal(partDefinitionIterationUpdateResponse.json().item.isArchived, true);
    assert.equal(
      partDefinitionIterationUpdateResponse.json().item.photoUrl,
      "https://cdn.example.test/parts/route-test-part-v2.png",
    );

    resetLimits();

    const partInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        intendedSubsystemId: "drive",
        intendedMechanismId: "swerve-module",
        partDefinitionId: partDefinitionBody.item.id,
        location: { kind: "installed", subsystemId: "drive", mechanismId: "swerve-module" },
        photoUrl: "https://cdn.example.test/parts/route-test-instance.png",
      },
    });

    assert.equal(partInstanceResponse.statusCode, 201);
    const partInstanceBody = partInstanceResponse.json() as {
      item: {
        location: { kind: string; subsystemId?: string; mechanismId?: string | null };
        photoUrl: string;
      };
    };
    assert.deepEqual(partInstanceBody.item.location, { kind: "installed", subsystemId: "drive", mechanismId: "swerve-module" });
    assert.equal(
      partInstanceBody.item.photoUrl,
      "https://cdn.example.test/parts/route-test-instance.png",
    );

    resetLimits();

    const mismatchedPartInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        intendedSubsystemId: "outreach",
        intendedMechanismId: "swerve-module",
        partDefinitionId: partDefinitionBody.item.id,
        location: { kind: "unlocated" },
        photoUrl: "https://cdn.example.test/parts/invalid.png",
      },
    });

    assert.equal(mismatchedPartInstanceResponse.statusCode, 400);
    assert.match(
      mismatchedPartInstanceResponse.json().message as string,
      /does not belong to the selected subsystem/i,
    );

    resetLimits();

    const childSubsystemResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        projectId: "project-robot-2026",
        name: "Route Test Intake",
        color: "#4F86C6",
        description: "Temporary child subsystem for route edge-case coverage.",
        iteration: 2,
        parentSubsystemId: "drive",
        responsibleEngineerId: "ava",
        mentorIds: ["marco"],
        photoUrl: "https://cdn.example.test/subsystems/route-test-intake.png",
      },
    });

    assert.equal(childSubsystemResponse.statusCode, 201);
    const childSubsystemBody = childSubsystemResponse.json() as {
      item: {
        color?: string;
        id: string;
        isArchived: boolean;
        iteration: number;
        photoUrl: string;
      };
    };
    assert.equal(childSubsystemBody.item.color, "#4F86C6");
    assert.equal(childSubsystemBody.item.isArchived, false);
    assert.equal(childSubsystemBody.item.iteration, 2);
    assert.equal(
      childSubsystemBody.item.photoUrl,
      "https://cdn.example.test/subsystems/route-test-intake.png",
    );

    resetLimits();

    const childSubsystemIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/subsystems/${childSubsystemBody.item.id}`,
      payload: {
        color: "#7A5CFA",
        iteration: 3,
        isArchived: true,
        photoUrl: "https://cdn.example.test/subsystems/route-test-intake-v2.png",
      },
    });

    assert.equal(childSubsystemIterationUpdateResponse.statusCode, 200);
    assert.equal(childSubsystemIterationUpdateResponse.json().item.color, "#7A5CFA");
    assert.equal(childSubsystemIterationUpdateResponse.json().item.iteration, 3);
    assert.equal(childSubsystemIterationUpdateResponse.json().item.isArchived, true);
    assert.equal(
      childSubsystemIterationUpdateResponse.json().item.photoUrl,
      "https://cdn.example.test/subsystems/route-test-intake-v2.png",
    );

    resetLimits();

    const grandchildSubsystemResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        projectId: "project-robot-2026",
        name: "Route Test Nested Intake",
        description: "Nested subsystem for cycle validation.",
        parentSubsystemId: childSubsystemBody.item.id,
        responsibleEngineerId: "ava",
      },
    });
    assert.equal(grandchildSubsystemResponse.statusCode, 201, grandchildSubsystemResponse.body);
    const grandchildSubsystemId = grandchildSubsystemResponse.json().item.id as string;

    resetLimits();

    const mechanismResponse = await app.inject({
      method: "POST",
      url: "/api/mechanisms",
      payload: {
        subsystemId: childSubsystemBody.item.id,
        name: "Route Test Roller",
        description: "Temporary mechanism for route iteration coverage.",
        iteration: 2,
        photoUrl: "https://cdn.example.test/mechanisms/route-test-roller.png",
      },
    });

    assert.equal(mechanismResponse.statusCode, 201);
    const mechanismBody = mechanismResponse.json() as {
      item: {
        id: string;
        isArchived: boolean;
        iteration: number;
        photoUrl: string;
      };
    };
    assert.equal(mechanismBody.item.isArchived, false);
    assert.equal(mechanismBody.item.iteration, 2);
    assert.equal(
      mechanismBody.item.photoUrl,
      "https://cdn.example.test/mechanisms/route-test-roller.png",
    );

    resetLimits();

    const mechanismIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/mechanisms/${mechanismBody.item.id}`,
      payload: {
        iteration: 3,
        isArchived: true,
        photoUrl: "https://cdn.example.test/mechanisms/route-test-roller-v2.png",
      },
    });

    assert.equal(mechanismIterationUpdateResponse.statusCode, 200);
    assert.equal(mechanismIterationUpdateResponse.json().item.iteration, 3);
    assert.equal(mechanismIterationUpdateResponse.json().item.isArchived, true);
    assert.equal(
      mechanismIterationUpdateResponse.json().item.photoUrl,
      "https://cdn.example.test/mechanisms/route-test-roller-v2.png",
    );

    resetLimits();

    const memberResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Route Test Member",
        email: "route.test.member@mecorobotics.org",
        role: "student",
        elevated: false,
        seasonId: "default-season",
        activeSeasonIds: ["default-season"],
        photoUrl: "https://cdn.example.test/people/route-test-member.png",
        plannedWeeklyAttendanceHours: 6,
        plannedAttendanceDays: ["monday", "wednesday"],
        plannedAttendanceNotes: "Usually available for build nights.",
      },
    });

    assert.equal(memberResponse.statusCode, 201);
    const memberBody = memberResponse.json() as {
      item: {
        id: string;
        photoUrl: string;
        plannedWeeklyAttendanceHours: number;
        plannedAttendanceDays: string[];
        plannedAttendanceNotes: string;
      };
    };
    assert.equal(memberBody.item.photoUrl, "https://cdn.example.test/people/route-test-member.png");
    assert.equal(memberBody.item.plannedWeeklyAttendanceHours, 6);
    assert.deepEqual(memberBody.item.plannedAttendanceDays, ["monday", "wednesday"]);
    assert.equal(memberBody.item.plannedAttendanceNotes, "Usually available for build nights.");

    resetLimits();

    const memberPatchResponse = await app.inject({
      method: "PATCH",
      url: `/api/members/${memberBody.item.id}`,
      payload: {
        photoUrl: "https://cdn.example.test/people/route-test-member-v2.png",
        plannedWeeklyAttendanceHours: 3.5,
        plannedAttendanceDays: ["saturday"],
        plannedAttendanceNotes: "Competition week conflict.",
      },
    });

    assert.equal(memberPatchResponse.statusCode, 200);
    assert.equal(
      memberPatchResponse.json().item.photoUrl,
      "https://cdn.example.test/people/route-test-member-v2.png",
    );
    assert.equal(memberPatchResponse.json().item.plannedWeeklyAttendanceHours, 3.5);
    assert.deepEqual(memberPatchResponse.json().item.plannedAttendanceDays, ["saturday"]);
    assert.equal(memberPatchResponse.json().item.plannedAttendanceNotes, "Competition week conflict.");

    resetLimits();

    const memberPhotoOnlyPatchResponse = await app.inject({
      method: "PATCH",
      url: `/api/members/${memberBody.item.id}`,
      payload: {
        photoUrl: "https://cdn.example.test/people/route-test-member-v3.png",
      },
    });

    assert.equal(memberPhotoOnlyPatchResponse.statusCode, 200);
    assert.equal(
      memberPhotoOnlyPatchResponse.json().item.photoUrl,
      "https://cdn.example.test/people/route-test-member-v3.png",
    );
    assert.equal(memberPhotoOnlyPatchResponse.json().item.plannedWeeklyAttendanceHours, 3.5);
    assert.deepEqual(memberPhotoOnlyPatchResponse.json().item.plannedAttendanceDays, ["saturday"]);
    assert.equal(memberPhotoOnlyPatchResponse.json().item.plannedAttendanceNotes, "Competition week conflict.");

    resetLimits();

    const cyclicSubsystemResponse = await app.inject({
      method: "PATCH",
      url: `/api/subsystems/${childSubsystemBody.item.id}`,
      payload: {
        parentSubsystemId: grandchildSubsystemId,
      },
    });

    assert.equal(cyclicSubsystemResponse.statusCode, 400);
    assert.match(cyclicSubsystemResponse.json().message as string, /cycle|descendant/i);

    resetLimits();

    const createRobotProjectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        seasonId: "default-season",
        name: "Robot",
        projectType: "robot",
      },
    });

    assert.equal(createRobotProjectResponse.statusCode, 409);
    assert.equal(getSnapshot().projects.filter((project) => project.seasonId === "default-season" && project.projectType === "robot").length, 1);

    resetLimits();
    const robotProject = getSnapshot().projects.find((project) => project.projectType === "robot" && project.seasonId === "default-season");
    assert.ok(robotProject);

    const updateRobotProjectResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${robotProject.id}`,
      payload: {
        description: "Updated Robot project details.",
      },
    });

    assert.equal(updateRobotProjectResponse.statusCode, 200);
    assert.equal(updateRobotProjectResponse.json().item.name, "Robot");
    assert.equal(updateRobotProjectResponse.json().item.description, "Updated Robot project details.");
  });
});
