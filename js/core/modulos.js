// Registro de módulos. Cada módulo (treino, corpo, dieta...) se registra aqui
// declarando suas abas, rotas, tabelas sincronizadas e cartões da tela "Hoje".
// Assim, adicionar um módulo novo não exige mexer no código dos outros.

import { Sync } from './sync.js';

const modulos = [];
const rotas = [];          // { padrao: RegExp, chaves: [], view, opcoes }
const cartoesHoje = [];    // { ordem, render(el) }

export const Modulos = {
  /**
   * @param {object} m
   * @param {string} m.id
   * @param {{rota:string, nome:string, icone:string, ordem:number}} [m.aba]  aba na barra inferior
   * @param {string[]} [m.tabelas]   tabelas sincronizadas com o Supabase
   * @param {Object<string, Function|{view:Function, recarregar?:boolean}>} [m.rotas]
   * @param {{ordem:number, render:Function}[]} [m.cartoesHoje]
   */
  registrar(m) {
    modulos.push(m);
    (m.tabelas || []).forEach(t => Sync.registrarTabela(t));
    Object.entries(m.rotas || {}).forEach(([caminho, def]) => {
      const chaves = [];
      const re = new RegExp('^' + caminho.replace(/:(\w+)/g, (_, k) => { chaves.push(k); return '([^/]+)'; }) + '/?$');
      const opcoes = typeof def === 'function' ? { view: def } : def;
      rotas.push({ padrao: re, chaves, ...opcoes, modulo: m.id });
    });
    (m.cartoesHoje || []).forEach(c => cartoesHoje.push(c));
  },

  abas() {
    return modulos.filter(m => m.aba).map(m => ({ ...m.aba, id: m.id })).sort((a, b) => a.ordem - b.ordem);
  },

  existe(id) { return modulos.some(m => m.id === id); },

  cartoesHoje() { return [...cartoesHoje].sort((a, b) => a.ordem - b.ordem); },

  resolver(caminho) {
    for (const r of rotas) {
      const m = caminho.match(r.padrao);
      if (m) {
        const params = {};
        r.chaves.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { ...r, params };
      }
    }
    return null;
  },
};
