import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  RIVAL_CORNER_REFERENCE_ROLES,
  buildRivalCornerReferencesPrintModel,
  getCanonicalRivalCornerPlayerId,
  getRivalCornerRoleIds,
  normalizeRivalCornerPlayExtension,
  normalizeRivalCornerReferences,
  toggleRivalCornerReference,
} from './setPieceRivalCornerReferences.js';

const playerAId = '11111111-1111-4111-8111-111111111111';
const playerBId = '22222222-2222-4222-8222-222222222222';
const playerCId = '33333333-3333-4333-8333-333333333333';
const playerDId = '44444444-4444-4444-8444-444444444444';
const players = [
  { globalPlayerId: playerAId, id: 'legacy-a', number: 10, name: 'Pablo' },
  { jugadorRivalId: playerBId, id: 'legacy-b', number: 5, name: 'Diego' },
  { id: playerCId, number: '', name: 'Luis' },
  { globalPlayerId: playerDId, number: 2, name: 'Juan' },
];

assert.deepEqual(RIVAL_CORNER_REFERENCE_ROLES.map(({ id }) => id), [
  'corner_taker', 'corner_target', 'corner_second_ball', 'corner_stay_back',
]);
assert.equal(getCanonicalRivalCornerPlayerId(players[0]), playerAId, 'globalPlayerId tiene prioridad');
assert.equal(getCanonicalRivalCornerPlayerId(players[1]), playerBId, 'jugadorRivalId es el segundo fallback');
assert.equal(getCanonicalRivalCornerPlayerId(players[2]), playerCId, 'id UUID es el último fallback');
assert.equal(getCanonicalRivalCornerPlayerId({ id: 'rival:0', name: 'Temporal' }), '', 'nunca persiste índices visuales');

let references = toggleRivalCornerReference({}, {
  playerId: playerAId, positionKey: 'rival:1', roleId: 'corner_taker',
});
assert.deepEqual(getRivalCornerRoleIds(references, playerAId), ['corner_taker'], 'un jugador puede tener un rol');
references = toggleRivalCornerReference(references, {
  playerId: playerAId, positionKey: 'rival:1', roleId: 'corner_target',
});
assert.deepEqual(getRivalCornerRoleIds(references, playerAId), ['corner_taker', 'corner_target'], 'un jugador puede tener varios roles');
references = toggleRivalCornerReference(references, {
  playerId: playerBId, positionKey: 'rival:2', roleId: 'corner_target',
});
assert.equal(Object.values(references).filter((entry) => entry.roles.includes('corner_target')).length, 2, 'un rol admite varios jugadores');
const reordered = toggleRivalCornerReference(references, {
  playerId: playerAId, positionKey: 'rival:8', roleId: 'corner_second_ball',
});
assert.deepEqual(getRivalCornerRoleIds(reordered, playerAId), ['corner_taker', 'corner_target', 'corner_second_ball']);
assert.equal(reordered[playerAId].positionKey, 'rival:8', 'positionKey se actualiza solo como dato auxiliar');
assert.ok(reordered[playerAId], 'el UUID conserva la referencia al cambiar de posición');
assert.deepEqual(normalizeRivalCornerReferences({
  'rival:0': { roles: ['corner_taker'], positionKey: 'rival:0' },
  [playerAId]: { roles: ['corner_taker', 'desconocido'], positionKey: 'rival:9' },
}), { [playerAId]: { roles: ['corner_taker'], positionKey: 'rival:9' } });

assert.deepEqual(normalizeRivalCornerPlayExtension({}), {
  includeRivalReferencesInPrint: false,
  rivalCornerReferences: {},
}, 'una jugada histórica sin propiedad no entra en impresión');
assert.equal(normalizeRivalCornerPlayExtension({ includeRivalReferencesInPrint: true }).includeRivalReferencesInPrint, true);
assert.equal(normalizeRivalCornerPlayExtension({ includeRivalReferencesInPrint: false }).includeRivalReferencesInPrint, false);

const play = (id, name, include, rivalCornerReferences = references) => ({
  id, name, setPieceType: 'offensive_set_piece', setPieceAction: 'corner',
  includeRivalReferencesInPrint: include, rivalCornerReferences,
});
const model = buildRivalCornerReferencesPrintModel({
  preAiAnalysis: { setPiecePhaseV1: { plays: [
    play('stable-1', 'Córner corto', true),
    play('stable-2', 'Córner cerrado', true, {
      [playerCId]: { roles: ['corner_second_ball'], positionKey: 'rival:4' },
      [playerDId]: { roles: ['corner_stay_back'], positionKey: 'rival:5' },
    }),
    play('stable-3', 'Bloqueo', false),
  ] } },
  rivalPlayers: players,
});
assert.equal(model.length, 2, 'solo imprime jugadas activadas');
assert.deepEqual(model.map(({ id, name }) => [id, name]), [
  ['stable-1', 'Córner corto'], ['stable-2', 'Córner cerrado'],
], 'las jugadas permanecen separadas por ID estable y nombre visible');
assert.deepEqual(model[0].roles.find(({ id }) => id === 'corner_taker').players, ['10 Pablo']);
assert.deepEqual(model[0].roles.find(({ id }) => id === 'corner_target').players, ['10 Pablo', '5 Diego']);
assert.deepEqual(model[1].roles.find(({ id }) => id === 'corner_second_ball').players, ['Luis'], 'sin dorsal muestra solo nombre');
assert.deepEqual(model[1].roles.find(({ id }) => id === 'corner_stay_back').players, ['2 Juan']);
assert.equal(model.every((item) => item.roles.length === 4), true, 'mantiene siempre las cuatro categorías');
assert.deepEqual(buildRivalCornerReferencesPrintModel({
  preAiAnalysis: { setPiecePhaseV1: { plays: [play('off', 'No incluir', false)] } }, rivalPlayers: players,
}), [], 'impresión desactivada produce cero modelo');

for (const count of [1, 2, 3]) {
  const result = buildRivalCornerReferencesPrintModel({
    preAiAnalysis: { setPiecePhaseV1: { plays: Array.from({ length: count }, (_, index) => play(`p-${index}`, `Jugada ${index + 1}`, true)) } },
    rivalPlayers: players,
  });
  assert.equal(result.length, count, `la impresión conserva ${count} jugada(s)`);
}

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const rosterResolverSource = appSource.slice(
  appSource.indexOf('const getRivalReferencePlayers ='),
  appSource.indexOf('const getRivalFormationSlots =')
);
assert.match(rosterResolverSource, /selectedMatchRivalTeam\?\.squad \|\| getRivalBaseTeam\(\)\?\.squad/,
  'la impresión resuelve contra la plantilla rival completa');
assert.doesNotMatch(rosterResolverSource, /Titular|Suplente|needsReview|convocad/i,
  'el resolver de impresión no filtra por XI, convocatoria ni revisión');
assert.match(appSource, /includeRivalReferencesInPrint: isRivalOffensiveCornerPlay\([\s\S]*\)/, 'una jugada nueva de córner rival activa impresión');
assert.match(appSource, /includeRivalReferencesInPrint: selectedSetPiecePlay\.includeRivalReferencesInPrint === true/, 'duplicar conserva el booleano exacto');
assert.match(appSource, /rivalCornerReferences: normalizeRivalCornerReferences\(selectedSetPiecePlay\.rivalCornerReferences\)/, 'duplicar conserva UUID y roles');
assert.match(appSource, /phaseField: 'setPiecePhaseV1'/, 'persiste exclusivamente en preAiAnalysis.setPiecePhaseV1');

console.log('setPieceRivalCornerReferences tests passed');
