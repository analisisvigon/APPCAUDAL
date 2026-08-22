import React from 'react';

const rows = (value) => Array.isArray(value) ? value : [];
const formatMinutes = (value) => Math.round(Math.max(0, Number(value || 0))).toLocaleString('es-ES');

const PlayerPositionUsageSummary = ({ usage, className = '' }) => {
  const positions = rows(usage?.positions);
  const unknownMinutes = Math.max(0, Number(usage?.unknownMinutes || 0));

  return (
    <section
      className={`rounded-[1.5rem] border border-white/10 bg-[#091428]/70 p-4 shadow-[0_14px_45px_rgba(0,0,0,0.14)] sm:p-5 ${className}`.trim()}
      data-player-position-usage
      data-total-minutes={Number(usage?.totalMinutes || 0)}
      data-unknown-minutes={unknownMinutes}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Posiciones utilizadas</h3>
          <p className="mt-1 text-xs text-slate-500">Distribución real de minutos según datos tácticos registrados.</p>
        </div>
        {usage?.determinedMinutes > 0 ? (
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{formatMinutes(usage.determinedMinutes)}' identificados</span>
        ) : null}
      </div>

      {positions.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-3 py-3 text-xs text-slate-400">
          Sin información posicional suficiente
        </p>
      ) : positions.length === 1 ? (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-caudal-electric/15 bg-white/[0.035] px-4 py-3"
          data-position={positions[0].position}
          data-minutes={positions[0].minutes}
          data-percentage={positions[0].percentage}
        >
          <strong className="text-sm text-white">{positions[0].position}</strong>
          <span className="text-sm font-black text-caudal-electric">{formatMinutes(positions[0].minutes)}' · {positions[0].percentage}%</span>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {positions.map((position, index) => (
            <div
              key={position.position}
              data-position={position.position}
              data-minutes={position.minutes}
              data-percentage={position.percentage}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <strong className="truncate text-slate-100">{position.position}</strong>
                  {index === 0 ? <span className="rounded-full bg-caudal-electric/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-caudal-electric">Más utilizada</span> : null}
                </div>
                <span className="shrink-0 font-black text-slate-300">{formatMinutes(position.minutes)}' · {position.percentage}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-caudal-electric" style={{ width: `${Math.max(0, Math.min(100, Number(position.percentage || 0)))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {positions.length > 0 && unknownMinutes > 0 ? (
        <p className="mt-3 text-[10px] font-bold text-amber-200/80">{formatMinutes(unknownMinutes)}' sin posición registrada</p>
      ) : null}
    </section>
  );
};

export default PlayerPositionUsageSummary;
