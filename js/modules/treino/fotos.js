// Fotos dos exercícios.
//
// As fotos vêm do Free Exercise DB (github.com/yuhonas/free-exercise-db),
// um banco de exercícios em domínio público. As miniaturas ficam em
// img/exercicios/<id>.jpg; a foto grande é buscada no GitHub quando aberta.
//
// Cada exercício pode ter o campo "foto":
//   - não definido: usa a foto padrão pelo nome (tabela abaixo)
//   - 'fedb:<id>': foto escolhida no banco de fotos
//   - 'data:image/...': foto enviada pelo usuário
//   - '' (vazio): sem foto
import { esc, normalizar } from '../../core/util.js';
import { folha, toast, Icone } from '../../core/ui.js';

const URL_GRANDE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

// Nome no app -> foto padrão (vale também para variações, ex.: "Puxada frontal na polia (Sm Fitness)")
const FOTO_POR_NOME = {
  'Supino reto com barra': 'Barbell_Bench_Press_-_Medium_Grip',
  'Supino reto com halteres': 'Dumbbell_Bench_Press',
  'Supino inclinado com barra': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Supino inclinado com halteres': 'Incline_Dumbbell_Press',
  'Supino declinado com barra': 'Decline_Barbell_Bench_Press',
  'Supino na máquina': 'Machine_Bench_Press',
  'Supino no Smith': 'Smith_Machine_Bench_Press',
  'Crucifixo com halteres': 'Dumbbell_Flyes',
  'Crucifixo inclinado com halteres': 'Incline_Dumbbell_Flyes',
  'Crossover na polia': 'Cable_Crossover',
  'Peck deck (voador)': 'Butterfly',
  'Flexão de braço': 'Pushups',
  'Mergulho nas paralelas (peito)': 'Dips_-_Chest_Version',
  'Barra fixa pronada': 'Pullups',
  'Barra fixa supinada': 'Chin-Up',
  'Puxada frontal na polia': 'Wide-Grip_Lat_Pulldown',
  'Puxada com triângulo': 'V-Bar_Pulldown',
  'Remada curvada com barra': 'Bent_Over_Barbell_Row',
  'Remada unilateral com halter': 'One-Arm_Dumbbell_Row',
  'Remada baixa na polia': 'Seated_Cable_Rows',
  'Remada cavalinho (T-bar)': 'T-Bar_Row_with_Handle',
  'Remada na máquina': 'Leverage_Iso_Row',
  'Pulldown com braços estendidos': 'Straight-Arm_Pulldown',
  'Levantamento terra': 'Barbell_Deadlift',
  'Hiperextensão lombar': 'Hyperextensions_Back_Extensions',
  'Desenvolvimento com barra': 'Standing_Military_Press',
  'Desenvolvimento com halteres': 'Dumbbell_Shoulder_Press',
  'Desenvolvimento na máquina': 'Machine_Shoulder_Military_Press',
  'Desenvolvimento Arnold': 'Arnold_Dumbbell_Press',
  'Elevação lateral com halteres': 'Side_Lateral_Raise',
  'Elevação lateral na polia': 'Standing_Low-Pulley_Deltoid_Raise',
  'Elevação frontal com halteres': 'Front_Dumbbell_Raise',
  'Crucifixo invertido com halteres': 'Seated_Bent-Over_Rear_Delt_Raise',
  'Crucifixo invertido na máquina': 'Reverse_Machine_Flyes',
  'Face pull': 'Face_Pull',
  'Remada alta com barra': 'Upright_Barbell_Row',
  'Encolhimento com halteres': 'Dumbbell_Shrug',
  'Encolhimento com barra': 'Barbell_Shrug',
  'Rosca direta com barra': 'Barbell_Curl',
  'Rosca direta com barra W': 'EZ-Bar_Curl',
  'Rosca alternada com halteres': 'Dumbbell_Alternate_Bicep_Curl',
  'Rosca martelo': 'Hammer_Curls',
  'Rosca concentrada': 'Concentration_Curls',
  'Rosca Scott': 'Preacher_Curl',
  'Rosca na polia': 'Standing_Biceps_Cable_Curl',
  'Rosca inclinada com halteres': 'Incline_Dumbbell_Curl',
  'Tríceps na polia (barra)': 'Triceps_Pushdown',
  'Tríceps na polia (corda)': 'Triceps_Pushdown_-_Rope_Attachment',
  'Tríceps testa com barra W': 'EZ-Bar_Skullcrusher',
  'Tríceps francês com halter': 'Standing_Dumbbell_Triceps_Extension',
  'Tríceps coice com halter': 'Tricep_Dumbbell_Kickback',
  'Supino fechado': 'Close-Grip_Barbell_Bench_Press',
  'Mergulho no banco': 'Bench_Dips',
  'Mergulho nas paralelas (tríceps)': 'Dips_-_Triceps_Version',
  'Rosca de punho': 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench',
  'Rosca inversa': 'Reverse_Barbell_Curl',
  'Agachamento livre': 'Barbell_Squat',
  'Agachamento frontal': 'Front_Barbell_Squat',
  'Agachamento no Smith': 'Smith_Machine_Squat',
  'Agachamento búlgaro': 'Split_Squat_with_Dumbbells',
  'Agachamento goblet': 'Goblet_Squat',
  'Agachamento hack': 'Hack_Squat',
  'Leg press 45°': 'Leg_Press',
  'Cadeira extensora': 'Leg_Extensions',
  'Afundo com halteres': 'Dumbbell_Lunges',
  'Passada (avanço)': 'Bodyweight_Walking_Lunge',
  'Levantamento terra romeno': 'Romanian_Deadlift',
  'Stiff com halteres': 'Stiff-Legged_Dumbbell_Deadlift',
  'Mesa flexora': 'Lying_Leg_Curls',
  'Cadeira flexora': 'Seated_Leg_Curl',
  'Flexora em pé': 'Standing_Leg_Curl',
  'Good morning': 'Good_Morning',
  'Elevação pélvica com barra': 'Barbell_Hip_Thrust',
  'Glúteo na polia (coice)': 'One-Legged_Cable_Kickback',
  'Cadeira abdutora': 'Thigh_Abductor',
  'Cadeira adutora': 'Thigh_Adductor',
  'Ponte de glúteo': 'Butt_Lift_Bridge',
  'Panturrilha em pé na máquina': 'Standing_Calf_Raises',
  'Panturrilha sentado': 'Seated_Calf_Raise',
  'Panturrilha no leg press': 'Calf_Press_On_The_Leg_Press_Machine',
  'Abdominal supra': 'Crunches',
  'Abdominal na polia': 'Cable_Crunch',
  'Abdominal infra (elevação de pernas)': 'Flat_Bench_Lying_Leg_Raise',
  'Elevação de pernas na barra': 'Hanging_Leg_Raise',
  'Prancha (segundos)': 'Plank',
  'Abdominal oblíquo': 'Oblique_Crunches_-_On_The_Floor',
  'Roda abdominal': 'Ab_Roller',
  'Kettlebell swing': 'One-Arm_Kettlebell_Swings',
  'Clean com barra': 'Power_Clean',
  'Esteira': 'Running_Treadmill',
  'Bicicleta ergométrica': 'Bicycling_Stationary',
  'Elíptico': 'Elliptical_Trainer',
  'Remo ergômetro': 'Rowing_Stationary',
  'Escada': 'Stairmaster',
  'Corrida ao ar livre': 'Trail_Running_Walking',
  'Pular corda': 'Rope_Jumping',
  // Exercícios criados pela importação do Hevy
  'Abdominal na máquina': 'Ab_Crunch_Machine',
  'Panturrilha na máquina': 'Calf_Press',
  'Elevação lateral na máquina': 'Side_Lateral_Raise',
  'Elevação lateral unilateral na polia': 'Standing_Low-Pulley_Deltoid_Raise',
  'Crucifixo invertido unilateral na polia': 'Cable_Rear_Delt_Fly',
  'Tríceps francês com barra': 'Standing_Overhead_Barbell_Triceps_Extension',
  'Tríceps extensão na polia': 'Triceps_Pushdown',
  'Tríceps francês na polia': 'Triceps_Overhead_Extension_with_Rope',
  'Supino inclinado na máquina': 'Leverage_Incline_Chest_Press',
  'Supino articulado (máquina)': 'Leverage_Chest_Press',
  'Supino inclinado no Smith': 'Smith_Machine_Incline_Bench_Press',
  'Crossover baixo na polia': 'Low_Cable_Crossover',
  'Crossover baixo unilateral': 'Single-Arm_Cable_Crossover',
  'Crucifixo sentado na polia': 'Flat_Bench_Cable_Flyes',
  'Remada baixa na polia (pegada aberta)': 'Seated_Cable_Rows',
  'Remada alta articulada (máquina)': 'Leverage_High_Row',
  'Remada baixa articulada (máquina)': 'Leverage_Iso_Row',
  'Pulldown com corda': 'Rope_Straight-Arm_Pulldown',
  'Remada gorila': 'Alternating_Kettlebell_Row',
  'Levantamento terra no Smith': 'Smith_Machine_Stiff-Legged_Deadlift',
  'Stiff com barra': 'Stiff-Legged_Barbell_Deadlift',
  'Panturrilha em pé no Smith': 'Smith_Machine_Calf_Raise',
  'Encolhimento no Smith': 'Smith_Machine_Behind_the_Back_Shrug',
  'Elevação de joelhos nas paralelas': 'Knee_Hip_Raise_On_Parallel_Bars',
};

