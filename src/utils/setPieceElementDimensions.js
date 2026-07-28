const FIELD_SIZE = Object.freeze({ width: 100, height: 72 });

export const SET_PIECE_ELEMENT_DIMENSIONS = Object.freeze({
  zone: Object.freeze({
    width: Object.freeze({ min: 4, max: 60, defaultValue: 22 }),
    height: Object.freeze({ min: 4, max: 42, defaultValue: 12 }),
  }),
  text_box: Object.freeze({
    width: Object.freeze({ min: 8, max: 60, defaultValue: 32 }),
    height: Object.freeze({ min: 6, max: 42, defaultValue: 24 }),
  }),
  block: Object.freeze({
    width: Object.freeze({ min: 5, max: 18, defaultValue: 18 }),
  }),
});

const finiteNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getSetPieceDimensionRange = (element = {}, dimension) => {
  const rule = SET_PIECE_ELEMENT_DIMENSIONS[element?.type]?.[dimension];
  if (!rule) return null;

  const axis = dimension === 'width' ? 'x' : 'y';
  const fieldLimit = FIELD_SIZE[dimension];
  const origin = finiteNumber(element?.[axis]);
  const available = origin === null ? rule.max : fieldLimit - Math.max(0, origin);
  const max = Math.max(rule.min, Math.min(rule.max, available));

  return { ...rule, max };
};

export const normalizeSetPieceDimensionValue = (element, dimension, value, fallbackValue) => {
  const range = getSetPieceDimensionRange(element, dimension);
  if (!range) return finiteNumber(value);

  const fallback = finiteNumber(fallbackValue) ?? range.defaultValue;
  const candidate = finiteNumber(value) ?? fallback;
  return Math.max(range.min, Math.min(range.max, candidate));
};

export const normalizeSetPieceElementDimensions = (element = {}) => {
  const rules = SET_PIECE_ELEMENT_DIMENSIONS[element.type];
  if (!rules) return element;

  return Object.keys(rules).reduce(
    (normalized, dimension) => ({
      ...normalized,
      [dimension]: normalizeSetPieceDimensionValue(
        normalized,
        dimension,
        normalized[dimension],
        rules[dimension].defaultValue
      ),
    }),
    { ...element }
  );
};
