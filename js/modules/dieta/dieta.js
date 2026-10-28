// Aba "Dieta": diário do dia (calorias, macros e refeições), alimentos
// personalizados, refeições salvas e metas. Alimentos da TBCA-USP.

import { Modulos } from '../../core/modulos.js';
import { esc, fmtNum, clone, normalizar } from '../../core/util.js';
import { Icone, definirTitulo, toast, confirmar, menu, pedirTexto, vazio, folha } from '../../core/ui.js';
import { pesoAtual } from '../corpo/dados.js';
import {
  T, obterConfig, salvarConfig, hojeISO, somarDias, itensDoDia, diasComRegistro, totaisPorDia, metasDe, tiposDosDias, marcarTipoDia, TIPOS_DIA, comMetas, proximaRefeicao, ultimaVezDaRefeicao, refeicaoFeita, consumidos, marcarRefeicaoFeita, refeicaoAtrasada, salvarItem, excluirItem, novoItem,
  listarMeusAlimentos, salvarAlimento, excluirAlimento, listarRefeicoesSalvas, salvarRefeicaoSalva, excluirRefeicaoSalva,
  copiaAlimento, calcular, somar, fmtKcal, fmtG, fmtQtd, MACROS, refeicoesDoTipo, planoDe, comPlano, aplicarPlano,
} from './dados.js';
import { escolherAlimentos, escolherQuantidade, formularioAlimento, formularioMetas, barraMacros, linhaMacros } from './componentes.js';

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const dataDe = dia => new Date(`${dia}T12:00:00`);

