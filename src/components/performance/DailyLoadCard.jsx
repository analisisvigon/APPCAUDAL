import { useEffect, useRef, useState } from 'react';

import {
  PERFORMANCE_SESSION_TYPES,
  buildDailyLoadDraft,
  getPerformanceSessionTypeLabel,
  getRpeCoverage,
  validateDailyLoad,
} from '../../utils/performanceLoad';

const EXTERNAL_METRIC_FIELDS = [
  { key: 'distanceKm', label: 'Distancia', suffix: 'km', inputMode: 'decimal' },
  { key: 'hsrM', label: 'HSR', suffix: 'm', inputMode: 'decimal' },
  { key: 'metersPerMinute', label: 'M/min', suffix: 'm/min', inputMode: 'decimal' },
  { key: 'accelerations', label: 'ACC', suffix: '', inputMode: 'numeric' },
  { key: 'decelerations', label: 'DCC', suffix: '', inputMode: 'numeric' },
  { key: 'sprints', label: 'Sprint', suffix: '', inputMode: 'numeric' },
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

function SessionTypeIcon({ type }) {
  const commonProps = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (type === 'match') {
    return <svg {...commonProps}><circle cx="12" cy="12" r="8" /><path d="m9.5 9 2.5-1.5L14.5 9l-.8 3H10.3zM7 14l3.3-2M17 14l-3.3-2M12 7.5V4" /></svg>;
  }
  if (type === 'rest') {
    return <svg {...commonProps}><path d="M18 16.5A7 7 0 0 1 9.2 6a6 6 0 1 0 8.8 10.5Z" /></svg>;
  }
  return <svg {...commonProps}><path d="M4 15h3l2-6 4 10 2-7 2 3h3" /></svg>;
}

function RpeAutomaticSummary({ averageRpe, responseCount, activePlayerCount, compact = false }) {
  const hasResponses = Number.isFinite(averageRpe) && responseCount > 0;
  const coverage = getRpeCoverage(responseCount, activePlayerCount);
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-300/[0.10] via-caudal-electric/[0.045] to-transparent ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-sky-300/[0.08] blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-sky-200">RPE medio</p>
          <p className={`${compact ? 'mt-1 text-2xl' : 'mt-2 text-3xl'} font-black tracking-tight text-white`}>
            {hasResponses ? (
              <>{averageRpe.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm text-slate-500">/10</span></>
            ) : 'Sin respuestas'}
          </p>
        </div>
        {coverage.isLowCoverage ? (
          <span className="rounded-full border border-slate-300/15 bg-white/[0.05] px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-300">
            Cobertura baja
          </span>
        ) : null}
      </div>
      <div className="relative mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-xs font-black text-slate-200">
            {hasResponses
              ? coverage.hasReliableTotal
                ? `${coverage.responses} de ${coverage.total} jugadores`
                : `${coverage.responses} ${coverage.responses === 1 ? 'respuesta' : 'respuestas'}`
              : 'Sin datos RPE para la fecha'}
          </p>
          {hasResponses && coverage.hasReliableTotal ? (
            <p className="mt-0.5 text-[10px] font-bold text-slate-500">{coverage.percentage}% de respuestas</p>
          ) : null}
        </div>
        <p className="text-[8px] font-black uppercase tracking-[0.15em] text-sky-200/70">Automático · Google Forms</p>
      </div>
    </div>
  );
}

export default function DailyLoadCard({
  date,
  load,
  averageRpe = null,
  rpeResponseCount = 0,
  activePlayerCount = null,
  saving = false,
  onSave,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => buildDailyLoadDraft(load, date));
  const [validationErrors, setValidationErrors] = useState({});
  const [saveError, setSaveError] = useState('');
  const notesRef = useRef(null);

  useEffect(() => {
    setDraft(buildDailyLoadDraft(load, date));
    setEditing(false);
    setValidationErrors({});
    setSaveError('');
  }, [date, load]);

  useEffect(() => {
    if (!editing || !notesRef.current) return;
    const textarea = notesRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
  }, [editing, draft.notes]);

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
    { value: metrics.distance_m === null || metrics.distance_m === undefined ? null : Number(metrics.distance_m) / 1000, label: 'Distancia', suffix: 'km', decimals: 2 },
    { value: metrics.hsr_m, label: 'HSR', suffix: 'm', decimals: 2 },
    { value: metrics.meters_per_minute, label: 'M/min', suffix: '', decimals: 2 },
    { value: metrics.accelerations, label: 'ACC', suffix: '', decimals: 0 },
    { value: metrics.decelerations, label: 'DCC', suffix: '', decimals: 0 },
    { value: metrics.sprints, label: 'Sprint', suffix: '', decimals: 0 },
  ] : [];

  return (
    <section
      aria-label="Carga del día"
      className="rounded-[1.75rem] border border-sky-300/15 bg-[#091428] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.16)] sm:p-6"
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Carga del día</p>
        <h3 className="mt-1 text-lg font-black capitalize text-white">{formatLongCalendarDate(date)}</h3>
      </div>

      {!editing && !load ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-5 py-5 text-center">
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
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-white/[0.07] pb-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.07] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-sky-100">
              <SessionTypeIcon type={session?.session_type} />
              {getPerformanceSessionTypeLabel(session?.session_type)}
            </span>
            {session?.actual_duration_minutes !== null && session?.actual_duration_minutes !== undefined ? (
              <span className="text-sm font-black text-white">
                {formatMetric(session.actual_duration_minutes, { maximumFractionDigits: 0 })} <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">min</span>
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.65fr)]">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {summaryMetrics.map(({ value, label, suffix, decimals }) => (
                <div key={label} className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</p>
                  <p className={`mt-1.5 font-black text-white ${value === null || value === undefined ? 'text-slate-600' : 'text-lg'}`}>
                    {value === null || value === undefined ? '—' : formatMetric(value, { maximumFractionDigits: decimals })}
                    {value !== null && value !== undefined && suffix ? <span className="ml-1 text-[10px] text-slate-500">{suffix}</span> : null}
                  </p>
                </div>
              ))}
            </div>
            <RpeAutomaticSummary
              averageRpe={averageRpe}
              responseCount={rpeResponseCount}
              activePlayerCount={activePlayerCount}
            />
          </div>

          {session?.notes ? (
            <div className="mt-4 border-t border-white/[0.07] pt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Observaciones</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-300">{session.notes}</p>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={startEditing}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:bg-white/[0.08]"
            >
              Editar
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <form className="mt-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-3 rounded-2xl border border-white/[0.07] bg-black/10 p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Tipo de sesión</span>
              <select
                value={draft.sessionType}
                onChange={(event) => updateDraft('sessionType', event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0c1930] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-sky-300/35"
              >
                {PERFORMANCE_SESSION_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {validationErrors.sessionType ? <span className="mt-1 block text-[10px] text-rose-200">{validationErrors.sessionType}</span> : null}
            </label>

            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Volumen</span>
              <span className="mt-1.5 flex items-center rounded-xl border border-white/10 bg-white/[0.035] focus-within:border-sky-300/35">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.actualDurationMinutes}
                  onChange={(event) => updateDraft('actualDurationMinutes', event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-black text-white outline-none placeholder:text-slate-700"
                  placeholder={draft.sessionType === 'rest' ? 'Opcional' : ''}
                  aria-invalid={Boolean(validationErrors.actualDurationMinutes)}
                />
                <span className="pr-3 text-[10px] font-black text-slate-500">min</span>
              </span>
              {validationErrors.actualDurationMinutes ? <span className="mt-1 block text-[10px] text-rose-200">{validationErrors.actualDurationMinutes}</span> : null}
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
            {EXTERNAL_METRIC_FIELDS.map((field) => (
              <label key={field.key} className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 focus-within:border-sky-300/25">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{field.label}</span>
                <span className="mt-1.5 flex min-w-0 items-center border-b border-white/10 focus-within:border-sky-300/35">
                  <input
                    type="text"
                    inputMode={field.inputMode}
                    value={draft[field.key]}
                    onChange={(event) => updateDraft(field.key, event.target.value)}
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-base font-black text-white outline-none placeholder:text-slate-700"
                    placeholder={draft.sessionType === 'rest' ? 'Opcional' : ''}
                    aria-invalid={Boolean(validationErrors[field.key])}
                  />
                  {field.suffix ? <span className="pl-1 text-[9px] font-black text-slate-500">{field.suffix}</span> : null}
                </span>
                {validationErrors[field.key] ? <span className="mt-1 block text-[10px] text-rose-200">{validationErrors[field.key]}</span> : null}
              </label>
            ))}
          </div>

          <div className="mt-3">
            <RpeAutomaticSummary
              averageRpe={averageRpe}
              responseCount={rpeResponseCount}
              activePlayerCount={activePlayerCount}
              compact
            />
          </div>

          <label className="mt-3 block">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Observaciones</span>
            <textarea
              ref={notesRef}
              value={draft.notes}
              onChange={(event) => updateDraft('notes', event.target.value)}
              rows={2}
              className="mt-1.5 min-h-[72px] max-h-56 w-full resize-none overflow-y-auto rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm leading-6 text-white outline-none placeholder:text-slate-700 focus:border-sky-300/35"
              placeholder="Observaciones de la sesión"
            />
          </label>

          {validationErrors.sessionDate ? <p className="mt-3 text-[10px] text-rose-200">{validationErrors.sessionDate}</p> : null}

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
