// Camada de dados do feed: perfis (nome que aparece para os amigos),
// publicações dos treinos concluídos, curtidas e comentários.
//
// - "perfis" e "feed" são tabelas sincronizadas como as outras: o que é seu
//   fica no aparelho e sobe quando houver internet. A leitura do feed (os
//   treinos de todo mundo) é feita direto no Supabase, só com internet.
// - "curtidas" e "comentarios" são lidas e gravadas direto no Supabase.
// Todas precisam do supabase/feed.sql rodado uma vez no projeto.

import { DB } from '../../core/db.js';
import { Auth } from '../../core/auth.js';
import { Bus, debounce, agoraISO } from '../../core/util.js';
import { obterTreino, mapaDeExercicios, mapaDeRecordes, resumoTreino } from '../treino/dados.js';
import { recortarQuadrado, reduzirImagem } from '../treino/fotos.js';
import { SUPABASE_URL } from '../../config.js';
import { T as TD, obterConfig, refeicaoFeita, somar, fmtQtd, calcular, hojeISO, somarDias } from '../dieta/dados.js';

export const TF = { PERFIS: 'perfis', FEED: 'feed' };
const POR_PAGINA = 15;

// ---------- Preferência: publicar meus treinos ----------
export const publicarAtivo = () => localStorage.getItem('feedPublicar') !== '0';
export const definirPublicar = v => localStorage.setItem('feedPublicar', v ? '1' : '0');
export const publicarRefeicoesAtivo = () => localStorage.getItem('feedRefeicoes') !== '0';
export const definirPublicarRefeicoes = v => localStorage.setItem('feedRefeicoes', v ? '1' : '0');

// ---------- Erros ----------
const tabelaAusente = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message || ''));
export class FeedIndisponivel extends Error {}
function verificar(error) {
  if (!error) return;
  if (tabelaAusente(error)) throw new FeedIndisponivel('O feed ainda não foi ativado no Supabase.');
  throw new Error(navigator.onLine ? (error.message || 'Erro ao falar com o servidor.') : 'Sem internet.');
}
function cliente() {
  const c = Auth.cliente(), u = Auth.usuario();
  if (!c || !u) throw new Error('Entre na sua conta para usar o feed.');
  return { c, u };
}

// ---------- Perfil ----------
// O id do perfil é o id da conta: cada pessoa tem um só.
export async function meuPerfil() {
  const u = Auth.usuario();
  if (!u) return null;
  const local = await DB.obter(TF.PERFIS, u.id);
  if (local) return local;
  // Aparelho novo: o perfil pode já existir na nuvem e a sincronização ainda não ter chegado
  try {
    const { data, error } = await Auth.cliente().from(TF.PERFIS).select('id, updated_at, deleted, data').eq('id', u.id).maybeSingle();
    if (!error && data && !data.deleted) {
      const reg = { ...(data.data || {}), id: data.id, updated_at: data.updated_at, deleted: false };
      await DB.gravarRemotos(TF.PERFIS, [reg]);
      return reg;
    }
  } catch { /* offline */ }
  return null;
}
export async function salvarNome(nome) {
  const u = Auth.usuario();
  if (!u) throw new Error('Entre na sua conta primeiro.');
  const atual = await DB.obter(TF.PERFIS, u.id);
  return DB.salvar(TF.PERFIS, { ...(atual || {}), id: u.id, nome: nome.trim().slice(0, 40) });
}

// ---------- Foto do perfil ----------
// A foto fica no Supabase Storage (pasta "avatares/<id da conta>/"), já
// reduzida no aparelho para 320×320 (uns 20 KB). O perfil guarda só o
// endereço dela. Precisa do supabase/foto-perfil.sql rodado uma vez.
const BALDE = 'avatares';
const PREFIXO_FOTO = `${SUPABASE_URL}/storage/v1/object/public/${BALDE}/`;
// Só aceita fotos do nosso próprio Storage (ninguém consegue pôr outro endereço no feed)
export const fotoValida = url => typeof url === 'string' && url.startsWith(PREFIXO_FOTO) ? url : null;

const paraBlob = (c, q = 0.85) => new Promise((ok, erro) => c.toBlob(b => (b ? ok(b) : erro(new Error('Não foi possível preparar a foto'))), 'image/jpeg', q));
function erroFoto(error) {
  if (/bucket not found|not found/i.test(error?.message || '') || error?.statusCode === '404')
    return new Error('A foto de perfil ainda não foi ativada no Supabase.');
  return new Error(navigator.onLine ? (error?.message || 'Erro ao enviar a foto.') : 'Sem internet. Tente de novo quando estiver conectado.');
}