function rotuloDia(dia) {
  const h = hojeISO();
  if (dia === h) return 'Hoje';
  if (dia === somarDias(h, -1)) return 'Ontem';
  if (dia === somarDias(h, 1)) return 'Amanhã';
  const s = dataDe(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Anel de calorias (SVG)
// planejado: total com as refeições ainda não feitas (arco mais claro)
function anel(consumido, meta, { tamanho = 132, espessura = 11, planejado = 0 } = {}) {
  const r = (120 - espessura) / 2, c = 2 * Math.PI * r;
  const frac = meta ? Math.min(consumido / meta, 1) : 0;
  const fracPlan = meta && planejado > consumido ? Math.min(planejado / meta, 1) : 0;
  const passou = meta && consumido > meta;
  return `
    <svg class="anel ${passou ? 'passou' : ''}" viewBox="0 0 120 120" width="${tamanho}" height="${tamanho}" aria-hidden="true">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke-width="${espessura}" class="anel-trilho"/>
      ${fracPlan ? `<circle cx="60" cy="60" r="${r}" fill="none" stroke-width="${espessura}" class="anel-plano"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - fracPlan)}" stroke-linecap="round" transform="rotate(-90 60 60)"/>` : ''}
      <circle cx="60" cy="60" r="${r}" fill="none" stroke-width="${espessura}" class="anel-valor"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" stroke-linecap="round" transform="rotate(-90 60 60)"/>
    </svg>`;
}

function blocoResumo(total, metas, plano) {
  const meta = metas.kcal;
  const resta = meta ? meta - total.kcal : null;
  const macro = ([k, nome]) => {
    const m = metas[k];
    const pct = m ? Math.min(total[k] / m * 100, 100) : 0;
    return `
      <div class="macro m-${k}">
        <div class="macro-topo"><span>${nome}</span><b>${fmtG(total[k])}${m ? `<small> / ${fmtNum(m)} g</small>` : '<small> g</small>'}</b></div>
        <div class="macro-barra"><i style="width:${pct}%"></i></div>
        ${m ? `<small class="macro-resta">${total[k] > m ? `${fmtG(total[k] - m)} g acima` : `faltam ${fmtG(m - total[k])} g`}</small>` : ''}
      </div>`;
  };
  return `
    <div class="resumo-kcal">
      <div class="anel-area">
        ${anel(total.kcal, meta, { planejado: plano.kcal })}
        <div class="anel-texto">
          ${meta ? `<strong>${fmtKcal(Math.abs(resta))}</strong><small>${resta >= 0 ? 'restantes' : 'acima'}</small>`
            : `<strong>${fmtKcal(total.kcal)}</strong><small>kcal</small>`}
        </div>
      </div>
      <div class="resumo-numeros">
        <div><small>Consumido</small><b>${fmtKcal(total.kcal)}</b></div>
        ${plano.kcal > total.kcal + 0.5 ? `<div class="linha-plano"><small>Planejado</small><b>${fmtKcal(plano.kcal)}</b></div>` : ''}
        <button class="linha-meta" data-acao="metas"><small>Meta</small><b>${meta ? fmtKcal(meta) : 'Definir'}${Icone.editar}</b></button>
        <div><small>Fibra</small><b>${fmtG(total.fibra)} g</b></div>
        <div><small>Sódio</small><b>${fmtKcal(total.sodio)} mg</b></div>
      </div>
    </div>
    <div class="resumo-macros">${MACROS.map(macro).join('')}</div>
    ${meta && MACROS.every(([k]) => metas[k]) ? '' : `<button class="btn btn-secundario btn-pequeno btn-bloco" data-acao="metas">${Icone.editar}<span>${meta ? 'Definir metas de macros' : 'Definir metas de calorias e macros'}</span></button>`}`;
}

// Calorias da semana (barras), com a linha da meta
function cartaoSemana(semana, totais, metasDia, dia, tipos) {
  const valores = semana.map(d => totais[d].kcal);
  const metasK = semana.map(d => metasDia(d).kcal || 0);
  const teto = Math.max(...metasK, ...valores) * 1.1 || 1;
  const comDados = valores.filter(v => v > 0);
  const media = comDados.length ? comDados.reduce((a, b) => a + b, 0) / comDados.length : 0;
  return `
    <section class="cartao dieta-semana">
      <div class="cartao-cab">${Icone.progresso}<h3>Semana</h3><span class="link-cab sutil">média ${fmtKcal(media)} kcal</span></div>
      <div class="semana-grafico">
        ${semana.map((d, k) => `
          <button class="semana-barra ${d === dia ? 'ativo' : ''} ${metasK[k] && valores[k] > metasK[k] ? 'passou' : ''}" data-ir="${d}" title="${fmtKcal(valores[k])} kcal${metasK[k] ? ` de ${fmtKcal(metasK[k])}` : ''} · ${TIPOS_DIA[tipos[d].tipo]}">
            <span class="barra-area"><i style="height:${valores[k] / teto * 100}%"></i>${metasK[k] ? `<em style="bottom:${(metasK[k] / teto * 100).toFixed(1)}%"></em>` : ''}</span>
            <small>${DIAS_SEMANA[dataDe(d).getDay()]}</small><span class="tipo-mini ${tipos[d].tipo}">${tipos[d].tipo === 'treino' ? 'T' : 'off'}</span>
          </button>`).join('')}
      </div>
    </section>`;
}

// ---------- Diário ----------
// Dias que já passaram ficam só para consulta (dá para desbloquear um dia por vez)
const desbloqueados = new Set();

async function telaDieta(el, _p, query) {
  definirTitulo('Dieta');
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(query.dia || '') ? query.dia : hojeISO();
  const [config, itens, comRegistro] = await Promise.all([obterConfig(), itensDoDia(dia), diasComRegistro()]);
  const total = somar(consumidos(itens));
  const plano = somar(itens);

  // Semana do dia escolhido (segunda a domingo)
  const d0 = dataDe(dia);
  const seg = somarDias(dia, -((d0.getDay() + 6) % 7));
  const semana = Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
  const [totaisSemana, tipos] = await Promise.all([totaisPorDia(semana), tiposDosDias(semana)]);
  const todasMetas = metasDe(config, dia);
  const metasDia = d => metasDe(config, d)[tipos[d].tipo] || {};
  const tipoDia = tipos[dia];
  const metas = metasDia(dia);

  // Refeições do tipo do dia (as de outro tipo só aparecem se tiverem itens)
  const ids = new Set(config.refeicoes.map(r => r.id));
  const refeicoes = config.refeicoes.filter(r => !r.so || r.so === tipoDia.tipo || itens.some(i => i.refeicao === r.id));
  if (itens.some(i => !ids.has(i.refeicao))) refeicoes.push({ id: '__outros', nome: 'Outros' });
  const doGrupo = r => itens.filter(i => (ids.has(i.refeicao) ? i.refeicao : '__outros') === r.id);
  const planoDia = planoDe(config, tipoDia.tipo);
  const temPlano = refeicoesDoTipo(config, tipoDia.tipo).some(r => planoDia[r.id]?.length);
  const nomePlano = tipoDia.tipo === 'treino' ? 'plano de treino' : 'plano off';
  const bloqueado = dia < hojeISO() && !desbloqueados.has(dia);
  const ir = d => { location.hash = d === hojeISO() ? '#/dieta' : `#/dieta?dia=${d}`; };

  el.classList.add('tela-dieta');
  el.classList.toggle('dia-bloqueado', bloqueado);
  el.innerHTML = `
    <div class="dieta-dias">
      <div class="dieta-dia-topo">
        <button class="icon-btn" data-ir="${somarDias(dia, -1)}" aria-label="Dia anterior">${Icone.voltar}</button>
        <strong>${rotuloDia(dia)}</strong>
        <button class="icon-btn" data-ir="${somarDias(dia, 1)}" aria-label="Próximo dia">${Icone.seta}</button>
      </div>
      <div class="semana">
        ${semana.map(d => `
          <button class="semana-dia ${d === dia ? 'ativo' : ''} ${d === hojeISO() ? 'hoje' : ''} ${comRegistro.has(d) ? 'com' : ''} ${tipos[d].tipo}" data-ir="${d}" title="${TIPOS_DIA[tipos[d].tipo]}">
            <small>${DIAS_SEMANA[dataDe(d).getDay()]}</small><b>${dataDe(d).getDate()}</b><i></i>
          </button>`).join('')}
      </div>
    </div>

    <div class="dieta-grade">
      <div class="dieta-lateral">
        <section class="cartao dieta-resumo">
          <div class="resumo-topo">
            <div class="segmento tipo-dia ${bloqueado ? 'travado' : ''}" data-tipo-dia>
              ${Object.entries(TIPOS_DIA).map(([k, nome]) => `<button data-t="${k}" class="${tipoDia.tipo === k ? 'ativo' : ''}">${k === 'treino' ? Icone.treino : Icone.hoje}<span>${nome}</span></button>`).join('')}
            </div>
            <button class="icon-btn btn-editar-metas" data-acao="metas" aria-label="Editar metas" title="Editar metas">${Icone.editar}</button>
          </div>
          
          ${blocoResumo(total, metas, plano)}
        </section>
        <nav class="dieta-atalhos">
          <button class="chip" data-acao="metas">${Icone.medidor}<span>Metas</span></button>
          <a class="chip" href="#/dieta/alimentos">${Icone.dieta}<span>Meus alimentos</span></a>
          <a class="chip" href="#/dieta/refeicoes">${Icone.copiar}<span>Refeições</span></a>
          ${bloqueado || (!itens.length && temPlano) ? '' : `<button class="chip" data-acao="plano">${Icone.check}<span>Aplicar ${nomePlano}</span></button>`}
          ${!itens.length && !bloqueado ? `<button class="chip" data-acao="copiar-dia">${Icone.historico}<span>Copiar dia anterior</span></button>` : ''}
        </nav>
        ${cartaoSemana(semana, totaisSemana, metasDia, dia, tipos)}
      </div>

      <div class="dieta-refeicoes">
        ${bloqueado ? `<div class="aviso-bloqueado">${Icone.historico}<span><strong>Dia encerrado</strong><small>Só para consulta. A dieta de dias passados não é editada.</small></span><button class="btn btn-secundario btn-pequeno" data-acao="desbloquear">Desbloquear</button></div>` : ''}
        ${!itens.length && temPlano && !bloqueado ? `<button class="btn btn-primario btn-bloco btn-aplicar-plano" data-acao="plano">${Icone.check}<span>Aplicar ${nomePlano}</span></button>` : ''}
        <div class="dieta-colunas" aria-hidden="true"><span>Alimento</span><span>Quantidade</span><span>Proteína</span><span>Carbo</span><span>Gordura</span><span>kcal</span><span></span></div>
        ${refeicoes.map(r => {
          const lista = doGrupo(r);
          const t = somar(lista);
          const feita = refeicaoFeita(lista);
          return `
          <article class="cartao refeicao ${lista.length ? (feita ? 'feita' : 'planejada') : ''}" data-ref="${esc(r.id)}">
            <div class="refeicao-topo">
              <div class="refeicao-titulo">
                <div class="refeicao-nome">
                  ${lista.length && bloqueado ? `<span class="check-ref ${feita ? 'ativo' : ''}" aria-label="${feita ? 'Feita' : 'Não feita'}">${Icone.check}</span>` : ''}
                  ${lista.length && !bloqueado ? `<button class="check-ref ${feita ? 'ativo' : ''}" data-acao="feita" aria-pressed="${feita}" title="${feita ? 'Feita · toque para desmarcar' : 'Marcar como feita'}">${Icone.check}</button>` : ''}
                  <h3>${esc(r.nome)}</h3>
                  ${lista.length ? `<span class="estado-ref">${feita ? 'Feita' : 'Planejada'}</span>` : ''}
                </div>
                ${lista.length ? linhaMacros(t) : ''}
              </div>
              ${lista.length ? `<span class="col col-qtd">${lista.length} ${lista.length === 1 ? 'item' : 'itens'}</span><span class="col m-p">${fmtG(t.p)} g</span><span class="col m-c">${fmtG(t.c)} g</span><span class="col m-g">${fmtG(t.g)} g</span>` : '<span class="col col-vazia">Nada registrado</span>'}
              <span class="refeicao-kcal">${lista.length ? `${fmtKcal(t.kcal)}<small>kcal</small>` : ''}</span>
              ${bloqueado ? '' : `<button class="icon-btn" data-acao="menu-ref" aria-label="Opções da refeição">${Icone.pontos}</button>`}
            </div>
            ${lista.length ? `<ul class="refeicao-itens">${lista.map(i => {
              const v = calcular(i.alimento.n, i.gramas);
              return `<li><button data-item="${i.id}">
                <span class="item-texto"><strong>${esc(i.alimento.nome)}</strong><small>${fmtQtd(i)} · P ${fmtG(v.p)} · C ${fmtG(v.c)} · G ${fmtG(v.g)}</small></span>
                <span class="col col-qtd">${fmtQtd(i)}</span><span class="col">${fmtG(v.p)}</span><span class="col">${fmtG(v.c)}</span><span class="col">${fmtG(v.g)}</span>
                <b>${fmtKcal(v.kcal)}</b><span class="col col-seta">${Icone.editar}</span></button></li>`;
            }).join('')}</ul>` : ''}
            ${r.id === '__outros' || bloqueado ? '' : `<button class="btn-add-alimento" data-acao="add">${Icone.mais}<span>Adicionar alimento</span></button>`}
          </article>`;
        }).join('')}
      </div>
    </div>`;

  const recarregar = () => telaDieta(el, _p, query);
  el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => ir(b.dataset.ir));
  el.querySelector('[data-acao=desbloquear]')?.addEventListener('click', () => { desbloqueados.add(dia); recarregar(); });
  el.querySelector('[data-tipo-dia]').addEventListener('click', async e => {
    if (bloqueado) return;
    const b = e.target.closest('[data-t]'); if (!b || (b.dataset.t === tipoDia.tipo && tipoDia.manual)) return;
    await marcarTipoDia(dia, b.dataset.t);
    recarregar();
  });
  el.querySelectorAll('[data-acao=metas]').forEach(b => b.onclick = async () => {
    const peso = (await pesoAtual())?.valor;
    const desde = dataDe(dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const novas = await formularioMetas(todasMetas, peso, tipoDia.tipo, `Vale a partir de ${dia === hojeISO() ? 'hoje' : desde}. Os dias anteriores mantêm as metas que tinham.`);
    if (novas) { await salvarConfig(comMetas(config, novas, dia)); toast(`Metas salvas a partir de ${desde}`, 'sucesso'); recarregar(); }
  });
  el.querySelectorAll('[data-acao=plano]').forEach(b => b.onclick = async () => {
    const tipo = tipoDia.tipo;
    if (!temPlano) {
      if (await confirmar(`O ${nomePlano} ainda está vazio. Montar agora?`, { ok: 'Montar plano' })) location.hash = `#/dieta/refeicoes?plano=${tipo}`;
      return;
    }
    let substituir = false;
    if (itens.length) {
      const op = await menu(`Aplicar ${nomePlano}`, [
        { texto: 'Preencher só as refeições vazias', valor: 'vazias', icone: Icone.mais },
        { texto: 'Substituir as refeições não feitas', valor: 'substituir', icone: Icone.copiar },
        { texto: `Salvar este dia como ${nomePlano}`, valor: 'salvar', icone: Icone.editar },
      ]);
      if (!op) return;
      if (op === 'salvar') {
        // só as refeições com itens neste dia; as vazias mantêm o que já estava no plano
        if (!await confirmar(`Salvar as refeições deste dia no ${nomePlano}? As refeições vazias hoje continuam como estão no plano.`, { ok: 'Salvar plano' })) return;
        let c = config;
        for (const r of refeicoesDoTipo(config, tipo)) if (doGrupo(r).length) c = comPlano(c, tipo, r.id, doGrupo(r));
        await salvarConfig(c); toast(`${nomePlano[0].toUpperCase()}${nomePlano.slice(1)} atualizado`, 'sucesso'); recarregar();
        return;
      }
      substituir = op === 'substituir';
    }
    const n = await aplicarPlano(config, tipo, dia, { substituir });
    toast(n ? `${n} ${n === 1 ? 'refeição planejada' : 'refeições planejadas'}` : 'Nenhuma refeição para preencher', n ? 'sucesso' : undefined);
    recarregar();
  });
  el.querySelector('[data-acao=copiar-dia]')?.addEventListener('click', async () => {
    const ontem = await itensDoDia(somarDias(dia, -1));
    if (!ontem.length) { toast('O dia anterior não tem registros'); return; }
    for (const i of ontem) { const { id, created_at, updated_at, feito, ...resto } = i; await salvarItem({ ...resto, dia }); }
    toast(`${ontem.length} ${ontem.length === 1 ? 'item copiado' : 'itens copiados'}`, 'sucesso'); recarregar();
  });

  el.querySelectorAll('.refeicao').forEach(card => {
    const ref = refeicoes.find(r => r.id === card.dataset.ref);
    card.querySelector('[data-acao=feita]')?.addEventListener('click', async () => {
      const lista = doGrupo(ref);
      const feita = !refeicaoFeita(lista);
      await marcarRefeicaoFeita(lista, feita);
      if (feita) toast(`${esc(ref.nome)} feita`, 'sucesso', 1400);
      recarregar();
    });
    card.querySelector('[data-acao=add]')?.addEventListener('click', async () => {
      const n = await adicionarAlimentos({ dia, refeicao: ref, feito: refeicaoFeita(doGrupo(ref)) });
      if (n) recarregar();
    });
    if (bloqueado) return;
    card.querySelectorAll('[data-item]').forEach(b => b.onclick = async () => {
      const item = itens.find(i => i.id === b.dataset.item);
      const r = await escolherQuantidade(item.alimento, {
        gramas: item.gramas, porcao: item.porcao, refeicoes: config.refeicoes, refeicao: ids.has(item.refeicao) ? item.refeicao : config.refeicoes[0]?.id,
        botao: 'Salvar', remover: true,
      });
      if (!r) return;
      if (r.remover) { await excluirItem(item.id); toast('Item removido'); }
      else await salvarItem({ ...item, gramas: r.gramas, porcao: r.porcao, refeicao: r.refeicao, alimento: r.alimento === item.alimento ? item.alimento : copiaAlimento(r.alimento) });
      recarregar();
    });
    card.querySelector('[data-acao=menu-ref]')?.addEventListener('click', async () => {
      const lista = doGrupo(ref);
      const op = await menu(ref.nome, [
        ...(ref.id !== '__outros' && planoDia[ref.id]?.length && !refeicaoFeita(lista) ? [{ texto: `Usar o ${nomePlano}`, valor: 'usar-plano', icone: Icone.check }] : []),
        ...(lista.length && ref.id !== '__outros' ? [{ texto: `Salvar no ${nomePlano}`, valor: 'salvar-plano', icone: Icone.editar }] : []),
        ...(lista.length ? [{ texto: 'Salvar como refeição pronta', valor: 'salvar', icone: Icone.copiar }] : []),
        ...(ref.id !== '__outros' ? [{ texto: 'Copiar do dia anterior', valor: 'copiar', icone: Icone.historico }] : []),
        ...(ref.id !== '__outros' ? [{ texto: 'Renomear', valor: 'renomear', icone: Icone.editar }] : []),
        ...(lista.length ? [{ texto: 'Limpar refeição', valor: 'limpar', icone: Icone.lixo, perigo: true }] : []),
      ]);
      if (op === 'usar-plano') {
        if (lista.length && !await confirmar(`Trocar os itens de ${esc(ref.nome)} pelo ${nomePlano}?`, { ok: 'Trocar' })) return;
        await aplicarPlano(config, tipoDia.tipo, dia, { substituir: true, so: ref.id });
        recarregar();
      } else if (op === 'salvar-plano') {
        await salvarConfig(comPlano(config, tipoDia.tipo, ref.id, lista));
        toast(`${esc(ref.nome)} salvo no ${nomePlano}`, 'sucesso');
      } else if (op === 'salvar') {
        const nome = await pedirTexto('Nome da refeição pronta', ref.nome, { placeholder: 'Ex.: Café padrão' });
        if (!nome) return;
        await salvarRefeicaoSalva({ nome, itens: lista.map(i => ({ alimento: copiaAlimento(i.alimento), gramas: i.gramas, porcao: i.porcao })) });
        toast('Refeição salva. Use em "Refeições salvas" ao adicionar.', 'sucesso');
      } else if (op === 'copiar') {
        const ant = (await itensDoDia(somarDias(dia, -1))).filter(i => i.refeicao === ref.id);
        if (!ant.length) { toast(`Nada em ${ref.nome} no dia anterior`); return; }
        for (const i of ant) { const { id, created_at, updated_at, feito, ...resto } = i; await salvarItem({ ...resto, dia }); }
        toast(`${ant.length} ${ant.length === 1 ? 'item copiado' : 'itens copiados'}`, 'sucesso'); recarregar();
      } else if (op === 'renomear') {
        const nome = await pedirTexto('Renomear refeição', ref.nome);
        if (!nome) return;
        await salvarConfig({ ...config, refeicoes: config.refeicoes.map(r => (r.id === ref.id ? { ...r, nome } : r)) });
        recarregar();
      } else if (op === 'limpar' && await confirmar(`Remover os ${lista.length} itens de ${esc(ref.nome)}?`, { ok: 'Limpar', perigo: true })) {
        for (const i of lista) await excluirItem(i.id);
        recarregar();
      }
    });
  });
}

