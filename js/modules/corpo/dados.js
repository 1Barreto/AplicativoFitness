// Dados de medidas corporais. Também usado por outros módulos
// (ex.: o futuro módulo de dieta usará pesoAtual()).

import { DB } from '../../core/db.js';
import { dataInput } from '../../core/util.js';

export const TABELA_MEDIDAS = 'medidas';

// Campos registráveis (chave, rótulo, unidade)
export const CAMPOS_MEDIDA = [
  ['peso', 'Peso', 'kg'],
  ['gordura', 'Gordura corporal', '%'],
  ['massa_magra', 'Massa magra', 'kg'],
  ['pescoco', 'Pescoço', 'cm'],
  ['ombros', 'Ombros', 'cm'],
  ['peito', 'Peito', 'cm'],
  ['cintura', 'Cintura', 'cm'],
  ['abdomen', 'Abdômen', 'cm'],
  ['quadril', 'Quadril', 'cm'],
  ['braco_d', 'Braço direito', 'cm'],
  ['braco_e', 'Braço esquerdo', 'cm'],
  ['antebraco_d', 'Antebraço direito', 'cm'],
  ['antebraco_e', 'Antebraço esquerdo', 'cm'],
  ['coxa_d', 'Coxa direita', 'cm'],
  ['coxa_e', 'Coxa esquerda', 'cm'],
  ['panturrilha_d', 'Panturrilha direita', 'cm'],
  ['panturrilha_e', 'Panturrilha esquerda', 'cm'],
];

export async function listarMedidas() {
  const l = await DB.todos(TABELA_MEDIDAS);
  return l.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}
export const salvarMedida = m => DB.salvar(TABELA_MEDIDAS, m);
export const excluirMedida = id => DB.excluir(TABELA_MEDIDAS, id);

// Último valor registrado de um campo: { valor, data } ou null
export async function ultimoValor(campo) {
  const m = (await listarMedidas()).find(x => x[campo] !== null && x[campo] !== undefined && x[campo] !== '');
  return m ? { valor: m[campo], data: m.data } : null;
}

export const pesoAtual = () => ultimoValor('peso');

// Tendência do peso: média móvel exponencial por dia (10% do peso novo a cada
// pesagem). Suaviza o sobe e desce diário de água e sal. Dias sem pesagem
// repetem a tendência do dia anterior.
// Retorna Map('aaaa-mm-dd' -> kg) do primeiro dia com peso até "ate" (inclusive).
export function tendenciaPeso(medidas, ate = dataInput()) {
  const porDia = new Map();
  [...medidas].filter(m => m.peso > 0).sort((a, b) => (a.data || '').localeCompare(b.data || ''))
    .forEach(m => porDia.set(dataInput(m.data), m.peso)); // a última do dia vale
  const dias = [...porDia.keys()].sort();
  const r = new Map();
  if (!dias.length) return r;
  let t = porDia.get(dias[0]);
  for (let d = dias[0]; d <= ate; d = proximoDia(d)) {
    if (porDia.has(d)) t += 0.1 * (porDia.get(d) - t);
    r.set(d, Math.round(t * 100) / 100);
  }
  return r;
}
function proximoDia(d) {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + 1);
  return dataInput(x);
}
