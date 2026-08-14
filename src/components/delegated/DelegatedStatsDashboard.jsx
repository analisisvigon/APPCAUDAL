import { useEffect, useMemo, useState } from 'react';

import {
  DELEGATED_EVOLUTION_SCOPES,
  DELEGATED_PERIODS,
  DELEGATED_PLAYER_STAT_FIELDS,
  DELEGATED_STAT_FIELDS,
  aggregateDelegatedSides,
  buildDelegatedContextComparison,
  buildDelegatedDataReadings,
  buildDelegatedEvolution,
  buildDelegatedEvolutionComparison,
  buildDelegatedHalfComparison,
  buildDelegatedMatchSampleComparison,
  buildDelegatedOfficialGoalEvents,
  buildDelegatedOfficialTeamScore,
  buildDelegatedPlayerRows,
  buildDelegatedRankings,
  buildDelegatedStatsDataset,
  buildDelegatedTeamProfile,
  buildDelegatedTemporalDistribution,
  buildDelegatedTemporalMatrix,
  calculateDelegatedDerivedStats,
  formatDelegatedNumber,
  getDelegatedMatchCompetitionKey,
} from '../../utils/delegatedStats';
import { DELEGATED_EVENT_CATALOG, getDelegatedRegistryQuality } from '../../utils/delegatedMatchValidation';

const VIEWS = ['Resumen', 'Jugadores', 'Equipo', 'Evolución'];
const RATE_FIELD = { key: 'shotAccuracy', label: '% tiros a puerta', short: 'TAP %' };
const PLAYER_COLUMNS = [
  ...DELEGATED_PLAYER_STAT_FIELDS.slice(0, 5),
  RATE_FIELD,
  ...DELEGATED_PLAYER_STAT_FIELDS.slice(5),
];
const SUMMARY_GROUPS = [
  { label: 'Producción', keys: ['goals', 'shots', 'shotsOnTarget', 'shotAccuracy'] },
  { label: 'Juego ofensivo registrado', keys: ['dribbles', 'crosses', 'corners'] },
  { label: 'Recuperación / pérdida', keys: ['steals', 'recoveries', 'turnovers'] },
  { label: 'Disciplina / contacto', keys: ['foulsCommitted', 'foulsReceived'] },
];
const PROFILE_GROUPS = [
  { label: 'Producción', keys: ['goals', 'assists', 'goalContributions', 'shots', 'shotsOnTarget'] },
  { label: 'Juego ofensivo', keys: ['dribbles', 'crosses'] },
  { label: 'Recuperación', keys: ['steals', 'recoveries'] },
  { label: 'Pérdidas', keys: ['turnovers'] },
  { label: 'Interacción', keys: ['foulsCommitted', 'foulsReceived'] },
];
const CONTEXT_METRICS = ['goals', 'shots', 'shotsOnTarget', 'crosses', 'turnovers', 'steals', 'recoveries'];
const RECENT_METRICS = ['shots', 'shotsOnTarget', 'turnovers', 'steals', 'recoveries'];
const fieldByKey = new Map([...DELEGATED_STAT_FIELDS, ...DELEGATED_PLAYER_STAT_FIELDS, RATE_FIELD].map((field) => [field.key, field]));
const selectorClass = 'min-w-0 w-full rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-caudal-electric/50';

const getPlayerName = (player = {}) => player.name || player.shirtName || player.shirt_name || 'Jugador';
const getPlayerImage = (player = {}) => player.image || player.imageUrl || player.image_url || player.photo_url || '';
const getArrow = (value) => (Number(value) > 0 ? '↑' : Number(value) < 0 ? '↓' : '=');
const signed = (value, mode = 'average') => {
  if (value == null) return '—';
  const prefix = Number(value) > 0 ? '+' : '';
  return `${prefix}${formatDelegatedNumber(value, mode)}`;
};

