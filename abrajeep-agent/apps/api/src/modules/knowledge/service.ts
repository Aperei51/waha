import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPrisma, Prisma } from '@abrajeep/database';
import {
  audiencesForRole,
  type AccessContext,
  type DocumentAudience,
} from '@abrajeep/shared';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config';
import { ValidationError } from '../../core/errors';
import type { AIProvider } from '../ai/types';
import { chunkText, estimateTokens } from './chunker';
import { extractText, isAllowedMimeType } from './extractor';

export interface IngestDocumentInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  title: string;
  categoryId?: string;
  organizationId?: string;
  dealershipId?: string;
  ownerArea?: string;
  audience: DocumentAudience;
  createdById?: string;
}

export interface KnowledgeSearchFilters {
  categoryId?: string;
  publishedAfter?: Date;
  limit?: number;
}

export interface KnowledgeSearchResult {
  documentId: string;
  chunkId: string;
  title: string;
  excerpt: string;
  score: number;
  version: number;
  categoryName: string | null;
  audience: string;
}

/**
 * Serviço da base de conhecimento: ingestão de documentos (extração,
 * chunking, embeddings) e busca semântica com filtros de permissão.
 */
export class KnowledgeService {
  constructor(
    private readonly ai: AIProvider,
    private readonly config: Pick<AppConfig, 'UPLOAD_DIR' | 'UPLOAD_MAX_BYTES' | 'EMBEDDING_DIMENSIONS'>,
    private readonly logger: Logger,
  ) {}

  async ingestDocument(input: IngestDocumentInput): Promise<{ documentId: string; chunks: number }> {
    if (!isAllowedMimeType(input.mimeType)) {
      throw new ValidationError(`Tipo de arquivo não suportado: ${input.mimeType}`);
    }
    if (input.buffer.length > this.config.UPLOAD_MAX_BYTES) {
      throw new ValidationError('Arquivo excede o tamanho máximo permitido');
    }

    const prisma = getPrisma();
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');

    // Persistência do arquivo original
    const safeName = input.fileName.replace(/[^\w.\-]/g, '_').slice(0, 120);
    const storagePath = path.join(this.config.UPLOAD_DIR, `${sha256.slice(0, 16)}-${safeName}`);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, input.buffer);

