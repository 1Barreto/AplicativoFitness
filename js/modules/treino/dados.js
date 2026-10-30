// Camada de dados do módulo de treino: exercícios, rotinas, treinos,
// recordes e histórico. As telas usam só estas funções.

import { DB } from '../../core/db.js';
import { e1rm, normalizar, Bus } from '../../core/util.js';
import { EXERCICIOS_BASE } from './exercicios-base.js';

export const T = { EXERCICIOS: 'exercicios', ROTINAS: 'rotinas', TREINOS: 'treinos' };

export const GRUPOS = ['Peito', 'Costas', 'Ombros', 'Trapézio', 'Bíceps', 'Tríceps', 'Antebraço', 'Quadríceps',
  'Posterior de coxa', 'Glúteos', 'Adutores', 'Panturrilha', 'Abdômen', 'Corpo inteiro', 'Cardio', 'Outro'];
export const EQUIPAMENTOS = ['Barra', 'Halteres', 'Máquina', 'Polia', 'Smith', 'Kettlebell', 'Peso corporal', 'Elástico', 'Outro'];
export const TIPOS_EXERCICIO = {
  peso_reps: { nome: 'Peso e repetições', campos: ['kg', 'reps'] },
  corporal: { nome: 'Peso corporal (+kg opcional)', campos: ['+kg', 'reps'] },
  tempo: { nome: 'Cardio (distância e tempo)', campos: ['km', 'min'] },
};

// Tipos de série
export const TIPOS_SERIE = {
  A: { nome: 'Aquecimento', curto: 'A', classe: 'serie-aquec' },
  N: { nome: 'Normal', curto: '', classe: '' },
  D: { nome: 'Drop set', curto: 'D', classe: 'serie-drop' },
  F: { nome: 'Até a falha', curto: 'F', classe: 'serie-falha' },
};

// ---------- Preferências locais ----------
export const prefs = {
  descansoPadrao: () => Number(localStorage.getItem('descansoPadrao') ?? 0),
  definirDescansoPadrao: s => localStorage.setItem('descansoPadrao', String(s)),
  manterTelaLigada: () => localStorage.getItem('manterTela') !== '0',
  definirManterTelaLigada: v => localStorage.setItem('manterTela', v ? '1' : '0'),
};

// ---------- Exercícios ----------
// A tabela "exercicios" guarda os exercícios personalizados e também
// ajustes feitos em exercícios da biblioteca (ex.: tempo de descanso).
export async function listarExercicios() {
  const salvos = await DB.todos(T.EXERCICIOS);
  const porId = new Map(salvos.map(e => [e.id, e]));
  const base = EXERCICIOS_BASE.map(b => ({ ...b, ...(porId.get(b.id) || {}), base: true }));
  const personalizados = salvos.filter(e => !EXERCICIOS_BASE.some(b => b.id === e.id)).map(e => ({ tipo: 'peso_reps', ...e, base: false }));
  return [...base, ...personalizados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

let mapaExercicios = null;
export async function mapaDeExercicios() {
  const lista = await listarExercicios();
  mapaExercicios = new Map(lista.map(e => [e.id, e]));
  return mapaExercicios;
}

export async function obterExercicio(id) {
  return (await mapaDeExercicios()).get(id) || { id, nome: 'Exercício removido', grupo: 'Outro', equipamento: 'Outro', tipo: 'peso_reps', removido: true };
}

export async function salvarExercicio(ex) {
  const { base, ...dados } = ex;
  if (base) {
    // Exercício da biblioteca: só guardamos os ajustes pessoais
    const atual = await DB.obter(T.EXERCICIOS, ex.id);
    return DB.salvar(T.EXERCICIOS, { ...(atual || {}), id: ex.id, descanso: ex.descanso ?? null, notas: ex.notas || '', ...(ex.foto !== undefined ? { foto: ex.foto } : {}) });
  }
  return DB.salvar(T.EXERCICIOS, { ...dados, personalizado: true });
}

export const excluirExercicio = id => DB.excluir(T.EXERCICIOS, id);

export function filtrarExercicios(lista, { busca = '', grupo = '', equipamento = '' } = {}) {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean);
  return lista.filter(e =>
    (!grupo || e.grupo === grupo) &&
    (!equipamento || e.equipamento === equipamento) &&
    termos.every(t => normalizar(`${e.nome} ${e.grupo} ${e.equipamento}`).includes(t)));
}

export function descansoDe(ex) {
  return ex && ex.descanso !== null && ex.descanso !== undefined && ex.descanso !== '' ? Number(ex.descanso) : prefs.descansoPadrao();
}

// ---------- Rotinas ----------
export async function listarRotinas() {
  const r = await DB.todos(T.ROTINAS);
  return r.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
export const obterRotina = id => DB.obter(T.ROTINAS, id);
export const salvarRotina = r => DB.salvar(T.ROTINAS, r);
export const excluirRotina = id => DB.excluir(T.ROTINAS, id);

// ---------- Treinos (sessões concluídas) ----------
// Lista ordenada e recordes ficam guardados até os treinos mudarem
// (recalcular a cada tela pesava com centenas de treinos).
let cacheTreinos = null, cacheRecordes = null;
Bus.on('dados:alterados', ({ tabela }) => { if (tabela === T.TREINOS || tabela === '*') cacheTreinos = null;
  if (tabela === T.TREINOS || tabela === T.ROTINAS || tabela === '*') cacheRecordes = null; });

export async function listarTreinos() {
  cacheTreinos ||= DB.todos(T.TREINOS).then(t => t.filter(x => x.fim).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || '')))
    .catch(e => { cacheTreinos = null; throw e; });
  return (await cacheTreinos).slice();
}
export const obterTreino = id => DB.obter(T.TREINOS, id);
export const salvarTreino = t => DB.salvar(T.TREINOS, t);
export const excluirTreino = id => DB.excluir(T.TREINOS, id);

