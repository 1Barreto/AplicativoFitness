// Tela "Hoje": junta os cartões de resumo que cada módulo registra.
// O módulo de dieta, quando existir, só precisa registrar seus próprios
// cartões em "cartoesHoje" — esta tela não muda.

import { Modulos } from '../core/modulos.js';
import { Icone, definirTitulo } from '../core/ui.js';

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

async function telaHoje(el) {
  definirTitulo('Hoje');
  const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const data = d.charAt(0).toUpperCase() + d.slice(1);
  el.innerHTML = `
    <div class="saudacao"><h2>${saudacao()}!</h2><p class="sutil">${data}</p></div>
    <div class="grade-hoje" data-cartoes></div>`;
  const area = el.querySelector('[data-cartoes]');
  const cartoes = Modulos.cartoesHoje();
  await Promise.all(cartoes.map(async c => {
    const div = document.createElement('div');
    div.className = 'slot-cartao';
    area.appendChild(div);
    try { await c.render(div); } catch (e) { console.error(e); div.remove(); }
  }));

  // Espaço reservado para o resumo da dieta (some quando o módulo existir)
  if (!Modulos.existe('dieta')) {
    const div = document.createElement('div');
    div.className = 'slot-cartao';
    div.innerHTML = `<div class="cartao cartao-futuro">
      <div class="cartao-cab">${Icone.dieta}<h3>Dieta</h3></div>
      <p class="sutil">Em breve: calorias e macros do dia aparecerão aqui.</p></div>`;
    area.appendChild(div);
  }
}

Modulos.registrar({
  id: 'hoje',
  aba: { rota: '/hoje', nome: 'Hoje', icone: Icone.hoje, ordem: 10 },
  rotas: { '/hoje': telaHoje },
});