// Busca + quantidade para uma refeição do dia. Retorna quantos itens entraram.
// feito: a refeição já está marcada como feita, então o que entrar também está.
async function adicionarAlimentos({ dia, refeicao, feito = false }) {
  let ordem = Date.now();
  return escolherAlimentos({
    titulo: `Adicionar em ${refeicao.nome}`,
    refeicaoNome: refeicao.nome,
    aoEscolher: async (alimento) => {
      const r = await escolherQuantidade(alimento, alimento.ultimaQtd ? { gramas: alimento.ultimaQtd, porcao: alimento.ultimaPorcao } : {});
      if (!r) return false;
      await salvarItem({ ...novoItem(r.alimento, r.gramas, { dia, refeicao: refeicao.id, porcao: r.porcao }), feito, ordem: ordem++ });
      toast(`${esc(r.alimento.nome.split(',')[0])} adicionado`, 'sucesso', 1400);
      return true;
    },
    aoEscolherRefeicao: async (salva) => {
      for (const i of salva.itens) await salvarItem({ ...novoItem(i.alimento, i.gramas, { dia, refeicao: refeicao.id, porcao: i.porcao }), feito, ordem: ordem++ });
      toast(`${esc(salva.nome)} adicionada`, 'sucesso', 1400);
      return true;
    },
  });
}

