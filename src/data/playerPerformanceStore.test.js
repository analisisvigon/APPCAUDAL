import assert from 'node:assert/strict';
import {
  PLAYER_PERFORMANCE_MAX_PAGE_SIZE,
  PLAYER_PERFORMANCE_MAX_RANGE_DAYS,
  PlayerPerformanceLoadError,
  appendUniquePlayerEntries,
  loadPlayerPerformancePage,
  loadPlayerPerformanceRange,
  loadPlayerRpePage,
  loadPlayerWellnessPage,
} from './playerPerformanceStore.js';

const makeClient = (rowsByTable = {}, errorsByTable = {}) => {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, select: '', order: [], range: [], filters: [], limit: null };
      calls.push(call);
      const response = () => ({
        data: rowsByTable[table] || [],
        error: errorsByTable[table] || null,
      });
      const builder = {
        select(columns) {
          call.select = columns;
          return builder;
        },
        order(column, options) {
          call.order.push([column, options]);
          return builder;
        },
        gte(column, value) {
          call.filters.push(['gte', column, value]);
          return builder;
        },
        lte(column, value) {
          call.filters.push(['lte', column, value]);
          return builder;
        },
        limit(value) {
          call.limit = value;
          return builder;
        },
        range(from, to) {
          call.range = [from, to];
          return Promise.resolve(response());
        },
        then(resolve, reject) {
          return Promise.resolve(response()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
};

const wellnessRows = [
  {
    id: 'wellness-new',
    jugador_id: 'own-player',
    entry_date: '2026-08-30',
    sleep_hours: '7.5',
    sleep_quality: 4,
    fatigue: 2,
    muscle_soreness: 3,
    stress: 1,
    mood: 5,
    health_ratio: '8.5',
    weight: '74.2',
    discomfort: '',
    comment: 'Fila más reciente',
  },
  {
    id: 'wellness-old',
    jugador_id: 'own-player',
    entry_date: '2026-08-29',
    comment: 'Comentario de esta fila',
  },
];

const rpeRows = [
  {
    id: 'rpe-new',
    jugador_id: 'own-player',
    session_id: null,
    entry_date: '2026-08-30',
    duration_minutes: 0,
    rpe: 6,
    load: 0,
    comment: '',
  },
];

const client = makeClient({ wellness_entries: wellnessRows, rpe_entries: rpeRows });
const initial = await loadPlayerPerformancePage(client, { limit: 1, jugador_id: 'must-be-ignored' });
assert.equal(initial.wellness.rows.length, 1);
assert.equal(initial.wellness.rows[0].id, 'wellness-new');
assert.equal('jugador_id' in initial.wellness.rows[0], false, 'La identidad de tabla no se entrega a la UI.');
assert.equal(initial.wellness.rows[0].sleep_hours, 7.5);
assert.equal(initial.wellness.rows[0].health_ratio, 8.5, 'El score validado se conserva sin recalcularlo.');
assert.equal(initial.wellness.rows[0].comment, 'Fila más reciente');
assert.equal(initial.rpe.rows[0].id, 'rpe-new');
assert.equal('jugador_id' in initial.rpe.rows[0], false, 'La identidad de tabla no se entrega a la UI.');
assert.equal(initial.rpe.rows[0].session_id, null);
assert.equal(initial.rpe.rows[0].comment, null, 'Un comentario vacío no se rellena con otra respuesta.');
assert.equal(initial.wellness.hasMore, true);
assert.deepEqual(client.calls.map((call) => call.table), ['wellness_entries', 'rpe_entries']);
client.calls.forEach((call) => {
  assert.deepEqual(call.order, [
    ['entry_date', { ascending: false }],
    ['id', { ascending: false }],
  ]);
  assert.deepEqual(call.range, [0, 1], 'Se pide limit + 1 para detectar Ver más.');
  assert.equal(call.select.includes('*'), false, 'El PLAYER solo solicita columnas explícitas.');
  assert.equal('eq' in call, false, 'El loader no construye filtros de identidad controlables por cliente.');
});

const empty = await loadPlayerPerformancePage(makeClient());
assert.deepEqual(empty.wellness, { rows: [], hasMore: false, nextOffset: 0 });
assert.deepEqual(empty.rpe, { rows: [], hasMore: false, nextOffset: 0 });

const limitedClient = makeClient({
  wellness_entries: Array.from({ length: PLAYER_PERFORMANCE_MAX_PAGE_SIZE + 1 }, (_, index) => ({
    id: `w-${index}`,
    jugador_id: 'own-player',
    entry_date: '2026-08-30',
  })),
});
const limited = await loadPlayerWellnessPage(limitedClient, { offset: -10, limit: 999 });
assert.equal(limited.rows.length, PLAYER_PERFORMANCE_MAX_PAGE_SIZE);
assert.equal(limited.hasMore, true);
assert.deepEqual(limitedClient.calls[0].range, [0, PLAYER_PERFORMANCE_MAX_PAGE_SIZE]);

const paginatedClient = makeClient({ rpe_entries: rpeRows });
await loadPlayerRpePage(paginatedClient, { offset: 8, limit: 8, jugadorId: 'other-player' });
assert.deepEqual(paginatedClient.calls[0].range, [8, 16]);

const rangeClient = makeClient({ wellness_entries: wellnessRows, rpe_entries: rpeRows });
const temporalRange = await loadPlayerPerformanceRange(rangeClient, {
  startDate: '2026-08-24',
  endDate: '2026-09-06',
  jugadorId: 'must-be-ignored',
});
assert.equal(temporalRange.wellness[0].id, 'wellness-new');
assert.equal(temporalRange.rpe[0].id, 'rpe-new');
rangeClient.calls.forEach((call) => {
  assert.deepEqual(call.filters, [
    ['gte', 'entry_date', '2026-08-24'],
    ['lte', 'entry_date', '2026-09-06'],
  ]);
  assert.equal(call.select.includes('jugador_id'), false);
  assert.equal(call.limit, PLAYER_PERFORMANCE_MAX_RANGE_DAYS);
});

await assert.rejects(
  () => loadPlayerPerformanceRange(makeClient(), {
    startDate: '2026-01-01',
    endDate: `2026-02-${String(PLAYER_PERFORMANCE_MAX_RANGE_DAYS).padStart(2, '0')}`,
  }),
  (error) => error instanceof PlayerPerformanceLoadError,
  'El navegador temporal no puede solicitar rangos históricos ilimitados.',
);

const exactFirstEntry = {
  id: 'same-wellness',
  entry_date: '2026-08-30',
  discomfort: 'Molestia exacta inicial',
  comment: 'Comentario exacto inicial',
};
const uniqueEntries = appendUniquePlayerEntries(
  [exactFirstEntry, { id: 'already-loaded', entry_date: '2026-08-29' }],
  [
    { id: 'already-loaded', entry_date: '2026-08-29', comment: 'No debe reemplazar la fila cargada' },
    { id: 'next-page', entry_date: '2026-08-28', comment: 'Comentario de la página nueva' },
  ],
);
assert.deepEqual(
  uniqueEntries.map((entry) => entry.id),
  ['same-wellness', 'already-loaded', 'next-page'],
  'La paginación conserva el orden y elimina duplicados por id.',
);
assert.equal(uniqueEntries[0], exactFirstEntry, 'No se reconstruye ni mezcla la respuesta ya cargada.');
assert.equal(uniqueEntries[0].comment, 'Comentario exacto inicial');
assert.equal(uniqueEntries[0].discomfort, 'Molestia exacta inicial');

await assert.rejects(
  () => loadPlayerWellnessPage(makeClient({}, { wellness_entries: { message: 'offline' } })),
  (error) => error instanceof PlayerPerformanceLoadError && error.kind === 'network',
);
await assert.rejects(
  () => loadPlayerRpePage(makeClient({}, {
    rpe_entries: { status: 401, message: 'JWT expired' },
  })),
  (error) => error instanceof PlayerPerformanceLoadError && error.kind === 'invalid_session',
);
const throwingClient = {
  from() {
    throw Object.assign(new Error('JWT expired'), { status: 401 });
  },
};
await assert.rejects(
  () => loadPlayerWellnessPage(throwingClient),
  (error) => error instanceof PlayerPerformanceLoadError && error.kind === 'invalid_session',
);
await assert.rejects(
  () => loadPlayerPerformancePage(null),
  (error) => error instanceof PlayerPerformanceLoadError && error.kind === 'invalid_session',
);

console.log('playerPerformanceStore: RLS-only path, orden, límites, vacíos y errores validados.');
