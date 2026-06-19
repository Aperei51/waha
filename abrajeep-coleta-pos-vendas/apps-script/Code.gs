/**
 * ABRAJEEP — Coleta de Rentabilidade do Pós-Vendas CJDR
 * API JSON (Web App) — NÃO serve HTML.
 *
 * Recebe POST (JSON) da função serverless da Netlify, valida token + código,
 * e grava UMA nova linha na aba "Coleta" apenas nas colunas de INPUT,
 * preservando as colunas calculadas (fórmulas) e a aba "Análise".
 *
 * Publicação: Implantar > Nova implantação > App da Web
 *   - Executar como: Eu
 *   - Quem tem acesso: Qualquer pessoa
 */

// ───────────────────────── CONFIGURAÇÃO ─────────────────────────

// DEVE bater com a env var SHARED_TOKEN da Netlify. Troque por um valor longo e aleatório.
var SHARED_TOKEN = 'TROQUE_ESTE_TOKEN_POR_UM_VALOR_LONGO_E_ALEATORIO';

// Se true, todo envio precisa de um "codigo" válido presente na aba "Config".
var REQUER_CODIGO = true;

// Nomes das abas.
var ABA_COLETA = 'Coleta';
var ABA_CONFIG = 'Config';

// Primeira linha de dados na aba "Coleta" (linha 4, conforme a planilha original).
var PRIMEIRA_LINHA_DADOS = 4;

/**
 * Definição dos campos de INPUT, na ordem das colunas da aba "Coleta".
 * key  = chave enviada no JSON pelo formulário
 * col  = letra da coluna na planilha
 * tipo = 'texto' | 'numero' | 'select'
 * obrig = obrigatório?
 * min/max = faixa para números (inclusive)
 * inteiro = se true, deve ser inteiro (usado em percentuais digitados como inteiro)
 * opcoes = valores aceitos para selects
 */
var CAMPOS = [
  // Seção 1 — Identificação e estratificação
  { key: 'grupo',            col: 'A',  tipo: 'texto',  obrig: true },
  { key: 'loja',             col: 'B',  tipo: 'texto',  obrig: true },
  { key: 'regiao',           col: 'C',  tipo: 'select', obrig: true, opcoes: ['I', 'II', 'III', 'IV', 'V', 'VI'] },
  { key: 'perfilMarca',      col: 'D',  tipo: 'select', obrig: true, opcoes: ['CJDR', 'Só Jeep', 'Só RAM'] },
  { key: 'localizacao',      col: 'E',  tipo: 'select', obrig: true, opcoes: ['Metrópole', 'Interior'] },
  { key: 'porte',            col: 'F',  tipo: 'select', obrig: true, opcoes: ['Grande', 'Médio', 'Pequeno'] },
  { key: 'periodoRef',       col: 'G',  tipo: 'texto',  obrig: true },

  // Seção 2 — P&L Pós-Vendas CJDR
  { key: 'recLiqPecas',      col: 'H',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'cmvPecas',         col: 'I',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'recLiqAcessorios', col: 'L',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'cmvAcessorios',    col: 'M',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'recLiqServicos',   col: 'O',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'custoDirServicos', col: 'P',  tipo: 'numero', obrig: true, min: 0 },

  // Seção 3 — Absorção
  { key: 'custosFixosPV',    col: 'U',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'custosFixosLoja',  col: 'W',  tipo: 'numero', obrig: true, min: 0 },

  // Seção 4 — Política comercial (realizado)
  { key: 'realizSellIn',     col: 'Y',  tipo: 'numero', obrig: true, min: 0, max: 300, inteiro: true },
  { key: 'bonusPecas',       col: 'Z',  tipo: 'numero', obrig: true, min: 0 },
  { key: 'bonusAcessorios',  col: 'AA', tipo: 'numero', obrig: true, min: 0 },
  { key: 'outrosBonus',      col: 'AB', tipo: 'numero', obrig: true, min: 0 },
  { key: 'desagio',          col: 'AE', tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'npsM1',            col: 'AF', tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'npsM2',            col: 'AG', tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'npsM3',            col: 'AH', tipo: 'numero', obrig: true, min: 0, max: 100 },
  { key: 'habilitouBonus',   col: 'AI', tipo: 'select', obrig: true, opcoes: ['Sim', 'Não'] },
  { key: 'fillRate',         col: 'AJ', tipo: 'numero', obrig: true, min: 0, max: 100 },

  // Seção 5 — Estoque
  { key: 'estoquePecas',     col: 'AK', tipo: 'numero', obrig: true, min: 0 },
  { key: 'curvaN',           col: 'AL', tipo: 'numero', obrig: true, min: 0, max: 100, inteiro: true },
  { key: 'obsoletoDesc',     col: 'AN', tipo: 'numero', obrig: true, min: 0, max: 100 }
];

