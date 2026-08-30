import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PLAYER_PERFORMANCE_PAGE_SIZE,
  appendUniquePlayerEntries,
  loadPlayerPerformancePage,
  loadPlayerRpePage,
  loadPlayerWellnessPage,
} from '../../data/playerPerformanceStore';
import { getRpeWorkloadAvailability } from '../../utils/performanceRpe';
import { getLatestPlayerUpdateDate } from '../../utils/playerPerformancePresentation';
import PlayerLineChart from './PlayerLineChart';

const INITIAL_STATE = {
  status: 'loading', errorKind: '', wellness: [], rpe: [],
  wellnessHasMore: false, rpeHasMore: false, wellnessOffset: 0, rpeOffset: 0,
  wellnessLoadingMore: false, rpeLoadingMore: false,
  wellnessLoadMoreError: '', rpeLoadMoreError: '',
};

const WELLNESS_METRICS = [
  { field: 'mood', label: 'Ánimo', color: '#34d399' },
  { field: 'fatigue', label: 'Fatiga', color: '#38bdf8' },
  { field: 'muscle_soreness', label: 'Dolor', color: '#fb7185' },
  { field: 'stress', label: 'Estrés', color: '#fbbf24' },
];

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#081326]';
const CARD_CLASS = 'min-w-0 rounded-[1.35rem] border border-white/10 bg-[#0b1424]/92 shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
const isAvailable = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

const formatDate = (value, compact = false) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'Sin fecha';
  if (!compact) return `${match[3]}/${match[2]}/${match[1]}`;
  const month = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][Number(match[2]) - 1];
  return `${match[3]} ${month}`;
};

