// Avisos sonoros com Web Audio (o iPhone não permite vibrar pela web).
// No iPhone o áudio só é liberado depois de um toque na tela, por isso
// chamamos som.desbloquear() no primeiro toque.

let ctx = null;

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tom(freq, inicio, duracao, volume) {
  const c = contexto(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  const t = c.currentTime + inicio;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + duracao + 0.05);
}

export const som = {
  ativo: () => localStorage.getItem('som') !== '0',
  definirAtivo: v => localStorage.setItem('som', v ? '1' : '0'),

  desbloquear() {
    try {
      // Safari 16.4+: toca mesmo com a chave de silêncio ligada
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      const c = contexto(); if (!c) return;
      if (c.state === 'suspended') c.resume();
      tom(1, 0, 0.01, 0.0001); // som inaudível só para liberar o áudio
    } catch (e) { /* ignora */ }
  },

  // Fim do descanso: três bipes
  fimDescanso() {
    if (!som.ativo()) return;
    try {
      contexto()?.resume?.();
      [0, 0.25, 0.5].forEach((t, i) => tom(i === 2 ? 1320 : 880, t, 0.18, 0.5));
    } catch (e) { /* ignora */ }
  },

  // Aviso curto (ex.: faltam 10 s)
  bip() {
    if (!som.ativo()) return;
    try { tom(660, 0, 0.12, 0.3); } catch (e) { /* ignora */ }
  },

  recorde() {
    if (!som.ativo()) return;
    try { [523, 659, 784, 1047].forEach((f, i) => tom(f, i * 0.09, 0.2, 0.35)); } catch (e) { /* ignora */ }
  },
};
