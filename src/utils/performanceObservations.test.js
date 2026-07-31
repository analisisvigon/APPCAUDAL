import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildPerformanceObservations,
  buildPerformanceObservationsByPlayer,
  formatPerformanceObservationDate,
  getPerformanceObservationView,
  hasPhysicalPerformanceObservation,
  normalizePerformanceCalendarDate,
} from './performanceObservations.js';

const REFERENCE_DATE = '2026-07-31';
const build = ({ wellnessEntries = [], rpeEntries = [], playerId = 'player-1' } = {}) => (
  buildPerformanceObservations({
    wellnessEntries,
    rpeEntries,
    playerId,
    referenceDate: REFERENCE_DATE,
  })
);

assert.equal(normalizePerformanceCalendarDate('2026-07-30'), '2026-07-30');
assert.equal(
  normalizePerformanceCalendarDate('2026-07-31T08:34:58'),
  '2026-07-31',
  'un timestamp sin zona conserva su fecha de calendario'
);
assert.equal(
  formatPerformanceObservationDate('2026-07-30', '2026-08-03'),
  '30/07',
  'una fecha date no atraviesa UTC ni puede retroceder al día anterior'
);

const acereteWellness = build({
  playerId: 'acerete',
  wellnessEntries: [{
    jugador_id: 'acerete',
    entry_date: '2026-07-30',
    comment: 'Cuádriceps derecho',
    created_at: '2026-07-30T10:00:00Z',
  }],
});
assert.equal(acereteWellness[0].label, 'Wellness · Ayer · Cuádriceps derecho');
assert.equal(acereteWellness[0].date, '2026-07-30');
assert.equal(acereteWellness[0].sourceTable, 'wellness_entries');
assert.equal(acereteWellness[0].sourceType, 'wellness_comment');
assert.equal(acereteWellness[0].sourceField, 'comment');
assert.equal(acereteWellness[0].playerId, 'acerete');
assert.notEqual(acereteWellness[0].sourceLabel, 'RPE');

const marcosLatestWellness = build({
  playerId: 'marcos',
  wellnessEntries: [
    {
      jugador_id: 'marcos',
      entry_date: '2026-07-29',
      comment: 'Comentario anterior',
    },
    {
      jugador_id: 'marcos',
      entry_date: '2026-07-30',
      comment: 'Bastante cargado de la semana',
    },
  ],
});
assert.equal(marcosLatestWellness[0].text, 'Bastante cargado de la semana');
assert.equal(marcosLatestWellness[0].date, '2026-07-30');

const july31 = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31T08:34:58',
    comment: 'Respuesta del 31',
  }],
});
assert.equal(july31[0].date, '2026-07-31');
assert.equal(july31[0].dateLabel, 'Hoy');

const previousRpeWithoutWellnessToday = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    sleep_quality: 8,
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-29',
    comment: 'Sesión muy exigente',
  }],
});
assert.equal(previousRpeWithoutWellnessToday[0].label, 'RPE · 29/07 · Sesión muy exigente');

const previousWellnessWithoutRpeToday = build({
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    rpe: 7,
  }],
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-28',
    comment: 'Dormí mal',
  }],
});
assert.equal(previousWellnessWithoutRpeToday[0].label, 'Wellness · 28/07 · Dormí mal');

const historicalOnly = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2025-11-12',
    discomfort: 'Gemelo derecho',
  }],
});
assert.equal(historicalOnly[0].text, 'Gemelo derecho', 'no existe ninguna ventana temporal');
assert.equal(historicalOnly[0].date, '2025-11-12');

const latestRpeWins = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-28',
    discomfort: 'Cuádriceps derecho',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-29',
    comment: 'Sesión muy exigente',
  }],
});
assert.equal(latestRpeWins[0].sourceLabel, 'RPE');
assert.equal(latestRpeWins[0].date, '2026-07-29');
assert.equal(
  latestRpeWins[1].sourceLabel,
  'Molestia',
  'una molestia antigua no supera a un RPE más reciente'
);

