import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addTacticalPlayToContext,
  buildTacticalWorkspaceKey,
  getTacticalPlayWorkspaceKey,
  hasExplicitTacticalSystemContext,
  isLegacyUnclassifiedTacticalPlay,
  resetTacticalPlayPositions,
  resolveTacticalActivePlayId,
  selectTacticalPlayInContext,
  tacticalPlayMatchesWorkspaceContext,
  withExplicitTacticalSystemContext,
} from './tacticalWorkspaceContext.js';
import {
  addOffensivePlayToWorkspace,
  cloneOffensivePlay,
  deleteOffensivePlayFromWorkspace,
  resolveOffensiveActivePlayId,
} from './offensivePlayWorkspace.js';

const pairA = { caudalSystem: '4-2-3-1', rivalSystem: '3-4-3' };
const pairB = { caudalSystem: '4-3-3', rivalSystem: '3-4-3' };
const pairC = { caudalSystem: '4-2-3-1', rivalSystem: '4-4-2' };
const offensiveContext = (pair, situation = 'creation', style = 'combinative') => ({
  ...pair, macroPhase: 'offensive', situation, variantParts: [style],
});
const defensiveContext = (pair, situation = 'mid_block') => ({
  ...pair, macroPhase: 'defensive', situation, variantParts: [],
});
const transitionContext = (pair, type = 'offensive_transition', zone = 'defensive_half', behaviour = 'fast_attack') => ({
  ...pair, macroPhase: 'transition', situation: type, variantParts: [zone, behaviour],
});
const payload = (marker) => ({
  playerPositions: { 'caudal:1': { x: marker.charCodeAt(0), y: 22 } },
  ballStartPosition: { x: marker.charCodeAt(0), y: 44 },
  ballVisible: true,
  arrows: [
    { id: `${marker}-pass`, type: 'pass', start: { x: 10, y: 20 }, end: { x: 30, y: 40 } },
    { id: `${marker}-movement`, type: 'movement', start: { x: 50, y: 60 }, end: { x: 70, y: 80 } },
  ],
  description: `Payload ${marker}`,
});
const makeOffensivePlay = (id, pair, marker, situation = 'creation', playStyle = 'combinative') => (
  withExplicitTacticalSystemContext({
    id, phase: 'offensive', name: id, offensiveSituation: situation, playStyle, ...payload(marker),
  }, pair)
);
const makeDefensivePlay = (id, pair, situation = 'mid_block') => withExplicitTacticalSystemContext({
  id, name: id, defensiveSituation: situation, ...payload(id),
}, pair);
const makeTransitionPlay = (
  id,
  pair,
  type = 'offensive_transition',
  zone = 'defensive_half',
  behaviour = 'fast_attack'
) => withExplicitTacticalSystemContext({
  id, phase: 'transition', name: id, transitionType: type, fieldZone: zone, behaviour, ...payload(id),
}, pair);
const emptyWorkspace = () => ({ activePlayIdByContext: {}, plays: [] });
const resolve = (workspace, context) => {
  const id = resolveTacticalActivePlayId({
    plays: workspace.plays,
    activePlayIdByContext: workspace.activePlayIdByContext,
    context,
  });
  return workspace.plays.find((play) => play.id === id) || null;
};

// 1. Cambio Caudal: A -> B -> A -> B recupera payloads completos aislados.
const playA = makeOffensivePlay('A', pairA, 'A');
const playB = makeOffensivePlay('B', pairB, 'B');
let workspace = addTacticalPlayToContext(emptyWorkspace(), playA);
workspace = addTacticalPlayToContext(workspace, playB);
for (const [context, expected] of [
  [offensiveContext(pairA), playA], [offensiveContext(pairB), playB],
  [offensiveContext(pairA), playA], [offensiveContext(pairB), playB],
]) assert.deepEqual(resolve(workspace, context), expected);

// 2. Cambiar el sistema rival queda igualmente aislado.
const playC = makeOffensivePlay('C', pairC, 'C');
workspace = addTacticalPlayToContext(workspace, playC);
assert.deepEqual(resolve(workspace, offensiveContext(pairA)), playA);
assert.deepEqual(resolve(workspace, offensiveContext(pairC)), playC);

// 3. Ciclo complejo A -> B -> C -> A -> B -> A sin contaminación.
for (const [pair, id] of [[pairA, 'A'], [pairB, 'B'], [pairC, 'C'], [pairA, 'A'], [pairB, 'B'], [pairA, 'A']]) {
  assert.equal(resolve(workspace, offensiveContext(pair)).id, id);
}

