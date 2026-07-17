import OpenAI from 'openai';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config';
import { AppError } from '../../core/errors';
import type {
  AIGenerateParams,
  AIProvider,
  AIResponse,
  AIToolCall,
} from './types';

/**
 * Preços aproximados (USD por 1M tokens) para estimativa de custo.
 * Valores de referência — ajuste em system_settings quando necessário.
 */
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_TABLE[model] ?? { input: 1.0, output: 4.0 };
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * Provedor OpenAI usando a Responses API para geração (com function calling
 * e encadeamento via previous_response_id), Embeddings API para a base de
 * conhecimento e Audio API para transcrição.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(
    private readonly config: Pick<
      AppConfig,
      | 'OPENAI_API_KEY'
      | 'OPENAI_MODEL'
      | 'OPENAI_TRANSCRIPTION_MODEL'
      | 'OPENAI_EMBEDDING_MODEL'
      | 'EMBEDDING_DIMENSIONS'
      | 'AI_MAX_OUTPUT_TOKENS'
    >,
    private readonly logger: Logger,
  ) {
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY é obrigatória com AI_PROVIDER=openai');
    }
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY, maxRetries: 3 });
  }

  async generate(params: AIGenerateParams): Promise<AIResponse> {
    const input: OpenAI.Responses.ResponseInput = params.input.map((item) => {
      if (item.type === 'tool_result') {
        return {
          type: 'function_call_output' as const,
          call_id: item.callId,
          output: item.output,
        };
      }
      return { role: item.role, content: item.content };
    });

    const tools: OpenAI.Responses.Tool[] = params.tools.map((t) => ({
      type: 'function' as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false,
    }));

    try {
      const response = await this.client.responses.create({
        model: this.config.OPENAI_MODEL,
        instructions: params.instructions,
        input,
        tools,
        previous_response_id: params.previousResponseId ?? undefined,
        max_output_tokens: params.maxOutputTokens ?? this.config.AI_MAX_OUTPUT_TOKENS,
      });

      const toolCalls: AIToolCall[] = [];
      for (const item of response.output ?? []) {
        if (item.type === 'function_call') {
          toolCalls.push({ callId: item.call_id, name: item.name, arguments: item.arguments });
        }
      }

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;

      return {
        responseId: response.id,
        text: response.output_text || null,
        toolCalls,
        usage: {
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateCostUsd(this.config.OPENAI_MODEL, inputTokens, outputTokens),
        },
      };
    } catch (err) {
      this.logger.error({ err }, 'Erro na OpenAI Responses API');
      throw new AppError('Falha ao gerar resposta de IA', 502, 'AI_PROVIDER_ERROR', false);
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.client.embeddings.create({
      model: this.config.OPENAI_EMBEDDING_MODEL,
      input: texts,
      dimensions: this.config.EMBEDDING_DIMENSIONS,
    });
    return res.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'mp3';
    const file = new File([new Uint8Array(audio)], `audio.${ext}`, { type: mimeType });
    const res = await this.client.audio.transcriptions.create({
      model: this.config.OPENAI_TRANSCRIPTION_MODEL,
      file,
      language: 'pt',
    });
    return res.text;
  }

  async summarize(text: string): Promise<string> {
    const response = await this.client.responses.create({
      model: this.config.OPENAI_MODEL,
      instructions:
        'Resuma a conversa a seguir em até 8 frases, em português, preservando fatos, decisões, solicitações abertas e dados citados. Não invente nada.',
      input: [{ role: 'user', content: text }],
      max_output_tokens: 512,
    });
    return response.output_text ?? '';
  }
}
