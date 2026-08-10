import type {
  MobileAccessLookup,
  MobileRefreshRotateInput,
  MobileSessionCreateInput,
  MobileSessionStore,
  StoredMobileSession,
} from "../../src/auth/mobileSessionStoreTypes";

interface AccessRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface RefreshRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

function isActive(session: StoredMobileSession, now: Date) {
  return session.revokedAt === null &&
    session.idleExpiresAt > now &&
    session.absoluteExpiresAt > now;
}

export class MobileSessionMemoryStore implements MobileSessionStore {
  readonly sessions = new Map<string, StoredMobileSession>();
  readonly accessTokens = new Map<string, AccessRecord>();
  readonly refreshTokens = new Map<string, RefreshRecord>();
  readonly cleanupLimits: number[] = [];
  readonly cleanupCutoffs: Array<{
    token: Date;
    session: Date;
  }> = [];
  findAccessCalls = 0;
  private nextId = 1;

  private id(prefix: string) {
    return `${prefix}-${this.nextId++}`;
  }

  private revokeFamily(sessionId: string, now: Date) {
    const session = this.sessions.get(sessionId);
    if (session && !session.revokedAt) session.revokedAt = now;
    for (const token of this.accessTokens.values()) {
      if (token.sessionId === sessionId && !token.revokedAt) token.revokedAt = now;
    }
    for (const token of this.refreshTokens.values()) {
      if (token.sessionId === sessionId && !token.revokedAt) token.revokedAt = now;
    }
  }

  async createSession(input: MobileSessionCreateInput) {
    for (const session of this.sessions.values()) {
      if (session.accountId === input.user.accountId &&
          session.deviceId === input.deviceId && !session.revokedAt) {
        this.revokeFamily(session.id, input.now);
      }
    }
    const session: StoredMobileSession = {
      id: this.id("session"),
      accountId: input.user.accountId,
      authProvider: input.user.authProvider,
      email: input.user.email,
      name: input.user.name,
      picture: input.user.picture,
      hostedDomain: input.user.hostedDomain,
      role: input.user.role,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      createdAt: input.now,
      lastUsedAt: input.now,
      idleExpiresAt: input.idleExpiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null,
    };
    this.sessions.set(session.id, session);
    const accessId = this.id("access");
    this.accessTokens.set(accessId, {
      id: accessId,
      sessionId: session.id,
      tokenHash: input.accessTokenHash,
      expiresAt: input.accessExpiresAt,
      revokedAt: null,
    });
    const refreshId = this.id("refresh");
    this.refreshTokens.set(refreshId, {
      id: refreshId,
      sessionId: session.id,
      tokenHash: input.refreshTokenHash,
      expiresAt: input.refreshExpiresAt,
      usedAt: null,
      revokedAt: null,
    });
    return session;
  }

  async findAccess(tokenHash: string, now: Date): Promise<MobileAccessLookup | null> {
    this.findAccessCalls += 1;
    for (const token of this.accessTokens.values()) {
      const session = this.sessions.get(token.sessionId);
      if (token.tokenHash === tokenHash && token.revokedAt === null &&
          token.expiresAt > now && session && isActive(session, now)) {
        return { accessTokenId: token.id, session };
      }
    }
    return null;
  }

  async touchAccess(
    accessTokenId: string,
    sessionId: string,
    now: Date,
  ) {
    const access = this.accessTokens.get(accessTokenId);
    const session = this.sessions.get(sessionId);
    if (!access || access.sessionId !== sessionId || access.revokedAt ||
        access.expiresAt <= now || !session || !isActive(session, now)) return false;
    session.lastUsedAt = now;
    return true;
  }

