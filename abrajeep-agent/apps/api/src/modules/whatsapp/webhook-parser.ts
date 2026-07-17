import { z } from 'zod';
import type { InboundMessageKind, NormalizedInboundMessage } from './types';

/**
 * Parser do payload de webhook da WhatsApp Cloud API.
 * Estrutura documentada em:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

const mediaSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
});

const messageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: mediaSchema.optional(),
  image: mediaSchema.optional(),
  document: mediaSchema.optional(),
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
});

const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.string().optional(),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string().optional() }).optional(),
                }),
              )
              .optional(),
            messages: z.array(messageSchema).optional(),
            statuses: z.array(z.unknown()).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type MetaWebhookPayload = z.infer<typeof webhookSchema>;

export function parseWebhookPayload(body: unknown): NormalizedInboundMessage[] {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success || parsed.data.object !== 'whatsapp_business_account') return [];

  const messages: NormalizedInboundMessage[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      const profileName = value.contacts?.[0]?.profile?.name;
      for (const msg of value.messages ?? []) {
        messages.push(normalizeMessage(msg, profileName));
      }
    }
  }
  return messages;
}

type RawMessage = z.infer<typeof messageSchema>;

function normalizeMessage(msg: RawMessage, profileName?: string): NormalizedInboundMessage {
  const timestamp = new Date(Number(msg.timestamp) * 1000);
  const base = { providerMessageId: msg.id, from: msg.from, profileName, timestamp };

  switch (msg.type) {
    case 'text':
      return { ...base, kind: 'text', text: msg.text?.body ?? '' };
    case 'interactive': {
      const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      return { ...base, kind: 'text', text: reply?.title ?? '' };
    }
    case 'audio':
    case 'image':
    case 'document': {
      const media = msg[msg.type as 'audio' | 'image' | 'document'];
      return {
        ...base,
        kind: msg.type as InboundMessageKind,
        caption: media?.caption,
        media: media
          ? { providerMediaId: media.id, mimeType: media.mime_type, fileName: media.filename }
          : undefined,
      };
    }
    default:
      return { ...base, kind: 'unsupported' };
  }
}
