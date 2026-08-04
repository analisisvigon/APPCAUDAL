import assert from 'node:assert/strict';
import {
  createDefaultSetPieceTacticalMeta,
  getDrawableSetPieceElements,
  getSetPieceChronology,
  getSetPieceResponsibilities,
  getSetPieceTacticalMeta,
  optimizeSetPieceElementsForPrint,
  setSetPieceTacticalMeta,
} from './setPieceProfessional.js';

const players = [
  { id: 'p1', name: 'Julio Martínez' },
  { id: 'p2', name: 'David Noya' },
];
const drawable = [
  { id: 'p1-el', type: 'player', x: 40, y: 30, label: '9', player_id: 'p1', roles: ['Rematador'], note: 'fija', sequenceOrder: 1, primaryResponsibility: true },
  { id: 'p2-el', type: 'player', x: 46, y: 31, label: '5', player_id: 'p2', roles: ['Bloqueador'], note: 'bloquea', sequenceOrder: 2 },
  { id: 'arrow-1', type: 'arrow', x1: 20, y1: 30, x2: 70, y2: 30 },
];

const meta = { ...createDefaultSetPieceTacticalMeta(), objective: 'Liberar segundo palo', rating: 4, tags: ['segundo palo'] };
const stored = setSetPieceTacticalMeta(drawable, meta);
assert.equal(stored.length, drawable.length + 1, 'la ficha se guarda dentro del JSON existente');
assert.deepEqual(getDrawableSetPieceElements(stored), drawable, 'el renderer del editor no recibe metadatos');
assert.equal(getSetPieceTacticalMeta(stored).objective, 'Liberar segundo palo');
assert.equal(getSetPieceTacticalMeta(stored).rating, 4);

const chronology = getSetPieceChronology(stored, players);
assert.deepEqual(chronology.map((step) => step.order), [1, 2]);
assert.equal(chronology[0].playerName, 'Julio Martínez');

const responsibilities = getSetPieceResponsibilities(stored, players);
assert.equal(responsibilities[0].role, 'Rematador', 'el responsable principal aparece primero');
assert.equal(responsibilities[0].primary, true);

const optimized = optimizeSetPieceElementsForPrint(stored, players);
assert.equal(drawable[0].printName, undefined, 'la limpieza de impresión no modifica el editor');
assert.ok(optimized.find((element) => element.id === 'p1-el').printName.length <= 10, 'los nombres cercanos se compactan');
assert.ok(Number.isFinite(Number(optimized.find((element) => element.id === 'arrow-1').printCurve)), 'la flecha se curva si atraviesa jugadores');

console.log('setPieceProfessional tests passed');
