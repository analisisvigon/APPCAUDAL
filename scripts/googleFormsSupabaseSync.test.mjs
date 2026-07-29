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
    google_forms_name: 'VIGON',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Álex',
    google_forms_name: null,
  },
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

const uniqueSession = {
  id: 'session-1',
  session_date: '2026-07-29',
  planned_duration: 75,
};

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.classifyTrainingSessionMatch([uniqueSession]))),
  { status: 'MATCHED', session: uniqueSession },
  'Una única sesión debe asociarse automáticamente.'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.classifyTrainingSessionMatch([]))),
  { status: 'NO_SESSION', session: null },
  'Sin sesiones, el RPE debe quedar pendiente.'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.classifyTrainingSessionMatch([uniqueSession, { ...uniqueSession, id: 'session-2' }]))),
  { status: 'MULTIPLE_SESSIONS', session: null },
  'Con varias sesiones, el RPE debe quedar pendiente.'
);

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
  },
  'google_forms_name debe tener prioridad e ignorar mayúsculas, tildes y espacios.'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.findPlayerIdByFormName(' alex '))),
  {
    jugador_id: '00000000-0000-0000-0000-000000000002',
    name: 'Álex',
    google_forms_name: null,
  },
  'Debe usar jugadores.name cuando google_forms_name está vacío.'
);

assert.equal(
  sandbox.resolvePlayerByFormName([
    { id: 'alias-only', name: 'Miguel Vigón', google_forms_name: 'VIGON' },
  ], 'Miguel Vigón'),
  null,
  'Si google_forms_name está configurado, el nombre normal no debe actuar también como fallback.'
);

assert.equal(
  sandbox.resolvePlayerByFormName([
    { id: 'partial', name: 'Miguel Vigón', google_forms_name: null },
  ], 'Miguel'),
  null,
  'Nunca debe aceptar coincidencias parciales.'
);

assert.throws(
  () => sandbox.resolvePlayerByFormName([
    { id: 'alias', name: 'Miguel Vigón', google_forms_name: 'VIGON' },
    { id: 'fallback', name: 'Vígon', google_forms_name: null },
  ], ' vigón '),
  /Coincidencia ambigua/,
  'Debe bloquear la sincronización si alias y fallback producen más de un candidato.'
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
      'Nombre y apellidos.': 'Miguel',
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
assert.equal(historyPlan.failures.length, 1, 'Una coincidencia parcial debe quedar como error.');
assert.equal(historyPlan.failures[0].rowNumber, 4);
assert.equal(historyPlan.failures[0].category, 'JUGADOR_NO_ENCONTRADO');
assert.deepEqual(
  JSON.parse(JSON.stringify(historyPlan.failures[0].expectedPlayers)),
  [{
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Miguel Vigón',
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

assert.match(source, /session_date=eq\.\$\{encoded\}/, 'La búsqueda RPE debe filtrar training_sessions por fecha.');
assert.doesNotMatch(source, /findTrainingSessionByFormCode/, 'El flujo nuevo no debe depender de form_code.');
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

console.log('Google Forms -> Supabase sync: histórico idempotente, alias, fallback, ambigüedad y cabeceras reales validados.');
