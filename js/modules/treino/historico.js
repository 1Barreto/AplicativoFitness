// Aba "Histórico": lista de treinos, detalhe, edição e exclusão.

import { Modulos } from '../../core/modulos.js';
import { esc, fmtNum, fmtDataHora, fmtDuracao, fmtVolume, clone, uuid } from '../../core/util.js';
import { Icone, definirTitulo, toast, confirmar, menu, vazio } from '../../core/ui.js';
import {
  listarTreinos, obterTreino, salvarTreino, excluirTreino, mapaDeExercicios, resumoTreino, mapaDeRecordes,
  NOMES_RECORDE, TIPOS_SERIE, TIPOS_EXERCICIO, salvarRotina, listarRotinas,
} from './dados.js';
import { rotulosSeries } from './componentes.js';
import { montarEditor, iniciarTreino } from './sessao.js';

async function telaLista(el) {
  definirTitulo('Histórico', { voltar: '#/perfil' });
  const [treinos, mapa, recordes] = await Promise.all([listarTreinos(), mapaDeExercicios(), mapaDeRecordes()]);
  if (!treinos.length) {
    el.innerHTML = vazio(Icone.historico, 'Nenhum treino ainda', 'Os treinos finalizados aparecem aqui.', '<a class="btn btn-primario" href="#/treino">Ir para Treino</a>');
    return;
  }
  const porMes = new Map();
  treinos.forEach(t => {
    const chave = new Date(t.inicio).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    if (!porMes.has(chave)) porMes.set(chave, []);
    porMes.get(chave).push(t);
  });
  el.innerHTML = [...porMes.entries()].map(([mes, lista]) => `
    <h2 class="secao">${mes} <small>${lista.length} treino${lista.length > 1 ? 's' : ''}</small></h2>
    <div class="grade-cartoes">
      ${lista.map(t => {
        const r = resumoTreino(t, mapa);
        const prs = t.exercicios.reduce((n, e) => n + e.series.filter(s => recordes.has(s.uid)).length, 0);
        return `
        <a class="cartao item-hist" href="#/historico/${t.id}">
          <div class="item-hist-topo"><strong>${esc(t.nome)}</strong>${prs ? `<span class="selo">${Icone.trofeu}${prs}</span>` : ''}</div>
          <small class="sutil">${fmtDataHora(t.inicio)}</small>
          <div class="estatisticas mini">
            <div><small>Duração</small><strong>${fmtDuracao(r.duracao)}</strong></div>
            <div><small>Volume</small><strong>${fmtVolume(r.volume)}</strong></div>
            <div><small>Séries</small><strong>${r.series}</strong></div>
          </div>
          <ul class="lista-ex-resumo">${t.exercicios.slice(0, 4).map(e => `<li>${e.series.length} × ${esc(mapa.get(e.exercicio_id)?.nome || '?')}</li>`).join('')}${t.exercicios.length > 4 ? `<li class="sutil">+${t.exercicios.length - 4} exercício(s)</li>` : ''}</ul>
        </a>`;
      }).join('')}
    </div>`).join('');
}

