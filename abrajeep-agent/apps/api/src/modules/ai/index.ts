import type { Logger } from 'pino';
import type { AppConfig } from '../../config';
import { MockAIProvider } from './mock-provider';
import { OpenAIProvider } from './openai-provider';
import type { AIProvider } from './types';

export * from './types';
export * from './prompts';
export { MockAIProvider } from './mock-provider';
export { estimateCostUsd } from './openai-provider';

export function createAIProvider(config: AppConfig, logger: Logger): AIProvider {
  if (config.AI_PROVIDER === 'openai') {
    return new OpenAIProvider(config, logger);
  }
  return new MockAIProvider(config.EMBEDDING_DIMENSIONS);
}
