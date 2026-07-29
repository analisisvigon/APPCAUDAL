import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourcePath = path.join(projectRoot, 'google_forms_supabase_apps_script.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const playersMapValues = [
  ['form_name', 'jugador_id', 'name'],
  ['Jugador conocido', '00000000-0000-0000-0000-000000000001', 'Jugador conocido'],
];

const sandbox = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet() {
      return {
        getSheetByName(name) {
          if (name !== 'jugadores_map') return null;
          return {
            getDataRange() {
              return {
                getValues() {
                  return playersMapValues.map((row) => [...row]);
                },
              };
            },
          };
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

assert.match(source, /session_date=eq\.\$\{encoded\}/, 'La búsqueda RPE debe filtrar training_sessions por fecha.');
assert.doesNotMatch(source, /findTrainingSessionByFormCode/, 'El flujo nuevo no debe depender de form_code.');
assert.match(source, /Supabase status/, 'El script debe crear las columnas técnicas.');

console.log('Google Forms -> Supabase sync: 6 escenarios validados.');
