import assert from 'node:assert/strict';
import {
  findLocalAnalysisByFingerprint, fingerprintLocalFile, listLocalAnalyses,
  newLocalAnalysis, saveLocalAnalysis, snapshotLocalAnalysis,
} from './localAnalysisStore.js';

const rows = new Map();
const database = {
  objectStoreNames: { contains: () => true },
  close() {},
  transaction() {
    const transaction = {
      objectStore() {
        return {
          getAll() {
            const request = {};
            queueMicrotask(() => { request.result = [...rows.values()]; request.onsuccess(); });
            return request;
          },
          index() {
            return { get(fingerprint) {
              const request = {};
              queueMicrotask(() => {
                request.result = [...rows.values()].find((row) => row.source.fingerprint === fingerprint);
                request.onsuccess();
              });
              return request;
            } };
          },
          put(row) {
            rows.set(row.id, structuredClone(row));
            queueMicrotask(() => transaction.oncomplete());
          },
        };
      },
    };
    return transaction;
  },
};
globalThis.indexedDB = { open() {
  const request = { result: database };
  queueMicrotask(() => request.onsuccess());
  return request;
} };

const bytes = new Uint8Array(4 * 1024 * 1024 + 7);
bytes[bytes.length - 1] = 1;
const original = new File([bytes], 'partido.mp4', { type: 'video/mp4', lastModified: 123 });
const sameContent = new File([bytes], 'renombrado.mp4', { type: 'video/mp4', lastModified: 456 });
const changedBytes = bytes.slice();
changedBytes[4 * 1024 * 1024] = 9;
const different = new File([changedBytes], 'partido.mp4', { type: 'video/mp4', lastModified: 123 });
const progress = [];
const fingerprint = await fingerprintLocalFile(original, (fraction) => progress.push(fraction));
assert.equal(progress.length, 2);
assert.equal(progress.at(-1), 1);
assert.equal(await fingerprintLocalFile(sameContent), fingerprint);
assert.notEqual(await fingerprintLocalFile(different), fingerprint);

const analysis = newLocalAnalysis({ id: 'analysis-1', file: original, fingerprint });
assert.equal(analysis.source.name, 'partido.mp4');
assert.equal(analysis.source.size, original.size);
assert.equal(analysis.source.lastModified, 123);
assert.equal(analysis.matchPreId, null);
assert.equal('file' in analysis.source, false);
assert.equal('url' in analysis.source, false);
const clip = { id: 'clip-1', sourceId: analysis.id, title: 'Presión', in: 3, out: 7,
  observations: 'Salida rival', annotations: [{ id: 'arrow-1', type: 'arrow',
    geometry: { x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.6 },
    style: { color: '#fff', width: 3 }, timing: { start: 3, end: 7 } }] };
await saveLocalAnalysis(snapshotLocalAnalysis(analysis, [clip]));
const reopened = (await listLocalAnalyses())[0];
assert.equal(reopened.clips[0].id, 'clip-1');
assert.deepEqual(reopened.clips[0].annotations, clip.annotations);
assert.equal((await findLocalAnalysisByFingerprint(fingerprint)).id, 'analysis-1');
assert.equal(await findLocalAnalysisByFingerprint(await fingerprintLocalFile(different)), undefined);
assert.equal(rows.size, 1);
const secondFingerprint = await fingerprintLocalFile(different);
const secondAnalysis = newLocalAnalysis({ id: 'analysis-2', file: different, fingerprint: secondFingerprint });
await saveLocalAnalysis(snapshotLocalAnalysis(secondAnalysis, []));
assert.equal((await listLocalAnalyses()).length, 2);
assert.equal((await findLocalAnalysisByFingerprint(fingerprint)).clips[0].id, 'clip-1');
assert.equal((await findLocalAnalysisByFingerprint(secondFingerprint)).clips.length, 0);
console.log('Video lab local persistence: OK (IndexedDB simulado, huella de archivo real).');
