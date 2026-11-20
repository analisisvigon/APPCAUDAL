import assert from 'node:assert/strict';
import {
  SESSION_ACTIVITY_IMAGE_MAX_COUNT, normalizeSessionActivityImage, sessionActivityImagePath,
  sortSessionActivityImages, validateSessionActivityImage,
} from './plannedSessionActivityImages.js';

const jpeg = { name: 'Mi Foto 1.JPG', type: 'image/jpeg', size: 1024 };
assert.equal(validateSessionActivityImage(jpeg), jpeg);
assert.throws(() => validateSessionActivityImage({ ...jpeg, type: 'image/gif' }), /Formato no permitido/);
assert.throws(() => validateSessionActivityImage({ ...jpeg, size: 11 * 1024 * 1024 }), /10 MB/);
assert.equal(SESSION_ACTIVITY_IMAGE_MAX_COUNT, 7);
assert.equal(sessionActivityImagePath({ clubId: 'club', sessionId: 'session', itemId: 'item', userId: 'user', imageId: 'image', file: jpeg }),
  'club/session/item/user/image-image-mi-foto-1.jpg');
assert.deepEqual(sortSessionActivityImages([
  { id: 'b', item_id: 'item', sort_order: 2 }, { id: 'a', item_id: 'item', sort_order: 0 },
]).map((row) => row.id), ['a', 'b']);
assert.equal(normalizeSessionActivityImage({ item_id: 'item', storage_path: 'path' }).itemId, 'item');
console.log('planned session activity image tests passed');
