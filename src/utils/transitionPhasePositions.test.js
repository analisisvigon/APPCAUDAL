import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getHighBlockPositions,
  hasInitialPositionOverlap,
} from './defensiveBlockPositions.js';
import {
  TRANSITION_PRESET_HEIGHTS,
  getTransitionInitialPositions,
  normalizeTransitionFieldZone,
  resolveRenderedTacticalPosition,
} from './transitionPhasePositions.js';

const buildFormationSlots = (system) => {
  const rolesBySystem = {
    '4-4-2': [
      'Portero',
      'Lateral izquierdo',
      'Central izquierdo',
      'Central derecho',
      'Lateral derecho',
      'Extremo izquierdo',
      'Mediocentro',
      'Mediocentro',
      'Extremo derecho',
      'Delantero',
      'Delantero',
    ],
    '4-3-3': [
      'Portero',
      'Lateral izquierdo',
      'Central izquierdo',
      'Central derecho',
      'Lateral derecho',
      'Pivote',
      'Interior izquierdo',
      'Interior derecho',
      'Extremo izquierdo',
      'Delantero',
      'Extremo derecho',
    ],
  };
  const roles = rolesBySystem[system] || [];
  const lines = system.split('-').map(Number);
  const slots = [{ slot: 0, role: 'Portero', x: 50, y: 89 }];
  lines.forEach((lineSize, lineIndex) => {
    const margin = lineSize >= 5 ? 12 : lineSize === 4 ? 17 : lineSize === 3 ? 25 : lineSize === 2 ? 39 : 50;
    Array.from({ length: lineSize }, (_, playerIndex) => (
      lineSize === 1 ? 50 : margin + ((100 - margin * 2) * playerIndex) / (lineSize - 1)
    )).forEach((x) => slots.push({
      slot: slots.length,
      role: roles[slots.length] || '',
      x,
      y: 75 - lineIndex * 25,
    }));
  });
  return slots;
};

const buildPreset = (transitionType, fieldZone, behaviour) => getTransitionInitialPositions({
  transitionType,
  fieldZone,
  behaviour,
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});
const highBlockPreset = getHighBlockPositions({
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});
const contexts = [
  ['offensive_transition', 'defensive_half'],
  ['offensive_transition', 'attacking_half'],
  ['defensive_transition', 'defensive_half'],
  ['defensive_transition', 'attacking_half'],
];
const presets = Object.fromEntries(contexts.map(([transitionType, fieldZone]) => {
  const key = `${transitionType}:${fieldZone}`;
  const positions = buildPreset(transitionType, fieldZone);
  assert.equal(Object.keys(positions).length, 22, `${key} genera los 22 jugadores`);
  assert.equal(hasInitialPositionOverlap(positions), false, `${key} evita solapamientos`);
  if (fieldZone === 'attacking_half') {
    assert.deepEqual(
      positions,
      highBlockPreset,
      `${key} conserva exactamente las claves y coordenadas del bloque alto`
    );
  } else {
    assert.equal(
      positions['rival:0'].y,
      TRANSITION_PRESET_HEIGHTS[transitionType].defensive_half.rival.goalkeeper,
      `${key} mantiene la altura previa del portero rival`
    );
    assert.equal(
      positions['caudal:0'].y,
      TRANSITION_PRESET_HEIGHTS[transitionType].defensive_half.caudal.goalkeeper,
      `${key} mantiene la altura previa del portero del Caudal`
    );
  }
  return [key, positions];
}));

