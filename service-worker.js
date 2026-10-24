// Service worker: deixa o app funcionando offline depois do primeiro acesso.
//
// - Arquivos do app: servidos do cache na hora e atualizados em segundo plano
//   (a versão nova aparece na próxima vez que o app abrir).
// - Bibliotecas do CDN (Supabase, Chart.js): cache permanente (versões fixas).
// - Chamadas à API do Supabase: sempre pela rede (nunca em cache).
//
// Ao adicionar arquivos novos (ex.: módulo de dieta), inclua-os em ARQUIVOS
// e aumente VERSAO.

const VERSAO = 'v9';
const CACHE_APP = `app-${VERSAO}`;
const CACHE_CDN = 'cdn-v1';

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/core/util.js',
  './js/core/db.js',
  './js/core/auth.js',
  './js/core/sync.js',
  './js/core/modulos.js',
  './js/core/ui.js',
  './js/core/som.js',
  './js/core/graficos.js',
  './js/core/backup.js',
  './js/modules/index.js',
  './js/modules/hoje.js',
  './js/modules/ajustes.js',
  './js/modules/treino/dados.js',
  './js/modules/treino/exercicios-base.js',
  './js/modules/treino/componentes.js',
  './js/modules/treino/treino.js',
  './js/modules/treino/sessao.js',
  './js/modules/treino/historico.js',
  './js/modules/treino/progresso.js',
  './js/modules/treino/importar-hevy.js',
  './js/modules/corpo/dados.js',
  './js/modules/corpo/corpo.js',
  './js/modules/perfil/perfil.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(CACHE_APP);
    await app.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'reload' })));
    // CDN: tenta guardar, mas não impede a instalação se falhar
    const cdn = await caches.open(CACHE_CDN);
    await Promise.all(CDN.map(async u => { try { if (!(await cdn.match(u))) await cdn.add(u); } catch { /* offline */ } }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n.startsWith('app-') && n !== CACHE_APP).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API do Supabase: nunca usar cache
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // Bibliotecas do CDN e fontes: cache primeiro
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_CDN);
      const emCache = await cache.match(req);
      if (emCache) return emCache;
      const resp = await fetch(req);
      if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
      return resp;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Arquivos do app: cache imediato + atualização em segundo plano
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_APP);
    const chave = req.mode === 'navigate' ? './index.html' : req;
    const emCache = await cache.match(chave, { ignoreSearch: req.mode === 'navigate' });
    const daRede = fetch(req).then(resp => {
      if (resp.ok && resp.type === 'basic') cache.put(req.mode === 'navigate' ? './index.html' : req, resp.clone());
      return resp;
    }).catch(() => null);
    if (emCache) { event.waitUntil(daRede); return emCache; }
    return (await daRede) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
