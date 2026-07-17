import { z } from 'zod';

/**
 * Configuração central. Toda variável de ambiente é validada aqui —
 * o processo não sobe com configuração inválida.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),

  WHATSAPP_PROVIDER: z.enum(['meta', 'mock']).default('mock'),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default(''),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(8),
  WHATSAPP_APP_SECRET: z.string().default(''),
  WHATSAPP_GRAPH_API_VERSION: z.string().default('v21.0'),

  AI_PROVIDER: z.enum(['openai', 'mock']).default('mock'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default('whisper-1'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().default(1536),
  AI_CONTEXT_TOKEN_BUDGET: z.coerce.number().int().default(8000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().default(1024),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY deve ser 32 bytes em hexadecimal (64 caracteres)'),
  RATE_LIMIT_MAX: z.coerce.number().int().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  UPLOAD_MAX_BYTES: z.coerce.number().int().default(20 * 1024 * 1024),

  CONVERSATION_CONTEXT_TTL_MINUTES: z.coerce.number().int().default(1440),
  DATA_RETENTION_DAYS: z.coerce.number().int().default(730),

  UPLOAD_DIR: z.string().default('uploads'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
  return parsed.data;
}

export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Somente para testes. */
export function resetConfigForTests(): void {
  cached = undefined;
}
