import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { WebSession } from "@prisma/client";

import type { SessionUser } from "./authService";
import type { WebSessionStore } from "./webSessionStore";

export const WEB_SESSION_COOKIE_NAME = "meco_web_session";
export const WEB_SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const WEB_SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const WEB_SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreatedWebSession {
  csrfToken: string;
  expiresAt: Date;
  sessionToken: string;
}

export interface ResolvedWebSession {
  csrfToken: string;
  csrfTokenHash: string;
  expiresAt: Date;
  id: string;
  user: SessionUser;
}

function generateSecret() {
  return randomBytes(32).toString("base64url");
}

function hashSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeHashMatch(candidate: string, expectedHash: string) {
  const candidateHash = Buffer.from(hashSecret(candidate), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return candidateHash.length === expected.length && timingSafeEqual(candidateHash, expected);
}

function recordToUser(record: WebSession): SessionUser {
  return {
    accountId: record.accountId,
    authProvider: record.authProvider === "google" ? "google" : "email",
    email: record.email,
    name: record.name,
    picture: record.picture,
    hostedDomain: record.hostedDomain,
    role: record.role as SessionUser["role"],
    taskSubteamIds: [],
  };
}

export class WebSessionService {
  private lastCleanupAt: number | null = null;

  constructor(
    private readonly store: WebSessionStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(user: SessionUser): Promise<CreatedWebSession> {
    const now = this.now();
    if (
      this.lastCleanupAt === null ||
      now.getTime() - this.lastCleanupAt >= WEB_SESSION_CLEANUP_INTERVAL_MS
    ) {
      this.lastCleanupAt = now.getTime();
      await this.store.deleteInactiveBefore(
        new Date(now.getTime() - WEB_SESSION_RETENTION_MS),
      );
    }

    const sessionToken = generateSecret();
    const csrfToken = generateSecret();
    const expiresAt = new Date(now.getTime() + WEB_SESSION_LIFETIME_MS);

    await this.store.create({
      tokenHash: hashSecret(sessionToken),
      csrfTokenHash: hashSecret(csrfToken),
      accountId: user.accountId,
      authProvider: user.authProvider,
      email: user.email,
      name: user.name,
      picture: user.picture,
      hostedDomain: user.hostedDomain,
      role: user.role,
      expiresAt,
    });

    return {
      csrfToken,
      expiresAt,
      sessionToken: `${sessionToken}.${csrfToken}`,
    };
  }

  async resolve(cookieValue: string): Promise<ResolvedWebSession | null> {
    const [sessionToken, csrfToken, extra] = cookieValue.split(".");
    if (
      !sessionToken ||
      !csrfToken ||
      extra !== undefined ||
      sessionToken.length < 32 ||
      csrfToken.length < 32 ||
      cookieValue.length > 512
    ) {
      return null;
    }

    const record = await this.store.findActiveByTokenHash(
      hashSecret(sessionToken),
      this.now(),
    );
    if (!record) {
      return null;
    }
    if (!safeHashMatch(csrfToken, record.csrfTokenHash)) {
      return null;
    }

    return {
      id: record.id,
      csrfToken,
      csrfTokenHash: record.csrfTokenHash,
      expiresAt: record.expiresAt,
      user: recordToUser(record),
    };
  }

  validateCsrf(session: ResolvedWebSession, candidate: string | undefined) {
    return Boolean(candidate && safeHashMatch(candidate, session.csrfTokenHash));
  }

  revoke(session: ResolvedWebSession) {
    return this.store.revoke(session.id, this.now());
  }
}
