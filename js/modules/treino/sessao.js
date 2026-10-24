// Treino em andamento (e editor de treinos já feitos).
//
// O treino ativo é salvo no localStorage a cada alteração (gravação síncrona),
// então fechar o app, trocar de aba ou bloquear a tela não perde nada.
// Cronômetros usam horários absolutos (Date.now), por isso continuam certos
// mesmo depois de o iPhone suspender a página.

import { Modulos } from '../../core/modulos.js';
import { Bus, uuid, esc, num, fmtNum, fmtDuracao, fmtSeg, fmtVolume, agoraISO, clone, dataHoraInput } from '../../core/util.js';
import { Icone, definirTitulo, toast, confirmar, menu } from '../../core/ui.js';
import { som } from '../../core/som.js';
import {
  mapaDeExercicios, ultimasSeries, recordesExercicio, melhoresDeSeries, recordesBatidos, NOMES_RECORDE,
  TIPOS_SERIE, TIPOS_EXERCICIO, descansoDe, salvarTreino, obterRotina, salvarRotina, resumoTreino, prefs,
} from './dados.js';
import { avatarExercicio } from './fotos.js';
import { escolherExercicios, escolherTipoSerie, rotulosSeries, escolherDescanso } from './componentes.js';

const CHAVE = 'treinoAtivo';
const CHAVE_DESCANSO = 'descansoAtivo';

// ---------- Estado persistente ----------
export function obterAtivo() {
  try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; }
}
function gravarAtivo(estado) {
  if (estado) localStorage.setItem(CHAVE, JSON.stringify(estado)); else localStorage.removeItem(CHAVE);
  atualizarBarra();
}
function obterDescanso() {
  try { return JSON.parse(localStorage.getItem(CHAVE_DESCANSO)); } catch { return null; }
}
function gravarDescanso(d) {
  if (d) localStorage.setItem(CHAVE_DESCANSO, JSON.stringify(d)); else localStorage.removeItem(CHAVE_DESCANSO);
}

const novaSerie = (base = {}) => ({ uid: uuid(), tipo: base.tipo || 'N', peso: base.peso ?? null, reps: base.reps ?? null, feita: false });

// Inicia um treino a partir de uma rotina, de um treino anterior ou vazio.
export async function iniciarTreino({ rotina = null, modelo = null } = {}) {
  const atual = obterAtivo();
  if (atual) {
    const r = await menu('Já existe um treino em andamento', [
      { texto: 'Continuar o treino atual', valor: 'continuar' },
      { texto: 'Descartar e começar novo', valor: 'novo', perigo: true },
    ]);
    if (r === 'continuar') { location.hash = '#/treino/ativo'; return; }
    if (r !== 'novo') return;
  }
  const mapa = await mapaDeExercicios();
  const origem = rotina || modelo;
  const estado = {
    id: uuid(),
    nome: rotina?.nome || modelo?.nome || nomePadrao(),
    rotina_id: rotina?.id || modelo?.rotina_id || null,
    inicio: agoraISO(),
    notas: '',
    exercicios: (origem?.exercicios || []).map(e => ({
      uid: uuid(),
      exercicio_id: e.exercicio_id,
      descanso: e.descanso ?? descansoDe(mapa.get(e.exercicio_id)),
      notas: e.notas || '',
      series: (e.series?.length ? e.series : [{}]).map(s => novaSerie({ tipo: s.tipo, peso: s.peso, reps: s.reps })),
    })),
  };
  gravarDescanso(null);
  gravarAtivo(estado);
  location.hash = '#/treino/ativo';
}

function nomePadrao() {
  const h = new Date().getHours();
  return h < 12 ? 'Treino da manhã' : h < 18 ? 'Treino da tarde' : 'Treino da noite';
}

