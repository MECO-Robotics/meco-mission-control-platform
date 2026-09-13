import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";
import {
  MemoryWebSessionStore,
  webSessionAuthEnv,
} from "./helpers/webSessionMemoryStore";

const productionEnv = {
  ...webSessionAuthEnv,
  NODE_ENV: "production" as const,
  AUTH_RATE_LIMIT_MAX_REQUESTS: "100",
};

test("production cookie clearing preserves the Secure attribute", async () => {
  const store = new MemoryWebSessionStore();
  await withIntegrationApp(async ({ app }) => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/web/session",
      headers: { cookie: "meco_web_session=invalid.invalid" },
    });
    assert.equal(response.statusCode, 401);
    assert.match(String(response.headers["set-cookie"]), /Secure/i);
  }, { env: productionEnv, webSessionStore: store });
});

test("production web sign-in sets a Secure HttpOnly cookie", async () => {
  const store = new MemoryWebSessionStore();
  await withIntegrationApp(async ({ app }) => {
    const { WebSessionService } = require("../src/auth/webSessionService") as typeof import("../src/auth/webSessionService");
    const { establishWebSession } = require("../src/routes/webAuthRoutes") as typeof import("../src/routes/webAuthRoutes");
    const service = new WebSessionService(store);
    app.post("/test/production-web-sign-in", (_request, reply) =>
      establishWebSession(reply, service, {
        accountId: "production-mentor",
        authProvider: "email",
        email: "mentor@mecorobotics.org",
        name: "Production Mentor",
        picture: null,
        hostedDomain: "mecorobotics.org",
        role: "mentor",
        taskSubteamIds: [],
      }));

    const response = await app.inject({
      method: "POST",
      url: "/test/production-web-sign-in",
    });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["set-cookie"]), /Secure/i);
    assert.match(String(response.headers["set-cookie"]), /HttpOnly/i);
  }, { env: productionEnv, webSessionStore: store });
});
