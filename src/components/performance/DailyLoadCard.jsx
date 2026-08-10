import { useEffect, useState } from 'react';

import {
  PERFORMANCE_SESSION_TYPES,
  buildDailyLoadDraft,
  getPerformanceSessionTypeLabel,
  validateDailyLoad,
} from '../../utils/performanceLoad';

const NUMBER_FIELDS = [
  { key: 'actualDurationMinutes', label: 'Volumen', suffix: 'min', inputMode: 'numeric' },
  { key: 'distanceKm', label: 'Distancia', suffix: 'km', inputMode: 'decimal' },
  { key: 'hsrM', label: 'HSR', suffix: 'm', inputMode: 'decimal' },
  { key: 'accelerations', label: 'ACC', suffix: '', inputMode: 'numeric' },
  { key: 'decelerations', label: 'DCC', suffix: '', inputMode: 'numeric' },
  { key: 'sprints', label: 'Sprint', suffix: '', inputMode: 'numeric' },
  { key: 'metersPerMinute', label: 'M/min', suffix: '', inputMode: 'decimal' },
];

function formatLongCalendarDate(value) {
  if (!value) return 'Fecha sin seleccionar';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function formatMetric(value, options = {}) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: options.minimumFractionDigits || 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(number);
}

function RpeAutomaticSummary({ averageRpe, responseCount, compact = false }) {
  const hasResponses = Number.isFinite(averageRpe) && responseCount > 0;
  return (
    <div className={`rounded-2xl border border-amber-300/15 bg-amber-300/[0.055] ${compact ? 'px-3 py-2.5' : 'p-4'}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-200">RPE medio</p>
      <p className={`${compact ? 'mt-1 text-lg' : 'mt-2 text-2xl'} font-black text-white`}>
        {hasResponses ? averageRpe.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : 'Sin respuestas'}
      </p>
      <p className="mt-1 text-[10px] font-bold text-slate-500">
        {hasResponses ? `${responseCount} ${responseCount === 1 ? 'respuesta' : 'respuestas'}` : 'Sin datos RPE para la fecha'}
      </p>
      <p className="mt-1 text-[8px] font-black uppercase tracking-[0.16em] text-amber-200/70">Automático</p>
    </div>
  );
}

export default function DailyLoadCard({
  date,
  load,
  averageRpe = null,
  rpeResponseCount = 0,
  saving = false,
  onSave,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => buildDailyLoadDraft(load, date));
  const [validationErrors, setValidationErrors] = useState({});
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDraft(buildDailyLoadDraft(load, date));
    setEditing(false);
    setValidationErrors({});
    setSaveError('');
  }, [date, load]);

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setValidationErrors((current) => ({ ...current, [field]: '' }));
    setSaveError('');
  };

  const startEditing = () => {
    setDraft(buildDailyLoadDraft(load, date));
    setValidationErrors({});
    setSaveError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(buildDailyLoadDraft(load, date));
    setValidationErrors({});
    setSaveError('');
    setEditing(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = validateDailyLoad(draft);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }
    setSaveError('');
    try {
      await onSave(draft);
      setEditing(false);
    } catch (error) {
      setValidationErrors(error.validationErrors || {});
      setSaveError(error.message || 'No se pudo guardar la carga diaria.');
    }
  };

  const session = load?.session || null;
  const metrics = load?.metrics || null;
  const summaryMetrics = metrics ? [
    [session?.actual_duration_minutes, 'min', 0],
    [metrics.distance_m === null || metrics.distance_m === undefined ? null : Number(metrics.distance_m) / 1000, 'km', 2],
    [metrics.hsr_m, 'HSR', 2],
    [metrics.accelerations, 'ACC', 0],
    [metrics.decelerations, 'DCC', 0],
    [metrics.sprints, 'Sprint', 0],
    [metrics.meters_per_minute, 'm/min', 2],
  ].filter(([value]) => value !== null && value !== undefined) : [];

  return (
    <section
      aria-label="Carga del día"
      className="rounded-[1.75rem] border border-sky-300/15 bg-[#091428] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.16)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Carga del día</p>
          <h3 className="mt-1 text-lg font-black capitalize text-white">{formatLongCalendarDate(date)}</h3>
        </div>
        {session && !editing ? (
          <span className="rounded-full border border-sky-300/20 bg-sky-300/[0.07] px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-sky-200">
            {getPerformanceSessionTypeLabel(session.session_type)}
          </span>
        ) : null}
      </div>

      {!editing && !load ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center">
          <p className="text-sm font-bold text-slate-400">Sin carga registrada.</p>
          <button
            type="button"
            onClick={startEditing}
            className="mt-4 rounded-xl border border-sky-300/25 bg-sky-300/[0.08] px-4 py-2.5 text-xs font-black text-sky-100 transition hover:bg-sky-300/[0.14]"
          >
            Registrar carga
          </button>
        </div>
      ) : null}

      {!editing && load ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <div className="flex flex-wrap gap-2">
              {summaryMetrics.map(([value, suffix, decimals], index) => (
                <div key={`${suffix}-${index}`} className="min-w-24 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                  <p className="text-base font-black text-white">{formatMetric(value, { maximumFractionDigits: decimals })}</p>
                  <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{suffix}</p>
                </div>
              ))}
              {!summaryMetrics.length ? <p className="text-sm text-slate-500">Sin métricas físicas registradas.</p> : null}
            </div>
            {session?.notes ? (
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-3">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Observaciones</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-300">{session.notes}</p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={startEditing}
              className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:bg-white/[0.08]"
            >
              Editar
            </button>
          </div>
          <RpeAutomaticSummary averageRpe={averageRpe} responseCount={rpeResponseCount} />
        </div>
      ) : null}

      {editing ? (
        <form className="mt-5" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="sm:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Tipo de sesión</span>
              <select
                value={draft.sessionType}
                onChange={(event) => updateDraft('sessionType', event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0c1930] px-3 py-3 text-sm font-bold text-white outline-none focus:border-sky-300/35"
              >
                {PERFORMANCE_SESSION_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {validationErrors.sessionType ? <span className="mt-1 block text-[10px] text-rose-200">{validationErrors.sessionType}</span> : null}
            </label>

            {NUMBER_FIELDS.map((field) => (
              <label key={field.key} className={field.key === 'actualDurationMinutes' ? 'sm:col-span-2' : ''}>
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{field.label}</span>
                <span className="mt-2 flex items-center rounded-xl border border-white/10 bg-white/[0.035] focus-within:border-sky-300/35">
                  <input
                    type="text"
                    inputMode={field.inputMode}
                    value={draft[field.key]}
                    onChange={(event) => updateDraft(field.key, event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-700"
                    placeholder={draft.sessionType === 'rest' ? 'Opcional' : ''}
                    aria-invalid={Boolean(validationErrors[field.key])}
                  />
                  {field.suffix ? <span className="pr-3 text-[10px] font-black text-slate-500">{field.suffix}</span> : null}
                </span>
                {validationErrors[field.key] ? <span className="mt-1 block text-[10px] text-rose-200">{validationErrors[field.key]}</span> : null}
              </label>
            ))}

            <div className="sm:col-span-2 lg:col-span-2">
              <RpeAutomaticSummary averageRpe={averageRpe} responseCount={rpeResponseCount} compact />
            </div>

            <label className="sm:col-span-2 lg:col-span-4">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Observaciones</span>
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft('notes', event.target.value)}
                rows={4}
                className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-700 focus:border-sky-300/35"
                placeholder="Observaciones de la sesión"
              />
            </label>
          </div>

          {saveError ? <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2.5 text-xs text-rose-100">{saveError}</p> : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black text-slate-400 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl border border-sky-300/30 bg-sky-300/[0.12] px-4 py-2.5 text-xs font-black text-sky-100 transition hover:bg-sky-300/[0.18] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar carga'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
