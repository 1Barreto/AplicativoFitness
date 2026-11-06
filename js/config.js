// ===== Configuração do Supabase =====
// Cole aqui a "Project URL" e a chave "anon public" do seu projeto
// (Supabase > Project Settings > API). A chave anon é pública por natureza:
// a segurança vem do Row Level Security definido no SQL.
// Se deixar em branco, o app funciona só no aparelho (modo local).
export const SUPABASE_URL = 'https://vnxeixccsiuzxysqpkij.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZueGVpeGNjc2l1enh5c3Fwa2lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MzA3MjQsImV4cCI6MjEwOTUwNjcyNH0.gp7IqQWxzmPISFGt0UXNscTBkVKeXzE2pNmKpwrtDRQ';

// Bibliotecas externas (versões fixas, para o cache offline funcionar sempre igual).
export const CDN = {
  supabase: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js',
  zxing: 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js', // leitor de código de barras
};
