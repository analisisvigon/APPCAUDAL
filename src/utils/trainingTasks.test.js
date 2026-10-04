import assert from 'node:assert/strict';
import {
  buildTrainingTaskPayload,
  createTrainingTaskDraft,
  createTrainingTaskFilters,
  filterTrainingTasks,
  formatTrainingTaskPlayers,
  getTrainingTaskMomentLabel,
  getTrainingTaskTypeDefinition,
  normalizeTrainingTask,
  trainingTaskToDraft,
  TRAINING_TASK_MOMENTS,
  TRAINING_TASK_TYPES,
  validateTrainingTaskDraft,
} from './trainingTasks.js';

const draft = createTrainingTaskDraft();
draft.name = 'Rondo de tercer hombre';
draft.taskCode = '  Vigón  ';
draft.objective = 'Mejorar la continuidad tras apoyo';
draft.playersSpec = '4v4+3';
draft.durationMinutes = '12';
draft.gamePhase = 'offensive';
draft.gameMoment = 'creation';

assert.deepEqual(validateTrainingTaskDraft(draft), {}, 'una tarea mínima válida no genera errores');
assert.equal(formatTrainingTaskPlayers(draft), '4v4+3', 'se conserva el formato flexible de jugadores');
assert.equal(buildTrainingTaskPayload(draft, { clubId: 'club-1', authorUserId: 'user-1' }).author_user_id, 'user-1', 'la identidad usa el UUID del autor');
assert.equal(buildTrainingTaskPayload(draft, { clubId: 'club-1', authorUserId: 'user-1' }).task_code, 'Vigón', 'el código se recorta sin perder tilde ni mayúscula');
assert.equal(normalizeTrainingTask({ task_code: 'Vigón' }).taskCode, 'Vigón', 'READ normaliza task_code');
assert.equal(trainingTaskToDraft({ taskCode: 'Vigón' }).taskCode, 'Vigón', 'EDIT carga el código existente');
const editedDraft = trainingTaskToDraft({ taskCode: 'Vigón', name: 'Rondo', objective: 'Presión', taskType: 'rondos' });
editedDraft.taskCode = 'Vigón 2';
assert.equal(buildTrainingTaskPayload(editedDraft, { clubId: 'club-1', authorUserId: 'user-1', existing: { editor_payload: {} } }).task_code, 'Vigón 2', 'EDIT persiste el código modificado');
assert.equal(validateTrainingTaskDraft({ ...draft, name: '' }).name, 'Indica un nombre.');
assert.equal(validateTrainingTaskDraft({ ...draft, playersMin: '8', playersMax: '4' }).playersMax, 'El máximo no puede ser menor que el mínimo.');
assert.equal(buildTrainingTaskPayload(draft, { clubId: 'club-1', authorUserId: 'user-1' }).game_moment, 'creation');
assert.equal(getTrainingTaskMomentLabel('offensive', 'creation'), 'Creación');
assert.equal(TRAINING_TASK_MOMENTS.transition[0].value, 'offensive_transition');
assert.deepEqual(validateTrainingTaskDraft({ ...draft, spaceWidthM: '20', spaceLengthM: '35' }), {}, '20 y 35 son dimensiones naturales válidas');
assert.equal(buildTrainingTaskPayload({ ...draft, spaceWidthM: '20' }, { clubId: 'club-1', authorUserId: 'user-1' }).space_width_m, 20, 'el ancho se normaliza a número antes de persistir');
assert.ok(validateTrainingTaskDraft({ ...draft, spaceWidthM: '20.5' }).spaceWidthM, 'un ancho decimal es inválido');
assert.ok(validateTrainingTaskDraft({ ...draft, spaceLengthM: '-10' }).spaceLengthM, 'un largo negativo es inválido');
assert.ok(validateTrainingTaskDraft({ ...draft, spaceWidthM: 'texto' }).spaceWidthM, 'un ancho textual es inválido');
assert.ok(validateTrainingTaskDraft({ ...draft, taskCode: 'x'.repeat(41) }).taskCode, 'el código respeta el máximo persistente de 40 caracteres');

