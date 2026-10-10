import { issueTestMobileToken } from "./helpers/sessionAuth";
import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { getSnapshot } from "../src/data/store";

test("tutorial mutations remain isolated to the authenticated user", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {

    const tokenFor = async (accountId: string, email: string) => await issueTestMobileToken({
      accountId,
      authProvider: "email",
      email,
      hostedDomain: "mecorobotics.org",
      name: accountId,
      picture: null,
      role: "mentor",
      taskSubteamIds: [],
    });
    const firstHeaders = { authorization: `Bearer ${await tokenFor("jordan", "jordan.lee@mecorobotics.org")}` };
    const secondHeaders = { authorization: `Bearer ${await tokenFor("riley", "riley.kim@mecorobotics.org")}` };

    const start = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
      headers: firstHeaders,
    });
    assert.equal(start.statusCode, 200);
    resetLimits();

    const outreach = getSnapshot().projects.find((project) => project.projectType === "outreach");
    assert.ok(outreach);
    const created = await app.inject({
      method: "PATCH",
      url: `/api/projects/${outreach.id}`,
      headers: firstHeaders,
      payload: { description: "First mentor sandbox project" },
    });
    assert.equal(created.statusCode, 200);
    const projectId = outreach.id;
    resetLimits();

    const firstProjects = await app.inject({ method: "GET", url: "/api/projects", headers: firstHeaders });
    resetLimits();
    const secondProjects = await app.inject({ method: "GET", url: "/api/projects", headers: secondHeaders });
    assert.equal(firstProjects.statusCode, 200);
    assert.equal(secondProjects.statusCode, 200);
    assert.equal(firstProjects.json().items.find((project: { id: string }) => project.id === projectId)?.description, "First mentor sandbox project");
    assert.notEqual(secondProjects.json().items.find((project: { id: string }) => project.id === projectId)?.description, "First mentor sandbox project");

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
    const operations = getSnapshot().projects.find((project) => project.projectType === "operations");
    assert.ok(operations);
    const globalProject = await app.inject({
      method: "PATCH",
      url: `/api/projects/${operations.id}`,
      headers: firstHeaders,
      payload: { description: "Post-tutorial shared project" },
    });
    assert.equal(globalProject.statusCode, 200);
    const globalProjectId = operations.id;

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
    const strategy = getSnapshot().projects.find((project) => project.projectType === "strategy");
    assert.ok(strategy);
    const sharedAfterBaseline = await app.inject({
      method: "PATCH",
      url: `/api/projects/${strategy.id}`,
      headers: secondHeaders,
      payload: { description: "Shared after baseline inspection" },
    });
    assert.equal(sharedAfterBaseline.statusCode, 200);
    const sharedAfterBaselineId = strategy.id;

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
      AUTH_EMAIL_SMTP_HOST: "smtp.example.test",
      AUTH_EMAIL_FROM: "noreply@mecorobotics.org",
    },
    members: [
      {
        name: "Jordan Lee",
        email: "jordan.lee@mecorobotics.org",
        role: "mentor",
        seasonId: "default-season",
      },
      {
        name: "Riley Kim",
        email: "riley.kim@mecorobotics.org",
        role: "mentor",
        seasonId: "default-season",
      },
    ],
  });
});
