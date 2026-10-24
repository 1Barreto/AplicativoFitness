// Gráficos com Chart.js (carregado sob demanda pelo CDN e guardado no cache offline).

import { CDN } from '../config.js';
import { carregarScript } from './util.js';

async function chart() {
  if (!window.Chart) await carregarScript(CDN.chart);
  return window.Chart;
}

function cores() {
  const css = getComputedStyle(document.documentElement);
  const v = n => css.getPropertyValue(n).trim();
  return { texto: v('--texto-2'), grade: v('--linha'), destaque: v('--destaque'), destaque2: v('--destaque-2'), fundo: v('--fundo-2') };
}

/**
 * Cria um gráfico de linha ou barras.
 * @param {HTMLCanvasElement} canvas
 * @param {{tipo?:'line'|'bar', rotulos:string[], series:{nome:string, dados:number[], cor?:string|string[]}[], sufixo?:string, inteiro?:boolean, horizontal?:boolean, formatar?:(v:number)=>string}} opcoes
 */
export async function criarGrafico(canvas, { tipo = 'line', rotulos, series, sufixo = '', inteiro = false, horizontal = false, formatar = null }) {
  let Chart;
  try { Chart = await chart(); } catch {
    canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'sutil', textContent: 'Gráfico indisponível offline (abra o app uma vez com internet).' }));
    return null;
  }
  const c = cores();
  const paleta = [c.destaque, c.destaque2, '#f2994a', '#9b51e0', '#eb5757'];
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const fmt = { format: v => (formatar ? formatar(v) : nf.format(v)) };
  const eixoValor = horizontal ? 'x' : 'y';
  const eixoRotulo = horizontal ? 'y' : 'x';
  return new Chart(canvas, {
    type: tipo,
    data: {
      labels: rotulos,
      datasets: series.map((s, i) => ({
        label: s.nome,
        data: s.dados,
        borderColor: s.cor || paleta[i % paleta.length],
        backgroundColor: tipo === 'bar' ? (s.cor || paleta[i % paleta.length]) : (s.cor || paleta[i % paleta.length]) + '22',
        maxBarThickness: 34,
        borderWidth: 2,
        borderRadius: tipo === 'bar' ? 6 : 0,
        pointRadius: rotulos.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        tension: 0.25,
        fill: tipo === 'line' && series.length === 1,
        spanGaps: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
      plugins: {
        legend: { display: series.length > 1, labels: { color: c.texto, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt.format(ctx.parsed[eixoValor])}${sufixo}` } },
      },
      scales: {
        [eixoRotulo]: { ticks: { color: c.texto, maxRotation: 0, autoSkip: !horizontal, maxTicksLimit: horizontal ? undefined : 6 }, grid: { display: false } },
        [eixoValor]: { ticks: { color: c.texto, callback: v => fmt.format(v), maxTicksLimit: 6, ...(inteiro ? { precision: 0 } : {}) }, grid: { color: c.grade }, beginAtZero: tipo === 'bar' },
      },
    },
  });
}
