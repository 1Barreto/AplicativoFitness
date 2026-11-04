-- =====================================================================
-- Feed — treinos dos amigos, curtidas e comentários
-- Cole no Supabase > SQL Editor > New query e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
--
-- Precisa da função app_criar_tabela, que já foi criada pelo schema.sql.
--
-- Diferente das outras tabelas, aqui QUALQUER pessoa com conta no app pode
-- LER (é o que faz o feed funcionar). Só o dono cria, altera ou apaga.
--   perfis       nome que aparece no feed (o id do perfil é o id da conta)
--   feed         uma publicação por treino concluído (resumo + séries)
--   curtidas     quem curtiu cada publicação
--   comentarios  comentários (apaga quem escreveu ou o dono da publicação)
-- =====================================================================

select public.app_criar_tabela('perfis');
select public.app_criar_tabela('feed');

-- Leitura liberada para quem está logado (a escrita continua só do dono)
drop policy if exists "dono_select" on public.perfis;
drop policy if exists "todos_select" on public.perfis;
create policy "todos_select" on public.perfis for select to authenticated using (true);

drop policy if exists "dono_select" on public.feed;
drop policy if exists "todos_select" on public.feed;
create policy "todos_select" on public.feed for select to authenticated using (true);

-- Um perfil por pessoa: o id do perfil é sempre o id da conta
alter table public.perfis drop constraint if exists perfis_id_dono;
alter table public.perfis add constraint perfis_id_dono check (id = user_id);

-- Feed em ordem do treino mais recente
create index if not exists feed_fim_idx on public.feed ((data->>'fim') desc) where not deleted;

-- ---------- Curtidas ----------
create table if not exists public.curtidas (
  post_id   uuid not null references public.feed(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.curtidas enable row level security;
drop policy if exists "todos_select" on public.curtidas;
drop policy if exists "dono_insert" on public.curtidas;
drop policy if exists "dono_delete" on public.curtidas;
create policy "todos_select" on public.curtidas for select to authenticated using (true);
create policy "dono_insert" on public.curtidas for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono_delete" on public.curtidas for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on public.curtidas to authenticated;
revoke all on public.curtidas from anon;

-- ---------- Comentários ----------
create table if not exists public.comentarios (
  id        uuid primary key default gen_random_uuid(),
  post_id   uuid not null references public.feed(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto     text not null check (char_length(texto) between 1 and 500),
  criado_em timestamptz not null default now()
);
create index if not exists comentarios_post_idx on public.comentarios (post_id, criado_em);
alter table public.comentarios enable row level security;
drop policy if exists "todos_select" on public.comentarios;
drop policy if exists "dono_insert" on public.comentarios;
drop policy if exists "dono_delete" on public.comentarios;
create policy "todos_select" on public.comentarios for select to authenticated using (true);
create policy "dono_insert" on public.comentarios for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono_delete" on public.comentarios for delete to authenticated using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.feed f where f.id = post_id and f.user_id = (select auth.uid()))
);
grant select, insert, delete on public.comentarios to authenticated;
revoke all on public.comentarios from anon;

-- Conferir (deve mostrar as quatro tabelas com rowsecurity = true):
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('perfis', 'feed', 'curtidas', 'comentarios');