export async function salvarFoto(arquivo) {
  const { c, u } = cliente();
  let blob;
  try { blob = await paraBlob(await recortarQuadrado(arquivo, 320)); } catch { throw new Error('Não foi possível abrir essa imagem'); }
  const caminho = `${u.id}/foto.jpg`;
  const { error } = await c.storage.from(BALDE).upload(caminho, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw erroFoto(error);
  // "?v=" muda a cada troca, para ninguém ver a foto antiga guardada em cache
  const foto = `${c.storage.from(BALDE).getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`;
  const atual = (await meuPerfil()) || {};
  await DB.salvar(TF.PERFIS, { ...atual, id: u.id, foto });
  return foto;
}

export async function removerFoto() {
  const { c, u } = cliente();
  const { error } = await c.storage.from(BALDE).remove([`${u.id}/foto.jpg`]);
  if (error) throw erroFoto(error);
  const atual = (await meuPerfil()) || {};
  await DB.salvar(TF.PERFIS, { ...atual, id: u.id, foto: null });
}

// ---------- Foto na publicação ----------
// Opcional: a pessoa pode pôr uma foto num treino ou refeição que publicou.
// Vai para o Storage (pasta "fotos-feed/<id da conta>/<id do post>.jpg"),
// reduzida no aparelho para no máximo 1080 px (uns 150 KB). A publicação
// guarda o endereço e o tamanho (para a tela não pular quando a foto chega).
// Precisa do supabase/fotos-feed.sql rodado uma vez.
const BALDE_POSTS = 'fotos-feed';
const PREFIXO_POSTS = `${SUPABASE_URL}/storage/v1/object/public/${BALDE_POSTS}/`;
export const fotoPostValida = url => typeof url === 'string' && url.startsWith(PREFIXO_POSTS) ? url : null;
const erroFotoPost = error => (/bucket not found|not found/i.test(error?.message || '') || error?.statusCode === '404')
  ? new Error('A foto nas publicações ainda não foi ativada no Supabase.')
  : erroFoto(error);

export async function salvarFotoPost(id, arquivo) {
  const { c, u } = cliente();
  const atual = await DB.obter(TF.FEED, id);
  if (!atual) throw new Error('Essa publicação ainda não chegou neste aparelho. Tente de novo em instantes.');
  let canvas, blob;
  try { canvas = await reduzirImagem(arquivo, 1080); blob = await paraBlob(canvas, 0.82); } catch { throw new Error('Não foi possível abrir essa imagem'); }
  const caminho = `${u.id}/${id}.jpg`;
  const { error } = await c.storage.from(BALDE_POSTS).upload(caminho, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw erroFotoPost(error);
  const foto = { foto: `${c.storage.from(BALDE_POSTS).getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`, fotoL: canvas.width, fotoA: canvas.height };
  await DB.salvar(TF.FEED, { ...atual, ...foto });
  return foto;
}

export async function removerFotoPost(id) {
  const { c, u } = cliente();
  const { error } = await c.storage.from(BALDE_POSTS).remove([`${u.id}/${id}.jpg`]);
  if (error) throw erroFotoPost(error);
  const atual = await DB.obter(TF.FEED, id);
  if (atual) await DB.salvar(TF.FEED, { ...atual, foto: null, fotoL: null, fotoA: null });
}
const fotoDoPost = p => (p?.foto ? { foto: p.foto, fotoL: p.fotoL, fotoA: p.fotoA } : {});

// ---------- Publicar um treino ----------
// A publicação tem o mesmo id do treino e guarda uma cópia do resumo, com os
// nomes dos exercícios (os amigos não têm os seus exercícios personalizados).
async function montarPublicacao(t) {
  const [mapa, recordes] = await Promise.all([mapaDeExercicios(), mapaDeRecordes()]);
  const r = resumoTreino(t, mapa);
  return {
    id: t.id,
    nome: t.nome || 'Treino',
    notas: t.notas || '',
    inicio: t.inicio, fim: t.fim,
    duracao: r.duracao, volume: r.volume, series: r.series,
    recordes: t.exercicios.reduce((n, e) => n + e.series.filter(s => s.feita !== false && recordes.has(s.uid)).length, 0),
    exercicios: t.exercicios.map(e => {
      const ex = mapa.get(e.exercicio_id) || { nome: 'Exercício' };
      // Foto enviada do aparelho (data URL) é pesada demais: os amigos veem o desenho padrão
      const foto = typeof ex.foto === 'string' && !ex.foto.startsWith('data:') ? ex.foto : null;
      return {
        nome: ex.nome, foto, tipo: ex.tipo || 'peso_reps',
        series: e.series.filter(s => s.feita !== false).map(s => ({ tipo: s.tipo || 'N', peso: s.peso ?? null, reps: s.reps ?? null, pr: recordes.has(s.uid) || undefined })),
      };
    }).filter(e => e.series.length),
  };
}

export async function publicarTreino(t) {
  if (!publicarAtivo() || !t?.fim) return null;
  return DB.salvar(TF.FEED, await montarPublicacao(t));
}
export async function removerPublicacao(id) {
  const p = await DB.obter(TF.FEED, id);
  await DB.excluir(TF.FEED, id);
  // A foto sai do Storage também (se não der agora, fica lá sem aparecer em lugar nenhum)
  if (p?.foto) try { const { c, u } = cliente(); await c.storage.from(BALDE_POSTS).remove([`${u.id}/${id}.jpg`]); } catch { /* offline */ }
}
export const publicacaoLocal = id => DB.obter(TF.FEED, id);

// Treino editado ou excluído: a publicação acompanha (se existir).
Bus.on('dados:alterados', async ({ tabela, id, local }) => {
  if (tabela !== 'treinos' || !id || !local) return;
  try {
    const atual = await DB.obter(TF.FEED, id);
    if (!atual) return;
    const t = await obterTreino(id);
    if (!t) await removerPublicacao(id);
    else await DB.salvar(TF.FEED, { ...(await montarPublicacao(t)), ...fotoDoPost(atual) });
  } catch (e) { console.warn('Feed: não foi possível atualizar a publicação', e); }
});

// ---------- Publicar refeições ----------
// Quando todos os itens de uma refeição (de hoje ou ontem) ficam feitos, ela
// vai para o feed; se desmarcar ou esvaziar, sai. Editar uma refeição já
// publicada atualiza a publicação. Uma removida à mão ("Remover do feed")
// não volta sozinha.
const chaveRef = (dia, ref) => `${dia}|${ref}`;
const tocadas = new Set();
const processarRefeicoes = debounce(async () => {
  const chaves = [...tocadas]; tocadas.clear();
  try {
    const [itens, posts, config] = await Promise.all([DB.todos(TD.diario), DB.todos(TF.FEED, { incluirExcluidos: true }), obterConfig()]);
    for (const k of chaves) {
      const [dia, ref] = k.split('|');
      const lista = itens.filter(i => i.dia === dia && i.refeicao === ref).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const atual = posts.find(p => p.tipo === 'refeicao' && p.dia === dia && p.refeicao === ref);
      const feita = refeicaoFeita(lista);
      if (!feita) {
        if (atual && !atual.deleted) await DB.salvar(TF.FEED, { ...atual, deleted: true, auto: true });
        continue;
      }
      if (atual?.deleted && !atual.auto) continue;            // removida pela pessoa
      if (!atual && (!publicarRefeicoesAtivo() || dia < somarDias(hojeISO(), -1))) continue;
      const r = config.refeicoes.find(x => x.id === ref);
      const t = somar(lista);
      await DB.salvar(TF.FEED, {
        ...(atual || {}), deleted: false, auto: false,
        tipo: 'refeicao', dia, refeicao: ref, nome: r?.nome || 'Refeição',
        fim: atual?.fim || agoraISO(),
        kcal: t.kcal, p: t.p, c: t.c, g: t.g,
        itens: lista.map(i => ({ nome: i.alimento?.nome || 'Alimento', marca: i.alimento?.marca || '', qtd: fmtQtd(i), kcal: Math.round(calcular(i.alimento?.n, i.gramas).kcal) })),
      });
    }
  } catch (e) { console.warn('Feed: não foi possível atualizar a refeição', e); }
}, 1500);

Bus.on('dados:alterados', async ({ tabela, id, local }) => {
  if (tabela !== TD.diario || !id || !local) return;
  const item = await DB.obter(TD.diario, id, { incluirExcluidos: true });
  if (!item?.dia || !item.refeicao) return;
  tocadas.add(chaveRef(item.dia, item.refeicao));
  processarRefeicoes();
});

// ---------- Ler o feed ----------
const paraPost = l => ({ ...(l.data || {}), id: l.id, autor: l.user_id });

// Completa as publicações com nome do autor, curtidas e comentários.
async function completar(c, u, posts) {
  if (!posts.length) return posts;
  const ids = posts.map(p => p.id);
  const autores = [...new Set(posts.map(p => p.autor))];
  const [perfis, curtidas, comentarios] = await Promise.all([
    c.from(TF.PERFIS).select('id, data').in('id', autores),
    c.from('curtidas').select('post_id, user_id').in('post_id', ids),
    c.from('comentarios').select('post_id').in('post_id', ids),
  ]);
  [perfis, curtidas, comentarios].forEach(r => verificar(r.error));
  const nomes = new Map(perfis.data.map(p => [p.id, p.data]));
  posts.forEach(p => {
    p.autorNome = nomes.get(p.autor)?.nome || 'Atleta';
    p.autorFoto = fotoValida(nomes.get(p.autor)?.foto);
    p.meu = p.autor === u.id;
    const cs = curtidas.data.filter(x => x.post_id === p.id);
    p.curtidas = cs.length;
    p.curti = cs.some(x => x.user_id === u.id);
    p.comentarios = comentarios.data.filter(x => x.post_id === p.id).length;
  });
  return posts;
}

// Caminho rápido: a função feed_listar (supabase/otimizacao.sql) devolve as
// publicações já com nome do autor, curtidas e comentários, num pedido só
// (em vez de quatro). Sem a função no Supabase, usa o caminho antigo.
let semFuncaoFeed = false;
const funcaoAusente = e => !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message || ''));
async function viaFuncao(c, u, args) {
  if (semFuncaoFeed) return null;
  const { data, error } = await c.rpc('feed_listar', args);
  if (funcaoAusente(error)) { semFuncaoFeed = true; return null; }
  verificar(error);
  return data.map(l => ({
    ...paraPost(l), autorNome: l.autor_nome || 'Atleta', autorFoto: fotoValida(l.autor_foto), meu: l.user_id === u.id,
    curtidas: l.curtidas || 0, curti: !!l.curti, comentarios: l.comentarios || 0,
  }));
}

