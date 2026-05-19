import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  let tempDir: string | null = null;
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "AUTH_JWT_SECRET",
    "GOOGLE_CLIENT_ID",
    "AUTH_EMAIL_SMTP_HOST",
    "AUTH_EMAIL_FROM",
    "AUTH_MEMBER_SUBTEAMS_ENV_PATH",
    "API_RATE_LIMIT_MAX_REQUESTS",
    "API_RATE_LIMIT_WINDOW_SECONDS",
    "AUTH_RATE_LIMIT_MAX_REQUESTS",
    "AUTH_RATE_LIMIT_WINDOW_SECONDS",
    "AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS",
    "AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS",
  ]);

  try {
    tempDir = mkdtempSync(join(tmpdir(), "meco-env-test-"));
    const memberSubteamsEnvPath = join(tempDir, ".env.test");
    writeFileSync(memberSubteamsEnvPath, "DATABASE_URL=postgresql://example\n", "utf8");
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.AUTH_JWT_SECRET = "replace-with-a-long-random-secret-123456";
    process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
    delete process.env.AUTH_EMAIL_SMTP_HOST;
    delete process.env.AUTH_EMAIL_FROM;
    process.env.AUTH_MEMBER_SUBTEAMS_ENV_PATH = memberSubteamsEnvPath;
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
        };
      };

      assert.equal(bypassBody.user.accountId, "local-dev");
      assert.equal(bypassBody.user.authProvider, "email");
      assert.equal(bypassBody.user.email, "dev@mecorobotics.org");
      assert.equal(bypassBody.user.name, "Local Dev");
      assert.equal(bypassBody.user.hostedDomain, "mecorobotics.org");
      assert.equal(bypassBody.user.picture, null);
      assert.ok(bypassBody.token.length > 0);

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

      const updatePreferencesResponse = await app.inject({
        method: "PATCH",
        url: "/api/users/me/preferences",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
        payload: {
          taskSubteamIds: ["scouting"],
          themeMode: "dark",
        },
      });

      assert.equal(updatePreferencesResponse.statusCode, 200);
      assert.deepEqual(updatePreferencesResponse.json(), {
        taskSubteamIds: ["scouting"],
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
        taskSubteamIds: ["scouting"],
        themeMode: "dark",
      });
      assert.match(
        readFileSync(memberSubteamsEnvPath, "utf8"),
        /^AUTH_MEMBER_SUBTEAMS_BY_EMAIL=dev@mecorobotics\.org=scouting$/m,
      );

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
      assert.deepEqual(updatedAuthMeBody.user?.taskSubteamIds, ["scouting"]);

      resetRequestLimits();

      const dashboardResponse = await app.inject({
        method: "GET",
        url: "/api/dashboard",
        headers: {
          authorization: `Bearer ${bypassBody.token}`,
        },
      });

      assert.equal(dashboardResponse.statusCode, 200);
    } finally {
      await app.close();
      resetRequestLimits();
    }
  } finally {
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true });
    }
    restoreEnv(saved);
  }
});
