import { PrismaClient } from "@prisma/client";

import {
  asStoredSession,
  cleanupMobileSessionRecords,
  revokeMobileTokenFamily,
} from "./mobileSessionPrismaHelpers";
import { rotateMobileRefresh } from "./mobileSessionPrismaRefresh";

import type {
  MobileRefreshRotateInput,
  MobileRefreshRotateResult,
  MobileSessionCreateInput,
  MobileSessionStore,
} from "./mobileSessionStoreTypes";

let prisma: PrismaClient | null = null;

export function createPrismaMobileSessionStore(
  client: PrismaClient,
): MobileSessionStore {
  return {
    async createSession(input: MobileSessionCreateInput) {
      return client.$transaction(async (tx) => {
        const existing = await tx.mobileDeviceSession.findMany({
          where: {
            accountId: input.user.accountId,
            deviceId: input.deviceId,
            revokedAt: null,
          },
          select: { id: true },
        });
        for (const session of existing) {
          await revokeMobileTokenFamily(tx, session.id, input.now);
        }

        const session = await tx.mobileDeviceSession.create({
          data: {
            accountId: input.user.accountId,
            authProvider: input.user.authProvider,
            email: input.user.email,
            name: input.user.name,
            picture: input.user.picture,
            hostedDomain: input.user.hostedDomain,
            role: input.user.role,
            deviceId: input.deviceId,
            deviceName: input.deviceName,
            lastUsedAt: input.now,
            idleExpiresAt: input.idleExpiresAt,
            absoluteExpiresAt: input.absoluteExpiresAt,
            accessTokens: {
              create: {
                tokenHash: input.accessTokenHash,
                expiresAt: input.accessExpiresAt,
              },
            },
            refreshTokens: {
              create: {
                tokenHash: input.refreshTokenHash,
                expiresAt: input.refreshExpiresAt,
              },
            },
          },
        });
        return asStoredSession(session);
      });
    },

    async findAccess(tokenHash, now) {
      const access = await client.mobileAccessToken.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
          session: {
            revokedAt: null,
            idleExpiresAt: { gt: now },
            absoluteExpiresAt: { gt: now },
          },
        },
        include: { session: true },
      });
      return access
        ? { accessTokenId: access.id, session: asStoredSession(access.session) }
        : null;
    },

    async touchAccess(accessTokenId, sessionId, now) {
      return client.$transaction(async (tx) => {
        const session = await tx.mobileDeviceSession.updateMany({
          where: {
            id: sessionId,
            revokedAt: null,
            idleExpiresAt: { gt: now },
            absoluteExpiresAt: { gt: now },
          },
          data: { lastUsedAt: now },
        });
        if (session.count !== 1) {
          return false;
        }
        const access = await tx.mobileAccessToken.count({
          where: {
            id: accessTokenId,
            sessionId,
            revokedAt: null,
            expiresAt: { gt: now },
          },
        });
        return access === 1;
      });
    },

    async rotateRefresh(input: MobileRefreshRotateInput): Promise<MobileRefreshRotateResult> {
      return rotateMobileRefresh(client, input);
    },

    async revokeSession(sessionId, now) {
      const session = await client.mobileDeviceSession.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      if (!session) return false;
      await client.$transaction(async (tx) => {
        await revokeMobileTokenFamily(tx, sessionId, now);
      });
      return true;
    },

    async revokeByRefreshHash(tokenHash, now) {
      const token = await client.mobileRefreshToken.findUnique({
        where: { tokenHash },
        select: { sessionId: true },
      });
      return token ? this.revokeSession(token.sessionId, now) : false;
    },

    async revokeAll(accountId, now) {
      const sessions = await client.mobileDeviceSession.findMany({
        where: { accountId, revokedAt: null },
        select: { id: true },
      });
      await client.$transaction(async (tx) => {
        for (const session of sessions) {
          await revokeMobileTokenFamily(tx, session.id, now);
        }
      });
      return sessions.length;
    },

    async revokeForAccount(sessionId, accountId, now) {
      const session = await client.mobileDeviceSession.findFirst({
        where: { id: sessionId, accountId, revokedAt: null },
        select: { id: true },
      });
      return session ? this.revokeSession(session.id, now) : false;
    },

    async listActive(accountId, now) {
      const sessions = await client.mobileDeviceSession.findMany({
        where: {
          accountId,
          revokedAt: null,
          idleExpiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
        },
        orderBy: { lastUsedAt: "desc" },
      });
      return sessions.map(asStoredSession);
    },

    async cleanup(tokenRetentionCutoff, sessionRetentionCutoff, limit) {
      return cleanupMobileSessionRecords(
        client,
        tokenRetentionCutoff,
        sessionRetentionCutoff,
        limit,
      );
    },
  };
}

export function getPrismaMobileSessionStore() {
  prisma ??= new PrismaClient();
  return createPrismaMobileSessionStore(prisma);
}

export async function disconnectMobileSessionStore() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
}
