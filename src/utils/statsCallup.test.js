import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  addAllOutsideStatsCallups,
  calculateStatsCallupCounts,
  getOutsideStatsCallupPlayerNames,
  getStatsCallupPositionGroup,
  groupStatsCallupRowsByPosition,
  toggleStatsCallupGroupState,
} from './statsCallup.js';
import { getPlayerDisplayName } from './playerDisplayName.js';

const players = Array.from({ length: 28 }, (_, index) => {
  const line = index < 3 ? 'goalkeeper' : index < 11 ? 'defender' : index < 20 ? 'midfielder' : index < 27 ? 'forward' : '';
  return {
    id: `player-${index + 1}`,
    name: `Nombre completo ${index + 1}`,
    shirtName: index === 0 ? 'PORTERO' : `CAMISETA ${index + 1}`,
    shortName: `CORTO ${index + 1}`,
    number: index + 1,
    primaryNaturalPosition: line,
  };
});

let rows = players.map((player) => ({ player, status: 'Fuera' }));
assert.equal(calculateStatsCallupCounts(rows).outside, 28, 'la plantilla grande empieza fuera');
assert.deepEqual(getOutsideStatsCallupPlayerNames(rows), players.map((player) => player.name), 'la selección total no depende de un filtro visual');
assert.deepEqual(
  getOutsideStatsCallupPlayerNames([...rows, rows[0]]),
  players.map((player) => player.name),
  'la selección total no genera duplicados'
);

rows = addAllOutsideStatsCallups(rows);
assert.deepEqual(calculateStatsCallupCounts(rows), {
  called: 28, starters: 0, substitutes: 28, outside: 0, total: 28,
}, 'añadir todos pasa cada fuera a suplente sin estados intermedios');

rows = rows.map((row, index) => (index < 11 ? { ...row, status: 'Titular' } : row));
assert.deepEqual(calculateStatsCallupCounts(rows), {
  called: 28, starters: 11, substitutes: 17, outside: 0, total: 28,
}, 'once titulares mantienen la igualdad convocados = titulares + suplentes');

rows = rows.map((row, index) => (index >= 24 ? { ...row, status: 'Fuera' } : row));
assert.deepEqual(calculateStatsCallupCounts(rows), {
  called: 24, starters: 11, substitutes: 13, outside: 4, total: 28,
}, 'la separación posterior conserva los cuatro contadores coherentes');

assert.equal(getStatsCallupPositionGroup(players[0]), 'POR');
assert.equal(getStatsCallupPositionGroup(players[5]), 'DEF');
assert.equal(getStatsCallupPositionGroup(players[14]), 'MC');
assert.equal(getStatsCallupPositionGroup(players[22]), 'ATA');
assert.equal(getStatsCallupPositionGroup(players[27]), 'OTROS', 'una posición desconocida no se fuerza a un grupo ambiguo');

const grouped = groupStatsCallupRowsByPosition(rows.filter((row) => row.status === 'Suplente'));
assert.ok(grouped.every((group) => group.rows.length > 0), 'solo se devuelven grupos con jugadores');
assert.deepEqual(grouped.map((group) => group.key), ['MC', 'ATA'], 'los grupos no vacíos respetan el orden futbolístico canónico');

assert.equal(getPlayerDisplayName({ shirtName: 'BOZA', shortName: 'DIEGO', name: 'Diego Boza' }), 'BOZA');
assert.equal(getPlayerDisplayName({ shortName: 'DIEGO', name: 'Diego Boza' }), 'DIEGO');
assert.equal(getPlayerDisplayName({ name: 'Diego Boza' }), 'Diego Boza');

let collapsedGroups = {};
['Suplente-POR', 'Suplente-DEF', 'Suplente-MC', 'Suplente-ATA', 'Fuera-POR', 'Fuera-DEF', 'Fuera-MC', 'Fuera-ATA', 'Fuera-OTROS'].forEach((key) => {
  collapsedGroups = toggleStatsCallupGroupState(collapsedGroups, key);
  assert.equal(collapsedGroups[key], true, `${key} se puede plegar`);
  collapsedGroups = toggleStatsCallupGroupState(collapsedGroups, key);
  assert.equal(collapsedGroups[key], false, `${key} se puede desplegar`);
});

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('AÑADIR TODOS A CONVOCADOS'), 'la acción masiva está expuesta en la cabecera del gestor');
assert.ok(appSource.includes('getAvailableOutsidePlayerNames(getStatsSquadRows())'), 'la acción usa toda la plantilla y filtra por disponibilidad persistente');
assert.ok(appSource.includes("row.status === 'Fuera' && isPlayerAvailable(row.player)"), 'seleccionar visibles mantiene filtro y disponibilidad');
assert.ok(appSource.includes('aria-expanded={!collapsed}'), 'los grupos usan un control accesible de expansión');
assert.ok(appSource.includes('aria-controls={contentId}'), 'los controles enlazan con su contenido');
assert.ok(appSource.includes('aria-label={`${collapsed ? \'Abrir\' : \'Cerrar\'} ${title.toLowerCase()} ${group.label.toLowerCase()}`}'), 'cada grupo declara una etiqueta accesible contextual');
assert.ok(appSource.includes("supabase.from(\"partido_convocados\").upsert(convocadoRows"), 'la convocatoria masiva conserva la persistencia existente');
assert.ok(appSource.includes("player && isPlayerAvailable(player)"), 'la escritura masiva vuelve a validar disponibilidad y evita selecciones obsoletas');
assert.ok(appSource.includes("'set_player_availability'"), 'Plantilla y Convocatoria reutilizan la misma RPC persistente');
assert.ok(appSource.includes('window.confirm(leavingSanctionMessage)') && appSource.includes("'Queda 1 partido'"), 'I: el alta manual con sanción pendiente exige confirmación');
assert.ok(appSource.includes('availabilityDraft.status === PLAYER_AVAILABILITY.suspended') && appSource.includes('min="0"'), 'J: el contador permite cero y la RPC normaliza el alta');
assert.ok(appSource.includes("await refreshStatsFromSupabase(selectedMatch.id, 'convocatoria completa')"), 'la acción vuelve a leer el estado persistido real');
assert.ok(appSource.includes("if (role === 'Fuera')") && appSource.includes('removeStatsCalledPlayer(playerName)'), 'FUERA conserva el borrado de la convocatoria real');
assert.ok(appSource.includes('const legacyCalledRows = calledPlayers'), 'los convocados heredados fuera de la plantilla activa no desaparecen del recuento');
assert.ok(appSource.includes("{['Titular', 'Suplente', 'Fuera'].map"), 'las tres transiciones individuales siguen expuestas');
const addAllHandlerSource = appSource.slice(appSource.indexOf('const handleAddAllStatsCallups'), appSource.indexOf('const handleAddSelectedStatsCallups'));
assert.ok(!addAllHandlerSource.includes('confirm('), 'añadir todos se ejecuta sin confirmación intermedia');
assert.ok(appSource.includes('min-h-0 flex-1 overflow-y-auto'), 'el modal conserva un único flujo vertical desplazable');
assert.ok(appSource.includes('break-words text-sm font-black leading-tight'), 'la identidad lateral puede usar varias líneas sin truncarse');
assert.ok(appSource.includes('w-[88px] shrink-0'), 'el selector se mantiene compacto en anchos reducidos');
assert.ok(!appSource.includes('className={`${maxHeight} space-y-2 overflow-y-auto pr-1`}'), 'la convocatoria lateral no conserva scrolls verticales internos');

console.log('statsCallup tests passed');
