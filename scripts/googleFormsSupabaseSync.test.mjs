import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourcePath = path.join(projectRoot, 'google_forms_supabase_apps_script.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'App.jsx'), 'utf8');
const rendimientoSchemaSource = fs.readFileSync(path.join(projectRoot, 'supabase_rendimiento.sql'), 'utf8');
const migrationSource = fs.readFileSync(path.join(projectRoot, 'supabase_rpe_daily_phase1.sql'), 'utf8');
const rollbackSource = fs.readFileSync(path.join(projectRoot, 'supabase_rpe_daily_phase1_rollback.sql'), 'utf8');

const requestedUrls = [];
const requestedFetches = [];
let supabasePlayers = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Miguel Vigón',
    shirt_name: null,
    google_forms_name: 'VIGON',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Álex',
    google_forms_name: null,
  },
  { id: 'player-albuquerque', name: 'Roberto Albuquerque', google_forms_name: null },
  { id: 'player-jairo', name: 'Jairo Cárcaba', google_forms_name: null },
  { id: 'player-alejandro', name: 'Alex González', shirt_name: 'Alex Glez', google_forms_name: null },
  { id: 'player-agustin', name: 'Agustín Porto', google_forms_name: null },
  { id: 'player-oscar', name: 'Óscar Fernández', google_forms_name: null },
  { id: 'player-acerete', name: 'Cristian Acerete', google_forms_name: null },
  { id: 'player-davo', name: 'DAVID FERNÁNDEZ', shirt_name: 'Davo', google_forms_name: null },
  { id: 'player-isaac', name: 'Isaac Martín', google_forms_name: null },
  { id: 'player-lucas', name: 'Lucas Suárez', google_forms_name: null },
  { id: 'player-mario', name: 'Mario Rodríguez', google_forms_name: null },
];

const sandbox = {
  console,
  SpreadsheetApp: {
    flush() {},
  },
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(name) {
          if (name === 'SUPABASE_URL') return 'https://example.supabase.co';
          if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
          return null;
        },
      };
    },
  },
  UrlFetchApp: {
    fetch(url, options = {}) {
      requestedUrls.push(url);
      requestedFetches.push({ url, options });
      const body = url.includes('/rest/v1/jugadores?')
        ? JSON.stringify(supabasePlayers)
        : '[]';
      return {
        getResponseCode() {
          return 200;
        },
        getContentText() {
          return body;
        },
      };
    },
  },
  Utilities: {
    formatDate(date, timeZone) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone || 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    },
    sleep() {},
  },
  Session: {
    getScriptTimeZone() {
      return 'Europe/Madrid';
    },
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: sourcePath });

const madridMidnightPayload = sandbox.buildDailyRpePayload({
  'Marca temporal': new Date('2026-07-28T22:30:00.000Z'),
  'Nombre y apellidos.': 'VIGON',
  'RPE': '7',
  'Comentario': 'Trabajo correcto',
}, '00000000-0000-0000-0000-000000000001', 'Europe/Madrid');
assert.equal(madridMidnightPayload.entry_date, '2026-07-29', 'La fecha diaria debe usar la zona horaria del Sheet.');
assert.equal(madridMidnightPayload.submitted_at, '2026-07-28T22:30:00.000Z', 'Debe conservar el instante completo.');
assert.equal(madridMidnightPayload.rpe, 7);
assert.equal(madridMidnightPayload.comment, 'Trabajo correcto');
assert.equal('session_id' in madridMidnightPayload, false, 'El payload diario no debe escribir session_id.');
assert.equal('duration_minutes' in madridMidnightPayload, false, 'No debe inventar duración.');
const clubDailyPayload = sandbox.buildDailyRpePayload({
  'Marca temporal': new Date('2026-07-29T08:00:00.000Z'),
  'RPE': '6',
}, 'player-club-a', 'Europe/Madrid', 'club-a');
assert.equal(clubDailyPayload.club_id, 'club-a');
assert.equal(
  sandbox.getDailyRpeConflictTarget(clubDailyPayload),
  'club_id,jugador_id,entry_date',
  'Si el club ya existe, la clave diaria debe mantener su aislamiento.'
);
assert.equal(sandbox.getDailyRpeConflictTarget(madridMidnightPayload), 'jugador_id,entry_date');

