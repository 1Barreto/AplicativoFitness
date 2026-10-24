// Importação do histórico do Hevy (arquivo CSV exportado pelo app Hevy:
// Perfil > Configurações > Exportar e importar dados > Exportar treinos).
//
// Colunas esperadas: title, start_time, end_time, description, exercise_title,
// superset_id, exercise_notes, set_index, set_type, weight_kg (ou weight_lbs),
// reps, distance_km (ou distance_miles), duration_seconds, rpe.
//
// Os ids são gerados a partir do conteúdo (título + horário), então importar
// o mesmo arquivo de novo não duplica treinos.

import { DB } from '../../core/db.js';
import { Sync } from '../../core/sync.js';
import { agoraISO, normalizar } from '../../core/util.js';
import { T, listarExercicios } from './dados.js';

// Nome no Hevy -> nome na biblioteca do app
const MAPA_HEVY = {
  'Bench Press (Barbell)': 'Supino reto com barra',
  'Bench Press (Dumbbell)': 'Supino reto com halteres',
  'Incline Bench Press (Barbell)': 'Supino inclinado com barra',
  'Incline Bench Press (Dumbbell)': 'Supino inclinado com halteres',
  'Decline Bench Press (Barbell)': 'Supino declinado com barra',
  'Chest Press (Machine)': 'Supino na máquina',
  'Bench Press (Smith Machine)': 'Supino no Smith',
  'Chest Fly (Dumbbell)': 'Crucifixo com halteres',
  'Incline Chest Fly (Dumbbell)': 'Crucifixo inclinado com halteres',
  'Cable Fly Crossovers': 'Crossover na polia',
  'Chest Fly (Cable)': 'Crossover na polia',
  'Butterfly (Pec Deck)': 'Peck deck (voador)',
  'Chest Fly (Machine)': 'Peck deck (voador)',
  'Push Up': 'Flexão de braço',
  'Chest Dip': 'Mergulho nas paralelas (peito)',
  'Pull Up': 'Barra fixa pronada',
  'Chin Up': 'Barra fixa supinada',
  'Lat Pulldown (Cable)': 'Puxada frontal na polia',
  'Lat Pulldown (Machine)': 'Puxada frontal na polia',
  'Lat Pulldown - Close Grip (Cable)': 'Puxada com triângulo',
  'Bent Over Row (Barbell)': 'Remada curvada com barra',
  'Dumbbell Row': 'Remada unilateral com halter',
  'Seated Cable Row - V Grip (Cable)': 'Remada baixa na polia',
  'Seated Cable Row - Bar Grip': 'Remada baixa na polia',
  'Seated Row (Machine)': 'Remada na máquina',
  'Iso-Lateral Row (Machine)': 'Remada na máquina',
  'T Bar Row': 'Remada cavalinho (T-bar)',
  'Straight Arm Lat Pulldown (Cable)': 'Pulldown com braços estendidos',
  'Deadlift (Barbell)': 'Levantamento terra',
  'Back Extension (Hyperextension)': 'Hiperextensão lombar',
  'Overhead Press (Barbell)': 'Desenvolvimento com barra',
  'Shoulder Press (Dumbbell)': 'Desenvolvimento com halteres',
  'Seated Overhead Press (Dumbbell)': 'Desenvolvimento com halteres',
  'Shoulder Press (Machine)': 'Desenvolvimento na máquina',
  'Shoulder Press (Machine Plates)': 'Desenvolvimento na máquina',
  'Seated Shoulder Press (Machine)': 'Desenvolvimento na máquina',
  'Arnold Press (Dumbbell)': 'Desenvolvimento Arnold',
  'Lateral Raise (Dumbbell)': 'Elevação lateral com halteres',
  'Seated Lateral Raise (Dumbbell)': 'Elevação lateral com halteres',
  'Lateral Raise (Cable)': 'Elevação lateral na polia',
  'Front Raise (Dumbbell)': 'Elevação frontal com halteres',
  'Rear Delt Reverse Fly (Dumbbell)': 'Crucifixo invertido com halteres',
  'Rear Delt Reverse Fly (Machine)': 'Crucifixo invertido na máquina',
  'Face Pull': 'Face pull',
  'Upright Row (Barbell)': 'Remada alta com barra',
  'Shrug (Dumbbell)': 'Encolhimento com halteres',
  'Shrug (Barbell)': 'Encolhimento com barra',
  'Bicep Curl (Barbell)': 'Rosca direta com barra',
  'EZ Bar Biceps Curl': 'Rosca direta com barra W',
  'Bicep Curl (Dumbbell)': 'Rosca alternada com halteres',
  'Hammer Curl (Dumbbell)': 'Rosca martelo',
  'Concentration Curl': 'Rosca concentrada',
  'Preacher Curl (Machine)': 'Rosca Scott',
  'Preacher Curl (Barbell)': 'Rosca Scott',
  'Preacher Curl (Dumbbell)': 'Rosca Scott',
  'Bicep Curl (Cable)': 'Rosca na polia',
  'Seated Incline Curl (Dumbbell)': 'Rosca inclinada com halteres',
  'Triceps Pushdown': 'Tríceps na polia (barra)',
  'Triceps Rope Pushdown': 'Tríceps na polia (corda)',
  'Skullcrusher (Barbell)': 'Tríceps testa com barra W',
  'Triceps Extension (Dumbbell)': 'Tríceps francês com halter',
  'Triceps Kickback (Dumbbell)': 'Tríceps coice com halter',
  'Bench Press - Close Grip (Barbell)': 'Supino fechado',
  'Close Grip Bench Press': 'Supino fechado',
  'Bench Dip': 'Mergulho no banco',
  'Triceps Dip': 'Mergulho nas paralelas (tríceps)',
  'Wrist Curl (Barbell)': 'Rosca de punho',
  'Reverse Curl (Barbell)': 'Rosca inversa',
  'Squat (Barbell)': 'Agachamento livre',
  'Front Squat': 'Agachamento frontal',
  'Squat (Smith Machine)': 'Agachamento no Smith',
  'Bulgarian Split Squat': 'Agachamento búlgaro',
  'Goblet Squat': 'Agachamento goblet',
  'Hack Squat': 'Agachamento hack',
  'Hack Squat (Machine)': 'Agachamento hack',
  'Leg Press': 'Leg press 45°',
  'Leg Press (Machine)': 'Leg press 45°',
  'Leg Extension (Machine)': 'Cadeira extensora',
  'Lunge (Dumbbell)': 'Afundo com halteres',
  'Walking Lunge (Dumbbell)': 'Passada (avanço)',
  'Romanian Deadlift (Barbell)': 'Levantamento terra romeno',
  'Romanian Deadlift (Dumbbell)': 'Stiff com halteres',
  'Lying Leg Curl (Machine)': 'Mesa flexora',
  'Seated Leg Curl (Machine)': 'Cadeira flexora',
  'Standing Leg Curls': 'Flexora em pé',
  'Good Morning (Barbell)': 'Good morning',
  'Hip Thrust (Barbell)': 'Elevação pélvica com barra',
  'Hip Abduction (Machine)': 'Cadeira abdutora',
  'Hip Adduction (Machine)': 'Cadeira adutora',
  'Glute Bridge': 'Ponte de glúteo',
  'Standing Calf Raise (Machine)': 'Panturrilha em pé na máquina',
  'Seated Calf Raise': 'Panturrilha sentado',
  'Calf Press (Machine)': 'Panturrilha no leg press',
  'Crunch': 'Abdominal supra',
  'Cable Crunch': 'Abdominal na polia',
  'Lying Leg Raise': 'Abdominal infra (elevação de pernas)',
  'Hanging Leg Raise': 'Elevação de pernas na barra',
  'Plank': 'Prancha (segundos)',
  'Ab Wheel': 'Roda abdominal',
  'Kettlebell Swing': 'Kettlebell swing',
  'Burpee': 'Burpee',
  'Treadmill': 'Esteira',
  'Cycling': 'Bicicleta ergométrica',
  'Elliptical Trainer': 'Elíptico',
  'Rowing Machine': 'Remo ergômetro',
  'Stair Machine': 'Escada',
  'Running': 'Corrida ao ar livre',
  'Jump Rope': 'Pular corda',
};

