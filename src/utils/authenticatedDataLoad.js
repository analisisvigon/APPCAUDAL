export const createAuthenticatedDataLoadCoordinator = () => {
  let generation = 0;
  let activeKey = '';
  let activePromise = null;

  return {
    start(key, load) {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) return { started: false, promise: Promise.resolve(null) };
      if (activeKey === normalizedKey && activePromise) {
        return { started: false, promise: activePromise };
      }

      const loadGeneration = ++generation;
      activeKey = normalizedKey;
      const context = {
        isCurrent: () => generation === loadGeneration && activeKey === normalizedKey,
      };
      activePromise = Promise.resolve().then(() => load(context));
      return { started: true, promise: activePromise };
    },
    invalidate() {
      generation += 1;
      activeKey = '';
      activePromise = null;
    },
  };
};

export const runIndependentAuthenticatedLoaders = async (loaders = {}, isCurrent = () => true) => {
  const entries = Object.entries(loaders);
  const settled = await Promise.allSettled(entries.map(([, load]) => load()));
  if (!isCurrent()) return { cancelled: true, failures: [] };

  return {
    cancelled: false,
    failures: settled.flatMap((result, index) => (
      result.status === 'rejected'
        ? [{ dataset: entries[index][0], error: result.reason }]
        : []
    )),
  };
};