const sameDatePriority = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    discomfort: 'Cuádriceps derecho',
    comment: 'Dormí regular',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    comment: 'Sesión muy exigente',
  }],
});
assert.deepEqual(
  sameDatePriority.map((item) => item.sourceLabel),
  ['Molestia', 'RPE', 'Wellness'],
  'la prioridad solo resuelve observaciones de la misma fecha'
);
assert.deepEqual(
  sameDatePriority.map((item) => item.priority),
  [1, 2, 3]
);
assert.deepEqual(
  sameDatePriority.map((item) => [item.sourceTable, item.sourceType, item.sourceField]),
  [
    ['wellness_entries', 'discomfort', 'discomfort'],
    ['rpe_entries', 'rpe_comment', 'comment'],
    ['wellness_entries', 'wellness_comment', 'comment'],
  ],
  'cada texto conserva la tabla, el tipo y el campo exactos de origen'
);

const sameDateRealTime = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    submitted_at: '2026-07-30T09:00:00+02:00',
    discomfort: 'Molestia temprana',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    submitted_at: '2026-07-30T18:00:00+02:00',
    comment: 'RPE posterior',
  }],
});
assert.deepEqual(
  sameDateRealTime.map((item) => item.text),
  ['RPE posterior', 'Molestia temprana'],
  'la hora fiable prevalece sobre la prioridad de tipo el mismo día'
);
assert.equal(sameDateRealTime[0].timestampReliable, true);
assert.equal(sameDateRealTime[0].timestampField, 'submitted_at');

const unreliableWellnessTimeUsesPriority = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    created_at: '2026-08-02T12:00:00Z',
    discomfort: 'Molestia importada',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    submitted_at: '2026-07-30T18:00:00+02:00',
    comment: 'RPE con hora real',
  }],
});
assert.equal(
  unreliableWellnessTimeUsesPriority[0].sourceLabel,
  'Molestia',
  'created_at no se confunde con la hora real de una respuesta histórica Wellness'
);

const rpeBeatsWellnessOnSameDate = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    comment: 'Dormí regular',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    comment: 'Sesión exigente',
  }],
});
assert.deepEqual(
  rpeBeatsWellnessOnSameDate.map((item) => item.sourceLabel),
  ['RPE', 'Wellness']
);

const originalDates = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Todo bien',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    comment: 'Carga alta',
  }],
});
assert.equal(originalDates[0].label, 'Wellness · Hoy · Todo bien');
assert.equal(originalDates[1].label, 'RPE · Ayer · Carga alta');

const visible = getPerformanceObservationView(sameDatePriority, 2);
assert.equal(visible.items.length, 2, 'solo se muestran dos observaciones');
assert.equal(visible.hiddenCount, 1);
assert.equal(visible.moreLabel, '+1 más');
assert.ok(visible.fullText.includes('Wellness · Ayer · Dormí regular'));
assert.equal(visible.recordLabel, '3 registros');
assert.equal(visible.sourceSummary, '1 Wellness · 1 RPE · 1 Molestia');
assert.deepEqual(visible.sourceCounts, { Wellness: 1, RPE: 1, Molestia: 1 });
assert.equal(hasPhysicalPerformanceObservation('Sobrecarga en cuádriceps derecho'), true);
assert.equal(hasPhysicalPerformanceObservation('Irritación del tendón de Aquiles'), true);
assert.equal(hasPhysicalPerformanceObservation('Todo bien'), false);

const deduplicated = build({
  wellnessEntries: [
    {
      jugador_id: 'player-1',
      entry_date: '2026-07-31',
      comment: '  SESIÓN   EXIGENTE. ',
    },
    {
      jugador_id: 'player-1',
      entry_date: '2026-07-28',
      discomfort: 'Sesión exigente!',
    },
  ],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-29',
    comment: 'Sesión exigente',
  }],
});
assert.equal(deduplicated.length, 1, 'los duplicados exactos se eliminan tras normalizar');
assert.equal(deduplicated[0].date, '2026-07-31', 'la deduplicación conserva la observación más reciente');

const emptyValues = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    discomfort: 'Sin molestias',
    comment: '—',
    fatigue: 9,
    sleep_quality: 2,
    stress: 8,
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Ninguna',
    rpe: 10,
  }],
});
assert.deepEqual(emptyValues, [], 'ignora vacíos y nunca genera comentarios desde valores numéricos');

const moreEmptyValues = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    discomfort: 'No tengo molestias',
    comment: '.',
  }],
});
assert.deepEqual(moreEmptyValues, [], 'ignora punto suelto y ausencia explícita de molestias');

const explicitEverythingFine = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Todo bien',
  }],
});
assert.equal(explicitEverythingFine[0].text, 'Todo bien');