// Exercícios do Hevy que não existem na biblioteca: criados com nome em português.
// [nome, grupo, equipamento]
const TRADUCAO_HEVY = {
  'Crunch (Machine)': ['Abdominal na máquina', 'Abdômen', 'Máquina'],
  'Calf Extension (Machine)': ['Panturrilha na máquina', 'Panturrilha', 'Máquina'],
  'Lateral Raise (Machine)': ['Elevação lateral na máquina', 'Ombros', 'Máquina'],
  'Single Arm Lateral Raise (Cable)': ['Elevação lateral unilateral na polia', 'Ombros', 'Polia'],
  'Reverse Fly Single Arm (Cable)': ['Crucifixo invertido unilateral na polia', 'Ombros', 'Polia'],
  'Triceps Extension (Barbell)': ['Tríceps francês com barra', 'Tríceps', 'Barra'],
  'Triceps Extension (Cable)': ['Tríceps extensão na polia', 'Tríceps', 'Polia'],
  'Overhead Triceps Extension (Cable)': ['Tríceps francês na polia', 'Tríceps', 'Polia'],
  'Incline Chest Press (Machine)': ['Supino inclinado na máquina', 'Peito', 'Máquina'],
  'Iso-Lateral Chest Press (Machine)': ['Supino articulado (máquina)', 'Peito', 'Máquina'],
  'Incline Bench Press (Smith Machine)': ['Supino inclinado no Smith', 'Peito', 'Smith'],
  'Low Cable Fly Crossovers': ['Crossover baixo na polia', 'Peito', 'Polia'],
  'Low Cable Fly Unilateral': ['Crossover baixo unilateral', 'Peito', 'Polia'],
  'Seated Chest Flys (Cable)': ['Crucifixo sentado na polia', 'Peito', 'Polia'],
  'Seated Cable Row - Bar Wide Grip': ['Remada baixa na polia (pegada aberta)', 'Costas', 'Polia'],
  'Iso-Lateral High Row (Machine)': ['Remada alta articulada (máquina)', 'Costas', 'Máquina'],
  'Iso-Lateral Low Row': ['Remada baixa articulada (máquina)', 'Costas', 'Máquina'],
  'Rope Straight Arm Pulldown': ['Pulldown com corda', 'Costas', 'Polia'],
  'Gorilla Row (Kettlebell)': ['Remada gorila', 'Costas', 'Kettlebell'],
  'Deadlift (Smith Machine)': ['Levantamento terra no Smith', 'Costas', 'Smith'],
  'Straight Leg Deadlift': ['Stiff com barra', 'Posterior de coxa', 'Barra'],
  'Standing Calf Raise (Smith)': ['Panturrilha em pé no Smith', 'Panturrilha', 'Smith'],
  'Shrug (Smith Machine)': ['Encolhimento no Smith', 'Trapézio', 'Smith'],
  'Knee Raise Parallel Bars': ['Elevação de joelhos nas paralelas', 'Abdômen', 'Peso corporal'],
};

