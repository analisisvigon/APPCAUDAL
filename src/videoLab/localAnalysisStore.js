const DB_NAME = 'nexo-video-analysis-local-v1';
const STORE_NAME = 'analyses';
export const ANALYSIS_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('fingerprint', 'source.fingerprint', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRequest(factory) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = factory(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function listLocalAnalyses() {
  const rows = await readRequest((store) => store.getAll());
  return rows.filter((row) => row?.version === ANALYSIS_VERSION && row?.source?.fingerprint &&
    Array.isArray(row.clips)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findLocalAnalysisByFingerprint(fingerprint) {
  return readRequest((store) => store.index('fingerprint').get(fingerprint));
}

export async function saveLocalAnalysis(analysis) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(analysis);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

const CHUNK_SIZE = 4 * 1024 * 1024;

export async function fingerprintLocalFile(file, onProgress = () => {}) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 ||
      !globalThis.crypto?.subtle) throw new Error('No se puede identificar este archivo MP4.');
  let chain = new Uint8Array(32);
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const bytes = await file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size)).arrayBuffer();
    const chunkHash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const combined = new Uint8Array(64);
    combined.set(chain);
    combined.set(chunkHash, 32);
    chain = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
    onProgress(Math.min(1, (offset + bytes.byteLength) / file.size));
  }
  return `${file.size}:${Array.from(chain, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function newLocalAnalysis({ id, file, fingerprint, ownerUserId = null }) {
  const now = new Date().toISOString();
  return {
    id,
    version: ANALYSIS_VERSION,
    source: { name: file.name, size: file.size, lastModified: file.lastModified,
      type: file.type || 'video/mp4', fingerprint },
    matchPreId: null,
    matchPre: null,
    ownerUserId,
    originalEncounterName: '',
    clips: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function snapshotLocalAnalysis(analysis, clips) {
  return { ...analysis, clips, updatedAt: new Date().toISOString() };
}
