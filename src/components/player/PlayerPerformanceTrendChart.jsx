import { splitAvailablePlayerSeries } from '../../utils/playerPerformancePresentation';

const shortDate = (value) => {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : '';
};

const formatValue = (value, unit) => `${Number(value).toLocaleString('es-ES', { maximumFractionDigits: 1 })}${unit === 'kg' ? ' kg' : unit}`;

export default function PlayerPerformanceTrendChart({ model }) {
  const { metric, points = [], scale = { min: 0, max: 1 }, aggregation = 'daily' } = model || {};
  const available = points.filter((point) => point?.date && point?.value !== null);
  const segments = splitAvailablePlayerSeries(points);
  const width = 720;
  const height = 270;
  const plot = { left: 42, right: 16, top: 18, bottom: 38 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const scaleSpan = Math.max(Number(scale.max) - Number(scale.min), 0.1);
  const xFor = (index) => plot.left + ((plotWidth / Math.max(points.length - 1, 1)) * index);
  const yFor = (value) => plot.top + (((scale.max - value) / scaleSpan) * plotHeight);
  const indexById = new Map(points.map((point, index) => [point.id, index]));
  const axisIndexes = new Set(
    Array.from({ length: Math.min(points.length, 5) }, (_, index, labels) => (
      Math.round((index * Math.max(points.length - 1, 0)) / Math.max(labels.length - 1, 1))
    )),
  );
  const axisValues = [scale.max, (scale.max + scale.min) / 2, scale.min];

  if (!metric || !available.length) {
    return (
      <div className="flex min-h-[230px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 text-center text-sm text-slate-400">
        No hay suficientes registros de esta métrica en el periodo.
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${metric.label}, ${aggregation === 'weekly_average' ? 'medias semanales' : 'valores diarios'}: ${available.map((point) => `${point.date}, ${formatValue(point.value, metric.unit)}`).join('; ')}`}
      >
        {axisValues.map((value) => (
          <g key={value}>
            <line x1={plot.left} x2={width - plot.right} y1={yFor(value)} y2={yFor(value)} stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
            <text x={plot.left - 9} y={yFor(value) + 4} textAnchor="end" fill="#64748b" fontSize="10">
              {Number(value).toLocaleString('es-ES', { maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}
        {segments.map((segment, segmentIndex) => (
          <polyline
            key={`segment-${segmentIndex}`}
            points={segment.map((point) => `${xFor(indexById.get(point.id))},${yFor(point.value)}`).join(' ')}
            fill="none"
            stroke="#5ee7ff"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {available.map((point) => {
          const pointLabel = point.endDate && point.endDate !== point.date
            ? `${shortDate(point.date)}–${shortDate(point.endDate)}`
            : shortDate(point.date);
          return (
            <g key={point.id}>
              <title>{`${pointLabel}: ${formatValue(point.value, metric.unit)}${aggregation === 'weekly_average' ? ` · media de ${point.count} días` : ''}`}</title>
              <circle cx={xFor(indexById.get(point.id))} cy={yFor(point.value)} r="6" fill="#5ee7ff" stroke="#0b1424" strokeWidth="3" />
            </g>
          );
        })}
        {points.map((point, index) => axisIndexes.has(index) ? (
          <text
            key={`axis-${point.id}`}
            x={xFor(index)}
            y={height - 9}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            fill="#64748b"
            fontSize="11"
            fontWeight="600"
          >
            {shortDate(point.date)}
          </text>
        ) : null)}
      </svg>
    </div>
  );
}