// ---------- Barra "treino em andamento" (aparece nas outras telas) ----------
let intervaloBarra = null;
function atualizarBarra() {
  const barra = document.getElementById('barra-treino');
  if (!barra) return;
  const ativo = obterAtivo();
  const naTela = location.hash.startsWith('#/treino/ativo');
  clearInterval(intervaloBarra);
  if (!ativo || naTela) { barra.hidden = true; document.body.classList.remove('com-barra-treino'); return; }
  barra.hidden = false;
  document.body.classList.add('com-barra-treino');
  const desenhar = () => {
    const d = obterDescanso();
    const resta = d ? Math.ceil((d.fim - Date.now()) / 1000) : 0;
    barra.innerHTML = `
      <a href="#/treino/ativo" class="barra-treino-link">
        <span class="pulso"></span>
        <span><strong>${esc(ativo.nome)}</strong><small>${resta > 0 ? `Descanso ${fmtSeg(resta)}` : `Em andamento · ${fmtDuracao(Date.now() - new Date(ativo.inicio), true)}`}</small></span>
        <span class="btn btn-primario btn-pequeno">Retomar</span>
      </a>`;
  };
  desenhar();
  intervaloBarra = setInterval(desenhar, 1000);
}
Bus.on('rota:mudou', atualizarBarra);

// ---------- Editor de treino ----------
/**
 * Monta o editor de um treino.
 * @param {HTMLElement} el
 * @param {object} estado  objeto do treino (é alterado no lugar)
 * @param {{modo:'ativo'|'edicao', aoMudar:Function}} opcoes
 */
