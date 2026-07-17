# Arquitetura

## Componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                            apps/api (Fastify)                       │
│                                                                     │
│  ┌────────────┐   ┌──────────────────┐   ┌───────────────────────┐  │
│  │ whatsapp/  │──►│ agent/           │──►│ ai/                   │  │
│  │ webhook +  │   │ orchestrator     │   │ OpenAI Responses API  │  │
│  │ provider   │◄──│ (pipeline)       │◄──│ (+ mock p/ dev)       │  │
│  └────────────┘   │                  │   └───────────────────────┘  │
│                   │  ┌────────────┐  │   ┌───────────────────────┐  │
│                   │  │ tools/     │──┼──►│ knowledge/            │  │
│                   │  │ registry   │  │   │ pgvector + permissões │  │
│                   │  └────────────┘  │   └───────────────────────┘  │
│                   └──────────────────┘                              │
│  ┌────────────┐   ┌──────────────────┐   ┌───────────────────────┐  │
│  │ admin/     │   │ handoff/         │   │ core/                 │  │
│  │ rotas REST │   │ máquina estados  │   │ auth, audit, logger   │  │
│  └────────────┘   └──────────────────┘   └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
          │                                        │
          ▼                                        ▼
   apps/admin (Next.js)                 PostgreSQL 16 + pgvector
```

## Fluxo de uma mensagem

1. Meta envia POST em `/webhooks/whatsapp`; a assinatura `X-Hub-Signature-256`
   é validada com o App Secret (HMAC-SHA256 do corpo bruto, comparação em tempo
   constante).
2. A rota responde `200` imediatamente (a Meta reenvia eventos lentos) e o
   processamento continua assíncrono.
3. **Idempotência**: o `wamid` é gravado em `webhook_events` com constraint
   única — mensagens duplicadas são descartadas.
4. O usuário é identificado pelo telefone (E.164). Desconhecidos viram
   `VISITOR` (somente conteúdo público).
5. Conversa ativa é recuperada (ou criada) respeitando o TTL de contexto
   (`CONVERSATION_CONTEXT_TTL_MINUTES`).
6. Mídias são baixadas da Graph API; áudios são transcritos (Whisper); anexos
   são registrados em `message_attachments`.
7. **Guardas**: se a conversa está em `WAITING_HUMAN`/`HUMAN_HANDLING`, o agente
   não responde. Pedidos explícitos de atendimento humano (regex determinística)
   transferem imediatamente, sem depender da IA.
8. O orquestrador monta as instruções (prompt versionado no banco + contexto do
   usuário + regras imutáveis) e chama a **Responses API** com as funções
   registradas. O encadeamento usa `previous_response_id`; conversas longas
   ganham resumo automático.
9. Cada function call passa pelo `ToolRegistry`: parse JSON → validação Zod →
   verificação de perfil → execução → registro em `tool_calls` + auditoria.
   Loop limitado a 5 iterações.
10. A resposta final é enviada pelo provedor de WhatsApp e gravada com fontes
    consultadas, tokens e custo estimado.

## Decisões técnicas

| Decisão | Justificativa |
| --- | --- |
| **Fastify** em vez de NestJS | menor overhead, DI explícita e simples de auditar; o repositório WAHA já usa NestJS, mas o agente é um sistema separado e enxuto |
| **Prisma** | migrations versionadas, tipos gerados; pgvector via `Unsupported("vector")` + SQL bruto parametrizado |
| **Interfaces de provedor** (`WhatsAppProvider`, `AIProvider`) | trocar Meta↔WAHA ou OpenAI↔outro modelo sem tocar no núcleo; mocks de desenvolvimento implementam as mesmas interfaces |
| **Permissões na consulta SQL** | o filtro de audiência/organização/concessionária é aplicado dentro da busca vetorial — documento não autorizado nunca chega ao modelo |
| **Responses API com `previous_response_id`** | contexto gerenciado pela OpenAI reduz reenvio de histórico; resumo local cobre expiração/novas conversas |
| **Handoff determinístico + via IA** | regex garante a transferência mesmo se o modelo falhar; a função `transferir_para_humano` cobre os casos julgados pela IA |
| **Monorepo npm workspaces** | simples, sem ferramenta extra; `packages/shared` concentra regras de permissão reutilizadas por API e testes |
| **CSS puro no painel** | zero dependência de build extra; Tailwind pode ser adotado depois sem reescrever a estrutura |

## Riscos e mitigações

- **Prompt injection** (documentos/mensagens): conteúdo não confiável é
  envelopado (`<documento>`, `<mensagem_usuario>`), delimitadores internos são
  removidos, instruções fixas ordenam ignorar comandos embutidos e tentativas
  são auditadas (`security.possible_prompt_injection`).
- **Vazamento entre organizações**: regra central `canReadDocument` +
  filtros SQL + testes de isolamento dedicados.
- **Alucinação**: instruções exigem fonte documental para dados institucionais,
  com fallback explícito de "não encontrei fonte confiável" e oferta de handoff.
- **Custo**: tokens e custo estimado são gravados por mensagem e agregados no
  painel; `AI_MAX_OUTPUT_TOKENS` limita respostas.
- **Reprocessamento**: eventos com falha ficam em `webhook_events` com status
  `failed` e contador de tentativas para reprocessamento futuro.

## Evolução prevista

- Fila BullMQ/Redis para processamento de mídia e ingestão pesada.
- Fluxo de verificação de identidade (código via WhatsApp, e-mail, CPF/CNPJ).
- Conectores n8n / Google Drive / Power BI / CRM implementando novas tools no
  `ToolRegistry` (contrato já definido).
- Observabilidade externa (Sentry/Grafana): logs estruturados com
  `correlationId` já prontos para exportação.