export const contaParaVolume = (ex) => (ex?.tipo || 'peso_reps') !== 'tempo';

export function volumeDaSerie(s) { return s.feita && s.peso && s.reps ? s.peso * s.reps : 0; }

export function resumoTreino(t, mapa) {
  let volume = 0, series = 0;
  (t.exercicios || []).forEach(e => {
    const ex = mapa?.get(e.exercicio_id);
    e.series.forEach(s => {
      if (!s.feita) return;
      series++;
      if (contaParaVolume(ex)) volume += volumeDaSerie(s);
    });
  });
  const duracao = t.fim && t.inicio ? new Date(t.fim) - new Date(t.inicio) : 0;
  return { volume, series, duracao, exercicios: (t.exercicios || []).length };
}

// Séries de um exercício no treino mais recente em que ele apareceu
// Identifica "o mesmo treino" (ex.: Posterior I) para comparar a progressão só
// dentro dele: pela rotina ligada ou, nos importados do Hevy, pelo nome da rotina.
// Retorna uma função treino -> chave.
export async function chaveDeTreino() {
  const rotinas = await listarRotinas();
  const nome = x => normalizar(x || '').trim();
  const ids = new Set(rotinas.map(r => r.id));
  const porNome = new Map(rotinas.map(r => [nome(r.nome), r.id]));
  return t => (t.rotina_id && ids.has(t.rotina_id) ? t.rotina_id : porNome.get(nome(t.nome))) || t.rotina_id || `nome:${nome(t.nome)}`;
}

// Séries feitas da última vez. Com "treino" ({rotina_id, nome}), prefere a última
// vez naquele mesmo treino; se nunca foi feito nele, usa a última de qualquer treino.
export async function ultimasSeries(exercicioId, { excluirTreinoId = null, treino = null } = {}) {
  const treinos = await listarTreinos();
  const chave = treino && await chaveDeTreino();
  const alvo = chave && chave(treino);
  let qualquer = null;
  for (const t of treinos) {
    if (t.id === excluirTreinoId) continue;
    const e = (t.exercicios || []).find(x => x.exercicio_id === exercicioId && x.series.some(s => s.feita));
    if (!e) continue;
    const r = { treino: t, series: e.series.filter(s => s.feita) };
    if (!alvo || chave(t) === alvo) return r;
    qualquer ||= r;
  }
  return qualquer;
}

// Histórico de um exercício (mais recente primeiro)
export async function historicoExercicio(exercicioId) {
  const treinos = await listarTreinos();
  const r = [];
  treinos.forEach(t => (t.exercicios || []).forEach(e => {
    if (e.exercicio_id !== exercicioId) return;
    const series = e.series.filter(s => s.feita);
    if (series.length) r.push({ treino: t, series });
  }));
  return r;
}

