import assert from "node:assert/strict";
import { test } from "node:test";

import { resetUserPreferencesStoreForTests } from "../src/data/userPreferencesStore";
import { resetRequestLimits } from "../src/security/requestLimits";

function saveEnv(keys: string[]) {
  return new Map(keys.map((key) => [key, process.env[key]] as const));
}

function restoreEnv(saved: Map<string, string | undefined>) {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("buildApp exposes a development-only sign-in bypass", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "AUTH_JWT_SECRET",
    "GOOGLE_CLIENT_ID",
    "AUTH_EMAIL_SMTP_HOST",
    "AUTH_EMAIL_FROM",
    "AUTH_MEMBER_SUBTEAMS_BY_EMAIL",
    "API_RATE_LIMIT_MAX_REQUESTS",
    "API_RATE_LIMIT_WINDOW_SECONDS",
    "AUTH_RATE_LIMIT_MAX_REQUESTS",
    "AUTH_RATE_LIMIT_WINDOW_SECONDS",
    "AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS",
    "AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS",
  ]);

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.AUTH_JWT_SECRET = "replace-with-a-long-random-secret-123456";
    process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
    delete process.env.AUTH_EMAIL_SMTP_HOST;
    delete process.env.AUTH_EMAIL_FROM;
    process.env.AUTH_MEMBER_SUBTEAMS_BY_EMAIL =
      "dev.student@mecorobotics.org=scouting";
    process.env.API_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.API_RATE_LIMIT_WINDOW_SECONDS = "60";
    process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = "60";
    process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS = "60";

    const { buildApp } = await import("../src/app");
    const app = await buildApp();

    try {
      resetUserPreferencesStoreForTests();
      resetRequestLimits();

      const authConfigResponse = await app.inject({
        method: "GET",
        url: "/api/auth/config",
      });

      assert.equal(authConfigResponse.statusCode, 200);
      assert.deepEqual(authConfigResponse.json(), {
        enabled: true,
        googleClientId: "client-id.apps.googleusercontent.com",
        hostedDomain: "mecorobotics.org",
        emailEnabled: false,
        devBypassAvailable: true,
      });

      resetRequestLimits();

      const bypassResponse = await app.inject({
        method: "POST",
        url: "/api/auth/dev-bypass",
      });

      assert.equal(bypassResponse.statusCode, 200);
      const bypassBody = bypassResponse.json() as {
        token: string;
        user: {
          accountId: string;
          authProvider: string;
          email: string;
          hostedDomain: string;
          name: string;
          picture: string | null;
          role: string;
          taskSubteamIds: string[];
        };
      };

      assert.equal(bypassBody.user.accountId, "local-dev-student");
      assert.equal(bypassBody.user.authProvider, "email");
      assert.equal(bypassBody.user.email, "dev.student@mecorobotics.org");
      assert.equal(bypassBody.user.name, "Local Dev Student");
      assert.equal(bypassBody.user.hostedDomain, "mecorobotics.org");
      assert.equal(bypassBody.user.picture, null);
      assert.equal(bypassBody.user.role, "student");
      assert.deepEqual(bypassBody.user.taskSubteamIds, ["scouting"]);
      assert.ok(bypassBody.token.length > 0);

      resetRequestLimits();

      const mentorBypassResponse = await app.inject({
        method: "POST",
        url: "/api/auth/dev-bypass",
        payload: {
          role: "mentor",
        },
      });

      assert.equal(mentorBypassResponse.statusCode, 200);
      const mentorBypassBody = mentorBypassResponse.json() as {
        token: string;
        user: {
          accountId: string;
          email: string;
          name: string;
          role: string;
        };
      };
      assert.equal(mentorBypassBody.user.accountId, "local-dev-mentor");
      assert.equal(mentorBypassBody.user.email, "dev.mentor@mecorobotics.org");
      assert.equal(mentorBypassBody.user.name, "Local Dev Mentor");
      assert.equal(mentorBypassBody.user.role, "mentor");
      assert.ok(mentorBypassBody.token.length > 0);

      resetRequestLimits();

      const authMeResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(authMeResponse.statusCode, 200);
      const authMeBody = authMeResponse.json() as {
        enabled: boolean;
        user: {
          accountId: string;
          authProvider: string;
          email: string;
          hostedDomain: string;
          name: string;
          picture: string | null;
          role: string;
        } | null;
      };

      assert.equal(authMeBody.enabled, true);
      assert.deepEqual(authMeBody.user, bypassBody.user);

      resetRequestLimits();

      const defaultPreferencesResponse = await app.inject({
        method: "GET",
        url: "/api/users/me/preferences",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(defaultPreferencesResponse.statusCode, 200);
      assert.deepEqual(defaultPreferencesResponse.json(), {
        taskSubteamIds: [],
        themeMode: null,
      });

      resetRequestLimits();

      const updateThemeOnlyPreferencesResponse = await app.inject({
        method: "PATCH",
        url: "/api/users/me/preferences",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          themeMode: "dark",
        },
      });

      assert.equal(updateThemeOnlyPreferencesResponse.statusCode, 200);
      assert.deepEqual(updateThemeOnlyPreferencesResponse.json(), {
        taskSubteamIds: [],
        themeMode: "dark",
      });

      resetRequestLimits();

      const themeOnlyAuthMeResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(themeOnlyAuthMeResponse.statusCode, 200);
      const themeOnlyAuthMeBody = themeOnlyAuthMeResponse.json() as {
        user: {
          taskSubteamIds: string[];
        } | null;
      };
      assert.deepEqual(themeOnlyAuthMeBody.user?.taskSubteamIds, ["scouting"]);

      resetRequestLimits();

      const updatePreferencesResponse = await app.inject({
        method: "PATCH",
        url: "/api/users/me/preferences",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          taskSubteamIds: ["programming"],
          themeMode: "dark",
        },
      });

      assert.equal(updatePreferencesResponse.statusCode, 200);
      assert.deepEqual(updatePreferencesResponse.json(), {
        taskSubteamIds: ["programming"],
        themeMode: "dark",
      });

      resetRequestLimits();

      const savedPreferencesResponse = await app.inject({
        method: "GET",
        url: "/api/users/me/preferences",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(savedPreferencesResponse.statusCode, 200);
      assert.deepEqual(savedPreferencesResponse.json(), {
        taskSubteamIds: ["programming"],
        themeMode: "dark",
      });

      resetRequestLimits();

      const updatedAuthMeResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(updatedAuthMeResponse.statusCode, 200);
      const updatedAuthMeBody = updatedAuthMeResponse.json() as {
        user: {
          taskSubteamIds: string[];
        } | null;
      };
      assert.deepEqual(updatedAuthMeBody.user?.taskSubteamIds, ["programming"]);

      resetRequestLimits();

      const clearPreferencesResponse = await app.inject({
        method: "PATCH",
        url: "/api/users/me/preferences",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          taskSubteamIds: [],
          themeMode: "dark",
        },
      });

      assert.equal(clearPreferencesResponse.statusCode, 200);
      assert.deepEqual(clearPreferencesResponse.json(), {
        taskSubteamIds: [],
        themeMode: "dark",
      });

      resetRequestLimits();

      const clearedAuthMeResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(clearedAuthMeResponse.statusCode, 200);
      const clearedAuthMeBody = clearedAuthMeResponse.json() as {
        user: {
          taskSubteamIds: string[];
        } | null;
      };
      assert.deepEqual(clearedAuthMeBody.user?.taskSubteamIds, []);

      resetRequestLimits();

      const dashboardResponse = await app.inject({
        method: "GET",
        url: "/api/dashboard",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(dashboardResponse.statusCode, 200);

      resetRequestLimits();

      const studentTaskCreateResponse = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          title: "Student-created task",
          summary: "Students should not be allowed to create tasks.",
          subsystemId: "drive",
          disciplineId: "design",
          mechanismId: null,
          partInstanceId: null,
          targetMilestoneId: null,
          ownerId: "ava",
          mentorId: "riley",
          dueDate: "2026-05-06",
          priority: "medium",
          status: "not-started",
          dependencyIds: [],
          blockers: [],
          linkedManufacturingIds: [],
          linkedPurchaseIds: [],
          estimatedHours: 0,
          actualHours: 0,
        },
      });

      assert.equal(studentTaskCreateResponse.statusCode, 403);

      resetRequestLimits();

      const studentTaskEditResponse = await app.inject({
        method: "PATCH",
        url: "/api/tasks/swerve-sensor-bundle",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          title: "Student-edited task",
        },
      });

      assert.equal(studentTaskEditResponse.statusCode, 403);

      resetRequestLimits();

      const studentTaskDeleteResponse = await app.inject({
        method: "DELETE",
        url: "/api/tasks/swerve-sensor-bundle",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(studentTaskDeleteResponse.statusCode, 403);

      resetRequestLimits();

      const studentQaApprovalResponse = await app.inject({
        method: "POST",
        url: "/api/qa-reports",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          taskId: "swerve-sensor-bundle",
          participantIds: ["ava"],
          result: "pass",
          mentorApproved: true,
          notes: "Students should not be allowed to approve QA.",
          reviewedAt: "2026-05-06",
        },
      });

      assert.equal(studentQaApprovalResponse.statusCode, 403);

      resetRequestLimits();

      const studentMemberCreateResponse = await app.inject({
        method: "POST",
        url: "/api/members",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          email: "new.student@mecorobotics.org",
          name: "New Student",
          role: "student",
        },
      });

      assert.equal(studentMemberCreateResponse.statusCode, 403);

      resetRequestLimits();

      const studentMemberEditResponse = await app.inject({
        method: "PATCH",
        url: "/api/members/ava",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          name: "Student Edited Ava",
        },
      });

      assert.equal(studentMemberEditResponse.statusCode, 403);

      resetRequestLimits();

      const studentMemberDeleteResponse = await app.inject({
        method: "DELETE",
        url: "/api/members/ava",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(studentMemberDeleteResponse.statusCode, 403);

      resetRequestLimits();

      const studentMeetingCreateResponse = await app.inject({
        method: "POST",
        url: "/api/meetings",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          title: "Student meeting",
          date: "2026-05-07",
          time: "18:00",
        },
      });

      assert.equal(studentMeetingCreateResponse.statusCode, 403);

      resetRequestLimits();

      const studentMeetingEditResponse = await app.inject({
        method: "PATCH",
        url: "/api/meetings/design-review",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          title: "Student edited meeting",
        },
      });

      assert.equal(studentMeetingEditResponse.statusCode, 403);

      resetRequestLimits();

      const studentMeetingDeleteResponse = await app.inject({
        method: "DELETE",
        url: "/api/meetings/design-review",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(studentMeetingDeleteResponse.statusCode, 403);
    } finally {
      await app.close();
      resetRequestLimits();
    }
  } finally {
    restoreEnv(saved);
  }
});
