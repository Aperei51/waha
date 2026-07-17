/**
 * Segmentação de texto em chunks para embeddings.
 * Estratégia: quebra por parágrafos, agrupando até maxChars, com overlap
 * entre chunks para preservar contexto nas bordas.
 */
export interface ChunkOptions {
  maxChars: number;
  overlapChars: number;
}

const DEFAULT_OPTIONS: ChunkOptions = { maxChars: 1500, overlapChars: 200 };

export function chunkText(text: string, options: Partial<ChunkOptions> = {}): string[] {
  const { maxChars, overlapChars } = { ...DEFAULT_OPTIONS, ...options };
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const paragraphs = normalized.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  const push = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
  };

  for (const paragraph of paragraphs) {
    // Parágrafo maior que o limite: quebra por sentenças
    if (paragraph.length > maxChars) {
      push();
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (current.length + sentence.length + 1 > maxChars) {
          const overlap = current.slice(-overlapChars);
          push();
          current = overlap ? `${overlap} ` : '';
        }
        current += `${sentence} `;
      }
      push();
      continue;
    }

    if (current.length + paragraph.length + 2 > maxChars) {
      const overlap = current.slice(-overlapChars);
      push();
      current = overlap ? `${overlap}\n\n` : '';
    }
    current += `${paragraph}\n\n`;
  }
  push();

  return chunks;
}

/** Estimativa grosseira de tokens (≈ 4 chars/token em pt-BR). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
