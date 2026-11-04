// Telas do estoque de casa: lista, item (histórico e ajuste), lista de compras
// e o formulário de cadastro. A lógica de desconto fica em dados.js.

import { Modulos } from '../../core/modulos.js';
import { Sync } from '../../core/sync.js';
import { esc, num, fmtNum, normalizar } from '../../core/util.js';
import { Icone, definirTitulo, toast, folha, confirmar } from '../../core/ui.js';
import { escolherAlimentos } from '../dieta/componentes.js';
import { obterConfig, rotuloDia } from '../dieta/dados.js';
import {
  TE, listarItens, obterItem, salvarItem, excluirItem, movimentosDe, saldos, compra, ajuste, desfazer, refazer,
  nivel, precisaComprar, faltaPara, idealDe, diasValidade, fmtQtd, chaveAlimento,
} from './dados.js';

const NOMES_NIVEL = { ok: 'Ok', baixo: 'Baixo', acabou: 'Acabou' };
const NOMES_UNIDADE = { g: 'gramas (g)', ml: 'mililitros (ml)', un: 'unidades' };
const sufixo = u => (u === 'un' ? 'un' : u);

function seloValidade(item) {
  const d = diasValidade(item);
  if (d == null || d > 5) return '';
  const txt = d < 0 ? 'Vencido' : d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`;
  return `<span class="selo-validade ${d <= 1 ? 'urgente' : ''}">${txt}</span>`;
}

function barraNivel(item, saldo) {
  const ideal = idealDe(item);
  const pct = ideal > 0 ? Math.min(100, Math.max(0, saldo) / ideal * 100) : saldo > 0 ? 100 : 0;
  return `<div class="nivel-barra nivel-${nivel(item, saldo)}"><i style="width:${pct}%"></i></div>`;
}

const avisoSql = () => (Sync.info().ausentes || []).some(t => t === TE.itens || t === TE.mov)
  ? `<p class="aviso-estoque">${Icone.nuvem}<span>O estoque ainda não sincroniza com a nuvem: falta rodar o arquivo <b>supabase/estoque.sql</b> no Supabase. Até lá ele fica salvo neste aparelho.</span></p>` : '';

// ---------- Lista ----------
async function telaEstoque(el) {
  definirTitulo('Estoque', { voltar: '#/dieta' });
  const [itens, saldo] = await Promise.all([listarItens(), saldos()]);
  const comprar = itens.filter(i => precisaComprar(i, saldo.get(i.id) || 0));
  const sugestoes = await sugestoesDoPlano(itens);
  el.innerHTML = `
    ${avisoSql()}
    <a class="cartao cartao-compras ${comprar.length ? 'tem' : ''}" href="#/dieta/estoque/compras">
      <div class="cartao-cab">${Icone.check}<h3>Lista de compras</h3><span class="link-cab">${comprar.length ? `${comprar.length} ${comprar.length === 1 ? 'item' : 'itens'}` : 'Nada a comprar'}${Icone.seta}</span></div>
    </a>
    <div class="linha-busca linha-busca-estoque">
      <label class="campo-busca">${Icone.busca}<input type="search" placeholder="Buscar no estoque" data-busca autocomplete="off"></label>
      <button class="btn btn-primario" data-acao="novo">${Icone.mais}<span>Item</span></button>
    </div>
    <div data-lista></div>
    ${sugestoes.length ? `
      <h2 class="secao">Do seu plano, ainda fora do estoque</h2>
      <p class="sutil pequeno">Só é descontado o que você colocar no estoque. Toque no + para acompanhar um alimento.</p>
      <div class="lista-exercicios">${sugestoes.map((a, i) => `
        <button class="item-exercicio" data-sug="${i}"><span class="item-texto"><strong>${esc(a.nome)}</strong></span><span class="item-add">${Icone.mais}</span></button>`).join('')}</div>` : ''}`;

  const lista = el.querySelector('[data-lista]');
  const desenhar = () => {
    const q = normalizar(el.querySelector('[data-busca]').value.trim());
    const vis = q ? itens.filter(i => normalizar(i.nome).includes(q)) : itens;
    lista.innerHTML = !itens.length
      ? `<div class="vazio">${Icone.dieta}<h3>Estoque vazio</h3><p>Cadastre o que tem em casa. Quando você marca uma refeição como feita, o que foi comido sai daqui sozinho.</p></div>`
      : !vis.length ? '<p class="sutil centro lista-vazia">Nada com esse nome.</p>'
      : `<div class="lista-exercicios">${vis.map(i => {
        const s = saldo.get(i.id) || 0, n = nivel(i, s);
        return `<a class="item-exercicio item-estoque" href="#/dieta/estoque/item/${i.id}">
          <span class="item-texto"><strong>${esc(i.nome)}</strong>
            <small><span class="nivel-txt nivel-${n}">${NOMES_NIVEL[n]}</span>${i.auto === false || !i.alimentos?.length ? ' · manual' : ''}${seloValidade(i)}</small>
            ${barraNivel(i, s)}</span>
          <b class="qtd-estoque">${fmtQtd(s, i)}${s < 0 ? ` <span class="aviso-neg" title="Saiu mais do que tinha cadastrado">${Icone.medidor}</span>` : ''}</b>
        </a>`;
      }).join('')}</div>`;
  };
  desenhar();
  el.querySelector('[data-busca]').addEventListener('input', desenhar);
  el.querySelector('[data-acao=novo]').onclick = async () => { const r = await formularioItem(); if (r) location.hash = `#/dieta/estoque/item/${r.id}`; };
  el.querySelectorAll('[data-sug]').forEach(b => b.onclick = async () => {
    const r = await formularioItem(null, { alimento: sugestoes[+b.dataset.sug] });
    if (r) telaEstoque(el);
  });
}

