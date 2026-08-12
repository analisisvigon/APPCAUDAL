import assert from 'node:assert/strict';
import {
  RIVAL_SCOUTING_STORAGE,
  buildConnectionPayload,
  buildLegacyRivalScoutingPlan,
  hydrateRivalScoutingBundle,
  mergeLegacyWithoutOverwritingRemote,
  readLegacyRivalScoutingStorage,
  resolveRivalPlayerFlags,
  resolveLegacyMatchId,
  shouldApplyScoutingResponse,
} from './rivalScoutingPersistence.js';
import { buildTacticalEvidenceCenter } from './tacticalEvidenceCenter.js';
import { createFlushableSaveCoordinator } from './flushableSaveCoordinator.js';

const teamId = '11111111-1111-4111-8111-111111111111';
const matchId = '22222222-2222-4222-8222-222222222222';
const playerId = '33333333-3333-4333-8333-333333333333';

assert.deepEqual(Object.fromEntries(Object.entries(RIVAL_SCOUTING_STORAGE).map(([key, value]) => [key, value.classification])), {
  tacticalIdentity: 'business',
  observedScouting: 'business',
  scoutingDrafts: 'mixed_business_draft',
  playerFlags: 'legacy_cache',
  playerDatabaseView: 'local_preference',
});

const storageValues = new Map([
  ['caudal_rival_tactical_identity_v1', JSON.stringify({ [teamId]: { pressureType: 'alta' } })],
  ['caudal-rival-observed-scouting-v1', '{invalid'],
  ['caudal-rival-scouting-drafts-v1', JSON.stringify({ __new: { planVsRival: 'Cerrar dentro' } })],
]);
const parsed = readLegacyRivalScoutingStorage({ getItem: (key) => storageValues.get(key) || null });
assert.equal(parsed.tacticalIdentity[teamId].pressureType, 'alta');
assert.deepEqual(parsed.observedScouting, {});
assert.equal(parsed.scoutingDrafts.__new.planVsRival, 'Cerrar dentro');

const conflict = mergeLegacyWithoutOverwritingRemote(
  { pressureType: 'alta', nested: { remoteOnly: 'sí' } },
  { pressureType: 'media', strongSide: 'derecha', nested: { legacyOnly: 'sí' } },
);
assert.equal(conflict.merged.pressureType, 'alta');
assert.equal(conflict.merged.strongSide, 'derecha');
assert.equal(conflict.merged.nested.legacyOnly, 'sí');
assert.equal(conflict.conflicts[0].path, 'pressureType');

const matches = [
  { id: matchId, equipoRivalId: teamId, opponent: 'Rival A', date: '2026-08-12' },
];
assert.equal(resolveLegacyMatchId('Rival A', matches, teamId), matchId);
assert.equal(resolveLegacyMatchId('Referencia ambigua', matches, teamId), null);

const team = {
  id: teamId,
  name: 'Rival A',
  squad: [{ id: playerId, jugadorRivalId: playerId, name: 'Nueve', observed: true }],
};
const legacy = {
  tacticalIdentity: { [teamId]: { pressureType: 'media', strongSide: 'derecha' } },
  observedScouting: { [teamId]: {
    collective: { buildUp: 'directa' },
    evidences: [{ id: 'evidence-1', match: 'Rival A', type: 'Ataque', importance: 'Alta', observation: 'Ataca espalda' }],
    tacticalConnections: [{ id: 'connection-1', team: 'rival', origin: 'Nueve', destination: 'Extremo', type: 'Pase habitual', intensity: 'Alta' }],
  } },
  scoutingDrafts: { [teamId]: { planVsRival: 'Cerrar dentro' }, __new: { planVsRival: 'Borrador' } },
  playerFlags: { [`${teamId}::nueve`]: { observed: false } },
};
const plan = buildLegacyRivalScoutingPlan({
  legacy,
  teams: [team],
  matches,
  remoteByTeam: { [teamId]: { tacticalIdentity: { pressureType: 'alta' } } },
});
assert.equal(plan.filter((operation) => operation.kind === 'evidence').length, 1);
assert.equal(plan.find((operation) => operation.kind === 'evidence').payload.partido_id, matchId);
assert.equal(plan.find((operation) => operation.section === 'tacticalIdentity').payload.pressureType, 'alta');
assert.equal(plan.find((operation) => operation.section === 'tacticalIdentity').payload.strongSide, 'derecha');
assert.equal(plan.find((operation) => operation.kind === 'player_flags_candidate').conflicts.length, 1);
assert.equal(plan.some((operation) => operation.legacyItemId === '__new'), false);

