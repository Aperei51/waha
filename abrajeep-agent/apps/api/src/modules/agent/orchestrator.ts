import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPrisma, Prisma, type UserRole } from '@abrajeep/database';
import { detectsHumanHandoffRequest, isAgentPaused, type ConversationStatus } from '@abrajeep/shared';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config';
import { audit } from '../../core/audit';
import { newCorrelationId } from '../../core/logger';
import type { AIInputItem, AIProvider } from '../ai/types';
import {
  buildInstructions,
  loadActiveSystemPrompt,
  looksLikeInjection,
  wrapUntrustedContent,
} from '../ai/prompts';
import type { KnowledgeService } from '../knowledge/service';
import { requestHumanHandoff } from '../handoff/service';
import type { NormalizedInboundMessage, WhatsAppProvider } from '../whatsapp/types';
import { registerDefaultTools } from './tools/definitions';
import { ToolRegistry, type ToolContext } from './tools/registry';

const MAX_TOOL_ITERATIONS = 5;
const SUMMARY_THRESHOLD_MESSAGES = 30;

const HANDOFF_CONFIRMATION =
  'Entendido! Estou transferindo você para atendimento humano. Uma pessoa da nossa equipe dará continuidade em breve.';

const GENERIC_FAILURE =
  'Desculpe, tive um problema para processar sua mensagem. Por favor, tente novamente em instantes ou digite "falar com atendente" para atendimento humano.';

/**
 * Orquestrador do agente: pipeline completo de uma mensagem recebida.
 *
 * webhook → idempotência → usuário → conversa → anexos/transcrição →
 * guarda de handoff → loop de function calling com a OpenAI →
 * resposta pelo WhatsApp → registro integral.
 */
export class AgentOrchestrator {
  private readonly registry = new ToolRegistry();

  constructor(
    private readonly ai: AIProvider,
    private readonly whatsapp: WhatsAppProvider,
    private readonly knowledge: KnowledgeService,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    registerDefaultTools(this.registry);
  }

