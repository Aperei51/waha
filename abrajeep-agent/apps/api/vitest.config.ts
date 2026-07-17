import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test_unreachable',
      WHATSAPP_PROVIDER: 'mock',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
      AI_PROVIDER: 'mock',
      JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres!!',
      ENCRYPTION_KEY: 'a'.repeat(64),
      LOG_LEVEL: 'error',
    },
  },
});
