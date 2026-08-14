import { useMemo, useState } from 'react';

import {
  DELEGATED_EVOLUTION_SCOPES,
  DELEGATED_PERIODS,
  DELEGATED_PLAYER_STAT_FIELDS,
  DELEGATED_STAT_FIELDS,
  aggregateDelegatedSides,
  aggregateDelegatedStats,
  buildDelegatedEvolution,
  buildDelegatedPlayerRows,
  buildDelegatedRankings,
  buildDelegatedStatsDataset,
  buildDelegatedTemporalDistribution,
  calculateDelegatedDerivedStats,
  getDelegatedMatchCompetitionKey,
} from '../../utils/delegatedStats';
import { DELEGATED_EVENT_CATALOG, getDelegatedRegistryQuality } from '../../utils/delegatedMatchValidation';

const VIEWS = ['Resumen', 'Jugadores', 'Equipo', 'Evolución'];
const RATE_FIELD = { key: 'shotAccuracy', label: '% tiros a puerta', short: 'TAP %' };
const formatNumber = (value, digits = 2) => (
  value == null || Number.isNaN(Number(value))
    ? '—'
    : Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits })
);
const formatPercent = (value) => (value == null ? '—' : `${formatNumber(value, 1)}%`);

const getSortValue = (row, key) => {
  if (key === 'minutes') return row.minutesReliable ? Number(row.minutes) : null;
  if (key === 'shotAccuracy') return row.derived.shotAccuracy;
  return Number(row.stats?.[key] || 0);
};

function MetricCard({ field, sides, teamFilter }) {
  const isRate = field.key === 'shotAccuracy';
  const caudalValue = isRate
    ? calculateDelegatedDerivedStats(sides.caudal).shotAccuracy
    : sides.caudal[field.key];
  const rivalValue = isRate
    ? calculateDelegatedDerivedStats(sides.rival).shotAccuracy
    : sides.rival[field.key];
  const formatter = isRate ? formatPercent : formatNumber;
  const compare = teamFilter === 'todos' && sides.hasCaudal && sides.hasRival;
  const showRivalOnly = teamFilter === 'rival' || (teamFilter === 'todos' && !sides.hasCaudal && sides.hasRival);
  const selectedValue = showRivalOnly ? rivalValue : caudalValue;

  return (
    <article className="rounded-2xl border border-white/5 bg-white/[0.045] px-3 py-3">
      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-500">{field.label}</p>
      {compare ? (
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <span className="text-xl font-black text-caudal-electric">{formatter(caudalValue)}</span>
          <span className="pb-1 text-[8px] font-black text-slate-600">CAU · RIV</span>
          <span className="text-right text-xl font-black text-red-200">{formatter(rivalValue)}</span>
        </div>
      ) : (
        <p className={`mt-2 text-2xl font-black ${showRivalOnly ? 'text-red-200' : 'text-caudal-electric'}`}>
          {(showRivalOnly ? sides.hasRival : sides.hasCaudal) ? formatter(selectedValue) : '—'}
        </p>
      )}
    </article>
  );
}

function SampleLine({ matches, events, playerRow, quality }) {
  const matchCount = new Set(events.map((event) => event.match?.id).filter(Boolean)).size;
  return (
    <p className="text-[11px] font-semibold text-slate-500">
      {matchCount || matches.length} partidos
      {playerRow ? ` · ${playerRow.minutesReliable ? `${formatNumber(playerRow.minutes, 0)} minutos` : 'minutos no disponibles'}` : ''}
      {' · '}{events.length} eventos validados
      {quality.registered ? ` · ${quality.validated}/${quality.registered} aprobados (${formatNumber(quality.percent, 1)}%)` : ''}
      {quality.pending ? ` · ${quality.pending} pendientes` : ''}
    </p>
  );
}