// 4. Combinativo/Directo sigue separado dentro de la pareja.
const directA = makeOffensivePlay('A-direct', pairA, 'D', 'creation', 'direct');
let offensiveWorkspace = addOffensivePlayToWorkspace({
  activePlayIdByContext: {}, activePlayIdBySituation: {}, activePlayStyleBySituation: {}, plays: [],
}, playA);
offensiveWorkspace = addOffensivePlayToWorkspace(offensiveWorkspace, directA);
const resolveOffensive = (playStyle) => resolveOffensiveActivePlayId({
  ...pairA,
  plays: offensiveWorkspace.plays,
  activePlayIdByContext: offensiveWorkspace.activePlayIdByContext,
  activePlayIdBySituation: offensiveWorkspace.activePlayIdBySituation,
  situation: 'creation',
  playStyle,
});
assert.equal(resolveOffensive('combinative'), playA.id);
assert.equal(resolveOffensive('direct'), directA.id);

// 5. Inicio/Creación/Finalización no comparten jugadas.
for (const situation of ['build_up', 'creation', 'finishing']) {
  const play = makeOffensivePlay(`A-${situation}`, pairA, situation[0], situation);
  workspace = addTacticalPlayToContext(workspace, play);
  assert.equal(resolve(workspace, offensiveContext(pairA, situation)).id, play.id);
}

// 6. Defensa: bloques reales y dos parejas.
let defensiveWorkspace = emptyWorkspace();
for (const situation of ['low_block', 'mid_block', 'high_block']) {
  const a = makeDefensivePlay(`def-A-${situation}`, pairA, situation);
  const b = makeDefensivePlay(`def-B-${situation}`, pairB, situation);
  defensiveWorkspace = addTacticalPlayToContext(defensiveWorkspace, a);
  defensiveWorkspace = addTacticalPlayToContext(defensiveWorkspace, b);
  assert.equal(resolve(defensiveWorkspace, defensiveContext(pairA, situation)).id, a.id);
  assert.equal(resolve(defensiveWorkspace, defensiveContext(pairB, situation)).id, b.id);
}

// 7. Transiciones: varias combinaciones reales y dos parejas.
let transitionWorkspace = emptyWorkspace();
const transitionVariants = [
  ['offensive_transition', 'defensive_half', 'fast_attack'],
  ['offensive_transition', 'attacking_half', 'keep_possession'],
  ['defensive_transition', 'defensive_half', 'counterpress'],
  ['defensive_transition', 'attacking_half', 'retreat'],
];
for (const [type, zone, behaviour] of transitionVariants) {
  for (const [pair, suffix] of [[pairA, 'A'], [pairB, 'B']]) {
    const play = makeTransitionPlay(`tr-${suffix}-${type}-${zone}-${behaviour}`, pair, type, zone, behaviour);
    transitionWorkspace = addTacticalPlayToContext(transitionWorkspace, play);
    assert.equal(resolve(transitionWorkspace, transitionContext(pair, type, zone, behaviour)).id, play.id);
  }
}

// 8. Un active ID de otra pareja se rechaza.
const keyA = buildTacticalWorkspaceKey(offensiveContext(pairA));
const wrongActive = { ...workspace, activePlayIdByContext: { [keyA]: playB.id } };
assert.equal(resolve(wrongActive, offensiveContext(pairA)).id, playA.id);

// 9. Nueva jugada captura pareja y procedencia/versionado.
const newPlay = withExplicitTacticalSystemContext({ id: 'new', defensiveSituation: 'mid_block' }, pairC);
assert.equal(newPlay.systemContextVersion, 1);
assert.equal(newPlay.systemContextSource, 'explicit_selection');
assert.equal(hasExplicitTacticalSystemContext(newPlay), true);

// 10. Duplicar conserva pareja/contexto/contenido con otro ID.
let arrowIndex = 0;
const duplicate = cloneOffensivePlay(playA, {
  playId: 'A-copy', createArrowId: () => `copy-${++arrowIndex}`, timestamp: '2026-09-22T12:00:00.000Z',
});
assert.notEqual(duplicate.id, playA.id);
assert.equal(getTacticalPlayWorkspaceKey(duplicate), getTacticalPlayWorkspaceKey(playA));
assert.deepEqual(duplicate.playerPositions, playA.playerPositions);
assert.equal(duplicate.description, playA.description);

