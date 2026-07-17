import { getPrisma } from '@abrajeep/database';
import type { FastifyInstance } from 'fastify';

/** Health check (processo vivo) e readiness (dependências prontas). */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/ready', async (_request, reply) => {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'not_ready', database: 'unreachable' });
    }
  });
}
