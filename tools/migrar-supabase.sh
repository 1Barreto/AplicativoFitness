#!/usr/bin/env bash
# =====================================================================
# Copia o projeto Supabase antigo para um projeto novo (ex.: de EUA para
# São Paulo). Roda pelo GitHub Actions (.github/workflows/migrar-supabase.yml).
#
# O projeto ANTIGO só é LIDO: nada lá é apagado ou alterado.
# O projeto NOVO precisa estar vazio (recém-criado). A cópia do banco é
# feita numa transação só: se der qualquer erro, nada fica pela metade e
# dá para rodar de novo.
#
# O que é copiado:
#   1. contas (auth.users + auth.identities): mesmos ids, e-mails e senhas
#   2. todas as tabelas do app (schema public): estrutura, regras de
#      segurança (RLS), funções, índices e dados
#   3. pastas de fotos do Storage (avatares, fotos-feed) e suas regras
#   4. os arquivos de foto
#   5. troca os links das fotos guardados nos dados para o projeto novo
#
# Variáveis (vêm dos "secrets" do GitHub, nunca aparecem no log):
#   ANTIGO_DB, NOVO_DB        (secrets SUPABASE_ANTIGO_DB / SUPABASE_NOVO_DB) conexão do banco ("Session pooler", porta 5432)
#   ANTIGO_CHAVE, NOVO_CHAVE  (secrets SUPABASE_ANTIGO_CHAVE / _NOVO_CHAVE) chave secreta (service_role / sb_secret_...)
# Opcional: SO_FOTOS=1 (copia só as fotos, se essa parte falhou antes),
#           PG_BIN (pasta do pg_dump/psql), PULAR_STORAGE=1 (só testes),
#           ANTIGO_API / NOVO_API (endereço da API, só para testes).
# =====================================================================
set -euo pipefail

PG_BIN="${PG_BIN:-}"
PSQL="${PG_BIN:+$PG_BIN/}psql"
PGDUMP="${PG_BIN:+$PG_BIN/}pg_dump"

erro() { echo "::error::$*"; exit 1; }
passo() { echo; echo "===== $* ====="; }

for v in ANTIGO_DB NOVO_DB; do [ -n "${!v:-}" ] || erro "Falta o secret $v."; done
if [ "${PULAR_STORAGE:-}" != "1" ]; then
  for v in ANTIGO_CHAVE NOVO_CHAVE; do [ -n "${!v:-}" ] || erro "Falta o secret $v."; done
fi

# Descobre o "ref" do projeto (ex.: rexhaiyyvpsyzvxhzlqr) pela conexão:
#   pooler:  postgresql://postgres.REF:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
#   direta:  postgresql://postgres:senha@db.REF.supabase.co:5432/postgres
ref_de() {
  local u="$1" r
  r=$(printf '%s' "$u" | sed -nE 's#^[a-z]+://postgres\.([a-z0-9]+):.*#\1#p')
  [ -n "$r" ] || r=$(printf '%s' "$u" | sed -nE 's#.*@db\.([a-z0-9]+)\.supabase\.co.*#\1#p')
  printf '%s' "$r"
}
ANTIGO_REF="${ANTIGO_REF:-$(ref_de "$ANTIGO_DB")}"
NOVO_REF="${NOVO_REF:-$(ref_de "$NOVO_DB")}"
[ -n "$ANTIGO_REF" ] || erro "Não consegui ler o projeto em SUPABASE_ANTIGO_DB. Use a conexão 'Session pooler'."
[ -n "$NOVO_REF" ] || erro "Não consegui ler o projeto em SUPABASE_NOVO_DB. Use a conexão 'Session pooler'."
[ "$ANTIGO_REF" != "$NOVO_REF" ] || erro "Os dois secrets apontam para o MESMO projeto. Confira SUPABASE_NOVO_DB."
ANTIGO_API="${ANTIGO_API:-https://$ANTIGO_REF.supabase.co}"
NOVO_API="${NOVO_API:-https://$NOVO_REF.supabase.co}"
echo "Projeto antigo: $ANTIGO_REF"
echo "Projeto novo:   $NOVO_REF"

