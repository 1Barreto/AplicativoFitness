// Componentes do módulo de dieta: busca de alimentos, quantidade,
// formulário de alimento personalizado e metas.

import { folha, toast, Icone } from '../../core/ui.js';
import { esc, num, fmtNum, debounce } from '../../core/util.js';
import {
  carregarTBCA, buscarAlimentos, listarMeusAlimentos, listarRefeicoesSalvas, recentes, salvarAlimento,
  calcular, somar, fmtKcal, fmtG, NUTRIENTES,
} from './dados.js';

// Distribuição das calorias entre os macros (barra colorida)
export function barraMacros(v) {
  const kp = v.p * 4, kc = v.c * 4, kg = v.g * 9, t = kp + kc + kg;
  if (!t) return '<div class="barra-macros vazia"></div>';
  const pct = x => `${(x / t * 100).toFixed(1)}%`;
  return `<div class="barra-macros"><i class="m-p" style="width:${pct(kp)}"></i><i class="m-c" style="width:${pct(kc)}"></i><i class="m-g" style="width:${pct(kg)}"></i></div>`;
}

export function linhaMacros(v) {
  return `<span class="macros-linha"><b class="m-p">P ${fmtG(v.p)}</b><b class="m-c">C ${fmtG(v.c)}</b><b class="m-g">G ${fmtG(v.g)}</b></span>`;
}

function descricaoAlimento(a) {
  const p = a.porcoes?.[0];
  if (p) {
    const v = calcular(a.n, p.gramas);
    return `${esc(p.nome)} (${fmtNum(p.gramas)} g) · ${fmtKcal(v.kcal)} kcal`;
  }
  return `100 g · ${fmtKcal(a.n.kcal)} kcal`;
}

function itemAlimento(a, i) {
  const origem = a.fonte === 'tbca' ? '<span class="selo-fonte">TBCA</span>' : '<span class="selo-fonte meu">Meu</span>';
  return `
    <button class="item-alimento" data-i="${i}">
      <span class="item-texto"><strong>${esc(a.nome)}${a.marca ? ` <small class="marca-alim">${esc(a.marca)}</small>` : ''}</strong>
      <small>${origem}${descricaoAlimento(a)}</small></span>
      <span class="item-add">${Icone.mais}</span>
    </button>`;
}