// ---------- Meus alimentos ----------
async function telaAlimentos(el) {
  definirTitulo('Meus alimentos', { voltar: '#/dieta' });
  const lista = await listarMeusAlimentos();
  el.innerHTML = `
    <button class="btn btn-primario btn-bloco" data-acao="novo">${Icone.mais}<span>Criar alimento</span></button>
    <p class="sutil pequeno">Cadastre o que não está nas tabelas (suplementos, marcas, receitas suas). Para ajustar um alimento das tabelas, abra-o na busca e toque em "Personalizar".</p>
    ${lista.length ? `<div class="lista-exercicios">${lista.map(a => `
      <button class="item-exercicio" data-id="${a.id}">
        <span class="item-texto"><strong>${esc(a.nome)}${a.marca ? ` <small class="marca-alim">${esc(a.marca)}</small>` : ''}</strong>
        <small>${a.porcoes?.[0] ? `${esc(a.porcoes[0].nome)} (${fmtNum(a.porcoes[0].gramas)} g) · ` : ''}100 g: ${fmtKcal(a.n.kcal)} kcal · P ${fmtG(a.n.p || 0)} · C ${fmtG(a.n.c || 0)} · G ${fmtG(a.n.g || 0)}</small></span>
        ${Icone.seta}
      </button>`).join('')}</div>` : vazio(Icone.dieta, 'Nenhum alimento personalizado', 'Ex.: whey protein, pão da sua padaria, uma receita que você sempre faz.')}`;
  el.querySelector('[data-acao=novo]').onclick = async () => { if (await formularioAlimento()) telaAlimentos(el); };
  el.querySelectorAll('[data-id]').forEach(b => b.onclick = async () => {
    const a = lista.find(x => x.id === b.dataset.id);
    const op = await menu(a.nome, [
      { texto: 'Editar', valor: 'editar', icone: Icone.editar },
      { texto: 'Duplicar', valor: 'duplicar', icone: Icone.copiar },
      { texto: 'Excluir', valor: 'excluir', icone: Icone.lixo, perigo: true },
    ]);
    if (op === 'editar' && await formularioAlimento(a)) telaAlimentos(el);
    if (op === 'duplicar') { const { id, created_at, fonte, ref, ...resto } = clone(a); await salvarAlimento({ ...resto, nome: `${a.nome} (cópia)` }); telaAlimentos(el); }
    if (op === 'excluir' && await confirmar(`Excluir "${esc(a.nome)}"? O que já foi registrado no diário continua igual.`, { ok: 'Excluir', perigo: true })) {
      await excluirAlimento(a.id); toast('Alimento excluído'); telaAlimentos(el);
    }
  });
}

