import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildPerformanceObservations,
  getPerformanceObservationView,
} from './performanceObservations.js';

const context = {
  playerId: 'player-1',
  contextStartDate: '2026-07-27',
  contextEndDate: '2026-08-02',
  referenceDate: '2026-07-31',
};

const build = ({ wellnessEntries = [], rpeEntries = [] } = {}) => buildPerformanceObservations({
  ...context,
  wellnessEntries,
  rpeEntries,
});

const onlyRpe = build({
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Sesión exigente',
  }],
});
assert.deepEqual(
  onlyRpe.map(({ sourceLabel, type, text }) => ({ sourceLabel, type, text })),
  [{ sourceLabel: 'RPE', type: 'comment', text: 'Sesión exigente' }],
  'muestra un comentario RPE real e identifica su fuente'
);

const onlyWellnessComment = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Dormí mal',
  }],
});
assert.equal(onlyWellnessComment[0].label, 'Wellness · Dormí mal');

const onlyDiscomfort = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    discomfort: 'Cuádriceps derecho',
  }],
});
assert.equal(onlyDiscomfort[0].label, 'Molestia · Cuádriceps derecho');

const allSources = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    discomfort: 'Cuádriceps derecho',
    comment: 'Sensación de rigidez',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Sesión exigente',
  }],
});
assert.deepEqual(
  allSources.map((item) => item.sourceLabel),
  ['Molestia', 'RPE', 'Wellness'],
  'la molestia precede al comentario RPE y al comentario Wellness'
);
assert.ok(allSources.every((item) => ['Molestia', 'RPE', 'Wellness'].includes(item.sourceLabel)));

const differentDates = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    discomfort: 'Cuádriceps derecho',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-30',
    comment: 'Sesión exigente',
  }],
});
assert.equal(differentDates[0].label, 'Molestia · Hoy · Cuádriceps derecho');
assert.equal(differentDates[1].label, 'RPE · Ayer · Sesión exigente');

const deduplicated = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    discomfort: 'Cuádriceps derecho.',
    comment: '  CUADRÍCEPS   DERECHO ',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Cuadríceps derecho!',
  }],
});
assert.equal(deduplicated.length, 1, 'deduplica mayúsculas, espacios, tildes y puntuación básica');
assert.equal(deduplicated[0].sourceLabel, 'Molestia', 'conserva la fuente de mayor prioridad');

const emptyValues = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    discomfort: 'Sin molestias',
    comment: '—',
  }],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Ninguna',
  }],
});
assert.deepEqual(emptyValues, [], 'ignora respuestas vacías o técnicas sin contenido');

const explicitEverythingFine = build({
  wellnessEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-31',
    comment: 'Todo bien',
  }],
});
assert.equal(explicitEverythingFine[0].label, 'Wellness · Todo bien', 'conserva un comentario explícito útil');

const emptyView = getPerformanceObservationView([]);
assert.equal(emptyView.emptyLabel, 'Sin observaciones');
assert.equal(emptyView.isEmpty, true);

const limitedView = getPerformanceObservationView(allSources);
assert.equal(limitedView.items.length, 2, 'muestra como máximo dos observaciones');
assert.equal(limitedView.hiddenCount, 1);
assert.equal(limitedView.moreLabel, '+1 más');
assert.ok(limitedView.fullText.includes('Wellness · Sensación de rigidez'));

const mixedPlayers = build({
  wellnessEntries: [
    {
      jugador_id: 'player-1',
      entry_date: '2026-07-31',
      comment: 'Comentario correcto',
    },
    {
      jugador_id: 'player-2',
      entry_date: '2026-07-31',
      discomfort: 'No debe aparecer',
    },
  ],
});
assert.equal(mixedPlayers.length, 1);
assert.equal(mixedPlayers[0].text, 'Comentario correcto', 'no mezcla datos de jugadores distintos');

const contextFiltered = build({
  wellnessEntries: [
    {
      jugador_id: 'player-1',
      entry_date: '2026-07-20',
      discomfort: 'Comentario antiguo',
    },
    {
      jugador_id: 'player-1',
      entry_date: '2026-07-31',
      comment: 'Comentario semanal',
    },
  ],
  rpeEntries: [{
    jugador_id: 'player-1',
    entry_date: '2026-07-20',
    comment: 'RPE antiguo',
  }],
});
assert.deepEqual(contextFiltered.map((item) => item.text), ['Comentario semanal']);

const onlyLatestSourceRecord = build({
  wellnessEntries: [
    {
      jugador_id: 'player-1',
      entry_date: '2026-07-29',
      discomfort: 'Molestia anterior',
    },
    {
      jugador_id: 'player-1',
      entry_date: '2026-07-31',
      comment: 'Comentario actual',
    },
  ],
});
assert.deepEqual(
  onlyLatestSourceRecord.map((item) => item.text),
  ['Comentario actual'],
  'no recupera observaciones antiguas cuando la fila representa un registro Wellness posterior'
);

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('min-w-0 truncate text-[10px]'), 'los textos largos se truncan sin ensanchar la tabla');
assert.ok(appSource.includes('max-w-[min(18rem,80vw)]'), 'el tooltip limita su anchura también en pantallas pequeñas');
assert.ok(appSource.includes('allowFocus={false}'), 'la versión móvil evita controles interactivos anidados');
assert.ok(appSource.includes('<PerformanceObservations observations={row.observations} />'), 'la tabla reutiliza el componente estructurado');

console.log('performanceObservations tests passed');
