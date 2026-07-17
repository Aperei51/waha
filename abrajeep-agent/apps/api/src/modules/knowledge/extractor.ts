import { ValidationError } from '../../core/errors';

/**
 * Extração de texto de arquivos suportados: PDF, DOCX, TXT e Markdown.
 * MIME types são validados antes — nunca confiar apenas na extensão.
 */

export const ALLOWED_MIME_TYPES: Record<string, 'pdf' | 'docx' | 'text'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'text',
  'text/markdown': 'text',
};

export function isAllowedMimeType(mimeType: string): boolean {
  return mimeType in ALLOWED_MIME_TYPES;
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const kind = ALLOWED_MIME_TYPES[mimeType];
  if (!kind) {
    throw new ValidationError(`Tipo de arquivo não suportado: ${mimeType}`);
  }

  switch (kind) {
    case 'pdf': {
      // pdf-parse não tem tipos ESM adequados; import dinâmico com require
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text;
    }
    case 'docx': {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case 'text':
      return buffer.toString('utf8');
  }
}
