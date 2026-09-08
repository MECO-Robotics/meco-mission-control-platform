import { testMobileSessionStore } from "./helpers/sessionAuth";
import { MemoryWebSessionStore, readWebSessionCookie } from "./helpers/webSessionMemoryStore";
import { issueTestMobileToken } from "./helpers/sessionAuth";
import { saveEnv, restoreEnv } from "./helpers/environment";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createMember } from "../src/data/store";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetRequestLimits } from "../src/security/requestLimits";

test("buildApp exposes a development-only sign-in bypass", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meco-preferences-"));
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
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

    const app = await buildApp({ userPreferencesPath: join(directory, "preferences.json"), mobileSessionStore: testMobileSessionStore, webSessionStore: new MemoryWebSessionStore() });

    try {
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
        url: "/api/auth/web/dev-bypass",
      });

      assert.equal(bypassResponse.statusCode, 200);
      const bypassBody = bypassResponse.json() as {
        csrfToken: string;
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
      assert.ok(bypassBody.csrfToken.length > 0);

      resetRequestLimits();

      const roleBypassResponse = await app.inject({
        method: "POST",
        url: "/api/auth/web/dev-bypass",
        payload: {
          role: "mentor",
        },
      });

      assert.equal(roleBypassResponse.statusCode, 200);
      const roleBypassBody = roleBypassResponse.json() as {
        csrfToken: string;
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
      assert.equal(roleBypassBody.user.accountId, "local-dev-mentor");
      assert.equal(roleBypassBody.user.authProvider, "email");
      assert.equal(roleBypassBody.user.email, "dev.mentor@mecorobotics.org");
      assert.equal(roleBypassBody.user.name, "Local Dev Mentor");
      assert.equal(roleBypassBody.user.hostedDomain, "mecorobotics.org");
      assert.equal(roleBypassBody.user.picture, null);
      assert.equal(roleBypassBody.user.role, "mentor");
      assert.deepEqual(roleBypassBody.user.taskSubteamIds, []);
      assert.ok(roleBypassBody.csrfToken.length > 0);

      resetRequestLimits();

      const authMeResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
      });

      assert.equal(dashboardResponse.statusCode, 200);

      resetRequestLimits();

      const studentTaskCreateResponse = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
      });

      assert.equal(studentTaskDeleteResponse.statusCode, 403);

      resetRequestLimits();

      const mentorToken = await issueTestMobileToken({
        accountId: "local-dev-mentor",
        authProvider: "email",
        email: "mentor@mecorobotics.org",
        hostedDomain: "mecorobotics.org",
        name: "Mentor Test",
        picture: null,
        role: "mentor",
        taskSubteamIds: [],
      });

      const claimableTaskPayload = {
        title: "Claimable student task",
        summary: "Students can claim this task from mobile.",
        subsystemId: "drive",
        disciplineId: "design",
        mechanismId: null,
        partInstanceId: null,
        targetMilestoneId: null,
        ownerId: null,
        mentorId: "riley",
        dueDate: "2026-05-06",
        priority: "medium",
        status: "not-started",
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 0,
        actualHours: 0,
      };
      const claimableTaskResponse = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: {
          authorization: `Bearer ${mentorToken}`,
        },
        payload: claimableTaskPayload,
      });

      assert.equal(claimableTaskResponse.statusCode, 201);
      const claimableTask = claimableTaskResponse.json() as { item: { id: string; ownerId: string | null } };
      assert.equal(claimableTask.item.ownerId, null);

      resetRequestLimits();

      const nonRosterClaimResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${claimableTask.item.id}/claim`,
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
        payload: {},
      });

      assert.equal(nonRosterClaimResponse.statusCode, 403);

      const localDevStudent = createMember({
        name: "Local Dev Student",
        email: "dev.student@mecorobotics.org",
        role: "student",
      });
      assert.equal(localDevStudent.id, "local-dev-student");

      const spoofedNameToken = await issueTestMobileToken({
        accountId: "not-local-dev-student",
        authProvider: "email",
        email: "display-name-spoof@mecorobotics.org",
        hostedDomain: "mecorobotics.org",
        name: "Local Dev Student",
        picture: null,
        role: "student",
        taskSubteamIds: [],
      });

      resetRequestLimits();

      const spoofedNameClaimResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${claimableTask.item.id}/claim`,
        headers: {
          authorization: `Bearer ${spoofedNameToken}`,
        },
        payload: {},
      });

      assert.equal(spoofedNameClaimResponse.statusCode, 403);

      resetRequestLimits();

      const claimResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${claimableTask.item.id}/claim`,
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
        payload: {},
      });

      assert.equal(claimResponse.statusCode, 200);
      assert.equal(
        (claimResponse.json() as { item: { ownerId: string } }).item.ownerId,
        "local-dev-student",
      );

      resetRequestLimits();

      const releaseResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${claimableTask.item.id}/release`,
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
      });

      assert.equal(releaseResponse.statusCode, 200);
      assert.equal((releaseResponse.json() as { item: { ownerId: string | null } }).item.ownerId, null);

      resetRequestLimits();

      const startClaimTaskResponse = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: {
          authorization: `Bearer ${mentorToken}`,
        },
        payload: {
          ...claimableTaskPayload,
          title: "Start claim student task",
        },
      });
      assert.equal(startClaimTaskResponse.statusCode, 201);
      const startClaimTask = startClaimTaskResponse.json() as { item: { id: string } };

      resetRequestLimits();

      const startClaimResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${startClaimTask.item.id}/claim`,
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
        payload: {
          start: true,
        },
      });

      assert.equal(startClaimResponse.statusCode, 200);
      const startClaimBody = startClaimResponse.json() as {
        item: { ownerId: string; status: string };
      };
      assert.equal(startClaimBody.item.ownerId, "local-dev-student");
      assert.equal(startClaimBody.item.status, "in-progress");

      resetRequestLimits();

      const reassignResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${startClaimTask.item.id}/reassign`,
        headers: {
          authorization: `Bearer ${mentorToken}`,
        },
        payload: {
          ownerId: "lucas",
        },
      });

      assert.equal(reassignResponse.statusCode, 200);
      assert.equal((reassignResponse.json() as { item: { ownerId: string } }).item.ownerId, "lucas");

      resetRequestLimits();

      const forbiddenReleaseResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${startClaimTask.item.id}/release`,
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
      });

      assert.equal(forbiddenReleaseResponse.statusCode, 403);

      resetRequestLimits();

      const conflictResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${startClaimTask.item.id}/claim`,
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
        payload: {},
      });

      assert.equal(conflictResponse.statusCode, 409);
      assert.deepEqual(conflictResponse.json(), {
        code: "task_already_claimed",
        message: "Task is already claimed.",
        ownerId: "lucas",
        taskId: startClaimTask.item.id,
      });

      resetRequestLimits();

      const managerReleaseResponse = await app.inject({
        method: "POST",
        url: `/api/tasks/${startClaimTask.item.id}/release`,
        headers: {
          authorization: `Bearer ${mentorToken}`,
        },
      });

      assert.equal(managerReleaseResponse.statusCode, 200);
      const managerReleaseBody = managerReleaseResponse.json() as {
        item: { assigneeIds: string[]; ownerId: string | null };
      };
      assert.equal(managerReleaseBody.item.ownerId, null);
      assert.deepEqual(managerReleaseBody.item.assigneeIds, []);

      resetRequestLimits();

      const studentQaApprovalResponse = await app.inject({
        method: "POST",
        url: "/api/qa-reports",
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
      });

      assert.equal(studentMemberDeleteResponse.statusCode, 403);

      resetRequestLimits();

      const studentMeetingCreateResponse = await app.inject({
        method: "POST",
        url: "/api/meetings",
        headers: {
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
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
          cookie: readWebSessionCookie(bypassResponse.headers["set-cookie"]),
          "x-csrf-token": bypassBody.csrfToken,
          origin: "http://localhost:5173",
        },
      });

      assert.equal(studentMeetingDeleteResponse.statusCode, 403);
    } finally {
      await app.close();
      resetRequestLimits();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
    restoreEnv(saved);
  }
});
