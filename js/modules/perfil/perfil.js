// Aba "Perfil": resumo geral no estilo do Hevy, com estatísticas semanais,
// calendário de treinos, músculos trabalhados, peso e atalhos para
// Histórico, Progresso e Corpo (que viraram subpáginas desta aba).

import { Modulos } from '../../core/modulos.js';
import { Auth } from '../../core/auth.js';
import { esc, fmtNum, fmtVolume, fmtDuracao, fmtDataHora, fmtRelativo, inicioDaSemana, inicioDoDia, dataInput } from '../../core/util.js';
import { Icone, definirTitulo, vazio } from '../../core/ui.js';
import { criarGrafico } from '../../core/graficos.js';
import { listarTreinos, mapaDeExercicios, resumoTreino, mapaDeRecordes, NOMES_RECORDE, contaParaVolume } from '../treino/dados.js';
import { listarMedidas } from '../corpo/dados.js';

const METRICAS = {
  duracao: { nome: 'Duração' },
  volume: { nome: 'Volume' },
  reps: { nome: 'Repetições' },
  treinos: { nome: 'Treinos' },
};
const PERIODOS = { 12: 'Últimas 12 semanas', 26: 'Últimos 6 meses', 52: 'Último ano' };

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fmtHoras = h => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60), mm = total % 60;
  return hh ? `${hh} h${mm ? ` ${mm} min` : ''}` : `${mm} min`;
};

// Preferências da tela (lembradas neste aparelho)
const pref = {
  get: (k, padrao) => { try { return localStorage.getItem(`perfil.${k}`) ?? padrao; } catch { return padrao; } },
  set: (k, v) => { try { localStorage.setItem(`perfil.${k}`, v); } catch { /* ignora */ } },
};

function semanasSeguidas(treinos) {
  const semanas = new Set(treinos.map(t => inicioDaSemana(new Date(t.inicio)).getTime()));
  let atual = inicioDaSemana(new Date());
  // Se ainda não treinou nesta semana, a sequência conta a partir da anterior
  if (!semanas.has(atual.getTime())) atual.setDate(atual.getDate() - 7);
  let n = 0;
  while (semanas.has(atual.getTime())) { n++; atual.setDate(atual.getDate() - 7); }
  return n;
}