assert.equal(resolveRivalPlayerFlags({
  remotePlayer: { id: playerId, observed: true, captain: false },
  legacyFlags: { observed: false, captain: true },
}).observed, true);
assert.equal(resolveRivalPlayerFlags({
  remotePlayer: { id: playerId, observed: true, captain: false },
  legacyFlags: { observed: false, captain: true },
}).captain, false);

const connection = buildConnectionPayload({
  teamId,
  matchId,
  draft: { team: 'rival', origin: 'Nueve', destination: 'Extremo', type: 'Pase habitual', intensity: 'Alta' },
  players: team.squad,
});
assert.equal(connection.source_entity_type, 'player');
assert.equal(connection.source_jugador_rival_id, playerId);
assert.equal(connection.target_entity_type, 'role');
assert.equal(connection.partido_id, matchId);

const hydrated = hydrateRivalScoutingBundle({
  profiles: [{ equipo_rival_id: teamId, tactical_identity: { pressureType: 'alta' }, collective_profile: {}, match_plan_notes: {} }],
  evidences: [{ id: playerId, equipo_rival_id: teamId, partido_id: matchId, evidence_type: 'Ataque', importance: 'Alta', interpretation: 'Ataca espalda', status: 'confirmed', source_context: {} }],
});
assert.equal(hydrated[teamId].tacticalIdentity.pressureType, 'alta');
assert.equal(hydrated[teamId].evidences[0].status, 'confirmed');
assert.equal(hydrated[teamId].evidences[0].partidoId, matchId);

const manualCenter = buildTacticalEvidenceCenter({
  report: {},
  validations: {},
  manualEvidences: [{ id: playerId, observation: 'Ataca espalda', status: 'confirmed', partidoId: matchId }],
});
assert.equal(manualCenter.confirmedCount, 1);
assert.equal(manualCenter.confirmedItems[0].canConfirm, true);

const generatedReport = {
  patterns: [{ key: 'press', label: 'Presión alta', playIds: ['play-1', 'play-2'], count: 2 }],
  contexts: [
    { playId: 'play-1', matchId, phase: 'defensive', phaseLabel: 'Defensa', sources: [{ type: 'board', id: 'play-1' }] },
    { playId: 'play-2', matchId, phase: 'defensive', phaseLabel: 'Defensa', sources: [{ type: 'board', id: 'play-2' }] },
  ],
};
const generatedValidation = { 'pattern:press': { status: 'confirmed', interpretation: 'Salta arriba' } };
assert.equal(buildTacticalEvidenceCenter({ report: generatedReport, validations: generatedValidation }).confirmedCount, 1);
assert.equal(buildTacticalEvidenceCenter({ report: { ...generatedReport, generatedAt: new Date().toISOString() }, validations: generatedValidation }).confirmedCount, 1);

let failNextSave = true;
const coordinator = createFlushableSaveCoordinator({
  readSnapshot: () => ({ teamId }),
  persist: async () => failNextSave ? (failNextSave = false, { ok: false, error: new Error('offline') }) : { ok: true },
});
coordinator.markDirty();
assert.equal((await coordinator.save()).ok, false);
assert.equal(coordinator.hasPending(), true);
assert.equal((await coordinator.save()).ok, true);
assert.equal(coordinator.hasPending(), false);

assert.equal(shouldApplyScoutingResponse({ requestedTeamId: teamId, currentTeamId: teamId, requestId: 3, latestRequestId: 3 }), true);
assert.equal(shouldApplyScoutingResponse({ requestedTeamId: teamId, currentTeamId: 'otro', requestId: 3, latestRequestId: 3 }), false);
assert.equal(shouldApplyScoutingResponse({ requestedTeamId: teamId, currentTeamId: teamId, requestId: 2, latestRequestId: 3 }), false);

console.log('rivalScoutingPersistence tests: OK');
