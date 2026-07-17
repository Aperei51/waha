# LGPD — Tratamento de Dados Pessoais

## Dados tratados

| Dado | Finalidade | Base legal sugerida |
| --- | --- | --- |
| Telefone (WhatsApp) | Identificação e atendimento | Execução de contrato / legítimo interesse |
| Nome, e-mail, cargo | Cadastro e personalização | Consentimento / execução de contrato |
| Mensagens e anexos | Prestação do atendimento e histórico | Execução de contrato |
| Transcrições de áudio | Interpretação da solicitação | Execução de contrato |
| Métricas de uso e custo | Melhoria do serviço | Legítimo interesse |

## Consentimento

- Campos `consentGivenAt` e `consentPurpose` no cadastro do usuário registram
  quando e para qual finalidade o consentimento foi dado.
- Consulta: `GET /admin/lgpd/users/:id/consents`.
- Recomenda-se que a primeira interação do agente informe o tratamento de
  dados e registre o aceite (fluxo de opt-in configurável).

## Direitos do titular (endpoints administrativos)

| Direito | Endpoint |
| --- | --- |
| Acesso / portabilidade | `GET /admin/lgpd/users/:id/export` — exporta cadastro, conversas, mensagens, anexos, tickets e feedbacks em JSON |
| Eliminação / anonimização | `POST /admin/lgpd/users/:id/anonymize` — remove nome, telefone, e-mail, senha; substitui conteúdo textual das mensagens; bloqueia e marca o registro |
| Informação sobre consentimento | `GET /admin/lgpd/users/:id/consents` |

Todos os acessos a esses endpoints exigem perfil `ADMIN` e geram trilha de
auditoria (`lgpd.export`, `lgpd.anonymize`) com IP e ator.

## Retenção

- `DATA_RETENTION_DAYS` (padrão 730) define a política de retenção. O expurgo
  automático deve ser agendado (cron) chamando a anonimização para conversas
  além do prazo — estrutura pronta, agendador a critério da implantação.

## Minimização e segurança

- O agente solicita apenas dados necessários ao atendimento.
- Logs redigem campos sensíveis; mensagens não são enviadas a serviços de
  terceiros além dos operadores contratados (Meta e OpenAI).
- Anonimização preserva estatísticas agregadas sem identificar o titular.

## Operadores (suboperadores)

- **Meta (WhatsApp Cloud API)** — transporte das mensagens.
- **OpenAI** — interpretação de linguagem natural e transcrição.
  Recomenda-se contratar o plano com retenção zero de dados quando disponível
  e refletir isso no registro de operações da ABRAJEEP.

## Rastreabilidade

Toda operação relevante gera `audit_logs` com `correlationId`, permitindo
reconstituir quem acessou o quê e quando.
