import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDefensiveBlockInitialPositions } from './defensiveBlockPositions.js';
import {
  buildDefensiveOffensiveRivalBoard,
  getLegacyDefensiveOffensiveOrientation,
  hasLegacyDefensiveOffensiveOrientation,
} from './defensiveOffensiveBoard.js';
import { getOffensiveInitialPositions } from './offensivePhasePositions.js';
import { orientFormationSlotsForTacticalBoard } from './tacticalOrientation.js';

const rivalSlots = [
  ['Portero', 'Portero', 50, 89],
  ['Lateral izquierdo', 'Javi Álvarez', 18, 73],
  ['Central izquierdo', 'Central izquierdo', 39, 73],
  ['Central derecho', 'Central derecho', 61, 73],
  ['Lateral derecho', 'Fran Álvarez', 82, 73],
  ['Extremo izquierdo', 'Extremo izquierdo', 18, 45],
  ['Mediocentro', 'Mediocentro izquierdo', 39, 45],
  ['Mediocentro', 'Mediocentro derecho', 61, 45],
  ['Extremo derecho', 'Extremo derecho', 82, 45],
  ['Delantero', 'Delantero izquierdo', 42, 16],
  ['Delantero', 'Delantero derecho', 58, 16],
].map(([role, name, x, y], slot) => ({
  role,
  x,
  y,
  slot,
  player: { id: `player-${slot}`, name },
}));
const caudalSlots = rivalSlots.map((slot) => ({
  ...slot,
  player: { ...slot.player, id: `caudal-${slot.slot}` },
}));
const facingRivalSlots = orientFormationSlotsForTacticalBoard({
  team: 'rival',
  formationSlots: rivalSlots,
}).map((slot) => ({
  ...slot,
  coordinates: { x: slot.x, y: slot.y },
}));

const fallbackPosition = (slot) => ({
  x: Number(slot.coordinates?.x ?? 50),
  y: 50 - Number(slot.coordinates?.y ?? 50) * 0.42,
});
const renderFinalBoard = (phase, positions) => buildDefensiveOffensiveRivalBoard({
  phase,
  rivalSlots: facingRivalSlots,
  savedPositions: positions,
  getFallbackPosition: fallbackPosition,
});
const findByName = (board, name) => board.find((entry) => entry.player?.name === name);
const findByRole = (board, role) => board.find((entry) => entry.role === role);
const assertCorrectFinalOrientation = (board, label) => {
  const fran = findByName(board, 'Fran Álvarez');
  const javi = findByName(board, 'Javi Álvarez');
  assert.ok(fran.position.x < javi.position.x, `${label}: Fran (LD) debe quedar a la izquierda de Javi (LI)`);
  assert.ok(
    findByRole(board, 'Central derecho').position.x < findByRole(board, 'Central izquierdo').position.x,
    `${label}: central derecho debe quedar a la izquierda visual`
  );
  assert.ok(
    findByRole(board, 'Extremo derecho').position.x < findByRole(board, 'Extremo izquierdo').position.x,
    `${label}: extremo derecho debe quedar a la izquierda visual`
  );
  assert.equal(hasLegacyDefensiveOffensiveOrientation(board), false, `${label}: no debe diagnosticarse como legacy`);
  return { fran: fran.position, javi: javi.position };
};

const results = [];
for (const defensiveSituation of ['low_block', 'mid_block', 'high_block']) {
  const positions = getDefensiveBlockInitialPositions({
    defensiveSituation,
    rivalSystem: '4-4-2',
    caudalSystem: '4-4-2',
    rivalFormationSlots: rivalSlots,
    caudalFormationSlots: caudalSlots,
  });
  const board = renderFinalBoard('defensive', positions);
  const coordinates = assertCorrectFinalOrientation(board, `Defensiva ${defensiveSituation} · Nueva jugada`);

  const movedPositions = {
    ...positions,
    'rival:4': { x: 73, y: 61 },
  };
  assert.equal(findByName(renderFinalBoard('defensive', movedPositions), 'Fran Álvarez').position.x, 73);
  const resetBoard = renderFinalBoard('defensive', getDefensiveBlockInitialPositions({
    defensiveSituation,
    rivalSystem: '4-4-2',
    caudalSystem: '4-4-2',
    rivalFormationSlots: rivalSlots,
    caudalFormationSlots: caudalSlots,
  }));
  assertCorrectFinalOrientation(resetBoard, `Defensiva ${defensiveSituation} · Restablecer`);
  assertCorrectFinalOrientation(
    renderFinalBoard('defensive', JSON.parse(JSON.stringify(positions))),
    `Defensiva ${defensiveSituation} · Guardar y recargar`
  );
  results.push({ phase: `defensive:${defensiveSituation}`, ...coordinates });
}

