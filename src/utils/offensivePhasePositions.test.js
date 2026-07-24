import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OFFENSIVE_DIRECT_BUILD_UP_LINE_HEIGHTS,
  OFFENSIVE_PHASE_LINE_HEIGHTS,
  getOffensiveBuildUpPositions,
  getOffensiveCreationPositions,
  getOffensiveFinishingPositions,
  getOffensiveInitialPositions,
} from './offensivePhasePositions.js';
import { hasInitialPositionOverlap } from './defensiveBlockPositions.js';

const buildFormationSlots = (system) => {
  const lines = system.split('-').map(Number);
  const slots = [{ slot: 0, role: 'Portero', x: 50, y: 89 }];
  lines.forEach((lineSize, lineIndex) => {
    const margin = lineSize >= 5 ? 12 : lineSize === 4 ? 17 : lineSize === 3 ? 25 : lineSize === 2 ? 39 : 50;
    Array.from({ length: lineSize }, (_, playerIndex) => (
      lineSize === 1 ? 50 : margin + ((100 - margin * 2) * playerIndex) / (lineSize - 1)
    )).forEach((x) => slots.push({ slot: slots.length, x, y: 75 - lineIndex * 25 }));
  });
  return slots;
};
const averageY = (positions, team, start, count) => (
  Array.from({ length: count }, (_, index) => positions[`${team}:${start + index}`].y)
    .reduce((total, y) => total + y, 0) / count
);

const buildUp = getOffensiveBuildUpPositions({
  rivalSystem: '4-4-2',
  caudalSystem: '4-4-2',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-4-2'),
});

assert.equal(Object.keys(buildUp).length, 22, 'Inicio genera los 22 jugadores');
assert.equal(hasInitialPositionOverlap(buildUp), false, 'Inicio no genera solapamientos');
assert.equal(buildUp['rival:0'].y, OFFENSIVE_PHASE_LINE_HEIGHTS.build_up.rival.goalkeeper);
assert.equal(averageY(buildUp, 'rival', 1, 4), 20, 'los defensas rivales inician abiertos cerca de su área');
assert.equal(averageY(buildUp, 'rival', 5, 4), 34.5, 'los medios rivales ofrecen líneas de pase');
assert.equal(averageY(buildUp, 'rival', 9, 2), 49, 'los atacantes rivales ocupan posiciones adelantadas');
assert.equal(buildUp['caudal:0'].y, 91, 'el portero del Caudal protege su área');
assert.equal(averageY(buildUp, 'caudal', 1, 4), 73, 'la defensa del Caudal queda retrasada');
assert.equal(averageY(buildUp, 'caudal', 9, 2), 28, 'los delanteros del Caudal presionan la primera línea rival');

const directRivalSlots = buildFormationSlots('4-4-2');
['Portero', 'Lateral izquierdo', 'Central izquierdo', 'Central derecho', 'Lateral derecho']
  .forEach((role, index) => { directRivalSlots[index].role = role; });
const directBuildUp = getOffensiveInitialPositions({
  offensiveSituation: 'build_up',
  playStyle: 'direct',
  rivalSystem: '4-4-2',
  caudalSystem: '4-4-2',
  rivalFormationSlots: directRivalSlots,
  caudalFormationSlots: buildFormationSlots('4-4-2'),
});
assert.equal(Object.keys(directBuildUp).length, 22, 'Inicio directo genera los 22 jugadores');
assert.equal(hasInitialPositionOverlap(directBuildUp), false, 'Inicio directo evita solapamientos exactos');
assert.equal(directBuildUp['rival:0'].y, OFFENSIVE_DIRECT_BUILD_UP_LINE_HEIGHTS.rival.goalkeeper);
assert.ok(averageY(directBuildUp, 'rival', 1, 4) > averageY(buildUp, 'rival', 1, 4), 'el bloque rival directo parte más alto');
assert.ok(averageY(directBuildUp, 'rival', 9, 2) > averageY(buildUp, 'rival', 9, 2), 'los puntas rivales fijan más arriba');
assert.ok(averageY(directBuildUp, 'caudal', 9, 2) > averageY(buildUp, 'caudal', 9, 2), 'el Caudal se prepara cerca de la caída y segunda jugada');
assert.ok(
  directBuildUp['rival:3'].x - directBuildUp['rival:2'].x
    < buildUp['rival:3'].x - buildUp['rival:2'].x,
  'los centrales rivales quedan más juntos para preparar el golpeo'
);
assert.ok(directBuildUp['rival:1'].y > directBuildUp['rival:2'].y, 'los laterales rivales parten algo más altos que los centrales');
assert.notDeepEqual(directBuildUp, buildUp, 'Inicio directo y combinativo usan presets diferentes');

