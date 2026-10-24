// Aba "Corpo": registro de medidas corporais com gráfico.

import { Modulos } from '../../core/modulos.js';
import { esc, num, fmtNum, fmtData, fmtRelativo, dataInput } from '../../core/util.js';
import { Icone, definirTitulo, toast, confirmar, folha, vazio } from '../../core/ui.js';
import { criarGrafico } from '../../core/graficos.js';
import { TABELA_MEDIDAS, CAMPOS_MEDIDA, listarMedidas, salvarMedida, excluirMedida, pesoAtual } from './dados.js';

const rotulo = Object.fromEntries(CAMPOS_MEDIDA.map(([k, r, u]) => [k, { r, u }]));

function formularioMedida(m = null) {
  const v = m || { data: new Date().toISOString() };
  return folha({
    titulo: m ? 'Editar medidas' : 'Novas medidas',
    conteudo: `
      <div class="form">
        <label>Data<input class="campo" type="date" name="data" value="${dataInput(v.data)}"></label>
        <div class="grade-campos">
          ${CAMPOS_MEDIDA.map(([k, r, u]) => `
            <label>${r} <small>(${u})</small><input class="campo" name="${k}" inputmode="decimal" value="${fmtNum(v[k])}" ${k === 'peso' ? 'autofocus' : ''}></label>`).join('')}
        </div>
        <label>Notas<textarea class="campo" name="notas" rows="2">${esc(v.notas || '')}</textarea></label>
      </div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: null },
      {
        texto: 'Salvar', classe: 'btn-primario', acao: async (c) => {
          const dados = { ...(m || {}) };
          const d = c.querySelector('[name=data]').value;
          dados.data = d ? new Date(`${d}T12:00:00`).toISOString() : new Date().toISOString();
          let algum = false;
          CAMPOS_MEDIDA.forEach(([k]) => { dados[k] = num(c.querySelector(`[name=${k}]`).value); if (dados[k] !== null) algum = true; });
          dados.notas = c.querySelector('[name=notas]').value.trim();
          if (!algum) { toast('Preencha pelo menos uma medida', 'erro'); return false; }
          return salvarMedida(dados);
        },
      },
    ],
  });
}

async function telaCorpo(el, _p, query) {
  definirTitulo('Corpo', { voltar: '#/perfil' });
  const medidas = await listarMedidas();
  const campoAtual = query.campo && rotulo[query.campo] ? query.campo : 'peso';
  const camposComDados = CAMPOS_MEDIDA.filter(([k]) => medidas.some(m => m[k] !== null && m[k] !== undefined));

  const ultimo = k => medidas.find(m => m[k] !== null && m[k] !== undefined);
  const penultimo = k => medidas.filter(m => m[k] !== null && m[k] !== undefined)[1];
  const variacao = k => {
    const a = ultimo(k), b = penultimo(k);
    if (!a || !b) return '';
    const d = a[k] - b[k];
    if (!d) return '<small class="sutil">=</small>';
    return `<small class="${d > 0 ? 'sobe' : 'desce'}">${d > 0 ? '+' : ''}${fmtNum(Math.round(d * 10) / 10)}</small>`;
  };

  el.innerHTML = `
    <button class="btn btn-primario btn-bloco" data-acao="nova">${Icone.mais}<span>Registrar medidas</span></button>
    ${medidas.length ? `
      <div class="grade-stats">
        ${camposComDados.slice(0, 6).map(([k, r, u]) => `
          <a class="stat ${k === campoAtual ? 'ativo' : ''}" href="#/corpo?campo=${k}">
            <small>${r}</small><strong>${fmtNum(ultimo(k)[k])} ${u}</strong>${variacao(k)}
          </a>`).join('')}
      </div>
      <div class="cartao">
        <div class="cartao-cab">
          ${Icone.progresso}
          <select class="campo campo-mini" data-campo-grafico>
            ${camposComDados.map(([k, r]) => `<option value="${k}" ${k === campoAtual ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="grafico"><canvas></canvas></div>
      </div>
      <h2 class="secao">Registros <small>${medidas.length}</small></h2>
      <div class="cartao lista-simples">
        ${medidas.map(m => `
          <button class="linha-lista" data-id="${m.id}">
            <span class="item-texto"><strong>${fmtData(m.data)}</strong>
            <small>${CAMPOS_MEDIDA.filter(([k]) => m[k] !== null && m[k] !== undefined).map(([k, r, u]) => `${r}: ${fmtNum(m[k])} ${u}`).join(' · ')}</small></span>
            ${Icone.seta}
          </button>`).join('')}
      </div>` : vazio(Icone.balanca, 'Nenhuma medida registrada', 'Registre seu peso e medidas para acompanhar a evolução.')}`;

  el.querySelector('[data-acao=nova]').onclick = async () => { if (await formularioMedida()) telaCorpo(el, _p, query); };
  el.querySelectorAll('[data-id]').forEach(b => b.onclick = async () => {
    const m = medidas.find(x => x.id === b.dataset.id);
    const r = await folha({
      titulo: fmtData(m.data), classe: 'modal-pequeno',
      conteudo: `<div class="lista-simples">${CAMPOS_MEDIDA.filter(([k]) => m[k] !== null && m[k] !== undefined).map(([k, rr, u]) => `<div class="linha-lista"><span class="item-texto">${rr}</span><strong>${fmtNum(m[k])} ${u}</strong></div>`).join('')}</div>${m.notas ? `<p class="notas">${esc(m.notas)}</p>` : ''}`,
      acoes: [
        { texto: 'Excluir', classe: 'btn-perigo', valor: 'excluir' },
        { texto: 'Editar', classe: 'btn-primario', valor: 'editar' },
      ],
    });
    if (r === 'editar' && await formularioMedida(m)) telaCorpo(el, _p, query);
    if (r === 'excluir' && await confirmar('Excluir este registro?', { ok: 'Excluir', perigo: true })) { await excluirMedida(m.id); toast('Registro excluído'); telaCorpo(el, _p, query); }
  });

  let grafico = null;
  const desenharGrafico = async (k) => {
    grafico?.destroy();
    const pontos = medidas.filter(m => m[k] !== null && m[k] !== undefined).reverse();
    const canvas = el.querySelector('canvas'); if (!canvas) return;
    grafico = await criarGrafico(canvas, {
      rotulos: pontos.map(m => new Date(m.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
      series: [{ nome: rotulo[k].r, dados: pontos.map(m => m[k]) }],
      sufixo: ` ${rotulo[k].u}`,
    });
  };
  el.querySelector('[data-campo-grafico]')?.addEventListener('change', e => desenharGrafico(e.target.value));
  if (medidas.length) desenharGrafico(camposComDados.some(([k]) => k === campoAtual) ? campoAtual : camposComDados[0][0]);
  return () => grafico?.destroy();
}

async function cartaoPeso(el) {
  const p = await pesoAtual();
  el.innerHTML = `
    <a class="cartao" href="#/corpo">
      <div class="cartao-cab">${Icone.balanca}<h3>Peso atual</h3></div>
      ${p ? `<p class="destaque-grande">${fmtNum(p.valor)} kg</p><p class="sutil">Registrado ${fmtRelativo(p.data)}</p>`
        : '<p class="sutil">Toque para registrar seu peso.</p>'}
    </a>`;
}

Modulos.registrar({
  id: 'corpo',
  tabelas: [TABELA_MEDIDAS],
  rotas: { '/corpo': telaCorpo },
  cartoesHoje: [{ ordem: 30, render: cartaoPeso }],
});
