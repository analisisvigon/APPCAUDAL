import assert from 'node:assert/strict';
import {
  assertSafeTrainingTaskEditorPayload,
  createTrainingTaskEditorSceneV1,
  getTrainingTaskEditorPayloadSize,
  measureTrainingTaskEditorPayloadBytes,
  readTrainingTaskEditorPayload,
  serializeTrainingTaskEditorScene,
  TRAINING_TASK_EDITOR_PAYLOAD_LIMIT_BYTES,
} from './trainingTaskEditorPayload.js';

assert.equal(readTrainingTaskEditorPayload({}).kind, 'empty', 'el objeto historico vacio significa sin pizarra');
assert.equal(readTrainingTaskEditorPayload(null).kind, 'empty', 'null permitido por frontend significa sin pizarra');

const v1 = createTrainingTaskEditorSceneV1({
  pitchType: 'full',
  elements: [
    { id: 'player-1', type: 'player', x: -4, y: 80, color: '#2563eb' },
    { id: 'arrow-1', type: 'curved_arrow', x1: 20, y1: 30, x2: 120, y2: 40, controlX: 50, controlY: 12 },
  ],
});
assert.equal(v1.schemaVersion, 1);
assert.equal(v1.board.elements.every((element) => Boolean(element.id)), true, 'todos los elementos tienen ids estables');
assert.deepEqual(
  { x: v1.board.elements[0].x, y: v1.board.elements[0].y, x2: v1.board.elements[1].x2 },
  { x: 0, y: 72, x2: 100 },
  'las coordenadas relativas se limitan al viewBox 100 x 72',
);
assert.deepEqual(serializeTrainingTaskEditorScene(v1), v1, 'una escena V1 completa hace round-trip');

const payloadWithExtensions = {
  schemaVersion: 1,
  vendor: { feature: 'future-safe' },
  board: {
    pitchType: 'penalty-area',
    background: { color: 'green' },
    elements: [{ id: 'ball-extended', type: 'ball', x: 20, y: 30, futureData: { value: 7 } }],
  },
};
const extended = readTrainingTaskEditorPayload(payloadWithExtensions);
assert.equal(extended.kind, 'v1');
assert.deepEqual(extended.scene.vendor, payloadWithExtensions.vendor, 'preserva claves desconocidas de raiz');
assert.deepEqual(extended.scene.board.background, payloadWithExtensions.board.background, 'preserva claves desconocidas del tablero');
assert.deepEqual(extended.scene.board.elements[0].futureData, { value: 7 }, 'preserva claves desconocidas de elementos conocidos');

const unknownElementPayload = { schemaVersion: 1, board: { pitchType: 'full', elements: [{ id: 'future-1', type: 'future-equipment', x: 20, y: 30, data: { keep: true } }] } };
const unknownElement = readTrainingTaskEditorPayload(unknownElementPayload);
assert.equal(unknownElement.kind, 'invalid', 'V1 no intenta renderizar tipos futuros con semantica incorrecta');
assert.deepEqual(unknownElement.sourcePayload, unknownElementPayload, 'un tipo futuro invalido para V1 se conserva sin destruir');

const futurePayload = { schemaVersion: 2, scenes: [{ id: 'scene-1' }], vendor: { opaque: true } };
const future = readTrainingTaskEditorPayload(futurePayload);
assert.equal(future.kind, 'unsupported');
assert.equal(future.scene, null, 'una version futura no se reinterpreta como V1');
assert.deepEqual(future.sourcePayload, futurePayload, 'una version futura queda intacta para preservarla');
assert.throws(() => serializeTrainingTaskEditorScene(futurePayload), /Solo se pueden serializar/, 'el escritor V1 rechaza versiones futuras');

assert.equal(readTrainingTaskEditorPayload({ schemaVersion: 1, board: { pitchType: 'full', elements: [{ id: 'same', type: 'ball' }, { id: 'same', type: 'ball' }] } }).kind, 'invalid', 'los ids duplicados se rechazan');
assert.throws(() => assertSafeTrainingTaskEditorPayload({ callback: () => {} }), /valores JSON/);
assert.throws(() => assertSafeTrainingTaskEditorPayload({ image: 'data:image/png;base64,AAAA' }), /base64/);
assert.throws(() => assertSafeTrainingTaskEditorPayload({ selectedId: 'player-1' }), /estado efimero/);
assert.throws(() => assertSafeTrainingTaskEditorPayload({ board: { history: [] } }), /estado efimero/);

const asciiPayload = { schemaVersion: 1, board: { pitchType: 'full', elements: [] }, note: 'abc' };
const unicodePayload = { ...asciiPayload, note: 'a⚽ñ' };
assert.equal(measureTrainingTaskEditorPayloadBytes({ text: 'abc' }), Buffer.byteLength('{"text": "abc"}', 'utf8'), 'la medida reproduce la serializacion jsonb::text del limite SQL');
assert.equal(measureTrainingTaskEditorPayloadBytes({ text: 'a⚽ñ' }), Buffer.byteLength('{"text": "a⚽ñ"}', 'utf8'), 'Unicode se mide en bytes UTF-8, no caracteres UTF-16');
assert.ok(measureTrainingTaskEditorPayloadBytes(unicodePayload) > measureTrainingTaskEditorPayloadBytes(asciiPayload));
assert.equal(measureTrainingTaskEditorPayloadBytes({ value: 1e21 }), Buffer.byteLength('{"value": 1000000000000000000000}', 'utf8'), 'los exponentes se expanden como numeric de jsonb');

const baseSize = measureTrainingTaskEditorPayloadBytes({ text: '' });
const nearLimit = { text: 'x'.repeat(TRAINING_TASK_EDITOR_PAYLOAD_LIMIT_BYTES - baseSize) };
assert.equal(measureTrainingTaskEditorPayloadBytes(nearLimit), TRAINING_TASK_EDITOR_PAYLOAD_LIMIT_BYTES, 'el limite exacto de 256 KiB es valido');
assert.equal(getTrainingTaskEditorPayloadSize(nearLimit).exceedsLimit, false);
assert.equal(getTrainingTaskEditorPayloadSize({ text: `${nearLimit.text}x` }).exceedsLimit, true, 'un byte adicional supera el limite');

console.log('training task editor payload tests passed');
