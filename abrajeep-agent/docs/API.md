# Referência da API

Base URL padrão: `http://localhost:3001`. Rotas `/admin/*` exigem
`Authorization: Bearer <token>` (obtido no login). Collection pronta em
[`bruno/`](../bruno) (compatível com Bruno; importável no Postman).

## Saúde

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/health` | processo vivo |
| GET | `/ready` | verifica conexão com o banco |

## Webhook WhatsApp

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/webhooks/whatsapp` | verificação da Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`) |
| POST | `/webhooks/whatsapp` | recebimento de mensagens (assinatura `X-Hub-Signature-256` validada quando `WHATSAPP_APP_SECRET` configurado) |

Exemplo de simulação local (modo mock):

```bash
curl -X POST http://localhost:3001/webhooks/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{"object":"whatsapp_business_account","entry":[{"id":"E","changes":[{"field":"messages","value":{"contacts":[{"wa_id":"5511900000004","profile":{"name":"Associado"}}],"messages":[{"id":"wamid.test1","from":"5511900000004","timestamp":"1760000000","type":"text","text":{"body":"Qual é a meta de NPS de pós-vendas?"}}]}}]}]}'
```

## Autenticação do painel

```
POST /admin/auth/login
{ "email": "admin@abrajeep.org.br", "password": "..." }
→ { "token": "...", "user": { ... } }
```

## Conversas

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/admin/conversations?status=&q=&from=&to=&page=&pageSize=` | lista com filtros (status, telefone/nome, período) |
| GET | `/admin/conversations/:id` | histórico completo: mensagens, anexos, fontes, tool calls, ações |
| POST | `/admin/conversations/:id/claim` | operador assume (WAITING_HUMAN → HUMAN_HANDLING) |
| POST | `/admin/conversations/:id/return-to-agent` | devolve ao agente |
| POST | `/admin/conversations/:id/resolve` | marca resolvida |
| POST | `/admin/conversations/:id/close` | encerra |
| POST | `/admin/conversations/:id/messages` | envio manual pelo operador (`{ "text": "..." }`) — somente em HUMAN_HANDLING |

## Cadastros

| Método | Rota |
| --- | --- |
| GET/POST | `/admin/users` (POST/PATCH exigem ADMIN) |
| PATCH | `/admin/users/:id` |
| GET/POST | `/admin/organizations` |
| GET/POST | `/admin/dealerships` |

## Base de conhecimento

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/admin/documents` | lista com paginação e filtros |
| POST | `/admin/documents` | upload multipart: `file` + `title`, `audience` (`PUBLIC\|ASSOCIATES\|DEALERSHIP\|INTERNAL\|ADMIN`), `categoryId?`, `organizationId?`, `dealershipId?`, `ownerArea?` |
| POST | `/admin/documents/:id/archive` | arquiva |
| POST | `/admin/documents/:id/activate` | reativa |
| GET/POST | `/admin/categories` | categorias |

## Métricas e observabilidade

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/admin/metrics` | conversas, mensagens, custo estimado, tokens, erros, feedback |
| GET | `/admin/audit-logs?action=&page=` | trilha de auditoria |
| GET | `/admin/feedback` | feedbacks dos usuários |

## LGPD (somente ADMIN)

| Método | Rota |
| --- | --- |
| GET | `/admin/lgpd/users/:id/export` |
| POST | `/admin/lgpd/users/:id/anonymize` |
| GET | `/admin/lgpd/users/:id/consents` |

## Público

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/public/documents/:id?token=` | download com URL assinada (15 min) — usada pela função `enviar_documento` |

## Funções do agente (function calling)

`buscar_documentos`, `listar_comunicados`, `consultar_treinamentos`,
`abrir_solicitacao`, `consultar_solicitacao`, `transferir_para_humano`,
`identificar_usuario`, `consultar_perfil`, `enviar_documento`,
`registrar_feedback`, `consultar_nps`*, `consultar_concessionaria`*.

\* retornam dados de demonstração rotulados até a integração real.
