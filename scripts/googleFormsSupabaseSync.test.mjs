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
      const isKnownPlayer = url.includes('name=eq.Jugador%20conocido');
      const body = isKnownPlayer
        ? JSON.stringify([{ id: '00000000-0000-0000-0000-000000000001', name: 'Jugador conocido' }])
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
  JSON.parse(JSON.stringify(sandbox.findPlayerIdByFormName('Jugador conocido'))),
  {
    jugador_id: '00000000-0000-0000-0000-000000000001',
    name: 'Jugador conocido',
  },
  'El jugador debe resolverse directamente desde public.jugadores.'
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
assert.ok(
  requestedUrls.some((url) => url.includes('/rest/v1/jugadores?select=id,name&name=eq.')),
  'La identificación debe consultar directamente public.jugadores.'
);
assert.match(source, /Supabase status/, 'El script debe crear las columnas técnicas.');

console.log('Google Forms -> Supabase sync: asociación, cabeceras reales y 6 escenarios validados.');
