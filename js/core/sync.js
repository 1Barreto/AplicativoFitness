// Sincronização genérica IndexedDB <-> Supabase (offline-first).
//
// Qualquer módulo registra suas tabelas com Sync.registrarTabela('nome').
// Todas as tabelas no Supabase seguem o mesmo formato:
//   id uuid, user_id uuid, updated_at, deleted, data jsonb, server_updated_at
// "data" guarda os campos do módulo, então a mesma lógica serve para treino,
// medidas, dieta etc.
//
// Conflitos: vence a alteração mais recente (updated_at). O servidor também
// recusa versões mais antigas (gatilho no SQL).
// Download incremental: usamos server_updated_at (relógio do servidor), assim
// alterações feitas offline e enviadas mais tarde nunca são perdidas.

import { DB } from './db.js';
import { Auth } from './auth.js';
import { Bus, debounce } from './util.js';

const tabelas = new Set();
const CAMPOS_META = ['id', 'updated_at', 'deleted'];
const LOTE = 500;

let estado = 'local';      // local | offline | pendente | sincronizando | sincronizado | erro
let ultimoErro = null;
let emAndamento = null;
let ultimaSync = null;

function definirEstado(e, erro = null) {
  estado = e; ultimoErro = erro;
  Bus.emit('sync:estado', Sync.info());
}

function paraRemoto(reg, userId) {
  const data = {};
  for (const [k, v] of Object.entries(reg)) if (!CAMPOS_META.includes(k)) data[k] = v;
  return { id: reg.id, user_id: userId, updated_at: reg.updated_at, deleted: !!reg.deleted, data };
}
function paraLocal(linha) {
  return { ...(linha.data || {}), id: linha.id, updated_at: linha.updated_at, deleted: !!linha.deleted };
}

// Tabela de um módulo novo que ainda não foi criada no Supabase (o SQL não foi
// rodado): o resto sincroniza normalmente e os dados dela ficam guardados no
// aparelho, esperando a tabela existir.
const ausentes = new Set();
const tabelaAusente = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message || ''));

async function enviar(cliente, userId) {
  const pendentes = await DB.pendentes();
  const porTabela = {};
  pendentes.filter(p => tabelas.has(p.tabela)).forEach(p => (porTabela[p.tabela] ||= []).push(p.reg));
  for (const [tabela, regs] of Object.entries(porTabela)) {
    for (let i = 0; i < regs.length; i += LOTE) {
      const lote = regs.slice(i, i + LOTE);
      const { error } = await cliente.from(tabela).upsert(lote.map(r => paraRemoto(r, userId)), { onConflict: 'id' });
      if (tabelaAusente(error)) { ausentes.add(tabela); break; } // fica pendente até a tabela existir
      if (error) throw error;
      await DB.marcarEnviados(lote.map(r => ({ tabela, id: r.id, updated_at: r.updated_at })));
    }
  }
}

// Baixa o que mudou no servidor desde a última vez (cursor por tabela).
// As tabelas são consultadas em paralelo (4 por vez) em vez de uma depois da outra.
async function baixar(cliente, userId) {
  const fila = [...tabelas];
  const trabalhador = async () => { for (let t; (t = fila.shift());) await baixarTabela(cliente, userId, t); };
  await Promise.all(Array.from({ length: Math.min(4, fila.length) }, trabalhador));
}

