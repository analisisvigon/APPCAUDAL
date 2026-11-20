import assert from 'node:assert/strict';
import {
  SESSION_ACTIVITY_IMAGE_MAX_COUNT, cleanupDeletedSessionActivityImages, normalizeSessionActivityImage,
  reorderSessionActivityImages, sessionActivityImagePath, sortSessionActivityImages, validateSessionActivityImage,
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

const rpcCalls = [];
const reordered = await reorderSessionActivityImages({ rpc: async (name, args) => {
  rpcCalls.push([name, args]); return { data: true, error: null };
} }, [
  { id: 'a', item_id: 'item', sort_order: 0 }, { id: 'b', item_id: 'item', sort_order: 1 },
], 1, 0);
assert.deepEqual(reordered.map((row) => row.id), ['b', 'a']);
assert.deepEqual(rpcCalls[0], ['reorder_planned_session_activity_images_v1', {
  p_item_id: 'item', p_image_ids: ['b', 'a'],
}], 'el reordenado es una única operación transaccional');

const cleanupCalls = [];
const cleanup = await cleanupDeletedSessionActivityImages({
  async rpc(name, args) {
    cleanupCalls.push([name, args]);
    if (name === 'list_planned_session_activity_cleanup_v1') return { data: [
      { storage_path: 'ok.webp' }, { storage_path: 'retry.webp' },
    ], error: null };
    return { data: true, error: null };
  },
  storage: { from() { return { async remove(paths) {
    return { data: null, error: paths[0] === 'retry.webp' ? new Error('temporal') : null };
  } }; } },
}, 'cts', 'session');
assert.deepEqual(cleanup, { total: 2, failed: ['retry.webp'] });
assert.ok(cleanupCalls.some(([name, args]) => name === 'confirm_planned_session_activity_cleanup_v1'
  && args.p_storage_path === 'ok.webp'));
assert.ok(!cleanupCalls.some(([name, args]) => name === 'confirm_planned_session_activity_cleanup_v1'
  && args.p_storage_path === 'retry.webp'), 'la cola solo se confirma después de borrar Storage');
console.log('planned session activity image tests passed');
