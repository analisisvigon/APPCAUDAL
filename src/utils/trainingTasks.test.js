import assert from 'node:assert/strict';
import {
  buildTrainingTaskPayload,
  createTrainingTaskDraft,
  createTrainingTaskFilters,
  filterTrainingTasks,
  formatTrainingTaskPlayers,
  getTrainingTaskPlayerRange,
  getTrainingTaskMomentLabel,
  getTrainingTaskStageLabel,
  getTrainingTaskTypeDefinition,
  normalizeTrainingTaskStages,
  normalizeTrainingTask,
  parseTrainingTaskSearch,
  trainingTaskToDraft,
  TRAINING_TASK_MOMENTS,
  TRAINING_TASK_STAGES,
  TRAINING_TASK_TYPES,
  validateTrainingTaskDraft,
  trainingTaskCalculatedDuration,
} from './trainingTasks.js';

const draft = createTrainingTaskDraft();
draft.name = 'Rondo de tercer hombre';
draft.taskCode = '  Vigón  ';
draft.objective = 'Mejorar la continuidad tras apoyo';
draft.playersSpec = '4v4+3';
draft.durationMinutes = '12';
draft.gamePhase = 'offensive';
draft.gameMoment = 'creation';
draft.stageKeys = ['juvenil', 'senior'];
draft.variants = 'Limitar a dos contactos.';

assert.deepEqual(validateTrainingTaskDraft(draft), {}, 'una tarea mínima válida no genera errores');
assert.equal(trainingTaskCalculatedDuration({ seriesCount: '2', minutesPerSeries: '6' }), 12);
assert.equal(trainingTaskCalculatedDuration({ seriesCount: '', minutesPerSeries: '' }), null);
const seriesDraft = { ...draft, seriesCount: '2', minutesPerSeries: '6' };
assert.deepEqual(validateTrainingTaskDraft(seriesDraft), {});
assert.equal(buildTrainingTaskPayload(seriesDraft, { seriesEnabled: true }).duration_minutes, 12);
assert.equal(buildTrainingTaskPayload(seriesDraft, { seriesEnabled: true }).series_count, 2);
assert.equal(buildTrainingTaskPayload(seriesDraft, { seriesEnabled: true }).minutes_per_series, 6);
assert.ok(!('series_count' in buildTrainingTaskPayload(seriesDraft)), 'sin backend no se escriben columnas nuevas');
assert.ok(validateTrainingTaskDraft({ ...seriesDraft, minutesPerSeries: '' }).minutesPerSeries);
assert.ok(validateTrainingTaskDraft({ ...seriesDraft, seriesCount: '0' }).seriesCount);
assert.ok(validateTrainingTaskDraft({ ...seriesDraft, seriesCount: '1.5' }).seriesCount);
assert.ok(validateTrainingTaskDraft({ ...draft, durationMinutes: '0' }).durationMinutes);
assert.equal(trainingTaskToDraft(normalizeTrainingTask({ series_count: 3, minutes_per_series: 5 })).seriesCount, 3);
const contentDraft = { ...draft, tacticalContent: 'General heredado',
  exerciseRules: 'Dos toques\nGol doble', tacticalOffensiveContent: 'Crear espacios\nFinalizar',
  tacticalDefensiveContent: 'Cerrar el centro' };
const contentPayload = buildTrainingTaskPayload(contentDraft, { contentEnabled: true });
assert.equal(contentPayload.exercise_rules, 'Dos toques\nGol doble');
assert.equal(contentPayload.tactical_content_offensive, 'Crear espacios\nFinalizar');
assert.equal(contentPayload.tactical_content_defensive, 'Cerrar el centro');
assert.equal(contentPayload.tactical_content, 'General heredado');
assert.equal(buildTrainingTaskPayload({ ...contentDraft, tacticalContent: 'General\n\nHeredado  ' },
  { contentEnabled: true }).tactical_content, 'General\n\nHeredado  ',
  'el texto táctico heredado conserva saltos de línea y espacios existentes');
assert.equal('exercise_rules' in buildTrainingTaskPayload(contentDraft), false,
  'sin la migración no se escriben columnas nuevas');
