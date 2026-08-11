import assert from "node:assert/strict";
import { test } from "node:test";

import jwt from "jsonwebtoken";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import type { MemberRole } from "../src/domain/types";

const authEnv = {
  AUTH_JWT_SECRET: "test-authz-session-guards-secret-123456",
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  AUTH_MENTOR_EMAILS: "mentor@mecorobotics.org",
} as const;

async function signTestToken(args: {
  email: string;
  role: MemberRole;
  hostedDomain?: string;
  accountId?: string;
}) {
  const { signSessionToken } = require("../src/auth/authService") as typeof import("../src/auth/authService");

  return signSessionToken({
    accountId: args.accountId ?? args.email,
    authProvider: "google",
    email: args.email,
    hostedDomain: args.hostedDomain ?? "mecorobotics.org",
    name: args.email,
    picture: null,
    role: args.role,
    taskSubteamIds: [],
  });
}

test("external roster sessions cannot access broad platform API routes", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const externalToken = await signTestToken({
        email: "viewer@sponsor.example",
        role: "external",
        hostedDomain: "sponsor.example",
      });
      const { verifySessionToken } = require("../src/auth/authService") as typeof import("../src/auth/authService");
      const externalSession = verifySessionToken(externalToken);

      assert.equal(externalSession.role, "external");

      const dashboardResponse = await app.inject({
        method: "GET",
        url: "/api/dashboard",
        headers: {
          authorization: `Bearer ${externalToken}`,
        },
      });

      assert.equal(dashboardResponse.statusCode, 403);
      assert.match(dashboardResponse.json().message, /external roster/i);
    },
    {
      env: authEnv,
      members: [
        {
          name: "Security Test Lead",
          email: "lead@mecorobotics.org",
          role: "lead",
        },
        {
          name: "Sponsor Viewer",
          email: "viewer@sponsor.example",
          role: "external",
        },
      ],
    },
  );
});

test("leads cannot elevate roster roles while admins can perform legitimate role changes", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const leadToken = await signTestToken({
        email: "lead@mecorobotics.org",
        role: "lead",
      });
      const adminToken = await signTestToken({
        email: "admin@mecorobotics.org",
        role: "admin",
      });

      const denied = await app.inject({
        method: "PATCH",
        url: "/api/members/priya",
        headers: { authorization: `Bearer ${leadToken}` },
        payload: { role: "admin" },
      });
      assert.equal(denied.statusCode, 403);

      resetLimits();

      const createDenied = await app.inject({
        method: "POST",
        url: "/api/members",
        headers: { authorization: `Bearer ${leadToken}` },
        payload: {
          name: "Unauthorized Admin",
          email: "unauthorized-admin@mecorobotics.org",
          role: "admin",
        },
      });
      assert.equal(createDenied.statusCode, 403);

      resetLimits();

      const allowed = await app.inject({
        method: "PATCH",
        url: "/api/members/priya",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "mentor" },
      });
      assert.equal(allowed.statusCode, 200);
      assert.equal(allowed.json().item.role, "mentor");
    },
    {
      env: authEnv,
      members: [
        {
          name: "Security Test Admin",
          email: "admin@mecorobotics.org",
          role: "admin",
        },
      ],
    },
  );
});

test("generic QA reports cannot bypass mentor approval authorization", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const studentToken = await signTestToken({
        email: "student@mecorobotics.org",
        role: "student",
      });
      const mentorToken = await signTestToken({
        email: "mentor@mecorobotics.org",
        role: "mentor",
      });
      const payload = {
        reportType: "QA",
        projectId: "default-season-robot",
        taskId: "swerve-sensor-bundle",
        milestoneId: null,
        workstreamId: null,
        createdByMemberId: "priya",
        result: "pass",
        summary: "Security regression",
        notes: "Approval must be server-authorized.",
        photoUrl: "",
        createdAt: "2026-08-11T12:00:00.000Z",
        participantIds: ["priya"],
        mentorApproved: true,
        reviewedAt: "2026-08-11",
      };

      const denied = await app.inject({
        method: "POST",
        url: "/api/reports",
        headers: { authorization: `Bearer ${studentToken}` },
        payload,
      });
      assert.equal(denied.statusCode, 403);

      resetLimits();

      const allowed = await app.inject({
        method: "POST",
        url: "/api/reports",
        headers: { authorization: `Bearer ${mentorToken}` },
        payload,
      });
      assert.equal(allowed.statusCode, 201);
      assert.equal(allowed.json().item.mentorApproved, true);
    },
    { env: authEnv },
  );
});

