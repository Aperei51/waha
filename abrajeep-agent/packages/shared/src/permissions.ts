import type { DocumentAudience, UserRole } from './roles';

/**
 * Contexto mínimo de acesso de um usuário, usado em todas as verificações
 * de permissão do agente e da base de conhecimento.
 */
export interface AccessContext {
  role: UserRole;
  organizationId: string | null;
  dealershipId: string | null;
}

/**
 * Audiências de documento que cada perfil pode ler.
 * DEALERSHIP exige, além do perfil, correspondência de concessionária —
 * verificada em canReadDocument.
 */
const AUDIENCES_BY_ROLE: Record<UserRole, DocumentAudience[]> = {
  VISITOR: ['PUBLIC'],
  ASSOCIATE: ['PUBLIC', 'ASSOCIATES'],
  DEALERSHIP: ['PUBLIC', 'ASSOCIATES', 'DEALERSHIP'],
  MANAGER: ['PUBLIC', 'ASSOCIATES', 'DEALERSHIP', 'INTERNAL'],
  OPERATOR: ['PUBLIC', 'ASSOCIATES', 'DEALERSHIP', 'INTERNAL'],
  ADMIN: ['PUBLIC', 'ASSOCIATES', 'DEALERSHIP', 'INTERNAL', 'ADMIN'],
};

export function audiencesForRole(role: UserRole): DocumentAudience[] {
  return AUDIENCES_BY_ROLE[role];
}

export interface DocumentAccessMeta {
  audience: DocumentAudience;
  organizationId: string | null;
  dealershipId: string | null;
}

/**
 * Regra central de leitura de documentos:
 * - a audiência do documento precisa estar entre as permitidas ao perfil;
 * - documento com organização definida só é lido por usuário da mesma organização
 *   (exceto documentos PUBLIC);
 * - documento com concessionária definida só é lido por usuário daquela
 *   concessionária, por gestores/operadores/admins da mesma organização.
 */
export function canReadDocument(ctx: AccessContext, doc: DocumentAccessMeta): boolean {
  if (!audiencesForRole(ctx.role).includes(doc.audience)) return false;
  if (doc.audience === 'PUBLIC') return true;

  if (doc.organizationId && doc.organizationId !== ctx.organizationId) return false;

  if (doc.dealershipId) {
    const isElevated = ctx.role === 'MANAGER' || ctx.role === 'OPERATOR' || ctx.role === 'ADMIN';
    if (!isElevated && doc.dealershipId !== ctx.dealershipId) return false;
  }
  return true;
}

/** Perfis com acesso ao painel administrativo. */
export function canAccessAdminPanel(role: UserRole): boolean {
  return role === 'OPERATOR' || role === 'MANAGER' || role === 'ADMIN';
}

/** Perfis que podem gerenciar documentos (upload, arquivamento). */
export function canManageDocuments(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

/** Perfis que podem administrar usuários, empresas e LGPD. */
export function canAdministrate(role: UserRole): boolean {
  return role === 'ADMIN';
}
