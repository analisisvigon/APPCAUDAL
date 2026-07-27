import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDefensiveBlockInitialPositions } from './defensiveBlockPositions.js';
import { getOffensiveInitialPositions } from './offensivePhasePositions.js';
import { getTransitionInitialPositions } from './transitionPhasePositions.js';
import { getSetPieceInitialPositions } from './setPiecePositions.js';
import { getDefaultSetPieceBallPosition } from './setPieceZones.js';
import { buildSemanticRoleDescriptors } from './tacticalTemplates.js';
import {
  TACTICAL_ATTACK_DIRECTIONS,
  getTacticalVisualSlotAssignments,
  getVisualSlotForTacticalRole,
} from './tacticalOrientation.js';

const rivalSlots = [
  ['Portero', 50, 89],
  ['Lateral izquierdo', 18, 73],
  ['Central izquierdo', 39, 73],
  ['Central derecho', 61, 73],
  ['Lateral derecho', 82, 73],
  ['Extremo izquierdo', 18, 45],
  ['Mediocentro izquierdo', 39, 45],
  ['Mediocentro derecho', 61, 45],
  ['Extremo derecho', 82, 45],
  ['Delantero izquierdo', 42, 16],
  ['Delantero derecho', 58, 16],
].map(([role, x, y], slot) => ({ role, x, y, slot }));

const caudalSlots = rivalSlots.map((slot) => ({ ...slot }));
const rolePairs = [
  ['Lateral derecho', 'Lateral izquierdo'],
  ['Central derecho', 'Central izquierdo'],
  ['Extremo derecho', 'Extremo izquierdo'],
  ['Mediocentro derecho', 'Mediocentro izquierdo'],
  ['Delantero derecho', 'Delantero izquierdo'],
];

const roleToVisualSlot = (positions, label) => Object.fromEntries(rolePairs.flatMap(([rightRole, leftRole]) => {
  const rightSlot = rivalSlots.find((slot) => slot.role === rightRole).slot;
  const leftSlot = rivalSlots.find((slot) => slot.role === leftRole).slot;
  const rightX = positions[`rival:${rightSlot}`].x;
  const leftX = positions[`rival:${leftSlot}`].x;
  assert.ok(rightX < leftX, `${label}: ${rightRole} debe quedar a la izquierda visual de ${leftRole}`);
  return [
    [rightRole, 'visual_left'],
    [leftRole, 'visual_right'],
  ];
}));

const expectedMapping = Object.fromEntries(rolePairs.flatMap(([rightRole, leftRole]) => [
  [rightRole, 'visual_left'],
  [leftRole, 'visual_right'],
]));

const cases = [];
['low_block', 'mid_block', 'high_block'].forEach((defensiveSituation) => {
  cases.push([
    `defensive:${defensiveSituation}`,
    getDefensiveBlockInitialPositions({
      defensiveSituation,
      rivalSystem: '4-4-2',
      caudalSystem: '4-4-2',
      rivalFormationSlots: rivalSlots,
      caudalFormationSlots: caudalSlots,
    }),
  ]);
});

[
  ['build_up', 'combinative'],
  ['build_up', 'direct'],
  ['creation', 'combinative'],
  ['finishing', 'combinative'],
].forEach(([offensiveSituation, playStyle]) => {
  cases.push([
    `offensive:${offensiveSituation}:${playStyle}`,
    getOffensiveInitialPositions({
      offensiveSituation,
      playStyle,
      rivalSystem: '4-4-2',
      caudalSystem: '4-4-2',
      rivalFormationSlots: rivalSlots,
      caudalFormationSlots: caudalSlots,
    }),
  ]);
});

['offensive_transition', 'defensive_transition'].forEach((transitionType) => {
  ['defensive_half', 'attacking_half'].forEach((fieldZone) => {
    cases.push([
      `transition:${transitionType}:${fieldZone}`,
      getTransitionInitialPositions({
        transitionType,
        fieldZone,
        rivalSystem: '4-4-2',
        caudalSystem: '4-4-2',
        rivalFormationSlots: rivalSlots,
        caudalFormationSlots: caudalSlots,
      }),
    ]);
  });
});

