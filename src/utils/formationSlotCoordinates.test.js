import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getFormationCoordinatesForSavedLineup,
  getFormationSlotCoordinates,
  getFormationSlotsForSavedLineup,
  hasFormationSlotsForSavedLineup,
} from './formationSlotCoordinates.js';
import { buildMobileReadonlyPitchLayout } from './mobileReadonlyPitchLayout.js';

assert.equal(hasFormationSlotsForSavedLineup('4-3-3'), true);
assert.equal(hasFormationSlotsForSavedLineup('sistema-inexistente'), false, 'un sistema desconocido no puede validar un snapshot completo aunque exista fallback visual');

const slotById = (system, id) => getFormationSlotsForSavedLineup(system).find((slot) => slot.id === id);
const assertLeftOf = (system, leftId, rightId) => {
  const left = slotById(system, leftId);
  const right = slotById(system, rightId);
  assert.ok(left && right, `${system}: existen ${leftId} y ${rightId}`);
  assert.ok(left.x < right.x, `${system}: ${leftId} queda visualmente a la izquierda de ${rightId}`);
};

// 4-2-3-1: laterales, centrales y extremos/mediapuntas conservan su lado tactico.
assertLeftOf('4-2-3-1', 'LI', 'LD');
assertLeftOf('4-2-3-1', 'DFC_I', 'DFC_D');
assertLeftOf('4-2-3-1', 'MPI', 'MPD');
assert.ok(slotById('4-2-3-1', 'LI').x < 50 && slotById('4-2-3-1', 'LD').x > 50);
assert.ok(slotById('4-2-3-1', 'MPI').x < 50 && slotById('4-2-3-1', 'MPD').x > 50);

// 4-3-3: misma convencion para toda la estructura horizontal.
assertLeftOf('4-3-3', 'LI', 'LD');
assertLeftOf('4-3-3', 'DFC_I', 'DFC_D');
assertLeftOf('4-3-3', 'MC_I', 'MC_D');
assertLeftOf('4-3-3', 'EI', 'ED');
assert.ok(slotById('4-3-3', 'EI').x < 50 && slotById('4-3-3', 'ED').x > 50);

// Fixture representativo del partido mostrado: system + slot + jugador_id es la fuente de verdad.
const displayedMatchFixture = {
  id: 'partido-mostrado-fixture',
  statsSystem: '4-2-3-1',
  slots: [
    ['jugador-por', 'Portero'],
    ['jugador-ld', 'Lateral derecho'],
    ['jugador-dfcd', 'Central derecho'],
    ['jugador-dfci', 'Central izquierdo'],
    ['jugador-li', 'Lateral izquierdo'],
    ['jugador-mc-d', 'Pivote derecho'],
    ['jugador-mc-i', 'Pivote izquierdo'],
    ['jugador-ed', 'Extremo derecho'],
    ['jugador-mp', 'Mediapunta'],
    ['jugador-ei', 'Extremo izquierdo'],
    ['jugador-dc', 'Delantero'],
  ].map(([jugadorId, playerName], slot) => ({ slot, jugadorId, playerName })),
};

const statsCoordinates = displayedMatchFixture.slots.map(({ slot }) => (
  getFormationSlotCoordinates(displayedMatchFixture.statsSystem, slot)
));
const printCoordinates = getFormationCoordinatesForSavedLineup(displayedMatchFixture.statsSystem);
assert.deepEqual(printCoordinates, statsCoordinates, 'Estadisticas e Impresion traducen cada slot con coordenadas identicas');
assert.ok(statsCoordinates[4].x < 50 && printCoordinates[4].x < 50, 'el LI del fixture queda a la izquierda en ambas vistas');
assert.ok(statsCoordinates[1].x > 50 && printCoordinates[1].x > 50, 'el LD del fixture queda a la derecha en ambas vistas');
assert.ok(statsCoordinates[9].x < statsCoordinates[7].x, 'EI queda a la izquierda de ED en el fixture');
assert.equal(statsCoordinates[0].y, 89, 'la correccion no cambia la posicion vertical del portero');

const synthetic4411 = [
  { id: 'POR', x: 50, y: 89 },
  ...[18, 39, 61, 82].map((x, index) => ({ id: `DEF-${index}`, x, y: 73 })),
  ...[18, 39, 61, 82].map((x, index) => ({ id: `MED-${index}`, x, y: 45 })),
  { id: 'MP', x: 50, y: 29 },
  { id: 'DC', x: 50, y: 14 },
];

const mobileFormationFixtures = [
  ...['4-4-2', '4-3-3', '4-2-3-1', '5-3-2', '3-4-3'].map((system) => ({
    system,
    slots: getFormationSlotsForSavedLineup(system),
  })),
  { system: '4-4-1-1', slots: synthetic4411 },
];

mobileFormationFixtures.forEach(({ system, slots }) => {
  const mobileLayout = buildMobileReadonlyPitchLayout(slots);
  assert.equal(mobileLayout.length, 11, `${system}: conserva los once slots en consulta movil`);
  assert.deepEqual(
    mobileLayout.map(({ x, y }) => ({ x, y })),
    slots.map(({ x, y }) => ({ x, y })),
    `${system}: el layout movil no modifica las coordenadas canonicas`
  );
  const rows = mobileLayout.reduce((result, slot) => {
    result[slot.mobileRow] = [...(result[slot.mobileRow] || []), slot];
    return result;
  }, {});
  Object.values(rows).forEach((row) => {
    const ordered = row.slice().sort((left, right) => left.mobileX - right.mobileX);
    ordered.slice(1).forEach((slot, index) => {
      assert.ok(slot.mobileX - ordered[index].mobileX >= 19.5, `${system}: no hay solapamiento horizontal grave en lineas de hasta cinco jugadores`);
    });
  });
  assert.ok(mobileLayout.every((slot) => slot.mobileX >= 10 && slot.mobileX <= 90), `${system}: ningun jugador queda cortado lateralmente`);
  assert.ok(mobileLayout.every((slot) => slot.mobileY >= 18 && slot.mobileY <= 87), `${system}: ningun jugador queda cortado verticalmente`);
});

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const printTabSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const mobilePitchSource = fs.readFileSync(new URL('../components/tactical/MobileReadonlyTacticalPitch.jsx', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');
assert.match(appSource, /getTacticalSnapshotFormationSlots = \(system\) => getFormationSlotsForSavedLineup\(system\)/, 'Estadisticas consume la utilidad canonica');
assert.match(printTabSource, /getFormationCoordinatesForSavedLineup\(system\)/, 'preview, PDF y dossier consumen la utilidad canonica');
assert.doesNotMatch(printTabSource, /getFormationCoordinates\(system\)/, 'Impresion no vuelve al catalogo legacy con orden opuesto');
assert.ok((printTabSource.match(/<LineupPrintSheet/g) || []).length >= 2, 'hoja individual y dossier comparten LineupPrintSheet');
assert.match(appSource, /statsReadonlyMode = !editingDisposition && !hasLocalProposal/, 'Estadisticas solo activa la alternativa movil fuera de edicion');
assert.match(appSource, /isPresentationMode \? 'desktop-readonly-tactical-surface'/, 'EQUIPOS conserva separado su renderer de edicion');
assert.match(mobilePitchSource, /buildMobileReadonlyPitchLayout\(slots\)/, 'las consultas moviles comparten el layout anticolision');
assert.match(cssSource, /@media \(max-width: 430px\)[\s\S]*\.desktop-readonly-tactical-surface \{[\s\S]*display: none !important;/, 'el intercambio de renderer se limita al breakpoint movil solicitado');

console.log('formationSlotCoordinates tests passed');