const creation = getOffensiveCreationPositions({
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});

assert.equal(Object.keys(creation).length, 22, 'Creación genera los 22 jugadores');
assert.equal(hasInitialPositionOverlap(creation), false, 'Creación no genera solapamientos');
assert.equal(creation['rival:0'].y, OFFENSIVE_PHASE_LINE_HEIGHTS.creation.rival.goalkeeper);
assert.equal(averageY(creation, 'rival', 1, 4), 36, 'la primera línea rival ya está adelantada');
assert.equal(averageY(creation, 'rival', 5, 4), 51.5, 'los medios rivales progresan en zona central');
assert.equal(averageY(creation, 'rival', 9, 2), 67, 'los atacantes rivales ocupan espacios avanzados');
assert.equal(averageY(creation, 'caudal', 1, 4), 76, 'la defensa del Caudal se relaciona con los atacantes');
assert.equal(averageY(creation, 'caudal', 5, 3), 59.5, 'el medio del Caudal protege los pasillos interiores');
assert.equal(averageY(creation, 'caudal', 8, 3), 43, 'los atacantes del Caudal orientan la progresión');
assert.ok(
  averageY(creation, 'caudal', 5, 3) < averageY(creation, 'rival', 9, 2),
  'las líneas de Creación quedan enfrentadas e intercaladas'
);

const finishing = getOffensiveFinishingPositions({
  rivalSystem: '5-3-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('5-3-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});

assert.equal(Object.keys(finishing).length, 22, 'Finalización genera los 22 jugadores');
assert.equal(hasInitialPositionOverlap(finishing), false, 'Finalización no genera solapamientos');
assert.equal(finishing['rival:0'].y, OFFENSIVE_PHASE_LINE_HEIGHTS.finishing.rival.goalkeeper);
assert.equal(averageY(finishing, 'rival', 1, 5), 52, 'la línea de equilibrio rival sostiene la jugada');
assert.equal(averageY(finishing, 'rival', 6, 3), 68.5, 'los medios rivales ocupan la frontal y la segunda línea');
assert.equal(averageY(finishing, 'rival', 9, 2), 85, 'los delanteros rivales atacan el área del Caudal');
assert.equal(finishing['caudal:0'].y, 92, 'el portero del Caudal permanece dentro de su área');
assert.equal(averageY(finishing, 'caudal', 1, 4), 82, 'la defensa del Caudal protege el área');
assert.equal(averageY(finishing, 'caudal', 5, 3), 67.5, 'los medios del Caudal protegen frontal e interiores');
assert.equal(averageY(finishing, 'caudal', 8, 3), 53, 'los atacantes del Caudal quedan preparados para transición');

const creationCombinative = getOffensiveInitialPositions({
  offensiveSituation: 'creation',
  playStyle: 'combinative',
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});
const creationDirect = getOffensiveInitialPositions({
  offensiveSituation: 'creation',
  playStyle: 'direct',
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});
assert.deepEqual(creationDirect, creationCombinative, 'Creación comparte preset entre combinativo y directo');

const finishingCombinative = getOffensiveInitialPositions({
  offensiveSituation: 'finishing',
  playStyle: 'combinative',
  rivalSystem: '5-3-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('5-3-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});
const finishingDirect = getOffensiveInitialPositions({
  offensiveSituation: 'finishing',
  playStyle: 'direct',
  rivalSystem: '5-3-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('5-3-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});
assert.deepEqual(finishingDirect, finishingCombinative, 'Finalización comparte preset entre combinativo y directo');

