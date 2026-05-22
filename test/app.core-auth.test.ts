import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

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

test("navigation favorites are saved and included with bootstrap", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const initialBootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(initialBootstrapResponse.statusCode, 200);
    assert.deepEqual(
      (initialBootstrapResponse.json() as { favoriteViews?: unknown[] }).favoriteViews,
      [],
    );

    resetLimits();

    const addFavoriteResponse = await app.inject({
      method: "PATCH",
      url: "/api/navigation/favorites/tasks-timeline",
      payload: {
        isFavorite: true,
      },
    });

    assert.equal(addFavoriteResponse.statusCode, 200);
    const addFavoriteBody = addFavoriteResponse.json() as {
      favoriteViews: Array<{ viewId: string }>;
    };
    assert.deepEqual(
      addFavoriteBody.favoriteViews.map((favorite) => favorite.viewId),
      ["tasks-timeline"],
    );

    resetLimits();

    const savedBootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(savedBootstrapResponse.statusCode, 200);
    const savedBootstrapBody = savedBootstrapResponse.json() as {
      favoriteViews: Array<{ viewId: string }>;
    };
    assert.deepEqual(
      savedBootstrapBody.favoriteViews.map((favorite) => favorite.viewId),
      ["tasks-timeline"],
    );

    resetLimits();

    const removeFavoriteResponse = await app.inject({
      method: "PATCH",
      url: "/api/navigation/favorites/tasks-timeline",
      payload: {
        isFavorite: false,
      },
    });

    assert.equal(removeFavoriteResponse.statusCode, 200);
    assert.deepEqual(
      (removeFavoriteResponse.json() as { favoriteViews: unknown[] }).favoriteViews,
      [],
    );
  });
});

test("navigation favorites accept the STEP import navigation view", async () => {
  await withIntegrationApp(async ({ app }) => {
    const addFavoriteResponse = await app.inject({
      method: "PATCH",
      url: "/api/navigation/favorites/config-cad",
      payload: {
        isFavorite: true,
      },
    });

    assert.equal(addFavoriteResponse.statusCode, 200);
    assert.deepEqual(
      (addFavoriteResponse.json() as { favoriteViews: Array<{ viewId: string }> }).favoriteViews.map(
        (favorite) => favorite.viewId,
      ),
      ["config-cad"],
    );
  });
});
