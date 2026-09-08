import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import {
  MemoryWebSessionStore,
  readWebSessionCookie,
  webSessionAuthEnv,
} from "./helpers/webSessionMemoryStore";

test("web sessions use an HttpOnly cookie, enforce CSRF, and revoke on logout", async () => {
  const store = new MemoryWebSessionStore();
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/web/dev-bypass",
      payload: { role: "mentor" },
    });
    assert.equal(signIn.statusCode, 200);
    const setCookie = signIn.headers["set-cookie"];
    assert.match(String(setCookie), /meco_web_session=/);
    assert.match(String(setCookie), /HttpOnly/i);
    assert.match(String(setCookie), /SameSite=Lax/i);
    assert.match(String(setCookie), /Path=\/api/i);
    assert.doesNotMatch(String(setCookie), /Secure/i);

    const body = signIn.json() as {
      csrfToken: string;
      expiresAt: string;
      token?: string;
      user: { email: string };
    };
    assert.equal(body.token, undefined);
    assert.equal(body.csrfToken.length, 43);
    assert.equal(body.user.email, "dev.mentor@mecorobotics.org");
    assert.ok(Date.parse(body.expiresAt) > Date.now());

    const cookie = readWebSessionCookie(setCookie);
    const stored = [...store.records.values()][0];
    assert.ok(stored);
    assert.equal(stored.tokenHash.length, 64);
    assert.equal(stored.csrfTokenHash.length, 64);
    assert.equal(cookie.includes(stored.tokenHash), false);
    assert.equal(cookie.includes(body.csrfToken), true);

    resetLimits();
    const restored = await app.inject({
      method: "GET",
      url: "/api/auth/web/session",
      headers: { cookie },
    });
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json().csrfToken, body.csrfToken);

    resetLimits();
    const missingCsrf = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
      headers: { cookie },
    });
    assert.equal(missingCsrf.statusCode, 403);

    resetLimits();
    const wrongOrigin = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
      headers: {
        cookie,
        origin: "https://attacker.example",
        "x-csrf-token": body.csrfToken,
      },
    });
    assert.equal(wrongOrigin.statusCode, 403);

    resetLimits();
    const wrongCsrf = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "x-csrf-token": "wrong-token",
      },
    });
    assert.equal(wrongCsrf.statusCode, 403);

    resetLimits();
    const allowedMutation = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "x-csrf-token": body.csrfToken,
      },
    });
    assert.equal(allowedMutation.statusCode, 200);

    resetLimits();
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/web/logout",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "x-csrf-token": body.csrfToken,
      },
    });
    assert.equal(logout.statusCode, 200);
    assert.equal(logout.json().ok, true);
    assert.ok(store.records.get(stored.id)?.revokedAt);

    resetLimits();
    const replay = await app.inject({
      method: "GET",
      url: "/api/auth/web/session",
      headers: { cookie },
    });
    assert.equal(replay.statusCode, 401);
  }, { env: webSessionAuthEnv, webSessionStore: store });
});

test("expired web sessions fail closed", async () => {
  const store = new MemoryWebSessionStore();
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/web/dev-bypass",
    });
    assert.equal(signIn.statusCode, 200);
    const cookie = readWebSessionCookie(signIn.headers["set-cookie"]);
    const stored = [...store.records.values()][0];
    assert.ok(stored);
    store.records.set(stored.id, {
      ...stored,
      expiresAt: new Date(Date.now() - 1),
    });

    resetLimits();
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/web/session",
      headers: { cookie },
    });
    assert.equal(response.statusCode, 401);
  }, { env: webSessionAuthEnv, webSessionStore: store });
});

