import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("tutorial mutations remain isolated to the authenticated user", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const { signSessionToken } = await import("../src/auth/authService");
    const tokenFor = (accountId: string, email: string) => signSessionToken({
      accountId,
      authProvider: "email",
      email,
      hostedDomain: "mecorobotics.org",
      name: accountId,
      picture: null,
      role: "mentor",
      taskSubteamIds: [],
    });
    const firstHeaders = { authorization: `Bearer ${tokenFor("jordan", "jordan.lee@mecorobotics.org")}` };
    const secondHeaders = { authorization: `Bearer ${tokenFor("riley", "riley.kim@mecorobotics.org")}` };

    const start = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
      headers: firstHeaders,
    });
    assert.equal(start.statusCode, 200);
    resetLimits();

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: firstHeaders,
      payload: {
        name: "First mentor sandbox project",
        seasonId: "default-season",
        projectType: "outreach",
      },
    });
    assert.equal(created.statusCode, 201);
    const projectId = created.json().item.id as string;
    resetLimits();

    const firstProjects = await app.inject({ method: "GET", url: "/api/projects", headers: firstHeaders });
    resetLimits();
    const secondProjects = await app.inject({ method: "GET", url: "/api/projects", headers: secondHeaders });
    assert.equal(firstProjects.statusCode, 200);
    assert.equal(secondProjects.statusCode, 200);
    assert.ok(firstProjects.json().items.some((project: { id: string }) => project.id === projectId));
    assert.equal(secondProjects.json().items.some((project: { id: string }) => project.id === projectId), false);
  }, {
    env: {
      AUTH_JWT_SECRET: "test-secret-that-is-long-enough-for-auth",
      AUTH_EMAIL_SMTP_HOST: "smtp.example.test",
      AUTH_EMAIL_FROM: "noreply@mecorobotics.org",
    },
  });
});
