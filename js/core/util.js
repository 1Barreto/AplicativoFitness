// Utilitários gerais, sem dependências.

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback para navegadores antigos
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const agoraISO = () => new Date().toISOString();

// Barramento de eventos simples para comunicação entre módulos.
const ouvintes = new Map();
export const Bus = {
  on(evento, fn) {
    if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
    ouvintes.get(evento).add(fn);
    return () => ouvintes.get(evento).delete(fn);
  },
  emit(evento, dados) {
    (ouvintes.get(evento) || []).forEach(fn => { try { fn(dados); } catch (e) { console.error(e); } });
  },
};

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Aceita "82,5" ou "82.5". Retorna null se vazio/inválido.
export function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export const fmtNum = n => (n === null || n === undefined || n === '' ? '' : nf.format(n));
export const fmtKg = n => (n === null || n === undefined ? '–' : `${nf1.format(n)} kg`);
export function fmtVolume(kg) {
  if (!kg) return '0 kg';
  if (kg >= 10000) return `${nf1.format(kg / 1000)} t`;
  return `${nf.format(Math.round(kg))} kg`;
}

export function fmtData(iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', opts);
}
export function fmtDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
export function fmtRelativo(iso) {
  if (!iso) return '';
  const d = new Date(iso); const hoje = new Date();
  const dias = Math.round((inicioDoDia(hoje) - inicioDoDia(d)) / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return fmtData(iso);
}
export function inicioDoDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
// Semana começando na segunda-feira
export function inicioDaSemana(d) {
  const x = inicioDoDia(d);
  const dia = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dia);
  return x;
}
export function dataInput(iso) { // yyyy-mm-dd no fuso local
  const d = iso ? new Date(iso) : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function dataHoraInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${dataInput(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDuracao(ms, comSegundos = false) {
  if (!ms || ms < 0) ms = 0;
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (comSegundos) {
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  }
  return h ? `${h}h ${m}min` : `${m}min`;
}
export function fmtSeg(seg) {
  seg = Math.max(0, Math.round(seg));
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

// 1RM estimado (fórmula de Epley). Com 1 repetição, é a própria carga.
export function e1rm(peso, reps) {
  if (!peso || !reps) return 0;
  if (reps === 1) return peso;
  return peso * (1 + reps / 30);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function carregarScript(src) {
  return new Promise((ok, erro) => {
    const jaExiste = document.querySelector(`script[src="${src}"]`);
    if (jaExiste) { jaExiste.dataset.ok ? ok() : jaExiste.addEventListener('load', () => ok()); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => { s.dataset.ok = '1'; ok(); };
    s.onerror = () => { s.remove(); erro(new Error('Falha ao carregar ' + src)); };
    document.head.appendChild(s);
  });
}

export const clone = o => JSON.parse(JSON.stringify(o));
