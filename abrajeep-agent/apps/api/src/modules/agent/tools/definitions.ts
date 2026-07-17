import { canReadDocument } from '@abrajeep/shared';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getConfig } from '../../../config';
import { requestHumanHandoff } from '../../handoff/service';
import type { ToolContext, ToolRegistry } from './registry';

/**
 * Funções iniciais do agente. Funções sem integração real (NPS, treinamentos)
 * retornam dados de demonstração claramente rotulados — o agente é instruído
 * a nunca apresentá-los como oficiais.
 */

const DEMO_LABEL =
  'ATENÇÃO: dados de demonstração (integração real pendente). Informe isso ao usuário.';

export function signDocumentDownloadToken(documentId: string): string {
  const config = getConfig();
  return jwt.sign({ documentId, purpose: 'document-download' }, config.JWT_SECRET, {
    expiresIn: '15m',
  });
}

export function verifyDocumentDownloadToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, getConfig().JWT_SECRET) as jwt.JwtPayload;
    if (decoded.purpose !== 'document-download') return null;
    return String(decoded.documentId);
  } catch {
    return null;
  }
}

export function registerDefaultTools(registry: ToolRegistry): void {
  registry.register({
    name: 'buscar_documentos',
    description:
      'Busca semântica na base de conhecimento da ABRAJEEP (comunicados, procedimentos, políticas, metas). Use antes de responder qualquer pergunta institucional.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Pergunta ou termos de busca' },
        limit: { type: 'number', description: 'Máximo de resultados (1-10)', default: 5 },
      },
      required: ['query'],
    },
    schema: z.object({
      query: z.string().min(2).max(500),
      limit: z.number().int().min(1).max(10).default(5).optional(),
    }),
    handler: async (args: { query: string; limit?: number }, ctx: ToolContext) => {
      const results = await ctx.services.knowledge.search(ctx.user, args.query, {
        limit: args.limit ?? 5,
      });
      if (results.length === 0) {
        return {
          results: [],
          message:
            'Nenhum documento autorizado encontrado. Diga ao usuário que não há fonte confiável e ofereça atendimento humano.',
        };
      }
      return {
        results: results.map((r) => ({
          documentId: r.documentId,
          chunkId: r.chunkId,
          title: r.title,
          excerpt: r.excerpt,
          score: Number(r.score.toFixed(4)),
          version: r.version,
          category: r.categoryName,
        })),
      };
    },
  });

  registry.register({
    name: 'listar_comunicados',
    description: 'Lista os comunicados mais recentes disponíveis para o usuário.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', default: 5 } },
      required: [],
    },
    schema: z.object({ limit: z.number().int().min(1).max(10).default(5).optional() }),
    handler: async (args: { limit?: number }, ctx: ToolContext) => {
      const docs = await ctx.services.prisma.document.findMany({
        where: {
          status: 'active',
          deletedAt: null,
          category: { slug: 'comunicados' },
        },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        include: { category: true },
      });
      const visible = docs
        .filter((d) =>
          canReadDocument(ctx.user, {
            audience: d.audience,
            organizationId: d.organizationId,
            dealershipId: d.dealershipId,
          }),
        )
        .slice(0, args.limit ?? 5);
      return {
        comunicados: visible.map((d) => ({
          documentId: d.id,
          title: d.title,
          publishedAt: d.publishedAt,
        })),
      };
    },
  });

  registry.register({
    name: 'consultar_treinamentos',
    description: 'Consulta os próximos treinamentos disponíveis (agenda).',
    parameters: { type: 'object', properties: {}, required: [] },
    schema: z.object({}),
    handler: async (_args: Record<string, never>, ctx: ToolContext) => {
      const docs = await ctx.services.knowledge.search(ctx.user, 'treinamento agenda inscrições', {
        limit: 3,
      });
      return {
        note: DEMO_LABEL,
        agenda: [
          { curso: 'Jeep Avenger — Sistema 400V', formato: 'online', inscricoes: 'portal do associado' },
        ],
        documentosRelacionados: docs.map((d) => ({ title: d.title, documentId: d.documentId })),
      };
    },
  });

  registry.register({
    name: 'abrir_solicitacao',
    description:
      'Abre uma solicitação (ticket) para uma área da ABRAJEEP, como a comissão de assistência técnica. Confirme com o usuário antes de executar.',
    parameters: {
      type: 'object',
      properties: {
        assunto: { type: 'string' },
        descricao: { type: 'string' },
        area: { type: 'string', description: 'Área de destino, ex.: assistência técnica' },
      },
      required: ['assunto', 'descricao'],
    },
    schema: z.object({
      assunto: z.string().min(3).max(200),
      descricao: z.string().min(3).max(4000),
      area: z.string().max(120).optional(),
    }),
    allowedRoles: ['ASSOCIATE', 'DEALERSHIP', 'MANAGER', 'OPERATOR', 'ADMIN'],
    handler: async (
      args: { assunto: string; descricao: string; area?: string },
      ctx: ToolContext,
    ) => {
      const ticket = await ctx.services.prisma.ticket.create({
        data: {
          organizationId: ctx.user.organizationId,
          dealershipId: ctx.user.dealershipId,
          requesterId: ctx.user.id,
          subject: args.assunto,
          description: args.descricao,
          area: args.area,
          status: 'open',
        },
      });
      await ctx.services.prisma.ticketEvent.create({
        data: { ticketId: ticket.id, type: 'created', actorId: ctx.user.id },
      });
      return {
        ticketId: ticket.id,
        protocolo: ticket.id.slice(0, 8).toUpperCase(),
        status: 'open',
        message: 'Solicitação registrada com sucesso. Informe o protocolo ao usuário.',
      };
    },
  });

  registry.register({
    name: 'consultar_solicitacao',
    description: 'Consulta o status de uma solicitação pelo protocolo ou ID.',
    parameters: {
      type: 'object',
      properties: { protocolo: { type: 'string' } },
      required: ['protocolo'],
    },
    schema: z.object({ protocolo: z.string().min(4).max(64) }),
    handler: async (args: { protocolo: string }, ctx: ToolContext) => {
      const prefix = args.protocolo.toLowerCase();
      const tickets = await ctx.services.prisma.ticket.findMany({
        where: { requesterId: ctx.user.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const ticket = tickets.find((t) => t.id === prefix || t.id.startsWith(prefix));
      if (!ticket) {
        return { found: false, message: 'Nenhuma solicitação do usuário com este protocolo.' };
      }
      return {
        found: true,
        protocolo: ticket.id.slice(0, 8).toUpperCase(),
        assunto: ticket.subject,
        status: ticket.status,
        criadaEm: ticket.createdAt,
      };
    },
  });

  registry.register({
    name: 'transferir_para_humano',
    description:
      'Transfere a conversa para atendimento humano. Use quando o usuário pedir ou quando não houver resposta confiável.',
    parameters: {
      type: 'object',
      properties: { motivo: { type: 'string' } },
      required: [],
    },
    schema: z.object({ motivo: z.string().max(500).optional() }),
    handler: async (args: { motivo?: string }, ctx: ToolContext) => {
      await requestHumanHandoff(ctx.conversationId, args.motivo ?? 'Solicitado pelo agente', null);
      return {
        transferred: true,
        message:
          'Conversa transferida para a fila de atendimento humano. Confirme ao usuário que uma pessoa dará continuidade.',
      };
    },
  });

  registry.register({
    name: 'identificar_usuario',
    description:
      'Retorna o estado de identificação do usuário atual e orienta o processo de validação quando necessário.',
    parameters: { type: 'object', properties: {}, required: [] },
    schema: z.object({}),
    handler: async (_args: Record<string, never>, ctx: ToolContext) => {
      return {
        identified: ctx.user.role !== 'VISITOR',
        role: ctx.user.role,
        note:
          ctx.user.role === 'VISITOR'
            ? 'Usuário não identificado: apenas informações públicas. A validação de identidade (código por WhatsApp/e-mail) ainda não está disponível — oriente a contatar a ABRAJEEP.'
            : 'Usuário identificado pelo telefone.',
      };
    },
  });

  registry.register({
    name: 'consultar_perfil',
    description: 'Retorna os dados cadastrais do próprio usuário.',
    parameters: { type: 'object', properties: {}, required: [] },
    schema: z.object({}),
    handler: async (_args: Record<string, never>, ctx: ToolContext) => {
      const user = await ctx.services.prisma.user.findUnique({
        where: { id: ctx.user.id },
        include: { organization: true, dealership: true },
      });
      if (!user) return { found: false };
      return {
        found: true,
        nome: user.name,
        perfil: user.role,
        empresa: user.organization?.name ?? null,
        concessionaria: user.dealership?.name ?? null,
        cargo: user.jobTitle,
      };
    },
  });

  registry.register({
    name: 'enviar_documento',
    description:
      'Envia um documento da base de conhecimento ao usuário pelo WhatsApp. Use o documentId retornado por buscar_documentos ou listar_comunicados. Confirme com o usuário antes.',
    parameters: {
      type: 'object',
      properties: { documentId: { type: 'string' } },
      required: ['documentId'],
    },
    schema: z.object({ documentId: z.string().uuid() }),
    handler: async (args: { documentId: string }, ctx: ToolContext) => {
      const doc = await ctx.services.prisma.document.findUnique({ where: { id: args.documentId } });
      if (!doc || doc.deletedAt || doc.status !== 'active') {
        return { sent: false, message: 'Documento não encontrado ou arquivado.' };
      }
      const allowed = canReadDocument(ctx.user, {
        audience: doc.audience,
        organizationId: doc.organizationId,
        dealershipId: doc.dealershipId,
      });
      if (!allowed) {
        return { sent: false, message: 'O usuário não tem permissão para receber este documento.' };
      }
      if (!doc.storagePath) {
        return {
          sent: false,
          message: 'Este documento não possui arquivo anexado (somente conteúdo textual).',
        };
      }
      const token = signDocumentDownloadToken(doc.id);
      const url = `${ctx.services.config.API_PUBLIC_URL}/public/documents/${doc.id}?token=${token}`;
      await ctx.services.whatsapp.sendDocument(ctx.user.phone, {
        url,
        fileName: doc.fileName ?? `${doc.title}.pdf`,
        caption: doc.title,
      });
      return { sent: true, title: doc.title };
    },
  });

  registry.register({
    name: 'registrar_feedback',
    description: 'Registra feedback ou avaliação do usuário sobre o atendimento.',
    parameters: {
      type: 'object',
      properties: {
        nota: { type: 'number', description: 'Nota de 1 a 5' },
        comentario: { type: 'string' },
      },
      required: [],
    },
    schema: z.object({
      nota: z.number().int().min(1).max(5).optional(),
      comentario: z.string().max(2000).optional(),
    }),
    handler: async (args: { nota?: number; comentario?: string }, ctx: ToolContext) => {
      await ctx.services.prisma.feedback.create({
        data: {
          conversationId: ctx.conversationId,
          userId: ctx.user.id,
          rating: args.nota,
          comment: args.comentario,
        },
      });
      return { saved: true, message: 'Feedback registrado. Agradeça ao usuário.' };
    },
  });

  registry.register({
    name: 'consultar_nps',
    description:
      'Consulta indicadores de NPS da concessionária do usuário. Restrito a concessionárias, gestores e administradores.',
    parameters: { type: 'object', properties: {}, required: [] },
    schema: z.object({}),
    allowedRoles: ['DEALERSHIP', 'MANAGER', 'ADMIN'],
    handler: async (_args: Record<string, never>, ctx: ToolContext) => {
      if (!ctx.user.dealershipId && ctx.user.role === 'DEALERSHIP') {
        return { available: false, message: 'Usuário sem concessionária vinculada.' };
      }
      return {
        available: true,
        note: DEMO_LABEL,
        indicador: { nps: 84, periodo: '2026-T2', metaRede: 87 },
      };
    },
  });

  registry.register({
    name: 'consultar_concessionaria',
    description: 'Retorna os dados e resultados da concessionária vinculada ao usuário.',
    parameters: { type: 'object', properties: {}, required: [] },
    schema: z.object({}),
    allowedRoles: ['DEALERSHIP', 'MANAGER', 'ADMIN'],
    handler: async (_args: Record<string, never>, ctx: ToolContext) => {
      if (!ctx.user.dealershipId) {
        return { found: false, message: 'Usuário sem concessionária vinculada.' };
      }
      const dealership = await ctx.services.prisma.dealership.findUnique({
        where: { id: ctx.user.dealershipId },
      });
      if (!dealership) return { found: false };
      return {
        found: true,
        nome: dealership.name,
        codigo: dealership.code,
        cidade: dealership.city,
        uf: dealership.state,
        note: `Resultados comerciais: ${DEMO_LABEL}`,
      };
    },
  });
}