// Colunas de metadados gravadas pelo servidor (não vêm do formulário).
var COL_DATAHORA = 'AO'; // Data/hora envio
var COL_ORIGEM   = 'AP'; // Origem (código/grupo do remetente)

// ───────────────────────── ENDPOINTS ─────────────────────────

function doGet() {
  // A API não serve HTML; apenas um sinal de vida.
  return _json({ ok: true, servico: 'ABRAJEEP Coleta Pós-Vendas', metodo: 'POST' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return _json({ ok: false, erro: 'Requisição inválida (sem corpo).' });
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return _json({ ok: false, erro: 'JSON inválido.' });
    }

    // 1) Valida o SHARED_TOKEN.
    if (!body.token || body.token !== SHARED_TOKEN) {
      return _json({ ok: false, erro: 'Não autorizado (token).' });
    }

    var dados = body.dados || {};
    var codigo = (body.codigo == null ? '' : String(body.codigo)).trim();

    // 2) Valida o código de acesso contra a aba Config (se exigido).
    var grupoDoCodigo = '';
    if (REQUER_CODIGO) {
      grupoDoCodigo = _validarCodigo(codigo);
      if (grupoDoCodigo === null) {
        return _json({ ok: false, erro: 'Código de acesso inválido.' });
      }
    }

    // 3) Valida tipos/faixas dos campos (não confiar só no cliente).
    var validacao = _validarDados(dados);
    if (validacao.erros.length > 0) {
      return _json({ ok: false, erro: 'Dados inválidos: ' + validacao.erros.join('; ') });
    }
    var valores = validacao.valores; // { col: valorConvertido }

    // 4) Grava com LockService para evitar sobrescrita em envios simultâneos.
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(ABA_COLETA);
      if (!sheet) {
        return _json({ ok: false, erro: 'Aba "' + ABA_COLETA + '" não encontrada.' });
      }

      var linha = _primeiraLinhaVazia(sheet);

      // Grava SÓ as colunas de input.
      for (var i = 0; i < CAMPOS.length; i++) {
        var campo = CAMPOS[i];
        if (valores.hasOwnProperty(campo.key)) {
          sheet.getRange(campo.col + linha).setValue(valores[campo.key]);
        }
      }

      // Metadados (sem tocar nas fórmulas).
      var agora = new Date();
      sheet.getRange(COL_DATAHORA + linha).setValue(agora);
      sheet.getRange(COL_ORIGEM + linha).setValue(
        REQUER_CODIGO ? (codigo + ' / ' + grupoDoCodigo) : (codigo || (dados.grupo || ''))
      );

      SpreadsheetApp.flush();

      var protocolo = _protocolo(agora, linha);
      return _json({ ok: true, protocolo: protocolo, linha: linha });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return _json({ ok: false, erro: 'Erro interno: ' + (err && err.message ? err.message : err) });
  }
}

// ───────────────────────── AUXILIARES ─────────────────────────

/**
 * Retorna o nome do grupo se o código existir na aba Config (col A),
 * ou null se não existir. Aba Config: A=código, B=grupo (dados a partir da linha 2).
 */
