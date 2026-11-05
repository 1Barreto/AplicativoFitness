-- =====================================================================
-- Otimização — consultas mais rápidas e menos pedidos ao Supabase
-- Cole no Supabase > SQL Editor > New query e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
--
-- É seguro: este arquivo NÃO apaga nem altera nenhum dado seu. Ele só cria
-- duas funções de leitura e troca um índice (um "sumário" que deixa a busca
-- mais rápida) por dois mais certeiros. As funções respeitam as mesmas regras
-- de segurança (RLS) de sempre: cada pessoa só enxerga o que já podia ver.
--
-- Se não rodar, o app continua funcionando do jeito antigo (só mais devagar).
-- Precisa do schema.sql e do feed.sql já rodados antes.
-- =====================================================================

-- ---------- 1. Conferência de sincronização num pedido só ----------
-- O app confere a cada minuto se algo mudou na nuvem. Antes eram 13 consultas
-- (uma por tabela); com esta função, é uma só. Recebe o "até onde já baixei"
-- de cada tabela e responde quais têm novidade. Usa o índice (user_id,
-- server_updated_at) que toda tabela já tem, então é instantânea.
create or replace function public.app_alteracoes(cursores jsonb)
returns table (tabela text, mudou boolean)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  t text;
  uid uuid := (select auth.uid());
begin
  if uid is null then return; end if;
  for t in
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'server_updated_at' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped)
      and has_table_privilege(c.oid, 'select')
  loop
    tabela := t;
    execute format('select exists (select 1 from public.%I where user_id = $1 and server_updated_at > $2)', t)
      into mudou
      using uid, coalesce((cursores ->> t)::timestamptz, '-infinity'::timestamptz);
    return next;
  end loop;
end;
$$;

revoke execute on function public.app_alteracoes(jsonb) from public, anon;
grant execute on function public.app_alteracoes(jsonb) to authenticated;

-- ---------- 2. Feed num pedido só ----------
-- Antes, abrir o feed fazia 4 consultas (publicações, nomes, curtidas e
-- comentários) e baixava cada curtida e comentário só para contar.
-- Esta função devolve as publicações já com o nome do autor e as contagens.
--   p_tipo  'treino' ou 'refeicao'
--   p_inicio, p_qtd  paginação (15 por vez no app, no máximo 50)
--   p_id    uma publicação só (tela de detalhe)
create or replace function public.feed_listar(
  p_tipo text default 'treino', p_inicio int default 0, p_qtd int default 15, p_id uuid default null)
returns table (id uuid, user_id uuid, data jsonb, autor_nome text, curtidas int, curti boolean, comentarios int)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
begin
  return query
  with posts as (
    select f.id, f.user_id, f.data from public.feed f
    where p_id is not null and f.id = p_id and not f.deleted
    union all
    (select f.id, f.user_id, f.data from public.feed f
     where p_id is null and p_tipo = 'refeicao' and not f.deleted and f.data->>'tipo' = 'refeicao'
     order by f.data->>'fim' desc
     offset greatest(p_inicio, 0) limit least(greatest(p_qtd, 1), 50))
    union all
    (select f.id, f.user_id, f.data from public.feed f
     where p_id is null and p_tipo is distinct from 'refeicao' and not f.deleted and f.data->>'tipo' is null
     order by f.data->>'fim' desc
     offset greatest(p_inicio, 0) limit least(greatest(p_qtd, 1), 50))
  )
  select p.id, p.user_id, p.data,
    (select pf.data->>'nome' from public.perfis pf where pf.id = p.user_id),
    (select count(*)::int from public.curtidas c where c.post_id = p.id),
    exists (select 1 from public.curtidas c where c.post_id = p.id and c.user_id = uid),
    (select count(*)::int from public.comentarios m where m.post_id = p.id)
  from posts p
  order by p.data->>'fim' desc;
end;
$$;

revoke execute on function public.feed_listar(text, int, int, uuid) from public, anon;
grant execute on function public.feed_listar(text, int, int, uuid) to authenticated;

-- ---------- 3. Índices do feed ----------
-- Um índice para cada aba do feed (Treinos e Refeições), já na ordem do mais
-- recente. Substituem o índice geral, que não separava os dois tipos.
create index if not exists feed_treinos_idx on public.feed ((data->>'fim') desc) where not deleted and (data->>'tipo') is null;
create index if not exists feed_refeicoes_idx on public.feed ((data->>'fim') desc) where not deleted and (data->>'tipo') = 'refeicao';
drop index if exists public.feed_fim_idx;

-- Curtidas: a chave (post_id, user_id) já serve de índice.
-- Comentários: o índice comentarios_post_idx (post_id, criado_em) já existe.
-- As regras de segurança (RLS) já usam a forma rápida "(select auth.uid())".

-- Conferir (deve mostrar as duas funções):
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('app_alteracoes', 'feed_listar');
