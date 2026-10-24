// Componentes do módulo de treino reaproveitados em várias telas.

import { folha, toast, Icone } from '../../core/ui.js';
import { esc, num } from '../../core/util.js';
import { avatarExercicio } from './fotos.js';
import {
  listarExercicios, filtrarExercicios, salvarExercicio, GRUPOS, EQUIPAMENTOS, TIPOS_EXERCICIO, TIPOS_SERIE,
} from './dados.js';

// Lista de exercícios com busca e filtros. Usada na biblioteca e no seletor.
// aoEscolher(ex) é chamado ao tocar num item; selecionados (Set) mostra marcação.
export function montarListaExercicios(el, { aoEscolher, selecionados = null, aoCriar = null }) {
  const filtro = { busca: '', grupo: '', equipamento: '' };
  el.innerHTML = `
    <div class="busca-barra">
      <label class="campo-busca">${Icone.busca}<input type="search" placeholder="Buscar exercício" data-busca></label>
      <div class="filtros">
        <select class="campo campo-mini" data-grupo><option value="">Todos os músculos</option>${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select>
        <select class="campo campo-mini" data-equip><option value="">Todo equipamento</option>${EQUIPAMENTOS.map(g => `<option>${g}</option>`).join('')}</select>
      </div>
      ${aoCriar ? `<button class="btn btn-secundario btn-bloco" data-criar>${Icone.mais}<span>Criar exercício</span></button>` : ''}
    </div>
    <div class="lista-exercicios" data-lista></div>`;
  const lista = el.querySelector('[data-lista]');
  let todos = [];

  const desenhar = () => {
    const itens = filtrarExercicios(todos, filtro);
    lista.innerHTML = itens.length ? itens.map(e => `
      <button class="item-exercicio ${selecionados?.has(e.id) ? 'selecionado' : ''}" data-id="${e.id}">
        ${avatarExercicio(e)}
        <span class="item-texto"><strong>${esc(e.nome)}</strong><small>${esc(e.grupo)} · ${esc(e.equipamento)}${e.base ? '' : ' · personalizado'}</small></span>
        ${selecionados ? `<span class="marca">${Icone.check}</span>` : Icone.seta}
      </button>`).join('') : '<p class="sutil centro">Nenhum exercício encontrado.</p>';
  };

  el.querySelector('[data-busca]').addEventListener('input', e => { filtro.busca = e.target.value; desenhar(); });
  el.querySelector('[data-grupo]').addEventListener('change', e => { filtro.grupo = e.target.value; desenhar(); });
  el.querySelector('[data-equip]').addEventListener('change', e => { filtro.equipamento = e.target.value; desenhar(); });
  lista.addEventListener('click', e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const ex = todos.find(x => x.id === b.dataset.id);
    aoEscolher(ex, b);
  });
  el.querySelector('[data-criar]')?.addEventListener('click', async () => {
    const novo = await formularioExercicio();
    if (novo) { todos = await listarExercicios(); aoCriar(novo); desenhar(); }
  });

  listarExercicios().then(l => { todos = l; desenhar(); });
  return { redesenhar: desenhar };
}

// Seletor de exercícios (pode escolher vários). Retorna array de exercícios.
export function escolherExercicios({ titulo = 'Adicionar exercícios', multiplo = true } = {}) {
  const escolhidos = new Map();
  return folha({
    titulo, classe: 'modal-alto',
    conteudo: (corpo, fechar) => {
      const sel = new Set();
      const rodape = document.createElement('div');
      rodape.className = 'rodape-fixo';
      rodape.innerHTML = `<button class="btn btn-primario btn-bloco" disabled>Adicionar</button>`;
      const btn = rodape.firstElementChild;
      const atualizar = () => { btn.disabled = !sel.size; btn.textContent = sel.size ? `Adicionar ${sel.size} exercício${sel.size > 1 ? 's' : ''}` : 'Adicionar'; };
      btn.onclick = () => fechar([...escolhidos.values()]);
      const area = document.createElement('div');
      corpo.append(area);
      if (multiplo) corpo.append(rodape);
      montarListaExercicios(area, {
        selecionados: multiplo ? sel : null,
        aoEscolher: (ex, botao) => {
          if (!multiplo) { fechar([ex]); return; }
          if (sel.has(ex.id)) { sel.delete(ex.id); escolhidos.delete(ex.id); } else { sel.add(ex.id); escolhidos.set(ex.id, ex); }
          botao.classList.toggle('selecionado', sel.has(ex.id));
          atualizar();
        },
        aoCriar: ex => { if (multiplo) { sel.add(ex.id); escolhidos.set(ex.id, ex); atualizar(); } else fechar([ex]); },
      });
    },
  }).then(r => r || []);
}

