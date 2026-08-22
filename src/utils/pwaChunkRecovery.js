export const PDF_GENERATOR_LOAD_ERROR_MESSAGE = 'No se pudo cargar el generador de PDF. Actualiza la aplicación e inténtalo de nuevo.';

const RECOVERY_STORAGE_KEY = 'appcaudal:stale-chunk-reload';
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const CHUNK_LOAD_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
  /importing a module script failed/i,
  /failed to load module script/i,
];

const errorText = (error) => [
  error?.name,
  error?.message,
  error?.reason?.name,
  error?.reason?.message,
  typeof error === 'string' ? error : '',
].filter(Boolean).join(' ');

export const isStaleChunkLoadError = (error) => CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(errorText(error)));

const readRecoveryTimestamp = (storage) => {
  try {
    return Number(storage?.getItem?.(RECOVERY_STORAGE_KEY) || 0);
  } catch {
    return 0;
  }
};

const writeRecoveryTimestamp = (storage, timestamp) => {
  try {
    storage?.setItem?.(RECOVERY_STORAGE_KEY, String(timestamp));
  } catch {
    // La recuperación debe continuar aunque el almacenamiento esté bloqueado.
  }
};

export const requestCurrentServiceWorkerUpdate = async (navigatorRef = globalThis.navigator) => {
  const serviceWorker = navigatorRef?.serviceWorker;
  if (!serviceWorker?.getRegistration) return null;
  try {
    const registration = await serviceWorker.getRegistration();
    await registration?.update?.();
    return registration || null;
  } catch (error) {
    console.error('No se pudo comprobar la actualización de la PWA.', error);
    return null;
  }
};

export const recoverFromStaleChunkOnce = async (error, {
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  storage = globalThis.sessionStorage,
  now = Date.now(),
} = {}) => {
  if (!isStaleChunkLoadError(error)) return { handled: false, reloadRequested: false };

  const previousAttempt = readRecoveryTimestamp(storage);
  if (previousAttempt && now - previousAttempt < RECOVERY_WINDOW_MS) {
    return { handled: true, reloadRequested: false };
  }

  writeRecoveryTimestamp(storage, now);
  await requestCurrentServiceWorkerUpdate(navigatorRef);
  locationRef?.reload?.();
  return { handled: true, reloadRequested: true };
};
