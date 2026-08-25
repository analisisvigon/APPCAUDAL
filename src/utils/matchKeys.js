const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const normalizeMatchKeyText = (value) => String(value || '').trim().replace(/\s+/g, ' ');

export const normalizeMatchKeyLines = (items = []) => {
  const seen = new Set();
  return safeArray(items).map(normalizeMatchKeyText).filter((text) => {
    const identity = text.toLocaleLowerCase('es');
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

const splitLegacyPlan = (value) => normalizeMatchKeyLines(String(value || '').split('\n'));

export const getMatchKeyGroups = ({ preAiAnalysis, planClave } = {}) => {
  const analysis = safeObject(preAiAnalysis);
  const hasTypedKeys = Object.prototype.hasOwnProperty.call(analysis, 'matchKeysOffensive')
    || Object.prototype.hasOwnProperty.call(analysis, 'matchKeysDefensive');

  if (hasTypedKeys) {
    return {
      offensive: normalizeMatchKeyLines(analysis.matchKeysOffensive),
      defensive: normalizeMatchKeyLines(analysis.matchKeysDefensive),
      usesLegacyFallback: false,
    };
  }

  const storedLegacy = normalizeMatchKeyLines(analysis.matchKeys);
  const planLegacy = splitLegacyPlan(planClave);
  const singleLegacy = normalizeMatchKeyText(analysis.matchKey);
  return {
    offensive: storedLegacy.length ? storedLegacy : planLegacy.length ? planLegacy : normalizeMatchKeyLines([singleLegacy]),
    defensive: [],
    usesLegacyFallback: true,
  };
};

export const buildMatchKeyPersistence = (groups = {}, preAiAnalysis = {}) => {
  const offensive = normalizeMatchKeyLines(groups.offensive);
  const defensive = normalizeMatchKeyLines(groups.defensive);
  const flattened = [...offensive, ...defensive];
  const { matchKey, ...analysis } = safeObject(preAiAnalysis);

  return {
    planClave: flattened.join('\n'),
    preAiAnalysis: {
      ...analysis,
      matchKeysOffensive: offensive,
      matchKeysDefensive: defensive,
      matchKeys: flattened,
    },
  };
};

export const moveMatchKey = (items = [], index, direction) => {
  const normalized = normalizeMatchKeyLines(items);
  const target = Number(index) + Number(direction);
  if (index < 0 || index >= normalized.length || target < 0 || target >= normalized.length) return normalized;
  [normalized[index], normalized[target]] = [normalized[target], normalized[index]];
  return normalized;
};

