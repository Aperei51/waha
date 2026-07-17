import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AgentOrchestrator } from '../agent/orchestrator';
import type { AppConfig } from '../../config';
import { verifyMetaSignature } from './signature';
import { parseWebhookPayload } from './webhook-parser';

interface VerifyQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

/**
 * Webhooks da WhatsApp Cloud API.
 * - GET: verificação do endpoint (challenge da Meta).
 * - POST: recebimento de mensagens. Responde 200 imediatamente e processa
 *   de forma assíncrona — a Meta reenvia eventos se a resposta demorar.
 */
export async function whatsappWebhookRoutes(
  app: FastifyInstance,
  opts: { orchestrator: AgentOrchestrator; config: AppConfig },
): Promise<void> {
  const config = opts.config;

  app.get('/webhooks/whatsapp', async (request, reply) => {
    const query = request.query as VerifyQuery;
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      return reply.status(200).send(query['hub.challenge'] ?? '');
    }
    return reply.status(403).send({ error: 'Token de verificação inválido' });
  });

  app.post('/webhooks/whatsapp', async (request, reply) => {
    // Validação de assinatura: obrigatória quando o App Secret está configurado
    if (config.WHATSAPP_APP_SECRET) {
      const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
      const signature = request.headers['x-hub-signature-256'] as string | undefined;
      if (!rawBody || !verifyMetaSignature(rawBody, signature, config.WHATSAPP_APP_SECRET)) {
        request.log.warn('Webhook com assinatura inválida rejeitado');
        return reply.status(401).send({ error: 'Assinatura inválida' });
      }
    } else if (config.WHATSAPP_PROVIDER === 'meta') {
      request.log.warn('WHATSAPP_APP_SECRET não configurado — assinatura do webhook NÃO validada');
    }

    const messages = parseWebhookPayload(request.body);

    // Confirma recebimento imediatamente; processamento em background
    reply.status(200).send({ received: true });

    for (const message of messages) {
      setImmediate(() => {
        opts.orchestrator.handleInboundMessage(message).catch((err) => {
          request.log.error({ err }, 'Falha inesperada no processamento assíncrono');
        });
      });
    }
  });
}
