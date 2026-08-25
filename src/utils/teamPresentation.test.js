import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlayerDisplayName } from './playerDisplayName.js';
import { formatPlayerNumberName, getPlayerNumberLabel } from './playerNumberPresentation.js';
import {
  getTeamPresentationBenchGroup,
  getTeamPresentationPlayerName,
  getTeamPresentationVariant,
} from './teamPresentation.js';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const numberNameSource = readFileSync(new URL('../components/player/PlayerNumberName.jsx', import.meta.url), 'utf8');
const presentationStart = appSource.indexOf('const isPresentationMode = !teamFieldEditMode;');
const presentationEnd = appSource.indexOf('{teamFieldEditMode ? <aside', presentationStart);
const presentationSource = appSource.slice(presentationStart, presentationEnd);

assert.equal(getPlayerNumberLabel(14), '14', 'un dorsal numérico se presenta');
assert.equal(getPlayerNumberLabel(' 8 '), '8', 'un dorsal textual se limpia');
[undefined, null, '', ' ', 0, '0', 'null', 'undefined'].forEach((value) => {
  assert.equal(getPlayerNumberLabel(value), '', `el dorsal ausente ${String(value)} no crea badge`);
});
assert.equal(formatPlayerNumberName(20, 'QUIRÓS'), '20 · QUIRÓS');
assert.equal(formatPlayerNumberName(9, 'G. CUETO'), '9 · G. CUETO');
assert.equal(formatPlayerNumberName('', 'LUISEN'), 'LUISEN', 'sin dorsal no queda separador ni hueco');
[
  [20, 'QUIRÓS'],
  [9, 'G. CUETO'],
  [10, 'SAMU PÉREZ'],
  [11, 'LORA'],
  [16, 'LUISEN'],
  [21, 'ALEX BASURTO'],
  [5, 'ÁLEX MENÉNDEZ'],
  [15, 'GUAYA'],
  [4, 'MARIO SÁNCHEZ'],
  [2, 'BORJA ÁLVAREZ'],
  [1, 'DENNIS DÍAZ'],
].forEach(([number, name]) => {
  assert.equal(formatPlayerNumberName(number, name), `${number} · ${name}`);
});

assert.equal(getPlayerDisplayName({ name: 'Agustín Porto Fernández', shirtName: 'PORTO' }), 'PORTO');
assert.equal(getPlayerDisplayName({ name: 'Mario Sánchez' }), 'Mario Sánchez');
assert.equal(getTeamPresentationPlayerName({ shirt_name: 'PRIMERO', shirtName: 'SEGUNDO', nombre_camiseta: 'TERCERO', name: 'Cuarto' }), 'PRIMERO', 'la presentación respeta la prioridad exacta del nombre de camiseta');
assert.equal(getTeamPresentationPlayerName({ nombre_camiseta: 'QUIRÓS', name: 'Daniel Quirós' }), 'QUIRÓS', 'nombre_camiseta se admite como fuente compatible');
assert.equal(getTeamPresentationPlayerName({ name: 'Dennis Díaz' }), 'Dennis Díaz', 'el nombre normal permanece como fallback');
assert.equal(getTeamPresentationVariant({ variant_system: '5-3-2' }), '5-3-2', 'la variante se lee sin crear otra fuente de verdad');
assert.equal(getTeamPresentationVariant({}), 'Sin registrar', 'no se inventa una variante cuando la ficha no la guarda');

const benchGroups = [
  ['right_back', 'LATERALES'],
  ['left_back', 'LATERALES'],
  ['centre_back', 'CENTRALES'],
  ['holding_midfield', 'MEDIOCENTROS'],
  ['attacking_midfield', 'MEDIAPUNTAS'],
  ['right_winger', 'EXTREMOS'],
  ['left_winger', 'EXTREMOS'],
  ['centre_forward', 'DELANTEROS'],
];
benchGroups.forEach(([primarySpecificPosition, expected]) => {
  assert.equal(getTeamPresentationBenchGroup({ primarySpecificPosition }).label, expected);
});

