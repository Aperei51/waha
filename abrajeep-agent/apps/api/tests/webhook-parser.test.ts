import { describe, expect, it } from 'vitest';
import { parseWebhookPayload } from '../src/modules/whatsapp/webhook-parser';

function metaPayload(messages: unknown[], contacts: unknown[] = []) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'ENTRY',
        changes: [
          {
            field: 'messages',
            value: { messaging_product: 'whatsapp', contacts, messages },
          },
        ],
      },
    ],
  };
}

describe('parseWebhookPayload', () => {
  it('normaliza mensagem de texto', () => {
    const payload = metaPayload(
      [
        {
          id: 'wamid.1',
          from: '5511999999999',
          timestamp: '1700000000',
          type: 'text',
          text: { body: 'Olá' },
        },
      ],
      [{ wa_id: '5511999999999', profile: { name: 'Maria' } }],
    );
    const messages = parseWebhookPayload(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      providerMessageId: 'wamid.1',
      from: '5511999999999',
      kind: 'text',
      text: 'Olá',
      profileName: 'Maria',
    });
  });

  it('normaliza mensagem de áudio com mídia', () => {
    const payload = metaPayload([
      {
        id: 'wamid.2',
        from: '5511888888888',
        timestamp: '1700000001',
        type: 'audio',
        audio: { id: 'media-1', mime_type: 'audio/ogg' },
      },
    ]);
    const [msg] = parseWebhookPayload(payload);
    expect(msg.kind).toBe('audio');
    expect(msg.media).toEqual({
      providerMediaId: 'media-1',
      mimeType: 'audio/ogg',
      fileName: undefined,
    });
  });

  it('normaliza documento com nome de arquivo e legenda', () => {
    const payload = metaPayload([
      {
        id: 'wamid.3',
        from: '5511888888888',
        timestamp: '1700000002',
        type: 'document',
        document: { id: 'media-2', mime_type: 'application/pdf', filename: 'nota.pdf', caption: 'segue' },
      },
    ]);
    const [msg] = parseWebhookPayload(payload);
    expect(msg.kind).toBe('document');
    expect(msg.caption).toBe('segue');
    expect(msg.media?.fileName).toBe('nota.pdf');
  });

  it('ignora payloads de status (sem mensagens)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'E',
          changes: [{ field: 'messages', value: { statuses: [{ id: 'x' }] } }],
        },
      ],
    };
    expect(parseWebhookPayload(payload)).toHaveLength(0);
  });

  it('ignora payloads malformados sem lançar erro', () => {
    expect(parseWebhookPayload({ foo: 'bar' })).toHaveLength(0);
    expect(parseWebhookPayload(null)).toHaveLength(0);
    expect(parseWebhookPayload('texto')).toHaveLength(0);
  });

  it('trata tipo desconhecido como unsupported', () => {
    const payload = metaPayload([
      { id: 'wamid.4', from: '551188', timestamp: '1700000003', type: 'sticker' },
    ]);
    expect(parseWebhookPayload(payload)[0].kind).toBe('unsupported');
  });
});
