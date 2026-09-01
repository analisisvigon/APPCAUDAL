import { splitAvailablePlayerSeries } from '../../utils/playerPerformancePresentation';

const shortDate = (value) => {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : '';
};

const fullDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

const formatNumber = (value) => Number(value).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const formatValue = (value, unit) => `${formatNumber(value)}${unit === 'kg' ? ' kg' : unit}`;

export default function PlayerPerformanceTrendChart({ model }) {
  const { metric, points = [], scale = { min: 0, max: 1 }, aggregation = 'daily' } = model || {};
  const available = points.filter((point) => point?.date && point?.value !== null);
  const segments = splitAvailablePlayerSeries(points);
  const width = 640;
  const height = 200;
  const plot = { left: 38, right: 14, top: 34, bottom: 30 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const scaleSpan = Math.max(Number(scale.max) - Number(scale.min), 0.1);
  const xFor = (index) => plot.left + ((plotWidth / Math.max(points.length - 1, 1)) * index);
  const yFor = (value) => plot.top + (((scale.max - value) / scaleSpan) * plotHeight);
  const indexById = new Map(points.map((point, index) => [point.id, index]));
  const axisLabelCount = Math.min(points.length, 5);
  const axisIndexes = new Set(
    Array.from({ length: axisLabelCount }, (_, index) => (
      Math.round((index * Math.max(points.length - 1, 0)) / Math.max(axisLabelCount - 1, 1))
    )),
  );
  const hasTenPointScale = Number(scale.max) === 10 && [0, 1].includes(Number(scale.min));
  const axisValues = hasTenPointScale
    ? Array.from({ length: 11 - Number(scale.min) }, (_, index) => 10 - index)
    : [scale.max, (scale.max + scale.min) / 2, scale.min];

  if (!metric || !available.length) {
    return (
      <div className="flex min-h-[170px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 text-center text-sm text-slate-400">
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
        {axisValues.map((value) => {
          const hideOnMobile = hasTenPointScale && value % 2 !== 0 && value !== scale.min && value !== scale.max;
          return (
          <g key={value} className={hideOnMobile ? 'hidden sm:block' : undefined}>
            <line x1={plot.left} x2={width - plot.right} y1={yFor(value)} y2={yFor(value)} stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
            <text x={plot.left - 8} y={yFor(value) + 4} textAnchor="end" fill="#64748b" fontSize="11">
              {formatNumber(value)}
            </text>
          </g>
          );
        })}
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
          const index = indexById.get(point.id);
          const pointLabel = point.endDate && point.endDate !== point.date
            ? `${shortDate(point.date)}–${shortDate(point.endDate)}`
            : shortDate(point.date);
          return (
            <g key={point.id}>
              <title>{`${fullDate(point.date)}\n${metric.label}\n${formatValue(point.value, metric.unit)}${aggregation === 'weekly_average' ? ` · media de ${point.count} días (${pointLabel})` : ''}`}</title>
              <text x={xFor(index)} y={yFor(point.value) - (index % 2 ? 22 : 11)} textAnchor="middle" fill="#e2f8ff" fontSize="15" fontWeight="800" stroke="#0b1424" strokeWidth="3" paintOrder="stroke">
                {formatNumber(point.value)}
              </text>
              <circle cx={xFor(index)} cy={yFor(point.value)} r="5.5" fill="#5ee7ff" stroke="#0b1424" strokeWidth="2.5" />
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
