// Gasto calórico adaptativo (ideia do MacroFactor): estima quanto você gasta por
// dia a partir do que comeu e de quanto o peso mudou no mesmo período.
//   gasto = média ingerida − (kg por dia × 7700 kcal)
// Com o gasto e o ritmo desejado (kg por semana), sugere a meta de calorias.

import { Modulos } from '../../core/modulos.js';
import { esc, fmtNum, dataInput } from '../../core/util.js';
import { Icone, definirTitulo, toast, confirmar } from '../../core/ui.js';
import { criarGrafico } from '../../core/graficos.js';
import { listarMedidas, tendenciaPeso } from '../corpo/dados.js';
import { obterConfig, salvarConfig, hojeISO, somarDias, totaisPorDia, tiposDosDias, metasDe, comMetas, fmtKcal } from './dados.js';

export const KCAL_POR_KG = 7700;
const JANELA = 28;          // dias analisados (até ontem: hoje ainda está em andamento)
const MIN_DIAS = 10;        // dias com registro de comida
const MIN_KCAL_DIA = 500;   // abaixo disso, o dia conta como não registrado
const MIN_PESAGENS = 3;

// { gasto, ingestao, variacaoSemana, dias, pesagens, inicio, fim, serie } ou { falta: 'motivo' }
export async function estimarGasto({ fim = somarDias(hojeISO(), -1), janela = JANELA } = {}) {
  const inicio = somarDias(fim, -(janela - 1));
  const dias = Array.from({ length: janela }, (_, i) => somarDias(inicio, i));
  const [totais, medidas] = await Promise.all([totaisPorDia(dias), listarMedidas()]);
  const registrados = dias.filter(d => totais[d].kcal >= MIN_KCAL_DIA);
  const pesagens = medidas.filter(m => m.peso > 0 && m.data && dataInput(m.data) >= inicio && dataInput(m.data) <= fim);
  const tend = tendenciaPeso(medidas, fim);
  const falta = registrados.length < MIN_DIAS
    ? `Registre a comida de pelo menos ${MIN_DIAS} dos últimos ${janela} dias (hoje: ${registrados.length}).`
    : pesagens.length < MIN_PESAGENS
      ? `Registre o peso pelo menos ${MIN_PESAGENS} vezes nos últimos ${janela} dias (hoje: ${pesagens.length}).`
      : null;
  if (falta) return { falta, dias: registrados.length, pesagens: pesagens.length };

  // Período entre o primeiro e o último dia com comida registrada (e já com peso)
  const primeiroPeso = [...tend.keys()][0];
  const usados = registrados.filter(d => d >= primeiroPeso);
  const de = usados[0], ate = usados[usados.length - 1];
  const n = de ? (new Date(`${ate}T12:00:00`) - new Date(`${de}T12:00:00`)) / 864e5 : 0;
  if (usados.length < MIN_DIAS || n < 7) return { falta: `Registre a comida e o peso por pelo menos ${MIN_DIAS} dias.`, dias: usados.length, pesagens: pesagens.length };
  const ingestao = usados.reduce((s, d) => s + totais[d].kcal, 0) / usados.length;
  // Ritmo do peso = inclinação da reta que melhor passa pelas pesagens do período
  // (a média móvel atrasa e subestimaria a mudança)
  const pts = pesagens.map(m => [(new Date(m.data) - new Date(`${de}T00:00:00`)) / 864e5, m.peso]);
  const mx = pts.reduce((s, [x]) => s + x, 0) / pts.length, my = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
  const sxx = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const porDia = sxx ? pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx : 0; // kg por dia
  const gasto = ingestao - porDia * KCAL_POR_KG;
  return {
    gasto: Math.round(gasto / 10) * 10,
    ingestao: Math.round(ingestao),
    variacaoSemana: Math.round(porDia * 7 * 100) / 100,
    dias: usados.length, pesagens: pesagens.length, inicio, fim,
    serie: dias.map(d => ({ dia: d, kcal: totais[d].kcal >= MIN_KCAL_DIA ? Math.round(totais[d].kcal) : null, tendencia: tend.get(d) ?? null })),
  };
}

