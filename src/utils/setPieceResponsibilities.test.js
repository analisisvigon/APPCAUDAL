import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SET_PIECE_RESPONSIBILITIES,
  allowsMultipleSetPiecePlayers,
  assignSetPieceResponsibility,
  findSetPieceResponsibilityConflict,
  getSetPieceResponsibilitiesForPhase,
  getSetPieceResponsibility,
  getSetPieceResponsibilityPhase,
  getValidSetPieceResponsibilities,
  inspectSetPieceResponsibilities,
  isValidSetPieceResponsibilityId,
  normalizeSetPieceResponsibilities,
  removeSetPieceResponsibility,
} from './setPieceResponsibilities.js';

const defensive = getSetPieceResponsibilitiesForPhase('defensive');
const offensive = getSetPieceResponsibilitiesForPhase('offensive');
assert.deepEqual(defensive.map(({ label, abbreviation }) => [label, abbreviation]), [
  ['Palo', 'PAL'], ['Zona 1', 'Z1'], ['Zona 2', 'Z2'], ['Zona 3', 'Z3'],
  ['Zona 4', 'Z4'], ['Zona 5', 'Z5'], ['Rechace 1', 'R1'], ['Rechace 2', 'R2'], ['Marca', 'MAR'],
]);
assert.deepEqual(offensive.map(({ label, abbreviation }) => [label, abbreviation]), [
  ['Lanzador 1', 'L1'], ['Lanzador 2', 'L2'], ['Rechace 1', 'R1'], ['Rechace 2', 'R2'],
  ['Rematador 1', 'REM1'], ['Rematador 2', 'REM2'], ['Rematador 3', 'REM3'], ['Rematador 4', 'REM4'],
  ['Bloqueo', 'BLQ'], ['Arrastre', 'ARR'], ['Se queda', 'Q'],
]);
assert.equal(defensive.length, 9);
assert.equal(offensive.length, 11);
assert.equal(new Set([...defensive, ...offensive].map(({ id }) => id)).size, 20);
assert.deepEqual(defensive.map(({ order }) => order), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.deepEqual(offensive.map(({ order }) => order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
assert.equal(getSetPieceResponsibility('def_rechace_1').phase, 'defensive');
assert.equal(getSetPieceResponsibility('off_rechace_1').phase, 'offensive');
assert.equal(isValidSetPieceResponsibilityId('def_zona_1', 'defensive'), true);
assert.equal(isValidSetPieceResponsibilityId('def_zona_1', 'offensive'), false);
assert.equal(getSetPieceResponsibility('Zona 1'), null, 'visible labels are not persistent IDs');
assert.equal(getSetPieceResponsibilityPhase('defensive_set_piece'), 'defensive');
assert.equal(getSetPieceResponsibilityPhase('offensive_set_piece'), 'offensive');
assert.equal(allowsMultipleSetPiecePlayers('def_zona_1'), false);
assert.equal(allowsMultipleSetPiecePlayers('def_marca'), true);
assert.equal(allowsMultipleSetPiecePlayers('off_rematador_1'), false);
assert.equal(allowsMultipleSetPiecePlayers('off_bloqueo'), true);
assert.equal(allowsMultipleSetPiecePlayers('off_arrastre'), true);
assert.equal(allowsMultipleSetPiecePlayers('off_se_queda'), false);
assert.equal(SET_PIECE_RESPONSIBILITIES.defensive, defensive);

const borjaZ1 = assignSetPieceResponsibility({}, {
  playerId: 'borja-id', positionKey: 'rival:4', responsibilityId: 'def_zona_1', phase: 'defensive',
});
assert.equal(borjaZ1.ok, true);
const borjaZ2 = assignSetPieceResponsibility(borjaZ1.responsibilities, {
  playerId: 'borja-id', positionKey: 'rival:4', responsibilityId: 'def_zona_2', phase: 'defensive',
});
assert.deepEqual(borjaZ2.responsibilities, {
  'borja-id': { responsibilityId: 'def_zona_2', positionKey: 'rival:4' },
}, 'changing a player responsibility replaces the former one');
assert.deepEqual(borjaZ1.responsibilities, {
  'borja-id': { responsibilityId: 'def_zona_1', positionKey: 'rival:4' },
}, 'assignment does not mutate its source');

const julioZ1 = assignSetPieceResponsibility(borjaZ1.responsibilities, {
  playerId: 'julio-id', positionKey: 'rival:5', responsibilityId: 'def_zona_1', phase: 'defensive',
});
assert.equal(julioZ1.ok, false);
assert.equal(julioZ1.errorCode, 'RESPONSIBILITY_ALREADY_ASSIGNED');
assert.equal(julioZ1.conflictingPlayerId, 'borja-id');
assert.equal(findSetPieceResponsibilityConflict(borjaZ1.responsibilities, 'julio-id', 'def_zona_1'), 'borja-id');
assert.deepEqual(julioZ1.responsibilities, borjaZ1.responsibilities, 'conflict never transfers the assignment');
const conflictingStored = inspectSetPieceResponsibilities({
  'borja-id': { responsibilityId: 'def_zona_1', positionKey: 'rival:4' },
  'julio-id': { responsibilityId: 'def_zona_1', positionKey: 'rival:5' },
}, 'defensive');
assert.equal(conflictingStored[1].conflictingPlayerId, 'borja-id', 'stored uniqueness conflicts remain detectable');

for (const responsibilityId of ['off_rematador_1', 'off_se_queda']) {
  const first = assignSetPieceResponsibility({}, {
    playerId: 'borja-id', positionKey: 'rival:4', responsibilityId, phase: 'offensive',
  });
  const second = assignSetPieceResponsibility(first.responsibilities, {
    playerId: 'julio-id', positionKey: 'rival:5', responsibilityId, phase: 'offensive',
  });
  assert.equal(second.errorCode, 'RESPONSIBILITY_ALREADY_ASSIGNED', `${responsibilityId} is unique`);
}

const borjaMarca = assignSetPieceResponsibility({}, {
  playerId: 'borja-id', positionKey: 'rival:4', responsibilityId: 'def_marca', phase: 'defensive',
});
const julioMarca = assignSetPieceResponsibility(borjaMarca.responsibilities, {
  playerId: 'julio-id', positionKey: 'rival:5', responsibilityId: 'def_marca', phase: 'defensive',
});
assert.equal(julioMarca.ok, true);
assert.equal(Object.keys(julioMarca.responsibilities).length, 2);
assert.equal(findSetPieceResponsibilityConflict(julioMarca.responsibilities, 'vicente-id', 'def_marca'), null);

for (const responsibilityId of ['off_bloqueo', 'off_arrastre']) {
  const first = assignSetPieceResponsibility({}, {
    playerId: 'borja-id', positionKey: 'rival:4', responsibilityId, phase: 'offensive',
  });
  const second = assignSetPieceResponsibility(first.responsibilities, {
    playerId: 'julio-id', positionKey: 'rival:5', responsibilityId, phase: 'offensive',
  });
  assert.equal(second.ok, true, `${responsibilityId} may be assigned to several players`);
}
const wrongPhase = assignSetPieceResponsibility({}, {
  playerId: 'borja-id', positionKey: 'rival:4', responsibilityId: 'def_zona_1', phase: 'offensive',
});
assert.equal(wrongPhase.errorCode, 'INVALID_RESPONSIBILITY_FOR_PHASE');
assert.deepEqual(wrongPhase.responsibilities, {});
assert.deepEqual(getValidSetPieceResponsibilities(borjaZ1.responsibilities, 'offensive'), {});
assert.equal(inspectSetPieceResponsibilities(borjaZ1.responsibilities, 'offensive')[0].validForPhase, false);
assert.deepEqual(normalizeSetPieceResponsibilities(borjaZ1.responsibilities), borjaZ1.responsibilities,
  'wrong-phase entries are preserved in storage even when a phase reader excludes them');

assert.deepEqual(normalizeSetPieceResponsibilities(undefined), {}, 'historical play without assignments remains empty');
assert.deepEqual(normalizeSetPieceResponsibilities(null), {});
const historicalCaudalAssignment = {
  'own-player-id': { responsibilityId: 'def_zona_1', positionKey: 'caudal:4' },
};
assert.deepEqual(normalizeSetPieceResponsibilities(historicalCaudalAssignment), {},
  'an erroneous historical Caudal assignment is removed during normalization');
assert.deepEqual(getValidSetPieceResponsibilities(historicalCaudalAssignment, 'defensive'), {},
  'an erroneous historical Caudal assignment is never rendered as a rival assignment');
const rivalAfterHistoricalCaudal = assignSetPieceResponsibility(historicalCaudalAssignment, {
  playerId: 'rival-player-id', positionKey: 'rival:4', responsibilityId: 'def_zona_1', phase: 'defensive',
});
assert.equal(rivalAfterHistoricalCaudal.ok, true,
  'a historical Caudal entry cannot block the canonical rival assignment');
assert.equal(rivalAfterHistoricalCaudal.responsibilities['own-player-id'], undefined);
assert.deepEqual(removeSetPieceResponsibility(julioMarca.responsibilities, 'julio-id'), borjaMarca.responsibilities);
assert.equal(Object.keys(julioMarca.responsibilities).length, 2, 'removal is immutable');

const originalPlay = {
  id: 'original', setPieceType: 'defensive_set_piece', responsibilities: borjaZ1.responsibilities,
};
const duplicatedPlay = {
  ...originalPlay, id: 'copy', responsibilities: normalizeSetPieceResponsibilities(originalPlay.responsibilities),
};
assert.notEqual(duplicatedPlay.responsibilities, originalPlay.responsibilities);
assert.notEqual(duplicatedPlay.responsibilities['borja-id'], originalPlay.responsibilities['borja-id']);
duplicatedPlay.responsibilities['borja-id'].responsibilityId = 'def_zona_2';
assert.equal(originalPlay.responsibilities['borja-id'].responsibilityId, 'def_zona_1');

const stored = JSON.parse(JSON.stringify({ setPiecePhaseV1: {
  plays: [{ ...originalPlay, responsibilities: normalizeSetPieceResponsibilities(originalPlay.responsibilities) }],
} }));
assert.deepEqual(normalizeSetPieceResponsibilities(stored.setPiecePhaseV1.plays[0].responsibilities), {
  'borja-id': { responsibilityId: 'def_zona_1', positionKey: 'rival:4' },
}, 'JSON persistence preserves player ID, position key and canonical responsibility ID');
const historicalStored = JSON.parse(JSON.stringify({ setPiecePhaseV1: { plays: [{ id: 'old' }] } }));
assert.deepEqual(normalizeSetPieceResponsibilities(historicalStored.setPiecePhaseV1.plays[0].responsibilities), {});

const unchangedXi = { 'rival:4': 'borja-id' };
const changedXi = { 'rival:4': 'vicente-id' };
assert.equal(inspectSetPieceResponsibilities(borjaZ1.responsibilities, 'defensive', unchangedXi)[0].needsReview, false);
const review = inspectSetPieceResponsibilities(borjaZ1.responsibilities, 'defensive', changedXi)[0];
assert.equal(review.needsReview, true);
assert.equal(review.playerId, 'borja-id');
assert.equal(review.currentPlayerId, 'vicente-id');
assert.equal(review.responsibilityId, 'def_zona_1', 'the responsibility remains with its original player');
assert.equal(inspectSetPieceResponsibilities(borjaZ1.responsibilities, 'defensive', {})[0].needsReview, true);
assert.equal(inspectSetPieceResponsibilities(borjaZ1.responsibilities, 'defensive')[0].needsReview, false, 'no XI evidence means no inferred mismatch');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(appSource, /responsibilities: normalizeSetPieceResponsibilities\(play\.responsibilities\)/, 'reload normalizes old and new plays');
assert.match(appSource, /responsibilities: normalizeSetPieceResponsibilities\(selectedSetPiecePlay\.responsibilities\)/, 'duplication copies assignment objects');
assert.match(appSource, /responsibilities: \{\}/, 'new play begins without inferred assignments');
assert.match(appSource, /phaseField: 'setPiecePhaseV1'/, 'existing workspace persistence remains the save path');
assert.match(appSource, /\.update\(\{ pre_ai_analysis: nextPreAiAnalysis \}\)/, 'the existing Supabase column saves the workspace');

console.log('setPieceResponsibilities tests passed');