function SectionHeading({ eyebrow, title }) {
  return (
    <div>
      {eyebrow ? <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric/80">{eyebrow}</p> : null}
      <h2 className="mt-1 text-lg font-black text-white sm:text-xl">{title}</h2>
    </div>
  );
}

function WellnessStatusCard({ entry, compact = false }) {
  const metrics = [['Ánimo', entry?.mood], ['Fatiga', entry?.fatigue], ['Dolor', entry?.muscle_soreness], ['Estrés', entry?.stress]];
  return (
    <article className={`${CARD_CLASS} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Tu estado</p><h3 className="mt-1 text-base font-black text-white">Último Wellness</h3></div>
        <time className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500" dateTime={entry?.entry_date || undefined}>{entry ? formatDate(entry.entry_date, true) : 'Sin datos'}</time>
      </div>
      {entry ? (
        <>
          <dl className="mt-4 grid grid-cols-4 divide-x divide-white/10 rounded-2xl border border-white/[0.07] bg-black/15 px-1 py-3 text-center">
            {metrics.map(([label, value]) => <div key={label} className="min-w-0 px-1"><dt className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-500 sm:text-[9px]">{label}</dt><dd className="mt-1 text-xl font-black text-white sm:text-2xl">{isAvailable(value) ? value : '—'}</dd></div>)}
          </dl>
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
            <p className="text-5xl font-black tracking-tight text-white">{isAvailable(entry.rpe) ? entry.rpe : '—'}</p>
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

function PerformanceSummary({ wellness, rpe }) {
  const latestWellness = wellness[0] || null;
  const latestRpe = rpe[0] || null;
  const latestDate = getLatestPlayerUpdateDate(wellness, rpe);
  const indicators = [['Ánimo', latestWellness?.mood, 'text-emerald-300'], ['Fatiga', latestWellness?.fatigue, 'text-sky-300'], ['Dolor', latestWellness?.muscle_soreness, 'text-rose-300'], ['RPE', latestRpe?.rpe, 'text-violet-300']];
  return (
    <section className={`${CARD_CLASS} p-3.5 sm:p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric/80">Resumen de rendimiento</p><p className="text-[10px] font-bold text-slate-500">Actualizado {latestDate ? formatDate(latestDate, true) : 'sin datos'}</p></div>
      <dl className="mt-3 grid grid-cols-4 divide-x divide-white/10">{indicators.map(([label, value, color]) => <div key={label} className="min-w-0 px-1.5 text-center sm:px-3"><dt className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-500 sm:text-[9px]">{label}</dt><dd className={`mt-1 text-xl font-black sm:text-2xl ${color}`}>{isAvailable(value) ? value : '—'}</dd></div>)}</dl>
    </section>
  );
}

function ChartCard({ title, subtitle, children, controls }) {
  return <section className={`${CARD_CLASS} p-4 sm:p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-black text-white sm:text-lg">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>{controls}</div><div className="mt-3">{children}</div></section>;
}

function WellnessHistoryEntry({ entry }) {
  const hasDetails = Boolean(entry.discomfort || entry.comment);
  const summary = <div className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-center gap-3 sm:grid-cols-[5rem_1fr]"><time className="text-xs font-black uppercase text-white" dateTime={entry.entry_date}>{formatDate(entry.entry_date, true)}</time><p className="min-w-0 text-xs font-semibold leading-5 text-slate-300 sm:text-sm">Ánimo {isAvailable(entry.mood) ? entry.mood : '—'} <span className="text-slate-600">·</span> Fatiga {isAvailable(entry.fatigue) ? entry.fatigue : '—'} <span className="text-slate-600">·</span> Dolor {isAvailable(entry.muscle_soreness) ? entry.muscle_soreness : '—'}</p></div>;
  if (!hasDetails) return <li className="px-1 py-3">{summary}</li>;
  return <li><details className="group px-1 py-3"><summary className={`flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-xl ${FOCUS_RING}`}>{summary}<span aria-hidden="true" className="shrink-0 text-slate-500 transition group-open:rotate-180">⌄</span></summary><div className="ml-0 mt-2 grid gap-2 border-l-2 border-caudal-electric/20 pl-3 sm:ml-20">{entry.discomfort ? <p className="text-sm leading-5 text-slate-300"><span className="font-black text-rose-200">Molestias:</span> {entry.discomfort}</p> : null}{entry.comment ? <p className="text-sm leading-5 text-slate-400"><span className="font-black text-slate-300">Comentario:</span> {entry.comment}</p> : null}</div></details></li>;
}

function RpeHistoryEntry({ entry }) {
  const workload = getRpeWorkloadAvailability(entry);
  return <li className="px-1 py-3"><div className="flex min-h-[44px] items-center justify-between gap-3"><div className="min-w-0"><time className="text-xs font-black uppercase text-white" dateTime={entry.entry_date}>{formatDate(entry.entry_date, true)}</time>{entry.comment ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{entry.comment}</p> : null}{workload.durationMinutes !== null || workload.load !== null ? <p className="mt-1 flex flex-wrap gap-x-3 text-[10px] font-bold text-slate-500">{workload.durationMinutes !== null ? <span>{workload.durationMinutes} min</span> : null}{workload.load !== null ? <span>Carga {workload.load}</span> : null}</p> : null}</div><p className="shrink-0 text-xl font-black text-violet-300">RPE {isAvailable(entry.rpe) ? entry.rpe : '—'}</p></div></li>;
}

function HistorySection({ type, entries, hasMore, loadingMore, error, onLoadMore }) {
  const isWellness = type === 'wellness';
  const title = isWellness ? 'Histórico Wellness' : 'Histórico RPE';
  const sectionId = `player-${type}-history`;
  return (
    <section id={sectionId} className={`${CARD_CLASS} p-4 sm:p-5`}>
      <SectionHeading eyebrow="Respuestas cargadas" title={title} />
      {entries.length ? <ol className="mt-2 divide-y divide-white/[0.07]">{entries.map((entry) => isWellness ? <WellnessHistoryEntry key={entry.id} entry={entry} /> : <RpeHistoryEntry key={entry.id} entry={entry} />)}</ol> : <p className="mt-3 text-sm text-slate-500">Sin respuestas {isWellness ? 'Wellness' : 'RPE'}.</p>}
      {hasMore ? <button type="button" onClick={onLoadMore} disabled={loadingMore} aria-controls={sectionId} className={`mt-3 min-h-[46px] w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-xs font-black text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}>{loadingMore ? `Cargando ${isWellness ? 'Wellness' : 'RPE'}…` : `Ver ${PLAYER_PERFORMANCE_PAGE_SIZE} registros más`}</button> : null}
      {error ? <p role="alert" className="mt-3 text-xs font-semibold text-rose-300">{error === 'invalid_session' ? 'Tu sesión ha caducado. Vuelve a identificarte.' : 'No se pudo ampliar el histórico. Lo ya cargado sigue disponible.'}</p> : null}
    </section>
  );
}

function PlayerPerformanceView({ state, chartLimit, onChartLimitChange, wellnessMetric, onWellnessMetricChange, loadMoreWellness, loadMoreRpe }) {
  const metric = WELLNESS_METRICS.find((item) => item.field === wellnessMetric) || WELLNESS_METRICS[0];
  const resolvedLimit = chartLimit === 'all' ? Math.max(state.wellness.length, state.rpe.length, 1) : 7;
  return (
    <div className="space-y-3 sm:space-y-4">
      <PerformanceSummary wellness={state.wellness} rpe={state.rpe} />
      <div className="flex items-center justify-between gap-3 px-1"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Vista de gráficas</p><div className="flex rounded-xl border border-white/[0.07] bg-black/20 p-1" aria-label="Cantidad de registros en las gráficas">{[['recent', '7 últimos'], ['all', 'Todo cargado']].map(([value, label]) => <button key={value} type="button" onClick={() => onChartLimitChange(value)} aria-pressed={chartLimit === value} className={`min-h-[38px] rounded-lg px-2.5 text-[10px] font-black transition ${FOCUS_RING} ${chartLimit === value ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200'}`}>{label}</button>)}</div></div>
      <ChartCard title="Evolución Wellness" subtitle="Escala 1–10 · solo respuestas registradas" controls={<div className="flex max-w-full flex-wrap gap-1" aria-label="Métrica Wellness">{WELLNESS_METRICS.map((item) => <button key={item.field} type="button" onClick={() => onWellnessMetricChange(item.field)} aria-pressed={wellnessMetric === item.field} className={`min-h-[38px] rounded-xl px-2.5 text-[10px] font-black transition ${FOCUS_RING} ${wellnessMetric === item.field ? 'bg-caudal-electric text-slate-950' : 'bg-white/[0.05] text-slate-400 hover:text-white'}`}>{item.label}</button>)}</div>}><PlayerLineChart entries={state.wellness} field={metric.field} label={metric.label} color={metric.color} limit={resolvedLimit} /></ChartCard>
      <ChartCard title="Evolución RPE" subtitle="Escala 1–10 · solo respuestas registradas"><PlayerLineChart entries={state.rpe} field="rpe" label="RPE" color="#c084fc" limit={resolvedLimit} /></ChartCard>
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start"><HistorySection type="wellness" entries={state.wellness} hasMore={state.wellnessHasMore} loadingMore={state.wellnessLoadingMore} error={state.wellnessLoadMoreError} onLoadMore={loadMoreWellness} /><HistorySection type="rpe" entries={state.rpe} hasMore={state.rpeHasMore} loadingMore={state.rpeLoadingMore} error={state.rpeLoadMoreError} onLoadMore={loadMoreRpe} /></div>
    </div>
  );
}

export default function PlayerPerformancePanel({ client, view = 'performance', onOpenPerformance }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const [wellnessMetric, setWellnessMetric] = useState('mood');
  const [chartLimit, setChartLimit] = useState('recent');
  const mountedRef = useRef(false);
  const wellnessRequestInFlightRef = useRef(false);
  const rpeRequestInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    wellnessRequestInFlightRef.current = false;
    rpeRequestInFlightRef.current = false;
    setState(INITIAL_STATE);
    loadPlayerPerformancePage(client).then((result) => {
      if (cancelled) return;
      setState({ status: 'ready', errorKind: '', wellness: result.wellness.rows, rpe: result.rpe.rows, wellnessHasMore: result.wellness.hasMore, rpeHasMore: result.rpe.hasMore, wellnessOffset: result.wellness.nextOffset, rpeOffset: result.rpe.nextOffset, wellnessLoadingMore: false, rpeLoadingMore: false, wellnessLoadMoreError: '', rpeLoadMoreError: '' });
    }).catch((error) => { if (!cancelled) setState({ ...INITIAL_STATE, status: 'error', errorKind: error?.kind === 'invalid_session' ? 'invalid_session' : 'network' }); });
    return () => { cancelled = true; mountedRef.current = false; };
  }, [client, reloadToken]);

  const loadMoreWellness = useCallback(async () => {
    if (wellnessRequestInFlightRef.current || !state.wellnessHasMore) return;
    wellnessRequestInFlightRef.current = true;
    setState((current) => ({ ...current, wellnessLoadingMore: true, wellnessLoadMoreError: '' }));
    try {
      const page = await loadPlayerWellnessPage(client, { offset: state.wellnessOffset });
      if (!mountedRef.current) return;
      setState((current) => ({ ...current, wellness: appendUniquePlayerEntries(current.wellness, page.rows), wellnessHasMore: page.hasMore, wellnessOffset: page.nextOffset, wellnessLoadingMore: false, wellnessLoadMoreError: '' }));
    } catch (error) {
      if (mountedRef.current) setState((current) => ({ ...current, wellnessLoadingMore: false, wellnessLoadMoreError: error?.kind === 'invalid_session' ? 'invalid_session' : 'network' }));
    } finally { wellnessRequestInFlightRef.current = false; }
  }, [client, state.wellnessHasMore, state.wellnessOffset]);

  const loadMoreRpe = useCallback(async () => {
    if (rpeRequestInFlightRef.current || !state.rpeHasMore) return;
    rpeRequestInFlightRef.current = true;
    setState((current) => ({ ...current, rpeLoadingMore: true, rpeLoadMoreError: '' }));
    try {
      const page = await loadPlayerRpePage(client, { offset: state.rpeOffset });
      if (!mountedRef.current) return;
      setState((current) => ({ ...current, rpe: appendUniquePlayerEntries(current.rpe, page.rows), rpeHasMore: page.hasMore, rpeOffset: page.nextOffset, rpeLoadingMore: false, rpeLoadMoreError: '' }));
    } catch (error) {
      if (mountedRef.current) setState((current) => ({ ...current, rpeLoadingMore: false, rpeLoadMoreError: error?.kind === 'invalid_session' ? 'invalid_session' : 'network' }));
    } finally { rpeRequestInFlightRef.current = false; }
  }, [client, state.rpeHasMore, state.rpeOffset]);

  if (state.status === 'loading') return <div role="status" aria-live="polite" className="grid gap-3 sm:grid-cols-2">{['Wellness', 'RPE'].map((label) => <div key={label} className={`${CARD_CLASS} min-h-32 animate-pulse px-5 py-10 text-center text-xs font-black uppercase tracking-[0.18em] text-slate-500`}>Cargando {label}…</div>)}</div>;
  if (state.status === 'error') return <div className={`${CARD_CLASS} px-5 py-8 text-center`}><h2 className="text-lg font-black text-white">{state.errorKind === 'invalid_session' ? 'Tu sesión ya no es válida' : 'No se pudo cargar tu rendimiento'}</h2><p role="alert" className="mt-2 text-sm text-slate-400">{state.errorKind === 'invalid_session' ? 'Cierra sesión y vuelve a identificarte.' : 'Comprueba tu conexión y vuelve a intentarlo.'}</p><button type="button" onClick={() => setReloadToken((current) => current + 1)} className={`mt-5 min-h-[46px] rounded-xl bg-white/10 px-5 py-2.5 text-sm font-black text-white hover:bg-white/15 ${FOCUS_RING}`}>Reintentar</button></div>;
  if (view === 'space') return <PlayerSpaceDashboard wellness={state.wellness} rpe={state.rpe} onOpenPerformance={onOpenPerformance} />;
  return <PlayerPerformanceView state={state} chartLimit={chartLimit} onChartLimitChange={setChartLimit} wellnessMetric={wellnessMetric} onWellnessMetricChange={setWellnessMetric} loadMoreWellness={loadMoreWellness} loadMoreRpe={loadMoreRpe} />;
}
