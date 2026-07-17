import { getPrisma, type UserRole } from '@abrajeep/database';
import {
  createDealershipSchema,
  createOrganizationSchema,
  createUserSchema,
  updateUserSchema,
} from '@abrajeep/shared';
import * as bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdminAuth, requireAdminRole } from '../../core/auth';
import { audit } from '../../core/audit';
import { NotFoundError } from '../../core/errors';

/** Cadastros: usuários, empresas (organizações) e concessionárias. */
export async function adminDirectoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdminAuth);

  // --------------------------- Usuários ---------------------------
  app.get('/admin/users', async (request) => {
    const query = z
      .object({
        q: z.string().max(120).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);

    const where = {
      deletedAt: null,
      OR: query.q
        ? [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { phone: { contains: query.q } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
          ]
        : undefined,
    };
    const prisma = getPrisma();
    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          role: true,
          status: true,
          jobTitle: true,
          createdAt: true,
          lastSeenAt: true,
          organization: { select: { id: true, name: true } },
          dealership: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  });

  app.post('/admin/users', { preHandler: requireAdminRole }, async (request) => {
    const body = createUserSchema.parse(request.body);
    const user = await getPrisma().user.create({
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email,
        organizationId: body.organizationId,
        dealershipId: body.dealershipId,
        jobTitle: body.jobTitle,
        role: body.role as UserRole,
        passwordHash: body.password ? bcrypt.hashSync(body.password, 10) : null,
      },
    });
    await audit({
      actorType: 'admin',
      action: 'user.create',
      userId: request.adminUser!.sub,
      resource: 'user',
      resourceId: user.id,
    });
    return { id: user.id };
  });

  app.patch('/admin/users/:id', { preHandler: requireAdminRole }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateUserSchema.parse(request.body);
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundError('Usuário não encontrado');

    await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email,
        organizationId: body.organizationId,
        dealershipId: body.dealershipId,
        jobTitle: body.jobTitle,
        role: body.role as UserRole | undefined,
        passwordHash: body.password ? bcrypt.hashSync(body.password, 10) : undefined,
      },
    });
    await audit({
      actorType: 'admin',
      action: 'user.update',
      userId: request.adminUser!.sub,
      resource: 'user',
      resourceId: id,
    });
    return { ok: true };
  });

  // --------------------------- Organizações ---------------------------
  app.get('/admin/organizations', async () => {
    return getPrisma().organization.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { users: true, dealerships: true } } },
      orderBy: { name: 'asc' },
    });
  });

  app.post('/admin/organizations', { preHandler: requireAdminRole }, async (request) => {
    const body = createOrganizationSchema.parse(request.body);
    const org = await getPrisma().organization.create({ data: body });
    await audit({
      actorType: 'admin',
      action: 'organization.create',
      userId: request.adminUser!.sub,
      resource: 'organization',
      resourceId: org.id,
    });
    return { id: org.id };
  });

  // --------------------------- Concessionárias ---------------------------
  app.get('/admin/dealerships', async () => {
    return getPrisma().dealership.findMany({
      where: { deletedAt: null },
      include: { organization: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  });

  app.post('/admin/dealerships', { preHandler: requireAdminRole }, async (request) => {
    const body = createDealershipSchema.parse(request.body);
    const dealership = await getPrisma().dealership.create({ data: body });
    await audit({
      actorType: 'admin',
      action: 'dealership.create',
      userId: request.adminUser!.sub,
      resource: 'dealership',
      resourceId: dealership.id,
    });
    return { id: dealership.id };
  });
}
