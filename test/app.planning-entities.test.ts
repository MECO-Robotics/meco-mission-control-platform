import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { createMember, createWorkLog, getSnapshot } from "../src/data/store";

test("planning entity endpoints round-trip hierarchy and archive defaults", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const snapshot = getSnapshot();
    const seasonId = snapshot.seasons.find((season) => season.name.includes("2026"))!.id;
    const robotProject = snapshot.projects.find((project) => project.projectType === "robot" && project.seasonId === seasonId)!;
    const robotSubsystem = snapshot.subsystems.find((subsystem) => subsystem.projectId === robotProject.id)!;
    const robotMechanism = snapshot.mechanisms.find((mechanism) => mechanism.subsystemId === robotSubsystem.id)!;
    const otherRobotSubsystem = snapshot.subsystems.find((subsystem) => subsystem.projectId === robotProject.id && subsystem.id !== robotSubsystem.id)!;
    const robotPartInstance = snapshot.partInstances.find((part) => part.location.kind === "installed" && part.location.subsystemId === robotSubsystem.id && part.location.mechanismId === robotMechanism.id)!;
    const robotPartDefinition = snapshot.partDefinitions.find((part) => part.id === robotPartInstance.partDefinitionId)!;
    const materialId = snapshot.materials[0]!.id;
    const student = snapshot.members.find((member) => member.role === "student" && member.seasonId === seasonId)!;
    const mentor = snapshot.members.find((member) => member.role === "mentor" && member.seasonId === seasonId)!;
    const participant = createMember({
      name: "Planning Filter Member",
      email: "planning-filter@mecorobotics.org",
      role: "student",
      seasonId,
    });
    const participantId = participant.id;
    const workLog = createWorkLog({
      taskId: snapshot.tasks.find((task) => task.projectId === robotProject.id)!.id,
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
      url: `/api/bootstrap?projectId=${robotProject.id}`,
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
      (mechanism) => mechanism.id === robotMechanism.id,
    );
    const bootstrapPartDefinition = ownershipBootstrapBody.partDefinitions.find(
      (partDefinition) => partDefinition.id === robotPartDefinition.id,
    );
    const bootstrapPartInstance = ownershipBootstrapBody.partInstances.find(
      (partInstance) => partInstance.id === robotPartInstance.id,
    );

    assert.deepEqual(
      {
        id: bootstrapMechanism?.id,
        subsystemId: bootstrapMechanism?.subsystemId,
      },
      {
        id: robotMechanism.id,
        subsystemId: robotSubsystem.id,
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
        id: robotPartDefinition.id,
        partNumber: robotPartDefinition.partNumber,
        revision: robotPartDefinition.revision,
        defaultAcquisitionMethod: robotPartDefinition.defaultAcquisitionMethod,
        type: robotPartDefinition.type,
      },
    );
    assert.deepEqual(
      {
        id: bootstrapPartInstance?.id,
        partDefinitionId: bootstrapPartInstance?.partDefinitionId,
        location: bootstrapPartInstance?.location,
      },
      {
        id: robotPartInstance.id,
        partDefinitionId: robotPartDefinition.id,
        location: robotPartInstance.location,
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
        materialId: snapshot.materials[0]?.id ?? null,
        description: "Created from the app test suite.",
        photoUrl: "https://cdn.example.test/parts/route-test-part.png",
      },
    });

    assert.equal(partDefinitionResponse.statusCode, 201, partDefinitionResponse.body);
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
    assert.equal(partDefinitionBody.item.materialId, materialId);
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
        materialId,
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
        intendedSubsystemId: robotSubsystem.id,
        intendedMechanismId: robotMechanism.id,
        partDefinitionId: partDefinitionBody.item.id,
        location: { kind: "installed", subsystemId: robotSubsystem.id, mechanismId: robotMechanism.id },
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
    assert.deepEqual(partInstanceBody.item.location, { kind: "installed", subsystemId: robotSubsystem.id, mechanismId: robotMechanism.id });
    assert.equal(
      partInstanceBody.item.photoUrl,
      "https://cdn.example.test/parts/route-test-instance.png",
    );

    resetLimits();

    const mismatchedPartInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        intendedSubsystemId: otherRobotSubsystem.id,
        intendedMechanismId: robotMechanism.id,
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
        projectId: robotProject.id,
        name: "Route Test Intake",
        color: "#4F86C6",
        description: "Temporary child subsystem for route edge-case coverage.",
        iteration: 2,
        parentSubsystemId: robotSubsystem.id,
        responsibleEngineerId: student.id,
        mentorIds: [mentor.id],
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
        projectId: robotProject.id,
        name: "Route Test Nested Intake",
        description: "Nested subsystem for cycle validation.",
        parentSubsystemId: childSubsystemBody.item.id,
        responsibleEngineerId: student.id,
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
        seasonId,
        activeSeasonIds: [seasonId],
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
        seasonId,
        name: "Robot",
        projectType: "robot",
      },
    });

    assert.equal(createRobotProjectResponse.statusCode, 409);
    assert.equal(getSnapshot().projects.filter((project) => project.seasonId === seasonId && project.projectType === "robot").length, 1);

    resetLimits();
    const currentRobotProject = getSnapshot().projects.find((project) => project.projectType === "robot" && project.seasonId === seasonId);
    assert.ok(currentRobotProject);

    const updateRobotProjectResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${currentRobotProject.id}`,
      payload: {
        description: "Updated Robot project details.",
      },
    });

    assert.equal(updateRobotProjectResponse.statusCode, 200);
    assert.equal(updateRobotProjectResponse.json().item.name, "Robot");
    assert.equal(updateRobotProjectResponse.json().item.description, "Updated Robot project details.");
  });
});

test("calendar commands reject malformed dates and merged reversed intervals", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const base = { title: "Calendar check", startAt: "2026-10-10T09:00:00Z", endAt: "2026-10-10T10:00:00Z", projectIds: [], location: "Lab", description: "" };
    for (const startAt of ["tomorrow", "2026-02-30T09:00:00Z"]) {
      const invalid = await app.inject({ method: "POST", url: "/api/meetings", payload: { ...base, startAt } });
      assert.equal(invalid.statusCode, 400, invalid.body);
      resetLimits();
    }
    const created = await app.inject({ method: "POST", url: "/api/meetings", payload: base });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().item.id;
    resetLimits();
    const invalidPatch = await app.inject({ method: "PATCH", url: `/api/meetings/${id}`, payload: { startAt: "2026-10-10T11:00:00Z" } });
    assert.equal(invalidPatch.statusCode, 400, invalidPatch.body);
    assert.equal(getSnapshot().meetings.find((meeting) => meeting.id === id)?.startAt, base.startAt);
    resetLimits();
    const clearEnd = await app.inject({ method: "PATCH", url: `/api/meetings/${id}`, payload: { startAt: "2026-10-10T11:00:00Z", endAt: null } });
    assert.equal(clearEnd.statusCode, 200, clearEnd.body);
  });
});

test("help signals round-trip as attributed risks and creator cannot be rewritten", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const task = getSnapshot().tasks[0]!;
    const member = getSnapshot().members[0]!;
    const create = await app.inject({ method: "POST", url: "/api/risks", payload: {
      projectId: task.projectId, title: `Help requested: ${task.title}`, detail: "Need mentor assistance",
      category: "help", severity: "medium", source: { kind: "task", id: task.id },
      relatedTargets: [{ kind: "task", id: task.id }], createdByMemberId: member.id, ownerMemberId: task.mentorId,
    } });
    assert.equal(create.statusCode, 201, create.body);
    const risk = create.json().item;
    assert.equal(risk.createdByMemberId, member.id);
    resetLimits();
    const patch = await app.inject({ method: "PATCH", url: `/api/risks/${risk.id}`, payload: { createdByMemberId: null } });
    assert.equal(patch.statusCode, 400, patch.body);
    resetLimits();
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.json().risks.find((candidate: { id: string }) => candidate.id === risk.id)?.createdByMemberId, member.id);
  });
});