// Folha de busca. aoEscolher(alimento) deve retornar true se algo foi adicionado.
// aoEscolherRefeicao(refeicaoSalva) idem. Fica aberta para adicionar vários.
export function escolherAlimentos({ titulo = 'Adicionar alimento', aoEscolher, aoEscolherRefeicao = null }) {
  return folha({
    titulo, classe: 'modal-alto',
    conteudo: (corpo, fechar) => {
      let aba = 'recentes';
      let lista = [];
      let adicionados = 0;
      corpo.innerHTML = `
        <div class="busca-barra">
          <label class="campo-busca">${Icone.busca}<input type="search" placeholder="Buscar na TBCA e nos seus alimentos" data-busca autocomplete="off"></label>
          <div class="abas-mini" data-abas>
            <button class="chip ativo" data-aba="recentes">Recentes</button>
            <button class="chip" data-aba="meus">Meus alimentos</button>
            ${aoEscolherRefeicao ? '<button class="chip" data-aba="refeicoes">Refeições salvas</button>' : ''}
          </div>
        </div>
        <div class="lista-exercicios" data-lista></div>
        <div class="rodape-fixo"><button class="btn btn-primario btn-bloco" data-pronto>Concluir</button></div>`;
      const el = corpo.querySelector('[data-lista]');
      const campo = corpo.querySelector('[data-busca]');
      const abas = corpo.querySelector('[data-abas]');
      const pronto = corpo.querySelector('[data-pronto]');

      const criar = `<button class="item-alimento item-criar" data-criar><span class="item-add">${Icone.mais}</span><span class="item-texto"><strong>Criar alimento</strong><small>Suplementos, marcas, receitas: copie os valores do rótulo</small></span></button>`;
      const mostrar = (itens, vazioMsg, comCriar = false) => {
        lista = itens;
        el.innerHTML = (itens.length ? itens.map(itemAlimento).join('') : `<p class="sutil centro lista-vazia">${vazioMsg}</p>`) + (comCriar ? criar : '');
      };

      const desenhar = async () => {
        const texto = campo.value.trim();
        abas.hidden = !!texto;
        if (texto) {
          el.innerHTML = '<p class="sutil centro lista-vazia">Buscando…</p>';
          try {
            const [meus, tbca] = await Promise.all([listarMeusAlimentos(), carregarTBCA()]);
            if (campo.value.trim() !== texto) return;
            mostrar([...buscarAlimentos(meus, texto, 20), ...buscarAlimentos(tbca, texto, 80)], 'Nada encontrado. Tente outra palavra (ex.: "frango peito") ou crie o alimento.', true);
          } catch (e) { el.innerHTML = `<p class="erro centro">${esc(e.message)}</p>`; }
          return;
        }
        if (aba === 'recentes') mostrar(await recentes(), 'Os alimentos que você registrar aparecem aqui. Use a busca para encontrar na TBCA.');
        else if (aba === 'meus') mostrar(await listarMeusAlimentos(), 'Nenhum alimento personalizado ainda.', true);
        else {
          const refs = await listarRefeicoesSalvas();
          lista = refs;
          el.innerHTML = refs.length ? refs.map((r, i) => {
            const t = somar(r.itens);
            return `<button class="item-alimento" data-r="${i}">
              <span class="item-texto"><strong>${esc(r.nome)}</strong><small>${r.itens.length} ${r.itens.length === 1 ? 'item' : 'itens'} · ${fmtKcal(t.kcal)} kcal</small></span>
              <span class="item-add">${Icone.mais}</span></button>`;
          }).join('') : '<p class="sutil centro lista-vazia">Nenhuma refeição salva. No diário, use o menu de uma refeição para salvá-la e repetir depois com um toque.</p>';
        }
      };

      const marcar = (botao) => {
        adicionados++;
        botao.classList.add('adicionado');
        pronto.textContent = `Concluir (${adicionados})`;
      };

      campo.addEventListener('input', debounce(desenhar, 150));
      abas.addEventListener('click', e => {
        const b = e.target.closest('[data-aba]'); if (!b) return;
        aba = b.dataset.aba;
        abas.querySelectorAll('.chip').forEach(c => c.classList.toggle('ativo', c === b));
        desenhar();
      });
      el.addEventListener('click', async e => {
        if (e.target.closest('[data-criar]')) { criarNovo(); return; }
        const b = e.target.closest('[data-i],[data-r]'); if (!b) return;
        if (b.dataset.r !== undefined) { if (await aoEscolherRefeicao(lista[+b.dataset.r])) marcar(b); return; }
        if (await aoEscolher(lista[+b.dataset.i])) marcar(b);
      });
      const criarNovo = async () => {
        const novo = await formularioAlimento();
        if (!novo) return;
        aba = 'meus'; campo.value = '';
        abas.querySelectorAll('.chip').forEach(c => c.classList.toggle('ativo', c.dataset.aba === 'meus'));
        await desenhar();
        if (await aoEscolher({ ...novo, fonte: 'meu', ref: novo.id })) {
          const b = el.querySelector(`[data-i="${lista.findIndex(a => a.ref === novo.id)}"]`);
          if (b) marcar(b);
        }
      };
      pronto.onclick = () => fechar(adicionados);
      desenhar();
      if (matchMedia('(min-width: 700px)').matches) setTimeout(() => campo.focus(), 60);
    },
  });
}

