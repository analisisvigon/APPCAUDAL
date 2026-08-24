import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlayerDisplayName } from './playerDisplayName.js';
import { getPlayerNumberLabel } from './playerNumberPresentation.js';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const badgeSource = readFileSync(new URL('../components/player/PlayerNumberBadge.jsx', import.meta.url), 'utf8');
const presentationStart = appSource.indexOf('const isPresentationMode = !teamFieldEditMode;');
const presentationEnd = appSource.indexOf('{teamFieldEditMode ? <aside', presentationStart);
const presentationSource = appSource.slice(presentationStart, presentationEnd);

assert.equal(getPlayerNumberLabel(14), '14', 'un dorsal numérico se presenta');
assert.equal(getPlayerNumberLabel(' 8 '), '8', 'un dorsal textual se limpia');
[undefined, null, '', ' ', 0, '0', 'null', 'undefined'].forEach((value) => {
  assert.equal(getPlayerNumberLabel(value), '', `el dorsal ausente ${String(value)} no crea badge`);
});

assert.equal(getPlayerDisplayName({ name: 'Agustín Porto Fernández', shirtName: 'PORTO' }), 'PORTO');
assert.equal(getPlayerDisplayName({ name: 'Mario Sánchez' }), 'Mario Sánchez');

assert.ok(presentationStart > 0 && presentationEnd > presentationStart, 'se localiza la presentación del equipo');
assert.match(presentationSource, /groupedBenchPlayers\.map/);
assert.match(presentationSource, /group\.players\.map/, 'cada categoría representa solo sus jugadores reales');
assert.doesNotMatch(presentationSource, /Array\.from\([^)]*group\.players|empty.*column/i, 'no se crean columnas vacías');
assert.match(presentationSource, /<PlayerNumberBadge number=\{slotPlayer\.number\}/, 'titulares usan el badge compartido');
assert.match(presentationSource, /<PlayerNumberBadge number=\{player\.number\}/, 'reservas usan el mismo badge');
assert.match(presentationSource, /getTacticalPlayerName\(slotPlayer\)/, 'titulares conservan displayName canónico');
assert.match(presentationSource, /getTacticalPlayerName\(player\)/, 'reservas conservan displayName canónico');
assert.match(presentationSource, /team-presentation-bench-groups/);
assert.match(presentationSource, /team-presentation-bench-players/);
assert.match(presentationSource, /aspect-\[7\/6\.25\] min-h-\[330px\] max-h-\[430px\] max-w-\[760px\]/, 'el campo de presentación mantiene exactamente sus dimensiones');

assert.match(cssSource, /\.team-presentation-bench-groups\s*\{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\);/, 'las categorías aprovechan automáticamente el ancho sin estrechar prematuramente los nombres');
assert.match(cssSource, /\.team-presentation-bench-group\s*\{[\s\S]*container-type: inline-size;/, 'cada categoría decide su distribución por ancho real');
assert.match(cssSource, /@container \(min-width: 200px\)\s*\{[\s\S]*\.team-presentation-bench-players\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, 'cada categoría usa dos columnas cuando caben');
assert.match(cssSource, /\.team-presentation-bench-players\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/, 'en anchos insuficientes vuelve a una columna');
assert.match(badgeSource, /getPlayerNumberLabel\(number\)/);
assert.match(badgeSource, /if \(!label\) return null;/, 'sin dorsal no se representa un badge vacío');
assert.match(badgeSource, /bg-caudal-electric/);
assert.match(badgeSource, /aria-label=\{`Dorsal \$\{label\}`\}/);

console.log('team presentation tests passed');
