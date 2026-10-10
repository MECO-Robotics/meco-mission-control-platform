import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMemberInsights,
  parseDateValue,
} from "../src/routes/helpers/rosterInsightsMemberMetrics";
import { buildRosterInsights } from "../src/routes/helpers/rosterInsights";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { getSnapshot } from "../src/data/store";

test("parseDateValue rejects invalid calendar YYYY-MM-DD values", () => {
  const validDate = parseDateValue("2026-02-28");
  assert.ok(validDate);
  assert.equal(validDate?.toISOString(), "2026-02-28T00:00:00.000Z");
  assert.equal(
    parseDateValue("0099-12-31")?.toISOString(),
    "0099-12-31T00:00:00.000Z",
  );
  assert.equal(parseDateValue("2026-02-30"), null);
  assert.equal(parseDateValue("2026-13-01"), null);
});

test("buildMemberInsights includes same-day timestamps and excludes future attendance", () => {
  const today = new Date("2026-05-01T00:00:00Z");
  const tomorrow = new Date("2026-05-02T00:00:00Z");
  const members = buildMemberInsights({
    source: {
      members: [
        {
          id: "ava",
          name: "Ava",
          role: "student",
        },
      ],
      projects: [],
      tasks: [],
      attendanceRecords: [
        {
          id: "attendance-present",
          memberId: "ava",
          date: "2026-04-30",
          totalHours: 2,
        },
        {
          id: "attendance-same-day-timestamp",
          memberId: "ava",
          date: "2026-05-01T12:00:00Z",
          totalHours: 3,
        },
        {
          id: "attendance-future",
          memberId: "ava",
          date: "2026-05-03",
          totalHours: 5,
        },
      ],
    },
    openTasks: [],
    projectsById: new Map(),
    day7Start: new Date("2026-04-24T00:00:00Z"),
    day14Start: new Date("2026-04-17T00:00:00Z"),
    day30Start: new Date("2026-04-01T00:00:00Z"),
    today,
    attendanceUpperBound: tomorrow,
    dueSoonEnd: new Date("2026-05-08T00:00:00Z"),
  });

  assert.equal(members.length, 1);
  assert.equal(members[0].attendanceHoursLast7Days, 5);
  assert.equal(members[0].attendanceHoursLast14Days, 5);
  assert.equal(members[0].attendanceHoursLast30Days, 5);
  assert.equal(members[0].attendanceSessionsLast30Days, 2);
});

test("buildRosterInsights includes same-day timestamps and excludes future attendance", () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  const response = buildRosterInsights({
    members: [
      {
        id: "ava",
        name: "Ava",
        role: "student",
      },
    ],
    projects: [],
    tasks: [],
    attendanceRecords: [
      {
        id: "attendance-today",
        memberId: "ava",
        date: todayKey,
        totalHours: 2,
      },
      {
        id: "attendance-today-timestamp",
        memberId: "ava",
        date: `${todayKey}T12:00:00Z`,
        totalHours: 1.5,
      },
      {
        id: "attendance-future",
        memberId: "ava",
        date: tomorrowKey,
        totalHours: 5,
      },
    ],
  });

  assert.deepEqual(response.attendanceTimeline, [
    {
      date: todayKey,
      totalHours: 3.5,
      memberCount: 1,
    },
  ]);
  assert.deepEqual(
    response.recentAttendance.map((record) => record.id),
    ["attendance-today-timestamp", "attendance-today"],
  );
});

test("buildRosterInsights bases availability on planned weekly attendance", () => {
  const response = buildRosterInsights({
    members: [
      {
        id: "ava",
        name: "Ava",
        role: "student",
        plannedWeeklyAttendanceHours: 6,
        plannedAttendanceDays: ["monday", "wednesday"],
        plannedAttendanceNotes: "Expected for build nights.",
      },
      {
        id: "ben",
        name: "Ben",
        role: "student",
        plannedWeeklyAttendanceHours: 0,
        plannedAttendanceDays: [],
      },
    ],
    projects: [
      {
        id: "robot",
        name: "Robot",
      },
    ],
    tasks: [
      {
        id: "cad-layout",
        projectId: "robot",
        title: "CAD layout",
        ownerId: "ava",
        assigneeIds: [],
        dueDate: "2099-05-05",
        priority: "medium",
        status: "in-progress",
        estimatedHours: 3,
        actualHours: 0,
      },
      {
        id: "software-layout",
        projectId: "robot",
        title: "Software layout",
        ownerId: "ben",
        assigneeIds: [],
        dueDate: "2099-05-05",
        priority: "medium",
        status: "in-progress",
        estimatedHours: 3,
        actualHours: 0,
      },
    ],
    attendanceRecords: [],
  });

  const ava = response.members.find((member) => member.memberId === "ava");
  const ben = response.members.find((member) => member.memberId === "ben");

  assert.equal(ava?.availabilityStatus, "available");
  assert.equal(ava?.plannedWeeklyAttendanceHours, 6);
  assert.deepEqual(ava?.plannedAttendanceDays, ["monday", "wednesday"]);
  assert.equal(ava?.plannedAttendanceNotes, "Expected for build nights.");
  assert.equal(ben?.availabilityStatus, "unavailable");
  assert.equal(response.summary.plannedWeeklyAttendanceHours, 6);
  assert.equal(response.summary.noPlannedAttendanceWithTasksCount, 1);
});