// 11. Eliminar no selecciona otra pareja.
offensiveWorkspace = addOffensivePlayToWorkspace(offensiveWorkspace, duplicate);
offensiveWorkspace = deleteOffensivePlayFromWorkspace(offensiveWorkspace, {
  ...pairA, situation: 'creation', playStyle: 'combinative', playId: duplicate.id,
});
assert.equal(offensiveWorkspace.plays.some((play) => play.id === duplicate.id), false);
assert.equal(resolveOffensiveActivePlayId({
  ...pairA,
  plays: offensiveWorkspace.plays,
  activePlayIdByContext: offensiveWorkspace.activePlayIdByContext,
  situation: 'creation',
  playStyle: 'combinative',
}), playA.id);

// 12. Restablecer cambia posiciones, no identidad.
const reset = resetTacticalPlayPositions(playA, { 'caudal:1': { x: 1, y: 2 } });
assert.deepEqual(reset.playerPositions, { 'caudal:1': { x: 1, y: 2 } });
for (const field of ['id', 'caudalSystem', 'rivalSystem', 'systemContextVersion', 'systemContextSource']) {
  assert.equal(reset[field], playA[field]);
}

// 13-15. Sin sistemas, con uno, o con 4-4-2 legacy normalizado: unclassified.
const legacyNoSystems = { id: 'legacy-none', phase: 'offensive', offensiveSituation: 'creation', playStyle: 'combinative' };
const legacyOneSystem = { ...legacyNoSystems, id: 'legacy-one', caudalSystem: '4-4-2' };
const legacyDefaulted = { ...legacyNoSystems, id: 'legacy-defaulted', caudalSystem: '4-4-2', rivalSystem: '4-4-2' };
for (const legacy of [legacyNoSystems, legacyOneSystem, legacyDefaulted]) {
  assert.equal(isLegacyUnclassifiedTacticalPlay(legacy), true);
  assert.equal(tacticalPlayMatchesWorkspaceContext(
    legacy,
    offensiveContext({ caudalSystem: '4-4-2', rivalSystem: '4-4-2' })
  ), false);
}

// 16. Un 4-4-2 nuevo explícito sí pertenece a 4-4-2.
const explicit442 = makeOffensivePlay('explicit-442', { caudalSystem: '4-4-2', rivalSystem: '4-4-2' }, 'E');
assert.equal(tacticalPlayMatchesWorkspaceContext(
  explicit442,
  offensiveContext({ caudalSystem: '4-4-2', rivalSystem: '4-4-2' })
), true);

// 17. Roundtrip JSON conserva identidad, contenido y clasificación legacy.
const roundtrip = JSON.parse(JSON.stringify({ activePlayIdByContext: workspace.activePlayIdByContext, plays: [playA, legacyDefaulted] }));
assert.deepEqual(roundtrip.plays[0], playA);
assert.deepEqual(roundtrip.plays[1], legacyDefaulted);
assert.equal(hasExplicitTacticalSystemContext(roundtrip.plays[0]), true);
assert.equal(isLegacyUnclassifiedTacticalPlay(roundtrip.plays[1]), true);

// 18. La plantilla se instancia bajo la pareja seleccionada, no bajo sus sistemas base.
const template = { id: 'template', baseCaudalSystem: '5-3-2', baseRivalSystem: '4-4-2', playerPositions: payload('T').playerPositions };
const templatePlay = withExplicitTacticalSystemContext({
  id: 'from-template', phase: 'offensive', offensiveSituation: 'creation', playStyle: 'combinative',
  sourceTemplateId: template.id, playerPositions: template.playerPositions,
}, pairB);
assert.equal(templatePlay.caudalSystem, pairB.caudalSystem);
assert.equal(templatePlay.rivalSystem, pairB.rivalSystem);
assert.notEqual(templatePlay.caudalSystem, template.baseCaudalSystem);

// Seleccionar solo cambia el índice; no reclasifica jugadas.
const beforeSelection = JSON.stringify(workspace.plays);
const selectedWorkspace = selectTacticalPlayInContext(workspace, playA.id, offensiveContext(pairA));
assert.equal(selectedWorkspace.activePlayIdByContext[keyA], playA.id);
assert.equal(JSON.stringify(selectedWorkspace.plays), beforeSelection);

// 19. No regresión ABP: su normalizador/resolutor no recibe la nueva identidad.
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const setPieceSource = appSource.slice(
  appSource.indexOf('const createEmptySetPieceWorkspace ='),
  appSource.indexOf('const normalizeDefensiveFormationPositions', appSource.indexOf('const createEmptySetPieceWorkspace ='))
);
assert.doesNotMatch(setPieceSource, /systemContextVersion|systemContextSource|buildTacticalWorkspaceKey/);
assert.match(setPieceSource, /getSetPieceContextKey/);
assert.match(appSource, /Jugadas anteriores sin clasificar/);

console.log('tacticalWorkspaceContext tests passed');
