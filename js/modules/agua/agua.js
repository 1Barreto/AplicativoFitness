// Módulo Água: cartão na tela Hoje (e no dia escolhido da Dieta) para marcar
// cada garrafa terminada. Os dados ficam em ./dados.js.

import { Modulos } from '../../core/modulos.js';
import { Icone, folha, toast } from '../../core/ui.js';
import { num, fmtNum } from '../../core/util.js';
import { TA, hojeISO, obterConfig, salvarConfig, metaSugerida, garrafasDoDia, marcarGarrafa, desfazerUltima, fmtLitros } from './dados.js';

const MAX_DESENHOS = 10; // acima disso, a fileira de garrafas vira só número

// Garrafa desenhada: contorno + água que sobe de baixo (escala no eixo Y).
let seq = 0;
function garrafa(cheia, nova) {
  const id = `ga${++seq}`;
  const forma = 'M9.5 2.5h5v3.2c0 1.3 4.5 2.4 4.5 6v21.8a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 33.5V11.7c0-3.6 4.5-4.7 4.5-6z';
  return `<svg class="garrafa ${cheia ? 'cheia' : ''} ${nova ? 'nova' : ''}" viewBox="0 0 24 40" aria-hidden="true">
    <clipPath id="${id}"><path d="${forma}"/></clipPath>
    <g clip-path="url(#${id})"><rect class="garrafa-agua" x="0" y="0" width="24" height="40"/></g>
    <path class="garrafa-contorno" d="${forma}"/></svg>`;
}