  async handleInboundMessage(inbound: NormalizedInboundMessage): Promise<void> {
    const prisma = getPrisma();
    const correlationId = newCorrelationId();
    const log = this.logger.child({ correlationId, wamid: inbound.providerMessageId });

    // ------------------------------------------------------------------
    // Idempotência: cada wamid é processado uma única vez
    // ------------------------------------------------------------------
    try {
      await prisma.webhookEvent.create({
        data: { provider: 'whatsapp', externalId: inbound.providerMessageId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        log.info('Mensagem duplicada ignorada (idempotência)');
      } else {
        log.error({ err }, 'Falha ao registrar evento de webhook — mensagem descartada');
      }
      return;
    }

    try {
      await this.process(inbound, correlationId);
      await prisma.webhookEvent.update({
        where: { provider_externalId: { provider: 'whatsapp', externalId: inbound.providerMessageId } },
        data: { status: 'processed', processedAt: new Date() },
      });
    } catch (err) {
      log.error({ err }, 'Falha ao processar mensagem recebida');
      await prisma.webhookEvent
        .update({
          where: {
            provider_externalId: { provider: 'whatsapp', externalId: inbound.providerMessageId },
          },
          data: {
            status: 'failed',
            attempts: { increment: 1 },
            lastError: err instanceof Error ? err.message : String(err),
          },
        })
        .catch(() => undefined);
      // Nunca enviar stack trace ao usuário — apenas mensagem genérica
      await this.whatsapp.sendText(inbound.from, GENERIC_FAILURE).catch(() => undefined);
    }
  }

  private async process(inbound: NormalizedInboundMessage, correlationId: string): Promise<void> {
    const prisma = getPrisma();
    const log = this.logger.child({ correlationId });

    // ------------------------------------------------------------------
    // Identificação do usuário pelo telefone
    // ------------------------------------------------------------------
    let user = await prisma.user.findUnique({
      where: { phone: inbound.from },
      include: { organization: true, dealership: true },
    });
    if (!user) {
      user = await prisma.user.create({
        data: { phone: inbound.from, name: inbound.profileName ?? null, role: 'VISITOR' },
        include: { organization: true, dealership: true },
      });
      await audit({
        actorType: 'system',
        action: 'user.auto_register',
        userId: user.id,
        detail: { source: 'whatsapp' },
        correlationId,
      });
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    // ------------------------------------------------------------------
    // Conversa ativa (com expiração de contexto configurável)
    // ------------------------------------------------------------------
    const ttlMs = this.config.CONVERSATION_CONTEXT_TTL_MINUTES * 60_000;
    const cutoff = new Date(Date.now() - ttlMs);
    let conversation = await prisma.conversation.findFirst({
      where: {
        userId: user.id,
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        lastMessageAt: { gte: cutoff },
        deletedAt: null,
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, organizationId: user.organizationId, status: 'OPEN' },
      });
    }

    // ------------------------------------------------------------------
    // Conteúdo da mensagem: texto, áudio (transcrição) ou anexo
    // ------------------------------------------------------------------
    let userText = inbound.text ?? inbound.caption ?? '';
    let transcription: string | null = null;
    let attachment: { kind: string; providerMediaId: string; mimeType?: string; fileName?: string; storagePath?: string; sizeBytes?: number; sha256?: string } | null = null;

    if (inbound.media) {
      try {
        const media = await this.whatsapp.downloadMedia(inbound.media.providerMediaId);
        const sha256 = createHash('sha256').update(media.data).digest('hex');
        const dir = path.join(this.config.UPLOAD_DIR, 'inbound');
        await mkdir(dir, { recursive: true });
        const storagePath = path.join(dir, `${sha256.slice(0, 24)}`);
        if (media.data.length <= this.config.UPLOAD_MAX_BYTES) {
          await writeFile(storagePath, media.data);
        }
        attachment = {
          kind: inbound.kind,
          providerMediaId: inbound.media.providerMediaId,
          mimeType: media.mimeType ?? inbound.media.mimeType,
          fileName: inbound.media.fileName,
          storagePath,
          sizeBytes: media.data.length,
          sha256,
        };
        if (inbound.kind === 'audio') {
          transcription = await this.ai.transcribe(media.data, media.mimeType);
          userText = transcription;
        } else if (!userText) {
          userText = `[o usuário enviou um arquivo: ${inbound.media.fileName ?? inbound.kind}]`;
        }
      } catch (err) {
        log.warn({ err }, 'Falha ao baixar/processar mídia');
        if (!userText) userText = `[falha ao processar ${inbound.kind} recebido]`;
      }
    }

    if (inbound.kind === 'unsupported') {
      userText = userText || '[tipo de mensagem não suportado]';
    }

    if (looksLikeInjection(userText)) {
      await audit({
        actorType: 'system',
        action: 'security.possible_prompt_injection',
        userId: user.id,
        resource: 'conversation',
        resourceId: conversation.id,
        correlationId,
      });
    }

    // ------------------------------------------------------------------
    // Registro da mensagem recebida
    // ------------------------------------------------------------------
    const inboundMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        providerMessageId: inbound.providerMessageId,
        type: inbound.kind,
        text: userText || null,
        transcription,
        authorType: 'user',
        authorId: user.id,
        createdAt: inbound.timestamp,
      },
    });
    if (attachment) {
      await prisma.messageAttachment.create({
        data: { messageId: inboundMessage.id, ...attachment },
      });
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    await this.whatsapp.markAsRead(inbound.providerMessageId).catch(() => undefined);

    // ------------------------------------------------------------------
    // Atendimento humano: agente pausado não responde
    // ------------------------------------------------------------------
    if (isAgentPaused(conversation.status as ConversationStatus)) {
      log.info({ conversationId: conversation.id }, 'Conversa em atendimento humano — agente pausado');
      return;
    }

    // Guarda determinística de pedido de atendimento humano
    if (userText && detectsHumanHandoffRequest(userText)) {
      await requestHumanHandoff(conversation.id, 'Solicitado pelo usuário', null);
      await this.sendAndRecord(conversation.id, user.id, inbound.from, HANDOFF_CONFIRMATION, null);
      return;
    }

    // ------------------------------------------------------------------
    // Resumo automático de conversas longas
    // ------------------------------------------------------------------
    const messageCount = await prisma.message.count({
      where: { conversationId: conversation.id },
    });
    if (messageCount > SUMMARY_THRESHOLD_MESSAGES && !conversation.contextSummary) {
      await this.summarizeConversation(conversation.id);
      conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
    }

    // ------------------------------------------------------------------
    // Geração da resposta com function calling
    // ------------------------------------------------------------------
    const basePrompt = await loadActiveSystemPrompt();
    const instructions = buildInstructions(basePrompt, {
      name: user.name,
      role: user.role as UserRole,
      organizationName: user.organization?.name ?? null,
      dealershipName: user.dealership?.name ?? null,
    });

    const toolCtx: ToolContext = {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role as UserRole,
        organizationId: user.organizationId,
        dealershipId: user.dealershipId,
      },
      conversationId: conversation.id,
      correlationId,
      services: {
        prisma,
        knowledge: this.knowledge,
        whatsapp: this.whatsapp,
        config: this.config,
        logger: log,
      },
    };

