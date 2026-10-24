// Login com Supabase (e-mail + senha, ou código de 6 dígitos por e-mail).
// O cliente do Supabase é carregado sob demanda pelo CDN: se estiver offline
// e ele ainda não estiver em cache, o app continua funcionando em modo local.

import { SUPABASE_URL, SUPABASE_ANON_KEY, CDN } from '../config.js';
import { Bus, carregarScript } from './util.js';

let cliente = null;
let sessao = null;

export const Auth = {
  configurado: () => !!(SUPABASE_URL && SUPABASE_ANON_KEY),
  cliente: () => cliente,
  sessao: () => sessao,
  usuario: () => sessao?.user || null,

  async iniciar() {
    if (!Auth.configurado()) return;
    try {
      await carregarScript(CDN.supabase);
      cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      const { data } = await cliente.auth.getSession();
      sessao = data.session;
      cliente.auth.onAuthStateChange((_evento, s) => {
        const mudouUsuario = (s?.user?.id || null) !== (sessao?.user?.id || null);
        sessao = s;
        if (mudouUsuario) Bus.emit('auth:mudou', s);
      });
    } catch (e) {
      console.warn('Supabase indisponível (offline?)', e);
    }
    Bus.emit('auth:mudou', sessao);
  },

  async entrarComSenha(email, senha) {
    const { data, error } = await exigirCliente().auth.signInWithPassword({ email, password: senha });
    if (error) throw traduzir(error);
    return data;
  },

  async criarConta(email, senha) {
    const { data, error } = await exigirCliente().auth.signUp({
      email, password: senha, options: { emailRedirectTo: urlDoApp() },
    });
    if (error) throw traduzir(error);
    return data; // data.session vem nulo se a confirmação por e-mail estiver ativa
  },

  // Envia e-mail com código (e link). No iPhone, prefira digitar o código:
  // o link abriria no Safari, que guarda a sessão separada do app instalado.
  async enviarCodigo(email) {
    const { error } = await exigirCliente().auth.signInWithOtp({
      email, options: { emailRedirectTo: urlDoApp(), shouldCreateUser: true },
    });
    if (error) throw traduzir(error);
  },

  async confirmarCodigo(email, codigo) {
    const { data, error } = await exigirCliente().auth.verifyOtp({ email, token: codigo.trim(), type: 'email' });
    if (error) throw traduzir(error);
    return data;
  },

  async sair() {
    if (cliente) await cliente.auth.signOut();
    sessao = null;
    Bus.emit('auth:mudou', null);
  },
};

function exigirCliente() {
  if (!cliente) throw new Error(Auth.configurado()
    ? 'Não foi possível conectar ao Supabase. Verifique a internet.'
    : 'Supabase não configurado (veja js/config.js).');
  return cliente;
}

function urlDoApp() { return location.origin + location.pathname; }

function traduzir(error) {
  const m = error.message || '';
  const mapa = [
    [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/Email not confirmed/i, 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'],
    [/User already registered/i, 'Este e-mail já tem conta. Use "Entrar".'],
    [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/Token has expired or is invalid/i, 'Código inválido ou expirado.'],
    [/rate limit/i, 'Muitas tentativas. Aguarde alguns minutos.'],
    [/Unable to validate email/i, 'E-mail inválido.'],
  ];
  const t = mapa.find(([re]) => re.test(m));
  return new Error(t ? t[1] : m);
}
