// Dados do módulo de dieta: diário de alimentos, alimentos personalizados,
// refeições salvas, metas e a tabela TBCA (USP) para busca.
//
// Valores nutricionais sempre por 100 g ({ kcal, p, c, g, fibra, sodio }).
// Cada item do diário guarda uma cópia do alimento, assim o histórico não
// muda se o alimento for editado ou excluído depois.

import { DB } from '../../core/db.js';
import { normalizar, dataInput } from '../../core/util.js';
import { listarTreinos } from '../treino/dados.js';

export const T = { diario: 'diario', alimentos: 'alimentos', refeicoes: 'refeicoes', config: 'dieta_config', dias: 'dieta_dias' };

export const NUTRIENTES = [
  // chave, rótulo, unidade
  ['kcal', 'Calorias', 'kcal'],
  ['p', 'Proteína', 'g'],
  ['c', 'Carboidratos', 'g'],
  ['g', 'Gorduras', 'g'],
  ['fibra', 'Fibra', 'g'],
  ['sodio', 'Sódio', 'mg'],
];
export const MACROS = [['p', 'Proteína'], ['c', 'Carboidratos'], ['g', 'Gorduras']];

const REFEICOES_PADRAO = [['Café da manhã', '07:00'], ['Almoço', '12:00'], ['Lanche', '16:00'], ['Jantar', '19:30'], ['Ceia', '22:00']];

// ---------- Configuração (refeições do dia e metas) ----------
// Um registro só; se dois aparelhos criarem o seu antes de sincronizar,
// vale o alterado por último.
export async function obterConfig() {
  const l = (await DB.todos(T.config)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  if (l[0]) return l[0];
  return {
    refeicoes: REFEICOES_PADRAO.map(([nome, horario], i) => ({ id: `r${i + 1}`, nome, horario })),
    metas: { treino: {}, off: {} },
  };
}
export const salvarConfig = c => DB.salvar(T.config, c);

// Próxima refeição de hoje: a primeira sem registro depois da última registrada.
// Sem nada registrado ainda, usa o horário (a primeira que não passou há mais de 1h30).
export function proximaRefeicao(refeicoes, itensHoje, agora = new Date()) {
  const comItens = new Set(itensHoje.map(i => i.refeicao));
  let ultima = -1;
  refeicoes.forEach((r, i) => { if (comItens.has(r.id)) ultima = i; });
  if (ultima >= 0) return refeicoes.slice(ultima + 1).find(r => !comItens.has(r.id)) || null;
  const min = agora.getHours() * 60 + agora.getMinutes() - 90;
  const emMin = h => { const [a, b] = String(h || '').split(':').map(Number); return Number.isFinite(a) ? a * 60 + (b || 0) : null; };
  return refeicoes.find(r => emMin(r.horario) == null || emMin(r.horario) >= min) || refeicoes[refeicoes.length - 1] || null;
}

// Itens da última vez que essa refeição foi registrada (até 14 dias atrás)
export async function ultimaVezDaRefeicao(refeicaoId, antesDe) {
  const todos = (await DB.todos(T.diario)).filter(i => i.refeicao === refeicaoId && i.dia < antesDe && i.dia >= somarDias(antesDe, -14));
  if (!todos.length) return null;
  const dia = todos.reduce((m, i) => (i.dia > m ? i.dia : m), '');
  return { dia, itens: todos.filter(i => i.dia === dia).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)) };
}

// ---------- Metas: dia de treino x dia off ----------
export const TIPOS_DIA = { treino: 'Dia de treino', off: 'Dia off' };

// Metas por tipo de dia. Versões antigas tinham uma meta só ({kcal, p, c, g}).
export function metasDe(config) {
  const m = config.metas || {};
  if (!m.treino && !m.off) return { treino: { ...m }, off: { ...m } };
  return { treino: m.treino || {}, off: m.off || {} };
}

// Tipo de cada dia, pela regra do ciclo: 1 dia off seguido de 2 dias de treino.
// Cada dia marcado manualmente recomeça o ciclo a partir dele (off = início do
// ciclo; treino = primeiro dos dois dias de treino). Para dias antes da primeira
// marcação, o ciclo é contado para trás. Sem nenhuma marcação, vale "treino"
// quando há treino registrado no dia.
export const CICLO = ['off', 'treino', 'treino'];
const diaNum = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;

