import { getPrisma } from '@abrajeep/database';
import type { FastifyInstance } from 'fastify';
import { requireAdminAuth, requireAdminRole } from '../../core/auth';
import { audit } from '../../core/audit';
import { NotFoundError } from '../../core/errors';

/**
 * Endpoints LGPD (somente administradores):
 * - exportação completa dos dados de um titular;
 * - anonimização (direito de eliminação preservando integridade referencial);
 * - consulta de consentimento.
 */
export async function adminLgpdRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdminAuth);
  app.addHook('preHandler', requireAdminRole);

  app.get('/admin/lgpd/users/:id/export', async (request) => {
    const { id } = request.params as { id: string };
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true } },
        dealership: { select: { name: true } },
        conversations: {
          include: { messages: { include: { attachments: true } } },
        },
        tickets: { include: { events: true } },
        feedbacks: true,
      },
    });
    if (!user) throw new NotFoundError('Usuário não encontrado');

    await audit({
      actorType: 'admin',
      action: 'lgpd.export',
      userId: request.adminUser!.sub,
      resource: 'user',
      resourceId: id,
      ip: request.ip,
    });

    const { passwordHash: _omitted, ...safeUser } = user;
    return { exportedAt: new Date().toISOString(), data: safeUser };
  });

  app.post('/admin/lgpd/users/:id/anonymize', async (request) => {
    const { id } = request.params as { id: string };
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundError('Usuário não encontrado');

    const suffix = id.slice(0, 8);
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          name: `Anonimizado-${suffix}`,
          phone: `anon-${suffix}`,
          email: null,
          jobTitle: null,
          passwordHash: null,
          status: 'blocked',
          anonymizedAt: new Date(),
          deletedAt: new Date(),
        },
      }),
      // Remove conteúdo textual das mensagens do titular
      prisma.message.updateMany({
        where: { conversation: { userId: id } },
        data: { text: '[removido a pedido do titular]', transcription: null },
      }),
      prisma.feedback.updateMany({
        where: { userId: id },
        data: { comment: '[removido a pedido do titular]' },
      }),
    ]);

    await audit({
      actorType: 'admin',
      action: 'lgpd.anonymize',
      userId: request.adminUser!.sub,
      resource: 'user',
      resourceId: id,
      ip: request.ip,
    });
    return { ok: true, anonymized: true };
  });

  app.get('/admin/lgpd/users/:id/consents', async (request) => {
    const { id } = request.params as { id: string };
    const user = await getPrisma().user.findUnique({
      where: { id },
      select: { consentGivenAt: true, consentPurpose: true, anonymizedAt: true },
    });
    if (!user) throw new NotFoundError('Usuário não encontrado');
    return user;
  });
}
