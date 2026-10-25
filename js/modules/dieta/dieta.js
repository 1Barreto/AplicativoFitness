// Aba "Dieta": diário do dia (calorias, macros e refeições), alimentos
// personalizados, refeições salvas e metas. Alimentos da TBCA-USP.

import { Modulos } from '../../core/modulos.js';
import { esc, fmtNum, clone } from '../../core/util.js';
import { Icone, definirTitulo, toast, confirmar, menu, pedirTexto, vazio } from '../../core/ui.js';
import { pesoAtual } from '../corpo/dados.js';
import {
  T, obterConfig, salvarConfig, hojeISO, somarDias, itensDoDia, diasComRegistro, totaisPorDia, salvarItem, excluirItem, novoItem,
  listarMeusAlimentos, salvarAlimento, excluirAlimento, listarRefeicoesSalvas, salvarRefeicaoSalva, excluirRefeicaoSalva,
  copiaAlimento, calcular, somar, fmtKcal, fmtG, fmtQtd, MACROS,
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
function anel(consumido, meta, { tamanho = 132, espessura = 11 } = {}) {
  const r = (120 - espessura) / 2, c = 2 * Math.PI * r;
  const frac = meta ? Math.min(consumido / meta, 1) : 0;
  const passou = meta && consumido > meta;
  return `
    <svg class="anel ${passou ? 'passou' : ''}" viewBox="0 0 120 120" width="${tamanho}" height="${tamanho}" aria-hidden="true">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke-width="${espessura}" class="anel-trilho"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke-width="${espessura}" class="anel-valor"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" stroke-linecap="round" transform="rotate(-90 60 60)"/>
    </svg>`;
}

function blocoResumo(total, metas) {
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
        ${anel(total.kcal, meta)}
        <div class="anel-texto">
          ${meta ? `<strong>${fmtKcal(Math.abs(resta))}</strong><small>${resta >= 0 ? 'restantes' : 'acima'}</small>`
            : `<strong>${fmtKcal(total.kcal)}</strong><small>kcal</small>`}
        </div>
      </div>
      <div class="resumo-numeros">
        <div><small>Consumido</small><b>${fmtKcal(total.kcal)}</b></div>
        <div><small>Meta</small><b>${meta ? fmtKcal(meta) : '–'}</b></div>
        <div><small>Fibra</small><b>${fmtG(total.fibra)} g</b></div>
        <div><small>Sódio</small><b>${fmtKcal(total.sodio)} mg</b></div>
      </div>
    </div>
    <div class="resumo-macros">${MACROS.map(macro).join('')}</div>
    ${meta ? '' : '<button class="btn btn-secundario btn-pequeno btn-bloco" data-acao="metas">Definir metas de calorias e macros</button>'}`;
}

// Calorias da semana (barras), com a linha da meta
function cartaoSemana(semana, totais, metas, dia) {
  const valores = semana.map(d => totais[d].kcal);
  const teto = Math.max(metas.kcal || 0, ...valores) * 1.1 || 1;
  const comDados = valores.filter(v => v > 0);
  const media = comDados.length ? comDados.reduce((a, b) => a + b, 0) / comDados.length : 0;
  return `
    <section class="cartao dieta-semana">
      <div class="cartao-cab">${Icone.progresso}<h3>Semana</h3><span class="link-cab sutil">média ${fmtKcal(media)} kcal</span></div>
      <div class="semana-grafico">
        ${metas.kcal ? `<i class="semana-meta" style="bottom:calc(24px + (100% - 24px) * ${(metas.kcal / teto).toFixed(3)})"><span>${fmtKcal(metas.kcal)}</span></i>` : ''}
        ${semana.map((d, k) => `
          <button class="semana-barra ${d === dia ? 'ativo' : ''} ${metas.kcal && valores[k] > metas.kcal ? 'passou' : ''}" data-ir="${d}" title="${fmtKcal(valores[k])} kcal">
            <span class="barra-area"><i style="height:${valores[k] / teto * 100}%"></i></span>
            <small>${DIAS_SEMANA[dataDe(d).getDay()]}</small>
          </button>`).join('')}
      </div>
    </section>`;
}

// ---------- Diário ----------
async function telaDieta(el, _p, query) {
  definirTitulo('Dieta');
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(query.dia || '') ? query.dia : hojeISO();
  const [config, itens, comRegistro] = await Promise.all([obterConfig(), itensDoDia(dia), diasComRegistro()]);
  const metas = config.metas || {};
  const total = somar(itens);
  const refeicoes = [...config.refeicoes];
  const ids = new Set(refeicoes.map(r => r.id));
  if (itens.some(i => !ids.has(i.refeicao))) refeicoes.push({ id: '__outros', nome: 'Outros' });
  const doGrupo = r => itens.filter(i => (ids.has(i.refeicao) ? i.refeicao : '__outros') === r.id);

  // Semana do dia escolhido (segunda a domingo)
  const d0 = dataDe(dia);
  const seg = somarDias(dia, -((d0.getDay() + 6) % 7));
  const semana = Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
  const totaisSemana = await totaisPorDia(semana);
  const ir = d => { location.hash = d === hojeISO() ? '#/dieta' : `#/dieta?dia=${d}`; };

  el.classList.add('tela-dieta');
  el.innerHTML = `
    <div class="dieta-dias">
      <div class="dieta-dia-topo">
        <button class="icon-btn" data-ir="${somarDias(dia, -1)}" aria-label="Dia anterior">${Icone.voltar}</button>
        <strong>${rotuloDia(dia)}</strong>
        <button class="icon-btn" data-ir="${somarDias(dia, 1)}" aria-label="Próximo dia">${Icone.seta}</button>
      </div>
      <div class="semana">
        ${semana.map(d => `
          <button class="semana-dia ${d === dia ? 'ativo' : ''} ${d === hojeISO() ? 'hoje' : ''} ${comRegistro.has(d) ? 'com' : ''}" data-ir="${d}">
            <small>${DIAS_SEMANA[dataDe(d).getDay()]}</small><b>${dataDe(d).getDate()}</b><i></i>
          </button>`).join('')}
      </div>
    </div>

    <div class="dieta-grade">
      <div class="dieta-lateral">
        <section class="cartao dieta-resumo">${blocoResumo(total, metas)}</section>
        <nav class="dieta-atalhos">
          <button class="chip" data-acao="metas">${Icone.medidor}<span>Metas</span></button>
          <a class="chip" href="#/dieta/alimentos">${Icone.dieta}<span>Meus alimentos</span></a>
          <a class="chip" href="#/dieta/refeicoes">${Icone.copiar}<span>Refeições</span></a>
          ${!itens.length ? `<button class="chip" data-acao="copiar-dia">${Icone.historico}<span>Copiar dia anterior</span></button>` : ''}
        </nav>
        ${cartaoSemana(semana, totaisSemana, metas, dia)}
      </div>

      <div class="dieta-refeicoes">
        <div class="dieta-colunas" aria-hidden="true"><span>Alimento</span><span>Quantidade</span><span>Proteína</span><span>Carbo</span><span>Gordura</span><span>kcal</span><span></span></div>
        ${refeicoes.map(r => {
          const lista = doGrupo(r);
          const t = somar(lista);
          return `
          <article class="cartao refeicao" data-ref="${esc(r.id)}">
            <div class="refeicao-topo">
              <div class="refeicao-titulo"><h3>${esc(r.nome)}</h3>${lista.length ? linhaMacros(t) : ''}</div>
              ${lista.length ? `<span class="col col-qtd">${lista.length} ${lista.length === 1 ? 'item' : 'itens'}</span><span class="col m-p">${fmtG(t.p)} g</span><span class="col m-c">${fmtG(t.c)} g</span><span class="col m-g">${fmtG(t.g)} g</span>` : '<span class="col col-vazia">Nada registrado</span>'}
              <span class="refeicao-kcal">${lista.length ? `${fmtKcal(t.kcal)}<small>kcal</small>` : ''}</span>
              <button class="icon-btn" data-acao="menu-ref" aria-label="Opções da refeição">${Icone.pontos}</button>
            </div>
            ${lista.length ? `<ul class="refeicao-itens">${lista.map(i => {
              const v = calcular(i.alimento.n, i.gramas);
              return `<li><button data-item="${i.id}">
                <span class="item-texto"><strong>${esc(i.alimento.nome)}</strong><small>${fmtQtd(i)} · P ${fmtG(v.p)} · C ${fmtG(v.c)} · G ${fmtG(v.g)}</small></span>
                <span class="col col-qtd">${fmtQtd(i)}</span><span class="col">${fmtG(v.p)}</span><span class="col">${fmtG(v.c)}</span><span class="col">${fmtG(v.g)}</span>
                <b>${fmtKcal(v.kcal)}</b><span class="col col-seta">${Icone.editar}</span></button></li>`;
            }).join('')}</ul>` : ''}
            ${r.id === '__outros' ? '' : `<button class="btn-add-alimento" data-acao="add">${Icone.mais}<span>Adicionar alimento</span></button>`}
          </article>`;
        }).join('')}
      </div>
    </div>`;

  const recarregar = () => telaDieta(el, _p, query);
  el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => ir(b.dataset.ir));
  el.querySelectorAll('[data-acao=metas]').forEach(b => b.onclick = async () => {
    const peso = (await pesoAtual())?.valor;
    const novas = await formularioMetas(metas, peso);
    if (novas) { await salvarConfig({ ...config, metas: novas }); toast('Metas salvas', 'sucesso'); recarregar(); }
  });
  el.querySelector('[data-acao=copiar-dia]')?.addEventListener('click', async () => {
    const ontem = await itensDoDia(somarDias(dia, -1));
    if (!ontem.length) { toast('O dia anterior não tem registros'); return; }
    for (const i of ontem) { const { id, created_at, updated_at, ...resto } = i; await salvarItem({ ...resto, dia }); }
    toast(`${ontem.length} ${ontem.length === 1 ? 'item copiado' : 'itens copiados'}`, 'sucesso'); recarregar();
  });

  el.querySelectorAll('.refeicao').forEach(card => {
    const ref = refeicoes.find(r => r.id === card.dataset.ref);
    card.querySelector('[data-acao=add]')?.addEventListener('click', async () => {
      const n = await adicionarAlimentos({ dia, refeicao: ref });
      if (n) recarregar();
    });
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
    card.querySelector('[data-acao=menu-ref]').onclick = async () => {
      const lista = doGrupo(ref);
      const op = await menu(ref.nome, [
        ...(lista.length ? [{ texto: 'Salvar como refeição pronta', valor: 'salvar', icone: Icone.copiar }] : []),
        ...(ref.id !== '__outros' ? [{ texto: 'Copiar do dia anterior', valor: 'copiar', icone: Icone.historico }] : []),
        ...(ref.id !== '__outros' ? [{ texto: 'Renomear', valor: 'renomear', icone: Icone.editar }] : []),
        ...(lista.length ? [{ texto: 'Limpar refeição', valor: 'limpar', icone: Icone.lixo, perigo: true }] : []),
      ]);
      if (op === 'salvar') {
        const nome = await pedirTexto('Nome da refeição pronta', ref.nome, { placeholder: 'Ex.: Café padrão' });
        if (!nome) return;
        await salvarRefeicaoSalva({ nome, itens: lista.map(i => ({ alimento: copiaAlimento(i.alimento), gramas: i.gramas, porcao: i.porcao })) });
        toast('Refeição salva. Use em "Refeições salvas" ao adicionar.', 'sucesso');
      } else if (op === 'copiar') {
        const ant = (await itensDoDia(somarDias(dia, -1))).filter(i => i.refeicao === ref.id);
        if (!ant.length) { toast(`Nada em ${ref.nome} no dia anterior`); return; }
        for (const i of ant) { const { id, created_at, updated_at, ...resto } = i; await salvarItem({ ...resto, dia }); }
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
    };
  });
}

// Busca + quantidade para uma refeição do dia. Retorna quantos itens entraram.
async function adicionarAlimentos({ dia, refeicao }) {
  let ordem = Date.now();
  return escolherAlimentos({
    titulo: `Adicionar em ${refeicao.nome}`,
    aoEscolher: async (alimento) => {
      const r = await escolherQuantidade(alimento, alimento.ultimaQtd ? { gramas: alimento.ultimaQtd, porcao: alimento.ultimaPorcao } : {});
      if (!r) return false;
      await salvarItem({ ...novoItem(r.alimento, r.gramas, { dia, refeicao: refeicao.id, porcao: r.porcao }), ordem: ordem++ });
      toast(`${esc(r.alimento.nome.split(',')[0])} adicionado`, 'sucesso', 1400);
      return true;
    },
    aoEscolherRefeicao: async (salva) => {
      for (const i of salva.itens) await salvarItem({ ...novoItem(i.alimento, i.gramas, { dia, refeicao: refeicao.id, porcao: i.porcao }), ordem: ordem++ });
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
    <p class="sutil pequeno">Cadastre o que não está na TBCA (suplementos, marcas, receitas suas). Para ajustar um alimento da TBCA, abra-o na busca e toque em "Personalizar".</p>
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

// ---------- Refeições do dia e refeições salvas ----------
async function telaRefeicoes(el) {
  definirTitulo('Refeições', { voltar: '#/dieta' });
  const [config, salvas] = await Promise.all([obterConfig(), listarRefeicoesSalvas()]);
  el.innerHTML = `
    <h2 class="secao">Refeições do dia <small>${config.refeicoes.length}</small></h2>
    <p class="sutil pequeno">Os blocos que aparecem no diário. Renomeie, reordene ou crie (ex.: Pré-treino, Pós-treino).</p>
    <div class="cartao lista-simples">
      ${config.refeicoes.map((r, i) => `
        <div class="linha-lista linha-refeicao" data-i="${i}">
          <span class="item-texto"><strong>${esc(r.nome)}</strong></span>
          <button class="icon-btn" data-mover="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${Icone.cima}</button>
          <button class="icon-btn" data-mover="1" ${i === config.refeicoes.length - 1 ? 'disabled' : ''} aria-label="Descer">${Icone.baixo}</button>
          <button class="icon-btn" data-acao="op" aria-label="Opções">${Icone.pontos}</button>
        </div>`).join('')}
    </div>
    <button class="btn btn-secundario btn-bloco" data-acao="nova-ref">${Icone.mais}<span>Nova refeição do dia</span></button>

    <h2 class="secao">Refeições salvas <small>${salvas.length}</small></h2>
    <p class="sutil pequeno">Combinações prontas para adicionar com um toque (ex.: "Café padrão").</p>
    ${salvas.length ? `<div class="grade-cartoes">${salvas.map(s => {
      const t = somar(s.itens);
      return `<a class="cartao refeicao-salva" href="#/dieta/refeicao/${s.id}">
        <div class="refeicao-topo"><div class="refeicao-titulo"><h3>${esc(s.nome)}</h3>${linhaMacros(t)}</div><span class="refeicao-kcal">${fmtKcal(t.kcal)}<small>kcal</small></span></div>
        <p class="sutil pequeno">${s.itens.map(i => esc(i.alimento.nome.split(',')[0])).join(' · ')}</p>
      </a>`;
    }).join('')}</div>` : ''}
    <a class="btn btn-secundario btn-bloco" href="#/dieta/refeicao/nova">${Icone.mais}<span>Criar refeição salva</span></a>`;

  const salvar = async refs => { await salvarConfig({ ...config, refeicoes: refs }); telaRefeicoes(el); };
  el.querySelector('[data-acao=nova-ref]').onclick = async () => {
    const nome = await pedirTexto('Nova refeição do dia', '', { placeholder: 'Ex.: Pós-treino', ok: 'Criar' });
    if (nome) salvar([...config.refeicoes, { id: `r${Date.now().toString(36)}`, nome }]);
  };
  el.querySelectorAll('.linha-refeicao').forEach(linha => {
    const i = +linha.dataset.i;
    const r = config.refeicoes[i];
    linha.querySelectorAll('[data-mover]').forEach(b => b.onclick = () => {
      const refs = [...config.refeicoes];
      const j = i + +b.dataset.mover;
      [refs[i], refs[j]] = [refs[j], refs[i]];
      salvar(refs);
    });
    linha.querySelector('[data-acao=op]').onclick = async () => {
      const op = await menu(r.nome, [
        { texto: 'Renomear', valor: 'renomear', icone: Icone.editar },
        ...(config.refeicoes.length > 1 ? [{ texto: 'Excluir', valor: 'excluir', icone: Icone.lixo, perigo: true }] : []),
      ]);
      if (op === 'renomear') { const nome = await pedirTexto('Renomear refeição', r.nome); if (nome) salvar(config.refeicoes.map(x => (x === r ? { ...x, nome } : x))); }
      if (op === 'excluir' && await confirmar(`Excluir "${esc(r.nome)}"? Itens já registrados nela aparecem em "Outros".`, { ok: 'Excluir', perigo: true })) salvar(config.refeicoes.filter(x => x !== r));
    };
  });
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

// ---------- Cartão na tela Hoje ----------
async function cartaoDieta(el) {
  const [config, itens] = await Promise.all([obterConfig(), itensDoDia(hojeISO())]);
  const metas = config.metas || {};
  const t = somar(itens);
  const resta = metas.kcal ? metas.kcal - t.kcal : null;
  el.innerHTML = `
    <a class="cartao cartao-dieta" href="#/dieta">
      <div class="cartao-cab">${Icone.dieta}<h3>Dieta de hoje</h3></div>
      <div class="dieta-mini">
        <div class="anel-area mini">${anel(t.kcal, metas.kcal, { tamanho: 84, espessura: 12 })}
          <div class="anel-texto"><strong>${fmtKcal(t.kcal)}</strong><small>kcal</small></div></div>
        <div class="dieta-mini-macros">
          ${MACROS.map(([k, nome]) => `<div class="m-${k}"><small>${nome}</small><b>${fmtG(t[k])}${metas[k] ? `<small> / ${fmtNum(metas[k])} g</small>` : ' g'}</b><div class="macro-barra"><i style="width:${metas[k] ? Math.min(t[k] / metas[k] * 100, 100) : 0}%"></i></div></div>`).join('')}
        </div>
      </div>
      <p class="sutil pequeno">${!itens.length ? 'Nada registrado ainda. Toque para adicionar.' : resta == null ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} registrados` : resta >= 0 ? `Faltam ${fmtKcal(resta)} kcal para a meta` : `${fmtKcal(-resta)} kcal acima da meta`}</p>
    </a>`;
}

Modulos.registrar({
  id: 'dieta',
  aba: { rota: '/dieta', nome: 'Dieta', icone: Icone.dieta, ordem: 30 },
  tabelas: [T.diario, T.alimentos, T.refeicoes, T.config],
  rotas: {
    '/dieta': telaDieta,
    '/dieta/alimentos': telaAlimentos,
    '/dieta/refeicoes': telaRefeicoes,
    '/dieta/refeicao/:id': { view: telaRefeicaoSalva, recarregar: false },
  },
  cartoesHoje: [{ ordem: 15, render: cartaoDieta }],
});
