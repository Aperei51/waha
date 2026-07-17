import { getPrisma, type ConversationStatus as DbConversationStatus } from '@abrajeep/database';
import { canTransition, type ConversationStatus } from '@abrajeep/shared';
import { AppError, NotFoundError } from '../../core/errors';
import { audit } from '../../core/audit';

/**
 * Máquina de estados do atendimento. Todas as transições passam por aqui,
 * com validação e registro em agent_actions + auditoria.
 */
async function transition(
  conversationId: string,
  to: ConversationStatus,
  actionType: string,
  detail: Record<string, unknown>,
  actorId: string | null,
): Promise<void> {
  const prisma = getPrisma();
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new NotFoundError('Conversa não encontrada');

  const from = conversation.status as ConversationStatus;
  if (from !== to && !canTransition(from, to)) {
    throw new AppError(`Transição inválida: ${from} → ${to}`, 409, 'INVALID_TRANSITION');
  }

  const now = new Date();
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: to as DbConversationStatus,
      assignedOperatorId:
        to === 'HUMAN_HANDLING' ? actorId : to === 'AGENT_HANDLING' ? null : undefined,
      handedOffAt: to === 'WAITING_HUMAN' ? now : undefined,
      resolvedAt: to === 'RESOLVED' ? now : undefined,
      closedAt: to === 'CLOSED' ? now : undefined,
    },
  });

  await prisma.agentAction.create({
    data: {
      conversationId,
      type: actionType,
      detail: { from, to, ...detail },
      actorId,
    },
  });

  await audit({
    actorType: actorId ? 'operator' : 'agent',
    action: `conversation.${actionType}`,
    resource: 'conversation',
    resourceId: conversationId,
    detail: { from, to, ...detail },
    userId: actorId,
  });
}

/** Agente ou usuário pede atendimento humano → fila WAITING_HUMAN. */
export async function requestHumanHandoff(
  conversationId: string,
  reason: string,
  actorId: string | null,
): Promise<void> {
  await transition(conversationId, 'WAITING_HUMAN', 'handoff_to_human', { reason }, actorId);
}

/** Operador assume o atendimento. */
export async function claimConversation(conversationId: string, operatorId: string): Promise<void> {
  await transition(conversationId, 'HUMAN_HANDLING', 'claimed_by_operator', {}, operatorId);
}

/** Operador devolve a conversa ao agente. */
export async function returnToAgent(conversationId: string, operatorId: string): Promise<void> {
  await transition(conversationId, 'AGENT_HANDLING', 'handoff_to_agent', {}, operatorId);
}

/** Marca como resolvida. */
export async function resolveConversation(
  conversationId: string,
  operatorId: string | null,
): Promise<void> {
  await transition(conversationId, 'RESOLVED', 'resolved', {}, operatorId);
}

/** Encerra a conversa. */
export async function closeConversation(
  conversationId: string,
  operatorId: string | null,
): Promise<void> {
  await transition(conversationId, 'CLOSED', 'closed', {}, operatorId);
}
