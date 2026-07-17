/**
 * Detecção de pedido de atendimento humano em português.
 * Mantida simples e determinística — o modelo também pode acionar a função
 * transferir_para_humano, mas esta verificação garante o comportamento mesmo
 * se a IA falhar.
 */
const HANDOFF_PATTERNS: RegExp[] = [
  /falar\s+com\s+(uma?\s+)?(pessoa|atendente|humano|alguem|alguém)/i,
  /quero\s+(um\s+)?atendente/i,
  /preciso\s+de\s+atendimento/i,
  /atendimento\s+humano/i,
  /transferir\s+(o\s+)?atendimento/i,
  /n[aã]o\s+resolveu/i,
  /falar\s+com\s+atendente/i,
];

export function detectsHumanHandoffRequest(text: string): boolean {
  return HANDOFF_PATTERNS.some((p) => p.test(text));
}

import type { ConversationStatus } from './roles';

/**
 * Transições válidas da máquina de estados de atendimento.
 */
const TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  OPEN: ['AGENT_HANDLING', 'WAITING_HUMAN', 'CLOSED'],
  AGENT_HANDLING: ['WAITING_HUMAN', 'RESOLVED', 'CLOSED'],
  WAITING_HUMAN: ['HUMAN_HANDLING', 'AGENT_HANDLING', 'CLOSED'],
  HUMAN_HANDLING: ['AGENT_HANDLING', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

export function canTransition(from: ConversationStatus, to: ConversationStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Estados em que o agente NÃO deve responder automaticamente. */
export function isAgentPaused(status: ConversationStatus): boolean {
  return status === 'WAITING_HUMAN' || status === 'HUMAN_HANDLING';
}