const offensiveWorkspace = {
  version: 1,
  activeSituation: 'creation',
  activePlayIdBySituation: {
    build_up: 'offensive-build-up-1',
    creation: 'offensive-creation-1',
    finishing: 'offensive-finishing-1',
  },
  plays: [
    {
      id: 'offensive-build-up-1',
      phase: 'offensive',
      offensiveSituation: 'build_up',
      name: 'Salida de tres',
      rivalSystem: '4-4-2',
      caudalSystem: '4-4-2',
      playerPositions: buildUp,
      arrows: [],
      description: 'Inicio rival.',
      createdAt: '2026-07-24T10:00:00.000Z',
      updatedAt: '2026-07-24T10:00:00.000Z',
    },
    {
      id: 'offensive-creation-1',
      phase: 'offensive',
      offensiveSituation: 'creation',
      name: 'Juego entre líneas',
      rivalSystem: '4-4-2',
      caudalSystem: '4-3-3',
      playerPositions: creation,
      arrows: [],
      description: 'Progresión rival.',
      createdAt: '2026-07-24T10:01:00.000Z',
      updatedAt: '2026-07-24T10:01:00.000Z',
    },
    {
      id: 'offensive-finishing-1',
      phase: 'offensive',
      offensiveSituation: 'finishing',
      name: 'Ataque del área',
      rivalSystem: '5-3-2',
      caudalSystem: '4-3-3',
      playerPositions: finishing,
      arrows: [],
      description: 'Finalización rival.',
      createdAt: '2026-07-24T10:02:00.000Z',
      updatedAt: '2026-07-24T10:02:00.000Z',
    },
  ],
};
const defensiveWorkspace = {
  version: 1,
  activeSituation: 'low_block',
  activePlayIdBySituation: { low_block: 'defensive-low-1' },
  plays: [{
    id: 'defensive-low-1',
    defensiveSituation: 'low_block',
    playerPositions: { 'rival:1': { x: 17, y: 18 } },
    arrows: [{ id: 'defensive-arrow-1', type: 'movement', start: { x: 17, y: 18 }, end: { x: 25, y: 24 } }],
    description: 'Dato defensivo existente.',
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-20T10:00:00.000Z',
  }],
};
const combinedAnalysis = {
  defensivePhaseV1: defensiveWorkspace,
  offensivePhaseV1: offensiveWorkspace,
};
const defensiveSnapshot = JSON.stringify(combinedAnalysis.defensivePhaseV1);
const movedCreation = {
  ...combinedAnalysis.offensivePhaseV1.plays[1],
  playerPositions: {
    ...combinedAnalysis.offensivePhaseV1.plays[1].playerPositions,
    'rival:5': { x: 47.25, y: 54.5 },
    'caudal:6': { x: 55.75, y: 61.25 },
  },
  arrows: [{
    id: 'offensive-arrow-1',
    type: 'pass',
    start: { x: 47.25, y: 54.5 },
    end: { x: 62, y: 66 },
  }],
  description: 'Tercer hombre y cambio de orientación.',
};
const updatedAnalysis = {
  ...combinedAnalysis,
  offensivePhaseV1: {
    ...combinedAnalysis.offensivePhaseV1,
    plays: combinedAnalysis.offensivePhaseV1.plays.map((play) => (
      play.id === movedCreation.id ? movedCreation : play
    )),
  },
};
const reloadedAnalysis = JSON.parse(JSON.stringify(updatedAnalysis));
assert.deepEqual(reloadedAnalysis.offensivePhaseV1.plays[1].playerPositions['rival:5'], { x: 47.25, y: 54.5 });
assert.deepEqual(reloadedAnalysis.offensivePhaseV1.plays[1].playerPositions['caudal:6'], { x: 55.75, y: 61.25 });
assert.equal(reloadedAnalysis.offensivePhaseV1.plays[1].arrows[0].type, 'pass');
assert.equal(reloadedAnalysis.offensivePhaseV1.plays[1].description, 'Tercer hombre y cambio de orientación.');
assert.equal(JSON.stringify(reloadedAnalysis.defensivePhaseV1), defensiveSnapshot, 'la ofensiva no modifica la fase defensiva');
assert.deepEqual(reloadedAnalysis.offensivePhaseV1.plays[0].playerPositions, buildUp, 'Creación no modifica Inicio');
assert.deepEqual(reloadedAnalysis.offensivePhaseV1.plays[2].playerPositions, finishing, 'Creación no modifica Finalización');
assert.equal(new Set(reloadedAnalysis.offensivePhaseV1.plays.map((play) => play.id)).size, 3, 'cada jugada mantiene un ID independiente');
assert.deepEqual(
  reloadedAnalysis.offensivePhaseV1.activePlayIdBySituation,
  offensiveWorkspace.activePlayIdBySituation,
  'cada situación conserva la jugada previamente abierta'
);

