import assert from 'node:assert/strict';
import {
  SET_PIECE_PRINT_IDENTITY_MODES,
  cloneSetPieceElementsWithFreshIds,
  createDefaultSetPieceTacticalMeta,
  getDrawableSetPieceElements,
  getSetPieceChronology,
  getSetPieceGeometrySnapshot,
  getSetPieceResponsibilities,
  getSetPieceTacticalMeta,
  optimizeSetPieceElementsForPrint,
  setSetPieceTacticalMeta,
} from './setPieceProfessional.js';

const players = [
  { id: 'p1', name: 'Julio Martínez', shirtName: 'J. Martínez' },
  { id: 'p2', name: 'Javier Martínez', shirtName: 'J. Martínez' },
];
const drawable = [
  { id: 'p1-el', type: 'player', x: 40, y: 30, label: '9', player_id: 'p1', roles: ['Rematador'], note: 'fija', sequenceOrder: 1, primaryResponsibility: true, targetId: 'arrow-1' },
  { id: 'p2-el', type: 'player', x: 46, y: 31, label: '5', player_id: 'p2', roles: ['Bloqueador'], note: 'bloquea', sequenceOrder: 2, linkedElementId: 'p1-el' },
  { id: 'arrow-1', type: 'curved_arrow', x1: 20, y1: 30, x2: 70, y2: 30, curvature: -9, sourceId: 'p1-el', targetId: 'p2-el' },
  { id: 'block-1', type: 'block', x: 42, y: 28, width: 18, parentId: 'p1-el' },
  { id: 'zone-1', type: 'zone', x: 34, y: 18, width: 22, height: 12 },
];

const meta = {
  ...createDefaultSetPieceTacticalMeta(),
  objective: 'Liberar segundo palo',
  alternative: 'Saque corto',
  rating: 4,
  tags: ['segundo palo'],
  libraryId: 'library-1',
  libraryVersion: '2026-08-04T09:00:00Z',
  importedAt: '2026-08-04T10:00:00Z',
  linkStatus: 'linked',
};
const stored = setSetPieceTacticalMeta(drawable, meta);
assert.equal(stored.length, drawable.length + 1, 'la ficha se guarda dentro del JSON existente');
assert.deepEqual(getDrawableSetPieceElements(stored), drawable, 'el renderer del editor no recibe metadatos');
assert.equal(getSetPieceTacticalMeta(stored).objective, 'Liberar segundo palo');
assert.equal(getSetPieceTacticalMeta(stored).alternative, 'Saque corto');
assert.equal(getSetPieceTacticalMeta(stored).libraryId, 'library-1');
assert.equal(getSetPieceTacticalMeta(stored).linkStatus, 'linked');
assert.equal(getSetPieceTacticalMeta(stored).printIdentityMode, SET_PIECE_PRINT_IDENTITY_MODES.NUMBER_AND_ABBREVIATION);

const migrated = getSetPieceTacticalMeta(setSetPieceTacticalMeta([], {
  variation: 'Alternativa heredada',
  variants: [{ id: 'A', changes: 'Texto antiguo' }],
}));
assert.equal(migrated.alternative, 'Alternativa heredada', 'los datos antiguos migran a Alternativa textual');
assert.equal('variants' in migrated, false, 'las variantes gráficas aparentes desaparecen del contrato normalizado');

const chronology = getSetPieceChronology(stored, players);
assert.deepEqual(chronology.map((step) => step.order), [1, 2]);
assert.equal(chronology[0].playerName, 'J. Martínez');

const responsibilities = getSetPieceResponsibilities(stored, players);
assert.equal(responsibilities[0].role, 'Rematador', 'el responsable principal aparece primero');
assert.equal(responsibilities[0].primary, true);

const editorGeometry = getSetPieceGeometrySnapshot(stored);
const optimized = optimizeSetPieceElementsForPrint(stored, players);
const printGeometry = getSetPieceGeometrySnapshot(optimized);
assert.deepEqual(printGeometry, editorGeometry, 'la impresión conserva exactamente toda la geometría táctica');
assert.equal(drawable[0].printName, undefined, 'la preparación de impresión no modifica el editor');
const printNames = optimized.filter((element) => element.type === 'player').map((element) => element.printName.toLocaleLowerCase('es'));
assert.equal(new Set(printNames).size, printNames.length, 'las abreviaturas son únicas dentro de la jugada');
assert.equal(optimized.find((element) => element.id === 'arrow-1').printCurve, undefined, 'el renderer no introduce curvaturas');

const duplicated = cloneSetPieceElementsWithFreshIds(stored);
const collectIds = (value, ids = []) => {
  if (Array.isArray(value)) value.forEach((entry) => collectIds(entry, ids));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => {
    if (key === 'id' && typeof entry === 'string') ids.push(entry);
    collectIds(entry, ids);
  });
  return ids;
};
const originalIds = new Set(collectIds(stored));
const duplicateIds = collectIds(duplicated);
assert.equal(duplicateIds.some((id) => originalIds.has(id)), false, 'la intersección recursiva de IDs es vacía');
const duplicatedArrow = duplicated.find((element) => element.type === 'curved_arrow');
const duplicatedFirstPlayer = duplicated.find((element) => element.type === 'player' && element.label === '9');
const duplicatedSecondPlayer = duplicated.find((element) => element.type === 'player' && element.label === '5');
assert.equal(duplicatedArrow.sourceId, duplicatedFirstPlayer.id, 'sourceId apunta al nuevo jugador');
assert.equal(duplicatedArrow.targetId, duplicatedSecondPlayer.id, 'targetId apunta al nuevo jugador');
assert.equal(duplicatedFirstPlayer.targetId, duplicatedArrow.id, 'las referencias inversas también se regeneran');

console.log('setPieceProfessional tests passed');
