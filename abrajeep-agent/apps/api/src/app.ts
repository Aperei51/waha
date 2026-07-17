import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { getConfig, type AppConfig } from './config';
import { AppError } from './core/errors';
import { createLogger, newCorrelationId } from './core/logger';
import { createAIProvider } from './modules/ai';
import type { AIProvider } from './modules/ai/types';
import { AgentOrchestrator } from './modules/agent/orchestrator';
import { adminAuthRoutes } from './modules/admin/auth-routes';
import { adminConversationRoutes } from './modules/admin/conversation-routes';
import { adminDirectoryRoutes } from './modules/admin/directory-routes';
import { adminDocumentRoutes } from './modules/admin/document-routes';
import { adminLgpdRoutes } from './modules/admin/lgpd-routes';
import { adminMetricsRoutes } from './modules/admin/metrics-routes';
import { healthRoutes } from './modules/health/routes';
import { KnowledgeService } from './modules/knowledge/service';
import { publicRoutes } from './modules/public/routes';
import { createWhatsAppProvider } from './modules/whatsapp';
import { whatsappWebhookRoutes } from './modules/whatsapp/routes';
import type { WhatsAppProvider } from './modules/whatsapp/types';

export interface BuildAppOptions {
  config?: AppConfig;
  whatsappProvider?: WhatsAppProvider;
  aiProvider?: AIProvider;
}

/**
 * Monta a aplicação Fastify com todas as dependências.
 * Providers podem ser injetados em testes.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? getConfig();
  const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');

  const app = Fastify({
    logger,
    genReqId: () => newCorrelationId(),
    disableRequestLogging: config.NODE_ENV === 'test',
    bodyLimit: config.UPLOAD_MAX_BYTES,
  });

  // Guarda o corpo bruto (necessário para validar assinatura de webhook)
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as typeof req & { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      const text = (body as Buffer).toString('utf8');
      done(null, text.length > 0 ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Correlation ID em todas as respostas
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-correlation-id', request.id);
  });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });
  await app.register(multipart, {
    limits: { fileSize: config.UPLOAD_MAX_BYTES, files: 1 },
  });

  // Tratamento centralizado de erros — nunca vaza detalhes internos
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.expose ? error.message : 'Erro interno',
      });
    }
    const fastifyError = error as { statusCode?: number; message?: string };
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply
        .status(fastifyError.statusCode)
        .send({ error: 'REQUEST_ERROR', message: fastifyError.message });
    }
    request.log.error({ err: error }, 'Erro não tratado');
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Erro interno' });
  });

  // ------------------------- Dependências -------------------------
  const whatsapp = options.whatsappProvider ?? createWhatsAppProvider(config, logger);
  const ai = options.aiProvider ?? createAIProvider(config, logger);
  const knowledge = new KnowledgeService(ai, config, logger);
  const orchestrator = new AgentOrchestrator(ai, whatsapp, knowledge, config, logger);

  app.decorate('whatsappProvider', whatsapp);
  app.decorate('aiProvider', ai);

  // ------------------------- Rotas -------------------------
  await app.register(healthRoutes);
  await app.register(publicRoutes);
  await app.register(whatsappWebhookRoutes, { orchestrator, config });
  await app.register(adminAuthRoutes);
  await app.register(adminConversationRoutes, { whatsapp });
  await app.register(adminDirectoryRoutes);
  await app.register(adminDocumentRoutes, { knowledge });
  await app.register(adminMetricsRoutes);
  await app.register(adminLgpdRoutes);

  // O genérico do logger pino difere do FastifyBaseLogger apenas na assinatura
  return app as unknown as FastifyInstance;
}

declare module 'fastify' {
  interface FastifyInstance {
    whatsappProvider: WhatsAppProvider;
    aiProvider: AIProvider;
  }
}
