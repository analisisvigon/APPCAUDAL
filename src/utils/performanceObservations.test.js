import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildPerformanceObservations,
  buildPerformanceObservationsByPlayer,
  getPerformanceObservationView,
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
  appSource.includes("'id,jugador_id,entry_date,comment,created_at,updated_at'"),
  'RPE carga únicamente identificador, fecha y comentario'
);
assert.ok(appSource.includes('min-w-0 truncate text-[10px]'), 'los textos mantienen truncado responsive');
assert.ok(appSource.includes('role=\"tooltip\"'), 'el contenido completo sigue disponible en tooltip');
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
