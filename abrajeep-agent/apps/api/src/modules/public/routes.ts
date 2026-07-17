import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { getPrisma } from '@abrajeep/database';
import type { FastifyInstance } from 'fastify';
import { verifyDocumentDownloadToken } from '../agent/tools/definitions';

/**
 * Download de documentos com URL assinada de curta duração.
 * Usado pela função enviar_documento — a WhatsApp Cloud API baixa o arquivo
 * a partir desta URL.
 */
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { token } = request.query as { token?: string };

    const authorizedId = token ? verifyDocumentDownloadToken(token) : null;
    if (!authorizedId || authorizedId !== id) {
      return reply.status(403).send({ error: 'Link inválido ou expirado' });
    }

    const doc = await getPrisma().document.findUnique({ where: { id } });
    if (!doc?.storagePath || doc.deletedAt) {
      return reply.status(404).send({ error: 'Documento não encontrado' });
    }

    try {
      await stat(doc.storagePath);
    } catch {
      return reply.status(404).send({ error: 'Arquivo não disponível' });
    }

    reply.header('Content-Type', doc.mimeType ?? 'application/octet-stream');
    reply.header(
      'Content-Disposition',
      `attachment; filename="${(doc.fileName ?? 'documento').replace(/"/g, '')}"`,
    );
    return reply.send(createReadStream(doc.storagePath));
  });
}