export async function montarEditor(el, estado, { modo, aoMudar }) {
  const mapa = await mapaDeExercicios();
  const anteriores = new Map();   // exercicio_id -> séries do último treino
  const historicos = new Map();   // exercicio_id -> recordes antes deste treino

  async function carregarReferencias() {
    await Promise.all(estado.exercicios.map(async e => {
      if (!anteriores.has(e.exercicio_id)) {
        anteriores.set(e.exercicio_id, (await ultimasSeries(e.exercicio_id, { excluirTreinoId: estado.id }))?.series || []);
        historicos.set(e.exercicio_id, await recordesExercicio(e.exercicio_id, { excluirTreinoId: estado.id }));
      }
    }));
  }
  await carregarReferencias();

  const mudou = () => { aoMudar(); atualizarResumo(); };

  const notasAbertas = new Set(); // exercícios com o campo de nota aberto

  function camposDe(exId) { return TIPOS_EXERCICIO[mapa.get(exId)?.tipo || 'peso_reps'].campos; }

  function htmlExercicio(e, i) {
    const ex = mapa.get(e.exercicio_id) || { nome: 'Exercício removido', grupo: '' };
    const [c1, c2] = camposDe(e.exercicio_id);
    const ant = anteriores.get(e.exercicio_id) || [];
    const rotulos = rotulosSeries(e.series);
    return `
      <section class="cartao exercicio-sessao" data-ex="${i}">
        <div class="ex-topo">
          ${avatarExercicio(ex, 'ex-avatar')}
          <a class="ex-nome" href="#/treino/exercicio/${e.exercicio_id}">${esc(ex.nome)}</a>
          <button class="icon-btn" data-acao="menu-ex" aria-label="Opções do exercício">${Icone.pontos}</button>
        </div>
        <div class="ex-acoes">
          ${modo === 'ativo' ? `<button class="chip chip-descanso ${e.descanso ? '' : 'desligado'}" data-acao="descanso-ex">${Icone.timer}<span>Descanso: ${e.descanso ? fmtSeg(e.descanso) : 'OFF'}</span></button>` : ''}
          <button class="chip chip-nota ${e.notas || notasAbertas.has(e.uid) ? 'ativo' : ''}" data-acao="nota-ex">${Icone.editar}<span>Nota</span></button>
        </div>
        ${e.notas || notasAbertas.has(e.uid) ? `<input class="campo campo-nota" data-campo="notas-ex" placeholder="Adicionar nota…" value="${esc(e.notas || '')}">` : ''}
        <div class="tabela-series">
          <div class="serie-cab"><span>Série</span><span>Anterior</span><span>${c1}</span><span>${c2}</span><span>${Icone.check}</span></div>
          ${e.series.map((s, j) => {
            const a = ant[j];
            const tipo = TIPOS_SERIE[s.tipo] || TIPOS_SERIE.N;
            return `
            <div class="serie-linha ${s.feita ? 'feita' : ''}" data-s="${j}">
              <button class="tipo-serie ${tipo.classe}" data-acao="tipo">${rotulos[j]}</button>
              <button class="anterior" data-acao="copiar-ant" ${a ? '' : 'disabled'}>${a ? `${fmtNum(a.peso) || 0} × ${fmtNum(a.reps) || 0}` : '–'}</button>
              <input class="campo campo-serie" data-campo="peso" inputmode="decimal" enterkeyhint="next" placeholder="${a ? fmtNum(a.peso) : c1}" value="${fmtNum(s.peso)}">
              <input class="campo campo-serie" data-campo="reps" inputmode="decimal" enterkeyhint="done" placeholder="${a ? fmtNum(a.reps) : c2}" value="${fmtNum(s.reps)}">
              <button class="btn-check" data-acao="feita" aria-label="Concluir série">${Icone.check}</button>
              ${s.recordes?.length ? `<span class="selo-recorde" title="${s.recordes.map(r => NOMES_RECORDE[r]).join(', ')}">${Icone.trofeu}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
        <button class="btn btn-secundario btn-bloco" data-acao="add-serie">${Icone.mais}<span>Adicionar série</span></button>
      </section>`;
  }

  function desenhar() {
    const rolagem = window.scrollY;
    el.innerHTML = `
      ${modo === 'ativo' ? `
        <div class="sessao-resumo" data-resumo></div>` : `
        <div class="cartao form">
          <label>Nome<input class="campo" data-campo="nome" value="${esc(estado.nome)}"></label>
          <div class="linha-2">
            <label>Início<input class="campo" type="datetime-local" data-campo="inicio" value="${dataHoraInput(estado.inicio)}"></label>
            <label>Duração (min)<input class="campo" inputmode="numeric" data-campo="duracao" value="${Math.round((new Date(estado.fim) - new Date(estado.inicio)) / 60000)}"></label>
          </div>
          <div class="estatisticas" data-resumo></div>
        </div>`}
      <div data-lista-ex>${estado.exercicios.map(htmlExercicio).join('')}</div>
      ${!estado.exercicios.length ? `<p class="sutil centro">Adicione o primeiro exercício para começar.</p>` : ''}
      <button class="btn btn-primario btn-bloco" data-acao="add-ex">${Icone.mais}<span>Adicionar exercício</span></button>
      <div class="cartao form">
        ${modo === 'ativo' ? `<label>Nome do treino<input class="campo" data-campo="nome" value="${esc(estado.nome)}"></label>` : ''}
        <label>Notas do treino<textarea class="campo" data-campo="notas" rows="2" placeholder="Como foi o treino?">${esc(estado.notas || '')}</textarea></label>
      </div>
    `;
    atualizarResumo();
    window.scrollTo(0, rolagem);
  }

  function atualizarResumo() {
    const alvo = el.querySelector('[data-resumo]'); if (!alvo) return;
    const fim = modo === 'ativo' ? new Date().toISOString() : estado.fim;
    const r = resumoTreino({ ...estado, fim }, mapa);
    alvo.innerHTML = `
      <div class="resumo-duracao"><small>Duração</small><strong data-duracao>${fmtDuracao(r.duracao, modo === 'ativo')}</strong></div>
      <div><small>Volume</small><strong>${fmtVolume(r.volume)}</strong></div>
      <div><small>Séries</small><strong>${r.series}</strong></div>`;
  }

  // Edição de campos (sem redesenhar, para não perder o foco do teclado)
  el.addEventListener('input', ev => {
    const campo = ev.target.dataset.campo; if (!campo) return;
    const exEl = ev.target.closest('[data-ex]');
    const sEl = ev.target.closest('[data-s]');
    const e = exEl ? estado.exercicios[+exEl.dataset.ex] : null;
    const v = ev.target.value;
    if (campo === 'nome') estado.nome = v;
    else if (campo === 'notas') estado.notas = v;
    else if (campo === 'notas-ex') e.notas = v;
    else if (campo === 'inicio') {
      const dur = new Date(estado.fim) - new Date(estado.inicio);
      if (v) { estado.inicio = new Date(v).toISOString(); estado.fim = new Date(new Date(v).getTime() + dur).toISOString(); }
    } else if (campo === 'duracao') {
      const m = num(v); if (m !== null && m >= 0) estado.fim = new Date(new Date(estado.inicio).getTime() + m * 60000).toISOString();
    } else if (sEl && (campo === 'peso' || campo === 'reps')) {
      const s = e.series[+sEl.dataset.s];
      s[campo] = num(v);
      if (s.feita) s.recordes = calcularRecordes(e, s);
    }
    mudou();
  });

  // Ir para o próximo campo com o "Seguinte" do teclado
  el.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || !ev.target.classList.contains('campo-serie')) return;
    ev.preventDefault();
    const campos = [...el.querySelectorAll('.campo-serie')];
    const i = campos.indexOf(ev.target);
    if (ev.target.dataset.campo === 'reps') {
      ev.target.closest('.serie-linha').querySelector('[data-acao=feita]').click();
    } else if (campos[i + 1]) campos[i + 1].focus();
  });

  function calcularRecordes(e, s) {
    const hist = historicos.get(e.exercicio_id);
    if (!hist || !hist.carga) return []; // primeira vez: sem comparação
    const outras = e.series.filter(x => x !== s && x.feita);
    const daSessao = melhoresDeSeries(outras);
    const ref = { carga: Math.max(hist.carga, daSessao.carga), e1rm: Math.max(hist.e1rm, daSessao.e1rm), volume: Math.max(hist.volume, daSessao.volume) };
    return recordesBatidos(s, ref);
  }

  el.addEventListener('click', async ev => {
    const alvo = ev.target.closest('[data-acao]'); if (!alvo) return;
    const acao = alvo.dataset.acao;
    const exEl = alvo.closest('[data-ex]');
    const i = exEl ? +exEl.dataset.ex : -1;
    const e = estado.exercicios[i];
    const sEl = alvo.closest('[data-s]');
    const j = sEl ? +sEl.dataset.s : -1;

    if (acao === 'add-ex') {
      const novos = await escolherExercicios();
      novos.forEach(ex => estado.exercicios.push({
        uid: uuid(), exercicio_id: ex.id, descanso: descansoDe(ex), notas: '', series: [novaSerie()],
      }));
      if (novos.length) { (await mapaDeExercicios()).forEach((v, k) => mapa.set(k, v)); await carregarReferencias(); mudou(); desenhar(); }
    } else if (acao === 'add-serie') {
      const ult = e.series[e.series.length - 1];
      e.series.push(novaSerie(ult ? { tipo: ult.tipo === 'A' ? 'N' : ult.tipo, peso: ult.peso, reps: ult.reps } : {}));
      mudou(); desenhar();
    } else if (acao === 'tipo') {
      const r = await escolherTipoSerie(e.series[j].tipo);
      if (!r) return;
      if (r === 'remover') e.series.splice(j, 1); else e.series[j].tipo = r;
      mudou(); desenhar();
    } else if (acao === 'copiar-ant') {
      const a = (anteriores.get(e.exercicio_id) || [])[j]; if (!a) return;
      Object.assign(e.series[j], { peso: a.peso, reps: a.reps });
      mudou(); desenhar();
    } else if (acao === 'feita') {
      const s = e.series[j];
      if (!s.feita) {
        // Se os campos estiverem vazios, usa os valores sugeridos (do último treino)
        const a = (anteriores.get(e.exercicio_id) || [])[j];
        if (s.peso === null && a) s.peso = a.peso;
        if (s.reps === null && a) s.reps = a.reps;
        if (s.reps === null && s.peso === null) { toast('Preencha a carga e as repetições', 'erro'); return; }
        s.feita = true;
        s.recordes = calcularRecordes(e, s);
        if (s.recordes.length) {
          som.recorde();
          toast(`${Icone.trofeu} Novo recorde: ${s.recordes.map(r => NOMES_RECORDE[r]).join(', ')}!`, 'recorde', 3500);
        }
        if (modo === 'ativo' && e.descanso > 0) iniciarDescanso(e.descanso, mapa.get(e.exercicio_id)?.nome);
      } else { s.feita = false; s.recordes = []; }
      mudou(); desenhar();
    } else if (acao === 'nota-ex') {
      if (notasAbertas.has(e.uid) && !e.notas) notasAbertas.delete(e.uid); else notasAbertas.add(e.uid);
      desenhar();
      el.querySelector(`[data-ex="${i}"] .campo-nota`)?.focus();
    } else if (acao === 'descanso-ex') {
      const seg = await escolherDescanso(e.descanso);
      if (seg === undefined) return;
      e.descanso = seg; mudou(); desenhar();
    } else if (acao === 'menu-ex') {
      const r = await menu(mapa.get(e.exercicio_id)?.nome || 'Exercício', [
        { texto: 'Mover para cima', valor: 'cima', icone: Icone.cima },
        { texto: 'Mover para baixo', valor: 'baixo', icone: Icone.baixo },
        { texto: 'Substituir exercício', valor: 'trocar', icone: Icone.sincronizar },
        ...(modo === 'ativo' ? [{ texto: 'Tempo de descanso', valor: 'descanso', icone: Icone.timer }] : []),
        { texto: 'Remover exercício', valor: 'remover', icone: Icone.lixo, perigo: true },
      ]);
      if (r === 'cima' && i > 0) [estado.exercicios[i - 1], estado.exercicios[i]] = [estado.exercicios[i], estado.exercicios[i - 1]];
      else if (r === 'baixo' && i < estado.exercicios.length - 1) [estado.exercicios[i + 1], estado.exercicios[i]] = [estado.exercicios[i], estado.exercicios[i + 1]];
      else if (r === 'remover') { if (!(await confirmar('Remover este exercício do treino?', { ok: 'Remover', perigo: true }))) return; estado.exercicios.splice(i, 1); }
      else if (r === 'descanso') { const seg = await escolherDescanso(e.descanso); if (seg === undefined) return; e.descanso = seg; }
      else if (r === 'trocar') {
        const [ex] = await escolherExercicios({ titulo: 'Substituir por', multiplo: false });
        if (!ex) return;
        e.exercicio_id = ex.id; e.descanso = descansoDe(ex);
        e.series.forEach(s => { s.recordes = []; });
        (await mapaDeExercicios()).forEach((v, k) => mapa.set(k, v));
        await carregarReferencias();
      } else return;
      mudou(); desenhar();
    }
  });

  desenhar();
  return { atualizarResumo, desenhar };
}

