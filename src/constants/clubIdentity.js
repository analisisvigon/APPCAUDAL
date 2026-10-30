const clean = (value) => String(value ?? '').trim();

const almadinaIdentity = {
  name: 'Al-Madina SC',
  shortName: 'Al-Madina SC Sub-23',
  location: 'Trípoli, Libia',
  description: 'Cuerpo técnico',
  crest: '/branding/almadina-sc-crest.png',
};

export const normalizeOwnClubName = (value) => clean(value).replace(
  /^Almadina SC(?:( Sub-23))?$/i,
  (_, category = '') => `Al-Madina SC${category}`
);

export const resolveOwnClubIdentity = (env = {}) => env.VITE_DEPLOYMENT_ID === 'libya'
  ? Object.freeze({
    name: normalizeOwnClubName(env.VITE_OWN_CLUB_NAME),
    shortName: normalizeOwnClubName(env.VITE_OWN_CLUB_SHORT_NAME) || normalizeOwnClubName(env.VITE_OWN_CLUB_NAME),
    crest: clean(env.VITE_OWN_CLUB_CREST),
  })
  : Object.freeze({ ...almadinaIdentity });

export const OWN_CLUB_IDENTITY = resolveOwnClubIdentity(import.meta.env);

export const getOwnClubDisplayName = (value) => {
  const name = clean(value);
  if (!name) return OWN_CLUB_IDENTITY.shortName;
  return /^Almadina SC(?:\s+Sub-23)?$/i.test(name)
    ? normalizeOwnClubName(name)
    : import.meta.env?.VITE_DEPLOYMENT_ID !== 'libya'
    && /^(?:C\.?\s*D\.?\s*Caudal(?:\s+de\s+Mieres)?|Caudal Deportivo)$/i.test(name)
    ? OWN_CLUB_IDENTITY.shortName : name;
};