// Média da meta de calorias nos próximos 7 dias (respeita o ciclo treino/off)
async function metaMedia(config) {
  const hoje = hojeISO();
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(hoje, i));
  const tipos = await tiposDosDias(dias);
  const vals = dias.map(d => metasDe(config, d)[tipos[d].tipo]?.kcal).filter(v => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// Sugestão de meta para o ritmo escolhido; { sugerida, atual, diferenca }
export async function sugestao(config, est) {
  const ritmo = config.objetivo?.ritmo ?? 0;
  const sugerida = Math.round((est.gasto + (ritmo * KCAL_POR_KG) / 7) / 10) * 10;
  const atual = await metaMedia(config);
  return { ritmo, sugerida, atual: atual == null ? null : Math.round(atual), diferenca: atual == null ? null : Math.round((sugerida - atual) / 10) * 10 };
}

// Aplica a diferença nas metas de treino e off a partir de hoje: as calorias
// mudam e a diferença vai para os carboidratos (proteína e gordura ficam).
export function metasAjustadas(config, diferenca) {
  const atuais = metasDe(config, hojeISO());
  const ajustar = m => {
    if (!m?.kcal) return { ...m };
    const kcal = Math.round((m.kcal + diferenca) / 10) * 10;
    return { ...m, kcal, ...(m.c != null && m.c !== '' ? { c: Math.max(0, Math.round(m.c + diferenca / 4)) } : {}) };
  };
  return { treino: ajustar(atuais.treino), off: ajustar(atuais.off) };
}

const RITMOS = [[-1, 'Perder 1 kg/sem'], [-0.75, 'Perder 0,75 kg/sem'], [-0.5, 'Perder 0,5 kg/sem'], [-0.25, 'Perder 0,25 kg/sem'], [0, 'Manter o peso'], [0.25, 'Ganhar 0,25 kg/sem'], [0.5, 'Ganhar 0,5 kg/sem']];
const fmtRitmo = v => `${v > 0 ? '+' : ''}${fmtNum(v)} kg/sem`;

async function telaGasto(el) {
  definirTitulo('Gasto calórico', { voltar: '#/dieta' });
  const [config, est] = await Promise.all([obterConfig(), estimarGasto()]);
  if (est.falta) {
    el.innerHTML = `
      <section class="cartao">
        <div class="cartao-cab">${Icone.medidor}<h3>Ainda faltam dados</h3></div>
        <p>${esc(est.falta)}</p>
        <p class="sutil pequeno">O app calcula seu gasto real comparando o que você comeu com a tendência do seu peso. Quanto mais dias registrados, mais precisa a estimativa.</p>
        <div class="linha-botoes"><a class="btn btn-secundario" href="#/corpo">${Icone.balanca}<span>Registrar peso</span></a><a class="btn btn-primario" href="#/dieta">${Icone.dieta}<span>Ir para a Dieta</span></a></div>
      </section>`;
    return;
  }
  const s = await sugestao(config, est);
  const revisada = config.objetivo?.revisado === hojeISO();
  el.innerHTML = `
    <section class="cartao gasto-topo">
      <small class="sutil">Seu gasto estimado</small>
      <strong class="numero-grande">${fmtKcal(est.gasto)} <small>kcal/dia</small></strong>
      <div class="estatisticas">
        <div><small>Comeu em média</small><strong>${fmtKcal(est.ingestao)} kcal</strong></div>
        <div><small>Ritmo do peso</small><strong>${fmtRitmo(est.variacaoSemana)}</strong></div>
      </div>
      <p class="sutil pequeno">Últimos ${JANELA} dias: ${est.dias} dias com comida registrada e ${est.pesagens} pesagens.</p>
    </section>

    <section class="cartao">
      <div class="cartao-cab">${Icone.medidor}<h3>Seu objetivo</h3></div>
      <select class="campo" data-ritmo>${RITMOS.map(([v, t]) => `<option value="${v}" ${v === s.ritmo ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="gasto-sugestao">
        <div><small>Meta sugerida</small><strong>${fmtKcal(s.sugerida)} kcal</strong></div>
        <div><small>Sua meta hoje (média)</small><strong>${s.atual == null ? '–' : `${fmtKcal(s.atual)} kcal`}</strong></div>
      </div>
      ${s.atual == null ? '<p class="sutil pequeno">Defina suas metas na Dieta para comparar.</p>'
        : Math.abs(s.diferenca) < 50 ? '<p class="gasto-ok">Sua meta já está no ponto para esse objetivo.</p>'
        : `<p class="pequeno">Ajuste sugerido: <strong>${s.diferenca > 0 ? '+' : ''}${fmtKcal(s.diferenca)} kcal</strong> por dia nas metas de treino e off. A diferença vai para os carboidratos; proteína e gordura ficam iguais.</p>
           <button class="btn btn-primario btn-bloco" data-acao="aplicar" ${revisada ? 'disabled' : ''}>${revisada ? 'Metas ajustadas hoje' : 'Aplicar nas metas a partir de hoje'}</button>`}
    </section>

    <section class="cartao">
      <div class="cartao-cab">${Icone.progresso}<h3>Tendência do peso</h3></div>
      <div class="grafico"><canvas></canvas></div>
    </section>
    <p class="sutil pequeno">Como funciona: se você comeu 2.300 kcal por dia e a tendência do peso caiu 0,5 kg por semana, seu gasto é cerca de 2.300 + 550 = 2.850 kcal. Dias com menos de ${MIN_KCAL_DIA} kcal registradas ficam de fora. A tendência suaviza o sobe e desce diário do peso.</p>`;

  el.querySelector('[data-ritmo]').onchange = async e => {
    await salvarConfig({ ...config, objetivo: { ...(config.objetivo || {}), ritmo: Number(e.target.value) } });
    telaGasto(el);
  };
  el.querySelector('[data-acao=aplicar]')?.addEventListener('click', async () => {
    const novas = metasAjustadas(config, s.diferenca);
    const txt = `Treino: ${fmtKcal(novas.treino.kcal || 0)} kcal · Off: ${fmtKcal(novas.off.kcal || 0)} kcal. Os dias anteriores mantêm as metas que tinham.`;
    if (!await confirmar(`Aplicar as novas metas a partir de hoje? ${txt}`, { ok: 'Aplicar' })) return;
    await salvarConfig({ ...comMetas(config, novas, hojeISO()), objetivo: { ...(config.objetivo || {}), ritmo: s.ritmo, revisado: hojeISO() } });
    toast('Metas ajustadas', 'sucesso');
    telaGasto(el);
  });

  let saiu = false, grafico = null;
  const rot = est.serie.map(x => x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7));
  criarGrafico(el.querySelector('canvas'), {
    rotulos: rot,
    series: [{ nome: 'Tendência (kg)', dados: est.serie.map(x => x.tendencia) }],
    sufixo: ' kg',
  }).then(g => { if (saiu) g?.destroy(); else grafico = g; });
  return () => { saiu = true; grafico?.destroy(); };
}

Modulos.registrar({
  id: 'dieta-gasto',
  rotas: { '/dieta/gasto': telaGasto },
});