async function telaDetalhe(el, { id }, query) {
  const t = await obterTreino(id);
  if (!t) { el.innerHTML = vazio(Icone.historico, 'Treino não encontrado'); return; }
  definirTitulo('Treino', { voltar: '#/historico' });
  const [mapa, recordes] = await Promise.all([mapaDeExercicios(), mapaDeRecordes()]);
  const r = resumoTreino(t, mapa);
  const totalPrs = t.exercicios.reduce((n, e) => n + e.series.filter(s => recordes.has(s.uid)).length, 0);

  el.innerHTML = `
    ${query.novo ? `<div class="cartao cartao-parabens">🎉 <div><strong>Treino concluído!</strong><small>${totalPrs ? `Você bateu ${totalPrs} recorde${totalPrs > 1 ? 's' : ''} hoje.` : 'Bom trabalho, continue assim.'}</small></div></div>` : ''}
    <div class="cartao">
      <div class="ex-topo"><h2>${esc(t.nome)}</h2><button class="icon-btn" data-acao="menu" aria-label="Opções">${Icone.pontos}</button></div>
      <p class="sutil">${fmtDataHora(t.inicio)}</p>
      <div class="estatisticas">
        <div><small>Duração</small><strong>${fmtDuracao(r.duracao)}</strong></div>
        <div><small>Volume</small><strong>${fmtVolume(r.volume)}</strong></div>
        <div><small>Séries</small><strong>${r.series}</strong></div>
        <div><small>Recordes</small><strong>${totalPrs}</strong></div>
      </div>
      ${t.notas ? `<p class="notas">${esc(t.notas)}</p>` : ''}
    </div>
    ${t.exercicios.map(e => {
      const ex = mapa.get(e.exercicio_id) || { nome: '?' };
      const [c1, c2] = TIPOS_EXERCICIO[ex.tipo || 'peso_reps'].campos;
      const rot = rotulosSeries(e.series);
      return `
      <section class="cartao">
        <a class="ex-nome" href="#/treino/exercicio/${e.exercicio_id}">${esc(ex.nome)}</a>
        ${e.notas ? `<p class="sutil">${esc(e.notas)}</p>` : ''}
        <table class="tabela-detalhe">
          <thead><tr><th>Série</th><th>${c1}</th><th>${c2}</th>${e.series.some(s => s.rir != null) ? '<th>RIR</th>' : ''}<th></th></tr></thead>
          <tbody>${e.series.map((s, j) => `
            <tr>
              <td><span class="tipo-serie mini ${TIPOS_SERIE[s.tipo]?.classe || ''}">${rot[j]}</span></td>
              <td>${fmtNum(s.peso) || '–'}</td><td>${fmtNum(s.reps) || '–'}</td>${e.series.some(x => x.rir != null) ? `<td>${s.rir != null ? (s.rir >= 5 ? '5+' : s.rir) : '–'}</td>` : ''}
              <td>${recordes.has(s.uid) ? `<span class="selo" title="${recordes.get(s.uid).map(x => NOMES_RECORDE[x]).join(', ')}">${Icone.trofeu}${recordes.get(s.uid).map(x => NOMES_RECORDE[x]).join(' · ')}</span>` : ''}</td>
            </tr>`).join('')}</tbody>
        </table>
      </section>`;
    }).join('')}
    <div class="linha-botoes">
      <button class="btn btn-primario" data-acao="repetir">${Icone.play}<span>Repetir treino</span></button>
      <a class="btn btn-secundario" href="#/historico/${t.id}/editar">${Icone.editar}<span>Editar</span></a>
    </div>`;

  el.querySelector('[data-acao=repetir]').onclick = () => iniciarTreino({ modelo: t });
  el.querySelector('[data-acao=menu]').onclick = async () => {
    const op = await menu(t.nome, [
      { texto: 'Editar treino', valor: 'editar', icone: Icone.editar },
      { texto: 'Repetir treino', valor: 'repetir', icone: Icone.play },
      { texto: 'Salvar como rotina', valor: 'rotina', icone: Icone.copiar },
      { texto: 'Excluir treino', valor: 'excluir', icone: Icone.lixo, perigo: true },
    ]);
    if (op === 'editar') location.hash = `#/historico/${t.id}/editar`;
    else if (op === 'repetir') iniciarTreino({ modelo: t });
    else if (op === 'rotina') {
      const n = (await listarRotinas()).length;
      await salvarRotina({
        nome: t.nome, notas: '', ordem: n,
        exercicios: t.exercicios.map(e => ({ exercicio_id: e.exercicio_id, descanso: e.descanso, notas: e.notas, series: e.series.map(s => ({ tipo: s.tipo, peso: s.peso, reps: s.reps })) })),
      });
      toast('Rotina criada', 'sucesso');
    } else if (op === 'excluir' && await confirmar('Excluir este treino do histórico?', { ok: 'Excluir', perigo: true })) {
      await excluirTreino(t.id); toast('Treino excluído'); location.hash = '#/historico';
    }
  };
}

async function telaEditar(el, { id }) {
  const original = await obterTreino(id);
  if (!original) { el.innerHTML = vazio(Icone.historico, 'Treino não encontrado'); return; }
  const estado = clone(original);
  estado.exercicios.forEach(e => { e.uid ||= uuid(); e.series.forEach(s => { s.uid ||= uuid(); }); });
  let alterado = false;
  definirTitulo('Editar treino', {
    voltar: async () => { if (!alterado || await confirmar('Sair sem salvar as alterações?', { ok: 'Sair', perigo: true })) location.hash = `#/historico/${id}`; },
  });
  el.innerHTML = `<div data-editor></div>
    <div class="rodape-acoes">
      <a class="btn btn-secundario" href="#/historico/${id}">Cancelar</a>
      <button class="btn btn-primario" data-acao="salvar">Salvar</button>
    </div>`;
  await montarEditor(el.querySelector('[data-editor]'), estado, { modo: 'edicao', aoMudar: () => { alterado = true; } });
  el.querySelector('[data-acao=salvar]').onclick = async () => {
    const final = clone(estado);
    final.exercicios = final.exercicios.map(e => ({ ...e, series: e.series.filter(s => s.feita || s.peso !== null || s.reps !== null).map(({ recordes, ...s }) => ({ ...s, feita: true })) })).filter(e => e.series.length);
    await salvarTreino(final);
    toast('Treino atualizado', 'sucesso');
    location.hash = `#/historico/${id}`;
  };
}

Modulos.registrar({
  id: 'historico',
  rotas: {
    '/historico': telaLista,
    '/historico/:id': telaDetalhe,
    '/historico/:id/editar': { view: telaEditar, recarregar: false },
  },
});
