import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createPrismaMobileSessionStore } from "../src/auth/mobileSessionPrismaStore";
import { MobileSessionService } from "../src/auth/mobileSessionService";
import type { SessionUser } from "../src/auth/authService";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const databaseUrl = process.env.TEST_DATABASE_URL;
test("Prisma sessions reconnect, refresh over HTTP with current subteams, rotate competitively, and revoke", { skip: !databaseUrl && "Set TEST_DATABASE_URL to an isolated schema bootstrapped with prisma db push" }, async () => {
  const accountId = `audit-session-${randomUUID()}`;
  const user: SessionUser = { accountId, authProvider: "email", email: "ava.chen@mecorobotics.org", name: "Audit Student", picture: null, hostedDomain: "mecorobotics.org", role: "student", taskSubteamIds: ["programming"] };
  let client = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    let service = new MobileSessionService(createPrismaMobileSessionStore(client));
    const created = await service.create(user, "audit-device", "Test client");
    const raw = await client.mobileAccessToken.findFirstOrThrow({ where: { sessionId: created.session.id } });
    assert.equal(raw.tokenHash, createHash("sha256").update(created.token).digest("hex"));
    assert.notEqual(raw.tokenHash, created.token);
    await client.$disconnect();
    client = new PrismaClient({ datasourceUrl: databaseUrl });
    service = new MobileSessionService(createPrismaMobileSessionStore(client));
    assert.equal((await service.resolve(created.token))?.session.id, created.session.id);
    await withIntegrationApp(async ({ app }) => {
      app.userPreferences.update(user.email, { taskSubteamIds: ["mechanical"] });
      const response = await app.inject({ method: "POST", url: "/api/auth/mobile/refresh", payload: { refreshToken: created.refreshToken } });
      assert.equal(response.statusCode, 200, response.body);
      const refreshed = response.json();
      assert.deepEqual(refreshed.user.taskSubteamIds, ["mechanical"]);
      const oldAccess = await service.resolve(created.token); assert.equal(oldAccess, null);
      const race = await Promise.allSettled([service.refresh(refreshed.refreshToken), service.refresh(refreshed.refreshToken)]);
      assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(race.filter((result) => result.status === "rejected").length, 1);
      const winner = race.find((result) => result.status === "fulfilled");
      assert.ok(winner?.status === "fulfilled");
      assert.equal(await service.resolve(winner.value.token), null, "Refresh reuse revokes the entire family, including the winning access token");
      await assert.rejects(service.refresh(refreshed.refreshToken));
    }, { mobileSessionStore: createPrismaMobileSessionStore(client), env: { GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com", API_RATE_LIMIT_MAX_REQUESTS: "100", AUTH_RATE_LIMIT_MAX_REQUESTS: "100" } });
    const reopened = await service.create(user, "audit-device", "Reconnected client");
    await service.revokeSession(reopened.session.id);
    await client.$disconnect();
    client = new PrismaClient({ datasourceUrl: databaseUrl });
    assert.equal(await new MobileSessionService(createPrismaMobileSessionStore(client)).resolve(reopened.token), null);
  } finally {
    await client.mobileDeviceSession.deleteMany({ where: { accountId } });
    await client.$disconnect();
  }
});