// Alimentos dos planos de treino e off que ainda não estão no estoque
async function sugestoesDoPlano(itens) {
  const config = await obterConfig();
  const ja = new Set(itens.flatMap(i => (i.alimentos || []).map(chaveAlimento)));
  const vistos = new Map();
  for (const refs of Object.values(config.planos || {})) {
    for (const lista of Object.values(refs || {})) {
      for (const { alimento: a } of lista || []) {
        if (!a || a.fonte === 'rapido' || ja.has(chaveAlimento(a))) continue;
        if (!vistos.has(chaveAlimento(a))) vistos.set(chaveAlimento(a), a);
      }
    }
  }
  return [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ---------- Item: saldo, ações e histórico ----------
const NOMES_TIPO = { consumo: 'Consumo', compra: 'Compra', ajuste: 'Ajuste' };

async function telaItem(el, { id }) {
  const item = await obterItem(id);
  definirTitulo(item?.nome || 'Item', { voltar: '#/dieta/estoque' });
  if (!item) { el.innerHTML = '<p class="sutil centro">Item não encontrado.</p>'; return; }
  const [saldo, movs] = await Promise.all([saldos(), movimentosDe(id)]);
  const s = saldo.get(id) || 0, n = nivel(item, s);
  el.innerHTML = `
    <section class="cartao estoque-topo">
      <div class="estoque-saldo"><small class="sutil">Em casa</small><strong class="numero-grande">${fmtQtd(s, item)}</strong>
        <span class="nivel-txt nivel-${n}">${NOMES_NIVEL[n]}</span>${seloValidade(item)}</div>
      ${barraNivel(item, s)}
      ${s < 0 ? `<p class="aviso-estoque">${Icone.medidor}<span>A dieta descontou ${fmtQtd(-s, item)} a mais do que estava cadastrado. Faça um ajuste com o que tem de verdade.</span></p>` : ''}
      <p class="sutil pequeno">Mínimo ${item.minimo > 0 ? fmtQtd(item.minimo, item) : '–'} · nível bom ${idealDe(item) > 0 ? fmtQtd(idealDe(item), item) : '–'}${item.unidade === 'un' && item.pesoUnidade ? ` · 1 un = ${fmtNum(item.pesoUnidade)} g` : ''}${item.validade ? ` · validade ${item.validade.split('-').reverse().join('/')}` : ''}</p>
      <p class="sutil pequeno">${item.auto !== false && item.alimentos?.length
        ? `Desconta sozinho quando você marca como feito: ${item.alimentos.map(a => esc(a.nome.split(/[,(]/)[0].trim())).join(', ')}.`
        : 'Controle manual: a dieta não desconta este item.'}</p>
      <div class="linha-botoes">
        <button class="btn btn-secundario" data-acao="ajustar">${Icone.editar}<span>Ajustar</span></button>
        <button class="btn btn-primario" data-acao="comprar">${Icone.mais}<span>Comprei</span></button>
      </div>
      <button class="link-btn centro-bloco" data-acao="editar">Editar item</button>
    </section>

    <h2 class="secao">Histórico</h2>
    ${movs.length ? `<div class="lista-exercicios">${movs.slice(0, 80).map(m => `
      <div class="linha-lista mov ${m.estornado ? 'estornado' : ''}">
        <span class="item-texto"><strong>${NOMES_TIPO[m.tipo]}${m.estornado ? (m.ignorado ? ' · ignorado' : ' · desfeito') : ''}</strong>
          <small>${m.tipo === 'consumo' ? `${esc(rotuloDia(m.dia))} · ${esc(m.nota || '')}` : `${esc(rotuloDia(m.dia || (m.created_at || '').slice(0, 10)))}${m.nota ? ` · ${esc(m.nota)}` : ''}`}</small></span>
        <b class="${m.qtd < 0 ? 'mov-menos' : 'mov-mais'}">${m.qtd > 0 ? '+' : '−'}${fmtQtd(Math.abs(m.qtd), item)}</b>
        <button class="icon-btn pequeno" data-mov="${m.id}" aria-label="${m.estornado ? 'Refazer' : 'Desfazer'}" title="${m.estornado ? 'Refazer' : 'Desfazer'}">${m.estornado ? Icone.sincronizar : Icone.fechar}</button>
      </div>`).join('')}</div>` : '<p class="sutil">Nada ainda.</p>'}`;

  const recarregar = () => telaItem(el, { id });
  el.querySelector('[data-acao=ajustar]').onclick = async () => { if (await formularioAjuste(item, s)) recarregar(); };
  el.querySelector('[data-acao=comprar]').onclick = async () => { if (await formularioCompra(item, s)) recarregar(); };
  el.querySelector('[data-acao=editar]').onclick = async () => {
    const r = await formularioItem(item);
    if (r === 'excluido') location.hash = '#/dieta/estoque'; else if (r) recarregar();
  };
  el.querySelectorAll('[data-mov]').forEach(b => b.onclick = async () => {
    const m = movs.find(x => x.id === b.dataset.mov);
    if (m.estornado) { await refazer(m); toast('Movimentação refeita'); }
    else {
      const msg = m.tipo === 'consumo'
        ? 'Não descontar este consumo? Ele fica no histórico como ignorado, e a dieta não desconta de novo.'
        : `Desfazer est${m.tipo === 'compra' ? 'a compra' : 'e ajuste'}? A quantidade volta a ser como antes.`;
      if (!await confirmar(msg, { ok: 'Desfazer' })) return;
      await desfazer(m); toast('Desfeito');
    }
    recarregar();
  });
}

// ---------- Lista de compras ----------
async function telaCompras(el) {
  definirTitulo('Lista de compras', { voltar: '#/dieta/estoque' });
  const [itens, saldo] = await Promise.all([listarItens(), saldos()]);
  const lista = itens.filter(i => precisaComprar(i, saldo.get(i.id) || 0))
    .sort((a, b) => (saldo.get(a.id) > 0) - (saldo.get(b.id) > 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  el.innerHTML = `
    ${avisoSql()}
    <p class="sutil pequeno">Entra aqui sozinho o que chegou no mínimo. Toque em um item quando comprar e informe quanto: o estoque é reposto. Funciona sem internet e sincroniza depois.</p>
    ${lista.length ? `<div class="lista-exercicios">${lista.map(i => {
      const s = saldo.get(i.id) || 0, falta = faltaPara(i, s);
      return `<button class="item-exercicio item-compra" data-id="${i.id}">
        <span class="marca"></span>
        <span class="item-texto"><strong>${esc(i.nome)}</strong>
          <small>Tem ${fmtQtd(s, i)}${falta > 0 ? ` · comprar <b>${fmtQtd(falta, i)}</b>` : ''}${seloValidade(i)}</small></span>
        <span class="nivel-txt nivel-${nivel(i, s)}">${NOMES_NIVEL[nivel(i, s)]}</span>
      </button>`;
    }).join('')}</div>`
      : `<div class="vazio">${Icone.check}<h3>Nada para comprar</h3><p>Quando um item chegar no mínimo, ele aparece aqui.</p></div>`}`;
  el.querySelectorAll('[data-id]').forEach(b => b.onclick = async () => {
    const i = lista.find(x => x.id === b.dataset.id);
    if (await formularioCompra(i, saldo.get(i.id) || 0)) telaCompras(el);
  });
}

// ---------- Formulários ----------
const campoQtd = (nome, valor, unidade, extra = '') =>
  `<span class="campo-unidade"><input class="campo" name="${nome}" inputmode="decimal" value="${valor == null || valor === '' ? '' : fmtNum(valor)}" ${extra}><i>${sufixo(unidade)}</i></span>`;

function formularioCompra(item, saldo) {
  const falta = faltaPara(item, saldo);
  const sugestao = item.unidade === 'un' ? Math.ceil(falta) : Math.round(falta);
  return folha({
    titulo: `Comprei · ${item.nome}`, classe: 'modal-pequeno',
    conteudo: `<div class="form">
      <label>Quanto comprou${campoQtd('qtd', sugestao || '', item.unidade, 'autofocus')}</label>
      <label><span>Validade <small>(opcional)</small></span><input class="campo" type="date" name="validade" value="${esc(item.validade || '')}"></label>
      <p class="sutil pequeno">Tem ${fmtQtd(saldo, item)} agora.</p></div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: null },
      { texto: 'Repor estoque', classe: 'btn-primario', acao: async c => {
        const q = num(c.querySelector('[name=qtd]').value);
        if (!(q > 0)) { toast('Informe quanto comprou', 'erro'); return false; }
        const v = c.querySelector('[name=validade]').value;
        await compra(item, q, { validade: v !== (item.validade || '') ? v : null });
        toast(`${esc(item.nome)}: +${fmtQtd(q, item)}`, 'sucesso');
        return true;
      } },
    ],
  });
}

function formularioAjuste(item, saldo) {
  return folha({
    titulo: `Ajustar · ${item.nome}`, classe: 'modal-pequeno',
    conteudo: `<div class="form">
      <label>Quanto tem de verdade${campoQtd('qtd', Math.max(0, Math.round(saldo * 10) / 10), item.unidade, 'autofocus')}</label>
      <p class="sutil pequeno">Conte o que tem em casa. A diferença fica no histórico como ajuste.</p></div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: null },
      { texto: 'Salvar', classe: 'btn-primario', acao: async c => {
        const q = num(c.querySelector('[name=qtd]').value);
        if (q == null || q < 0) { toast('Informe a quantidade', 'erro'); return false; }
        await ajuste(item, q, saldo);
        toast('Estoque ajustado', 'sucesso');
        return true;
      } },
    ],
  });
}

// Cadastro/edição. Retorna o item salvo, 'excluido' ou undefined.
// alimento: já vem vinculado (ex.: sugestão do plano)
export function formularioItem(item = null, { alimento = null } = {}) {
  const ini = item || {};
  let alimentos = [...(ini.alimentos || []), ...(alimento ? [{ fonte: alimento.fonte, ref: alimento.ref, nome: alimento.nome }] : [])];
  const porcao = alimento?.porcoes?.[0];
  const unidadeIni = ini.unidade || (porcao && /unid|ovo|fatia/i.test(porcao.nome) ? 'un' : 'g');
  return folha({
    titulo: item ? 'Editar item' : 'Novo item do estoque', classe: 'modal-alto',
    conteudo: (corpo, fechar) => {
      corpo.innerHTML = `
        <div class="form">
          <label>Nome<input class="campo" name="nome" value="${esc(ini.nome || alimento?.nome.split(/[,(]/)[0].trim() || '')}" placeholder="Ex.: Ovos, Arroz, Whey" ${item || alimento ? '' : 'autofocus'}></label>
          <div class="rotulo">Alimentos da dieta que descontam deste item
            <div class="vinculos" data-vinculos></div>
            <button type="button" class="btn btn-secundario btn-bloco" data-vincular>${Icone.busca}<span>Vincular alimento</span></button>
          </div>
          <label class="linha-toggle"><input type="checkbox" name="auto" ${ini.auto === false ? '' : 'checked'}><span>Descontar sozinho quando eu marcar a refeição como feita</span></label>
          <label>Contar em<select class="campo" name="unidade">${Object.entries(NOMES_UNIDADE).map(([k, t]) => `<option value="${k}" ${k === unidadeIni ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label data-peso>Peso de 1 unidade (g)<input class="campo" name="peso" inputmode="decimal" value="${fmtNum(ini.pesoUnidade ?? porcao?.gramas ?? '')}" placeholder="Ex.: 60 para um ovo"></label>
          ${item ? '' : `<label>Quanto tem agora<span data-q="inicial"></span></label>`}
          <div class="linha-2">
            <label>Mínimo<span data-q="minimo"></span></label>
            <label><span>Nível bom <small>(opcional)</small></span><span data-q="ideal"></span></label>
          </div>
          <label><span>Validade <small>(opcional)</small></span><input class="campo" type="date" name="validade" value="${esc(ini.validade || '')}"></label>
          <p class="sutil pequeno">Com o mínimo ou menos, o item entra na lista de compras. O nível bom é até onde repor (se vazio, o dobro do mínimo).</p>
          ${item ? `<button type="button" class="link-btn perigo centro-bloco" data-excluir>Excluir item</button>` : ''}
        </div>`;
      const q = k => corpo.querySelector(`[name=${k}]`);
      const unidade = () => q('unidade').value;
      const valores = { inicial: '', minimo: ini.minimo ?? '', ideal: ini.ideal ?? '' };
      const desenharQtds = () => {
        corpo.querySelectorAll('[data-q]').forEach(s => {
          const k = s.dataset.q;
          if (q(k)) valores[k] = q(k).value === '' ? '' : num(q(k).value);
          s.innerHTML = campoQtd(k, valores[k], unidade());
        });
        corpo.querySelector('[data-peso]').hidden = unidade() !== 'un';
      };
      const desenharVinculos = () => {
        corpo.querySelector('[data-vinculos]').innerHTML = alimentos.length
          ? alimentos.map((a, i) => `<span class="chip vinculo">${esc(a.nome)}<button type="button" data-tirar="${i}" aria-label="Desvincular">${Icone.fechar}</button></span>`).join('')
          : '<p class="sutil pequeno">Nenhum: o item fica só com controle manual.</p>';
      };
      desenharQtds(); desenharVinculos();
      q('unidade').onchange = desenharQtds;
      corpo.querySelector('[data-vinculos]').onclick = e => {
        const b = e.target.closest('[data-tirar]'); if (!b) return;
        alimentos.splice(+b.dataset.tirar, 1); desenharVinculos();
      };
      corpo.querySelector('[data-vincular]').onclick = () => escolherAlimentos({
        titulo: 'Vincular alimento', rapido: false,
        aoEscolher: async a => {
          if (alimentos.some(x => chaveAlimento(x) === chaveAlimento(a))) return true;
          alimentos.push({ fonte: a.fonte, ref: a.ref, nome: a.nome });
          if (!q('nome').value.trim()) q('nome').value = a.nome.split(/[,(]/)[0].trim();
          if (!q('peso').value && a.porcoes?.[0]) q('peso').value = fmtNum(a.porcoes[0].gramas);
          desenharVinculos();
          return true;
        },
      });
      corpo.querySelector('[data-excluir]')?.addEventListener('click', async () => {
        if (!await confirmar(`Excluir "${esc(item.nome)}" do estoque? O histórico dele também sai. A dieta não muda.`, { ok: 'Excluir', perigo: true })) return;
        await excluirItem(item.id); toast('Item excluído'); fechar('excluido');
      });
      // O botão Salvar fica no rodapé (ações)
      corpo.salvar = async () => {
        desenharQtds();
        const nome = q('nome').value.trim();
        if (!nome) { toast('Informe o nome', 'erro'); return false; }
        const peso = num(q('peso').value);
        if (unidade() === 'un' && alimentos.length && !(peso > 0)) { toast('Informe o peso de 1 unidade para converter os gramas da dieta', 'erro', 3500); return false; }
        const dados = {
          ...(item || {}), nome, alimentos, unidade: unidade(), pesoUnidade: unidade() === 'un' ? peso : null,
          minimo: valores.minimo || 0, ideal: valores.ideal || 0, validade: q('validade').value || '', auto: q('auto').checked,
        };
        return salvarItem(dados, { inicial: valores.inicial || 0 });
      };
    },
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: undefined },
      { texto: 'Salvar', classe: 'btn-primario', acao: c => c.salvar() },
    ],
  });
}

// ---------- Cartão na tela Hoje (só aparece quando há algo a fazer) ----------
// Terceiro cartão da Hoje (depois da próxima refeição e do próximo treino):
// a lista de compras, sempre visível.
async function cartaoHoje(el) {
  const [itens, saldo] = await Promise.all([listarItens(), saldos()]);
  const comprar = itens.filter(i => precisaComprar(i, saldo.get(i.id) || 0))
    .sort((a, b) => ((saldo.get(a.id) || 0) > 0) - ((saldo.get(b.id) || 0) > 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const vencendo = itens.filter(i => { const d = diasValidade(i); return d != null && d <= 2; });
  const MAX = 5;
  el.innerHTML = `
    <a class="cartao cartao-estoque" href="#/dieta/estoque/compras">
      <div class="cartao-cab">${Icone.estoque}<h3>Lista de compras</h3><span class="link-cab ${comprar.length ? 'tem' : ''}">${comprar.length ? `${comprar.length} ${comprar.length === 1 ? 'item' : 'itens'}` : ''}${Icone.seta}</span></div>
      ${!itens.length ? '<p class="sutil pequeno">Cadastre o que tem em casa no Estoque. O que acabar aparece aqui.</p>'
        : !comprar.length ? '<p class="sutil pequeno">Nada para comprar. O estoque está em dia.</p>'
        : `<ul class="compras-mini">${comprar.slice(0, MAX).map(i => {
          const s = saldo.get(i.id) || 0, f = faltaPara(i, s), n = nivel(i, s);
          return `<li><i class="ponto nivel-${n}"></i><span>${esc(i.nome)}</span><small>${f > 0 ? `comprar ${fmtQtd(f, i)}` : NOMES_NIVEL[n]}</small></li>`;
        }).join('')}</ul>${comprar.length > MAX ? `<p class="sutil pequeno">e mais ${comprar.length - MAX}…</p>` : ''}`}
      ${vencendo.length ? `<p class="sutil pequeno vencendo-mini">Vencendo: ${vencendo.slice(0, 3).map(i => `${esc(i.nome)} (${seloTexto(i)})`).join(', ')}</p>` : ''}
    </a>`;
}
const seloTexto = i => { const d = diasValidade(i); return d < 0 ? 'vencido' : d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `${d} dias`; };

Modulos.registrar({
  id: 'estoque',
  tabelas: [TE.itens, TE.mov],
  rotas: {
    '/dieta/estoque': telaEstoque,
    '/dieta/estoque/compras': telaCompras,
    '/dieta/estoque/item/:id': telaItem,
  },
  cartoesHoje: [{ ordem: 12, render: cartaoHoje }],
});
