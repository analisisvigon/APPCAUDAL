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
const wellnessHistoryAuditSource = fs.readFileSync(
  path.join(projectRoot, 'supabase_wellness_history_audit.sql'),
  'utf8'
);

const requestedUrls = [];
const requestedFetches = [];
let recoveryRpeEntries = null;
let recoveryInsertCount = 0;
let recoveryResponseSequence = 0;
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
  { id: 'c5029ff1-5668-4efd-b91c-ccd4d2836232', name: 'Julio Rodríguez', shirt_name: 'J. RODRÍGUEZ', google_forms_name: null },
  { id: '52b68efa-2087-44a0-8f9f-96ed0f612a82', name: 'Julio Delgado', shirt_name: 'J. DELGADO', google_forms_name: null },
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
      let status = 200;
      let body = '[]';
      if (url.includes('/rest/v1/jugadores?')) {
        body = JSON.stringify(supabasePlayers);
      } else if (Array.isArray(recoveryRpeEntries) && url.includes('/rest/v1/rpe_entries')) {
        const method = String(options.method || 'get').toLowerCase();
        if (method === 'get') {
          const parsedUrl = new URL(url);
          const playerId = String(parsedUrl.searchParams.get('jugador_id') || '').replace(/^eq\./, '');
          const entryDate = String(parsedUrl.searchParams.get('entry_date') || '').replace(/^eq\./, '');
          body = JSON.stringify(recoveryRpeEntries.filter((entry) => (
            String(entry.jugador_id) === playerId && String(entry.entry_date) === entryDate
          )).slice(0, 2));
        } else if (method === 'post') {
          recoveryInsertCount += 1;
          const payload = JSON.parse(options.payload || '{}');
          const existing = recoveryRpeEntries.find((entry) => (
            String(entry.jugador_id) === String(payload.jugador_id)
            && String(entry.entry_date) === String(payload.entry_date)
          ));
          if (existing) {
            status = 409;
            body = JSON.stringify({ message: 'duplicate key value violates unique constraint' });
          } else {
            const inserted = {
              id: `recovery-rpe-${++recoveryResponseSequence}`,
              ...payload,
              created_at: payload.submitted_at,
              updated_at: payload.submitted_at,
            };
            recoveryRpeEntries.push(inserted);
            body = JSON.stringify([inserted]);
          }
        }
      }
      return {
        getResponseCode() {
          return status;
        },
        getContentText() {
          return body;
        },
      };
    },
  },
  Utilities: {
    formatDate(date, timeZone, format) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone || 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...(String(format || '').includes('HH') ? {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        } : {}),
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const isoDate = `${values.year}-${values.month}-${values.day}`;
      return String(format || '').includes('HH')
        ? `${isoDate} ${values.hour}:${values.minute}:${values.second}`
        : isoDate;
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

const wellnessSheetTimeZonePayload = sandbox.buildWellnessPayload({
  'Marca temporal': new Date('2026-07-29T22:30:00.000Z'),
  'Nombre y apellidos.': 'VIGON',
  'Información personal: (molestias, comentarios)': 'Cuádriceps derecho',
}, '00000000-0000-0000-0000-000000000001', 'Europe/Madrid');
assert.equal(
  wellnessSheetTimeZonePayload.entry_date,
  '2026-07-30',
  'Wellness debe obtener la fecha diaria con la zona horaria del Sheet, no con UTC.'
);
assert.equal(wellnessSheetTimeZonePayload.comment, 'Cuádriceps derecho');
assert.equal(wellnessSheetTimeZonePayload.discomfort, '');
const wellnessHistoryTimeZonePlan = sandbox.buildWellnessHistoryImportPlan([{
  rowNumber: 2,
  values: {
    'Marca temporal': new Date('2026-07-29T22:30:00.000Z'),
    'Nombre y apellidos.': 'VIGON',
    'Información personal: (molestias, comentarios)': 'Comentario histórico',
  },
}], supabasePlayers, 'Europe/Madrid');
assert.equal(wellnessHistoryTimeZonePlan.failures.length, 0);
assert.equal(
  wellnessHistoryTimeZonePlan.groups[0].payload.entry_date,
  '2026-07-30',
  'La reimportación histórica Wellness debe compartir la zona horaria del Sheet.'
);

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

const julioRodriguezId = 'c5029ff1-5668-4efd-b91c-ccd4d2836232';
const julioDelgadoId = '52b68efa-2087-44a0-8f9f-96ed0f612a82';
['JULIO RGUEZ', 'Julio Rguez', 'Julio Rodríguez', 'Julio Rodriguez'].forEach((receivedName) => {
  const resolution = sandbox.resolvePlayerByFormName(supabasePlayers, receivedName);
  assert.equal(resolution?.jugador_id, julioRodriguezId, `${receivedName} debe resolver al UUID auditado de Julio Rodríguez.`);
  assert.equal(resolution?.match_rule, 'EXACT_PLAYER_ALIAS');
});
const preCorrectionPlayers = supabasePlayers.map((player) => (
  player.id === julioRodriguezId ? { ...player, name: 'Juilo Rodríguez' } : player
));
assert.equal(
  sandbox.resolvePlayerByFormName(preCorrectionPlayers, 'JULIO RGUEZ')?.jugador_id,
  julioRodriguezId,
  'El alias sigue siendo seguro durante el despliegue anterior al UPDATE protegido.',
);
assert.equal(
  sandbox.resolvePlayerByFormName(supabasePlayers, 'JULIO DELGADO')?.jugador_id,
  julioDelgadoId,
  'Julio Delgado conserva un UUID distinto.'
);
assert.throws(
  () => sandbox.resolvePlayerByFormName(supabasePlayers, 'JULIO'),
  /Coincidencia ambigua/,
  'El token parcial JULIO nunca puede elegir entre Julio Rodríguez y Julio Delgado.'
);

const julioWellnessPlan = sandbox.buildWellnessHistoryImportPlan([{
  rowNumber: 13,
  values: {
    'Marca temporal': '13/08/2026 08:00:00',
    'Nombre y apellidos.': 'JULIO RGUEZ',
    'Ratio salud': '8',
  },
}], supabasePlayers, 'Europe/Madrid');
const julioRpePlan = sandbox.buildRpeHistoryImportPlan([{
  rowNumber: 14,
  values: {
    'Marca temporal': '13/08/2026 12:00:00',
    'Nombre y apellidos.': 'Julio Rodriguez',
    'RPE': '6',
  },
}], supabasePlayers, 'Europe/Madrid');
assert.equal(julioWellnessPlan.groups[0]?.payload.jugador_id, julioRodriguezId, 'Wellness usa el resolver centralizado.');
assert.equal(julioRpePlan.groups[0]?.payload.jugador_id, julioRodriguezId, 'RPE usa el mismo resolver centralizado.');
assert.equal(julioWellnessPlan.failures.length, 0);
assert.equal(julioRpePlan.failures.length, 0);

const unknownWellnessPlan = sandbox.buildWellnessHistoryImportPlan([{
  rowNumber: 15,
  values: { 'Marca temporal': '13/08/2026 08:00:00', 'Nombre y apellidos.': 'Jugador desconocido', 'Ratio salud': '8' },
}], supabasePlayers, 'Europe/Madrid');
const unknownRpePlan = sandbox.buildRpeHistoryImportPlan([{
  rowNumber: 16,
  values: { 'Marca temporal': '13/08/2026 12:00:00', 'Nombre y apellidos.': 'Jugador desconocido', 'RPE': '6' },
}], supabasePlayers, 'Europe/Madrid');
assert.equal(unknownWellnessPlan.groups.length, 0, 'Wellness desconocido no genera payload insertable.');
assert.equal(unknownWellnessPlan.failures[0]?.category, 'JUGADOR_NO_ENCONTRADO');
assert.equal(unknownRpePlan.groups.length, 0, 'RPE desconocido no genera payload insertable.');
assert.equal(unknownRpePlan.failures[0]?.category, 'JUGADOR_NO_ENCONTRADO');

const targetedWellnessRows = sandbox.selectWellnessHistoryRowsByPlayerAndDate([
  {
    rowNumber: 20,
    values: {
      'Marca temporal': '13/08/2026 08:00:00',
      'Nombre y apellidos.': 'JULIO RGUEZ',
      'Supabase status': 'SYNCED',
      'Ratio salud': '7',
    },
  },
  {
    rowNumber: 21,
    values: {
      'Marca temporal': '13/08/2026 08:05:00',
      'Nombre y apellidos.': 'JULIO RGUEZ',
      'Supabase status': 'ERROR',
      'Supabase error': 'Jugador no encontrado en public.jugadores: "JULIO RGUEZ".',
      'Ratio salud': '8',
    },
  },
  {
    rowNumber: 22,
    values: {
      'Marca temporal': '13/08/2026 08:10:00',
      'Nombre y apellidos.': 'JULIO DELGADO',
      'Supabase status': 'ERROR',
      'Ratio salud': '9',
    },
  },
], 'JULIO RGUEZ', '2026-08-13', 'Europe/Madrid');
assert.deepEqual(
  JSON.parse(JSON.stringify(targetedWellnessRows.map((row) => row.rowNumber))),
  [21],
  'La recuperación puntual selecciona solo la respuesta fallida exacta y no otra fila ni otro Julio.'
);

const verifiedRpePlayers = [
  {
    id: '405e20ed-6648-4843-b223-54f7a6f3838f',
    name: 'DAVID FERNÁNDEZ',
    shirt_name: 'DAVO',
    google_forms_name: null,
  },
  {
    id: 'c5029ff1-5668-4efd-b91c-ccd4d2836232',
    name: 'Julio Rodríguez',
    shirt_name: 'J. RODRÍGUEZ',
    google_forms_name: null,
  },
  {
    id: '52b68efa-2087-44a0-8f9f-96ed0f612a82',
    name: 'Julio Delgado',
    shirt_name: null,
    google_forms_name: null,
  },
  {
    id: '2e0146e9-e9fc-45ad-b055-edc138a85f7e',
    name: 'Borja Rodríguez',
    shirt_name: 'BORJA RGUEZ',
    google_forms_name: null,
  },
  {
    id: 'forms-vigon',
    name: 'Miguel Vigón',
    shirt_name: null,
    google_forms_name: 'VIGON',
  },
];

const verifiedHistoricalAliases = [
  ['DAVI', '405e20ed-6648-4843-b223-54f7a6f3838f', 'DAVID FERNÁNDEZ'],
  ['Julio Rodriguez', 'c5029ff1-5668-4efd-b91c-ccd4d2836232', 'Julio Rodríguez'],
  ['JULIO RGUEZ', 'c5029ff1-5668-4efd-b91c-ccd4d2836232', 'Julio Rodríguez'],
];
verifiedHistoricalAliases.forEach(([receivedName, expectedId, expectedName]) => {
  const sharedResolution = sandbox.resolvePlayerByFormName(verifiedRpePlayers, receivedName);
  assert.equal(sharedResolution.jugador_id, expectedId, `"${receivedName}" debe usar el alias compartido y auditado.`);
  const resolution = sandbox.resolveRpePlayerByFormName(verifiedRpePlayers, receivedName);
  assert.equal(resolution.jugador_id, expectedId);
  assert.equal(resolution.name, expectedName);
  assert.equal(resolution.match_rule, 'EXACT_PLAYER_ALIAS');
});

assert.throws(
  () => sandbox.resolveRpePlayerByFormName([
    {
      id: 'jugador-no-verificado',
      name: 'Julio Rodríguez',
      shirt_name: 'J. RODRÍGUEZ',
      google_forms_name: null,
    },
    verifiedRpePlayers[2],
  ], 'Julio Rodriguez'),
  /REVISAR_MANUALMENTE/,
  'El alias compartido debe bloquearse si no están presentes el id, name y shirt_name auditados.'
);
assert.equal(
  sandbox.resolveRpePlayerByFormName(verifiedRpePlayers, 'Julio Rod'),
  null,
  'Un fragmento parecido a un alias histórico no debe activar la equivalencia.'
);

const controlledDropdownAudit = sandbox.auditRpeDropdownNames([
  'VIGON',
  'DAVO',
  'J. RODRÍGUEZ',
  'Julio Delgado',
  'Julio Rguez',
], verifiedRpePlayers);
assert.deepEqual(
  JSON.parse(JSON.stringify(controlledDropdownAudit.map((item) => item.status))),
  ['RESUELTO', 'RESUELTO', 'RESUELTO', 'RESUELTO', 'RESUELTO'],
  'Los nombres controlados actuales deben resolverse inequívocamente.'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(controlledDropdownAudit.map((item) => item.match_rule))),
  [
    'EXACT_GOOGLE_FORMS_NAME',
    'EXACT_SHIRT_NAME',
    'EXACT_SHIRT_NAME',
    'EXACT_PLAYER_NAME',
    'EXACT_PLAYER_ALIAS',
  ]
);