assert.ok(presentationStart > 0 && presentationEnd > presentationStart, 'se localiza la presentación del equipo');
assert.match(presentationSource, /groupedBenchPlayers\.map/);
assert.match(presentationSource, /group\.players\.map/, 'cada categoría representa solo sus jugadores reales');
assert.doesNotMatch(presentationSource, /Array\.from\([^)]*group\.players|empty.*column/i, 'no se crean columnas vacías');
assert.match(presentationSource, /<PlayerNumberName player=\{slotPlayer\}/, 'titulares usan la identidad textual compartida');
assert.match(presentationSource, /player=\{player\}[\s\S]*?displayName=\{getTeamPresentationPlayerName\(player\)\}/, 'reservas usan la prioridad de nombre específica de presentación');
assert.doesNotMatch(presentationSource, /PlayerNumberBadge/, 'no queda ningún badge de dorsal en la presentación');
assert.match(presentationSource, /slotPlayer\.image[\s\S]*?<\/span>[\s\S]*?<span className="absolute bottom-1 left-1\/2[\s\S]*?<PlayerNumberName player=\{slotPlayer\}/, 'la fotografía se cierra antes de representar el label absoluto centrado');
assert.match(presentationSource, /absolute bottom-1 left-1\/2 flex w-max max-w-\[6\.25rem\][^"']*-translate-x-1\/2[^"']*lg:max-w-\[7\.5rem\]/, 'la identidad completa crece simétricamente desde el centro único del titular');
assert.match(presentationSource, /<PlayerNumberName player=\{slotPlayer\}[^>]*\/>[\s\S]*?title="Capitán"[\s\S]*?<\/span>/, 'dorsal, nombre y capitán comparten el mismo label centrado');
assert.match(presentationSource, /style=\{\{ left: `\$\{slot\.x\}%`, top: `\$\{slot\.y\}%` \}\}/, 'la raíz conserva las coordenadas tácticas como único punto de posicionamiento');
assert.match(presentationSource, /lg:grid-cols-\[minmax\(0,72fr\)_minmax\(280px,28fr\)\]/, 'presentación reparte el ancho 72/28 entre campo y panel');
assert.match(presentationSource, /aspect-\[7\/9\] h-\[clamp\(520px,68vh,740px\)\] w-auto max-w-full/, 'el campo es vertical, grande y adapta su altura al viewport');
assert.doesNotMatch(presentationSource, /aspect-\[7\/6\.25\]|max-h-\[430px\]/, 'se elimina el campo cuadrado y su límite artificial anterior');
assert.match(presentationSource, /isPresentationMode \? \([\s\S]*?<aside className="flex h-\[clamp\(520px,68vh,740px\)\]/, 'el panel de presentación es hermano del campo y no queda debajo dentro de su tarjeta');
assert.match(presentationSource, />Sistema<\/p>[\s\S]*?selectedTeam\.system[\s\S]*?>Variante<\/p>[\s\S]*?presentationVariant[\s\S]*?>Banquillo<\/p>/, 'sistema, variante y banquillo encabezan el panel derecho');
assert.match(presentationSource, /<div className="mt-1 grid grid-cols-2 gap-1">/, 'cada categoría admite exactamente dos suplentes por fila');
assert.match(presentationSource, /truncateName=\{false\}/, 'el banquillo permite nombres multilínea antes de truncarlos');
assert.match(presentationSource, /getTeamPresentationBenchGroup\(player\)/, 'las categorías compatibles comparten un normalizador de presentación');
assert.doesNotMatch(presentationSource, /team-presentation-bench-groups|team-presentation-bench-players/, 'desaparece la composición horizontal antigua bajo el campo');
assert.match(numberNameSource, /String\(displayName \|\| ''\)\.trim\(\) \|\| getPlayerDisplayName\(player\)/, 'la identidad compartida admite un nombre de presentación sin cambiar su fallback general');
assert.match(numberNameSource, /\{number \? \(/, 'el bloque dorsal y separador solo existe cuando hay dorsal');
assert.match(numberNameSource, /text-caudal-electric/);
assert.match(numberNameSource, /text-slate-500/);
assert.match(numberNameSource, /truncateName \? 'truncate' : 'whitespace-normal break-words'/);

console.log('team presentation tests passed');
