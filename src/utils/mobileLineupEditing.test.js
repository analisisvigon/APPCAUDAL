import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyPlayerMove } from './rivalTactics.js';
import { moveStatsLineupPlayer, removeStatsLineupPlayer } from './statsLineup.js';
import { moveTacticalDispositionPlayer, validateTacticalDisposition } from './tacticalDispositionEditor.js';
import { getFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';
import { buildMobileReadonlyPitchLayout } from './mobileReadonlyPitchLayout.js';

const rivalPlacements = {
  a: { status: 'starter', slotIndex: 0 },
  b: { status: 'starter', slotIndex: 1 },
  c: { status: 'reserve', slotIndex: 0, reserveOrder: 0 },
  d: { status: 'unplaced' },
};

const rivalEmptyMove = applyPlayerMove({ placements: rivalPlacements, playerId: 'a', destination: { status: 'starter', slotIndex: 2 } });
assert.equal(rivalEmptyMove.changed, true, 'EQUIPOS A: titular a slot vacío usa la operación canónica');
assert.equal(rivalEmptyMove.placements.a.slotIndex, 2);

const rivalSwap = applyPlayerMove({ placements: rivalPlacements, playerId: 'a', destination: { status: 'starter', slotIndex: 1 } });
assert.equal(rivalSwap.placements.a.slotIndex, 1, 'EQUIPOS B: el jugador seleccionado ocupa el destino');
assert.equal(rivalSwap.placements.b.slotIndex, 0, 'EQUIPOS B: el ocupante vuelve al origen sin perderse');
assert.deepEqual(new Set(rivalSwap.movedPlayerIds), new Set(['a', 'b']));

const rivalBenchToField = applyPlayerMove({ placements: rivalPlacements, playerId: 'c', destination: { status: 'starter', slotIndex: 1 } });
assert.equal(rivalBenchToField.placements.c.status, 'starter', 'EQUIPOS C: banquillo a campo');
assert.deepEqual(rivalBenchToField.placements.b, { status: 'reserve', slotIndex: 0, slotId: 'starter:0', reserveOrder: 0, reserveSlotId: 'reserve:0:0' }, 'EQUIPOS C: el sustituido ocupa el origen de banquillo');

const rivalFieldToBench = applyPlayerMove({ placements: rivalPlacements, playerId: 'a', destination: { status: 'reserve', slotIndex: 2, reserveOrder: 0 } });
assert.equal(rivalFieldToBench.placements.a.status, 'reserve', 'EQUIPOS D: campo a banquillo');
assert.equal(new Set(Object.values(rivalFieldToBench.placements).map((placement) => JSON.stringify(placement))).size, 4, 'EQUIPOS: no quedan destinos duplicados');

const preLineup = ['A', 'B', '', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const preEmptyMove = moveStatsLineupPlayer({ lineup: preLineup, playerName: 'A', targetSlot: 2 });
assert.deepEqual(preEmptyMove.lineup.slice(0, 3), ['', 'B', 'A'], 'PRE A: mover a vacío libera el origen');
const preSwap = moveStatsLineupPlayer({ lineup: preLineup, playerName: 'A', targetSlot: 1 });
assert.deepEqual(preSwap.lineup.slice(0, 3), ['B', 'A', ''], 'PRE B: slot ocupado produce swap');
const preBenchToField = moveStatsLineupPlayer({ lineup: preLineup, playerName: 'SUPLENTE', targetSlot: 1 });
assert.equal(preBenchToField.lineup[1], 'SUPLENTE', 'PRE C: el suplente entra en el XI');
assert.equal(preBenchToField.demotedPlayerName, 'B', 'PRE C: el titular desplazado pasa a suplente según el dominio existente');
assert.equal(removeStatsLineupPlayer(preLineup, 'A')[0], '', 'PRE D: enviar al banquillo libera el slot');

const participants = Array.from({ length: 11 }, (_, index) => ({ playerId: `p${index}`, playerName: `Jugador ${index}` }));
const statsSwap = moveTacticalDispositionPlayer({ lineup: participants, player: participants[0], targetSlot: 1 });
assert.equal(statsSwap[1].playerId, 'p0', 'ESTADÍSTICAS B: el seleccionado ocupa el destino');
assert.equal(statsSwap[0].playerId, 'p1', 'ESTADÍSTICAS B: el ocupante vuelve al origen');
assert.equal(validateTacticalDisposition({ lineup: statsSwap, knownPlayers: participants }).valid, true, 'ESTADÍSTICAS: el draft conserva exactamente once jugadores únicos');

let consecutive = moveTacticalDispositionPlayer({ lineup: participants, player: participants[0], targetSlot: 1 });
consecutive = moveTacticalDispositionPlayer({ lineup: consecutive, player: participants[0], targetSlot: 5 });
assert.equal(validateTacticalDisposition({ lineup: consecutive, knownPlayers: participants }).valid, true, 'F: varios movimientos consecutivos conservan invariantes');

['4-4-2', '4-3-3', '4-2-3-1', '5-3-2', '3-4-3', '3-5-2', '3-4-1-2', '5-4-1', 'Otro'].forEach((system) => {
  const slots = buildMobileReadonlyPitchLayout(getFormationSlotsForSavedLineup(system));
  assert.equal(slots.length, 11, `${system}: la interfaz móvil conserva once destinos`);
  assert.equal(new Set(slots.map((slot) => `${slot.mobileX}:${slot.mobileY}`)).size, 11, `${system}: ningún destino móvil comparte coordenadas`);
});

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const componentSource = fs.readFileSync(new URL('../components/tactical/MobileEditableTacticalPitch.jsx', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');

assert.match(appSource, /moveSelectedTeamPlayerOnMobile[\s\S]*?placePlayer\(player, destination\)/, 'EQUIPOS móvil reutiliza placePlayer');
assert.match(appSource, /movePreCaudalPlayerOnMobile[\s\S]*?moveStatsLineupPlayer/, 'PRE móvil reutiliza la transición con swap');
assert.match(appSource, /onSelectTarget=\{\(targetSlot, slotIndex\)[\s\S]*?moveTacticalEditorPlayer/, 'ESTADÍSTICAS móvil modifica el mismo draft del editor');
assert.match(componentSource, /<button[\s\S]*?aria-pressed=/, 'los slots son controles accesibles con estado de selección');
assert.match(componentSource, /if \(isSelected\) onCancelSelection/, 'E: tocar de nuevo el jugador seleccionado cancela la selección');
assert.doesNotMatch(componentSource, /draggable|onDragStart|onDrop/, 'la variante móvil no depende de HTML Drag & Drop');
assert.match(cssSource, /@media \(max-width: 430px\)[\s\S]*?\.desktop-mobile-edit-fallback/, 'el renderer móvil se activa mediante breakpoint, sin user agent');
assert.match(cssSource, /\.mobile-edit-pitch-portrait \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/, 'los destinos ofrecen un objetivo táctil de 44x44 px');

console.log('mobileLineupEditing tests passed');