// tipo: 'treino' (publicações sem tipo, as primeiras) ou 'refeicao'
export async function listarFeed({ pagina = 0, tipo = 'treino' } = {}) {
  const { c, u } = cliente();
  const rapido = await viaFuncao(c, u, { p_tipo: tipo, p_inicio: pagina * POR_PAGINA, p_qtd: POR_PAGINA });
  if (rapido) return { posts: rapido, temMais: rapido.length === POR_PAGINA };
  let q = c.from(TF.FEED).select('id, user_id, data').eq('deleted', false);
  q = tipo === 'refeicao' ? q.eq('data->>tipo', 'refeicao') : q.is('data->>tipo', null);
  const { data, error } = await q
    .order('data->>fim', { ascending: false })
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
  verificar(error);
  const posts = await completar(c, u, data.map(paraPost));
  return { posts, temMais: data.length === POR_PAGINA };
}

export async function obterPost(id) {
  const { c, u } = cliente();
  const rapido = await viaFuncao(c, u, { p_id: id });
  if (rapido) return rapido[0] || null;
  const { data, error } = await c.from(TF.FEED).select('id, user_id, data, deleted').eq('id', id).maybeSingle();
  verificar(error);
  if (!data || data.deleted) return null;
  const [post] = await completar(c, u, [paraPost(data)]);
  return post;
}

