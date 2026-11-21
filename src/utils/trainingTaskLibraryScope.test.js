import assert from 'node:assert/strict';
import { chunkTrainingTaskIds, loadTrainingTaskLibraryScope } from './trainingTaskLibraryScope.js';

const calls = [];
const client = { rpc: async (name, params) => {
  calls.push({ name, params });
  if (params.p_offset === 0) return { data: Array.from({ length: 250 }, (_, index) => ({
    task_id: `task-${index}`, is_personal: index === 0,
    is_shared_with_team: true, total_count: 251,
  })), error: null };
  return { data: [{ task_id: 'task-250', is_personal: false, is_shared_with_team: true, total_count: 251 }], error: null };
} };

const scope = await loadTrainingTaskLibraryScope(client, 'cts-1', {
  createdFrom: '2026-01-01T00:00:00.000Z', createdUntil: '2027-01-01T00:00:00.000Z',
});
assert.equal(scope.length, 251, 'pagina todos los IDs autorizados sin truncarlos');
assert.equal(calls.length, 2);
assert.equal(calls[0].name, 'training_task_library_scope_v1');
assert.equal(calls[1].params.p_offset, 250);
assert.deepEqual(scope[0], { taskId: 'task-0', isPersonal: true, isSharedWithTeam: true });
assert.deepEqual(chunkTrainingTaskIds(Array.from({ length: 501 }, (_, index) => index)).map((chunk) => chunk.length), [250, 250, 1]);
await assert.rejects(() => loadTrainingTaskLibraryScope(client, ''), /equipo y temporada/);

console.log('training task team library scope tests passed');