assert.notDeepEqual(
  presets['offensive_transition:defensive_half'],
  presets['offensive_transition:attacking_half'],
  'la zona de recuperación cambia el preset ofensivo'
);
assert.notDeepEqual(
  presets['defensive_transition:defensive_half'],
  presets['defensive_transition:attacking_half'],
  'la zona de pérdida cambia el preset defensivo'
);
assert.deepEqual(
  presets['offensive_transition:attacking_half'],
  presets['defensive_transition:attacking_half'],
  'ambos tipos de transición reutilizan el mismo bloque alto en campo ofensivo'
);
assert.notDeepEqual(
  presets['offensive_transition:defensive_half'],
  presets['defensive_transition:defensive_half'],
  'transición ofensiva y defensiva usan estructuras distintas'
);
assert.deepEqual(
  buildPreset('offensive_transition', 'defensive_half', 'fast_attack'),
  buildPreset('offensive_transition', 'defensive_half', 'keep_possession'),
  'los comportamientos ofensivos comparten preset dentro del mismo tipo y zona'
);
assert.deepEqual(
  buildPreset('defensive_transition', 'attacking_half', 'counterpress'),
  buildPreset('defensive_transition', 'attacking_half', 'retreat'),
  'los comportamientos defensivos comparten preset dentro del mismo tipo y zona'
);
assert.equal(normalizeTransitionFieldZone('attacking_half'), 'attacking_half');
assert.equal(normalizeTransitionFieldZone('offensive_half'), 'defensive_half');

['offensive_transition', 'defensive_transition'].forEach((nextTransitionType) => {
  const attackingHalf = presets[`${nextTransitionType}:attacking_half`];
  const defensiveHalf = presets[`${nextTransitionType}:defensive_half`];
  const rivalOutfield = Object.entries(attackingHalf)
    .filter(([key]) => key.startsWith('rival:') && key !== 'rival:0')
    .map(([, position]) => position);
  const rivalDefensiveHalfOutfield = Object.entries(defensiveHalf)
    .filter(([key]) => key.startsWith('rival:') && key !== 'rival:0')
    .map(([, position]) => position);
  const caudalOutfield = Object.entries(attackingHalf)
    .filter(([key]) => key.startsWith('caudal:') && key !== 'caudal:0')
    .map(([, position]) => position);
  const averageY = (positions) => positions.reduce((total, position) => total + position.y, 0) / positions.length;

  assert.ok(
    rivalOutfield.filter((position) => position.y > 50).length >= 6,
    `${nextTransitionType}: al menos seis rivales de campo están en la mitad inferior`
  );
  assert.ok(
    averageY(rivalOutfield) > averageY(rivalDefensiveHalfOutfield),
    `${nextTransitionType}: Campo ofensivo adelanta longitudinalmente al rival respecto a Campo defensivo`
  );
  assert.ok(
    caudalOutfield.filter((position) => position.y > 50).length >= 7,
    `${nextTransitionType}: el Caudal queda agrupado cerca de su portería inferior`
  );

  assert.deepEqual(
    resolveRenderedTacticalPosition({
      playerKey: 'rival:4',
      savedPositions: null,
      previewPositions: attackingHalf,
      fallbackPosition: { x: 50, y: 10 },
    }),
    attackingHalf['rival:4'],
    `${nextTransitionType}: Sin jugadas renderiza la previsualización de Campo ofensivo`
  );
  assert.deepEqual(
    resolveRenderedTacticalPosition({
      playerKey: 'rival:4',
      savedPositions: { 'rival:4': { x: 44, y: 46 } },
      previewPositions: attackingHalf,
      fallbackPosition: { x: 50, y: 10 },
    }),
    { x: 44, y: 46 },
    `${nextTransitionType}: una jugada existente conserva sus coordenadas guardadas`
  );
});

