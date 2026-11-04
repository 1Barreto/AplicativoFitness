-- =====================================================================
-- Estoque de casa — tabelas novas no Supabase
-- Cole no Supabase > SQL Editor > New query e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
--
-- Precisa da função app_criar_tabela, que já foi criada pelo schema.sql.
-- Ela cria a tabela no mesmo formato das outras (id, user_id, updated_at,
-- deleted, data em JSON, server_updated_at), com RLS ligado: cada usuário
-- só vê, cria, altera e apaga os próprios registros.
--
-- Campos guardados em "data":
--   estoque      nome, alimentos [{fonte, ref, nome}] (vínculo com a dieta),
--                unidade (g | ml | un), pesoUnidade (g por unidade), minimo,
--                ideal (nível bom), validade (aaaa-mm-dd), auto (descontar
--                pela dieta), desde (dia em que começou a descontar)
--   estoque_mov  item (id do estoque), tipo (consumo | compra | ajuste),
--                qtd (com sinal, na unidade do item), diario (id do item da
--                dieta que gerou o consumo), dia, nota, estornado, ignorado
--   A quantidade atual de um item é a soma das movimentações não estornadas.
-- =====================================================================

select public.app_criar_tabela('estoque');      -- itens que você acompanha
select public.app_criar_tabela('estoque_mov');  -- histórico: consumo, compra, ajuste

-- Conferir (deve mostrar as duas tabelas com rowsecurity = true):
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('estoque', 'estoque_mov');
