import { describe, expect, it } from 'vitest';
import { MockAIProvider } from '../src/modules/ai/mock-provider';
import { estimateCostUsd } from '../src/modules/ai/openai-provider';

describe('MockAIProvider — pipeline de function calling', () => {
  it('primeira mensagem de usuário dispara buscar_documentos', async () => {
    const provider = new MockAIProvider(64);
    const response = await provider.generate({
      instructions: 'x',
      input: [{ type: 'message', role: 'user', content: 'Qual a meta de NPS?' }],
      tools: [
        { name: 'buscar_documentos', description: '', parameters: {} },
      ],
    });
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].name).toBe('buscar_documentos');
    expect(JSON.parse(response.toolCalls[0].arguments).query).toContain('NPS');
  });

  it('resultado de tool produz resposta final citando o documento', async () => {
    const provider = new MockAIProvider(64);
    const response = await provider.generate({
      instructions: 'x',
      input: [
        {
          type: 'tool_result',
          callId: 'c1',
          output: JSON.stringify({
            results: [{ title: 'Comunicado 2026-014', excerpt: 'Meta de NPS é 87.' }],
          }),
        },
      ],
      tools: [],
    });
    expect(response.toolCalls).toHaveLength(0);
    expect(response.text).toContain('Comunicado 2026-014');
  });

  it('embeddings são determinísticos e normalizados', async () => {
    const provider = new MockAIProvider(64);
    const [a1] = await provider.embed(['meta de NPS pós-vendas']);
    const [a2] = await provider.embed(['meta de NPS pós-vendas']);
    expect(a1).toEqual(a2);
    expect(a1).toHaveLength(64);
    const norm = Math.sqrt(a1.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('textos similares têm similaridade maior que textos distintos', async () => {
    const provider = new MockAIProvider(256);
    const [nps1, nps2, garantia] = await provider.embed([
      'meta de NPS de pós-vendas da Jeep',
      'qual a meta NPS pós-vendas',
      'procedimento de garantia do veículo',
    ]);
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    expect(dot(nps1, nps2)).toBeGreaterThan(dot(nps1, garantia));
  });
});

describe('estimateCostUsd', () => {
  it('calcula custo com base na tabela de preços', () => {
    const cost = estimateCostUsd('gpt-4.1-mini', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.4 + 1.6, 6);
  });

  it('usa preço padrão para modelo desconhecido', () => {
    expect(estimateCostUsd('modelo-x', 1_000_000, 0)).toBeCloseTo(1.0, 6);
  });
});
