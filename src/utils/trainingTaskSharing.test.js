import assert from 'node:assert/strict';
import { shareTrainingTask } from './trainingTaskStore.js';

const calls = [];
const client = {
  rpc: async (name, params) => {
    calls.push({ name, params });
    return { data: true, error: null };
  },
};

await shareTrainingTask(client, 'task-1', ['membership-2', 'membership-1', 'membership-2'], { clubWide: true });
assert.deepEqual(calls[0], {
  name: 'set_training_task_sharing_v1',
  params: {
    p_task_id: 'task-1',
    p_library_visibility: 'club',
    p_membership_ids: ['membership-2', 'membership-1'],
  },
}, 'la biblioteca común se guarda mediante una única RPC atómica');

await shareTrainingTask(client, 'task-2', [], { clubWide: false });
assert.equal(calls[1].params.p_library_visibility, 'private', 'una tarea puede conservarse privada');

await assert.rejects(
  () => shareTrainingTask({ rpc: async () => ({ data: null, error: { message: 'denegado' } }) }, 'task-3', [], {}),
  (error) => error?.message === 'denegado',
  'los errores de autorización de Supabase llegan a la interfaz',
);

await assert.rejects(
  () => shareTrainingTask({ rpc: async () => ({ data: false, error: null }) }, 'task-4', [], {}),
  /No se confirmó/,
  'el cliente exige confirmación positiva de la RPC',
);

console.log('training task sharing tests passed');
