import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from '../src/modules/whatsapp/signature';

describe('verifyMetaSignature', () => {
  const secret = 'app-secret-de-teste';
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  const sign = (payload: string, key: string) =>
    `sha256=${createHmac('sha256', key).update(payload).digest('hex')}`;

  it('aceita assinatura válida', () => {
    expect(verifyMetaSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejeita assinatura com segredo errado', () => {
    expect(verifyMetaSignature(body, sign(body, 'outro-segredo'), secret)).toBe(false);
  });

  it('rejeita corpo adulterado', () => {
    expect(verifyMetaSignature(body + 'x', sign(body, secret), secret)).toBe(false);
  });

  it('rejeita cabeçalho ausente ou malformado', () => {
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, 'md5=abc', secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=', secret)).toBe(false);
  });

  it('rejeita quando o app secret não está configurado', () => {
    expect(verifyMetaSignature(body, sign(body, ''), '')).toBe(false);
  });
});
