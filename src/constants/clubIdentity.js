const clean = (value) => String(value ?? '').trim();

const caudalIdentity = {
  name: 'C.D. Caudal de Mieres',
  shortName: 'C.D. Caudal',
  crest: 'https://tmssl.akamaized.net//images/wappen/head/13226.png?lm=1747769013',
};

export const resolveOwnClubIdentity = (env = {}) => env.VITE_DEPLOYMENT_ID === 'libya'
  ? Object.freeze({
    name: clean(env.VITE_OWN_CLUB_NAME),
    shortName: clean(env.VITE_OWN_CLUB_SHORT_NAME) || clean(env.VITE_OWN_CLUB_NAME),
    crest: clean(env.VITE_OWN_CLUB_CREST),
  })
  : Object.freeze({ ...caudalIdentity });

export const OWN_CLUB_IDENTITY = resolveOwnClubIdentity(import.meta.env);

export const getOwnClubDisplayName = (value) => {
  const name = clean(value);
  if (!name) return OWN_CLUB_IDENTITY.name;
  return import.meta.env?.VITE_DEPLOYMENT_ID !== 'libya'
    && /^C\.?\s*D\.?\s*Caudal$/i.test(name) ? OWN_CLUB_IDENTITY.name : name;
};
