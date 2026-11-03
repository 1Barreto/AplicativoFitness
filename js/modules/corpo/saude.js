// Peso do app Saúde do iPhone. O Saúde só conversa com apps da App Store, então a
// ponte é um Atalho do iPhone: ele lê as pesagens do Saúde e copia como texto
// ("2026-11-03 82,3", uma por linha); aqui o app cola esse texto e importa.

import { esc, num, fmtNum, dataInput } from '../../core/util.js';
import { folha, toast, Icone } from '../../core/ui.js';
import { listarMedidas, salvarMedida } from './dados.js';

// Linhas com uma data (aaaa-mm-dd ou dd/mm/aaaa) e um peso. Retorna [{ dia, peso }]
export function lerPesagens(texto) {
  const r = new Map();
  for (const linha of String(texto || '').split(/[\n;]+|\r/)) {
    let dia = null, resto = linha;
    const iso = linha.match(/(\d{4})-(\d{2})-(\d{2})/);
    const br = linha.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (iso) { dia = `${iso[1]}-${iso[2]}-${iso[3]}`; resto = linha.replace(iso[0], ' '); }
    else if (br) { dia = `${br[3]}-${br[2]}-${br[1]}`; resto = linha.replace(br[0], ' '); }
    if (!dia) continue;
    resto = resto.replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' '); // hora, se vier junto
    const m = resto.match(/\d{2,3}(?:[.,]\d+)?/);
    const peso = m ? num(m[0]) : null;
    if (peso >= 25 && peso <= 350 && !r.has(dia)) r.set(dia, Math.round(peso * 10) / 10); // a 1ª do dia (a mais recente no Atalho)
  }
  return [...r].map(([dia, peso]) => ({ dia, peso })).sort((a, b) => a.dia.localeCompare(b.dia));
}

// Grava as pesagens de dias que ainda não têm peso no app. Retorna quantas entraram.
export async function importarPesagens(lista) {
  const comPeso = new Set((await listarMedidas()).filter(m => m.peso > 0).map(m => dataInput(m.data)));
  let n = 0;
  for (const { dia, peso } of lista) {
    if (comPeso.has(dia)) continue;
    await salvarMedida({ data: new Date(`${dia}T08:00:00`).toISOString(), peso, notas: 'Importado do app Saúde' });
    n++;
  }
  return n;
}

const PASSOS = `
  <ol class="passos-atalho">
    <li>Abra o app <b>Atalhos</b> e toque em <b>+</b>. Dê o nome <b>Peso para o app</b>.</li>
    <li>Adicione <b>Buscar Amostras de Saúde</b>: tipo <b>Peso</b>, ordenar por <b>Data de Início</b>, <b>Mais Recente Primeiro</b>, limite <b>60</b>.</li>
    <li>Adicione <b>Repetir com Cada</b>. Dentro dele:
      <ul>
        <li><b>Formatar Data</b>: a <b>Data de Início</b> do Item de Repetição, formato <b>Personalizado</b> = <code>yyyy-MM-dd</code></li>
        <li><b>Obter Detalhes das Amostras de Saúde</b>: <b>Valor</b> do Item de Repetição</li>
        <li><b>Texto</b>: a Data Formatada, um espaço e o Valor</li>
      </ul></li>
    <li>Depois do Repetir, adicione <b>Combinar Texto</b> com <b>Nova Linha</b> e então <b>Copiar para Área de Transferência</b>.</li>
    <li>Rode o atalho (pode pôr na tela de início ou automatizar toda manhã), volte aqui e toque em <b>Colar do Saúde</b>.</li>
  </ol>`;

export function importarDoSaude() {
  return folha({
    titulo: 'Peso do app Saúde', classe: 'modal-alto',
    conteudo: (corpo, fechar) => {
      corpo.innerHTML = `
        <p class="sutil pequeno">O app Saúde não libera dados para apps fora da App Store. Um Atalho do iPhone copia suas pesagens e você cola aqui. Só entram dias que ainda não têm peso no app.</p>
        ${navigator.clipboard?.readText ? `<button class="btn btn-primario btn-bloco" data-colar>${Icone.copiar}<span>Colar do Saúde</span></button>` : ''}
        <label class="rotulo">Ou cole aqui o texto do atalho<textarea class="campo" rows="4" data-texto placeholder="2026-11-03 82,3&#10;2026-11-02 82,6"></textarea></label>
        <p class="pequeno" data-previa></p>
        <button class="btn btn-secundario btn-bloco" data-importar disabled>Importar</button>
        <details class="qtd-detalhe"><summary>Como criar o atalho (uma vez só)</summary>${PASSOS}</details>`;
      const texto = corpo.querySelector('[data-texto]');
      const previa = corpo.querySelector('[data-previa]');
      const botao = corpo.querySelector('[data-importar]');
      let lista = [];
      const atualizar = () => {
        lista = lerPesagens(texto.value);
        botao.disabled = !lista.length;
        previa.innerHTML = !texto.value.trim() ? ''
          : lista.length ? `${lista.length} pesage${lista.length > 1 ? 'ns' : 'm'} de ${esc(fmtDia(lista[0].dia))} a ${esc(fmtDia(lista[lista.length - 1].dia))}. Última: <b>${fmtNum(lista[lista.length - 1].peso)} kg</b>.`
          : 'Não encontrei datas e pesos nesse texto.';
      };
      const importar = async () => {
        const n = await importarPesagens(lista);
        toast(n ? `${n} pesage${n > 1 ? 'ns importadas' : 'm importada'}` : 'Nenhum dia novo: esses dias já tinham peso', n ? 'sucesso' : '', 3000);
        fechar(n);
      };
      texto.addEventListener('input', atualizar);
      botao.onclick = importar;
      corpo.querySelector('[data-colar]')?.addEventListener('click', async () => {
        try {
          texto.value = await navigator.clipboard.readText();
          atualizar();
          if (lista.length) await importar();
          else toast('A área de transferência não tem pesagens. Rode o atalho antes.', 'erro', 3500);
        } catch { toast('Não foi possível ler a área de transferência. Cole no campo abaixo.', 'erro', 3500); }
      });
    },
  });
}

const fmtDia = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