test("student sessions cannot reset global tutorial state", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const studentToken = await signTestToken({
        email: "student@mecorobotics.org",
        role: "student",
      });
      const mentorToken = await signTestToken({
        email: "mentor@mecorobotics.org",
        role: "mentor",
      });

      const startResponse = await app.inject({
        method: "POST",
        url: "/api/tutorial/session/start",
        headers: {
          authorization: `Bearer ${studentToken}`,
        },
      });

      assert.equal(startResponse.statusCode, 403);

      resetLimits();

      const baselineResetResponse = await app.inject({
        method: "POST",
        url: "/api/tutorial/session/reset",
        headers: {
          authorization: `Bearer ${studentToken}`,
        },
        payload: {
          mode: "baseline",
        },
      });

      assert.equal(baselineResetResponse.statusCode, 403);

      resetLimits();

      const mentorStartResponse = await app.inject({
        method: "POST",
        url: "/api/tutorial/session/start",
        headers: {
          authorization: `Bearer ${mentorToken}`,
        },
      });

      assert.equal(mentorStartResponse.statusCode, 200);
    },
    { env: authEnv },
  );
});

test("unsigned users can read only the demo season bootstrap", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const { createMember, createTaskBlocker } = await import("../src/data/store");
      const publicProbeMember = createMember({
        name: "Public Demo Global Audit Probe",
        email: "public-demo-audit-probe@mecorobotics.org",
        photoUrl: "https://example.test/public-demo-audit-probe.png",
        role: "admin",
        plannedWeeklyAttendanceHours: 4,
        plannedAttendanceDays: ["monday"],
        plannedAttendanceNotes: "Private public demo probe availability.",
      });
      const staleReferenceMember = createMember({
        name: "Public Demo Stale Member Reference",
        email: "public-demo-stale-member-reference@mecorobotics.org",
        role: "mentor",
        seasonId: "season-2030",
        activeSeasonIds: ["season-2030"],
      });
      const staleReferenceBlocker = createTaskBlocker({
        blockedTaskId: "swerve-sensor-bundle",
        blockerType: "external",
        blockerId: null,
        description: "Public demo stale member reference blocker.",
        severity: "medium",
        createdByMemberId: staleReferenceMember.id,
      });

      const demoResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap?seasonId=default-season",
      });

      assert.equal(demoResponse.statusCode, 200);
      const demoBody = demoResponse.json() as {
        actions: unknown[];
        attendanceRecords: Array<{ date: string; memberId: string }>;
        escalations: unknown[];
        meetings: Array<{ seasonId?: string; projectIds?: string[] }>;
        members: Array<Record<string, unknown>>;
        milestones: Array<{ seasonId?: string; projectIds: string[] }>;
        manufacturingItems: Array<{ requestedById: string | null }>;
        projects: Array<{ id: string; seasonId: string }>;
        purchaseItems: Array<{ requestedById: string | null }>;
        qaReports: Array<{ participantIds: string[] }>;
        qaRequests: Array<{ mentorId: string; requestedById: string | null; taskId: string | null }>;
        qaReviews: Array<{ participantIds: string[] }>;
        reports: Array<{ createdByMemberId: string | null; participantIds?: string[] }>;
        seasons: Array<{ id: string; startDate: string; endDate: string }>;
        subsystems: Array<{ mentorIds: string[]; responsibleEngineerId: string | null }>;
        taskBlockers: Array<{ createdByMemberId: string | null; description: string }>;
        tasks: Array<{ assigneeIds: string[]; mentorId: string | null; ownerId: string | null }>;
        workLogs: Array<{ participantIds: string[] }>;
      };
      assert.equal(demoBody.seasons.every((season) => season.id === "default-season"), true);
      assert.ok(demoBody.projects.length > 0);
      assert.equal(
        demoBody.projects.every((project) => project.seasonId === "default-season"),
        true,
      );
      const demoMemberIds = new Set(demoBody.members.map((member) => String(member.id)));
      assert.equal(demoMemberIds.has(publicProbeMember.id), false);
      assert.equal(
        demoBody.members.every((member) => /^demo-member-\d+$/.test(String(member.id))),
        true,
      );
      assert.equal(
        demoBody.members.some((member) => String(member.id).includes("public-demo-global-audit-probe")),
        false,
      );
      assert.equal(
        demoBody.members.every((member) => /^Demo Member \d+$/.test(String(member.name))),
        true,
      );
      assert.equal(
        demoBody.members.some((member) => member.name === publicProbeMember.name),
        false,
      );
      assert.equal(
        demoBody.members.every(
          (member) =>
            !("email" in member) &&
            !("role" in member) &&
            !("elevated" in member) &&
            !("photoUrl" in member) &&
            !("plannedWeeklyAttendanceHours" in member) &&
            !("plannedAttendanceDays" in member) &&
            !("plannedAttendanceNotes" in member),
        ),
        true,
      );
      assert.equal(demoBody.escalations.length, 0);
      const demoSeason = demoBody.seasons[0];
      assert.ok(demoSeason);
      assert.equal(
        demoBody.attendanceRecords.every(
          (record) =>
            record.date >= demoSeason.startDate &&
            record.date <= demoSeason.endDate,
        ),
        true,
      );
      const demoProjectIds = new Set(demoBody.projects.map((project) => project.id));
      assert.equal(
        demoBody.milestones.every(
          (milestone) =>
            milestone.seasonId === "default-season" ||
            milestone.projectIds.some((projectId) => demoProjectIds.has(projectId)),
        ),
        true,
      );
      assert.equal(
        demoBody.meetings.every(
          (meeting) =>
            meeting.seasonId === "default-season" ||
            (meeting.projectIds ?? []).some((projectId) => demoProjectIds.has(projectId)),
        ),
        true,
      );
      assert.equal(demoBody.qaRequests.every((request) => request.taskId !== null), true);
      const sanitizedStaleReferenceBlocker = demoBody.taskBlockers.find(
        (blocker) => blocker.description === staleReferenceBlocker.description,
      );
      assert.ok(sanitizedStaleReferenceBlocker);
      assert.equal(sanitizedStaleReferenceBlocker.createdByMemberId, null);
      const memberReferences = [
        ...demoBody.subsystems.flatMap((subsystem) => [
          subsystem.responsibleEngineerId,
          ...subsystem.mentorIds,
        ]),
        ...demoBody.reports.flatMap((report) => [
          report.createdByMemberId,
          ...(report.participantIds ?? []),
        ]),
        ...demoBody.tasks.flatMap((task) => [task.ownerId, task.mentorId, ...task.assigneeIds]),
        ...demoBody.taskBlockers.map((blocker) => blocker.createdByMemberId),
        ...demoBody.workLogs.flatMap((workLog) => workLog.participantIds),
        ...demoBody.attendanceRecords.map((record) => record.memberId),
        ...demoBody.manufacturingItems.map((item) => item.requestedById),
        ...demoBody.purchaseItems.map((item) => item.requestedById),
        ...demoBody.qaReports.flatMap((report) => report.participantIds),
        ...demoBody.qaRequests.flatMap((request) => [request.mentorId, request.requestedById]),
        ...demoBody.qaReviews.flatMap((review) => review.participantIds),
      ].filter((memberId): memberId is string => typeof memberId === "string" && memberId.length > 0);
      assert.ok(memberReferences.length > 0);
      assert.equal(memberReferences.every((memberId) => demoMemberIds.has(memberId)), true);
      assert.equal(memberReferences.includes(publicProbeMember.id), false);
      assert.equal(memberReferences.includes(staleReferenceMember.id), false);
      assert.equal(demoBody.actions.length, 0);

      resetLimits();

      const personScopedDemoResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap?seasonId=default-season&personId=marco",
      });

      assert.equal(personScopedDemoResponse.statusCode, 401);

      resetLimits();

      const invalidTokenDemoResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap?seasonId=default-season",
        headers: {
          authorization: "Bearer invalid",
        },
      });

      assert.equal(invalidTokenDemoResponse.statusCode, 200);
      assert.deepEqual(
        (invalidTokenDemoResponse.json() as { actions: unknown[] }).actions,
        [],
      );

      resetLimits();

      const invalidTokenPersonScopedDemoResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap?seasonId=default-season&personId=marco",
        headers: {
          authorization: "Bearer invalid",
        },
      });

      assert.equal(invalidTokenPersonScopedDemoResponse.statusCode, 401);

      resetLimits();

      const broadResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap",
      });

      assert.equal(broadResponse.statusCode, 401);

      resetLimits();

      const otherSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap?seasonId=season-2030",
      });

      assert.equal(otherSeasonResponse.statusCode, 401);

      resetLimits();

      const duplicateSeasonResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap?seasonId=default-season&seasonId=season-2030",
      });

      assert.equal(duplicateSeasonResponse.statusCode, 401);
    },
    { env: authEnv },
  );
});

