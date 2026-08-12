import assert from 'node:assert/strict';
import { buildGoalAtomicRpcArgs, isGoalMutationResponseCurrent, normalizeGoalAtomicResult } from './goalAtomicMutation.js';

const matchId = '00000000-0000-4000-8000-000000000001';
const goalId = '00000000-0000-4000-8000-000000000002';
const goal = {
  partido_id: matchId,
  type: 'Gol a favor',
  half: 'Primera parte',
  minute: '22',
  scorer: 'Jugador',
  assistant: null,
  scorer_id: null,
  assistant_id: null,
  assist_zone: 'izquierda',
  shot_zone: 'centro',
  goal_zone: 'alta izquierda',
};

assert.deepEqual(buildGoalAtomicRpcArgs({ operation: 'create', matchId, goal }), {
  p_operation: 'create', p_partido_id: matchId, p_goal_id: null, p_goal: goal, p_match_patch: {},
});
assert.equal(buildGoalAtomicRpcArgs({ operation: 'update', matchId, goalId, goal }).p_goal_id, goalId, 'editar conserva el ID');
assert.equal(buildGoalAtomicRpcArgs({ operation: 'delete', matchId, goalId }).p_operation, 'delete');

const result = normalizeGoalAtomicResult({
  goal: { id: goalId, assistant: null, assistant_id: null },
  events: [{ id: goalId }],
  score: { goals_for: 1, goals_against: 0, home_score: 0, away_score: 1 },
});
assert.deepEqual(result.score, { goalsFor: '1', goalsAgainst: '0', homeScore: '0', awayScore: '1' }, 'respeta la localía calculada por servidor');
assert.equal(result.goal.assistant, null, 'sin asistencia no se inventa participante');

assert.equal(isGoalMutationResponseCurrent({ requestedMatchId: matchId, currentMatchId: matchId, requestId: 2, latestRequestId: 2 }), true);
assert.equal(isGoalMutationResponseCurrent({ requestedMatchId: matchId, currentMatchId: 'otro', requestId: 2, latestRequestId: 2 }), false);
assert.equal(isGoalMutationResponseCurrent({ requestedMatchId: matchId, currentMatchId: matchId, requestId: 1, latestRequestId: 2 }), false);

const deriveScore = (events, isHome) => {
  const goalsFor = events.filter((event) => event.type === 'Gol a favor').length;
  const goalsAgainst = events.filter((event) => event.type === 'Gol en contra').length;
  return {
    goalsFor,
    goalsAgainst,
    homeScore: isHome ? goalsFor : goalsAgainst,
    awayScore: isHome ? goalsAgainst : goalsFor,
  };
};

let persistedEvents = [];
persistedEvents = [...persistedEvents, { id: 'g1', type: 'Gol a favor', assistant: null }];
assert.deepEqual(deriveScore(persistedEvents, true), { goalsFor: 1, goalsAgainst: 0, homeScore: 1, awayScore: 0 });
assert.deepEqual(deriveScore(persistedEvents, false), { goalsFor: 1, goalsAgainst: 0, homeScore: 0, awayScore: 1 }, 'respeta local/visitante');
persistedEvents = [...persistedEvents, { id: 'g2', type: 'Gol en contra' }];
assert.deepEqual(deriveScore(persistedEvents, true), { goalsFor: 1, goalsAgainst: 1, homeScore: 1, awayScore: 1 }, 'crea GF y GC desde filas persistidas');
persistedEvents = persistedEvents.map((event) => event.id === 'g1' ? { ...event, scorer: 'Otro goleador' } : event);
assert.deepEqual(deriveScore(persistedEvents, true), { goalsFor: 1, goalsAgainst: 1, homeScore: 1, awayScore: 1 }, 'editar goleador no altera marcador');
persistedEvents = persistedEvents.map((event) => event.id === 'g1' ? { ...event, type: 'Gol en contra' } : event);
assert.deepEqual(deriveScore(persistedEvents, true), { goalsFor: 0, goalsAgainst: 2, homeScore: 0, awayScore: 2 }, 'cambiar el sentido recalcula todo');
persistedEvents = persistedEvents.filter((event) => event.id !== 'g2');
assert.deepEqual(deriveScore(persistedEvents, true), { goalsFor: 0, goalsAgainst: 1, homeScore: 0, awayScore: 1 }, 'borrar afecta solo al evento objetivo');
persistedEvents = [];
assert.deepEqual(deriveScore(persistedEvents, true), { goalsFor: 0, goalsAgainst: 0, homeScore: 0, awayScore: 0 }, 'borrar el último gol vuelve a cero');

console.log('goal atomic mutation tests: ok');
