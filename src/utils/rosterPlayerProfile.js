const parseIsoDate = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
};

const getAgeFromDate = (dob, referenceDate) => {
  const birth = parseIsoDate(dob);
  if (!birth || !(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) return null;
  let age = referenceDate.getFullYear() - birth.year;
  if (referenceDate.getMonth() + 1 < birth.month
    || (referenceDate.getMonth() + 1 === birth.month && referenceDate.getDate() < birth.day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
};

const getAlternativeAge = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,3})(?:\s*(?:años?|a))?$/i);
  if (!match) return null;
  const age = Number(match[1]);
  return age <= 120 ? age : null;
};

export const mergeGlobalRosterProfile = (rosterPlayer = {}, globalPlayer = null) => {
  if (!globalPlayer) return rosterPlayer;
  return {
    ...rosterPlayer,
    dob: globalPlayer.dob ?? '',
    age: globalPlayer.age ?? '',
    foot: globalPlayer.foot ?? '',
  };
};

export const getRosterAgeYears = (player = {}, referenceDate = new Date()) =>
  getAgeFromDate(player.dob, referenceDate) ?? getAlternativeAge(player.age);

export const getRosterAgeLabel = (player = {}, referenceDate = new Date()) => {
  const age = getRosterAgeYears(player, referenceDate);
  return age === null ? 'Edad no indicada' : `${age} años`;
};

export const getRosterFootLabel = (foot) => {
  const value = String(foot || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^(derecha|derecho|right)$/.test(value)) return 'Diestro';
  if (/^(izquierda|izquierdo|left)$/.test(value)) return 'Zurdo';
  if (/^(ambas|ambos|ambidiestro|ambidiestra|both)$/.test(value)) return 'Ambidiestro';
  return 'Pierna no indicada';
};

export const isRosterPlayerOperationalSub23 = (player = {}, referenceDate = new Date()) => {
  const age = getRosterAgeYears(player, referenceDate);
  return age !== null && age < 23;
};