test("authenticated season bootstrap preserves escalations", async () => {
  await withIntegrationApp(
    async ({ app }) => {
      const { createMember } = await import("../src/data/store");
      const authenticatedProbeMember = createMember({
        name: "Authenticated Bootstrap Probe",
        email: "authenticated-bootstrap-probe@mecorobotics.org",
        photoUrl: "https://example.test/authenticated-bootstrap-probe.png",
        role: "admin",
        plannedAttendanceNotes: "Private authenticated availability.",
      });
      const mentorToken = await signTestToken({
        email: "mentor@mecorobotics.org",
        role: "mentor",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/bootstrap?seasonId=default-season",
        headers: {
          authorization: `Bearer ${mentorToken}`,
        },
      });

      assert.equal(response.statusCode, 200);
      const body = response.json() as {
        escalations: unknown[];
        members: Array<Record<string, unknown>>;
        seasons: Array<{ id: string }>;
      };
      assert.equal(body.seasons.every((season) => season.id === "default-season"), true);
      assert.ok(body.escalations.length > 0);
      const authenticatedProbeRecord = body.members.find(
        (member) => member.id === authenticatedProbeMember.id,
      );
      assert.ok(authenticatedProbeRecord);
      assert.equal(authenticatedProbeRecord.name, authenticatedProbeMember.name);
      assert.equal(authenticatedProbeRecord.email, authenticatedProbeMember.email);
      assert.equal(authenticatedProbeRecord.role, "admin");
      assert.equal(authenticatedProbeRecord.elevated, true);
      assert.equal(
        authenticatedProbeRecord.plannedAttendanceNotes,
        authenticatedProbeMember.plannedAttendanceNotes,
      );
    },
    { env: authEnv },
  );
});

