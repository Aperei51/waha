/**
 * Contrato do provedor de WhatsApp. O núcleo do sistema depende apenas desta
 * interface — trocar Meta Cloud API por outro provedor (ex.: WAHA) exige
 * somente uma nova implementação.
 */

export type InboundMessageKind = 'text' | 'audio' | 'image' | 'document' | 'unsupported';

export interface NormalizedInboundMessage {
  /** ID único da mensagem no provedor (wamid) — usado para idempotência. */
  providerMessageId: string;
  /** Telefone do remetente em E.164 sem "+". */
  from: string;
  /** Nome do perfil informado pelo WhatsApp, se disponível. */
  profileName?: string;
  kind: InboundMessageKind;
  text?: string;
  /** Legenda de mídia, quando houver. */
  caption?: string;
  media?: {
    providerMediaId: string;
    mimeType?: string;
    fileName?: string;
  };
  timestamp: Date;
}

export interface OutboundDocument {
  /** URL pública do documento (a Cloud API baixa a partir dela). */
  url: string;
  fileName: string;
  caption?: string;
}

export interface DownloadedMedia {
  data: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendText(to: string, text: string): Promise<{ providerMessageId: string | null }>;
  sendDocument(to: string, doc: OutboundDocument): Promise<{ providerMessageId: string | null }>;
  downloadMedia(providerMediaId: string): Promise<DownloadedMedia>;
  /** Marca a mensagem como lida (best effort). */
  markAsRead(providerMessageId: string): Promise<void>;
}
