import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlayerDisplayName } from './playerDisplayName.js';
import { formatPlayerNumberName, getPlayerNumberLabel } from './playerNumberPresentation.js';
import {
  getCollisionSafePresentationCoordinates,
  getTeamPresentationBenchGroup,
  getTeamPresentationPlayerName,
  getTeamPresentationVariants,
  normalizeTeamTacticalVariants,
} from './teamPresentation.js';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const numberNameSource = readFileSync(new URL('../components/player/PlayerNumberName.jsx', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../../supabase_rival_team_tactical_variants.sql', import.meta.url), 'utf8');
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
assert.deepEqual(normalizeTeamTacticalVariants('4-2-3-1, 5-3-2; 4-3-3'), ['4-2-3-1', '5-3-2', '4-3-3']);
assert.deepEqual(getTeamPresentationVariants({
  system: '4-4-2',
  tactical_variants: ['4-2-3-1', '5-3-2'],
  variant: '4-3-3; 4-4-2',
}), ['4-2-3-1', '5-3-2', '4-3-3'], 'el array nuevo y los campos legacy se combinan, deduplican y excluyen el sistema principal');
assert.deepEqual(getTeamPresentationVariants({}), [], 'sin variantes se devuelve un array vacío explícito');

const benchGroups = [
  ['right_back', 'DEFENSAS'],
  ['left_back', 'DEFENSAS'],
  ['centre_back', 'DEFENSAS'],
  ['holding_midfield', 'MEDIOCENTROS'],
  ['attacking_midfield', 'MEDIOCENTROS'],
  ['right_winger', 'ATACANTES'],
  ['left_winger', 'ATACANTES'],
  ['centre_forward', 'ATACANTES'],
];
benchGroups.forEach(([primarySpecificPosition, expected]) => {
  assert.equal(getTeamPresentationBenchGroup({ primarySpecificPosition }).label, expected);
});

[2, 3, 4, 5].forEach((playersInLine) => {
  const coordinates = Array.from({ length: playersInLine }, (_, index) => ({ x: 10 + index * 10, y: 50 }));
  const safe = getCollisionSafePresentationCoordinates(coordinates);
  const gaps = safe.slice(1).map((coordinate, index) => coordinate.x - safe[index].x);
  assert.ok(gaps.every((gap) => gap >= 20), `una línea de ${playersInLine} jugadores conserva separación horizontal estructural`);
});
const safeFormation = getCollisionSafePresentationCoordinates([
  { x: 42, y: 14 }, { x: 58, y: 16 },
  { x: 34, y: 45 }, { x: 50, y: 49 }, { x: 66, y: 45 },
  { x: 12, y: 73 }, { x: 32, y: 75 }, { x: 50, y: 76 }, { x: 68, y: 75 }, { x: 88, y: 73 },
  { x: 50, y: 89 },
]);
assert.deepEqual(safeFormation.slice(5, 10).map(({ x }) => x), [9, 29.5, 50, 70.5, 91], 'la línea de cinco usa centros anticolicisión sin sacar las tarjetas del campo');
assert.ok(new Set(safeFormation.map(({ y }) => y)).size === 4, 'las alturas tácticas se conservan como cuatro líneas separadas');

assert.ok(presentationStart > 0 && presentationEnd > presentationStart, 'se localiza la presentación del equipo');
assert.match(presentationSource, /groupedBenchPlayers\.map/);
assert.match(presentationSource, /group\.players\.map/, 'cada categoría representa solo sus jugadores reales');
assert.doesNotMatch(presentationSource, /Array\.from\([^)]*group\.players|empty.*column/i, 'no se crean columnas vacías');
assert.match(presentationSource, /presentationBenchPlayers = rivalPlayers[\s\S]*?filter\(\(player\) => !starterKeys\.has/, 'el banquillo parte de todos los jugadores que no son titulares');
assert.doesNotMatch(presentationSource, /presentationBenchPlayers[\s\S]{0,160}\.slice\(/, 'no se limita artificialmente el número de reservas');
assert.match(presentationSource, /<PlayerNumberName player=\{slotPlayer\}/, 'titulares usan la identidad textual compartida');
assert.match(presentationSource, /player=\{player\}[\s\S]*?displayName=\{getTeamPresentationPlayerName\(player\)\}/, 'reservas usan la prioridad de nombre específica de presentación');
assert.doesNotMatch(presentationSource, /PlayerNumberBadge/, 'no queda ningún badge de dorsal en la presentación');
assert.match(presentationSource, /slotPlayer\.image[\s\S]*?<\/span>[\s\S]*?absolute bottom-1 left-1\/2[\s\S]*?<PlayerNumberName player=\{slotPlayer\}/, 'la fotografía se cierra antes de representar el label absoluto centrado');
assert.match(presentationSource, /w-\[calc\(100%-0\.35rem\)\] text-\[8px\] 2xl:text-\[9px\]/, 'la identidad queda contenida dentro de su propia tarjeta y no invade al jugador contiguo');
assert.match(presentationSource, /<PlayerNumberName player=\{slotPlayer\}[^>]*\/>[\s\S]*?title="Capitán"[\s\S]*?<\/span>/, 'dorsal, nombre y capitán comparten el mismo label centrado');
assert.match(presentationSource, /style=\{\{ left: `\$\{slot\.x\}%`, top: `\$\{slot\.y\}%` \}\}/, 'la raíz conserva las coordenadas tácticas como único punto de posicionamiento');
assert.match(presentationSource, /getCollisionSafePresentationCoordinates/, 'la presentación calcula centros seguros sin alterar las coordenadas del editor');
assert.match(presentationSource, /w-\[4\.75rem\] 2xl:w-\[5\.5rem\]/, 'las tarjetas de presentación responden al ancho de pantalla');
assert.match(presentationSource, /lg:grid-cols-\[minmax\(0,70fr\)_minmax\(310px,30fr\)\]/, 'presentación reparte el ancho 70/30 entre campo y panel');
assert.match(presentationSource, /aspect-\[3\/4\] h-\[calc\(100dvh-12rem\)\] min-h-\[540px\] max-h-\[780px\] w-auto max-w-full/, 'el campo gana longitud y adapta su altura real al viewport');
assert.doesNotMatch(presentationSource, /aspect-\[7\/6\.25\]|max-h-\[430px\]/, 'se elimina el campo cuadrado y su límite artificial anterior');
assert.match(presentationSource, /isPresentationMode \? \([\s\S]*?<aside className="flex h-full min-h-0/, 'el panel de presentación es hermano del campo y se estira exactamente a su altura adaptable');
assert.match(presentationSource, />Sistema principal<\/p>[\s\S]*?selectedTeam\.system[\s\S]*?>Variantes<\/p>[\s\S]*?presentationVariants\.map[\s\S]*?>Banquillo<\/p>/, 'sistema principal, variantes múltiples y banquillo encabezan el panel derecho');
assert.match(presentationSource, /<div className="mt-1 grid grid-cols-2 gap-1">/, 'cada categoría admite exactamente dos suplentes por fila');
assert.match(presentationSource, /overflow-y-auto overscroll-contain/, 'solo el contenido excepcional del banquillo activa scroll interno');
assert.doesNotMatch(presentationSource, /truncateName=\{false\}/, 'los nombres del banquillo no se parten en tres o cuatro líneas');
assert.match(presentationSource, /getTeamPresentationBenchGroup\(player\)/, 'las categorías compatibles comparten un normalizador de presentación');
assert.doesNotMatch(presentationSource, /team-presentation-bench-groups|team-presentation-bench-players/, 'desaparece la composición horizontal antigua bajo el campo');
assert.match(appSource, /tactical_variants: normalizeTeamTacticalVariants\(form\.tacticalVariants\)/, 'el formulario persiste un array canónico de variantes');
assert.match(appSource, /tacticalVariants: getTeamPresentationVariants\(row\)/, 'la lectura migra arrays nuevos y valores legacy');
assert.match(appSource, /Variantes tácticas[\s\S]*?normalizeTeamTacticalVariants\(event\.target\.value\)/, 'la ficha permite registrar varias variantes');
assert.match(appSource, /Variantes de sistema[\s\S]*?Editar[\s\S]*?deleteSelectedTeamTacticalVariant[\s\S]*?Añadir variante/, 'el editor táctico permite añadir, editar y eliminar variantes');
assert.match(appSource, /update\(\{ tactical_variants: nextVariants \}\)/, 'el gestor visible persiste inmediatamente el array en Supabase');
assert.match(appSource, /!selectedTeam \|\| teamFieldEditMode \? <section[\s\S]*?Base de datos de scouting/, 'la cabecera exterior redundante queda fuera de la presentación');
assert.match(migrationSource, /add column if not exists tactical_variants text\[\]/, 'la migración crea un array SQL sin reemplazar el sistema principal');
assert.match(migrationSource, /variant_system[\s\S]*alternative_system[\s\S]*variant[\s\S]*variante/, 'la migración contempla nombres legacy conocidos');
assert.match(numberNameSource, /String\(displayName \|\| ''\)\.trim\(\) \|\| getPlayerDisplayName\(player\)/, 'la identidad compartida admite un nombre de presentación sin cambiar su fallback general');
assert.match(numberNameSource, /\{number \? \(/, 'el bloque dorsal y separador solo existe cuando hay dorsal');
assert.match(numberNameSource, /text-caudal-electric/);
assert.match(numberNameSource, /text-slate-500/);
assert.match(numberNameSource, /truncateName \? 'truncate' : 'whitespace-normal break-words'/);

console.log('team presentation tests passed');
