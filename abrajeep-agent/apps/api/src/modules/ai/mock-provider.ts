import { createHash } from 'node:crypto';
import type {
  AIGenerateParams,
  AIProvider,
  AIResponse,
} from './types';

/**
 * Provedor de IA para desenvolvimento e testes, sem credenciais.
 * Comportamento determinístico:
 * - primeira chamada com mensagem de usuário → chama buscar_documentos;
 * - chamada contendo tool_result → responde com base no resultado.
 * Isso exercita o pipeline completo (function calling incluído).
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  private counter = 0;

  constructor(private readonly embeddingDimensions: number = 1536) {}

  async generate(params: AIGenerateParams): Promise<AIResponse> {
    this.counter += 1;
    const responseId = `mock-resp-${this.counter}`;
    const usage = { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0 };

    const toolResults = params.input.filter((i) => i.type === 'tool_result');
    if (toolResults.length > 0) {
      const first = toolResults[0];
      let summary = 'Não encontrei uma fonte confiável para responder com segurança.';
      try {
        const parsed = JSON.parse(first.type === 'tool_result' ? first.output : '{}') as {
          results?: Array<{ title?: string; excerpt?: string }>;
          message?: string;
        };
        if (parsed.results && parsed.results.length > 0) {
          const top = parsed.results[0];
          summary = `Com base no documento "${top.title ?? 'sem título'}": ${top.excerpt ?? ''}`.slice(0, 800);
        } else if (parsed.message) {
          summary = parsed.message;
        }
      } catch {
        // mantém a resposta padrão
      }
      return { responseId, text: `[modo demonstração] ${summary}`, toolCalls: [], usage };
    }

    const lastUser = [...params.input]
      .reverse()
      .find((i) => i.type === 'message' && i.role === 'user');
    const userText = lastUser && lastUser.type === 'message' ? lastUser.content : '';

    const hasSearchTool = params.tools.some((t) => t.name === 'buscar_documentos');
    if (hasSearchTool && userText.trim().length > 0) {
      return {
        responseId,
        text: null,
        toolCalls: [
          {
            callId: `mock-call-${this.counter}`,
            name: 'buscar_documentos',
            arguments: JSON.stringify({ query: userText.slice(0, 200) }),
          },
        ],
        usage,
      };
    }

    return {
      responseId,
      text: '[modo demonstração] Olá! Sou o assistente da ABRAJEEP. Como posso ajudar?',
      toolCalls: [],
      usage,
    };
  }

  /** Embedding determinístico baseado em hash — suficiente para dev/testes. */
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(this.embeddingDimensions).fill(0);
      const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
      for (const token of tokens) {
        const digest = createHash('sha256').update(token).digest();
        for (let i = 0; i < 8; i++) {
          const idx = digest.readUInt16BE(i * 2) % this.embeddingDimensions;
          vector[idx] += 1;
        }
      }
      const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
      return vector.map((v) => v / norm);
    });
  }

  async transcribe(): Promise<string> {
    return '[transcrição indisponível no modo demonstração]';
  }

  async summarize(text: string): Promise<string> {
    return `Resumo (mock): ${text.slice(0, 300)}`;
  }
}