// Formulário de criação/edição de exercício. Para exercícios da biblioteca,
// só descanso e notas são editáveis.
export function formularioExercicio(ex = null) {
  const base = ex?.base;
  const e = ex || { nome: '', grupo: 'Peito', equipamento: 'Barra', tipo: 'peso_reps', descanso: '', notas: '' };
  return folha({
    titulo: ex ? 'Editar exercício' : 'Novo exercício',
    conteudo: `
      <div class="form">
        <label>Nome<input class="campo" name="nome" value="${esc(e.nome)}" ${base ? 'disabled' : 'autofocus'} required></label>
        <div class="linha-2">
          <label>Grupo muscular<select class="campo" name="grupo" ${base ? 'disabled' : ''}>${GRUPOS.map(g => `<option ${g === e.grupo ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
          <label>Equipamento<select class="campo" name="equipamento" ${base ? 'disabled' : ''}>${EQUIPAMENTOS.map(g => `<option ${g === e.equipamento ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        </div>
        <label>Tipo de registro<select class="campo" name="tipo" ${base ? 'disabled' : ''}>${Object.entries(TIPOS_EXERCICIO).map(([k, v]) => `<option value="${k}" ${k === e.tipo ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></label>
        <label>Descanso entre séries (segundos)<input class="campo" name="descanso" inputmode="numeric" placeholder="Padrão do app" value="${esc(e.descanso ?? '')}"></label>
        <label>Notas<textarea class="campo" name="notas" rows="2" placeholder="Ajuste do banco, pegada…">${esc(e.notas || '')}</textarea></label>
      </div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: null },
      {
        texto: 'Salvar', classe: 'btn-primario', acao: async (c) => {
          const v = n => c.querySelector(`[name=${n}]`).value;
          const nome = v('nome').trim();
          if (!nome) { toast('Informe o nome do exercício', 'erro'); return false; }
          const descanso = num(v('descanso'));
          return salvarExercicio({
            ...(ex || {}), nome, grupo: v('grupo'), equipamento: v('equipamento'), tipo: v('tipo'),
            descanso: descanso === null ? null : Math.max(0, Math.round(descanso)), notas: v('notas').trim(),
          });
        },
      },
    ],
  });
}

// Seletor de tipo de série
export function escolherTipoSerie(atual, { permitirRemover = true } = {}) {
  return folha({
    titulo: 'Tipo de série', classe: 'modal-pequeno',
    conteudo: (corpo, fechar) => {
      corpo.innerHTML = `<div class="lista-menu">
        ${Object.entries(TIPOS_SERIE).map(([k, t]) => `
          <button class="item-menu ${k === atual ? 'ativo' : ''}" data-v="${k}">
            <span class="tipo-serie ${t.classe}">${t.curto || '1'}</span><span>${t.nome}</span>
          </button>`).join('')}
        ${permitirRemover ? `<button class="item-menu perigo" data-v="remover">${Icone.lixo}<span>Remover série</span></button>` : ''}
      </div>`;
      corpo.querySelectorAll('[data-v]').forEach(b => b.onclick = () => fechar(b.dataset.v));
    },
  });
}

// Rótulo da série: aquecimento "A", drop "D", falha "F", normais numeradas.
export function rotulosSeries(series) {
  let n = 0;
  return series.map(s => (s.tipo === 'N' || !s.tipo ? String(++n) : TIPOS_SERIE[s.tipo].curto));
}

// Tempo de descanso: o usuário digita minutos e segundos (0 = desligado).
// Resolve com os segundos, ou undefined se cancelar.
export function escolherDescanso(atualSeg) {
  const seg = Number(atualSeg) || 0;
  return folha({
    titulo: 'Tempo de descanso', classe: 'modal-pequeno',
    conteudo: (corpo, fechar) => {
      corpo.innerHTML = `
        <div class="campos-tempo">
          <label><input class="campo" data-min type="number" inputmode="numeric" min="0" max="59" placeholder="0" value="${seg ? Math.floor(seg / 60) : ''}"><span>min</span></label>
          <span class="dois-pontos">:</span>
          <label><input class="campo" data-seg type="number" inputmode="numeric" min="0" max="59" placeholder="00" value="${seg ? String(seg % 60).padStart(2, '0') : ''}"><span>seg</span></label>
        </div>
        <div class="linha-botoes">
          <button class="btn btn-secundario" data-desligar>Desligar</button>
          <button class="btn btn-primario" data-salvar>Salvar</button>
        </div>`;
      const min = corpo.querySelector('[data-min]'), s = corpo.querySelector('[data-seg]');
      const salvar = () => fechar(Math.max(0, Math.round((num(min.value) || 0) * 60 + (num(s.value) || 0))));
      corpo.querySelector('[data-desligar]').onclick = () => fechar(0);
      corpo.querySelector('[data-salvar]').onclick = salvar;
      [min, s].forEach(c => c.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); salvar(); } }));
      setTimeout(() => min.focus(), 50);
    },
  });
}

// RIR (repetições em reserva) de uma série. Resolve com o número, null para limpar ou undefined.
export function escolherRir(atual) {
  return folha({
    titulo: 'RIR (repetições em reserva)', classe: 'modal-pequeno',
    conteudo: (corpo, fechar) => {
      corpo.innerHTML = `
        <p class="sutil" style="margin-top:0">Quantas repetições ainda daria para fazer?</p>
        <div class="grade-opcoes">${[0, 1, 2, 3, 4, 5].map(v =>
          `<button class="chip ${v === atual ? 'ativo' : ''}" data-v="${v}"><strong>${v === 5 ? '5+' : v}</strong>${v === 0 ? ' falha' : ''}</button>`).join('')}</div>
        ${atual !== null && atual !== undefined ? '<button class="btn btn-secundario btn-bloco" data-limpar style="margin-top:10px">Limpar</button>' : ''}`;
      corpo.querySelectorAll('[data-v]').forEach(b => b.onclick = () => fechar(Number(b.dataset.v)));
      corpo.querySelector('[data-limpar]')?.addEventListener('click', () => fechar(null));
    },
  });
}

export const fmtRir = v => (v === null || v === undefined ? '' : v >= 5 ? '5+' : String(v));
