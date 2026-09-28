import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("closing an app does not disconnect an injected Prisma client", async () => {
  let disconnectCalls = 0;
  const prisma = {
    $disconnect: async () => {
      disconnectCalls += 1;
    },
  } as unknown as PrismaClient;

  await withIntegrationApp(async () => {}, { prisma });

  assert.equal(disconnectCalls, 0);
});

test("buildApp serves health and public auth config without auth enabled", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const healthResponse = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(healthResponse.statusCode, 200);

    const healthBody = healthResponse.json() as {
      service: string;
      status: string;
      timestamp: string;
    };
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.service, "meco-platform");
    assert.equal(Number.isNaN(Date.parse(healthBody.timestamp)), false);

    const authConfigResponse = await app.inject({
      method: "GET",
      url: "/api/auth/config",
    });

    assert.equal(authConfigResponse.statusCode, 200);
    assert.deepEqual(authConfigResponse.json(), {
      enabled: false,
      googleClientId: null,
      hostedDomain: "mecorobotics.org",
      emailEnabled: false,
      devBypassAvailable: false,
    });
    assert.equal(authConfigResponse.headers["cache-control"], "no-store");
    assert.equal(authConfigResponse.headers["pragma"], "no-cache");
    assert.equal(authConfigResponse.headers["x-content-type-options"], "nosniff");
    assert.equal(authConfigResponse.headers["x-frame-options"], "DENY");
    assert.equal(authConfigResponse.headers["referrer-policy"], "no-referrer");

    const authConfigRateLimitedResponse = await app.inject({
      method: "GET",
      url: "/api/auth/config",
    });

    assert.equal(authConfigRateLimitedResponse.statusCode, 429);

    resetLimits();

    const dashboardResponse = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    assert.equal(dashboardResponse.statusCode, 200);

    const dashboardRateLimitedResponse = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    assert.equal(dashboardRateLimitedResponse.statusCode, 429);

    resetLimits();

    const homeResponse = await app.inject({
      method: "GET",
      url: "/api/home",
    });

    assert.equal(homeResponse.statusCode, 200);

    const homeBody = homeResponse.json() as {
      slackEnabled: boolean;
      slackConnected: boolean;
      slackError: string | null;
      userEmail: string | null;
      alertUsergroupHandles: string[];
      channels: Array<{
        key: string;
        name: string;
        slackChannelId: string | null;
        visible: boolean;
      }>;
      unreadAlerts: unknown[];
      meetingRecap: unknown | null;
      summaries: unknown[];
    };

    assert.equal(homeBody.slackEnabled, false);
    assert.equal(homeBody.slackConnected, false);
    assert.equal(homeBody.slackError, null);
    assert.equal(homeBody.userEmail, null);
    assert.deepEqual(homeBody.alertUsergroupHandles, ["allmentors", "allstudents"]);
    assert.deepEqual(
      homeBody.channels.map((channel) => [channel.name, channel.slackChannelId]),
      [
        ["build", "C03171JMMB4"],
        ["meeting-plans-n-recaps", "C03MXBFGAM6"],
        ["programming", "C02BLURKRED"],
        ["scouting-n-strategy", "C05SW57962E"],
        ["transportation-attendance", "C088N9VC6H4"],
      ],
    );
    assert.equal(homeBody.channels.every((channel) => channel.visible), true);
    assert.deepEqual(homeBody.unreadAlerts, []);
    assert.equal(homeBody.meetingRecap, null);
    assert.deepEqual(homeBody.summaries, []);

    resetLimits();

    const defaultPreferencesResponse = await app.inject({
      method: "GET",
      url: "/api/users/me/preferences",
    });
    assert.equal(defaultPreferencesResponse.statusCode, 200);
    assert.deepEqual(defaultPreferencesResponse.json(), {
      taskSubteamIds: [],
      themeMode: null,
    });

    resetLimits();

    const updatePreferencesResponse = await app.inject({
      method: "PATCH",
      url: "/api/users/me/preferences",
      payload: {
        taskSubteamIds: ["programming"],
        themeMode: "light",
      },
    });
    assert.equal(updatePreferencesResponse.statusCode, 200);
    assert.deepEqual(updatePreferencesResponse.json(), {
      taskSubteamIds: ["programming"],
      themeMode: "light",
    });
  });
});

test("route validation preserves field/form errors and validates before entity lookup", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    for (const scenario of [
      { url: "/api/projects", payload: { seasonId: "missing", name: "x" }, message: "Project payload is invalid.", field: "name" },
      { url: "/api/meetings", payload: [], message: "Meeting payload is invalid.", field: null },
      { url: "/api/cad/snapshots/missing/hierarchy-review/apply", payload: {}, message: "CAD hierarchy review payload is invalid.", field: null },
      { url: "/api/onshape/document-refs", payload: {}, message: "Onshape document reference payload is invalid.", field: "url" },
    ]) {
      resetLimits();
      const response = await app.inject({ method: "POST", url: scenario.url, payload: scenario.payload });
      assert.equal(response.statusCode, 400, response.body);
      const body = response.json();
      assert.equal(body.message, scenario.message);
      const errors = scenario.field ? body.issues.fieldErrors[scenario.field] : body.issues.formErrors;
      assert.ok(errors.length > 0, response.body);
    }

    resetLimits();
    const invalidRange = await app.inject({
      method: "GET",
      url: "/api/audit/export?from=2026-09-27T00:00:00Z&to=2026-09-26T00:00:00Z",
    });
    assert.equal(invalidRange.statusCode, 400, invalidRange.body);
    assert.deepEqual(invalidRange.json().issues.fieldErrors.from, ["from must be on or before to."]);

    resetLimits();
    const missingSnapshot = await app.inject({ method: "POST", url: "/api/cad/snapshots/missing/finalize" });
    assert.equal(missingSnapshot.statusCode, 404, missingSnapshot.body);
    assert.equal(missingSnapshot.json().message, "CAD snapshot was not found.");
  });
});

test("authentication rejects invalid payloads before validation details are exposed", async () => {
  await withIntegrationApp(async ({ app }) => {
    const response = await app.inject({ method: "POST", url: "/api/projects", payload: {} });
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().issues, undefined);
  }, { env: { GOOGLE_CLIENT_ID: "test-google-client-id" } });
});
