import { useEffect, useMemo, useState } from 'react';
import AccordionSection from '../shared/AccordionSection';
import {
  PLAYER_ANALYSIS_DEFAULT_MATCH_METRIC,
  PLAYER_ANALYSIS_MATCH_METRICS,
  buildPlayerAnalysisMatchComparison,
  buildPlayerAnalysisMatchSequence,
  buildPlayerAnalysisSeasonMaximums,
  formatPlayerAnalysisDate,
  formatPlayerAnalysisMatchMetric,
  getPlayerAnalysisCompetitionLabel,
  getPlayerAnalysisCrestFallback,
  getPlayerAnalysisMatchMetric,
  getPlayerAnalysisMatchMetricValue,
} from '../../utils/playerAnalysisPresentation';
import {
  PLAYER_ANALYSIS_CARD,
  PLAYER_ANALYSIS_FOCUS,
  PlayerAnalysisEmpty,
  PlayerAnalysisError,
  PlayerAnalysisSectionHeader,
} from './PlayerAnalysisDomainState';

function OpponentCrest({ src, opponent, size = 'medium' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const sizeClass = size === 'small' ? 'h-8 w-8 text-[9px]' : 'h-11 w-11 text-[10px]';
  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={`Escudo no disponible de ${opponent || 'el rival'}`}
        className={`flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] font-black text-slate-400 ${sizeClass}`}
      >
        {getPlayerAnalysisCrestFallback(opponent)}
      </span>
    );
  }
  return <img src={src} alt={`Escudo de ${opponent}`} onError={() => setFailed(true)} loading="lazy" className={`shrink-0 object-contain ${sizeClass}`} />;
}

