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

async function enviar(cliente, userId) {
  const pendentes = await DB.pendentes();
  const porTabela = {};
  pendentes.filter(p => tabelas.has(p.tabela)).forEach(p => (porTabela[p.tabela] ||= []).push(p.reg));
  for (const [tabela, regs] of Object.entries(porTabela)) {
    for (let i = 0; i < regs.length; i += LOTE) {
      const lote = regs.slice(i, i + LOTE);
      const { error } = await cliente.from(tabela).upsert(lote.map(r => paraRemoto(r, userId)), { onConflict: 'id' });
      if (error) throw error;
      await DB.marcarEnviados(lote.map(r => ({ tabela, id: r.id, updated_at: r.updated_at })));
    }
  }
}

async function baixar(cliente, userId) {
  for (const tabela of tabelas) {
    const chaveCursor = `cursor:${userId}:${tabela}`;
    const inicio = await DB.meta.obter(chaveCursor, '1970-01-01T00:00:00Z');
    let cursor = inicio;
    let pagina = 0;
    for (;;) {
      const { data, error } = await cliente.from(tabela)
        .select('id, updated_at, deleted, data, server_updated_at')
        .gte('server_updated_at', inicio)
        .order('server_updated_at', { ascending: true })
        .range(pagina * 1000, pagina * 1000 + 999);
      if (error) throw error;
      if (!data.length) break;

      // Mescla: só substitui o local se o remoto for igual ou mais novo,
      // ou se o local não tiver alterações pendentes.
      const aGravar = [];
      for (const linha of data) {
        const bruto = await DB.bruto(tabela, linha.id);
        if (bruto && bruto.sujo && bruto.reg.updated_at > linha.updated_at) continue;
        if (bruto && !bruto.sujo && bruto.reg.updated_at === linha.updated_at && !!bruto.reg.deleted === !!linha.deleted) continue;
        aGravar.push(paraLocal(linha));
      }
      await DB.gravarRemotos(tabela, aGravar);
      cursor = data[data.length - 1].server_updated_at;
      if (data.length < 1000) break;
      pagina++;
    }
    await DB.meta.definir(chaveCursor, cursor);
  }
}

async function executar() {
  const cliente = Auth.cliente();
  const usuario = Auth.usuario();
  if (!cliente || !usuario) { definirEstado('local'); return; }
  if (!navigator.onLine) { definirEstado('offline'); return; }
  definirEstado('sincronizando');
  try {
    await enviar(cliente, usuario.id);
    await baixar(cliente, usuario.id);
    await enviar(cliente, usuario.id); // o que mudou durante o download
    ultimaSync = new Date().toISOString();
    await DB.meta.definir('ultimaSync', ultimaSync);
    await atualizarEstado();
  } catch (e) {
    console.error('Erro de sincronização', e);
    definirEstado(navigator.onLine ? 'erro' : 'offline', e.message || String(e));
  }
}

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

  info: () => ({ estado, erro: ultimoErro, ultimaSync, logado: !!Auth.usuario() }),

  sincronizar() {
    if (!emAndamento) emAndamento = executar().finally(() => { emAndamento = null; });
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
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.sincronizar(); });
    setInterval(() => { if (document.visibilityState === 'visible') Sync.sincronizar(); }, 60_000);
    await atualizarEstado();
  },
};
