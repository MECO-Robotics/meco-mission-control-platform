import type { SessionUser } from "./authService";

export interface StoredMobileSession {
  id: string;
  accountId: string;
  authProvider: string;
  email: string;
  name: string;
  picture: string | null;
  hostedDomain: string;
  role: string;
  deviceId: string;
  deviceName: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export interface MobileSessionCreateInput {
  user: SessionUser;
  deviceId: string;
  deviceName: string | null;
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  now: Date;
}

export interface MobileAccessLookup {
  accessTokenId: string;
  session: StoredMobileSession;
}

export interface MobileRefreshRotateInput {
  currentTokenHash: string;
  nextAccessTokenHash: string;
  nextAccessExpiresAt: Date;
  nextRefreshTokenHash: string;
  nextRefreshExpiresAt: Date;
  idleExpiresAt: Date;
  now: Date;
}

export type MobileRefreshRotateResult =
  | { status: "missing" | "expired" | "reused" }
  | { status: "rotated"; session: StoredMobileSession };

export interface MobileSessionStore {
  cleanup(
    tokenRetentionCutoff: Date,
    sessionRetentionCutoff: Date,
    limit: number,
  ): Promise<number>;
  createSession(input: MobileSessionCreateInput): Promise<StoredMobileSession>;
  findAccess(tokenHash: string, now: Date): Promise<MobileAccessLookup | null>;
  listActive(accountId: string, now: Date): Promise<StoredMobileSession[]>;
  revokeAll(accountId: string, now: Date): Promise<number>;
  revokeByRefreshHash(tokenHash: string, now: Date): Promise<boolean>;
  revokeForAccount(sessionId: string, accountId: string, now: Date): Promise<boolean>;
  revokeSession(sessionId: string, now: Date): Promise<boolean>;
  rotateRefresh(input: MobileRefreshRotateInput): Promise<MobileRefreshRotateResult>;
  touchAccess(
    accessTokenId: string,
    sessionId: string,
    now: Date,
  ): Promise<boolean>;
}
