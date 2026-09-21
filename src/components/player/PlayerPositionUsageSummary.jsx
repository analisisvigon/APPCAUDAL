import React, { useState } from 'react';
import { buildPlayerPositionMapModel } from '../../utils/playerPositionMap';
import {
  buildPositionTimelineEntries,
  formatPositionSegmentRange,
  getPositionTimelineMatches,
} from '../../utils/playerPositionTimelinePresentation';

const formatMinutes = (value) => Math.round(Math.max(0, Number(value || 0))).toLocaleString('es-ES');
const displayDate = (value) => {
  const [year, month, day] = String(value || '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value || 'Sin fecha';
};
const markerStyle = {
  principal: { radius: 4.3, fill: '#20bfea', dot: 'border-caudal-electric bg-caudal-electric text-slate-950' },
  secondary: { radius: 3.7, fill: '#38bdf8', dot: 'border-sky-300 bg-sky-400 text-slate-950' },
  other: { radius: 3.2, fill: '#94a3b8', dot: 'border-slate-300 bg-slate-400 text-slate-950' },
};

const PositionPitch = ({ model, activePosition = '' }) => (
  <div className="mx-auto w-full max-w-[190px]" data-player-position-map>
    <p className="mb-2 text-center text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300/80">Ataque ↑</p>
    <svg viewBox="0 0 68 105" className="block h-auto w-full drop-shadow-[0_12px_25px_rgba(0,0,0,0.2)]" role="img" aria-label="Mapa de las posiciones utilizadas">
      <rect x="1" y="1" width="66" height="103" rx="4" fill="#0b5b46" stroke="#3f8f72" strokeWidth="1" />
      <g fill="none" stroke="#d7f5e7" strokeWidth="0.65" opacity="0.88">
        <rect x="5" y="5" width="58" height="95" />
        <line x1="5" y1="52.5" x2="63" y2="52.5" />
        <circle cx="34" cy="52.5" r="7" />
        <rect x="18" y="5" width="32" height="16" />
        <rect x="25" y="5" width="18" height="7" />
        <rect x="18" y="84" width="32" height="16" />
        <rect x="25" y="93" width="18" height="7" />
      </g>
      {model.markers.map((position) => {
        const presentation = markerStyle[position.level];
        const cx = 4 + position.coordinates.x * 60;
        const cy = 4 + position.coordinates.y * 97;
        return (
          <g
            key={position.position}
            className="transition-opacity"
            opacity={activePosition && activePosition !== position.position ? 0.3 : 1}
            data-position-map-marker={position.position}
            data-position-map-level={position.level}
            data-position-map-x={position.coordinates.x}
            data-position-map-y={position.coordinates.y}
          >
            <title>{position.levelLabel}: {position.position}, {formatMinutes(position.minutes)} minutos, {position.percentage}%</title>
            {position.level === 'principal' ? <circle cx={cx} cy={cy} r="6.4" fill="#20bfea" opacity="0.2" /> : null}
            <circle cx={cx} cy={cy} r={presentation.radius} fill={presentation.fill} stroke="#f8fafc" strokeWidth={position.level === 'principal' ? 1.15 : 0.8} />
            <text x={cx} y={cy + 1.15} textAnchor="middle" fill="#061426" fontSize="3.4" fontWeight="900">{position.markerNumber}</text>
          </g>
        );
      })}
    </svg>
  </div>
);

const PositionLegend = ({ model, usage, openPosition, onToggle }) => (
  <div className="min-w-0 space-y-2.5" aria-label="Distribución de posiciones">
    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Distribución</p>
    {buildPositionTimelineEntries(usage).map((entry) => {
      const position = model.positions.find((candidate) => candidate.position === entry.position);
      const level = position?.level || 'other';
      const presentation = markerStyle[level];
      const details = getPositionTimelineMatches(usage, entry.key);
      const isOpen = openPosition === entry.key;
      return (
        <div
          key={entry.key}
          className={`overflow-hidden rounded-xl border transition ${isOpen ? 'border-caudal-electric/25 bg-caudal-electric/[0.055]' : 'border-white/[0.07] bg-white/[0.025]'}`}
          data-position={entry.position}
          data-minutes={entry.minutes}
          data-percentage={entry.percentage}
          data-position-timeline-entry
        >
          <button
            type="button"
            className="grid min-h-11 w-full min-w-0 grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left"
            onClick={() => onToggle(isOpen ? '' : entry.key)}
            aria-expanded={isOpen}
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black ${position?.coordinates ? presentation.dot : 'border-slate-600 bg-transparent text-slate-400'}`}>
              {position?.coordinates ? position.markerNumber : '—'}
            </span>
            <span className="min-w-0">
              <span className={`block text-[9px] font-black uppercase tracking-[0.12em] ${level === 'principal' ? 'text-caudal-electric' : 'text-slate-500'}`}>{position?.levelLabel || 'Cobertura pendiente'}</span>
              <strong className="mt-0.5 block break-words text-xs leading-4 text-slate-100">{entry.position}</strong>
              <span className="mt-1 block text-[9px] font-bold text-slate-500">{isOpen ? 'Ocultar partidos ▴' : 'Ver partidos ▾'}</span>
            </span>
            <span className="shrink-0 text-right text-xs font-black text-slate-300">{formatMinutes(entry.minutes)}' · {entry.percentage}%</span>
          </button>
          {isOpen ? (
            <div className="border-t border-white/[0.07] px-2.5 pb-2.5 pt-2" data-position-timeline-details>
              {details.length ? <div className="space-y-2">
                {details.map((match) => (
                  <article key={match.matchId} className="rounded-lg bg-black/15 px-2.5 py-2">
                    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <strong className="min-w-0 break-words text-[11px] text-slate-100">{match.opponent || 'Rival no registrado'}</strong>
                      <span className="shrink-0 text-[9px] font-bold text-slate-500">{displayDate(match.date)}</span>
                    </div>
                    <p className="mt-0.5 text-[9px] text-slate-500">{[match.competition, match.venue, match.result].filter(Boolean).join(' · ')}</p>
                    <div className="mt-1.5 space-y-1">
                      {match.segments.map((segment, index) => (
                        <div key={`${match.matchId}-${segment.fromMinute}-${segment.toMinute}-${index}`} className="flex flex-wrap items-center justify-between gap-x-3 text-[10px]">
                          <span className="font-bold text-slate-300">{segment.system || 'Sistema —'} · {segment.identified ? entry.abbreviation : 'Posición —'}</span>
                          <span className="text-slate-400">{formatPositionSegmentRange(segment)} · {formatMinutes(segment.minutes)}'</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div> : <p className="text-[10px] text-slate-500">Sin detalle temporal disponible.</p>}
            </div>
          ) : null}
        </div>
      );
    })}
    {model.unmappedPositions.length ? (
      <p className="text-[9px] leading-4 text-slate-500">Las posiciones sin coordenada específica se conservan en la distribución sin inventar un punto táctico.</p>
    ) : null}
  </div>
);

const PlayerPositionUsageSummary = ({ usage, className = '', initialOpenPosition = '' }) => {
  const model = buildPlayerPositionMapModel(usage);
  const [openPosition, setOpenPosition] = useState(initialOpenPosition);
  const hasTimelineEntries = buildPositionTimelineEntries(usage).length > 0;

  return (
    <section
      className={`rounded-[1.5rem] border border-white/10 bg-[#091428]/70 p-4 shadow-[0_14px_45px_rgba(0,0,0,0.14)] sm:p-5 ${className}`.trim()}
      data-player-position-usage
      data-total-minutes={model.officialMinutes}
      data-identified-minutes={model.totalIdentifiedMinutes}
      data-unknown-minutes={model.unknownPositionMinutes}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Posiciones utilizadas</h3>
          <p className="mt-1 text-xs text-slate-500">Distribución real de minutos según datos tácticos registrados.</p>
        </div>
        {model.totalIdentifiedMinutes > 0 ? (
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{formatMinutes(model.totalIdentifiedMinutes)}' identificados de {formatMinutes(model.officialMinutes)}'</span>
        ) : null}
      </div>

      {model.empty ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-3 py-3 text-xs text-slate-400">Sin minutos registrados para este filtro.</p>
      ) : !hasTimelineEntries ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-3 py-3 text-xs text-slate-400">Sin información posicional suficiente para este filtro.</p>
      ) : (
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-[minmax(130px,0.62fr)_minmax(0,1.38fr)] lg:gap-5">
          <PositionPitch model={model} activePosition={openPosition} />
          <PositionLegend model={model} usage={usage} openPosition={openPosition} onToggle={setOpenPosition} />
        </div>
      )}

      {model.officialMinutes > 0 && model.unknownPositionMinutes > 0 ? (
        <p className="mt-3 text-[10px] font-bold text-amber-200/80">{formatMinutes(model.unknownPositionMinutes)}' sin posición registrada</p>
      ) : null}
    </section>
  );
};

export default PlayerPositionUsageSummary;
