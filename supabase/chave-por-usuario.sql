-- =====================================================================
-- Chave por usuário — cada pessoa tem o seu próprio "espaço" de ids
-- Cole no Supabase > SQL Editor > New query e clique em "Run".
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
--
-- Por quê: alguns ids são iguais para todo mundo (exercícios importados do
-- Hevy, ajustes nos exercícios padrão). Com a chave sendo só "id", o segundo
-- usuário tentava gravar por cima do registro do primeiro e o servidor
-- recusava ("new row violates row-level security policy ... exercicios").
-- Agora a chave é (user_id, id): o mesmo id pode existir uma vez por pessoa.
-- =====================================================================

do $$
declare
  t text;
  pk text;
  def text;
begin
  foreach t in array array['exercicios','rotinas','treinos','medidas','diario','alimentos',
                           'refeicoes','dieta_config','dieta_dias','estoque','estoque_mov','perfis'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    pk := null; def := null;
    select conname, pg_get_constraintdef(oid) into pk, def from pg_constraint
      where conrelid = ('public.' || t)::regclass and contype = 'p';
    if def = 'PRIMARY KEY (user_id, id)' then continue; end if; -- já migrada
    if pk is not null then execute format('alter table public.%I drop constraint %I', t, pk); end if;
    execute format('alter table public.%I add primary key (user_id, id)', t);
  end loop;
end $$;

-- O feed continua com o id único (curtidas e comentários apontam para ele),
-- mas ganha também a combinação (user_id, id), usada pela sincronização.
do $$
begin
  if to_regclass('public.feed') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.feed'::regclass and conname = 'feed_user_id_id_key'
  ) then
    alter table public.feed add constraint feed_user_id_id_key unique (user_id, id);
  end if;
end $$;

-- Conferência: deve mostrar "PRIMARY KEY (user_id, id)" em todas (feed: UNIQUE)
select conrelid::regclass as tabela, pg_get_constraintdef(oid) as chave
from pg_constraint
where connamespace = 'public'::regnamespace
  and contype in ('p', 'u')
  and pg_get_constraintdef(oid) like '%(user_id, id)%'
order by 1;