export async function tiposDosDias(dias) {
  const [marcas, treinos] = await Promise.all([DB.todos(T.dias), listarTreinos()]);
  const marcado = new Map();
  marcas.sort((a, b) => (a.updated_at || '').localeCompare(b.updated_at || '')).forEach(m => { if (m.tipo) marcado.set(m.dia, m); });
  const ancoras = [...marcado.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  const comTreino = new Set(treinos.map(t => dataInput(t.inicio)));
  return Object.fromEntries(dias.map(d => {
    const proprio = marcado.get(d) || null;
    if (proprio) return [d, { tipo: proprio.tipo, manual: true, origem: 'manual', registro: proprio }];
    if (!ancoras.length) return [d, { tipo: comTreino.has(d) ? 'treino' : 'off', manual: false, origem: 'treinos', registro: null }];
    // última marcação até este dia; se não houver, a primeira depois dele
    let ancora = null;
    for (const m of ancoras) { if (m.dia <= d) ancora = m; else break; }
    ancora ||= ancoras[0];
    const pos = (CICLO.indexOf(ancora.tipo) + diaNum(d) - diaNum(ancora.dia)) % 3;
    return [d, { tipo: CICLO[(pos + 3) % 3], manual: false, origem: 'ciclo', registro: null }];
  }));
}
// Marca o tipo de um dia e recomeça o ciclo a partir dele: marcações de
// dias seguintes (feitas antes) são removidas, para não interferir.
export async function marcarTipoDia(dia, tipo) {
  const marcas = await DB.todos(T.dias);
  for (const m of marcas) if (m.dia > dia) await DB.excluir(T.dias, m.id);
  const atual = marcas.filter(m => m.dia === dia).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
  return DB.salvar(T.dias, { ...(atual || {}), dia, tipo });
}

// ---------- Diário ----------
export const hojeISO = () => dataInput();
export function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dataInput(d);
}

export async function itensDoDia(dia) {
  return (await DB.todos(T.diario)).filter(i => i.dia === dia).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.created_at || '').localeCompare(b.created_at || ''));
}
export async function diasComRegistro() {
  return new Set((await DB.todos(T.diario)).map(i => i.dia));
}
// Totais (kcal e macros) de cada dia pedido: { 'aaaa-mm-dd': {kcal, p, c, g...} }
export async function totaisPorDia(dias) {
  const todos = await DB.todos(T.diario);
  return Object.fromEntries(dias.map(d => [d, somar(todos.filter(i => i.dia === d))]));
}
export const salvarItem = i => DB.salvar(T.diario, i);
export const excluirItem = id => DB.excluir(T.diario, id);

export function novoItem(alimento, gramas, { dia, refeicao, porcao = null }) {
  return { dia, refeicao, gramas, porcao, alimento: copiaAlimento(alimento), ordem: Date.now() };
}

// Cópia "congelada" do alimento para guardar no diário
export function copiaAlimento(a) {
  return {
    fonte: a.fonte, ref: a.ref, nome: a.nome, marca: a.marca || '', ...(a.detalhe ? { detalhe: a.detalhe } : {}),
    n: { ...a.n }, porcoes: a.porcoes || [],
  };
}

// Valores de uma quantidade (gramas) de um alimento
export function calcular(n, gramas) {
  const f = (gramas || 0) / 100;
  const r = {};
  NUTRIENTES.forEach(([k]) => { r[k] = n?.[k] == null ? 0 : n[k] * f; });
  return r;
}
export function somar(itens) {
  const t = Object.fromEntries(NUTRIENTES.map(([k]) => [k, 0]));
  itens.forEach(i => {
    const v = calcular(i.alimento.n, i.gramas);
    NUTRIENTES.forEach(([k]) => { t[k] += v[k]; });
  });
  return t;
}

