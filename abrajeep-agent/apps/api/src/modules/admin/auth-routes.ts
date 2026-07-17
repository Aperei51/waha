import { getPrisma } from '@abrajeep/database';
import { canAccessAdminPanel, loginSchema, type UserRole } from '@abrajeep/shared';
import * as bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { signAdminToken } from '../../core/auth';
import { audit } from '../../core/audit';
import { UnauthorizedError } from '../../core/errors';

export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/admin/auth/login', async (request) => {
    const body = loginSchema.parse(request.body);
    const user = await getPrisma().user.findUnique({ where: { email: body.email } });

    const invalid = new UnauthorizedError('Credenciais inválidas');
    if (!user?.passwordHash || user.deletedAt || user.status !== 'active') throw invalid;
    if (!bcrypt.compareSync(body.password, user.passwordHash)) {
      await audit({
        actorType: 'system',
        action: 'auth.login_failed',
        userId: user.id,
        ip: request.ip,
      });
      throw invalid;
    }
    if (!canAccessAdminPanel(user.role as UserRole)) throw invalid;

    const token = signAdminToken({
      sub: user.id,
      role: user.role as UserRole,
      organizationId: user.organizationId,
      name: user.name,
    });
    await audit({ actorType: 'admin', action: 'auth.login', userId: user.id, ip: request.ip });

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  });
}
