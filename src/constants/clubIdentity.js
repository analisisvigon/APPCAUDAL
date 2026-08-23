const clean = (value) => String(value ?? '').trim();

export const OWN_CLUB_IDENTITY = Object.freeze({
  name: 'C.D. Caudal de Mieres',
  shortName: 'C.D. Caudal',
  crest: 'https://tmssl.akamaized.net//images/wappen/head/13226.png?lm=1747769013',
});

export const getOwnClubDisplayName = (value) => {
  const name = clean(value);
  return !name || /^C\.?\s*D\.?\s*Caudal$/i.test(name) ? OWN_CLUB_IDENTITY.name : name;
};
