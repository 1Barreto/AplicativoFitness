// Ponto de entrada: inicia banco local, login, sincronização, módulos e rotas.

import { DB } from './core/db.js';
import { Auth } from './core/auth.js';
import { Sync } from './core/sync.js';
import { Modulos } from './core/modulos.js';
import { Bus, debounce, dataInput } from './core/util.js';
import { Icone, definirTitulo, toast } from './core/ui.js';
import { som } from './core/som.js';
import './modules/index.js';

const conteudo = document.getElementById('conteudo');
let limpezaAtual = null;
let rotaAtual = null;
let contadorRender = 0;

function caminhoAtual() {
  const h = location.hash.replace(/^#/, '') || '/hoje';
  const [caminho, busca] = h.split('?');
  return { caminho, query: Object.fromEntries(new URLSearchParams(busca || '')) };
}

async function renderizar({ preservarRolagem = false } = {}) {
  const { caminho, query } = caminhoAtual();
  const meu = ++contadorRender;
  const rota = Modulos.resolver(caminho);
  if (!rota) { location.replace('#/hoje'); return; }
  const rolagem = preservarRolagem ? window.scrollY : 0;
  if (typeof limpezaAtual === 'function') { try { limpezaAtual(); } catch (e) { console.error(e); } }
  limpezaAtual = null;
  rotaAtual = rota;

  const dentro = (r) => caminho === r || caminho.startsWith(r + '/');
  document.querySelectorAll('.tabbar a').forEach(a => {
    const rotas = [a.dataset.rota, ...(a.dataset.inclui ? a.dataset.inclui.split(',') : [])];
    a.classList.toggle('ativa', rotas.some(dentro));
  });
  document.getElementById('btn-ajustes').classList.toggle('ativa', caminho.startsWith('/ajustes'));
  document.body.dataset.rota = caminho.split('/')[1] || '';
  document.body.classList.toggle('em-treino', caminho === '/treino/ativo');

  definirTitulo('');
  const el = document.createElement('div');
  el.className = 'tela';
  try {
    limpezaAtual = await rota.view(el, rota.params, query);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="cartao"><h3>Algo deu errado</h3><p class="sutil">${e.message}</p></div>`;
  }
  if (meu !== contadorRender) { if (typeof limpezaAtual === 'function') limpezaAtual(); return; }
  // Evita "piscar": troca o conteúdo de uma vez
  conteudo.replaceChildren(el);
  window.scrollTo(0, rolagem);
  Bus.emit('rota:mudou', caminho);
}

function montarAbas() {
  document.getElementById('tabbar').innerHTML = Modulos.abas().map(a =>
    `<a href="#${a.rota}" data-rota="${a.rota}" data-inclui="${(a.inclui || []).join(',')}">${a.icone}<span>${a.nome}</span></a>`).join('');
  document.getElementById('btn-ajustes').innerHTML = Icone.ajustes;
  document.getElementById('btn-voltar').innerHTML = Icone.voltar;
}

const ROTULOS_SYNC = {
  local: ['Local', 'Dados só neste aparelho. Entre na sua conta em Ajustes para sincronizar.'],
  offline: ['Offline', 'Sem internet. As alterações serão enviadas quando a conexão voltar.'],
  pendente: ['Pendente', 'Há alterações aguardando envio.'],
  sincronizando: ['Sincronizando', 'Sincronizando…'],
  sincronizado: ['Sincronizado', 'Tudo sincronizado.'],
  erro: ['Erro', 'Erro na sincronização. Toque para tentar de novo.'],
};
function mostrarEstadoSync(info) {
  const b = document.getElementById('sync-pill');
  const [rotulo, dica] = ROTULOS_SYNC[info.estado] || ROTULOS_SYNC.local;
  b.className = `sync-pill estado-${info.estado}`;
  b.innerHTML = `<i></i><span>${rotulo}</span>`;
  b.title = info.erro ? `${dica}\n${info.erro}` : dica;
}

async function iniciar() {
  montarAbas();
  await DB.abrir();
  Bus.on('sync:estado', mostrarEstadoSync);
  mostrarEstadoSync(Sync.info());
  document.getElementById('sync-pill').onclick = () => {
    if (!Auth.usuario()) { location.hash = '#/ajustes'; return; }
    Sync.sincronizar().then(() => {
      const i = Sync.info();
      if (i.estado === 'sincronizado') toast('Sincronizado', 'sucesso');
      else if (i.estado === 'erro') toast(`Erro: ${i.erro}`, 'erro', 5000);
    });
  };
  await Sync.iniciar();

  addEventListener('hashchange', () => renderizar());
  // Dados novos vindos de outro aparelho: atualiza a tela atual (se ela permitir)
  const recarregar = debounce(() => { if (rotaAtual && rotaAtual.recarregar !== false) renderizar({ preservarRolagem: true }); }, 300);
  Bus.on('dados:alterados', ({ local }) => { if (!local) recarregar(); });
  Bus.on('auth:mudou', () => { if (rotaAtual && rotaAtual.recarregar !== false) renderizar({ preservarRolagem: true }); });
  // App aberto em segundo plano de um dia para o outro (comum no iPhone): ao voltar,
  // redesenha para "Hoje" e a dieta não continuarem no dia anterior.
  let diaDaTela = dataInput();
  addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || dataInput() === diaDaTela) return;
    diaDaTela = dataInput();
    if (rotaAtual && rotaAtual.recarregar !== false) renderizar({ preservarRolagem: true });
  });

  // Menu de baixo dinâmico (celular): some ao rolar para baixo, volta ao rolar para cima
  let ultimoY = window.scrollY, acumulado = 0;
  addEventListener('scroll', () => {
    const y = window.scrollY, d = y - ultimoY;
    ultimoY = y;
    acumulado = Math.sign(d) === Math.sign(acumulado) ? acumulado + d : d;
    const noFim = innerHeight + y >= document.documentElement.scrollHeight - 4;
    const curta = document.documentElement.scrollHeight - innerHeight < 240;
    // só esconde depois de uma rolagem clara para baixo (toques leves não escondem)
    if (y < 60 || noFim || curta || acumulado < -10) document.body.classList.remove('menu-oculto');
    else if (acumulado > 70) document.body.classList.add('menu-oculto');
  }, { passive: true });
  Bus.on('rota:mudou', () => { document.body.classList.remove('menu-oculto'); acumulado = 0; });

  // O áudio no iPhone só pode tocar depois de um toque do usuário.
  addEventListener('pointerdown', () => som.desbloquear(), { once: true, capture: true });

  await renderizar();
  Auth.iniciar(); // em segundo plano; quando terminar, dispara a sincronização

  if ('serviceWorker' in navigator) {
    // Versão nova assumiu no meio do carregamento: recarrega uma vez para não
    // misturar arquivos novos com antigos (ex.: JS novo com CSS antigo).
    const tinhaControle = !!navigator.serviceWorker.controller;
    let recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!tinhaControle || recarregando) return;
      recarregando = true;
      location.reload();
    });
    navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('SW', e));
  }
}

iniciar();
