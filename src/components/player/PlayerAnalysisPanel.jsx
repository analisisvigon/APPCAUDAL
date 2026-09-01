import { useCallback, useEffect, useRef, useState } from 'react';
import AccordionSection from '../shared/AccordionSection';
import {
  PLAYER_ANALYSIS_DEFAULT_FILTERS,
  PLAYER_ANALYSIS_PAGE_SIZE,
  appendUniquePlayerHistory,
  loadPlayerAnalysisLiveStats,
  loadPlayerAnalysisOverview,
  loadPlayerMatchHistoryPage,
  loadPlayerProductionActions,
} from '../../data/playerAnalysisStore';
import {
  PLAYER_ANALYSIS_COMPETITION_OPTIONS,
  PLAYER_ANALYSIS_PARTIAL_NOTE,
  PLAYER_ANALYSIS_VENUE_OPTIONS,
  PLAYER_ANALYSIS_WINDOW_OPTIONS,
  buildPlayerAnalysisOverviewPresentation,
} from '../../utils/playerAnalysisPresentation';
import {
  PLAYER_ANALYSIS_CARD,
  PLAYER_ANALYSIS_FOCUS,
  PlayerAnalysisEmpty,
  PlayerAnalysisError,
  PlayerAnalysisLoading,
  PlayerAnalysisSectionHeader,
} from './PlayerAnalysisDomainState';
import PlayerAnalysisHistory from './PlayerAnalysisHistory';
import PlayerAnalysisProduction from './PlayerAnalysisProduction';

const initialDomainState = { status: 'loading', data: null, errorKind: '' };
const initialHistoryState = {
  status: 'loading',
  rows: [],
  errorKind: '',
  nextOffset: 0,
  hasMore: false,
  loadingMore: false,
};
const numberFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const ratioFormatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatMetric = (value) => numberFormatter.format(Number(value) || 0);
const formatRatio = (value) => ratioFormatter.format(Number(value) || 0);

function usePlayerAnalysisDomain(loader, dependencies) {
  const [state, setState] = useState(initialDomainState);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(initialDomainState);
    loader()
      .then((data) => {
        if (!cancelled) setState({ status: data === null ? 'empty' : 'ready', data, errorKind: '' });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, errorKind: error?.kind || 'network' });
      });
    return () => { cancelled = true; };
  // The caller supplies the exact primitive filter dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, retryToken]);

  return [state, () => setRetryToken((current) => current + 1)];
}

function usePlayerAnalysisHistory(client, competitionScope, venue) {
  const [state, setState] = useState(initialHistoryState);
  const [retryToken, setRetryToken] = useState(0);
  const requestInFlightRef = useRef(false);
  const generationRef = useRef(0);
  const nextOffsetRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestInFlightRef.current = true;
    nextOffsetRef.current = 0;
    setState(initialHistoryState);

    loadPlayerMatchHistoryPage(
      client,
      { competitionScope, venue },
      { limit: PLAYER_ANALYSIS_PAGE_SIZE, offset: 0 },
    )
      .then((page) => {
        if (cancelled || generationRef.current !== generation) return;
        nextOffsetRef.current = page.nextOffset;
        setState({
          status: 'ready',
          rows: page.rows,
          errorKind: '',
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
          loadingMore: false,
        });
      })
      .catch((error) => {
        if (cancelled || generationRef.current !== generation) return;
        setState({ ...initialHistoryState, status: 'error', errorKind: error?.kind || 'network' });
      })
      .finally(() => {
        if (!cancelled && generationRef.current === generation) requestInFlightRef.current = false;
      });

    return () => {
      cancelled = true;
      if (generationRef.current === generation) requestInFlightRef.current = false;
    };
  }, [client, competitionScope, venue, retryToken]);

  const loadMore = useCallback(async () => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const generation = generationRef.current;
    const offset = nextOffsetRef.current;
    setState((current) => ({ ...current, status: 'ready', loadingMore: true, errorKind: '' }));
    try {
      const page = await loadPlayerMatchHistoryPage(
        client,
        { competitionScope, venue },
        { limit: PLAYER_ANALYSIS_PAGE_SIZE, offset },
      );
      if (generationRef.current !== generation) return;
      nextOffsetRef.current = page.nextOffset;
      setState((current) => ({
        ...current,
        status: 'ready',
        rows: appendUniquePlayerHistory(current.rows, page.rows),
        errorKind: '',
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
        loadingMore: false,
      }));
    } catch (error) {
      if (generationRef.current !== generation) return;
      setState((current) => ({
        ...current,
        status: 'error',
        errorKind: error?.kind || 'network',
        loadingMore: false,
      }));
    } finally {
      if (generationRef.current === generation) requestInFlightRef.current = false;
    }
  }, [client, competitionScope, venue]);

  const retry = useCallback(() => {
    if (state.rows.length) loadMore();
    else setRetryToken((current) => current + 1);
  }, [loadMore, state.rows.length]);

  return [state, retry, loadMore];
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="min-w-0 flex-1 sm:flex-none">
      <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`min-h-[44px] w-full rounded-xl border border-white/10 bg-[#081326] px-3 text-xs font-black text-white sm:w-44 ${PLAYER_ANALYSIS_FOCUS}`}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function CoverageNote({ visible }) {
  if (!visible) return null;
  return <p className="mt-1.5 text-[9px] font-bold leading-4 text-amber-100/70">{PLAYER_ANALYSIS_PARTIAL_NOTE}</p>;
}

