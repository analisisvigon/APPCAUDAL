import assert from 'node:assert/strict';
import {
  createGoalParticipantDbFields,
  getGoalAssistant,
  goalParticipantMatchesPlayer,
  hasGoalAssistant,
  normalizeGoalParticipants,
  resolveGoalParticipant,
} from './goalEvents.js';

const players = [
  { id: 'p1', name: 'Agustín Porto' },
  { id: 'p2', name: 'Aitor Ferrero' },
];

assert.deepEqual(getGoalAssistant({ assistant_id: 'p2', assistant: 'Aitor Ferrero' }), { id: 'p2', name: 'Aitor Ferrero' });
assert.deepEqual(getGoalAssistant({ assistId: 'p2', assist: 'Aitor Ferrero' }), { id: 'p2', name: 'Aitor Ferrero' });
assert.deepEqual(getGoalAssistant({ assistantId: 'p2', assistantName: 'Aitor Ferrero' }), { id: 'p2', name: 'Aitor Ferrero' });
assert.equal(hasGoalAssistant({ assistant: 'Aitor Ferrero' }), true);
assert.equal(hasGoalAssistant({ assistant: '   ', assistant_id: null }), false);
assert.equal(hasGoalAssistant({ assistant: null, assist_zone: 'finalizacion_centro' }), false, 'la zona no equivale a un asistente');
assert.equal(resolveGoalParticipant({ assistantId: 'id-antiguo', assistant: 'Aitor Férrero' }, 'assistant', players)?.id, 'p2', 'un ID antiguo hace fallback al nombre normalizado');
assert.equal(goalParticipantMatchesPlayer({ assistantId: 'id-antiguo', assistant: 'Aitor Ferrero' }, 'assistant', players[1]), true);
assert.deepEqual(normalizeGoalParticipants({ scorer: 'Agustín Porto', assist: 'Aitor Ferrero' }), {
  scorer: 'Agustín Porto', scorerId: null, assistant: 'Aitor Ferrero', assistantId: null,
});
assert.deepEqual(createGoalParticipantDbFields({ scorer: 'Agustín Porto', scorerId: 'p1', assistant: 'Aitor Ferrero', assistantId: 'p2' }), {
  scorer: 'Agustín Porto', scorer_id: 'p1', assistant: 'Aitor Ferrero', assistant_id: 'p2',
});

console.log('goalEvents tests passed');
