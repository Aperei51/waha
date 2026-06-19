/* ABRAJEEP — Coleta de Rentabilidade do Pós-Vendas
   Schema único: rótulos EXATOS da planilha, validação cliente, revisão e envio. */

(function () {
  'use strict';

  var AJUDA_PCT = 'Digite o número, ex.: 73 = 73%.';
  var AJUDA_RS = 'Valor em R$ (no período).';

  // Seções com os rótulos EXATOS da aba "Coleta".
  var SECOES = [
    {
      titulo: 'Seção 1 — Identificação e estratificação',
      aberta: true,
      campos: [
        { key: 'grupo',       label: 'Grupo / Código',        tipo: 'texto',  obrig: true, largo: true },
        { key: 'loja',        label: 'Loja (ponto de venda)', tipo: 'texto',  obrig: true, largo: true },
        { key: 'regiao',      label: 'Região',                tipo: 'select', obrig: true, opcoes: ['I', 'II', 'III', 'IV', 'V', 'VI'] },
        { key: 'perfilMarca', label: 'Perfil de marca',       tipo: 'select', obrig: true, opcoes: ['CJDR', 'Só Jeep', 'Só RAM'] },
        { key: 'localizacao', label: 'Localização',           tipo: 'select', obrig: true, opcoes: ['Metrópole', 'Interior'] },
        { key: 'porte',       label: 'Porte',                 tipo: 'select', obrig: true, opcoes: ['Grande', 'Médio', 'Pequeno'] },
        { key: 'periodoRef',  label: 'Período de ref.',       tipo: 'texto',  obrig: true, placeholder: 'ex.: Q1/2026' }
      ]
    },
    {
      titulo: 'Seção 2 — P&L Pós-Vendas CJDR (R$, no período)',
      campos: [
        { key: 'recLiqPecas',      label: 'Rec. líq. Peças (R$)',      tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'cmvPecas',         label: 'CMV Peças (R$)',            tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'recLiqAcessorios', label: 'Rec. líq. Acessórios (R$)', tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'cmvAcessorios',    label: 'CMV Acessórios (R$)',       tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'recLiqServicos',   label: 'Rec. líq. Serviços (R$)',   tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'custoDirServicos', label: 'Custo direto Serviços (R$)', tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS }
      ]
    },
    {
      titulo: 'Seção 3 — Absorção',
      campos: [
        { key: 'custosFixosPV',   label: 'Custos fixos do depto. PV (R$)',  tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'custosFixosLoja', label: 'Custos fixos TOTAIS da loja (R$)', tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS }
      ]
    },
    {
      titulo: 'Seção 4 — Política comercial (realizado)',
      campos: [
        { key: 'realizSellIn',    label: 'Realiz. Sell-In Peças (%)',     tipo: 'numero', obrig: true, min: 0, max: 300, inteiro: true, ajuda: 'Digite o número inteiro, ex.: 104.' },
        { key: 'bonusPecas',      label: 'Bônus Peças recebido (R$)',     tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'bonusAcessorios', label: 'Bônus Acessórios recebido (R$)', tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'outrosBonus',     label: 'Outros bônus recebidos (R$)',   tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'desagio',         label: 'Deságio aplicado no tri. (%)',  tipo: 'numero', obrig: true, min: 0, max: 100, ajuda: AJUDA_PCT },
        { key: 'npsM1',           label: 'NPS M1 (%)',                    tipo: 'numero', obrig: true, min: 0, max: 100, ajuda: AJUDA_PCT },
        { key: 'npsM2',           label: 'NPS M2 (%)',                    tipo: 'numero', obrig: true, min: 0, max: 100, ajuda: AJUDA_PCT },
        { key: 'npsM3',           label: 'NPS M3 (%)',                    tipo: 'numero', obrig: true, min: 0, max: 100, ajuda: AJUDA_PCT },
        { key: 'habilitouBonus',  label: 'Habilitou bônus no período?',   tipo: 'select', obrig: true, opcoes: ['Sim', 'Não'] },
        { key: 'fillRate',        label: 'Fill rate Stellantis (%)',      tipo: 'numero', obrig: true, min: 0, max: 100, ajuda: AJUDA_PCT }
      ]
    },
    {
      titulo: 'Seção 5 — Estoque',
      campos: [
        { key: 'estoquePecas', label: 'Estoque Peças total (R$)',                 tipo: 'numero', obrig: true, min: 0, ajuda: AJUDA_RS },
        { key: 'curvaN',       label: '% Curva N (obsoleto)',                     tipo: 'numero', obrig: true, min: 0, max: 100, inteiro: true, ajuda: 'Digite o número inteiro, ex.: 27.' },
        { key: 'obsoletoDesc', label: '% do obsoleto por descont. Stellantis',    tipo: 'numero', obrig: true, min: 0, max: 100, ajuda: AJUDA_PCT }
      ]
    }
  ];

  // Índice rápido key → campo (para validação/revisão).
  var TODOS_CAMPOS = {};
  SECOES.forEach(function (s) {
    s.campos.forEach(function (c) { TODOS_CAMPOS[c.key] = c; });
  });

  // ───────── Utilidades ─────────

  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { n.appendChild(f); });
    return n;
  }

  function paraNumero(bruto) {
    if (bruto === null || bruto === undefined) return null;
    var s = String(bruto).trim();
    if (s === '') return null;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function fmtNumero(n) {
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  // ───────── Render do formulário ─────────

  function renderCampo(campo) {
    var idInput = 'campo-' + campo.key;
    var label = el('label', { for: idInput });
    label.textContent = campo.label + ' ';
    if (campo.obrig) {
      var marca = el('span', { class: 'obrig-marca', 'aria-hidden': 'true' });
      marca.textContent = '*';
      label.appendChild(marca);
    }

    var input;
    if (campo.tipo === 'select') {
      input = el('select', { id: idInput, name: campo.key });
      input.appendChild(el('option', { value: '', text: 'Selecione…' }));
      campo.opcoes.forEach(function (op) {
        input.appendChild(el('option', { value: op, text: op }));
      });
    } else {
      input = el('input', {
        id: idInput,
        name: campo.key,
        type: campo.tipo === 'numero' ? 'text' : 'text',
        inputmode: campo.tipo === 'numero' ? 'decimal' : 'text',
        autocomplete: 'off'
      });
      if (campo.placeholder) input.setAttribute('placeholder', campo.placeholder);
    }
    if (campo.obrig) input.setAttribute('required', 'required');

    var erro = el('p', { class: 'erro-campo', 'data-erro': campo.key, role: 'alert' });

    var ajudaTxt = campo.ajuda;
    var filhos = [label, input];
    if (ajudaTxt) {
      var idAjuda = idInput + '-ajuda';
      input.setAttribute('aria-describedby', idAjuda);
      filhos.push(el('small', { class: 'ajuda', id: idAjuda, text: ajudaTxt }));
    }
    filhos.push(erro);

    var wrap = el('div', { class: 'campo' + (campo.largo ? ' campo--largo' : '') }, filhos);
    return wrap;
  }

  function renderSecoes() {
    var container = document.getElementById('secoes');
    SECOES.forEach(function (secao, idx) {
      var idCorpo = 'secao-corpo-' + idx;
      var seta = el('span', { class: 'secao__seta', 'aria-hidden': 'true' });
      var botao = el('button', {
        type: 'button',
        class: 'secao__botao',
        'aria-expanded': secao.aberta ? 'true' : 'false',
        'aria-controls': idCorpo
      });
      botao.appendChild(document.createTextNode(secao.titulo));
      botao.appendChild(seta);

      var grade = el('div', { class: 'grade' });
      secao.campos.forEach(function (c) { grade.appendChild(renderCampo(c)); });

      var corpo = el('div', { class: 'secao__corpo', id: idCorpo }, [grade]);
      if (!secao.aberta) corpo.setAttribute('hidden', 'hidden');

      botao.addEventListener('click', function () {
        var aberto = botao.getAttribute('aria-expanded') === 'true';
        botao.setAttribute('aria-expanded', aberto ? 'false' : 'true');
        if (aberto) corpo.setAttribute('hidden', 'hidden');
        else corpo.removeAttribute('hidden');
      });

      var cartao = el('section', { class: 'cartao' }, [
        el('h2', { class: 'secao__cabecalho' }, [botao]),
        corpo
      ]);
      container.appendChild(cartao);
    });
  }

  // ───────── Validação ─────────

  function setErroCampo(key, msg) {
    var p = document.querySelector('.erro-campo[data-erro="' + key + '"]');
    var input = document.getElementById('campo-' + key) || document.getElementById(key);
    if (p) p.textContent = msg || '';
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function valorDe(key) {
    var input = document.getElementById('campo-' + key);
    return input ? input.value : '';
  }

  function validarCampo(campo) {
    var bruto = valorDe(campo.key);
    var vazio = String(bruto).trim() === '';
    if (vazio) {
      if (campo.obrig) { setErroCampo(campo.key, 'Campo obrigatório.'); return false; }
      setErroCampo(campo.key, ''); return true;
    }
    if (campo.tipo === 'select') {
      if (campo.opcoes.indexOf(String(bruto).trim()) === -1) {
        setErroCampo(campo.key, 'Selecione uma opção válida.'); return false;
      }
    } else if (campo.tipo === 'numero') {
      var n = paraNumero(bruto);
      if (n === null) { setErroCampo(campo.key, 'Informe um número válido.'); return false; }
      if (campo.inteiro && Math.floor(n) !== n) { setErroCampo(campo.key, 'Informe um número inteiro.'); return false; }
      if (campo.min !== undefined && n < campo.min) { setErroCampo(campo.key, 'Deve ser maior ou igual a ' + campo.min + '.'); return false; }
      if (campo.max !== undefined && n > campo.max) { setErroCampo(campo.key, 'Deve ser menor ou igual a ' + campo.max + '.'); return false; }
    }
    setErroCampo(campo.key, '');
    return true;
  }

  function validarCodigo() {
    var input = document.getElementById('codigo');
    var p = document.querySelector('.erro-campo[data-erro="codigo"]');
    if (String(input.value).trim() === '') {
      if (p) p.textContent = 'Informe o código de acesso.';
      input.setAttribute('aria-invalid', 'true');
      return false;
    }
    if (p) p.textContent = '';
    input.removeAttribute('aria-invalid');
    return true;
  }

  function abrirSecaoDoCampo(key) {
    // Garante que a seção que contém o 1º erro esteja visível.
    SECOES.forEach(function (secao, idx) {
      var tem = secao.campos.some(function (c) { return c.key === key; });
      if (tem) {
        var botao = document.querySelectorAll('.secao__botao')[idx];
        var corpo = document.getElementById('secao-corpo-' + idx);
        if (botao && corpo) {
          botao.setAttribute('aria-expanded', 'true');
          corpo.removeAttribute('hidden');
        }
      }
    });
  }

  function validarTudo() {
    var okCodigo = validarCodigo();
    var primeiroErro = okCodigo ? null : 'codigo';
    var tudoOk = okCodigo;

    SECOES.forEach(function (secao) {
      secao.campos.forEach(function (campo) {
        var ok = validarCampo(campo);
        if (!ok) {
          tudoOk = false;
          if (!primeiroErro) primeiroErro = campo.key;
        }
      });
    });

    if (!tudoOk && primeiroErro) {
      if (primeiroErro !== 'codigo') abrirSecaoDoCampo(primeiroErro);
      var alvo = document.getElementById('campo-' + primeiroErro) || document.getElementById(primeiroErro);
      if (alvo) { alvo.focus(); alvo.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
    return tudoOk;
  }

  // ───────── Coleta de dados ─────────

  function coletarDados() {
    var dados = {};
    SECOES.forEach(function (secao) {
      secao.campos.forEach(function (campo) {
        var v = valorDe(campo.key).trim();
        if (campo.tipo === 'numero') {
          var n = paraNumero(v);
          dados[campo.key] = n === null ? '' : n;
        } else {
          dados[campo.key] = v;
        }
      });
    });
    return dados;
  }

  function valorExibicao(campo, dados) {
    var v = dados[campo.key];
    if (v === '' || v === null || v === undefined) return '—';
    if (campo.tipo === 'numero') {
      var txt = fmtNumero(v);
      if (campo.max === 100 || campo.max === 300) return txt + '%';
      if ((campo.ajuda || '').indexOf('R$') !== -1) return 'R$ ' + txt;
      return txt;
    }
    return String(v);
  }

  // ───────── Revisão ─────────

  function montarRevisao(dados) {
    var lista = document.getElementById('revisao-lista');
    lista.innerHTML = '';

    var codigo = document.getElementById('codigo').value.trim();
    var grpCab = el('div', { class: 'revisao__grupo', text: 'Acesso' });
    lista.appendChild(grpCab);
    lista.appendChild(el('div', { class: 'revisao__item' }, [
      el('dt', { text: 'Código de acesso' }),
      el('dd', { text: codigo })
    ]));

    SECOES.forEach(function (secao) {
      lista.appendChild(el('div', { class: 'revisao__grupo', text: secao.titulo }));
      secao.campos.forEach(function (campo) {
        lista.appendChild(el('div', { class: 'revisao__item' }, [
          el('dt', { text: campo.label }),
          el('dd', { text: valorExibicao(campo, dados) })
        ]));
      });
    });
  }

  // ───────── Envio ─────────

  function mostrar(id) {
    var n = document.getElementById(id);
    if (n) { n.classList.remove('oculto'); n.focus(); n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function esconder(id) {
    var n = document.getElementById(id);
    if (n) n.classList.add('oculto');
  }
  function avisoErro(msg) {
    var n = document.getElementById('aviso-erro');
    n.textContent = msg;
    n.classList.remove('oculto');
    n.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function limparAviso() {
    var n = document.getElementById('aviso-erro');
    n.textContent = '';
    n.classList.add('oculto');
  }

  async function enviar() {
    limparAviso();
    var btn = document.getElementById('btn-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    var payload = {
      codigo: document.getElementById('codigo').value.trim(),
      dados: coletarDados()
    };

    try {
      var resp = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var resultado = await resp.json().catch(function () { return null; });

      if (resultado && resultado.ok) {
        document.getElementById('protocolo-valor').textContent = resultado.protocolo || '—';
        document.getElementById('sucesso-detalhe').textContent =
          'Registrado na linha ' + (resultado.linha || '—') + ' da aba Coleta.';
        esconder('revisao');
        esconder('form-coleta');
        document.querySelector('.intro').classList.add('oculto');
        mostrar('sucesso');
      } else {
        avisoErro((resultado && resultado.erro) ? resultado.erro : 'Falha no envio. Tente novamente.');
      }
    } catch (e) {
      avisoErro('Não foi possível enviar. Verifique sua conexão e tente novamente.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar e enviar';
    }
  }

  // ───────── Inicialização ─────────

  function init() {
    renderSecoes();

    document.getElementById('form-coleta').addEventListener('submit', function (ev) {
      ev.preventDefault();
      limparAviso();
      if (!validarTudo()) {
        avisoErro('Há campos a corrigir. Verifique os destaques em vermelho.');
        return;
      }
      var dados = coletarDados();
      montarRevisao(dados);
      esconder('form-coleta');
      document.querySelector('.intro').classList.add('oculto');
      mostrar('revisao');
    });

    document.getElementById('btn-voltar').addEventListener('click', function () {
      esconder('revisao');
      document.querySelector('.intro').classList.remove('oculto');
      document.getElementById('form-coleta').classList.remove('oculto');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('btn-enviar').addEventListener('click', enviar);

    document.getElementById('btn-novo').addEventListener('click', function () {
      window.location.reload();
    });

    // Limpa o erro do campo ao digitar/alterar.
    document.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t && t.id && t.id.indexOf('campo-') === 0) {
        var key = t.id.replace('campo-', '');
        if (TODOS_CAMPOS[key]) setErroCampo(key, '');
      }
      if (t && t.id === 'codigo') {
        var p = document.querySelector('.erro-campo[data-erro="codigo"]');
        if (p) p.textContent = '';
        t.removeAttribute('aria-invalid');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
