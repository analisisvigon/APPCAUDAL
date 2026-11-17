import { PLAYER_SESSION_AVAILABILITY_COLORS } from '../../utils/playerSessionAvailability.js';

const formatPercentage = (value) => `${Math.round(value)}%`;

export default function PlayerSessionAvailabilitySummary({
  summary,
  loading = false,
  error = '',
  contextAvailable = true,
  lifecycleVerified = false,
}) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-[#091428]/70 p-4 shadow-[0_14px_45px_rgba(0,0,0,0.14)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Disponibilidad en sesiones</h3>
          <p className="mt-1 text-xs text-slate-400">Estados guardados en sesiones confirmadas anteriores a hoy del equipo y temporada activos; no confirma asistencia efectiva.</p>
        </div>
        {summary ? (
          <span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-300">
            {summary.total} {summary.total === 1 ? 'sesión' : 'sesiones'}
          </span>
        ) : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-400">Cargando disponibilidad...</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-red-200">{error}</p> : null}
      {!loading && !error && !contextAvailable ? (
        <p className="mt-4 text-sm text-slate-400">Selecciona un equipo y una temporada para consultar las sesiones.</p>
      ) : null}
      {!loading && !error && contextAvailable && summary?.total === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Sin sesiones registradas.</p>
      ) : null}
      {!loading && !error && summary?.total > 0 ? (
        <>
          <div
            role="img"
            aria-label={summary.states.filter(({ count }) => count > 0)
              .map(({ label, percentage }) => `${label}: ${formatPercentage(percentage)}`).join(', ')}
            className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10"
          >
            {summary.states.filter(({ count }) => count > 0).map((state) => (
              <span
                key={state.key}
                style={{ backgroundColor: state.color, width: `${state.percentage}%` }}
                title={`${state.label}: ${formatPercentage(state.percentage)} (${state.count})`}
              />
            ))}
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.states.map((state) => (
              <li key={state.key} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white/[0.035] px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-300">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PLAYER_SESSION_AVAILABILITY_COLORS[state.key] }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{state.label}</span>
                    {state.key === 'available' ? (
                      <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                        {summary.explicitAvailableCount} explícitos · {summary.defaultAvailableCount} por defecto
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-black text-white">
                  {formatPercentage(state.percentage)} ({state.count})
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!lifecycleVerified && !loading && !error && summary?.total > 0 ? (
        <p role="status" className="mt-3 text-[11px] leading-5 text-amber-200/80">
          El ciclo de anulaciones y retiradas no está verificado; esas sesiones podrían seguir incluidas.
        </p>
      ) : null}
    </section>
  );
}
