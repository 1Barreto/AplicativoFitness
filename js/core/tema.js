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
