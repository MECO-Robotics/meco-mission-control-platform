import type {
  MobileDeviceSession,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import type { StoredMobileSession } from "./mobileSessionStoreTypes";

export function asStoredSession(
  record: MobileDeviceSession,
): StoredMobileSession {
  return record;
}

export async function revokeMobileTokenFamily(
  client: Prisma.TransactionClient,
  sessionId: string,
  now: Date,
) {
  await client.mobileDeviceSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
  await client.mobileAccessToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
  await client.mobileRefreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function cleanupMobileSessionRecords(
  client: PrismaClient,
  tokenRetentionCutoff: Date,
  sessionRetentionCutoff: Date,
  limit: number,
) {
  const sessions = await client.mobileDeviceSession.findMany({
    where: {
      OR: [
        { idleExpiresAt: { lte: sessionRetentionCutoff } },
        { absoluteExpiresAt: { lte: sessionRetentionCutoff } },
        { revokedAt: { lte: sessionRetentionCutoff } },
      ],
    },
    select: { id: true },
    take: limit,
  });
  const refreshTokens = await client.mobileRefreshToken.findMany({
    where: {
      OR: [
        { expiresAt: { lte: tokenRetentionCutoff } },
        { usedAt: { lte: tokenRetentionCutoff } },
        { revokedAt: { lte: tokenRetentionCutoff } },
      ],
    },
    select: { id: true },
    take: limit,
  });
  const accessTokens = await client.mobileAccessToken.findMany({
    where: {
      OR: [
        { expiresAt: { lte: tokenRetentionCutoff } },
        { revokedAt: { lte: tokenRetentionCutoff } },
      ],
    },
    select: { id: true },
    take: limit,
  });
  const [deletedAccess, deletedRefresh, deletedSessions] = await client.$transaction([
    client.mobileAccessToken.deleteMany({
      where: { id: { in: accessTokens.map(({ id }) => id) } },
    }),
    client.mobileRefreshToken.deleteMany({
      where: { id: { in: refreshTokens.map(({ id }) => id) } },
    }),
    client.mobileDeviceSession.deleteMany({
      where: { id: { in: sessions.map(({ id }) => id) } },
    }),
  ]);
  return deletedAccess.count + deletedRefresh.count + deletedSessions.count;
}
