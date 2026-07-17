import type { PrismaClient } from '@abrajeep/database';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, type ToolContext } from '../src/modules/agent/tools/registry';

vi.mock('../src/core/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

const toolCallCreate = vi.fn().mockResolvedValue({});
const stubPrisma = { toolCall: { create: toolCallCreate } } as unknown as PrismaClient;

function makeCtx(role: 'VISITOR' | 'ADMIN' = 'VISITOR'): ToolContext {
  return {
    user: {
      id: 'user-1',
      name: 'Teste',
      phone: '5511999999999',
      role,
      organizationId: null,
      dealershipId: null,
    },
    conversationId: 'conv-1',
    correlationId: 'corr-1',
    services: {
      prisma: stubPrisma,
      knowledge: {} as never,
      whatsapp: {} as never,
      config: {} as never,
      logger: pino({ level: 'silent' }),
    },
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    toolCallCreate.mockClear();
    registry.register({
      name: 'somar',
      description: 'Soma dois números',
      parameters: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
      schema: z.object({ a: z.number(), b: z.number() }),
      handler: async (args: { a: number; b: number }) => ({ total: args.a + args.b }),
    });
    registry.register({
      name: 'restrita',
      description: 'Ação restrita a administradores',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      allowedRoles: ['ADMIN'],
      handler: async () => ({ ok: true }),
    });
    registry.register({
      name: 'falha',
      description: 'Sempre lança erro',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async () => {
        throw new Error('stack trace interna secreta');
      },
    });
  });

  it('executa função com argumentos válidos', async () => {
    const { output, record } = await registry.execute('somar', '{"a":2,"b":3}', makeCtx());
    expect(JSON.parse(output)).toEqual({ total: 5 });
    expect(record.status).toBe('success');
    expect(toolCallCreate).toHaveBeenCalledOnce();
  });

  it('rejeita argumentos inválidos com mensagem estruturada', async () => {
    const { output, record } = await registry.execute('somar', '{"a":"x"}', makeCtx());
    expect(record.status).toBe('error');
    expect(JSON.parse(output).error).toContain('Parâmetros inválidos');
  });

  it('rejeita JSON malformado sem lançar', async () => {
    const { record } = await registry.execute('somar', '{invalid', makeCtx());
    expect(record.status).toBe('error');
  });

  it('nega execução para perfil sem permissão', async () => {
    const { output, record } = await registry.execute('restrita', '{}', makeCtx('VISITOR'));
    expect(record.status).toBe('denied');
    expect(JSON.parse(output).error).toContain('não tem permissão');
  });

  it('permite execução para perfil autorizado', async () => {
    const { record } = await registry.execute('restrita', '{}', makeCtx('ADMIN'));
    expect(record.status).toBe('success');
  });

  it('retorna erro para função desconhecida', async () => {
    const { output, record } = await registry.execute('inexistente', '{}', makeCtx());
    expect(record.status).toBe('error');
    expect(JSON.parse(output).error).toContain('desconhecida');
  });

  it('não vaza detalhes internos quando o handler falha', async () => {
    const { output, record } = await registry.execute('falha', '{}', makeCtx());
    expect(record.status).toBe('error');
    expect(output).not.toContain('stack trace interna secreta');
    expect(JSON.parse(output).error).toContain('atendimento humano');
  });
});
