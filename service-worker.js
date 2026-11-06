// Service worker: deixa o app funcionando offline depois do primeiro acesso.
//
// - Arquivos do app: servidos do cache na hora. Cada versão nova (VERSAO) baixa
//   tudo de novo na instalação; só a página (index.html) é conferida em segundo
//   plano a cada abertura, para não disputar a rede com dezenas de pedidos.
// - Bibliotecas do CDN (Supabase, Chart.js): cache permanente (versões fixas).
// - Chamadas à API do Supabase: sempre pela rede (nunca em cache).
//
// Ao adicionar arquivos novos (ex.: módulo de dieta), inclua-os em ARQUIVOS
// e aumente VERSAO.

const VERSAO = 'v108';
const CACHE_APP = `app-${VERSAO}`;
const CACHE_CDN = 'cdn-v1';
const CACHE_FOTOS = 'fotos-v2'; // fotos dos exercícios (não mudam)
const CACHE_PESSOAS = 'pessoas-v1'; // fotos de perfil e das publicações do Feed (com limite)
const LIMITE_PESSOAS = 200; // fotos guardadas; passou disso, saem as mais antigas (uns 30 MB no máximo)
const STORAGE_FOTOS = /\/storage\/v1\/object\/public\/(avatares|fotos-feed)\//;

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
  './js/core/tema.js',
  './js/modules/index.js',
  './js/modules/hoje.js',
  './js/modules/ajustes.js',
  './js/modules/treino/dados.js',
  './js/modules/treino/exercicios-base.js',
  './js/modules/treino/componentes.js',
  './js/modules/treino/treino.js',
  './js/modules/treino/sessao.js',
  './js/modules/treino/historico.js',
  './js/modules/treino/compartilhar.js',
  './js/modules/treino/progresso.js',
  './js/modules/treino/importar-hevy.js',
  './js/modules/treino/fotos.js',
  './js/modules/treino/fotos-banco.js',
  './js/modules/dieta/dados.js',
  './js/modules/dieta/componentes.js',
  './js/modules/dieta/dieta.js',
  './js/modules/dieta/gasto.js',
  './js/modules/estoque/dados.js',
  './js/modules/estoque/estoque.js',
  './js/modules/resumo.js',
  './js/modules/dieta/tbca.json',
  './js/modules/dieta/tabelas.json',
  './js/modules/corpo/dados.js',
  './js/modules/corpo/corpo.js',
  './js/modules/corpo/saude.js',
  './js/modules/perfil/perfil.js',
  './js/modules/feed/dados.js',
  './js/modules/feed/feed.js',
  './js/modules/feed/foto-perfil.js',
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
    // no-cache: confere cada arquivo com o servidor (ETag); o que não mudou volta
    // como "304" e não é baixado de novo, então atualizar o app fica bem mais leve.
    await app.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'no-cache' })));
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
    await limparCachesAntigos();
  })());
});

// Respostas "opacas" (de outro site, sem CORS) ocupam uns 7 MB cada na conta de
// espaço do navegador, mesmo uma foto de 20 KB. Por isso as fotos e bibliotecas
// de fora agora são pedidas com CORS; as guardadas do jeito antigo saem do cache.
async function limparCachesAntigos() {
  if (await caches.has('fotos-v1')) {
    const velho = await caches.open('fotos-v1'), novo = await caches.open(CACHE_FOTOS);
    for (const k of await velho.keys()) {
      if (STORAGE_FOTOS.test(new URL(k.url).pathname)) continue; // vão para o cache com limite
      const r = await velho.match(k);
      if (r && r.type !== 'opaque') await novo.put(k, r);
    }
    await caches.delete('fotos-v1');
  }
  const cdn = await caches.open(CACHE_CDN);
  for (const k of await cdn.keys()) { const r = await cdn.match(k); if (r?.type === 'opaque') await cdn.delete(k); }
}

// Busca de fora pedindo CORS (resposta normal, ocupa só o tamanho real);
// se o site não aceitar, busca do jeito comum.
async function buscarDeFora(req) {
  try { const r = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); if (r.ok) return r; } catch { /* sem CORS */ }
  return fetch(req);
}

// Guarda uma foto de pessoa: tira as versões antigas da mesma foto (a pessoa
// trocou a foto, o "?v=" mudou) e, passando do limite, as guardadas há mais tempo.
async function guardarFotoPessoa(req, resp) {
  const cache = await caches.open(CACHE_PESSOAS);
  await cache.put(req, resp);
  const caminho = new URL(req.url).pathname;
  const chaves = await cache.keys();
  const velhas = chaves.filter(k => k.url !== req.url && new URL(k.url).pathname === caminho);
  const resto = chaves.filter(k => !velhas.includes(k));
  const sobra = resto.length - LIMITE_PESSOAS;
  await Promise.all([...velhas, ...(sobra > 0 ? resto.slice(0, sobra) : [])].map(k => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fotos de perfil e das publicações (Storage público): cada troca de foto muda o "?v=" do
  // endereço, então dá para guardar para sempre e abrir na hora.
  const avatar = url.hostname.endsWith('.supabase.co') && STORAGE_FOTOS.test(url.pathname);
  if (avatar) {
    event.respondWith((async () => {
      const emCache = await (await caches.open(CACHE_PESSOAS)).match(req);
      if (emCache) return emCache;
      const resp = await buscarDeFora(req);
      if (resp.ok || resp.type === 'opaque') event.waitUntil(guardarFotoPessoa(req, resp.clone()).catch(() => {}));
      return resp;
    })());
    return;
  }

  // API do Supabase: nunca usar cache
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // Bibliotecas do CDN, fontes e fotos dos exercícios: cache primeiro
  const foto = url.hostname === 'raw.githubusercontent.com' || (url.origin === self.location.origin && (url.pathname.includes('/img/exercicios/') || url.pathname.includes('/img/desenhos/')));
  if (foto || url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(foto ? CACHE_FOTOS : CACHE_CDN);
      const emCache = await cache.match(req);
      if (emCache) return emCache;
      const resp = url.origin === self.location.origin ? await fetch(req) : await buscarDeFora(req);
      if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
      return resp;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Arquivos do app: cache imediato. A página é atualizada em segundo plano;
  // os demais arquivos só mudam com uma VERSAO nova (o navegador confere o
  // service-worker.js sozinho ao abrir o app).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_APP);
    const navegacao = req.mode === 'navigate';
    const chave = navegacao ? './index.html' : req;
    const emCache = await cache.match(chave, { ignoreSearch: navegacao });
    // no-cache: revalida com o servidor em vez de reaproveitar o cache HTTP do navegador
    const daRede = () => (navegacao ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' })).then(resp => {
      if (resp.ok && resp.type === 'basic') cache.put(chave, resp.clone());
      return resp;
    }).catch(() => null);
    if (emCache) { if (navegacao) event.waitUntil(daRede()); return emCache; }
    return (await daRede()) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
