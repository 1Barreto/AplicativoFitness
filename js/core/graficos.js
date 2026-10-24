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
 * @param {{tipo?:'line'|'bar', rotulos:string[], series:{nome:string, dados:number[], cor?:string}[], sufixo?:string, inteiro?:boolean}} opcoes
 */
export async function criarGrafico(canvas, { tipo = 'line', rotulos, series, sufixo = '', inteiro = false }) {
  let Chart;
  try { Chart = await chart(); } catch {
    canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'sutil', textContent: 'Gráfico indisponível offline (abra o app uma vez com internet).' }));
    return null;
  }
  const c = cores();
  const paleta = [c.destaque, c.destaque2, '#f2994a', '#9b51e0', '#eb5757'];
  const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  return new Chart(canvas, {
    type: tipo,
    data: {
      labels: rotulos,
      datasets: series.map((s, i) => ({
        label: s.nome,
        data: s.dados,
        borderColor: s.cor || paleta[i % paleta.length],
        backgroundColor: tipo === 'bar' ? (s.cor || paleta[i % paleta.length]) : (s.cor || paleta[i % paleta.length]) + '22',
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
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: series.length > 1, labels: { color: c.texto, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}${sufixo}` } },
      },
      scales: {
        x: { ticks: { color: c.texto, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { color: c.texto, callback: v => fmt.format(v), ...(inteiro ? { precision: 0, stepSize: 1 } : {}) }, grid: { color: c.grade }, beginAtZero: tipo === 'bar' },
      },
    },
  });
}