// ---------- Cronômetro de descanso ----------
function iniciarDescanso(segundos, nomeEx) {
  gravarDescanso({ fim: Date.now() + segundos * 1000, total: segundos, nome: nomeEx || '', avisado10: false });
  Bus.emit('descanso:mudou');
}

function montarPainelDescanso(el) {
  const painel = document.createElement('div');
  painel.className = 'painel-descanso';
  painel.hidden = true;
  el.appendChild(painel);

  const desenhar = () => {
    const d = obterDescanso();
    if (!d) { painel.hidden = true; return; }
    const resta = Math.ceil((d.fim - Date.now()) / 1000);
    if (resta <= 0) {
      gravarDescanso(null);
      painel.hidden = true;
      // Só toca se o fim aconteceu agora (não quando volta de um bloqueio longo)
      if (resta > -3) { som.fimDescanso(); toast(`${Icone.timer} Descanso encerrado. Bora!`, 'sucesso'); }
      return;
    }
    if (resta <= 10 && !d.avisado10) { d.avisado10 = true; gravarDescanso(d); som.bip(); }
    painel.hidden = false;
    const pct = Math.max(0, Math.min(100, (resta / d.total) * 100));
    painel.innerHTML = `
      <div class="descanso-barra" style="width:${pct}%"></div>
      <div class="descanso-conteudo">
        <button class="btn btn-secundario btn-pequeno" data-d="-15">−15</button>
        <div class="descanso-tempo"><small>Descanso${d.nome ? ` · ${esc(d.nome)}` : ''}</small><strong>${fmtSeg(resta)}</strong></div>
        <button class="btn btn-secundario btn-pequeno" data-d="15">+15</button>
        <button class="btn btn-primario btn-pequeno" data-d="pular">Pular</button>
      </div>`;
  };
  painel.addEventListener('click', ev => {
    const b = ev.target.closest('[data-d]'); if (!b) return;
    const d = obterDescanso(); if (!d) return;
    if (b.dataset.d === 'pular') gravarDescanso(null);
    else { const delta = Number(b.dataset.d); d.fim += delta * 1000; d.total = Math.max(d.total + delta, 1); if (delta > 0) d.avisado10 = false; gravarDescanso(d); }
    desenhar();
  });
  const sair = Bus.on('descanso:mudou', desenhar);
  desenhar();
  return { desenhar, sair };
}