q() { "$PSQL" "$1" -X -At -v ON_ERROR_STOP=1 -c "$2"; }

passo "1/6 Conferindo as conexões"
echo "Antigo: $(q "$ANTIGO_DB" 'show server_version')"
echo "Novo:   $(q "$NOVO_DB" 'show server_version')"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [ "${SO_FOTOS:-}" = "1" ]; then
  echo "Modo 'só fotos': o banco não será copiado de novo."
else
TABELAS_NOVO=$(q "$NOVO_DB" "select count(*) from pg_tables where schemaname = 'public'")
CONTAS_NOVO=$(q "$NOVO_DB" "select count(*) from auth.users")
if [ "$TABELAS_NOVO" != "0" ] || [ "$CONTAS_NOVO" != "0" ]; then
  erro "O projeto novo não está vazio ($TABELAS_NOVO tabelas, $CONTAS_NOVO contas). Por segurança, parei sem mexer em nada."
fi
echo "Projeto novo está vazio. Pode seguir."

SQL="$TMP/migracao.sql"

passo "2/6 Lendo o projeto antigo"
{
  echo "set session_replication_role = replica;"   # sem gatilhos/chaves durante a carga

  # Contas: users antes de identities (pg_dump já ordena pelas dependências)
  "$PGDUMP" "$ANTIGO_DB" --data-only --no-owner --no-privileges \
    --table=auth.users --table=auth.identities

  # Tabelas do app. O schema public já existe no projeto novo.
  "$PGDUMP" "$ANTIGO_DB" --schema=public --no-owner \
    | sed -E '/^CREATE SCHEMA public;$/d; /^COMMENT ON SCHEMA public IS/d; /^ALTER SCHEMA public OWNER/d'

  # Pastas do Storage (só as colunas que existem em qualquer versão)
  q "$ANTIGO_DB" "select format('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %L, %L) on conflict (id) do nothing;',
                    id, name, public, file_size_limit, allowed_mime_types) from storage.buckets order by id"

  # Regras de segurança do Storage (quem pode enviar/apagar fotos)
  q "$ANTIGO_DB" "select format('drop policy if exists %I on storage.objects; create policy %I on storage.objects as %s for %s to %s%s%s;',
                    policyname, policyname, permissive, cmd,
                    (select string_agg(quote_ident(r), ', ') from unnest(roles) r),
                    case when qual is not null then ' using (' || qual || ')' else '' end,
                    case when with_check is not null then ' with check (' || with_check || ')' else '' end)
                  from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname"

  # Links das fotos: troca o endereço do projeto antigo pelo novo e marca a
  # linha como alterada (para os aparelhos baixarem a versão nova).
  cat <<EOF
set session_replication_role = origin;
do \$\$
declare t text; n bigint;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.columns c2 on c2.table_schema = c.table_schema and c2.table_name = c.table_name
                                              and c2.column_name = 'updated_at'
           where c.table_schema = 'public' and c.column_name = 'data' and c.data_type = 'jsonb'
  loop
    execute format(\$f\$update public.%I
                      set data = replace(data::text, %L, %L)::jsonb,
                          updated_at = greatest(updated_at, now())
                      where data::text like %L\$f\$,
                   t, '$ANTIGO_REF.supabase.co', '$NOVO_REF.supabase.co', '%$ANTIGO_REF.supabase.co%');
    get diagnostics n = row_count;
    if n > 0 then raise notice 'Links de foto corrigidos em %: %', t, n; end if;
  end loop;
end
\$\$;
EOF
} > "$SQL"
echo "Leitura concluída ($(wc -c < "$SQL") bytes)."

