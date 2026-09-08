import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { saveEnv, restoreEnv } from "./helpers/environment";

test("buildApp advertises email sign-in when localhost SMTP is configured", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "meco-preferences-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousAuthJwtSecret = process.env.AUTH_JWT_SECRET;
  const previousGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const previousEmailHost = process.env.AUTH_EMAIL_SMTP_HOST;
  const previousEmailFrom = process.env.AUTH_EMAIL_FROM;

  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
  process.env.AUTH_JWT_SECRET = "replace-with-a-long-random-secret-123456";
  delete process.env.GOOGLE_CLIENT_ID;
  process.env.AUTH_EMAIL_SMTP_HOST = "127.0.0.1";
  process.env.AUTH_EMAIL_FROM = "MECO Robotics <no-reply@mecorobotics.org>";

  const { buildApp } = await import("../src/app");
  const app = await buildApp({ userPreferencesPath: join(directory, "preferences.json") });

  try {
    const authConfigResponse = await app.inject({
      method: "GET",
      url: "/api/auth/config",
    });

    assert.equal(authConfigResponse.statusCode, 200);
    assert.deepEqual(authConfigResponse.json(), {
      enabled: true,
      googleClientId: null,
      hostedDomain: "mecorobotics.org",
      emailEnabled: true,
      devBypassAvailable: true,
    });
  } finally {
    await app.close();

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousAuthJwtSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = previousAuthJwtSecret;
    }

    if (previousGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = previousGoogleClientId;
    }

    if (previousEmailHost === undefined) {
      delete process.env.AUTH_EMAIL_SMTP_HOST;
    } else {
      process.env.AUTH_EMAIL_SMTP_HOST = previousEmailHost;
    }

    if (previousEmailFrom === undefined) {
      delete process.env.AUTH_EMAIL_FROM;
    } else {
      process.env.AUTH_EMAIL_FROM = previousEmailFrom;
    }
  }
});

test("SMTP timeout reports uncertain delivery without waiting for the send to settle", async () => {
  const saved = saveEnv(["NODE_ENV", "DATABASE_URL"]);
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/meco_platform";
  try {
    const { awaitEmailDelivery } = await import("../src/auth/authService");
    let resolveDelivery!: () => void;
    const delivery = new Promise<void>((resolve) => { resolveDelivery = resolve; });
    assert.equal(await awaitEmailDelivery(delivery, 1), "uncertain");
    resolveDelivery();
    await delivery;
  } finally {
    restoreEnv(saved);
  }
});