// ---------- Planos (dia de treino x dia off) e refeições salvas ----------
const NOME_PLANO = { treino: 'Dia de treino', off: 'Dia off' };

// Refeição salva que combina com uma refeição do plano: no plano off, prefere a
// que tem "off" no nome ("Almoço Dia Off"); no de treino, a de nome igual.
function salvaParaPlano(salvas, nomeRef, tipo) {
  const alvo = normalizar(nomeRef);
  const n = x => normalizar(x.nome);
  const temOff = x => /\boff\b/.test(n(x));
  const contem = salvas.filter(x => n(x).includes(alvo));
  if (tipo === 'off') return contem.find(temOff) || contem.find(x => n(x) === alvo) || null;
  return contem.find(x => n(x) === alvo) || contem.find(x => !temOff(x)) || null;
}

async function telaRefeicoes(el, _p, query = {}) {
  definirTitulo('Refeições', { voltar: '#/dieta' });
  const [config, salvas, tipos] = await Promise.all([obterConfig(), listarRefeicoesSalvas(), tiposDosDias([hojeISO()])]);
  const tipo = query.plano === 'off' || query.plano === 'treino' ? query.plano : tipos[hojeISO()].tipo;
  const plano = planoDe(config, tipo);
  const doTipo = refeicoesDoTipo(config, tipo);
  const total = somar(doTipo.flatMap(r => plano[r.id] || []));
  const meta = metasDe(config)[tipo] || {};
  const vazias = doTipo.filter(r => !plano[r.id]?.length && salvaParaPlano(salvas, r.nome, tipo));

  el.innerHTML = `
    <div class="segmento tipo-dia plano-tipo" data-plano-tipo>
      ${Object.entries(NOME_PLANO).map(([k, nome]) => `<button data-t="${k}" class="${tipo === k ? 'ativo' : ''}">${k === 'treino' ? Icone.treino : Icone.hoje}<span>${nome}</span></button>`).join('')}
    </div>
    <h2 class="secao">Plano · ${NOME_PLANO[tipo]}</h2>
    <p class="sutil pequeno">As refeições e alimentos que o botão "Aplicar plano", na Dieta, coloca no dia como planejados. Toque numa refeição para montar.</p>
    <section class="cartao plano-total">
      <div class="refeicao-topo"><div class="refeicao-titulo"><h3>Total do plano</h3>${linhaMacros(total)}</div><span class="refeicao-kcal">${fmtKcal(total.kcal)}<small>${meta.kcal ? ` / ${fmtKcal(meta.kcal)} kcal` : 'kcal'}</small></span></div>
    </section>
    <div class="cartao lista-simples">
      ${doTipo.map((r, i) => {
        const itens = plano[r.id] || [];
        const t = somar(itens);
        return `
        <div class="linha-lista linha-refeicao" data-id="${esc(r.id)}">
          <a class="item-texto" href="#/dieta/plano/${tipo}/${encodeURIComponent(r.id)}"><strong>${esc(r.nome)}${r.so ? ` <small class="selo-so">só ${r.so === 'treino' ? 'treino' : 'off'}</small>` : ''}</strong>
            <small>${itens.length ? `${fmtKcal(t.kcal)} kcal · ${itens.map(x => esc(x.alimento.nome.split(/[,(]/)[0].trim())).join(' · ')}` : 'Sem alimentos no plano · toque para montar'}</small></a>
          <button class="icon-btn" data-mover="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${Icone.cima}</button>
          <button class="icon-btn" data-mover="1" ${i === doTipo.length - 1 ? 'disabled' : ''} aria-label="Descer">${Icone.baixo}</button>
          <button class="icon-btn" data-acao="op" aria-label="Opções">${Icone.pontos}</button>
        </div>`;
      }).join('')}
    </div>
    ${vazias.length ? `<button class="btn btn-secundario btn-bloco" data-acao="preencher">${Icone.copiar}<span>Preencher com as refeições salvas (${vazias.length})</span></button>` : ''}
    <button class="btn btn-secundario btn-bloco" data-acao="nova-ref">${Icone.mais}<span>Nova refeição do dia</span></button>

    <h2 class="secao">Refeições salvas <small>${salvas.length}</small></h2>
    <p class="sutil pequeno">Combinações prontas para adicionar com um toque (ex.: "Café padrão").</p>
    ${salvas.length ? `<div class="grade-cartoes">${salvas.map(x => {
      const t = somar(x.itens);
      return `<a class="cartao refeicao-salva" href="#/dieta/refeicao/${x.id}">
        <div class="refeicao-topo"><div class="refeicao-titulo"><h3>${esc(x.nome)}</h3>${linhaMacros(t)}</div><span class="refeicao-kcal">${fmtKcal(t.kcal)}<small>kcal</small></span></div>
        <p class="sutil pequeno">${x.itens.map(i => esc(i.alimento.nome.split(',')[0])).join(' · ')}</p>
      </a>`;
    }).join('')}</div>` : ''}
    <a class="btn btn-secundario btn-bloco" href="#/dieta/refeicao/nova">${Icone.mais}<span>Criar refeição salva</span></a>`;

  const recarregar = () => telaRefeicoes(el, _p, { plano: tipo });
  const salvar = async refs => { await salvarConfig({ ...config, refeicoes: refs }); recarregar(); };
  el.querySelector('[data-plano-tipo]').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b && b.dataset.t !== tipo) location.replace(`#/dieta/refeicoes?plano=${b.dataset.t}`);
  });
  el.querySelector('[data-acao=preencher]')?.addEventListener('click', async () => {
    let c = config;
    for (const r of vazias) c = comPlano(c, tipo, r.id, salvaParaPlano(salvas, r.nome, tipo).itens);
    await salvarConfig(c);
    toast(`${vazias.length} ${vazias.length === 1 ? 'refeição preenchida' : 'refeições preenchidas'}`, 'sucesso');
    recarregar();
  });
  el.querySelector('[data-acao=nova-ref]').onclick = async () => {
    const nome = await pedirTexto('Nova refeição do dia', '', { placeholder: 'Ex.: Pós-treino', ok: 'Criar' });
    if (!nome) return;
    await salvar([...config.refeicoes, { id: `r${Date.now().toString(36)}`, nome, so: tipo }]);
    toast(`Criada só para ${NOME_PLANO[tipo].toLowerCase()}. Dá para mudar no menu dela.`);
  };
  el.querySelectorAll('.linha-refeicao').forEach(linha => {
    const r = config.refeicoes.find(x => x.id === linha.dataset.id);
    const pos = doTipo.indexOf(r);
    linha.querySelectorAll('[data-mover]').forEach(b => b.onclick = () => {
      // troca com a vizinha visível neste plano (na lista geral de refeições)
      const outra = doTipo[pos + +b.dataset.mover];
      const refs = [...config.refeicoes];
      const i = refs.indexOf(r), j = refs.indexOf(outra);
      [refs[i], refs[j]] = [refs[j], refs[i]];
      salvar(refs);
    });
    linha.querySelector('[data-acao=op]').onclick = async () => {
      const op = await menu(r.nome, [
        { texto: 'Montar plano', valor: 'plano', icone: Icone.dieta },
        { texto: 'Renomear', valor: 'renomear', icone: Icone.editar },
        { texto: 'Horário', valor: 'horario', icone: Icone.timer },
        { texto: `Aparece em: ${r.so ? `só ${NOME_PLANO[r.so].toLowerCase()}` : 'treino e off'}`, valor: 'tipos', icone: Icone.hoje },
        ...(plano[r.id]?.length ? [{ texto: 'Limpar o plano desta refeição', valor: 'limpar', icone: Icone.lixo }] : []),
        ...(config.refeicoes.length > 1 ? [{ texto: 'Excluir', valor: 'excluir', icone: Icone.lixo, perigo: true }] : []),
      ]);
      if (op === 'plano') location.hash = `#/dieta/plano/${tipo}/${encodeURIComponent(r.id)}`;
      if (op === 'renomear') { const nome = await pedirTexto('Renomear refeição', r.nome); if (nome) salvar(config.refeicoes.map(x => (x === r ? { ...x, nome } : x))); }
      if (op === 'tipos') {
        const so = await menu(`${r.nome} aparece em`, [
          { texto: 'Dia de treino e dia off', valor: 'ambos', icone: Icone.check },
          { texto: 'Só em dia de treino', valor: 'treino', icone: Icone.treino },
          { texto: 'Só em dia off', valor: 'off', icone: Icone.hoje },
        ]);
        if (so) salvar(config.refeicoes.map(x => (x === r ? { ...x, so: so === 'ambos' ? undefined : so } : x)));
      }
      if (op === 'limpar') { await salvarConfig(comPlano(config, tipo, r.id, [])); recarregar(); }
      if (op === 'horario') {
        const h = await folha({
          titulo: `Horário · ${r.nome}`, classe: 'modal-pequeno',
          conteudo: `<p class="sutil pequeno">Usado para saber qual é a próxima refeição na tela Hoje.</p><input class="campo campo-hora" type="time" id="hora-ref" value="${esc(r.horario || '')}">`,
          acoes: [
            { texto: 'Sem horário', classe: 'btn-secundario', valor: '' },
            { texto: 'Salvar', classe: 'btn-primario', acao: c => c.querySelector('#hora-ref').value || '' },
          ],
        });
        if (h !== undefined) salvar(config.refeicoes.map(x => (x === r ? { ...x, horario: h } : x)));
      }
      if (op === 'excluir' && await confirmar(`Excluir "${esc(r.nome)}"? Itens já registrados nela aparecem em "Outros".`, { ok: 'Excluir', perigo: true })) salvar(config.refeicoes.filter(x => x !== r));
    };
  });
}

