// Aba "Feed": os treinos concluídos de todo mundo que usa o app, com
// curtidas e comentários (como o feed do Hevy).

import { Modulos } from '../../core/modulos.js';
import { Auth } from '../../core/auth.js';
import { Bus, esc, fmtNum, fmtDuracao, fmtVolume, fmtData } from '../../core/util.js';
import { Icone, definirTitulo, toast, confirmar, menu, vazio, folha, pedirTexto } from '../../core/ui.js';
import { TIPOS_SERIE, TIPOS_EXERCICIO } from '../treino/dados.js';
import { rotulosSeries } from '../treino/componentes.js';
import { avatarExercicio } from '../treino/fotos.js';
import {
  TF, FeedIndisponivel, meuPerfil, salvarNome, listarFeed, obterPost, curtir, quemCurtiu,
  listarComentarios, comentar, apagarComentario, removerPublicacao,
} from './dados.js';

// ---------- Formatação ----------
function haQuanto(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return fmtData(iso, { day: 'numeric', month: 'short' });
}
const inicial = nome => esc((nome || '?').trim()[0]?.toUpperCase() || '?');
const avatarPessoa = (nome, classe = '') => `<span class="avatar-ex avatar-pessoa ${classe}">${inicial(nome)}</span>`;

// Melhor série de um exercício para o resumo (a mais pesada, sem aquecimento)
function melhorSerie(e) {
  const validas = e.series.filter(s => s.tipo !== 'A' && (s.peso || s.reps));
  if (!validas.length) return '';
  const m = validas.reduce((a, s) => ((s.peso || 0) * 1000 + (s.reps || 0) > (a.peso || 0) * 1000 + (a.reps || 0) ? s : a));
  if (e.tipo === 'tempo') return [m.peso ? `${fmtNum(m.peso)} km` : '', m.reps ? `${fmtNum(m.reps)} min` : ''].filter(Boolean).join(' · ');
  return m.peso ? `${fmtNum(m.peso)} kg × ${fmtNum(m.reps) || '–'}` : `${fmtNum(m.reps)} reps`;
}

function estatisticas(p) {
  return `<div class="estatisticas mini">
    <div><small>Duração</small><strong>${fmtDuracao(p.duracao)}</strong></div>
    <div><small>Volume</small><strong>${fmtVolume(p.volume)}</strong></div>
    <div><small>Séries</small><strong>${p.series || 0}</strong></div>
    ${p.recordes ? `<div><small>Recordes</small><strong class="ouro">${Icone.trofeu}${p.recordes}</strong></div>` : ''}
  </div>`;
}

function botoesAcao(p) {
  return `<div class="post-acoes">
    <button class="post-acao ${p.curti ? 'ativo' : ''}" data-curtir="${p.id}" aria-pressed="${p.curti}" aria-label="Curtir">
      ${p.curti ? Icone.coracaoCheio : Icone.coracao}<span>${p.curtidas || ''}</span></button>
    <a class="post-acao" href="#/feed/${p.id}?comentar=1" aria-label="Comentar">${Icone.comentario}<span>${p.comentarios || ''}</span></a>
  </div>`;
}

function cabecalho(p) {
  return `<header class="post-cab">
    ${avatarPessoa(p.autorNome)}
    <div class="item-texto"><strong>${esc(p.autorNome)}${p.meu ? ' <small class="sutil">(você)</small>' : ''}</strong><small>${haQuanto(p.fim)}</small></div>
    ${p.meu ? `<button class="icon-btn" data-menu-post="${p.id}" aria-label="Opções">${Icone.pontos}</button>` : ''}
  </header>`;
}

const MAX_EX = 3;
function cartaoPost(p) {
  const ex = p.exercicios || [];
  return `<article class="cartao post" data-post="${p.id}">
    ${cabecalho(p)}
    <a class="post-corpo" href="#/feed/${p.id}">
      <h3>${esc(p.nome)}</h3>
      ${p.notas ? `<p class="post-notas">${esc(p.notas)}</p>` : ''}
      ${estatisticas(p)}
      <ul class="post-ex">${ex.slice(0, MAX_EX).map(e => `
        <li>${avatarExercicio(e, 'mini')}<span class="item-texto"><strong>${e.series.length} × ${esc(e.nome)}</strong>${melhorSerie(e) ? `<small>${melhorSerie(e)}</small>` : ''}</span></li>`).join('')}
      </ul>
      ${ex.length > MAX_EX ? `<span class="post-mais">Ver mais ${ex.length - MAX_EX} exercício${ex.length - MAX_EX > 1 ? 's' : ''}</span>` : ''}
    </a>
    ${botoesAcao(p)}
  </article>`;
}