const grouped = buildPerformanceObservationsByPlayer({
  wellnessEntries: [
    {
      jugador_id: 'player-1',
      entry_date: '2026-07-30',
      comment: 'Comentario uno',
    },
    {
      jugador_id: 'player-2',
      entry_date: '2026-07-31',
      discomfort: 'Comentario dos',
    },
  ],
  rpeEntries: [{
    jugador_id: 'player-2',
    entry_date: '2026-07-29',
    comment: 'RPE jugador dos',
  }],
  referenceDate: REFERENCE_DATE,
});
assert.deepEqual(grouped.get('player-1').map((item) => item.text), ['Comentario uno']);
assert.deepEqual(
  grouped.get('player-2').map((item) => item.text),
  ['Comentario dos', 'RPE jugador dos'],
  'la agrupación previa no mezcla jugadores'
);

const namedPlayersAreIsolated = buildPerformanceObservationsByPlayer({
  wellnessEntries: [
    { jugador_id: 'acerete', entry_date: '2026-07-30', comment: 'Acerete comentario' },
    { jugador_id: 'marcos', entry_date: '2026-07-30', comment: 'Marcos comentario' },
    { jugador_id: 'agus', entry_date: '2026-07-30', comment: 'Agus comentario' },
    { jugador_id: 'julio', entry_date: '2026-07-30', comment: 'Julio comentario' },
  ],
  referenceDate: REFERENCE_DATE,
});
assert.deepEqual(namedPlayersAreIsolated.get('acerete').map((item) => item.text), ['Acerete comentario']);
assert.deepEqual(namedPlayersAreIsolated.get('marcos').map((item) => item.text), ['Marcos comentario']);
assert.deepEqual(namedPlayersAreIsolated.get('agus').map((item) => item.text), ['Agus comentario']);
assert.deepEqual(namedPlayersAreIsolated.get('julio').map((item) => item.text), ['Julio comentario']);

const emptyView = getPerformanceObservationView([]);
assert.equal(emptyView.isEmpty, true);
assert.equal(emptyView.emptyLabel, 'Sin observaciones registradas');

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(
  appSource.includes('buildPerformanceObservationsByPlayer({'),
  'App agrupa y resuelve el historial antes de construir las filas'
);
assert.ok(
  appSource.includes('const performanceObservationsByPlayer = useMemo('),
  'la agrupación histórica está memoizada'
);
assert.ok(
  appSource.includes("'id,jugador_id,entry_date,discomfort,comment,created_at,updated_at'"),
  'Wellness carga únicamente identificador, fecha y campos textuales necesarios'
);
assert.ok(
  appSource.includes("'id,jugador_id,entry_date,submitted_at,comment,created_at,updated_at'"),
  'RPE conserva submitted_at para ordenar por la hora real'
);
assert.ok(appSource.includes('min-w-0 flex-1 truncate text-[10px]'), 'los textos mantienen truncado responsive');
assert.ok(appSource.includes('role=\"tooltip\"'), 'el contenido completo sigue disponible en tooltip');
assert.ok(appSource.includes('Origen: {item.sourceLabel}'), 'el tooltip identifica el origen real');
assert.ok(appSource.includes('Fecha: {formatPerformanceObservationFullDate(item.date)}'), 'el tooltip muestra la fecha completa');
assert.ok(appSource.includes('Hora: {observationTime}'), 'el tooltip muestra la hora cuando está disponible');
assert.ok(appSource.includes('onObservationClick(item);'), 'cada observación prepara su navegación contextual');
assert.ok(appSource.includes('performance-individual-history-${observation.date}'), 'el clic intenta posicionar el historial en la fecha disponible');
assert.ok(appSource.includes('Indicador físico relevante'), 'las observaciones físicas incorporan una señal no basada solo en color');
assert.ok(
  appSource.includes('const priority = Boolean(combinedEntry || veryLowWellnessEntries.length || priorityWellnessSignals.length);'),
  'el cálculo del semáforo conserva su lógica independiente'
);
assert.ok(
  appSource.includes('wellnessTrend: getPerformanceTrend(scoredWellness.map((item) => item.value))'),
  'las tendencias siguen calculándose desde sus valores originales'
);
assert.ok(
  appSource.includes('avgRpe: validRpes.length'),
  'las medias RPE permanecen fuera de la utilidad de observaciones'
);

console.log('performanceObservations historical-order tests passed');
