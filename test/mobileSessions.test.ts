import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  MOBILE_ABSOLUTE_LIFETIME_MS,
  MOBILE_ACCESS_LIFETIME_MS,
  MOBILE_IDLE_LIFETIME_MS,
  MobileSessionError,
  MobileSessionService,
} from "../src/auth/mobileSessionService";
import type { SessionUser } from "../src/auth/authService";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import { MobileSessionMemoryStore } from "./helpers/mobileSessionMemoryStore";

const user: SessionUser = {
  accountId: "local-dev-student",
  authProvider: "email",
  email: "dev.student@mecorobotics.org",
  name: "Local Dev Student",
  picture: null,
  hostedDomain: "mecorobotics.org",
  role: "student",
  taskSubteamIds: [],
};

function authEnv() {
  return {
    AUTH_JWT_SECRET: "a".repeat(32),
    GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
    AUTH_RATE_LIMIT_MAX_REQUESTS: "20",
    AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS: "20",
  } as const;
}

test("mobile sessions persist only token hashes and enforce bounded lifetimes", async () => {
  const store = new MobileSessionMemoryStore();
  const issuedAt = new Date("2026-08-10T12:00:00.000Z");
  let now = issuedAt;
  const service = new MobileSessionService(store, () => now);
  const response = await service.create(user, "install-1", "Amadeus iPhone");

  assert.match(response.token, /^meco_ma\.[A-Za-z0-9_-]{43}$/);
  assert.match(response.refreshToken, /^meco_mr\.[A-Za-z0-9_-]{43}$/);
  assert.equal(Date.parse(response.accessTokenExpiresAt) - issuedAt.getTime(), MOBILE_ACCESS_LIFETIME_MS);
  assert.equal(Date.parse(response.sessionExpiresAt) - issuedAt.getTime(), MOBILE_IDLE_LIFETIME_MS);
  assert.equal(
    store.sessions.get(response.session.id)!.absoluteExpiresAt.getTime() - issuedAt.getTime(),
    MOBILE_ABSOLUTE_LIFETIME_MS,
  );
  assert.deepEqual(store.cleanupLimits, [100]);

  const accessHash = createHash("sha256").update(response.token).digest("hex");
  const refreshHash = createHash("sha256").update(response.refreshToken).digest("hex");
  assert.ok([...store.accessTokens.values()].some((token) => token.tokenHash === accessHash));
  assert.ok([...store.refreshTokens.values()].some((token) => token.tokenHash === refreshHash));
  assert.ok([...store.accessTokens.values()].every((token) => token.tokenHash !== response.token));
  assert.ok([...store.refreshTokens.values()].every((token) => token.tokenHash !== response.refreshToken));

  now = new Date(issuedAt.getTime() + 10 * 60 * 1000);
  assert.equal((await service.resolve(response.token))?.user.accountId, user.accountId);
  assert.equal(
    store.sessions.get(response.session.id)!.idleExpiresAt.getTime(),
    issuedAt.getTime() + MOBILE_IDLE_LIFETIME_MS,
  );
  now = new Date(issuedAt.getTime() + MOBILE_ACCESS_LIFETIME_MS + 1);
  assert.equal(await service.resolve(response.token), null);
});

test("mobile session creation preserves the supplied task subteams", async () => {
  const service = new MobileSessionService(new MobileSessionMemoryStore());
  const response = await service.create(
    { ...user, taskSubteamIds: ["programming", "scouting"] },
    "install-subteams",
    "Student phone",
  );

  assert.deepEqual(response.user.taskSubteamIds, ["programming", "scouting"]);
});

test("refresh rotation invalidates old access and reuse revokes the token family", async () => {
  const store = new MobileSessionMemoryStore();
  let now = new Date("2026-08-10T12:00:00.000Z");
  const service = new MobileSessionService(store, () => now);
  const first = await service.create(user, "install-1", null);

  now = new Date(now.getTime() + 60_000);
  const second = await service.refresh(first.refreshToken);
  assert.notEqual(second.token, first.token);
  assert.notEqual(second.refreshToken, first.refreshToken);
  assert.equal(await service.resolve(first.token), null);
  assert.ok(await service.resolve(second.token));
  await assert.rejects(
    service.refresh(first.refreshToken),
    (error) => error instanceof MobileSessionError && error.code === "mobile_refresh_reuse",
  );
  assert.equal(await service.resolve(second.token), null);
});