assert.equal(trainingTaskToDraft(normalizeTrainingTask(contentPayload)).exerciseRules,
  'Dos toques\nGol doble', 'la edición recupera los saltos de línea');
assert.ok(validateTrainingTaskDraft({ ...contentDraft, exerciseRules: 'x'.repeat(10001) }).exerciseRules);
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
assert.deepEqual(buildTrainingTaskPayload(draft, { clubId: 'club-1', authorUserId: 'user-1' }).stage_keys, ['juvenil', 'senior'], 'CREATE persiste varias etapas canónicas');
assert.equal(buildTrainingTaskPayload(draft, { clubId: 'club-1', authorUserId: 'user-1' }).variants, 'Limitar a dos contactos.', 'CREATE persiste variantes');
assert.deepEqual(normalizeTrainingTask({ stage_keys: ['juvenil', 'senior'], variants: 'Dos contactos' }).stageKeys, ['juvenil', 'senior'], 'READ normaliza etapas múltiples');
assert.deepEqual(trainingTaskToDraft({ stageKeys: ['cadete'], variants: 'Reducir espacio' }).stageKeys, ['cadete'], 'EDIT carga las etapas');
assert.equal(trainingTaskToDraft({ variants: 'Reducir espacio' }).variants, 'Reducir espacio', 'EDIT carga variantes');
assert.equal(getTrainingTaskMomentLabel('offensive', 'creation'), 'Creación');
assert.equal(TRAINING_TASK_MOMENTS.transition[0].value, 'offensive_transition');
assert.equal(TRAINING_TASK_STAGES.length, 7, 'el catálogo contiene las siete etapas canónicas');
assert.equal(getTrainingTaskStageLabel('senior'), 'Sénior');
assert.deepEqual(normalizeTrainingTaskStages(['juvenil', 'juvenil', 'desconocida', 'senior']), ['juvenil', 'senior'], 'etapas se deduplican y rechazan claves no canónicas');
assert.deepEqual(validateTrainingTaskDraft({ ...draft, spaceWidthM: '20', spaceLengthM: '35' }), {}, '20 y 35 son dimensiones naturales válidas');
assert.equal(buildTrainingTaskPayload({ ...draft, spaceWidthM: '20' }, { clubId: 'club-1', authorUserId: 'user-1' }).space_width_m, 20, 'el ancho se normaliza a número antes de persistir');
assert.ok(validateTrainingTaskDraft({ ...draft, spaceWidthM: '20.5' }).spaceWidthM, 'un ancho decimal es inválido');
assert.ok(validateTrainingTaskDraft({ ...draft, spaceLengthM: '-10' }).spaceLengthM, 'un largo negativo es inválido');
assert.ok(validateTrainingTaskDraft({ ...draft, spaceWidthM: 'texto' }).spaceWidthM, 'un ancho textual es inválido');
assert.ok(validateTrainingTaskDraft({ ...draft, taskCode: 'x'.repeat(41) }).taskCode, 'el código respeta el máximo persistente de 40 caracteres');
assert.ok(validateTrainingTaskDraft({ ...draft, variants: 'x'.repeat(10001) }).variants, 'variantes respeta el máximo persistente');

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
  { name: 'Rondo de tercer hombre', taskCode: 'Vigón', objective: 'Presión tras pérdida', description: 'Tres equipos', technicalContent: 'Pase', tacticalContent: 'Conservación', exerciseRules: 'Circular rápido y orientar el control', tacticalOffensiveContent: 'Fijar por dentro', tacticalDefensiveContent: 'Cerrar línea interior', material: 'Petos', observations: 'Alta intensidad', variants: 'Dos contactos', feedbackSearchText: 'Funcionó el bloque alto', media: [{ title: 'Apoyos diagonales', caption: 'Vídeo de referencia' }], editorPayload: { schemaVersion: 1, board: { pitchType: 'half', elements: [{ id: 'text-1', type: 'text', text: 'Zona de presión', x: 20, y: 30 }, { id: 'por-1', type: 'participant', role: 'goalkeeper', x: 50, y: 10 }, { id: 'comodin-1', type: 'participant', role: 'neutral', x: 50, y: 36 }] } }, stageKeys: ['juvenil', 'senior'], ratingAverage: 4.25, ratingCount: 4, taskType: 'rondos', playersMin: 8, playersMax: 12, gamePhase: 'offensive', gameMoment: 'creation', durationMinutes: 12, seriesCount: 3, spaceWidthMinM: 20, spaceWidthMaxM: 30, spaceLengthMinM: 25, spaceLengthMaxM: 40, author_user_id: 'me', isShared: true },
  { name: 'Bloque medio', taskCode: 'DEF', objective: 'Defender área', stageKeys: ['cadete'], ratingAverage: 3, ratingCount: 1, taskType: 'Tarea táctica', playersMin: null, playersMax: 10, gamePhase: 'defensive', durationMinutes: 25, author_user_id: 'other', isShared: true },
  { name: 'Sin tiempo', taskCode: '', objective: 'Libre', stageKeys: [], ratingAverage: null, ratingCount: 0, taskType: 'Otro', playersMin: null, playersMax: null, gamePhase: '', durationMinutes: null, author_user_id: 'me', isShared: false },
];
assert.equal(filterTrainingTasks(tasks, { search: 'presión' }).length, 1, 'la búsqueda incluye objetivo y tildes');
assert.equal(filterTrainingTasks(tasks, { search: 'presion   tras' }).length, 1, 'la búsqueda ignora tildes, mayúsculas y espacios repetidos');
assert.equal(filterTrainingTasks(tasks, { search: 'vIgÓn' }).length, 1, 'la búsqueda general incluye código case-insensitive');
for (const query of ['tres equipos', 'pase', 'conservacion', 'petos', 'alta intensidad']) {
  assert.equal(filterTrainingTasks(tasks, { search: query }).length, 1, `la búsqueda general incluye "${query}"`);
}
assert.equal(filterTrainingTasks(tasks, { search: 'dos contactos' }).length, 1, 'la búsqueda general incluye variantes');
for (const query of ['circular rapido', 'fijar dentro', 'cerrar interior', 'bloque alto', 'apoyos diagonales', 'zona presion', 'medio campo', 'portero', 'comodin', 'creacion', 'senior']) {
  assert.equal(filterTrainingTasks(tasks, { search: query }).length, 1, `la búsqueda completa incluye "${query}"`);
}
assert.equal(filterTrainingTasks(tasks, { search: 'PERDIDA presion' }).length, 1, 'varias palabras no dependen de su orden');
assert.equal(filterTrainingTasks(tasks, { search: 'posesion inexistente' }).length, 0, 'todas las palabras libres son necesarias');
assert.deepEqual(parseTrainingTaskSearch('Rondo 10 jugadores 25×32'), { players: 10, width: 25, length: 32, duration: null, series: null, terms: ['rondo'] });
assert.equal(filterTrainingTasks(tasks, { search: 'presion 10 jugadores 25 x 32' }).length, 1, 'texto, jugadores y dimensiones se combinan semánticamente');
assert.equal(filterTrainingTasks(tasks, { search: 'presion 15 jugadores' }).length, 0, 'el número de jugadores no coincide con otros números de la ficha');
assert.equal(filterTrainingTasks(tasks, { search: 'presion 25x32' }).length, 1, 'las dimensiones consultadas pueden estar dentro de intervalos persistidos');
assert.equal(filterTrainingTasks(tasks, { search: 'presion 31x32' }).length, 0, 'un ancho fuera del intervalo no coincide');
assert.equal(filterTrainingTasks(tasks, { search: 'presion 25x41' }).length, 0, 'un largo fuera del intervalo no coincide');
assert.equal(filterTrainingTasks(tasks, { search: 'presion 12 minutos 3 series' }).length, 1, 'duración y series usan sus campos y no texto ambiguo');
const editedTask = { ...tasks[0], description: 'Automatismo exclusivo tras edición' };
assert.equal(filterTrainingTasks([editedTask], { search: 'automatismo edicion' }).length, 1, 'una tarea editada se indexa desde sus datos actuales sin caché obsoleta');
assert.equal(filterTrainingTasks([{ name: 'Tarea antigua', objective: null, editorPayload: null }], { search: 'tarea antigua' }).length, 1, 'las tareas antiguas con campos incompletos siguen siendo consultables');
assert.deepEqual(getTrainingTaskPlayerRange({ playersSpec: '4v4+3' }), { min: 11, max: 11 }, 'el formato suma equipos y comodines como total');
assert.deepEqual(getTrainingTaskPlayerRange({ playersSpec: '8-12 jugadores' }), { min: 8, max: 12 }, 'un rango textual legacy sigue siendo consultable');
assert.equal(filterTrainingTasks(tasks, { stage: 'senior' }).length, 1, 'el filtro incluye tareas con la etapa entre varias');
assert.equal(filterTrainingTasks(tasks, { stage: 'juvenil', taskType: 'rondos', players: '10', objective: 'presion' }).length, 1, 'etapa se combina mediante AND');
assert.equal(filterTrainingTasks(tasks, { ratingMin: '4' }).length, 1, '4+ usa la media real');
assert.equal(filterTrainingTasks(tasks, { ratingMin: '1' }).length, 2, 'sin valoraciones no pasa ni siquiera 1+');
assert.equal(filterTrainingTasks(tasks, { taskCode: 'vigon' }).length, 1, 'el filtro específico de código es case-insensitive');
assert.equal(filterTrainingTasks(tasks, { objective: 'PERDIDA' }).length, 1, 'el objetivo tiene filtro específico');
assert.equal(filterTrainingTasks(tasks, { taskType: 'rondos' }).length, 1, 'filtra por clave canónica de tipo');
assert.equal(filterTrainingTasks(tasks, { players: '10' }).length, 2, 'incluye rangos completos y límites inferiores null');
assert.equal(filterTrainingTasks(tasks, { players: '12' }).length, 1, 'excluye un número fuera del máximo');
assert.equal(filterTrainingTasks(tasks, { players: '7' }).length, 1, 'un máximo sin mínimo actúa como límite superior abierto');
assert.equal(filterTrainingTasks(tasks, { players: '18' }).length, 0, 'null/null no inventa compatibilidad de jugadores');
assert.equal(filterTrainingTasks(tasks, { playersMin: '10', playersMax: '14' }).length, 2, 'el rango solicitado encuentra intervalos compatibles');
assert.equal(filterTrainingTasks(tasks, { playersMin: '13', playersMax: '15' }).length, 0, 'un rango sin solapamiento no coincide');
assert.equal(filterTrainingTasks(tasks, { spaceWidthMin: '24', spaceWidthMax: '26', spaceLengthMin: '30', spaceLengthMax: '35' }).length, 1, 'los rangos de ancho y largo se combinan');
assert.equal(filterTrainingTasks(tasks, { spaceWidthMin: '31' }).length, 0, 'el filtro avanzado descarta anchos incompatibles');
assert.equal(filterTrainingTasks([{ playersMin: 12, playersMax: null }], { players: '14' }).length, 1, 'un mínimo sin máximo actúa como límite inferior abierto');
assert.equal(filterTrainingTasks(tasks, { taskCode: 'vigon', taskType: 'rondos', players: '10', objective: 'presion' }).length, 1, 'los filtros diferentes se combinan con AND');
assert.equal(filterTrainingTasks(tasks, { scope: 'mine' }, 'me').length, 2, 'Mías incluye tareas propias compartidas');
assert.equal(filterTrainingTasks(tasks, { scope: 'shared' }, 'me').length, 1, 'Compartidas excluye tareas propias');
assert.equal(filterTrainingTasks(tasks, { taskCode: 'def', scope: 'mine' }, 'me').length, 0, 'el código no altera ownership');
assert.equal(filterTrainingTasks(tasks, { duration: 'short' }, 'me').length, 1, 'duración nula no equivale a cero');
assert.equal(filterTrainingTasks(tasks, { gamePhase: 'defensive', duration: 'medium' }).length, 1, 'fase y duración se combinan');
assert.deepEqual(createTrainingTaskFilters(), { search: '', taskType: '', taskCode: '', players: '', playersMin: '', playersMax: '', objective: '', gamePhase: '', scope: '', duration: '', spaceWidthMin: '', spaceWidthMax: '', spaceLengthMin: '', spaceLengthMax: '', stage: '', ratingMin: '' }, 'limpiar filtros restaura también rangos, etapa y valoración');

console.log('training task tests passed');
