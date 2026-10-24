// Banco local (IndexedDB), genérico para qualquer módulo.
//
// Todos os registros de todas as tabelas ficam num único object store,
// então criar um módulo novo (ex.: dieta) NÃO exige mudar a versão do banco.
// Cada registro tem: id (UUID), updated_at, deleted (exclusão lógica) e os
// campos do próprio módulo. O campo "sujo" marca o que ainda não foi enviado
// ao Supabase.

import { uuid, agoraISO, Bus } from './util.js';

const NOME = 'aplicativo';
const VERSAO = 1;
let conexao = null;
const cache = new Map(); // tabela -> Map(id -> registro)

function abrir() {
  if (conexao) return Promise.resolve(conexao);
  return new Promise((ok, erro) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('registros')) {
        const s = db.createObjectStore('registros', { keyPath: 'chave' });
        s.createIndex('tabela', 'tabela');
        s.createIndex('sujo', 'sujo');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => {
      conexao = req.result;
      conexao.onversionchange = () => conexao.close();
      ok(conexao);
    };
    req.onerror = () => erro(req.error);
  });
}

function tx(store, modo, fn) {
  return abrir().then(db => new Promise((ok, erro) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    let resultado;
    Promise.resolve(fn(s)).then(r => { resultado = r; });
    t.oncomplete = () => ok(resultado);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error);
  }));
}
const pedido = r => new Promise((ok, erro) => { r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });

// Separa os metadados internos do registro do módulo.
const empacotar = (tabela, reg, sujo) => ({ chave: `${tabela}:${reg.id}`, tabela, sujo: sujo ? 1 : 0, reg });

async function carregarTabela(tabela) {
  if (cache.has(tabela)) return cache.get(tabela);
  const linhas = await tx('registros', 'readonly', s => pedido(s.index('tabela').getAll(tabela)));
  const mapa = new Map(linhas.map(l => [l.reg.id, l.reg]));
  cache.set(tabela, mapa);
  return mapa;
}

export const DB = {
  abrir,

  // Lista os registros (sem os excluídos, a menos que pedido).
  async todos(tabela, { incluirExcluidos = false } = {}) {
    const mapa = await carregarTabela(tabela);
    const lista = [...mapa.values()];
    return incluirExcluidos ? lista : lista.filter(r => !r.deleted);
  },

  async obter(tabela, id) {
    const mapa = await carregarTabela(tabela);
    const r = mapa.get(id);
    return r && !r.deleted ? r : null;
  },

  // Salva (cria ou atualiza) um registro feito pelo usuário. Marca como pendente de envio.
  async salvar(tabela, dados) {
    const reg = { ...dados, id: dados.id || uuid(), updated_at: agoraISO(), deleted: !!dados.deleted };
    if (!reg.created_at) reg.created_at = reg.updated_at;
    await tx('registros', 'readwrite', s => s.put(empacotar(tabela, reg, true)));
    (await carregarTabela(tabela)).set(reg.id, reg);
    Bus.emit('dados:alterados', { tabela, id: reg.id, local: true });
    return reg;
  },

  // Exclusão lógica: o registro continua existindo com deleted = true,
  // para que a exclusão também chegue aos outros aparelhos.
  async excluir(tabela, id) {
    const mapa = await carregarTabela(tabela);
    const atual = mapa.get(id);
    if (!atual) return;
    return DB.salvar(tabela, { ...atual, deleted: true });
  },

  // Grava registros vindos do servidor (não marca como pendente) ou de um
  // backup importado (marca como pendente para subir ao servidor).
  async gravarRemotos(tabela, regs, { pendente = false } = {}) {
    if (!regs.length) return;
    const mapa = await carregarTabela(tabela);
    await tx('registros', 'readwrite', s => { regs.forEach(r => s.put(empacotar(tabela, r, pendente))); });
    regs.forEach(r => mapa.set(r.id, r));
    Bus.emit('dados:alterados', { tabela, local: pendente });
  },

  // Registro bruto, incluindo o indicador de pendência.
  async bruto(tabela, id) {
    return tx('registros', 'readonly', s => pedido(s.get(`${tabela}:${id}`)));
  },

  async pendentes() {
    return tx('registros', 'readonly', s => pedido(s.index('sujo').getAll(1)));
  },

  async contarPendentes() {
    return tx('registros', 'readonly', s => pedido(s.index('sujo').count(1)));
  },

  // Marca como enviado, desde que não tenha sido alterado de novo durante o envio.
  async marcarEnviados(itens) {
    await tx('registros', 'readwrite', async s => {
      for (const { tabela, id, updated_at } of itens) {
        const linha = await pedido(s.get(`${tabela}:${id}`));
        if (linha && linha.reg.updated_at === updated_at) { linha.sujo = 0; s.put(linha); }
      }
    });
  },

  async marcarTudoPendente() {
    await tx('registros', 'readwrite', async s => {
      const linhas = await pedido(s.getAll());
      linhas.forEach(l => { l.sujo = 1; s.put(l); });
    });
  },

  async exportarTudo() {
    const linhas = await tx('registros', 'readonly', s => pedido(s.getAll()));
    const tabelas = {};
    linhas.forEach(l => { (tabelas[l.tabela] ||= []).push(l.reg); });
    return tabelas;
  },

  async apagarTudo() {
    await tx('registros', 'readwrite', s => s.clear());
    await tx('meta', 'readwrite', s => s.clear());
    cache.clear();
    Bus.emit('dados:alterados', { tabela: '*' });
  },

  meta: {
    async obter(k, padrao = null) {
      const r = await tx('meta', 'readonly', s => pedido(s.get(k)));
      return r ? r.v : padrao;
    },
    async definir(k, v) { await tx('meta', 'readwrite', s => s.put({ k, v })); },
    async remover(k) { await tx('meta', 'readwrite', s => s.delete(k)); },
  },
};
