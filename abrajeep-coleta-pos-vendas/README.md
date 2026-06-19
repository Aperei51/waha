# ABRAJEEP — Site de Coleta de Rentabilidade do Pós-Vendas CJDR

Site onde as concessionárias preenchem os dados de rentabilidade do pós-vendas.
Cada envio grava **uma nova linha** na aba `Coleta` de uma Planilha Google; a aba
`Análise` recalcula sozinha.

## Arquitetura

```
Navegador (public/)                Função Netlify              Apps Script (/exec)         Planilha Google
   app.js  ── POST /api/submit ──▶  submit.js  ── fetch + ──▶   doPost  ── appendRow ──▶   aba "Coleta"
           (mesma origem,           (injeta       SHARED_TOKEN  (valida token            (1ª linha vazia,
            sem CORS)                env vars)     server→server  + código + faixas,        LockService)
   ◀──── JSON {ok,protocolo} ─────  ◀───────────  ◀───────────   LockService)            aba "Análise" recalcula
```

- O navegador **só** fala com `/.netlify/functions/submit` (via redirect `/api/submit`).
- `APPS_SCRIPT_URL` e `SHARED_TOKEN` ficam **apenas** em variáveis de ambiente da Netlify —
  nunca no HTML/JS do cliente.
- Sem CORS: navegador→função é mesma origem; função→Apps Script é servidor→servidor.

## Estrutura de arquivos

```
abrajeep-coleta-pos-vendas/
├── README.md                  ← este guia
├── netlify.toml               ← publish=public, functions, redirect /api/submit
├── apps-script/
│   ├── Code.gs                ← API JSON: token + Config + LockService + gravação
│   ├── appsscript.json        ← manifesto (V8, fuso SP, Web App)
│   └── README.md              ← passo a passo da planilha + clasp/script.google.com
├── netlify/functions/
│   └── submit.js              ← proxy server→server, revalida faixas, trata timeout
└── public/
    ├── index.html             ← cabeçalho verde, 5 seções (acordeão), revisão, sucesso
    ├── styles.css             ← identidade ABRAJEEP (#004437), Arial, responsivo
    ├── app.js                 ← schema único, validação PT-BR, revisão, envio
    └── assets/logo_abrajeep.jpg
```

## Passo a passo de deploy

### 1) Google (planilha + Apps Script)
Siga **`apps-script/README.md`**. Ao final você terá:
- a Planilha Google na pasta `ABRAJEEP — Coleta Pós-Vendas` (Coleta/Análise até 1003, aba Config);
- a **`APPS_SCRIPT_URL`** (termina em `/exec`);
- o **`SHARED_TOKEN`** (o mesmo definido no `Code.gs`).

### 2) Netlify (frontend + função)

Instale e faça login (o login abre o navegador em https://app.netlify.com):
```bash
npm install -g netlify-cli
netlify login
```

A partir **de dentro desta pasta** (`abrajeep-coleta-pos-vendas/`):
```bash
cd abrajeep-coleta-pos-vendas

# Cria/conecta o site na sua conta Netlify:
netlify init        # escolha "Create & configure a new site"
```

Defina as variáveis de ambiente (substitua pelos seus valores):
```bash
netlify env:set APPS_SCRIPT_URL "https://script.google.com/macros/s/SEU_ID/exec"
netlify env:set SHARED_TOKEN "o-mesmo-token-do-Code.gs"
```

Publique:
```bash
netlify deploy --prod
```
Ao final, o CLI mostra a **URL pública** (ex.: `https://SEU-SITE.netlify.app`).

> Dica: como o `netlify.toml` já define `publish` e `functions`, não precisa configurar
> nada no painel. Se preferir o painel: **Site settings → Build & deploy → Environment**
> para as variáveis.

### 3) Teste de ponta a ponta
1. Abra a URL pública, preencha o formulário com um **código válido** (aba `Config`).
2. Revise e envie → deve aparecer a tela de sucesso com **protocolo**.
3. Confira na Planilha: nova linha na aba `Coleta` (só colunas de input + `AO` data/hora +
   `AP` origem); as colunas calculadas e a aba `Análise` atualizam sozinhas.
4. Teste um **código inválido** → o envio deve ser recusado.

## Domínio próprio (ex.: `coleta.abrajeep.org`)
No painel da Netlify: **Domain management → Add a domain** → digite `coleta.abrajeep.org`.
A Netlify mostrará o registro DNS a criar no provedor do domínio `abrajeep.org`:
- **Subdomínio (recomendado):** crie um **CNAME** `coleta` → `SEU-SITE.netlify.app`.
- **Domínio raiz/apex:** use o registro **A/ALIAS** indicado pela Netlify (Netlify DNS ou
  `apex-loadbalancer.netlify.com`).
Depois, em **Domain management → HTTPS**, ative o certificado **Let's Encrypt** (automático).

## Segurança (resumo)
- Cliente nunca vê `APPS_SCRIPT_URL` nem `SHARED_TOKEN`.
- Apps Script rejeita chamadas sem token correto e sem código válido (aba `Config`).
- Faixas/tipos são validados no **cliente, na função Netlify e no Apps Script**.
- `LockService` evita que envios simultâneos gravem na mesma linha.

## Mapa de campos → colunas da aba `Coleta`
Inputs gravados: A, B, C, D, E, F, G, H, I, L, M, O, P, U, W, Y, Z, AA, AB, AE, AF, AG, AH,
AI, AJ, AK, AL, AN. Metadados: **AO** (Data/hora envio), **AP** (Origem: código / grupo).
Colunas calculadas (J, K, N, Q, R, S, T, V, X, AC, AD, AM) **não** são tocadas — são fórmulas.