// Folha de quantidade. Retorna { alimento, gramas, porcao, refeicao } | { remover: true } | undefined
// (alimento pode mudar se o usuário personalizar um alimento da TBCA)
export function escolherQuantidade(alimento, { gramas = null, porcao = null, refeicoes = null, refeicao = null, botao = 'Adicionar', remover = false } = {}) {
  const porcoes = alimento.porcoes || [];
  let unidade = porcao ? porcoes.findIndex(p => p.nome === porcao.nome) : (gramas == null && porcoes.length ? 0 : -1);
  let qtd = porcao && unidade >= 0 ? porcao.qtd : unidade >= 0 && gramas == null ? 1 : (gramas ?? 100);

  return folha({
    titulo: botao === 'Adicionar' ? 'Quantidade' : 'Editar item', classe: 'modal-quantidade',
    conteudo: (corpo, fechar) => {
      corpo.innerHTML = `
        <div class="qtd-cab">
          <h3>${esc(alimento.nome)}</h3>
          <p class="sutil pequeno">${alimento.fonte === 'tbca' ? `TBCA-USP · ${esc(alimento.grupo || '')} · ${esc(alimento.ref)}` : esc(alimento.marca || 'Alimento personalizado')}</p>
        </div>
        <div class="qtd-campos">
          <input class="campo qtd-numero" inputmode="decimal" data-qtd value="${fmtNum(qtd)}" aria-label="Quantidade">
          <select class="campo" data-unidade aria-label="Unidade">
            <option value="-1">gramas (g)</option>
            ${porcoes.map((p, i) => `<option value="${i}">${esc(p.nome)} (${fmtNum(p.gramas)} g)</option>`).join('')}
          </select>
        </div>
        <div class="abas-mini" data-rapidos></div>
        <div class="qtd-resultado" data-resultado></div>
        ${refeicoes ? `<label class="rotulo">Refeição<select class="campo" data-refeicao>${refeicoes.map(r => `<option value="${esc(r.id)}" ${r.id === refeicao ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></label>` : ''}
        ${alimento.fonte === 'tbca' ? `<details class="qtd-detalhe"><summary>Descrição completa (TBCA)</summary><p class="sutil pequeno">${esc(alimento.descricao || alimento.nome)}</p></details>
          <button class="link-btn" data-personalizar>${Icone.editar}<span>Personalizar (nome, porção como "1 unidade")</span></button>` : ''}
        <div class="linha-botoes">
          ${remover ? '<button class="btn btn-secundario perigo" data-remover>Remover</button>' : ''}
          <button class="btn btn-primario" data-ok>${esc(botao)}</button>
        </div>`;
      const campo = corpo.querySelector('[data-qtd]');
      const sel = corpo.querySelector('[data-unidade]');
      const rapidos = corpo.querySelector('[data-rapidos]');
      const res = corpo.querySelector('[data-resultado]');
      sel.value = String(unidade);

      const gramasAtuais = () => {
        const q = num(campo.value) || 0;
        return unidade >= 0 ? q * porcoes[unidade].gramas : q;
      };
      const desenharRapidos = () => {
        const op = unidade >= 0 ? [0.5, 1, 1.5, 2, 3] : [25, 50, 100, 150, 200, 300];
        rapidos.innerHTML = op.map(v => `<button class="chip" data-v="${v}">${fmtNum(v)}${unidade >= 0 ? '' : ' g'}</button>`).join('');
      };
      const atualizar = () => {
        const v = calcular(alimento.n, gramasAtuais());
        res.innerHTML = `
          <div class="qtd-kcal"><strong>${fmtKcal(v.kcal)}</strong><small>kcal</small></div>
          <div class="qtd-macros">
            <div><small>Proteína</small><strong class="m-p">${fmtG(v.p)} g</strong></div>
            <div><small>Carbo</small><strong class="m-c">${fmtG(v.c)} g</strong></div>
            <div><small>Gordura</small><strong class="m-g">${fmtG(v.g)} g</strong></div>
          </div>
          ${barraMacros(v)}
          <p class="sutil pequeno qtd-extra">${unidade >= 0 ? `${fmtNum(Math.round(gramasAtuais()))} g · ` : ''}Fibra ${fmtG(v.fibra)} g · Sódio ${fmtKcal(v.sodio)} mg</p>`;
      };
      campo.addEventListener('input', atualizar);
      campo.addEventListener('focus', () => campo.select());
      sel.addEventListener('change', () => {
        const g = gramasAtuais();
        unidade = +sel.value;
        campo.value = fmtNum(unidade >= 0 ? Math.round(g / porcoes[unidade].gramas * 10) / 10 || 1 : Math.round(g));
        desenharRapidos(); atualizar();
      });
      rapidos.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { campo.value = fmtNum(+b.dataset.v); atualizar(); } });
      corpo.querySelector('[data-ok]').onclick = () => {
        const g = gramasAtuais();
        if (!(g > 0)) { toast('Informe a quantidade', 'erro'); return; }
        fechar({
          alimento,
          gramas: Math.round(g * 10) / 10,
          porcao: unidade >= 0 ? { nome: porcoes[unidade].nome, gramas: porcoes[unidade].gramas, qtd: num(campo.value) } : null,
          refeicao: corpo.querySelector('[data-refeicao]')?.value ?? refeicao,
        });
      };
      corpo.querySelector('[data-personalizar]')?.addEventListener('click', async () => {
        const novo = await formularioAlimento(null, { base: alimento });
        if (!novo) return;
        toast('Salvo em Meus alimentos', 'sucesso');
        const opcoes = { refeicoes, refeicao, botao, remover };
        fechar(escolherQuantidade({ ...novo, fonte: 'meu', ref: novo.id }, opcoes));
      });
      corpo.querySelector('[data-remover]')?.addEventListener('click', () => fechar({ remover: true }));
      campo.addEventListener('keydown', e => { if (e.key === 'Enter') corpo.querySelector('[data-ok]').click(); });
      desenharRapidos(); atualizar();
      setTimeout(() => { campo.focus(); campo.select(); }, 80);
    },
  });
}

// Alimento personalizado. "base" pré-preenche (ex.: copiar da TBCA).
export function formularioAlimento(a = null, { base = null } = {}) {
  const ini = a || base || {};
  const porcao = ini.porcoes?.[0] || null;
  const n = ini.n || {};
  return folha({
    titulo: a ? 'Editar alimento' : 'Novo alimento',
    conteudo: (corpo) => {
      corpo.innerHTML = `
        <div class="form">
          <label>Nome<input class="campo" name="nome" value="${esc(ini.nome || '')}" placeholder="Ex.: Whey protein baunilha" ${a ? '' : 'autofocus'}></label>
          <label><span>Marca <small>(opcional)</small></span><input class="campo" name="marca" value="${esc(ini.marca || '')}"></label>
          <div class="linha-2">
            <label><span>Porção <small>(opcional)</small></span><input class="campo" name="porcao_nome" value="${esc(porcao?.nome || '')}" placeholder="1 scoop, 1 fatia…"></label>
            <label>Peso da porção (g)<input class="campo" name="porcao_g" inputmode="decimal" value="${fmtNum(porcao?.gramas)}" placeholder="30"></label>
          </div>
          <div class="rotulo">Valores informados por
            <div class="abas-mini" data-base>
              <button type="button" class="chip ativo" data-b="100">100 g</button>
              <button type="button" class="chip" data-b="porcao">Porção</button>
            </div>
          </div>
          <div class="grade-campos">
            ${NUTRIENTES.map(([k, r, u]) => `<label><span>${r} <small>(${u})</small></span><input class="campo" name="${k}" inputmode="decimal" value="${n[k] == null ? '' : fmtNum(Math.round(n[k] * 100) / 100)}"></label>`).join('')}
          </div>
          <p class="sutil pequeno" data-dica></p>
        </div>`;
      const dica = corpo.querySelector('[data-dica]');
      const baseEl = corpo.querySelector('[data-base]');
      corpo.dataset.base = '100';
      const atualizarDica = () => {
        const g = num(corpo.querySelector('[name=porcao_g]').value);
        dica.textContent = corpo.dataset.base === 'porcao'
          ? (g ? `Copie os valores da coluna "porção" do rótulo. Eles serão convertidos para 100 g.` : 'Informe o peso da porção em gramas.')
          : 'Valores por 100 g (coluna "100 g" do rótulo).';
      };
      baseEl.addEventListener('click', e => {
        const b = e.target.closest('[data-b]'); if (!b) return;
        corpo.dataset.base = b.dataset.b;
        baseEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('ativo', c === b));
        atualizarDica();
      });
      corpo.querySelector('[name=porcao_g]').addEventListener('input', atualizarDica);
      atualizarDica();
    },
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: null },
      {
        texto: 'Salvar', classe: 'btn-primario', acao: async (c) => {
          const v = k => c.querySelector(`[name=${k}]`).value;
          const nome = v('nome').trim();
          if (!nome) { toast('Informe o nome do alimento', 'erro'); return false; }
          const pg = num(v('porcao_g'));
          const porBase = c.dataset.base === 'porcao';
          if (porBase && !pg) { toast('Informe o peso da porção', 'erro'); return false; }
          const fator = porBase ? 100 / pg : 1;
          const valores = {};
          NUTRIENTES.forEach(([k]) => { const x = num(v(k)); valores[k] = x == null ? null : Math.round(x * fator * 100) / 100; });
          if (valores.kcal == null) {
            if (valores.p == null && valores.c == null && valores.g == null) { toast('Informe as calorias ou os macros', 'erro'); return false; }
            valores.kcal = Math.round((valores.p || 0) * 4 + (valores.c || 0) * 4 + (valores.g || 0) * 9);
          }
          const nomePorcao = v('porcao_nome').trim() || (pg ? 'porção' : '');
          return salvarAlimento({
            ...(a || {}), nome, marca: v('marca').trim(), n: valores,
            porcoes: pg ? [{ nome: nomePorcao, gramas: pg }] : [],
            ...(base && !a ? { origem: `${base.fonte}:${base.ref}` } : {}),
          });
        },
      },
    ],
  });
}

// Metas diárias por tipo de dia ({ treino, off }). Retorna as metas ou undefined.
export function formularioMetas(metas = {}, peso = null, tipoInicial = 'treino') {
  const estado = { treino: { ...(metas.treino || {}) }, off: { ...(metas.off || {}) } };
  let tipo = tipoInicial;
  const CAMPOS = ['kcal', 'p', 'c', 'g'];
  return folha({
    titulo: 'Metas diárias',
    conteudo: (corpo) => {
      corpo.innerHTML = `
        <div class="form">
          <div class="segmento" data-tipos>
            <button type="button" data-t="treino">${Icone.treino}<span>Dia de treino</span></button>
            <button type="button" data-t="off">${Icone.hoje}<span>Dia off</span></button>
          </div>
          <label>Calorias (kcal)<input class="campo" name="kcal" inputmode="numeric" placeholder="Ex.: 2800"></label>
          <div class="grade-campos metas-campos">
            ${[['p', 'Proteína'], ['c', 'Carboidratos'], ['g', 'Gorduras']].map(([k, r]) => `<label>${r} (g)<input class="campo" name="${k}" inputmode="decimal"></label>`).join('')}
          </div>
          <button type="button" class="link-btn" data-copiar></button>
          <div class="metas-info" data-info></div>
          <p class="sutil pequeno">No diário, marque cada dia como treino ou off. Sem marcação, o dia conta como treino quando há um treino registrado nele.</p>
        </div>`;
      const info = corpo.querySelector('[data-info]');
      const campo = k => corpo.querySelector(`[name=${k}]`);
      const v = k => num(campo(k).value) || 0;
      const guardar = () => { CAMPOS.forEach(k => { const x = num(campo(k).value); estado[tipo][k] = x && x > 0 ? x : null; }); };
      const preencher = () => {
        CAMPOS.forEach(k => { campo(k).value = fmtNum(estado[tipo][k]); });
        corpo.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('ativo', b.dataset.t === tipo));
        const outro = tipo === 'treino' ? 'off' : 'treino';
        corpo.querySelector('[data-copiar]').innerHTML = `${Icone.copiar}<span>Copiar do ${tipo === 'treino' ? 'dia off' : 'dia de treino'}</span>`;
        corpo.querySelector('[data-copiar]').hidden = !CAMPOS.some(k => estado[outro][k]);
        atualizar();
      };
      const atualizar = () => {
        const kcalMacros = v('p') * 4 + v('c') * 4 + v('g') * 9;
        const linhas = [];
        if (kcalMacros) {
          linhas.push(`Os macros somam <b>${fmtKcal(kcalMacros)} kcal</b>${v('kcal') ? ` (${v('kcal') > kcalMacros ? 'faltam' : 'sobram'} ${fmtKcal(Math.abs(v('kcal') - kcalMacros))})` : ''}. <button type="button" class="link-btn" data-usar>Usar como meta de calorias</button>`);
          linhas.push(`P ${Math.round(v('p') * 4 / kcalMacros * 100)}% · C ${Math.round(v('c') * 4 / kcalMacros * 100)}% · G ${Math.round(v('g') * 9 / kcalMacros * 100)}%`);
        }
        if (peso && (v('p') || v('g') || v('c'))) linhas.push(`Com ${fmtNum(peso)} kg: proteína ${fmtNum(Math.round(v('p') / peso * 10) / 10)} g/kg · carbo ${fmtNum(Math.round(v('c') / peso * 10) / 10)} g/kg · gordura ${fmtNum(Math.round(v('g') / peso * 10) / 10)} g/kg`);
        info.innerHTML = linhas.map(l => `<p class="sutil pequeno">${l}</p>`).join('');
        info.querySelector('[data-usar]')?.addEventListener('click', () => { campo('kcal').value = Math.round(kcalMacros); atualizar(); });
      };
      corpo.querySelector('[data-tipos]').addEventListener('click', e => {
        const b = e.target.closest('[data-t]'); if (!b || b.dataset.t === tipo) return;
        guardar(); tipo = b.dataset.t; preencher(); campo('kcal').focus();
      });
      corpo.querySelector('[data-copiar]').onclick = () => { estado[tipo] = { ...estado[tipo === 'treino' ? 'off' : 'treino'] }; preencher(); };
      corpo.addEventListener('input', atualizar);
      corpo._guardar = guardar;
      preencher();
      setTimeout(() => campo('kcal').focus(), 60);
    },
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secundario', valor: undefined },
      { texto: 'Salvar', classe: 'btn-primario', acao: (c) => { c._guardar(); return estado; } },
    ],
  });
}