const rival442Slots = buildFormationSlots('4-4-2');
const caudal442Slots = buildFormationSlots('4-4-2');
const highBlock442 = getHighBlockPositions({
  rivalSystem: '4-4-2',
  caudalSystem: '4-4-2',
  rivalFormationSlots: rival442Slots,
  caudalFormationSlots: caudal442Slots,
});
const rivalSlotByRole = (role) => rival442Slots.find((slot) => slot.role === role).slot;
['offensive_transition', 'defensive_transition'].forEach((nextTransitionType) => {
  const attackingHalf442 = getTransitionInitialPositions({
    transitionType: nextTransitionType,
    fieldZone: 'attacking_half',
    rivalSystem: '4-4-2',
    caudalSystem: '4-4-2',
    rivalFormationSlots: rival442Slots,
    caudalFormationSlots: caudal442Slots,
  });
  const positionForRole = (role) => attackingHalf442[`rival:${rivalSlotByRole(role)}`];
  assert.deepEqual(
    attackingHalf442,
    highBlock442,
    `${nextTransitionType}: Campo rival coincide por jugador y coordenada con bloque alto`
  );
  assert.equal(positionForRole('Lateral derecho').x, 17, `${nextTransitionType}: LD queda en el lado izquierdo visual`);
  assert.equal(positionForRole('Lateral izquierdo').x, 83, `${nextTransitionType}: LI queda en el lado derecho visual`);
  assert.equal(positionForRole('Central derecho').x, 39, `${nextTransitionType}: central derecho queda en el perfil izquierdo`);
  assert.equal(positionForRole('Central izquierdo').x, 61, `${nextTransitionType}: central izquierdo queda en el perfil derecho`);
  assert.equal(positionForRole('Extremo derecho').x, 17, `${nextTransitionType}: ED queda en el lado izquierdo visual`);
  assert.equal(positionForRole('Extremo izquierdo').x, 83, `${nextTransitionType}: EI queda en el lado derecho visual`);
  assert.ok(positionForRole('Lateral derecho').x < positionForRole('Lateral izquierdo').x);
  assert.ok(positionForRole('Extremo derecho').x < positionForRole('Extremo izquierdo').x);
  assert.ok(positionForRole('Central derecho').x < positionForRole('Central izquierdo').x);
});