['offensive_set_piece', 'defensive_set_piece'].forEach((setPieceType) => {
  ['corner', 'wide_free_kick', 'central_free_kick', 'throw_in'].forEach((setPieceAction) => {
    cases.push([
      `set-piece:${setPieceType}:${setPieceAction}`,
      getSetPieceInitialPositions({
        setPieceType,
        setPieceAction,
        ballStartPosition: getDefaultSetPieceBallPosition(setPieceType, setPieceAction),
        rivalFormationSlots: rivalSlots,
        caudalFormationSlots: caudalSlots,
      }),
    ]);
  });
});

cases.forEach(([label, positions]) => {
  assert.deepEqual(
    roleToVisualSlot(positions, label),
    expectedMapping,
    `${label}: el mapeo rol → slot visual debe coincidir con la referencia única`
  );
});

assert.equal(
  getVisualSlotForTacticalRole({
    role: 'Lateral derecho',
    attacksToward: TACTICAL_ATTACK_DIRECTIONS.DOWN,
  }),
  'visual_left'
);
assert.equal(
  getVisualSlotForTacticalRole({
    role: 'Lateral izquierdo',
    attacksToward: TACTICAL_ATTACK_DIRECTIONS.DOWN,
  }),
  'visual_right'
);
assert.deepEqual(
  Object.fromEntries(getTacticalVisualSlotAssignments({
    formationSlots: rivalSlots,
    attacksToward: TACTICAL_ATTACK_DIRECTIONS.DOWN,
  }).map((assignment) => [
    rivalSlots.find((slot) => slot.slot === assignment.slot).role,
    assignment.visualSide,
  ]).filter(([role]) => expectedMapping[role])),
  expectedMapping
);

const rivalTemplateDescriptors = buildSemanticRoleDescriptors('rival', '4-4-2', rivalSlots);
rolePairs.forEach(([rightRole, leftRole]) => {
  const normalizeRole = (role) => role
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  const rightDescriptor = rivalTemplateDescriptors.find((descriptor) => descriptor.role === normalizeRole(rightRole));
  const leftDescriptor = rivalTemplateDescriptors.find((descriptor) => descriptor.role === normalizeRole(leftRole));
  assert.equal(rightDescriptor?.side, 'left', `Plantillas: ${rightRole} debe usar el slot visual izquierdo`);
  assert.equal(leftDescriptor?.side, 'right', `Plantillas: ${leftRole} debe usar el slot visual derecho`);
  assert.ok(
    rightDescriptor.baseX < leftDescriptor.baseX,
    `Plantillas: ${rightRole} debe quedar a la izquierda visual de ${leftRole}`
  );
});

const generatorFiles = [
  'src/utils/defensiveBlockPositions.js',
  'src/utils/offensivePhasePositions.js',
  'src/utils/transitionPhasePositions.js',
  'src/utils/setPiecePositions.js',
  'src/utils/tacticalTemplates.js',
];
generatorFiles.forEach((file) => {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /tacticalOrientation/, `${file} debe consumir la orientación central`);
  assert.doesNotMatch(source, /x\s*:\s*100\s*-\s*/, `${file} no debe conservar espejos manuales`);
});

const templateSource = readFileSync('src/utils/tacticalTemplates.js', 'utf8');
assert.match(templateSource, /getVisualSlotForTacticalRole/);
assert.match(templateSource, /orientFormationSlotsForTacticalBoard/);

const appSource = readFileSync('src/App.jsx', 'utf8');
assert.match(appSource, /orientFormationSlotsForTacticalBoard/);
assert.match(appSource, /buildDefensiveInitialPlayerPositions/);
assert.match(appSource, /buildOffensiveInitialPlayerPositions/);
assert.match(appSource, /buildTransitionInitialPlayerPositions/);
assert.match(appSource, /buildSetPieceInitialPlayerPositions/);
assert.match(appSource, /getTacticalBoardRivalFormationSlots/);
assert.match(appSource, /resetDefensiveFormation/);
assert.match(appSource, /adaptSemanticPlayerPositions/);

console.log('tacticalOrientation tests passed');
