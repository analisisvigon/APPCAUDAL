import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  RIVAL_CORNER_REFERENCE_ROLES,
  RIVAL_CORNER_RESPONSIBILITY_PRINT_ROLE,
  buildRivalCornerReferencesPrintModel,
  getCanonicalRivalCornerPlayerId,
  getRivalCornerRoleIds,
  normalizeRivalCornerPlayExtension,
  normalizeRivalCornerReferences,
  toggleRivalCornerReference,
} from './setPieceRivalCornerReferences.js';
import { getSetPieceResponsibility } from './setPieceResponsibilities.js';
import { createFlushableSaveCoordinator } from './flushableSaveCoordinator.js';

const ids = {
  a: '11111111-1111-4111-8111-111111111111',
  b: '22222222-2222-4222-8222-222222222222',
  c: '33333333-3333-4333-8333-333333333333',
  d: '44444444-4444-4444-8444-444444444444',
  e: '55555555-5555-4555-8555-555555555555',
  f: '66666666-6666-4666-8666-666666666666',
};
const players = [
  { globalPlayerId: ids.a, id: 'legacy-a', number: 10, name: 'Pablo' },
  { jugadorRivalId: ids.b, id: 'legacy-b', number: 5, name: 'Diego' },
  { id: ids.c, number: '', name: 'Luis' },
  { globalPlayerId: ids.d, number: 2, name: 'Juan' },
  { globalPlayerId: ids.e, number: 9, name: 'Marco' },
  { globalPlayerId: ids.f, number: 4, name: 'Hugo' },
];

assert.deepEqual(RIVAL_CORNER_REFERENCE_ROLES.map(({ id }) => id), [
  'corner_taker', 'corner_target', 'corner_second_ball', 'corner_stay_back',
]);
assert.deepEqual(RIVAL_CORNER_RESPONSIBILITY_PRINT_ROLE, {
  off_lanzador_1: 'corner_taker',
  off_lanzador_2: 'corner_taker',
  off_rematador_1: 'corner_target',
  off_rematador_2: 'corner_target',
  off_rematador_3: 'corner_target',
  off_rematador_4: 'corner_target',
  off_rechace_1: 'corner_second_ball',
  off_rechace_2: 'corner_second_ball',
  off_se_queda: 'corner_stay_back',
});
Object.keys(RIVAL_CORNER_RESPONSIBILITY_PRINT_ROLE).forEach((responsibilityId) => {
  assert.equal(getSetPieceResponsibility(responsibilityId)?.phase, 'offensive', `${responsibilityId} es canónico y ofensivo`);
});
assert.equal(RIVAL_CORNER_RESPONSIBILITY_PRINT_ROLE.off_bloqueo, undefined);
assert.equal(RIVAL_CORNER_RESPONSIBILITY_PRINT_ROLE.off_arrastre, undefined);

assert.equal(getCanonicalRivalCornerPlayerId(players[0]), ids.a, 'globalPlayerId tiene prioridad');
assert.equal(getCanonicalRivalCornerPlayerId(players[1]), ids.b, 'jugadorRivalId es el segundo fallback');
assert.equal(getCanonicalRivalCornerPlayerId(players[2]), ids.c, 'id UUID es el último fallback');
assert.equal(getCanonicalRivalCornerPlayerId({ id: 'rival:0', name: 'Temporal' }), '', 'nunca persiste índices visuales');

let references = toggleRivalCornerReference({}, {
  playerId: ids.a, positionKey: 'rival:1', roleId: 'corner_taker',
});
references = toggleRivalCornerReference(references, {
  playerId: ids.a, positionKey: 'rival:1', roleId: 'corner_target',
});
references = toggleRivalCornerReference(references, {
  playerId: ids.b, positionKey: 'rival:2', roleId: 'corner_target',
});
assert.deepEqual(getRivalCornerRoleIds(references, ids.a), ['corner_taker', 'corner_target']);
assert.equal(Object.values(references).filter((entry) => entry.roles.includes('corner_target')).length, 2);
assert.deepEqual(normalizeRivalCornerReferences({
  'rival:0': { roles: ['corner_taker'], positionKey: 'rival:0' },
  [ids.a]: { roles: ['corner_taker', 'desconocido'], positionKey: 'rival:9' },
}), { [ids.a]: { roles: ['corner_taker'], positionKey: 'rival:9' } });

