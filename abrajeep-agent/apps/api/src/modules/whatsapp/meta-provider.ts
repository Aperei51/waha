import type { Logger } from 'pino';
import type { AppConfig } from '../../config';
import { AppError } from '../../core/errors';
import type {
  DownloadedMedia,
  OutboundDocument,
  WhatsAppProvider,
} from './types';

interface GraphSendResponse {
  messages?: Array<{ id: string }>;
}

/**
 * Implementação oficial da WhatsApp Cloud API (Meta Graph API).
 * Todas as chamadas usam retentativa com backoff exponencial para erros 5xx
 * e falhas de rede.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta';
  private readonly baseUrl: string;

  constructor(
    private readonly config: Pick<
      AppConfig,
      | 'WHATSAPP_ACCESS_TOKEN'
      | 'WHATSAPP_PHONE_NUMBER_ID'
      | 'WHATSAPP_GRAPH_API_VERSION'
    >,
    private readonly logger: Logger,
  ) {
    if (!config.WHATSAPP_ACCESS_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error(
        'WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID são obrigatórios com WHATSAPP_PROVIDER=meta',
      );
    }
    this.baseUrl = `https://graph.facebook.com/${config.WHATSAPP_GRAPH_API_VERSION}`;
  }

  async sendText(to: string, text: string): Promise<{ providerMessageId: string | null }> {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text.slice(0, 4096) },
    };
    const res = await this.request<GraphSendResponse>(
      `${this.baseUrl}/${this.config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return { providerMessageId: res.messages?.[0]?.id ?? null };
  }

  async sendDocument(
    to: string,
    doc: OutboundDocument,
  ): Promise<{ providerMessageId: string | null }> {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: { link: doc.url, filename: doc.fileName, caption: doc.caption },
    };
    const res = await this.request<GraphSendResponse>(
      `${this.baseUrl}/${this.config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return { providerMessageId: res.messages?.[0]?.id ?? null };
  }

  async downloadMedia(providerMediaId: string): Promise<DownloadedMedia> {
    // Passo 1: obter a URL temporária da mídia
    const meta = await this.request<{ url: string; mime_type: string }>(
      `${this.baseUrl}/${providerMediaId}`,
      { method: 'GET' },
    );
    // Passo 2: baixar o binário (mesma autenticação)
    const res = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.config.WHATSAPP_ACCESS_TOKEN}` },
    });
    if (!res.ok) {
      throw new AppError(`Falha ao baixar mídia (${res.status})`, 502, 'WHATSAPP_MEDIA_ERROR', false);
    }
    const data = Buffer.from(await res.arrayBuffer());
    return { data, mimeType: meta.mime_type };
  }

  async markAsRead(providerMessageId: string): Promise<void> {
    try {
      await this.request(
        `${this.baseUrl}/${this.config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: providerMessageId,
          }),
        },
      );
    } catch (err) {
      this.logger.warn({ err }, 'Falha ao marcar mensagem como lida (ignorada)');
    }
  }

  private async request<T>(url: string, init: RequestInit, attempt = 1): Promise<T> {
    const maxAttempts = 3;
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
      if (res.status >= 500 && attempt < maxAttempts) {
        await this.backoff(attempt);
        return this.request<T>(url, init, attempt + 1);
      }
      if (!res.ok) {
        const errBody = await res.text();
        this.logger.error({ status: res.status, body: errBody.slice(0, 500) }, 'Erro da Graph API');
        throw new AppError(`Erro da WhatsApp Cloud API (${res.status})`, 502, 'WHATSAPP_API_ERROR', false);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (attempt < maxAttempts) {
        await this.backoff(attempt);
        return this.request<T>(url, init, attempt + 1);
      }
      throw new AppError('Falha de rede ao chamar a WhatsApp Cloud API', 502, 'WHATSAPP_NETWORK_ERROR', false);
    }
  }

  private backoff(attempt: number): Promise<void> {
    const ms = 500 * 2 ** (attempt - 1);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