test("mobile bearer resolution and revocation endpoints are immediate", async () => {
  const store = new MobileSessionMemoryStore();
  const issuer = new MobileSessionService(store);
  const first = await issuer.create(user, "install-1", "Phone");
  const second = await issuer.create(user, "install-2", "Tablet");
  const third = await issuer.create(user, "install-3", "Laptop");

  await withIntegrationApp(async ({ app, resetLimits }) => {
    const me = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer ${first.token}` },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().user.accountId, user.accountId);

    resetLimits();
    const sessions = await app.inject({
      method: "GET", url: "/api/auth/mobile/sessions",
      headers: { authorization: `Bearer ${first.token}` },
    });
    assert.equal(sessions.statusCode, 200);
    assert.equal(sessions.json().sessions.length, 3);
    assert.equal(sessions.json().sessions.find(
      (entry: { id: string }) => entry.id === first.session.id,
    ).current, true);

    resetLimits();
    const logoutByRefresh = await app.inject({
      method: "POST", url: "/api/auth/mobile/logout",
      payload: { refreshToken: third.refreshToken },
    });
    assert.deepEqual(logoutByRefresh.json(), { ok: true });

    resetLimits();
    const refreshLoggedOut = await app.inject({
      method: "POST", url: "/api/auth/mobile/refresh",
      payload: { refreshToken: third.refreshToken },
    });
    assert.equal(refreshLoggedOut.statusCode, 401);

    resetLimits();
    const revokeOther = await app.inject({
      method: "DELETE", url: `/api/auth/mobile/sessions/${second.session.id}`,
      headers: { authorization: `Bearer ${first.token}` },
    });
    assert.deepEqual(revokeOther.json(), { ok: true });

    resetLimits();
    const revokedOther = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer ${second.token}` },
    });
    assert.equal(revokedOther.statusCode, 401);

    resetLimits();
    const logoutAll = await app.inject({
      method: "POST", url: "/api/auth/mobile/logout-all",
      headers: { authorization: `Bearer ${first.token}` },
    });
    assert.deepEqual(logoutAll.json(), { ok: true });

    resetLimits();
    const revokedCurrent = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer ${first.token}` },
    });
    assert.equal(revokedCurrent.statusCode, 401);

    const fourth = await issuer.create(user, "install-4", "Spare Phone");
    resetLimits();
    const logoutByBearer = await app.inject({
      method: "POST", url: "/api/auth/mobile/logout",
      headers: { authorization: `Bearer ${fourth.token}` },
    });
    assert.deepEqual(logoutByBearer.json(), { ok: true });

    resetLimits();
    const loggedOutBearer = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer ${fourth.token}` },
    });
    assert.equal(loggedOutBearer.statusCode, 401);
  }, { env: authEnv(), mobileSessionStore: store });
});

test("refresh route rotates once and malformed access tokens never reach storage", async () => {
  const store = new MobileSessionMemoryStore();
  const issuer = new MobileSessionService(store);
  const first = await issuer.create(user, "install-1", null);

  await withIntegrationApp(async ({ app, resetLimits }) => {
    const malformed = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: "Bearer meco_ma.not-valid" },
    });
    assert.equal(malformed.statusCode, 401);
    assert.equal(store.findAccessCalls, 0);

    resetLimits();
    const wrongSeparator = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer meco_maX${"a".repeat(43)}` },
    });
    assert.equal(wrongSeparator.statusCode, 401);
    assert.equal(store.findAccessCalls, 0);

    resetLimits();
    const rotated = await app.inject({
      method: "POST", url: "/api/auth/mobile/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    assert.equal(rotated.statusCode, 200);
    const next = rotated.json() as { token: string };

    resetLimits();
    const reused = await app.inject({
      method: "POST", url: "/api/auth/mobile/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    assert.equal(reused.statusCode, 401);
    assert.equal(reused.json().code, "mobile_refresh_reuse");

    resetLimits();
    const revoked = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer ${next.token}` },
    });
    assert.equal(revoked.statusCode, 401);
  }, { env: authEnv(), mobileSessionStore: store });
});

