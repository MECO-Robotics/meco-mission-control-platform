import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WEB_SESSION_CLEANUP_INTERVAL_MS,
  WEB_SESSION_RETENTION_MS,
  WebSessionService,
} from "../src/auth/webSessionService";
import { MemoryWebSessionStore } from "./helpers/webSessionMemoryStore";

const user = {
  accountId: "cleanup-test-user",
  authProvider: "email" as const,
  email: "cleanup@mecorobotics.org",
  name: "Cleanup Test",
  picture: null,
  hostedDomain: "mecorobotics.org",
  role: "mentor" as const,
  taskSubteamIds: [],
};

test("web session creation cleans old inactive records at most once per hour", async () => {
  let nowMs = Date.UTC(2026, 7, 10, 12);
  const store = new MemoryWebSessionStore();
  const service = new WebSessionService(store, () => new Date(nowMs));

  const old = new Date(nowMs - WEB_SESSION_RETENTION_MS - 1);
  const oldExpired = await store.create({
    tokenHash: "old-expired-token",
    csrfTokenHash: "old-expired-csrf",
    ...user,
    expiresAt: old,
  });
  const oldRevoked = await store.create({
    tokenHash: "old-revoked-token",
    csrfTokenHash: "old-revoked-csrf",
    ...user,
    expiresAt: new Date(nowMs + 1),
  });
  store.records.set(oldRevoked.id, {
    ...oldRevoked,
    revokedAt: old,
  });
  const recentlyRevoked = await store.create({
    tokenHash: "recently-revoked-token",
    csrfTokenHash: "recently-revoked-csrf",
    ...user,
    expiresAt: new Date(nowMs + 1),
  });
  store.records.set(recentlyRevoked.id, {
    ...recentlyRevoked,
    revokedAt: new Date(nowMs - WEB_SESSION_RETENTION_MS + 1),
  });

  await service.create(user);
  assert.equal(store.cleanupCutoffs.length, 1);
  assert.equal(store.records.has(oldExpired.id), false);
  assert.equal(store.records.has(oldRevoked.id), false);
  assert.equal(store.records.has(recentlyRevoked.id), true);

  await service.create(user);
  assert.equal(store.cleanupCutoffs.length, 1);

  nowMs += WEB_SESSION_CLEANUP_INTERVAL_MS;
  await service.create(user);
  assert.equal(store.cleanupCutoffs.length, 2);
  assert.equal(
    store.cleanupCutoffs[1].getTime(),
    nowMs - WEB_SESSION_RETENTION_MS,
  );
});
