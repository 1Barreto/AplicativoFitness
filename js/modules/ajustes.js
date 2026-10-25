// Tela de ajustes: conta, sincronização, preferências e backup.

import { Modulos } from '../core/modulos.js';
import { Auth } from '../core/auth.js';
import { Sync } from '../core/sync.js';
import { DB } from '../core/db.js';
import { Bus, esc, fmtDataHora } from '../core/util.js';
import { Icone, definirTitulo, toast, confirmar, folha } from '../core/ui.js';
import { som } from '../core/som.js';
import { exportarBackup, importarBackup } from '../core/backup.js';
import { prefs } from './treino/dados.js';
import { importarHevy } from './treino/importar-hevy.js';
import { escolherDescanso } from './treino/componentes.js';
import { TEMAS, temaAtual, aplicarTema } from '../core/tema.js';

const VERSAO_APP = '1.4.0';

async function telaAjustes(el) {
  definirTitulo('Ajustes');
  const usuario = Auth.usuario();
  const info = Sync.info();
  const pendentes = await DB.contarPendentes();
  const descanso = prefs.descansoPadrao();

  el.innerHTML = `
    <h2 class="secao">Conta e sincronização</h2>
    <div class="cartao" data-conta></div>

    <h2 class="secao">Aparência</h2>
    <div class="cartao">
      <div class="temas" data-temas>
        ${TEMAS.map(t => `
          <button class="tema-opcao ${t.id === temaAtual() ? 'ativo' : ''}" data-tema-id="${t.id}">
            <span class="tema-cores"><i style="background:${t.p}"></i><i style="background:${t.s}"></i></span>${t.nome}
          </button>`).join('')}
      </div>
    </div>

    <h2 class="secao">Treino</h2>
    <div class="cartao lista-simples">
      <button class="linha-lista" data-pref="descanso">
        <span class="item-texto"><strong>Descanso padrão</strong><small>Usado quando o exercício não tem tempo próprio</small></span>
        <span class="sutil" data-valor>${descanso ? `${Math.floor(descanso / 60)}:${String(descanso % 60).padStart(2, '0')}` : 'Desligado'}</span>
      </button>
      <label class="linha-lista">
        <span class="item-texto"><strong>Aviso sonoro</strong><small>Toca ao terminar o descanso e ao bater recorde</small></span>
        <input type="checkbox" class="interruptor" data-pref="som" ${som.ativo() ? 'checked' : ''}>
      </label>
      <button class="linha-lista" data-acao="testar-som"><span class="item-texto"><strong>Testar som</strong><small>Se não ouvir, aumente o volume do aparelho</small></span>${Icone.play}</button>
      <label class="linha-lista">
        <span class="item-texto"><strong>Manter tela ligada no treino</strong><small>Evita que a tela bloqueie durante o treino (iOS 16.4+)</small></span>
        <input type="checkbox" class="interruptor" data-pref="tela" ${prefs.manterTelaLigada() ? 'checked' : ''}>
      </label>
    </div>

    <h2 class="secao">Backup</h2>
    <div class="cartao">
      <p class="sutil">Um arquivo JSON com todos os seus dados. Ao importar, os registros são mesclados (fica sempre a versão mais recente de cada um).</p>
      <div class="linha-botoes">
        <button class="btn btn-secundario" data-acao="exportar">${Icone.baixar}<span>Exportar backup</span></button>
        <label class="btn btn-secundario">${Icone.subir}<span>Importar backup</span><input type="file" hidden data-acao="importar"></label>
      </div>
    </div>

    <h2 class="secao">Importar do Hevy</h2>
    <div class="cartao">
      <p class="sutil">No Hevy: <strong>Perfil → Configurações (engrenagem) → Exportar e importar dados → Exportar treinos</strong>. Salve o arquivo .csv e escolha-o aqui. Pode importar o mesmo arquivo de novo sem duplicar treinos.</p>
      <div class="linha-botoes">
        <label class="btn btn-secundario">${Icone.subir}<span>Escolher CSV do Hevy</span><input type="file" hidden data-acao="hevy"></label>
      </div>
    </div>

    <h2 class="secao">Sobre</h2>
    <div class="cartao lista-simples">
      <div class="linha-lista"><span class="item-texto"><strong>Versão</strong></span><span class="sutil">${VERSAO_APP}</span></div>
      <div class="linha-lista"><span class="item-texto"><strong>Alimentos</strong><small><a href="https://www.tbca.net.br/" target="_blank" rel="noopener">Tabela Brasileira de Composição de Alimentos (TBCA)</a>, Universidade de São Paulo (USP) / FoRC (carboidrato disponível). Complementares: <a href="https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/" target="_blank" rel="noopener">TACO</a> 4ª ed., NEPA/UNICAMP, e <a href="https://biblioteca.ibge.gov.br/visualizacao/livros/liv50002.pdf" target="_blank" rel="noopener">IBGE</a>, POF 2008-2009 (alimentos preparados, com o sal do preparo); nessas duas, carboidrato total. Valores por 100 g. Produtos com marca: <a href="https://br.openfoodfacts.org/" target="_blank" rel="noopener">Open Food Facts</a> (ODbL), busca online.</small></span></div>
      <div class="linha-lista"><span class="item-texto"><strong>Imagens dos exercícios</strong><small>Desenhos: <a href="https://github.com/everkinetic/data" target="_blank" rel="noopener">Everkinetic</a> (CC BY-SA 4.0). Fotos: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">Free Exercise DB</a> (domínio público).</small></span></div>
      <button class="linha-lista" data-acao="atualizar"><span class="item-texto"><strong>Buscar atualização do app</strong><small>Recarrega a versão mais nova publicada</small></span>${Icone.sincronizar}</button>
      <button class="linha-lista perigo" data-acao="apagar"><span class="item-texto"><strong>Apagar dados deste aparelho</strong><small>Não apaga o que já está na nuvem</small></span>${Icone.lixo}</button>
    </div>`;

  desenharConta(el.querySelector('[data-conta]'), { usuario, info, pendentes });

  el.querySelector('[data-pref=descanso]').onclick = async e => {
    const seg = await escolherDescanso(prefs.descansoPadrao());
    if (seg === undefined) return;
    prefs.definirDescansoPadrao(seg);
    el.querySelector('[data-pref=descanso] [data-valor]').textContent = seg ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}` : 'Desligado';
    toast('Descanso padrão salvo');
  };
  el.querySelector('[data-temas]').onclick = e => {
    const b = e.target.closest('[data-tema-id]'); if (!b) return;
    aplicarTema(b.dataset.temaId);
    el.querySelectorAll('[data-tema-id]').forEach(x => x.classList.toggle('ativo', x === b));
  };
  el.querySelector('[data-pref=som]').onchange = e => som.definirAtivo(e.target.checked);
  el.querySelector('[data-pref=tela]').onchange = e => prefs.definirManterTelaLigada(e.target.checked);
  el.querySelector('[data-acao=testar-som]').onclick = () => { som.desbloquear(); const a = som.ativo(); som.definirAtivo(true); som.fimDescanso(); som.definirAtivo(a); };
  el.querySelector('[data-acao=exportar]').onclick = async () => { try { await exportarBackup(); } catch (e) { toast(e.message, 'erro'); } };
  el.querySelector('[data-acao=importar]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = '';
    // Se for o CSV do Hevy escolhido no botão errado, importa do mesmo jeito
    const inicio = (await f.slice(0, 500).text()).toLowerCase();
    if (inicio.includes('exercise_title')) { importarDoHevy(f); return; }
    try { const n = await importarBackup(f); toast(`${n} registro(s) importado(s)`, 'sucesso'); } catch (err) { toast(err.message, 'erro', 5000); }
  };
  el.querySelector('[data-acao=hevy]').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = '';
    importarDoHevy(f);
  };
  async function importarDoHevy(f) {
    toast('Importando…');
    try {
      const r = await importarHevy(f);
      await folha({
        titulo: 'Importação concluída', classe: 'modal-pequeno',
        conteudo: `<p class="texto-modal"><strong>${r.treinos}</strong> treino(s) importado(s)${r.treinos ? `, com ${r.series} série(s)` : ''}.${r.repetidos ? `<br>${r.repetidos} treino(s) já existiam e foram ignorados.` : ''}</p>
          ${r.exerciciosCriados.length ? `<p class="sutil">${r.exerciciosCriados.length} exercício(s) criado(s) como personalizados (variações de academia ou que não existem na biblioteca). Dá para renomear ou mudar o grupo em Treino → Exercícios:</p><ul class="sutil">${r.exerciciosCriados.map(([h, pt, g]) => `<li>${esc(pt)} <small>(${esc(g)})</small>${pt !== h ? `<br><small>Hevy: ${esc(h)}</small>` : ''}</li>`).join('')}</ul>` : ''}`,
        acoes: [{ texto: 'Ver histórico', classe: 'btn-primario', valor: true }],
      }).then(v => { if (v) location.hash = '#/historico'; });
    } catch (err) { toast(err.message, 'erro', 6000); }
  }
  el.querySelector('[data-acao=atualizar]').onclick = async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    toast('Atualizando…');
    setTimeout(() => location.reload(), 800);
  };
  el.querySelector('[data-acao=apagar]').onclick = async () => {
    const aviso = pendentes ? `<br><br><strong>Atenção:</strong> há ${pendentes} alteração(ões) ainda não enviada(s) à nuvem, que serão perdidas.` : '';
    if (!(await confirmar(`Apagar todos os dados guardados neste aparelho?${aviso}`, { ok: 'Apagar', perigo: true }))) return;
    await DB.apagarTudo();
    localStorage.removeItem('treinoAtivo');
    toast('Dados locais apagados');
    if (Auth.usuario()) Sync.sincronizar();
    location.hash = '#/hoje';
  };

  const sair = Bus.on('sync:estado', async (i) => {
    const c = el.querySelector('[data-conta]');
    if (c) desenharConta(c, { usuario: Auth.usuario(), info: i, pendentes: await DB.contarPendentes() });
  });
  return sair;
}

const NOMES_ESTADO = { local: 'Somente neste aparelho', offline: 'Offline', pendente: 'Alterações pendentes', sincronizando: 'Sincronizando…', sincronizado: 'Sincronizado', erro: 'Erro' };

function desenharConta(el, { usuario, info, pendentes }) {
  if (!Auth.configurado()) {
    el.innerHTML = `
      <p><strong>Supabase não configurado.</strong></p>
      <p class="sutil">O app está funcionando em modo local (dados só neste aparelho). Para sincronizar com outros aparelhos, preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> em <code>js/config.js</code>.</p>`;
    return;
  }
  if (!Auth.cliente()) {
    el.innerHTML = `<p class="sutil">Não foi possível carregar o Supabase. Verifique a conexão e reabra o app.</p>`;
    return;
  }
  if (usuario) {
    el.innerHTML = `
      <div class="linha-lista sem-borda">
        <span class="avatar-ex">${esc(usuario.email[0].toUpperCase())}</span>
        <span class="item-texto"><strong>${esc(usuario.email)}</strong><small>Conectado</small></span>
      </div>
      <div class="status-sync estado-${info.estado}">
        <i></i><div><strong>${NOMES_ESTADO[info.estado]}</strong>
        <small>${pendentes ? `${pendentes} alteração(ões) aguardando envio · ` : ''}${info.ultimaSync ? `Última sincronização: ${fmtDataHora(info.ultimaSync)}` : 'Ainda não sincronizado'}</small>
        ${info.erro ? `<small class="erro">${esc(info.erro)}</small>` : ''}</div>
      </div>
      <div class="linha-botoes">
        <button class="btn btn-primario" data-acao="sync">${Icone.sincronizar}<span>Sincronizar agora</span></button>
        <button class="btn btn-secundario" data-acao="sair">Sair</button>
      </div>`;
    el.querySelector('[data-acao=sync]').onclick = async () => {
      await Sync.sincronizar();
      const i = Sync.info();
      toast(i.estado === 'sincronizado' ? 'Tudo sincronizado' : i.estado === 'erro' ? `Erro: ${i.erro}` : NOMES_ESTADO[i.estado], i.estado === 'erro' ? 'erro' : 'sucesso');
    };
    el.querySelector('[data-acao=sair]').onclick = async () => {
      if (!(await confirmar('Sair da conta? Seus dados continuam neste aparelho e na nuvem.', { ok: 'Sair' }))) return;
      await Sync.sincronizar();
      await Auth.sair();
      toast('Você saiu da conta');
    };
    return;
  }

  // Formulário de login
  let modo = 'senha'; // senha | cadastro | codigo
  let codigoEnviado = false;
  const desenhar = () => {
    el.innerHTML = `
      <p class="sutil">Entre para sincronizar seus dados entre o iPhone e o computador.</p>
      <div class="abas-mini">
        <button class="chip ${modo === 'senha' ? 'ativo' : ''}" data-modo="senha">Entrar</button>
        <button class="chip ${modo === 'cadastro' ? 'ativo' : ''}" data-modo="cadastro">Criar conta</button>
        <button class="chip ${modo === 'codigo' ? 'ativo' : ''}" data-modo="codigo">Código por e-mail</button>
      </div>
      <form class="form" data-form>
        <label>E-mail<input class="campo" type="email" name="email" autocomplete="email" required value="${esc(el.dataset.email || '')}"></label>
        ${modo !== 'codigo' ? `<label>Senha<input class="campo" type="password" name="senha" autocomplete="${modo === 'cadastro' ? 'new-password' : 'current-password'}" minlength="6" required></label>` : ''}
        ${modo === 'codigo' && codigoEnviado ? `<label>Código recebido por e-mail<input class="campo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required autofocus></label>` : ''}
        <button class="btn btn-primario btn-bloco" type="submit">${modo === 'senha' ? 'Entrar' : modo === 'cadastro' ? 'Criar conta' : codigoEnviado ? 'Confirmar código' : 'Enviar código'}</button>
        ${modo === 'codigo' ? '<p class="sutil pequeno">No iPhone, use o código em vez do link: o link abre no Safari, que é separado do app instalado.</p>' : ''}
      </form>`;
    el.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { modo = b.dataset.modo; codigoEnviado = false; desenhar(); });
    el.querySelector('[data-form]').onsubmit = async ev => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const email = String(f.get('email')).trim();
      el.dataset.email = email;
      const botao = ev.target.querySelector('[type=submit]');
      botao.disabled = true;
      try {
        if (modo === 'senha') { await Auth.entrarComSenha(email, f.get('senha')); toast('Bem-vindo!', 'sucesso'); }
        else if (modo === 'cadastro') {
          const r = await Auth.criarConta(email, f.get('senha'));
          if (r.session) toast('Conta criada!', 'sucesso');
          else { toast('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre aqui.', 'sucesso', 7000); modo = 'senha'; desenhar(); }
        } else if (!codigoEnviado) { await Auth.enviarCodigo(email); codigoEnviado = true; toast('Código enviado para o seu e-mail', 'sucesso'); desenhar(); }
        else { await Auth.confirmarCodigo(email, String(f.get('codigo'))); toast('Bem-vindo!', 'sucesso'); }
      } catch (e) { toast(e.message, 'erro', 5000); }
      botao.disabled = false;
    };
  };
  desenhar();
}

Modulos.registrar({
  id: 'ajustes',
  rotas: { '/ajustes': { view: telaAjustes, recarregar: false } },
});
