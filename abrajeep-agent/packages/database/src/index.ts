import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

let prisma: PrismaClient | undefined;

/**
 * Singleton do PrismaClient — evita esgotar o pool de conexões em dev/hot-reload.
 */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