const nomesOrdenados = Object.keys(FOTO_POR_NOME)
  .map(n => [normalizar(n), FOTO_POR_NOME[n]])
  .sort((a, b) => b[0].length - a[0].length);

// Palavras-chave para exercícios personalizados com outros nomes (ex.: "Tbar Sandro Moura")
const FOTO_POR_PALAVRA = [
  [/leg extension|extensora/, 'Leg_Extensions'], [/leg curl|flexora/, 'Lying_Leg_Curls'], [/hack/, 'Hack_Squat'],
  [/t-?bar|cavalinho/, 'T-Bar_Row_with_Handle'], [/chest fly|pec deck|voador|crucifixo/, 'Butterfly'],
  [/chest press|supino/, 'Leverage_Chest_Press'], [/unilateral.*remada|remada.*unilateral|one arm row/, 'Seated_One-arm_Cable_Pulley_Rows'],
  [/remada|row/, 'Leverage_Iso_Row'], [/puxada|pulldown/, 'Wide-Grip_Lat_Pulldown'], [/triceps|tricep/, 'Triceps_Pushdown'],
  [/rosca|bicep|curl/, 'Dumbbell_Bicep_Curl'], [/leg press/, 'Leg_Press'], [/agachamento|squat/, 'Barbell_Squat'],
  [/panturrilha|calf/, 'Standing_Calf_Raises'], [/elevacao lateral|lateral raise/, 'Side_Lateral_Raise'],
  [/desenvolvimento|shoulder press/, 'Machine_Shoulder_Military_Press'], [/abdominal|crunch/, 'Crunches'],
  [/abdutora|abductor/, 'Thigh_Abductor'], [/adutora|adductor/, 'Thigh_Adductor'], [/gluteo|glute|hip thrust/, 'Barbell_Hip_Thrust'],
];

