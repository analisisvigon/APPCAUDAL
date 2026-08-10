import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_GOAL_PHASE,
  getGoalModalSummaryEvent,
  getGoalSubphaseOptions,
  getLatestExistingGoalEvent,
  normalizeGoalTacticalContext,
  updateGoalPrimaryContext,
} from './goalFormState.js';

assert.equal(DEFAULT_GOAL_PHASE, 'Juego combinativo');
assert.deepEqual(getGoalSubphaseOptions(DEFAULT_GOAL_PHASE), ['Dentro del área', 'Fuera del área'], 'las opciones dependientes existen desde el primer render');
assert.deepEqual(normalizeGoalTacticalContext({}), { phase: 'Juego combinativo', subphase: '' }, 'un gol nuevo tiene fase real sin inventar subfase');
assert.deepEqual(
  normalizeGoalTacticalContext({ phase: 'ABP', subphase: 'Penalti' }),
  { phase: 'ABP', subphase: 'Penalti' },
  'la edición conserva una subfase histórica compatible'
);
assert.deepEqual(
  updateGoalPrimaryContext({ phase: 'ABP', subphase: 'Segunda jugada' }, 'Juego directo'),
  { phase: 'Juego directo', subphase: 'Segunda jugada' },
  'un cambio de fase conserva la subfase si sigue siendo válida'
);
assert.deepEqual(
  updateGoalPrimaryContext({ phase: 'ABP', subphase: 'Penalti' }, 'Juego directo'),
  { phase: 'Juego directo', subphase: '' },
  'un cambio incompatible limpia únicamente la subfase'
);

const agustinGoal = { id: 'goal-1', minute: '18', scorer: 'Agustín Porto', phase: 'Juego combinativo' };
const laterGoal = { id: 'goal-2', minute: '72', scorer: 'Diego Boza', phase: 'Transición' };
assert.equal(getLatestExistingGoalEvent([]), null, 'un 0-0 no tiene último gol fantasma');
assert.equal(getLatestExistingGoalEvent([agustinGoal, laterGoal])?.id, 'goal-2');
assert.equal(getLatestExistingGoalEvent([agustinGoal])?.id, 'goal-1', 'al borrar el último se recupera el anterior existente');
assert.equal(getGoalModalSummaryEvent({ events: [], draft: { scorer: 'Agustín Porto' } }), null, 'el borrador nuevo no se presenta como un evento guardado');
assert.equal(
  getGoalModalSummaryEvent({ events: [agustinGoal], editingGoalEventId: 'goal-1', draft: { ...agustinGoal, scorer: 'AGUS PORTO' } })?.scorer,
  'AGUS PORTO',
  'la edición representa el borrador del evento que todavía existe'
);
assert.equal(
  getGoalModalSummaryEvent({ events: [], editingGoalEventId: 'goal-1', draft: agustinGoal }),
  null,
  'una referencia de edición borrada no puede reaparecer en la cabecera'
);

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.equal(appSource.includes('lastGoalAnalysisContext'), false, 'no queda una caché local del último gol');
assert.ok(appSource.includes('getGoalModalSummaryEvent({'), 'la cabecera deriva el evento de la lista actual');
assert.ok(appSource.includes('const partialScore = getStatsScore();'), 'el marcador del modal usa el marcador real sin sumar un borrador');
assert.ok(appSource.includes('statsGoalEvents: nextEvents'), 'el recálculo invalida inmediatamente el snapshot local de eventos');
assert.equal(appSource.includes('score.caudal + 1'), false, 'el modal no fabrica un 1-0 para un gol sin guardar');
assert.ok(appSource.includes("scorer: ''"), 'un alta nueva no inventa el primer jugador como goleador');
assert.ok(appSource.includes('getGoalSubphaseOptions(goalAnalysisDraft.phase)'), 'el segundo select deriva siempre sus opciones de la fase actual');

console.log('goalFormState tests passed');
