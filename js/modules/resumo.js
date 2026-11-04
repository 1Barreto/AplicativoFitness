// Resumo da semana (aba Hoje): balanço da semana passada (segunda a domingo)
// com treino, dieta e peso, comparado com a semana anterior.

import { Modulos } from '../core/modulos.js';
import { esc, fmtNum, fmtVolume, dataInput, inicioDaSemana } from '../core/util.js';
import { Icone } from '../core/ui.js';
import { listarTreinos, mapaDeExercicios, mapaDeRecordes, resumoTreino } from './treino/dados.js';
import { totaisPorDia, somarDias, fmtKcal } from './dieta/dados.js';
import { listarMedidas, tendenciaPeso } from './corpo/dados.js';
import { estimarGasto } from './dieta/gasto.js';

const CHAVE_OCULTO = 'resumo-semana-oculto';
const lerOculto = () => { try { return localStorage.getItem(CHAVE_OCULTO); } catch { return null; } };
const gravarOculto = v => { try { localStorage.setItem(CHAVE_OCULTO, v); } catch { /* sem armazenamento */ } };

// Números de uma semana que começa na segunda "seg" (aaaa-mm-dd)
async function numerosDaSemana(seg, { treinos, mapa, recordes, medidas }) {
  const dom = somarDias(seg, 6);
  const daSemana = treinos.filter(t => { const d = dataInput(t.inicio); return d >= seg && d <= dom; });
  const r = daSemana.map(t => resumoTreino(t, mapa));
  const prs = daSemana.reduce((n, t) => n + t.exercicios.reduce((m, e) => m + e.series.filter(s => recordes.has(s.uid)).length, 0), 0);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
  const totais = await totaisPorDia(dias);
  const comComida = dias.filter(d => totais[d].kcal >= 500);
  const media = k => (comComida.length ? comComida.reduce((s, d) => s + totais[d][k], 0) / comComida.length : null);
  const tend = tendenciaPeso(medidas, dom);
  const antes = tend.get(somarDias(seg, -1)), depois = tend.get(dom);
  return {
    treinos: daSemana.length,
    volume: r.reduce((s, x) => s + x.volume, 0),
    duracao: r.reduce((s, x) => s + x.duracao, 0),
    prs,
    diasComida: comComida.length,
    kcal: media('kcal'), proteina: media('p'),
    peso: depois ?? null,
    variacaoPeso: antes != null && depois != null ? Math.round((depois - antes) * 10) / 10 : null,
  };
}

// Seta de comparação com a semana anterior
function compara(atual, antes, fmt = v => fmtNum(v)) {
  if (antes == null || atual == null || !antes) return '';
  const d = atual - antes;
  if (Math.abs(d) < 1e-9) return '<small class="sutil">igual</small>';
  return `<small class="${d > 0 ? 'cmp-mais' : 'cmp-menos'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}</small>`;
}

async function cartaoResumo(el) {
  const seg = somarDias(dataInput(inicioDaSemana(new Date())), -7); // segunda da semana passada
  if (lerOculto() === seg) { el.remove(); return; }
  const [treinos, mapa, recordes, medidas] = await Promise.all([listarTreinos(), mapaDeExercicios(), mapaDeRecordes(), listarMedidas()]);
  const ctx = { treinos, mapa, recordes, medidas };
  const [a, b, gasto] = await Promise.all([numerosDaSemana(seg, ctx), numerosDaSemana(somarDias(seg, -7), ctx), estimarGasto()]);
  if (!a.treinos && !a.diasComida && a.variacaoPeso == null) { el.remove(); return; }
  const periodo = `${fmtDiaMes(seg)} a ${fmtDiaMes(somarDias(seg, 6))}`;
  el.innerHTML = `
    <section class="cartao cartao-resumo">
      <div class="cartao-cab">${Icone.calendario}<div class="cab-titulo"><h3>Resumo da semana</h3><small>${esc(periodo)}</small></div>
        <button class="icon-btn" data-ocultar aria-label="Ocultar até a próxima semana" title="Ocultar até a próxima semana">${Icone.fechar}</button></div>
      <div class="resumo-grade">
        <div><small>Treinos</small><strong>${a.treinos}</strong>${compara(a.treinos, b.treinos)}</div>
        <div><small>Volume</small><strong>${fmtVolume(a.volume)}</strong>${compara(a.volume, b.volume, fmtVolume)}</div>
        <div><small>Recordes</small><strong>${a.prs}</strong></div>
        <div><small>Calorias (média)</small><strong>${a.kcal == null ? '–' : fmtKcal(a.kcal)}</strong>${a.diasComida ? `<small class="sutil">${a.diasComida} dia${a.diasComida > 1 ? 's' : ''}</small>` : ''}</div>
        <div><small>Proteína (média)</small><strong>${a.proteina == null ? '–' : `${fmtKcal(a.proteina)} g`}</strong></div>
        <div><small>Peso (tendência)</small><strong>${a.peso == null ? '–' : `${fmtNum(Math.round(a.peso * 10) / 10)} kg`}</strong>${a.variacaoPeso == null ? '' : `<small class="${a.variacaoPeso > 0 ? 'sobe' : a.variacaoPeso < 0 ? 'desce' : 'sutil'}">${a.variacaoPeso > 0 ? '+' : ''}${fmtNum(a.variacaoPeso)} kg</small>`}</div>
      </div>
      ${gasto.gasto ? `<a class="resumo-gasto" href="#/dieta/gasto">${Icone.medidor}<span>Gasto estimado: <strong>${fmtKcal(gasto.gasto)} kcal/dia</strong></span>${Icone.seta}</a>` : ''}
    </section>`;
  el.querySelector('[data-ocultar]').onclick = () => { gravarOculto(seg); el.remove(); };
}

const fmtDiaMes = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

Modulos.registrar({
  id: 'resumo',
  cartoesHoje: [{ ordem: 40, render: cartaoResumo }],
});
