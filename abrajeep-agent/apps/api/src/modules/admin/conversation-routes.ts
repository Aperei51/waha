import { getPrisma, type ConversationStatus, type Prisma } from '@abrajeep/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdminAuth } from '../../core/auth';
import { NotFoundError, ValidationError } from '../../core/errors';
import {
  claimConversation,
  closeConversation,
  resolveConversation,
  returnToAgent,
} from '../handoff/service';
import type { WhatsAppProvider } from '../whatsapp/types';

const listQuerySchema = z.object({
  status: z
    .enum(['OPEN', 'AGENT_HANDLING', 'WAITING_HUMAN', 'HUMAN_HANDLING', 'RESOLVED', 'CLOSED'])
    .optional(),
  q: z.string().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function adminConversationRoutes(
  app: FastifyInstance,
  opts: { whatsapp: WhatsAppProvider },
): Promise<void> {
  app.addHook('preHandler', requireAdminAuth);

  app.get('/admin/conversations', async (request) => {
    const query = listQuerySchema.parse(request.query);
    const prisma = getPrisma();

    const where: Prisma.ConversationWhereInput = {
      deletedAt: null,
      status: query.status,
      createdAt: { gte: query.from, lte: query.to },
      user: query.q
        ? {
            OR: [
              { phone: { contains: query.q } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : undefined,
    };

    const [total, items] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true, role: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { total, page: query.page, pageSize: query.pageSize, items };
  });

  app.get('/admin/conversations/:id', async (request) => {
    const { id } = request.params as { id: string };
    const conversation = await getPrisma().conversation.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, phone: true, role: true, organizationId: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { attachments: true, toolCalls: true },
        },
        agentActions: { orderBy: { createdAt: 'asc' } },
        feedbacks: true,
      },
    });
    if (!conversation) throw new NotFoundError('Conversa não encontrada');
    return conversation;
  });

  app.post('/admin/conversations/:id/claim', async (request) => {
    const { id } = request.params as { id: string };
    await claimConversation(id, request.adminUser!.sub);
    return { ok: true };
  });

  app.post('/admin/conversations/:id/return-to-agent', async (request) => {
    const { id } = request.params as { id: string };
    await returnToAgent(id, request.adminUser!.sub);
    return { ok: true };
  });

  app.post('/admin/conversations/:id/resolve', async (request) => {
    const { id } = request.params as { id: string };
    await resolveConversation(id, request.adminUser!.sub);
    return { ok: true };
  });

  app.post('/admin/conversations/:id/close', async (request) => {
    const { id } = request.params as { id: string };
    await closeConversation(id, request.adminUser!.sub);
    return { ok: true };
  });

  /** Operador envia mensagem manual (somente em atendimento humano). */
  app.post('/admin/conversations/:id/messages', async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ text: z.string().min(1).max(4096) }).parse(request.body);
    const prisma = getPrisma();

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!conversation) throw new NotFoundError('Conversa não encontrada');
    if ((conversation.status as ConversationStatus) !== 'HUMAN_HANDLING') {
      throw new ValidationError('A conversa precisa estar em atendimento humano para envio manual');
    }

    const sent = await opts.whatsapp.sendText(conversation.user.phone, body.text);
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        direction: 'OUTBOUND',
        providerMessageId: sent.providerMessageId,
        type: 'text',
        text: body.text,
        authorType: 'operator',
        authorId: request.adminUser!.sub,
      },
    });
    await prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    return message;
  });
}