// ---------- Recordes pessoais ----------
// Consideramos só séries concluídas que não são de aquecimento.
const valida = s => s.feita && s.tipo !== 'A' && s.peso > 0 && s.reps > 0;

export function melhoresDeSeries(series) {
  const m = { carga: 0, e1rm: 0, volume: 0 };
  series.filter(valida).forEach(s => {
    m.carga = Math.max(m.carga, s.peso);
    m.e1rm = Math.max(m.e1rm, e1rm(s.peso, s.reps));
    m.volume = Math.max(m.volume, s.peso * s.reps);
  });
  return m;
}

// Melhores marcas anteriores do exercício. Com "treino", só dentro daquele treino.
export async function recordesExercicio(exercicioId, { excluirTreinoId = null, treino = null } = {}) {
  const treinos = await listarTreinos();
  const chave = treino && await chaveDeTreino();
  const alvo = chave && chave(treino);
  const todas = [];
  treinos.forEach(t => {
    if (t.id === excluirTreinoId || (alvo && chave(t) !== alvo)) return;
    (t.exercicios || []).forEach(e => { if (e.exercicio_id === exercicioId) todas.push(...e.series); });
  });
  return melhoresDeSeries(todas);
}

// Quais recordes uma série bate em relação a "anteriores" ({carga,e1rm,volume})
export function recordesBatidos(serie, anteriores) {
  if (!valida(serie)) return [];
  const r = [];
  if (serie.peso > anteriores.carga) r.push('carga');
  if (e1rm(serie.peso, serie.reps) > anteriores.e1rm + 1e-9) r.push('e1rm');
  if (serie.peso * serie.reps > anteriores.volume) r.push('volume');
  return r;
}

export const NOMES_RECORDE = { carga: 'Maior carga', e1rm: 'Melhor 1RM est.', volume: 'Maior volume' };

// Percorre os treinos em ordem cronológica e marca, em cada treino, a melhor
// série de cada tipo de recorde quando ela supera tudo o que veio antes no
// mesmo treino (Posterior I compara só com Posterior I).
// A primeira vez que um exercício é feito naquele treino não conta como recorde.
// Retorna Map(serieUid -> ['carga' | 'e1rm' | 'volume']).
export function mapaDeRecordes() {
  cacheRecordes ||= calcularRecordes().catch(e => { cacheRecordes = null; throw e; });
  return cacheRecordes;
}
async function calcularRecordes() {
  const [treinos, chave] = await Promise.all([listarTreinos().then(l => l.reverse()), chaveDeTreino()]);
  const melhores = new Map();
  const resultado = new Map();
  const marcar = (uid, tipo) => resultado.set(uid, [...(resultado.get(uid) || []), tipo]);
  treinos.forEach(t => (t.exercicios || []).forEach(e => {
    const k = `${chave(t)}|${e.exercicio_id}`;
    const antes = melhores.get(k);
    const desta = melhoresDeSeries(e.series);
    if (antes) {
      const series = e.series.filter(valida);
      const valor = { carga: s => s.peso, e1rm: s => e1rm(s.peso, s.reps), volume: s => s.peso * s.reps };
      for (const tipo of Object.keys(valor)) {
        if (desta[tipo] > antes[tipo] + 1e-9) {
          const s = series.find(x => Math.abs(valor[tipo](x) - desta[tipo]) < 1e-9);
          if (s) marcar(s.uid, tipo);
        }
      }
    }
    melhores.set(k, {
      carga: Math.max(antes?.carga || 0, desta.carga),
      e1rm: Math.max(antes?.e1rm || 0, desta.e1rm),
      volume: Math.max(antes?.volume || 0, desta.volume),
    });
  }));
  return resultado;
}

// Próxima rotina sugerida: a seguinte à última rotina usada (na ordem da lista).
export async function proximaRotina() {
  const rotinas = await listarRotinas();
  if (!rotinas.length) return null;
  // Treino sem rotina ligada (ex.: importado do Hevy) conta pela rotina de mesmo nome
  const nome = s => normalizar(s || '').trim();
  const daRotina = t => (t.rotina_id && rotinas.findIndex(r => r.id === t.rotina_id) + 1) || rotinas.findIndex(r => nome(r.nome) === nome(t.nome)) + 1;
  const ultimo = (await listarTreinos()).find(daRotina);
  if (!ultimo) return rotinas[0];
  const i = daRotina(ultimo) - 1;
  return rotinas[(i + 1) % rotinas.length];
}