assert.equal(sandbox.toRpeValue('7'), 7, 'Debe aceptar RPE enteros entre 1 y 10.');
assert.throws(() => sandbox.toRpeValue('0'), /RPE inválido/);
assert.throws(() => sandbox.toRpeValue('11'), /RPE inválido/);
assert.throws(() => sandbox.toRpeValue('7,5'), /RPE inválido/);

assert.equal(sandbox.toHealthRatio('8,5'), 8.5, 'Debe convertir la coma decimal.');
assert.equal(sandbox.toHealthRatio('9,25'), 9.25, 'Debe conservar los decimales del ratio.');
assert.equal(sandbox.toHealthRatio(''), null, 'Un ratio vacío debe sincronizarse como NULL.');
assert.equal(sandbox.toNullableNumber('80,4'), 80.4, 'Debe convertir el peso con coma decimal.');
assert.equal(sandbox.toNullableNumber('80.4'), 80.4, 'Debe aceptar el peso con punto decimal.');
assert.equal(sandbox.toNullableNumber(80.4), 80.4, 'Debe aceptar un número nativo de Google Sheets.');
assert.equal(sandbox.toNullableNumber(''), null, 'Un peso vacío debe mantenerse como NULL.');
assert.equal(sandbox.toNullableNumber('   '), null, 'Un peso visualmente vacío nunca debe convertirse en cero.');

assert.equal(
  sandbox.findPlayerIdByFormName('Jugador inexistente'),
  null,
  'Un jugador no encontrado no debe producir un identificador.'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.findPlayerIdByFormName('  vígon  '))),
  {
    jugador_id: '00000000-0000-0000-0000-000000000001',
    name: 'Miguel Vigón',
    google_forms_name: 'VIGON',
    match_rule: 'EXACT_GOOGLE_FORMS_NAME',
  },
  'google_forms_name debe tener prioridad e ignorar mayúsculas, tildes y espacios.'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.findPlayerIdByFormName(' alex '))),
  {
    jugador_id: '00000000-0000-0000-0000-000000000002',
    name: 'Álex',
    google_forms_name: null,
    match_rule: 'EXACT_PLAYER_NAME',
  },
  'Debe usar jugadores.name cuando google_forms_name está vacío.'
);

assert.equal(
  sandbox.resolvePlayerByFormName([
    { id: 'alias-only', name: 'Miguel Vigón', google_forms_name: 'VIGON' },
  ], 'Miguel Vigón').match_rule,
  'EXACT_PLAYER_NAME',
  'El nombre completo exacto debe seguir funcionando aunque exista alias.'
);

assert.equal(
  sandbox.resolvePlayerByFormName([
    { id: 'partial', name: 'Miguel Vigón', google_forms_name: null },
  ], 'Mig'),
  null,
  'Nunca debe aceptar fragmentos internos que no sean tokens completos.'
);

assert.equal(
  sandbox.resolvePlayerByFormName([
    { id: 'alias', name: 'Miguel Vigón', google_forms_name: 'VIGON' },
    { id: 'fallback', name: 'Vígon', google_forms_name: null },
  ], ' vigón ').jugador_id,
  'alias',
  'El alias manual exacto debe tener prioridad sobre niveles posteriores.'
);

assert.throws(
  () => sandbox.resolvePlayerByFormName([
    { id: 'alias-1', name: 'Miguel Vigón', google_forms_name: 'VIGON' },
    { id: 'alias-2', name: 'Otro jugador', google_forms_name: ' vígon ' },
  ], 'VIGON'),
  /Coincidencia ambigua/,
  'Debe bloquear alias manuales duplicados.'
);

