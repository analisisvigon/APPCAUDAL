import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './tacticalWorkspaceContext.test.js';
import {
  addOffensivePlayToWorkspace,
  cloneOffensivePlay,
  deleteOffensivePlayFromWorkspace,
  getOffensivePlayContextKey,
  navigateOffensivePlayStyle,
  resolveOffensiveActivePlayId,
  selectOffensivePlayInWorkspace,
} from './offensivePlayWorkspace.js';

const emptyWorkspace = () => ({
  version: 1,
  activeSituation: 'build_up',
  activePlayStyleBySituation: {
    build_up: 'combinative',
    creation: 'combinative',
    finishing: 'combinative',
  },
  activePlayIdByContext: {},
  activePlayIdBySituation: {},
  plays: [],
});

const buildPlay = (id, situation, playStyle, marker) => ({
  id,
  phase: 'offensive',
  name: `Jugada ${marker}`,
  offensiveSituation: situation,
  playStyle,
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  playerPositions: {
    'rival:1': { x: marker === 'A' ? 21 : 71, y: marker === 'A' ? 31 : 61 },
    'caudal:1': { x: marker === 'A' ? 29 : 79, y: marker === 'A' ? 39 : 69 },
  },
  ballStartPosition: { x: marker === 'A' ? 35 : 75, y: marker === 'A' ? 45 : 65 },
  ballVisible: true,
  arrows: [
    { id: `${id}-pass`, type: 'pass', start: { x: 20, y: 30 }, end: { x: 40, y: 50 } },
    { id: `${id}-movement`, type: 'movement', start: { x: 60, y: 70 }, end: { x: 80, y: 50 } },
  ],
  description: `Descripción ${marker}`,
  category: `Categoría ${marker}`,
  tags: [marker],
  createdAt: '2026-09-22T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
});

const selectedPlay = (workspace, situation, playStyle) => {
  const id = resolveOffensiveActivePlayId({
    plays: workspace.plays,
    activePlayIdByContext: workspace.activePlayIdByContext,
    activePlayIdBySituation: workspace.activePlayIdBySituation,
    situation,
    playStyle,
  });
  return workspace.plays.find((play) => play.id === id) || null;
};

const assertStyleCycle = (situation) => {
  const combinative = buildPlay(`${situation}-a`, situation, 'combinative', 'A');
  const direct = buildPlay(`${situation}-b`, situation, 'direct', 'B');
  let workspace = addOffensivePlayToWorkspace(emptyWorkspace(), combinative);
  const combinativeSnapshot = JSON.stringify(combinative);

  workspace = navigateOffensivePlayStyle(workspace, situation, 'direct');
  assert.equal(selectedPlay(workspace, situation, 'direct'), null, `${situation}: Directo empieza vacío`);
  assert.equal(JSON.stringify(workspace.plays[0]), combinativeSnapshot, `${situation}: navegar no reclasifica A`);

  workspace = addOffensivePlayToWorkspace(workspace, direct);
  const directSnapshot = JSON.stringify(direct);
  assert.deepEqual(selectedPlay(workspace, situation, 'direct'), direct);

  workspace = navigateOffensivePlayStyle(workspace, situation, 'combinative');
  assert.equal(JSON.stringify(selectedPlay(workspace, situation, 'combinative')), combinativeSnapshot);
  workspace = navigateOffensivePlayStyle(workspace, situation, 'direct');
  assert.equal(JSON.stringify(selectedPlay(workspace, situation, 'direct')), directSnapshot);
};

// Tests 1, 2 y 3: Inicio, Creación y Finalización conservan dos pizarras completas.
['build_up', 'creation', 'finishing'].forEach(assertStyleCycle);

// Test 4: dos jugadas del mismo contexto son independientes y no aparecen en Directo.
let playsWorkspace = emptyWorkspace();
const creationOne = buildPlay('creation-one', 'creation', 'combinative', 'A');
const creationTwo = buildPlay('creation-two', 'creation', 'combinative', 'B');
playsWorkspace = addOffensivePlayToWorkspace(playsWorkspace, creationOne);
playsWorkspace = addOffensivePlayToWorkspace(playsWorkspace, creationTwo);
playsWorkspace = selectOffensivePlayInWorkspace(playsWorkspace, {
  situation: 'creation', playStyle: 'combinative', playId: creationOne.id,
});
assert.equal(selectedPlay(playsWorkspace, 'creation', 'combinative').id, creationOne.id);
playsWorkspace = selectOffensivePlayInWorkspace(playsWorkspace, {
  situation: 'creation', playStyle: 'combinative', playId: creationTwo.id,
});
assert.equal(selectedPlay(playsWorkspace, 'creation', 'combinative').id, creationTwo.id);
assert.equal(selectedPlay(playsWorkspace, 'creation', 'direct'), null);

