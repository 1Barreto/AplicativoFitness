// ===== Configuração do Supabase =====
// Cole aqui a "Project URL" e a chave "anon public" do seu projeto
// (Supabase > Project Settings > API). A chave anon é pública por natureza:
// a segurança vem do Row Level Security definido no SQL.
// Se deixar em branco, o app funciona só no aparelho (modo local).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Bibliotecas externas (versões fixas, para o cache offline funcionar sempre igual).
export const CDN = {
  supabase: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js',
};
