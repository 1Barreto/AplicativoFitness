// Temas de cor. O estilo (preto OLED) é o mesmo; muda a cor principal e a
// secundária (recordes, sequência e descanso). As cores ficam no CSS, em
// :root e nos blocos [data-tema]; aqui só guardamos a escolha.

export const TEMAS = [
  { id: 'menta', nome: 'Menta', p: '#2ee6b6', s: '#ff8a3d' },
  { id: 'azul', nome: 'Azul', p: '#3d8bff', s: '#ffc53d' },
  { id: 'roxo', nome: 'Roxo', p: '#a98bff', s: '#ff5c93' },
  { id: 'laranja', nome: 'Laranja', p: '#ff7a1a', s: '#49c2ff' },
  { id: 'coral', nome: 'Coral', p: '#ff4d5e', s: '#ffc24d' },
];

export function temaAtual() {
  try { return localStorage.getItem('tema') || 'menta'; } catch { return 'menta'; }
}

export function aplicarTema(id) {
  if (!TEMAS.some(t => t.id === id)) id = 'menta';
  try { localStorage.setItem('tema', id); } catch { /* sem armazenamento */ }
  if (id === 'menta') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = id;
}

// Fundo e cartões (Ajustes > Aparência). Os tons ficam no CSS, nos blocos
// [data-fundo]; "grafite" é o padrão (sem atributo).
export const FUNDOS = [
  { id: 'grafite', nome: 'Grafite', fundo: '#0b0b0d', cartao: '#1c1c1e' },
  { id: 'escuro', nome: 'Grafite escuro', fundo: '#000000', cartao: '#111113' },
  { id: 'contorno', nome: 'Preto com contorno', fundo: '#000000', cartao: '#0a0a0b', contorno: true },
  { id: 'azul', nome: 'Azul-noite', fundo: '#05070b', cartao: '#0f131b' },
  { id: 'petroleo', nome: 'Verde-petróleo', fundo: '#030706', cartao: '#0c1513' },
  { id: 'quente', nome: 'Grafite quente', fundo: '#0a0908', cartao: '#161412' },
];

export function fundoAtual() {
  try { return localStorage.getItem('fundo') || 'grafite'; } catch { return 'grafite'; }
}

export function aplicarFundo(id) {
  const f = FUNDOS.find(x => x.id === id) || FUNDOS[0];
  try { localStorage.setItem('fundo', f.id); } catch { /* sem armazenamento */ }
  if (f.id === 'grafite') delete document.documentElement.dataset.fundo;
  else document.documentElement.dataset.fundo = f.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', f.fundo);
}