    let input: AIInputItem[] = [];
    if (conversation.contextSummary && !conversation.aiConversationId) {
      input.push({
        type: 'message',
        role: 'system',
        content: `Resumo do histórico anterior desta conversa:\n${conversation.contextSummary}`,
      });
    }
    input.push({
      type: 'message',
      role: 'user',
      content: wrapUntrustedContent('mensagem_usuario', userText || '[mensagem vazia]'),
    });

    let previousResponseId = conversation.aiConversationId ?? null;
    let finalText: string | null = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let lastResponseId: string | null = previousResponseId;
    const collectedSources: Array<Record<string, unknown>> = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.ai.generate({
        instructions,
        input,
        tools: this.registry.toAIDefinitions(),
        previousResponseId,
        maxOutputTokens: this.config.AI_MAX_OUTPUT_TOKENS,
      });

      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;
      totalCost += response.usage.estimatedCostUsd;
      lastResponseId = response.responseId ?? lastResponseId;

      if (response.toolCalls.length === 0) {
        finalText = response.text;
        break;
      }

      const toolOutputs: AIInputItem[] = [];
      for (const call of response.toolCalls) {
        const { output } = await this.registry.execute(
          call.name,
          call.arguments,
          toolCtx,
          inboundMessage.id,
        );
        if (call.name === 'buscar_documentos') {
          try {
            const parsed = JSON.parse(output) as { results?: Array<Record<string, unknown>> };
            for (const r of parsed.results ?? []) {
              collectedSources.push({ ...r, consultedAt: new Date().toISOString() });
            }
          } catch {
            // fonte não estruturada — ignora
          }
        }
        toolOutputs.push({ type: 'tool_result', callId: call.callId, output });
      }

      previousResponseId = response.responseId;
      input = toolOutputs;
      // Se o modelo respondeu texto junto com tool calls, guarda como candidato
      if (response.text) finalText = response.text;
    }

    if (!finalText) {
      finalText =
        'Não consegui concluir sua solicitação com segurança. Deseja que eu transfira para atendimento humano?';
    }

    // ------------------------------------------------------------------
    // Envio e registro da resposta
    // ------------------------------------------------------------------
    await this.sendAndRecord(conversation.id, user.id, inbound.from, finalText, {
      sources: collectedSources,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedCostUsd: totalCost,
      aiResponseId: lastResponseId,
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: conversation.status === 'OPEN' ? 'AGENT_HANDLING' : undefined,
        aiConversationId: lastResponseId,
        lastMessageAt: new Date(),
      },
    });
  }

  private async sendAndRecord(
    conversationId: string,
    userId: string,
    to: string,
    text: string,
    meta: {
      sources: Array<Record<string, unknown>>;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
      aiResponseId: string | null;
    } | null,
  ): Promise<void> {
    const prisma = getPrisma();
    const sent = await this.whatsapp.sendText(to, text);
    await prisma.message.create({
      data: {
        conversationId,
        direction: 'OUTBOUND',
        providerMessageId: sent.providerMessageId,
        type: 'text',
        text,
        authorType: 'agent',
        authorId: userId,
        sources: meta?.sources?.length ? (meta.sources as Prisma.InputJsonValue) : undefined,
        inputTokens: meta?.inputTokens,
        outputTokens: meta?.outputTokens,
        estimatedCostUsd: meta?.estimatedCostUsd,
        aiResponseId: meta?.aiResponseId,
      },
    });
  }

  private async summarizeConversation(conversationId: string): Promise<void> {
    const prisma = getPrisma();
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    const transcriptText = messages
      .map((m) => `${m.direction === 'INBOUND' ? 'Usuário' : 'Agente'}: ${m.text ?? ''}`)
      .join('\n');
    try {
      const summary = await this.ai.summarize(transcriptText.slice(0, 20_000));
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { contextSummary: summary },
      });
      await prisma.agentAction.create({
        data: { conversationId, type: 'summary', detail: { length: summary.length } },
      });
    } catch (err) {
      this.logger.warn({ err }, 'Falha ao resumir conversa (ignorada)');
    }
  }
}