function MetricSelector({ value, onChange }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="group" aria-label="Métrica de evolución" className="flex min-w-max gap-1.5">
        {PLAYER_ANALYSIS_MATCH_METRICS.map((metric) => (
          <button
            key={metric.key}
            type="button"
            aria-pressed={value === metric.key}
            onClick={() => onChange(metric.key)}
            className={`min-h-[44px] shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black transition ${value === metric.key ? 'border-caudal-electric/50 bg-caudal-electric text-slate-950' : 'border-white/[0.08] bg-white/[0.035] text-slate-300 hover:bg-white/[0.07]'} ${PLAYER_ANALYSIS_FOCUS}`}
          >
            {metric.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchMetricChart({ matches, metricKey, selectedMatchId, onSelect }) {
  const metric = getPlayerAnalysisMatchMetric(metricKey);
  const values = matches.map((match) => getPlayerAnalysisMatchMetricValue(match, metric.key));
  const maxValue = Math.max(1, ...values.filter((value) => value !== null));

  return (
    <div className="mt-3 overflow-x-auto pb-2 [scrollbar-color:rgba(61,217,255,0.3)_transparent]" data-player-match-chart="bars">
      <div className="flex min-w-full items-stretch gap-2" role="list" aria-label={`Evolución de ${metric.detailLabel}`}>
        {matches.map((match, index) => {
          const value = values[index];
          const selected = match.matchId === selectedMatchId;
          const barHeight = value === null || value === 0 ? 4 : Math.max(12, Math.round((value / maxValue) * 82));
          return (
            <button
              key={match.matchId}
              type="button"
              role="listitem"
              aria-pressed={selected}
              aria-label={`${match.sequenceLabel}, ${match.opponent || 'Rival'}: ${formatPlayerAnalysisMatchMetric(value, metric.format)}`}
              onClick={() => onSelect(match.matchId)}
              className={`flex min-h-[190px] min-w-[72px] flex-1 basis-[72px] flex-col items-center justify-end rounded-2xl border px-1.5 pb-2 pt-3 transition ${selected ? 'border-caudal-electric/55 bg-caudal-electric/[0.09]' : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.05]'} ${PLAYER_ANALYSIS_FOCUS}`}
            >
              <span className="mb-1.5 text-xs font-black tabular-nums text-white">{formatPlayerAnalysisMatchMetric(value, metric.format)}</span>
              <span className="flex h-[86px] items-end" aria-hidden="true">
                <span className={`block w-5 rounded-t-md ${selected ? 'bg-caudal-electric' : 'bg-sky-400/55'}`} style={{ height: `${barHeight}px` }} />
              </span>
              <span className="mt-2"><OpponentCrest src={match.opponentCrest} opponent={match.opponent} size="small" /></span>
              <strong className="mt-1 text-[10px] font-black text-white">{match.sequenceLabel}</strong>
              <span className="mt-0.5 block w-full truncate text-center text-[9px] font-semibold text-slate-400" title={match.opponent || 'Rival'}>{match.opponent || 'Rival'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SelectedMatchDetail({ match, metricKey }) {
  if (!match) return null;
  const metric = getPlayerAnalysisMatchMetric(metricKey);
  const value = getPlayerAnalysisMatchMetricValue(match, metric.key);
  return (
    <article className="mt-2 grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-black/15 p-3">
      <OpponentCrest src={match.opponentCrest} opponent={match.opponent} />
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-white">{match.opponent || 'Rival'}</p>
        <p className="mt-0.5 text-[10px] font-semibold leading-4 text-slate-400">
          {formatPlayerAnalysisDate(match.matchDate)} · {getPlayerAnalysisCompetitionLabel(match)} · {match.isHome === true ? 'Casa' : match.isHome === false ? 'Fuera' : 'Localía no disponible'}
        </p>
        {match.minutes !== null ? <p className="mt-0.5 text-[10px] font-bold text-slate-500">{formatPlayerAnalysisMatchMetric(match.minutes, 'minutes')}</p> : null}
      </div>
      <div className="min-w-[62px] text-right">
        <p className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-500">{metric.detailLabel}</p>
        <strong className="mt-0.5 block text-2xl font-black tabular-nums text-caudal-electric">{formatPlayerAnalysisMatchMetric(value, metric.format)}</strong>
      </div>
    </article>
  );
}

function SeasonMaximums({ matches }) {
  const maximums = useMemo(() => buildPlayerAnalysisSeasonMaximums(matches), [matches]);
  return (
    <section className="mt-5 border-t border-white/[0.08] pt-4" aria-labelledby="player-season-maximums-title">
      <h4 id="player-season-maximums-title" className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Máximos de la temporada</h4>
      {maximums.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {maximums.map(({ metric, value, match }) => (
            <article key={metric.key} className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5 sm:p-3">
              <p className="min-h-8 text-[8px] font-black uppercase leading-4 tracking-[0.1em] text-slate-500">Más {metric.label.toLocaleLowerCase('es-ES')}</p>
              <strong className="mt-0.5 block text-2xl font-black tabular-nums text-white">{formatPlayerAnalysisMatchMetric(value, metric.format)}</strong>
              <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-white/[0.07] pt-2">
                <OpponentCrest src={match.opponentCrest} opponent={match.opponent} size="small" />
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-black text-slate-200" title={match.opponent || 'Rival'}>{match.opponent || 'Rival'}</p>
                  <p className="mt-0.5 text-[9px] font-semibold text-slate-500">{match.sequenceLabel} · {formatPlayerAnalysisDate(match.matchDate)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-slate-500">Sin registros superiores a cero en este filtro.</p>}
    </section>
  );
}

function ComparisonMatchHeader({ side, match, selected, onActivate }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onActivate}
      className={`min-h-[84px] min-w-0 rounded-2xl border p-2 text-left transition ${selected ? 'border-caudal-electric/55 bg-caudal-electric/[0.08]' : 'border-white/[0.08] bg-white/[0.025]'} ${PLAYER_ANALYSIS_FOCUS}`}
    >
      <span className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-500">Partido {side}</span>
      {match ? (
        <span className="mt-1.5 flex min-w-0 items-center gap-2">
          <OpponentCrest src={match.opponentCrest} opponent={match.opponent} size="small" />
          <span className="min-w-0">
            <strong className="block truncate text-[11px] font-black text-white">{match.opponent || 'Rival'}</strong>
            <span className="block text-[9px] font-bold text-slate-500">{match.sequenceLabel}</span>
          </span>
        </span>
      ) : <span className="mt-2 block text-[10px] font-bold text-slate-500">Selecciona un partido</span>}
    </button>
  );
}

function MatchComparison({ matches }) {
  const [activeSide, setActiveSide] = useState('A');
  const [matchAId, setMatchAId] = useState('');
  const [matchBId, setMatchBId] = useState('');
  const identity = matches.map((match) => match.matchId).join('|');

  useEffect(() => {
    setMatchAId(matches[0]?.matchId || '');
    setMatchBId(matches[1]?.matchId || '');
    setActiveSide('A');
  // La identidad cambia únicamente cuando la RPC devuelve otro scope ordenado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  if (matches.length < 2) {
    return (
      <section className="mt-5 border-t border-white/[0.08] pt-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Comparar partidos</h4>
        <p className="mt-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-3 text-xs text-slate-500">Necesitas al menos dos partidos para comparar.</p>
      </section>
    );
  }

  const comparison = buildPlayerAnalysisMatchComparison(matches, matchAId, matchBId);
  const chooseMatch = (matchId) => {
    if (activeSide === 'A' && matchId !== matchBId) {
      setMatchAId(matchId);
      setActiveSide('B');
    } else if (activeSide === 'B' && matchId !== matchAId) {
      setMatchBId(matchId);
      setActiveSide('A');
    }
  };

  return (
    <section className="mt-5 border-t border-white/[0.08] pt-4" aria-labelledby="player-match-comparison-title">
      <h4 id="player-match-comparison-title" className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Comparar partidos</h4>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)] items-center gap-1.5">
        <ComparisonMatchHeader side="A" match={comparison.matchA} selected={activeSide === 'A'} onActivate={() => setActiveSide('A')} />
        <span className="text-center text-[9px] font-black uppercase text-slate-600">vs</span>
        <ComparisonMatchHeader side="B" match={comparison.matchB} selected={activeSide === 'B'} onActivate={() => setActiveSide('B')} />
      </div>

      <p className="mt-3 text-[9px] font-bold text-slate-500">Elige el partido {activeSide}:</p>
      <div className="mt-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-2">
          {matches.map((match) => {
            const unavailable = activeSide === 'A' ? match.matchId === matchBId : match.matchId === matchAId;
            return (
              <button
                key={`${activeSide}-${match.matchId}`}
                type="button"
                disabled={unavailable}
                onClick={() => chooseMatch(match.matchId)}
                className={`grid min-h-[58px] w-[132px] grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 text-left transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35 ${PLAYER_ANALYSIS_FOCUS}`}
              >
                <OpponentCrest src={match.opponentCrest} opponent={match.opponent} size="small" />
                <span className="min-w-0">
                  <strong className="block truncate text-[10px] font-black text-white">{match.sequenceLabel} · {match.opponent || 'Rival'}</strong>
                  <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">{formatPlayerAnalysisDate(match.matchDate)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {comparison.rows.length ? (
        <dl className="mt-2 divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-black/10 px-3">
          {comparison.rows.map(({ metric, valueA, valueB }) => (
            <div key={metric.key} className="grid min-h-[46px] grid-cols-[minmax(52px,1fr)_minmax(104px,1.5fr)_minmax(52px,1fr)] items-center gap-2 py-2 text-center">
              <dd className="text-sm font-black tabular-nums text-white">{formatPlayerAnalysisMatchMetric(valueA, metric.format)}</dd>
              <dt className="text-[9px] font-black uppercase leading-4 tracking-[0.08em] text-slate-500">{metric.label}</dt>
              <dd className="text-sm font-black tabular-nums text-white">{formatPlayerAnalysisMatchMetric(valueB, metric.format)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export default function PlayerAnalysisMatchEvolution({ state, onRetry }) {
  const matches = useMemo(
    () => buildPlayerAnalysisMatchSequence(state.status === 'ready' ? state.data : []),
    [state.data, state.status],
  );
  const identity = matches.map((match) => match.matchId).join('|');
  const [metricKey, setMetricKey] = useState(PLAYER_ANALYSIS_DEFAULT_MATCH_METRIC);
  const [selectedMatchId, setSelectedMatchId] = useState('');

  useEffect(() => {
    setSelectedMatchId(matches[0]?.matchId || '');
  // Reinicia el detalle al primer partido del nuevo scope sin persistir preferencias.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  return (
    <AccordionSection title="Evolución partido a partido" subtitle="Tus registros en cada partido" defaultOpen>
      {state.status === 'loading' ? (
        <section role="status" aria-live="polite" className={`${PLAYER_ANALYSIS_CARD} animate-pulse p-3.5 sm:p-4`}>
          <div className="h-4 w-52 max-w-full rounded-full bg-white/10" />
          <div className="mt-3 h-11 rounded-xl bg-white/[0.06]" />
          <div className="mt-3 grid grid-cols-4 gap-2"><div className="h-40 rounded-2xl bg-white/[0.055]" /><div className="h-40 rounded-2xl bg-white/[0.055]" /><div className="h-40 rounded-2xl bg-white/[0.055]" /><div className="h-40 rounded-2xl bg-white/[0.055]" /></div>
          <span className="sr-only">Cargando evolución partido a partido</span>
        </section>
      ) : null}

      {state.status === 'error' ? <PlayerAnalysisError title="Evolución partido a partido no disponible" kind={state.errorKind} onRetry={onRetry} /> : null}

      {state.status === 'ready' && matches.length === 0 ? (
        <section className={`${PLAYER_ANALYSIS_CARD} p-3.5 sm:p-4`}>
          <PlayerAnalysisEmpty title="Sin evolución para este filtro" copy="No hay datos partido a partido para este filtro." />
        </section>
      ) : null}

      {state.status === 'ready' && matches.length > 0 ? (
        <section className={`${PLAYER_ANALYSIS_CARD} overflow-hidden p-3.5 sm:p-4`} data-player-match-evolution="true">
          <PlayerAnalysisSectionHeader title="Evolución partido a partido" description="Consulta cómo cambian tus registros de un partido a otro." />
          <div className="mt-3"><MetricSelector value={metricKey} onChange={setMetricKey} /></div>
          <MatchMetricChart matches={matches} metricKey={metricKey} selectedMatchId={selectedMatchId} onSelect={setSelectedMatchId} />
          <SelectedMatchDetail match={matches.find((match) => match.matchId === selectedMatchId) || matches[0]} metricKey={metricKey} />
          <SeasonMaximums matches={state.data} />
          <MatchComparison matches={state.data} />
        </section>
      ) : null}
    </AccordionSection>
  );
}
