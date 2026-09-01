import { useEffect, useMemo, useState } from 'react';
import {
  loadPlayerPerformancePage,
  loadPlayerPerformanceRange,
} from '../../data/playerPerformanceStore';
import { getRpeWorkloadAvailability } from '../../utils/performanceRpe';
import {
  PLAYER_PERFORMANCE_METRICS,
  buildPlayerActivityByDate,
  buildPlayerCurrentState,
  buildPlayerPerformanceTrend,
  getDefaultPlayerSelectedDate,
  getLocalPlayerDateKey,
  getPlayerCalendarGrid,
  getPlayerMonthBounds,
  getPlayerPerformanceFetchRange,
  getPlayerWeekBounds,
  shiftPlayerPerformanceAnchor,
} from '../../utils/playerPerformancePresentation';
import PlayerLineChart from './PlayerLineChart';
import PlayerPerformanceTrendChart from './PlayerPerformanceTrendChart';

const INITIAL_STATE = { status: 'loading', errorKind: '', wellness: [], rpe: [] };
const INITIAL_RANGE_STATE = { status: 'idle', errorKind: '', wellness: [], rpe: [] };
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#081326]';
const CARD_CLASS = 'min-w-0 rounded-[1.35rem] border border-white/10 bg-[#0b1424]/92 shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const isAvailable = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

const formatDate = (value, compact = false) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'Sin fecha';
  if (!compact) return `${match[3]}/${match[2]}/${match[1]}`;
  return `${match[3]} ${MONTHS[Number(match[2]) - 1].slice(0, 3).toUpperCase()}`;
};

const formatMonth = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
  return match ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : '';
};

const formatPeriod = (period, anchorDate) => {
  if (period === 'month') return formatMonth(anchorDate);
  const { startDate, endDate } = getPlayerWeekBounds(anchorDate);
  return `${formatDate(startDate, true)} – ${formatDate(endDate, true)}`;
};

const formatMetricValue = (value, unit = '') => {
  if (!isAvailable(value)) return '';
  const number = Number(value).toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return unit === 'kg' ? `${number} kg` : `${number}${unit}`;
};

