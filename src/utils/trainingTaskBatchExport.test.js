import assert from 'node:assert/strict';
import {
  listTrainingTasksForExport,
  trainingTaskCreationRange,
  trainingTaskExportFileName,
} from './trainingTaskBatchExport.js';

const all = Array.from({ length: 253 }, (_, index) => ({
  id: `task-${String(index).padStart(3, '0')}`,
  club_id: index === 252 ? 'other-club' : 'club-a',
  name: `Tarea ${index}`,
  created_at: new Date(2026, 9, 20, 12, index % 60).toISOString(),
}));
all.push({ ...all[3] });
const offsets = [];
const client = {
  from(table) {
    assert.equal(table, 'training_tasks');
    const filters = [];
    const sorting = [];
    return {
      select(columns, options) { assert.equal(columns, '*'); assert.deepEqual(options, { count: 'exact' }); return this; },
      eq(key, value) { filters.push((row) => row[key] === value); return this; },
      gte(key, value) { filters.push((row) => row[key] >= value); return this; },
      lt(key, value) { filters.push((row) => row[key] < value); return this; },
      order(key) { sorting.push(key); return this; },
      range(from, to) {
        offsets.push(from);
        assert.deepEqual(sorting, ['created_at', 'id']);
        const matching = all.filter((row) => filters.every((filter) => filter(row)))
          .sort((left, right) => sorting.reduce((result, key) => result || String(left[key]).localeCompare(String(right[key])), 0));
        // Simula una respuesta paginada menor que el rango solicitado.
        const pageSize = from === 0 ? 137 : 116;
        return Promise.resolve({ data: matching.slice(from, Math.min(to + 1, from + pageSize)), count: matching.length, error: null });
      },
    };
  },
};

const rows = await listTrainingTasksForExport(client, 'club-a', '2026-10-20', '2026-10-20');
assert.equal(rows.length, 252, 'incluye todas las tareas autorizadas y elimina duplicados');
assert.deepEqual(offsets, [0, 137], 'continúa paginando aunque el servidor devuelva lotes cortos');
assert.equal(rows[0].id, 'task-000');
assert.ok(rows.some((row) => row.id === 'task-251'));
assert.ok(rows.every((row, index) => index === 0 || rows[index - 1].created_at <= row.created_at),
  'ordena de la creación más antigua a la más reciente');
assert.deepEqual(trainingTaskCreationRange('2026-10-20', '2026-10-20'), {
  from: new Date(2026, 9, 20).toISOString(),
  until: new Date(2026, 9, 21).toISOString(),
});
await assert.rejects(listTrainingTasksForExport(client, 'club-a', '2026-10-21', '2026-10-20'), /intervalo/);
assert.equal(trainingTaskExportFileName('2026-10-20', '2026-10-21'), 'Tareas_2026-10-20_a_2026-10-21.pdf');
console.log('training task batch export tests passed');