function _validarCodigo(codigo) {
  if (!codigo) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss.getSheetByName(ABA_CONFIG);
  if (!cfg) return null;
  var ultima = cfg.getLastRow();
  if (ultima < 2) return null;
  var valores = cfg.getRange(2, 1, ultima - 1, 2).getValues();
  var alvo = codigo.toUpperCase();
  for (var i = 0; i < valores.length; i++) {
    var c = String(valores[i][0] == null ? '' : valores[i][0]).trim();
    if (c && c.toUpperCase() === alvo) {
      return String(valores[i][1] == null ? '' : valores[i][1]).trim();
    }
  }
  return null;
}

/**
 * Valida e converte os dados. Retorna { valores: {key:valor}, erros: [..] }.
 */
function _validarDados(dados) {
  var erros = [];
  var valores = {};

  for (var i = 0; i < CAMPOS.length; i++) {
    var campo = CAMPOS[i];
    var bruto = dados[campo.key];
    var vazio = (bruto === undefined || bruto === null || String(bruto).trim() === '');

    if (vazio) {
      if (campo.obrig) erros.push('"' + campo.key + '" é obrigatório');
      continue;
    }

    if (campo.tipo === 'texto') {
      valores[campo.key] = String(bruto).trim();

    } else if (campo.tipo === 'select') {
      var s = String(bruto).trim();
      if (campo.opcoes.indexOf(s) === -1) {
        erros.push('"' + campo.key + '" deve ser um de [' + campo.opcoes.join(', ') + ']');
      } else {
        valores[campo.key] = s;
      }

    } else if (campo.tipo === 'numero') {
      var n = _paraNumero(bruto);
      if (n === null) {
        erros.push('"' + campo.key + '" deve ser um número');
      } else if (campo.inteiro && Math.floor(n) !== n) {
        erros.push('"' + campo.key + '" deve ser um número inteiro');
      } else if (campo.min !== undefined && n < campo.min) {
        erros.push('"' + campo.key + '" deve ser >= ' + campo.min);
      } else if (campo.max !== undefined && n > campo.max) {
        erros.push('"' + campo.key + '" deve ser <= ' + campo.max);
      } else {
        valores[campo.key] = n;
      }
    }
  }

  return { valores: valores, erros: erros };
}

/**
 * Converte string/numero para Number, aceitando vírgula decimal (pt-BR).
 * Retorna null se não for numérico.
 */
function _paraNumero(bruto) {
  if (typeof bruto === 'number') return isFinite(bruto) ? bruto : null;
  var s = String(bruto).trim();
  if (s === '') return null;
  // Remove separador de milhar "." quando há vírgula decimal; troca vírgula por ponto.
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/**
 * Acha a 1ª linha vazia na aba Coleta, olhando a coluna A a partir de PRIMEIRA_LINHA_DADOS.
 */
function _primeiraLinhaVazia(sheet) {
  var maxLinha = sheet.getMaxRows();
  var qtd = maxLinha - PRIMEIRA_LINHA_DADOS + 1;
  if (qtd <= 0) return PRIMEIRA_LINHA_DADOS;
  var colA = sheet.getRange(PRIMEIRA_LINHA_DADOS, 1, qtd, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    if (colA[i][0] === '' || colA[i][0] === null) {
      return PRIMEIRA_LINHA_DADOS + i;
    }
  }
  // Sem linha vazia dentro do range existente: usa a próxima após o conteúdo.
  return PRIMEIRA_LINHA_DADOS + colA.length;
}

/**
 * Protocolo legível: AAAAMMDD-HHMMSS-Lnnn (fuso da planilha).
 */
function _protocolo(data, linha) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'America/Sao_Paulo';
  var carimbo = Utilities.formatDate(data, tz, 'yyyyMMdd-HHmmss');
  return 'ABRJ-' + carimbo + '-L' + linha;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
