import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida a assinatura X-Hub-Signature-256 enviada pela Meta:
 * HMAC-SHA256 do corpo bruto com o App Secret, prefixado por "sha256=".
 * Comparação em tempo constante.
 */
export function verifyMetaSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!appSecret) return false;
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = signatureHeader.slice('sha256='.length);

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
