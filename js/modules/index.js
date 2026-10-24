// Lista de módulos do app. Para adicionar um módulo novo (ex.: dieta):
//   1. crie a pasta js/modules/dieta/ com um arquivo que chame Modulos.registrar(...)
//   2. importe-o aqui
//   3. adicione as tabelas dele no SQL do Supabase (supabase/schema.sql)
//   4. inclua os arquivos novos na lista ARQUIVOS do service-worker.js
// A ordem das abas é definida pelo campo "ordem" de cada módulo.

import './hoje.js';
import './treino/treino.js';
import './treino/sessao.js';
import './treino/historico.js';
import './treino/progresso.js';
import './corpo/corpo.js';
import './perfil/perfil.js';
import './ajustes.js';
