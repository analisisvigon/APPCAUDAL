import { PLAYER_REALIZED_TRAINING_COLORS } from '../../utils/playerRealizedTrainingStats.js';

const formatPercentage = (value) => `${Math.round(value)}%`;

export default function PlayerRealizedTrainingSummary({
  summary,
  ready = false,
  loading = false,
  error = '',
  contextAvailable = true,
}) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-[#091428]/70 p-4 shadow-[0_14px_45px_rgba(0,0,0,0.14)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Entrenamientos realizados</h3>
          <p className="mt-1 text-xs text-slate-400">Sesiones marcadas expresamente como celebradas, con estado final revisado y del equipo y temporada activos.</p>
        </div>
        {summary ? (
          <span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-300">
            {summary.total} {summary.total === 1 ? 'entrenamiento' : 'entrenamientos'}
          </span>
        ) : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-400">Cargando entrenamientos realizados...</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-red-200">{error}</p> : null}
      {!loading && !error && !contextAvailable ? (
        <p className="mt-4 text-sm text-slate-400">Selecciona un equipo y una temporada para consultar los entrenamientos.</p>
      ) : null}
      {!loading && !error && contextAvailable && !ready ? (
        <p role="status" className="mt-4 text-sm text-amber-200">
          Este resumen requiere instalar el backend de realización y la estructura de ciclo de vida.
        </p>
      ) : null}
      {!loading && !error && contextAvailable && ready && summary?.total === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Sin sesiones marcadas como realizadas.</p>
      ) : null}
      {!loading && !error && contextAvailable && ready && summary?.total > 0 ? (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Entrenó (Disponible)', summary.states.find(({ key }) => key === 'available')?.count || 0],
              ['Trabajo adaptado', summary.states.find(({ key }) => key === 'adapted')?.count || 0],
              ['Ausencias', summary.states.find(({ key }) => key === 'absent')?.count || 0],
              ['Lesiones', summary.states.find(({ key }) => key === 'injured')?.count || 0],
              ['Primer equipo', summary.states.find(({ key }) => key === 'first_team')?.count || 0],
              ['Participación', formatPercentage(summary.participationPercentage)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>
          <div
            role="img"
            aria-label={summary.states.filter(({ count }) => count > 0)
              .map(({ label, percentage }) => `${label}: ${formatPercentage(percentage)}`).join(', ')}
            className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10"
          >
            {summary.states.filter(({ count }) => count > 0).map((state) => (
              <span key={state.key} style={{ backgroundColor: state.color, width: `${state.percentage}%` }} />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {summary.states.map((state) => (
              <li key={state.key} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span aria-hidden="true" className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: PLAYER_REALIZED_TRAINING_COLORS[state.key] }} />
                {state.label} · {state.count} ({formatPercentage(state.percentage)})
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">La participación incluye Disponible y Trabajo adaptado.</p>
        </>
      ) : null}
    </section>
  );
}
