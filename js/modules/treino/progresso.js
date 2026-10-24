// Aba "Progresso": volume semanal, frequência, recordes e evolução por exercício.

import { Modulos } from '../../core/modulos.js';
import { esc, fmtKg, fmtVolume, fmtData, inicioDaSemana } from '../../core/util.js';
import { Icone, definirTitulo, vazio } from '../../core/ui.js';
import { criarGrafico } from '../../core/graficos.js';
import { listarTreinos, mapaDeExercicios, resumoTreino, mapaDeRecordes, melhoresDeSeries, NOMES_RECORDE } from './dados.js';

async function telaProgresso(el) {
  definirTitulo('Progresso', { voltar: '#/perfil' });
  const [treinos, mapa, recordes] = await Promise.all([listarTreinos(), mapaDeExercicios(), mapaDeRecordes()]);
  if (!treinos.length) {
    el.innerHTML = vazio(Icone.progresso, 'Sem dados ainda', 'Finalize alguns treinos para ver gráficos e recordes.');
    return;
  }

  // Últimas 12 semanas
  const semanas = [];
  const hoje = inicioDaSemana(new Date());
  for (let i = 11; i >= 0; i--) { const d = new Date(hoje); d.setDate(d.getDate() - i * 7); semanas.push(d); }
  const volume = semanas.map(() => 0);
  const frequencia = semanas.map(() => 0);
  treinos.forEach(t => {
    const ini = inicioDaSemana(new Date(t.inicio)).getTime();
    const i = semanas.findIndex(s => s.getTime() === ini);
    if (i >= 0) { volume[i] += resumoTreino(t, mapa).volume; frequencia[i]++; }
  });
  const rotulos = semanas.map(s => s.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));

  // Totais
  const totalVolume = treinos.reduce((s, t) => s + resumoTreino(t, mapa).volume, 0);
  const mesAtual = new Date(); mesAtual.setDate(1); mesAtual.setHours(0, 0, 0, 0);
  const noMes = treinos.filter(t => new Date(t.inicio) >= mesAtual).length;

  // Recordes recentes (últimos 20)
  const recentes = [];
  treinos.forEach(t => t.exercicios.forEach(e => e.series.forEach(s => {
    if (recordes.has(s.uid)) recentes.push({ t, e, s, tipos: recordes.get(s.uid) });
  })));

  // Melhores marcas por exercício
  const porEx = new Map();
  treinos.forEach(t => t.exercicios.forEach(e => {
    if (!porEx.has(e.exercicio_id)) porEx.set(e.exercicio_id, []);
    porEx.get(e.exercicio_id).push(...e.series);
  }));
  const melhores = [...porEx.entries()]
    .map(([id, series]) => ({ id, ex: mapa.get(id), m: melhoresDeSeries(series), n: series.length }))
    .filter(x => x.ex && x.m.carga > 0)
    .sort((a, b) => b.n - a.n);

  el.innerHTML = `
    <div class="grade-stats">
      <div class="stat"><small>Treinos</small><strong>${treinos.length}</strong></div>
      <div class="stat"><small>Neste mês</small><strong>${noMes}</strong></div>
      <div class="stat"><small>Volume total</small><strong>${fmtVolume(totalVolume)}</strong></div>
    </div>
    <div class="grade-2">
      <div class="cartao"><div class="cartao-cab">${Icone.progresso}<h3>Volume semanal</h3></div><div class="grafico"><canvas data-g="volume"></canvas></div></div>
      <div class="cartao"><div class="cartao-cab">${Icone.historico}<h3>Treinos por semana</h3></div><div class="grafico"><canvas data-g="freq"></canvas></div></div>
    </div>
    <h2 class="secao">Recordes recentes</h2>
    ${recentes.length ? `<div class="cartao lista-simples">${recentes.slice(0, 15).map(({ t, e, s, tipos }) => `
      <a href="#/historico/${t.id}" class="linha-lista">
        <span class="selo">${Icone.trofeu}</span>
        <span class="item-texto"><strong>${esc(mapa.get(e.exercicio_id)?.nome || '?')}</strong><small>${tipos.map(x => NOMES_RECORDE[x]).join(' · ')} — ${fmtKg(s.peso)} × ${s.reps}</small></span>
        <small class="sutil">${fmtData(t.inicio, { day: '2-digit', month: 'short' })}</small>
      </a>`).join('')}</div>` : '<p class="sutil">Seus novos recordes aparecerão aqui.</p>'}
    <h2 class="secao">Melhores marcas por exercício</h2>
    <div class="cartao lista-simples">${melhores.map(x => `
      <a href="#/treino/exercicio/${x.id}" class="linha-lista">
        <span class="avatar-ex">${esc(x.ex.nome[0])}</span>
        <span class="item-texto"><strong>${esc(x.ex.nome)}</strong><small>Carga ${fmtKg(x.m.carga)} · 1RM est. ${fmtKg(Math.round(x.m.e1rm * 10) / 10)}</small></span>
        ${Icone.seta}
      </a>`).join('') || '<p class="sutil">Nenhum exercício com carga registrada.</p>'}</div>
  `;

  const g1 = await criarGrafico(el.querySelector('[data-g=volume]'), { tipo: 'bar', rotulos, series: [{ nome: 'Volume', dados: volume }], sufixo: ' kg' });
  const g2 = await criarGrafico(el.querySelector('[data-g=freq]'), { tipo: 'bar', rotulos, series: [{ nome: 'Treinos', dados: frequencia }], inteiro: true });
  return () => { g1?.destroy(); g2?.destroy(); };
}

Modulos.registrar({
  id: 'progresso',
  rotas: { '/progresso': telaProgresso },
});