const historicalAliasRows = [
  {
    rowNumber: 42,
    values: {
      'Marca temporal': '01/08/2026 12:00:00',
      'Nombre y apellidos.': 'DAVI',
      'Esfuerzo percibido de la sesión de entrenamiento.': 2,
      'Información personal: (sensaciones, molestias, comentarios, etc).': '',
    },
  },
  {
    rowNumber: 73,
    values: {
      'Marca temporal': '02/08/2026 12:00:00',
      'Nombre y apellidos.': 'Julio Rodriguez',
      'Esfuerzo percibido de la sesión de entrenamiento.': 4,
      'Información personal: (sensaciones, molestias, comentarios, etc).': '',
    },
  },
  {
    rowNumber: 87,
    values: {
      'Marca temporal': '03/08/2026 12:00:00',
      'Nombre y apellidos.': 'JULIO RGUEZ',
      'Esfuerzo percibido de la sesión de entrenamiento.': 5,
      'Información personal: (sensaciones, molestias, comentarios, etc).': '',
    },
  },
];
const historicalAliasPreview = sandbox.buildRpeHistoricalAliasPreview(
  historicalAliasRows,
  verifiedRpePlayers,
  'Europe/Madrid',
  [42, 73, 87]
);
assert.deepEqual(
  JSON.parse(JSON.stringify(historicalAliasPreview.map((item) => ({
    rowNumber: item.rowNumber,
    receivedName: item.receivedName,
    status: item.status,
    jugador_id: item.jugador_id,
    name: item.name,
    shirt_name: item.shirt_name,
    match_rule: item.match_rule,
    entry_date: item.entry_date,
    rpe: item.rpe,
  })))),
  [
    {
      rowNumber: 42,
      receivedName: 'DAVI',
      status: 'RESUELTO',
      jugador_id: '405e20ed-6648-4843-b223-54f7a6f3838f',
      name: 'DAVID FERNÁNDEZ',
      shirt_name: 'DAVO',
      match_rule: 'EXACT_PLAYER_ALIAS',
      entry_date: '2026-08-01',
      rpe: 2,
    },
    {
      rowNumber: 73,
      receivedName: 'Julio Rodriguez',
      status: 'RESUELTO',
      jugador_id: 'c5029ff1-5668-4efd-b91c-ccd4d2836232',
      name: 'Julio Rodríguez',
      shirt_name: 'J. RODRÍGUEZ',
      match_rule: 'EXACT_PLAYER_ALIAS',
      entry_date: '2026-08-02',
      rpe: 4,
    },
    {
      rowNumber: 87,
      receivedName: 'JULIO RGUEZ',
      status: 'RESUELTO',
      jugador_id: 'c5029ff1-5668-4efd-b91c-ccd4d2836232',
      name: 'Julio Rodríguez',
      shirt_name: 'J. RODRÍGUEZ',
      match_rule: 'EXACT_PLAYER_ALIAS',
      entry_date: '2026-08-03',
      rpe: 5,
    },
  ],
  'La previsualización debe mostrar identidad, regla, fecha y RPE sin insertar.'
);
const historicalAliasImportPlan = sandbox.buildRpeHistoryImportPlan(
  historicalAliasRows,
  verifiedRpePlayers,
  'Europe/Madrid'
);
assert.equal(historicalAliasImportPlan.groups.length, 3);
assert.equal(historicalAliasImportPlan.failures.length, 0);
const blockedHistoricalAliasPreview = sandbox.buildRpeHistoricalAliasPreview(
  historicalAliasRows,
  verifiedRpePlayers.filter((player) => player.id !== 'c5029ff1-5668-4efd-b91c-ccd4d2836232'),
  'Europe/Madrid',
  [73, 87]
);
assert.deepEqual(
  JSON.parse(JSON.stringify(blockedHistoricalAliasPreview.map((item) => item.status))),
  ['REVISAR_MANUALMENTE', 'REVISAR_MANUALMENTE'],
  'Si desaparece la identidad auditada, los alias de Julio no deben generar payloads importables.'
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

const actualRpeHeaders = [
  'Marca temporal',
  'Dirección de correo electrónico',
  'Nombre y apellidos.',
  'Esfuerzo percibido de la sesión de entrenamiento.',
  'Información personal: (sensaciones, molestias, comentarios, etc).',
  'Dorsal',
  'Supabase status',
  'Supabase session_id',
  'Supabase error',
  'Supabase synced_at',
];
const actualRpeRawRow = [
  new Date('2026-08-09T10:30:00.000Z'),
  'jugador@example.com',
  'VIGON',
  10,
  'Sesión completada sin molestias',
  '7',
  '',
  '',
  '',
  '',
];
const actualRpeFields = sandbox.resolveRequiredRpeFields(
  actualRpeHeaders,
  actualRpeRawRow,
  actualRpeRawRow
);
assert.equal(actualRpeFields.player.header, 'Nombre y apellidos.');
assert.equal(actualRpeFields.player.index, 3);
assert.equal(actualRpeFields.rpe.header, 'Esfuerzo percibido de la sesión de entrenamiento.');
assert.equal(actualRpeFields.rpe.index, 4);
assert.equal(actualRpeFields.comment.header, 'Información personal: (sensaciones, molestias, comentarios, etc).');
assert.equal(actualRpeFields.comment.index, 5);
assert.equal(actualRpeFields.rpe.state, 'VALUE');
assert.doesNotThrow(() => sandbox.assertRequiredRpeColumns(
  actualRpeFields,
  actualRpeHeaders,
  'Respuestas RPE'
));

const actualRpePayload = sandbox.buildDailyRpePayload(
  Object.fromEntries(actualRpeHeaders.map((header, index) => [header, actualRpeRawRow[index]])),
  '00000000-0000-0000-0000-000000000001',
  'Europe/Madrid',
  null,
  actualRpeFields
);
assert.equal(actualRpePayload.rpe, 10, 'La pregunta real debe aceptar un RPE numérico entre 1 y 10.');
assert.equal(
  actualRpePayload.comment,
  'Sesión completada sin molestias',
  'La pregunta real de información personal debe mapearse a rpe_entries.comment.'
);

const oscarRealRpeHeaders = [
  'Marca temporal',
  'Dirección de correo electrónico',
  'Oscar Nombre y apellidos.',
  'Esfuerzo percibido de la sesión de entrenamiento.',
  'Información personal: (sensaciones, molestias, comentarios, etc).',
  'Dorsal',
  'Supabase status',
  'Supabase session_id',
  'Supabase error',
  'Supabase synced_at',
];
const oscarRealRpeRawRow = [
  new Date('2026-08-14T21:09:56.000Z'),
  'samu@example.com',
  'SAMU',
  3,
  '',
  '26',
  '',
  '',
  '',
  '',
];
const oscarRealRpeDisplayRow = [
  '14/08/2026 23:09:56',
  'samu@example.com',
  'SAMU',
  '3',
  '',
  '26',
  '',
  '',
  '',
  '',
];
const oscarRealRpeFields = sandbox.resolveRequiredRpeFields(
  oscarRealRpeHeaders,
  oscarRealRpeRawRow,
  oscarRealRpeDisplayRow
);
assert.equal(oscarRealRpeFields.player.found, true, 'La cabecera real de jugador debe resolverse explícitamente.');
assert.equal(oscarRealRpeFields.player.header, 'Oscar Nombre y apellidos.');
assert.equal(oscarRealRpeFields.player.state, 'VALUE');
assert.equal(oscarRealRpeFields.timestamp.found, true, 'Marca temporal debe seguir reconocida.');
assert.equal(oscarRealRpeFields.timestamp.state, 'VALUE');
assert.equal(oscarRealRpeFields.rpe.found, true, 'La cabecera real de esfuerzo debe seguir reconocida.');
assert.equal(oscarRealRpeFields.rpe.state, 'VALUE');
assert.equal(oscarRealRpeFields.comment.found, true, 'La cabecera real de comentario debe seguir reconocida.');
const oscarRealRpeSheet = {
  getName() { return 'Respuestas de formulario 1'; },
  getSheetId() { return 154160; },
  getLastColumn() { return oscarRealRpeHeaders.length; },
  getRange() {
    return { getDisplayValues() { return [oscarRealRpeHeaders]; } };
  },
};
assert.equal(
  sandbox.findRpeResponseSheet({
    getSheets() { return [oscarRealRpeSheet]; },
    getActiveSheet() { return oscarRealRpeSheet; },
  }),
  oscarRealRpeSheet,
  'findRpeResponseSheet debe reconocer la hoja por sus cabeceras reales aunque su nombre no contenga RPE.'
);
const samuFromOscarHeader = sandbox.resolvePlayerByFormName(
  [
    ...supabasePlayers,
    {
      id: '1b1906d7-a97c-4184-ad20-17f7a021cbbd',
      name: 'Samuel González',
      shirt_name: 'SAMU',
      google_forms_name: null,
    },
  ],
  oscarRealRpeFields.player.rawValue
);
assert.equal(samuFromOscarHeader?.jugador_id, '1b1906d7-a97c-4184-ad20-17f7a021cbbd');
assert.equal(samuFromOscarHeader?.name, 'Samuel González');
assert.equal(samuFromOscarHeader?.match_rule, 'EXACT_SHIRT_NAME');
const samuOscarHeaderPayload = sandbox.buildDailyRpePayload(
  Object.fromEntries(oscarRealRpeHeaders.map((header, index) => [header, oscarRealRpeRawRow[index]])),
  samuFromOscarHeader.jugador_id,
  'Europe/Madrid',
  null,
  oscarRealRpeFields
);
assert.equal(samuOscarHeaderPayload.entry_date, '2026-08-14');
assert.equal(samuOscarHeaderPayload.rpe, 3);

const targetedRecoveryPlayers = [
  { id: 'faffde7c-33a9-446c-99ce-c76aefba5a0d', name: 'IAGO DELGADO', shirt_name: 'I. DELGADO', google_forms_name: null },
  { id: '4712860e-8578-47b8-8505-5127b16a3231', name: 'Marcos Barroso', shirt_name: 'M.BARROSO', google_forms_name: null },
  { id: 'f742956d-2c46-4334-9c0c-e80d0498c45d', name: 'Roberto Albuquerque', shirt_name: 'ALBUQUERQUE', google_forms_name: null },
  { id: 'b812a22a-2e3d-4a70-9e4c-c78c661db6e8', name: 'Lucas Suárez', shirt_name: 'LUCAS S.', google_forms_name: null },
  { id: 'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7', name: 'Jairo Cárcaba', shirt_name: 'J. CÁRCABA', google_forms_name: null },
  { id: '778c4e89-d806-4b7f-b7e5-072b1269fcb4', name: 'Isma Cerro', shirt_name: 'ISMA CERRO', google_forms_name: null },
  { id: '1b1906d7-a97c-4184-ad20-17f7a021cbbd', name: 'Samuel González', shirt_name: 'SAMU', google_forms_name: null },
];
const targetedRecoveryNames = ['IAGO DELGADO', 'M. BARROSO', 'ALBUQUERQUE', 'LUCAS', 'J. CÁRCABA', 'ISMA CERRO', 'SAMU'];
const targetedRecoveryRpe = [3, 3, 6, 3, 6, 6, 3];
const targetedRecoveryComments = ['', 'Todo bien', 'Nada', '-', 'Buena sesión', 'Bien', 'Sin molestias'];
const targetedRecoveryTimes = [
  '2026-08-14T18:20:44.000Z',
  '2026-08-14T18:22:53.000Z',
  '2026-08-14T18:37:11.000Z',
  '2026-08-14T18:49:33.000Z',
  '2026-08-14T19:03:22.000Z',
  '2026-08-14T19:14:03.000Z',
  '2026-08-14T21:09:56.000Z',
];
const targetedRecoveryRawRows = targetedRecoveryNames.map((name, index) => [
  new Date(targetedRecoveryTimes[index]),
  `${index}@example.com`,
  name,
  targetedRecoveryRpe[index],
  targetedRecoveryComments[index],
  String(index + 1),
  '',
  '',
  '',
  '',
]);
const targetedRecoveryDisplayRows = targetedRecoveryRawRows.map((row, index) => row.map((value, columnIndex) => {
  if (columnIndex === 0) {
    return sandbox.Utilities.formatDate(value, 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss');
  }
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}));
const correctTargetedRecoveryPlan = sandbox.buildRpeRows154to160RecoveryCandidates(
  oscarRealRpeHeaders,
  targetedRecoveryRawRows,
  targetedRecoveryDisplayRows,
  targetedRecoveryPlayers,
  'Europe/Madrid'
);
assert.equal(correctTargetedRecoveryPlan.validation.valid, true, 'Las siete filas reales deben superar toda la validación previa.');
assert.equal(correctTargetedRecoveryPlan.validation.rowsRead, 7);
assert.equal(correctTargetedRecoveryPlan.validation.resolvedPlayers, 7);
assert.equal(correctTargetedRecoveryPlan.validation.uniqueKeys, 7);
assert.deepEqual(
  correctTargetedRecoveryPlan.rows.map((row) => row.entryDate),
  Array(7).fill('2026-08-14')
);
assert.deepEqual(
  correctTargetedRecoveryPlan.rows.map((row) => sandbox.classifyRpeRecoveryAction(row, []).action),
  Array(7).fill('INSERTAR'),
  'Sin filas remotas, el preview debe proponer exactamente siete inserciones.'
);

const wrongDateRecoveryRows = targetedRecoveryRawRows.map((row) => [...row]);
wrongDateRecoveryRows[0][0] = new Date('2026-08-15T18:20:44.000Z');
const wrongDateRecoveryPlan = sandbox.buildRpeRows154to160RecoveryCandidates(
  oscarRealRpeHeaders,
  wrongDateRecoveryRows,
  targetedRecoveryDisplayRows,
  targetedRecoveryPlayers,
  'Europe/Madrid'
);
assert.equal(wrongDateRecoveryPlan.validation.valid, false);
assert.match(wrongDateRecoveryPlan.rows[0].validationError, /Fecha bloqueada/);
assert.equal(sandbox.classifyRpeRecoveryAction(wrongDateRecoveryPlan.rows[0], []).action, 'BLOQUEAR');

const unresolvedRecoveryRows = targetedRecoveryRawRows.map((row) => [...row]);
unresolvedRecoveryRows[1][2] = 'JUGADOR INEXISTENTE';
const unresolvedRecoveryPlan = sandbox.buildRpeRows154to160RecoveryCandidates(
  oscarRealRpeHeaders,
  unresolvedRecoveryRows,
  targetedRecoveryDisplayRows,
  targetedRecoveryPlayers,
  'Europe/Madrid'
);
assert.equal(unresolvedRecoveryPlan.validation.valid, false);
assert.match(unresolvedRecoveryPlan.rows[1].validationError, /Jugador no encontrado/);
assert.equal(sandbox.classifyRpeRecoveryAction(unresolvedRecoveryPlan.rows[1], []).action, 'BLOQUEAR');

const firstRecoveryCandidate = correctTargetedRecoveryPlan.rows[0];
const identicalExistingRecoveryRow = {
  id: 'existing-identical',
  ...firstRecoveryCandidate.payload,
};
assert.equal(
  sandbox.classifyRpeRecoveryAction(firstRecoveryCandidate, [identicalExistingRecoveryRow]).action,
  'SIN_CAMBIOS',
  'Una fila remota idéntica debe conservarse sin escritura.'
);
const conflictingExistingRecoveryRow = { ...identicalExistingRecoveryRow, rpe: 9 };
const conflictingRecoveryAction = sandbox.classifyRpeRecoveryAction(
  firstRecoveryCandidate,
  [conflictingExistingRecoveryRow]
);
assert.equal(conflictingRecoveryAction.action, 'BLOQUEAR');
assert.match(conflictingRecoveryAction.reason, /rpe/);

const recoverySheet = {
  getName() { return 'Respuestas de formulario 1'; },
  getSheetId() { return 1541607; },
  getLastColumn() { return oscarRealRpeHeaders.length; },
  getLastRow() { return 160; },
  getRange(rowNumber, columnNumber, numberOfRows) {
    if (rowNumber === 1) {
      return { getDisplayValues() { return [oscarRealRpeHeaders]; } };
    }
    if (rowNumber === 154 && numberOfRows === 7) {
      return {
        getValues() { return targetedRecoveryRawRows; },
        getDisplayValues() { return targetedRecoveryDisplayRows; },
      };
    }
    if (rowNumber >= 154 && rowNumber <= 160 && numberOfRows === undefined) {
      return {
        setValue(value) {
          targetedRecoveryRawRows[rowNumber - 154][columnNumber - 1] = value;
          targetedRecoveryDisplayRows[rowNumber - 154][columnNumber - 1] = value instanceof Date
            ? value.toISOString()
            : String(value ?? '');
        },
      };
    }
    throw new Error(`Rango de recuperación inesperado: ${rowNumber}, ${columnNumber}, ${numberOfRows}`);
  },
  getParent() { return recoverySpreadsheet; },
};
const recoverySpreadsheet = {
  getSheets() { return [recoverySheet]; },
  getActiveSheet() { return recoverySheet; },
  getSpreadsheetTimeZone() { return 'Europe/Madrid'; },
};
const previousRecoverySpreadsheetGetter = sandbox.SpreadsheetApp.getActiveSpreadsheet;
const previousRecoveryPlayers = supabasePlayers;
sandbox.SpreadsheetApp.getActiveSpreadsheet = () => recoverySpreadsheet;
supabasePlayers = targetedRecoveryPlayers;
recoveryRpeEntries = [];
recoveryInsertCount = 0;
recoveryResponseSequence = 0;
const targetedPreviewResult = sandbox.previewRecoverRpeRows154to160();
assert.equal(targetedPreviewResult.validation.valid, true);
assert.equal(targetedPreviewResult.summary.insert, 7);
assert.equal(targetedPreviewResult.summary.unchanged, 0);
assert.equal(targetedPreviewResult.summary.blocked, 0);
assert.equal(recoveryInsertCount, 0, 'El preview dirigido no debe escribir en Supabase.');
const firstTargetedRecoveryResult = sandbox.recoverRpeRows154to160();
assert.equal(firstTargetedRecoveryResult.summary.inserted, 7);
assert.equal(recoveryRpeEntries.length, 7);
assert.equal(recoveryInsertCount, 7);
const secondTargetedRecoveryResult = sandbox.recoverRpeRows154to160();
assert.equal(secondTargetedRecoveryResult.summary.inserted, 0);
assert.equal(secondTargetedRecoveryResult.summary.unchanged, 7);
assert.equal(recoveryRpeEntries.length, 7);
assert.equal(recoveryInsertCount, 7, 'La segunda ejecución no debe intentar nuevas inserciones.');
assert.deepEqual(
  targetedRecoveryRawRows.map((row) => row[6]),
  Array(7).fill('SYNCED'),
  'Solo las columnas técnicas de 154-160 deben marcarse tras verificar cada fila.'
);
sandbox.SpreadsheetApp.getActiveSpreadsheet = previousRecoverySpreadsheetGetter;
supabasePlayers = previousRecoveryPlayers;
recoveryRpeEntries = null;

[
  'Información personal: (sensaciones, molestias, comentarios, etc.)',
  'Información personal: (sensaciones, molestias, comentarios, etc).',
  'Información personal: (sensaciones, molestias, comentarios, etc.).',
].forEach((commentHeader) => {
  const fields = sandbox.resolveRequiredRpeFields(
    ['Marca temporal', 'Nombre y apellidos.', 'Esfuerzo percibido de la sesión de entrenamiento.', commentHeader],
    ['09/08/2026 12:30:00', 'VIGON', 7, 'Comentario seguro'],
    ['09/08/2026 12:30:00', 'VIGON', '7', 'Comentario seguro']
  );
  assert.equal(fields.comment.found, true, `Debe reconocer la variante final "${commentHeader}".`);
  assert.equal(fields.comment.index, 4);
});

const invisibleRpeHeaders = actualRpeHeaders.map((header) => {
  if (header === 'Nombre y apellidos.') return `  NOMBRE\u200B   Y APELLIDOS...  `;
  if (header === 'Esfuerzo percibido de la sesión de entrenamiento.') {
    return `  ESFUERZO\u2060   PERCIBIDO DE LA SESION DE ENTRENAMIENTO...  `;
  }
  if (header.startsWith('Información personal:')) {
    return `INFORMACION\uFEFF PERSONAL:  (sensaciones, molestias, comentarios, etc.).`;
  }
  return header;
});
const invisibleRpeFields = sandbox.resolveRequiredRpeFields(
  invisibleRpeHeaders,
  actualRpeRawRow,
  actualRpeRawRow
);
assert.equal(invisibleRpeFields.player.index, 3);
assert.equal(invisibleRpeFields.rpe.index, 4);
assert.equal(invisibleRpeFields.comment.index, 5);
assert.equal(
  sandbox.normalizeRpeHeader('ESFUERZO\u200B  PERCIBIDO DE LA SESIÓN DE ENTRENAMIENTO...'),
  sandbox.normalizeRpeHeader('Esfuerzo percibido de la sesión de entrenamiento.'),
  'RPE debe ignorar mayúsculas, tildes, espacios repetidos, Unicode invisible y puntuación terminal.'
);
assert.equal(
  sandbox.resolveRequiredRpeFields(
    ['Marca temporal', 'Nombre y apellidos.', 'Esfuerzo percibido de la sesión'],
  ).rpe.found,
  false,
  'La resolución RPE nunca debe aceptar una coincidencia parcial.'
);

const dropdownNameFields = sandbox.resolveRequiredRpeFields(
  actualRpeHeaders,
  actualRpeRawRow,
  actualRpeRawRow
);
assert.equal(dropdownNameFields.player.rawValue, 'VIGON');
assert.equal(
  sandbox.resolvePlayerByFormName(supabasePlayers, dropdownNameFields.player.rawValue).jugador_id,
  '00000000-0000-0000-0000-000000000001',
  'Respuesta corta o desplegable producen el mismo mapeo mientras la cabecera Nombre y apellidos. no cambie.'
);

const emptyRpeCommentRow = [...actualRpeRawRow];
emptyRpeCommentRow[4] = '';
const emptyRpeCommentFields = sandbox.resolveRequiredRpeFields(
  actualRpeHeaders,
  emptyRpeCommentRow,
  emptyRpeCommentRow
);
assert.equal(emptyRpeCommentFields.comment.state, 'EMPTY_CELL');
assert.equal(
  sandbox.buildDailyRpePayload(
    Object.fromEntries(actualRpeHeaders.map((header, index) => [header, emptyRpeCommentRow[index]])),
    '00000000-0000-0000-0000-000000000001',
    'Europe/Madrid',
    null,
    emptyRpeCommentFields
  ).comment,
  '',
  'Un comentario RPE vacío debe conservarse como cadena vacía.'
);

const missingActualRpeHeaders = actualRpeHeaders.filter((header) => (
  header !== 'Esfuerzo percibido de la sesión de entrenamiento.'
));
const missingActualRpeFields = sandbox.resolveRequiredRpeFields(missingActualRpeHeaders);
assert.equal(missingActualRpeFields.rpe.state, 'COLUMN_NOT_FOUND');
assert.throws(
  () => sandbox.assertRequiredRpeColumns(
    missingActualRpeFields,
    missingActualRpeHeaders,
    'Respuestas RPE'
  ),
  /Faltan: esfuerzo \(Cabecera no encontrada\)\..*Cabeceras detectadas:/,
  'Una cabecera RPE obligatoria ausente debe identificar el campo y enumerar las cabeceras detectadas.'
);

let inspectorWriteCount = 0;
const inspectorSheet = {
  getName() { return 'Respuestas RPE'; },
  getSheetId() { return 77; },
  getLastColumn() { return actualRpeHeaders.length; },
  getRange() {
    return {
      getDisplayValues() { return [actualRpeHeaders]; },
      setValue() { inspectorWriteCount += 1; },
      setValues() { inspectorWriteCount += 1; },
    };
  },
  getParent() {
    return {
      getSpreadsheetTimeZone() { return 'Europe/Madrid'; },
    };
  },
};
const inspectorSpreadsheet = {
  getSheets() { return [inspectorSheet]; },
  getActiveSheet() { return inspectorSheet; },
};
const previousGetActiveSpreadsheet = sandbox.SpreadsheetApp.getActiveSpreadsheet;
sandbox.SpreadsheetApp.getActiveSpreadsheet = () => inspectorSpreadsheet;
const inspectedRpeHeaders = sandbox.inspectRpeHeaders();
sandbox.SpreadsheetApp.getActiveSpreadsheet = previousGetActiveSpreadsheet;
assert.equal(inspectedRpeHeaders.sheet, 'Respuestas RPE');
assert.equal(inspectedRpeHeaders.timeZone, 'Europe/Madrid');
assert.equal(inspectedRpeHeaders.playerHeader, 'Nombre y apellidos.');
assert.equal(inspectedRpeHeaders.rpeHeader, 'Esfuerzo percibido de la sesión de entrenamiento.');
assert.equal(inspectedRpeHeaders.rpeIndex, 4);
assert.equal(inspectedRpeHeaders.commentIndex, 5);
assert.equal(inspectedRpeHeaders.rpeState, 'COLUMN_FOUND');
assert.equal(inspectorWriteCount, 0, 'inspectRpeHeaders debe ser estrictamente de solo lectura.');

const diagnosticHeaders = actualRpeHeaders;
const diagnosticNames = [
  'IAGO DELGADO',
  'M. BARROSO',
  'ALBUQUERQUE',
  'LUCAS',
  'J. CÁRCABA',
  'ISMA CERRO',
  'SAMU',
];
const diagnosticRpeValues = [3, 3, 6, 3, 6, 6, 3];
const diagnosticTimes = [
  '2026-08-14T18:20:44.000Z',
  '2026-08-14T18:22:53.000Z',
  '2026-08-14T18:37:11.000Z',
  '2026-08-14T18:49:33.000Z',
  '2026-08-14T19:03:22.000Z',
  '2026-08-14T19:14:03.000Z',
  '2026-08-14T21:09:56.000Z',
];
const diagnosticStatuses = ['SYNCED', 'ERROR', '', '', '', '', ''];
const diagnosticRawRows = diagnosticNames.map((name, index) => [
  new Date(diagnosticTimes[index]),
  `${index}@example.com`,
  name,
  diagnosticRpeValues[index],
  index === 1 ? 'Error de prueba' : '',
  String(index + 1),
  diagnosticStatuses[index],
  '',
  index === 1 ? 'Supabase error de prueba' : '',
  index === 0 ? new Date('2026-08-14T18:21:00.000Z') : '',
]);
const diagnosticDisplayRows = diagnosticRawRows.map((row, index) => row.map((value, columnIndex) => {
  if (columnIndex === 0) return `14/08/2026 ${['20:20:44', '20:22:53', '20:37:11', '20:49:33', '21:03:22', '21:14:03', '23:09:56'][index]}`;
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}));
let diagnosticWriteCount = 0;
const diagnosticSheet = {
  getName() { return 'Respuestas RPE'; },
  getSheetId() { return 154160; },
  getLastColumn() { return diagnosticHeaders.length; },
  getLastRow() { return 160; },
  getRange(rowNumber) {
    if (rowNumber === 1) {
      return {
        getDisplayValues() { return [diagnosticHeaders]; },
        setValue() { diagnosticWriteCount += 1; },
        setValues() { diagnosticWriteCount += 1; },
      };
    }
    if (rowNumber === 154) {
      return {
        getValues() { return diagnosticRawRows; },
        getDisplayValues() { return diagnosticDisplayRows; },
        setValue() { diagnosticWriteCount += 1; },
        setValues() { diagnosticWriteCount += 1; },
      };
    }
    throw new Error(`Rango de diagnóstico inesperado: ${rowNumber}`);
  },
  getParent() { return diagnosticSpreadsheet; },
};
const diagnosticSpreadsheet = {
  getSheets() { return [diagnosticSheet]; },
  getActiveSheet() { return diagnosticSheet; },
  getSpreadsheetTimeZone() { return 'Europe/Madrid'; },
};
const previousDiagnosticSpreadsheetGetter = sandbox.SpreadsheetApp.getActiveSpreadsheet;
sandbox.SpreadsheetApp.getActiveSpreadsheet = () => diagnosticSpreadsheet;
const fetchCountBeforeDiagnostic = requestedFetches.length;
const diagnosticResult = sandbox.diagnoseRpeRows154to160();
sandbox.SpreadsheetApp.getActiveSpreadsheet = previousDiagnosticSpreadsheetGetter;
assert.equal(diagnosticResult.sheet, 'Respuestas RPE');
assert.equal(diagnosticResult.rows.length, 7);
assert.equal(diagnosticResult.rows[0].row, 154);
assert.equal(diagnosticResult.rows[6].row, 160);
assert.equal(diagnosticResult.rows[0].timestampEuropeMadrid, '2026-08-14 20:20:44');
assert.equal(diagnosticResult.rows[6].timestampEuropeMadrid, '2026-08-14 23:09:56');
assert.equal(diagnosticResult.rows[1].receivedName, 'M. BARROSO');
assert.equal(diagnosticResult.rows[1].resolvedPlayerId, '4712860e-8578-47b8-8505-5127b16a3231');
assert.equal(diagnosticResult.rows[5].resolvedPlayerId, '778c4e89-d806-4b7f-b7e5-072b1269fcb4');
assert.equal(diagnosticResult.summary.synced, 1);
assert.equal(diagnosticResult.summary.errors, 1);
assert.equal(diagnosticResult.summary.noStatus, 5);
assert.equal(diagnosticResult.summary.resolvedPlayers, 7);
assert.equal(diagnosticResult.summary.unresolvedPlayers, 0);
assert.equal(diagnosticWriteCount, 0, 'El diagnóstico RPE no debe modificar ninguna celda.');
assert.equal(
  requestedFetches.length,
  fetchCountBeforeDiagnostic,
  'El diagnóstico RPE no debe ejecutar UrlFetchApp ni consultar Supabase.'
);

const diagnosticHeadersWithoutTechnicalColumns = diagnosticHeaders.slice(0, 6);
const diagnosticRowsWithoutTechnicalColumns = diagnosticRawRows.map((row) => row.slice(0, 6));
const diagnosticDisplayRowsWithoutTechnicalColumns = diagnosticDisplayRows.map((row) => row.slice(0, 6));
const diagnosticSheetWithoutTechnicalColumns = {
  getName() { return 'Respuestas RPE sin columnas técnicas'; },
  getSheetId() { return 154161; },
  getLastColumn() { return diagnosticHeadersWithoutTechnicalColumns.length; },
  getLastRow() { return 160; },
  getRange(rowNumber) {
    if (rowNumber === 1) {
      return { getDisplayValues() { return [diagnosticHeadersWithoutTechnicalColumns]; } };
    }
    if (rowNumber === 154) {
      return {
        getValues() { return diagnosticRowsWithoutTechnicalColumns; },
        getDisplayValues() { return diagnosticDisplayRowsWithoutTechnicalColumns; },
      };
    }
    throw new Error(`Rango de diagnóstico sin técnicas inesperado: ${rowNumber}`);
  },
  getParent() { return diagnosticSpreadsheetWithoutTechnicalColumns; },
};
const diagnosticSpreadsheetWithoutTechnicalColumns = {
  getSheets() { return [diagnosticSheetWithoutTechnicalColumns]; },
  getActiveSheet() { return diagnosticSheetWithoutTechnicalColumns; },
  getSpreadsheetTimeZone() { return 'Europe/Madrid'; },
};
sandbox.SpreadsheetApp.getActiveSpreadsheet = () => diagnosticSpreadsheetWithoutTechnicalColumns;
const fetchCountBeforeMissingTechnicalDiagnostic = requestedFetches.length;
const missingTechnicalDiagnostic = sandbox.diagnoseRpeRows154to160();
sandbox.SpreadsheetApp.getActiveSpreadsheet = previousDiagnosticSpreadsheetGetter;
assert.equal(missingTechnicalDiagnostic.technicalProblems.length, 4);
assert.equal(missingTechnicalDiagnostic.summary.noStatus, 7);
assert.equal(
  requestedFetches.length,
  fetchCountBeforeMissingTechnicalDiagnostic,
  'El diagnóstico sin columnas técnicas tampoco debe consultar Supabase.'
);

const blockingHeaders = missingActualRpeHeaders;
const blockingRawRow = blockingHeaders.map((header) => {
  if (header === 'Marca temporal') return new Date('2026-08-09T10:30:00.000Z');
  if (header === 'Nombre y apellidos.') return 'VIGON';
  if (header.startsWith('Información personal:')) return 'No debe enviarse';
  return '';
});
const blockingSheet = {
  getName() { return 'Respuestas RPE'; },
  getLastColumn() { return blockingHeaders.length; },
  getRange(rowNumber) {
    if (rowNumber === 1) {
      return { getDisplayValues() { return [blockingHeaders]; } };
    }
    if (rowNumber === 2) {
      return {
        getValues() { return [blockingRawRow]; },
        getDisplayValues() { return [blockingRawRow]; },
        setValue() {},
      };
    }
    return { setValue() {} };
  },
  hideColumns() {},
  getParent() {
    return { getSpreadsheetTimeZone() { return 'Europe/Madrid'; } };
  },
};
const fetchCountBeforeBlockedSubmit = requestedFetches.length;
assert.throws(
  () => sandbox.onRpeSubmit({
    range: {
      getSheet() { return blockingSheet; },
      getRow() { return 2; },
    },
  }),
  /Faltan: esfuerzo \(Cabecera no encontrada\)\./,
  'onRpeSubmit debe abortar cuando falta la cabecera obligatoria de esfuerzo.'
);
assert.equal(
  requestedFetches.length,
  fetchCountBeforeBlockedSubmit,
  'Si falta RPE, onRpeSubmit no debe consultar jugadores ni enviar ningún payload a Supabase.'
);

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

const wellnessPayloadForDay = (entryDate, overrides = {}) => ({
  jugador_id: 'player-acerete',
  entry_date: entryDate,
  sleep_hours: 8,
  sleep_quality: 8,
  fatigue: 4,
  muscle_soreness: 3,
  stress: 2,
  mood: 8,
  weight: 80.4,
  discomfort: 'Cuádriceps derecho',
  comment: 'Bastante cargado de la semana',
  health_ratio: 8.5,
  ...overrides,
});
const wellnessGroupForDay = (entryDate, timestamp, overrides = {}) => ({
  payload: wellnessPayloadForDay(entryDate, overrides),
  rowNumbers: [2],
  rowDetails: [{
    rowNumber: 2,
    receivedName: 'Acerete',
    receivedDate: timestamp,
    receivedTimestamp: timestamp,
    submittedAt: timestamp,
    responseId: '',
    matchedPlayerName: 'CRISTIAN ACERETE',
    matchRule: 'EXACT_SHIRT_NAME',
  }],
});
const shiftedHistoryPlan = {
  groups: [wellnessGroupForDay('2026-07-30', '2026-07-30T10:00:00.000Z')],
  failures: [],
  skipped: 0,
  duplicatesMerged: 0,
};
const shiftedExistingRow = {
  id: 'wellness-shifted',
  ...wellnessPayloadForDay('2026-07-29'),
  created_at: '2026-07-30T10:02:00.000Z',
};
const shiftedCorrection = sandbox.buildWellnessHistoryReconciliationPlan(
  shiftedHistoryPlan,
  [shiftedExistingRow]
);
assert.equal(
  shiftedCorrection.actions[0].action,
  'CORREGIR_FECHA',
  'Una respuesta inequívocamente desplazada debe actualizar la fila existente.'
);
assert.equal(shiftedCorrection.actions[0].existingId, 'wellness-shifted');
assert.equal(shiftedCorrection.actions[0].correctDate, '2026-07-30');

const repeatedCorrection = sandbox.buildWellnessHistoryReconciliationPlan(
  shiftedHistoryPlan,
  [{
    ...shiftedExistingRow,
    entry_date: '2026-07-30',
  }]
);
assert.equal(
  repeatedCorrection.actions[0].action,
  'SIN_CAMBIOS',
  'Tras corregir la fecha, repetir la operación debe ser idempotente.'
);

const july31Correction = sandbox.buildWellnessHistoryReconciliationPlan(
  {
    ...shiftedHistoryPlan,
    groups: [wellnessGroupForDay('2026-07-31', '2026-07-31T08:34:58.000Z')],
  },
  [{
    id: 'wellness-july-31-shifted',
    ...wellnessPayloadForDay('2026-07-30'),
    created_at: '2026-07-31T08:35:30.000Z',
  }]
);
assert.equal(july31Correction.actions[0].action, 'CORREGIR_FECHA');
assert.equal(july31Correction.actions[0].correctDate, '2026-07-31');

const sameDateUpdate = sandbox.buildWellnessHistoryReconciliationPlan(
  shiftedHistoryPlan,
  [{
    ...shiftedExistingRow,
    entry_date: '2026-07-30',
    fatigue: 7,
  }]
);
assert.equal(
  sameDateUpdate.actions[0].action,
  'ACTUALIZAR',
  'Una clave diaria existente con datos distintos debe actualizarse, no insertarse.'
);

const twoRealDaysPlan = {
  groups: [
    wellnessGroupForDay('2026-07-29', '2026-07-29T10:00:00.000Z'),
    {
      ...wellnessGroupForDay('2026-07-30', '2026-07-30T10:00:00.000Z'),
      rowNumbers: [3],
      rowDetails: [{
        ...wellnessGroupForDay('2026-07-30', '2026-07-30T10:00:00.000Z').rowDetails[0],
        rowNumber: 3,
      }],
    },
  ],
  failures: [],
  skipped: 0,
  duplicatesMerged: 0,
};
const twoRealDays = sandbox.buildWellnessHistoryReconciliationPlan(
  twoRealDaysPlan,
  [shiftedExistingRow]
);
assert.equal(twoRealDays.actions[0].action, 'SIN_CAMBIOS');
assert.equal(
  twoRealDays.actions[1].action,
  'INSERTAR',
  'La misma observación en dos días reales distintos debe conservar ambas fechas.'
);

const doubtfulShift = sandbox.buildWellnessHistoryReconciliationPlan(
  shiftedHistoryPlan,
  [{
    ...shiftedExistingRow,
    created_at: '2026-08-15T10:00:00.000Z',
  }]
);
assert.equal(
  doubtfulShift.actions[0].action,
  'REVISAR_MANUALMENTE',
  'Un created_at de importación lejano no autoriza a mover una fila.'
);
const sameCommentOnly = sandbox.buildWellnessHistoryReconciliationPlan(
  shiftedHistoryPlan,
  [{
    id: 'wellness-same-comment-only',
    ...wellnessPayloadForDay('2026-07-29', {
      sleep_quality: 2,
      fatigue: 9,
      muscle_soreness: 9,
      stress: 9,
      mood: 2,
      weight: 70,
      health_ratio: 2,
      discomfort: '',
    }),
    created_at: '2026-07-30T10:01:00.000Z',
  }]
);
assert.equal(
  sameCommentOnly.actions[0].action,
  'INSERTAR',
  'Compartir únicamente el comentario no convierte dos respuestas en duplicadas.'
);
const correctionSummary = sandbox.summarizeWellnessReconciliation(
  [
    ...shiftedCorrection.actions,
    ...twoRealDays.actions,
    ...doubtfulShift.actions,
  ],
  4,
  { skipped: 0, failures: [] }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(correctionSummary)),
  {
    rows: 4,
    insert: 1,
    update: 0,
    correct: 1,
    unchanged: 1,
    deleteOld: 0,
    review: 1,
    skipped: 0,
    errors: 0,
  },
  'La previsualización debe informar cada clase de resultado.'
);

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

const currentWellnessHeaders = [
  'Marca temporal',
  'Nombre y apellidos.',
  '¿Cuál tu peso hoy?.',
  '¿Qué tal dormiste anoche?',
  'Calidad del sueño',
  '¿Cuánto te duelen los músculos hoy?',
  'Daño muscular',
  'Especificar la molestia en caso de tener alguna.',
  '¿Cómo de fatigado estás hoy?',
  '¿Cómo de estresado estás hoy?',
  'Estado de ánimo.',
  'Información personal: (molestias, comentarios, etc.).',
  'Ratio salud',
];
const borjaRawRow = [
  '31/07/2026 08:34:58',
  'Borja Rodríguez',
  80.4,
  'Bien',
  8,
  'Nada',
  1,
  'Cuádriceps derecho',
  2,
  5,
  7,
  'Todo bien',
  8.5,
];
const borjaDisplayRow = borjaRawRow.map(String);
const currentWellnessFields = sandbox.resolveRequiredWellnessFields(
  currentWellnessHeaders,
  borjaRawRow,
  borjaDisplayRow
);
assert.deepEqual(
  JSON.parse(JSON.stringify({
    sleep: {
      found: currentWellnessFields.sleep_quality.found,
      index: currentWellnessFields.sleep_quality.index,
      header: currentWellnessFields.sleep_quality.header,
      rawValue: currentWellnessFields.sleep_quality.rawValue,
      displayValue: currentWellnessFields.sleep_quality.displayValue,
    },
    discomfort: {
      found: currentWellnessFields.discomfort.found,
      index: currentWellnessFields.discomfort.index,
      header: currentWellnessFields.discomfort.header,
      rawValue: currentWellnessFields.discomfort.rawValue,
      displayValue: currentWellnessFields.discomfort.displayValue,
    },
    comment: {
      found: currentWellnessFields.comment.found,
      index: currentWellnessFields.comment.index,
      header: currentWellnessFields.comment.header,
      rawValue: currentWellnessFields.comment.rawValue,
      displayValue: currentWellnessFields.comment.displayValue,
    },
  })),
  {
    sleep: {
      found: true,
      index: 5,
      header: 'Calidad del sueño',
      rawValue: 8,
      displayValue: '8',
    },
    discomfort: {
      found: true,
      index: 8,
      header: 'Especificar la molestia en caso de tener alguna.',
      rawValue: 'Cuádriceps derecho',
      displayValue: 'Cuádriceps derecho',
    },
    comment: {
      found: true,
      index: 12,
      header: 'Información personal: (molestias, comentarios, etc.).',
      rawValue: 'Todo bien',
      displayValue: 'Todo bien',
    },
  },
  'La estructura actual de Wellness debe resolver los tres índices 1-based sin mezclar campos.'
);
const borjaPayload = sandbox.buildWellnessPayload(
  Object.fromEntries(currentWellnessHeaders.map((header, index) => [header, borjaRawRow[index]])),
  'player-borja',
  'Europe/Madrid',
  currentWellnessFields
);
assert.equal(borjaPayload.entry_date, '2026-07-31');
assert.equal(borjaPayload.sleep_quality, 8);
assert.equal(borjaPayload.discomfort, 'Cuádriceps derecho');
assert.equal(borjaPayload.comment, 'Todo bien');

const actualBorjaCommentHeader = 'Información personal: (molestias, comentarios, etc).';
const actualBorjaHeaders = currentWellnessHeaders.map((header) => (
  header.startsWith('Información personal') ? actualBorjaCommentHeader : header
));
const actualBorjaFields = sandbox.resolveRequiredWellnessFields(
  actualBorjaHeaders,
  borjaRawRow,
  borjaDisplayRow
);
assert.equal(actualBorjaFields.comment.found, true);
assert.equal(actualBorjaFields.comment.index, 12);
assert.equal(actualBorjaFields.comment.header, actualBorjaCommentHeader);
assert.equal(actualBorjaFields.comment.rawValue, 'Todo bien');
assert.equal(actualBorjaFields.comment.displayValue, 'Todo bien');
assert.equal(
  sandbox.buildWellnessPayload(
    Object.fromEntries(actualBorjaHeaders.map((header, index) => [header, borjaRawRow[index]])),
    'player-borja',
    'Europe/Madrid',
    actualBorjaFields
  ).comment,
  'Todo bien',
  'La cabecera real etc). debe incluir el comentario general en el payload.'
);
[
  'Información personal: (molestias, comentarios, etc).',
  'Información personal: (molestias, comentarios, etc.).',
  'Información personal: (molestias, comentarios, etc)',
  'Información personal: (molestias, comentarios, etc.',
].forEach((header) => {
  assert.equal(
    sandbox.normalizeWellnessHeader(header),
    sandbox.normalizeWellnessHeader(actualBorjaCommentHeader),
    `La variante ${header} debe ser equivalente solo por su puntuación terminal.`
  );
});

const invisibleWellnessHeaders = currentWellnessHeaders.map((header) => {
  if (header === 'Calidad del sueño') return '  CALIDAD\u200B DEL   SUEÑO...  ';
  if (header.startsWith('Especificar la molestia')) {
    return '\uFEFFEspecificar la molestia en caso de tener alguna...';
  }
  if (header.startsWith('Información personal')) {
    return 'Información personal: (molestias, comentarios, etc.).\u2060';
  }
  return header;
});
const invisibleFields = sandbox.resolveRequiredWellnessFields(
  invisibleWellnessHeaders,
  borjaRawRow,
  borjaDisplayRow
);
assert.equal(invisibleFields.sleep_quality.index, 5);
assert.equal(invisibleFields.discomfort.index, 8);
assert.equal(invisibleFields.comment.index, 12);
assert.equal(
  sandbox.normalizeWellnessHeader('CALIDAD\u200B DEL SUEÑO...'),
  sandbox.normalizeWellnessHeader('Calidad del sueño'),
  'La normalización debe ignorar invisibles, tildes, mayúsculas y puntuación terminal.'
);

const emptyRequiredFields = sandbox.resolveRequiredWellnessFields(
  currentWellnessHeaders,
  borjaRawRow.map((value, index) => ([4, 7, 11].includes(index) ? '' : value)),
  borjaDisplayRow.map((value, index) => ([4, 7, 11].includes(index) ? '' : value))
);
assert.equal(emptyRequiredFields.sleep_quality.found, true);
assert.equal(emptyRequiredFields.sleep_quality.state, 'EMPTY_CELL');
assert.equal(emptyRequiredFields.discomfort.state, 'EMPTY_CELL');
assert.equal(emptyRequiredFields.comment.state, 'EMPTY_CELL');
const emptyPayload = sandbox.buildWellnessPayload(
  Object.fromEntries(currentWellnessHeaders.map((header, index) => [
    header,
    [4, 7, 11].includes(index) ? '' : borjaRawRow[index],
  ])),
  'player-borja',
  'Europe/Madrid',
  emptyRequiredFields
);
assert.equal(emptyPayload.sleep_quality, null);
assert.equal(emptyPayload.discomfort, '');
assert.equal(emptyPayload.comment, '');

const missingCommentHeaders = currentWellnessHeaders.filter((header) =>
  !header.startsWith('Información personal')
);
const missingCommentFields = sandbox.resolveRequiredWellnessFields(missingCommentHeaders);
assert.equal(missingCommentFields.comment.found, false);
assert.equal(missingCommentFields.comment.state, 'COLUMN_NOT_FOUND');
assert.throws(
  () => sandbox.assertRequiredWellnessColumns(
    missingCommentFields,
    missingCommentHeaders,
    'Respuestas Wellness'
  ),
  /Importación Wellness bloqueada.*comment.*Cabeceras detectadas/,
  'Una cabecera ausente debe detener todo el flujo antes de construir un payload parcial.'
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

const wellnessTextMapping = sandbox.buildWellnessPayload({
  'Marca temporal': '30/07/2026 11:59:25',
  'Especificar la molestia en caso de tener alguna': 'Isquio derecho',
  'Información personal: (molestias, comentarios)': 'Bastante cargado de la semana',
}, 'player-acerete', 'Europe/Madrid');
assert.equal(wellnessTextMapping.discomfort, 'Isquio derecho');
assert.equal(wellnessTextMapping.comment, 'Bastante cargado de la semana');
assert.equal(
  'submitted_at' in wellnessTextMapping,
  false,
  'Wellness no debe inventar una columna submitted_at que no existe en su esquema.'
);

assert.equal(
  sandbox.findWellnessWeightColumnIndex(['Fecha', 'Nombre y apellidos.', '¿Cuál tu peso hoy?', 'Ratio salud']),
  3,
  'El detector debe devolver el índice 1-based de la cabecera real de peso.'
);
assert.equal(
  sandbox.findWellnessWeightColumnIndex(['Fecha', 'Nombre y apellidos.', '¿Cuál tu peso hoy?.', 'Ratio salud']),
  3,
  'Debe detectar explícitamente la cabecera real de peso con punto después del interrogante.'
);
assert.equal(
  sandbox.normalizeWellnessWeightHeader('  ¿CUÁL TU PESO HOY?.  '),
  sandbox.normalizeWellnessWeightHeader('¿Cuál tu peso hoy?'),
  'La normalización debe ignorar espacios, mayúsculas, tildes y puntuación terminal.'
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
const onWellnessSubmitSource = source.slice(
  source.indexOf('function onWellnessSubmit'),
  source.indexOf('function onRpeSubmit')
);
const onRpeSubmitSource = source.slice(
  source.indexOf('function onRpeSubmit'),
  source.indexOf('function importAllWellnessHistory')
);
assert.match(onWellnessSubmitSource, /findPlayerIdByFormName\(playerName\)/, 'Wellness usa el resolver compartido sin una excepción local.');
assert.match(onRpeSubmitSource, /findPlayerIdByFormName\(playerName\)/, 'RPE usa el mismo resolver compartido.');
assert.doesNotMatch(source, /RPE_HISTORICAL_PLAYER_ALIASES|EXACT_RPE_HISTORICAL_ALIAS/);
const importRpeSource = source.slice(
  source.indexOf('function importAllRpeHistory'),
  source.indexOf('const RPE_RECOVERY_FIRST_ROW')
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
assert.match(source, /function previewWellnessHistoryCorrection\(\)/, 'Debe existir una previsualización de solo lectura.');
assert.match(source, /buildWellnessHistoryReconciliationPlan\(/, 'El histórico debe reconciliar fechas antes del upsert.');
assert.match(source, /updateSupabaseById\('wellness_entries', action\.existingId, action\.payload\)/, 'La corrección inequívoca debe mover la fila existente por id.');
assert.match(source, /upsertSupabase\('wellness_entries', action\.payload, 'jugador_id,entry_date'\)/, 'Insertados y actualizados deben conservar la clave diaria.');
const wellnessImportSource = source.slice(
  source.indexOf('function importAllWellnessHistory'),
  source.indexOf('function importAllRpeHistory')
);
const wellnessPreviewSource = source.slice(
  source.indexOf('function previewWellnessHistoryCorrection'),
  source.indexOf('function selectWellnessHistoryRowsByPlayerAndDate')
);
const targetedWellnessPreviewSource = source.slice(
  source.indexOf('function previewJulioRguezWellness20260813'),
  source.indexOf('function recoverJulioRguezWellness20260813')
);
const targetedWellnessRecoverySource = source.slice(
  source.indexOf('function recoverJulioRguezWellness20260813'),
  source.indexOf('function importAllRpeHistory')
);
const wellnessInspectorSource = source.slice(
  source.indexOf('function inspectWellnessRowByPlayerAndDate'),
  source.indexOf('function findRpeResponseSheet')
);
const julioRpeInspectorSource = source.slice(
  source.indexOf('function inspectJulioRpeHistory'),
  source.indexOf('function buildRpeHistoricalAliasPreview')
);
assert.doesNotMatch(
  wellnessImportSource,
  /deleteSupabase\(/,
  'La importación Wellness nunca debe borrar automáticamente una fila antigua.'
);
assert.doesNotMatch(
  wellnessPreviewSource,
  /upsertSupabase\(|updateSupabaseById\(|deleteSupabase\(|setValues\(|setValue\(/,
  'La previsualización Wellness debe ser estrictamente de solo lectura.'
);
assert.doesNotMatch(
  targetedWellnessPreviewSource,
  /upsertSupabase\(|updateSupabaseById\(|deleteSupabase\(|setValues\(|setValue\(|ensureTechnicalColumns\(/,
  'La previsualización puntual de Julio debe ser estrictamente de solo lectura.'
);
assert.match(targetedWellnessRecoverySource, /\['INSERTAR', 'SIN_CAMBIOS'\]\.includes\(action\.action\)/);
assert.match(targetedWellnessRecoverySource, /upsertSupabase\('wellness_entries', action\.payload, 'jugador_id,entry_date'\)/);
assert.doesNotMatch(targetedWellnessRecoverySource, /importAllWellnessHistory\(|deleteSupabase\(|updateSupabaseById\(/);
assert.doesNotMatch(
  wellnessInspectorSource,
  /supabaseFetch\(|fetchPlayersForForms\(|upsertSupabase\(|updateSupabaseById\(|deleteSupabase\(|setValues\(|setValue\(|ensureTechnicalColumns\(/,
  'El inspector de Borja no debe escribir ni realizar requests a Supabase.'
);
assert.doesNotMatch(
  julioRpeInspectorSource,
  /upsertSupabase\(|updateSupabaseById\(|deleteSupabase\(|setValues\(|setValue\(|ensureTechnicalColumns\(/,
  'El inspector RPE de Julio debe ser de solo lectura.'
);
assert.match(
  wellnessInspectorSource,
  /let payloadError = null;/,
  'Una fila válida inspeccionada debe devolver payloadError: null.'
);
assert.ok(
  wellnessImportSource.indexOf('assertRequiredWellnessColumns(')
    < wellnessImportSource.indexOf('fetchPlayersForForms()'),
  'La importación debe validar las cabeceras antes de cualquier request de jugadores.'
);
assert.ok(
  wellnessImportSource.indexOf('assertRequiredWellnessColumns(')
    < wellnessImportSource.indexOf("upsertSupabase('wellness_entries'"),
  'Ningún upsert puede ejecutarse antes de validar todas las columnas obligatorias.'
);
assert.doesNotMatch(
  wellnessHistoryAuditSource,
  /\b(insert|update|delete|alter|drop|truncate|create)\b/i,
  'El SQL de auditoría Wellness debe contener únicamente consultas de solo lectura.'
);
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
assert.match(performanceUiSource, /Navegación del microciclo/);
assert.match(performanceUiSource, /RPE \{day\.avgRpe/);
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

console.log('Google Forms -> Supabase: reconciliación Wellness segura e idempotente, zona horaria y RPE diario validados.');