const expectedAutomaticMatches = [
  ['Albuquerque', 'player-albuquerque', 'TOKEN_SUBSET_OF_PLAYER_NAME'],
  ['Jairo', 'player-jairo', 'TOKEN_SUBSET_OF_PLAYER_NAME'],
  ['Alex Glez', 'player-alejandro', 'EXACT_SHIRT_NAME'],
  ['Alex Glex', 'player-alejandro', 'STRICT_TYPO_DISTANCE_1_SHIRT_NAME'],
  ['Agus', 'player-agustin', 'TOKEN_SUBSET_OF_PLAYER_NAME'],
  [' Óscar--fdez. ', 'player-oscar', 'TOKEN_SUBSET_OF_PLAYER_NAME'],
  ['Acertete', 'player-acerete', 'STRICT_TYPO_DISTANCE_1_PLAYER_NAME'],
  ['Davo', 'player-davo', 'EXACT_SHIRT_NAME'],
  ['Isaac Martín Jaro', 'player-isaac', 'PLAYER_NAME_SUBSET_OF_FORMS'],
  ['Lucas Suárez Estrada', 'player-lucas', 'PLAYER_NAME_SUBSET_OF_FORMS'],
  ['Mario rguez', 'player-mario', 'TOKEN_SUBSET_OF_PLAYER_NAME'],
];

expectedAutomaticMatches.forEach(([receivedName, expectedId, expectedRule]) => {
  const resolution = sandbox.resolvePlayerByFormName(supabasePlayers, receivedName);
  assert.equal(resolution?.jugador_id, expectedId, `Debe resolver de forma segura "${receivedName}".`);
  assert.equal(resolution?.match_rule, expectedRule, `Debe registrar la regla usada para "${receivedName}".`);
});

assert.equal(
  sandbox.resolvePlayerByFormName(supabasePlayers, 'Glez')?.match_rule,
  'TOKEN_SUBSET_OF_SHIRT_NAME',
  'Las reglas por tokens deben considerar shirt_name.'
);

assert.throws(
  () => sandbox.resolvePlayerByFormName([
    { id: 'jairo-1', name: 'Jairo Cárcaba', google_forms_name: null },
    { id: 'jairo-2', name: 'Jairo López', google_forms_name: null },
  ], 'Jairo'),
  /Coincidencia ambigua/,
  'Un nombre único compartido por dos jugadores debe bloquearse.'
);

assert.throws(
  () => sandbox.resolvePlayerByFormName([
    { id: 'fernandez-1', name: 'Óscar Fernández', google_forms_name: null },
    { id: 'fernandez-2', name: 'Davo Fernández', google_forms_name: null },
  ], 'Fdez'),
  /Coincidencia ambigua/,
  'Una abreviatura de apellido compartida por dos jugadores debe bloquearse.'
);

assert.throws(
  () => sandbox.resolvePlayerByFormName([
    { id: 'typo-1', name: 'Cristian Acerete', google_forms_name: null },
    { id: 'typo-2', name: 'Juan Acerteta', google_forms_name: null },
  ], 'Acertete'),
  /Coincidencia ambigua/,
  'Dos candidatos a distancia tipográfica estricta deben bloquearse.'
);

assert.equal(
  sandbox.resolvePlayerByFormName([{ id: 'short', name: 'Davi Fernández', google_forms_name: null }], 'Davo'),
  null,
  'No debe corregir errores tipográficos en tokens cortos.'
);
assert.ok(
  sandbox.damerauLevenshteinDistance('acerete', 'acxxete') > 1,
  'El caso negativo debe superar el umbral tipográfico.'
);
assert.equal(
  sandbox.resolvePlayerByFormName([{ id: 'distance-2', name: 'Cristian Acerete', google_forms_name: null }], 'Acxxete'),
  null,
  'No debe aceptar diferencias tipográficas superiores a uno.'
);

assert.doesNotThrow(() => sandbox.assertRpeHeaders({
  'Marca temporal': '',
  'Nombre y apellidos.': '',
  'RPE': '',
  'Comentario': '',
}));
assert.throws(
  () => sandbox.assertRpeHeaders({
    'Marca temporal': '',
    'Nombre y apellidos.': '',
    'Esfuerzo percibido': '',
  }),
  /Cabeceras detectadas: Marca temporal \| Nombre y apellidos\. \| Esfuerzo percibido/,
  'Una cabecera RPE desconocida debe mostrar las cabeceras detectadas.'
);

