import assert from "node:assert/strict";

import type { WebSession } from "@prisma/client";

import type {
  WebSessionCreateRecord,
  WebSessionStore,
} from "../../src/auth/webSessionStore";

export class MemoryWebSessionStore implements WebSessionStore {
  readonly records = new Map<string, WebSession>();
  findActiveCalls = 0;
  readonly cleanupCutoffs: Date[] = [];
  private nextId = 1;

  async create(input: WebSessionCreateRecord) {
    const now = new Date();
    const record: WebSession = {
      ...input,
      id: `web-session-${this.nextId++}`,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  async deleteInactiveBefore(cutoff: Date) {
    this.cleanupCutoffs.push(cutoff);
    let deleted = 0;
    for (const [id, record] of this.records) {
      if (record.expiresAt <= cutoff || (record.revokedAt && record.revokedAt <= cutoff)) {
        this.records.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  async findActiveByTokenHash(tokenHash: string, now: Date) {
    this.findActiveCalls += 1;
    return [...this.records.values()].find((record) =>
      record.tokenHash === tokenHash &&
      record.revokedAt === null &&
      record.expiresAt > now
    ) ?? null;
  }

  async revoke(id: string, revokedAt: Date) {
    const record = this.records.get(id);
    if (!record || record.revokedAt) return false;
    this.records.set(id, { ...record, revokedAt, updatedAt: revokedAt });
    return true;
  }
}

export const webSessionAuthEnv = {
  AUTH_JWT_SECRET: "test-web-session-secret-that-is-long-enough",
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  CORS_ORIGIN: "http://localhost:5173",
  AUTH_MENTOR_EMAILS: "mentor@mecorobotics.org",
  API_RATE_LIMIT_MAX_REQUESTS: "3",
} as const;

export function readWebSessionCookie(setCookie: string | string[] | undefined) {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(value);
  return value.split(";", 1)[0];
}