// ---------- Ações comuns (curtir, menu da própria publicação) ----------
function ligarAcoes(el, posts, { aoRemover } = {}) {
  el.addEventListener('click', async ev => {
    const bc = ev.target.closest('[data-curtir]');
    if (bc) {
      ev.preventDefault();
      const p = posts.get(bc.dataset.curtir); if (!p || bc.disabled) return;
      const sim = !p.curti;
      // Mostra na hora; desfaz se o servidor recusar
      const aplicar = v => {
        p.curti = v; p.curtidas = Math.max(0, (p.curtidas || 0) + (v ? 1 : -1));
        bc.classList.toggle('ativo', v); bc.setAttribute('aria-pressed', v);
        bc.innerHTML = `${v ? Icone.coracaoCheio : Icone.coracao}<span>${p.curtidas || ''}</span>`;
      };
      aplicar(sim);
      bc.disabled = true;
      try { await curtir(p.id, sim); } catch (e) { aplicar(!sim); toast(e.message, 'erro'); } finally { bc.disabled = false; }
      return;
    }
    const bm = ev.target.closest('[data-menu-post]');
    if (bm) {
      ev.preventDefault();
      const p = posts.get(bm.dataset.menuPost); if (!p) return;
      const op = await menu(p.nome, [
        { texto: 'Ver no meu histórico', valor: 'hist', icone: Icone.historico },
        { texto: 'Remover do feed', valor: 'remover', icone: Icone.lixo, perigo: true },
      ]);
      if (op === 'hist') location.hash = `#/historico/${p.id}`;
      else if (op === 'remover' && await confirmar('Remover este treino do feed? Ele continua no seu histórico.', { ok: 'Remover', perigo: true })) {
        await removerPublicacao(p.id);
        toast('Removido do feed');
        aoRemover?.(p);
      }
    }
  });
}

function telaErro(el, e) {
  if (e instanceof FeedIndisponivel) {
    el.innerHTML = vazio(Icone.feed, 'Feed ainda não ativado', 'Falta rodar o arquivo <code>supabase/feed.sql</code> no Supabase (SQL Editor). Depois disso, o feed aparece aqui.');
  } else {
    el.innerHTML = vazio(Icone.feed, 'Não foi possível carregar o feed', esc(e.message || ''), '<button class="btn btn-secundario" data-tentar>Tentar de novo</button>');
    el.querySelector('[data-tentar]')?.addEventListener('click', () => dispatchEvent(new HashChangeEvent('hashchange')));
  }
}

// ---------- Lista ----------
// A última lista carregada fica na memória: ao voltar para a aba ela aparece
// na hora e é atualizada em seguida.
let cache = null; // { posts, temMais, pagina }

async function telaFeed(el) {
  definirTitulo('Feed');
  if (!Auth.configurado() || !Auth.usuario()) {
    el.innerHTML = vazio(Icone.feed, 'Entre na sua conta', 'O feed mostra os treinos de quem usa o app. Para ver e publicar, entre na sua conta.', '<a class="btn btn-primario" href="#/ajustes">Entrar</a>');
    // O login termina de carregar depois da primeira tela: redesenha quando entrar
    return Bus.on('auth:mudou', s => { if (s) dispatchEvent(new HashChangeEvent('hashchange')); });
  }
  el.innerHTML = `
    <div data-perfil></div>
    <div class="feed-lista" data-lista>${cache ? '' : '<div class="cartao post esqueleto"></div><div class="cartao post esqueleto"></div>'}</div>
    <div class="feed-rodape" data-rodape></div>`;
  const lista = el.querySelector('[data-lista]');
  const rodape = el.querySelector('[data-rodape]');
  const posts = new Map();
  let estado = cache ? { ...cache } : null;
  let parado = false;

  const desenhar = () => {
    posts.clear();
    estado.posts.forEach(p => posts.set(p.id, p));
    lista.innerHTML = estado.posts.length ? estado.posts.map(cartaoPost).join('')
      : vazio(Icone.feed, 'Nada por aqui ainda', 'Quando você ou seus amigos concluírem um treino, ele aparece aqui.', '<a class="btn btn-primario" href="#/treino">Começar treino</a>');
    rodape.innerHTML = estado.temMais ? '<button class="btn btn-secundario" data-mais>Carregar mais</button>' : '';
  };
  ligarAcoes(lista, posts, { aoRemover: p => { estado.posts = estado.posts.filter(x => x.id !== p.id); cache = { ...estado }; desenhar(); } });
  rodape.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-mais]'); if (!b) return;
    b.disabled = true; b.textContent = 'Carregando…';
    try {
      const r = await listarFeed({ pagina: estado.pagina + 1 });
      const ja = new Set(estado.posts.map(p => p.id));
      estado = { posts: [...estado.posts, ...r.posts.filter(p => !ja.has(p.id))], temMais: r.temMais, pagina: estado.pagina + 1 };
      cache = { ...estado };
      desenhar();
    } catch (e) { toast(e.message, 'erro'); b.disabled = false; b.textContent = 'Carregar mais'; }
  });

  if (estado) desenhar();
  desenharPerfil(el.querySelector('[data-perfil]'), nome => {
    if (!estado) return;
    estado.posts.forEach(p => { if (p.meu) p.autorNome = nome; });
    cache = { ...estado };
    desenhar();
  });

  const atualizar = async () => {
    try {
      const r = await listarFeed();
      if (parado) return;
      estado = { ...r, pagina: 0 };
      cache = { ...estado };
      desenhar();
    } catch (e) {
      if (parado) return;
      if (estado) { if (!(e instanceof FeedIndisponivel)) toast(e.message, 'erro'); }
      else telaErro(lista, e);
    }
  };
  if (estado) atualizar(); else await atualizar();

  // Volta para o app ou termina de enviar um treino: busca o que há de novo
  const aoVoltar = () => { if (document.visibilityState === 'visible') atualizar(); };
  document.addEventListener('visibilitychange', aoVoltar);
  const semSync = Bus.on('sync:estado', i => { if (i.estado === 'sincronizado' && pendenteEnvio) { pendenteEnvio = false; atualizar(); } });
  return () => { parado = true; document.removeEventListener('visibilitychange', aoVoltar); semSync(); };
}
// Treino recém-publicado: atualiza a lista quando ele chegar ao servidor
let pendenteEnvio = false;
Bus.on('dados:alterados', ({ tabela, local }) => { if (tabela === TF.FEED && local) { pendenteEnvio = true; cache = null; } });

