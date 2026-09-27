import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("task and milestone endpoints support mobile and multi-target payloads", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const mobileMemberCreateResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Mobile Test Student",
        role: "student",
      },
    });

    assert.equal(mobileMemberCreateResponse.statusCode, 201);
    const mobileMemberCreatedBody = mobileMemberCreateResponse.json() as {
      item: {
        email: string;
        elevated: boolean;
        id: string;
        seasonId: string;
      };
    };
    assert.equal(mobileMemberCreatedBody.item.email, "");
    assert.equal(mobileMemberCreatedBody.item.elevated, false);
    assert.equal(mobileMemberCreatedBody.item.seasonId, "default-season");

    resetLimits();

    const mobileSubsystemCreateResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        name: "Mobile Test Intake",
        description: "Subsystem created with the mobile app payload shape.",
        parentSubsystemId: "drive",
        responsibleEngineerId: mobileMemberCreatedBody.item.id,
        mentorIds: ["marco"],
        risks: [],
      },
    });

    assert.equal(mobileSubsystemCreateResponse.statusCode, 201);
    const mobileSubsystemCreatedBody = mobileSubsystemCreateResponse.json() as {
      item: {
        id: string;
        projectId: string;
      };
    };
    assert.equal(mobileSubsystemCreatedBody.item.projectId, "project-robot-2026");

    resetLimits();

    const mobileTaskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Mobile task payload",
        summary: "Created from the mobile app's compact task draft.",
        subsystemIds: [mobileSubsystemCreatedBody.item.id],
        disciplineId: "design",
        mechanismIds: [],
        partInstanceIds: [],
        targetMilestoneId: null,
        ownerId: mobileMemberCreatedBody.item.id,
        assigneeIds: [mobileMemberCreatedBody.item.id, "ava"],
        mentorId: "marco",
        dueDate: "2026-05-06",
        priority: "medium",
        status: "not-started",
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 0,
        photoUrl: "https://cdn.example.test/tasks/mobile-task.png",
      },
    });

    assert.equal(mobileTaskCreateResponse.statusCode, 201);
    const mobileTaskCreatedBody = mobileTaskCreateResponse.json() as {
      item: {
        id: string;
        projectId: string;
        assigneeIds: string[];
        startDate: string;
        workstreamIds: string[];
        photoUrl: string;
      };
    };
    assert.equal(mobileTaskCreatedBody.item.projectId, "project-robot-2026");
    assert.deepEqual(mobileTaskCreatedBody.item.assigneeIds, [
      mobileMemberCreatedBody.item.id,
      "ava",
    ]);
    assert.equal(mobileTaskCreatedBody.item.startDate, "2026-05-06");
    assert.deepEqual(mobileTaskCreatedBody.item.workstreamIds, []);
    assert.equal(
      mobileTaskCreatedBody.item.photoUrl,
      "https://cdn.example.test/tasks/mobile-task.png",
    );

    resetLimits();
    const mediaSubsystemResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        projectId: "project-media-2026",
        name: "Media validation subsystem",
        description: "Provides a valid target for project-discipline validation.",
        parentSubsystemId: null,
        responsibleEngineerId: null,
        mentorIds: [],
        risks: [],
      },
    });
    assert.equal(mediaSubsystemResponse.statusCode, 201);
    const mediaSubsystemId = mediaSubsystemResponse.json().item.id as string;
    resetLimits();

    const invalidOperationsTaskResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        projectId: "project-media-2026",
        workstreamIds: [],
        title: "Invalid operations discipline",
        summary: "Attempts to use a robot-only discipline on a business task.",
        subsystemIds: [mediaSubsystemId],
        disciplineId: "design",
        mechanismIds: [],
        partInstanceIds: [],
        targetMilestoneId: null,
        ownerId: "ava",
        mentorId: "marco",
        dueDate: "2026-05-01",
        priority: "medium",
        status: "not-started",
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 2,
      },
    });

    assert.equal(invalidOperationsTaskResponse.statusCode, 400);
    assert.match(
      invalidOperationsTaskResponse.body,
      /selected discipline does not belong to the selected project/i,
    );

    resetLimits();
    const controlsSubsystemResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        projectId: "project-robot-2026",
        name: "Controls",
        description: "Test-local multi-target subsystem.",
        parentSubsystemId: null,
        responsibleEngineerId: null,
        mentorIds: [],
        risks: [],
      },
    });
    assert.equal(controlsSubsystemResponse.statusCode, 201);
    const controlsSubsystem = controlsSubsystemResponse.json().item;
    resetLimits();
    const controlsWorkstreamResponse = await app.inject({
      method: "POST",
      url: "/api/workstreams",
      payload: { projectId: "project-robot-2026", name: "Controls", description: "Test-local multi-target workstream." },
    });
    assert.equal(controlsWorkstreamResponse.statusCode, 201);
    const controlsWorkstream = controlsWorkstreamResponse.json().item;
    resetLimits();
    const controlsMechanismResponse = await app.inject({
      method: "POST",
      url: "/api/mechanisms",
      payload: { subsystemId: controlsSubsystem.id, name: "Controls IO", description: "Test-local multi-target mechanism." },
    });
    assert.equal(controlsMechanismResponse.statusCode, 201);
    const controlsMechanism = controlsMechanismResponse.json().item;
    resetLimits();

    const multiTargetTaskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        projectId: "project-robot-2026",
        workstreamIds: ["workstream-drive", controlsWorkstream.id],
        title: "Multi-target task payload",
        summary: "Created with multiple linked workstreams, subsystems, mechanisms, and parts.",
        subsystemIds: ["drive", controlsSubsystem.id],
        disciplineId: "design",
        mechanismIds: ["swerve-module", controlsMechanism.id],
        partInstanceIds: ["pi-swerve-encoder-bracket-front-left"],
        targetMilestoneId: null,
        ownerId: mobileMemberCreatedBody.item.id,
        mentorId: "marco",
        dueDate: "2026-05-08",
        priority: "high",
        status: "not-started",
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 2,
        photoUrl: "https://cdn.example.test/tasks/multi-target-task.png",
      },
    });

    assert.equal(multiTargetTaskCreateResponse.statusCode, 201);
    const multiTargetTaskCreatedBody = multiTargetTaskCreateResponse.json() as {
      item: {
        workstreamIds: string[];
        subsystemIds: string[];
        mechanismIds: string[];
        partInstanceIds: string[];
        photoUrl: string;
      };
    };
    assert.deepEqual(multiTargetTaskCreatedBody.item.workstreamIds, [
      "workstream-drive",
      controlsWorkstream.id,
    ]);
    assert.deepEqual(multiTargetTaskCreatedBody.item.subsystemIds, ["drive", controlsSubsystem.id]);
    assert.deepEqual(multiTargetTaskCreatedBody.item.mechanismIds, [
      "swerve-module",
      controlsMechanism.id,
    ]);
    assert.deepEqual(multiTargetTaskCreatedBody.item.partInstanceIds, [
      "pi-swerve-encoder-bracket-front-left",
    ]);
    assert.equal(
      multiTargetTaskCreatedBody.item.photoUrl,
      "https://cdn.example.test/tasks/multi-target-task.png",
    );

    resetLimits();

    const createMilestoneResponse = await app.inject({
      method: "POST",
      url: "/api/milestones",
      payload: {
        title: "Cross Project Demo",
        type: "demo",
        startDateTime: "2026-05-14T18:00:00-04:00",
        endDateTime: null,
        isExternal: true,
        description: "Milestone shared across robot and operations work.",
        projectIds: ["project-robot-2026", "project-operations-2026"],
        photoUrl: "https://cdn.example.test/forms/milestone-demo.png",
      },
    });

    assert.equal(createMilestoneResponse.statusCode, 201);
    const createdMilestoneBody = createMilestoneResponse.json() as {
      item: {
        id: string;
        projectIds: string[];
        photoUrl: string;
      };
    };
    assert.deepEqual(createdMilestoneBody.item.projectIds, [
      "project-robot-2026",
      "project-operations-2026",
    ]);
    assert.equal(
      createdMilestoneBody.item.photoUrl,
      "https://cdn.example.test/forms/milestone-demo.png",
    );

    resetLimits();

    const robotScopedBootstrapAfterMilestoneCreateResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?projectId=project-robot-2026",
    });
    assert.equal(robotScopedBootstrapAfterMilestoneCreateResponse.statusCode, 200);
    const robotScopedBootstrapAfterMilestoneCreateBody =
      robotScopedBootstrapAfterMilestoneCreateResponse.json() as {
        actions?: Array<{
          entityId: string;
          entityType: string;
          operation: string;
        }>;
      };
    assert.ok(
      (robotScopedBootstrapAfterMilestoneCreateBody.actions ?? []).some(
        (action) =>
          action.entityType === "milestone" &&
          action.entityId === createdMilestoneBody.item.id &&
          action.operation === "create",
      ),
    );

    resetLimits();

    const operationsScopedBootstrapAfterMilestoneCreateResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?projectId=project-operations-2026",
    });
    assert.equal(operationsScopedBootstrapAfterMilestoneCreateResponse.statusCode, 200);
    const operationsScopedBootstrapAfterMilestoneCreateBody =
      operationsScopedBootstrapAfterMilestoneCreateResponse.json() as {
        actions?: Array<{
          entityId: string;
          entityType: string;
          operation: string;
        }>;
      };
    assert.ok(
      (operationsScopedBootstrapAfterMilestoneCreateBody.actions ?? []).some(
        (action) =>
          action.entityType === "milestone" &&
          action.entityId === createdMilestoneBody.item.id &&
          action.operation === "create",
      ),
    );

    resetLimits();

    const updateMilestoneResponse = await app.inject({
      method: "PATCH",
      url: `/api/milestones/${createdMilestoneBody.item.id}`,
      payload: {
        projectIds: ["project-robot-2026"],
        photoUrl: "https://cdn.example.test/forms/milestone-demo-v2.png",
      },
    });

    assert.equal(updateMilestoneResponse.statusCode, 200);
    const updatedMilestoneBody = updateMilestoneResponse.json() as {
      item: {
        projectIds: string[];
        photoUrl: string;
      };
    };
    assert.deepEqual(updatedMilestoneBody.item.projectIds, ["project-robot-2026"]);
    assert.equal(
      updatedMilestoneBody.item.photoUrl,
      "https://cdn.example.test/forms/milestone-demo-v2.png",
    );

    resetLimits();

    const unknownProjectResponse = await app.inject({
      method: "POST",
      url: "/api/milestones",
      payload: {
        title: "Unknown Project Demo",
        type: "demo",
        startDateTime: "2026-05-15T18:00:00-04:00",
        endDateTime: null,
        isExternal: true,
        description: "",
        projectIds: ["missing-project"],
        photoUrl: "https://cdn.example.test/forms/invalid.png",
      },
    });
    assert.equal(unknownProjectResponse.statusCode, 400);

    resetLimits();

    const mobileTaskDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${mobileTaskCreatedBody.item.id}`,
    });

    assert.equal(mobileTaskDeleteResponse.statusCode, 200);
    assert.equal(mobileTaskDeleteResponse.json().item.id, mobileTaskCreatedBody.item.id);

    resetLimits();

    const scopedBootstrapAfterTaskDeleteResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?projectId=project-robot-2026",
    });

    assert.equal(scopedBootstrapAfterTaskDeleteResponse.statusCode, 200);
    const scopedBootstrapAfterTaskDeleteBody = scopedBootstrapAfterTaskDeleteResponse.json() as {
      actions?: Array<{
        entityId: string;
        entityType: string;
        operation: string;
      }>;
    };
    assert.ok(
      (scopedBootstrapAfterTaskDeleteBody.actions ?? []).some(
        (action) =>
          action.entityType === "task" &&
          action.entityId === mobileTaskCreatedBody.item.id &&
          action.operation === "delete",
      ),
    );

    resetLimits();

    const mobileSubsystemDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/subsystems/${mobileSubsystemCreatedBody.item.id}`,
    });

    assert.equal(mobileSubsystemDeleteResponse.statusCode, 200);
    assert.equal(
      mobileSubsystemDeleteResponse.json().item.id,
      mobileSubsystemCreatedBody.item.id,
    );

    resetLimits();

    const inferredTasksResponse = await app.inject({
      method: "GET",
      url: `/api/milestones/${createdMilestoneBody.item.id}/tasks`,
    });
    assert.equal(inferredTasksResponse.statusCode, 200);
    const inferredTasksBody = inferredTasksResponse.json() as {
      milestoneId: string;
      items: Array<{
        taskId: string;
        matchedRequirementIds: string[];
        isLegacyLink: boolean;
      }>;
    };
    assert.equal(inferredTasksBody.milestoneId, createdMilestoneBody.item.id);
    assert.ok(
      inferredTasksBody.items.some((item) => item.taskId === "swerve-sensor-bundle"),
    );

    resetLimits();

    const taskMilestonesResponse = await app.inject({
      method: "GET",
      url: "/api/tasks/swerve-sensor-bundle/milestones",
    });
    assert.equal(taskMilestonesResponse.statusCode, 200);
    const taskMilestonesBody = taskMilestonesResponse.json() as {
      taskId: string;
      items: Array<{ milestoneId: string; matchedRequirementIds: string[]; isLegacyLink: boolean }>;
    };
    assert.equal(taskMilestonesBody.taskId, "swerve-sensor-bundle");
    assert.ok(
      taskMilestonesBody.items.some((item) =>
        ["tutorial-robot-checkpoint-feb-21", createdMilestoneBody.item.id].includes(item.milestoneId),
      ),
    );
  });
});