export default function DelegatedStatsDashboard({
  matches = [],
  players = [],
  filters,
  onFiltersChange,
  getPlayerName = (player) => player?.name || 'Jugador',
  getCompetitionLabel = (key) => key,
  formatMatchDate = (value) => value,
}) {
  const [view, setView] = useState('Resumen');
  const [matchId, setMatchId] = useState('');
  const [sort, setSort] = useState({ key: 'minutes', direction: 'desc' });
  const [playerMode, setPlayerMode] = useState('total');
  const [temporalMetric, setTemporalMetric] = useState('shots');
  const [evolutionMetric, setEvolutionMetric] = useState('shots');
  const [evolutionScope, setEvolutionScope] = useState('5');
  const [evolutionCompetition, setEvolutionCompetition] = useState('all');
  const [evolutionMode, setEvolutionMode] = useState('total');

  const effectiveFilters = { ...filters, matchId };
  const dataset = useMemo(
    () => buildDelegatedStatsDataset({ matches, filters: effectiveFilters }),
    [matches, filters.team, filters.playerId, filters.eventType, filters.period, matchId],
  );
  const scopedMatches = dataset.matches;
  const validatedMatches = dataset.validatedMatches;
  const quality = useMemo(() => getDelegatedRegistryQuality(scopedMatches), [scopedMatches]);
  const hasUnprocessedValidatedMatch = validatedMatches.length > 0
    && quality.registered > 0
    && quality.validated === 0
    && quality.pending > 0;
  const sides = useMemo(() => aggregateDelegatedSides(dataset.events), [dataset.events]);
  const playerRows = useMemo(() => buildDelegatedPlayerRows({
    events: dataset.events,
    matches: validatedMatches,
    players,
    selectedPlayerId: filters.playerId,
  }), [dataset.events, validatedMatches, players, filters.playerId]);
  const selectedPlayerRow = filters.playerId
    ? playerRows.find((row) => row.playerId === filters.playerId) || null
    : null;
  const rankings = useMemo(() => buildDelegatedRankings(playerRows), [playerRows]);
  const orderedPlayers = useMemo(() => playerRows.slice().sort((left, right) => {
    const leftValue = getSortValue(left, sort.key);
    const rightValue = getSortValue(right, sort.key);
    if (leftValue == null && rightValue != null) return 1;
    if (rightValue == null && leftValue != null) return -1;
    const direction = sort.direction === 'asc' ? 1 : -1;
    if (leftValue !== rightValue) return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    return getPlayerName(left.player).localeCompare(getPlayerName(right.player), 'es');
  }), [playerRows, sort, getPlayerName]);
  const temporal = useMemo(
    () => buildDelegatedTemporalDistribution(dataset.events, temporalMetric),
    [dataset.events, temporalMetric],
  );
  const competitionOptions = useMemo(() => [...new Set(matches.map(getDelegatedMatchCompetitionKey))], [matches]);
  const evolution = useMemo(() => buildDelegatedEvolution({
    matches,
    filters: effectiveFilters,
    scope: evolutionScope,
    competitionKey: evolutionCompetition,
    metric: evolutionMetric,
    mode: evolutionMode,
    players,
  }), [matches, players, filters.team, filters.playerId, filters.eventType, filters.period, matchId, evolutionScope, evolutionCompetition, evolutionMetric, evolutionMode]);
  const maxTemporal = Math.max(1, ...temporal.rows.flatMap((row) => [row.caudal, row.rival]));
  const maxEvolution = Math.max(1, ...evolution.flatMap((row) => [Number(row.value || 0), Number(row.caudalValue || 0), Number(row.rivalValue || 0)]));
  const selectedMetricField = DELEGATED_STAT_FIELDS.find((field) => field.key === temporalMetric);
  const selectedEvolutionField = evolutionMetric === 'minutes'
    ? { label: 'Minutos', short: 'MIN' }
    : DELEGATED_STAT_FIELDS.find((field) => field.key === evolutionMetric);

  const changeFilter = (key, value) => onFiltersChange({ ...filters, [key]: value });
  const toggleSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
  }));
  const sortMark = (key) => (sort.key === key ? (sort.direction === 'desc' ? ' ↓' : ' ↑') : '');
  const renderPlayerValue = (row, field) => {
    if (field.key === 'shotAccuracy') return formatPercent(row.derived.shotAccuracy);
    const value = playerMode === 'per90' && field.key !== 'goals' ? row.per90?.[field.key] : row.stats[field.key];
    return formatNumber(value);
  };

  return (
    <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-4 shadow-glow sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Panel estadístico delegado</p>
          <SampleLine matches={validatedMatches} events={dataset.events} playerRow={selectedPlayerRow} quality={quality} />
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-black/20 p-1.5">
          {VIEWS.map((item) => (
            <button key={item} type="button" onClick={() => setView(item)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${view === item ? 'bg-caudal-electric text-slate-950' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <select value={matchId} onChange={(event) => setMatchId(event.target.value)} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
          <option value="">Todos los partidos</option>
          {matches.map((match) => <option key={match.id} value={match.id}>{formatMatchDate(match.date)} · {match.opponent || 'Rival'}</option>)}
        </select>
        <select value={filters.team} onChange={(event) => changeFilter('team', event.target.value)} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
          <option value="todos">Todos los equipos</option><option value="caudal">Caudal</option><option value="rival">Rival</option>
        </select>
        <select value={filters.playerId} onChange={(event) => onFiltersChange({ ...filters, playerId: event.target.value, team: event.target.value ? 'caudal' : filters.team })} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
          <option value="">Todos los jugadores</option>
          {players.map((player) => <option key={player.id} value={player.id}>{getPlayerName(player)}</option>)}
        </select>
        <select value={filters.eventType} onChange={(event) => changeFilter('eventType', event.target.value)} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
          <option value="todos">Todos los eventos</option>
          {DELEGATED_EVENT_CATALOG.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
        </select>
        <select value={filters.period} onChange={(event) => changeFilter('period', event.target.value)} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
          <option value="todos">Todo el partido</option>
          {DELEGATED_PERIODS.map((period) => <option key={period} value={period}>{period}'</option>)}
        </select>
      </div>

      {view === 'Resumen' ? (
        <div className="mt-4 space-y-4">
          {!dataset.events.length ? (
            <p className="rounded-2xl bg-black/20 p-5 text-sm font-semibold text-slate-400">
              {hasUnprocessedValidatedMatch
                ? 'El partido figura como Validado, pero sus eventos siguen pendientes. Vuelve a validarlo para procesar y recargar sus eventos.'
                : 'No hay eventos validados que coincidan con estos filtros.'}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {[...DELEGATED_STAT_FIELDS, RATE_FIELD].map((field) => <MetricCard key={field.key} field={field} sides={sides} teamFilter={filters.team} />)}
          </div>
          {filters.team === 'todos' && !sides.hasRival ? <p className="text-xs font-semibold text-slate-500">Sin datos suficientes del rival para una comparación.</p> : null}
          <div className="grid gap-3 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-2xl bg-black/15 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white">Indicadores derivados seguros</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {[
                  ['Precisión de tiro', 'shotAccuracy', 'TAP / tiros', '%'],
                  ['Efectividad de tiro', 'shotEffectiveness', 'goles / tiros', '%'],
                  ['Efectividad sobre TAP', 'onTargetEffectiveness', 'goles / TAP', '%'],
                  ['Acciones defensivas registradas', 'registeredDefensiveActions', 'robos + recuperaciones', ''],
                  ['Balance de recuperación', 'recoveryBalance', 'robos + recuperaciones − pérdidas', ''],
                ].map(([label, key, formula, unit]) => {
                  const own = calculateDelegatedDerivedStats(sides.caudal)[key];
                  const rival = calculateDelegatedDerivedStats(sides.rival)[key];
                  return (
                    <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                      <span><span className="block text-[10px] font-black text-slate-300">{label}</span><span className="block text-[9px] text-slate-600">{formula}</span></span>
                      <span className="font-black text-caudal-electric">{sides.hasCaudal ? `${formatNumber(own)}${own == null ? '' : unit}` : '—'}</span>
                      <span className="font-black text-red-200">{sides.hasRival ? `${formatNumber(rival)}${rival == null ? '' : unit}` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl bg-black/15 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white">Destacados</p>
              {!rankings.length ? <p className="mt-3 text-xs text-slate-500">No hay rankings con valores registrados.</p> : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {rankings.map((ranking) => (
                  <div key={ranking.key} className="rounded-xl bg-white/[0.04] px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{ranking.label}</p>
                    <p className="mt-1 truncate text-sm font-black text-white">{ranking.leaders.map((row) => getPlayerName(row.player)).join(' · ')}</p>
                    <p className="text-xs font-black text-caudal-electric">{formatNumber(ranking.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {view === 'Jugadores' ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Las abreviaturas se explican al pasar por cada encabezado. G permanece como total en modo por90.</p>
            <div className="flex rounded-xl bg-black/20 p-1">
              {[['total', 'Totales'], ['per90', 'Por 90']].map(([key, label]) => <button key={key} type="button" onClick={() => setPlayerMode(key)} className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${playerMode === key ? 'bg-white/15 text-white' : 'text-slate-500'}`}>{label}</button>)}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[920px] border-collapse text-xs">
              <thead className="bg-black/25 text-[9px] uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-[#071123] px-3 py-3 text-left">Jugador</th>
                  <th title="Minutos reales de Estadísticas/POST" className="cursor-pointer px-2 py-3 text-center" onClick={() => toggleSort('minutes')}>MIN{sortMark('minutes')}</th>
                  {[DELEGATED_PLAYER_STAT_FIELDS[0], DELEGATED_PLAYER_STAT_FIELDS[1], DELEGATED_PLAYER_STAT_FIELDS[2], RATE_FIELD, ...DELEGATED_PLAYER_STAT_FIELDS.slice(3)].map((field) => (
                    <th key={field.key} title={field.label} className="cursor-pointer px-2 py-3 text-center" onClick={() => toggleSort(field.key)}>{field.short}{sortMark(field.key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderedPlayers.map((row) => (
                  <tr key={row.playerId} className="border-t border-white/5 text-slate-200">
                    <td className="sticky left-0 bg-[#091428] px-3 py-2.5 font-black text-white">{getPlayerName(row.player)}</td>
                    <td className="px-2 py-2.5 text-center font-bold">{row.minutesReliable ? formatNumber(row.minutes, 0) : '—'}</td>
                    {[DELEGATED_PLAYER_STAT_FIELDS[0], DELEGATED_PLAYER_STAT_FIELDS[1], DELEGATED_PLAYER_STAT_FIELDS[2], RATE_FIELD, ...DELEGATED_PLAYER_STAT_FIELDS.slice(3)].map((field) => (
                      <td key={field.key} className="px-2 py-2.5 text-center font-bold">{renderPlayerValue(row, field)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!orderedPlayers.length ? <p className="mt-3 rounded-2xl bg-black/20 p-4 text-sm text-slate-500">No hay jugadores propios con datos para estos filtros.</p> : null}
        </div>
      ) : null}

      {view === 'Equipo' ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="grid content-start grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
            {DELEGATED_STAT_FIELDS.map((field) => <MetricCard key={field.key} field={field} sides={sides} teamFilter={filters.team} />)}
          </div>
          <div className="rounded-2xl bg-black/15 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white">Distribución temporal</p><p className="text-[10px] text-slate-600">El tiempo añadido posterior al 90' queda en 76–90+.</p></div>
              <select value={temporalMetric} onChange={(event) => setTemporalMetric(event.target.value)} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
                {DELEGATED_STAT_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
              </select>
            </div>
            <p className="mt-3 text-xs font-black text-slate-300">{selectedMetricField?.label || 'Métrica'} por tramo</p>
            <div className="mt-3 space-y-2">
              {temporal.rows.map((row) => (
                <div key={row.period} className="grid grid-cols-[58px_1fr_auto_1fr_auto] items-center gap-2 text-[10px]">
                  <span className="font-black text-slate-500">{row.period}</span>
                  <span className="flex h-2 justify-end rounded-full bg-white/5"><span className="h-2 rounded-full bg-caudal-electric" style={{ width: `${(row.caudal / maxTemporal) * 100}%` }} /></span>
                  <span className="w-5 text-right font-black text-caudal-electric">{temporal.hasCaudal ? row.caudal : '—'}</span>
                  <span className="h-2 rounded-full bg-white/5"><span className="block h-2 rounded-full bg-red-300" style={{ width: `${(row.rival / maxTemporal) * 100}%` }} /></span>
                  <span className="w-5 text-right font-black text-red-200">{temporal.hasRival ? row.rival : '—'}</span>
                </div>
              ))}
            </div>
            {!temporal.hasRival ? <p className="mt-3 text-xs font-semibold text-slate-500">Sin datos suficientes del rival.</p> : null}
          </div>
        </div>
      ) : null}

      {view === 'Evolución' ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <select value={evolutionScope} onChange={(event) => setEvolutionScope(event.target.value)} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
              {DELEGATED_EVOLUTION_SCOPES.map((scope) => <option key={scope} value={scope}>{scope === 'season' ? 'Temporada' : `Últimos ${scope}`}</option>)}
            </select>
            <select value={evolutionCompetition} onChange={(event) => setEvolutionCompetition(event.target.value)} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
              <option value="all">Todas las competiciones</option>
              {competitionOptions.map((key) => <option key={key} value={key}>{getCompetitionLabel(key)}</option>)}
            </select>
            <select value={evolutionMetric} onChange={(event) => setEvolutionMetric(event.target.value)} className="rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-xs font-bold text-white">
              {filters.playerId ? <option value="minutes">Minutos</option> : null}
              {DELEGATED_STAT_FIELDS.filter((field) => filters.playerId ? !field.teamOnly : true).map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
            </select>
            {filters.playerId ? (
              <div className="flex rounded-xl bg-black/20 p-1">
                {[['total', 'Totales'], ['per90', 'Por 90']].map(([key, label]) => <button key={key} type="button" onClick={() => setEvolutionMode(key)} className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${evolutionMode === key ? 'bg-white/15 text-white' : 'text-slate-500'}`}>{label}</button>)}
              </div>
            ) : null}
          </div>
          {filters.playerId && evolutionMode === 'per90' && evolutionMetric === 'goals' ? <p className="mt-2 text-xs text-slate-500">Los goles se mantienen como total; no se ofrece G/90 sin contexto de muestra.</p> : null}
          <div className="mt-4 overflow-x-auto rounded-2xl bg-black/15 p-4">
            <div className="min-w-[620px] space-y-2">
              {evolution.map((row) => (
                <div key={row.matchId} className={`grid items-center gap-3 ${filters.team === 'todos' && !filters.playerId ? 'grid-cols-[82px_140px_1fr_34px_1fr_34px]' : 'grid-cols-[82px_150px_1fr_62px]'}`}>
                  <span className="text-[10px] font-bold text-slate-500">{formatMatchDate(row.date)}</span>
                  <span className="truncate text-xs font-black text-white">{row.opponent}</span>
                  {filters.team === 'todos' && !filters.playerId ? (
                    <>
                      <span className="h-2 rounded-full bg-white/5"><span className="block h-2 rounded-full bg-caudal-electric" style={{ width: row.caudalValue == null ? '0%' : `${Math.max(3, (Number(row.caudalValue) / maxEvolution) * 100)}%` }} /></span>
                      <span className="text-right text-xs font-black text-caudal-electric">{formatNumber(row.caudalValue)}</span>
                      <span className="h-2 rounded-full bg-white/5"><span className="block h-2 rounded-full bg-red-300" style={{ width: row.rivalValue == null ? '0%' : `${Math.max(3, (Number(row.rivalValue) / maxEvolution) * 100)}%` }} /></span>
                      <span className="text-right text-xs font-black text-red-200">{formatNumber(row.rivalValue)}</span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 rounded-full bg-white/5"><span className={`block h-2 rounded-full ${filters.team === 'rival' ? 'bg-red-300' : 'bg-caudal-electric'}`} style={{ width: row.value == null ? '0%' : `${Math.max(3, (Number(row.value) / maxEvolution) * 100)}%` }} /></span>
                      <span className={`text-right text-sm font-black ${filters.team === 'rival' ? 'text-red-200' : 'text-caudal-electric'}`}>{formatNumber(row.value)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {!evolution.length ? <p className="text-sm text-slate-500">No hay partidos validados para esta muestra.</p> : null}
          </div>
          <p className="mt-2 text-[10px] font-semibold text-slate-600">{selectedEvolutionField?.label || 'Métrica'} · {evolution.length} partidos · {evolution.reduce((sum, row) => sum + row.events, 0)} eventos validados.</p>
        </div>
      ) : null}
    </section>
  );
}