function formularioConfig(config, sugestao) {
  return folha({
    titulo: 'Garrafa e meta', classe: 'modal-pequeno',
    conteudo: `<div class="form">
      <label>Quanto cabe na sua garrafa<span class="campo-unidade"><input class="campo" name="garrafa" inputmode="numeric" value="${config?.garrafa || ''}" placeholder="Ex.: 950" autofocus><i>ml</i></span></label>
      <label>Meta por dia<span class="campo-unidade"><input class="campo" name="meta" inputmode="decimal" value="${fmtNum((config?.meta || sugestao) / 1000)}"><i>L</i></span></label>
      <p class="sutil pequeno">Sugestão: ${fmtLitros(sugestao)} (35 ml por kg do seu último peso, ou 3 L sem peso). Trocar de garrafa não muda os dias anteriores.</p></div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: null },
      { texto: 'Salvar', classe: 'btn-primario', acao: async c => {
        const g = num(c.querySelector('[name=garrafa]').value);
        const m = num(c.querySelector('[name=meta]').value);
        if (!(g >= 50 && g <= 5000)) { toast('Informe a garrafa em ml (ex.: 950)', 'erro'); return false; }
        if (!(m > 0 && m <= 15)) { toast('Informe a meta em litros (ex.: 3)', 'erro'); return false; }
        return salvarConfig({ ...(config || {}), garrafa: Math.round(g), meta: Math.round(m * 1000) });
      } },
    ],
  });
}

/**
 * Desenha o cartão de água de um dia.
 * @param {HTMLElement} el
 * @param {{dia?: string}} [op]
 */
export async function cartaoAgua(el, { dia = hojeISO(), novo = false } = {}) {
  const [config, lista, sugestao] = await Promise.all([obterConfig(), garrafasDoDia(dia), metaSugerida()]);
  const ehHoje = dia === hojeISO();
  const redesenhar = (op = {}) => cartaoAgua(el, { dia, ...op });

  if (!config?.garrafa) {
    el.innerHTML = `
      <section class="cartao cartao-agua">
        <div class="cartao-cab">${Icone.agua}<h3>Água</h3></div>
        <p class="sutil agua-intro">Cadastre sua garrafa e marque cada vez que terminar uma.</p>
        <form class="agua-inicio" data-inicio>
          <label class="rotulo">Quanto cabe na sua garrafa
            <span class="campo-unidade"><input class="campo" name="garrafa" inputmode="numeric" placeholder="Ex.: 950" aria-label="Capacidade da garrafa em ml"><i>ml</i></span></label>
          <button class="btn btn-primario" type="submit">Salvar</button>
        </form>
      </section>`;
    el.querySelector('[data-inicio]').onsubmit = async e => {
      e.preventDefault();
      const g = num(e.target.garrafa.value);
      if (!(g >= 50 && g <= 5000)) { toast('Informe a garrafa em ml (ex.: 950)', 'erro'); return; }
      await salvarConfig({ garrafa: Math.round(g), meta: sugestao });
      toast(`Meta do dia: ${fmtLitros(sugestao)}. Dá para mudar no lápis.`, 'sucesso', 3500);
      redesenhar();
    };
    return;
  }

  const total = lista.reduce((s, r) => s + (r.ml || 0), 0);
  const meta = config.meta || sugestao;
  const n = lista.length;
  const precisa = Math.max(1, Math.ceil(meta / config.garrafa));
  const desenhos = Math.max(precisa, n);
  const falta = meta - total;
  const faltamGarrafas = Math.ceil(falta / config.garrafa);
  const status = falta <= 0
    ? `Meta batida${total > meta ? ` · ${fmtLitros(total - meta)} a mais` : ''}`
    : `Falta${faltamGarrafas > 1 ? 'm' : ''} ${faltamGarrafas} garrafa${faltamGarrafas > 1 ? 's' : ''} · ${fmtLitros(falta)}`;

  el.innerHTML = `
    <section class="cartao cartao-agua ${falta <= 0 ? 'batida' : ''}">
      <div class="cartao-cab">${Icone.agua}<h3>${ehHoje ? 'Água' : 'Água do dia'}</h3>
        <button class="icon-btn link-cab" data-acao="config" aria-label="Garrafa e meta" title="Garrafa e meta">${Icone.editar}</button></div>
      <div class="agua-numeros">
        <p class="agua-total"><strong>${fmtLitros(total)}</strong><span> de ${fmtLitros(meta)}</span></p>
        <p class="agua-status">${status}</p>
      </div>
      ${desenhos <= MAX_DESENHOS
        ? `<div class="agua-garrafas" role="img" aria-label="${n} de ${precisa} garrafas">${Array.from({ length: desenhos }, (_, i) => garrafa(i < n, novo && i === n - 1)).join('')}</div>`
        : `<div class="agua-barra" role="img" aria-label="${n} de ${precisa} garrafas"><i style="width:${Math.min(total / meta * 100, 100)}%"></i></div>`}
      <div class="agua-acoes">
        <button class="btn btn-primario" data-acao="marcar">${Icone.mais}<span>Terminei uma garrafa</span></button>
        <button class="btn btn-secundario agua-desfazer" data-acao="desfazer" ${n ? '' : 'disabled'} aria-label="Desfazer a última garrafa" title="Desfazer a última garrafa">${Icone.desfazer}</button>
      </div>
      <p class="sutil pequeno agua-garrafa-info">Garrafa de ${fmtLitros(config.garrafa)} · ${n} marcada${n === 1 ? '' : 's'}</p>
    </section>`;

  el.querySelector('[data-acao=marcar]').onclick = async () => {
    await marcarGarrafa(config.garrafa, dia);
    if (navigator.vibrate) navigator.vibrate(15);
    redesenhar({ novo: true });
  };
  el.querySelector('[data-acao=desfazer]').onclick = async () => {
    await desfazerUltima(dia);
    toast('Última garrafa desfeita');
    redesenhar();
  };
  el.querySelector('[data-acao=config]').onclick = async () => {
    if (await formularioConfig(config, sugestao)) redesenhar();
  };
}

Modulos.registrar({
  id: 'agua',
  tabelas: [TA.registros, TA.config],
  cartoesHoje: [{ ordem: 6, render: el => cartaoAgua(el) }],
});