const genericRpeHeaders = {
  'Columna 1': '29/07/2026 10:00:00',
  'Columna 3': 'Davo',
  'Columna 4': '8',
  'Columna 5': 'Sesión exigente',
  'Dorsal': '9',
};
assert.doesNotThrow(
  () => sandbox.assertRpeHeaders(genericRpeHeaders),
  'Debe reconocer las cabeceras genéricas de la hoja RPE real.'
);
const genericRpePlan = sandbox.buildRpeHistoryImportPlan(
  [{ rowNumber: 2, values: genericRpeHeaders }],
  supabasePlayers,
  'Europe/Madrid'
);
assert.equal(genericRpePlan.groups.length, 1);
assert.equal(genericRpePlan.groups[0].payload.jugador_id, 'player-davo');
assert.equal(genericRpePlan.groups[0].payload.entry_date, '2026-07-29');
assert.equal(genericRpePlan.groups[0].payload.rpe, 8);
assert.equal(genericRpePlan.groups[0].payload.comment, 'Sesión exigente');
assert.doesNotThrow(() => sandbox.assertRpeHeaders({
  'Marca temporal': '',
  'Nombre del jugador': '',
  'RPE': '',
}));

function makeSheet(name, id, headers) {
  return {
    getName() {
      return name;
    },
    getSheetId() {
      return id;
    },
    getLastColumn() {
      return headers.length;
    },
    getRange() {
      return {
        getDisplayValues() {
          return [headers];
        },
      };
    },
  };
}

const namedRpeSheet = makeSheet('Respuestas RPE', 1, ['Cabecera desconocida']);
const genericHeaderSheet = makeSheet('Respuestas de formulario 1', 2, ['Columna 1', 'Dorsal', 'Columna 3', 'Columna 4', 'Columna 5']);
assert.equal(
  sandbox.findRpeResponseSheet({
    getSheets() {
      return [genericHeaderSheet, namedRpeSheet];
    },
    getActiveSheet() {
      return genericHeaderSheet;
    },
  }),
  namedRpeSheet,
  'El nombre de hoja que contiene RPE debe tener prioridad incluso con cabeceras no descriptivas.'
);
assert.equal(
  sandbox.findRpeResponseSheet({
    getSheets() {
      return [genericHeaderSheet];
    },
    getActiveSheet() {
      return genericHeaderSheet;
    },
  }),
  genericHeaderSheet,
  'Sin nombre RPE debe detectar la hoja por Columna 1, Columna 3 y Columna 4.'
);

const rpeHistoryRows = [
  {
    rowNumber: 2,
    values: {
      'Marca temporal': '29/07/2026 10:00:00',
      'Nombre y apellidos.': 'VIGON',
      'RPE': '6',
    },
  },
  {
    rowNumber: 3,
    values: {
      'Marca temporal': '29/07/2026 10:15:00',
      'Nombre y apellidos.': 'VIGON',
      'RPE': '8',
      'Comentario': 'Prevalece la última',
    },
  },
  {
    rowNumber: 4,
    values: {
      'Marca temporal': '30/07/2026 10:00:00',
      'Nombre y apellidos.': 'Davo',
      'RPE': '7',
    },
  },
  {
    rowNumber: 5,
    values: {
      'Marca temporal': '29/07/2026 10:00:00',
      'Nombre y apellidos.': 'Jairo',
      'RPE': '11',
    },
  },
  {
    rowNumber: 6,
    values: {
      'Marca temporal': '30/07/2026 10:00:00',
      'Nombre y apellidos.': 'Jugador inexistente',
      'RPE': '5',
    },
  },
  {
    rowNumber: 7,
    values: {
      'Marca temporal': 'fecha imposible',
      'Nombre y apellidos.': 'Jairo',
      'RPE': '5',
    },
  },
  { rowNumber: 8, values: {} },
];