// Pede o nome na primeira vez (é o que os amigos veem no feed)
async function desenharPerfil(area, aoSalvar) {
  const perfil = await meuPerfil();
  if (perfil?.nome) { area.innerHTML = ''; return; }
  area.innerHTML = `
    <form class="cartao feed-nome">
      <div><strong>Como seus amigos vão te ver?</strong><small class="sutil">Esse nome aparece nos seus treinos do feed.</small></div>
      <div class="feed-nome-linha">
        <input class="campo" name="nome" maxlength="40" autocomplete="name" placeholder="Seu nome" required>
        <button class="btn btn-primario">Salvar</button>
      </div>
    </form>`;
  area.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const nome = new FormData(ev.target).get('nome').trim();
    if (!nome) return;
    await salvarNome(nome);
    toast('Nome salvo', 'sucesso');
    area.innerHTML = '';
    aoSalvar?.(nome);
  };
}

// ---------- Detalhe (treino completo + comentários) ----------
async function telaPost(el, { id }, query) {
  definirTitulo('Treino', { voltar: '#/feed' });
  if (!Auth.usuario()) {
    el.innerHTML = vazio(Icone.feed, 'Entre na sua conta', 'Para ver os treinos do feed, entre na sua conta.', '<a class="btn btn-primario" href="#/ajustes">Entrar</a>');
    return Bus.on('auth:mudou', s => { if (s) dispatchEvent(new HashChangeEvent('hashchange')); });
  }
  el.innerHTML = '<div class="cartao post esqueleto"></div>';
  let p;
  try { p = await obterPost(id); } catch (e) { telaErro(el, e); return; }
  if (!p) { el.innerHTML = vazio(Icone.feed, 'Treino não encontrado', 'Ele pode ter sido removido do feed.'); return; }

  const posts = new Map([[p.id, p]]);
  el.innerHTML = `
    <article class="cartao post" data-post="${p.id}">
      ${cabecalho(p)}
      <h2 class="post-titulo">${esc(p.nome)}</h2>
      <p class="sutil">${fmtData(p.fim, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      ${p.notas ? `<p class="notas">${esc(p.notas)}</p>` : ''}
      ${estatisticas(p)}
      ${botoesAcao(p)}
      <button class="link-curtidas" data-curtidas ${p.curtidas ? '' : 'hidden'}>Ver quem curtiu</button>
    </article>
    ${(p.exercicios || []).map(e => {
      const [c1, c2] = TIPOS_EXERCICIO[e.tipo || 'peso_reps']?.campos || ['kg', 'reps'];
      const rot = rotulosSeries(e.series);
      return `<section class="cartao">
        <div class="post-ex-nome">${avatarExercicio(e, 'mini')}<strong>${esc(e.nome)}</strong></div>
        <table class="tabela-detalhe">
          <thead><tr><th>Série</th><th>${c1}</th><th>${c2}</th><th></th></tr></thead>
          <tbody>${e.series.map((s, j) => `<tr>
            <td><span class="tipo-serie mini ${TIPOS_SERIE[s.tipo]?.classe || ''}">${rot[j]}</span></td>
            <td>${fmtNum(s.peso) || '–'}</td><td>${fmtNum(s.reps) || '–'}</td>
            <td>${s.pr ? `<span class="selo">${Icone.trofeu}Recorde</span>` : ''}</td></tr>`).join('')}</tbody>
        </table>
      </section>`;
    }).join('')}
    <h2 class="secao">Comentários</h2>
    <div class="cartao lista-simples" data-comentarios><p class="sutil comentario-vazio">Carregando…</p></div>
    <form class="comentar" data-comentar>
      <input class="campo" name="texto" maxlength="500" placeholder="Escreva um comentário…" autocomplete="off" enterkeyhint="send">
      <button class="btn btn-primario" aria-label="Enviar">Enviar</button>
    </form>`;

  ligarAcoes(el, posts, { aoRemover: () => { location.hash = '#/feed'; } });
  // Curtida mudou: mostra ou esconde "Ver quem curtiu"
  el.addEventListener('click', ev => { if (ev.target.closest('[data-curtir]')) setTimeout(() => { el.querySelector('[data-curtidas]').hidden = !p.curtidas; }, 0); }, true);
  el.querySelector('[data-curtidas]').onclick = async () => {
    try {
      const pessoas = await quemCurtiu(p.id);
      folha({ titulo: 'Curtidas', classe: 'modal-pequeno', conteudo: `<div class="lista-simples">${pessoas.map(x => `<div class="linha-lista">${avatarPessoa(x.nome)}<span class="item-texto"><strong>${esc(x.nome)}</strong></span></div>`).join('') || '<p class="sutil">Ninguém ainda.</p>'}</div>` });
    } catch (e) { toast(e.message, 'erro'); }
  };

  const area = el.querySelector('[data-comentarios]');
  const carregarComentarios = async () => {
    try {
      const cs = await listarComentarios(p.id);
      area.innerHTML = cs.length ? cs.map(c => `
        <div class="linha-lista comentario">
          ${avatarPessoa(c.nome)}
          <span class="item-texto"><strong>${esc(c.nome)} <small class="sutil">${haQuanto(c.criado_em)}</small></strong><span class="comentario-texto">${esc(c.texto)}</span></span>
          ${c.meu || p.meu ? `<button class="icon-btn" data-apagar="${c.id}" aria-label="Apagar comentário">${Icone.lixo}</button>` : ''}
        </div>`).join('') : '<p class="sutil comentario-vazio">Nenhum comentário ainda. Seja o primeiro!</p>';
      return cs.length;
    } catch (e) { area.innerHTML = `<p class="sutil comentario-vazio">${esc(e.message)}</p>`; return null; }
  };
  carregarComentarios();
  area.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-apagar]'); if (!b) return;
    if (!(await confirmar('Apagar este comentário?', { ok: 'Apagar', perigo: true }))) return;
    try { await apagarComentario(b.dataset.apagar); await atualizarContagem(); } catch (e) { toast(e.message, 'erro'); }
  });
  const atualizarContagem = async () => {
    const n = await carregarComentarios();
    if (n === null) return;
    p.comentarios = n;
    const span = el.querySelector('.post-acoes a span'); if (span) span.textContent = n || '';
    cache = null;
  };

  const form = el.querySelector('[data-comentar]');
  form.onsubmit = async ev => {
    ev.preventDefault();
    const campo = form.querySelector('input'), botao = form.querySelector('button');
    const texto = campo.value.trim(); if (!texto) return;
    botao.disabled = true;
    try {
      if (!(await meuPerfil())?.nome) {
        const nome = await pedirTexto('Seu nome no feed', '', { placeholder: 'Como seus amigos vão te ver' });
        if (!nome) return;
        await salvarNome(nome);
      }
      await comentar(p.id, texto);
      campo.value = '';
      await atualizarContagem();
    } catch (e) { toast(e.message, 'erro'); } finally { botao.disabled = false; }
  };
  if (query.comentar) setTimeout(() => { form.scrollIntoView({ block: 'center' }); form.querySelector('input').focus(); }, 50);
}

Modulos.registrar({
  id: 'feed',
  aba: { rota: '/feed', nome: 'Feed', icone: Icone.feed, ordem: 25 },
  tabelas: [TF.PERFIS, TF.FEED],
  rotas: {
    '/feed': { view: telaFeed, recarregar: false },
    '/feed/:id': { view: telaPost, recarregar: false },
  },
});
