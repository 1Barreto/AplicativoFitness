-- =====================================================================
-- Foto nas publicações do Feed (treino ou refeição)
-- Cole no Supabase > SQL Editor > New query e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
--
-- Cria a pasta "fotos-feed" no Storage. Ela é pública para LER (é o que faz
-- a foto aparecer para os amigos), mas cada pessoa só consegue enviar,
-- trocar ou apagar fotos dentro da própria pasta (fotos-feed/<id da conta>/).
-- Limite de 5 MB por arquivo, só imagens. O app já reduz a foto para uns
-- 150 KB antes de enviar. Não mexe em nenhum dado seu.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-feed', 'fotos-feed', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos_feed_dono_select" on storage.objects;
drop policy if exists "fotos_feed_dono_insert" on storage.objects;
drop policy if exists "fotos_feed_dono_update" on storage.objects;
drop policy if exists "fotos_feed_dono_delete" on storage.objects;

-- (o "select" do dono é necessário para trocar a foto; os amigos veem pelo link público)
create policy "fotos_feed_dono_select" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-feed' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos_feed_dono_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-feed' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos_feed_dono_update" on storage.objects for update to authenticated
  using (bucket_id = 'fotos-feed' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'fotos-feed' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos_feed_dono_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-feed' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Conferir (deve mostrar a pasta "fotos-feed" com public = true):
select id, public, file_size_limit from storage.buckets where id = 'fotos-feed';
