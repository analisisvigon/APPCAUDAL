import { useMemo } from 'react';
import {
  aggregatePerformanceMetricPoints,
  getPerformanceMetricKpiLabels,
  getPerformanceSessionTypeLabel,
  PERFORMANCE_LOAD_METRIC_CONFIG,
  getPerformanceLoadMetricConfig,
  summarizePerformanceMetricPoints,
} from '../../utils/performanceLoad';

const formatShortDate = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' }).format(date);
};

const formatLongDate = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const formatMetricValue = (value, decimals = 1) => {
  if (value === null || value === undefined) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const maximumFractionDigits = Number.isInteger(decimals) && decimals >= 0 ? decimals : 1;
  return number.toLocaleString('es-ES', {
    minimumFractionDigits: Number.isInteger(number) ? 0 : Math.min(1, maximumFractionDigits),
    maximumFractionDigits,
  });
};

const buildLoadSeries = (loads = [], rpeEntries = [], startDate, endDate, metricConfig, period = 'week', mode = 'staff') => {
  const metricsByDate = new Map((loads || []).map((load) => [load?.session?.session_date, load]));
  const rpeByDate = new Map();
  (rpeEntries || []).forEach((entry) => {
    if (!entry?.entry_date) return;
    const value = parseFloat(String(entry.rpe || '').replace(',', '.'));
    if (!Number.isFinite(value)) return;
    if (value < 1 || value > 10) return;
    const list = rpeByDate.get(entry.entry_date) || [];
    list.push(value);
    rpeByDate.set(entry.entry_date, list);
  });

  const points = [];
  let current = startDate;
  while (current <= endDate) {
    const load = metricsByDate.get(current) || null;
    const value = metricConfig.valueFromRecord(load);
    const weight = metricConfig.weightFromRecord?.(load) ?? null;
    const dayValues = rpeByDate.get(current) || [];
    const avgRpe = dayValues.length ? dayValues.reduce((sum, item) => sum + item, 0) / dayValues.length : null;
    const currentDate = new Date(`${current}T12:00:00`);
    const dayOfMonth = currentDate.getDate();
    const shortDay = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(currentDate).replace('.', '').toUpperCase();
    const label = `${shortDay} ${String(dayOfMonth).padStart(2, '0')}`;
    const axisLabel = period === 'month'
      ? (dayOfMonth === 1 || dayOfMonth % 3 === 1 || current === endDate ? String(dayOfMonth) : '')
      : String(dayOfMonth);
    points.push({
      key: current,
      entryDate: current,
      label,
      dayLabel: shortDay,
      axisLabel,
      value,
      weight,
      hasData: value !== null,
      avgRpe,
      load,
      tooltip: mode === 'player'
        ? [
          formatLongDate(current),
          `${metricConfig.label}: ${value === null ? 'sin dato' : `${formatMetricValue(value, metricConfig.decimals)} ${metricConfig.unit}`}`,
        ].join('\n')
        : [
          formatLongDate(current),
          load ? `${getPerformanceSessionTypeLabel(load.session.session_type)} · ${load.session.actual_duration_minutes ? `${load.session.actual_duration_minutes} min` : 'Sin volumen'}` : 'Sin sesión de carga',
          `${metricConfig.label}: ${value === null ? 'sin dato' : `${formatMetricValue(value, metricConfig.decimals)} ${metricConfig.unit}`}`,
          `Volumen: ${load?.session?.actual_duration_minutes === null || load?.session?.actual_duration_minutes === undefined ? 'sin dato' : `${load.session.actual_duration_minutes} min`}`,
          avgRpe !== null ? `RPE medio: ${avgRpe.toFixed(1)}` : 'RPE medio: sin dato',
        ].join('\n'),
    });
    current = new Date(`${current}T12:00:00`);
    current.setDate(current.getDate() + 1);
    current = current.toISOString().slice(0, 10);
  }
  return points;
};