test("QA reports, requests and TestResults use typed targets without duplicate scalar links", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const projectId = "project-robot-2026";
    const qaResponse = await app.inject({ method: "POST", url: "/api/qa-reports", payload: {
      reportType: "qa", projectId, targetRefs: [{ kind: "project", id: projectId }],
      createdByMemberId: "ava", participantIds: ["ava", "marco", "ava"], mentorId: null, requestedById: "ava",
      result: "minor-fix", summary: "QA review", notes: "QA report from web form", evidenceNotes: "Observed frame movement",
      createdAt: "2026-04-25T12:00:00Z", status: "submitted", reviewedById: null, reviewedAt: null,
      photoUrl: "https://cdn.example.test/forms/qa-report.png",
    } });
    assert.equal(qaResponse.statusCode, 201, qaResponse.body);
    const qa = qaResponse.json().item;
    assert.deepEqual(qa.targetRefs, [{ kind: "project", id: projectId }]);
    assert.equal("taskId" in qa, false);
    assert.equal(qa.participantIds.length, 2);

    resetLimits();
    const requestResponse = await app.inject({ method: "POST", url: "/api/qa-requests", payload: {
      projectId, targetRefs: [{ kind: "project", id: projectId }], subject: "Project QA", mentorId: null, requestedById: "ava",
    } });
    assert.equal(requestResponse.statusCode, 201, requestResponse.body);
    assert.equal("taskId" in requestResponse.json().item, false);
    assert.equal(requestResponse.json().item.mentorId, null);

    resetLimits();
    const testResponse = await app.inject({ method: "POST", url: "/api/test-results", payload: {
      projectId, targetRefs: [{ kind: "part-instance", id: "pi-swerve-encoder-bracket-front-left" }], title: "Bracket fit", status: "pass",
    } });
    assert.equal(testResponse.statusCode, 201, testResponse.body);
    assert.deepEqual(testResponse.json().item.targetRefs, [{ kind: "part-instance", id: "pi-swerve-encoder-bracket-front-left" }]);
    assert.equal("milestoneId" in testResponse.json().item, false);
    assert.equal("findings" in testResponse.json().item, false);
  });
});