// Montar o plano de uma refeição (dia de treino ou off)
async function telaPlanoRefeicao(el, { tipo, ref }) {
  const config = await obterConfig();
  const refeicao = config.refeicoes.find(r => r.id === decodeURIComponent(ref));
  if (!refeicao || !NOME_PLANO[tipo]) { location.replace('#/dieta/refeicoes'); return; }
  const voltar = `#/dieta/refeicoes?plano=${tipo}`;
  definirTitulo(`${refeicao.nome} · ${tipo === 'treino' ? 'treino' : 'off'}`, { voltar });
  const itens = clone(planoDe(config, tipo)[refeicao.id] || []);

  const desenhar = () => {
    const t = somar(itens);
    el.innerHTML = `
      <p class="sutil pequeno">Plano de <strong>${esc(refeicao.nome)}</strong> no ${NOME_PLANO[tipo].toLowerCase()}. Entra no dia como planejado quando você usa "Aplicar plano".</p>
      <section class="cartao">
        <div class="refeicao-topo"><div class="refeicao-titulo"><h3>Total</h3>${linhaMacros(t)}</div><span class="refeicao-kcal">${fmtKcal(t.kcal)}<small>kcal</small></span></div>
        ${barraMacros(t)}
        ${itens.length ? `<ul class="refeicao-itens">${itens.map((i, k) => {
          const v = calcular(i.alimento.n, i.gramas);
          return `<li><button data-k="${k}"><span class="item-texto"><strong>${esc(i.alimento.nome)}</strong><small>${fmtQtd(i)} · P ${fmtG(v.p)} · C ${fmtG(v.c)} · G ${fmtG(v.g)}</small></span><b>${fmtKcal(v.kcal)}</b></button></li>`;
        }).join('')}</ul>` : '<p class="sutil">Adicione alimentos ou uma refeição salva.</p>'}
        <button class="btn-add-alimento" data-acao="add">${Icone.mais}<span>Adicionar alimento</span></button>
      </section>
      <div class="rodape-acoes">
        ${itens.length ? `<button class="btn btn-secundario perigo" data-acao="limpar">${Icone.lixo}<span>Limpar</span></button>` : '<span></span>'}
        <button class="btn btn-primario" data-acao="salvar">Salvar plano</button>
      </div>`;
    el.querySelector('[data-acao=add]').onclick = async () => {
      await escolherAlimentos({
        titulo: `Plano · ${refeicao.nome}`,
        refeicaoNome: refeicao.nome,
        aoEscolher: async (alimento) => {
          const q = await escolherQuantidade(alimento, alimento.ultimaQtd ? { gramas: alimento.ultimaQtd, porcao: alimento.ultimaPorcao } : {});
          if (!q) return false;
          itens.push({ alimento: copiaAlimento(q.alimento), gramas: q.gramas, porcao: q.porcao });
          return true;
        },
        aoEscolherRefeicao: async (salva) => {
          itens.push(...salva.itens.map(i => ({ alimento: copiaAlimento(i.alimento), gramas: i.gramas, porcao: i.porcao })));
          toast(`${esc(salva.nome)} adicionada`, 'sucesso', 1400);
          return true;
        },
      });
      desenhar();
    };
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
      const i = itens[+b.dataset.k];
      const q = await escolherQuantidade(i.alimento, { gramas: i.gramas, porcao: i.porcao, botao: 'Salvar', remover: true });
      if (!q) return;
      if (q.remover) itens.splice(+b.dataset.k, 1); else Object.assign(i, { gramas: q.gramas, porcao: q.porcao, alimento: q.alimento === i.alimento ? i.alimento : copiaAlimento(q.alimento) });
      desenhar();
    });
    el.querySelector('[data-acao=limpar]')?.addEventListener('click', () => { itens.length = 0; desenhar(); });
    el.querySelector('[data-acao=salvar]').onclick = async () => {
      await salvarConfig(comPlano(await obterConfig(), tipo, refeicao.id, itens));
      toast('Plano salvo', 'sucesso');
      location.hash = voltar;
    };
  };
  desenhar();
}

