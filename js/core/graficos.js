// Gráficos com Chart.js (carregado sob demanda pelo CDN e guardado no cache offline).
// Estilo: linhas com brilho e degradê, barras em degradê, grade tracejada discreta.

import { CDN } from '../config.js';
import { carregarScript } from './util.js';

async function chart() {
  if (!window.Chart) await carregarScript(CDN.chart);
  return window.Chart;
}

function cores() {
  const css = getComputedStyle(document.documentElement);
  const v = n => css.getPropertyValue(n).trim();
  return { texto: v('--texto-2'), destaque: v('--destaque'), destaque2: v('--destaque-2'), secundaria: v('--secundaria'), fonte: v('--fonte') };
}

// "#rrggbb" ou "#rrggbbaa" + opacidade (0–1) -> "#rrggbbaa"
function alfa(hex, a) {
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return hex;
  const base = hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1;
  return hex.slice(0, 7) + Math.round(base * a * 255).toString(16).padStart(2, '0');
}

// Brilho suave nas linhas
const pluginBrilho = {
  id: 'brilho',
  beforeDatasetDraw(chart, args) {
    if (chart.config.type !== 'line') return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = alfa(args.meta.dataset?.options?.borderColor || cores().destaque, .7);
    ctx.shadowBlur = 14;
  },
  afterDatasetDraw(chart) { if (chart.config.type === 'line') chart.ctx.restore(); },
};

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
  const paleta = [c.destaque, c.secundaria, '#8e8e93', '#b98cff', '#ff5c7a'];
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const fmt = { format: v => (formatar ? formatar(v) : nf.format(v)) };
  const eixoValor = horizontal ? 'x' : 'y';
  const eixoRotulo = horizontal ? 'y' : 'x';
  Chart.defaults.font.family = c.fonte || Chart.defaults.font.family;

  // Degradê calculado no tamanho atual do gráfico
  const degrade = (ctx, cor, de, ate) => {
    const { chartArea } = ctx.chart;
    if (!chartArea) return alfa(cor, de);
    const g = horizontal
      ? ctx.chart.ctx.createLinearGradient(chartArea.right, 0, chartArea.left, 0)
      : ctx.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, alfa(cor, de));
    g.addColorStop(1, alfa(cor, ate));
    return g;
  };

  return new Chart(canvas, {
    type: tipo,
    plugins: [pluginBrilho],
    data: {
      labels: rotulos,
      datasets: series.map((s, i) => {
        const base = s.cor || paleta[i % paleta.length];
        const corDo = idx => (Array.isArray(base) ? base[idx] : base);
        return tipo === 'bar' ? {
          label: s.nome,
          data: s.dados,
          backgroundColor: ctx => degrade(ctx, corDo(ctx.dataIndex), 1, .25),
          hoverBackgroundColor: ctx => degrade(ctx, corDo(ctx.dataIndex), 1, .55),
          borderWidth: 0,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 30,
        } : {
          label: s.nome,
          data: s.dados,
          borderColor: base,
          backgroundColor: ctx => degrade(ctx, base, .35, 0),
          borderWidth: 2.5,
          pointRadius: rotulos.length > 30 ? 0 : 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: base,
          pointBorderWidth: 2,
          tension: 0.38,
          fill: series.length === 1,
          spanGaps: true,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
      plugins: {
        legend: { display: series.length > 1, labels: { color: c.texto, boxWidth: 10, usePointStyle: true } },
        tooltip: {
          backgroundColor: 'rgba(12, 20, 19, .95)',
          borderColor: alfa(c.destaque, .45),
          borderWidth: 1,
          titleColor: '#eef5f3',
          bodyColor: '#eef5f3',
          padding: 10,
          cornerRadius: 10,
          displayColors: false,
          callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt.format(ctx.parsed[eixoValor])}${sufixo}` },
        },
      },
      scales: {
        [eixoRotulo]: {
          ticks: { color: c.texto, maxRotation: 0, autoSkip: !horizontal, maxTicksLimit: horizontal ? undefined : 6 },
          grid: { display: false },
          border: { display: false },
        },
        [eixoValor]: {
          ticks: { color: c.texto, callback: v => fmt.format(v), maxTicksLimit: 6, ...(inteiro ? { precision: 0 } : {}) },
          grid: { color: 'rgba(255, 255, 255, .07)' },
          border: { display: false, dash: [3, 5] },
          beginAtZero: tipo === 'bar',
        },
      },
    },
  });
}
