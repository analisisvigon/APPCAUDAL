import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PRINT_PLAYER_TEAM_TYPES,
  buildPrintPlayerShirtModel,
  getPrintPlayerIdentity,
} from './printPlayerShirt.js';

const agus = { id: 'agus', name: 'Agustín Porto García', shirt_name: 'AGUS PORTO', abbreviation: 'AP', number: 20 };
const boza = { id: 'boza', name: 'Diego Boza Fernández', abbreviation: 'BOZA', number: 7 };
const acerete = { id: 'acerete', name: 'Nombre administrativo', shortName: 'ACERETE', number: 9 };

assert.equal(getPrintPlayerIdentity(agus), 'AGUS PORTO', 'shirt_name tiene prioridad y no se recorta');
assert.equal(getPrintPlayerIdentity(boza), 'BOZA', 'la abreviatura configurada tiene prioridad sobre el nombre completo');
assert.equal(getPrintPlayerIdentity(acerete), 'ACERETE', 'el nombre corto útil se mantiene completo');

assert.deepEqual(buildPrintPlayerShirtModel({ player: agus }), {
  assigned: true,
  teamType: PRINT_PLAYER_TEAM_TYPES.OWN,
  kit: 'home',
  number: '20',
  identity: 'AGUS PORTO',
});
assert.deepEqual(buildPrintPlayerShirtModel({ player: boza, teamType: PRINT_PLAYER_TEAM_TYPES.OPPONENT }), {
  assigned: true,
  teamType: PRINT_PLAYER_TEAM_TYPES.OPPONENT,
  kit: 'home',
  number: '7',
  identity: 'BOZA',
});

const emptySlot = buildPrintPlayerShirtModel({ player: null, teamType: PRINT_PLAYER_TEAM_TYPES.OPPONENT });
assert.deepEqual(emptySlot, {
  assigned: false,
  teamType: PRINT_PLAYER_TEAM_TYPES.OWN,
  kit: 'home',
  number: '—',
  identity: 'SIN ASIGNAR',
}, 'un hueco vacío usa siempre la camiseta propia y una única convención');
assert.deepEqual(
  buildPrintPlayerShirtModel({ player: { name: 'Sin jugador asignado' } }),
  emptySlot,
  'el placeholder legacy se normaliza a SIN ASIGNAR',
);
assert.deepEqual(
  buildPrintPlayerShirtModel({ player: { name: 'Jugador pendiente' }, assigned: true }),
  emptySlot,
  'un placeholder legacy nunca se fuerza como jugador asignado',
);
assert.equal(buildPrintPlayerShirtModel({ player: { number: 6 } }).identity, '6', 'el dorsal es el último fallback útil antes de un genérico');

const component = fs.readFileSync(new URL('../components/print/PlayerShirt.jsx', import.meta.url), 'utf8');
const pitch = fs.readFileSync(new URL('../components/print/FootballPitchPrint.jsx', import.meta.url), 'utf8');
const lineup = fs.readFileSync(new URL('../components/print/LineupPrintSheet.jsx', import.meta.url), 'utf8');
const setPieceCanvas = fs.readFileSync(new URL('../components/print/SetPieceDiagramCanvas.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const shirtCss = css.slice(css.indexOf('.print-player-shirt {'), css.indexOf('.print-bench {'));

assert.equal((component.match(/<svg/g) || []).length, 1, 'existe un único SVG reutilizable de camiseta');
assert.ok(component.includes('model.teamType') && component.includes('model.assigned'), 'el componente usa semántica propio/rival y asignado/sin asignar');
assert.ok(pitch.includes("player?.teamType === 'opponent'") && pitch.includes('assigned={Boolean(player)}'), 'el campo decide rival y hueco sin crear otro renderer');
assert.ok(lineup.includes('Segunda / negra') && lineup.includes('Primera / blanca'), 'la leyenda refleja las equipaciones clara y oscura');
assert.ok(shirtCss.includes('width: 22mm') && !shirtCss.includes('width: 27mm'), 'la camiseta reduce moderadamente su tamaño');
assert.ok(shirtCss.includes('.print-player-shirt.opponent .shirt-body') && shirtCss.includes('fill: #000'), 'el rival usa relleno negro de máximo contraste');
assert.ok(shirtCss.includes('.shirt-body') && shirtCss.includes('fill: #fff') && shirtCss.includes('stroke: #000'), 'el jugador propio usa blanco con contorno negro');
assert.ok(shirtCss.includes('.print-player-shirt.opponent.assigned .print-shirt-number') && shirtCss.includes('color: #fff'), 'el rival imprime el dorsal blanco');
assert.equal(shirtCss.includes('text-overflow: ellipsis'), false, 'los nombres no se recortan con elipsis');
assert.equal(/Nike|ASSA|patrocinador|escudo/i.test(component), false, 'el símbolo no incorpora logos ni detalles comerciales');

assert.equal(setPieceCanvas.includes('PlayerShirt'), false, 'el editor ABP no sustituye sus simbolos compactos por camisetas');
assert.ok(setPieceCanvas.includes('<circle'), 'el editor ABP conserva su renderer circular');

console.log('printPlayerShirt tests passed');
