import { disconnectPrisma } from '@abrajeep/database';
import { buildApp } from './app';
import { getConfig } from './config';

async function main(): Promise<void> {
  const config = getConfig();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Encerrando servidor');
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(
    { port: config.API_PORT, whatsapp: config.WHATSAPP_PROVIDER, ai: config.AI_PROVIDER },
    'API do agente ABRAJEEP iniciada',
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Falha fatal na inicialização:', err);
  process.exit(1);
});