async function telaRefeicaoSalva(el, { id }) {
  const lista = await listarRefeicoesSalvas();
  const original = id === 'nova' ? null : lista.find(r => r.id === id);
  if (id !== 'nova' && !original) { location.replace('#/dieta/refeicoes'); return; }
  const r = original ? clone(original) : { nome: '', itens: [] };
  definirTitulo(original ? 'Refeição salva' : 'Nova refeição salva', { voltar: '#/dieta/refeicoes' });

  const desenhar = () => {
    const t = somar(r.itens);
    el.innerHTML = `
      <input class="campo campo-titulo" data-nome placeholder="Nome (ex.: Café padrão)" value="${esc(r.nome)}">
      <section class="cartao">
        <div class="refeicao-topo"><div class="refeicao-titulo"><h3>Total</h3>${linhaMacros(t)}</div><span class="refeicao-kcal">${fmtKcal(t.kcal)}<small>kcal</small></span></div>
        ${barraMacros(t)}
        ${r.itens.length ? `<ul class="refeicao-itens">${r.itens.map((i, k) => {
          const v = calcular(i.alimento.n, i.gramas);
          return `<li><button data-k="${k}"><span class="item-texto"><strong>${esc(i.alimento.nome)}</strong><small>${fmtQtd(i)} · P ${fmtG(v.p)} · C ${fmtG(v.c)} · G ${fmtG(v.g)}</small></span><b>${fmtKcal(v.kcal)}</b></button></li>`;
        }).join('')}</ul>` : '<p class="sutil">Adicione os alimentos desta refeição.</p>'}
        <button class="btn-add-alimento" data-acao="add">${Icone.mais}<span>Adicionar alimento</span></button>
      </section>
      <div class="rodape-acoes">
        ${original ? `<button class="btn btn-secundario perigo" data-acao="excluir">${Icone.lixo}<span>Excluir</span></button>` : '<span></span>'}
        <button class="btn btn-primario" data-acao="salvar">Salvar</button>
      </div>`;
    el.querySelector('[data-nome]').oninput = e => { r.nome = e.target.value; };
    el.querySelector('[data-acao=add]').onclick = async () => {
      await escolherAlimentos({
        titulo: 'Adicionar à refeição',
        aoEscolher: async (alimento) => {
          const q = await escolherQuantidade(alimento, alimento.ultimaQtd ? { gramas: alimento.ultimaQtd, porcao: alimento.ultimaPorcao } : {});
          if (!q) return false;
          r.itens.push({ alimento: copiaAlimento(q.alimento), gramas: q.gramas, porcao: q.porcao });
          return true;
        },
      });
      desenhar();
    };
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
      const i = r.itens[+b.dataset.k];
      const q = await escolherQuantidade(i.alimento, { gramas: i.gramas, porcao: i.porcao, botao: 'Salvar', remover: true });
      if (!q) return;
      if (q.remover) r.itens.splice(+b.dataset.k, 1); else Object.assign(i, { gramas: q.gramas, porcao: q.porcao, alimento: q.alimento === i.alimento ? i.alimento : copiaAlimento(q.alimento) });
      desenhar();
    });
    el.querySelector('[data-acao=salvar]').onclick = async () => {
      if (!r.nome.trim()) { toast('Dê um nome à refeição', 'erro'); return; }
      if (!r.itens.length) { toast('Adicione pelo menos um alimento', 'erro'); return; }
      await salvarRefeicaoSalva({ ...r, nome: r.nome.trim() });
      toast('Refeição salva', 'sucesso');
      location.hash = '#/dieta/refeicoes';
    };
    el.querySelector('[data-acao=excluir]')?.addEventListener('click', async () => {
      if (await confirmar(`Excluir "${esc(original.nome)}"?`, { ok: 'Excluir', perigo: true })) { await excluirRefeicaoSalva(original.id); location.hash = '#/dieta/refeicoes'; }
    });
  };
  desenhar();
}

// Nome resumido: sem parênteses e só as duas primeiras palavras
// ("Queijo, muçarela (média de...)" -> "Queijo, muçarela")
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'em', 'a', 'o', 'ao', 'na', 'no', 'para', 'sem']);
const nomeCurto = n => {
  const palavras = n.replace(/\s*\(.*?\)/g, '').trim().split(/\s+/), out = [];
  let fortes = 0;
  for (const w of palavras) { out.push(w); if (!CONECTIVOS.has(w.toLowerCase().replace(/[,;.]$/, '')) && ++fortes === 2) break; }
  while (out.length > 1 && CONECTIVOS.has(out[out.length - 1].toLowerCase())) out.pop();
  return out.join(' ').replace(/[,;.]$/, '') || n;
};

