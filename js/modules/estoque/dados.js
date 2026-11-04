// Estoque de casa: o que tem na despensa/geladeira, descontado sozinho pela dieta.
//
// Tabelas (mesmo formato das outras, sincronizadas com o Supabase):
//   estoque      um registro por item que você escolheu acompanhar
//     { nome, alimentos: [{ fonte, ref, nome }], unidade: 'g' | 'ml' | 'un',
//       pesoUnidade (g por unidade, quando unidade = 'un'), minimo, ideal,
//       validade ('aaaa-mm-dd' | ''), auto (descontar pela dieta), desde ('aaaa-mm-dd') }
//   estoque_mov  histórico de movimentações
//     { item, tipo: 'consumo' | 'compra' | 'ajuste', qtd (com sinal, na unidade do item),
//       diario (id do item do diário, no consumo), dia, nota, estornado, ignorado }
//
// A quantidade atual NÃO é um número guardado: é a soma das movimentações que
// não foram estornadas. Assim, desfazer ou corrigir qualquer coisa é só estornar
// ou ajustar a movimentação, e dois aparelhos nunca brigam por um contador.
//
// Só entram no estoque os alimentos que você cadastrou aqui. O resto da dieta
// não é acompanhado.

import { DB } from '../../core/db.js';
import { Sync } from '../../core/sync.js';
import { Bus, debounce, fmtNum } from '../../core/util.js';
import { T as TD, itemFeito, hojeISO } from '../dieta/dados.js';

export const TE = { itens: 'estoque', mov: 'estoque_mov' };
export const UNIDADES = { g: 'g', ml: 'ml', un: 'un' };

