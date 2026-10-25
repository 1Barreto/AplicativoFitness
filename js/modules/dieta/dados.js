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

const REFEICOES_PADRAO = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar', 'Ceia'];

// ---------- Configuração (refeições do dia e metas) ----------
// Um registro só; se dois aparelhos criarem o seu antes de sincronizar,
// vale o alterado por último.
export async function obterConfig() {
  const l = (await DB.todos(T.config)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  if (l[0]) return l[0];
  return {
    refeicoes: REFEICOES_PADRAO.map((nome, i) => ({ id: `r${i + 1}`, nome })),
    metas: { treino: {}, off: {} },
  };
}
export const salvarConfig = c => DB.salvar(T.config, c);

// ---------- Metas: dia de treino x dia off ----------
export const TIPOS_DIA = { treino: 'Dia de treino', off: 'Dia off' };

// Metas por tipo de dia. Versões antigas tinham uma meta só ({kcal, p, c, g}).
export function metasDe(config) {
  const m = config.metas || {};
  if (!m.treino && !m.off) return { treino: { ...m }, off: { ...m } };
  return { treino: m.treino || {}, off: m.off || {} };
}

// Tipo de cada dia: o que foi marcado; sem marcação, "treino" se houve
// treino registrado naquele dia, senão "off".
export async function tiposDosDias(dias) {
  const [marcas, treinos] = await Promise.all([DB.todos(T.dias), listarTreinos()]);
  const marcado = new Map();
  marcas.sort((a, b) => (a.updated_at || '').localeCompare(b.updated_at || '')).forEach(m => marcado.set(m.dia, m));
  const comTreino = new Set(treinos.map(t => dataInput(t.inicio)));
  return Object.fromEntries(dias.map(d => [d, {
    tipo: marcado.get(d)?.tipo || (comTreino.has(d) ? 'treino' : 'off'),
    manual: !!marcado.get(d)?.tipo,
    registro: marcado.get(d) || null,
  }]));
}
export async function marcarTipoDia(dia, tipo) {
  const atual = (await tiposDosDias([dia]))[dia].registro;
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
    fonte: a.fonte, ref: a.ref, nome: a.nome, marca: a.marca || '',
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
    res.push([pontos, a]);
  }
  return res.sort((x, y) => x[0] - y[0]).slice(0, limite).map(x => x[1]);
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
