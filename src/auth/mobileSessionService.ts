import { createHash, randomBytes } from "node:crypto";

import type { SessionUser } from "./authService";
import type {
  MobileSessionStore,
  StoredMobileSession,
} from "./mobileSessionStoreTypes";

export const MOBILE_ACCESS_LIFETIME_MS = 60 * 60 * 1000;
export const MOBILE_IDLE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const MOBILE_ABSOLUTE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;
const ACCESS_PREFIX = "meco_ma.";
const REFRESH_PREFIX = "meco_mr.";
const ACCESS_PATTERN = /^meco_ma\.[A-Za-z0-9_-]{43}$/;
const REFRESH_PATTERN = /^meco_mr\.[A-Za-z0-9_-]{43}$/;

export interface ResolvedMobileSession {
  accessTokenId: string;
  session: StoredMobileSession;
  user: SessionUser;
}

export interface MobileSessionResponse {
  token: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  sessionExpiresAt: string;
  session: {
    id: string;
    createdAt: string;
    lastUsedAt: string;
  };
  user: SessionUser;
}

export class MobileSessionError extends Error {
  constructor(
    message: string,
    readonly statusCode = 401,
    readonly code = "invalid_mobile_session",
  ) {
    super(message);
    this.name = "MobileSessionError";
  }
}

function generateToken(prefix: string) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function minDate(...dates: Date[]) {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function sessionUser(session: StoredMobileSession): SessionUser {
  return {
    accountId: session.accountId,
    authProvider: session.authProvider === "google" ? "google" : "email",
    email: session.email,
    name: session.name,
    picture: session.picture,
    hostedDomain: session.hostedDomain,
    role: session.role as SessionUser["role"],
    taskSubteamIds: [],
  };
}

export function isMobileAccessToken(token: string) {
  return ACCESS_PATTERN.test(token);
}

export function isMobileRefreshToken(token: string) {
  return REFRESH_PATTERN.test(token);
}

export class MobileSessionService {
  private lastCleanupAt: number | null = null;

  constructor(
    private readonly store: MobileSessionStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async cleanupIfDue(now: Date) {
    if (
      this.lastCleanupAt !== null &&
      now.getTime() - this.lastCleanupAt < CLEANUP_INTERVAL_MS
    ) {
      return;
    }
    await this.store.cleanup(
      new Date(now.getTime() - TOKEN_RETENTION_MS),
      new Date(now.getTime() - SESSION_RETENTION_MS),
      CLEANUP_BATCH_SIZE,
    );
    this.lastCleanupAt = now.getTime();
  }

  private buildResponse(
    accessToken: string,
    refreshToken: string,
    accessExpiresAt: Date,
    session: StoredMobileSession,
  ): MobileSessionResponse {
    return {
      token: accessToken,
      refreshToken,
      accessTokenExpiresAt: accessExpiresAt.toISOString(),
      sessionExpiresAt: minDate(
        session.idleExpiresAt,
        session.absoluteExpiresAt,
      ).toISOString(),
      session: {
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
      },
      user: sessionUser(session),
    };
  }

  async create(
    user: SessionUser,
    deviceId: string,
    deviceName: string | null,
  ) {
    const now = this.now();
    await this.cleanupIfDue(now);
    const accessToken = generateToken(ACCESS_PREFIX);
    const refreshToken = generateToken(REFRESH_PREFIX);
    const absoluteExpiresAt = new Date(now.getTime() + MOBILE_ABSOLUTE_LIFETIME_MS);
    const accessExpiresAt = minDate(
      new Date(now.getTime() + MOBILE_ACCESS_LIFETIME_MS),
      absoluteExpiresAt,
    );
    const idleExpiresAt = new Date(now.getTime() + MOBILE_IDLE_LIFETIME_MS);
    const session = await this.store.createSession({
      user,
      deviceId,
      deviceName,
      accessTokenHash: hashToken(accessToken),
      accessExpiresAt,
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt: idleExpiresAt,
      idleExpiresAt,
      absoluteExpiresAt,
      now,
    });
    return this.buildResponse(accessToken, refreshToken, accessExpiresAt, session);
  }

  async resolve(accessToken: string): Promise<ResolvedMobileSession | null> {
    if (!isMobileAccessToken(accessToken)) return null;
    const now = this.now();
    const match = await this.store.findAccess(hashToken(accessToken), now);
    if (!match) return null;
    const active = await this.store.touchAccess(
      match.accessTokenId,
      match.session.id,
      now,
    );
    if (!active) return null;
    return {
      accessTokenId: match.accessTokenId,
      session: { ...match.session, lastUsedAt: now },
      user: sessionUser(match.session),
    };
  }

  async refresh(refreshToken: string) {
    if (!isMobileRefreshToken(refreshToken)) {
      throw new MobileSessionError("The mobile refresh token is invalid.");
    }
    const now = this.now();
    await this.cleanupIfDue(now);
    const accessToken = generateToken(ACCESS_PREFIX);
    const nextRefreshToken = generateToken(REFRESH_PREFIX);
    const accessExpiresAt = new Date(now.getTime() + MOBILE_ACCESS_LIFETIME_MS);
    const idleExpiresAt = new Date(now.getTime() + MOBILE_IDLE_LIFETIME_MS);
    const result = await this.store.rotateRefresh({
      currentTokenHash: hashToken(refreshToken),
      nextAccessTokenHash: hashToken(accessToken),
      nextAccessExpiresAt: accessExpiresAt,
      nextRefreshTokenHash: hashToken(nextRefreshToken),
      nextRefreshExpiresAt: idleExpiresAt,
      idleExpiresAt,
      now,
    });
    if (result.status === "reused") {
      throw new MobileSessionError(
        "Refresh token reuse was detected. Sign in again on this device.",
        401,
        "mobile_refresh_reuse",
      );
    }
    if (result.status !== "rotated") {
      throw new MobileSessionError("The mobile session expired. Sign in again.");
    }
    const effectiveIdle = minDate(idleExpiresAt, result.session.absoluteExpiresAt);
    const effectiveAccessExpiresAt = minDate(
      accessExpiresAt,
      result.session.absoluteExpiresAt,
    );
    return this.buildResponse(
      accessToken,
      nextRefreshToken,
      effectiveAccessExpiresAt,
      { ...result.session, idleExpiresAt: effectiveIdle },
    );
  }

  revokeSession(sessionId: string) {
    return this.store.revokeSession(sessionId, this.now());
  }

  revokeRefresh(refreshToken: string) {
    return isMobileRefreshToken(refreshToken)
      ? this.store.revokeByRefreshHash(hashToken(refreshToken), this.now())
      : Promise.resolve(false);
  }

  revokeAll(accountId: string) {
    return this.store.revokeAll(accountId, this.now());
  }

  revokeForAccount(sessionId: string, accountId: string) {
    return this.store.revokeForAccount(sessionId, accountId, this.now());
  }

  async list(accountId: string, currentSessionId: string) {
    const sessions = await this.store.listActive(accountId, this.now());
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: minDate(
        session.idleExpiresAt,
        session.absoluteExpiresAt,
      ).toISOString(),
      current: session.id === currentSessionId,
      deviceName: session.deviceName,
    }));
  }
}
