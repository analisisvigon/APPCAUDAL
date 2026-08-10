import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GOAL_ASSISTANCE_SELECT_VALUE,
  GOAL_ASSISTANCE_STATUS,
  createGoalAssistantDraftPatch,
  createGoalParticipantDbFields,
  getGoalAssistantSelectValue,
  getPersistedGoalAssistanceStatus,
  goalParticipantMatchesPlayer,
  hasGoalAssistant,
} from './goalEvents.js';

const agus = { id: 'player-agus', name: 'AGUS PORTO' };
const boza = { id: 'player-boza', name: 'BOZA' };
const players = [agus, boza];

const pending = createGoalAssistantDraftPatch(GOAL_ASSISTANCE_SELECT_VALUE.pending, players);
assert.deepEqual(pending, {
  assistant: '',
  assistantId: null,
  assistantStatus: GOAL_ASSISTANCE_STATUS.pending,
}, 'un alta nueva mantiene la asistencia pendiente hasta que el usuario decide');
assert.equal(getGoalAssistantSelectValue(pending), GOAL_ASSISTANCE_SELECT_VALUE.pending);

const withoutAssist = createGoalAssistantDraftPatch(GOAL_ASSISTANCE_SELECT_VALUE.none, players);
assert.deepEqual(withoutAssist, {
  assistant: '',
  assistantId: null,
  assistantStatus: GOAL_ASSISTANCE_STATUS.none,
}, 'Sin asistencia es una decisión explícita distinta de pendiente');
assert.deepEqual(createGoalParticipantDbFields({ scorer: agus.name, scorerId: agus.id, ...withoutAssist }), {
  scorer: agus.name,
  scorer_id: agus.id,
  assistant: null,
  assistant_id: null,
}, 'un gol sin asistencia persiste null/null sin inventar jugador');

const withAssist = createGoalAssistantDraftPatch(boza.name, players);
assert.deepEqual(withAssist, {
  assistant: boza.name,
  assistantId: boza.id,
  assistantStatus: GOAL_ASSISTANCE_STATUS.player,
});
assert.equal(getGoalAssistantSelectValue(withAssist), boza.name, 'editar conserva el asistente real');
assert.equal(getPersistedGoalAssistanceStatus({ assistant: null, assistant_id: null }), GOAL_ASSISTANCE_STATUS.none);
assert.equal(getGoalAssistantSelectValue({ ...withoutAssist }), GOAL_ASSISTANCE_SELECT_VALUE.none, 'editar null/null muestra Sin asistencia');

const mixedGoals = [
  { id: 'goal-assisted', type: 'Gol a favor', scorer: agus.name, assistant: boza.name, assistantId: boza.id },
  { id: 'goal-unassisted', type: 'Gol a favor', scorer: agus.name, assistant: null, assistantId: null },
  { id: 'goal-against', type: 'Gol en contra', scorer: 'Rival', assistant: null, assistantId: null },
];
assert.equal(mixedGoals.filter((goal) => goal.type === 'Gol a favor').length, 2, 'ambos goles cuentan en el marcador');
assert.equal(mixedGoals.filter(hasGoalAssistant).length, 1, 'solo la asistencia real entra en agregaciones');
assert.equal(mixedGoals.filter((goal) => goalParticipantMatchesPlayer(goal, 'assistant', boza)).length, 1, 'BOZA suma una única asistencia');
assert.deepEqual(
  mixedGoals
    .filter((goal) => goal.type === 'Gol a favor' && hasGoalAssistant(goal))
    .map((goal) => `${goal.assistant}->${goal.scorer}`),
  ['BOZA->AGUS PORTO'],
  'las conexiones excluyen goles sin asistencia y goles en contra'
);

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('Selecciona un asistente o indica Sin asistencia.'), 'guardar pendiente muestra validación ligera');
assert.ok(appSource.includes('getPersistedGoalAssistanceStatus(goal)'), 'reabrir deriva el estado persistido');
assert.ok(appSource.includes('<option value={GOAL_ASSISTANCE_SELECT_VALUE.none}>Sin asistencia</option>'), 'el selector ofrece Sin asistencia explícitamente');
assert.ok(appSource.includes('assistant: participantFields.assistant') && appSource.includes('assistant_id: participantFields.assistant_id'), 'el payload conserva los campos existentes');
assert.ok(appSource.includes("filter((goal) => goal.teamSide === 'for' && (goal.scorerName || goal.scorerId) && hasGoalAssistant(goal))"), 'las conexiones exigen asistente real');
assert.ok(appSource.includes("const assistant = hasGoalAssistant(goal) ? ensureRow('assistant'"), 'el ranking solo crea filas para asistencias reales');
assert.ok(appSource.includes('const deleteGoalAnalysisEvent = async (eventId)'), 'el borrado sigue siendo independiente de la asistencia');
assert.ok(appSource.includes('assistantStatus: GOAL_ASSISTANCE_STATUS.none'), 'el gol en contra conserva ausencia de asistencia');
assert.ok(appSource.includes("value === 'Gol a favor' && prev.type === 'Gol en contra'"), 'volver a gol a favor exige decidir de nuevo la asistencia');
assert.equal(appSource.includes("'assistant_status'"), false, 'el estado de interfaz no se añade al payload ni al esquema');
assert.equal(appSource.includes('Sin asistencia registrada.'), false, 'la interfaz ya no mezcla ausencia confirmada con pendiente');

console.log('goalAssistance tests passed');