// Id da foto padrão: nome exato, o nome conhecido mais longo que começa o
// nome do exercício, ou uma palavra-chave
function fotoPadrao(nome = '') {
  const n = normalizar(nome);
  const achado = nomesOrdenados.find(([k]) => n === k || n.startsWith(k + ' '));
  if (achado) return achado[1];
  const palavra = FOTO_POR_PALAVRA.find(([re]) => re.test(n));
  return palavra ? palavra[1] : null;
}

// Retorna { mini, grande, grande2 } (URLs) ou null
export function fotoDe(ex) {
  if (!ex) return null;
  const f = ex.foto;
  if (f === '') return null;
  if (typeof f === 'string' && f.startsWith('data:')) return { mini: f, grande: f };
  const id = typeof f === 'string' && f.startsWith('fedb:') ? f.slice(5) : fotoPadrao(ex.nome);
  if (!id) return null;
  return { mini: `img/exercicios/${id}.jpg`, grande: `${URL_GRANDE}${id}/0.jpg`, grande2: `${URL_GRANDE}${id}/1.jpg` };
}

// Avatar redondo com a foto (ou a inicial, se não houver foto)
export function avatarExercicio(ex, classe = '') {
  const foto = fotoDe(ex);
  const inicial = esc((ex?.nome || '?')[0].toUpperCase());
  return foto
    ? `<span class="avatar-ex com-foto ${classe}"><img src="${esc(foto.mini)}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.remove('com-foto');this.replaceWith(document.createTextNode('${inicial}'))"></span>`
    : `<span class="avatar-ex ${classe}">${inicial}</span>`;
}

// Lista do banco de fotos (carregada só quando o usuário vai escolher uma)
export async function bancoDeFotos() {
  const { BANCO_FOTOS } = await import('./fotos-banco.js');
  return BANCO_FOTOS;
}

// Reduz uma foto escolhida pelo usuário para uma miniatura quadrada (JPEG)
export function reduzirFoto(arquivo, lado = 256) {
  return new Promise((ok, erro) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = lado;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, lado, lado);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Imagem inválida')); };
    img.src = url;
  });
}