// ---------- Manter a tela ligada durante o treino ----------
let wakeLock = null;
async function pedirTelaLigada() {
  if (!prefs.manterTelaLigada() || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* sem suporte */ }
}
function liberarTela() { try { wakeLock?.release(); } catch { /* ignora */ } wakeLock = null; }

// ---------- Finalizar ----------
async function finalizar(estado) {
  const feitas = estado.exercicios.flatMap(e => e.series.filter(s => s.feita));
  if (!feitas.length) {
    if (await confirmar('Nenhuma série foi concluída. Deseja descartar o treino?', { ok: 'Descartar', perigo: true })) descartar();
    return;
  }
  const naoFeitas = estado.exercicios.flatMap(e => e.series.filter(s => !s.feita));
  if (naoFeitas.length) {
    const comValor = naoFeitas.filter(s => s.peso !== null || s.reps !== null);
    const r = await menu(`${naoFeitas.length} série${naoFeitas.length > 1 ? 's' : ''} não concluída${naoFeitas.length > 1 ? 's' : ''}`, [
      ...(comValor.length ? [{ texto: 'Marcar as preenchidas como concluídas', valor: 'marcar', icone: Icone.check }] : []),
      { texto: 'Descartar séries não concluídas', valor: 'descartar', icone: Icone.lixo },
      { texto: 'Voltar ao treino', valor: null, icone: Icone.voltar },
    ]);
    if (!r) return;
    if (r === 'marcar') comValor.forEach(s => { s.feita = true; });
  } else if (!(await confirmar('Finalizar e salvar este treino?', { ok: 'Finalizar' }))) return;

  const final = clone(estado);
  final.fim = agoraISO();
  final.exercicios = final.exercicios
    .map(e => ({ ...e, series: e.series.filter(s => s.feita).map(({ recordes, ...s }) => s) }))
    .filter(e => e.series.length);
  const salvo = await salvarTreino(final);

  if (estado.rotina_id) {
    const rotina = await obterRotina(estado.rotina_id);
    if (rotina && await confirmar('Atualizar a rotina com as cargas e repetições de hoje?', { titulo: rotina.nome, ok: 'Atualizar' })) {
      rotina.exercicios = final.exercicios.map(e => ({
        exercicio_id: e.exercicio_id, descanso: e.descanso, notas: e.notas,
        series: e.series.map(s => ({ tipo: s.tipo, peso: s.peso, reps: s.reps })),
      }));
      await salvarRotina(rotina);
    }
  }
  gravarDescanso(null);
  gravarAtivo(null);
  location.hash = `#/historico/${salvo.id}?novo=1`;
}

