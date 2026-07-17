import type { Logger } from 'pino';
import type { AppConfig } from '../../config';
import { MetaWhatsAppProvider } from './meta-provider';
import { MockWhatsAppProvider } from './mock-provider';
import type { WhatsAppProvider } from './types';

export * from './types';
export { parseWebhookPayload } from './webhook-parser';
export { verifyMetaSignature } from './signature';
export { MockWhatsAppProvider } from './mock-provider';

export function createWhatsAppProvider(config: AppConfig, logger: Logger): WhatsAppProvider {
  if (config.WHATSAPP_PROVIDER === 'meta') {
    return new MetaWhatsAppProvider(config, logger);
  }
  return new MockWhatsAppProvider(logger);
}
