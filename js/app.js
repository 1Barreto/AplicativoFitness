// Ponto de entrada: inicia banco local, login, sincronização, módulos e rotas.

import { DB } from './core/db.js';
import { Auth } from './core/auth.js';
import { Sync } from './core/sync.js';
import { Modulos } from './core/modulos.js';
import { Bus, debounce, dataInput, rolador, rolagemY, rolarPara } from './core/util.js';
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
  const rolagem = preservarRolagem ? rolagemY() : 0;
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
  rolarPara(rolagem);
  Bus.emit('rota:mudou', caminho);
}

function montarAbas() {
  document.getElementById('tabbar').innerHTML = Modulos.abas().map(a =>
    `<a href="#${a.rota}" aria-label="${a.nome}" data-rota="${a.rota}" data-inclui="${(a.inclui || []).join(',')}">${a.icone}<span>${a.nome}</span></a>`).join('');
  // Troca de aba já no toque: no iPhone, com a tela ainda deslizando, o Safari usa o
  // primeiro toque só para parar a rolagem e não manda o "click". Então, se a tela rolou
  // há pouco, a aba troca no instante em que o dedo encosta; parada, troca ao soltar.
  const tabbar = document.getElementById('tabbar');
  let toqueAba = null, rolouEm = 0;
  rolador().addEventListener('scroll', () => { rolouEm = performance.now(); }, { passive: true });
  const irPara = a => { const destino = a.getAttribute('href'); if (location.hash !== destino) location.hash = destino; };
  tabbar.addEventListener('touchstart', ev => {
    const t = ev.touches[0], a = ev.target.closest('a');
    toqueAba = ev.touches.length === 1 && a ? { a, x: t.clientX, y: t.clientY } : null;
    if (toqueAba && performance.now() - rolouEm < 400) { ev.preventDefault(); irPara(a); toqueAba.feito = true; }
  }, { passive: false });
  tabbar.addEventListener('touchend', ev => {
    const t = ev.changedTouches[0], ini = toqueAba;
    toqueAba = null;
    if (!ini) return;
    if (ini.feito) { ev.preventDefault(); return; }
    if (Math.hypot(t.clientX - ini.x, t.clientY - ini.y) > 12) return;
    const a = document.elementFromPoint(t.clientX, t.clientY)?.closest('.tabbar a');
    if (a !== ini.a) return;
    ev.preventDefault();
    irPara(a);
  }, { passive: false });
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
  // O status fica em Ajustes; no topo só aparece quando dá erro
  b.hidden = info.estado !== 'erro';
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

  // iPhone com o app na tela inicial: às vezes a área "visível" informada pelo Safari é
  // mais curta que a tela (falha conhecida do modo standalone), e a parte de baixo fica
  // cortada. Estende a área que rola até a altura real da tela.
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ajustarAltura = () => {
    if (!standalone) return;
    const deitado = innerWidth > innerHeight;
    const real = deitado ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    document.documentElement.style.setProperty('--altura-app', `${Math.max(real, innerHeight)}px`);
  };
  ajustarAltura();
  addEventListener('resize', ajustarAltura);
  addEventListener('orientationchange', () => setTimeout(ajustarAltura, 300));

  // Menu de baixo dinâmico (celular): encolhe ao rolar para baixo, volta ao tamanho normal
  // só quando você rola para cima de propósito. O "quique" do fim da página (o Safari
  // devolve a tela um pouco sozinho) não conta: a subida só vale se o último gesto do
  // dedo foi para cima, e posições além do fim da página são ignoradas.
  const maxY = () => rolador().scrollHeight - rolador().clientHeight;
  const limitar = y => Math.min(Math.max(y, 0), Math.max(maxY(), 0));
  let ultimoY = limitar(rolagemY()), acumulado = 0, dedoY = null, gestoSobe = true;
  addEventListener('touchstart', ev => { dedoY = ev.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', ev => {
    const yDedo = ev.touches[0].clientY;
    if (dedoY != null && Math.abs(yDedo - dedoY) > 4) gestoSobe = yDedo > dedoY; // dedo descendo = conteúdo sobe
    dedoY = yDedo;
  }, { passive: true });
  addEventListener('wheel', ev => { gestoSobe = ev.deltaY < 0; }, { passive: true });
  rolador().addEventListener('scroll', () => {
    const y = limitar(rolagemY()), d = y - ultimoY;
    ultimoY = y;
    if (!d) return;
    acumulado = Math.sign(d) === Math.sign(acumulado) ? acumulado + d : d;
    const curta = maxY() < 240;
    if (y < 60 || curta || (acumulado < -140 && gestoSobe)) document.body.classList.remove('menu-compacto');
    else if (acumulado > 70) document.body.classList.add('menu-compacto');
  }, { passive: true });
  Bus.on('rota:mudou', () => { document.body.classList.remove('menu-compacto'); acumulado = 0; });

  // Sem zoom de pinça: o Safari do iPhone ignora "user-scalable=no", então
  // bloqueia o gesto de dois dedos aqui.
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, ev => ev.preventDefault(), { passive: false });
  document.addEventListener('touchmove', ev => { if (ev.touches.length > 1 || (ev.scale && ev.scale !== 1)) ev.preventDefault(); }, { passive: false });

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
