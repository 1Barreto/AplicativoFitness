// Água: garrafas tomadas no dia.
//
// Tabelas (mesmo formato das outras, sincronizadas com o Supabase):
//   agua         um registro por garrafa marcada: { dia: 'aaaa-mm-dd', ml }
//   agua_config  { garrafa (ml que cabem na garrafa), meta (ml por dia) }
//
// O total do dia NÃO é um número guardado: é a soma das garrafas marcadas.
// Assim, marcar no celular e no computador ao mesmo tempo soma certo, e
// desfazer é só apagar a última garrafa. Cada garrafa guarda o próprio ml,
// então trocar de garrafa não muda os dias anteriores.

import { DB } from '../../core/db.js';
import { dataInput } from '../../core/util.js';
import { pesoAtual } from '../corpo/dados.js';

export const TA = { registros: 'agua', config: 'agua_config' };
export const hojeISO = () => dataInput();

export async function obterConfig() {
  const l = (await DB.todos(TA.config)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return l[0] || null;
}
export const salvarConfig = c => DB.salvar(TA.config, c);

// Meta sugerida: 35 ml por kg de peso (arredondada a 100 ml); sem peso, 3 L.
export async function metaSugerida() {
  const p = await pesoAtual().catch(() => null);
  return p?.valor > 0 ? Math.round(p.valor * 35 / 100) * 100 : 3000;
}

export async function garrafasDoDia(dia = hojeISO()) {
  return (await DB.todos(TA.registros)).filter(r => r.dia === dia)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

export const marcarGarrafa = (ml, dia = hojeISO()) => DB.salvar(TA.registros, { dia, ml });

export async function desfazerUltima(dia = hojeISO()) {
  const l = await garrafasDoDia(dia);
  if (l.length) await DB.excluir(TA.registros, l[l.length - 1].id);
}

// 1950 → "1,95 L"; 800 → "800 ml"
export function fmtLitros(ml) {
  if (!ml) return '0 L';
  if (ml < 1000) return `${Math.round(ml)} ml`;
  return `${(ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`;
}