const rpeHistoryPlan = sandbox.buildRpeHistoryImportPlan(rpeHistoryRows, supabasePlayers, 'Europe/Madrid');
assert.equal(rpeHistoryPlan.groups.length, 2, 'Debe crear un grupo por jugador_id + entry_date.');
assert.equal(rpeHistoryPlan.groups[0].payload.rpe, 8, 'La última fila duplicada debe prevalecer.');
assert.equal(rpeHistoryPlan.groups[0].payload.comment, 'Prevalece la última');
assert.equal(rpeHistoryPlan.groups[0].payload.entry_date, '2026-07-29');
assert.equal('session_id' in rpeHistoryPlan.groups[0].payload, false);
assert.equal('duration_minutes' in rpeHistoryPlan.groups[0].payload, false);
assert.deepEqual(
  JSON.parse(JSON.stringify(rpeHistoryPlan.groups[0].rowNumbers)),
  [2, 3],
  'Las filas duplicadas deben compartir el mismo upsert.'
);
assert.equal(rpeHistoryPlan.duplicatesMerged, 1);
assert.equal(rpeHistoryPlan.failures.length, 3, 'Debe continuar tras errores de RPE, jugador y fecha.');
assert.deepEqual(
  JSON.parse(JSON.stringify(rpeHistoryPlan.failures.map((failure) => failure.category))),
  ['RPE_INVALIDO', 'JUGADOR_NO_ENCONTRADO', 'FECHA_INVALIDA']
);
assert.equal(rpeHistoryPlan.skipped, 1);

const repeatedRpeHistoryPlan = sandbox.buildRpeHistoryImportPlan(rpeHistoryRows, supabasePlayers, 'Europe/Madrid');
assert.deepEqual(
  JSON.parse(JSON.stringify(repeatedRpeHistoryPlan.groups.map((group) => group.payload))),
  JSON.parse(JSON.stringify(rpeHistoryPlan.groups.map((group) => group.payload))),
  'Repetir la importación debe producir exactamente las mismas claves y payloads.'
);

const historyPlan = sandbox.buildWellnessHistoryImportPlan([
  {
    rowNumber: 2,
    values: {
      'Marca temporal': '29/07/2026 08:15:00',
      'Nombre y apellidos.': 'VIGON',
      'Ratio salud': '8,5',
    },
  },
  {
    rowNumber: 3,
    values: {
      'Marca temporal': '29/07/2026 08:30:00',
      'Nombre y apellidos.': '  vígon ',
      'Ratio salud': '9,0',
    },
  },
  {
    rowNumber: 4,
    values: {
      'Marca temporal': '29/07/2026 09:00:00',
      'Nombre y apellidos.': 'VIGON CF',
      'Ratio salud': '7,5',
    },
  },
  {
    rowNumber: 5,
    values: {},
  },
], supabasePlayers);

assert.equal(historyPlan.groups.length, 1, 'El histórico debe agrupar por jugador_id y fecha.');
assert.deepEqual(
  JSON.parse(JSON.stringify(historyPlan.groups[0].rowNumbers)),
  [2, 3],
  'Las filas duplicadas deben quedar asociadas al mismo upsert.'
);
assert.equal(historyPlan.groups[0].payload.jugador_id, '00000000-0000-0000-0000-000000000001');
assert.equal(historyPlan.groups[0].payload.entry_date, '2026-07-29');
assert.equal(historyPlan.groups[0].payload.health_ratio, 9, 'La última fila duplicada debe ser la versión importada.');
assert.equal(historyPlan.duplicatesMerged, 1, 'Debe contabilizar el duplicado absorbido.');
assert.equal(historyPlan.failures.length, 1, 'Un nombre no resoluble debe quedar como error.');
assert.equal(historyPlan.failures[0].rowNumber, 4);
assert.equal(historyPlan.failures[0].category, 'JUGADOR_NO_ENCONTRADO');
assert.deepEqual(
  JSON.parse(JSON.stringify(historyPlan.failures[0].expectedPlayers)),
  [{
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Miguel Vigón',
    shirt_name: null,
    google_forms_name: 'VIGON',
  }],
  'El diagnóstico debe sugerir el jugador esperado sin utilizarlo para asociar.'
);
assert.equal(historyPlan.skipped, 1, 'Las filas completamente vacías deben ignorarse.');

const ambiguousFailure = sandbox.buildWellnessHistoryImportPlan([{
  rowNumber: 9,
  values: {
    'Marca temporal': '29/07/2026 09:15:00',
    'Nombre y apellidos.': 'VIGON',
    'Ratio salud': '8',
  },
}], [
  { id: 'ambiguous-1', name: 'Miguel Vigón', google_forms_name: 'VIGON' },
  { id: 'ambiguous-2', name: 'Otro Vigón', google_forms_name: ' vígon ' },
]);

