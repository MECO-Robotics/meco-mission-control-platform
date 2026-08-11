import { PrismaClient, type WebSession } from "@prisma/client";

export type WebSessionCreateRecord = Omit<
  WebSession,
  "id" | "createdAt" | "updatedAt" | "revokedAt"
>;

export interface WebSessionStore {
  create(record: WebSessionCreateRecord): Promise<WebSession>;
  deleteInactiveBefore(cutoff: Date): Promise<number>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<WebSession | null>;
  revoke(id: string, revokedAt: Date): Promise<boolean>;
}

let prisma: PrismaClient | null = null;

export function getPrismaWebSessionStore(): WebSessionStore {
  prisma ??= new PrismaClient();

  return {
    create: (record) => prisma!.webSession.create({ data: record }),
    async deleteInactiveBefore(cutoff) {
      const result = await prisma!.webSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: cutoff } },
            { revokedAt: { lte: cutoff } },
          ],
        },
      });
      return result.count;
    },
    findActiveByTokenHash: (tokenHash, now) =>
      prisma!.webSession.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      }),
    async revoke(id, revokedAt) {
      const result = await prisma!.webSession.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt },
      });
      return result.count === 1;
    },
  };
}

export async function disconnectWebSessionStore() {
  if (!prisma) {
    return;
  }

  await prisma.$disconnect();
  prisma = null;
}
