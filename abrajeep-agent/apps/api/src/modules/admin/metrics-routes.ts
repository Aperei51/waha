import { getPrisma } from '@abrajeep/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdminAuth } from '../../core/auth';

/** Métricas de uso, custos estimados, erros, auditoria e feedback. */
export async function adminMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdminAuth);

  app.get('/admin/metrics', async () => {
    const prisma = getPrisma();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalConversations,
      openConversations,
      waitingHuman,
      totalMessages,
      totalUsers,
      failedWebhooks,
      costAgg,
      feedbackAgg,
      toolCallErrors,
    ] = await Promise.all([
      prisma.conversation.count({ where: { deletedAt: null } }),
      prisma.conversation.count({
        where: { status: { in: ['OPEN', 'AGENT_HANDLING'] }, deletedAt: null },
      }),
      prisma.conversation.count({ where: { status: 'WAITING_HUMAN', deletedAt: null } }),
      prisma.message.count({ where: { createdAt: { gte: since } } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.webhookEvent.count({ where: { status: 'failed' } }),
      prisma.message.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      }),
      prisma.feedback.aggregate({ _avg: { rating: true }, _count: true }),
      prisma.toolCall.count({ where: { status: 'error', createdAt: { gte: since } } }),
    ]);

    return {
      conversations: {
        total: totalConversations,
        open: openConversations,
        waitingHuman,
      },
      messagesLast30d: totalMessages,
      users: totalUsers,
      errors: { failedWebhooks, toolCallErrors },
      costLast30d: {
        estimatedUsd: Number(costAgg._sum.estimatedCostUsd ?? 0),
        inputTokens: costAgg._sum.inputTokens ?? 0,
        outputTokens: costAgg._sum.outputTokens ?? 0,
      },
      feedback: {
        averageRating: feedbackAgg._avg.rating,
        count: feedbackAgg._count,
      },
    };
  });

  app.get('/admin/audit-logs', async (request) => {
    const query = z
      .object({
        action: z.string().max(80).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);
    const prisma = getPrisma();
    const where = { action: query.action ? { contains: query.action } : undefined };
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  });

  app.get('/admin/feedback', async () => {
    return getPrisma().feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { name: true, phone: true } } },
    });
  });
}
