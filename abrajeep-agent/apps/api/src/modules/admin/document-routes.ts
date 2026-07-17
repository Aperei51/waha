import { getPrisma } from '@abrajeep/database';
import { canManageDocuments, documentMetadataSchema } from '@abrajeep/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdminAuth } from '../../core/auth';
import { audit } from '../../core/audit';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import type { KnowledgeService } from '../knowledge/service';
import { isAllowedMimeType } from '../knowledge/extractor';

/** Gestão da base de conhecimento: upload, listagem, ativação/arquivamento. */
export async function adminDocumentRoutes(
  app: FastifyInstance,
  opts: { knowledge: KnowledgeService },
): Promise<void> {
  app.addHook('preHandler', requireAdminAuth);

  app.get('/admin/documents', async (request) => {
    const query = z
      .object({
        status: z.enum(['active', 'archived']).optional(),
        categoryId: z.string().uuid().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);
    const prisma = getPrisma();
    const where = { deletedAt: null, status: query.status, categoryId: query.categoryId };
    const [total, items] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        include: {
          category: true,
          organization: { select: { name: true } },
          dealership: { select: { name: true, code: true } },
          _count: { select: { chunks: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  });

  /**
   * Upload multipart: campo "file" + campos de metadados
   * (title, audience, categoryId, organizationId, dealershipId, ownerArea).
   */
  app.post('/admin/documents', async (request) => {
    if (!canManageDocuments(request.adminUser!.role)) {
      throw new ForbiddenError('Perfil sem permissão para gerenciar documentos');
    }

    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let fileName = 'documento';
    let mimeType = 'application/octet-stream';
    const fields: Record<string, string> = {};

    for await (const part of parts) {
      if (part.type === 'file') {
        fileName = part.filename ?? fileName;
        mimeType = part.mimetype;
        if (!isAllowedMimeType(mimeType)) {
          throw new ValidationError(`Tipo de arquivo não suportado: ${mimeType}`);
        }
        fileBuffer = await part.toBuffer();
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
    if (!fileBuffer) throw new ValidationError('Arquivo ausente (campo "file")');

    const metadata = documentMetadataSchema.parse({
      ...fields,
      categoryId: fields.categoryId || undefined,
      organizationId: fields.organizationId || undefined,
      dealershipId: fields.dealershipId || undefined,
      ownerArea: fields.ownerArea || undefined,
    });

    const result = await opts.knowledge.ingestDocument({
      buffer: fileBuffer,
      fileName,
      mimeType,
      title: metadata.title,
      categoryId: metadata.categoryId,
      organizationId: metadata.organizationId,
      dealershipId: metadata.dealershipId,
      ownerArea: metadata.ownerArea,
      audience: metadata.audience,
      createdById: request.adminUser!.sub,
    });

    await audit({
      actorType: 'admin',
      action: 'document.upload',
      userId: request.adminUser!.sub,
      resource: 'document',
      resourceId: result.documentId,
      detail: { fileName, chunks: result.chunks },
    });
    return result;
  });

  const setStatus = async (id: string, status: 'active' | 'archived', actorId: string) => {
    const prisma = getPrisma();
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) throw new NotFoundError('Documento não encontrado');
    await prisma.document.update({ where: { id }, data: { status } });
    await audit({
      actorType: 'admin',
      action: `document.${status === 'active' ? 'activate' : 'archive'}`,
      userId: actorId,
      resource: 'document',
      resourceId: id,
    });
  };

  app.post('/admin/documents/:id/archive', async (request) => {
    if (!canManageDocuments(request.adminUser!.role)) throw new ForbiddenError();
    await setStatus((request.params as { id: string }).id, 'archived', request.adminUser!.sub);
    return { ok: true };
  });

  app.post('/admin/documents/:id/activate', async (request) => {
    if (!canManageDocuments(request.adminUser!.role)) throw new ForbiddenError();
    await setStatus((request.params as { id: string }).id, 'active', request.adminUser!.sub);
    return { ok: true };
  });

  // --------------------------- Categorias ---------------------------
  app.get('/admin/categories', async () => {
    return getPrisma().knowledgeCategory.findMany({ orderBy: { name: 'asc' } });
  });

  app.post('/admin/categories', async (request) => {
    if (!canManageDocuments(request.adminUser!.role)) throw new ForbiddenError();
    const body = z
      .object({
        name: z.string().min(2).max(80),
        slug: z
          .string()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9-]+$/),
      })
      .parse(request.body);
    const category = await getPrisma().knowledgeCategory.create({ data: body });
    return { id: category.id };
  });
}
