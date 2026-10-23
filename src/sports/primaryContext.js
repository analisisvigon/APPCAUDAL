// Preferencia de navegacion, nunca una fuente de autorizacion. La lista debe
// proceder de my_access_contexts_v1() y cada apertura se verifica de nuevo.
export const findPreferredActiveContext = (contexts, configuredId) => {
  const id = String(configuredId || '').trim();
  if (!id || !Array.isArray(contexts)) return null;
  const matches = contexts.filter((context) => context?.id === id);
  if (matches.length !== 1) return null;
  const context = matches[0];
  return context.role === 'owner'
    && context.seasonStatus === 'open'
    && context.isActiveSeason === true ? context : null;
};
