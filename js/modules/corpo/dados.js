// Dados de medidas corporais. Também usado por outros módulos
// (ex.: o futuro módulo de dieta usará pesoAtual()).

import { DB } from '../../core/db.js';

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
