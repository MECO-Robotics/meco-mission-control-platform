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
  const { signSessionToken } = await import("../src/auth/authService");

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
      const { verifySessionToken } = await import("../src/auth/authService");
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
          name: "Sponsor Viewer",
          email: "viewer@sponsor.example",
          role: "external",
        },
      ],
    },
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
      const { createMember } = await import("../src/data/store");
      createMember({
        name: "Public Demo Global Audit Probe",
        email: "public-demo-audit-probe@mecorobotics.org",
        role: "student",
      });

      const demoResponse = await app.inject({
        method: "GET",
        url: "/api/bootstrap?seasonId=default-season",
      });

      assert.equal(demoResponse.statusCode, 200);
      const demoBody = demoResponse.json() as {
        actions: unknown[];
        attendanceRecords: Array<{ date: string }>;
        escalations: unknown[];
        meetings: Array<{ seasonId?: string; projectIds?: string[] }>;
        milestones: Array<{ seasonId?: string; projectIds: string[] }>;
        projects: Array<{ id: string; seasonId: string }>;
        qaRequests: Array<{ taskId: string | null }>;
        seasons: Array<{ id: string; startDate: string; endDate: string }>;
      };
      assert.equal(demoBody.seasons.every((season) => season.id === "default-season"), true);
      assert.ok(demoBody.projects.length > 0);
      assert.equal(
        demoBody.projects.every((project) => project.seasonId === "default-season"),
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
      assert.equal(demoBody.actions.length, 0);

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
        seasons: Array<{ id: string }>;
      };
      assert.equal(body.seasons.every((season) => season.id === "default-season"), true);
      assert.ok(body.escalations.length > 0);
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
      const { AuthError, verifySessionToken } = await import("../src/auth/authService");

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
      const { AuthError, verifySessionToken } = await import("../src/auth/authService");

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
