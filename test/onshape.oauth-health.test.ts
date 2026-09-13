import assert from "node:assert/strict";
import { test } from "node:test";

import { getOnshapeRuntimeStore } from "../src/onshape/cadStore";
import { setOnshapeOAuthTokenTransportForTests } from "../src/onshape/onshapeOAuth";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("Onshape OAuth health reports stored OAuth tokens without exposing credentials", async () => {
  setOnshapeOAuthTokenTransportForTests(async ({ body }) => {
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "oauth-code");
    return {
      statusCode: 200,
      json: {
        access_token: "oauth-access-token",
        refresh_token: "oauth-refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "OAuth2Read",
      },
    };
  });

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const authorizationResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/authorization-url",
      });
      const authorizationBody = authorizationResponse.json() as { state: string };
      const setCookieHeader = authorizationResponse.headers["set-cookie"];
      const sessionCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      if (typeof sessionCookie !== "string") {
        throw new Error("Expected OAuth session cookie to be set.");
      }

      const callbackResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/oauth/callback?code=oauth-code&state=${authorizationBody.state}`,
        headers: { cookie: sessionCookie.split(";")[0] },
      });
      assert.equal(callbackResponse.statusCode, 200);

      resetLimits();

      const healthResponse = await app.inject({ method: "GET", url: "/api/onshape/oauth/health" });
      assert.equal(healthResponse.statusCode, 200);
      const healthBody = healthResponse.json() as {
        item: {
          connectionState: string;
          connected: boolean;
          credentialSource: string;
          hasRefreshToken: boolean;
          reconnectAction: { method: string; url: string; available: boolean };
          accessToken?: string;
          refreshToken?: string;
        };
      };
      assert.equal(healthBody.item.connectionState, "connected");
      assert.equal(healthBody.item.connected, true);
      assert.equal(healthBody.item.credentialSource, "runtime");
      assert.equal(healthBody.item.hasRefreshToken, true);
      assert.equal(healthBody.item.reconnectAction.method, "POST");
      assert.equal(healthBody.item.reconnectAction.url, "/api/onshape/oauth/authorization-url");
      assert.equal(healthBody.item.reconnectAction.available, true);
      assert.equal(healthBody.item.accessToken, undefined);
      assert.equal(healthBody.item.refreshToken, undefined);
      assert.doesNotMatch(JSON.stringify(healthBody), /oauth-access-token|oauth-refresh-token/);
    });
  } finally {
    setOnshapeOAuthTokenTransportForTests(null);
  }
});

test("Onshape OAuth health reports disconnected without exposing credentials", async () => {
  await withIntegrationApp(async ({ app }) => {
    const response = await app.inject({ method: "GET", url: "/api/onshape/oauth/health" });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      item: {
        connectionState: string;
        connected: boolean;
        tokenExpiresAt: string | null;
        tokenReceivedAt: string | null;
        credentialSource: string;
        hasRefreshToken: boolean;
        refreshAvailable: boolean;
        reconnectAction: { type: string; method: string; url: string; available: boolean };
        accessToken?: string;
        refreshToken?: string;
      };
    };
    assert.equal(body.item.connectionState, "disconnected");
    assert.equal(body.item.connected, false);
    assert.equal(body.item.tokenExpiresAt, null);
    assert.equal(body.item.tokenReceivedAt, null);
    assert.equal(body.item.credentialSource, "none");
    assert.equal(body.item.hasRefreshToken, false);
    assert.equal(body.item.refreshAvailable, false);
    assert.deepEqual(body.item.reconnectAction, {
      type: "start_oauth",
      method: "POST",
      url: "/api/onshape/oauth/authorization-url",
      available: true,
    });
    assert.equal(body.item.accessToken, undefined);
    assert.equal(body.item.refreshToken, undefined);
  });
});

test("Onshape OAuth health reports expired tokens without returning token values", async () => {
  await withIntegrationApp(async ({ app }) => {
    getOnshapeRuntimeStore().setOAuthTokenSet({
      accessToken: "expired-access-token",
      refreshToken: "expired-refresh-token",
      tokenType: "Bearer",
      scope: "OAuth2Read",
      expiresAt: "2000-01-01T00:00:00.000Z",
      receivedAt: "1999-12-31T23:00:00.000Z",
    });

    const response = await app.inject({ method: "GET", url: "/api/onshape/oauth/health" });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      item: {
        connectionState: string;
        connected: boolean;
        tokenExpiresAt: string | null;
        tokenReceivedAt: string | null;
        credentialSource: string;
        hasRefreshToken: boolean;
        refreshAvailable: boolean;
        accessToken?: string;
        refreshToken?: string;
      };
    };
    assert.equal(body.item.connectionState, "expired");
    assert.equal(body.item.connected, false);
    assert.equal(body.item.tokenExpiresAt, "2000-01-01T00:00:00.000Z");
    assert.equal(body.item.tokenReceivedAt, "1999-12-31T23:00:00.000Z");
    assert.equal(body.item.credentialSource, "runtime");
    assert.equal(body.item.hasRefreshToken, true);
    assert.equal(body.item.refreshAvailable, true);
    assert.equal(body.item.accessToken, undefined);
    assert.equal(body.item.refreshToken, undefined);
    assert.doesNotMatch(JSON.stringify(body), /expired-access-token|expired-refresh-token/);
  });
});