test("web report and task planning contract endpoints persist records", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const reportCreateResponse = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        reportType: "qa",
        projectId: "project-robot-2026",
        targetRefs: [{ kind: "task", id: "swerve-sensor-bundle" }],
        createdByMemberId: "ava",
        participantIds: ["ava"],
        mentorId: null,
        requestedById: "ava",
        result: "minor-fix",
        summary: "QA report contract route",
        notes: "QA report contract route",
        photoUrl: "https://cdn.example.test/report.png",
        createdAt: "2026-04-26T12:00:00Z",
        status: "submitted",
        reviewedById: null,
        reviewedAt: null,
      },
    });

    assert.equal(reportCreateResponse.statusCode, 201);
    const reportBody = reportCreateResponse.json() as {
      item: {
        id: string;
        reportType: string;
        targetRefs: Array<{ kind: string; id: string }>;
      };
    };
    assert.equal(reportBody.item.reportType, "qa");
    assert.deepEqual(reportBody.item.targetRefs, [{ kind: "task", id: "swerve-sensor-bundle" }]);

    resetLimits();

    const unsupportedReportCreateResponse = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        reportType: "Practice",
        projectId: "project-robot-2026",
        targetRefs: [{ kind: "milestone", id: "drive-practice-apr-30" }],
        createdByMemberId: "ava",
        result: "pass",
        summary: "Unsupported report type",
        notes: "",
        createdAt: "2026-04-26",
      },
    });

    assert.equal(unsupportedReportCreateResponse.statusCode, 400);

    resetLimits();

    const findingCreateResponse = await app.inject({
      method: "POST",
      url: "/api/report-findings",
      payload: {
        reportId: reportBody.item.id,
        targetRefs: [{ kind: "part-instance", id: "pi-swerve-encoder-bracket-front-left" }],
        issueType: "Bracket needs edge cleanup",
        severity: "medium",
        notes: "Deburr the bracket before final install.",
        spawnedTaskId: null,
        spawnedIterationId: null,
        spawnedRiskId: null,
      },
    });

    assert.equal(findingCreateResponse.statusCode, 201);
    assert.equal(findingCreateResponse.json().item.reportId, reportBody.item.id);

    resetLimits();

    const dependencyCreateResponse = await app.inject({
      method: "POST",
      url: "/api/task-dependencies",
      payload: {
        taskId: "swerve-sensor-bundle",
        kind: "task",
        refId: "wire-swerve-module",
        requiredState: "complete",
        dependencyType: "hard",
      },
    });

    assert.equal(dependencyCreateResponse.statusCode, 201);
    const dependencyBody = dependencyCreateResponse.json() as {
      item: {
        id: string;
        dependencyType: string;
      };
    };
    assert.equal(dependencyBody.item.dependencyType, "hard");

    resetLimits();

    const dependencyUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/task-dependencies/${dependencyBody.item.id}`,
      payload: {
        dependencyType: "soft",
      },
    });

    assert.equal(dependencyUpdateResponse.statusCode, 200);
    assert.equal(dependencyUpdateResponse.json().item.dependencyType, "soft");

    resetLimits();

    const softDependencyCreateResponse = await app.inject({
      method: "POST",
      url: "/api/task-dependencies",
      payload: {
        taskId: "swerve-sensor-bundle",
        kind: "task",
        refId: "wire-swerve-module",
        requiredState: "complete",
        dependencyType: "soft",
      },
    });

    assert.equal(softDependencyCreateResponse.statusCode, 201);
    const softDependencyBody = softDependencyCreateResponse.json() as {
      item: {
        id: string;
      };
    };

    resetLimits();

    const taskDependenciesResponse = await app.inject({
      method: "GET",
      url: "/api/task-dependencies?pageSize=60",
    });
    assert.equal(taskDependenciesResponse.statusCode, 200);
    assert.ok(
      (taskDependenciesResponse.json() as { items: Array<{ id: string }> }).items.some(
        (dependency) => dependency.id === dependencyBody.item.id,
      ),
    );

    resetLimits();

    resetLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      qaFindings: Array<{ reportId?: string | null; testResultId?: string | null }>;
      testFindings: Array<{ reportId?: string | null; testResultId?: string | null }>;
      reports: Array<{ id: string }>;
      taskDependencies: Array<{
        taskId: string;
        kind: string;
        refId: string;
        dependencyType: string;
        id: string;
      }>;
    };
    assert.ok(bootstrapBody.reports.some((report) => report.id === reportBody.item.id));
    assert.ok(
      [...bootstrapBody.qaFindings, ...bootstrapBody.testFindings].some((finding) => finding.reportId === reportBody.item.id || finding.testResultId === reportBody.item.id),
    );
    assert.ok(
      bootstrapBody.taskDependencies.some(
        (dependency) =>
          dependency.id === dependencyBody.item.id &&
          dependency.dependencyType === "soft",
      ),
    );
    assert.ok(
      bootstrapBody.taskDependencies.some(
        (dependency) =>
          dependency.id === softDependencyBody.item.id &&
          dependency.dependencyType === "soft",
      ),
    );


    resetLimits();

    const dependencyDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/task-dependencies/${dependencyBody.item.id}`,
    });
    assert.equal(dependencyDeleteResponse.statusCode, 200);

    resetLimits();

    const softDependencyDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/task-dependencies/${softDependencyBody.item.id}`,
    });
    assert.equal(softDependencyDeleteResponse.statusCode, 200);

    resetLimits();

  });
});

test("risk endpoints support create, update, and delete with link validation", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const bootstrapResponse = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as { members: Array<{ id: string }> };
    const ownerMemberId = bootstrapBody.members[0]?.id ?? null;
    assert.ok(ownerMemberId);
    resetLimits();
    const qaReportsResponse = await app.inject({
      method: "GET",
      url: "/api/qa-reports",
    });

    assert.equal(qaReportsResponse.statusCode, 200);
    const qaReportsBody = qaReportsResponse.json() as {
      items: Array<{
        id: string;
      }>;
    };
    const sourceQaReportId = qaReportsBody.items[0]?.id ?? null;
    assert.ok(sourceQaReportId);

    resetLimits();

    const projectsResponse = await app.inject({
      method: "GET",
      url: "/api/projects",
    });

    assert.equal(projectsResponse.statusCode, 200);
    const projectsBody = projectsResponse.json() as {
      items: Array<{
        id: string;
      }>;
    };
    const attachmentProjectId = projectsBody.items[0]?.id ?? null;
    assert.ok(attachmentProjectId);

    resetLimits();

    const tasksResponse = await app.inject({
      method: "GET",
      url: "/api/tasks",
    });

    assert.equal(tasksResponse.statusCode, 200);
    const tasksBody = tasksResponse.json() as {
      items: Array<{
        id: string;
      }>;
    };
    const mitigationTaskId = tasksBody.items[0]?.id ?? null;
    assert.ok(mitigationTaskId);

    resetLimits();

    const createRiskResponse = await app.inject({
      method: "POST",
      url: "/api/risks",
      payload: {
        projectId: attachmentProjectId,
        title: "Cable routing delay risk",
        detail: "Awaiting updated harness path confirmation from controls.",
        category: "supply",
        severity: "medium",
        status: "open",
        blocksWork: true,
        source: { kind: "report", id: sourceQaReportId },
        relatedTargets: [{ kind: "project", id: attachmentProjectId }],
        mitigationTaskId,
        ownerMemberId,
        mitigationDueDate: "2026-10-20",
      },
    });

    assert.equal(createRiskResponse.statusCode, 201);
    const createdRiskBody = createRiskResponse.json() as {
      item: {
        relatedTargets: Array<{ kind: string; id: string }>;
        id: string;
        mitigationTaskId: string | null;
        ownerMemberId: string | null;
        mitigationDueDate: string | null;
        severity: string;
        source: { id?: string; kind: string };
        title: string;
      };
    };
    assert.equal(createdRiskBody.item.title, "Cable routing delay risk");
    assert.equal(createdRiskBody.item.source.kind, "report");
    assert.equal(createdRiskBody.item.source.id, sourceQaReportId);
    assert.deepEqual(createdRiskBody.item.relatedTargets, [{ kind: "project", id: attachmentProjectId }]);
    assert.equal(createdRiskBody.item.mitigationTaskId, mitigationTaskId);
    assert.equal(createdRiskBody.item.ownerMemberId, ownerMemberId);
    assert.equal(createdRiskBody.item.mitigationDueDate, "2026-10-20");

    resetLimits();

    const updateRiskResponse = await app.inject({
      method: "PATCH",
      url: `/api/risks/${createdRiskBody.item.id}`,
      payload: {
        severity: "high",
        mitigationTaskId: null,
        ownerMemberId: null,
        mitigationDueDate: null,
        status: "blocked",
      },
    });

    assert.equal(updateRiskResponse.statusCode, 200);
    const updatedRiskBody = updateRiskResponse.json() as {
      item: {
        mitigationTaskId: string | null;
        severity: string;
        ownerMemberId: string | null;
        mitigationDueDate: string | null;
        status: string;
      };
    };
    assert.equal(updatedRiskBody.item.severity, "high");
    assert.equal(updatedRiskBody.item.mitigationTaskId, null);
    assert.equal(updatedRiskBody.item.ownerMemberId, null);
    assert.equal(updatedRiskBody.item.mitigationDueDate, null);
    assert.equal(updatedRiskBody.item.status, "blocked");

    resetLimits();

    const invalidRiskResponse = await app.inject({
      method: "POST",
      url: "/api/risks",
      payload: {
        projectId: attachmentProjectId,
        title: "Missing linkage",
        detail: "Should fail because source is missing.",
        category: "qa",
        severity: "low",
        source: { kind: "report", id: "missing-qa-report" },
        relatedTargets: [{ kind: "project", id: attachmentProjectId }],
        mitigationTaskId: null,
      },
    });

    assert.equal(invalidRiskResponse.statusCode, 400);
    assert.equal(
      invalidRiskResponse.json().message,
      "The selected report source does not exist.",
    );

    resetLimits();

    const deleteRiskResponse = await app.inject({
      method: "DELETE",
      url: `/api/risks/${createdRiskBody.item.id}`,
    });

    assert.equal(deleteRiskResponse.statusCode, 200);
    assert.equal(deleteRiskResponse.json().item.id, createdRiskBody.item.id);

    resetLimits();

    const missingRiskResponse = await app.inject({
      method: "DELETE",
      url: `/api/risks/${createdRiskBody.item.id}`,
    });

    assert.equal(missingRiskResponse.statusCode, 404);
    assert.equal(missingRiskResponse.json().message, "Risk not found.");
  });
});

test("seeded list endpoints and auth fallbacks stay healthy on mock data", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const seasonsResponse = await app.inject({
      method: "GET",
      url: "/api/seasons?pageSize=60",
    });
    assert.equal(seasonsResponse.statusCode, 200);
    const seasonsBody = seasonsResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(seasonsBody.pagination.pageSize, 60);
    assert.ok(seasonsBody.items.some((season) => season.id === "default-season"));

    resetLimits();

    const membersResponse = await app.inject({
      method: "GET",
      url: "/api/members?pageSize=60",
    });
    assert.equal(membersResponse.statusCode, 200);
    const membersBody = membersResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(membersBody.pagination.pageSize, 60);
    assert.ok(membersBody.items.some((member) => member.id === "ava"));

    resetLimits();

    const materialsResponse = await app.inject({
      method: "GET",
      url: "/api/materials?pageSize=60",
    });
    assert.equal(materialsResponse.statusCode, 200);
    const materialsBody = materialsResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(materialsBody.pagination.pageSize, 60);
    assert.ok(materialsBody.items.some((material) => material.id === "mat-onyx-filament"));

    resetLimits();

    const partDefinitionsResponse = await app.inject({
      method: "GET",
      url: "/api/part-definitions?pageSize=60",
    });
    assert.equal(partDefinitionsResponse.statusCode, 200);
    const partDefinitionsBody = partDefinitionsResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(partDefinitionsBody.pagination.pageSize, 60);
    assert.ok(
      partDefinitionsBody.items.some((partDefinition) => partDefinition.id === "pd-swerve-encoder-bracket"),
    );

    resetLimits();

    const partInstancesResponse = await app.inject({
      method: "GET",
      url: "/api/part-instances?pageSize=60",
    });
    assert.equal(partInstancesResponse.statusCode, 200);
    const partInstancesBody = partInstancesResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(partInstancesBody.pagination.pageSize, 60);
    assert.ok(
      partInstancesBody.items.some((partInstance) => partInstance.id === "pi-swerve-encoder-bracket-front-left"),
    );

    resetLimits();

    const milestonesResponse = await app.inject({
      method: "GET",
      url: "/api/milestones?pageSize=60",
    });
    assert.equal(milestonesResponse.statusCode, 200);
    const milestonesBody = milestonesResponse.json() as {
      items: Array<{ id: string; title: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(milestonesBody.pagination.pageSize, 60);
    assert.ok(milestonesBody.items.some((milestone) => milestone.id === "tutorial-robot-checkpoint-feb-21"));

    resetLimits();

    const reportsResponse = await app.inject({
      method: "GET",
      url: "/api/reports?pageSize=60",
    });
    assert.equal(reportsResponse.statusCode, 200);
    const reportsBody = reportsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(reportsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(reportsBody.items));

    resetLimits();

    const reportFindingsResponse = await app.inject({
      method: "GET",
      url: "/api/report-findings?pageSize=60",
    });
    assert.equal(reportFindingsResponse.statusCode, 200);
    const reportFindingsBody = reportFindingsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(reportFindingsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(reportFindingsBody.items));

    resetLimits();

    const testResultsResponse = await app.inject({
      method: "GET",
      url: "/api/test-results?pageSize=60",
    });
    assert.equal(testResultsResponse.statusCode, 200);
    const testResultsBody = testResultsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(testResultsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(testResultsBody.items));

    resetLimits();

    const risksResponse = await app.inject({
      method: "GET",
      url: "/api/risks?pageSize=60",
    });
    assert.equal(risksResponse.statusCode, 200);
    const risksBody = risksResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(risksBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(risksBody.items));

    resetLimits();

    const iterationsResponse = await app.inject({
      method: "GET",
      url: "/api/iterations?pageSize=60",
    });
    assert.equal(iterationsResponse.statusCode, 200);
    const iterationsBody = iterationsResponse.json() as {
      items: Array<{ id: string; iteration: number }>;
      pagination: { pageSize: number };
    };
    assert.equal(iterationsBody.pagination.pageSize, 60);
    assert.ok(iterationsBody.items.length > 0);
    assert.ok(iterationsBody.items.some(({ id }) => id === "iteration-swerve-bracket-recheck"));

    resetLimits();

    const findingsResponse = await app.inject({
      method: "GET",
      url: "/api/findings?pageSize=60",
    });
    assert.equal(findingsResponse.statusCode, 200);
    const findingsBody = findingsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(findingsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(findingsBody.items));

    resetLimits();

    const taskTargetsResponse = await app.inject({
      method: "GET",
      url: "/api/task-targets?pageSize=60",
    });
    assert.equal(taskTargetsResponse.statusCode, 200);
    const taskTargetsBody = taskTargetsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(taskTargetsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(taskTargetsBody.items));

    resetLimits();

    const manufacturingResponse = await app.inject({
      method: "GET",
      url: "/api/manufacturing?pageSize=60",
    });
    assert.equal(manufacturingResponse.statusCode, 404);

    resetLimits();

    const purchasesResponse = await app.inject({
      method: "GET",
      url: "/api/purchases?pageSize=60",
    });
    assert.equal(purchasesResponse.statusCode, 200);
    const purchasesBody = purchasesResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(purchasesBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(purchasesBody.items));

    resetLimits();

    const meetingsResponse = await app.inject({
      method: "GET",
      url: "/api/meetings",
    });
    assert.equal(meetingsResponse.statusCode, 200);
    const meetingsBody = meetingsResponse.json() as {
      attendance: Array<{ id: string }>;
      meetings: Array<{ id: string }>;
      workLogs: Array<{ id: string }>;
    };
    assert.ok(meetingsBody.meetings.length > 0);
    assert.ok(meetingsBody.attendance.length > 0);
    assert.ok(meetingsBody.workLogs.length > 0);

    resetLimits();

    const meetingCreateResponse = await app.inject({
      method: "POST",
      url: "/api/meetings",
      payload: {
        title: "Route Test Build Night",
        meetingType: "build",
        startAt: "2026-05-08T18:00:00-04:00",
        endAt: "2026-05-08T20:30:00-04:00",
        location: "MECO shop",
        description: "Planned attendance input coverage.",
        projectIds: ["project-robot-2026"],
      },
    });
    assert.equal(meetingCreateResponse.statusCode, 201);
    const meetingCreateBody = meetingCreateResponse.json() as {
      item: {
        id: string;
        title: string;
        meetingType: string;
        startAt: string;
        endAt: string | null;
        location: string;
        description: string;
        projectIds: string[];
      };
    };
    assert.equal(meetingCreateBody.item.title, "Route Test Build Night");
    assert.equal(meetingCreateBody.item.meetingType, "build");
    assert.equal(meetingCreateBody.item.startAt, "2026-05-08T18:00:00-04:00");
    assert.equal(meetingCreateBody.item.endAt, "2026-05-08T20:30:00-04:00");
    assert.equal(meetingCreateBody.item.location, "MECO shop");
    assert.deepEqual(meetingCreateBody.item.projectIds, ["project-robot-2026"]);

    resetLimits();

    const meetingSeasonResponse = await app.inject({
      method: "POST",
      url: "/api/seasons",
      payload: {
        name: "Route Test 2027",
        type: "season",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      },
    });
    assert.equal(meetingSeasonResponse.statusCode, 201);
    const meetingSeasonBody = meetingSeasonResponse.json() as {
      item: { id: string };
    };

    resetLimits();
    const meetingProject = getSnapshot().projects.find((project) => project.seasonId === meetingSeasonBody.item.id && project.projectType === "robot");
    assert.ok(meetingProject);
    const meetingProjectBody = { item: { id: meetingProject.id } };

    resetLimits();

    const mismatchedMeetingCreateResponse = await app.inject({
      method: "POST",
      url: "/api/meetings",
      payload: {
        title: "Invalid cross-season meeting",
        seasonId: "default-season",
        startAt: "2026-05-08T18:00:00-04:00",
        projectIds: [meetingProjectBody.item.id],
      },
    });
    assert.equal(mismatchedMeetingCreateResponse.statusCode, 400);
    assert.match(
      mismatchedMeetingCreateResponse.json().message as string,
      /same season/i,
    );

    resetLimits();

    const mismatchedMeetingPatchResponse = await app.inject({
      method: "PATCH",
      url: `/api/meetings/${meetingCreateBody.item.id}`,
      payload: {
        seasonId: meetingSeasonBody.item.id,
      },
    });
    assert.equal(mismatchedMeetingPatchResponse.statusCode, 400);
    assert.match(
      mismatchedMeetingPatchResponse.json().message as string,
      /same season/i,
    );

    resetLimits();

    const meetingBootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?projectId=project-robot-2026",
    });
    assert.equal(meetingBootstrapResponse.statusCode, 200);
    const meetingBootstrapBody = meetingBootstrapResponse.json() as {
      meetings: Array<{ id: string; startAt: string; projectIds: string[] }>;
    };
    assert.ok(
      meetingBootstrapBody.meetings.some(
        (meeting) =>
          meeting.id === meetingCreateBody.item.id &&
          meeting.startAt === "2026-05-08T18:00:00-04:00" &&
          meeting.projectIds.includes("project-robot-2026"),
      ),
    );

    resetLimits();

    const meetingPatchResponse = await app.inject({
      method: "PATCH",
      url: `/api/meetings/${meetingCreateBody.item.id}`,
      payload: {
        location: "Practice field",
        projectIds: ["project-operations-2026"],
      },
    });
    assert.equal(meetingPatchResponse.statusCode, 200);
    assert.equal(meetingPatchResponse.json().item.location, "Practice field");
    assert.deepEqual(meetingPatchResponse.json().item.projectIds, ["project-operations-2026"]);

    resetLimits();

    const meetingDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/meetings/${meetingCreateBody.item.id}`,
    });
    assert.equal(meetingDeleteResponse.statusCode, 200);
    assert.equal(meetingDeleteResponse.json().item.id, meetingCreateBody.item.id);

    resetLimits();

    const rosterSummarySubsystemCreateResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        name: "Roster Insights Dedupe Subsystem",
        description: "Temporary subsystem for roster insights coverage.",
        parentSubsystemId: "drive",
        responsibleEngineerId: "ava",
        mentorIds: ["marco"],
      },
    });
    assert.equal(rosterSummarySubsystemCreateResponse.statusCode, 201);
    const rosterSummarySubsystemBody = rosterSummarySubsystemCreateResponse.json() as {
      item: {
        id: string;
      };
    };

    resetLimits();

    const rosterSummaryTaskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Roster summary dedupe task",
        summary: "Ensures roster summary task counts stay deduplicated.",
        projectId: "project-robot-2026",
        workTypeId: "robot:design",
        responsibleGroupId: null,
        requestedById: "ava",
        scheduleRefs: [],
        manufacturingDetails: null,
        subsystemIds: [rosterSummarySubsystemBody.item.id],
        mechanismIds: [],
        partInstanceIds: [],
        ownerId: "ava",
        assigneeIds: ["ava", "demo-alex-morgan"],
        mentorId: "marco",
        dueDate: "2026-04-01",
        priority: "high",
        status: "waiting-for-qa",
        estimatedHours: 2,
      },
    });
    assert.equal(rosterSummaryTaskCreateResponse.statusCode, 201);
    const rosterSummaryTaskBody = rosterSummaryTaskCreateResponse.json() as {
      item: {
        id: string;
      };
    };

    resetLimits();

    const rosterSummaryRiskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/risks",
      payload: {
        projectId: "project-robot-2026",
        title: "Scoped roster blocker",
        detail: "Scoped blocker for roster summary dedupe coverage.",
        category: "dependency",
        severity: "high",
        status: "open",
        blocksWork: true,
        source: { kind: "manual" },
        relatedTargets: [{ kind: "task", id: rosterSummaryTaskBody.item.id }],
      },
    });
    assert.equal(rosterSummaryRiskCreateResponse.statusCode, 201);

    resetLimits();

    const rosterInsightsResponse = await app.inject({
      method: "GET",
      url: "/api/roster/insights?seasonId=default-season&projectId=project-robot-2026",
    });
    assert.equal(rosterInsightsResponse.statusCode, 200);
    const rosterInsightsBody = rosterInsightsResponse.json() as {
      attendanceTimeline: Array<{ date: string; memberCount: number; totalHours: number }>;
      members: Array<{
        activeTaskCount: number;
        availabilityStatus: "available" | "at-risk" | "overloaded" | "unavailable";
        memberId: string;
      }>;
      recentAttendance: Array<{ activeTaskCount: number; id: string; memberId: string }>;
      summary: {
        attendanceHoursLast14Days: number;
        blockedTaskCount: number;
        memberCount: number;
        openTaskCount: number;
        overdueTaskCount: number;
        waitingForQaTaskCount: number;
      };
    };
    assert.ok(rosterInsightsBody.members.length > 0);
    assert.ok(
      rosterInsightsBody.members.some((member) =>
        ["available", "at-risk", "overloaded", "unavailable"].includes(
          member.availabilityStatus,
        ),
      ),
    );
    assert.equal(typeof rosterInsightsBody.summary.openTaskCount, "number");
    assert.equal(typeof rosterInsightsBody.summary.blockedTaskCount, "number");
    assert.equal(typeof rosterInsightsBody.summary.attendanceHoursLast14Days, "number");
    assert.ok(Array.isArray(rosterInsightsBody.recentAttendance));
    assert.ok(Array.isArray(rosterInsightsBody.attendanceTimeline));
    assert.ok(
      rosterInsightsBody.summary.blockedTaskCount <=
        rosterInsightsBody.summary.openTaskCount,
    );
    assert.ok(
      rosterInsightsBody.summary.waitingForQaTaskCount <=
        rosterInsightsBody.summary.openTaskCount,
    );
    assert.ok(
      rosterInsightsBody.summary.overdueTaskCount <=
        rosterInsightsBody.summary.openTaskCount,
    );
    const scopedMemberIds = new Set(
      rosterInsightsBody.members.map((member) => member.memberId),
    );
    assert.ok(
      rosterInsightsBody.recentAttendance.every((record) =>
        scopedMemberIds.has(record.memberId),
      ),
    );

    resetLimits();

    const qaResponse = await app.inject({
      method: "GET",
      url: "/api/qa-reports",
    });
    assert.equal(qaResponse.statusCode, 200);
    const qaBody = qaResponse.json() as { items: Array<{ reportType: string }> };
    assert.ok(Array.isArray(qaBody.items));
    assert.ok(qaBody.items.every((report) => report.reportType === "qa"));

    resetLimits();

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/api/metrics",
    });
    assert.equal(metricsResponse.statusCode, 200);
    const metricsBody = metricsResponse.json() as {
      attendanceHours: number;
      completionRate: number;
      mechanismMetrics: Array<unknown>;
      subsystemMetrics: Array<unknown>;
    };
    assert.equal(typeof metricsBody.completionRate, "number");
    assert.equal(typeof metricsBody.attendanceHours, "number");
    assert.ok(metricsBody.subsystemMetrics.length > 0);
    assert.ok(metricsBody.mechanismMetrics.length > 0);

    resetLimits();

    const googleAuthResponse = await app.inject({
      method: "POST",
      url: "/api/auth/web/google",
      payload: {
        credential: "mock-google-credential",
      },
    });
    assert.equal(googleAuthResponse.statusCode, 503);
    assert.equal(
      googleAuthResponse.json().message,
      "Google sign-in is not configured on the server yet.",
    );

    resetLimits();

    const emailStartResponse = await app.inject({
      method: "POST",
      url: "/api/auth/email/start",
      payload: {
        email: "tester@mecorobotics.org",
      },
    });
    assert.equal(emailStartResponse.statusCode, 503);
    assert.equal(
      emailStartResponse.json().message,
      "Email sign-in is not configured on the server yet.",
    );

    resetLimits();

    const emailVerifyResponse = await app.inject({
      method: "POST",
      url: "/api/auth/web/email/verify",
      payload: {
        email: "tester@mecorobotics.org",
        code: "123456",
      },
    });
    assert.equal(emailVerifyResponse.statusCode, 503);
    assert.equal(
      emailVerifyResponse.json().message,
      "Email sign-in is not configured on the server yet.",
    );
  });
});

