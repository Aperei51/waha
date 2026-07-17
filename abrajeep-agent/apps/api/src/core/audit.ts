import { getPrisma } from '@abrajeep/database';
import type { Prisma } from '@abrajeep/database';

export interface AuditEntry {
  actorType: 'user' | 'operator' | 'admin' | 'agent' | 'system';
  action: string;
  organizationId?: string | null;
  userId?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  detail?: Prisma.InputJsonValue;
  ip?: string | null;
  correlationId?: string | null;
}

/**
 * Registro de auditoria. Falha de auditoria nunca derruba a operação
 * principal — é logada e engolida (best effort).
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await getPrisma().auditLog.create({
      data: {
        actorType: entry.actorType,
        action: entry.action,
        organizationId: entry.organizationId ?? null,
        userId: entry.userId ?? null,
        resource: entry.resource ?? null,
        resourceId: entry.resourceId ?? null,
        detail: entry.detail,
        ip: entry.ip ?? null,
        correlationId: entry.correlationId ?? null,
      },
    });
  } catch {
    // auditoria é best-effort; erro já é reportado pelo logger do Prisma
  }
}
