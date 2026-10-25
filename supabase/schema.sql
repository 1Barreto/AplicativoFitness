-- =====================================================================
-- Aplicativo — estrutura do banco no Supabase
-- Cole tudo no Supabase > SQL Editor > New query e clique em "Run".
-- Pode ser executado mais de uma vez sem problema.
--
-- Todas as tabelas têm o mesmo formato, porque a sincronização é genérica:
--   id                UUID gerado no aparelho
--   user_id           dono do registro (preenchido automaticamente)
--   updated_at        horário da última alteração (feita no aparelho)
--   deleted           exclusão lógica
--   data              campos do módulo (JSON)
--   server_updated_at horário em que o servidor recebeu a alteração
--                     (usado para baixar só o que mudou)
-- =====================================================================

-- Função do gatilho: resolve conflitos (vence o updated_at mais recente)
-- e carimba o horário do servidor.
create or replace function public.app_antes_de_gravar()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    -- Ninguém troca o dono de um registro
    new.user_id := old.user_id;
    -- Versão mais antiga chegando depois? Mantém a atual.
    if new.updated_at < old.updated_at then
      return old;
    end if;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

-- Cria uma tabela sincronizável com RLS. Para o módulo de dieta, basta
-- chamar: select public.app_criar_tabela('alimentos');
create or replace function public.app_criar_tabela(nome text)
returns void
language plpgsql
as $$
begin
  execute format($f$
    create table if not exists public.%1$I (
      id                uuid primary key,
      user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
      updated_at        timestamptz not null default now(),
      deleted           boolean not null default false,
      data              jsonb not null default '{}'::jsonb,
      server_updated_at timestamptz not null default now()
    )$f$, nome);

  execute format('create index if not exists %1$I on public.%2$I (user_id, server_updated_at)', nome || '_sync_idx', nome);

  execute format('drop trigger if exists app_antes_de_gravar on public.%I', nome);
  execute format('create trigger app_antes_de_gravar before insert or update on public.%I
                  for each row execute function public.app_antes_de_gravar()', nome);

  -- Row Level Security: cada usuário só vê e altera os próprios registros
  execute format('alter table public.%I enable row level security', nome);
  execute format('drop policy if exists "dono_select" on public.%I', nome);
  execute format('drop policy if exists "dono_insert" on public.%I', nome);
  execute format('drop policy if exists "dono_update" on public.%I', nome);
  execute format('drop policy if exists "dono_delete" on public.%I', nome);
  execute format('create policy "dono_select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', nome);
  execute format('create policy "dono_insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', nome);
  execute format('create policy "dono_update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', nome);
  execute format('create policy "dono_delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', nome);

  execute format('grant select, insert, update, delete on public.%I to authenticated', nome);
  execute format('revoke all on public.%I from anon', nome);
end;
$$;

-- ---------- Tabelas do módulo de treino ----------
select public.app_criar_tabela('exercicios');  -- exercícios personalizados e ajustes
select public.app_criar_tabela('rotinas');     -- Treino A, B, C...
select public.app_criar_tabela('treinos');     -- treinos realizados (histórico)

-- ---------- Medidas corporais (usadas também pela dieta) ----------
select public.app_criar_tabela('medidas');

-- ---------- Módulo de dieta ----------
select public.app_criar_tabela('diario');        -- alimentos registrados em cada dia
select public.app_criar_tabela('alimentos');     -- alimentos personalizados
select public.app_criar_tabela('refeicoes');     -- refeições salvas (combinações prontas)
select public.app_criar_tabela('dieta_config');  -- refeições do dia e metas

-- Segurança extra: só o dono do banco pode executar a função de criação
revoke execute on function public.app_criar_tabela(text) from public, anon, authenticated;