async function telaPerfil(el) {
  definirTitulo('Perfil');
  const [treinos, mapa, recordes, medidas] = await Promise.all([listarTreinos(), mapaDeExercicios(), mapaDeRecordes(), listarMedidas()]);
  const usuario = Auth.usuario();
  const nome = usuario?.email?.split('@')[0] || 'Meu perfil';

  // Métricas por treino (calculadas uma vez)
  const info = treinos.map(t => {
    const r = resumoTreino(t, mapa);
    let reps = 0;
    t.exercicios.forEach(e => { if (contaParaVolume(mapa.get(e.exercicio_id))) e.series.forEach(s => { if (s.feita) reps += s.reps || 0; }); });
    const prs = t.exercicios.reduce((n, e) => n + e.series.filter(s => recordes.has(s.uid)).length, 0);
    return { t, ...r, reps, prs, data: new Date(t.inicio) };
  });

  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const noMes = info.filter(i => i.data >= inicioMes).length;
  const totalPrs = info.reduce((n, i) => n + i.prs, 0);
  const sequencia = semanasSeguidas(treinos);

  el.classList.add('tela-perfil');
  el.innerHTML = `
    <section class="cartao perfil-cab">
      <div class="perfil-id">
        <span class="avatar-ex grande">${esc(nome[0].toUpperCase())}</span>
        <div><h2>${esc(nome)}</h2><p class="sutil">${treinos.length ? `Treinando desde ${new Date(treinos[treinos.length - 1].inicio).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}` : 'Comece seu primeiro treino!'}</p></div>
      </div>
      <div class="perfil-numeros">
        <div><strong>${treinos.length}</strong><small>Treinos</small></div>
        <div><strong>${noMes}</strong><small>Neste mês</small></div>
        <div><strong>${sequencia}</strong><small>Semana${sequencia === 1 ? '' : 's'} seguida${sequencia === 1 ? '' : 's'}</small></div>
        <div><strong>${totalPrs}</strong><small>Recordes</small></div>
      </div>
    </section>

    <nav class="perfil-atalhos">
      <a class="cartao atalho" href="#/historico">${Icone.historico}<span><strong>Histórico</strong><small>${treinos.length ? `Último ${fmtRelativo(treinos[0].inicio)}` : 'Nenhum treino'}</small></span>${Icone.seta}</a>
      <a class="cartao atalho" href="#/progresso">${Icone.progresso}<span><strong>Progresso</strong><small>Recordes e evolução</small></span>${Icone.seta}</a>
      <a class="cartao atalho" href="#/corpo">${Icone.balanca}<span><strong>Corpo</strong><small>${medidas.find(m => m.peso) ? `${fmtNum(medidas.find(m => m.peso).peso)} kg` : 'Medidas corporais'}</small></span>${Icone.seta}</a>
    </nav>

    <div class="perfil-grade">
      <section class="cartao perfil-estat">
        <div class="cartao-cab">${Icone.progresso}<h3>Estatísticas</h3></div>
        <div class="abas-linha" data-metricas>
          ${Object.entries(METRICAS).map(([k, m]) => `<button data-m="${k}">${m.nome}</button>`).join('')}
        </div>
        <div class="estat-topo">
          <div><strong class="numero-grande" data-numero></strong> <small class="sutil">Esta semana</small><div class="sutil pequeno" data-media></div></div>
          <select class="campo campo-mini" data-periodo>${Object.entries(PERIODOS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        </div>
        <div class="grafico"><canvas data-g="estat"></canvas></div>
      </section>

      <section class="cartao perfil-cal">
        <div class="cartao-cab">${Icone.calendario}<h3>Calendário</h3></div>
        <div data-calendario></div>
      </section>

      <section class="cartao perfil-musculos">
        <div class="cartao-cab">${Icone.musculo}<h3>Séries por músculo</h3></div>
        <div class="abas-linha" data-dias>
          <button data-d="30">30 dias</button><button data-d="90">3 meses</button><button data-d="365">1 ano</button>
        </div>
        <div class="grafico grafico-alto" data-area-musc><canvas data-g="musc"></canvas></div>
      </section>

      <section class="cartao perfil-peso">
        <div class="cartao-cab">${Icone.balanca}<h3>Peso corporal</h3><a class="link-cab" href="#/corpo">Ver tudo</a></div>
        <div data-peso></div>
      </section>
    </div>

    <h2 class="secao">Recordes recentes</h2>
    <div data-recordes></div>

    <h2 class="secao">Últimos treinos <a class="link-cab" href="#/historico">Ver todos</a></h2>
    <div class="grade-cartoes" data-ultimos></div>
  `;

  const graficos = {};
  const trocar = async (k, criar) => { graficos[k]?.destroy(); graficos[k] = await criar(); };

  // ---------- Estatísticas semanais ----------
  let metrica = pref.get('metrica', 'duracao');
  let periodo = Number(pref.get('periodo', 12));
  if (!METRICAS[metrica]) metrica = 'duracao';
  if (!PERIODOS[periodo]) periodo = 12;
  el.querySelector('[data-periodo]').value = String(periodo);

  const valorDe = (i, m) => (m === 'duracao' ? i.duracao / 3600000 : m === 'volume' ? i.volume : m === 'reps' ? i.reps : 1);
  const formatoDe = m => (m === 'duracao' ? fmtHoras : m === 'volume' ? v => fmtVolume(v) : v => nf.format(v));

  async function desenharEstat() {
    el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('ativo', b.dataset.m === metrica));
    const hoje = inicioDaSemana(new Date());
    const semanas = [];
    for (let k = periodo - 1; k >= 0; k--) { const d = new Date(hoje); d.setDate(d.getDate() - k * 7); semanas.push(d); }
    const valores = semanas.map(() => 0);
    const idx = new Map(semanas.map((s, k) => [s.getTime(), k]));
    info.forEach(i => { const k = idx.get(inicioDaSemana(i.data).getTime()); if (k !== undefined) valores[k] += valorDe(i, metrica); });
    const fmt = formatoDe(metrica);
    el.querySelector('[data-numero]').textContent = fmt(valores[valores.length - 1]);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    el.querySelector('[data-media]').textContent = `Média: ${fmt(media)} por semana`;
    const cor = getComputedStyle(document.documentElement).getPropertyValue('--destaque').trim();
    const corSuave = '#2a6b5c'; // semanas anteriores mais apagadas; a atual em destaque
    await trocar('estat', () => criarGrafico(el.querySelector('[data-g=estat]'), {
      tipo: 'bar',
      rotulos: semanas.map(s => s.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')),
      series: [{ nome: METRICAS[metrica].nome, dados: valores.map(v => Math.round(v * 100) / 100), cor: valores.map((_, k) => (k === valores.length - 1 ? cor : corSuave)) }],
      formatar: fmt, inteiro: metrica === 'treinos',
    }));
  }
  el.querySelector('[data-metricas]').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    metrica = b.dataset.m; pref.set('metrica', metrica); desenharEstat();
  });
  el.querySelector('[data-periodo]').addEventListener('change', e => { periodo = Number(e.target.value); pref.set('periodo', periodo); desenharEstat(); });

  // ---------- Calendário ----------
  const porDia = new Map();
  info.forEach(i => { const k = dataInput(i.data); if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(i.t); });
  const mesRef = new Date(); mesRef.setDate(1); mesRef.setHours(0, 0, 0, 0);
  const calEl = el.querySelector('[data-calendario]');

  function desenharCal() {
    const ano = mesRef.getFullYear(), mes = mesRef.getMonth();
    const primeiro = new Date(ano, mes, 1);
    const inicio = new Date(primeiro); inicio.setDate(1 - primeiro.getDay()); // semana começa no domingo
    const hojeK = dataInput(new Date());
    let dias = '', treinosMes = 0;
    for (let k = 0; k < 42; k++) {
      const d = new Date(inicio); d.setDate(inicio.getDate() + k);
      if (k >= 35 && d.getMonth() !== mes) break;
      const chave = dataInput(d);
      const lista = porDia.get(chave);
      const doMes = d.getMonth() === mes;
      if (doMes && lista) treinosMes++;
      dias += `<button class="dia ${doMes ? '' : 'fora'} ${lista ? 'treinou' : ''} ${chave === hojeK ? 'hoje' : ''}" ${lista ? `data-dia="${chave}" title="${esc(lista.map(t => t.nome).join(', '))}"` : 'disabled'}>${d.getDate()}</button>`;
    }
    const titulo = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    calEl.innerHTML = `
      <div class="cal-topo">
        <button class="icon-btn" data-cal="-1" aria-label="Mês anterior">${Icone.voltar}</button>
        <div><strong>${titulo}</strong><small class="sutil">${treinosMes} treino${treinosMes === 1 ? '' : 's'}</small></div>
        <button class="icon-btn" data-cal="1" aria-label="Próximo mês">${Icone.seta}</button>
      </div>
      <div class="cal-grade">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<span class="cal-sem">${x}</span>`).join('')}${dias}</div>`;
  }
  calEl.addEventListener('click', e => {
    const n = e.target.closest('[data-cal]');
    if (n) { mesRef.setMonth(mesRef.getMonth() + Number(n.dataset.cal)); desenharCal(); return; }
    const d = e.target.closest('[data-dia]');
    if (d) {
      const lista = porDia.get(d.dataset.dia);
      location.hash = lista.length === 1 ? `#/historico/${lista[0].id}` : '#/historico';
    }
  });

  // ---------- Séries por músculo ----------
  let dias = Number(pref.get('dias', 30));
  async function desenharMusculos() {
    el.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('ativo', Number(b.dataset.d) === dias));
    const limite = inicioDoDia(new Date()); limite.setDate(limite.getDate() - dias + 1);
    const contagem = new Map();
    info.filter(i => i.data >= limite).forEach(i => i.t.exercicios.forEach(e => {
      const g = mapa.get(e.exercicio_id)?.grupo || 'Outro';
      const n = e.series.filter(s => s.feita && s.tipo !== 'A').length;
      if (n) contagem.set(g, (contagem.get(g) || 0) + n);
    }));
    const lista = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
    const area = el.querySelector('[data-area-musc]');
    if (!lista.length) {
      graficos.musc?.destroy(); graficos.musc = null;
      area.innerHTML = '<p class="sutil centro">Sem treinos neste período.</p>';
      return;
    }
    if (!area.querySelector('canvas')) area.innerHTML = '<canvas data-g="musc"></canvas>';
    area.style.height = `${Math.max(160, lista.length * 30 + 30)}px`;
    await trocar('musc', () => criarGrafico(area.querySelector('canvas'), {
      tipo: 'bar', horizontal: true, inteiro: true,
      rotulos: lista.map(([g]) => g),
      series: [{ nome: 'Séries', dados: lista.map(([, n]) => n) }],
    }));
  }
  el.querySelector('[data-dias]').addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    dias = Number(b.dataset.d); pref.set('dias', dias); desenharMusculos();
  });

  // ---------- Peso ----------
  async function desenharPeso() {
    const alvo = el.querySelector('[data-peso]');
    const pesos = medidas.filter(m => m.peso !== null && m.peso !== undefined).slice().reverse();
    if (!pesos.length) {
      alvo.innerHTML = `<p class="sutil">Nenhum peso registrado.</p><a class="btn btn-secundario btn-bloco" href="#/corpo">${Icone.mais}<span>Registrar peso</span></a>`;
      return;
    }
    const atual = pesos[pesos.length - 1];
    const ha30 = new Date(); ha30.setDate(ha30.getDate() - 30);
    const ref = [...pesos].reverse().find(m => new Date(m.data) <= ha30) || pesos[0];
    const dif = atual.peso - ref.peso;
    alvo.innerHTML = `
      <div class="peso-topo">
        <strong class="numero-grande">${fmtNum(atual.peso)} kg</strong>
        ${ref !== atual ? `<span class="${dif > 0 ? 'sobe' : dif < 0 ? 'desce' : 'sutil'}">${dif > 0 ? '+' : ''}${fmtNum(Math.round(dif * 10) / 10)} kg</span><small class="sutil">desde ${new Date(ref.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</small>` : ''}
      </div>
      ${pesos.length > 1 ? '<div class="grafico grafico-baixo"><canvas></canvas></div>' : `<p class="sutil">Registre mais vezes para ver o gráfico.</p>`}`;
    const canvas = alvo.querySelector('canvas');
    if (canvas) {
      const ult = pesos.slice(-20);
      await trocar('peso', () => criarGrafico(canvas, {
        rotulos: ult.map(m => new Date(m.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
        series: [{ nome: 'Peso', dados: ult.map(m => m.peso) }], sufixo: ' kg',
      }));
    }
  }

  // ---------- Recordes recentes ----------
  const recentes = [];
  info.forEach(i => i.t.exercicios.forEach(e => e.series.forEach(s => {
    if (recordes.has(s.uid)) recentes.push({ i, e, s, tipos: recordes.get(s.uid) });
  })));
  el.querySelector('[data-recordes]').innerHTML = recentes.length ? `
    <div class="faixa-recordes">${recentes.slice(0, 8).map(({ i, e, s, tipos }) => `
      <a class="cartao recorde" href="#/treino/exercicio/${e.exercicio_id}">
        <span class="selo">${Icone.trofeu}${esc(tipos.map(x => NOMES_RECORDE[x]).join(' · '))}</span>
        <strong>${esc(mapa.get(e.exercicio_id)?.nome || '?')}</strong>
        <span class="recorde-valor">${fmtNum(s.peso)} kg × ${fmtNum(s.reps)}</span>
        <small class="sutil">${fmtRelativo(i.t.inicio)}</small>
      </a>`).join('')}</div>` : '<p class="sutil">Seus recordes vão aparecer aqui.</p>';

  // ---------- Últimos treinos ----------
  el.querySelector('[data-ultimos]').innerHTML = info.length ? info.slice(0, 3).map(i => `
    <a class="cartao item-hist" href="#/historico/${i.t.id}">
      <div class="item-hist-topo"><strong>${esc(i.t.nome)}</strong>${i.prs ? `<span class="selo">${Icone.trofeu}${i.prs}</span>` : ''}</div>
      <small class="sutil">${fmtDataHora(i.t.inicio)}</small>
      <div class="estatisticas mini">
        <div><small>Duração</small><strong>${fmtDuracao(i.duracao)}</strong></div>
        <div><small>Volume</small><strong>${fmtVolume(i.volume)}</strong></div>
        <div><small>Séries</small><strong>${i.series}</strong></div>
      </div>
    </a>`).join('') : vazio(Icone.treino, 'Nenhum treino ainda', '', '<a class="btn btn-primario" href="#/treino">Começar a treinar</a>');

  desenharCal();
  await Promise.all([desenharEstat(), desenharMusculos(), desenharPeso()]);
  return () => Object.values(graficos).forEach(g => g?.destroy());
}

Modulos.registrar({
  id: 'perfil',
  aba: { rota: '/perfil', nome: 'Perfil', icone: Icone.perfil, ordem: 90, inclui: ['/historico', '/progresso', '/corpo'] },
  rotas: { '/perfil': telaPerfil },
});
