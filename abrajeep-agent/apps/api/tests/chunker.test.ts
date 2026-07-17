import { describe, expect, it } from 'vitest';
import { chunkText, estimateTokens } from '../src/modules/knowledge/chunker';

describe('chunkText', () => {
  it('retorna vazio para texto vazio', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('texto curto vira um único chunk', () => {
    const chunks = chunkText('Um parágrafo curto.');
    expect(chunks).toEqual(['Um parágrafo curto.']);
  });

  it('divide texto longo respeitando o limite', () => {
    const paragraph = 'Frase de teste com conteúdo repetido. '.repeat(20);
    const text = Array.from({ length: 10 }, () => paragraph).join('\n\n');
    const chunks = chunkText(text, { maxChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1100); // limite + tolerância de overlap
    }
  });

  it('mantém overlap entre chunks consecutivos', () => {
    const sentences = Array.from({ length: 60 }, (_, i) => `Sentença número ${i} do documento.`);
    const text = sentences.join(' ');
    const chunks = chunkText(text, { maxChars: 400, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(2);
    // O fim de um chunk deve reaparecer no início do próximo (overlap)
    const tail = chunks[0].slice(-30).trim();
    expect(chunks[1]).toContain(tail.split(' ').slice(-2).join(' '));
  });

  it('normaliza quebras de linha excessivas', () => {
    const chunks = chunkText('a\r\n\r\n\r\n\r\nb');
    expect(chunks[0]).toBe('a\n\nb');
  });
});

describe('estimateTokens', () => {
  it('estima ~1 token a cada 4 caracteres', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});
