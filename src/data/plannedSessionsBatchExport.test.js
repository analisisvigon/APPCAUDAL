import assert from 'node:assert/strict';
import { listPlannedSessionsForExport } from './plannedSessionsStore.js';
import { loadPlannedSessionPrintData, plannedSessionExportFileName } from '../utils/plannedSessionBatchExport.js';

const all = [
  { id: 'old', club_team_season_id: 'cts-a', session_date: '2026-10-19', starts_at: '09:00', session_number: 1 },
  { id: 'first', club_team_season_id: 'cts-a', session_date: '2026-10-20', starts_at: '09:00', session_number: 2 },
  { id: 'third', club_team_season_id: 'cts-a', session_date: '2026-10-21', starts_at: '10:00', session_number: 4 },
  { id: 'second', club_team_season_id: 'cts-a', session_date: '2026-10-21', starts_at: '08:00', session_number: 3 },
  { id: 'last', club_team_season_id: 'cts-a', session_date: '2026-10-22', starts_at: '09:00', session_number: 5 },
  { id: 'other-cts', club_team_season_id: 'cts-b', session_date: '2026-10-21', starts_at: '09:00', session_number: 6 },
];
const offsets = [];
const client = {
  from(table) {
    assert.equal(table, 'planned_training_sessions');
    const filters = [];
    const sorting = [];
    return {
      select(_columns, options) { assert.equal(options.count, 'exact'); return this; },
      eq(key, value) { filters.push((row) => row[key] === value); return this; },
      gte(key, value) { filters.push((row) => row[key] >= value); return this; },
      lte(key, value) { filters.push((row) => row[key] <= value); return this; },
      order(key) { sorting.push(key); return this; },
      range(from, to) {
        offsets.push(from);
        assert.deepEqual(sorting, ['session_date', 'starts_at', 'session_number', 'id']);
        const matching = all.filter((row) => filters.every((filter) => filter(row)));
        matching.sort((a, b) => sorting.reduce((result, key) => result ||
          String(a[key]).localeCompare(String(b[key])), 0));
        // Simula un límite del servidor inferior al tamaño solicitado.
        return Promise.resolve({ data: matching.slice(from, Math.min(to + 1, from + 2)),
          count: matching.length, error: null });
      },
    };
  },
};

const rows = await listPlannedSessionsForExport(client, 'cts-a', '2026-10-20', '2026-10-22');
assert.deepEqual(rows.map((row) => row.id), ['first', 'second', 'third', 'last']);
assert.deepEqual(offsets, [0, 2], 'la paginación conserva todas las filas aun si el servidor devuelve lotes más cortos');
assert.deepEqual(await listPlannedSessionsForExport(client, 'cts-a', '2026-10-23', '2026-10-24'), []);
await assert.rejects(listPlannedSessionsForExport(client, 'cts-a', '2026-10-22', '2026-10-20'),
  /intervalo de fechas válido/);
assert.equal(plannedSessionExportFileName('2026-10-20', '2026-10-22'),
  'Sesiones_2026-10-20_a_2026-10-22.pdf');

const snapshot = { snapshot_version: 1, source_task_id: 'task-id',
  source: { name: 'Tarea de Biblioteca', description: 'Explicación histórica' },
  working: { description: 'Explicación editada en esta sesión' } };
const detailRows = {
  planned_training_sessions: [{ id: 'first', club_team_season_id: 'cts-a',
    session_date: '2026-10-20', session_number: 2, session_value: 8.5 }],
  planned_session_slots: [{ id: 'slot-id', session_id: 'first', phase: 'main', sort_order: 1,
    duration_minutes: 20 }],
  planned_session_items: [{ id: 'item-id', slot_id: 'slot-id', session_id: 'first', kind: 'library_task',
    source_task_uuid_snapshot: 'task-id', task_snapshot: snapshot, sort_order: 1 }],
  planned_session_player_roster: [{ session_id: 'first', player_id: 'player-id',
    player_name_snapshot: 'Jugador histórico', position_key_snapshot: 'defender' }],
  planned_session_player_availability: [{ session_id: 'first', player_id: 'player-id',
    status: 'adapted', observation: 'Carga limitada' }],
  planned_session_distributions: [{ session_id: 'first', formation_key: null,
    player_layout: [], space_zones: [], specific_positions_snapshot: [] }],
  planned_session_board_seed_v11: [{ session_id: 'first', field_length_m: 105, field_width_m: 68 }],
  player_positions: [{ player_id: 'player-id', position_key: 'right_back',
    position_type: 'specific', is_primary: true }],
};
const detailClient = {
  from(table) {
    const filters = [];
    const result = () => ({ data: (detailRows[table] || []).filter((row) =>
      filters.every(([key, value]) => Array.isArray(value?.includes)
        ? value.includes.includes(row[key]) : row[key] === value)), error: null });
    return {
      select() { return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      in(key, values) { filters.push([key, { includes: values }]); return this; },
      single() { const response = result(); return Promise.resolve({ ...response, data: response.data[0] }); },
      maybeSingle() { const response = result(); return Promise.resolve({ ...response, data: response.data[0] || null }); },
      then(resolve) { resolve(result()); },
    };
  },
};
const printed = await loadPlannedSessionPrintData(detailClient, rows[0], 'cts-a', false);
assert.equal(printed.editor.slots[0].items[0].snapshot, snapshot,
  'la exportación conserva la copia histórica y sus cambios sin consultar Biblioteca');
assert.equal(printed.roster[0].player_name_snapshot, 'Jugador histórico');
assert.equal(printed.availability['player-id'].status, 'adapted');
assert.deepEqual(printed.fieldDimensions, { length_m: 105, width_m: 68 });
assert.equal(printed.sessionValue, '8.5');
await assert.rejects(loadPlannedSessionPrintData(detailClient,
  { id: 'first', session_date: '2026-10-21' }, 'cts-a', false), /no coinciden/,
  'si cambia la fecha durante la preparación no se imprime un lote obsoleto');
console.log('planned session batch export tests passed');
