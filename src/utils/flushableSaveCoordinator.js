const normalizeResult = (result) => (
  result?.ok === false
    ? { ok: false, error: result.error || new Error('No se pudo guardar.') }
    : { ok: true, ...(result || {}) }
);

export const TACTICAL_AUTOSAVE_DELAY_MS = 900;

export const createFlushableSaveCoordinator = ({ readSnapshot, persist, onStatusChange } = {}) => {
  let version = 0;
  let savedVersion = 0;
  let generation = 0;
  let inFlight = null;
  let status = '';

  const setStatus = (nextStatus) => {
    status = nextStatus;
    onStatusChange?.(nextStatus);
  };

  const markDirty = () => {
    version += 1;
    setStatus('Cambios sin guardar');
    return version;
  };

  const save = () => {
    if (inFlight) return inFlight;
    if (savedVersion >= version) return Promise.resolve({ ok: true, clean: true });

    const saveGeneration = generation;
    const saveVersion = version;
    const snapshot = readSnapshot?.();
    setStatus('Guardando');

    const operation = Promise.resolve()
      .then(() => persist?.(snapshot))
      .then(normalizeResult)
      .catch((error) => ({ ok: false, error }))
      .then((result) => {
        if (generation !== saveGeneration) return { ...result, stale: true };
        if (!result.ok) {
          setStatus('Error al guardar');
          return result;
        }
        savedVersion = Math.max(savedVersion, saveVersion);
        const clean = savedVersion >= version;
        setStatus(clean ? 'Guardado' : 'Cambios sin guardar');
        return { ...result, clean };
      })
      .finally(() => {
        if (generation === saveGeneration && inFlight === operation) inFlight = null;
      });

    inFlight = operation;
    return operation;
  };

  const flush = async () => {
    while (inFlight || savedVersion < version) {
      const result = await (inFlight || save());
      if (!result.ok) return result;
      if (result.stale) return { ok: false, stale: true, error: new Error('El contexto de guardado ha cambiado.') };
    }
    return { ok: true, clean: true };
  };

  const reset = (nextStatus = '') => {
    generation += 1;
    version = 0;
    savedVersion = 0;
    inFlight = null;
    setStatus(nextStatus);
  };

  return {
    flush,
    getState: () => ({
      dirty: savedVersion < version,
      generation,
      inFlight: Boolean(inFlight),
      savedVersion,
      status,
      version,
    }),
    hasPending: () => Boolean(inFlight) || savedVersion < version,
    markDirty,
    reset,
    save,
  };
};

export const flushPendingSaveTargets = async (targets = []) => {
  for (const target of targets.filter(Boolean)) {
    if (!target.hasPending?.()) continue;
    const result = await target.flush();
    if (!result?.ok) return result;
  }
  return { ok: true };
};
