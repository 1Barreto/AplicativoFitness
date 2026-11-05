-- =====================================================================
-- Foto do perfil no Feed
-- Cole no Supabase > SQL Editor > New query e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
--
-- Precisa do feed.sql já rodado antes.
--
-- 1. Cria a pasta "avatares" no Storage. Ela é pública para LER (é o que
--    faz a foto aparecer para os amigos), mas cada pessoa só consegue
--    enviar, trocar ou apagar a foto dentro da própria pasta
--    (avatares/<id da conta>/). Limite de 1 MB por arquivo, só imagens.
--    O app já reduz a foto para uns 20 KB antes de enviar.
-- 2. Atualiza a função feed_listar para trazer a foto junto com o nome.
-- =====================================================================

-- ---------- 1. Pasta das fotos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatares_dono_select" on storage.objects;
drop policy if exists "avatares_dono_insert" on storage.objects;
drop policy if exists "avatares_dono_update" on storage.objects;
drop policy if exists "avatares_dono_delete" on storage.objects;

-- (o "select" do dono é necessário para trocar a foto; os amigos veem pelo link público)
create policy "avatares_dono_select" on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatares_dono_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatares_dono_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatares_dono_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- 2. Feed com a foto do autor ----------
-- A lista de colunas mudou (ganhou autor_foto), então a função antiga sai primeiro.
drop function if exists public.feed_listar(text, int, int, uuid);

create function public.feed_listar(
  p_tipo text default 'treino', p_inicio int default 0, p_qtd int default 15, p_id uuid default null)
returns table (id uuid, user_id uuid, data jsonb, autor_nome text, autor_foto text, curtidas int, curti boolean, comentarios int)
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
    pf.data->>'nome',
    pf.data->>'foto',
    (select count(*)::int from public.curtidas c where c.post_id = p.id),
    exists (select 1 from public.curtidas c where c.post_id = p.id and c.user_id = uid),
    (select count(*)::int from public.comentarios m where m.post_id = p.id)
  from posts p
  left join public.perfis pf on pf.id = p.user_id
  order by p.data->>'fim' desc;
end;
$$;

revoke execute on function public.feed_listar(text, int, int, uuid) from public, anon;
grant execute on function public.feed_listar(text, int, int, uuid) to authenticated;

-- Conferir (deve mostrar a pasta "avatares" com public = true):
select id, public, file_size_limit from storage.buckets where id = 'avatares';