for (const offensiveSituation of ['build_up', 'creation', 'finishing']) {
  for (const playStyle of ['combinative', 'direct']) {
    const buildPositions = () => getOffensiveInitialPositions({
      offensiveSituation,
      playStyle,
      rivalSystem: '4-4-2',
      caudalSystem: '4-4-2',
      rivalFormationSlots: rivalSlots,
      caudalFormationSlots: caudalSlots,
    });
    const positions = buildPositions();
    const coordinates = assertCorrectFinalOrientation(
      renderFinalBoard('offensive', positions),
      `Ofensiva ${offensiveSituation} ${playStyle} · Nueva jugada`
    );
    assertCorrectFinalOrientation(
      renderFinalBoard('offensive', buildPositions()),
      `Ofensiva ${offensiveSituation} ${playStyle} · Restablecer`
    );
    assertCorrectFinalOrientation(
      renderFinalBoard('offensive', JSON.parse(JSON.stringify(positions))),
      `Ofensiva ${offensiveSituation} ${playStyle} · Guardar y recargar`
    );
    results.push({ phase: `offensive:${offensiveSituation}:${playStyle}`, ...coordinates });
  }
}

const fallbackBoard = buildDefensiveOffensiveRivalBoard({
  phase: 'defensive',
  rivalSlots: facingRivalSlots,
  getFallbackPosition: fallbackPosition,
});
assertCorrectFinalOrientation(fallbackBoard, 'Defensiva · Previsualización sin jugada');
assert.ok(fallbackBoard.every((entry) => entry.positionSource === 'fallback'));

const legacyPositions = {
  'rival:1': { x: 17, y: 49 },
  'rival:2': { x: 39, y: 49 },
  'rival:3': { x: 61, y: 49 },
  'rival:4': { x: 83, y: 49 },
  'rival:5': { x: 17, y: 35 },
  'rival:8': { x: 83, y: 35 },
};
const legacyBoard = renderFinalBoard('defensive', legacyPositions);
assert.deepEqual(findByName(legacyBoard, 'Fran Álvarez').position, { x: 83, y: 49 });
assert.deepEqual(findByName(legacyBoard, 'Javi Álvarez').position, { x: 17, y: 49 });
assert.equal(hasLegacyDefensiveOffensiveOrientation(legacyBoard), true);
assert.deepEqual(
  getLegacyDefensiveOffensiveOrientation(legacyBoard).map(({ family }) => family).sort(),
  ['centre_back', 'fullback', 'winger']
);
assert.ok(legacyBoard.filter((entry) => entry.positionSource === 'saved').length >= 6);

assert.deepEqual(buildDefensiveOffensiveRivalBoard({
  phase: 'transition',
  rivalSlots: facingRivalSlots,
  savedPositions: legacyPositions,
}), [], 'La ruta específica no debe intervenir en Transiciones');
assert.deepEqual(buildDefensiveOffensiveRivalBoard({
  phase: 'set_piece',
  rivalSlots: facingRivalSlots,
  savedPositions: legacyPositions,
}), [], 'La ruta específica no debe intervenir en ABP');

const appSource = readFileSync('src/App.jsx', 'utf8');
assert.match(appSource, /buildDefensiveOffensiveRivalBoard/);
assert.match(appSource, /defensiveOffensiveRivalBoardBySlot\.get\(rivalSlot\.slot\)\?\.position/);
assert.match(appSource, /Orientación antigua detectada · usa Restablecer formación/);

console.log(JSON.stringify({ message: 'defensiveOffensiveBoard tests passed', results }));
