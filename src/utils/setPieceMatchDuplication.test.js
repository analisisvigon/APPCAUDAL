import assert from 'node:assert/strict';
import fs from 'node:fs';
import { duplicateMatchSetPiece } from './setPieceMatchDuplication.js';

const source = {
  id: 'source-play-id',
  partido_id: 'match-a',
  tipo: 'corner_ofensivo',
  orden: 1,
  titulo: 'Desde atrás',
  consigna: 'Atacar el espacio indicado',
  elements: [
    { id: 'player-source', type: 'player', x: 22, y: 35, player_id: 'player-id', roles: ['Rematador'] },
    { id: 'arrow-source', type: 'arrow', x1: 22, y1: 35, x2: 60, y2: 18, sourceId: 'player-source' },
  ],
};

const copy = duplicateMatchSetPiece({ source, targetMatchId: 'match-b', order: 3 });
assert.equal(copy.titulo, 'Desde atrás', 'duplicar entre partidos conserva exactamente el título');
assert.notEqual(copy.id, source.id, 'la copia no hereda el ID de la jugada de origen');
assert.notEqual(copy.partido_id, source.partido_id, 'la copia pertenece al partido de destino');
assert.equal(copy.partido_id, 'match-b');
assert.equal(copy.tipo, source.tipo);
assert.equal(copy.consigna, source.consigna);
assert.notEqual(copy.elements, source.elements, 'la geometría se copia en una estructura independiente');
assert.equal(copy.elements.some((element) => source.elements.some((original) => original.id === element.id)), false, 'los elementos reciben IDs nuevos');
copy.elements[0].x = 99;
assert.equal(source.elements[0].x, 22, 'editar la copia no modifica el partido de origen');

const adaptedElements = source.elements.map((element) => element.type === 'player'
  ? { ...element, player_id: 'adapted-player-id' }
  : { ...element });
const adaptedCopy = duplicateMatchSetPiece({ source: { ...source, titulo: 'Acumulación' }, targetMatchId: 'match-c', order: 1, elements: adaptedElements });
assert.equal(adaptedCopy.titulo, 'Acumulación', 'adaptar jugadores tampoco transforma el título');
assert.equal(adaptedCopy.elements.find((element) => element.type === 'player').player_id, 'adapted-player-id');

const matchPrintSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const laboratorySource = fs.readFileSync(new URL('./setPieceLaboratory.js', import.meta.url), 'utf8');
assert.match(matchPrintSource, /duplicateMatchSetPiece\(\{/);
assert.match(matchPrintSource, /titulo:\s*`\$\{baseTitle\} copia`/, 'duplicar dentro del mismo partido conserva su sufijo');
assert.match(laboratorySource, /nombre:\s*`\$\{clean\(item\.nombre\) \|\| 'Jugada ABP'\} copia`/, 'Biblioteca conserva su comportamiento independiente');

console.log('setPieceMatchDuplication tests passed');
