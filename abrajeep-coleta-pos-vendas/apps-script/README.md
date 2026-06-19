# Apps Script — motor de gravação (API JSON)

Este é o **backend** que grava cada envio na aba `Coleta` da Planilha Google.
Ele **não serve HTML** — é uma API JSON chamada apenas pela função da Netlify.

---

## 1) Preparar a Planilha Google

### 1.1 Importar o `.xlsx` como Planilha NATIVA
1. No Google Drive, crie/abra a pasta **`ABRAJEEP — Coleta Pós-Vendas`**.
2. **Novo → Upload de arquivo** → envie `ABRAJEEP_Coleta_Rentabilidade_Pos-Vendas_CJDR.xlsx`.
3. Dê duplo clique no arquivo enviado → **Abrir com → Planilhas Google**.
4. Em **Arquivo → Salvar como Planilhas Google** (gera a versão nativa, com as 3 abas
   `Instruções`, `Coleta`, `Análise` e as fórmulas preservadas).
5. Mova a planilha nativa para a pasta `ABRAJEEP — Coleta Pós-Vendas`.

### 1.2 Estender a aba `Coleta` até a linha 1003
As colunas calculadas e as listas suspensas existem só até a linha 43. Estenda-as:

- **Fórmulas calculadas** (selecione a linha 4 das colunas abaixo, copie e cole até a
  linha 1003). Padrão por linha `n` (funções em inglês, vírgula como separador):

  | Col | Fórmula (linha n) |
  |-----|-------------------|
  | J  | `=IF(N(Hn)=0,"",Hn-In)` |
  | K  | `=IFERROR(Jn/Hn,"")` |
  | N  | `=IF(N(Ln)=0,"",Ln-Mn)` |
  | Q  | `=IF(N(On)=0,"",On-Pn)` |
  | R  | `=IF(COUNT(Hn,Ln,On)=0,"",SUM(Hn,Ln,On))` |
  | S  | `=IF(Rn="","",SUM(Jn,Nn,Qn))` |
  | T  | `=IFERROR(Sn/Rn,"")` |
  | V  | `=IF(Sn="","",Sn-Un)` |
  | X  | `=IFERROR(Sn/Wn,"")` |
  | AC | `=IF(COUNT(Zn,AAn,ABn)=0,"",SUM(Zn,AAn,ABn))` |
  | AD | `=IFERROR(ACn/Rn,"")` |
  | AM | `=IF(N(AKn)=0,"",AKn*ALn/100)` |

  Modo prático: selecione `J4:AM4` (apenas as células calculadas), **Ctrl+C**, depois
  selecione `J5:AM1003` e **Ctrl+V**. O Sheets ajusta as referências de linha
  automaticamente.

- **Listas suspensas (validação de dados)** das colunas C, D, E, F, AI: selecione a célula
  da linha 4 → **Dados → Validação de dados** → copie a regra; ou selecione a célula
  validada, **Ctrl+C**, marque `C5:C1003` (e equivalentes) → **Editar → Colar especial →
  Colar somente validação de dados**.

### 1.3 Ajustar a aba `Análise` (intervalos 4:43 → 4:1003)
1. Abra a aba `Análise`.
2. **Editar → Localizar e substituir** (Ctrl+H):
   - Localizar: `4:43`  →  Substituir por: `4:1003`
   - Marque **"Pesquisar usando expressões regulares"** desmarcado e
     **"Esta planilha"** = somente a aba Análise (ou faça em todas e confira).
   - **Substituir tudo**.
3. Confira a célula auxiliar **G1** (COUNTA): ela também deve passar a referir `...4:1003`.

### 1.4 Criar a aba `Config`
1. Crie uma aba chamada exatamente **`Config`**.
2. Linha 1: cabeçalhos `Código` (A1) e `Grupo` (B1).
3. A partir da linha 2, liste os códigos válidos e o nome do grupo:

   | A (Código) | B (Grupo)            |
   |------------|----------------------|
   | GRUPO001   | Concessionária Exemplo |
   | ...        | ...                  |

   A validação no servidor é **case-insensitive** (GRUPO001 = grupo001).

