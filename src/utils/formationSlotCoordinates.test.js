import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getFormationCoordinatesForSavedLineup,
  getFormationSlotCoordinates,
  getFormationSlotsForSavedLineup,
} from './formationSlotCoordinates.js';

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

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const printTabSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
assert.match(appSource, /getTacticalSnapshotFormationSlots = \(system\) => getFormationSlotsForSavedLineup\(system\)/, 'Estadisticas consume la utilidad canonica');
assert.match(printTabSource, /getFormationCoordinatesForSavedLineup\(system\)/, 'preview, PDF y dossier consumen la utilidad canonica');
assert.doesNotMatch(printTabSource, /getFormationCoordinates\(system\)/, 'Impresion no vuelve al catalogo legacy con orden opuesto');
assert.ok((printTabSource.match(/<LineupPrintSheet/g) || []).length >= 2, 'hoja individual y dossier comparten LineupPrintSheet');

console.log('formationSlotCoordinates tests passed');
