# Aplicativo — Treino (PWA)

App pessoal de treino no estilo Hevy, para iPhone (Tela de Início) e computador, com dados sincronizados pelo Supabase. HTML, CSS e JavaScript puro, sem build.

## 1. Estrutura dos arquivos

```
index.html               Página única do app (meta tags da Apple, abas, áreas de conteúdo)
manifest.json            Nome, ícones e modo tela cheia do PWA
service-worker.js        Cache offline (lista ARQUIVOS) — aumente VERSAO ao publicar arquivos novos
icons/                   Ícones (192, 512, maskable, apple-touch-icon 180, favicon)
css/style.css            Todo o visual: mobile-first, modo escuro automático, safe areas, layout de computador
supabase/schema.sql      SQL das tabelas, gatilho de conflito e Row Level Security

js/config.js             ⚠️ URL e chave anon do Supabase (único arquivo que você precisa editar)
js/app.js                Ponto de entrada: abre o banco, inicia login/sync, monta abas e rotas

js/core/                 Núcleo genérico, reaproveitado por qualquer módulo
  util.js                Datas, números (aceita vírgula), UUID, 1RM, eventos
  db.js                  IndexedDB genérico (um só store para todas as tabelas, exclusão lógica)
  sync.js                Sincronização offline-first genérica (envia pendentes, baixa alterações)
  auth.js                Login Supabase (senha ou código por e-mail)
  modulos.js             Registro de módulos: abas, rotas, tabelas e cartões da tela Hoje
  ui.js                  Ícones, modais, menus, toasts
  som.js                 Avisos sonoros (Web Audio)
  graficos.js            Chart.js sob demanda
  backup.js              Exportar/importar JSON

js/modules/              Um diretório por módulo
  index.js               Lista dos módulos carregados (é aqui que entra a dieta depois)
  hoje.js                Tela "Hoje" (junta os cartões que cada módulo registra)
  ajustes.js             Conta, sincronização, preferências, backup
  treino/
    exercicios-base.js   Biblioteca com 97 exercícios em português (ids fixos)
    dados.js             Regras do treino: exercícios, rotinas, treinos, recordes
    componentes.js       Seletor de exercícios, formulário, tipos de série, descanso
    treino.js            Aba Treino: rotinas, editor de rotina, biblioteca, detalhe do exercício
    sessao.js            Treino em andamento (cronômetros, descanso, recordes) e editor
    historico.js         Aba Histórico: lista, detalhe, editar, excluir, repetir
    progresso.js         Aba Progresso: volume semanal, frequência, recordes
    importar-hevy.js     Importa o histórico exportado do Hevy (CSV)
  corpo/
    dados.js             Medidas corporais + pesoAtual() (será usado pela dieta)
    corpo.js             Aba Corpo: registro e gráfico de medidas
```

### Como a sincronização funciona
- Tudo é gravado primeiro no IndexedDB do aparelho e marcado como "pendente".
- Com internet e login, o app envia os pendentes (upsert) e baixa o que mudou desde a última vez. Isso acontece ao abrir o app, ao voltar para ele, a cada minuto, quando a internet volta e 2,5 s depois de cada alteração.
- Todo registro tem `id` (UUID), `updated_at` e `deleted`. Em conflito, vence o `updated_at` mais recente (o servidor também recusa versões mais antigas).
- O download usa `server_updated_at` (relógio do servidor), assim uma alteração feita offline e enviada horas depois também chega ao outro aparelho.
- O selo no topo mostra **Sincronizado**, **Pendente**, **Offline**, **Local** (sem login) ou **Erro**. Toque nele para sincronizar na hora; em Ajustes há o botão "Sincronizar agora".

### Treino em andamento
Fica salvo no aparelho a cada toque. Fechar o app, trocar de app ou bloquear a tela não perde nada, e os cronômetros usam horário absoluto, então continuam certos quando você volta. (O treino em andamento fica só no aparelho onde começou; ao finalizar, vai para o histórico e sincroniza.)

Limitação do iPhone: com a tela bloqueada o Safari pausa o app, então o bipe do descanso só toca com o app aberto. Por isso a opção "Manter tela ligada no treino" vem ativada (funciona a partir do iOS 16.4). Se a chave de silêncio estiver ligada em iOS antigos, o som pode não tocar.

---

## 2. Criar o projeto no Supabase

1. Acesse https://supabase.com, crie uma conta e clique em **New project** (plano Free). Escolha um nome, uma senha do banco e a região **South America (São Paulo)**.
2. Quando o projeto estiver pronto, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Deve aparecer "Success". Isso cria as tabelas `exercicios`, `rotinas`, `treinos` e `medidas`, já com Row Level Security.
3. Em **Authentication → Sign In / Providers → Email**, deixe "Email" ativado. Duas opções:
   - Mais simples: desative **Confirm email**. Aí você cria a conta e já entra direto.
   - Se mantiver a confirmação, abra o link do e-mail uma vez (pode ser no computador) e depois entre com e-mail e senha.
4. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço do seu GitHub Pages (passo 4), por exemplo `https://seuusuario.github.io/aplicativo/`.
5. (Opcional, para entrar com código) Em **Authentication → Email Templates → Magic Link**, inclua `{{ .Token }}` no corpo do e-mail, por exemplo: `Seu código: {{ .Token }}`. No iPhone, use o código e não o link, porque o link abre no Safari, que guarda a sessão separada do app instalado.

## 3. Colocar a URL e a chave no código

1. No Supabase, vá em **Project Settings → API** (ou **Data API / API Keys**).
2. Copie a **Project URL** e a chave **anon public** (em projetos novos pode aparecer como **publishable key**, que serve igual).
3. Abra `js/config.js` e preencha:

```js
export const SUPABASE_URL = 'https://abcdefghijk.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Essa chave é pública por natureza; quem protege os dados é o Row Level Security. **Nunca** coloque a chave `service_role` / `secret` no app.

Sem preencher, o app funciona normalmente em modo local (só no aparelho).

## 4. Publicar no GitHub Pages

1. Em https://github.com/new crie um repositório (ex.: `aplicativo`). Pode ser público; no plano gratuito, o Pages exige repositório público.
2. Na página do repositório, clique em **Add file → Upload files** e arraste **o conteúdo** da pasta do app (o `index.html` precisa ficar na raiz do repositório, junto com as pastas `css`, `js`, `icons` e `supabase`). Clique em **Commit changes**.
3. Vá em **Settings → Pages**. Em **Source** escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
4. Em 1 ou 2 minutos o endereço aparece no topo dessa página: `https://seuusuario.github.io/aplicativo/`. Abra no computador para testar. (Volte ao passo 2.4 do Supabase e use esse endereço como Site URL.)

**Para atualizar depois:** suba os arquivos alterados do mesmo jeito. O app pega a versão nova na segunda vez que for aberto (ou em Ajustes → "Buscar atualização do app"). Se adicionar arquivos novos, inclua-os na lista `ARQUIVOS` do `service-worker.js` e troque `VERSAO = 'v1'` por `'v2'`.

## 5. Adicionar à Tela de Início do iPhone

1. Abra o endereço do GitHub Pages no **Safari** (precisa ser o Safari).
2. Toque no botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra o app pelo ícone novo. Ele abre em tela cheia, sem a barra do Safari.
4. Vá em **Ajustes** (engrenagem no topo) → entre com seu e-mail e senha. Faça o mesmo no computador com a mesma conta, e os dados passam a sincronizar.
5. Depois do primeiro acesso, o app funciona offline. O que você registrar sem internet fica "Pendente" e sobe sozinho quando a conexão voltar.

---

## 6. Importar o histórico do Hevy

1. No Hevy: **Perfil → Configurações (engrenagem) → Exportar e importar dados → Exportar treinos**. Salve o arquivo `.csv` (no iPhone, em Arquivos; ou envie para o computador).
2. No app: **Ajustes → Importar do Hevy → Escolher CSV do Hevy**.
3. Os treinos entram no Histórico com séries, tipos (aquecimento, drop, falha), notas, duração e cardio. Pesos em libras são convertidos para kg.
4. Os exercícios do Hevy são associados aos da biblioteca. Os que não forem reconhecidos viram exercícios personalizados (grupo "Outro"), que você pode editar em Treino → Exercícios.
5. Pode importar de novo um arquivo mais recente: treinos que já existem são ignorados, então nada se duplica. As rotinas do Hevy não vêm no arquivo de exportação, então recrie-as no app (ou use "Salvar como rotina" num treino importado).

## 7. Adicionar o módulo de dieta no futuro

1. Crie `js/modules/dieta/dieta.js` chamando `Modulos.registrar({ id: 'dieta', aba: {...}, tabelas: ['alimentos', 'refeicoes'], rotas: {...}, cartoesHoje: [...] })`.
2. Importe em `js/modules/index.js`.
3. No Supabase, rode `select public.app_criar_tabela('alimentos');` (e as demais tabelas).
4. Inclua os arquivos no `service-worker.js` e aumente a `VERSAO`.

A sincronização, o backup, a tela Hoje (o cartão "Dieta em breve" some sozinho) e a navegação já funcionam sem mudar mais nada. O peso atual está disponível em `pesoAtual()` de `js/modules/corpo/dados.js`.

## Ícones
Os ícones em `icons/` já estão prontos (halter branco em fundo azul). Para trocar, gere PNGs nos mesmos tamanhos (192, 512, 180 e 32 px; o "maskable" com margem de ~20%) em um site como https://realfavicongenerator.net e substitua os arquivos mantendo os nomes.

## Fotos dos exercícios

Por padrão cada exercício mostra um desenho do [Everkinetic](https://github.com/everkinetic/data) (licença CC BY-SA 4.0, em `img/desenhos/`). Quando não há desenho, usa uma foto do [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (domínio público; miniaturas em `img/exercicios/`, foto grande carregada do GitHub). Para trocar a foto de qualquer exercício, abra o exercício e toque em **Trocar foto** (dá para escolher outra do banco ou usar uma foto sua).