// Palpite de grupo muscular pelo nome (para exercícios não reconhecidos)
const GRUPO_PALAVRAS = [
  [/crunch|abdominal|knee raise|leg raise|plank|prancha/i, 'Abdômen'],
  [/calf|panturrilha/i, 'Panturrilha'],
  [/leg curl|flexora|romanian|stiff|straight leg/i, 'Posterior de coxa'],
  [/leg extension|extensora|squat|agachamento|leg press|hack|lunge/i, 'Quadríceps'],
  [/hip thrust|glute|abduct/i, 'Glúteos'],
  [/tr[ií]ceps|pushdown|skull/i, 'Tríceps'],
  [/curl|rosca/i, 'Bíceps'],
  [/lateral raise|shoulder|delt|overhead press|desenvolvimento|elevação lateral/i, 'Ombros'],
  [/shrug|encolhimento/i, 'Trapézio'],
  [/chest|fly|bench|supino|crucifixo|dip|peck|pec deck/i, 'Peito'],
  [/row|remada|pulldown|pull up|chin up|puxada|deadlift|terra|t ?bar/i, 'Costas'],
];

const EQUIP_HEVY = [
  [/smith/i, 'Smith'], [/barbell|ez bar/i, 'Barra'], [/dumbbell/i, 'Halteres'], [/cable/i, 'Polia'],
  [/machine/i, 'Máquina'], [/kettlebell/i, 'Kettlebell'], [/band/i, 'Elástico'], [/bodyweight|weighted|parallel bars/i, 'Peso corporal'], [/polia/i, 'Polia'], [/máquina|maquina/i, 'Máquina'],
];

const TIPO_SERIE = { warmup: 'A', normal: 'N', dropset: 'D', failure: 'F' };