test("report derivations retain bootstrap scope and photo policy", async () => {
  const { snapshot: seed } = await import("../src/data/mockData");
  const { buildReports } = await import("../src/data/store/reportDerivations");
  const { buildBootstrapResponse } = await import("../src/routes/helpers/bootstrapSelection");
  const snapshot = structuredClone(seed);
  const task = snapshot.tasks[0]!;
  const qaReport = snapshot.qaReports[0]!;
  snapshot.qaReports = [{ ...qaReport, id: "photo-qa", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], photoUrl: "https://example.test/qa.png" }];
  snapshot.teamReports = [{ id: "photo-test", reportType: "practice", projectId: task.projectId, targetRefs: [{ kind: "task", id: task.id }], createdByMemberId: null, participantIds: [], mentorId: null, requestedById: null, summary: "Practice", notes: "Practice notes", createdAt: "2026-04-22T12:00:00Z", status: "submitted", result: "Complete", photoUrl: "https://example.test/test.png" }];
  snapshot.qaFindings = [{ ...snapshot.qaFindings[0]!, id: "qa-finding", reportId: "photo-qa", status: "in-progress" }];
  snapshot.testFindings = [{ ...snapshot.testFindings[0]!, id: "test-finding", reportId: "photo-test", status: "resolved" }];
  const reports = buildReports(snapshot);
  const bootstrap = buildBootstrapResponse(snapshot, { projectId: task.projectId, seasonId: null, personId: null });
  assert.equal(reports.find((report) => report.id === "photo-test")!.projectId, task.projectId);
  assert.equal(bootstrap.reports.find((report) => report.id === "photo-test")!.projectId, task.projectId);
  for (const report of reports) {
    const { photoUrl, ...withoutPhoto } = report;
    assert.ok(photoUrl);
    assert.deepEqual(bootstrap.reports.find((item) => item.id === report.id), { ...withoutPhoto, projectId: task.projectId });
  }
    assert.deepEqual(bootstrap.qaFindings.map((finding) => [finding.id, finding.status]), [["qa-finding", "in-progress"]]);
  assert.deepEqual(bootstrap.testFindings.map((finding) => [finding.id, finding.status]), [["test-finding", "resolved"]]);
  snapshot.qaReports[0]!.projectId = "missing-project";
  snapshot.teamReports = [];
  const orphanBootstrap = buildBootstrapResponse(snapshot, { projectId: null, seasonId: null, personId: null });
  assert.deepEqual(orphanBootstrap.reports, []);
  assert.deepEqual(orphanBootstrap.qaFindings.map((finding) => finding.id), ["qa-finding"]);
  assert.deepEqual(orphanBootstrap.testFindings.map((finding) => finding.id), ["test-finding"]);
});

test("report and finding endpoints match bootstrap projections", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(bootstrap.statusCode, 200);
    for (const [path, collection] of [["reports", "reports"], ["report-findings", "findings"]] as const) {
      resetLimits();
      const response = await app.inject({ method: "GET", url: `/api/${path}?pageSize=60` });
      assert.equal(response.statusCode, 200);
      const bootstrapBody = bootstrap.json();
      const expected = collection === "findings" ? [...bootstrapBody.qaFindings, ...bootstrapBody.testFindings] : bootstrapBody[collection];
      const actual = response.json().items;
      assert.equal(actual.length, expected.length);
      for (const item of actual) {
        const matching = expected.find((entry: { id: string }) => entry.id === item.id);
        assert.ok(matching);
        if (collection === "findings") {
          assert.deepEqual(item.targetRefs, matching.targetRefs);
          assert.equal(item.taskId, matching.taskId);
          assert.equal(item.projectId, matching.projectId);
        } else {
          assert.deepEqual(item, matching);
        }
      }
    }
  });
});
