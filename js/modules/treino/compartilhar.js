// Imagem do treino para compartilhar (Stories, WhatsApp): um cartão 1080 × 1350
// desenhado num canvas com o resumo, os exercícios e os recordes.

import { esc, fmtNum, fmtDuracao, fmtVolume } from '../../core/util.js';
import { folha, toast, Icone } from '../../core/ui.js';
import { resumoTreino, melhoresDeSeries } from './dados.js';

const L = 1080, A = 1350, M = 84; // largura, altura, margem

function cor(nome, padrao) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;
}

// Corta o texto com "…" para caber na largura
function caber(ctx, texto, largura) {
  if (ctx.measureText(texto).width <= largura) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function retangulo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function gerarImagem(t, mapa, recordes) {
  const fonte = cor('--fonte', 'sans-serif');
  let destaque = cor('--destaque', '#2ee6b6');
  if (!/^#[0-9a-f]{6}$/i.test(destaque)) destaque = '#2ee6b6';
  await Promise.all(['500', '700', '800'].map(p => document.fonts?.load(`${p} 40px ${fonte}`).catch(() => {})));
  const c = document.createElement('canvas');
  c.width = L; c.height = A;
  const ctx = c.getContext('2d');
  const f = (peso, px) => { ctx.font = `${peso} ${px}px ${fonte}`; };

  // Fundo escuro com brilho na cor de destaque
  ctx.fillStyle = '#050607'; ctx.fillRect(0, 0, L, A);
  const brilho = ctx.createRadialGradient(L * 0.85, 0, 0, L * 0.85, 0, L * 0.9);
  brilho.addColorStop(0, `${destaque}55`); brilho.addColorStop(1, `${destaque}00`);
  ctx.fillStyle = brilho; ctx.fillRect(0, 0, L, A);

  const r = resumoTreino(t, mapa);
  const prs = t.exercicios.reduce((n, e) => n + e.series.filter(s => recordes.has(s.uid)).length, 0);
  let y = M + 40;

  f(700, 30); ctx.fillStyle = destaque;
  ctx.fillText(new Date(t.inicio).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase(), M, y);
  y += 90;
  f(800, 80); ctx.fillStyle = '#fff';
  ctx.fillText(caber(ctx, t.nome || 'Treino', L - 2 * M), M, y);
  y += 60;

  // Números do treino
  const stats = [['Duração', fmtDuracao(r.duracao)], ['Volume', fmtVolume(r.volume)], ['Séries', String(r.series)], ['Recordes', String(prs)]];
  const w = (L - 2 * M - 3 * 20) / 4;
  stats.forEach(([rot, val], i) => {
    const x = M + i * (w + 20);
    retangulo(ctx, x, y, w, 150, 28); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
    f(600, 26); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(rot, x + 26, y + 52);
    let px = 44; f(800, px);
    while (px > 26 && ctx.measureText(val).width > w - 46) f(800, --px); // números longos diminuem em vez de cortar
    ctx.fillStyle = i === 3 && prs ? destaque : '#fff'; ctx.fillText(caber(ctx, val, w - 46), x + 26, y + 112);
  });
  y += 150 + 76;

  // Exercícios: séries feitas e a melhor série
  f(700, 30); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText('EXERCÍCIOS', M, y);
  y += 24;
  const lista = t.exercicios.map(e => {
    const feitas = e.series.filter(s => s.feita !== false);
    const m = melhoresDeSeries(feitas);
    const melhor = feitas.filter(s => s.tipo !== 'A' && s.peso != null).sort((a, b) => (b.peso - a.peso) || ((b.reps || 0) - (a.reps || 0)))[0];
    return {
      nome: mapa.get(e.exercicio_id)?.nome || 'Exercício',
      series: feitas.length,
      melhor: melhor ? `${fmtNum(melhor.peso)} kg × ${fmtNum(melhor.reps)}` : feitas[0]?.reps ? `${fmtNum(feitas[0].reps)} reps` : '',
      pr: e.series.some(s => recordes.has(s.uid)) && m.carga > 0,
    };
  });
  const cabe = Math.min(lista.length, 8);
  const alturaLinha = 92;
  lista.slice(0, cabe).forEach(x => {
    y += alturaLinha;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(M, y - alturaLinha + 30, L - 2 * M, 2);
    f(800, 34); ctx.fillStyle = destaque; ctx.fillText(`${x.series}×`, M, y);
    f(600, 34); ctx.fillStyle = '#fff';
    const direita = x.melhor ? x.melhor : '';
    f(700, 32); const wDir = ctx.measureText(direita).width + (x.pr ? 60 : 0);
    f(600, 34); ctx.fillText(caber(ctx, x.nome, L - 2 * M - 90 - wDir - 30), M + 90, y);
    f(700, 32); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'right';
    ctx.fillText(direita, L - M - (x.pr ? 60 : 0), y);
    if (x.pr) { ctx.fillStyle = destaque; f(800, 32); ctx.fillText('PR', L - M, y); }
    ctx.textAlign = 'left';
  });
  if (lista.length > cabe) {
    y += 70; f(600, 30); ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillText(`+ ${lista.length - cabe} exercício${lista.length - cabe > 1 ? 's' : ''}`, M + 90, y);
  }

  // Rodapé
  f(700, 28); ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.fillText('Aplicativo Fitness', M, A - M + 10);

  return new Promise(ok => c.toBlob(ok, 'image/png'));
}

// Mostra a prévia e o botão de compartilhar (o compartilhamento precisa
// partir de um toque, por isso a imagem é gerada antes)
export async function compartilharTreino(t, mapa, recordes) {
  const blob = await gerarImagem(t, mapa, recordes);
  if (!blob) { toast('Não foi possível gerar a imagem', 'erro'); return; }
  const nome = `treino-${(t.inicio || '').slice(0, 10)}.png`;
  const arquivo = new File([blob], nome, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const podeCompartilhar = !!navigator.canShare?.({ files: [arquivo] });
  await folha({
    titulo: 'Compartilhar treino', classe: 'modal-alto modal-compartilhar',
    conteudo: (corpo, fechar) => {
      corpo.innerHTML = `
        <img class="previa-treino" src="${url}" alt="Imagem do treino ${esc(t.nome)}">
        <div class="linha-botoes">
          <a class="btn btn-secundario" href="${url}" download="${esc(nome)}">${Icone.baixar}<span>Salvar</span></a>
          ${podeCompartilhar ? `<button class="btn btn-primario" data-compartilhar>${Icone.subir}<span>Compartilhar</span></button>` : ''}
        </div>
        ${podeCompartilhar ? '' : '<p class="sutil pequeno">No iPhone, você também pode tocar e segurar a imagem para salvar nas Fotos.</p>'}`;
      corpo.querySelector('[data-compartilhar]')?.addEventListener('click', async () => {
        try { await navigator.share({ files: [arquivo], title: t.nome }); fechar(true); } catch (e) { if (e.name !== 'AbortError') toast('Não foi possível compartilhar', 'erro'); }
      });
    },
  });
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
