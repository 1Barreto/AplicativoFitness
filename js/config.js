// ===== Configuração do Supabase =====
// Cole aqui a "Project URL" e a chave "anon public" do seu projeto
// (Supabase > Project Settings > API). A chave anon é pública por natureza:
// a segurança vem do Row Level Security definido no SQL.
// Se deixar em branco, o app funciona só no aparelho (modo local).
export const SUPABASE_URL = 'https://rexhaiyyvpsyzvxhzlqr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJleGhhaXl5dnBzeXp2eGh6bHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4ODAwMTIsImV4cCI6MjEwODQ1NjAxMn0.KkV7UIPoM5ubGxf4U7eJMrUXvjSRJTtlh7pjxZwyPqw';

// Bibliotecas externas (versões fixas, para o cache offline funcionar sempre igual).
export const CDN = {
  supabase: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js',
};
