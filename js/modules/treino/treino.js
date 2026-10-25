// Aba "Treino": rotinas, editor de rotina, biblioteca e detalhe de exercício.

import { Modulos } from '../../core/modulos.js';
import { esc, num, fmtNum, fmtKg, fmtData, fmtRelativo, fmtVolume, fmtDuracao, e1rm, clone } from '../../core/util.js';
import { Icone, definirTitulo, toast, confirmar, menu, vazio } from '../../core/ui.js';
import { criarGrafico } from '../../core/graficos.js';
import {
  T, listarRotinas, obterRotina, salvarRotina, excluirRotina, mapaDeExercicios, obterExercicio, excluirExercicio, salvarExercicio,
  historicoExercicio, melhoresDeSeries, TIPOS_SERIE, TIPOS_EXERCICIO, descansoDe, listarTreinos, resumoTreino, proximaRotina,
} from './dados.js';
import { montarListaExercicios, escolherExercicios, formularioExercicio, escolherTipoSerie, rotulosSeries, escolherDescanso } from './componentes.js';
import { iniciarTreino, obterAtivo } from './sessao.js';
import { avatarExercicio, fotoDe, escolherFoto } from './fotos.js';

// ---------- Lista de rotinas ----------
async function telaTreino(el) {
  definirTitulo('Treino');
  const [rotinas, mapa] = await Promise.all([listarRotinas(), mapaDeExercicios()]);
  const ativo = obterAtivo();

  el.innerHTML = `
    ${ativo ? `<a class="cartao cartao-destaque" href="#/treino/ativo">${Icone.play}<div><strong>Continuar treino</strong><small>${esc(ativo.nome)}</small></div></a>` : ''}
    <div class="grade-botoes">
      <button class="btn btn-primario" data-acao="vazio">${Icone.play}<span>Treino vazio</span></button>
      <a class="btn btn-secundario" href="#/treino/rotina/nova">${Icone.mais}<span>Nova rotina</span></a>
      <a class="btn btn-secundario" href="#/treino/exercicios">${Icone.busca}<span>Exercícios</span></a>
    </div>
    <h2 class="secao">Minhas rotinas <small>${rotinas.length}</small></h2>
    <div class="grade-cartoes">
      ${rotinas.length ? rotinas.map(r => `
        <article class="cartao rotina" data-id="${r.id}">
          <div class="rotina-topo">
            <a href="#/treino/rotina/${r.id}" class="rotina-nome">${esc(r.nome)}</a>
            <button class="icon-btn" data-acao="menu" aria-label="Opções">${Icone.pontos}</button>
          </div>
          <p class="sutil rotina-ex">${(r.exercicios || []).map(e => esc(mapa.get(e.exercicio_id)?.nome || '?')).join(', ') || 'Sem exercícios'}</p>
          <button class="btn btn-primario btn-bloco" data-acao="iniciar">${Icone.play}<span>Iniciar</span></button>
        </article>`).join('') : vazio(Icone.treino, 'Nenhuma rotina ainda', 'Crie rotinas como "Treino A", "Treino B"… para começar mais rápido.', '<a class="btn btn-primario" href="#/treino/rotina/nova">Criar rotina</a>')}
    </div>`;

  el.querySelector('[data-acao=vazio]').onclick = () => iniciarTreino();
  el.querySelectorAll('.rotina').forEach(card => {
    const r = rotinas.find(x => x.id === card.dataset.id);
    card.querySelector('[data-acao=iniciar]').onclick = () => iniciarTreino({ rotina: r });
    card.querySelector('[data-acao=menu]').onclick = async () => {
      const i = rotinas.indexOf(r);
      const op = await menu(r.nome, [
        { texto: 'Editar', valor: 'editar', icone: Icone.editar },
        { texto: 'Duplicar', valor: 'duplicar', icone: Icone.copiar },
        ...(i > 0 ? [{ texto: 'Mover para cima', valor: 'cima', icone: Icone.cima }] : []),
        ...(i < rotinas.length - 1 ? [{ texto: 'Mover para baixo', valor: 'baixo', icone: Icone.baixo }] : []),
        { texto: 'Excluir', valor: 'excluir', icone: Icone.lixo, perigo: true },
      ]);
      if (op === 'editar') location.hash = `#/treino/rotina/${r.id}`;
      else if (op === 'duplicar') { const { id, created_at, ...resto } = clone(r); await salvarRotina({ ...resto, nome: `${r.nome} (cópia)`, ordem: rotinas.length }); toast('Rotina duplicada'); telaTreino(el); }
      else if (op === 'cima' || op === 'baixo') {
        const lista = [...rotinas];
        const j = op === 'cima' ? i - 1 : i + 1;
        [lista[i], lista[j]] = [lista[j], lista[i]];
        for (let k = 0; k < lista.length; k++) if (lista[k].ordem !== k) await salvarRotina({ ...lista[k], ordem: k });
        telaTreino(el);
      } else if (op === 'excluir' && await confirmar(`Excluir a rotina "${esc(r.nome)}"? Os treinos já feitos continuam no histórico.`, { ok: 'Excluir', perigo: true })) {
        await excluirRotina(r.id); toast('Rotina excluída'); telaTreino(el);
      }
    };
  });
}

