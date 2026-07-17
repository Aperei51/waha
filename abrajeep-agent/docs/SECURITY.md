# Políticas de Segurança

## Autenticação e autorização

- Painel administrativo: login com e-mail/senha (bcrypt), JWT com expiração
  (`JWT_EXPIRES_IN`), acesso restrito a `OPERATOR`, `MANAGER` e `ADMIN`.
- Ações administrativas sensíveis (cadastros, LGPD) exigem perfil `ADMIN`.
- Usuários de WhatsApp são identificados pelo telefone; não identificados
  recebem perfil `VISITOR` com acesso apenas a conteúdo `PUBLIC`.
- Toda função do agente valida perfil (`allowedRoles`) antes de executar.

## Isolamento entre organizações e concessionárias

- Regra central `canReadDocument` (packages/shared) + filtros aplicados dentro
  da consulta SQL de busca vetorial.
- Documento com `organizationId` só é lido por usuários da mesma organização
  (exceto audiência `PUBLIC`).
- Documento com `dealershipId` só é lido pela própria concessionária ou por
  perfis elevados (gestor/operador/admin) da organização.
- Testes automatizados cobrem os cenários de isolamento (`permissions.test.ts`).

## Webhook

- Verificação de token no GET (challenge da Meta).
- Validação da assinatura `X-Hub-Signature-256` (HMAC-SHA256 do corpo bruto,
  comparação em tempo constante). Obrigatória quando `WHATSAPP_APP_SECRET`
  está configurado; alerta em log quando ausente em produção.
- Idempotência por `wamid` com constraint única.

## Proteções de aplicação

- Validação de TODA entrada externa com Zod (env, webhook, rotas, argumentos
  de function calling).
- Rate limiting global (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS`).
- Upload: limite de tamanho (`UPLOAD_MAX_BYTES`), whitelist de MIME types
  (PDF, DOCX, TXT, MD), nome de arquivo sanitizado, hash SHA-256 registrado.
- SQL injection: Prisma parametriza tudo; SQL bruto usa exclusivamente
  `Prisma.sql` com placeholders.
- Erros: handler central; clientes recebem mensagens genéricas; stack traces
  nunca são enviados ao WhatsApp nem ao painel.
- Downloads de documentos usam URL assinada (JWT de propósito único, 15 min).

## Prompt injection

- Conteúdo não confiável (mensagens, transcrições, trechos de documentos) é
  envelopado em delimitadores; delimitadores embutidos são removidos.
- Instruções do sistema (imutáveis) ordenam tratar esse conteúdo como dado.
- Heurística de detecção registra tentativas em auditoria.
- Documentos enviados por usuários NUNCA entram na base de conhecimento
  automaticamente — somente administradores fazem upload.

## Segredos e criptografia

- Nenhum segredo no código; tudo via variáveis de ambiente (`.env.example`
  documenta todas). `.env` está no `.gitignore`.
- `ENCRYPTION_KEY` (AES-256-GCM, `core/crypto.ts`) disponível para dados
  sensíveis em repouso.
- Logs redigem `authorization`, senhas, tokens e chaves automaticamente.

## Auditoria

- `audit_logs`: ações administrativas, logins (sucesso/falha), execução de
  funções do agente, uploads, eventos LGPD, transferências de atendimento —
  com ator, recurso, IP e `correlationId`.
- `tool_calls`: toda função executada pela IA com argumentos, resultado,
  status e duração.

## Retenção e anonimização

Ver [LGPD.md](LGPD.md). `DATA_RETENTION_DAYS` define a política de retenção;
a anonimização preserva integridade referencial removendo dados pessoais.

## Reporte de vulnerabilidades

Abra uma issue privada ou contate a equipe de tecnologia da ABRAJEEP.
Não divulgue vulnerabilidades publicamente antes da correção.