const MESES = { jan: 0, feb: 1, fev: 1, mar: 2, apr: 3, abr: 3, may: 4, mai: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, out: 9, nov: 10, dec: 11, dez: 11 };

// ---------- CSV ----------
export function lerCsv(texto) {
  texto = texto.replace(/^﻿/, '');
  const linhas = [];
  let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(x => x !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some(x => x !== '')) linhas.push(linha);
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  const chaves = cab.map(c => c.trim().toLowerCase());
  return resto.map(l => Object.fromEntries(chaves.map((k, i) => [k, (l[i] ?? '').trim()])));
}

// "24 Oct 2026, 10:15" ou "24 de out. de 2026, 10:15" (formatos do Hevy) ou ISO
export function lerData(s) {
  const m = String(s).match(/(\d{1,2})\s+(?:de\s+)?([A-Za-zÀ-ÿ]+)\.?\s+(?:de\s+)?(\d{4}),?\s+(?:às\s+)?(\d{1,2}):(\d{2})/i);
  if (m) {
    const mes = MESES[normalizar(m[2]).slice(0, 3)];
    if (mes !== undefined) return new Date(+m[3], mes, +m[1], +m[4], +m[5]);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

const numero = v => { if (v === '' || v === undefined || v === null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const arred = (n, casas = 2) => (n === null ? null : Math.round(n * 10 ** casas) / 10 ** casas);

// UUID determinístico a partir de um texto (SHA-1, no formato de UUID v5)
async function uuidDe(texto) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto)));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = [...hash.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Lê o CSV do Hevy e grava os treinos. Retorna um resumo.
 * @param {File} arquivo
 */
export async function importarHevy(arquivo) {
  const linhas = lerCsv(await arquivo.text());
  if (!linhas.length || !('exercise_title' in linhas[0]) || !('start_time' in linhas[0])) {
    throw new Error('Este arquivo não parece ser a exportação de treinos do Hevy (CSV).');
  }
  const emLibras = !('weight_kg' in linhas[0]) && 'weight_lbs' in linhas[0];
  const emMilhas = !('distance_km' in linhas[0]) && 'distance_miles' in linhas[0];

  // Exercícios do app, por nome normalizado
  const exercicios = await listarExercicios();
  const porNome = new Map(exercicios.map(e => [normalizar(e.nome), e]));
  const porNomeHevy = new Map(Object.entries(MAPA_HEVY).map(([h, p]) => [normalizar(h), porNome.get(normalizar(p))]));
  const traducoes = new Map(Object.entries(TRADUCAO_HEVY).map(([h, t]) => [normalizar(h), t]));
  const novosExercicios = new Map(); // nome hevy -> registro
  const agora = agoraISO();
  const criados = []; // [nome hevy, nome no app]

  // Encontra o exercício do app que corresponde ao nome do Hevy. Variações
  // com sufixo (ex.: "Lat Pulldown (Cable) (Sm Fitness)") viram exercícios
  // próprios, com nome traduzido + sufixo, para não misturar recordes de
  // máquinas diferentes.
  async function resolverExercicio(nomeHevy) {
    if (novosExercicios.has(nomeHevy)) return novosExercicios.get(nomeHevy);
    const n = normalizar(nomeHevy);
    const exato = porNomeHevy.get(n) || porNome.get(n);
    if (exato) return exato;

    let resto = nomeHevy.trim();
    const sufixos = [];
    let base = null, traducao = traducoes.get(n) || null;
    while (!traducao) {
      const m = resto.match(/^(.*?)\s*(\([^()]*\))\s*$/);
      if (!m || !m[1]) break;
      resto = m[1]; sufixos.unshift(m[2]);
      const r = normalizar(resto);
      base = porNomeHevy.get(r) || porNome.get(r) || null;
      traducao = base ? [base.nome, base.grupo, base.equipamento] : traducoes.get(r) || null;
    }
    const id = await uuidDe(`hevy-ex:${n}`);
    const jaExiste = await DB.obter(T.EXERCICIOS, id);
    if (jaExiste) { novosExercicios.set(nomeHevy, jaExiste); return jaExiste; }

    const linhasEx = linhas.filter(x => x.exercise_title === nomeHevy);
    const temDist = linhasEx.some(x => numero(x.distance_km ?? x.distance_miles) || (numero(x.duration_seconds) && !numero(x.reps)));
    const temPeso = linhasEx.some(x => numero(x.weight_kg ?? x.weight_lbs));
    const [nomePt, grupo, equipamento] = traducao
      ? [[traducao[0], ...sufixos].join(' '), traducao[1], traducao[2]]
      : [nomeHevy, (GRUPO_PALAVRAS.find(([re]) => re.test(nomeHevy)) || [, 'Outro'])[1], (EQUIP_HEVY.find(([re]) => re.test(nomeHevy)) || [, 'Outro'])[1]];
    const ex = {
      id, nome: nomePt, grupo, equipamento,
      tipo: base?.tipo === 'tempo' || temDist ? 'tempo' : temPeso ? 'peso_reps' : 'corporal',
      descanso: null, notas: `Importado do Hevy: ${nomeHevy}`, personalizado: true,
      created_at: agora, updated_at: agora, deleted: false,
    };
    novosExercicios.set(nomeHevy, ex);
    criados.push([nomeHevy, nomePt, grupo]);
    return ex;
  }

  // Agrupa as linhas por treino (título + início)
  const treinos = new Map();
  for (const l of linhas) {
    const chave = `${l.title}|${l.start_time}`;
    if (!treinos.has(chave)) treinos.set(chave, []);
    treinos.get(chave).push(l);
  }

  const registros = [];

  for (const [chave, ls] of treinos) {
    const inicio = lerData(ls[0].start_time);
    if (!inicio) continue;
    const fim = lerData(ls[0].end_time) || inicio;
    const treino = {
      id: await uuidDe(`hevy:${chave}`),
      nome: ls[0].title || 'Treino',
      rotina_id: null,
      inicio: inicio.toISOString(),
      fim: (fim > inicio ? fim : inicio).toISOString(),
      notas: ls[0].description || '',
      origem: 'hevy',
      exercicios: [],
      created_at: agora, updated_at: agora, deleted: false,
    };

    let atual = null;
    for (const [i, l] of ls.entries()) {
      const nomeHevy = l.exercise_title;
      if (!nomeHevy) continue;
      const ex = await resolverExercicio(nomeHevy);

      // Novo bloco quando o exercício muda (mantém a ordem do treino)
      if (!atual || atual.exercicio_id !== ex.id || l.set_index === '0') {
        atual = { uid: await uuidDe(`hevy:${chave}:ex:${i}`), exercicio_id: ex.id, descanso: null, notas: l.exercise_notes || '', series: [] };
        treino.exercicios.push(atual);
      }

      let peso = numero(emLibras ? l.weight_lbs : l.weight_kg);
      if (emLibras && peso !== null) peso *= 0.45359237;
      let reps = numero(l.reps);
      const dist = numero(emMilhas ? l.distance_miles : l.distance_km);
      const seg = numero(l.duration_seconds);
      if (ex.tipo === 'tempo') {
        peso = dist !== null ? (emMilhas ? dist * 1.609344 : dist) : null;
        reps = seg !== null ? seg / 60 : null;
      } else if (reps === null && seg !== null) reps = seg; // ex.: prancha em segundos

      atual.series.push({
        uid: await uuidDe(`hevy:${chave}:s:${i}`),
        tipo: TIPO_SERIE[(l.set_type || 'normal').toLowerCase()] || 'N',
        peso: arred(peso, 2), reps: arred(reps, 1), feita: true,
        ...(numero(l.rpe) ? { rpe: numero(l.rpe) } : {}),
      });
    }
    if (treino.exercicios.length) registros.push(treino);
  }

  // Não sobrescreve um treino que já foi editado no app depois de importado
  const existentes = new Map((await DB.todos(T.TREINOS, { incluirExcluidos: true })).map(t => [t.id, t]));
  const novos = registros.filter(t => !existentes.has(t.id));
  const exNovos = [];
  for (const e of novosExercicios.values()) if (e.notas?.startsWith('Importado do Hevy') && !(await DB.obter(T.EXERCICIOS, e.id))) exNovos.push(e);

  await DB.gravarRemotos(T.EXERCICIOS, exNovos, { pendente: true });
  await DB.gravarRemotos(T.TREINOS, novos, { pendente: true });
  Sync.sincronizar();

  return {
    treinos: novos.length,
    repetidos: registros.length - novos.length,
    series: novos.reduce((n, t) => n + t.exercicios.reduce((m, e) => m + e.series.length, 0), 0),
    exerciciosCriados: criados,
  };
}