assert.equal(ambiguousFailure.failures[0].category, 'ALIAS_AMBIGUO');
assert.equal(ambiguousFailure.failures[0].expectedPlayers.length, 2, 'El informe debe listar todos los alias duplicados.');
assert.equal(
  sandbox.getWellnessPayloadDiagnostic({ entry_date: '2026-02-31' }, '31/02/2026'),
  'Fecha inválida recibida: "31/02/2026".',
  'El informe debe identificar fechas inválidas.'
);

const realWellnessHeaders = {
  'Fecha': '29/07/2026',
  'Nombre y apellidos.': 'Jugador conocido',
  '¿Cuál tu peso hoy?': '72,5',
  '¿Qué tal dormiste anoche?': 'Bien',
  'Calidad del sueño': '8',
  '¿Cuánto te duelen los músculos hoy?': 'Poco',
  'Daño muscular': '3',
  'Especificar la molestia en caso de tener alguna': 'Gemelo derecho',
  '¿Cómo de fatigado estás hoy?': '4',
  '¿Cómo de estresado estás hoy?': '2',
  'Estado de ánimo.': 'Muy bien',
  'Información personal: (molestias, comentarios)': 'Carga controlada.',
  'Ratio salud': '8,5',
};

assert.equal(
  sandbox.findWellnessWeightColumnIndex(['Fecha', 'Nombre y apellidos.', '¿Cuál tu peso hoy?', 'Ratio salud']),
  3,
  'El detector debe devolver el índice 1-based de la cabecera real de peso.'
);
assert.equal(
  sandbox.findWellnessWeightColumnIndex(['Fecha', '¿Cuál\u200B tu peso hoy?', 'Ratio salud']),
  2,
  'El detector debe tolerar caracteres invisibles sin aceptar coincidencias parciales.'
);

[
  ['80,4', 80.4],
  ['80.4', 80.4],
  [80.4, 80.4],
  ['', null],
].forEach(([rawWeight, expectedWeight]) => {
  const payload = sandbox.buildWellnessPayload({
    Fecha: '30/07/2026',
    '¿Cuál tu peso hoy?': rawWeight,
  }, 'player-marcos');
  assert.equal(payload.weight, expectedWeight, `Debe mapear correctamente el peso ${JSON.stringify(rawWeight)}.`);
});

const wellnessPayloadSent = sandbox.buildWellnessPayload({
  Fecha: '30/07/2026',
  '¿Cuál tu peso hoy?': '80,4',
}, 'player-marcos');
sandbox.upsertSupabase('wellness_entries', wellnessPayloadSent, 'jugador_id,entry_date');
const wellnessUpsertRequest = requestedFetches.at(-1);
assert.equal(
  JSON.parse(wellnessUpsertRequest.options.payload).weight,
  80.4,
  'El JSON enviado a Supabase debe conservar weight como número decimal.'
);

assert.equal(
  sandbox.getFirstValue(realWellnessHeaders, ['Nombre y apellidos.', 'Nombre y apellidos']),
  'Jugador conocido',
  'Debe aceptar el punto final en la cabecera del jugador.'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.buildWellnessPayload(
    realWellnessHeaders,
    '00000000-0000-0000-0000-000000000001'
  ))),
  {
    jugador_id: '00000000-0000-0000-0000-000000000001',
    entry_date: '2026-07-29',
    sleep_hours: null,
    sleep_quality: 8,
    fatigue: 4,
    muscle_soreness: 3,
    stress: 2,
    mood: 9,
    weight: 72.5,
    discomfort: 'Gemelo derecho',
    comment: 'Carga controlada.',
    health_ratio: 8.5,
  },
  'Debe mapear las cabeceras reales con interrogaciones, dos puntos y puntos finales.'
);

