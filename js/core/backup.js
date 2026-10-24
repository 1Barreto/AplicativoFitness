// Exportar / importar backup em JSON (todas as tabelas de todos os módulos).

import { DB } from './db.js';
import { Sync } from './sync.js';
import { dataInput } from './util.js';

export async function exportarBackup() {
  const tabelas = await DB.exportarTudo();
  const conteudo = {
    app: 'aplicativo',
    versao: 1,
    exportado_em: new Date().toISOString(),
    tabelas,
  };
  const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' });
  const nome = `aplicativo-backup-${dataInput()}.json`;
  const arquivo = new File([blob], nome, { type: 'application/json' });

  // No iPhone, o menu de compartilhar permite "Salvar em Arquivos".
  if (navigator.canShare && navigator.canShare({ files: [arquivo] }) && /iPhone|iPad/.test(navigator.userAgent)) {
    try { await navigator.share({ files: [arquivo], title: nome }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Mescla o backup com os dados atuais: para cada registro, fica a versão mais recente.
export async function importarBackup(arquivo) {
  const texto = await arquivo.text();
  let json;
  try { json = JSON.parse(texto); } catch { throw new Error('Arquivo inválido (não é JSON).'); }
  if (!json || json.app !== 'aplicativo' || typeof json.tabelas !== 'object') throw new Error('Este arquivo não é um backup do Aplicativo.');

  let total = 0;
  for (const [tabela, regs] of Object.entries(json.tabelas)) {
    if (!Array.isArray(regs)) continue;
    const atuais = new Map((await DB.todos(tabela, { incluirExcluidos: true })).map(r => [r.id, r]));
    const novos = regs.filter(r => r && r.id && r.updated_at && (!atuais.has(r.id) || r.updated_at > atuais.get(r.id).updated_at));
    await DB.gravarRemotos(tabela, novos, { pendente: true });
    total += novos.length;
  }
  Sync.sincronizar();
  return total;
}
