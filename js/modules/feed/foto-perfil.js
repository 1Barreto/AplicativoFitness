// Foto do perfil: o avatar redondo (foto ou inicial do nome) e o botão para
// escolher/trocar a foto, usado em Ajustes e na aba Perfil.

import { esc } from '../../core/util.js';
import { toast, confirmar } from '../../core/ui.js';
import { Auth } from '../../core/auth.js';
import { salvarFoto, removerFoto } from './dados.js';

const inicial = nome => esc((nome || '?').trim()[0]?.toUpperCase() || '?');

// Foto do perfil (se tiver) ou a inicial do nome. Se a foto não carregar, volta para a inicial.
// Sem "lazy": a foto é pequena e fica guardada no aparelho (service worker),
// e "decoding=sync" evita o quadro vazio quando a lista é redesenhada.
export const avatarPessoa = (nome, classe = '', foto = null) => foto
  ? `<span class="avatar-ex avatar-pessoa com-foto ${classe}" data-i="${inicial(nome)}"><img src="${esc(foto)}" alt="" decoding="sync" onerror="const a=this.parentNode;a.classList.remove('com-foto');a.textContent=a.dataset.i"></span>`
  : `<span class="avatar-ex avatar-pessoa ${classe}">${inicial(nome)}</span>`;

// Liga um <input type="file"> à troca da foto. aoMudar(foto|null) é chamado
// depois de enviar (ou remover), para a tela se redesenhar.
export function ligarEscolhaFoto(input, aoMudar) {
  input.onchange = async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    if (!Auth.usuario()) { toast('Entre na sua conta primeiro'); return; }
    const alvo = input.closest('label');
    alvo?.classList.add('enviando');
    try {
      const foto = await salvarFoto(f);
      toast('Foto atualizada', 'sucesso');
      aoMudar(foto);
    } catch (e) { toast(e.message, 'erro'); }
    finally { alvo?.classList.remove('enviando'); }
  };
}

export async function confirmarRemoverFoto(aoMudar) {
  if (!(await confirmar('Remover sua foto do perfil?', { ok: 'Remover', perigo: true }))) return;
  try { await removerFoto(); toast('Foto removida'); aoMudar(null); } catch (e) { toast(e.message, 'erro'); }
}