test("malformed and explicitly revoked web session cookies fail closed", async () => {
  const store = new MemoryWebSessionStore();
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/web/dev-bypass",
    });
    const cookie = readWebSessionCookie(signIn.headers["set-cookie"]);
    const [name, value] = cookie.split("=", 2);
    const [sessionToken, csrfToken] = value.split(".", 2);
    const changedLastCharacter = csrfToken.endsWith("a") ? "b" : "a";
    const malformedCookies = [
      `${name}=${sessionToken}.${csrfToken.slice(0, -1)}${changedLastCharacter}`,
      `${name}=${value}.extra`,
      `${name}=a.b`,
      `${name}=${"a".repeat(513)}`,
    ];

    for (const malformedCookie of malformedCookies) {
      resetLimits();
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/web/session",
        headers: { cookie: malformedCookie },
      });
      assert.equal(response.statusCode, 401);
    }

    const stored = [...store.records.values()][0];
    assert.ok(stored);
    store.records.set(stored.id, {
      ...stored,
      revokedAt: new Date(),
    });
    resetLimits();
    const revoked = await app.inject({
      method: "GET",
      url: "/api/auth/web/session",
      headers: { cookie },
    });
    assert.equal(revoked.statusCode, 401);
  }, { env: webSessionAuthEnv, webSessionStore: store });
});

test("web session resolution is API-scoped without applying the lower shared auth quota", async () => {
  const store = new MemoryWebSessionStore();
  await withIntegrationApp(async ({ app }) => {
    const plausibleCookie = `meco_web_session=${"a".repeat(43)}.${"b".repeat(43)}`;
    const outsideApi = await app.inject({
      method: "GET",
      url: "/health",
      headers: { cookie: plausibleCookie },
    });
    assert.equal(outsideApi.statusCode, 200);
    assert.equal(store.findActiveCalls, 0);

    const first = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      headers: { cookie: plausibleCookie },
    });
    assert.equal(first.statusCode, 401);
    assert.equal(store.findActiveCalls, 1);

    const second = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      headers: {
        cookie: `meco_web_session=${"c".repeat(43)}.${"d".repeat(43)}`,
      },
    });
    assert.equal(second.statusCode, 401);
    assert.equal(store.findActiveCalls, 2);
  }, {
    env: {
      ...webSessionAuthEnv,
      API_RATE_LIMIT_MAX_REQUESTS: "3",
      AUTH_RATE_LIMIT_MAX_REQUESTS: "1",
    },
    webSessionStore: store,
  });
});

test("Authorization headers take precedence over web cookies and fail closed", async () => {
  const store = new MemoryWebSessionStore();
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/web/dev-bypass",
      payload: { role: "mentor" },
    });
    const validCookie = readWebSessionCookie(signIn.headers["set-cookie"]);
    const { signSessionToken } = require("../src/auth/authService") as typeof import("../src/auth/authService");
    const validBearer = signSessionToken({
      accountId: "mobile-mentor",
      authProvider: "email",
      email: "mentor@mecorobotics.org",
      name: "Mobile Mentor",
      picture: null,
      hostedDomain: "mecorobotics.org",
      role: "mentor",
      taskSubteamIds: [],
    });

    resetLimits();
    const bearerWins = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
      headers: {
        authorization: `Bearer ${validBearer}`,
        cookie: "meco_web_session=bad.bad",
      },
    });
    assert.equal(bearerWins.statusCode, 200);

    resetLimits();
    const invalidBearerDoesNotFallBack = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: "Bearer invalid",
        cookie: validCookie,
      },
    });
    assert.equal(invalidBearerDoesNotFallBack.statusCode, 401);
  }, { env: webSessionAuthEnv, webSessionStore: store });
});

test("existing non-mobile bearer sessions remain usable without browser CSRF headers", async () => {
  const store = new MemoryWebSessionStore();
  await withIntegrationApp(async ({ app }) => {
    const { signSessionToken } = require("../src/auth/authService") as typeof import("../src/auth/authService");
    const token = signSessionToken({
      accountId: "mobile-mentor",
      authProvider: "email",
      email: "mentor@mecorobotics.org",
      name: "Mobile Mentor",
      picture: null,
      hostedDomain: "mecorobotics.org",
      role: "mentor",
      taskSubteamIds: [],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
  }, { env: webSessionAuthEnv, webSessionStore: store });
});
