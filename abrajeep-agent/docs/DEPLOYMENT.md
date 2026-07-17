# Implantação

## Local com Docker

```bash
cd abrajeep-agent
cp .env.example .env
# obrigatório: JWT_SECRET (32+ chars), ENCRYPTION_KEY (64 hex), SEED_ADMIN_PASSWORD
docker compose up --build
docker compose exec api sh -c "cd packages/database && npx tsx prisma/seed.ts"
```

Serviços: `db` (pgvector/pg16, volume `db-data`), `api` (:3001, volume
`uploads`), `admin` (:3000). As migrations são aplicadas automaticamente na
inicialização da API (`prisma migrate deploy`).

## Produção (nuvem)

1. **Banco**: PostgreSQL 16 gerenciado com extensão `vector` habilitada
   (RDS, Cloud SQL, Neon, Supabase…). Ajuste `DATABASE_URL`.
2. **API**: imagem `docker/Dockerfile.api`. Exponha atrás de HTTPS
   (obrigatório para o webhook da Meta). Configure:
   - `WHATSAPP_PROVIDER=meta`, token, phone number id, app secret,
     verify token;
   - `AI_PROVIDER=openai`, `OPENAI_API_KEY`;
   - `API_PUBLIC_URL=https://seu-dominio` (links de download de documentos);
   - segredos via secret manager (nunca em imagem).
3. **Painel**: imagem `docker/Dockerfile.admin` com build-arg
   `NEXT_PUBLIC_API_URL=https://api.seu-dominio`.
4. **Webhook**: no painel da Meta, aponte para
   `https://api.seu-dominio/webhooks/whatsapp` e assine o campo `messages`.
5. **Armazenamento**: monte volume persistente (ou objeto/S3, adaptando
   `UPLOAD_DIR`) para `uploads/`.
6. **Observabilidade**: logs JSON no stdout — colete com o agregador da sua
   nuvem. `/health` e `/ready` prontos para probes de liveness/readiness.

## Migrations

```bash
# desenvolvimento (gera nova migration a partir do schema)
npm run migrate:dev --workspace @abrajeep/database

# produção
npm run db:migrate   # prisma migrate deploy
```

## Backup e retenção

- Faça backup do PostgreSQL (dados + embeddings) e do volume `uploads`.
- Agende a rotina de retenção LGPD conforme `DATA_RETENTION_DAYS`.

## Checklist de segurança pré-produção

- [ ] `JWT_SECRET` e `ENCRYPTION_KEY` fortes e exclusivos do ambiente
- [ ] `WHATSAPP_APP_SECRET` configurado (assinatura de webhook ativa)
- [ ] Senha do seed alterada / usuário admin próprio criado
- [ ] HTTPS em API e painel
- [ ] Rate limit ajustado ao volume esperado
- [ ] Backups automáticos do banco
