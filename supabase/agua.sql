-- =====================================================================
-- Água — tabelas novas no Supabase
-- Cole no Supabase > SQL Editor > New query e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
--
-- Precisa da função app_criar_tabela (schema.sql) e da chave (user_id, id)
-- (chave-por-usuario.sql), que já foram rodadas.
--
-- Campos guardados em "data":
--   agua         dia (aaaa-mm-dd), ml — um registro por garrafa marcada
--   agua_config  garrafa (ml), meta (ml por dia)
-- =====================================================================

select public.app_criar_tabela('agua');         -- garrafas marcadas
select public.app_criar_tabela('agua_config');  -- tamanho da garrafa e meta

-- Conferir (deve mostrar as duas tabelas com rowsecurity = true):
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('agua', 'agua_config');
