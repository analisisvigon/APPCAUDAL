import {
  PLAYER_CHART_SCALE,
  buildPlayerMetricSeries,
} from '../../utils/playerPerformancePresentation';
import {
  CHART_AXIS_COLOR,
  CHART_BAR_RADIUS,
  CHART_GRID_COLOR,
  CHART_SERIES_COLORS,
} from '../charts/chartTheme';

const shortDate = (value) => {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : '';
};

export default function PlayerLineChart({
  entries,
  field,
  label,
  limit = 7,
  compact = false,
}) {
  const points = buildPlayerMetricSeries(entries, field, limit);
  const available = points.filter((point) => point.date && point.value !== null);
  const width = 640;
  const height = compact ? 138 : 224;
  const plot = compact
    ? { left: 12, right: 12, top: 14, bottom: 24 }
    : { left: 34, right: 14, top: 18, bottom: 34 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const validDates = points.map((point) => Date.parse(`${point.date}T12:00:00Z`)).filter(Number.isFinite);
  const minDate = validDates.length ? Math.min(...validDates) : 0;
  const maxDate = validDates.length ? Math.max(...validDates) : minDate;
  const dateSpan = Math.max(maxDate - minDate, 1);
  const xFor = (point, fallbackIndex = 0) => {
    const timestamp = Date.parse(`${point.date}T12:00:00Z`);
    const rawX = Number.isFinite(timestamp) && maxDate !== minDate
      ? plot.left + (((timestamp - minDate) / dateSpan) * plotWidth)
      : plot.left + ((plotWidth / Math.max(points.length - 1, 1)) * fallbackIndex);
    const edgeInset = barWidth / 2;
    return Math.max(plot.left + edgeInset, Math.min(width - plot.right - edgeInset, rawX));
  };
  const yFor = (value) => plot.top + (((PLAYER_CHART_SCALE.max - value) / (PLAYER_CHART_SCALE.max - PLAYER_CHART_SCALE.min)) * plotHeight);
  const baselineY = yFor(PLAYER_CHART_SCALE.min);
  const barWidth = compact ? 34 : 30;
  const pointIndex = new Map(points.map((point, index) => [point.id, index]));
  const axisIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  if (!available.length) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 text-center text-sm text-slate-500 ${compact ? 'min-h-[138px]' : 'min-h-[224px]'}`}>
        Sin datos de {label.toLocaleLowerCase('es')}.
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Evolución de ${label}: ${available.map((point) => `${point.date}, ${point.value}`).join('; ')}`}
      >
        {[PLAYER_CHART_SCALE.max, 5, PLAYER_CHART_SCALE.min].map((value) => (
          <g key={value}>
            <line x1={plot.left} x2={width - plot.right} y1={yFor(value)} y2={yFor(value)} stroke={CHART_GRID_COLOR} strokeWidth="1" />
            {!compact ? <text x={plot.left - 9} y={yFor(value) + 4} textAnchor="end" fill={CHART_AXIS_COLOR} fontSize="10">{value}</text> : null}
          </g>
        ))}
        {available.map((point) => {
          const index = pointIndex.get(point.id);
          const rawHeight = baselineY - yFor(point.value);
          return (
            <g key={point.id}>
              <title>{`${point.date}\n${label}\n${point.value} /10`}</title>
              <rect
                x={xFor(point, index) - (barWidth / 2)}
                y={baselineY - Math.max(2, rawHeight)}
                width={barWidth}
                height={Math.max(2, rawHeight)}
                rx={CHART_BAR_RADIUS}
                fill={CHART_SERIES_COLORS[0]}
                opacity="0.84"
                className="transition-[opacity,filter] duration-200 hover:brightness-110 hover:opacity-100"
              />
            </g>
          );
        })}
        {points.map((point, index) => axisIndexes.has(index) && point.date ? (
          <text key={`axis-${point.id}`} x={xFor(point, index)} y={height - 7} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fill={CHART_AXIS_COLOR} fontSize={compact ? 10 : 11} fontWeight="600">
            {shortDate(point.date)}
          </text>
        ) : null)}
      </svg>
    </div>
  );
}