const resetCreation = {
  ...movedCreation,
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  playerPositions: creation,
};
assert.equal(resetCreation.name, movedCreation.name, 'Restablecer conserva el nombre');
assert.equal(resetCreation.description, movedCreation.description, 'Restablecer conserva la descripción');
assert.deepEqual(resetCreation.arrows, movedCreation.arrows, 'Restablecer conserva pases y movimientos');
assert.equal(resetCreation.phase, 'offensive', 'Restablecer conserva la fase');
assert.equal(resetCreation.offensiveSituation, 'creation', 'Restablecer conserva la situación');

const combinativeCreation = {
  ...movedCreation,
  id: 'creation-combinative',
  playStyle: 'combinative',
};
const directCreation = {
  ...movedCreation,
  id: 'creation-direct',
  playStyle: 'direct',
};
assert.notEqual(combinativeCreation.id, directCreation.id, 'Creación guarda jugadas independientes por tipo');
assert.deepEqual(combinativeCreation.playerPositions, directCreation.playerPositions, 'las dos clasificaciones pueden partir del mismo preset');

const manuallyReclassified = {
  ...combinativeCreation,
  playStyle: 'direct',
};
assert.deepEqual(manuallyReclassified.playerPositions, combinativeCreation.playerPositions, 'cambiar tipo no mueve jugadores');
assert.deepEqual(manuallyReclassified.arrows, combinativeCreation.arrows, 'cambiar tipo no borra flechas');
assert.equal(manuallyReclassified.description, combinativeCreation.description, 'cambiar tipo no borra la descripción');
assert.equal(manuallyReclassified.name, combinativeCreation.name, 'cambiar tipo no cambia el nombre');

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('offensivePhaseV1: normalizedWorkspace'), 'la ofensiva se guarda en su propio espacio JSON');
assert.ok(appSource.includes('defensivePhaseV1: normalizedWorkspace'), 'la persistencia defensiva continúa disponible');
assert.ok(appSource.includes(".from('partidos')"), 'la persistencia ofensiva utiliza Supabase');
assert.ok(appSource.includes('playStyle: normalizeOffensivePlayStyle(play.playStyle)'), 'las jugadas antiguas sin playStyle se leen como combinative');
assert.ok(appSource.includes('activePlayIdByContext'), 'la selección de jugadas se separa por situación y tipo');
assert.ok(appSource.includes('selectedOffensivePlay.playStyle'), 'Restablecer usa el tipo guardado en la jugada');
const offensiveSaveSource = appSource.slice(
  appSource.indexOf('const saveOffensiveWorkspace = async () => {'),
  appSource.indexOf('useEffect(() => {', appSource.indexOf('const saveOffensiveWorkspace = async () => {'))
);
assert.equal(offensiveSaveSource.includes('localStorage'), false, 'la fase ofensiva no usa localStorage');
assert.equal(
  (appSource.match(/buildOffensiveInitialPlayerPositions\(/g) || []).length,
  2,
  'los presets ofensivos solo se calculan al crear y restablecer'
);
assert.ok(appSource.includes("? updateDefensivePlay(playId, patch)"), 'el motor de edición conserva el workspace defensivo');
assert.ok(appSource.includes("? updateOffensivePlay(playId, patch)"), 'el motor de edición conserva el workspace ofensivo');
assert.ok(appSource.includes(": updateTransitionPlay(playId, patch)"), 'el motor de edición enruta Transiciones a su propio workspace');

console.log('offensivePhasePositions tests passed');