// ---------- Editor de rotina ----------
async function telaRotina(el, { id }) {
  const nova = id === 'nova';
  const original = nova ? null : await obterRotina(id);
  if (!nova && !original) { el.innerHTML = vazio(Icone.treino, 'Rotina não encontrada'); return; }
  const rotina = original ? clone(original) : { nome: '', notas: '', exercicios: [], ordem: (await listarRotinas()).length };
  definirTitulo(nova ? 'Nova rotina' : 'Editar rotina', { voltar: '#/treino' });
  const mapa = await mapaDeExercicios();
  let alterado = false;

  el.innerHTML = `
    <div class="cartao form">
      <label>Nome da rotina<input class="campo" data-campo="nome" placeholder="Ex.: Treino A — Peito e tríceps" value="${esc(rotina.nome)}"></label>
      <label>Notas<textarea class="campo" data-campo="notas" rows="2" placeholder="Opcional">${esc(rotina.notas || '')}</textarea></label>
    </div>
    <div data-lista></div>
    <button class="btn btn-secundario btn-bloco" data-acao="add-ex">${Icone.mais}<span>Adicionar exercício</span></button>
    <div class="rodape-acoes">
      <a class="btn btn-secundario" href="#/treino">Cancelar</a>
      <button class="btn btn-primario" data-acao="salvar">Salvar rotina</button>
    </div>`;
  const lista = el.querySelector('[data-lista]');

  function desenhar() {
    lista.innerHTML = rotina.exercicios.map((e, i) => {
      const ex = mapa.get(e.exercicio_id) || { nome: '?' };
      const [c1, c2] = TIPOS_EXERCICIO[ex.tipo || 'peso_reps'].campos;
      const rot = rotulosSeries(e.series);
      return `
      <section class="cartao exercicio-sessao" data-ex="${i}">
        <div class="ex-topo">
          ${avatarExercicio(ex, 'ex-avatar')}
          <strong class="ex-nome">${esc(ex.nome)}</strong>
          <button class="icon-btn" data-acao="menu-ex">${Icone.pontos}</button>
        </div>
        <button class="chip chip-descanso" data-acao="descanso">${Icone.timer}<span>Descanso: ${e.descanso ? `${Math.floor(e.descanso / 60)}:${String(e.descanso % 60).padStart(2, '0')}` : 'desligado'}</span></button>
        <div class="tabela-series tabela-rotina">
          <div class="serie-cab"><span>Série</span><span>${c1} alvo</span><span>${c2} alvo</span><span></span></div>
          ${e.series.map((s, j) => `
            <div class="serie-linha" data-s="${j}">
              <button class="tipo-serie ${TIPOS_SERIE[s.tipo]?.classe || ''}" data-acao="tipo">${rot[j]}</button>
              <input class="campo campo-serie" data-campo="peso" inputmode="decimal" placeholder="–" value="${fmtNum(s.peso)}">
              <input class="campo campo-serie" data-campo="reps" inputmode="decimal" placeholder="–" value="${fmtNum(s.reps)}">
              <button class="icon-btn" data-acao="rem-serie" aria-label="Remover série">${Icone.fechar}</button>
            </div>`).join('')}
        </div>
        <button class="btn btn-secundario btn-bloco" data-acao="add-serie">${Icone.mais}<span>Adicionar série</span></button>
      </section>`;
    }).join('') || '<p class="sutil centro">Nenhum exercício na rotina.</p>';
  }

  el.addEventListener('input', ev => {
    const c = ev.target.dataset.campo; if (!c) return;
    alterado = true;
    if (c === 'nome' || c === 'notas') { rotina[c] = ev.target.value; return; }
    const e = rotina.exercicios[+ev.target.closest('[data-ex]').dataset.ex];
    e.series[+ev.target.closest('[data-s]').dataset.s][c] = num(ev.target.value);
  });

  el.addEventListener('click', async ev => {
    const a = ev.target.closest('[data-acao]'); if (!a) return;
    const acao = a.dataset.acao;
    const i = a.closest('[data-ex]') ? +a.closest('[data-ex]').dataset.ex : -1;
    const j = a.closest('[data-s]') ? +a.closest('[data-s]').dataset.s : -1;
    const e = rotina.exercicios[i];
    alterado = true;
    if (acao === 'add-ex') {
      const novos = await escolherExercicios();
      (await mapaDeExercicios()).forEach((v, k) => mapa.set(k, v));
      novos.forEach(ex => rotina.exercicios.push({ exercicio_id: ex.id, descanso: descansoDe(ex), notas: '', series: [{ tipo: 'N', peso: null, reps: null }, { tipo: 'N', peso: null, reps: null }, { tipo: 'N', peso: null, reps: null }] }));
    } else if (acao === 'add-serie') {
      const u = e.series[e.series.length - 1];
      e.series.push(u ? { tipo: u.tipo === 'A' ? 'N' : u.tipo, peso: u.peso, reps: u.reps } : { tipo: 'N', peso: null, reps: null });
    } else if (acao === 'rem-serie') e.series.splice(j, 1);
    else if (acao === 'tipo') {
      const r = await escolherTipoSerie(e.series[j].tipo); if (!r) return;
      if (r === 'remover') e.series.splice(j, 1); else e.series[j].tipo = r;
    } else if (acao === 'descanso') {
      const s = await escolherDescanso(e.descanso); if (s === undefined) return; e.descanso = s;
    } else if (acao === 'menu-ex') {
      const r = await menu(mapa.get(e.exercicio_id)?.nome || 'Exercício', [
        { texto: 'Mover para cima', valor: 'cima', icone: Icone.cima },
        { texto: 'Mover para baixo', valor: 'baixo', icone: Icone.baixo },
        { texto: 'Remover', valor: 'remover', icone: Icone.lixo, perigo: true },
      ]);
      const ex = rotina.exercicios;
      if (r === 'cima' && i > 0) [ex[i - 1], ex[i]] = [ex[i], ex[i - 1]];
      else if (r === 'baixo' && i < ex.length - 1) [ex[i + 1], ex[i]] = [ex[i], ex[i + 1]];
      else if (r === 'remover') ex.splice(i, 1);
      else return;
    } else if (acao === 'salvar') {
      if (!rotina.nome.trim()) { toast('Dê um nome à rotina', 'erro'); el.querySelector('[data-campo=nome]').focus(); return; }
      rotina.nome = rotina.nome.trim();
      await salvarRotina(rotina);
      alterado = false;
      toast('Rotina salva', 'sucesso');
      location.hash = '#/treino';
      return;
    } else return;
    desenhar();
  });

  desenhar();
  if (nova) el.querySelector('[data-campo=nome]').focus();

  // Avisa antes de sair sem salvar (botão voltar do topo)
  definirTitulo(nova ? 'Nova rotina' : 'Editar rotina', {
    voltar: async () => { if (!alterado || await confirmar('Sair sem salvar as alterações?', { ok: 'Sair', perigo: true })) location.hash = '#/treino'; },
  });
}

