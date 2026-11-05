import assert from 'node:assert/strict';
import {
  annotationVisible, clipOutReached, containedVideoRect, createAnnotation,
  createClip, formatTime, isMp4File, normalizedPoint, removeClipFromDraft,
  updateClip, validRange,
} from './model.js';

assert.equal(formatTime(3661.9), '01:01:01');
assert.equal(isMp4File({ type: 'video/mp4', name: 'partido.mp4' }), true);
assert.equal(isMp4File({ type: 'video/quicktime', name: 'partido.mov' }), false);
assert.equal(isMp4File({ type: 'video/mp4', name: 'partido.mov' }), false);
assert.equal(validRange(12, 16, 30), true);
assert.equal(validRange(16, 12, 30), false);

const clip = createClip({ id: 'stable-1', sourceId: 'local-1', title: ' Presión alta ', start: 12, end: 16, duration: 30 });
assert.equal(clip.title, 'Presión alta');
assert.equal(updateClip(clip, { title: 'Transición', in: 10 }, 30).id, 'stable-1');
assert.equal(updateClip(clip, { out: 11 }, 30), null);
assert.deepEqual(removeClipFromDraft([clip, { ...clip, id: 'stable-2' }], clip.id).map((item) => item.id), ['stable-2']);
assert.equal(clipOutReached(clip, 15.95), false);
assert.equal(clipOutReached(clip, 15.97), true);
assert.equal(createClip({ id: 'x', sourceId: 'y', title: ' ', start: 1, end: 2, duration: 5 }), null);

const wide = containedVideoRect(1200, 800, 1920, 1080);
assert.deepEqual(wide, { left: 0, top: 62.5, width: 1200, height: 675 });
const portraitContainer = containedVideoRect(600, 1000, 1920, 1080);
assert.equal(portraitContainer.width, 600);
assert.equal(portraitContainer.top, 331.25);
const point = normalizedPoint(330, 500, { left: 30, top: 200, width: 600, height: 600 });
assert.deepEqual(point, { x: 0.5, y: 0.5 });
assert.deepEqual(normalizedPoint(-40, 900, { left: 0, top: 0, width: 600, height: 600 }), { x: 0, y: 1 });

const annotation = createAnnotation({
  id: 'draw-1', type: 'arrow', start: { x: 0.2, y: 0.3 }, end: { x: 0.6, y: 0.5 },
  color: '#facc15', width: 3, clip, at: 13,
});
assert.deepEqual(annotation.geometry, { x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.5 });
assert.equal(annotation.timing.start, 13);
assert.equal(annotationVisible(annotation, 14), true);
assert.equal(annotationVisible(annotation, 12), false);
assert.equal(updateClip({ ...clip, annotations: [annotation] }, { out: 14 }, 30), null);
assert.equal(updateClip({ ...clip, annotations: [annotation] }, { out: 16 }, 30).id, clip.id);
assert.equal(createAnnotation({ ...annotation, id: 'x', type: 'ellipse', start: { x: 0.5, y: 0.5 }, end: { x: 0.5, y: 0.5 }, clip, at: 13 }), null);
console.log('Video lab model: OK');