  async rotateRefresh(input: MobileRefreshRotateInput) {
    const current = [...this.refreshTokens.values()].find(
      (token) => token.tokenHash === input.currentTokenHash,
    );
    if (!current) return { status: "missing" } as const;
    const session = this.sessions.get(current.sessionId);
    if (current.usedAt || current.revokedAt) {
      this.revokeFamily(current.sessionId, input.now);
      return { status: "reused" } as const;
    }
    if (!session || current.expiresAt <= input.now || !isActive(session, input.now)) {
      this.revokeFamily(current.sessionId, input.now);
      return { status: "expired" } as const;
    }
    current.usedAt = input.now;
    for (const token of this.accessTokens.values()) {
      if (token.sessionId === session.id && !token.revokedAt) token.revokedAt = input.now;
    }
    session.lastUsedAt = input.now;
    session.idleExpiresAt = input.idleExpiresAt < session.absoluteExpiresAt
      ? input.idleExpiresAt : session.absoluteExpiresAt;
    const accessId = this.id("access");
    this.accessTokens.set(accessId, {
      id: accessId,
      sessionId: session.id,
      tokenHash: input.nextAccessTokenHash,
      expiresAt: input.nextAccessExpiresAt < session.absoluteExpiresAt
        ? input.nextAccessExpiresAt : session.absoluteExpiresAt,
      revokedAt: null,
    });
    const refreshId = this.id("refresh");
    this.refreshTokens.set(refreshId, {
      id: refreshId,
      sessionId: session.id,
      tokenHash: input.nextRefreshTokenHash,
      expiresAt: input.nextRefreshExpiresAt < session.absoluteExpiresAt
        ? input.nextRefreshExpiresAt : session.absoluteExpiresAt,
      usedAt: null,
      revokedAt: null,
    });
    return { status: "rotated", session } as const;
  }

  async revokeSession(sessionId: string, now: Date) {
    if (!this.sessions.has(sessionId)) return false;
    this.revokeFamily(sessionId, now);
    return true;
  }

  async revokeByRefreshHash(tokenHash: string, now: Date) {
    const token = [...this.refreshTokens.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    );
    return token ? this.revokeSession(token.sessionId, now) : false;
  }

  async revokeAll(accountId: string, now: Date) {
    const sessions = [...this.sessions.values()].filter(
      (session) => session.accountId === accountId && !session.revokedAt,
    );
    sessions.forEach((session) => this.revokeFamily(session.id, now));
    return sessions.length;
  }

  async revokeForAccount(sessionId: string, accountId: string, now: Date) {
    const session = this.sessions.get(sessionId);
    if (!session || session.accountId !== accountId || session.revokedAt) return false;
    this.revokeFamily(sessionId, now);
    return true;
  }

  async listActive(accountId: string, now: Date) {
    return [...this.sessions.values()]
      .filter((session) => session.accountId === accountId && isActive(session, now))
      .sort((left, right) => right.lastUsedAt.getTime() - left.lastUsedAt.getTime());
  }

  async cleanup(
    tokenRetentionCutoff: Date,
    sessionRetentionCutoff: Date,
    limit: number,
  ) {
    this.cleanupLimits.push(limit);
    this.cleanupCutoffs.push({
      token: tokenRetentionCutoff,
      session: sessionRetentionCutoff,
    });
    const accessTokens = [...this.accessTokens.values()].filter((token) =>
      token.expiresAt <= tokenRetentionCutoff ||
      Boolean(token.revokedAt && token.revokedAt <= tokenRetentionCutoff),
    ).slice(0, limit);
    const refreshTokens = [...this.refreshTokens.values()].filter((token) =>
      token.expiresAt <= tokenRetentionCutoff ||
      Boolean(token.usedAt && token.usedAt <= tokenRetentionCutoff) ||
      Boolean(token.revokedAt && token.revokedAt <= tokenRetentionCutoff),
    ).slice(0, limit);
    accessTokens.forEach((token) => this.accessTokens.delete(token.id));
    refreshTokens.forEach((token) => this.refreshTokens.delete(token.id));
    const expired = [...this.sessions.values()].filter((session) =>
      session.idleExpiresAt <= sessionRetentionCutoff ||
      session.absoluteExpiresAt <= sessionRetentionCutoff ||
      Boolean(session.revokedAt && session.revokedAt <= sessionRetentionCutoff),
    ).slice(0, limit);
    for (const session of expired) {
      this.sessions.delete(session.id);
      for (const token of this.accessTokens.values()) {
        if (token.sessionId === session.id) this.accessTokens.delete(token.id);
      }
      for (const token of this.refreshTokens.values()) {
        if (token.sessionId === session.id) this.refreshTokens.delete(token.id);
      }
    }
    return accessTokens.length + refreshTokens.length + expired.length;
  }
}
