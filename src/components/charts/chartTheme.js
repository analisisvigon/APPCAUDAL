export const CHART_SERIES_COLORS = Object.freeze([
  '#5EA8FF',
  '#22C7E8',
  '#F4B942',
  '#7DD87D',
  '#C084FC',
  '#FB7185',
]);

export const CHART_BAR_RADIUS = 6;
export const CHART_BAR_GAP = 4;
export const CHART_CATEGORY_GAP = 18;
export const CHART_GRID_COLOR = 'rgba(148,163,184,0.14)';
export const CHART_AXIS_COLOR = '#94a3b8';

export const getChartSeriesColor = (index = 0) => (
  CHART_SERIES_COLORS[Math.abs(Number(index) || 0) % CHART_SERIES_COLORS.length]
);

export const getChartAxisIndexes = (pointCount, maximumLabels = 7) => {
  const count = Math.max(0, Number(pointCount) || 0);
  const labelCount = Math.min(count, Math.max(1, Number(maximumLabels) || 1));
  return new Set(Array.from({ length: labelCount }, (_, index) => (
    Math.round((index * Math.max(count - 1, 0)) / Math.max(labelCount - 1, 1))
  )));
};

export const getBarHeight = (value, maximum, plotHeight, zeroHeight = 2) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  if (Number(value) === 0) return zeroHeight;
  return Math.max(zeroHeight, (Number(value) / Math.max(Number(maximum) || 0, 1)) * plotHeight);
};

export const getBarChartWidth = ({
  categoryCount,
  seriesCount = 1,
  plotSides = 64,
  minimumWidth = 520,
  barWidth = seriesCount > 1 ? 16 : 28,
  barGap = CHART_BAR_GAP,
  categoryGap = CHART_CATEGORY_GAP,
} = {}) => {
  const categories = Math.max(1, Number(categoryCount) || 0);
  const series = Math.max(1, Number(seriesCount) || 1);
  const groupWidth = (series * barWidth) + (Math.max(0, series - 1) * barGap);
  return Math.max(minimumWidth, plotSides + (categories * (groupWidth + categoryGap)));
};