// ---------- Biblioteca de exercícios ----------
async function telaExercicios(el) {
  definirTitulo('Exercícios', { voltar: '#/treino' });
  montarListaExercicios(el, {
    aoEscolher: ex => { location.hash = `#/treino/exercicio/${ex.id}`; },
    aoCriar: ex => { location.hash = `#/treino/exercicio/${ex.id}`; },
  });
}

// ---------- Detalhe do exercício ----------
async function telaExercicio(el, { id }) {
  const ex = await obterExercicio(id);
  definirTitulo(ex.nome, { voltar: () => history.length > 1 ? history.back() : (location.hash = '#/treino/exercicios') });
  const hist = await historicoExercicio(id);
  const tudo = hist.flatMap(h => h.series);
  const melhores = melhoresDeSeries(tudo);
  const tempo = ex.tipo === 'tempo';
  const [c1, c2] = TIPOS_EXERCICIO[ex.tipo || 'peso_reps'].campos;

  el.innerHTML = `
    ${fotoDe(ex) ? `
    <div class="foto-exercicio ${fotoDe(ex).desenho ? 'desenho' : ''}">
      <img src="${esc(fotoDe(ex).grande)}" alt="${esc(ex.nome)}" onerror="this.src='${esc(fotoDe(ex).mini)}'">
      ${fotoDe(ex).grande2 ? `<img src="${esc(fotoDe(ex).grande2)}" alt="" onerror="this.remove()">` : ''}
    </div>` : ''}
    <div class="cartao">
      <div class="ex-cab">
        ${avatarExercicio(ex, 'grande')}
        <div><h2>${esc(ex.nome)}</h2><p class="sutil">${esc(ex.grupo)} · ${esc(ex.equipamento)}${ex.base ? '' : ' · personalizado'}</p></div>
      </div>
      <p class="sutil">Descanso: ${descansoDe(ex) ? `${descansoDe(ex)} s` : 'desligado'}${ex.notas ? ` · ${esc(ex.notas)}` : ''}</p>
      <div class="linha-botoes">
        <button class="btn btn-secundario" data-acao="editar">${Icone.editar}<span>Editar</span></button>
        ${!ex.removido ? `<button class="btn btn-secundario" data-acao="foto">${Icone.camera}<span>${fotoDe(ex) ? 'Trocar foto' : 'Adicionar foto'}</span></button>` : ''}
        ${!ex.base && !ex.removido ? `<button class="btn btn-secundario perigo" data-acao="excluir">${Icone.lixo}<span>Excluir</span></button>` : ''}
      </div>
    </div>
    ${tempo ? '' : `
    <h2 class="secao">Recordes pessoais</h2>
    <div class="grade-stats">
      <div class="stat">${Icone.trofeu}<small>Maior carga</small><strong>${fmtKg(melhores.carga || null)}</strong></div>
      <div class="stat">${Icone.trofeu}<small>1RM estimado</small><strong>${fmtKg(melhores.e1rm ? Math.round(melhores.e1rm * 10) / 10 : null)}</strong></div>
      <div class="stat">${Icone.trofeu}<small>Maior volume (série)</small><strong>${fmtKg(melhores.volume || null)}</strong></div>
    </div>`}
    ${hist.length > 1 ? `
      <h2 class="secao">Evolução</h2>
      <div class="cartao">
        <div class="abas-mini" data-abas>
          ${tempo ? '<button class="chip ativo" data-g="dist">Distância</button><button class="chip" data-g="tempo">Tempo</button>'
            : '<button class="chip ativo" data-g="e1rm">1RM est.</button><button class="chip" data-g="carga">Maior carga</button><button class="chip" data-g="volume">Volume</button><button class="chip" data-g="reps">Reps</button>'}
        </div>
        <div class="grafico"><canvas></canvas></div>
      </div>` : ''}
    <h2 class="secao">Histórico <small>${hist.length}</small></h2>
    ${hist.length ? hist.map(h => `
      <a class="cartao item-hist" href="#/historico/${h.treino.id}">
        <div class="item-hist-topo"><strong>${esc(h.treino.nome)}</strong><small>${fmtData(h.treino.inicio)}</small></div>
        <ol class="series-resumo">${h.series.map(s => `<li><span class="tipo-serie mini ${TIPOS_SERIE[s.tipo]?.classe || ''}">${TIPOS_SERIE[s.tipo]?.curto || '•'}</span>${fmtNum(s.peso) || 0} ${c1} × ${fmtNum(s.reps) || 0} ${c2}${!tempo && s.peso && s.reps ? ` <small class="sutil">(1RM ${fmtNum(Math.round(e1rm(s.peso, s.reps)))})</small>` : ''}</li>`).join('')}</ol>
      </a>`).join('') : vazio(Icone.historico, 'Ainda sem registros', 'Faça este exercício em um treino para ver o histórico.')}
  `;

  el.querySelector('[data-acao=editar]').onclick = async () => { if (await formularioExercicio(ex)) telaExercicio(el, { id }); };
  el.querySelector('[data-acao=foto]')?.addEventListener('click', async () => {
    const foto = await escolherFoto(ex);
    if (foto === undefined) return;
    await salvarExercicio({ ...ex, foto });
    toast('Foto atualizada', 'sucesso');
    telaExercicio(el, { id });
  });
  el.querySelector('[data-acao=excluir]')?.addEventListener('click', async () => {
    if (await confirmar('Excluir este exercício? Ele continuará aparecendo nos treinos antigos.', { ok: 'Excluir', perigo: true })) {
      await excluirExercicio(id); toast('Exercício excluído'); location.hash = '#/treino/exercicios';
    }
  });

  if (hist.length > 1) {
    const cron = [...hist].reverse();
    const rotulos = cron.map(h => new Date(h.treino.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    const series = {
      e1rm: { nome: '1RM estimado', dados: cron.map(h => Math.round(melhoresDeSeries(h.series).e1rm * 10) / 10), sufixo: ' kg' },
      carga: { nome: 'Maior carga', dados: cron.map(h => melhoresDeSeries(h.series).carga), sufixo: ' kg' },
      volume: { nome: 'Volume', dados: cron.map(h => h.series.reduce((t, s) => t + (s.peso || 0) * (s.reps || 0), 0)), sufixo: ' kg' },
      reps: { nome: 'Total de reps', dados: cron.map(h => h.series.reduce((t, s) => t + (s.reps || 0), 0)) },
      dist: { nome: 'Distância', dados: cron.map(h => h.series.reduce((t, s) => t + (s.peso || 0), 0)), sufixo: ' km' },
      tempo: { nome: 'Tempo', dados: cron.map(h => h.series.reduce((t, s) => t + (s.reps || 0), 0)), sufixo: ' min' },
    };
    let grafico = null;
    const mostrar = async (k) => {
      grafico?.destroy();
      const s = series[k];
      grafico = await criarGrafico(el.querySelector('canvas'), { rotulos, series: [{ nome: s.nome, dados: s.dados }], sufixo: s.sufixo || '' });
    };
    el.querySelector('[data-abas]').addEventListener('click', ev => {
      const b = ev.target.closest('[data-g]'); if (!b) return;
      el.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('ativo', x === b));
      mostrar(b.dataset.g);
    });
    mostrar(tempo ? 'dist' : 'e1rm');
    return () => grafico?.destroy();
  }
}

// ---------- Cartões da tela "Hoje" ----------
async function cartaoProximo(el) {
  const prox = await proximaRotina();
  const ativo = obterAtivo();
  if (ativo) {
    el.innerHTML = `<a class="cartao cartao-destaque" href="#/treino/ativo">${Icone.play}<div><small>Treino em andamento</small><strong>${esc(ativo.nome)}</strong></div>${Icone.seta}</a>`;
    return;
  }
  el.innerHTML = `
    <div class="cartao ${prox ? 'cartao-prox-treino' : ''}">
      <div class="cartao-cab">${Icone.treino}<h3>Próximo treino</h3></div>
      ${prox ? `
        <div class="prox-treino-corpo"><p class="destaque-grande">${esc(prox.nome)}</p>
        <button class="btn btn-primario btn-bloco" data-iniciar>${Icone.play}<span>Iniciar ${esc(prox.nome)}</span></button></div>`
      : `<p class="sutil">Crie sua primeira rotina para receber sugestões.</p>
         <div class="linha-botoes"><a class="btn btn-primario" href="#/treino/rotina/nova">Criar rotina</a><button class="btn btn-secundario" data-vazio>Treino vazio</button></div>`}
    </div>`;
  el.querySelector('[data-iniciar]')?.addEventListener('click', () => iniciarTreino({ rotina: prox }));
  el.querySelector('[data-vazio]')?.addEventListener('click', () => iniciarTreino());
}

async function cartaoUltimo(el) {
  const [treinos, mapa] = await Promise.all([listarTreinos(), mapaDeExercicios()]);
  const t = treinos[0];
  const inicioSemana = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const daSemana = treinos.filter(x => new Date(x.inicio) >= inicioSemana);
  const volSemana = daSemana.reduce((s, x) => s + resumoTreino(x, mapa).volume, 0);
  el.innerHTML = `
    <div class="grade-2">
      <a class="cartao" href="${t ? `#/historico/${t.id}` : '#/historico'}">
        <div class="cartao-cab">${Icone.historico}<h3>Último treino</h3></div>
        ${t ? (() => { const r = resumoTreino(t, mapa); return `<p class="destaque-grande">${esc(t.nome)}</p><p class="sutil">${fmtRelativo(t.inicio)} · ${fmtDuracao(r.duracao)} · ${fmtVolume(r.volume)}</p>`; })()
          : '<p class="sutil">Nenhum treino registrado ainda.</p>'}
      </a>
      <a class="cartao" href="#/progresso">
        <div class="cartao-cab">${Icone.progresso}<h3>Esta semana</h3></div>
        <p class="destaque-grande">${daSemana.length} treino${daSemana.length === 1 ? '' : 's'}</p>
        <p class="sutil">Volume: ${fmtVolume(volSemana)}</p>
      </a>
    </div>`;
}

Modulos.registrar({
  id: 'treino',
  aba: { rota: '/treino', nome: 'Treino', icone: Icone.treino, ordem: 20 },
  tabelas: [T.EXERCICIOS, T.ROTINAS, T.TREINOS],
  rotas: {
    '/treino': telaTreino,
    '/treino/rotina/:id': { view: telaRotina, recarregar: false },
    '/treino/exercicios': { view: telaExercicios, recarregar: false },
    '/treino/exercicio/:id': telaExercicio,
  },
  cartoesHoje: [
    { ordem: 10, render: cartaoProximo },
    { ordem: 20, render: cartaoUltimo },
  ],
});

