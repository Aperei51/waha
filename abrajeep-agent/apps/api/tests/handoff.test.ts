import { describe, expect, it } from 'vitest';
import { canTransition, detectsHumanHandoffRequest, isAgentPaused } from '@abrajeep/shared';

describe('detectsHumanHandoffRequest', () => {
  it.each([
    'Quero falar com uma pessoa',
    'quero falar com atendente',
    'Preciso de atendimento',
    'não resolveu',
    'Nao resolveu meu problema',
    'Falar com atendente, por favor',
    'transferir atendimento',
    'quero falar com um humano',
  ])('detecta: "%s"', (text) => {
    expect(detectsHumanHandoffRequest(text)).toBe(true);
  });

  it.each([
    'Qual é a meta de NPS?',
    'Onde encontro o comunicado?',
    'Obrigado, resolveu sim!',
    'A pessoa responsável já assinou o documento',
  ])('não detecta: "%s"', (text) => {
    expect(detectsHumanHandoffRequest(text)).toBe(false);
  });
});

describe('máquina de estados do atendimento', () => {
  it('permite fluxo completo: OPEN → AGENT → WAITING → HUMAN → RESOLVED → CLOSED', () => {
    expect(canTransition('OPEN', 'AGENT_HANDLING')).toBe(true);
    expect(canTransition('AGENT_HANDLING', 'WAITING_HUMAN')).toBe(true);
    expect(canTransition('WAITING_HUMAN', 'HUMAN_HANDLING')).toBe(true);
    expect(canTransition('HUMAN_HANDLING', 'RESOLVED')).toBe(true);
    expect(canTransition('RESOLVED', 'CLOSED')).toBe(true);
  });

  it('permite devolver ao agente', () => {
    expect(canTransition('HUMAN_HANDLING', 'AGENT_HANDLING')).toBe(true);
    expect(canTransition('WAITING_HUMAN', 'AGENT_HANDLING')).toBe(true);
  });

  it('bloqueia transições inválidas', () => {
    expect(canTransition('CLOSED', 'HUMAN_HANDLING')).toBe(false);
    expect(canTransition('OPEN', 'RESOLVED')).toBe(false);
    expect(canTransition('RESOLVED', 'WAITING_HUMAN')).toBe(false);
  });

  it('agente pausado em WAITING_HUMAN e HUMAN_HANDLING', () => {
    expect(isAgentPaused('WAITING_HUMAN')).toBe(true);
    expect(isAgentPaused('HUMAN_HANDLING')).toBe(true);
    expect(isAgentPaused('AGENT_HANDLING')).toBe(false);
    expect(isAgentPaused('OPEN')).toBe(false);
  });
});
