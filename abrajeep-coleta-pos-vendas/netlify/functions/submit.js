// Função serverless "submit" — proxy server→server para o Apps Script.
//
// O navegador chama /api/submit (mesma origem, sem CORS). Esta função injeta o
// SHARED_TOKEN (que o cliente nunca vê), revalida os dados e faz fetch para a
// APPS_SCRIPT_URL. Repassa a resposta JSON do Apps Script de volta ao navegador.
//
// Variáveis de ambiente necessárias (Netlify):
//   APPS_SCRIPT_URL  → URL .../exec do Web App do Apps Script
//   SHARED_TOKEN     → mesmo valor da constante SHARED_TOKEN no Code.gs

// Espelha a definição de campos do Code.gs para revalidar no servidor.
const CAMPOS = [
  { key: 'grupo',            tipo: 'texto',  obrig: true },
  { key: 'loja',             tipo: 'texto',  obrig: true },
  { key: 'regiao',           tipo: 'select', obrig: true, opcoes: ['I', 'II', 'III', 'IV', 'V', 'VI'] },
  { key: 'perfilMarca',      tipo: 'select', obrig: true, opcoes: ['CJDR', 'Só Jeep', 'Só RAM'] },
  { key: 'localizacao',      tipo: 'select', obrig: true, opcoes: ['Metrópole', 'Interior'] },
  { key: 'porte',            tipo: 'select', obrig: true, opcoes: ['Grande', 'Médio', 'Pequeno'] },
  { key: 'periodoRef',       tipo: 'texto',  obrig: true },
  { key: 'recLiqPecas',      tipo: 'numero', obrig: true, min: 0 },
  { key: 'cmvPecas',         tipo: 'numero', obrig: true, min: 0 },
  { key: 'recLiqAcessorios', tipo: 'numero', obrig: true, min: 0 },
  { key: 'cmvAcessorios',    tipo: 'numero', obrig: true, min: 0 },
  { key: 'recLiqServicos',   tipo: 'numero', obrig: true, min: 0 },
  { key: 'custoDirServicos', tipo: 'numero', obrig: true, min: 0 },
  { key: 'custosFixosPV',    tipo: 'numero', obrig: true, min: 0 },
  { key: 'custosFixosLoja',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'realizSellIn',     tipo: 'numero', obrig: true, min: 0, max: 300, inteiro: true },
  { key: 'bonusPecas',       tipo: 'numero', obrig: true, min: 0 },
  { key: 'bonusAcessorios',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'outrosBonus',      tipo: 'numero', obrig: true, min: 0 },
  { key: 'desagio',          tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'npsM1',            tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'npsM2',            tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'npsM3',            tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'habilitouBonus',   tipo: 'select', obrig: true, opcoes: ['Sim', 'Não'] },
  { key: 'fillRate',         tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'estoquePecas',     tipo: 'numero', obrig: true, min: 0 },
  { key: 'curvaN',           tipo: 'numero', obrig: true, min: 0, max: 100, inteiro: true },
  { key: 'obsoletoDesc',     tipo: 'numero', obrig: true, min: 0, max: 100 }
];

function paraNumero(bruto) {
  if (typeof bruto === 'number') return isFinite(bruto) ? bruto : null;
  let s = String(bruto).trim();
  if (s === '') return null;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function validar(dados) {
  const erros = [];
  for (const campo of CAMPOS) {
    const bruto = dados[campo.key];
    const vazio = bruto === undefined || bruto === null || String(bruto).trim() === '';
    if (vazio) {
      if (campo.obrig) erros.push(`"${campo.key}" é obrigatório`);
      continue;
    }
    if (campo.tipo === 'select') {
      if (campo.opcoes.indexOf(String(bruto).trim()) === -1) {
        erros.push(`"${campo.key}" inválido`);
      }
    } else if (campo.tipo === 'numero') {
      const n = paraNumero(bruto);
      if (n === null) erros.push(`"${campo.key}" deve ser número`);
      else if (campo.inteiro && Math.floor(n) !== n) erros.push(`"${campo.key}" deve ser inteiro`);
      else if (campo.min !== undefined && n < campo.min) erros.push(`"${campo.key}" deve ser >= ${campo.min}`);
      else if (campo.max !== undefined && n > campo.max) erros.push(`"${campo.key}" deve ser <= ${campo.max}`);
    }
  }
  return erros;
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj)
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, erro: 'Método não permitido.' });
  }

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const SHARED_TOKEN = process.env.SHARED_TOKEN;
  if (!APPS_SCRIPT_URL || !SHARED_TOKEN) {
    return json(500, { ok: false, erro: 'Servidor não configurado (faltam variáveis de ambiente).' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { ok: false, erro: 'JSON inválido.' });
  }

  const dados = payload.dados || {};
  const codigo = (payload.codigo == null ? '' : String(payload.codigo)).trim();

  if (!codigo) {
    return json(400, { ok: false, erro: 'Informe o código de acesso do grupo.' });
  }

  const erros = validar(dados);
  if (erros.length > 0) {
    return json(400, { ok: false, erro: 'Dados inválidos: ' + erros.join('; ') });
  }

  // Timeout defensivo para a chamada ao Apps Script.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: SHARED_TOKEN, codigo, dados }),
      redirect: 'follow',
      signal: controller.signal
    });

    const texto = await resp.text();
    let resultado;
    try {
      resultado = JSON.parse(texto);
    } catch (e) {
      return json(502, { ok: false, erro: 'Resposta inesperada do servidor de gravação.' });
    }

    const status = resultado.ok ? 200 : 400;
    return json(status, resultado);
  } catch (e) {
    if (e.name === 'AbortError') {
      return json(504, { ok: false, erro: 'Tempo esgotado ao gravar. Tente novamente.' });
    }
    return json(502, { ok: false, erro: 'Falha ao comunicar com o servidor de gravação.' });
  } finally {
    clearTimeout(timeout);
  }
};