// Itens usados recentemente (um por alimento, com a última quantidade)
export async function recentes(limite = 40) {
  const l = (await DB.todos(T.diario)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  const vistos = new Map();
  for (const i of l) {
    const k = `${i.alimento.fonte}:${i.alimento.ref}`;
    if (!vistos.has(k)) vistos.set(k, { ...i.alimento, ultimaQtd: i.gramas, ultimaPorcao: i.porcao });
    if (vistos.size >= limite) break;
  }
  return [...vistos.values()];
}

// ---------- Alimentos personalizados ----------
export async function listarMeusAlimentos() {
  return (await DB.todos(T.alimentos)).map(a => ({ ...a, fonte: 'meu', ref: a.id })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
export const salvarAlimento = a => {
  const { fonte, ref, ...resto } = a;
  return DB.salvar(T.alimentos, resto);
};
export const excluirAlimento = id => DB.excluir(T.alimentos, id);

// ---------- Refeições salvas (combinações prontas) ----------
export async function listarRefeicoesSalvas() {
  return (await DB.todos(T.refeicoes)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
export const salvarRefeicaoSalva = r => DB.salvar(T.refeicoes, r);
export const excluirRefeicaoSalva = id => DB.excluir(T.refeicoes, id);

// ---------- TBCA ----------
let tbca = null;
export function carregarTBCA() {
  if (!tbca) {
    tbca = fetch(new URL('./tbca.json', import.meta.url)).then(r => {
      if (!r.ok) throw new Error('Não foi possível carregar a tabela TBCA');
      return r.json();
    }).then(d => d.alimentos.map(([codigo, nome, grupo, kcal, p, c, g, fibra, sodio, acucar, saturada, descricao]) => ({
      fonte: 'tbca', ref: codigo, nome, grupo: d.grupos[grupo], descricao: descricao || nome,
      n: { kcal, p, c, g, fibra, sodio, acucar, saturada },
      busca: palavras(nome),
    }))).catch(e => { tbca = null; throw e; });
  }
  return tbca;
}

// ---------- TACO (UNICAMP) e IBGE (POF 2008-2009) ----------
// Tabelas públicas brasileiras complementares; IBGE traz alimentos já preparados
// (cozido, frito, grelhado...) com o sal do preparo.
let tabelas = null;
export function carregarTabelas() {
  if (!tabelas) {
    tabelas = fetch(new URL('./tabelas.json', import.meta.url)).then(r => {
      if (!r.ok) throw new Error('Não foi possível carregar as tabelas TACO/IBGE');
      return r.json();
    }).then(d => [
      ...d.taco.map(([ref, nome, grupo, kcal, p, c, g, fibra, sodio]) => ({
        fonte: 'taco', ref, nome, grupo: d.grupos[grupo], n: { kcal, p, c, g, fibra, sodio },
      })),
      ...d.ibge.map(([ref, nome, grupo, kcal, p, c, g, fibra, sodio, acucar, saturada]) => ({
        fonte: 'ibge', ref, nome, grupo: d.grupos[grupo], n: { kcal, p, c, g, fibra, sodio, acucar, saturada },
      })),
    ]).catch(e => { tabelas = null; throw e; });
  }
  return tabelas;
}

// Todas as tabelas de referência juntas, para a busca
let base = null;
export function carregarBase() {
  if (!base) {
    base = Promise.all([carregarTBCA(), carregarTabelas()]).then(([a, b]) => [...a, ...b])
      .catch(e => { base = null; throw e; });
  }
  return base;
}

export async function alimentoTBCA(codigo) {
  return (await carregarTBCA()).find(a => a.ref === codigo) || null;
}

const palavras = s => normalizar(s).split(/[^a-z0-9]+/).filter(Boolean);

// Sinônimos comuns que não aparecem no nome usado pela TBCA
const SINONIMOS = {
  branco: ['polido'], bife: ['boi'], refri: ['refrigerante'], aipim: ['mandioca'], macaxeira: ['mandioca'],
  mussarela: ['mucarela'], muzarela: ['mucarela'],
};

// Busca: cada palavra digitada precisa casar com o início de alguma palavra do nome.
// Ordena dando preferência ao que aparece no começo do nome e a nomes curtos.
export function buscarAlimentos(lista, texto, limite = 80) {
  const termos = palavras(texto);
  if (!termos.length) return [];
  // Plural e masculino/feminino: "ovos" acha "ovo", "grelhado" acha "grelhada"
  const radical = t => (t.length > 4 && /[oa]s?$/.test(t) ? [t.replace(/[oa]s?$/, '')] : t.length > 3 && t.endsWith('s') ? [t.slice(0, -1)] : []);
  const opcoes = termos.map(t => [t, ...(SINONIMOS[t] || []), ...radical(t)]);
  const res = [];
  for (const a of lista) {
    const w = a.busca || (a.busca = palavras(`${a.nome} ${a.marca || ''}`));
    let pontos = 0, ok = true;
    for (const alts of opcoes) {
      let pos = -1;
      for (let i = 0; i < w.length && pos < 0; i++) if (alts.some(t => w[i].startsWith(t))) pos = i;
      if (pos < 0) { ok = false; break; }
      pontos += pos * 3 + (alts.some(t => w[pos] === t) ? 0 : 1);
    }
    if (!ok) continue;
    if (opcoes[0].some(t => w[0].startsWith(t))) pontos -= 6;
    pontos += a.nome.replace(/\(.*?\)/g, '').length / 25 + (a.nome.match(/ c\//g) || []).length * 3;
    if (/\b(galinha|vaca)\b/.test(a.nome)) pontos -= 1.5;
    if (/\b(cru|crua|in natura|cozid[oa]|grelhad[oa])\b/.test(a.nome)) pontos -= 1;
    if (a.fonte === 'taco') pontos += 0.5; else if (a.fonte === 'ibge') pontos += 1;
    // Digitou a marca: produto daquela marca vem antes
    if (a.marca && opcoes.some(alts => palavras(a.marca).some(w => alts.some(t => w.startsWith(t))))) pontos -= 4;
    res.push([pontos, a]);
  }
  return res.sort((x, y) => x[0] - y[0]).slice(0, limite).map(x => x[1]);
}

// ---------- Open Food Facts (produtos de mercado, com marca) ----------
// Base aberta e colaborativa (ODbL). Busca online, só produtos vendidos no Brasil.
const OFF_CAMPOS = 'code,product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity,quantity';
const cacheOFF = new Map();

function numOFF(v) { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v; return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }
export function produtoOFF(p) {
  const nu = p.nutriments || {};
  let kcal = numOFF(nu['energy-kcal_100g']);
  if (kcal == null && numOFF(nu.energy_100g) != null) kcal = Math.round(numOFF(nu.energy_100g) / 4.184);
  const nome = String(p.product_name_pt || p.product_name || '').trim();
  if (!nome || kcal == null) return null;
  const sodio = numOFF(nu.sodium_100g);
  const porcaoG = numOFF(p.serving_quantity);
  const marca = String(p.brands || '').split(',')[0].trim();
  return {
    fonte: 'off', ref: String(p.code), nome, marca,
    detalhe: [p.quantity, p.serving_size ? `porção ${p.serving_size}` : ''].filter(Boolean).join(' · '),
    n: { kcal, p: numOFF(nu.proteins_100g), c: numOFF(nu.carbohydrates_100g), g: numOFF(nu.fat_100g), fibra: numOFF(nu.fiber_100g), sodio: sodio == null ? null : Math.round(sodio * 1000) },
    porcoes: porcaoG && porcaoG > 0 && porcaoG < 2000 ? [{ nome: 'porção', gramas: porcaoG }] : [],
  };
}

async function pedirJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Texto livre ou código de barras (8 a 14 dígitos)
export async function buscarOFF(texto) {
  const q = texto.trim();
  if (q.length < 3) return [];
  if (cacheOFF.has(q)) return cacheOFF.get(q);
  let produtos;
  if (/^\d{8,14}$/.test(q)) {
    const d = await pedirJSON(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${OFF_CAMPOS}`);
    produtos = d.product ? [d.product] : [];
  } else {
    try {
      const d = await pedirJSON(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(`${q} countries_tags:"en:brazil"`)}&page_size=40&langs=pt&fields=${OFF_CAMPOS}`);
      produtos = d.hits || [];
    } catch {
      const d = await pedirJSON(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=40&tagtype_0=countries&tag_contains_0=contains&tag_0=brazil&fields=${OFF_CAMPOS}`, 12000);
      produtos = d.products || [];
    }
  }
  const vistos = new Set();
  const res = produtos.map(produtoOFF).filter(a => a && !vistos.has(a.ref) && vistos.add(a.ref));
  cacheOFF.set(q, res);
  return res;
}

// ---------- Formatação ----------
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export const fmtKcal = v => nf0.format(Math.round(v || 0));
export const fmtG = v => (v >= 10 ? nf0.format(Math.round(v)) : nf1.format(Math.round((v || 0) * 10) / 10));
export function fmtQtd(item) {
  if (item.porcao) return `${nf1.format(item.porcao.qtd)} × ${item.porcao.nome}`;
  return `${nf1.format(item.gramas)} g`;
}
