export const DIAGRAM_VIEWBOX = Object.freeze({ width: 100, height: 72 });

export const DIAGRAM_PITCH_TYPES = Object.freeze({
  FULL: 'full',
  PENALTY_AREA: 'penalty-area',
});

export const DIAGRAM_PITCH_CATALOG = Object.freeze({
  [DIAGRAM_PITCH_TYPES.FULL]: Object.freeze({
    key: DIAGRAM_PITCH_TYPES.FULL,
    label: 'Campo completo',
  }),
  [DIAGRAM_PITCH_TYPES.PENALTY_AREA]: Object.freeze({
    key: DIAGRAM_PITCH_TYPES.PENALTY_AREA,
    label: 'Vista de area',
  }),
});

export const normalizeDiagramPitchType = (pitchType, fallback = DIAGRAM_PITCH_TYPES.PENALTY_AREA) => (
  Object.prototype.hasOwnProperty.call(DIAGRAM_PITCH_CATALOG, pitchType) ? pitchType : fallback
);

export const resolveLegacySetPiecePitchType = (fullField = false) => (
  fullField ? DIAGRAM_PITCH_TYPES.FULL : DIAGRAM_PITCH_TYPES.PENALTY_AREA
);

export const clampDiagramCoordinate = (value, axis = 'x') => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const maximum = axis === 'y' ? DIAGRAM_VIEWBOX.height : DIAGRAM_VIEWBOX.width;
  return Math.max(0, Math.min(maximum, numericValue));
};

