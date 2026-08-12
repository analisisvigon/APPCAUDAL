import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  formatStatsPitchPlayerName,
  resolveStatsVisualIdentity,
} from './statsVisualIdentity.js';

const players = [
  { id: 'player-daniel', name: 'Daniel Palacio', shirtName: 'D. Palacio', number: 8 },
  { id: 'player-marcos', name: 'Marcos Barroso', shortName: 'M. Barroso', number: 4 },
  { id: 'player-diego', name: 'Diego Boza', number: '' },
];

const byId = resolveStatsVisualIdentity({ playerId: 'player-daniel', storedName: '? Nombre antiguo', players });
assert.equal(byId.source, 'player_id');
assert.equal(byId.displayName, 'D. Palacio');
assert.equal(byId.number, 8, 'conserva el dorsal real cuando existe');

const byRoster = resolveStatsVisualIdentity({ storedName: 'Marcos Barroso', players });
assert.equal(byRoster.source, 'roster');
assert.equal(byRoster.displayName, 'M. Barroso');

const legacy = resolveStatsVisualIdentity({ storedName: '? Daniel Palacio Legacy', players });
assert.equal(legacy.source, 'event_name');
assert.equal(legacy.displayName, 'Daniel Palacio Legacy');
assert.ok(!legacy.displayName.includes('?'), 'un nombre legacy válido nunca hereda la interrogación visual');

const withoutNumber = resolveStatsVisualIdentity({ storedName: 'Diego Boza', players });
assert.equal(withoutNumber.number, null, 'no se inventa dorsal cuando no existe');

assert.equal(formatStatsPitchPlayerName('Daniel Palacio'), 'DANIEL PALACIO');
assert.equal(formatStatsPitchPlayerName('Daniel de los Santos Palacio'), 'D. PALACIO');
assert.equal(formatStatsPitchPlayerName('ALBUQUERQUE'), 'ALBUQUERQUE');
assert.equal(formatStatsPitchPlayerName('M. BARROSO'), 'M. BARROSO');
assert.equal(formatStatsPitchPlayerName('J. RODRÍGUEZ'), 'J. RODRÍGUEZ');
assert.equal(formatStatsPitchPlayerName('AGUSTÍN PORTO'), 'AGUSTÍN PORTO');
assert.equal(formatStatsPitchPlayerName('DIEGO BOZA'), 'DIEGO BOZA');
assert.equal(formatStatsPitchPlayerName('?'), 'JUGADOR');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const pitchSource = appSource.slice(
  appSource.indexOf('const renderStatsPitch'),
  appSource.indexOf('const renderCompleteStatsView')
);
assert.ok(pitchSource.includes('↑ {replacementInfo.replacementPitchName} · {replacementInfo.minute}'), 'la etiqueta compacta muestra identidad y minuto de entrada');
assert.ok(!pitchSource.includes('? {replacementInfo.replacementName}'), 'el renderer no antepone una interrogación literal');
assert.ok(appSource.includes('xl:grid-cols-[minmax(240px,0.8fr)_minmax(460px,1.45fr)_minmax(320px,1fr)]'), 'la convocatoria gana 60 px mínimos sin anular el campo');
assert.ok(appSource.includes('min-h-[56px] border'), 'las tarjetas laterales parten de una altura compacta de 56 px');
assert.ok(appSource.includes('overflow-x-hidden overflow-y-auto'), 'la lista usa desplazamiento vertical interno sin desbordamiento horizontal');
assert.ok(appSource.includes('mt-4 min-w-0 overflow-hidden'), 'el campo activo encaja sin un scroll horizontal forzado');
assert.ok(!pitchSource.includes('min-h-[640px]'), 'la proporción del campo ya no impone una anchura intrínseca por altura mínima');

console.log('statsVisualIdentity tests passed');
