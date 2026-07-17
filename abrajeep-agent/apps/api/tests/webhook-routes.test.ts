import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { MockAIProvider } from '../src/modules/ai/mock-provider';
import { MockWhatsAppProvider } from '../src/modules/whatsapp/mock-provider';
import pino from 'pino';

const APP_SECRET = 'segredo-do-app-meta';

// Payload sem mensagens (somente status) — não dispara acesso ao banco
const STATUS_PAYLOAD = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    { id: 'E', changes: [{ field: 'messages', value: { statuses: [{ id: 's1' }] } }] },
  ],
});

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
}

describe('rotas de webhook do WhatsApp', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig({
      ...process.env,
      WHATSAPP_APP_SECRET: APP_SECRET,
      RATE_LIMIT_MAX: '1000',
    });
    app = await buildApp({
      config,
      whatsappProvider: new MockWhatsAppProvider(pino({ level: 'silent' })),
      aiProvider: new MockAIProvider(64),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /webhooks/whatsapp (verificação da Meta)', () => {
    it('responde o challenge com token correto', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('12345');
    });

    it('rejeita token incorreto', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=12345',
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /webhooks/whatsapp', () => {
    it('aceita payload com assinatura válida', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(STATUS_PAYLOAD),
        },
        payload: STATUS_PAYLOAD,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ received: true });
    });

    it('rejeita assinatura inválida com 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=deadbeef',
        },
        payload: STATUS_PAYLOAD,
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejeita requisição sem assinatura com 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: { 'content-type': 'application/json' },
        payload: STATUS_PAYLOAD,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('respostas com correlation id', () => {
    it('toda resposta carrega x-correlation-id', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-correlation-id']).toBeTruthy();
    });
  });

  describe('rotas administrativas exigem autenticação', () => {
    it('nega acesso sem token', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/conversations' });
      expect(res.statusCode).toBe(401);
    });

    it('nega token inválido', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/conversations',
        headers: { authorization: 'Bearer token-invalido' },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
