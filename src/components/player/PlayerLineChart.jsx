import {
  PLAYER_CHART_SCALE,
  buildPlayerMetricSeries,
  splitAvailablePlayerSeries,
} from '../../utils/playerPerformancePresentation';

const shortDate = (value) => {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : '';
};

export default function PlayerLineChart({
  entries,
  field,
  label,
  color = '#4f8cff',
  limit = 7,
  compact = false,
}) {
  const points = buildPlayerMetricSeries(entries, field, limit);
  const available = points.filter((point) => point.date && point.value !== null);
  const segments = splitAvailablePlayerSeries(points);
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
    if (Number.isFinite(timestamp) && maxDate !== minDate) {
      return plot.left + (((timestamp - minDate) / dateSpan) * plotWidth);
    }
    return plot.left + ((plotWidth / Math.max(points.length - 1, 1)) * fallbackIndex);
  };
  const yFor = (value) => plot.top + (((PLAYER_CHART_SCALE.max - value) / (PLAYER_CHART_SCALE.max - PLAYER_CHART_SCALE.min)) * plotHeight);
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
        <defs>
          <linearGradient id={`player-chart-fill-${field}-${compact ? 'mini' : 'full'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[PLAYER_CHART_SCALE.max, 5, PLAYER_CHART_SCALE.min].map((value) => (
          <g key={value}>
            <line x1={plot.left} x2={width - plot.right} y1={yFor(value)} y2={yFor(value)} stroke="rgba(148,163,184,0.13)" strokeWidth="1" />
            {!compact ? <text x={plot.left - 9} y={yFor(value) + 4} textAnchor="end" fill="#64748b" fontSize="10">{value}</text> : null}
          </g>
        ))}
        {segments.map((segment, segmentIndex) => {
          const coordinates = segment.map((point) => `${xFor(point, pointIndex.get(point.id))},${yFor(point.value)}`);
          const areaCoordinates = segment.length > 1
            ? `${coordinates.join(' ')} ${xFor(segment.at(-1), pointIndex.get(segment.at(-1).id))},${plot.top + plotHeight} ${xFor(segment[0], pointIndex.get(segment[0].id))},${plot.top + plotHeight}`
            : '';
          return (
            <g key={`segment-${segmentIndex}`}>
              {areaCoordinates ? <polygon points={areaCoordinates} fill={`url(#player-chart-fill-${field}-${compact ? 'mini' : 'full'})`} /> : null}
              <polyline points={coordinates.join(' ')} fill="none" stroke={color} strokeWidth={compact ? 4 : 3.5} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {available.map((point) => {
          const index = pointIndex.get(point.id);
          return (
            <g key={point.id}>
              <title>{`${point.date}: ${point.value}`}</title>
              <circle cx={xFor(point, index)} cy={yFor(point.value)} r={compact ? 5 : 5.5} fill={color} stroke="#0b1424" strokeWidth="2.5" />
            </g>
          );
        })}
        {points.map((point, index) => axisIndexes.has(index) && point.date ? (
          <text key={`axis-${point.id}`} x={xFor(point, index)} y={height - 7} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fill="#64748b" fontSize={compact ? 10 : 11} fontWeight="600">
            {shortDate(point.date)}
          </text>
        ) : null)}
      </svg>
    </div>
  );
}