// Test 5: Nueva jugada nace en el estilo activo y deja intacto el contexto hermano.
const combinativeBeforeNew = JSON.stringify(playsWorkspace.plays);
const newDirect = buildPlay('creation-direct-new', 'creation', 'direct', 'B');
playsWorkspace = addOffensivePlayToWorkspace(playsWorkspace, newDirect);
assert.equal(selectedPlay(playsWorkspace, 'creation', 'direct').id, newDirect.id);
assert.equal(JSON.stringify(playsWorkspace.plays.slice(0, 2)), combinativeBeforeNew);

// Test 6: Duplicar genera una copia profunda en el mismo contexto y no toca Directo.
const directBeforeDuplicate = JSON.stringify(selectedPlay(playsWorkspace, 'creation', 'direct'));
let arrowSequence = 0;
const duplicate = cloneOffensivePlay(creationOne, {
  playId: 'creation-one-copy',
  createArrowId: () => `copy-arrow-${++arrowSequence}`,
  timestamp: '2026-09-22T11:00:00.000Z',
});
playsWorkspace = addOffensivePlayToWorkspace(playsWorkspace, duplicate);
assert.notEqual(duplicate.id, creationOne.id);
assert.equal(duplicate.offensiveSituation, 'creation');
assert.equal(duplicate.playStyle, 'combinative');
assert.deepEqual(duplicate.playerPositions, creationOne.playerPositions);
assert.deepEqual(duplicate.ballStartPosition, creationOne.ballStartPosition);
assert.deepEqual(duplicate.arrows.map(({ id: _id, ...arrow }) => arrow), creationOne.arrows.map(({ id: _id, ...arrow }) => arrow));
assert.equal(duplicate.description, creationOne.description);
duplicate.playerPositions['rival:1'].x = 99;
duplicate.ballStartPosition.x = 99;
duplicate.arrows[0].start.x = 99;
assert.notEqual(creationOne.playerPositions['rival:1'].x, 99);
assert.notEqual(creationOne.ballStartPosition.x, 99);
assert.notEqual(creationOne.arrows[0].start.x, 99);
assert.equal(JSON.stringify(selectedPlay(playsWorkspace, 'creation', 'direct')), directBeforeDuplicate);

// Test 7: eliminar en Combinativo selecciona otra combinativa y no cambia Directo.
const directBeforeDelete = JSON.stringify(selectedPlay(playsWorkspace, 'creation', 'direct'));
playsWorkspace = deleteOffensivePlayFromWorkspace(playsWorkspace, {
  situation: 'creation', playStyle: 'combinative', playId: duplicate.id,
});
assert.equal(playsWorkspace.plays.some((play) => play.id === duplicate.id), false);
assert.equal(selectedPlay(playsWorkspace, 'creation', 'combinative').playStyle, 'combinative');
assert.equal(JSON.stringify(selectedPlay(playsWorkspace, 'creation', 'direct')), directBeforeDelete);

// Test 8: una jugada legacy sin playStyle pertenece a Combinativo, sin duplicarse.
const legacyPlay = { ...buildPlay('legacy-creation', 'creation', 'combinative', 'A') };
delete legacyPlay.playStyle;
const legacyWorkspace = {
  ...emptyWorkspace(),
  activePlayIdBySituation: { creation: legacyPlay.id },
  plays: [legacyPlay],
};
assert.equal(selectedPlay(legacyWorkspace, 'creation', 'combinative').id, legacyPlay.id);
assert.equal(selectedPlay(legacyWorkspace, 'creation', 'direct'), null);
assert.equal(legacyWorkspace.plays.length, 1);

// Test 9: un índice Directo que apunta a Combinativo se rechaza.
const validDirect = buildPlay('valid-direct', 'creation', 'direct', 'B');
const invalidIndexWorkspace = {
  ...emptyWorkspace(),
  activePlayIdByContext: {
    [getOffensivePlayContextKey('creation', 'direct')]: legacyPlay.id,
  },
  activePlayIdBySituation: { creation: legacyPlay.id },
  plays: [legacyPlay, validDirect],
};
assert.equal(selectedPlay(invalidIndexWorkspace, 'creation', 'direct').id, validDirect.id);
assert.equal(selectedPlay({ ...invalidIndexWorkspace, plays: [legacyPlay] }, 'creation', 'direct'), null);

// El callback de producción utiliza la misma navegación pura y no reclasifica jugadas.
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const styleSelectorSource = appSource.slice(
  appSource.indexOf('const selectOffensivePlayStyle ='),
  appSource.indexOf('const selectOffensivePlay =', appSource.indexOf('const selectOffensivePlayStyle ='))
);
assert.match(styleSelectorSource, /navigateOffensivePlayStyle/);
assert.doesNotMatch(styleSelectorSource, /window\.confirm|plays:\s*current\.plays\.map|updatedAt/);

console.log('offensivePlayWorkspace tests passed');