// Folha para escolher a foto: banco de fotos, foto própria ou remover.
// Resolve com o novo valor do campo "foto" ou undefined se cancelar.
export function escolherFoto(ex) {
  return folha({
    titulo: 'Foto do exercício',
    conteudo: async (corpo, fechar) => {
      corpo.innerHTML = `
        <div class="linha-botoes" style="margin-top:0">
          <label class="btn btn-secundario">${Icone.camera}<span>Minha foto</span><input type="file" accept="image/*" hidden data-arquivo></label>
          ${ex.foto !== '' ? `<button class="btn btn-secundario perigo" data-sem>${Icone.lixo}<span>Sem foto</span></button>` : ''}
          ${ex.foto ? `<button class="btn btn-secundario" data-padrao>Foto padrão</button>` : ''}
        </div>
        <label class="campo-busca" style="margin-top:12px">${Icone.busca}<input type="search" placeholder="Buscar no banco de fotos (ex.: supino, rosca)" data-busca></label>
        <div class="grade-fotos" data-grade><p class="sutil centro">Carregando…</p></div>`;
      corpo.querySelector('[data-arquivo]').onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        try { fechar(await reduzirFoto(f)); } catch { toast('Não foi possível abrir essa imagem', 'erro'); }
      };
      corpo.querySelector('[data-sem]')?.addEventListener('click', () => fechar(''));
      corpo.querySelector('[data-padrao]')?.addEventListener('click', () => fechar(null));
      const banco = await bancoDeFotos();
      const grade = corpo.querySelector('[data-grade]');
      const indice = banco.map(([id, nome, musculo, equip]) => [id, nome, musculo, normalizar(`${nome} ${traduzir(nome)} ${musculo} ${equip}`)]);
      const desenhar = (busca = '') => {
        const termos = normalizar(busca).split(/\s+/).filter(Boolean);
        const itens = (termos.length ? indice.filter(x => termos.every(t => x[3].includes(t))) : sugestoes(ex, indice)).slice(0, 60);
        grade.innerHTML = itens.length ? itens.map(([id, nome, musculo]) => `
          <button class="foto-opcao" data-id="${id}" title="${esc(nome)}">
            <img src="img/exercicios/${id}.jpg" alt="" loading="lazy"><span>${esc(nome)}</span><small>${esc(musculo)}</small>
          </button>`).join('') : '<p class="sutil centro">Nenhuma foto encontrada.</p>';
      };
      corpo.querySelector('[data-busca]').addEventListener('input', e => desenhar(e.target.value));
      grade.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) fechar(`fedb:${b.dataset.id}`); });
      desenhar();
    },
  });
}

// Palavras em português para buscar nomes em inglês
const PALAVRAS = [
  ['bench press', 'supino'], ['press', 'desenvolvimento supino'], ['curl', 'rosca'], ['row', 'remada'], ['squat', 'agachamento'],
  ['deadlift', 'terra stiff'], ['fly', 'crucifixo voador'], ['flye', 'crucifixo voador'], ['pulldown', 'puxada pulldown'], ['pull-up', 'barra fixa'], ['pullup', 'barra fixa'],
  ['chin', 'barra fixa'], ['raise', 'elevacao'], ['lateral', 'lateral'], ['extension', 'extensao frances'], ['pushdown', 'triceps polia'],
  ['calf', 'panturrilha'], ['lunge', 'afundo passada'], ['shrug', 'encolhimento'], ['crunch', 'abdominal'], ['sit-up', 'abdominal'],
  ['dumbbell', 'halter halteres'], ['barbell', 'barra'], ['cable', 'polia cabo'], ['machine', 'maquina'], ['leverage', 'maquina articulado'],
  ['leg press', 'leg press'], ['leg curl', 'flexora'], ['leg extension', 'extensora'], ['hip thrust', 'elevacao pelvica'], ['glute', 'gluteo'],
  ['dip', 'mergulho paralelas'], ['push-up', 'flexao'], ['pushup', 'flexao'], ['plank', 'prancha'], ['kickback', 'coice'], ['hammer', 'martelo'],
  ['preacher', 'scott'], ['incline', 'inclinado'], ['decline', 'declinado'], ['seated', 'sentado'], ['standing', 'em pe'], ['lying', 'deitado'],
  ['abductor', 'abdutora'], ['adductor', 'adutora'], ['skullcrusher', 'testa'], ['wrist', 'punho'], ['treadmill', 'esteira'], ['bicycl', 'bicicleta'],
  ['crossover', 'crossover'], ['butterfly', 'peck deck voador'], ['face pull', 'face pull'], ['upright', 'remada alta'], ['hyperextension', 'lombar'],
];
function traduzir(nome) {
  const n = nome.toLowerCase();
  return PALAVRAS.filter(([en]) => n.includes(en)).map(([, pt]) => pt).join(' ');
}

// Sem busca: mostra primeiro as fotos do mesmo grupo muscular
function sugestoes(ex, indice) {
  const g = normalizar(ex.grupo || '');
  const mesmo = indice.filter(x => normalizar(x[2]) === g || (g === 'costas' && normalizar(x[2]) === 'lombar') || (g === 'pernas' && /quadriceps|posterior/.test(normalizar(x[2]))));
  return mesmo.length ? mesmo : indice;
}