// ---------- Curtidas ----------
export async function curtir(postId, sim) {
  const { c, u } = cliente();
  const { error } = sim
    ? await c.from('curtidas').upsert({ post_id: postId, user_id: u.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
    : await c.from('curtidas').delete().eq('post_id', postId).eq('user_id', u.id);
  verificar(error);
}

export async function quemCurtiu(postId) {
  const { c } = cliente();
  const { data, error } = await c.from('curtidas').select('user_id').eq('post_id', postId).order('criado_em');
  verificar(error);
  return nomesDe(c, data.map(x => x.user_id));
}

async function nomesDe(c, ids) {
  if (!ids.length) return [];
  const { data, error } = await c.from(TF.PERFIS).select('id, data').in('id', [...new Set(ids)]);
  verificar(error);
  const perfis = new Map(data.map(p => [p.id, p.data]));
  return ids.map(id => ({ id, nome: perfis.get(id)?.nome || 'Atleta', foto: fotoValida(perfis.get(id)?.foto) }));
}

// ---------- Comentários ----------
export async function listarComentarios(postId) {
  const { c, u } = cliente();
  const { data, error } = await c.from('comentarios').select('id, user_id, texto, criado_em').eq('post_id', postId).order('criado_em');
  verificar(error);
  const pessoas = new Map((await nomesDe(c, data.map(x => x.user_id))).map(x => [x.id, x]));
  return data.map(x => ({ ...x, nome: pessoas.get(x.user_id)?.nome, foto: pessoas.get(x.user_id)?.foto, meu: x.user_id === u.id }));
}

export async function comentar(postId, texto) {
  const { c } = cliente();
  const { error } = await c.from('comentarios').insert({ post_id: postId, texto: texto.trim().slice(0, 500) });
  verificar(error);
}

export async function apagarComentario(id) {
  const { c } = cliente();
  const { error } = await c.from('comentarios').delete().eq('id', id);
  verificar(error);
}
