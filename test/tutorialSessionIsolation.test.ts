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

    resetLimits();
    const reset = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      headers: firstHeaders,
      payload: { mode: "session" },
    });
    assert.equal(reset.statusCode, 200);
    assert.equal(reset.json().restored, true);

    resetLimits();
    const globalProject = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: firstHeaders,
      payload: {
        name: "Post-tutorial shared project",
        seasonId: "default-season",
        projectType: "operations",
      },
    });
    assert.equal(globalProject.statusCode, 201);
    const globalProjectId = globalProject.json().item.id as string;

    resetLimits();
    const peerProjectsAfterReset = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: secondHeaders,
    });
    assert.ok(peerProjectsAfterReset.json().items.some(
      (project: { id: string }) => project.id === globalProjectId,
    ));

    resetLimits();
    const baselineWithoutSession = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      headers: secondHeaders,
      payload: { mode: "baseline" },
    });
    assert.equal(baselineWithoutSession.statusCode, 200);

    resetLimits();
    const sharedAfterBaseline = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: secondHeaders,
      payload: {
        name: "Shared after baseline inspection",
        seasonId: "default-season",
        projectType: "operations",
      },
    });
    assert.equal(sharedAfterBaseline.statusCode, 201);
    const sharedAfterBaselineId = sharedAfterBaseline.json().item.id as string;

    resetLimits();
    const firstProjectsAfterBaseline = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: firstHeaders,
    });
    assert.ok(firstProjectsAfterBaseline.json().items.some(
      (project: { id: string }) => project.id === sharedAfterBaselineId,
    ));
  }, {
    env: {
      AUTH_JWT_SECRET: "test-secret-that-is-long-enough-for-auth",
      AUTH_EMAIL_SMTP_HOST: "smtp.example.test",
      AUTH_EMAIL_FROM: "noreply@mecorobotics.org",
    },
  });
});
