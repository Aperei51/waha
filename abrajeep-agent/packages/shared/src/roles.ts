/**
 * Perfis de usuário. Mantidos como union de strings para não acoplar o pacote
 * compartilhado ao client do Prisma (que define o enum equivalente no banco).
 */
export const USER_ROLES = [
  'VISITOR',
  'ASSOCIATE',
  'DEALERSHIP',
  'MANAGER',
  'OPERATOR',
  'ADMIN',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DOCUMENT_AUDIENCES = [
  'PUBLIC',
  'ASSOCIATES',
  'DEALERSHIP',
  'INTERNAL',
  'ADMIN',
] as const;

export type DocumentAudience = (typeof DOCUMENT_AUDIENCES)[number];

export const CONVERSATION_STATUSES = [
  'OPEN',
  'AGENT_HANDLING',
  'WAITING_HUMAN',
  'HUMAN_HANDLING',
  'RESOLVED',
  'CLOSED',
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
