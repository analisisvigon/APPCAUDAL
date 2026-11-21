import assert from 'node:assert/strict';
import { shareTrainingTask } from './trainingTaskStore.js';

const calls = [];
const client = {
  rpc: async (name, params) => {
    calls.push({ name, params });
    return { data: true, error: null };
  },
};

await shareTrainingTask(client, 'task-1', 'cts-1', true);
assert.deepEqual(calls[0], {
  name: 'set_training_task_team_link_v1',
  params: {
    p_task_id: 'task-1',
    p_cts_id: 'cts-1',
    p_shared: true,
  },
}, 'el enlace al equipo se guarda mediante una única RPC atómica');

await shareTrainingTask(client, 'task-2', 'cts-1', false);
assert.equal(calls[1].params.p_shared, false, 'una tarea puede conservarse únicamente personal');

await assert.rejects(
  () => shareTrainingTask({ rpc: async () => ({ data: null, error: { message: 'denegado' } }) }, 'task-3', 'cts-1', true),
  (error) => error?.message === 'denegado',
  'los errores de autorización de Supabase llegan a la interfaz',
);

await assert.rejects(
  () => shareTrainingTask({ rpc: async () => ({ data: false, error: null }) }, 'task-4', 'cts-1', true),
  /No se confirmó/,
  'el cliente exige confirmación positiva de la RPC',
);

console.log('training task sharing tests passed');