async function baixarTabela(cliente, userId, tabela) {
  const chaveCursor = `cursor:${userId}:${tabela}`;
  const inicio = await DB.meta.obter(chaveCursor, '1970-01-01T00:00:00Z');
  let cursor = inicio;
  let pagina = 0;
  for (;;) {
    const { data, error } = await cliente.from(tabela)
      .select('id, updated_at, deleted, data, server_updated_at')
      .eq('user_id', userId) // tabelas do feed deixam ler os dados dos outros: baixa só os seus
      .gte('server_updated_at', inicio)
      .order('server_updated_at', { ascending: true })
      .range(pagina * 1000, pagina * 1000 + 999);
    if (tabelaAusente(error)) { ausentes.add(tabela); return; }
    if (error) throw error;
    if (!data.length) break;

    // Mescla: só substitui o local se o remoto for igual ou mais novo,
    // ou se o local não tiver alterações pendentes. Os registros locais vêm
    // da memória (uma leitura só), em vez de uma consulta ao banco por linha.
    const locais = new Map((await DB.todos(tabela, { incluirExcluidos: true })).map(r => [r.id, r]));
    const sujos = await DB.idsPendentes(tabela);
    const aGravar = [];
    for (const linha of data) {
      const local = locais.get(linha.id), sujo = sujos.has(linha.id);
      if (local && sujo && local.updated_at > linha.updated_at) continue;
      if (local && !sujo && local.updated_at === linha.updated_at && !!local.deleted === !!linha.deleted) continue;
      aGravar.push(paraLocal(linha));
    }
    await DB.gravarRemotos(tabela, aGravar);
    cursor = data[data.length - 1].server_updated_at;
    if (data.length < 1000) break;
    pagina++;
  }
  await DB.meta.definir(chaveCursor, cursor);
}

// Se o servidor não responder, a sincronização vira "Erro" em vez de ficar
// "Sincronizando" para sempre.
const LIMITE_MS = 90_000;
const comLimite = p => Promise.race([p, new Promise((_, erro) => setTimeout(() => erro(new Error('O servidor demorou demais para responder. Toque para tentar de novo.')), LIMITE_MS))]);

// silenciosa: verificações automáticas (a cada minuto, ao voltar para o app)
// só mostram "Sincronizando" quando há algo para enviar.
async function executar({ silenciosa = false } = {}) {
  const cliente = Auth.cliente();
  const usuario = Auth.usuario();
  if (!cliente || !usuario) { definirEstado('local'); return; }
  if (!navigator.onLine) { definirEstado('offline'); return; }
  if (!silenciosa || await DB.contarPendentes()) definirEstado('sincronizando');
  try {
    ausentes.clear();
    await comLimite((async () => {
      await enviar(cliente, usuario.id);
      await baixar(cliente, usuario.id);
      await enviar(cliente, usuario.id); // o que mudou durante o download
    })());
    ultimaSync = new Date().toISOString();
    await DB.meta.definir('ultimaSync', ultimaSync);
    await concluir();
  } catch (e) {
    console.error('Erro de sincronização', e);
    definirEstado(navigator.onLine ? 'erro' : 'offline', e.message || String(e));
  }
}
// estado pode ter ficado como estava numa verificação silenciosa
async function concluir() { if (estado === 'sincronizando') estado = ''; await atualizarEstado(); }

async function atualizarEstado() {
  if (estado === 'sincronizando') return;
  if (!Auth.usuario()) return definirEstado('local');
  if (!navigator.onLine) return definirEstado('offline');
  const n = await DB.contarPendentes();
  definirEstado(n ? 'pendente' : 'sincronizado');
}

const agendar = debounce(() => Sync.sincronizar(), 2500);

export const Sync = {
  registrarTabela(nome) { tabelas.add(nome); },
  tabelas: () => [...tabelas],

  info: () => ({ estado, erro: ultimoErro, ultimaSync, logado: !!Auth.usuario(), ausentes: [...ausentes] }),

  sincronizar(opcoes) {
    if (!emAndamento) emAndamento = executar(opcoes).finally(() => { emAndamento = null; });
    return emAndamento;
  },

  async iniciar() {
    ultimaSync = await DB.meta.obter('ultimaSync');
    Bus.on('dados:alterados', ({ local }) => { if (local) { atualizarEstado(); agendar(); } });
    Bus.on('auth:mudou', async (s) => {
      if (s) {
        // Ao entrar (ou trocar de conta), envia também o que foi criado antes do login.
        const dono = await DB.meta.obter('dono');
        if (dono !== s.user.id) { await DB.marcarTudoPendente(); await DB.meta.definir('dono', s.user.id); }
        Sync.sincronizar();
      } else atualizarEstado();
    });
    addEventListener('online', () => Sync.sincronizar());
    addEventListener('offline', () => atualizarEstado());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.sincronizar({ silenciosa: true }); });
    setInterval(() => { if (document.visibilityState === 'visible') Sync.sincronizar({ silenciosa: true }); }, 60_000);
    await atualizarEstado();
  },
};