const buildMonthWeekSummary = (points, metric) => {
  const weeks = new Map();
  points.forEach((point) => {
    const date = new Date(`${point.entryDate}T12:00:00`);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    const weekStart = date.toISOString().slice(0, 10);
    const group = weeks.get(weekStart) || { startDate: weekStart, points: [] };
    group.points.push(point);
    weeks.set(weekStart, group);
  });
  const result = [...weeks.values()].map((week) => ({
    ...week,
    label: `${formatShortDate(week.startDate)} — ${formatShortDate(addDays(week.startDate, 6))}`,
    aggregate: aggregatePerformanceMetricPoints(week.points, metric),
  }));
  return result;
};

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const LoadEvolutionChart = ({ points, selectedKey, onSelect, period, metric, mode = 'staff' }) => {
  const width = 720;
  const height = 260;
  const plot = { left: 40, right: 20, top: 24, bottom: 40 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const values = points.filter((point) => point.hasData).map((point) => point.value);
  const maxValue = values.length ? Math.max(...values) : 1;

  const xFor = (index) => plot.left + ((plotWidth / Math.max(points.length - 1, 1)) * index);
  const yFor = (value) => plot.top + ((1 - (value / Math.max(maxValue, 1))) * plotHeight);

  const segments = [];
  let currentSegment = [];
  points.forEach((point, index) => {
    if (point.hasData) {
      currentSegment.push(`${xFor(index)},${yFor(point.value)}`);
    } else if (currentSegment.length) {
      segments.push(currentSegment);
      currentSegment = [];
    }
  });
  if (currentSegment.length) segments.push(currentSegment);

  if (!points.some((point) => point.hasData)) {
    if (mode === 'player') {
      return <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center text-sm text-slate-500">No hay datos de {metric.label} del equipo para este periodo.</div>;
    }
    return <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center text-sm text-slate-500">No hay datos de {metric.label} para este periodo.</div>;
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#071124] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap gap-4 text-xs font-bold text-slate-400">
        <span className="inline-flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-slate-300" />{metric.label} ({metric.unit})</span>
        <span className="inline-flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-sky-500/70" />Día con dato</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Evolución de ${metric.label} en vista ${period}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = maxValue * (1 - fraction);
          return (
            <g key={fraction}>
              <line
                x1={plot.left}
                x2={width - plot.right}
                y1={plot.top + plotHeight * fraction}
                y2={plot.top + plotHeight * fraction}
                stroke="rgba(148,163,184,0.14)"
                strokeWidth="1"
              />
              <text x={plot.left - 10} y={plot.top + plotHeight * fraction + 4} textAnchor="end" fill="#94a3b8" fontSize="11">{formatMetricValue(value, metric.decimals)}</text>
            </g>
          );
        })}
        {segments.map((points, index) => (
          <polyline
            key={`series-${index}`}
            points={points.join(' ')}
            fill="none"
            stroke="#60a5fa"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {points.map((point, index) => (
          <g
            key={point.key}
            role={onSelect && point.hasData ? 'button' : undefined}
            tabIndex={onSelect && point.hasData ? 0 : undefined}
            className={onSelect && point.hasData ? 'cursor-pointer' : ''}
            onClick={() => point.hasData && onSelect?.(point)}
            onKeyDown={(event) => {
              if (point.hasData && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onSelect?.(point);
              }
            }}
          >
            <title>{point.tooltip}</title>
            {point.hasData ? (
              <circle
                cx={xFor(index)}
                cy={yFor(point.value)}
                r={point.key === selectedKey ? 8 : 5.5}
                fill="#60a5fa"
                stroke="#0f172a"
                strokeWidth={point.key === selectedKey ? 3 : 2}
              />
            ) : null}
            <text x={xFor(index)} y={height - 12} textAnchor="middle" fill={point.key === selectedKey ? '#ffffff' : '#94a3b8'} fontSize={point.axisLabel ? 10 : 0} fontWeight={point.key === selectedKey ? 700 : 500}>
              {point.axisLabel}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export default function LoadEvolutionSection({
  period,
  setPeriod,
  metricKey,
  setMetricKey,
  month,
  setMonth,
  weekStart,
  weekEnd,
  weekLoads,
  monthLoads,
  monthLoading,
  rpeEntries,
  onSelectDate,
  selectedDate,
  mode = 'staff',
  loading = false,
  errorKind = '',
  onRetry,
  weekDate = '',
  setWeekDate,
}) {
  const isPlayer = mode === 'player';
  const metric = getPerformanceLoadMetricConfig(metricKey);
  const range = useMemo(() => {
    if (period === 'month') {
      const [year, monthNumber] = month.split('-').map(Number);
      const lastDay = new Date(year, monthNumber, 0).getDate();
      return {
        startDate: `${month}-01`,
        endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    return { startDate: weekStart, endDate: weekEnd };
  }, [period, month, weekStart, weekEnd]);

  const points = useMemo(() => buildLoadSeries(
    period === 'month' ? monthLoads : weekLoads,
    rpeEntries,
    range.startDate,
    range.endDate,
    metric,
    period,
    mode,
  ), [period, monthLoads, weekLoads, rpeEntries, range.startDate, range.endDate, metric, mode]);

  const summary = summarizePerformanceMetricPoints(points, metric);
  const kpiLabels = isPlayer
    ? getPerformanceMetricKpiLabels(metric, period, mode)
    : getPerformanceMetricKpiLabels(metric, period);

  const monthWeekSummary = useMemo(() => {
    if (period !== 'month') return [];
    const weeks = buildMonthWeekSummary(points, metric);
    const best = weeks
      .filter((week) => week.aggregate !== null)
      .sort((left, right) => right.aggregate - left.aggregate)[0] || null;
    return best ? `${best.label} · ${formatMetricValue(best.aggregate, metric.decimals)} ${metric.unit}` : null;
  }, [period, points, metric]);

  return (
    <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#091428] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.16)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {isPlayer ? (
          <div>
            <h3 className="text-base font-black uppercase tracking-[0.14em] text-cyan-200 sm:text-lg">EVOLUCIÓN DE CARGA DEL EQUIPO</h3>
            <p className="mt-2 text-sm text-slate-400">Consulta cómo evoluciona la carga colectiva de entrenamiento.</p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Evolución de carga</p>
            <h3 className="mt-1 text-lg font-black text-white">{metric.label} del equipo</h3>
            <p className="mt-1 text-sm text-slate-400">Sigue la carga semanal o mensual sin convertir los huecos en cero.</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Periodo</label>
            <div role="group" aria-label="Periodo de carga del equipo" className="mt-2 inline-flex rounded-2xl border border-white/10 bg-black/15 p-1">
              {[
                ['week', 'Semana'],
                ['month', 'Mes'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`${isPlayer ? 'min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ' : ''}rounded-xl px-3 py-2 text-xs font-black transition ${period === value ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Métrica</label>
            <select
              value={metricKey}
              onChange={(event) => setMetricKey(event.target.value)}
              aria-label="Métrica de carga del equipo"
              className={`mt-2 w-full rounded-2xl border border-white/10 bg-[#0b1728] px-3 py-2 text-sm font-black text-white outline-none ${isPlayer ? 'min-h-[44px] focus-visible:ring-2 focus-visible:ring-cyan-300' : ''}`}
            >
              {PERFORMANCE_LOAD_METRIC_CONFIG.map((item) => (
                <option key={item.key} value={item.key} disabled={!item.enabled}>
                  {item.label}{!isPlayer && !item.enabled ? ' (próximamente)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {period === 'month' ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-black/10 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Mes</span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            aria-label="Mes de carga del equipo"
            className={`${isPlayer ? 'min-h-[44px] min-w-0 max-w-full focus-visible:ring-2 focus-visible:ring-cyan-300 ' : ''}rounded-xl border border-white/10 bg-[#0b1728] px-3 py-2 text-sm font-black text-white outline-none`}
          />
        </div>
      ) : isPlayer ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-black/10 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Semana</span>
          <input
            type="date"
            value={weekDate}
            onChange={(event) => setWeekDate?.(event.target.value)}
            aria-label="Semana de carga del equipo"
            className="min-h-[44px] min-w-0 max-w-full rounded-xl border border-white/10 bg-[#0b1728] px-3 py-2 text-sm font-black text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
        </div>
      ) : null}

      {isPlayer && loading ? (
        <div role="status" aria-live="polite" className="mt-5 flex min-h-[280px] animate-pulse items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center text-sm font-bold text-slate-500">
          Cargando la evolución de carga del equipo…
        </div>
      ) : isPlayer && errorKind ? (
        <div className="mt-5 flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-300/[0.04] px-6 text-center">
          <p role="alert" className="text-sm font-bold text-slate-200">No se pudo cargar la evolución de carga del equipo.</p>
          <button type="button" onClick={onRetry} className="mt-4 min-h-[44px] rounded-xl bg-white/10 px-5 py-2.5 text-sm font-black text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Reintentar</button>
        </div>
      ) : <>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-black/10 p-4">
          <p className={`${isPlayer ? 'text-[10px]' : 'text-[8px]'} font-black uppercase tracking-[0.16em] text-slate-500`}>{kpiLabels.aggregate}</p>
          <p className="mt-2 text-2xl font-black text-white">{summary.aggregate === null ? 'Sin datos' : `${formatMetricValue(summary.aggregate, metric.decimals)} ${metric.unit}`}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-black/10 p-4">
          <p className={`${isPlayer ? 'text-[10px]' : 'text-[8px]'} font-black uppercase tracking-[0.16em] text-slate-500`}>{kpiLabels.average}</p>
          <p className="mt-2 text-2xl font-black text-white">{summary.simpleAverage === null ? 'Sin datos' : `${formatMetricValue(summary.simpleAverage, metric.decimals)} ${metric.unit}`}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-black/10 p-4">
          <p className={`${isPlayer ? 'text-[10px]' : 'text-[8px]'} font-black uppercase tracking-[0.16em] text-slate-500`}>{kpiLabels.peak}</p>
          <p className="mt-2 text-sm font-black text-white leading-tight">
            {period === 'week'
              ? (summary.maxPoint ? `${formatShortDate(summary.maxPoint.entryDate)} · ${formatMetricValue(summary.maxPoint.value, metric.decimals)} ${metric.unit}` : 'Sin datos')
              : (monthWeekSummary || 'Sin datos')}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        {period === 'month' && monthLoading ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center text-sm text-slate-500">Cargando la carga mensual…</div>
        ) : (
          <div className={isPlayer ? 'min-w-[34rem] sm:min-w-0' : ''}>
            <LoadEvolutionChart
              points={points}
              selectedKey={selectedDate}
              onSelect={onSelectDate ? (point) => onSelectDate(point.entryDate) : undefined}
              period={period}
              metric={metric}
              mode={mode}
            />
          </div>
        )}
      </div>
      </>}
    </section>
  );
}
