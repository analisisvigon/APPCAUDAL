import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourcePath = path.join(projectRoot, 'google_forms_supabase_apps_script.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const requestedUrls = [];
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
    fetch(url) {
      requestedUrls.push(url);
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
    formatDate(date) {
      return date.toISOString().slice(0, 10);
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

const trainingSessions = [
  { id: 'session-code', form_code: 'RPE-MD3', session_date: '2026-07-29', planned_duration: 75, title: 'MD-3' },
  { id: 'session-date', form_code: null, session_date: '2026-07-30', planned_duration: 80, title: 'MD-2' },
  { id: 'session-multi-1', form_code: null, session_date: '2026-07-31', planned_duration: 60, title: 'Mañana' },
  { id: 'session-multi-2', form_code: null, session_date: '2026-07-31', planned_duration: 45, title: 'Tarde' },
];

assert.equal(
  sandbox.resolveTrainingSessionForRpe(trainingSessions, {
    'Código sesión': 'RPE-MD3',
    'Marca temporal': '30/07/2026 10:00:00',
  }).match_rule,
  'EXACT_FORM_CODE',
  'form_code exacto debe tener prioridad sobre la fecha.'
);

assert.equal(
  sandbox.resolveTrainingSessionForRpe(trainingSessions, {
    'Marca temporal': '30/07/2026 10:00:00',
  }).session.id,
  'session-date',
  'Sin código debe aceptar una única sesión en la fecha.'
);

assert.throws(
  () => sandbox.resolveTrainingSessionForRpe(trainingSessions, {
    'Código sesión': 'CODIGO-INEXISTENTE',
    'Marca temporal': '30/07/2026 10:00:00',
  }),
  /No existe training_session con form_code exacto/,
  'Un código recibido pero inexistente no debe hacer fallback por fecha.'
);

assert.throws(
  () => sandbox.resolveTrainingSessionForRpe(trainingSessions, {
    'Marca temporal': '01/08/2026 10:00:00',
  }),
  /No existe training_session para la fecha/,
  'Una fecha sin sesión debe bloquearse.'
);

assert.throws(
  () => sandbox.resolveTrainingSessionForRpe(trainingSessions, {
    'Marca temporal': '31/07/2026 10:00:00',
  }),
  /Sesión ambigua/,
  'Varias sesiones en la fecha deben bloquearse.'
);

assert.equal(sandbox.toRpeValue('7'), 7, 'Debe aceptar RPE enteros entre 1 y 10.');
assert.throws(() => sandbox.toRpeValue('0'), /RPE inválido/);
assert.throws(() => sandbox.toRpeValue('11'), /RPE inválido/);
assert.throws(() => sandbox.toRpeValue('7,5'), /RPE inválido/);

assert.equal(sandbox.toHealthRatio('8,5'), 8.5, 'Debe convertir la coma decimal.');
assert.equal(sandbox.toHealthRatio('9,25'), 9.25, 'Debe conservar los decimales del ratio.');
assert.equal(sandbox.toHealthRatio(''), null, 'Un ratio vacío debe sincronizarse como NULL.');

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

const rpeHistoryRows = [
  {
    rowNumber: 2,
    values: {
      'Marca temporal': '29/07/2026 10:00:00',
      'Nombre y apellidos.': 'VIGON',
      'Código sesión': 'RPE-MD3',
      'RPE': '6',
    },
  },
  {
    rowNumber: 3,
    values: {
      'Marca temporal': '29/07/2026 10:15:00',
      'Nombre y apellidos.': 'VIGON',
      'Código sesión': 'RPE-MD3',
      'RPE': '8',
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
      'Código sesión': 'RPE-MD3',
      'RPE': '11',
    },
  },
  {
    rowNumber: 6,
    values: {
      'Marca temporal': '01/08/2026 10:00:00',
      'Nombre y apellidos.': 'Jairo',
      'RPE': '5',
    },
  },
  {
    rowNumber: 7,
    values: {
      'Marca temporal': '31/07/2026 10:00:00',
      'Nombre y apellidos.': 'Jairo',
      'RPE': '5',
    },
  },
  { rowNumber: 8, values: {} },
];

const rpeHistoryPlan = sandbox.buildRpeHistoryImportPlan(rpeHistoryRows, supabasePlayers, trainingSessions);
assert.equal(rpeHistoryPlan.groups.length, 2, 'Debe crear un grupo por jugador_id + session_id.');
assert.equal(rpeHistoryPlan.groups[0].payload.rpe, 8, 'La última fila duplicada debe prevalecer.');
assert.equal(rpeHistoryPlan.groups[0].payload.duration_minutes, 75, 'Debe utilizar planned_duration.');
assert.deepEqual(
  JSON.parse(JSON.stringify(rpeHistoryPlan.groups[0].rowNumbers)),
  [2, 3],
  'Las filas duplicadas deben compartir el mismo upsert.'
);
assert.equal(rpeHistoryPlan.duplicatesMerged, 1);
assert.equal(rpeHistoryPlan.failures.length, 3, 'Debe continuar tras RPE inválido y errores de sesión.');
assert.deepEqual(
  JSON.parse(JSON.stringify(rpeHistoryPlan.failures.map((failure) => failure.category))),
  ['RPE_INVALIDO', 'SESION_NO_ENCONTRADA', 'SESION_AMBIGUA']
);
assert.equal(rpeHistoryPlan.skipped, 1);

const repeatedRpeHistoryPlan = sandbox.buildRpeHistoryImportPlan(rpeHistoryRows, supabasePlayers, trainingSessions);
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
assert.match(
  source,
  /select=id,session_date,planned_duration,title,session_type,form_code/,
  'La resolución RPE debe cargar form_code, fecha y planned_duration.'
);
assert.match(
  source,
  /upsertSupabase\('rpe_entries', groups\.map\(\(group\) => group\.payload\), 'jugador_id,session_id'\)/,
  'El histórico RPE debe usar upsert por lotes con la clave real.'
);
assert.match(
  source,
  /resolveTrainingSessionForRpe\(sessions, row\)/,
  'El histórico RPE debe reutilizar el mismo resolvedor de sesión.'
);
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

console.log('Google Forms -> Supabase sync: Wellness y RPE idempotentes, resolución segura y cabeceras reales validadas.');
