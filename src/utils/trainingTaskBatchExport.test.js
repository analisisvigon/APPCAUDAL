import assert from 'node:assert/strict';
import {
  listTrainingTasksForExport,
  trainingTaskCreationRange,
  trainingTaskExportFileName,
} from './trainingTaskBatchExport.js';

const all = Array.from({ length: 252 }, (_, index) => ({
  id: `task-${String(index).padStart(3, '0')}`,
  club_id: 'club-a',
  name: `Tarea ${index}`,
  created_at: new Date(2026, 9, 20, 12, index % 60).toISOString(),
}));
all.push({ ...all[3] });
const requestedChunks = [];
const client = {
  async rpc(name, params) {
    assert.equal(name, 'training_task_library_scope_v1');
    const ids = all.slice(0, 252).map((row) => row.id);
    const page = ids.slice(params.p_offset, params.p_offset + params.p_limit);
    return { data: page.map((taskId) => ({
      task_id: taskId, is_personal: true, is_shared_with_team: true, total_count: ids.length,
    })), error: null };
  },
  from(table) {
    assert.equal(table, 'training_tasks');
    const query = {
      ids: [], sorting: [],
      select(columns) { assert.equal(columns, '*'); return this; },
      in(key, ids) { assert.equal(key, 'id'); this.ids = ids; requestedChunks.push(ids); return this; },
      order(key) {
        this.sorting.push(key);
        if (this.sorting.length < 2) return this;
        const data = all.filter((row) => this.ids.includes(row.id))
          .sort((left, right) => this.sorting.reduce((result, field) => result || String(left[field]).localeCompare(String(right[field])), 0));
        return Promise.resolve({ data, error: null });
      },
    };
    return query;
  },
};

const rows = await listTrainingTasksForExport(client, 'cts-a', '2026-10-20', '2026-10-20');
assert.equal(rows.length, 252, 'incluye todas las tareas autorizadas y elimina duplicados');
assert.deepEqual(requestedChunks.map((chunk) => chunk.length), [250, 2], 'consulta filas autorizadas en lotes acotados');
assert.equal(rows[0].id, 'task-000');
assert.ok(rows.some((row) => row.id === 'task-251'));
assert.ok(rows.every((row, index) => index === 0 || rows[index - 1].created_at <= row.created_at),
  'ordena de la creación más antigua a la más reciente');
assert.deepEqual(trainingTaskCreationRange('2026-10-20', '2026-10-20'), {
  from: new Date(2026, 9, 20).toISOString(),
  until: new Date(2026, 9, 21).toISOString(),
});
await assert.rejects(listTrainingTasksForExport(client, 'cts-a', '2026-10-21', '2026-10-20'), /intervalo/);
assert.equal(trainingTaskExportFileName('2026-10-20', '2026-10-21'), 'Tareas_2026-10-20_a_2026-10-21.pdf');
console.log('training task batch export tests passed');
