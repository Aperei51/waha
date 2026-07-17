/**
 * Contrato do provedor de IA. O núcleo depende apenas desta interface;
 * a implementação real usa a OpenAI Responses API.
 */

export interface AIToolDefinition {
  name: string;
  description: string;
  /** JSON Schema dos parâmetros. */
  parameters: Record<string, unknown>;
}

export type AIInputItem =
  | { type: 'message'; role: 'user' | 'assistant' | 'system'; content: string }
  | { type: 'tool_result'; callId: string; output: string };

export interface AIToolCall {
  callId: string;
  name: string;
  /** Argumentos como string JSON (validados depois com Zod). */
  arguments: string;
}

export interface AIGenerateParams {
  instructions: string;
  input: AIInputItem[];
  tools: AIToolDefinition[];
  previousResponseId?: string | null;
  maxOutputTokens?: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface AIResponse {
  responseId: string | null;
  text: string | null;
  toolCalls: AIToolCall[];
  usage: AIUsage;
}

export interface AIProvider {
  readonly name: string;
  generate(params: AIGenerateParams): Promise<AIResponse>;
  /** Gera embeddings para uma lista de textos. */
  embed(texts: string[]): Promise<number[][]>;
  /** Transcreve um áudio (ex.: mensagens de voz do WhatsApp). */
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
  /** Resume um histórico longo de conversa em poucas frases. */
  summarize(text: string): Promise<string>;
}