---

## 2) Instalar o Apps Script

### Opção A — `clasp` (linha de comando)
```bash
npm install -g @google/clasp
clasp login

# Dentro da pasta apps-script/:
cd apps-script

# Crie um projeto de script LIGADO à planilha (pegue o ID da URL da planilha:
#   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit )
clasp create --type sheets --parentId "<SPREADSHEET_ID>" --title "ABRAJEEP Coleta API"

# Isso gera um .clasp.json. Envie os arquivos:
clasp push
```

> `appsscript.json` já vem com `runtimeVersion: V8`, fuso `America/Sao_Paulo` e
> configuração de Web App (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`).

### Opção B — Colar em script.google.com (sem clasp)
1. Abra a planilha → **Extensões → Apps Script**.
2. Apague o conteúdo de `Código.gs` e cole o conteúdo de **`Code.gs`** deste repositório.
3. (Opcional) No ícone de engrenagem **Configurações do projeto**, marque
   *"Mostrar o arquivo de manifesto appsscript.json"* e cole o `appsscript.json`.

---

## 3) Configurar o token

No topo de `Code.gs`, troque:
```js
var SHARED_TOKEN = 'TROQUE_ESTE_TOKEN_POR_UM_VALOR_LONGO_E_ALEATORIO';
```
por um valor longo e aleatório. **Guarde-o** — ele tem que ser idêntico à env var
`SHARED_TOKEN` da Netlify.

Gere um token forte, por exemplo:
```bash
openssl rand -hex 32
```

`REQUER_CODIGO` já está `true` (todo envio exige código válido na aba `Config`).

---

## 4) Publicar como Web App e pegar a URL `/exec`
1. No editor do Apps Script: **Implantar → Nova implantação**.
2. Em **Selecionar tipo** (engrenagem) → **App da Web**.
3. Configurações:
   - **Descrição:** ABRAJEEP Coleta API
   - **Executar como:** `Eu (seu e-mail)`
   - **Quem tem acesso:** `Qualquer pessoa`
4. **Implantar** → autorize o acesso (aceite as permissões da sua conta).
5. Copie a **URL do app da Web** — termina em **`/exec`**. Essa é a `APPS_SCRIPT_URL`.

> Sempre que alterar o `Code.gs`, use **Implantar → Gerenciar implantações →
> (lápis) → Versão: Nova versão → Implantar** para publicar a mudança na MESMA URL.

### Teste rápido (linha de comando)
```bash
curl -s -X POST "<APPS_SCRIPT_URL>" \
  -H "Content-Type: application/json" \
  -d '{"token":"<SEU_TOKEN>","codigo":"GRUPO001","dados":{
    "grupo":"Grupo Teste","loja":"Loja 1","regiao":"I","perfilMarca":"CJDR",
    "localizacao":"Interior","porte":"Médio","periodoRef":"Q1/2026",
    "recLiqPecas":100000,"cmvPecas":60000,"recLiqAcessorios":20000,"cmvAcessorios":12000,
    "recLiqServicos":80000,"custoDirServicos":40000,"custosFixosPV":50000,"custosFixosLoja":120000,
    "realizSellIn":104,"bonusPecas":5000,"bonusAcessorios":1000,"outrosBonus":0,
    "desagio":10,"npsM1":70,"npsM2":72,"npsM3":75,"habilitouBonus":"Sim","fillRate":90,
    "estoquePecas":300000,"curvaN":27,"obsoletoDesc":50}}'
```
Resposta esperada: `{"ok":true,"protocolo":"ABRJ-...","linha":4}`.
Token errado deve retornar `{"ok":false,"erro":"Não autorizado (token)."}`.