function Segmented({ value, options, onChange, label }) {
  return (
    <div aria-label={label} className="inline-flex rounded-xl border border-white/5 bg-black/25 p-1">
      {options.map(([key, text]) => (
        <button key={key} type="button" onClick={() => onChange(key)} className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] transition ${value === key ? 'bg-caudal-electric text-slate-950' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ children }) {
  return <p className="rounded-xl border border-white/5 bg-black/15 px-4 py-3 text-xs font-semibold text-slate-500">{children}</p>;
}

function SampleLine({ matches, events, playerRow, quality }) {
  return (
    <p className="mt-1 text-[11px] font-semibold text-slate-500">
      {matches.length} partidos · {events.length} eventos validados
      {playerRow ? ` · ${playerRow.matchesPlayed ?? '—'} PJ · ${playerRow.minutesReliable ? `${formatDelegatedNumber(playerRow.minutes)} min` : 'minutos no disponibles'}` : ''}
      {quality.registered ? ` · ${quality.validated}/${quality.registered} aprobados` : ''}
    </p>
  );
}

function SummaryGroup({ group, sides, teamFilter }) {
  return (
    <article className="rounded-2xl border border-white/5 bg-white/[0.035] p-3">
      <div className="mb-2 grid grid-cols-[1fr_48px_48px] items-center gap-2 border-b border-white/5 pb-2">
        <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">{group.label}</p>
        <span className="text-right text-[8px] font-black text-caudal-electric">CAUDAL</span>
        <span className="text-right text-[8px] font-black text-red-200">RIVAL</span>
      </div>
      <div className="space-y-1.5">
        {group.keys.map((key) => {
          const field = fieldByKey.get(key);
          const ownDerived = calculateDelegatedDerivedStats(sides.caudal);
          const rivalDerived = calculateDelegatedDerivedStats(sides.rival);
          const own = key === 'shotAccuracy' ? ownDerived.shotAccuracy : sides.caudal[key];
          const rival = key === 'shotAccuracy' ? rivalDerived.shotAccuracy : sides.rival[key];
          const mode = key === 'shotAccuracy' ? 'percent' : 'total';
          return (
            <div key={key} className="grid grid-cols-[1fr_48px_48px] items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/[0.03]">
              <span className="text-[11px] font-bold text-slate-300">{field?.label}{key === 'goals' ? <small className="ml-1 text-[7px] font-black uppercase text-slate-600">Oficial</small> : null}</span>
              <span className="text-right text-sm font-black text-caudal-electric">{teamFilter === 'rival' || !sides.hasCaudal ? '—' : `${formatDelegatedNumber(own, mode)}${key === 'shotAccuracy' && own != null ? '%' : ''}`}</span>
              <span className="text-right text-sm font-black text-red-200">{teamFilter === 'caudal' || !sides.hasRival ? '—' : `${formatDelegatedNumber(rival, mode)}${key === 'shotAccuracy' && rival != null ? '%' : ''}`}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DerivedPanel({ sides }) {
  const rows = [
    ['Precisión de tiro', 'shotAccuracy', 'TAP / tiros', '%'],
    ['Efectividad de tiro', 'shotEffectiveness', 'goles / tiros', '%'],
    ['Efectividad sobre TAP', 'onTargetEffectiveness', 'goles / TAP', '%'],
    ['Acciones defensivas registradas', 'registeredDefensiveActions', 'robos + recuperaciones', ''],
    ['Balance de recuperación', 'recoveryBalance', 'robos + recuperaciones − pérdidas', ''],
  ];
  const own = calculateDelegatedDerivedStats(sides.caudal);
  const rival = calculateDelegatedDerivedStats(sides.rival);
  return (
    <article className="rounded-2xl border border-white/5 bg-black/15 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Indicadores derivados seguros</p>
      <div className="mt-2 divide-y divide-white/5">
        {rows.map(([label, key, formula, suffix]) => (
          <div key={key} className="grid grid-cols-[1fr_52px_52px] items-center gap-2 py-2">
            <span><span className="block text-[10px] font-bold text-slate-300">{label}</span><span className="block text-[8px] text-slate-600">{formula}</span></span>
            <span className="text-right text-xs font-black text-caudal-electric">{sides.hasCaudal ? `${formatDelegatedNumber(own[key], suffix ? 'percent' : 'total')}${own[key] == null ? '' : suffix}` : '—'}</span>
            <span className="text-right text-xs font-black text-red-200">{sides.hasRival ? `${formatDelegatedNumber(rival[key], suffix ? 'percent' : 'total')}${rival[key] == null ? '' : suffix}` : '—'}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function PlayerAvatar({ player, size = 'h-8 w-8' }) {
  const image = getPlayerImage(player);
  return image
    ? <img src={image} alt="" className={`${size} rounded-full object-cover ring-1 ring-white/10`} />
    : <span className={`${size} inline-flex items-center justify-center rounded-full bg-white/10 text-[10px] font-black text-slate-400`}>{getPlayerName(player).slice(0, 2).toUpperCase()}</span>;
}

function PlayerDetail({ row }) {
  const recentRows = row.recent.rows.filter((item) => RECENT_METRICS.includes(item.key));
  return (
    <div className="mt-3 rounded-2xl border border-caudal-electric/15 bg-[#071123] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={row.player} size="h-12 w-12" />
          <div><p className="text-base font-black text-white">{getPlayerName(row.player)}</p><p className="text-[11px] font-bold text-slate-500">{row.matchesPlayed ?? '—'} PJ · {row.minutesReliable ? `${formatDelegatedNumber(row.minutes)} min` : 'minutos no disponibles'}</p></div>
        </div>
        {!row.participationReliable ? <span className="rounded-lg bg-amber-300/10 px-2 py-1 text-[9px] font-black uppercase text-amber-200">Participación incompleta</span> : null}
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-5">
        {PROFILE_GROUPS.map((group) => (
          <section key={group.label} className="rounded-xl bg-white/[0.035] p-3">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{group.label}</p>
            <div className="mt-2 grid grid-cols-[1fr_42px_48px_48px] gap-2 text-right text-[9px] font-black text-slate-600"><span /><span>TOTAL</span><span>MEDIA/P</span><span>POR90</span></div>
            {group.keys.map((key) => (
              <div key={key} className="grid grid-cols-[1fr_42px_48px_48px] items-center gap-2 border-t border-white/5 py-1.5 text-right text-[10px]">
                <span className="text-left font-bold text-slate-300">{fieldByKey.get(key)?.short}</span>
                <span className="font-black text-white">{formatDelegatedNumber(row.stats[key])}</span>
                <span className="font-black text-caudal-electric">{formatDelegatedNumber(row.average?.[key], 'average')}</span>
                <span className="font-black text-sky-200">{formatDelegatedNumber(row.per90?.[key], 'per90')}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <section className="mt-3 rounded-xl bg-black/15 p-3">
        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white">Últimos 5 vs temporada</p>
        {!row.recent.sufficient ? <p className="mt-2 text-[11px] text-slate-500">Muestra insuficiente para comparar tendencia reciente.</p> : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {recentRows.map((item) => (
              <div key={item.key} className="rounded-lg bg-white/[0.035] px-3 py-2">
                <p className="text-[9px] font-black uppercase text-slate-500">{item.short}/partido</p>
                <div className="mt-1 flex items-end justify-between gap-2"><span className="text-sm font-black text-white">{formatDelegatedNumber(item.recent, 'average')}</span><span className="text-[10px] text-slate-500">Temp. {formatDelegatedNumber(item.season, 'average')}</span></div>
                <p className="mt-1 text-[10px] font-black text-caudal-electric">{getArrow(item.difference)} {signed(item.difference)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TemporalChart({ temporal, metric }) {
  const max = Math.max(1, ...temporal.rows.flatMap((row) => [row.caudal, row.rival]));
  return (
    <div>
      <p className="text-[10px] font-black text-slate-300">{fieldByKey.get(metric)?.label} por tramo</p>
      <div className="mt-3 space-y-2">
        {temporal.rows.map((row) => (
          <div key={row.period} className="grid grid-cols-[52px_1fr_28px_1fr_28px] items-center gap-2 text-[10px]">
            <span className="font-black text-slate-500">{row.period}</span>
            <span className="flex h-2 justify-end rounded-full bg-white/5"><span className="h-2 rounded-full bg-caudal-electric" style={{ width: `${(row.caudal / max) * 100}%` }} /></span>
            <span className="text-right font-black text-caudal-electric">{temporal.hasCaudal ? formatDelegatedNumber(row.caudal, temporal.mode) : '—'}</span>
            <span className="h-2 rounded-full bg-white/5"><span className="block h-2 rounded-full bg-red-300" style={{ width: `${(row.rival / max) * 100}%` }} /></span>
            <span className="text-right font-black text-red-200">{temporal.hasRival ? formatDelegatedNumber(row.rival, temporal.mode) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemporalMatrix({ matrix, teamFilter }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full min-w-[720px] border-collapse text-[10px]">
        <thead className="bg-black/25 text-slate-500"><tr><th className="sticky left-0 bg-[#071123] px-3 py-2 text-left">Métrica</th>{matrix.periods.map((period) => <th key={period} className="px-2 py-2 text-center">{period}</th>)}</tr></thead>
        <tbody>
          {matrix.rows.map((row) => {
            const max = Math.max(1, ...row.values.flatMap((value) => [value.caudal, value.rival]));
            return (
              <tr key={row.key} className="border-t border-white/5">
                <th title={row.label} className="sticky left-0 bg-[#091428] px-3 py-2 text-left font-black text-slate-300">{row.short}</th>
                {row.values.map((value) => {
                  const primary = teamFilter === 'rival' ? value.rival : value.caudal;
                  const opacity = Math.min(0.2, (Number(primary) / max) * 0.2);
                  return (
                    <td key={value.period} className="px-2 py-2 text-center" style={{ backgroundColor: `rgba(46, 230, 166, ${opacity})` }}>
                      {teamFilter !== 'rival' ? <span className="font-black text-caudal-electric">{formatDelegatedNumber(value.caudal, matrix.mode)}</span> : null}
                      {teamFilter === 'todos' ? <span className="mx-1 text-slate-600">/</span> : null}
                      {teamFilter !== 'caudal' ? <span className="text-red-200">{formatDelegatedNumber(value.rival, matrix.mode)}</span> : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HalfComparison({ comparison }) {
  return (
    <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
      {comparison.rows.map((row) => (
        <div key={row.key}>
          <div className="flex items-center justify-between text-[10px]"><span className="font-black text-slate-300">{row.label}</span><span className="text-slate-500">{row.first} · {row.second}</span></div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <div className="flex h-5 justify-end overflow-hidden rounded-l-md bg-white/5"><span className="flex h-full items-center justify-end bg-caudal-electric/25 pr-1 text-[8px] font-black text-caudal-electric" style={{ width: `${row.firstPercent || 0}%` }}>{row.firstPercent == null ? '—' : `${formatDelegatedNumber(row.firstPercent, 'percent')}%`}</span></div>
            <div className="h-5 overflow-hidden rounded-r-md bg-white/5"><span className="flex h-full items-center bg-sky-300/20 pl-1 text-[8px] font-black text-sky-200" style={{ width: `${row.secondPercent || 0}%` }}>{row.secondPercent == null ? '—' : `${formatDelegatedNumber(row.secondPercent, 'percent')}%`}</span></div>
          </div>
          <div className="mt-0.5 flex justify-between text-[8px] font-black uppercase text-slate-600"><span>1ª parte</span><span>2ª parte</span></div>
        </div>
      ))}
    </div>
  );
}

function ContextComparison({ rows }) {
  return (
    <div className={`grid gap-2 ${rows.length === 3 ? 'lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {rows.map((row) => (
        <article key={row.key} className="rounded-xl border border-white/5 bg-white/[0.035] p-3">
          <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase text-white">{row.label}</p><span className="text-[9px] font-bold text-slate-500">{row.matchCount} partidos</span></div>
          {!row.hasSample ? <p className="mt-2 text-[10px] text-slate-600">Sin muestra suficiente.</p> : (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {CONTEXT_METRICS.map((key) => <div key={key} className="rounded-lg bg-black/15 px-2 py-1.5 text-center"><span className="block text-[8px] font-black text-slate-600">{fieldByKey.get(key)?.short}/P</span><span className="text-xs font-black text-caudal-electric">{formatDelegatedNumber(row.average?.[key], 'average')}</span></div>)}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function DataReadings({ readings }) {
  return (
    <section className="rounded-2xl border border-white/5 bg-black/15 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Lecturas de los datos</p>
      {!readings.length ? <p className="mt-2 text-[11px] text-slate-500">Muestra insuficiente para detectar tendencias.</p> : (
        <div className="mt-2 grid gap-2 lg:grid-cols-3">
          {readings.map((reading) => <div key={reading.key} className="rounded-xl bg-white/[0.035] px-3 py-2"><span className="text-[8px] font-black uppercase tracking-[0.12em] text-caudal-electric">{reading.source}</span><p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-300">{reading.text}</p></div>)}
        </div>
      )}
    </section>
  );
}

function SelectedMatchComparison({ comparison }) {
  const visibleRows = comparison.rows.filter((row) => row.selected != null || row.average != null);
  return (
    <section className="rounded-2xl border border-white/5 bg-black/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Partido seleccionado vs media de la muestra</p><p className="mt-1 text-[10px] text-slate-500">Comparación descriptiva, sin valorar automáticamente el signo de la diferencia.</p></div>
        <span className="text-[9px] font-bold text-slate-500">{comparison.sample} partidos en la muestra</span>
      </div>
      {!comparison.sufficient ? <p className="mt-2 text-[10px] text-slate-500">La muestra necesita al menos 5 partidos para mostrar una media comparativa fiable.</p> : null}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[10px]">
          <thead className="text-slate-600"><tr><th className="py-2 text-left">Métrica</th><th>Partido</th><th>Media muestra</th><th>Diferencia</th></tr></thead>
          <tbody>{visibleRows.map((row) => {
            const difference = row.sufficient && row.selected != null ? Number(row.selected) - Number(row.average) : null;
            return <tr key={row.key} className="border-t border-white/5 text-center"><th title={row.label} className="py-2 text-left font-black text-slate-300">{row.short}{row.source === 'official' || row.key === 'goals' ? <small className="ml-1 text-[7px] uppercase text-slate-600">Oficial</small> : null}</th><td className="font-black text-white">{formatDelegatedNumber(row.selected)}</td><td>{formatDelegatedNumber(row.average, 'average')}</td><td className="font-black text-slate-300">{difference == null ? '—' : signed(difference)}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function EvolutionLineChart({ rows, compareSides, formatMatchDate, compact = false }) {
  const width = 920;
  const height = compact ? 180 : 270;
  const padX = 42;
  const padY = 26;
  const valueSets = compareSides
    ? [rows.map((row) => row.caudalValue), rows.map((row) => row.rivalValue), rows.map((row) => row.caudalMovingAverage)]
    : [rows.map((row) => row.value), rows.map((row) => row.movingAverage)];
  const numeric = valueSets.flat().filter((value) => value != null && Number.isFinite(Number(value)));
  const max = Math.max(1, ...numeric.map(Number));
  const point = (value, index) => {
    const x = rows.length <= 1 ? width / 2 : padX + (index / (rows.length - 1)) * (width - padX * 2);
    const y = height - padY - (Number(value) / max) * (height - padY * 2);
    return `${x},${y}`;
  };
  const lineSegments = (values) => {
    const segments = [];
    let current = [];
    values.forEach((value, index) => {
      if (value == null || !Number.isFinite(Number(value))) {
        if (current.length) segments.push(current);
        current = [];
      } else {
        current.push(point(value, index));
      }
    });
    if (current.length) segments.push(current);
    return segments;
  };
  const labelStep = Math.max(1, Math.ceil(rows.length / 7));
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-black/15 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px]" role="img" aria-label="Evolución partido a partido">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height - padY - ratio * (height - padY * 2);
          return <g key={ratio}><line x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(255,255,255,.06)" /><text x={padX - 8} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9">{formatDelegatedNumber(max * ratio, 'average')}</text></g>;
        })}
        {compareSides ? lineSegments(rows.map((row) => row.rivalValue)).map((points, index) => <polyline key={`rival-${index}`} points={points.join(' ')} fill="none" stroke="#fca5a5" strokeWidth="2" />) : null}
        {lineSegments(rows.map((row) => compareSides ? row.caudalValue : row.value)).map((points, index) => <polyline key={`main-${index}`} points={points.join(' ')} fill="none" stroke="#2ee6a6" strokeWidth="2.5" />)}
        {rows.length >= 5 ? lineSegments(rows.map((row) => compareSides ? row.caudalMovingAverage : row.movingAverage)).map((points, index) => <polyline key={`moving-${index}`} points={points.join(' ')} fill="none" stroke="#7dd3fc" strokeWidth="2" strokeDasharray="6 5" />) : null}
        {rows.map((row, index) => {
          const value = compareSides ? row.caudalValue : row.value;
          if (value == null) return null;
          const [cx, cy] = point(value, index).split(',');
          return <circle key={row.matchId} cx={cx} cy={cy} r="4" fill="#2ee6a6"><title>{`${row.match.round ? `${row.match.round} · ` : ''}${row.opponent}\n${formatMatchDate(row.date)}\nValor: ${formatDelegatedNumber(value, row.normalized ? 'per90' : 'average')}\nMedia móvil 5: ${formatDelegatedNumber(compareSides ? row.caudalMovingAverage : row.movingAverage, 'average')}`}</title></circle>;
        })}
        {rows.map((row, index) => index % labelStep === 0 || index === rows.length - 1 ? <text key={row.matchId} x={rows.length <= 1 ? width / 2 : padX + (index / Math.max(1, rows.length - 1)) * (width - padX * 2)} y={height - 6} textAnchor="middle" fill="#64748b" fontSize="9">{row.match.round || row.opponent.slice(0, 8)}</text> : null)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 px-2 text-[9px] font-black uppercase text-slate-500"><span><i className="mr-1 inline-block h-0.5 w-4 bg-caudal-electric align-middle" />Caudal</span>{compareSides ? <span><i className="mr-1 inline-block h-0.5 w-4 bg-red-300 align-middle" />Rival</span> : null}{rows.length >= 5 ? <span><i className="mr-1 inline-block w-4 border-t-2 border-dashed border-sky-300 align-middle" />Media móvil 5</span> : null}</div>
    </div>
  );
}

export default function DelegatedStatsDashboard({
  matches = [],
  players = [],
  filters,
  onFiltersChange,
  getPlayerName: displayPlayerName = getPlayerName,
  getCompetitionLabel = (key) => key,
  formatMatchDate = (value) => value,
  initialView = 'Resumen',
}) {
  const [view, setView] = useState(initialView);
  const [matchId, setMatchId] = useState('');
  const [competitionKey, setCompetitionKey] = useState('all');
  const [venue, setVenue] = useState('all');
  const [result, setResult] = useState('all');
  const [scope, setScope] = useState('season');
  const [sort, setSort] = useState({ key: 'matchesPlayed', direction: 'desc' });
  const [playerMode, setPlayerMode] = useState('average');
  const [detailPlayerId, setDetailPlayerId] = useState('');
  const [temporalMetric, setTemporalMetric] = useState('shots');
  const [temporalMode, setTemporalMode] = useState('total');
  const [contextDimension, setContextDimension] = useState('venue');
  const [evolutionMetric, setEvolutionMetric] = useState('shots');
  const [evolutionMode, setEvolutionMode] = useState('total');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  useEffect(() => {
    setPlayerMode(matchId ? 'total' : 'average');
    setTemporalMode('total');
  }, [matchId]);

  const effectiveFilters = { ...filters, matchId, competitionKey, venue, result, scope };
  const dataset = useMemo(() => buildDelegatedStatsDataset({ matches, filters: effectiveFilters }), [matches, filters, matchId, competitionKey, venue, result, scope]);
  const validatedMatches = dataset.validatedMatches;
  const quality = useMemo(() => getDelegatedRegistryQuality(dataset.matches), [dataset.matches]);
  const hasUnprocessedValidatedMatch = validatedMatches.length > 0 && quality.registered > 0 && quality.validated === 0 && quality.pending > 0;
  const sides = useMemo(() => aggregateDelegatedSides(dataset.events, dataset.sampleEvents), [dataset.events, dataset.sampleEvents]);
  const officialScore = useMemo(() => buildDelegatedOfficialTeamScore(validatedMatches), [validatedMatches]);
  const officialGoalEvents = useMemo(() => buildDelegatedOfficialGoalEvents(validatedMatches, filters), [validatedMatches, filters]);
  const displaySides = useMemo(() => {
    const eventAllowsGoals = !filters.eventType || ['todos', 'gol'].includes(filters.eventType);
    const periodScoped = filters.period && filters.period !== 'todos';
    const goals = periodScoped
      ? {
        caudal: officialGoalEvents.filter((event) => event.equipo === 'caudal').length,
        rival: officialGoalEvents.filter((event) => event.equipo === 'rival').length,
      }
      : officialScore.totals;
    return {
      ...sides,
      caudal: { ...sides.caudal, goals: eventAllowsGoals && officialScore.reliable ? goals.caudal : 0 },
      rival: { ...sides.rival, goals: eventAllowsGoals && officialScore.reliable ? goals.rival : 0 },
      hasCaudal: sides.hasCaudal || officialScore.reliable,
      hasRival: sides.hasRival || officialScore.reliable,
    };
  }, [sides, officialGoalEvents, officialScore, filters.eventType, filters.period]);
  const playerRows = useMemo(() => buildDelegatedPlayerRows({ events: dataset.events, matches: validatedMatches, players, selectedPlayerId: filters.playerId, filters: effectiveFilters }), [dataset.events, validatedMatches, players, filters, matchId, competitionKey, venue, result, scope]);
  const selectedPlayerRow = filters.playerId ? playerRows.find((row) => row.playerId === filters.playerId) || null : null;
  const detailPlayer = playerRows.find((row) => row.playerId === detailPlayerId) || null;
  const rankings = useMemo(() => buildDelegatedRankings(playerRows), [playerRows]);
  const competitionOptions = useMemo(() => [...new Set(matches.map(getDelegatedMatchCompetitionKey))], [matches]);
  const orderedMatchOptions = useMemo(() => matches.slice().sort((left, right) => `${left.date || ''}T${left.time || ''}`.localeCompare(`${right.date || ''}T${right.time || ''}`)), [matches]);
  const matchCount = validatedMatches.length;
  const selectedSide = filters.team === 'rival' ? 'rival' : 'caudal';
  const teamProfile = useMemo(() => buildDelegatedTeamProfile({ events: dataset.events, matches: validatedMatches, sampleEvents: dataset.sampleEvents, matchCount, side: selectedSide, filters }), [dataset.events, dataset.sampleEvents, validatedMatches, matchCount, selectedSide, filters]);
  const temporal = useMemo(() => buildDelegatedTemporalDistribution(temporalMetric === 'goals' ? officialGoalEvents : dataset.events, temporalMetric, matchCount, temporalMode, temporalMetric === 'goals' ? officialGoalEvents : dataset.sampleEvents), [dataset.events, dataset.sampleEvents, officialGoalEvents, temporalMetric, temporalMode, matchCount]);
  const temporalMatrix = useMemo(() => buildDelegatedTemporalMatrix(dataset.events, matchCount, temporalMode, dataset.sampleEvents, officialGoalEvents), [dataset.events, dataset.sampleEvents, officialGoalEvents, matchCount, temporalMode]);
  const halves = useMemo(() => buildDelegatedHalfComparison(dataset.events, selectedSide, dataset.sampleEvents, officialGoalEvents), [dataset.events, dataset.sampleEvents, officialGoalEvents, selectedSide]);
  const contexts = useMemo(() => buildDelegatedContextComparison({ matches, filters: effectiveFilters, dimension: contextDimension }), [matches, filters, matchId, competitionKey, venue, result, scope, contextDimension]);
  const readings = useMemo(() => buildDelegatedDataReadings({ matches, filters: effectiveFilters }), [matches, filters, matchId, competitionKey, venue, result, scope]);
  const evolution = useMemo(() => buildDelegatedEvolution({ matches, filters: effectiveFilters, scope, competitionKey, metric: evolutionMetric, mode: evolutionMode, players }), [matches, players, filters, matchId, competitionKey, venue, result, scope, evolutionMetric, evolutionMode]);
  const evolutionComparison = useMemo(() => buildDelegatedEvolutionComparison(evolution), [evolution]);
  const trendRows = useMemo(() => RECENT_METRICS.map((key) => ({ key, ...buildDelegatedEvolutionComparison(buildDelegatedEvolution({ matches, filters: effectiveFilters, scope, competitionKey, metric: key, mode: evolutionMode, players })) })), [matches, players, filters, matchId, competitionKey, venue, result, scope, evolutionMode]);
  const selectedMatchComparison = useMemo(() => buildDelegatedMatchSampleComparison({ matches, filters: effectiveFilters, players }), [matches, players, filters, matchId, competitionKey, venue, result, scope]);

  const getSortValue = (row, key) => {
    if (key === 'minutes') return row.minutesReliable ? row.minutes : null;
    if (key === 'matchesPlayed') return row.matchesPlayed;
    if (key === 'shotAccuracy') return row.derived.shotAccuracy;
    const source = playerMode === 'average' ? row.average : playerMode === 'per90' ? row.per90 : row.stats;
    return source?.[key] ?? null;
  };
  const orderedPlayers = playerRows.slice().sort((left, right) => {
    const leftValue = getSortValue(left, sort.key);
    const rightValue = getSortValue(right, sort.key);
    if (leftValue == null && rightValue != null) return 1;
    if (rightValue == null && leftValue != null) return -1;
    const direction = sort.direction === 'asc' ? 1 : -1;
    if (leftValue !== rightValue) return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    return displayPlayerName(left.player).localeCompare(displayPlayerName(right.player), 'es');
  });
  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
  const sortMark = (key) => sort.key === key ? (sort.direction === 'desc' ? ' ↓' : ' ↑') : '';
  const renderPlayerValue = (row, field) => {
    if (field.key === 'shotAccuracy') return `${formatDelegatedNumber(row.derived.shotAccuracy, 'percent')}${row.derived.shotAccuracy == null ? '' : '%'}`;
    const source = playerMode === 'average' ? row.average : playerMode === 'per90' ? row.per90 : row.stats;
    return formatDelegatedNumber(source?.[field.key], playerMode);
  };
  const changeFilter = (key, value) => onFiltersChange({ ...filters, [key]: value });
  const compareEvolutionSides = filters.team === 'todos' && !filters.playerId;
  const hasSelectedSideSample = filters.team === 'rival' ? displaySides.hasRival : filters.team === 'caudal' ? displaySides.hasCaudal : displaySides.hasCaudal || displaySides.hasRival;
  const secondaryFilterCount = [result !== 'all', Boolean(filters.playerId), filters.team !== 'todos', filters.eventType !== 'todos', filters.period !== 'todos', scope !== 'season'].filter(Boolean).length;
  const singleMatchMode = Boolean(matchId);
  const formatMatchOption = (match) => {
    const round = String(match.round || match.matchday || match.jornada || '').trim();
    const roundLabel = round ? (/^j(?:ornada)?\s*/i.test(round) ? round : `J${round}`) : '';
    return [roundLabel, formatMatchDate(match.date), match.opponent || 'Rival'].filter(Boolean).join(' · ');
  };
  const teamProfileCards = singleMatchMode
    ? [
      ['Goles · oficial', teamProfile.officialScore.totals?.[selectedSide]],
      ['Goles recibidos · oficial', teamProfile.officialScore.totals?.[selectedSide === 'caudal' ? 'rival' : 'caudal']],
      ['Tiros', teamProfile.totals.shots],
      ['TAP', teamProfile.totals.shotsOnTarget],
      ['Centros', teamProfile.totals.crosses],
      ['Córners', teamProfile.totals.corners],
      ['TAP %', teamProfile.derived.shotAccuracy],
      ['Acc. defensivas', teamProfile.totals.steals + teamProfile.totals.recoveries],
    ]
    : [
      ['Goles/p · oficial', teamProfile.officialScore.average?.[selectedSide]],
      ['Goles recibidos/p · oficial', teamProfile.officialScore.average?.[selectedSide === 'caudal' ? 'rival' : 'caudal']],
      ['Tiros/p', teamProfile.average?.shots],
      ['TAP/p', teamProfile.average?.shotsOnTarget],
      ['Centros/p', teamProfile.average?.crosses],
      ['Córners/p', teamProfile.average?.corners],
      ['TAP %', teamProfile.derived.shotAccuracy],
      ['Acc. defensivas/p', teamProfile.average ? teamProfile.average.steals + teamProfile.average.recoveries : null],
    ];

  return (
    <section className="rounded-3xl border border-white/5 bg-[#091428]/90 p-3 shadow-glow sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Panel estadístico delegado</p><SampleLine matches={validatedMatches} events={dataset.events} playerRow={selectedPlayerRow} quality={quality} /></div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-black/20 p-1">{VIEWS.map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] ${view === item ? 'bg-caudal-electric text-slate-950' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{item}</button>)}</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-600">
        <span>Oficial · goles, asistencias y minutos</span><span>Registro delegado · acciones</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_minmax(170px,1fr)_auto]">
        <select aria-label="Partido" value={matchId} onChange={(event) => setMatchId(event.target.value)} className={selectorClass}><option value="">Todos los partidos</option>{orderedMatchOptions.map((match) => <option key={match.id} value={match.id}>{formatMatchOption(match)}</option>)}</select>
        <select aria-label="Competición" value={competitionKey} onChange={(event) => setCompetitionKey(event.target.value)} className={selectorClass}><option value="all">Todas las competiciones</option>{competitionOptions.map((key) => <option key={key} value={key}>{getCompetitionLabel(key)}</option>)}</select>
        <select aria-label="Local o visitante" value={venue} onChange={(event) => setVenue(event.target.value)} className={selectorClass}><option value="all">Local y visitante</option><option value="home">Local</option><option value="away">Visitante</option></select>
        <button type="button" aria-expanded={showMoreFilters} onClick={() => setShowMoreFilters((current) => !current)} className="whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-300 hover:border-caudal-electric/30 hover:text-white">Más filtros{secondaryFilterCount ? ` · ${secondaryFilterCount}` : ''}</button>
      </div>
      {showMoreFilters ? (
        <div className="mt-2 grid gap-2 rounded-2xl border border-white/5 bg-black/15 p-2 sm:grid-cols-2 lg:grid-cols-3">
          <select aria-label="Resultado" value={result} onChange={(event) => setResult(event.target.value)} className={selectorClass}><option value="all">Todos los resultados</option><option value="win">Victoria</option><option value="draw">Empate</option><option value="loss">Derrota</option></select>
          <select aria-label="Jugador" value={filters.playerId} onChange={(event) => { const playerId = event.target.value; const selectedEvent = DELEGATED_EVENT_CATALOG.find((item) => item.type === filters.eventType); onFiltersChange({ ...filters, playerId, team: playerId ? 'caudal' : filters.team, eventType: playerId && selectedEvent && !selectedEvent.requiresPlayer ? 'todos' : filters.eventType }); }} className={selectorClass}><option value="">Todos los jugadores</option>{players.map((player) => <option key={player.id} value={player.id}>{displayPlayerName(player)}</option>)}</select>
          <select aria-label="Equipo" value={filters.team} disabled={Boolean(filters.playerId)} onChange={(event) => changeFilter('team', event.target.value)} className={`${selectorClass} disabled:cursor-not-allowed disabled:opacity-50`}><option value="todos">Caudal y rival</option><option value="caudal">Caudal</option><option value="rival">Rival</option></select>
          <select aria-label="Evento" value={filters.eventType} onChange={(event) => changeFilter('eventType', event.target.value)} className={selectorClass}><option value="todos">Todos los eventos</option>{DELEGATED_EVENT_CATALOG.filter((item) => !filters.playerId || item.requiresPlayer).map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select>
          <select aria-label="Tramo" value={filters.period} onChange={(event) => changeFilter('period', event.target.value)} className={selectorClass}><option value="todos">Todo el partido</option>{DELEGATED_PERIODS.map((period) => <option key={period} value={period}>{period}'</option>)}</select>
          <select aria-label="Muestra" value={scope} onChange={(event) => setScope(event.target.value)} className={selectorClass}>{DELEGATED_EVOLUTION_SCOPES.map((item) => <option key={item} value={item}>{item === 'season' ? 'Temporada' : `Últ. ${item}`}</option>)}</select>
        </div>
      ) : null}

      {!dataset.events.length ? <div className="mt-3"><EmptyState>{hasUnprocessedValidatedMatch ? 'El partido figura como Validado, pero sus eventos siguen pendientes. Vuelve a validarlo para procesar y recargar sus eventos.' : officialScore.reliable ? 'Hay datos oficiales en esta muestra, pero no acciones del Registro Delegado con estos filtros.' : hasSelectedSideSample ? 'La muestra existe, pero no se registró esta acción en los filtros seleccionados.' : 'No hay eventos validados que coincidan con estos filtros.'}</EmptyState></div> : null}

      {view === 'Resumen' ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{SUMMARY_GROUPS.map((group) => <SummaryGroup key={group.label} group={group} sides={displaySides} teamFilter={filters.team} />)}</div>
          {filters.team === 'todos' && !displaySides.hasRival ? <EmptyState>Sin datos suficientes del rival.</EmptyState> : null}
          <div className="grid gap-3 xl:grid-cols-[0.85fr_1.15fr]">
            <DerivedPanel sides={displaySides} />
            <article className="rounded-2xl border border-white/5 bg-black/15 p-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Destacados con registro</p>{!rankings.length ? <p className="mt-2 text-[11px] text-slate-500">No hay valores positivos para generar destacados.</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{rankings.slice(0, 8).map((ranking) => <div key={ranking.key} className="rounded-xl bg-white/[0.035] px-3 py-2"><p className="text-[8px] font-black uppercase text-slate-500">{ranking.label}</p><p className="mt-1 truncate text-xs font-black text-white">{ranking.leaders.map((row) => displayPlayerName(row.player)).join(' · ')}</p><p className="text-sm font-black text-caudal-electric">{formatDelegatedNumber(ranking.value)}</p></div>)}</div>}</article>
          </div>
        </div>
      ) : null}

      {view === 'Jugadores' ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-slate-500">{singleMatchMode ? 'Solo aparecen jugadores con minutos en el partido seleccionado. G, A y MIN proceden de Estadísticas/POST.' : 'PJ y minutos proceden exclusivamente de Estadísticas/POST. Pulsa una fila para abrir el perfil.'}</p><Segmented label="Modo de estadísticas de jugador" value={playerMode} onChange={setPlayerMode} options={singleMatchMode ? [["total", "Total"], ["per90", "Por90"]] : [["total", "Total"], ["average", "Media/partido"], ["per90", "Por90"]]} /></div>
          <div className="mt-2 max-h-[680px] overflow-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[1180px] border-collapse text-[11px]">
              <thead className="sticky top-0 z-20 bg-[#071123] text-[8px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="sticky left-0 z-30 bg-[#071123] px-3 py-2.5 text-left">Jugador</th><th title="Partidos realmente jugados según Estadísticas/POST" onClick={() => toggleSort('matchesPlayed')} className="cursor-pointer px-2 py-2.5">PJ{sortMark('matchesPlayed')}</th><th title="Minutos reales de Estadísticas/POST" onClick={() => toggleSort('minutes')} className="cursor-pointer px-2 py-2.5">MIN{sortMark('minutes')}</th>{PLAYER_COLUMNS.map((field) => <th key={field.key} title={field.label} onClick={() => toggleSort(field.key)} className="cursor-pointer px-2 py-2.5">{field.short}{sortMark(field.key)}</th>)}</tr></thead>
              <tbody>{orderedPlayers.map((row) => <tr key={row.playerId} onClick={() => setDetailPlayerId((current) => current === row.playerId ? '' : row.playerId)} className={`cursor-pointer border-t border-white/5 text-center text-slate-200 hover:bg-white/[0.035] ${detailPlayerId === row.playerId ? 'bg-caudal-electric/5' : ''}`}><td className="sticky left-0 bg-[#091428] px-3 py-2 text-left"><span className="flex items-center gap-2"><PlayerAvatar player={row.player} /><span className="font-black text-white">{displayPlayerName(row.player)}</span></span></td><td className="px-2 py-2 font-black">{row.matchesPlayed ?? '—'}</td><td className="px-2 py-2 font-bold">{row.minutesReliable ? formatDelegatedNumber(row.minutes) : '—'}</td>{PLAYER_COLUMNS.map((field) => <td key={field.key} className="px-2 py-2 font-bold tabular-nums">{renderPlayerValue(row, field)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {!orderedPlayers.length ? <div className="mt-2"><EmptyState>No hay jugadores con participación o acciones en esta muestra.</EmptyState></div> : null}
          {detailPlayer ? <PlayerDetail row={detailPlayer} /> : null}
          <p className="mt-2 text-[9px] text-slate-600">G Goles · A Asistencias · G+A Producción de gol (fuente oficial) · T Tiros · TAP Tiros a puerta · REG Regates · CEN Centros · PER Pérdidas · ROB Robos · REC Recuperaciones · FR Faltas realizadas · FREC Faltas recibidas.</p>
        </div>
      ) : null}

      {view === 'Equipo' ? (
        <div className="mt-3 space-y-3">
          <section className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
            <article className="rounded-2xl border border-white/5 bg-black/15 p-3"><div className="flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">{singleMatchMode ? 'Estadísticas del partido' : 'Medias por partido'} · {selectedSide}</p><span className="text-[9px] text-slate-500">{singleMatchMode ? 'Partido seleccionado' : `${teamProfile.matchCount} partidos con muestra`}</span></div><div className="mt-2 grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-4">{DELEGATED_STAT_FIELDS.map((field) => { const available = field.key === 'goals' ? teamProfile.officialScore.reliable : teamProfile.hasActionSample; return <div key={field.key} className="grid grid-cols-[1fr_auto] items-center border-t border-white/5 py-2"><span className="text-[10px] font-bold text-slate-400">{field.label}{field.key === 'goals' ? <small className="ml-1 text-[7px] uppercase text-slate-600">Oficial</small> : null}</span><span className="text-right"><b className="block text-sm text-white">{available ? formatDelegatedNumber(teamProfile.totals[field.key]) : '—'}</b>{!singleMatchMode ? <small className={`text-[9px] font-black ${selectedSide === 'rival' ? 'text-red-200' : 'text-caudal-electric'}`}>{formatDelegatedNumber(available ? teamProfile.average?.[field.key] : null, 'average')}{available ? '/p' : ''}</small> : null}</span></div>; })}</div></article>
            <article className="rounded-2xl border border-white/5 bg-black/15 p-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Perfil registrado · {selectedSide}</p><div className="mt-2 grid grid-cols-2 gap-2">{teamProfileCards.map(([label, value]) => <div key={label} className="rounded-lg bg-white/[0.035] px-3 py-2"><p className="text-[8px] font-black uppercase text-slate-500">{label}</p><p className={`mt-0.5 text-lg font-black ${selectedSide === 'rival' ? 'text-red-200' : 'text-caudal-electric'}`}>{formatDelegatedNumber(value, singleMatchMode ? 'total' : 'average')}{label.includes('%') && value != null ? '%' : ''}</p></div>)}</div><p className="mt-2 text-[9px] text-slate-600">Actividad defensiva registrada: robos + recuperaciones. Balance: robos + recuperaciones − pérdidas.</p></article>
          </section>

          <section className="rounded-2xl border border-white/5 bg-black/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white">Momento del partido</p><p className="text-[9px] text-slate-600">El minuto &gt;90 se agrupa en 76–90+. CAUDAL / RIVAL.</p></div><div className="flex gap-2"><select value={temporalMetric} onChange={(event) => setTemporalMetric(event.target.value)} className={selectorClass}>{DELEGATED_STAT_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select>{!singleMatchMode ? <Segmented label="Modo temporal" value={temporalMode} onChange={setTemporalMode} options={[["total", "Total"], ["average", "Media/partido"]]} /> : null}</div></div><div className="mt-3 grid gap-4 xl:grid-cols-[0.7fr_1.3fr]"><TemporalChart temporal={temporal} metric={temporalMetric} /><TemporalMatrix matrix={temporalMatrix} teamFilter={filters.team} /></div>{!temporal.hasRival ? <p className="mt-2 text-[10px] text-slate-500">No existen eventos rivales suficientes para comparar.</p> : null}</section>

          <section className={`grid gap-3 ${singleMatchMode ? '' : 'xl:grid-cols-2'}`}><article className="rounded-2xl border border-white/5 bg-black/15 p-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Primera vs segunda parte · {selectedSide}</p><div className="mt-3">{halves.hasSample ? <HalfComparison comparison={halves} /> : <EmptyState>Sin muestra suficiente para distribuir por partes.</EmptyState>}</div></article>{!singleMatchMode ? <article className="rounded-2xl border border-white/5 bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Contextos · medias por partido</p><select value={contextDimension} onChange={(event) => setContextDimension(event.target.value)} className={selectorClass}><option value="venue">Local / Visitante</option><option value="result">Victoria / Empate / Derrota</option><option value="competition">Liga / Otras</option><option value="recent">Últimos 5 / Temporada</option></select></div><div className="mt-3"><ContextComparison rows={contexts} /></div></article> : null}</section>
          {!singleMatchMode ? <DataReadings readings={readings} /> : null}
        </div>
      ) : null}

      {view === 'Evolución' ? (
        <div className="mt-3 space-y-3">
          {singleMatchMode ? <SelectedMatchComparison comparison={selectedMatchComparison} /> : <>
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white">Evolución partido a partido</p><p className="text-[9px] text-slate-600">Con 2–4 partidos se muestra una serie simple; la media móvil de 5 aparece desde el quinto.</p></div><div className="flex flex-wrap gap-2"><select value={evolutionMetric} onChange={(event) => setEvolutionMetric(event.target.value)} className={selectorClass}>{filters.playerId ? <option value="minutes">Minutos</option> : null}{(filters.playerId ? DELEGATED_PLAYER_STAT_FIELDS : DELEGATED_STAT_FIELDS).map((field) => <option key={field.key} value={field.key}>{field.label}{field.source === 'official' || field.key === 'goals' ? ' · oficial' : ''}</option>)}</select>{filters.playerId ? <Segmented label="Modo de evolución individual" value={evolutionMode} onChange={setEvolutionMode} options={[["total", "Total partido"], ["per90", "Por90"]]} /> : null}</div></div>
            {!evolution.length ? <EmptyState>No hay partidos validados para esta muestra.</EmptyState> : evolution.length === 1 ? <article className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3"><p className="text-[9px] font-black uppercase text-slate-500">Muestra actual: 1 partido · Las tendencias aparecerán a partir de 5 partidos</p><div className="mt-1 flex items-end justify-between gap-3"><span className="text-sm font-black text-white">{evolution[0].opponent} · {formatMatchDate(evolution[0].date)}</span><span className="text-2xl font-black text-caudal-electric">{formatDelegatedNumber(evolution[0].value, evolution[0].normalized ? 'per90' : 'average')}</span></div></article> : <><EvolutionLineChart rows={evolution} compareSides={compareEvolutionSides} formatMatchDate={formatMatchDate} compact={evolution.length < 5} />{evolution.length < 5 ? <p className="text-[10px] text-slate-500">{evolution.length} partidos registrados. Aún no existe muestra suficiente para media móvil 5.</p> : null}</>}
            {evolutionComparison.sufficient ? <section className="rounded-2xl border border-white/5 bg-black/15 p-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Tendencia reciente · temporada vs últimos 5</p><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[620px] text-[10px]"><thead className="text-slate-600"><tr><th className="py-2 text-left">Métrica</th><th>Temporada</th><th>Últ. 5</th><th>Diferencia</th><th>Diferencia %</th></tr></thead><tbody>{trendRows.map((row) => <tr key={row.key} className="border-t border-white/5 text-center"><th className="py-2 text-left font-black text-slate-300">{fieldByKey.get(row.key)?.label}/p</th>{row.sufficient ? <><td>{formatDelegatedNumber(row.season, 'average')}</td><td className="font-black text-white">{formatDelegatedNumber(row.recent, 'average')}</td><td className="font-black text-caudal-electric">{getArrow(row.difference)} {signed(row.difference)}</td><td>{row.percentDifference == null ? '—' : `${signed(row.percentDifference, 'percent')}%`}</td></> : <td colSpan="4" className="text-slate-600">Muestra insuficiente</td>}</tr>)}</tbody></table></div></section> : null}
          </>}
          {filters.playerId ? <p className="text-[10px] text-slate-500">Evolución individual: los partidos sin participación real se muestran sin punto; Por90 solo aparece con minutos fiables.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