passo "3/6 Gravando no projeto novo (tudo ou nada)"
"$PSQL" "$NOVO_DB" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$SQL" > "$TMP/saida.txt" 2>&1 \
  || { grep -E 'ERROR|ERRO|FATAL' "$TMP/saida.txt" | head -20; erro "Falhou ao gravar. Nada foi salvo no projeto novo; pode rodar de novo depois de corrigir."; }
grep -E 'NOTICE: +Links' "$TMP/saida.txt" | sed 's/.*NOTICE: */  /' || true
echo "Banco copiado."

passo "4/6 Conferindo quantidades (antigo x novo)"
CONTAGEM="select 'auth.users', count(*) from auth.users union all select 'auth.identities', count(*) from auth.identities"
for t in $(q "$ANTIGO_DB" "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  CONTAGEM="$CONTAGEM union all select 'public.$t', count(*) from public.\"$t\""
done
q "$ANTIGO_DB" "$CONTAGEM" | sort > "$TMP/c_antigo"
q "$NOVO_DB" "$CONTAGEM" | sort > "$TMP/c_novo"
DIFERENTE=0
while IFS='|' read -r nome n; do
  m=$(grep -F "$nome|" "$TMP/c_novo" | cut -d'|' -f2)
  if [ "$n" = "$m" ]; then echo "  ok  $nome: $n"; else echo "  ERRO $nome: antigo $n, novo ${m:-?}"; DIFERENTE=1; fi
done < "$TMP/c_antigo"
[ "$DIFERENTE" = "0" ] || erro "As quantidades não batem. O projeto antigo continua intacto."
fi

if [ "${PULAR_STORAGE:-}" = "1" ]; then
  echo; echo "PULAR_STORAGE=1: fotos não copiadas (modo teste)."; exit 0
fi

passo "5/6 Copiando as fotos"
cabecalhos() { # chave nova (sb_secret_...) vai só no apikey; a antiga (JWT) vai nos dois
  local k="$1"
  if [[ "$k" == sb_* ]]; then printf -- '-H\napikey: %s\n' "$k"
  else printf -- '-H\napikey: %s\n-H\nAuthorization: Bearer %s\n' "$k" "$k"; fi
}
mapfile -t H_ANTIGO < <(cabecalhos "$ANTIGO_CHAVE")
mapfile -t H_NOVO < <(cabecalhos "$NOVO_CHAVE")

q "$ANTIGO_DB" "select bucket_id || E'\t' || name || E'\t' || coalesce(metadata->>'mimetype', 'application/octet-stream')
                from storage.objects where name not like '%.emptyFolderPlaceholder' order by 1" > "$TMP/objetos"
TOTAL=$(wc -l < "$TMP/objetos" | tr -d ' ')
echo "Fotos no projeto antigo: $TOTAL"
OK=0; FALHA=0
while IFS=$'\t' read -r balde nome tipo; do
  [ -n "$balde" ] || continue
  caminho=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1] + "/" + sys.argv[2], safe="/"))' "$balde" "$nome")
  if curl -sfS "${H_ANTIGO[@]}" -o "$TMP/arquivo" "$ANTIGO_API/storage/v1/object/$caminho" \
     && curl -sfS -o /dev/null -X POST "${H_NOVO[@]}" -H "x-upsert: true" -H "Content-Type: $tipo" \
          -H "cache-control: max-age=31536000" --data-binary @"$TMP/arquivo" "$NOVO_API/storage/v1/object/$caminho"; then
    OK=$((OK + 1))
  else
    FALHA=$((FALHA + 1)); echo "  falhou: $balde/$nome"
  fi
done < "$TMP/objetos"
echo "Fotos copiadas: $OK de $TOTAL"
[ "$FALHA" = "0" ] || erro "$FALHA foto(s) não foram copiadas. O banco já está copiado: rode de novo marcando 'só fotos'."

passo "6/6 Pronto"
echo "Tudo copiado para o projeto $NOVO_REF. O projeto antigo ($ANTIGO_REF) não foi alterado."