// ---------- Itens ----------
export async function listarItens() {
  return (await DB.todos(TE.itens)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
export const obterItem = id => DB.obter(TE.itens, id);

// Cria ou edita um item. Num item novo, a quantidade inicial vira uma
// movimentação "ajuste" (Estoque inicial), para o histórico começar certo.
export async function salvarItem(item, { inicial = null } = {}) {
  const novo = !item.id;
  const salvo = await DB.salvar(TE.itens, { auto: true, desde: hojeISO(), alimentos: [], ...item });
  if (novo && inicial > 0) await DB.salvar(TE.mov, { item: salvo.id, tipo: 'ajuste', qtd: inicial, nota: 'Estoque inicial', dia: hojeISO() });
  return salvo;
}
export async function excluirItem(id) {
  await DB.excluir(TE.itens, id);
  for (const m of await movimentosDe(id)) await DB.excluir(TE.mov, m.id);
}

// ---------- Movimentações ----------
export async function movimentosDe(itemId) {
  return (await DB.todos(TE.mov)).filter(m => m.item === itemId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

// Saldo de cada item: soma das movimentações válidas. Pode ficar negativo
// (comeu mais do que estava cadastrado); a tela mostra 0 com um aviso.
export async function saldos() {
  const r = new Map();
  for (const m of await DB.todos(TE.mov)) {
    if (m.estornado) continue;
    r.set(m.item, (r.get(m.item) || 0) + (m.qtd || 0));
  }
  return r;
}

export function compra(item, qtd, { validade = null } = {}) {
  if (validade != null) DB.salvar(TE.itens, { ...item, validade });
  return DB.salvar(TE.mov, { item: item.id, tipo: 'compra', qtd, dia: hojeISO() });
}

// Ajuste manual: grava a diferença entre o que você contou e o saldo atual.
// Se o saldo estava negativo, conta a partir dele, para a soma dar o valor contado.
export function ajuste(item, contado, saldoAtual) {
  const dif = arred(contado - saldoAtual);
  if (!dif) return null;
  return DB.salvar(TE.mov, { item: item.id, tipo: 'ajuste', qtd: dif, nota: `Contado: ${fmtQtd(contado, item)}`, dia: hojeISO() });
}

// Desfazer uma movimentação.
// Compra e ajuste: estorna (deixa de contar, mas fica no histórico).
// Consumo: o desconto vem da dieta, então "ignorar" marca para não voltar
// a descontar esse item do diário, mesmo que a sincronização rode de novo.
export const desfazer = m => DB.salvar(TE.mov, { ...m, estornado: true, ...(m.tipo === 'consumo' ? { ignorado: true } : {}) });
export const refazer = m => DB.salvar(TE.mov, { ...m, estornado: false, ignorado: false });

// ---------- Conversão e níveis ----------
// Quantidade do diário (sempre em gramas) para a unidade do item.
// ml: tratamos 1 g = 1 ml (leite, iogurte, sucos; diferença pequena na prática).
// un: gramas ÷ peso de uma unidade (ex.: 120 g de ovo ÷ 60 g = 2 ovos).
export function converter(item, gramas) {
  if (item.unidade === 'un') return item.pesoUnidade > 0 ? gramas / item.pesoUnidade : 0;
  return gramas;
}

// Nível bom (alvo da reposição): o informado, ou o dobro do mínimo
export const idealDe = item => (item.ideal > 0 ? item.ideal : item.minimo > 0 ? item.minimo * 2 : 0);

// 'acabou' | 'baixo' | 'ok'
export function nivel(item, saldo) {
  if (saldo <= 0) return 'acabou';
  if (item.minimo > 0 && saldo <= item.minimo) return 'baixo';
  return 'ok';
}
export const precisaComprar = (item, saldo) => saldo <= 0 || (item.minimo > 0 && saldo <= item.minimo);
export const faltaPara = (item, saldo) => Math.max(0, idealDe(item) - Math.max(0, saldo));

// Dias até a validade (negativo = vencido), ou null
export function diasValidade(item, hoje = hojeISO()) {
  if (!item.validade) return null;
  return Math.round((new Date(`${item.validade}T12:00:00`) - new Date(`${hoje}T12:00:00`)) / 864e5);
}

const arred = v => Math.round(v * 100) / 100;
export function fmtQtd(v, item) {
  const n = Math.max(0, v);
  if (item.unidade === 'un') return `${fmtNum(Math.round(n * 10) / 10)} un`;
  if (n >= 1000) return `${fmtNum(Math.round(n / 100) / 10)} ${item.unidade === 'ml' ? 'L' : 'kg'}`;
  return `${fmtNum(Math.round(n))} ${item.unidade}`;
}

// ---------- Desconto automático pela dieta ----------
// UUID determinístico: a movimentação de consumo de um item do diário sempre
// tem o mesmo id. Se o iPhone e o computador reconciliarem ao mesmo tempo,
// os dois gravam o MESMO registro, em vez de descontar duas vezes.
const idsCache = new Map();
async function uuidDe(texto) {
  if (idsCache.has(texto)) return idsCache.get(texto);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto)));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = [...hash.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  idsCache.set(texto, id);
  return id;
}

export const chaveAlimento = a => `${a.fonte}:${a.ref}`;

// Reconciliação: compara o diário com as movimentações de consumo e corrige
// a diferença. Em vez de reagir a cada clique (marcar, editar, apagar), ela
// calcula o que DEVERIA estar descontado e ajusta. Por isso cobre qualquer
// caminho: marcar a refeição como feita, desmarcar, mudar a quantidade,
// apagar o alimento, copiar um dia, aplicar o plano, ou mudanças vindas do
// outro aparelho pela sincronização.
//
// Regras:
//  - Só itens com "auto" ligado e com pelo menos um alimento vinculado.
//  - Só itens do diário FEITOS (planejado não desconta).
//  - Só dias a partir de "desde" (o dia em que o item entrou no estoque),
//    para o histórico antigo da dieta não zerar o estoque novo.
export async function reconciliar() {
  const itens = (await DB.todos(TE.itens)).filter(i => i.auto !== false && i.alimentos?.length);
  const ativos = new Set(itens.map(i => i.id));
  const porAlimento = new Map();
  for (const it of itens) for (const a of it.alimentos) if (!porAlimento.has(chaveAlimento(a))) porAlimento.set(chaveAlimento(a), it);

  // 1. O que deveria estar descontado: id da movimentação -> dados
  const hoje = hojeISO();
  const devido = new Map();
  if (porAlimento.size) {
    for (const d of await DB.todos(TD.diario)) {
      if (!d.alimento || !itemFeito(d, hoje)) continue;
      const it = porAlimento.get(chaveAlimento(d.alimento));
      if (!it || d.dia < (it.desde || '')) continue;
      const qtd = arred(converter(it, d.gramas || 0));
      if (!qtd) continue;
      devido.set(await uuidDe(`consumo:${it.id}:${d.id}`), { item: it.id, diario: d.id, dia: d.dia, qtd: -qtd, nota: d.alimento.nome });
    }
  }

  // 2. Compara com o que já existe e corrige
  let mudancas = 0;
  const existentes = (await DB.todos(TE.mov, { incluirExcluidos: true })).filter(m => m.tipo === 'consumo' && ativos.has(m.item));
  for (const m of existentes) {
    const d = devido.get(m.id);
    devido.delete(m.id);
    if (m.deleted || m.ignorado) continue;           // você mandou ignorar: não mexe
    if (!d) {
      // O alimento foi desmarcado, apagado ou desvinculado: estorna o desconto
      if (!m.estornado) { await DB.salvar(TE.mov, { ...m, estornado: true }); mudancas++; }
    } else if (m.estornado || Math.abs(m.qtd - d.qtd) > 0.001 || m.item !== d.item) {
      // Quantidade editada (ou o item voltou a ser feito): ajusta o mesmo registro
      await DB.salvar(TE.mov, { ...m, ...d, estornado: false });
      mudancas++;
    }
  }
  // 3. Consumos novos
  for (const [id, d] of devido) {
    await DB.salvar(TE.mov, { id, tipo: 'consumo', ...d });
    mudancas++;
  }
  return mudancas;
}

// Roda sozinha quando o diário ou o estoque mudam (aqui ou vindo da nuvem).
// Uma execução por vez; se algo mudar durante, roda de novo no fim.
let rodando = false, deNovo = false;
// Durante o download da nuvem espera terminar: num aparelho recém-conectado,
// os itens podem chegar antes das movimentações (ex.: um consumo que você
// mandou ignorar), e descontar nessa hora desfaria a sua escolha.
async function executar() {
  if (Sync.info().estado === 'sincronizando') { deNovo = true; return; }
  if (rodando) { deNovo = true; return; }
  rodando = true;
  try { await reconciliar(); } catch (e) { console.error('Estoque: falha ao descontar', e); }
  rodando = false;
  if (deNovo) { deNovo = false; executar(); }
}
const agendar = debounce(executar, 400);
Bus.on('dados:alterados', ({ tabela }) => { if (tabela === TD.diario || tabela === TE.itens) agendar(); });
Bus.on('sync:estado', ({ estado }) => { if (estado !== 'sincronizando' && deNovo) { deNovo = false; agendar(); } });
agendar();
// Ao voltar para o app: um item planejado de ontem que ficou sem marcar passa
// a contar como feito depois da meia-noite, então confere de novo.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') agendar(); });
