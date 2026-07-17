import pino from 'pino';
import { randomUUID } from 'node:crypto';

/**
 * Logger estruturado com redação de campos sensíveis.
 * Nunca logar tokens, senhas ou conteúdo integral de mensagens de usuários.
 */
export function createLogger(level: string, pretty: boolean): pino.Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-hub-signature-256"]',
        '*.password',
        '*.passwordHash',
        '*.accessToken',
        '*.apiKey',
      ],
      censor: '[REDACTED]',
    },
    transport: pretty ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  });
}

export function newCorrelationId(): string {
  return randomUUID();
}
