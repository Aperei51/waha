# Agente ABRAJEEP — Atendimento WhatsApp com OpenAI

Agente institucional da ABRAJEEP que atende associados, concessionárias, gestores e
usuários internos pelo WhatsApp, respondendo com base em uma base de conhecimento
interna (busca semântica com pgvector), executando ações via function calling e
transferindo para atendimento humano quando necessário.

## Visão geral

```
WhatsApp (usuário)
   │  Cloud API (Meta)
   ▼
Webhook  ──►  Orquestrador do agente ──► OpenAI Responses API
   │              │        ▲                    │
   │              ▼        │ function calling   ▼
   │        Base de conhecimento (pgvector) ── Funções (tickets, NPS, handoff…)
   │              │
   ▼              ▼
PostgreSQL (conversas, mensagens, auditoria, custos)
   ▲
   │
Painel administrativo (Next.js) — conversas, documentos, usuários, métricas, LGPD
```

## Stack

| Camada | Tecnologia |
| --- | --- |
| Backend | Node.js 22, TypeScript estrito, Fastify, Zod |
| IA | OpenAI Responses API (function calling), Embeddings, Whisper |
| Banco | PostgreSQL 16 + pgvector, Prisma ORM |
| Painel | Next.js 14 (App Router) |
| Infra | Docker Compose |
| Testes | Vitest |

## Estrutura do repositório

```
abrajeep-agent/
├── apps/
│   ├── api/            # Backend Fastify (webhook, agente, painel-API)
│   │   ├── src/modules/whatsapp/    # Provedor isolado (Meta Cloud API + mock)
│   │   ├── src/modules/ai/          # Provedor de IA (OpenAI + mock)
│   │   ├── src/modules/knowledge/   # Ingestão, chunking, embeddings, busca
│   │   ├── src/modules/agent/       # Orquestrador + funções (tools)
│   │   ├── src/modules/handoff/     # Máquina de estados do atendimento
│   │   └── src/modules/admin/       # Rotas do painel (auth, LGPD, métricas…)
│   └── admin/          # Painel administrativo Next.js
├── packages/
│   ├── database/       # Schema Prisma, migrations, seed
│   └── shared/         # Tipos, schemas Zod, regras de permissão
├── docker/             # Dockerfiles
├── docs/               # ARCHITECTURE, SECURITY, LGPD, API, DEPLOYMENT
├── bruno/              # Collection de API (Bruno)
└── docker-compose.yml
```

## Execução rápida (Docker)

```bash
cd abrajeep-agent
cp .env.example .env          # ajuste JWT_SECRET, ENCRYPTION_KEY e senha do seed
docker compose up --build
```

- API: http://localhost:3001 (`/health`, `/ready`)
- Painel: http://localhost:3000

Depois de subir, rode o seed (dados de demonstração):

```bash
docker compose exec api sh -c "cd packages/database && npx tsx prisma/seed.ts"
```

> Sem credenciais da Meta/OpenAI o sistema roda em **modo demonstração**
> (`WHATSAPP_PROVIDER=mock`, `AI_PROVIDER=mock`): as mensagens "enviadas" são
> registradas no log e as respostas de IA são determinísticas — o pipeline
> completo (webhook → busca → function calling → resposta) funciona sem chaves.

## Execução local (sem Docker)

Requisitos: Node 20+, PostgreSQL com pgvector.

```bash
cd abrajeep-agent
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate           # aplica migrations (requer DATABASE_URL válida)
npm run db:seed
npm run dev:api              # API em :3001
npm run dev:admin            # painel em :3000
```

## Testes e qualidade

```bash
npm run test        # Vitest (parser de webhook, assinatura, permissões,
                    #  isolamento entre organizações, handoff, tools, chunker)
npm run typecheck   # TypeScript estrito em todos os workspaces
```

## Configuração do WhatsApp Cloud API

1. Crie um app na [Meta for Developers](https://developers.facebook.com/) com o produto WhatsApp.
2. Copie o **Phone Number ID**, o **WABA ID** e gere um **token permanente**.
3. Configure o webhook apontando para `https://SEU_DOMINIO/webhooks/whatsapp`,
   usando o valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN` do seu `.env`.
4. Assine o campo `messages`.
5. Preencha `WHATSAPP_APP_SECRET` (validação de assinatura) e mude
   `WHATSAPP_PROVIDER=meta`.

## Configuração da OpenAI

1. Gere uma chave em https://platform.openai.com/.
2. Preencha `OPENAI_API_KEY` e mude `AI_PROVIDER=openai`.
3. Ajuste `OPENAI_MODEL` se desejar (padrão `gpt-4.1-mini`).

## Credenciais de demonstração (seed)

| Painel | Valor |
| --- | --- |
| E-mail | `admin@abrajeep.org.br` (ou `SEED_ADMIN_EMAIL`) |
| Senha | valor de `SEED_ADMIN_PASSWORD` |

Usuários WhatsApp de exemplo: `5511900000003` (concessionária SP),
`5511900000004` (associado). Use a collection Bruno (`bruno/`) para simular
mensagens de webhook.

## Documentação

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitetura, fluxos e decisões
- [docs/SECURITY.md](docs/SECURITY.md) — políticas de segurança
- [docs/LGPD.md](docs/LGPD.md) — tratamento de dados pessoais
- [docs/API.md](docs/API.md) — referência de endpoints
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — implantação em nuvem

## Limitações conhecidas e próximos passos

- Autenticação de usuários finais (código por WhatsApp/e-mail, CPF/CNPJ) tem a
  estrutura preparada no modelo, mas o fluxo de verificação não está implementado.
- `consultar_nps`, `consultar_treinamentos` e resultados de concessionária usam
  dados de demonstração rotulados — pendem integração com sistemas reais.
- Fila assíncrona (BullMQ/Redis) não incluída; o processamento é in-process.
- Integrações futuras planejadas: n8n, Google Drive, Power BI, e-mail e CRM —
  a interface de provedores (WhatsApp/IA) já foi desenhada para essa evolução.
