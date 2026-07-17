import type { PrismaClient } from '@abrajeep/database';
import type { AccessContext, UserRole } from '@abrajeep/shared';
import type { Logger } from 'pino';
import type { ZodTypeAny } from 'zod';
import type { AppConfig } from '../../../config';
import { audit } from '../../../core/audit';
import type { AIToolDefinition } from '../../ai/types';
import type { KnowledgeService } from '../../knowledge/service';
import type { WhatsAppProvider } from '../../whatsapp/types';

export interface ToolUser extends AccessContext {
  id: string;
  name: string | null;
  phone: string;
}

export interface ToolContext {
  user: ToolUser;
  conversationId: string;
  correlationId: string;
  services: {
    prisma: PrismaClient;
    knowledge: KnowledgeService;
    whatsapp: WhatsAppProvider;
    config: AppConfig;
    logger: Logger;
  };
}

export interface ToolDefinition<Args = unknown> {
  name: string;
  description: string;
  /** JSON Schema exposto ao modelo. */
  parameters: Record<string, unknown>;
  /** Validação real dos argumentos recebidos do modelo. */
  schema: ZodTypeAny;
  /** Perfis autorizados. Vazio/undefined = todos. */
  allowedRoles?: UserRole[];
  handler: (args: Args, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolExecutionRecord {
  name: string;
  arguments: unknown;
  result: unknown;
  status: 'success' | 'error' | 'denied';
  errorMessage?: string;
  durationMs: number;
}

/**
 * Registro central de funções do agente. Toda execução:
 * 1. valida os argumentos com Zod;
 * 2. valida permissão do perfil;
 * 3. executa com tratamento de erro (nunca vaza stack trace ao modelo);
 * 4. registra tool_call no banco e auditoria.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<never>>();

  register<T>(tool: ToolDefinition<T>): void {
    this.tools.set(tool.name, tool as ToolDefinition<never>);
  }

  toAIDefinitions(): AIToolDefinition[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async execute(
    name: string,
    rawArguments: string,
    ctx: ToolContext,
    messageId?: string,
  ): Promise<{ output: string; record: ToolExecutionRecord }> {
    const started = Date.now();
    const tool = this.tools.get(name);

    const finish = async (
      status: ToolExecutionRecord['status'],
      result: unknown,
      args: unknown,
      errorMessage?: string,
    ) => {
      const record: ToolExecutionRecord = {
        name,
        arguments: args,
        result,
        status,
        errorMessage,
        durationMs: Date.now() - started,
      };
      try {
        await ctx.services.prisma.toolCall.create({
          data: {
            messageId: messageId ?? null,
            name,
            arguments: (args ?? {}) as object,
            result: (result ?? {}) as object,
            status,
            errorMessage: errorMessage ?? null,
            durationMs: record.durationMs,
          },
        });
      } catch (err) {
        ctx.services.logger.warn({ err }, 'Falha ao registrar tool_call');
      }
      await audit({
        actorType: 'agent',
        action: `tool.${name}`,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        resource: 'conversation',
        resourceId: ctx.conversationId,
        detail: { status },
        correlationId: ctx.correlationId,
      });
      return { output: JSON.stringify(result), record };
    };

    if (!tool) {
      return finish('error', { error: `Função desconhecida: ${name}` }, undefined, 'unknown_tool');
    }

    let args: unknown;
    try {
      args = rawArguments ? JSON.parse(rawArguments) : {};
    } catch {
      return finish('error', { error: 'Argumentos inválidos (JSON malformado)' }, rawArguments, 'bad_json');
    }

    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return finish('error', { error: `Parâmetros inválidos: ${issues}` }, args, 'invalid_params');
    }

    if (tool.allowedRoles && !tool.allowedRoles.includes(ctx.user.role)) {
      return finish(
        'denied',
        { error: 'O usuário atual não tem permissão para esta ação.' },
        parsed.data,
        'permission_denied',
      );
    }

    try {
      const result = await tool.handler(parsed.data as never, ctx);
      return finish('success', result, parsed.data);
    } catch (err) {
      ctx.services.logger.error({ err, tool: name }, 'Erro na execução de função do agente');
      return finish(
        'error',
        { error: 'A função falhou. Informe o usuário e ofereça atendimento humano.' },
        parsed.data,
        err instanceof Error ? err.message : 'unknown_error',
      );
    }
  }
}