assert.match(source, /function importAllRpeHistory\(\)/, 'Debe existir una importación histórica RPE manual.');
const onRpeSubmitSource = source.slice(
  source.indexOf('function onRpeSubmit'),
  source.indexOf('function importAllWellnessHistory')
);
const importRpeSource = source.slice(
  source.indexOf('function importAllRpeHistory'),
  source.indexOf('function getSupabaseConfig')
);
assert.match(
  onRpeSubmitSource,
  /upsertSupabase\('rpe_entries', payload, getDailyRpeConflictTarget\(payload\)\)/,
  'Las respuestas nuevas deben usar la clave diaria.'
);
assert.match(
  importRpeSource,
  /groups\.map\(\(group\) => group\.payload\),\s+getDailyRpeConflictTarget/,
  'El histórico RPE debe usar upsert diario por lotes.'
);
assert.doesNotMatch(onRpeSubmitSource, /training_sessions|rpe_sync_pending|session_id/);
assert.doesNotMatch(importRpeSource, /training_sessions|rpe_sync_pending|session_id/);
assert.match(source, /function buildDailyRpePayload\(/);
assert.match(source, /submitted_at: submittedDate\.toISOString\(\)/);
assert.match(source, /Cabeceras detectadas:/, 'Los errores de cabeceras deben indicar las cabeceras detectadas.');
assert.doesNotMatch(source, /jugadores_map/, 'El script no debe depender de una hoja jugadores_map.');
assert.match(source, /function importAllWellnessHistory\(\)/, 'Debe existir una importación histórica manual.');
assert.match(source, /upsertSupabase\('wellness_entries', groups\.map/, 'El histórico debe usar upsert por lotes.');
assert.match(source, /Nombre recibido desde Google Forms:/, 'El registro debe mostrar el nombre recibido.');
assert.match(source, /Motivo exacto:/, 'El registro debe mostrar el motivo exacto.');
assert.match(source, /Jugador esperado en public\.jugadores:/, 'El registro debe mostrar el candidato esperado.');
assert.ok(
  requestedUrls.some((url) => url.includes('/rest/v1/jugadores?select=id,name,shirt_name,google_forms_name')),
  'La identificación debe consultar directamente public.jugadores.'
);
assert.match(source, /Supabase status/, 'El script debe crear las columnas técnicas.');

const loadPerformanceSource = appSource.slice(
  appSource.indexOf('const loadPerformanceData'),
  appSource.indexOf('const saveTrainingSession')
);
const performanceUiSource = appSource.slice(
  appSource.indexOf('const renderPerformanceSection'),
  appSource.indexOf('const renderDelegatedRegistrySection')
);
assert.doesNotMatch(loadPerformanceSource, /\.from\('training_sessions'\)|\.from\('rpe_sync_pending'\)/);
assert.match(loadPerformanceSource, /\.from\('rpe_entries'\)/);
assert.match(performanceUiSource, /RPE por fecha/);
assert.match(performanceUiSource, /Evolución diaria/);
assert.doesNotMatch(performanceUiSource, /Crear sesión|Carga semanal|Volumen total|Carga automática|RPE pendientes de asociación/);
assert.doesNotMatch(performanceUiSource, /session_id|duration_minutes|planned_duration/);
assert.match(appSource, /entry\.entry_date/, 'Los registros legacy deben visualizarse por entry_date sin depender de session_id.');

assert.doesNotMatch(
  rendimientoSchemaSource.match(/create table if not exists public\.rpe_entries \([\s\S]*?\n\);/)?.[0] || '',
  /\bclub_id\b/,
  'El esquema actual no tiene club_id en rpe_entries.'
);
assert.match(migrationSource, /add column if not exists submitted_at timestamptz/);
assert.match(migrationSource, /alter column session_id drop not null/);
assert.match(migrationSource, /unique \(jugador_id, entry_date\)/);
assert.match(migrationSource, /unique \(club_id, jugador_id, entry_date\)/, 'La migración debe aislar por club solo si la columna ya existe.');
assert.match(migrationSource, /rpe_entries_daily_phase1_backup/);
assert.doesNotMatch(migrationSource, /drop\s+table|drop\s+column|drop\s+policy/i);
assert.doesNotMatch(migrationSource, /drop\s+constraint\s+.*session_id_fkey/i);
assert.match(rollbackSource, /Rollback bloqueado: existen rpe_entries diarios sin session_id/);
assert.doesNotMatch(rollbackSource, /drop\s+table|drop\s+column|drop\s+policy/i);

console.log('Google Forms -> Supabase: RPE diario idempotente, zona horaria, compatibilidad legacy y UI sin sesiones validados.');
