import assert from "node:assert/strict";
import { test } from "node:test";

import { MobileSessionService } from "../src/auth/mobileSessionService";
import type { SessionUser } from "../src/auth/authService";
import { MobileSessionMemoryStore } from "./helpers/mobileSessionMemoryStore";

const DAY_MS = 24 * 60 * 60 * 1000;
const user: SessionUser = {
  accountId: "cleanup-user",
  authProvider: "email",
  email: "cleanup@mecorobotics.org",
  name: "Cleanup User",
  picture: null,
  hostedDomain: "mecorobotics.org",
  role: "student",
  taskSubteamIds: [],
};

test("cleanup purges token rows after 7 days and retains session metadata for 30", async () => {
  const store = new MobileSessionMemoryStore();
  const issuedAt = new Date("2026-08-10T12:00:00.000Z");
  const service = new MobileSessionService(store, () => issuedAt);
  const created = await service.create(user, "cleanup-device", null);
  await service.revokeSession(created.session.id);

  assert.equal(
    store.cleanupCutoffs[0].token.getTime(),
    issuedAt.getTime() - 7 * DAY_MS,
  );
  assert.equal(
    store.cleanupCutoffs[0].session.getTime(),
    issuedAt.getTime() - 30 * DAY_MS,
  );

  await store.cleanup(
    new Date(issuedAt.getTime() + DAY_MS),
    new Date(issuedAt.getTime() - 22 * DAY_MS),
    100,
  );
  assert.equal(store.accessTokens.size, 0);
  assert.equal(store.refreshTokens.size, 0);
  assert.equal(store.sessions.size, 1);

  await store.cleanup(
    new Date(issuedAt.getTime() + 24 * DAY_MS),
    new Date(issuedAt.getTime() + DAY_MS),
    100,
  );
  assert.equal(store.sessions.size, 0);
  assert.deepEqual(store.cleanupLimits, [100, 100, 100]);
});
