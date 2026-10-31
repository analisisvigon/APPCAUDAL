import { useMemo, useState } from 'react';
import { PERFORMANCE_LOAD_METRIC_CONFIG } from '../../utils/performanceLoad.js';
import { summarizeMicrocyclePhysicalLoads } from '../../data/microcyclePhysicalLoads.js';

const formatValue = (value, config) => value === null ? '—'
  : Number(value).toLocaleString('es-ES', { maximumFractionDigits: config.decimals });

export default function MicrocyclePhysicalLoadChart({ days, rows = [], loading = false, error = '' }) {
  const [metricKey, setMetricKey] = useState('loadUnits');
  const config = PERFORMANCE_LOAD_METRIC_CONFIG.find((item) => item.key === metricKey)
    || PERFORMANCE_LOAD_METRIC_CONFIG[0];
  const summary = useMemo(() => summarizeMicrocyclePhysicalLoads(rows, days, config),
    [rows, days, config]);
  const maximum = Math.max(0, ...summary.daily.map((point) => point.value ?? 0));

  return <section className="rounded-2xl border border-emerald-300/20 bg-[#071a21]/75 p-3 sm:p-4"
    aria-label="Carga física registrada">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100">Carga física registrada</h4>
        <p className="mt-1 text-[11px] text-slate-400">Sesiones físicas vinculadas al equipo y temporada seleccionados</p>
      </div>
      <label className="text-[11px] font-bold text-slate-300">Indicador
        <select value={metricKey} onChange={(event) => setMetricKey(event.target.value)}
          className="ml-2 min-h-9 rounded-lg border border-white/15 bg-[#071221] px-2 text-xs text-white">
          {PERFORMANCE_LOAD_METRIC_CONFIG.map((item) =>
            <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
    </div>
    {loading ? <p role="status" className="mt-4 text-sm text-slate-400">Consultando cargas físicas…</p>
      : error ? <p role="alert" className="mt-4 text-sm text-rose-200">{error}</p>
        : !summary.sessionCount ? <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
          Todavía no hay datos físicos registrados para este microciclo</p>
          : <>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <strong className="text-2xl font-black tabular-nums text-white">
                {summary.value === null ? 'Sin dato acreditado' : `${formatValue(summary.value, config)} ${config.unit}`}
              </strong>
              <span className="text-xs text-slate-400">{config.aggregation === 'durationWeightedAverage'
                ? 'Media ponderada por duración' : 'Suma acreditada'} · {summary.covered} de {summary.sessionCount} sesiones</span>
            </div>
            {summary.partial ? <p className="mt-1 text-[11px] font-semibold text-amber-200">Cobertura parcial: hay sesiones sin este indicador.</p> : null}
            <p className="mt-1 text-[11px] text-slate-500">
              {summary.trainingCount} sesiones físicas sin partido · {summary.matchCount} sesiones físicas de partido
            </p>
            <div className="mt-4 overflow-x-auto pb-1">
              <div className="grid min-w-[34rem] grid-cols-7 gap-2">
                {summary.daily.map((point) => {
                  const date = new Date(`${point.date}T12:00:00`);
                  const height = point.value === null ? 0 : maximum > 0
                    ? Math.max(4, point.value / maximum * 100) : 4;
                  return <div key={point.date} className="min-w-0 text-center">
                    <div className="flex h-24 items-end justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 pt-2">
                      {point.value === null ? <span className="mb-2 h-px w-full border-t border-dashed border-slate-600" />
                        : <div className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-emerald-600 to-teal-300"
                          style={{ height: `${height}%` }} />}
                    </div>
                    <strong className="mt-2 block text-[10px] uppercase text-slate-300">
                      {date.toLocaleDateString('es-ES', { weekday: 'short' })}</strong>
                    <span className="block text-[10px] tabular-nums text-emerald-100">
                      {formatValue(point.value, config)}{point.value === null ? '' : ` ${config.unit}`}</span>
                    {point.sessionCount > 1 ? <span className="block text-[9px] text-slate-400">{point.sessionCount} sesiones</span> : null}
                    {point.partial ? <span className="block text-[9px] text-amber-200">Parcial</span> : null}
                  </div>;
                })}
              </div>
            </div>
          </>}
  </section>;
}