function descartar() {
  gravarDescanso(null);
  gravarAtivo(null);
  toast('Treino descartado');
  location.hash = '#/treino';
}

// ---------- Tela do treino ativo ----------
async function telaAtiva(el) {
  const estado = obterAtivo();
  if (!estado) { location.replace('#/treino'); return; }
  definirTitulo('Registrar treino', { voltar: '#/treino' });
  document.body.classList.add('modo-sessao');

  el.classList.add('tela-sessao');
  el.innerHTML = `
    <header class="sessao-topo">
      <button class="icon-btn" data-acao-topo="minimizar" aria-label="Minimizar treino">${Icone.baixo}</button>
      <h1>Treino</h1>
      <button class="icon-btn btn-cronometro" data-acao-topo="cronometro" aria-label="Cronômetro">${Icone.timer}<span data-cronometro></span></button>
      <button class="btn btn-sucesso btn-pequeno" data-acao-topo="finalizar">Finalizar</button>
    </header>
    <div data-editor></div>
    <button class="btn btn-bloco perigo" data-acao-topo="descartar">${Icone.lixo}<span>Descartar treino</span></button>`;
  await montarEditor(el.querySelector('[data-editor]'), estado, { modo: 'ativo', aoMudar: () => gravarAtivo(estado) });
  el.querySelector('[data-acao-topo=minimizar]').onclick = () => { location.hash = '#/treino'; };
  el.querySelector('[data-acao-topo=finalizar]').onclick = () => finalizar(estado);
  el.querySelector('[data-acao-topo=descartar]').onclick = async () => {
    if (await confirmar('Descartar este treino? Os dados registrados serão perdidos.', { ok: 'Descartar', perigo: true })) descartar();
  };
  el.querySelector('[data-acao-topo=cronometro]').onclick = async () => {
    if (obterDescanso()) {
      const r = await menu('Cronômetro', [
        { texto: 'Parar cronômetro', valor: 'parar', icone: Icone.fechar },
        { texto: 'Novo cronômetro', valor: 'novo', icone: Icone.timer },
      ]);
      if (r === 'parar') { gravarDescanso(null); painel.desenhar(); }
      if (r !== 'novo') return;
    }
    const seg = await escolherDescanso(90);
    if (seg) { iniciarDescanso(seg, 'Cronômetro'); painel.desenhar(); }
  };

  const painel = montarPainelDescanso(el);
  const relogio = setInterval(() => {
    const d = el.querySelector('[data-duracao]');
    if (d) d.textContent = fmtDuracao(Date.now() - new Date(estado.inicio), true);
    const c = el.querySelector('[data-cronometro]');
    const desc = obterDescanso();
    const resta = desc ? Math.ceil((desc.fim - Date.now()) / 1000) : 0;
    if (c) c.textContent = resta > 0 ? fmtSeg(resta) : '';
    painel.desenhar();
  }, 1000);

  pedirTelaLigada();
  const aoVoltar = () => { if (document.visibilityState === 'visible') { pedirTelaLigada(); painel.desenhar(); } };
  document.addEventListener('visibilitychange', aoVoltar);
  // Garante gravação ao sair/ocultar
  const salvarAgora = () => gravarAtivo(estado);
  addEventListener('pagehide', salvarAgora);

  return () => {
    clearInterval(relogio);
    document.body.classList.remove('modo-sessao');
    painel.sair();
    liberarTela();
    document.removeEventListener('visibilitychange', aoVoltar);
    removeEventListener('pagehide', salvarAgora);
    if (obterAtivo()) gravarAtivo(estado);
  };
}

Modulos.registrar({
  id: 'treino-sessao',
  rotas: { '/treino/ativo': { view: telaAtiva, recarregar: false } },
});
