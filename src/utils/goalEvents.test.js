import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildRivalGoalTimelinePresentation,
  createGoalOwnGoalDraftPatch,
  createGoalParticipantDbFields,
  getGoalAssistant,
  getGoalOwnGoalLabel,
  goalParticipantMatchesPlayer,
  hasGoalAssistant,
  isGoalOwnGoal,
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

const ownGoalFor = {
  type: 'Gol a favor',
  isOwnGoal: true,
  scorer: 'No debe persistir',
  scorerId: 'p1',
  assistant: 'Tampoco debe persistir',
  assistantId: 'p2',
};
assert.equal(isGoalOwnGoal(ownGoalFor), true);
assert.equal(isGoalOwnGoal({ type: 'Gol a favor', is_own_goal: true }), true, 'lectura SQL usa el mismo contrato canónico');
assert.equal(isGoalOwnGoal({ type: 'Gol a favor' }), false, 'los eventos legacy no se reinterpretan como propias');
assert.equal(getGoalOwnGoalLabel(ownGoalFor), 'Gol en propia del rival');
assert.equal(getGoalOwnGoalLabel({ type: 'Gol en contra', is_own_goal: true }), 'Gol en propia del Caudal');
assert.deepEqual(createGoalParticipantDbFields(ownGoalFor), {
  scorer: null, scorer_id: null, assistant: null, assistant_id: null,
}, 'la serialización de una propia limpia cualquier participante previo');
assert.equal(hasGoalAssistant(ownGoalFor), false, 'una propia nunca tiene asistencia');
assert.equal(goalParticipantMatchesPlayer(ownGoalFor, 'scorer', players[0]), false, 'una propia nunca se atribuye al goleador previo');
assert.equal(goalParticipantMatchesPlayer(ownGoalFor, 'assistant', players[1]), false, 'una propia nunca se atribuye al asistente previo');
assert.deepEqual(createGoalOwnGoalDraftPatch(true, 'Gol a favor'), {
  isOwnGoal: true,
  scorer: '',
  scorerId: null,
  assistant: '',
  assistantId: null,
  assistantStatus: 'none',
}, 'editar normal a propia limpia participantes inmediatamente');
assert.deepEqual(createGoalOwnGoalDraftPatch(false, 'Gol a favor'), {
  isOwnGoal: false,
  scorer: '',
  scorerId: null,
  assistant: '',
  assistantId: null,
  assistantStatus: 'pending',
}, 'editar propia a normal vuelve a exigir goleador y decisión de asistencia');

const rivalScorerId = '10000000-0000-4000-8000-000000000001';
const rivalAssistantId = '10000000-0000-4000-8000-000000000002';
const rivalPlayers = [
  { jugadorRivalId: rivalScorerId, name: 'Mario García', shirtName: 'MARIO G.' },
  { globalPlayerId: rivalAssistantId, name: 'Pablo López', shirtName: 'PABLO' },
];
const rivalDisplayName = (player) => player.shirtName || player.name;

assert.deepEqual(buildRivalGoalTimelinePresentation({
  scorer_id: rivalScorerId,
  scorer: 'Nombre histórico',
}, {
  teamName: 'CD Praviano',
  rivalPlayers,
  formatPlayerName: rivalDisplayName,
}), {
  label: 'MARIO G. · CD Praviano',
  assist: '',
}, 'un goleador rival vinculado utiliza el nombre visible de la app');

assert.deepEqual(buildRivalGoalTimelinePresentation({
  scorer: 'Mario García',
  assistant: 'Pablo López',
}, {
  teamName: 'CD Praviano',
}), {
  label: 'Mario García · CD Praviano',
  assist: 'Pablo López',
}, 'el texto manual de goleador y asistencia se conserva sin inventar identidades');

assert.deepEqual(buildRivalGoalTimelinePresentation({
  scorer_id: rivalScorerId,
  assistant_id: rivalAssistantId,
}, {
  teamName: 'Un Club Deportivo Rival con un Nombre Especialmente Largo',
  rivalPlayers,
  formatPlayerName: rivalDisplayName,
}), {
  label: 'MARIO G. · Un Club Deportivo Rival con un Nombre Especialmente Largo',
  assist: 'PABLO',
}, 'los nombres largos no se recortan en el modelo visual');

assert.deepEqual(buildRivalGoalTimelinePresentation({}, {
  teamName: 'CD Praviano',
  rivalPlayers,
}), {
  label: 'CD Praviano',
  assist: '',
}, 'sin goleador ni asistencia se mantiene el fallback del equipo');

assert.deepEqual(buildRivalGoalTimelinePresentation({
  scorer_id: rivalScorerId,
  scorer: 'Mario García',
}, {
  teamName: 'CD Praviano',
  rivalPlayers: [],
}), {
  label: 'Mario García · CD Praviano',
  assist: '',
}, 'si el jugador fue eliminado o no está disponible se conserva el snapshot de texto');

assert.deepEqual(buildRivalGoalTimelinePresentation({
  scorer_id: rivalScorerId,
  scorer: rivalScorerId,
}, {
  teamName: 'CD Praviano',
  rivalPlayers: [],
}), {
  label: 'CD Praviano',
  assist: '',
}, 'un UUID sin jugador ni snapshot legible nunca se muestra al usuario');

assert.deepEqual(buildRivalGoalTimelinePresentation({
  type: 'Gol en contra',
  is_own_goal: true,
}, {
  teamName: 'CD Praviano',
}), {
  label: 'GOL EN PROPIA DEL CAUDAL',
  assist: '',
}, 'el timeline distingue una propia de un goleador rival desconocido');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(
  appSource,
  /buildRivalGoalTimelinePresentation\(event,[\s\S]*?teamName: match\.opponent[\s\S]*?rivalPlayers: matchRivalPlayers/,
  'la tarjeta del partido conecta los goles rivales con su catálogo de jugadores'
);
assert.match(
  appSource,
  /: rivalGoalPresentation\.label,[\s\S]*?: rivalGoalPresentation\?\.assist/,
  'el timeline utiliza tanto la línea del goleador rival como la asistencia rival'
);

console.log('goalEvents tests passed');
