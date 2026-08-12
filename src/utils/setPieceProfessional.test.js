import assert from 'node:assert/strict';
import {
  SET_PIECE_PRINT_IDENTITY_MODES,
  SET_PIECE_DELIVERY_TYPES,
  cloneSetPieceElementsWithFreshIds,
  createDefaultSetPieceDisplayLayers,
  createDefaultSetPieceTacticalMeta,
  getDrawableSetPieceElements,
  getSetPieceChronology,
  getSetPieceGeometrySnapshot,
  getSetPieceIndividualInstructions,
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
  { id: 'arrow-1', type: 'curved_arrow', x1: 20, y1: 30, x2: 70, y2: 30, controlX: 44, controlY: 17, sourceId: 'p1-el', targetId: 'p2-el' },
  { id: 'block-1', type: 'block', x: 42, y: 28, width: 18, parentId: 'p1-el' },
  { id: 'zone-1', type: 'zone', x: 34, y: 18, width: 22, height: 12 },
];

const meta = {
  ...createDefaultSetPieceTacticalMeta(),
  signal: 'MANO ARRIBA',
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
assert.equal(getSetPieceTacticalMeta(stored).signal, 'MANO ARRIBA', 'SEÑAL se guarda dentro del tactical_meta existente');
assert.equal(getSetPieceTacticalMeta(stored).objective, 'Liberar segundo palo');
assert.equal(getSetPieceTacticalMeta(stored).alternative, 'Saque corto');
assert.equal(getSetPieceTacticalMeta(stored).saqueType, '', 'el tipo de saque se normaliza por defecto');
const withSaqueType = getSetPieceTacticalMeta(setSetPieceTacticalMeta(drawable, { ...meta, saqueType: 'Saque corto' }));
assert.equal(withSaqueType.saqueType, 'Saque corto', 'el tipo de saque se conserva en la ficha');
assert.deepEqual(SET_PIECE_DELIVERY_TYPES.map((entry) => entry.id), ['open', 'closed']);
assert.equal(getSetPieceTacticalMeta(stored).deliveryType, '', 'una jugada antigua queda con golpeo Sin definir');
const deliveryOpen = getSetPieceTacticalMeta(setSetPieceTacticalMeta(drawable, { ...meta, deliveryType: 'open' }));
const deliveryClosed = getSetPieceTacticalMeta(setSetPieceTacticalMeta(drawable, { ...meta, deliveryType: 'closed' }));
assert.equal(deliveryOpen.deliveryType, 'open');
assert.equal(deliveryClosed.deliveryType, 'closed');
assert.equal(getSetPieceTacticalMeta(setSetPieceTacticalMeta(drawable, { ...meta, deliveryType: 'automatic' })).deliveryType, '', 'no se deduce ni admite un tipo de golpeo desconocido');
const exactText = '  Bloquear primer palo y atacar zona media  \nSegunda línea con tildes, ñ y signos.  ';
const exactTextMeta = getSetPieceTacticalMeta(setSetPieceTacticalMeta(drawable, {
  ...meta,
  signal: exactText,
  objective: exactText,
  saqueType: exactText,
  whenToUse: exactText,
  generalInstruction: exactText,
  risk: exactText,
  alternative: exactText,
  observations: exactText,
}));
['signal', 'objective', 'saqueType', 'whenToUse', 'generalInstruction', 'risk', 'alternative', 'observations'].forEach((field) => {
  assert.equal(exactTextMeta[field], exactText, `${field} conserva espacios y saltos de línea al guardar y recargar`);
});
const exactElementText = 'Atacar segundo palo\nDespués, cerrar transición ñ.';
const storedExactElements = setSetPieceTacticalMeta([
  { id: 'individual-text', type: 'player', x: 20, y: 20, note: exactElementText },
  { id: 'canvas-text', type: 'text', x: 30, y: 30, label: exactElementText },
], meta);
assert.equal(getDrawableSetPieceElements(storedExactElements).find((element) => element.id === 'individual-text').note, exactElementText, 'la consigna individual conserva espacios y saltos');
assert.equal(getDrawableSetPieceElements(storedExactElements).find((element) => element.id === 'canvas-text').label, exactElementText, 'el texto del campo conserva espacios y saltos');
assert.equal(withSaqueType.libraryId, 'library-1');
assert.equal(getSetPieceTacticalMeta(stored).linkStatus, 'linked');
assert.equal(getSetPieceTacticalMeta(stored).printIdentityMode, SET_PIECE_PRINT_IDENTITY_MODES.NUMBER_AND_ABBREVIATION);
assert.deepEqual(getSetPieceTacticalMeta(stored).displayLayers, createDefaultSetPieceDisplayLayers(), 'las jugadas legacy muestran todas las capas como antes');
const legacyAbbreviationMode = getSetPieceTacticalMeta(setSetPieceTacticalMeta([], { printIdentityMode: SET_PIECE_PRINT_IDENTITY_MODES.ABBREVIATION }));
assert.equal(legacyAbbreviationMode.displayLayers.dorsals, false, 'una jugada legacy conserva el modo Abreviatura');
assert.equal(legacyAbbreviationMode.displayLayers.abbreviations, true, 'el modo legacy activa su identidad corta útil');

const hiddenLayers = {
  dorsals: false,
  abbreviations: true,
  roles: false,
  chronology: false,
  zones: false,
  texts: false,
};
const storedWithLayers = setSetPieceTacticalMeta(drawable, { ...meta, displayLayers: hiddenLayers });
assert.deepEqual(getSetPieceTacticalMeta(storedWithLayers).displayLayers, hiddenLayers, 'guardar y recargar conserva la presentación en el JSON de la jugada');
assert.deepEqual(getDrawableSetPieceElements(storedWithLayers), drawable, 'ocultar capas no modifica ni elimina contenido táctico');

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

const identityPlayers = [
  { id: 'agus', name: 'Nombre administrativo distinto', shirt_name: 'AGUS PORTO', abbreviation: 'AP' },
  { id: 'boza', name: 'DIEGO BOZA', abbreviation: 'BOZA' },
  { id: 'acerete', name: 'Nombre completo administrativo', shortName: 'ACERETE' },
];
const identityElements = [
  { id: 'agus-el', type: 'player', x: 20, y: 30, label: '10', player_id: 'agus', roles: ['Bloqueador'], note: 'correr', sequenceOrder: 2 },
  { id: 'boza-el', type: 'player', x: 40, y: 30, label: '4', player_id: 'boza', roles: ['Arrastre'], note: 'fijar', sequenceOrder: 1 },
  { id: 'acerete-el', type: 'player', x: 60, y: 30, label: '9', player_id: 'acerete', roles: ['Rematador'], note: 'atacar primer palo', sequenceOrder: 3 },
];
const usefulIdentities = optimizeSetPieceElementsForPrint(identityElements, identityPlayers);
assert.deepEqual(
  usefulIdentities.map((element) => element.printName),
  ['AGUS PORTO', 'BOZA', 'ACERETE'],
  'la identidad prioriza nombre de camiseta, abreviatura configurada o nombre corto sin recortarlos a tres letras',
);
const individualInstructions = getSetPieceIndividualInstructions(identityElements, identityPlayers);
assert.deepEqual(individualInstructions.map((item) => item.dorsal), ['4', '9', '10'], 'las indicaciones se ordenan por dorsal numérico, no por cronología ni string');
assert.deepEqual(individualInstructions.map((item) => item.instruction), ['fijar', 'atacar primer palo', 'correr'], 'las consignas individuales se conservan en el orden de dorsal');
assert.deepEqual(individualInstructions.map((item) => item.playerName), ['BOZA', 'ACERETE', 'AGUS PORTO'], 'las indicaciones reutilizan la identidad real en orden de dorsal');
assert.equal(getSetPieceIndividualInstructions([...identityElements, { id: 'empty-note', type: 'player', x: 80, y: 30, label: '6', note: '' }], identityPlayers).length, 3, 'una consigna vacía no genera texto inventado');
assert.equal(getSetPieceIndividualInstructions([...identityElements, { id: 'unlinked-note', type: 'player', x: 80, y: 30, label: '6', note: 'Moverse' }], identityPlayers).length, 3, 'una consigna sin jugador vinculado no genera una indicación');

const fallbackIdentities = optimizeSetPieceElementsForPrint([
  { id: 'dorsal-only', type: 'player', x: 15, y: 15, label: '8' },
  { id: 'automatic-only', type: 'player', x: 25, y: 15, label: '' },
], []);
assert.deepEqual(fallbackIdentities.map((element) => element.printName), ['8', 'J02'], 'el dorsal precede al fallback automático estable de tres caracteres');

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

assert.notEqual(duplicatedArrow.id, 'arrow-1', 'duplicar una curva crea un ID nuevo');
assert.deepEqual(
  { controlX: duplicatedArrow.controlX, controlY: duplicatedArrow.controlY },
  { controlX: 44, controlY: 17 },
  'la copia conserva un punto de control independiente',
);
duplicatedArrow.controlY = 50;
assert.equal(drawable.find((element) => element.id === 'arrow-1').controlY, 17, 'editar la copia no altera la curva original');
const withoutDuplicateCurve = duplicated.filter((element) => element.id !== duplicatedArrow.id);
assert.equal(withoutDuplicateCurve.some((element) => element.type === 'curved_arrow'), false, 'eliminar la copia no afecta a otros elementos');
assert.equal(drawable.some((element) => element.id === 'arrow-1'), true, 'la curva original permanece intacta');

const dashedCurveSource = [{ id: 'curve-dashed', type: 'curved_arrow', dashed: true, x1: 11, y1: 52, x2: 73, y2: 19, controlX: 61, controlY: 46 }];
const duplicatedDashedCurve = cloneSetPieceElementsWithFreshIds(dashedCurveSource)[0];
assert.notEqual(duplicatedDashedCurve.id, dashedCurveSource[0].id);
assert.deepEqual(
  { type: duplicatedDashedCurve.type, dashed: duplicatedDashedCurve.dashed, x1: duplicatedDashedCurve.x1, y1: duplicatedDashedCurve.y1, x2: duplicatedDashedCurve.x2, y2: duplicatedDashedCurve.y2, controlX: duplicatedDashedCurve.controlX, controlY: duplicatedDashedCurve.controlY },
  { type: 'curved_arrow', dashed: true, x1: 11, y1: 52, x2: 73, y2: 19, controlX: 61, controlY: 46 },
  'duplicar una curva discontinua regenera el ID y conserva geometría y estilo',
);

console.log('setPieceProfessional tests passed');
