import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

async function createAuthHeadersFor(email: string, role: "student" | "lead" | "mentor" | "admin") {
  const { signSessionToken } = await import("../src/auth/authService");
  const token = signSessionToken({
    accountId: email,
    authProvider: "email",
    email,
    hostedDomain: "mecorobotics.org",
    name: email,
    picture: null,
    role,
    taskSubteamIds: [],
  });
  return { authorization: `Bearer ${token}` };
}

test("Onshape OAuth credential routes require lead mentor or admin permissions when auth is enabled", async () => {
  await withIntegrationApp(
    async ({ app, resetLimits }) => {
      const studentHeaders = await createAuthHeadersFor("ava.chen@mecorobotics.org", "student");
      const mentorHeaders = await createAuthHeadersFor("mentor.override@mecorobotics.org", "mentor");

      const deniedAuthorizationResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/authorization-url",
        headers: studentHeaders,
      });
      assert.equal(deniedAuthorizationResponse.statusCode, 403);
      assert.match(deniedAuthorizationResponse.json().message, /restricted to leads, mentors, and admins/i);

      resetLimits();

      const deniedRefreshResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/refresh",
        headers: studentHeaders,
      });
      assert.equal(deniedRefreshResponse.statusCode, 403);
      assert.match(deniedRefreshResponse.json().message, /restricted to leads, mentors, and admins/i);

      resetLimits();

      const allowedAuthorizationResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/authorization-url",
        headers: mentorHeaders,
      });
      assert.equal(allowedAuthorizationResponse.statusCode, 200);
      assert.equal(typeof allowedAuthorizationResponse.json().authorizationUrl, "string");
    },
    {
      env: {
        AUTH_JWT_SECRET: "replace-with-a-long-random-secret-123456",
        GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
        AUTH_MENTOR_EMAILS: "mentor.override@mecorobotics.org",
      },
    },
  );
});