test("legacy device JWT issuance and verification stop without affecting web JWTs", async () => {
  const store = new MobileSessionMemoryStore();
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const legacy = await app.inject({
      method: "POST", url: "/api/auth/email/verify",
      payload: {
        email: "student@mecorobotics.org", code: "123456", deviceId: "old-install",
      },
    });
    assert.equal(legacy.statusCode, 426);
    assert.deepEqual(legacy.json(), {
      error: "mobile_client_upgrade_required",
      message: "Update MECO Mission Control Mobile to continue signing in.",
      code: "mobile_client_upgrade_required",
    });

    resetLimits();
    const web = await app.inject({
      method: "POST", url: "/api/auth/email/verify",
      payload: { email: "student@mecorobotics.org", code: "123456" },
    });
    assert.equal(web.statusCode, 401);

    const { signSessionToken } = require("../src/auth/authService") as typeof import("../src/auth/authService");
    const oldMobileToken = signSessionToken(user, { deviceId: "old-install" });
    resetLimits();
    const oldMobileSession = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer ${oldMobileToken}` },
    });
    assert.equal(oldMobileSession.statusCode, 401);

    const webToken = signSessionToken(user);
    resetLimits();
    const webSession = await app.inject({
      method: "GET", url: "/api/auth/me",
      headers: { authorization: `Bearer ${webToken}` },
    });
    assert.equal(webSession.statusCode, 200);
  }, {
    env: {
      ...authEnv(),
      AUTH_EMAIL_SMTP_HOST: "127.0.0.1",
      AUTH_EMAIL_FROM: "MECO <no-reply@mecorobotics.org>",
    },
    mobileSessionStore: store,
  });
});

test("legacy mobile JWT flag is bounded by its configured cutoff", async () => {
  const baseEnv = {
    ...authEnv(),
    AUTH_EMAIL_SMTP_HOST: "127.0.0.1",
    AUTH_EMAIL_FROM: "MECO <no-reply@mecorobotics.org>",
    AUTH_LEGACY_MOBILE_JWT_ENABLED: "true" as const,
  };
  await withIntegrationApp(async ({ app }) => {
    const beforeCutoff = await app.inject({
      method: "POST", url: "/api/auth/email/verify",
      payload: {
        email: "student@mecorobotics.org", code: "123456", deviceId: "old-install",
      },
    });
    assert.equal(beforeCutoff.statusCode, 401);
  }, {
    env: { ...baseEnv, AUTH_LEGACY_MOBILE_JWT_CUTOFF: "2099-01-01T00:00:00Z" },
    mobileSessionStore: new MobileSessionMemoryStore(),
  });

  await withIntegrationApp(async ({ app }) => {
    const afterCutoff = await app.inject({
      method: "POST", url: "/api/auth/email/verify",
      payload: {
        email: "student@mecorobotics.org", code: "123456", deviceId: "old-install",
      },
    });
    assert.equal(afterCutoff.statusCode, 426);
  }, {
    env: { ...baseEnv, AUTH_LEGACY_MOBILE_JWT_CUTOFF: "2020-01-01T00:00:00Z" },
    mobileSessionStore: new MobileSessionMemoryStore(),
  });
});

test("mobile API traffic uses the API quota across sessions sharing an IP", async () => {
  const store = new MobileSessionMemoryStore();
  const issuer = new MobileSessionService(store);
  const first = await issuer.create(user, "quota-phone", "Phone");
  const second = await issuer.create(user, "quota-tablet", "Tablet");
  await withIntegrationApp(async ({ app }) => {
    for (const token of [first.token, second.token, first.token]) {
      const response = await app.inject({ method: "GET", url: "/api/dashboard", headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.statusCode, 200, response.body);
    }
    const excess = await app.inject({ method: "GET", url: "/api/dashboard", headers: { authorization: `Bearer ${second.token}` } });
    assert.equal(excess.statusCode, 429);
  }, { env: { ...authEnv(), AUTH_RATE_LIMIT_MAX_REQUESTS: "1", API_RATE_LIMIT_MAX_REQUESTS: "3" }, mobileSessionStore: store });
});