test("student sessions cannot delete task or subsystem workflow records", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const { createSubsystem } = await import("../src/data/store");
      const removableSubsystem = createSubsystem({
        name: "Security Authz Removable",
        projectId: "reefscape",
        description: "Temporary non-core subsystem for authorization regression coverage.",
        mentorIds: [],
        risks: [],
        parentSubsystemId: null,
        responsibleEngineerId: null,
      });

      const studentToken = await signTestToken({
        email: "student@mecorobotics.org",
        role: "student",
      });
      const taskDeleteResponse = await app.inject({
        method: "DELETE",
        url: "/api/tasks/swerve-sensor-bundle",
        headers: {
          authorization: `Bearer ${studentToken}`,
        },
      });

      assert.equal(taskDeleteResponse.statusCode, 403);

      resetLimits();

      const subsystemDeleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/subsystems/${removableSubsystem.id}`,
        headers: {
          authorization: `Bearer ${studentToken}`,
        },
      });

      assert.equal(subsystemDeleteResponse.statusCode, 403);
    },
    { env: authEnv },
  );
});

test("google sessions for hosted-domain emails require the hosted-domain claim", async () => {
  await withIntegrationApp(
    async () => {
      const forgedHostedDomainToken = await signTestToken({
        email: "student@mecorobotics.org",
        role: "student",
        hostedDomain: "gmail.com",
      });
      const { AuthError, verifySessionToken } = require("../src/auth/authService") as typeof import("../src/auth/authService");

      assert.throws(
        () => verifySessionToken(forgedHostedDomainToken),
        (error) => {
          assert.ok(error instanceof AuthError);
          assert.equal(error.statusCode, 403);
          assert.match(error.message, /hosted domain/i);
          return true;
        },
      );
    },
    { env: authEnv },
  );
});

test("legacy google sessions without hosted-domain proof are rejected", async () => {
  await withIntegrationApp(
    async () => {
      const legacyToken = jwt.sign(
        {
          email: "student@mecorobotics.org",
          hd: "mecorobotics.org",
          name: "student@mecorobotics.org",
          provider: "google",
          role: "student",
        },
        authEnv.AUTH_JWT_SECRET,
        {
          algorithm: "HS256",
          audience: "meco-apps",
          expiresIn: "12h",
          issuer: "meco-platform",
          subject: "student@mecorobotics.org",
        },
      );
      const { AuthError, verifySessionToken } = require("../src/auth/authService") as typeof import("../src/auth/authService");

      assert.throws(
        () => verifySessionToken(legacyToken),
        (error) => {
          assert.ok(error instanceof AuthError);
          assert.equal(error.statusCode, 403);
          assert.match(error.message, /hosted domain/i);
          return true;
        },
      );
    },
    { env: authEnv },
  );
});
