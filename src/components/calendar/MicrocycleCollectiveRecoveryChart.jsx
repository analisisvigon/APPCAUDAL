const DAY = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });

function Series({ days, rows, label, keyName, min, color }) {
  const byDate = new Map(rows.map((row) => [row.day_date, row]));
  const available = rows.filter((row) => row[`${keyName}_state`] === 'available').length;
  return <section className="min-w-0 rounded-xl border border-white/10 bg-[#071221]/70 p-3"
    aria-label={`Evolución colectiva de ${label}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h5 className="text-xs font-black uppercase tracking-[0.13em] text-slate-100">{label}</h5>
      <span className="text-[10px] text-slate-400">Escala {min}–10 · {available}/7 días publicables</span>
    </div>
    <div className="mt-3 overflow-x-auto pb-1">
      <div className="grid min-w-[22rem] grid-cols-7 gap-1.5">
        {days.map((date) => {
          const row = byDate.get(date);
          const state = row?.[`${keyName}_state`] || 'absent';
          const value = state === 'available' ? Number(row[`${keyName}_average`]) : null;
          const shortDate = DAY.format(new Date(`${date}T12:00:00`));
          const detail = state === 'available' ? `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} / 10 · ${row[`${keyName}_responses`]} respuestas`
            : state === 'below_threshold' ? 'Menos de 5 jugadores; media oculta' : 'Sin datos acreditados';
          return <div key={date} className="min-w-0 text-center" title={`${date}: ${detail}`}>
            <div className="flex h-20 items-end justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] px-1 pt-1"
              aria-label={`${date}: ${detail}`}>
              {value === null ? <span className="mb-2 w-full border-t border-dashed border-slate-600" />
                : <div className={`w-full max-w-8 rounded-t ${color}`}
                  style={{ height: `${Math.max(3, value * 10)}%` }} />}
            </div>
            <strong className="mt-1.5 block text-[10px] uppercase text-slate-300">{shortDate}</strong>
            <span className="block text-[10px] tabular-nums text-slate-200">{value === null
              ? state === 'below_threshold' ? '<5' : '—'
              : value.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</span>
          </div>;
        })}
      </div>
    </div>
  </section>;
}

export default function MicrocycleCollectiveRecoveryChart({ days, rows = [], loading = false, error = '' }) {
  return <section className="rounded-2xl border border-violet-300/15 bg-[#0b1726]/75 p-3 sm:p-4"
    aria-label="RPE y Wellness colectivos">
    <h4 className="text-xs font-black uppercase tracking-[0.16em] text-violet-100">RPE y Wellness colectivos</h4>
    <p className="mt-1 text-[11px] text-slate-400">Medias diarias del equipo y temporada seleccionados. Cada indicador tiene su propia escala; solo se publica con cinco jugadores distintos.</p>
    {loading ? <p role="status" className="mt-3 text-sm text-slate-400">Consultando respuestas colectivas…</p>
      : error ? <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>
        : <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Series days={days} rows={rows} label="Esfuerzo percibido · RPE" keyName="rpe" min={1} color="bg-violet-400" />
          <Series days={days} rows={rows} label="Bienestar · Wellness" keyName="wellness" min={0} color="bg-cyan-400" />
        </div>}
  </section>;
}