assert.deepEqual(normalizeRivalCornerPlayExtension({}), {
  includeRivalReferencesInPrint: false,
  rivalCornerReferences: {},
}, 'una jugada histórica sin propiedad no entra en impresión');
assert.equal(normalizeRivalCornerPlayExtension({ includeRivalReferencesInPrint: false }).includeRivalReferencesInPrint, false);
const reloadedToggle = normalizeRivalCornerPlayExtension(JSON.parse(JSON.stringify({
  includeRivalReferencesInPrint: true,
  rivalCornerReferences: {},
})));
assert.equal(reloadedToggle.includeRivalReferencesInPrint, true, 'el toggle true sobrevive guardado JSON y recarga');

let toggleWorkspace = { plays: [{
  id: 'toggle-play',
  includeRivalReferencesInPrint: false,
  rivalCornerReferences: {},
}] };
let persistedToggleAnalysis = null;
const toggleSaveCoordinator = createFlushableSaveCoordinator({
  readSnapshot: () => ({ setPiecePhaseV1: toggleWorkspace }),
  persist: async (snapshot) => {
    persistedToggleAnalysis = JSON.parse(JSON.stringify(snapshot));
    return { ok: true };
  },
});
const updatePrintToggle = (checked) => {
  toggleSaveCoordinator.markDirty();
  toggleWorkspace = {
    ...toggleWorkspace,
    plays: toggleWorkspace.plays.map((item) => item.id === 'toggle-play'
      ? { ...item, includeRivalReferencesInPrint: checked === true }
      : item),
  };
};
updatePrintToggle(true);
assert.equal(toggleWorkspace.plays[0].includeRivalReferencesInPrint, true, 'activar el control cambia el estado a true');
assert.equal(toggleSaveCoordinator.hasPending(), true, 'activar el control deja autoguardado pendiente');
assert.equal((await toggleSaveCoordinator.flush()).ok, true);
assert.equal(normalizeRivalCornerPlayExtension(
  persistedToggleAnalysis.setPiecePhaseV1.plays[0]
).includeRivalReferencesInPrint, true, 'tras guardar y recargar/F5 el toggle sigue true');

const play = (id, name, include, { responsibilities = {}, rivalCornerReferences = {} } = {}) => ({
  id,
  name,
  setPieceType: 'offensive_set_piece',
  setPieceAction: 'corner',
  includeRivalReferencesInPrint: include,
  responsibilities,
  rivalCornerReferences,
});
const covadongaResponsibilities = {
  [ids.a]: { responsibilityId: 'off_lanzador_1', positionKey: 'rival:0' },
  [ids.b]: { responsibilityId: 'off_rematador_1', positionKey: 'rival:1' },
  [ids.c]: { responsibilityId: 'off_rematador_2', positionKey: 'rival:2' },
  [ids.d]: { responsibilityId: 'off_rematador_3', positionKey: 'rival:3' },
  [ids.e]: { responsibilityId: 'off_rematador_4', positionKey: 'rival:4' },
  [ids.f]: { responsibilityId: 'off_se_queda', positionKey: 'rival:5' },
};
const model = buildRivalCornerReferencesPrintModel({
  preAiAnalysis: { setPiecePhaseV1: { plays: [
    play('stable-1', 'Córner Covadonga', true, { responsibilities: covadongaResponsibilities }),
    play('stable-2', 'Córner cerrado', true, { responsibilities: {
      [ids.a]: { responsibilityId: 'off_lanzador_2', positionKey: 'rival:0' },
      [ids.c]: { responsibilityId: 'off_rechace_1', positionKey: 'rival:2' },
    } }),
    play('stable-3', 'No incluir', false, { responsibilities: covadongaResponsibilities }),
  ] } },
  rivalPlayers: players,
});
assert.equal(model.length, 2, 'dos córners activados producen dos bloques separados');
assert.deepEqual(model.map(({ id, name }) => [id, name]), [
  ['stable-1', 'Córner Covadonga'], ['stable-2', 'Córner cerrado'],
]);
assert.deepEqual(model[0].roles.find(({ id }) => id === 'corner_taker').players, ['10 Pablo']);
assert.deepEqual(model[0].roles.find(({ id }) => id === 'corner_target').players, ['5 Diego', 'Luis', '2 Juan', '9 Marco']);
assert.deepEqual(model[0].roles.find(({ id }) => id === 'corner_second_ball').players, []);
assert.deepEqual(model[0].roles.find(({ id }) => id === 'corner_stay_back').players, ['4 Hugo']);
assert.deepEqual(model[1].roles.find(({ id }) => id === 'corner_second_ball').players, ['Luis']);
assert.equal(model.every((item) => item.roles.length === 4), true, 'siempre mantiene las cuatro categorías');