function DenseMetric({ label, value, detail = '', tone = 'text-white', partial = false, suffix = '' }) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-2.5 sm:p-3">
      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500 sm:text-[9px]">{label}</p>
      <p className={`mt-0.5 text-xl font-black tracking-tight sm:text-2xl ${tone}`}>{formatMetric(value)}{suffix}</p>
      {detail ? <p className="mt-0.5 text-[10px] font-semibold leading-4 text-slate-500">{detail}</p> : null}
      <CoverageNote visible={partial} />
    </article>
  );
}

function ProductionMetricRow({ label, total, per90, partial = false }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-white/[0.07] py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-200">{label}</p>
        <CoverageNote visible={partial} />
      </div>
      <strong className="min-w-8 text-right text-xl font-black text-white">{formatMetric(total)}</strong>
      <span className="min-w-[68px] text-right text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
        {formatRatio(per90)} /90
      </span>
    </div>
  );
}

function DisciplineMetric({ label, value, tone }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-300">
        <span aria-hidden="true" className={`h-3 w-2 rounded-sm ${tone}`} />
        {label}
      </span>
      <strong className="text-xl font-black text-white">{formatMetric(value)}</strong>
    </div>
  );
}

function LiveMetricGroup({ title, metrics }) {
  return (
    <section className="min-w-0 border-t border-white/[0.08] pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 first:border-t-0 first:pt-0 lg:first:border-l-0 lg:first:pl-0">
      <h4 className="text-[9px] font-black uppercase tracking-[0.16em] text-caudal-electric">{title}</h4>
      <dl className="mt-2 divide-y divide-white/[0.07]">
        {metrics.map(({ label, value, format }) => (
          <div key={label} className="flex min-w-0 items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <dt className="min-w-0 text-[11px] font-semibold text-slate-400">{label}</dt>
            <dd className="shrink-0 text-base font-black text-white">
              {format === 'ratio' ? formatRatio(value) : formatMetric(value)}{format === 'percent' ? ' %' : ''}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OverviewSection({ state, onRetry }) {
  if (state.status === 'loading') return <PlayerAnalysisLoading label="Cargando resumen" />;
  if (state.status === 'error') return <PlayerAnalysisError title="Resumen no disponible" kind={state.errorKind} onRetry={onRetry} />;
  if (state.status === 'empty') return <PlayerAnalysisEmpty title="Sin resumen en estos filtros" copy="No hay participación propia registrada en este ámbito." />;

  const overview = state.data;
  const presentation = buildPlayerAnalysisOverviewPresentation(overview);
  return (
    <AccordionSection title="Resumen" subtitle="Principales y complementarias" defaultOpen>
      <div className="space-y-3">
        <section className={`${PLAYER_ANALYSIS_CARD} p-3.5 sm:p-4`}>
          <PlayerAnalysisSectionHeader eyebrow="Principales" title="Participación" description={presentation.hasData ? 'Tu presencia en los partidos del ámbito seleccionado.' : 'Todavía no hay participación registrada.'} />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DenseMetric label="Minutos" value={overview.minutes} detail={overview.matchesPlayed ? `${formatMetric(presentation.minutesPerMatch)} min / partido` : 'Sin partidos jugados'} tone="text-caudal-electric" />
            <DenseMetric label="Partidos" value={overview.matchesPlayed} detail={`${overview.matchRecords} registros`} />
            <DenseMetric label="Titularidades" value={overview.starts} detail={`${overview.benchEntries} desde banquillo`} />
            <DenseMetric label="Participación" value={presentation.participation} suffix=" %" detail={presentation.possibleMinutes ? `${overview.minutes} de ${presentation.possibleMinutes} min posibles` : ''} />
          </div>
        </section>

        <section className={`${PLAYER_ANALYSIS_CARD} p-3.5 sm:p-4`}>
          <PlayerAnalysisSectionHeader eyebrow="Resumen ofensivo" title="Producción" />
          <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-white/[0.08] pb-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-600">
                <span>Acción</span><span>Total</span><span className="min-w-[68px] text-right">Por 90'</span>
              </div>
              <ProductionMetricRow label="Goles" total={overview.goals} per90={overview.goalsPer90} partial={presentation.goalsPartial} />
              <ProductionMetricRow label="Asistencias" total={overview.assists} per90={overview.assistsPer90} partial={presentation.assistsPartial} />
              <ProductionMetricRow label="G+A" total={overview.goalContributions} per90={overview.goalContributionsPer90} partial={presentation.contributionsPartial} />
            </div>
            <div className="min-w-0 border-t border-white/[0.08] pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <h4 className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Disciplina</h4>
              <div className="mt-1 divide-y divide-white/[0.07]">
                <DisciplineMetric label="Amarillas" value={overview.yellowCards} tone="bg-amber-300" />
                <DisciplineMetric label="Rojas" value={overview.redCards} tone="bg-red-400" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </AccordionSection>
  );
}

function LiveSection({ state, liveWindow, onWindowChange, onRetry }) {
  const windowSelector = (
    <div role="group" aria-label="Ventana de Registro en vivo" className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-black/20 p-1">
      {PLAYER_ANALYSIS_WINDOW_OPTIONS.map((option) => (
        <button key={option.value} type="button" aria-pressed={liveWindow === option.value} onClick={() => onWindowChange(option.value)} className={`min-h-[40px] rounded-lg px-2 text-[9px] font-black uppercase tracking-[0.06em] transition ${liveWindow === option.value ? 'bg-caudal-electric text-slate-950' : 'text-slate-400 hover:bg-white/[0.06]'} ${PLAYER_ANALYSIS_FOCUS}`}>{option.label}</button>
      ))}
    </div>
  );

  if (state.status === 'loading') return <PlayerAnalysisLoading label="Cargando Registro en vivo" />;
  if (state.status === 'error') return <PlayerAnalysisError title="Registro en vivo no disponible" kind={state.errorKind} onRetry={onRetry} />;
  if (state.status === 'empty') return <PlayerAnalysisEmpty title="Sin Registro en vivo" copy="No hay agregados validados para este ámbito." />;

  const live = state.data;
  const metricGroups = [
    { title: 'Finalización', metrics: [
      { label: 'Goles / partido', value: live.goalsPerMatch, format: 'ratio' },
      { label: 'Tiros / partido', value: live.shotsPerMatch, format: 'ratio' },
      { label: 'A puerta / partido', value: live.shotsOnTargetPerMatch, format: 'ratio' },
      { label: '% tiros a puerta', value: live.shotAccuracyPercentage, format: 'percent' },
    ] },
    { title: 'Con balón', metrics: [
      { label: 'Centros / partido', value: live.crossesPerMatch, format: 'ratio' },
      { label: 'Pérdidas / partido', value: live.turnoversPerMatch, format: 'ratio' },
    ] },
    { title: 'Defensivo', metrics: [
      { label: 'Robos / partido', value: live.stealsPerMatch, format: 'ratio' },
      { label: 'Faltas realizadas', value: live.foulsCommittedPerMatch, format: 'ratio' },
      { label: 'Faltas recibidas', value: live.foulsReceivedPerMatch, format: 'ratio' },
    ] },
  ];

  return (
    <AccordionSection title="Registro en vivo" subtitle="Indicadores validados" defaultOpen>
      <section className={`${PLAYER_ANALYSIS_CARD} p-3.5 sm:p-4`}>
        <PlayerAnalysisSectionHeader title="Registro en vivo" />
        <div className="mt-3">{windowSelector}</div>
        {live.matchesWithEvents === 0 ? <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-slate-500">Sin partidos con eventos validados en esta ventana.</p> : null}
        {live.matchesWithEvents > 0 ? (
          <p className="mt-3 text-[10px] font-bold text-slate-500">
            <strong className="text-slate-200">{formatMetric(live.matchesWithEvents)}</strong> {live.matchesWithEvents === 1 ? 'partido analizado' : 'partidos analizados'}
          </p>
        ) : null}
        <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-3">
          {metricGroups.map((group) => (
            <LiveMetricGroup key={group.title} title={group.title} metrics={group.metrics} />
          ))}
        </div>
      </section>
    </AccordionSection>
  );
}

export default function PlayerAnalysisPanel({ client }) {
  const [filters, setFilters] = useState(PLAYER_ANALYSIS_DEFAULT_FILTERS);
  const { competitionScope, venue, liveWindow } = filters;

  const [overviewState, retryOverview] = usePlayerAnalysisDomain(
    () => loadPlayerAnalysisOverview(client, { competitionScope, venue }),
    [client, competitionScope, venue],
  );
  const [liveState, retryLive] = usePlayerAnalysisDomain(
    () => loadPlayerAnalysisLiveStats(client, { competitionScope, venue, liveWindow }),
    [client, competitionScope, venue, liveWindow],
  );
  const [productionState, retryProduction] = usePlayerAnalysisDomain(
    () => loadPlayerProductionActions(client, { competitionScope, venue }),
    [client, competitionScope, venue],
  );
  const [historyState, retryHistory, loadMoreHistory] = usePlayerAnalysisHistory(client, competitionScope, venue);

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4" data-player-analysis-rich="true">
      <section className={`${PLAYER_ANALYSIS_CARD} relative overflow-hidden px-3.5 py-3 sm:px-4 sm:py-3.5`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(61,217,255,0.12),transparent_42%)]" />
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-caudal-electric">Mi análisis</p>
            <h2 className="mt-0.5 text-xl font-black tracking-tight text-white sm:text-2xl">Tu ficha deportiva</h2>
            <p className="mt-1 text-xs text-slate-400">Tu rendimiento en el periodo seleccionado.</p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 sm:flex-nowrap" aria-label="Filtros de Mi análisis">
            <FilterSelect label="Competición" value={competitionScope} options={PLAYER_ANALYSIS_COMPETITION_OPTIONS} onChange={(value) => updateFilter('competitionScope', value)} />
            <FilterSelect label="Localía" value={venue} options={PLAYER_ANALYSIS_VENUE_OPTIONS} onChange={(value) => updateFilter('venue', value)} />
          </div>
        </div>
      </section>

      <OverviewSection state={overviewState} onRetry={retryOverview} />
      <LiveSection state={liveState} liveWindow={liveWindow} onWindowChange={(value) => updateFilter('liveWindow', value)} onRetry={retryLive} />
      <PlayerAnalysisProduction state={productionState} onRetry={retryProduction} />
      <PlayerAnalysisHistory
        state={historyState}
        productionActions={productionState.status === 'ready' ? productionState.data : []}
        onRetry={retryHistory}
        onLoadMore={loadMoreHistory}
      />
    </div>
  );
}