test("task reassign preserves collaborators and removes stale owner assignees", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const taskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Assignment semantics task",
        summary: "Validates owner assignment list behavior.",
        subsystemIds: ["drive"],
        disciplineId: "design",
        mechanismIds: [],
        partInstanceIds: [],
        targetMilestoneId: null,
        ownerId: "ava",
        assigneeIds: ["ava", "demo-alex-morgan"],
        mentorId: "marco",
        dueDate: "2026-05-06",
        priority: "medium",
        status: "not-started",
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 0,
      },
    });

    assert.equal(taskCreateResponse.statusCode, 201);
    const taskCreateBody = taskCreateResponse.json() as {
      item: { id: string; assigneeIds: string[]; ownerId: string | null };
    };
    assert.equal(taskCreateBody.item.ownerId, "ava");
    assert.deepEqual(taskCreateBody.item.assigneeIds, ["ava", "demo-alex-morgan"]);

    resetLimits();

    const reassignResponse = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskCreateBody.item.id}/reassign`,
      payload: {
        ownerId: "demo-alex-morgan",
      },
    });

    assert.equal(reassignResponse.statusCode, 200);
    const reassignBody = reassignResponse.json() as {
      item: { assigneeIds: string[]; ownerId: string | null };
    };
    assert.equal(reassignBody.item.ownerId, "demo-alex-morgan");
    assert.deepEqual(reassignBody.item.assigneeIds, ["demo-alex-morgan"]);

    resetLimits();

    const unassignResponse = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskCreateBody.item.id}/reassign`,
      payload: {
        ownerId: null,
      },
    });

    assert.equal(unassignResponse.statusCode, 200);
    const unassignBody = unassignResponse.json() as {
      item: { assigneeIds: string[]; ownerId: string | null };
    };
    assert.equal(unassignBody.item.ownerId, null);
    assert.deepEqual(unassignBody.item.assigneeIds, []);
  });
});