for (const include of [false, undefined]) {
  assert.deepEqual(buildRivalCornerReferencesPrintModel({
    preAiAnalysis: { setPiecePhaseV1: { plays: [play('off', 'No imprimir', include, { responsibilities: covadongaResponsibilities })] } },
    rivalPlayers: players,
  }), [], include === false ? 'toggle false no imprime' : 'toggle legacy ausente no imprime');
}

const legacyModel = buildRivalCornerReferencesPrintModel({
  preAiAnalysis: { setPiecePhaseV1: { plays: [play('legacy', 'Referencia legacy', true, { rivalCornerReferences: references })] } },
  rivalPlayers: players,
});
assert.deepEqual(legacyModel[0].roles.find(({ id }) => id === 'corner_taker').players, ['10 Pablo']);
assert.deepEqual(legacyModel[0].roles.find(({ id }) => id === 'corner_target').players, ['10 Pablo', '5 Diego'], 'el fallback legacy se conserva');

const canonicalPriorityModel = buildRivalCornerReferencesPrintModel({
  preAiAnalysis: { setPiecePhaseV1: { plays: [play('priority', 'Prioridad', true, {
    responsibilities: {
      [ids.a]: { responsibilityId: 'off_rematador_1', positionKey: 'rival:0' },
      [ids.b]: { responsibilityId: 'off_bloqueo', positionKey: 'rival:1' },
      [ids.c]: { responsibilityId: 'off_arrastre', positionKey: 'rival:2' },
    },
    rivalCornerReferences: {
      [ids.a]: { roles: ['corner_taker'], positionKey: 'rival:0' },
      [ids.b]: { roles: ['corner_target'], positionKey: 'rival:1' },
      [ids.c]: { roles: ['corner_target'], positionKey: 'rival:2' },
    },
  })] } },
  rivalPlayers: players,
});
assert.deepEqual(canonicalPriorityModel[0].roles.find(({ id }) => id === 'corner_taker').players, []);
assert.deepEqual(canonicalPriorityModel[0].roles.find(({ id }) => id === 'corner_target').players, ['10 Pablo'], 'responsibilities prevalece; bloqueo y arrastre no se imprimen');

const unresolvedModel = buildRivalCornerReferencesPrintModel({
  preAiAnalysis: { setPiecePhaseV1: { plays: [play('unresolved', 'No resoluble', true, { responsibilities: {
    '77777777-7777-4777-8777-777777777777': { responsibilityId: 'off_rechace_2', positionKey: 'rival:7' },
  } })] } },
  rivalPlayers: players,
});
assert.deepEqual(unresolvedModel[0].roles.find(({ id }) => id === 'corner_second_ball').players, [], 'UUID no resoluble no rompe ni inventa identidad');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const rosterResolverSource = appSource.slice(
  appSource.indexOf('const getRivalReferencePlayers ='),
  appSource.indexOf('const getRivalFormationSlots =')
);
assert.match(rosterResolverSource, /selectedMatchRivalTeam\?\.squad \|\| getRivalBaseTeam\(\)\?\.squad/,
  'impresión resuelve contra la plantilla rival completa');
assert.doesNotMatch(rosterResolverSource, /Titular|Suplente|needsReview|convocad/i,
  'no filtra por XI, convocatoria ni revisión');
assert.match(appSource, /checked=\{selectedSetPiecePlay\.includeRivalReferencesInPrint === true\}/,
  'el toggle conserva el booleano exacto');
assert.match(appSource, /includeRivalReferencesInPrint: event\.target\.checked === true/,
  'el toggle actualiza la jugada y dispara el flujo de guardado existente');
assert.match(appSource, /rivalCornerReferences: normalizeRivalCornerReferences\(selectedSetPiecePlay\.rivalCornerReferences\)/,
  'duplicar conserva datos legacy sin crear otros nuevos');
assert.match(appSource, /phaseField: 'setPiecePhaseV1'/, 'persiste en preAiAnalysis.setPiecePhaseV1');
assert.match(appSource, /\.update\(\{ pre_ai_analysis: nextPreAiAnalysis \}\)/, 'el autoguardado persiste el toggle en Supabase');

console.log('setPieceRivalCornerReferences tests passed');