    const text = await extractText(input.buffer, input.mimeType);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new ValidationError('Não foi possível extrair texto do documento');
    }

    const document = await prisma.document.create({
      data: {
        title: input.title,
        categoryId: input.categoryId,
        organizationId: input.organizationId,
        dealershipId: input.dealershipId,
        ownerArea: input.ownerArea,
        audience: input.audience,
        status: 'active',
        version: 1,
        fileName: safeName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        storagePath,
        sha256,
        publishedAt: new Date(),
        createdById: input.createdById,
      },
    });

    const created = await prisma.$transaction(
      chunks.map((content, i) =>
        prisma.documentChunk.create({
          data: {
            documentId: document.id,
            chunkIndex: i,
            content,
            tokenCount: estimateTokens(content),
          },
        }),
      ),
    );

    await this.embedChunks(created.map((c) => ({ id: c.id, content: c.content })));

    this.logger.info(
      { documentId: document.id, chunks: chunks.length },
      'Documento ingerido na base de conhecimento',
    );
    return { documentId: document.id, chunks: chunks.length };
  }

  /** Gera e grava embeddings (coluna vector) para os chunks informados. */
  async embedChunks(chunks: Array<{ id: string; content: string }>): Promise<void> {
    if (chunks.length === 0) return;
    const prisma = getPrisma();
    const vectors = await this.ai.embed(chunks.map((c) => c.content));

    for (let i = 0; i < chunks.length; i++) {
      const vectorLiteral = `[${vectors[i].join(',')}]`;
      const embedding = await prisma.embedding.create({
        data: {
          chunkId: chunks[i].id,
          model: this.ai.name === 'openai' ? 'text-embedding-3-small' : 'mock',
          dimensions: this.config.EMBEDDING_DIMENSIONS,
        },
      });
      await prisma.$executeRaw`UPDATE embeddings SET vector = ${vectorLiteral}::vector WHERE id = ${embedding.id}`;
    }
  }

  /**
   * Busca semântica com controle de acesso aplicado NA CONSULTA:
   * - somente audiências permitidas ao perfil;
   * - documentos de outra organização nunca retornam (exceto PUBLIC);
   * - documentos de concessionária só para a própria concessionária
   *   ou perfis elevados da organização;
   * - somente documentos ativos.
   */
  async search(
    ctx: AccessContext,
    query: string,
    filters: KnowledgeSearchFilters = {},
  ): Promise<KnowledgeSearchResult[]> {
    const prisma = getPrisma();
    const limit = Math.min(filters.limit ?? 5, 20);
    const audiences = audiencesForRole(ctx.role);
    const isElevated = ctx.role === 'MANAGER' || ctx.role === 'OPERATOR' || ctx.role === 'ADMIN';

    const [queryVector] = await this.ai.embed([query]);
    const vectorLiteral = `[${queryVector.join(',')}]`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`d.status = 'active'`,
      Prisma.sql`d."deletedAt" IS NULL`,
      Prisma.sql`d.audience::text IN (${Prisma.join(audiences)})`,
      Prisma.sql`(d.audience = 'PUBLIC' OR d."organizationId" IS NULL OR d."organizationId" = ${ctx.organizationId})`,
    ];
    if (!isElevated) {
      conditions.push(
        Prisma.sql`(d."dealershipId" IS NULL OR d."dealershipId" = ${ctx.dealershipId})`,
      );
    }
    if (filters.categoryId) {
      conditions.push(Prisma.sql`d."categoryId" = ${filters.categoryId}`);
    }
    if (filters.publishedAfter) {
      conditions.push(Prisma.sql`d."publishedAt" >= ${filters.publishedAfter}`);
    }
    const where = Prisma.join(conditions, ' AND ');

    type Row = {
      documentId: string;
      chunkId: string;
      title: string;
      content: string;
      score: number;
      version: number;
      categoryName: string | null;
      audience: string;
    };

    // Busca vetorial (cosine distance → score = 1 - distance)
    const vectorRows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        d.id AS "documentId",
        c.id AS "chunkId",
        d.title,
        c.content,
        1 - (e.vector <=> ${vectorLiteral}::vector) AS score,
        d.version,
        k.name AS "categoryName",
        d.audience::text AS audience
      FROM embeddings e
      JOIN document_chunks c ON c.id = e."chunkId"
      JOIN documents d ON d.id = c."documentId"
      LEFT JOIN knowledge_categories k ON k.id = d."categoryId"
      WHERE e.vector IS NOT NULL AND ${where}
      ORDER BY e.vector <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `);

    let rows = vectorRows;

    // Fallback lexical para bases sem embeddings (ex.: seed) ou sem resultados
    if (rows.length === 0) {
      const terms = query
        .split(/\W+/)
        .filter((t) => t.length >= 4)
        .slice(0, 5);
      if (terms.length > 0) {
        const likeConds = terms.map(
          (t) => Prisma.sql`c.content ILIKE ${'%' + t + '%'}`,
        );
        rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
          SELECT
            d.id AS "documentId",
            c.id AS "chunkId",
            d.title,
            c.content,
            0.5 AS score,
            d.version,
            k.name AS "categoryName",
            d.audience::text AS audience
          FROM document_chunks c
          JOIN documents d ON d.id = c."documentId"
          LEFT JOIN knowledge_categories k ON k.id = d."categoryId"
          WHERE (${Prisma.join(likeConds, ' OR ')}) AND ${where}
          LIMIT ${limit}
        `);
      }
    }

    return rows.map((r) => ({
      documentId: r.documentId,
      chunkId: r.chunkId,
      title: r.title,
      excerpt: r.content.slice(0, 600),
      score: Number(r.score),
      version: r.version,
      categoryName: r.categoryName,
      audience: r.audience,
    }));
  }
}
