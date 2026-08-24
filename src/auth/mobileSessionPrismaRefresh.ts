import type { PrismaClient } from "@prisma/client";

import { asStoredSession, revokeMobileTokenFamily } from "./mobileSessionPrismaHelpers";
import type {
  MobileRefreshRotateInput,
  MobileRefreshRotateResult,
} from "./mobileSessionStoreTypes";

export function rotateMobileRefresh(
  client: PrismaClient,
  input: MobileRefreshRotateInput,
): Promise<MobileRefreshRotateResult> {
  return client.$transaction(async (tx) => {
    const current = await tx.mobileRefreshToken.findUnique({
      where: { tokenHash: input.currentTokenHash },
      include: { session: true },
    });
    if (!current) return { status: "missing" };
    if (current.usedAt || current.revokedAt) {
      await revokeMobileTokenFamily(tx, current.sessionId, input.now);
      return { status: "reused" };
    }
    const inactive = current.expiresAt <= input.now ||
      current.session.revokedAt !== null ||
      current.session.idleExpiresAt <= input.now ||
      current.session.absoluteExpiresAt <= input.now;
    if (inactive) {
      await revokeMobileTokenFamily(tx, current.sessionId, input.now);
      return { status: "expired" };
    }
    const consumed = await tx.mobileRefreshToken.updateMany({
      where: { id: current.id, usedAt: null, revokedAt: null },
      data: { usedAt: input.now },
    });
    if (consumed.count !== 1) {
      await revokeMobileTokenFamily(tx, current.sessionId, input.now);
      return { status: "reused" };
    }
    const idleExpiresAt = input.idleExpiresAt < current.session.absoluteExpiresAt
      ? input.idleExpiresAt
      : current.session.absoluteExpiresAt;
    const active = await tx.mobileDeviceSession.updateMany({
      where: {
        id: current.sessionId,
        revokedAt: null,
        idleExpiresAt: { gt: input.now },
        absoluteExpiresAt: { gt: input.now },
      },
      data: { lastUsedAt: input.now, idleExpiresAt },
    });
    if (active.count !== 1) {
      await revokeMobileTokenFamily(tx, current.sessionId, input.now);
      return { status: "expired" };
    }
    await tx.mobileAccessToken.updateMany({
      where: { sessionId: current.sessionId, revokedAt: null },
      data: { revokedAt: input.now },
    });
    await tx.mobileAccessToken.create({
      data: {
        sessionId: current.sessionId,
        tokenHash: input.nextAccessTokenHash,
        expiresAt: input.nextAccessExpiresAt < current.session.absoluteExpiresAt
          ? input.nextAccessExpiresAt
          : current.session.absoluteExpiresAt,
      },
    });
    await tx.mobileRefreshToken.create({
      data: {
        sessionId: current.sessionId,
        tokenHash: input.nextRefreshTokenHash,
        expiresAt: input.nextRefreshExpiresAt < current.session.absoluteExpiresAt
          ? input.nextRefreshExpiresAt
          : current.session.absoluteExpiresAt,
      },
    });
    return {
      status: "rotated",
      session: asStoredSession({
        ...current.session,
        lastUsedAt: input.now,
        idleExpiresAt,
      }),
    };
  });
}
