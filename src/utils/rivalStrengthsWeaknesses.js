export const MAX_RIVAL_SCOUTING_POINTS = 6;

export const RIVAL_SCOUTING_POINT_CATEGORIES = Object.freeze([
  'offensive',
  'defensive',
  'offensive_transition',
  'defensive_transition',
  'set_piece',
]);

export const RIVAL_SCOUTING_POINT_CATEGORY_LABELS = Object.freeze({
  offensive: 'Ofensivo',
  defensive: 'Defensivo',
  offensive_transition: 'Transición ofensiva',
  defensive_transition: 'Transición defensiva',
  set_piece: 'ABP',
});

const clean = (value) => String(value ?? '').trim();

const fingerprint = (value) => {
  let hash = 2166136261;
  const source = clean(value).toLowerCase();
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const createRivalScoutingPointId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `rival-point-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
};

export const normalizeRivalScoutingPoint = (value, { kind = 'point', index = 0 } = {}) => {
  const source = typeof value === 'string' ? { title: value } : value && typeof value === 'object' ? value : {};
  const title = clean(source.title || source.label || source.name);
  if (!title) return null;
  const category = RIVAL_SCOUTING_POINT_CATEGORIES.includes(source.category) ? source.category : '';
  return {
    id: clean(source.id) || `${kind}-${index}-${fingerprint(title)}`,
    title,
    description: clean(source.description),
    category,
  };
};

export const normalizeRivalScoutingPoints = (values, kind = 'point') => {
  const source = Array.isArray(values) ? values : [];
  const seenIds = new Set();
  return source.reduce((points, value, index) => {
    if (points.length >= MAX_RIVAL_SCOUTING_POINTS) return points;
    const point = normalizeRivalScoutingPoint(value, { kind, index });
    if (!point) return points;
    let id = point.id;
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${point.id}-${suffix}`;
      suffix += 1;
    }
    seenIds.add(id);
    points.push({ ...point, id });
    return points;
  }, []);
};

export const getRivalScoutingPointTitles = (values) => (
  normalizeRivalScoutingPoints(values).map((point) => point.title)
);

export const addRivalScoutingPoint = (values, draft, kind = 'point', createId = createRivalScoutingPointId) => {
  const current = normalizeRivalScoutingPoints(values, kind);
  if (current.length >= MAX_RIVAL_SCOUTING_POINTS) return current;
  const point = normalizeRivalScoutingPoint({ ...draft, id: clean(draft?.id) || createId() }, { kind, index: current.length });
  return point ? [...current, point] : current;
};

export const updateRivalScoutingPoint = (values, pointId, patch, kind = 'point') => (
  normalizeRivalScoutingPoints(values, kind).map((point) => (
    point.id === pointId
      ? normalizeRivalScoutingPoint({ ...point, ...patch, id: point.id }, { kind }) || point
      : point
  ))
);

export const removeRivalScoutingPoint = (values, pointId, kind = 'point') => (
  normalizeRivalScoutingPoints(values, kind).filter((point) => point.id !== pointId)
);

export const moveRivalScoutingPoint = (values, pointId, direction, kind = 'point') => {
  const points = normalizeRivalScoutingPoints(values, kind);
  const currentIndex = points.findIndex((point) => point.id === pointId);
  const targetIndex = currentIndex + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= points.length) return points;
  const reordered = [...points];
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
  return reordered;
};