assert.equal(TRAINING_TASK_TYPES.length, 13, 'el catálogo ofrece exactamente 13 tipos');
assert.equal(new Set(TRAINING_TASK_TYPES.map((type) => type.key)).size, 13, 'las claves de tipo son únicas');
assert.deepEqual(TRAINING_TASK_TYPES.map((type) => type.label), [
  'Calentamiento', 'Ruedas de pase', 'Rondos', 'Mantenimientos', 'Juegos posicionales',
  'Acciones dirigidas', 'Ataque-defensa', 'Finalizaciones', 'Partidos reducidos',
  'Dobles áreas', 'Partidos condicionados', 'ABP', 'Puestos específicos',
]);
assert.ok(TRAINING_TASK_TYPES.every((type) => /^#[0-9a-f]{6}$/i.test(type.color)), 'cada tipo tiene color');
assert.equal(new Set(TRAINING_TASK_TYPES.map((type) => type.color)).size, 13, 'cada tipo tiene identidad visual propia');
assert.deepEqual(getTrainingTaskTypeDefinition('Rondo'), { key: 'rondos', label: 'Rondo', color: '#22c55e', legacy: true }, 'un tipo legacy conserva su label y recibe color compatible');
assert.equal(getTrainingTaskTypeDefinition('Tipo histórico').label, 'Tipo histórico', 'un legacy desconocido no rompe presentación');

const tasks = [
  { name: 'Rondo de tercer hombre', taskCode: 'Vigón', objective: 'Presión tras pérdida', description: 'Tres equipos', technicalContent: 'Pase', tacticalContent: 'Conservación', material: 'Petos', observations: 'Alta intensidad', taskType: 'rondos', playersMin: 8, playersMax: 12, gamePhase: 'offensive', durationMinutes: 12, author_user_id: 'me', isShared: true },
  { name: 'Bloque medio', taskCode: 'DEF', objective: 'Defender área', taskType: 'Tarea táctica', playersMin: null, playersMax: 10, gamePhase: 'defensive', durationMinutes: 25, author_user_id: 'other', isShared: true },
  { name: 'Sin tiempo', taskCode: '', objective: 'Libre', taskType: 'Otro', playersMin: null, playersMax: null, gamePhase: '', durationMinutes: null, author_user_id: 'me', isShared: false },
];
assert.equal(filterTrainingTasks(tasks, { search: 'presión' }).length, 1, 'la búsqueda incluye objetivo y tildes');
assert.equal(filterTrainingTasks(tasks, { search: 'presion   tras' }).length, 1, 'la búsqueda ignora tildes, mayúsculas y espacios repetidos');
assert.equal(filterTrainingTasks(tasks, { search: 'vIgÓn' }).length, 1, 'la búsqueda general incluye código case-insensitive');
for (const query of ['tres equipos', 'pase', 'conservacion', 'petos', 'alta intensidad']) {
  assert.equal(filterTrainingTasks(tasks, { search: query }).length, 1, `la búsqueda general incluye "${query}"`);
}
assert.equal(filterTrainingTasks(tasks, { taskCode: 'vigon' }).length, 1, 'el filtro específico de código es case-insensitive');
assert.equal(filterTrainingTasks(tasks, { objective: 'PERDIDA' }).length, 1, 'el objetivo tiene filtro específico');
assert.equal(filterTrainingTasks(tasks, { taskType: 'rondos' }).length, 1, 'filtra por clave canónica de tipo');
assert.equal(filterTrainingTasks(tasks, { players: '10' }).length, 2, 'incluye rangos completos y límites inferiores null');
assert.equal(filterTrainingTasks(tasks, { players: '12' }).length, 1, 'excluye un número fuera del máximo');
assert.equal(filterTrainingTasks(tasks, { players: '7' }).length, 1, 'un máximo sin mínimo actúa como límite superior abierto');
assert.equal(filterTrainingTasks(tasks, { players: '18' }).length, 0, 'null/null no inventa compatibilidad de jugadores');
assert.equal(filterTrainingTasks([{ playersMin: 12, playersMax: null }], { players: '14' }).length, 1, 'un mínimo sin máximo actúa como límite inferior abierto');
assert.equal(filterTrainingTasks(tasks, { taskCode: 'vigon', taskType: 'rondos', players: '10', objective: 'presion' }).length, 1, 'los filtros diferentes se combinan con AND');
assert.equal(filterTrainingTasks(tasks, { scope: 'mine' }, 'me').length, 2, 'Mías incluye tareas propias compartidas');
assert.equal(filterTrainingTasks(tasks, { scope: 'shared' }, 'me').length, 1, 'Compartidas excluye tareas propias');
assert.equal(filterTrainingTasks(tasks, { taskCode: 'def', scope: 'mine' }, 'me').length, 0, 'el código no altera ownership');
assert.equal(filterTrainingTasks(tasks, { duration: 'short' }, 'me').length, 1, 'duración nula no equivale a cero');
assert.equal(filterTrainingTasks(tasks, { gamePhase: 'defensive', duration: 'medium' }).length, 1, 'fase y duración se combinan');
assert.deepEqual(createTrainingTaskFilters(), { search: '', taskType: '', taskCode: '', players: '', objective: '', gamePhase: '', scope: '', duration: '' }, 'limpiar filtros restaura el estado inicial');

console.log('training task tests passed');
