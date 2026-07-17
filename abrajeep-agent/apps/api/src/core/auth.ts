import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { canAccessAdminPanel, canAdministrate, type UserRole } from '@abrajeep/shared';
import { getConfig } from '../config';
import { ForbiddenError, UnauthorizedError } from './errors';

export interface AdminTokenPayload {
  sub: string;
  role: UserRole;
  organizationId: string | null;
  name: string | null;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  const config = getConfig();
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const config = getConfig();
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    return {
      sub: String(decoded.sub),
      role: decoded.role as UserRole,
      organizationId: (decoded.organizationId as string | null) ?? null,
      name: (decoded.name as string | null) ?? null,
    };
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminTokenPayload;
  }
}

/** Hook de autenticação para rotas do painel administrativo. */
export async function requireAdminAuth(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Cabeçalho Authorization ausente');
  }
  const payload = verifyAdminToken(header.slice('Bearer '.length));
  if (!canAccessAdminPanel(payload.role)) {
    throw new ForbiddenError('Perfil sem acesso ao painel');
  }
  request.adminUser = payload;
}

/** Hook adicional: somente administradores. */
export async function requireAdminRole(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.adminUser || !canAdministrate(request.adminUser.role)) {
    throw new ForbiddenError('Requer perfil de administrador');
  }
}
