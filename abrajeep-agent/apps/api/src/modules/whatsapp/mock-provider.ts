import type { Logger } from 'pino';
import type {
  DownloadedMedia,
  OutboundDocument,
  WhatsAppProvider,
} from './types';

/**
 * Provedor de desenvolvimento: registra as mensagens no log e as guarda em
 * memória para inspeção em testes. Não requer credenciais da Meta.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'mock';
  readonly sentMessages: Array<{ to: string; text?: string; document?: OutboundDocument }> = [];
  private counter = 0;

  constructor(private readonly logger: Logger) {}

  async sendText(to: string, text: string): Promise<{ providerMessageId: string | null }> {
    this.sentMessages.push({ to, text });
    this.logger.info({ to, preview: text.slice(0, 120) }, '[mock-whatsapp] sendText');
    return { providerMessageId: `mock-out-${++this.counter}` };
  }

  async sendDocument(
    to: string,
    doc: OutboundDocument,
  ): Promise<{ providerMessageId: string | null }> {
    this.sentMessages.push({ to, document: doc });
    this.logger.info({ to, fileName: doc.fileName }, '[mock-whatsapp] sendDocument');
    return { providerMessageId: `mock-out-${++this.counter}` };
  }

  async downloadMedia(providerMediaId: string): Promise<DownloadedMedia> {
    this.logger.info({ providerMediaId }, '[mock-whatsapp] downloadMedia');
    return { data: Buffer.from('conteudo-de-midia-mock'), mimeType: 'application/octet-stream' };
  }

  async markAsRead(): Promise<void> {
    // no-op
  }
}
