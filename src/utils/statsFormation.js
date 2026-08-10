export const DEFAULT_OWN_FORMATION = '4-2-3-1';
export const OWN_DEFAULT_FORMATION_CONFIG_KEY = 'own_default_formation';

export const STATS_FORMATION_OPTIONS = Object.freeze([
  '4-2-3-1',
  '4-4-2',
  '4-3-3',
  '3-5-2',
  '5-3-2',
  '3-4-3',
]);

const cleanFormation = (value) => String(value || '').trim();

export const normalizeOwnDefaultFormation = (value) => {
  const formation = cleanFormation(value);
  return STATS_FORMATION_OPTIONS.includes(formation) ? formation : DEFAULT_OWN_FORMATION;
};

export const resolveMatchStatsFormation = (match = {}, ownDefaultFormation = DEFAULT_OWN_FORMATION) => {
  const storedStatsSystem = cleanFormation(
    match.statsSystemRaw ?? match.stats_system ?? match.statsSystem
  );
  if (storedStatsSystem) return storedStatsSystem;

  const storedPreSystem = cleanFormation(
    match.preCaudalSystemRaw ?? match.pre_caudal_system ?? match.preCaudalSystem
  );
  if (storedPreSystem) return storedPreSystem;

  return normalizeOwnDefaultFormation(ownDefaultFormation);
};

export const createNewMatchFormationState = (ownDefaultFormation = DEFAULT_OWN_FORMATION) => {
  const formation = normalizeOwnDefaultFormation(ownDefaultFormation);
  return { statsSystem: formation, preCaudalSystem: formation };
};
