// Componentes de interface reutilizáveis: ícones, toasts, folhas (modais),
// confirmação, título da tela.

import { esc } from './util.js';

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const Icone = {
  hoje: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>'),
  perfil: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  calendario: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  musculo: svg('<path d="M7 14c-2-1-3-3-2-5 1-3 5-4 7-2l2 2c2-1 5 0 5 3 0 4-4 7-9 7-2 0-3-1-3-2z"/><path d="M9 7 8 4"/>'),
  treino: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  historico: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  progresso: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  mais: svg('<path d="M12 5v14M5 12h14"/>'),
  lixo: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  editar: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  voltar: svg('<path d="m15 18-6-6 6-6"/>'),
  seta: svg('<path d="m9 18 6-6-6-6"/>'),
  busca: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
  trofeu: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  fechar: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  pontos: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  play: svg('<path d="M7 4v16l13-8z"/>'),
  nuvem: svg('<path d="M17.5 19H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10.5a4.3 4.3 0 0 1-1.5 8.5z"/>'),
  sincronizar: svg('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>'),
  baixar: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  subir: svg('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
  cima: svg('<path d="m18 15-6-6-6 6"/>'),
  baixo: svg('<path d="m6 9 6 6 6-6"/>'),
  copiar: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  dieta: svg('<path d="M12 8c-3-3-8-1-8 4s3 9 5 9c1 0 2-.5 3-.5s2 .5 3 .5c2 0 5-4 5-9s-5-7-8-4z"/><path d="M12 8c0-3 1-5 3-5"/>'),
  balanca: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 11a5 5 0 0 1 10 0z"/><path d="m12 11 1.5-2.5"/>'),
};

// ---------- Título / topo ----------
export function definirTitulo(titulo, { voltar = null } = {}) {
  document.getElementById('titulo').textContent = titulo;
  document.title = titulo ? `${titulo} · Aplicativo` : 'Aplicativo';
  const b = document.getElementById('btn-voltar');
  if (voltar) {
    b.hidden = false;
    b.onclick = () => (typeof voltar === 'function' ? voltar() : (location.hash = voltar));
  } else { b.hidden = true; b.onclick = null; }
}

// ---------- Toasts ----------
export function toast(msg, tipo = 'info', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = msg;
  document.getElementById('toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('visivel'));
  setTimeout(() => { el.classList.remove('visivel'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- Folha (modal que sobe de baixo no celular, centralizado no computador) ----------
// conteudo: string HTML ou função (corpoEl, fechar) => void
// Retorna uma Promise resolvida com o valor passado para fechar(valor).
export function folha({ titulo = '', conteudo = '', classe = '', acoes = null } = {}) {
  return new Promise(resolver => {
    const camada = document.getElementById('camada-modal');
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `
      <div class="modal ${classe}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <div class="modal-topo">
          <h2>${esc(titulo)}</h2>
          <button class="icon-btn" data-fechar aria-label="Fechar">${Icone.fechar}</button>
        </div>
        <div class="modal-corpo"></div>
        ${acoes ? '<div class="modal-acoes"></div>' : ''}
      </div>`;
    const corpo = fundo.querySelector('.modal-corpo');
    let fechado = false;
    const fechar = (valor) => {
      if (fechado) return; fechado = true;
      fundo.classList.remove('visivel');
      setTimeout(() => fundo.remove(), 250);
      document.body.classList.toggle('com-modal', camada.children.length > 1);
      resolver(valor);
    };
    if (typeof conteudo === 'function') conteudo(corpo, fechar); else corpo.innerHTML = conteudo;
    if (acoes) {
      const area = fundo.querySelector('.modal-acoes');
      acoes.forEach(a => {
        const b = document.createElement('button');
        b.className = `btn ${a.classe || ''}`;
        b.textContent = a.texto;
        b.onclick = async () => {
          if (a.acao) { const r = await a.acao(corpo); if (r === false) return; fechar(r ?? a.valor); }
          else fechar(a.valor);
        };
        area.appendChild(b);
      });
    }
    fundo.querySelector('[data-fechar]').onclick = () => fechar(undefined);
    fundo.addEventListener('click', e => { if (e.target === fundo) fechar(undefined); });
    camada.appendChild(fundo);
    document.body.classList.add('com-modal');
    requestAnimationFrame(() => fundo.classList.add('visivel'));
    const foco = corpo.querySelector('[autofocus]');
    if (foco) setTimeout(() => foco.focus(), 50);
  });
}

export function confirmar(mensagem, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
  return folha({
    titulo, classe: 'modal-pequeno',
    conteudo: `<p class="texto-modal">${mensagem}</p>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: false },
      { texto: ok, classe: perigo ? 'btn-perigo' : 'btn-primario', valor: true },
    ],
  }).then(v => !!v);
}

// Menu de opções simples. itens: [{texto, valor, perigo}]
export function menu(titulo, itens) {
  return folha({
    titulo, classe: 'modal-pequeno',
    conteudo: (corpo, fechar) => {
      corpo.innerHTML = `<div class="lista-menu">${itens.map((it, i) =>
        `<button class="item-menu ${it.perigo ? 'perigo' : ''}" data-i="${i}">${it.icone || ''}<span>${esc(it.texto)}</span></button>`).join('')}</div>`;
      corpo.querySelectorAll('[data-i]').forEach(b => b.onclick = () => fechar(itens[+b.dataset.i].valor));
    },
  });
}

export function pedirTexto(titulo, valor = '', { placeholder = '', ok = 'Salvar' } = {}) {
  return folha({
    titulo, classe: 'modal-pequeno',
    conteudo: `<input class="campo" id="pedir-texto" value="${esc(valor)}" placeholder="${esc(placeholder)}" autofocus>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: null },
      { texto: ok, classe: 'btn-primario', acao: c => c.querySelector('#pedir-texto').value.trim() || false },
    ],
  });
}

export function vazio(icone, titulo, texto = '', acaoHtml = '') {
  return `<div class="vazio">${icone}<h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}${acaoHtml}</div>`;
}