function SectionHeading({ eyebrow, title, description }) {
  return (
    <div>
      {eyebrow ? <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric/80">{eyebrow}</p> : null}
      <h2 className="mt-1 text-lg font-black text-white sm:text-xl">{title}</h2>
      {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{description}</p> : null}
    </div>
  );
}

function WellnessStatusCard({ entry, compact = false }) {
  const metrics = [['Ánimo', entry?.mood], ['Fatiga', entry?.fatigue], ['Dolor', entry?.muscle_soreness], ['Estrés', entry?.stress]];
  const availableMetrics = metrics.filter(([, value]) => isAvailable(value));
  return (
    <article className={`${CARD_CLASS} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Tu estado</p><h3 className="mt-1 text-base font-black text-white">Último Wellness</h3></div>
        <time className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500" dateTime={entry?.entry_date || undefined}>{entry ? formatDate(entry.entry_date, true) : 'Sin datos'}</time>
      </div>
      {entry ? (
        <>
          {availableMetrics.length ? <dl className="mt-4 grid grid-cols-2 divide-x divide-white/10 rounded-2xl border border-white/[0.07] bg-black/15 px-1 py-3 text-center min-[430px]:grid-cols-4">
            {availableMetrics.map(([label, value]) => <div key={label} className="min-w-0 px-1"><dt className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-500 sm:text-[9px]">{label}</dt><dd className="mt-1 text-xl font-black text-white sm:text-2xl">{value}</dd></div>)}
          </dl> : <p className="mt-4 text-sm text-slate-500">Sin indicadores Wellness.</p>}
          {entry.discomfort ? <div className="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[0.045] px-3 py-2.5"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-rose-200/70">Molestias</p><p className={`mt-1 text-sm text-slate-200 ${compact ? 'line-clamp-2' : ''}`}>{entry.discomfort}</p></div> : null}
          {!compact && entry.comment ? <p className="mt-3 border-t border-white/[0.07] pt-3 text-sm leading-6 text-slate-400">{entry.comment}</p> : null}
        </>
      ) : <p className="mt-4 text-sm text-slate-500">Aún no tienes respuestas Wellness.</p>}
    </article>
  );
}

function RpeStatusCard({ entry, compact = false }) {
  const workload = getRpeWorkloadAvailability(entry);
  const hasWorkload = workload.durationMinutes !== null || workload.load !== null;
  return (
    <article className={`${CARD_CLASS} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Último esfuerzo</p><h3 className="mt-1 text-base font-black text-white">RPE</h3></div>
        <time className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500" dateTime={entry?.entry_date || undefined}>{entry ? formatDate(entry.entry_date, true) : 'Sin datos'}</time>
      </div>
      {entry ? (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
            <p className="text-5xl font-black tracking-tight text-white">{isAvailable(entry.rpe) ? entry.rpe : 'Sin datos'}</p>
            {hasWorkload ? <dl className="flex flex-wrap gap-2 pb-1 text-xs font-bold text-slate-300">
              {workload.durationMinutes !== null ? <div className="rounded-xl bg-white/[0.06] px-2.5 py-1.5"><dt className="sr-only">Duración</dt><dd>{workload.durationMinutes} min</dd></div> : null}
              {workload.load !== null ? <div className="rounded-xl bg-white/[0.06] px-2.5 py-1.5"><dt className="sr-only">Carga interna</dt><dd>Carga {workload.load}</dd></div> : null}
            </dl> : null}
          </div>
          {!compact && entry.comment ? <p className="mt-3 border-t border-white/[0.07] pt-3 text-sm leading-6 text-slate-400">{entry.comment}</p> : null}
        </>
      ) : <p className="mt-4 text-sm text-slate-500">Aún no tienes respuestas RPE.</p>}
    </article>
  );
}

function PlayerSpaceDashboard({ wellness, rpe, onOpenPerformance }) {
  const latestWellness = wellness[0] || null;
  const latestRpe = rpe[0] || null;
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid gap-3 md:grid-cols-2"><WellnessStatusCard entry={latestWellness} compact /><RpeStatusCard entry={latestRpe} compact /></div>
      <section className={`${CARD_CLASS} p-4 sm:p-5`}>
        <SectionHeading eyebrow="Tus últimos registros" title="Evolución reciente" />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-white">Ánimo</p>{latestWellness && isAvailable(latestWellness.mood) ? <span className="text-lg font-black text-emerald-300">{latestWellness.mood}</span> : null}</div><PlayerLineChart entries={wellness} field="mood" label="Ánimo" color="#34d399" limit={7} compact /></div>
          <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-white">RPE</p>{latestRpe && isAvailable(latestRpe.rpe) ? <span className="text-lg font-black text-violet-300">{latestRpe.rpe}</span> : null}</div><PlayerLineChart entries={rpe} field="rpe" label="RPE" color="#c084fc" limit={7} compact /></div>
        </div>
        <button type="button" onClick={onOpenPerformance} className={`mt-3 inline-flex min-h-[46px] w-full items-center justify-between rounded-2xl border border-caudal-electric/25 bg-caudal-electric/[0.09] px-4 py-2.5 text-sm font-black text-white transition hover:border-caudal-electric/45 hover:bg-caudal-electric/[0.14] ${FOCUS_RING}`}>Ver Mi rendimiento completo<span aria-hidden="true" className="text-lg text-caudal-electric">→</span></button>
      </section>
    </div>
  );
}

function AvailableFields({ fields, className = '' }) {
  const visible = fields.filter((field) => field.value !== '');
  if (!visible.length) return null;
  return (
    <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 min-[430px]:grid-cols-3 ${className}`}>
      {visible.map((field) => (
        <div key={field.label} className="min-w-0 border-l border-white/10 pl-3">
          <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">{field.label}</dt>
          <dd className="mt-1 break-words text-sm font-black text-white sm:text-base">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CurrentState({ wellness, rpe, today }) {
  const { latestWellness, latestRpe, todayWellness, todayRpe, latestDate, hasRecords } = buildPlayerCurrentState(wellness, rpe, today);
  const wellnessFields = [
    { label: 'Calidad del sueño', value: formatMetricValue(latestWellness?.sleep_quality, '/10') },
    { label: 'Horas de sueño', value: isAvailable(latestWellness?.sleep_hours) ? `${latestWellness.sleep_hours} h` : '' },
    { label: 'Fatiga', value: formatMetricValue(latestWellness?.fatigue, '/10') },
    { label: 'Dolor muscular', value: formatMetricValue(latestWellness?.muscle_soreness, '/10') },
    { label: 'Estrés', value: formatMetricValue(latestWellness?.stress, '/10') },
    { label: 'Ánimo', value: formatMetricValue(latestWellness?.mood, '/10') },
    { label: 'Peso', value: formatMetricValue(latestWellness?.weight, 'kg') },
  ];
  const workload = getRpeWorkloadAvailability(latestRpe);

  return (
    <section className={`${CARD_CLASS} p-4 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading eyebrow="Estado actual" title="Tu última información" description="Tus respuestas propias, sin comparaciones con otros jugadores." />
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{latestDate ? `Última respuesta · ${formatDate(latestDate, true)}` : 'Sin registros todavía'}</p>
      </div>

      {!hasRecords ? <p className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">Todavía no tienes registros suficientes.</p> : (
        <>
          {(!todayWellness || !todayRpe) ? <div className="mt-4 space-y-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3 text-xs text-slate-300" role="status">
            {!todayWellness ? <p>Aún no has registrado el Wellness de hoy.{latestWellness ? ` Último disponible: ${formatDate(latestWellness.entry_date)}.` : ''}</p> : null}
            {!todayRpe ? <p>Aún no has registrado el RPE de hoy.{latestRpe ? ` Último disponible: ${formatDate(latestRpe.entry_date)}.` : ''}</p> : null}
          </div> : null}

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_0.75fr] lg:divide-x lg:divide-white/10">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black text-white">Wellness</h3>{latestWellness ? <time className="text-[10px] font-bold text-slate-500" dateTime={latestWellness.entry_date}>{formatDate(latestWellness.entry_date)}</time> : null}</div>
              {latestWellness ? <>{isAvailable(latestWellness.health_ratio) ? <div className="mt-3 flex items-end gap-2"><p className="text-4xl font-black text-white">{latestWellness.health_ratio}</p><span className="pb-1 text-sm font-bold text-slate-500">/10</span></div> : null}<AvailableFields fields={wellnessFields} className="mt-4" /></> : <p className="mt-3 text-sm text-slate-500">Sin respuesta de Wellness disponible.</p>}
              {latestWellness?.discomfort ? <div className="mt-4 border-l-2 border-rose-200/50 pl-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-rose-200/80">Molestia indicada</p><p className="mt-1 text-sm leading-5 text-slate-200">{latestWellness.discomfort}</p></div> : null}
              {latestWellness?.comment ? <div className="mt-3 border-l-2 border-slate-600 pl-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Tu comentario</p><p className="mt-1 text-sm leading-5 text-slate-300">{latestWellness.comment}</p></div> : null}
            </div>
            <div className="min-w-0 lg:pl-5">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black text-white">RPE</h3>{latestRpe ? <time className="text-[10px] font-bold text-slate-500" dateTime={latestRpe.entry_date}>{formatDate(latestRpe.entry_date)}</time> : null}</div>
              {latestRpe ? <div className="mt-3"><p className="text-4xl font-black text-white">{isAvailable(latestRpe.rpe) ? latestRpe.rpe : '—'}<span className="ml-1 text-sm text-slate-500">/10</span></p>
                {(workload.durationMinutes !== null || workload.load !== null) ? <p className="mt-2 flex flex-wrap gap-x-3 text-xs font-bold text-slate-400">{workload.durationMinutes !== null ? <span>{workload.durationMinutes} min</span> : null}{workload.load !== null ? <span>Carga interna registrada {workload.load}</span> : null}</p> : null}
                {latestRpe.comment ? <div className="mt-4 border-l-2 border-slate-600 pl-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Tu comentario</p><p className="mt-1 text-sm leading-5 text-slate-300">{latestRpe.comment}</p></div> : null}
              </div> : <p className="mt-3 text-sm text-slate-500">Sin respuesta de RPE disponible.</p>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function PeriodNavigation({ period, anchorDate, onNavigate }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/15 p-1">
      <button type="button" onClick={() => onNavigate(-1)} aria-label={`Ver ${period === 'month' ? 'mes' : 'semana'} anterior`} className={`min-h-[42px] min-w-[42px] rounded-lg text-lg font-black text-slate-300 hover:bg-white/[0.07] ${FOCUS_RING}`}>‹</button>
      <p className="min-w-0 truncate px-1 text-center text-[10px] font-black uppercase tracking-[0.08em] text-slate-300">{formatPeriod(period, anchorDate)}</p>
      <button type="button" onClick={() => onNavigate(1)} aria-label={`Ver ${period === 'month' ? 'mes' : 'semana'} siguiente`} className={`min-h-[42px] min-w-[42px] rounded-lg text-lg font-black text-slate-300 hover:bg-white/[0.07] ${FOCUS_RING}`}>›</button>
    </div>
  );
}

function EvolutionSection({ rangeState, period, onPeriodChange, anchorDate, onAnchorChange, metricKey, onMetricChange }) {
  const bounds = period === 'month' ? getPlayerMonthBounds(anchorDate) : getPlayerWeekBounds(anchorDate);
  const periodWellness = rangeState.wellness.filter((entry) => entry.entry_date >= bounds.startDate && entry.entry_date <= bounds.endDate);
  const periodRpe = rangeState.rpe.filter((entry) => entry.entry_date >= bounds.startDate && entry.entry_date <= bounds.endDate);
  const availableMetrics = PLAYER_PERFORMANCE_METRICS.filter((metric) => (
    buildPlayerPerformanceTrend({ wellness: periodWellness, rpe: periodRpe, metricKey: metric.key, period, anchorDate }).summary
  ));
  const effectiveMetric = availableMetrics.some((metric) => metric.key === metricKey) ? metricKey : availableMetrics[0]?.key || '';
  const model = buildPlayerPerformanceTrend({ wellness: periodWellness, rpe: periodRpe, metricKey: effectiveMetric, period, anchorDate });
  const summary = model.summary;

  useEffect(() => {
    if (effectiveMetric && effectiveMetric !== metricKey) onMetricChange(effectiveMetric);
  }, [effectiveMetric, metricKey, onMetricChange]);

  return (
    <section className={`${CARD_CLASS} p-4 sm:p-6`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeading eyebrow="Tu evolución" title="Una métrica, un periodo" description="Los valores ausentes se mantienen vacíos; no se completan ni se estiman." />
        <div className="flex rounded-xl border border-white/[0.07] bg-black/20 p-1" aria-label="Periodo de evolución">
          {[['week', 'Semana'], ['month', 'Mes']].map(([value, label]) => <button key={value} type="button" onClick={() => onPeriodChange(value)} aria-pressed={period === value} className={`min-h-[42px] rounded-lg px-4 text-xs font-black transition ${period === value ? 'bg-caudal-electric text-[#06101f]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'} ${FOCUS_RING}`}>{label}</button>)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)]">
        <PeriodNavigation period={period} anchorDate={anchorDate} onNavigate={(direction) => onAnchorChange(shiftPlayerPerformanceAnchor(anchorDate, period, direction))} />
        <label className="min-w-0">
          <span className="sr-only">Métrica de la gráfica</span>
          <select value={effectiveMetric} onChange={(event) => onMetricChange(event.target.value)} disabled={!availableMetrics.length || rangeState.status === 'loading'} className={`min-h-[50px] w-full rounded-xl border border-white/[0.09] bg-[#0a1322] px-3 text-sm font-black text-white disabled:opacity-60 ${FOCUS_RING}`}>
            {!availableMetrics.length ? <option value="">Sin métricas disponibles</option> : availableMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/15 p-2 sm:p-4">
        {rangeState.status === 'loading' ? <div className="flex min-h-[230px] items-center justify-center text-sm font-bold text-slate-500" role="status">Cargando el periodo…</div> : <PlayerPerformanceTrendChart model={model} />}
      </div>

      {rangeState.status === 'error' ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.04] px-3 py-2.5"><p role="alert" className="text-xs text-rose-200">No se pudo cargar este periodo.</p><button type="button" onClick={() => onAnchorChange(anchorDate)} className={`min-h-[40px] rounded-lg bg-white/[0.07] px-3 text-xs font-black text-white ${FOCUS_RING}`}>Reintentar</button></div> : null}
      {rangeState.status === 'ready' && summary ? <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/[0.07] pt-4">
        <p className="text-xs text-slate-400"><span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">Media</span><strong className="mt-1 block text-base text-white">{formatMetricValue(summary.average, model.metric.unit)}</strong></p>
        <p className="text-xs text-slate-400"><span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">Último valor</span><strong className="mt-1 block text-base text-white">{formatMetricValue(summary.latest, model.metric.unit)}</strong></p>
        {summary.change !== null ? <p className="text-xs text-slate-400"><span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">Variación</span><strong className="mt-1 block text-base text-white">{summary.change > 0 ? '+' : ''}{formatMetricValue(summary.change, model.metric.unit)}</strong></p> : <p className="self-end text-xs text-slate-500">No hay suficientes registros para ver una tendencia.</p>}
        {model.aggregation === 'weekly_average' ? <p className="w-full text-[10px] leading-4 text-slate-500">Vista mensual agrupada en medias semanales para mantener la gráfica legible.</p> : null}
      </div> : null}
    </section>
  );
}

function CalendarSection({ anchorDate, wellness, rpe, selectedDate, onSelectDate, onMonthChange }) {
  const grid = getPlayerCalendarGrid(anchorDate);
  const month = getPlayerMonthBounds(anchorDate);
  const activity = buildPlayerActivityByDate(wellness, rpe);

  return (
    <section className={`${CARD_CLASS} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <SectionHeading eyebrow="Tus registros" title={formatMonth(anchorDate)} />
        <div className="flex gap-1">
          <button type="button" onClick={() => onMonthChange(-1)} aria-label="Ver mes anterior en el calendario" className={`min-h-[42px] min-w-[42px] rounded-xl border border-white/[0.08] text-lg font-black text-slate-300 hover:bg-white/[0.06] ${FOCUS_RING}`}>‹</button>
          <button type="button" onClick={() => onMonthChange(1)} aria-label="Ver mes siguiente en el calendario" className={`min-h-[42px] min-w-[42px] rounded-xl border border-white/[0.08] text-lg font-black text-slate-300 hover:bg-white/[0.06] ${FOCUS_RING}`}>›</button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1" role="grid" aria-label={`Actividad de ${formatMonth(anchorDate)}`}>
        {WEEKDAYS.map((day) => <span key={day} role="columnheader" className="pb-1 text-center text-[9px] font-black text-slate-600">{day}</span>)}
        {grid.map((date) => {
          const inMonth = date >= month.startDate && date <= month.endDate;
          const day = Number(date.slice(-2));
          const record = activity.get(date);
          if (!inMonth) return <span key={date} role="gridcell" aria-hidden="true" className="min-h-[54px]" />;
          if (!record) return <span key={date} role="gridcell" aria-label={`${formatDate(date)}, sin registro`} className="flex min-h-[54px] flex-col items-center justify-center rounded-xl text-[11px] font-bold text-slate-600"><span>{day}</span><span aria-hidden="true" className="mt-1 text-[9px]">○</span></span>;
          const responseLabel = record.wellness && record.rpe ? 'Wellness y RPE' : record.wellness ? 'Wellness' : 'RPE';
          return (
            <button key={date} type="button" role="gridcell" onClick={() => onSelectDate(date)} aria-pressed={selectedDate === date} aria-label={`${formatDate(date)}, ${responseLabel}${record.hasDiscomfort ? ', molestia indicada' : ''}`} className={`relative flex min-h-[54px] min-w-0 flex-col items-center justify-center rounded-xl border px-0.5 text-[11px] font-black transition ${selectedDate === date ? 'border-caudal-electric bg-caudal-electric/[0.12] text-white' : 'border-white/[0.07] bg-white/[0.035] text-slate-300 hover:bg-white/[0.07]'} ${FOCUS_RING}`}>
              <span>{day}</span>
              <span aria-hidden="true" className="mt-1 text-[8px] tracking-tight text-caudal-electric">{record.wellness && record.rpe ? 'W+R' : record.wellness ? 'W' : 'R'}</span>
              {record.hasDiscomfort ? <span aria-hidden="true" className="absolute right-1 top-0.5 text-[10px] text-rose-200">△</span> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/[0.07] pt-3 text-[10px] font-bold text-slate-400" aria-label="Leyenda del calendario">
        <span><b className="text-caudal-electric">W</b> Wellness</span><span><b className="text-violet-300">R</b> RPE</span><span><b className="text-caudal-electric">W+R</b> Ambos</span><span><b className="text-rose-200">△</b> Molestia</span><span><b className="text-slate-600">○</b> Sin registro</span>
      </div>
    </section>
  );
}

function DayDetail({ selectedDate, wellness, rpe }) {
  const activity = buildPlayerActivityByDate(wellness, rpe).get(selectedDate) || null;
  const wellnessEntry = activity?.wellness || null;
  const rpeEntry = activity?.rpe || null;
  const workload = getRpeWorkloadAvailability(rpeEntry);
  const wellnessFields = [
    { label: 'Wellness', value: formatMetricValue(wellnessEntry?.health_ratio, '/10') },
    { label: 'Calidad del sueño', value: formatMetricValue(wellnessEntry?.sleep_quality, '/10') },
    { label: 'Horas de sueño', value: isAvailable(wellnessEntry?.sleep_hours) ? `${wellnessEntry.sleep_hours} h` : '' },
    { label: 'Fatiga', value: formatMetricValue(wellnessEntry?.fatigue, '/10') },
    { label: 'Dolor muscular', value: formatMetricValue(wellnessEntry?.muscle_soreness, '/10') },
    { label: 'Estrés', value: formatMetricValue(wellnessEntry?.stress, '/10') },
    { label: 'Ánimo', value: formatMetricValue(wellnessEntry?.mood, '/10') },
    { label: 'Peso', value: formatMetricValue(wellnessEntry?.weight, 'kg') },
  ];

  return (
    <section className={`${CARD_CLASS} p-4 sm:p-5`}>
      <SectionHeading eyebrow="Detalle del día" title={selectedDate ? formatDate(selectedDate) : 'Elige un registro'} description={selectedDate ? 'Solo se muestran los campos que respondiste ese día.' : 'Pulsa un día con W o R en el calendario.'} />
      {selectedDate ? <div className="mt-5 space-y-5">
        <div>
          <h3 className="text-sm font-black text-white">Wellness</h3>
          {wellnessEntry ? <>
            <AvailableFields fields={wellnessFields} className="mt-3" />
            {wellnessEntry.discomfort ? <div className="mt-4 border-l-2 border-rose-200/50 pl-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-rose-200/80">Molestia indicada</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-200">{wellnessEntry.discomfort}</p></div> : null}
            {wellnessEntry.comment ? <div className="mt-3 border-l-2 border-slate-600 pl-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Tu comentario</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-300">{wellnessEntry.comment}</p></div> : null}
          </> : <p className="mt-2 text-xs text-slate-500">Wellness — Sin respuesta</p>}
        </div>
        <div className="border-t border-white/[0.07] pt-5">
          <h3 className="text-sm font-black text-white">RPE</h3>
          {rpeEntry ? <>
            <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2"><p className="text-3xl font-black text-white">{isAvailable(rpeEntry.rpe) ? rpeEntry.rpe : '—'}<span className="ml-1 text-xs text-slate-500">/10</span></p><p className="flex flex-wrap gap-x-3 pb-1 text-xs font-bold text-slate-400">{workload.durationMinutes !== null ? <span>{workload.durationMinutes} min</span> : null}{workload.load !== null ? <span>Carga interna registrada {workload.load}</span> : null}</p></div>
            {rpeEntry.comment ? <div className="mt-3 border-l-2 border-slate-600 pl-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Tu comentario</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-300">{rpeEntry.comment}</p></div> : null}
          </> : <p className="mt-2 text-xs text-slate-500">RPE — Sin respuesta</p>}
        </div>
      </div> : null}
    </section>
  );
}

function PlayerPerformanceView({ state, rangeState, period, setPeriod, anchorDate, setAnchorDate, metricKey, setMetricKey, selectedDate, setSelectedDate }) {
  const today = getLocalPlayerDateKey();
  return (
    <div className="space-y-3 sm:space-y-4">
      <CurrentState wellness={state.wellness} rpe={state.rpe} today={today} />
      <EvolutionSection rangeState={rangeState} period={period} onPeriodChange={setPeriod} anchorDate={anchorDate} onAnchorChange={setAnchorDate} metricKey={metricKey} onMetricChange={setMetricKey} />
      <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <CalendarSection anchorDate={anchorDate} wellness={rangeState.wellness} rpe={rangeState.rpe} selectedDate={selectedDate} onSelectDate={setSelectedDate} onMonthChange={(direction) => setAnchorDate(shiftPlayerPerformanceAnchor(anchorDate, 'month', direction))} />
        <DayDetail selectedDate={selectedDate} wellness={rangeState.wellness} rpe={rangeState.rpe} />
      </div>
    </div>
  );
}

export default function PlayerPerformancePanel({ client, view = 'performance', onOpenPerformance }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [rangeState, setRangeState] = useState(INITIAL_RANGE_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const [rangeReloadToken, setRangeReloadToken] = useState(0);
  const [period, setPeriod] = useState('week');
  const [anchorDate, setAnchorDateValue] = useState(() => getLocalPlayerDateKey());
  const [metricKey, setMetricKey] = useState('rpe');
  const [selectedDate, setSelectedDate] = useState('');
  const fetchRange = useMemo(() => getPlayerPerformanceFetchRange(anchorDate), [anchorDate]);
  const setAnchorDate = (nextDate) => {
    if (nextDate === anchorDate) setRangeReloadToken((current) => current + 1);
    else setAnchorDateValue(nextDate);
  };

  useEffect(() => {
    let cancelled = false;
    setState(INITIAL_STATE);
    loadPlayerPerformancePage(client).then((result) => {
      if (!cancelled) setState({ status: 'ready', errorKind: '', wellness: result.wellness.rows, rpe: result.rpe.rows });
    }).catch((error) => {
      if (!cancelled) setState({ ...INITIAL_STATE, status: 'error', errorKind: error?.kind === 'invalid_session' ? 'invalid_session' : 'network' });
    });
    return () => { cancelled = true; };
  }, [client, reloadToken]);

  useEffect(() => {
    if (view !== 'performance') return undefined;
    let cancelled = false;
    setRangeState((current) => ({ ...current, status: 'loading', errorKind: '' }));
    loadPlayerPerformanceRange(client, fetchRange).then((result) => {
      if (cancelled) return;
      setRangeState({ status: 'ready', errorKind: '', wellness: result.wellness, rpe: result.rpe });
      const activity = buildPlayerActivityByDate(result.wellness, result.rpe);
      const month = getPlayerMonthBounds(anchorDate);
      setSelectedDate((current) => activity.has(current) && current >= month.startDate && current <= month.endDate
        ? current
        : getDefaultPlayerSelectedDate(result.wellness, result.rpe, anchorDate, getLocalPlayerDateKey()));
    }).catch((error) => {
      if (!cancelled) setRangeState({ ...INITIAL_RANGE_STATE, status: 'error', errorKind: error?.kind === 'invalid_session' ? 'invalid_session' : 'network' });
    });
    return () => { cancelled = true; };
  }, [anchorDate, client, fetchRange, rangeReloadToken, view]);

  if (state.status === 'loading') return <div role="status" aria-live="polite" className="grid gap-3 sm:grid-cols-2">{['Wellness', 'RPE'].map((label) => <div key={label} className={`${CARD_CLASS} min-h-32 animate-pulse px-5 py-10 text-center text-xs font-black uppercase tracking-[0.18em] text-slate-500`}>Cargando {label}…</div>)}</div>;
  if (state.status === 'error') return <div className={`${CARD_CLASS} px-5 py-8 text-center`}><h2 className="text-lg font-black text-white">{state.errorKind === 'invalid_session' ? 'Tu sesión ya no es válida' : 'No se pudo cargar tu rendimiento'}</h2><p role="alert" className="mt-2 text-sm text-slate-400">{state.errorKind === 'invalid_session' ? 'Cierra sesión y vuelve a identificarte.' : 'Comprueba tu conexión y vuelve a intentarlo.'}</p><button type="button" onClick={() => setReloadToken((current) => current + 1)} className={`mt-5 min-h-[46px] rounded-xl bg-white/10 px-5 py-2.5 text-sm font-black text-white hover:bg-white/15 ${FOCUS_RING}`}>Reintentar</button></div>;
  if (view === 'space') return <PlayerSpaceDashboard wellness={state.wellness} rpe={state.rpe} onOpenPerformance={onOpenPerformance} />;
  return <PlayerPerformanceView state={state} rangeState={rangeState} period={period} setPeriod={setPeriod} anchorDate={anchorDate} setAnchorDate={setAnchorDate} metricKey={metricKey} setMetricKey={setMetricKey} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />;
}
