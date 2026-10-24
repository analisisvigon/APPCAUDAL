const clean = (value) => String(value ?? '').trim();

const almadinaIdentity = {
  name: 'Almadina SC',
  shortName: 'Almadina SC',
  location: 'Trípoli, Libia',
  description: 'Cuerpo técnico',
  // Copiar el escudo adjunto con este nombre. TeamLogo muestra iniciales
  // hasta que exista el archivo, sin mostrar el escudo anterior.
  crest: '/branding/almadina-sc-crest.png',
};

export const resolveOwnClubIdentity = (env = {}) => env.VITE_DEPLOYMENT_ID === 'libya'
  ? Object.freeze({
    name: clean(env.VITE_OWN_CLUB_NAME),
    shortName: clean(env.VITE_OWN_CLUB_SHORT_NAME) || clean(env.VITE_OWN_CLUB_NAME),
    crest: clean(env.VITE_OWN_CLUB_CREST),
  })
  : Object.freeze({ ...almadinaIdentity });

export const OWN_CLUB_IDENTITY = resolveOwnClubIdentity(import.meta.env);

export const getOwnClubDisplayName = (value) => {
  const name = clean(value);
  if (!name) return OWN_CLUB_IDENTITY.name;
  return import.meta.env?.VITE_DEPLOYMENT_ID !== 'libya'
    && /^(?:C\.?\s*D\.?\s*Caudal(?:\s+de\s+Mieres)?|Caudal Deportivo)$/i.test(name)
    ? OWN_CLUB_IDENTITY.name : name;
};