// ---------- Cartão "Próxima refeição" (primeiro da tela Hoje) ----------
// Mostra a primeira refeição ainda não feita. Já planejada: um toque marca como
// feita. Vazia: repetir a última vez ou adicionar.
async function cartaoProximaRefeicao(el) {
  const hoje = hojeISO();
  const [config, itens, tipos] = await Promise.all([obterConfig(), itensDoDia(hoje), tiposDosDias([hoje])]);
  const tipo = tipos[hoje].tipo;
  const refsDia = config.refeicoes.filter(r => !r.so || r.so === tipo || itens.some(i => i.refeicao === r.id));
  const prox = proximaRefeicao(refsDia, itens);
  const metas = metasDe(config)[tipo] || {};
  const t = somar(consumidos(itens));
  const redesenhar = () => cartaoProximaRefeicao(el);

  if (!prox) {
    el.innerHTML = `
      <a class="cartao cartao-proxima" href="#/dieta">
        <div class="cartao-cab">${Icone.dieta}<h3>Próxima refeição</h3></div>
        <p class="proxima-nome">Todas as refeições feitas ${Icone.check}</p>
        <p class="sutil">${fmtKcal(t.kcal)} kcal${metas.kcal ? ` de ${fmtKcal(metas.kcal)}` : ''} · P ${fmtG(t.p)} · C ${fmtG(t.c)} · G ${fmtG(t.g)}</p>
      </a>`;
    return;
  }
  const planejados = itens.filter(i => i.refeicao === prox.id);
  const doPlano = planejados.length ? null : planoDe(config, tipo)[prox.id];
  const ultima = planejados.length || doPlano?.length ? null : await ultimaVezDaRefeicao(prox.id, hoje);
  const mostrar = planejados.length ? planejados : doPlano?.length ? doPlano : ultima?.itens;
  const tm = mostrar ? somar(mostrar) : null;
  const atrasada = refeicaoAtrasada(prox);
  const lista = mostrar ? `
    <div class="proxima-ultima">
      <small>${planejados.length ? 'Planejado' : doPlano?.length ? `No ${tipo === 'treino' ? 'plano de treino' : 'plano off'}` : `Última vez · ${rotuloDia(ultima.dia).toLowerCase()}`} · ${fmtKcal(tm.kcal)} kcal · P ${fmtG(tm.p)} · C ${fmtG(tm.c)} · G ${fmtG(tm.g)}</small>
      <ul>${mostrar.slice(0, 6).map(i => `<li><b>${fmtQtd(i)}</b><span>${esc(nomeCurto(i.alimento.nome))}</span></li>`).join('')}${mostrar.length > 6 ? `<li class="sutil">+ ${mostrar.length - 6} itens</li>` : ''}</ul>
    </div>` : '';
  // Planejada: só as informações (marcar como feita fica na aba Dieta)
  const acoes = planejados.length ? '' : doPlano?.length ? `<button class="btn btn-primario" data-acao="usar-plano">${Icone.check}<span>Usar o plano</span></button>
       <button class="btn btn-secundario" data-acao="add">${Icone.mais}<span>Adicionar</span></button>` : `${ultima ? `<button class="btn btn-primario" data-acao="repetir">${Icone.copiar}<span>Repetir</span></button>` : ''}
       <button class="btn ${ultima ? 'btn-secundario' : 'btn-primario'}" data-acao="add">${Icone.mais}<span>${ultima ? 'Adicionar' : 'Adicionar alimento'}</span></button>`;
  const tag = planejados.length ? 'a' : 'section';
  el.innerHTML = `
    <${tag} class="cartao cartao-proxima ${planejados.length ? 'so-info' : ''}" ${planejados.length ? 'href="#/dieta"' : ''}>
      <div class="cartao-cab">${Icone.dieta}<h3>Próxima refeição</h3>${prox.horario ? `<span class="link-cab hora-pill ${atrasada ? 'atrasada' : ''}">${Icone.timer}${atrasada ? 'Atrasada · ' : ''}${esc(prox.horario)}</span>` : ''}</div>
      <div class="proxima-corpo">
        <div class="proxima-info">
          <div class="proxima-titulo">
            ${planejados.length ? `<button class="check-ref check-prox" data-acao="feita" aria-pressed="false" title="Marcar como feita" aria-label="Marcar ${esc(prox.nome)} como feita">${Icone.check}</button>` : ''}
            <p class="proxima-nome">${esc(prox.nome)}</p>
          </div>
          ${lista}
        </div>
        ${acoes ? `<div class="proxima-acoes">${acoes}</div>` : ''}
      </div>
    </${tag}>`;
  el.querySelector('[data-acao=feita]')?.addEventListener('click', async ev => {
    ev.preventDefault(); ev.stopPropagation();
    ev.currentTarget.classList.add('ativo');
    await marcarRefeicaoFeita(planejados, true);
    toast(`${esc(prox.nome)} feita`, 'sucesso', 1400);
    redesenhar();
  });
  el.querySelector('[data-acao=usar-plano]')?.addEventListener('click', async () => {
    await aplicarPlano(config, tipo, hoje, { so: prox.id });
    toast(`${esc(prox.nome)} planejado`, 'sucesso', 1400);
    redesenhar();
  });
  el.querySelector('[data-acao=add]')?.addEventListener('click', async () => { if (await adicionarAlimentos({ dia: hoje, refeicao: prox })) redesenhar(); });
  el.querySelector('[data-acao=repetir]')?.addEventListener('click', async () => {
    let ordem = Date.now();
    for (const i of ultima.itens) { const { id, created_at, updated_at, feito, ...resto } = i; await salvarItem({ ...resto, dia: hoje, feito: true, ordem: ordem++ }); }
    toast(`Refeição registrada: ${esc(prox.nome)}`, 'sucesso');
    redesenhar();
  });
}

// ---------- Cartão na tela Hoje ----------
async function cartaoDieta(el) {
  const [config, itens, tipos] = await Promise.all([obterConfig(), itensDoDia(hojeISO()), tiposDosDias([hojeISO()])]);
  const tipo = tipos[hojeISO()].tipo;
  const metas = metasDe(config)[tipo] || {};
  const t = somar(consumidos(itens));
  const plano = somar(itens);
  const resta = metas.kcal ? metas.kcal - t.kcal : null;
  el.innerHTML = `
    <a class="cartao cartao-dieta" href="#/dieta">
      <div class="cartao-cab">${Icone.dieta}<h3>Dieta de hoje</h3><span class="link-cab tipo-mini ${tipo}">${TIPOS_DIA[tipo]}</span></div>
      <div class="dieta-mini">
        <div class="anel-area mini">${anel(t.kcal, metas.kcal, { tamanho: 84, espessura: 12, planejado: plano.kcal })}
          <div class="anel-texto"><strong>${fmtKcal(t.kcal)}</strong><small>kcal</small></div></div>
        <div class="dieta-mini-macros">
          ${MACROS.map(([k, nome]) => `<div class="m-${k}"><small>${nome}</small><b>${fmtG(t[k])}${metas[k] ? `<small> / ${fmtNum(metas[k])} g</small>` : ' g'}</b><div class="macro-barra"><i style="width:${metas[k] ? Math.min(t[k] / metas[k] * 100, 100) : 0}%"></i></div></div>`).join('')}
        </div>
      </div>
      <p class="sutil pequeno">${!itens.length ? 'Nada registrado ainda. Toque para adicionar.' : plano.kcal > t.kcal + 0.5 ? `${fmtKcal(plano.kcal)} kcal planejadas · ${fmtKcal(t.kcal)} consumidas` : resta == null ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} registrados` : resta >= 0 ? `Faltam ${fmtKcal(resta)} kcal para a meta` : `${fmtKcal(-resta)} kcal acima da meta`}</p>
    </a>`;
}

Modulos.registrar({
  id: 'dieta',
  aba: { rota: '/dieta', nome: 'Dieta', icone: Icone.dieta, ordem: 30 },
  tabelas: [T.diario, T.alimentos, T.refeicoes, T.config, T.dias],
  rotas: {
    '/dieta': telaDieta,
    '/dieta/alimentos': telaAlimentos,
    '/dieta/refeicoes': telaRefeicoes,
    '/dieta/refeicao/:id': { view: telaRefeicaoSalva, recarregar: false },
    '/dieta/plano/:tipo/:ref': { view: telaPlanoRefeicao, recarregar: false },
  },
  cartoesHoje: [{ ordem: 5, render: cartaoProximaRefeicao }, { ordem: 15, render: cartaoDieta }],
});