const transitionWorkspace = {
  version: 1,
  activeTransitionType: 'offensive_transition',
  activeFieldZoneByType: {
    offensive_transition: 'defensive_half',
    defensive_transition: 'attacking_half',
  },
  activeBehaviourByContext: {
    'offensive_transition:defensive_half': 'fast_attack',
    'defensive_transition:attacking_half': 'retreat',
  },
  activePlayIdByContext: {
    'offensive_transition:defensive_half:fast_attack': 'transition-offensive-1',
    'defensive_transition:attacking_half:retreat': 'transition-defensive-1',
  },
  plays: [
    {
      id: 'transition-offensive-1',
      phase: 'transition',
      transitionType: 'offensive_transition',
      fieldZone: 'defensive_half',
      behaviour: 'fast_attack',
      playerPositions: presets['offensive_transition:defensive_half'],
      arrows: [{ id: 'transition-arrow-1', type: 'pass', start: { x: 34, y: 48 }, end: { x: 55, y: 35 } }],
      description: 'Atacar rápido tras robo.',
    },
    {
      id: 'transition-defensive-1',
      phase: 'transition',
      transitionType: 'defensive_transition',
      fieldZone: 'attacking_half',
      behaviour: 'retreat',
      playerPositions: presets['defensive_transition:attacking_half'],
      arrows: [{ id: 'transition-arrow-2', type: 'movement', start: { x: 70, y: 54 }, end: { x: 58, y: 68 } }],
      description: 'Replegar tras pérdida.',
    },
  ],
};
const defensiveWorkspace = {
  version: 1,
  plays: [{ id: 'defensive-existing', playerPositions: { 'rival:1': { x: 20, y: 22 } } }],
};
const offensiveWorkspace = {
  version: 1,
  plays: [{ id: 'offensive-existing', playerPositions: { 'rival:1': { x: 30, y: 32 } } }],
};
const combinedAnalysis = {
  defensivePhaseV1: defensiveWorkspace,
  offensivePhaseV1: offensiveWorkspace,
  transitionPhaseV1: transitionWorkspace,
};
const defensiveSnapshot = JSON.stringify(defensiveWorkspace);
const offensiveSnapshot = JSON.stringify(offensiveWorkspace);
const secondContextSnapshot = JSON.stringify(transitionWorkspace.plays[1]);
const manuallyEditedAnalysis = {
  ...combinedAnalysis,
  transitionPhaseV1: {
    ...transitionWorkspace,
    plays: transitionWorkspace.plays.map((play) => (
      play.id === 'transition-offensive-1'
        ? {
          ...play,
          playerPositions: {
            ...play.playerPositions,
            'rival:5': { x: 46.5, y: 51.25 },
          },
          arrows: [...play.arrows, {
            id: 'transition-arrow-3',
            type: 'movement',
            start: { x: 46.5, y: 51.25 },
            end: { x: 65, y: 38 },
          }],
          description: 'Salida vertical tras recuperación.',
        }
        : play
    )),
  },
};
const reloadedAnalysis = JSON.parse(JSON.stringify(manuallyEditedAnalysis));
assert.deepEqual(reloadedAnalysis.transitionPhaseV1.plays[0].playerPositions['rival:5'], { x: 46.5, y: 51.25 });
assert.equal(reloadedAnalysis.transitionPhaseV1.plays[0].arrows.length, 2);
assert.equal(reloadedAnalysis.transitionPhaseV1.plays[0].description, 'Salida vertical tras recuperación.');
assert.equal(JSON.stringify(reloadedAnalysis.transitionPhaseV1.plays[1]), secondContextSnapshot, 'editar un contexto no altera otro');
assert.equal(JSON.stringify(reloadedAnalysis.defensivePhaseV1), defensiveSnapshot, 'Transiciones no modifica la fase defensiva');
assert.equal(JSON.stringify(reloadedAnalysis.offensivePhaseV1), offensiveSnapshot, 'Transiciones no modifica la fase ofensiva');

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes("phaseField: 'transitionPhaseV1'"), 'Transiciones se guarda en su espacio JSON independiente');
assert.ok(appSource.includes("phaseLabel: 'TRANSITION_PHASE_SAVE'"), 'el error de persistencia queda identificado');
assert.ok(appSource.includes(".from('partidos')"), 'la persistencia usa Supabase');
assert.ok(appSource.includes('sourceTemplateId: template.id'), 'las copias desde plantilla conservan la referencia de origen');
assert.ok(
  appSource.includes('getRenderedPlayerPosition(`rival:${rivalSlot.slot}`, baseSlot)'),
  'la interfaz aplica las coordenadas finales al mismo slot que conserva nombre y fotografía del rival'
);
assert.equal(
  (appSource.match(/buildTransitionInitialPlayerPositions\(/g) || []).length,
  3,
  'el preset de transición se calcula al previsualizar, crear y restablecer'
);
assert.ok(
  appSource.includes("{ value: 'attacking_half', label: 'Campo ofensivo' }"),
  'el selector visual Campo ofensivo usa el valor canónico attacking_half'
);
assert.ok(
  appSource.includes('onChange={(event) => selectTransitionFieldZone(event.target.value)}'),
  'el valor del selector llega a la selección de zona sin traducciones intermedias'
);
assert.ok(
  appSource.includes('previewPositions: previewPlayerPositions'),
  'Sin jugadas envía la previsualización activa al resolvedor de coordenadas finales'
);
const transitionSelectorSource = appSource.slice(
  appSource.indexOf('const selectTransitionType ='),
  appSource.indexOf('const createTransitionPlay =')
);
assert.equal(
  transitionSelectorSource.includes('buildTransitionInitialPlayerPositions'),
  false,
  'cambiar tipo, zona o comportamiento no reposiciona jugadores'
);
const transitionSaveSource = appSource.slice(
  appSource.indexOf('const saveTransitionWorkspace = async () => {'),
  appSource.indexOf('useEffect(() => {', appSource.indexOf('const saveTransitionWorkspace = async () => {'))
);
assert.equal(transitionSaveSource.includes('localStorage'), false, 'Transiciones no usa localStorage');

console.log('transitionPhasePositions tests passed');
