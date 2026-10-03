import assert from 'node:assert/strict';
import {
  buildTrainingTaskPayload,
  createTrainingTaskDraft,
  filterTrainingTasks,
  formatTrainingTaskPlayers,
  getTrainingTaskMomentLabel,
  TRAINING_TASK_MOMENTS,
  validateTrainingTaskDraft,
} from './trainingTasks.js';

const draft = createTrainingTaskDraft();
draft.name = 'Rondo de tercer hombre';
draft.objective = 'Mejorar la continuidad tras apoyo';
draft.playersSpec = '4v4+3';
draft.durationMinutes = '12';
draft.gamePhase = 'offensive';
draft.gameMoment = 'creation';

assert.deepEqual(validateTrainingTaskDraft(draft), {}, 'una tarea mínima válida no genera errores');
assert.equal(formatTrainingTaskPlayers(draft), '4v4+3', 'se conserva el formato flexible de jugadores');
assert.equal(buildTrainingTaskPayload(draft, { clubId: 'club-1', authorUserId: 'user-1' }).author_user_id, 'user-1', 'la identidad usa el UUID del autor');
assert.equal(validateTrainingTaskDraft({ ...draft, name: '' }).name, 'Indica un nombre.');
assert.equal(validateTrainingTaskDraft({ ...draft, playersMin: '8', playersMax: '4' }).playersMax, 'El máximo no puede ser menor que el mínimo.');
assert.equal(buildTrainingTaskPayload(draft, { clubId: 'club-1', authorUserId: 'user-1' }).game_moment, 'creation');
assert.equal(getTrainingTaskMomentLabel('offensive', 'creation'), 'Creación');
assert.equal(TRAINING_TASK_MOMENTS.transition[0].value, 'offensive_transition');

const tasks = [
  { name: 'Rondo de tercer hombre', objective: 'Continuidad', taskType: 'Rondo', gamePhase: 'offensive', durationMinutes: 12, author_user_id: 'me', isShared: true },
  { name: 'Bloque medio', objective: 'Defender área', taskType: 'Tarea táctica', gamePhase: 'defensive', durationMinutes: 25, author_user_id: 'other', isShared: true },
  { name: 'Sin tiempo', objective: 'Libre', taskType: 'Otro', gamePhase: '', durationMinutes: null, author_user_id: 'me', isShared: false },
];
assert.equal(filterTrainingTasks(tasks, { search: 'continuidad' }).length, 1, 'la búsqueda incluye el objetivo');
assert.equal(filterTrainingTasks(tasks, { scope: 'mine' }, 'me').length, 2, 'Mías incluye tareas propias compartidas');
assert.equal(filterTrainingTasks(tasks, { scope: 'shared' }, 'me').length, 1, 'Compartidas excluye tareas propias');
assert.equal(filterTrainingTasks(tasks, { duration: 'short' }, 'me').length, 1, 'duración nula no equivale a cero');
assert.equal(filterTrainingTasks(tasks, { gamePhase: 'defensive', duration: 'medium' }).length, 1, 'fase y duración se combinan');

console.log('training task tests passed');
