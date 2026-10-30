import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listPlannedSessions, loadPlannedContexts, SESSION_RETIREMENT_BACKEND_VERIFIED } from '../../data/plannedSessionsStore.js';
import { chooseCalendarContext, scopeCalendarMatches } from '../../utils/teamCalendarContext.js';
import { MICROCYCLES_2B_BACKEND_VERIFIED, hydrateMicrocycleDraft,
  listSeasonMicrocyclePlans, loadMicrocycle2b, saveMicrocycle2b, verifyMicrocycleSave } from '../../data/microcycles2bStore.js';
import { buildTeamCalendarEvents, calendarLocalDateKey, calendarMonthDays,
  calendarWeekDays, calendarWeekSummary, shiftCalendarWeek } from '../../utils/teamCalendar.js';
import { clampMicrocycleDate, microcycleRangeLabel, seasonMicrocycleForDate, seasonMicrocycles } from '../../utils/microcycleIdentity.js';
import { microcycleDayIntensity, plannedMicrocycleMinutes } from '../../utils/microcyclePresentation.js';
import { plannedMdReferences } from '../../utils/microcycleMatchDays.js';
import MicrocyclePlanningPreview from './MicrocyclePlanningPreview.jsx';
import MicrocycleCopyDialog from './MicrocycleCopyDialog.jsx';

const FILTERS = [
  ['training', 'Entrenamientos'], ['league', 'Liga'], ['cup', 'Copa'],
  ['friendly', 'Amistosos'], ['other', 'Otros partidos'],
];
const tone = {
  training: 'border-sky-400/35 bg-sky-400/10 text-sky-100',
  league: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100',
  cup: 'border-amber-400/35 bg-amber-400/10 text-amber-100',
  friendly: 'border-violet-400/35 bg-violet-400/10 text-violet-100',
  other: 'border-slate-400/35 bg-slate-400/10 text-slate-100',
};
const plannedDayTone = (day, rows) => {
  if (day?.type === 'Partido' || rows.some((row) => row.kind !== 'training')) return 'border-fuchsia-400/45 bg-fuchsia-400/[0.08]';
  if (day?.type === 'Descanso') return 'border-slate-400/35 bg-slate-400/[0.06]';
  if (day?.type === 'Recuperación') return 'border-teal-400/45 bg-teal-400/[0.07]';
  if (day?.focus === 'Estratégico / ABP') return 'border-violet-400/45 bg-violet-400/[0.06]';
  if (day?.focus === 'Físico' || ['Alta', 'Muy alta'].includes(day?.intensity)) return 'border-amber-400/45 bg-amber-400/[0.07]';
  if (day?.intensity === 'Media') return 'border-sky-400/45 bg-sky-400/[0.07]';
  if (['Baja', 'Muy baja'].includes(day?.intensity)) return 'border-emerald-400/45 bg-emerald-400/[0.07]';
  return 'border-white/10 bg-white/[0.025]';
};
const hasDailyPlan = (day) => Boolean(day && [day.type, day.objective, day.focus,
  day.intensity, day.durationMinutes, day.observations].some(Boolean));
const intensityBarTone = (level, peak) => peak ? 'from-fuchsia-500 to-rose-400' : level >= 4
  ? 'from-orange-500 to-amber-300' : level === 3 ? 'from-sky-500 to-cyan-300'
    : level > 0 ? 'from-emerald-500 to-teal-300' : 'from-slate-700 to-slate-600';
const monthLabel = (date) => date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
const dateLabel = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export function WeeklyIntensityChart({ days, dailyPlan, grouped }) {
  return <section className="rounded-2xl border border-white/10 bg-[#071221]/70 p-3 sm:p-4"
    aria-label="Intensidad semanal prevista">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-200">Intensidad prevista</h4>
        <p className="mt-1 text-[11px] text-slate-500">Escala cualitativa de planificación · no representa RPE ni carga registrada</p></div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500"><span>Baja</span><span className="h-px w-8 bg-gradient-to-r from-emerald-400 to-amber-300" /><span>Alta</span></div>
    </div>
    <div className="mt-4 overflow-x-auto pb-1">
      <div className="grid min-w-[34rem] grid-cols-7 gap-2">
        {days.map((key) => {
          const day = dailyPlan?.[key];
          const hasMatch = (grouped.get(key) || []).some((event) => event.kind !== 'training');
          const intensity = microcycleDayIntensity(day, hasMatch);
          const date = new Date(`${key}T12:00:00`);
          return <div key={key} className="flex min-w-0 flex-col items-center">
            <div className="flex h-24 w-full items-end justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 pt-2">
              <div className={`w-full max-w-10 rounded-t-md bg-gradient-to-t ${intensityBarTone(intensity.level, intensity.peak)} transition-[height]`}
                style={{ height: `${Math.max(intensity.level ? 24 : 5, intensity.level * 18)}%` }}
                title={`${dateLabel(key)}: ${intensity.label}`} aria-label={`${dateLabel(key)}: ${intensity.label}`} />
            </div>
            <strong className="mt-2 text-[10px] uppercase tracking-wide text-slate-300">
              {date.toLocaleDateString('es-ES', { weekday: 'short' })}</strong>
            <span className={`mt-0.5 max-w-full truncate text-[10px] ${intensity.peak ? 'font-bold text-rose-200' : 'text-slate-500'}`}>{intensity.label}</span>
          </div>;
        })}
      </div>
    </div>
  </section>;
}

const outcomeLabel = { win: 'VICTORIA', draw: 'EMPATE', loss: 'DERROTA' };
const outcomeTone = { win: 'text-emerald-200', draw: 'text-amber-100', loss: 'text-rose-200' };
const statusLabel = {
  scheduled: 'Próximo partido', pending_result: 'Resultado pendiente',
  postponed: 'Aplazado', suspended: 'Suspendido', cancelled: 'Cancelado',
  played: 'Resultado pendiente',
};

export function EventButton({ event, onOpen, variant = 'month' }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [event.crest]);
  const isMatch = event.kind !== 'training';
  const isList = variant === 'list';
  const description = isMatch
    ? `${event.opponent}, ${event.label}${event.score ? `, ${event.score}${event.outcome ? ` ${outcomeLabel[event.outcome]}` : ''}` : ''}`
    : `${event.title}${event.cancelled ? ', ANULADA' : ''}${event.microcycle ? `, ${event.microcycle}` : ''}`;
  return <button type="button" onClick={() => onOpen(event)}
    className={`group flex min-w-0 w-full items-start gap-2 rounded-xl border text-left shadow-sm transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric ${isList ? 'p-3' : 'p-2'} ${isMatch ? 'border-l-[3px]' : ''} ${tone[event.kind]}`}
    aria-label={`Abrir ${event.label.toLowerCase()} ${description}, ${dateLabel(event.date)}`}>
    {isMatch ? <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/95 text-slate-700 ${isList ? 'h-12 w-12' : 'h-9 w-9'}`}>
      {event.crest && !imageFailed ? <img src={event.crest} alt={`Escudo de ${event.opponent}`} onError={() => setImageFailed(true)} className="h-full w-full object-contain p-1" />
        : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6"><path d="M12 2.5 20 5v6.5c0 5-3.1 8-8 10-4.9-2-8-5-8-10V5l8-2.5Z" /><path d="M8 10h8m-8 4h8" /></svg>}
    </span> : null}
    <span className="min-w-0 flex-1 space-y-1">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <strong className={`${isList ? 'text-sm' : 'text-xs'} min-w-0 font-black ${isMatch ? 'truncate' : 'whitespace-normal'}`} title={event.title}>{event.title}</strong>
        {!isMatch && event.cancelled ? <span className="rounded-md border border-amber-300/60 px-1.5 py-0.5 text-[10px] font-black text-amber-100">ANULADA</span> : null}
        {!isMatch && event.microcycle ? <span className="shrink-0 rounded-md border border-sky-300/45 bg-sky-300/20 px-1.5 py-0.5 text-[11px] font-black leading-none text-sky-50">{event.microcycle}</span> : null}
      </span>
      {isMatch ? <>
        {event.score ? <span className={`block text-sm font-black tabular-nums ${outcomeTone[event.outcome] || ''}`}>
          {event.score} {event.outcome ? <span className="text-[10px] tracking-wide">{outcomeLabel[event.outcome]}</span> : null}
        </span> : <span className="block text-[11px] font-semibold opacity-85">{statusLabel[event.status] || 'Partido pendiente'}</span>}
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-85">
          <span>{event.label}</span>{event.venue != null ? <span>· {event.venue ? 'Local' : 'Visitante'}</span> : null}
          <span>· {event.time || 'Hora pendiente'}</span>
        </span>
      </> : <>
        <span className="block text-[11px] opacity-85">{event.time || 'Hora pendiente'}
          {event.cancelled ? ' · Sin minutos activos' : variant === 'week' && event.durationKnown ? ` · ${event.durationMinutes} min` : ' · Entrenamiento'}</span>
        {variant === 'week' && event.objective ? <span className="block break-words text-[11px] leading-snug opacity-80"
          title={event.objective} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {event.objective}</span> : null}
      </>}
    </span>
  </button>;
}

const weekRangeLabel = (days) => {
  if (days.length !== 7) return '';
  const start = new Date(`${days[0]}T12:00:00`);
  const end = new Date(`${days[6]}T12:00:00`);
  const first = start.toLocaleDateString('es-ES', { day: 'numeric', month: 'long',
    ...(start.getFullYear() !== end.getFullYear() ? { year: 'numeric' } : {}) });
  const last = end.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${first} – ${last}`;
};

export function CalendarWeekView({ days, grouped, events, selectedDay, onSelectDay, onOpen, today, loading, error,
  onPreviewEditingChange, plan, planLoading, planError, planSaving, canWritePlan,
  onSavePlan, onReloadPlan, onCopyPlan, onOpenPerformance,
  sessionStatusVerified = true, copyAvailable = false, mdReferences = new Map(),
  mdLoading = false, mdError = false }) {
  const [editDayRequest, setEditDayRequest] = useState(0);
  const [editWeekRequest, setEditWeekRequest] = useState(0);
  const editorRef = useRef(null);
  const summary = calendarWeekSummary(events, days);
  const chosenDay = days.includes(selectedDay) ? selectedDay : '';
  const planDraft = plan && !planLoading && !planError ? hydrateMicrocycleDraft(plan, days) : null;
  const dailyPlan = planDraft?.days || {};
  const plannedCount = days.filter((key) => hasDailyPlan(dailyPlan[key])).length;
  const plannedMinutes = plannedMicrocycleMinutes(days, dailyPlan);
  const openEditor = (request) => {
    request();
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const editDay = (key) => {
    onSelectDay(key);
    openEditor(() => setEditDayRequest((current) => current + 1));
  };
  return <section className="space-y-4" aria-label="Microciclo semanal">
    <section className="overflow-hidden rounded-2xl border border-sky-300/15 bg-gradient-to-br from-sky-400/[0.08] via-white/[0.025] to-violet-400/[0.05] p-4 sm:p-5"
      aria-label="Resumen semanal">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Plan de la semana</p>
          {planLoading ? <p className="mt-2 text-sm text-slate-400">Consultando planificación…</p>
            : planError ? <p role="alert" className="mt-2 text-sm text-red-200">La planificación no se puede verificar ahora.</p>
              : planDraft ? <>
                <h3 className="mt-2 break-words text-xl font-black text-white sm:text-2xl">{planDraft.objective || 'Semana planificada'}</h3>
                <p className="mt-1 text-[11px] font-semibold text-emerald-200">Plan guardado · revisión {plan.revision}</p>
                {planDraft.priorities.length ? <div className="mt-3 flex flex-wrap gap-1.5">
                  {planDraft.priorities.map((priority) => <span key={priority}
                    className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 text-[11px] font-bold text-sky-100">{priority}</span>)}</div> : null}
                {planDraft.responsible ? <p className="mt-3 text-xs text-slate-400">Responsable · <strong className="text-slate-200">{planDraft.responsible}</strong></p> : null}
              </> : <><h3 className="mt-2 text-lg font-black text-white">Semana pendiente de planificar</h3>
                <p className="mt-1 text-sm text-slate-400">Define el objetivo y la distribución prevista de los siete días.</p></>}
        </div>
        {!planLoading && !planError && canWritePlan ? <button type="button"
          onClick={() => openEditor(() => setEditWeekRequest((current) => current + 1))}
          className="min-h-10 rounded-xl bg-sky-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-sky-300">
          {planDraft ? 'Editar planificación' : 'Planificar semana'}</button> : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Días planificados', `${plannedCount} / 7`],
          ['Entrenamientos', String(summary.sessions)], ['Partidos', String(summary.matches)],
          ['Minutos previstos', plannedMinutes ? `${plannedMinutes} min` : '—']].map(([label, value]) =>
          <div key={label} className="rounded-xl border border-white/[0.07] bg-black/10 px-3 py-2">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
            <strong className="mt-1 block text-base tabular-nums text-white">{value}</strong>
          </div>)}
      </div>
      {!sessionStatusVerified ? <p className="mt-2 text-[10px] text-slate-500">Las sesiones mostradas son visibles; su ciclo de vida aún no está verificado en esta vista.</p> : null}
      {planDraft || summary.matches > 0 ? <div className="mt-4"><WeeklyIntensityChart days={days} dailyPlan={dailyPlan} grouped={grouped} /></div> : null}
    </section>
    <div ref={editorRef}><MicrocyclePlanningPreview key={days[0]} days={days} selectedDay={selectedDay}
      onSelectDay={onSelectDay} onEditingChange={onPreviewEditingChange}
      plan={plan} loading={planLoading} error={planError} saving={planSaving}
      canWrite={canWritePlan} onSave={onSavePlan} onReload={onReloadPlan}
      showDailyOverview={false} editDayRequest={editDayRequest} editWeekRequest={editWeekRequest}
      hideReadView /></div>
    <details className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
      <summary className="cursor-pointer text-xs font-bold text-slate-300">Más acciones de planificación</summary>
      <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={onCopyPlan} disabled={!copyAvailable}
        className="min-h-10 rounded-lg border border-sky-300/35 px-3 py-2 text-xs font-bold text-sky-100 disabled:opacity-50">
        Copiar planificación</button>
      <button type="button" disabled title="Pendiente de integrar y verificar el flujo de plantillas en la interfaz"
        className="min-h-10 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-400 opacity-50">
        Guardar como plantilla</button>
      <button type="button" disabled title="Pendiente de integrar y verificar el flujo de plantillas en la interfaz"
        className="min-h-10 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-400 opacity-50">
        Utilizar plantilla</button>
      <span className="text-[11px] text-slate-500">Plantillas pendientes de integración en esta interfaz.</span>
      </div>
    </details>
    {!loading && !error ? <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {days.map((key) => {
          const rows = grouped.get(key) || [];
          const orderedRows = [...rows].sort((left, right) => Number(left.kind === 'training') - Number(right.kind === 'training'));
          const day = new Date(`${key}T12:00:00`);
          const planned = dailyPlan[key];
          const references = mdReferences.get(key) || [];
          const displayIntensity = microcycleDayIntensity(planned, rows.some((event) => event.kind !== 'training'));
          return <article key={key} className={`min-w-0 rounded-2xl border p-3 ${key === today
            ? 'ring-1 ring-sky-300/60 ' : ''}${plannedDayTone(planned, rows)}`}>
            <button type="button" onClick={() => onSelectDay(key)} aria-pressed={chosenDay === key}
              className={`mb-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${chosenDay === key ? 'bg-sky-400/15 text-white' : 'text-slate-200'}`}
              aria-label={`Ver detalle del ${dateLabel(key)}`}>
              <span className="text-xs font-black uppercase tracking-wide">{day.toLocaleDateString('es-ES', { weekday: 'long' })}</span>
              <span className="text-lg font-black tabular-nums">{day.getDate()}</span>
            </button>
            <div className="mb-2 space-y-1 px-2" aria-label={`Referencias MD del ${dateLabel(key)}`}>
              {references.length ? <p className="text-[9px] font-bold uppercase tracking-wide text-cyan-200/70">MD automático · calendario</p> : null}
              {references.map((reference) => <div key={reference.matchId}
                className="flex min-w-0 items-start gap-1.5 text-[10px] leading-tight">
                <span className="shrink-0 rounded-md border border-cyan-300/35 bg-cyan-300/10 px-1.5 py-0.5 font-black text-cyan-100">{reference.label}</span>
                <span className="min-w-0 break-words text-slate-400" title={`${dateLabel(reference.matchDate)} · ${reference.opponent}`}>
                  Partido {new Date(`${reference.matchDate}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })} · {reference.opponent}</span>
              </div>)}
              {!references.length ? <span className="text-[10px] text-slate-500">{mdError ? 'MD no disponible'
                : mdLoading ? 'Consultando MD…' : 'MD sin asignar'}</span> : null}
            </div>
            {hasDailyPlan(planned) || displayIntensity.peak ? <div className="mb-3 min-w-0 space-y-1.5 border-b border-white/10 px-2 pb-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {planned?.type ? <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-bold text-white">{planned.type}</span> : null}
                {displayIntensity.label !== 'Sin asignar' ? <span className={`rounded-md border px-1.5 py-0.5 ${displayIntensity.peak ? 'border-rose-300/35 text-rose-100' : 'border-white/15 text-slate-200'}`}
                  title="Intensidad prevista; no es RPE ni carga física">{displayIntensity.label}</span> : null}
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true"><span
                className={`block h-full rounded-full bg-gradient-to-r ${intensityBarTone(displayIntensity.level, displayIntensity.peak)}`}
                style={{ width: `${displayIntensity.level * 20}%` }} /></div>
              {planned?.objective ? <p className="break-words font-semibold text-white">{planned.objective}</p> : null}
              {planned?.focus ? <p className="break-words text-slate-300">Foco: {planned.focus}</p> : null}
              {planned?.durationMinutes ? <p className="text-slate-400">Previsto: {planned.durationMinutes} min</p> : null}
              {planned?.observations ? <p className="break-words text-slate-400" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{planned.observations}</p> : null}
            </div> : null}
            {orderedRows.length ? <div className="space-y-2">{orderedRows.map((event) =>
              <EventButton key={`${event.kind}-${event.id}`} event={event} onOpen={onOpen} variant="week" />)}</div>
              : !hasDailyPlan(planned) ? <p className="px-2 py-1 text-xs text-slate-500">Sin planificar</p> : null}
            {canWritePlan ? <button type="button" onClick={() => editDay(key)}
              className="mt-3 rounded-lg border border-white/15 px-2 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-300/10">
              {hasDailyPlan(planned) ? 'Editar día' : 'Planificar día'}</button> : null}
          </article>;
        })}
      </div>
      {summary.activeDays === 0 && plannedCount === 0 ? <p className="text-xs text-slate-500">Sin actividad ni planificación registrada esta semana.</p> : null}
    </> : null}
    <details className="rounded-2xl border border-white/10 bg-[#0b1a2d]/85 p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-black uppercase tracking-[0.16em] text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        Seguimiento físico
      </summary>
      <div className="mt-4 space-y-3 text-sm text-slate-300">
        <p>Los datos físicos todavía no están vinculados a este equipo y temporada. Consúltalos en Rendimiento sin atribuirlos a este microciclo.</p>
        {onOpenPerformance ? <button type="button" onClick={onOpenPerformance}
          className="min-h-10 rounded-xl border border-sky-300/40 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
          Ver en Rendimiento
        </button> : null}
      </div>
    </details>
  </section>;
}

export default function TeamCalendarSection({ client, clubId, membership, preferredContextId,
  matches, teams, onRefreshMatches, onOpenSession, onOpenMatch, onOpenPerformance,
  onOpenMicrocycle, onDirtyChange, mode = 'calendar', initialMicrocycleRequest = null }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [weekAnchor, setWeekAnchor] = useState(() => initialMicrocycleRequest?.date || calendarLocalDateKey());
  const [selectedWeekDay, setSelectedWeekDay] = useState(() => initialMicrocycleRequest?.date || '');
  const [previewEditing, setPreviewEditing] = useState(false);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [view, setView] = useState(mode === 'microcycles' ? 'week' : 'month');
  const [selectedDay, setSelectedDay] = useState('');
  const [enabled, setEnabled] = useState(() => Object.fromEntries(FILTERS.map(([key]) => [key, true])));
  const [sessions, setSessions] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [contextId, setContextId] = useState('');
  const [contextsLoading, setContextsLoading] = useState(true);
  const [contextsError, setContextsError] = useState('');
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [loadedPlanKey, setLoadedPlanKey] = useState('');
  const [planError, setPlanError] = useState('');
  const [planSaving, setPlanSaving] = useState(false);
  const [verifiedWriteContextId, setVerifiedWriteContextId] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [planLoadVersion, setPlanLoadVersion] = useState(0);
  const [seasonPlans, setSeasonPlans] = useState([]);
  const [seasonPlansError, setSeasonPlansError] = useState('');
  const [overviewVersion, setOverviewVersion] = useState(0);
  const [copyOpen, setCopyOpen] = useState(false);
  const [allWeeksOpen, setAllWeeksOpen] = useState(false);
  const [weekSearch, setWeekSearch] = useState('');
  const planSaveRef = useRef(false);
  const sessionLoadSeq = useRef(0);
  const matchLoadSeq = useRef(0);
  const [loading, setLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState('');
  const [matchError, setMatchError] = useState('');
  const selectedContext = contexts.find((row) => row.id === contextId) || null;
  const weekDays = useMemo(() => calendarWeekDays(weekAnchor), [weekAnchor]);
  const monday = weekDays[0];
  const currentMicrocycle = seasonMicrocycleForDate(selectedContext,
    monday < selectedContext?.starts_on ? selectedContext?.starts_on : monday);
  const validWeek = currentMicrocycle?.monday === monday;
  const planScopeRef = useRef('');
  planScopeRef.current = `${contextId}:${monday}`;
  const currentPlan = plan?.club_team_season_id === contextId && plan?.week_starts_on === monday ? plan : null;
  const planReady = loadedPlanKey === `${contextId}:${monday}:${planLoadVersion}`;
  const canWritePlan = verifiedWriteContextId === contextId && Boolean(contextId) &&
    selectedContext?.status === 'open' && validWeek;
  useEffect(() => { onDirtyChange?.(previewEditing); }, [onDirtyChange, previewEditing]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (mode !== 'microcycles' || !contextId) { setSeasonPlans([]); setSeasonPlansError(''); return undefined; }
    let cancelled = false;
    setSeasonPlans([]); setSeasonPlansError('');
    listSeasonMicrocyclePlans(client, contextId).then((rows) => {
      if (!cancelled) setSeasonPlans(rows);
    }).catch(() => {
      if (!cancelled) setSeasonPlansError('No se pudo consultar la planificación de la temporada.');
    });
    return () => { cancelled = true; };
  }, [client, contextId, mode, overviewVersion]);
  useEffect(() => {
    let cancelled = false;
    setVerifiedWriteContextId(''); setPermissionError('');
    if (!MICROCYCLES_2B_BACKEND_VERIFIED || !selectedContext ||
      selectedContext.status !== 'open' || membership?.is_active !== true) return () => { cancelled = true; };
    client.rpc('can_write_club_team_season', { target_club_team_season_id: contextId })
      .then(({ data, error: permissionFailure }) => {
        if (cancelled) return;
        if (permissionFailure) throw permissionFailure;
        if (data === true) setVerifiedWriteContextId(contextId);
      }).catch(() => {
        if (!cancelled) setPermissionError('No se pudieron comprobar tus permisos de escritura.');
      });
    return () => { cancelled = true; };
  }, [client, contextId, selectedContext?.status, membership?.is_active]);
  useEffect(() => {
    let cancelled = false;
    setContextsLoading(true); setContextsError(''); setContexts([]); setContextId(''); setSessions([]);
    loadPlannedContexts(client, clubId).then((rows) => {
      if (cancelled) return;
      setContexts(rows);
      const nextId = chooseCalendarContext(rows, preferredContextId);
      setContextId(nextId);
      if (mode === 'microcycles') {
        const context = rows.find((row) => row.id === nextId);
        const requested = initialMicrocycleRequest?.contextId === nextId ? initialMicrocycleRequest.date : null;
        const nextDate = clampMicrocycleDate(context, requested || calendarLocalDateKey());
        setWeekAnchor(nextDate);
        setSelectedWeekDay(requested && requested === nextDate ? requested : '');
      }
    }).catch(() => {
      if (!cancelled) setContextsError('No se pudieron verificar los equipos y temporadas autorizados.');
    }).finally(() => { if (!cancelled) setContextsLoading(false); });
    return () => { cancelled = true; };
  }, [client, clubId, preferredContextId, mode]);
  const refresh = useCallback(async (signal) => {
    const request = ++sessionLoadSeq.current;
    setLoading(true); setError('');
    try {
      const rows = contextId ? await listPlannedSessions(client, contextId) : [];
      if (!signal?.cancelled && request === sessionLoadSeq.current) setSessions(rows);
    } catch {
      if (!signal?.cancelled && request === sessionLoadSeq.current) {
        setSessions([]); setError('No se pudieron cargar las sesiones. Reintenta la actualización.');
      }
    } finally { if (!signal?.cancelled && request === sessionLoadSeq.current) setLoading(false); }
  }, [client, contextId]);
  useEffect(() => {
    const signal = { cancelled: false };
    refresh(signal);
    const request = ++matchLoadSeq.current;
    setMatchesLoading(Boolean(onRefreshMatches)); setMatchError('');
    Promise.resolve().then(() => onRefreshMatches?.({ shouldApply: () => !signal.cancelled && request === matchLoadSeq.current }))
      .catch(() => {
        if (!signal.cancelled && request === matchLoadSeq.current)
          setMatchError('No se pudieron actualizar los partidos.');
      }).finally(() => {
        if (!signal.cancelled && request === matchLoadSeq.current) setMatchesLoading(false);
      });
    return () => { signal.cancelled = true; };
  }, [refresh]);
  useEffect(() => {
    const signal = { cancelled: false };
    setPlan(null); setPlanError(''); setLoadedPlanKey('');
    setPlanLoading(false);
    if (!MICROCYCLES_2B_BACKEND_VERIFIED || !contextId || view !== 'week') return () => { signal.cancelled = true; };
    setPlanLoading(true);
    loadMicrocycle2b(client, contextId, monday).then((row) => {
      if (signal.cancelled) return;
      hydrateMicrocycleDraft(row, weekDays);
      setPlan(row);
      setLoadedPlanKey(`${contextId}:${monday}:${planLoadVersion}`);
    }).catch(() => {
      if (!signal.cancelled) setPlanError('No se pudo cargar esta semana. No se permite guardar hasta recuperar una revisión fiable.');
    }).finally(() => { if (!signal.cancelled) setPlanLoading(false); });
    return () => { signal.cancelled = true; };
  }, [client, contextId, monday, view, weekDays, planLoadVersion]);
  useEffect(() => {
    if (!previewEditing) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [previewEditing]);
  const savePlan = async (draft) => {
    if (planSaveRef.current || !MICROCYCLES_2B_BACKEND_VERIFIED || !selectedContext ||
      !canWritePlan || !planReady || planLoading || planError) {
      throw new Error('El guardado no está disponible para este equipo y temporada.');
    }
    planSaveRef.current = true; setPlanSaving(true);
    try {
      const targetContextId = contextId;
      const targetMonday = monday;
      const expectedRevision = currentPlan?.revision ?? 0;
      const reply = await saveMicrocycle2b(client, targetContextId, targetMonday,
        expectedRevision, draft, weekDays);
      const fresh = await loadMicrocycle2b(client, targetContextId, targetMonday);
      if (planScopeRef.current !== `${targetContextId}:${targetMonday}`)
        throw new Error('El equipo o la semana cambiaron durante el guardado. Recarga la planificación.');
      const confirmed = verifyMicrocycleSave(reply, fresh, targetContextId, targetMonday,
        expectedRevision, draft, weekDays);
      setPlan(confirmed);
      setOverviewVersion((current) => current + 1);
      return confirmed;
    } finally { planSaveRef.current = false; setPlanSaving(false); }
  };
  const refreshAll = async () => {
    if (planSaveRef.current) return;
    if (!discardPreview()) return;
    const request = ++matchLoadSeq.current;
    const targetContext = contextId;
    setMatchError(''); setMatchesLoading(Boolean(onRefreshMatches));
    setPlanLoadVersion((current) => current + 1);
    await Promise.all([refresh(), Promise.resolve().then(() => onRefreshMatches?.({
      shouldApply: () => request === matchLoadSeq.current && planScopeRef.current.startsWith(`${targetContext}:`),
    })).catch(() => {
      if (request === matchLoadSeq.current) setMatchError('No se pudieron actualizar los partidos.');
    }).finally(() => {
      if (request === matchLoadSeq.current) setMatchesLoading(false);
    })]);
  };
  const scopedMatches = useMemo(() => scopeCalendarMatches(matches, contextId), [matches, contextId]);
  const mdReferences = useMemo(() => mode === 'microcycles' && selectedContext && !matchError && !matchesLoading
    ? plannedMdReferences(weekDays, scopedMatches, contextId, selectedContext) : new Map(),
  [mode, selectedContext, matchError, matchesLoading, weekDays, scopedMatches, contextId]);
  const allEvents = useMemo(() => buildTeamCalendarEvents(error ? [] : sessions, matchError ? [] : scopedMatches, teams),
    [sessions, scopedMatches, teams, error, matchError]);
  const events = useMemo(() => allEvents.filter((event) => enabled[event.kind]), [allEvents, enabled]);
  const grouped = useMemo(() => {
    const byDate = new Map();
    for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) || []), event]);
    return byDate;
  }, [events]);
  const days = useMemo(() => calendarMonthDays(month.getFullYear(), month.getMonth()), [month]);
  const seasonWeeks = useMemo(() => seasonMicrocycles(selectedContext), [selectedContext]);
  const selectedWeekIndex = seasonWeeks.findIndex((week) => week.monday === monday);
  const nearbyWeeks = seasonWeeks.slice(Math.max(0, Math.min(selectedWeekIndex - 2, seasonWeeks.length - 5)),
    Math.max(0, Math.min(selectedWeekIndex - 2, seasonWeeks.length - 5)) + 5);
  const matchingWeeks = seasonWeeks.filter((week) => !weekSearch.trim() ||
    String(week.number).includes(weekSearch.trim().replace(/^mc\s*/i, '')));
  const planByMonday = useMemo(() => new Map(seasonPlans
    .filter((row) => row.club_team_season_id === contextId)
    .map((row) => [row.week_starts_on, row])), [seasonPlans, contextId]);
  const now = new Date();
  const today = calendarLocalDateKey(now);
  const moveMonth = (step) => { setSelectedDay(''); setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1)); };
  const discardPreview = () => {
    if (planSaveRef.current) return false;
    if (previewEditing && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return false;
    setPreviewEditing(false);
    setPreviewEpoch((current) => current + 1);
    return true;
  };
  const reloadPlan = () => {
    if (planSaveRef.current || !discardPreview()) return;
    setPlanLoadVersion((current) => current + 1);
  };
  const openCopy = () => {
    if (!contextId || !discardPreview()) return;
    setCopyOpen(true);
  };
  const openCopiedDestination = (nextContextId, nextMonday) => {
    setCopyOpen(false);
    setContextId(nextContextId);
    setWeekAnchor(nextMonday);
    setSelectedWeekDay('');
    setPlanLoadVersion((current) => current + 1);
    setPreviewEpoch((current) => current + 1);
  };
  const open = (event) => {
    if (view === 'week' && !discardPreview()) return;
    if (event.kind === 'training') onOpenSession({ id: event.id, contextId: event.contextId });
    else onOpenMatch(event.match);
  };
  const moveWeek = (step) => {
    if (!discardPreview()) return;
    setSelectedWeekDay(''); setWeekAnchor((current) => shiftCalendarWeek(current, step));
  };
  const changeView = (next) => {
    if (view === 'week' && next !== 'week' && !discardPreview()) return;
    if (next === 'week' && view !== 'week') {
      const day = selectedDay && days.includes(selectedDay) ? selectedDay :
        calendarLocalDateKey(new Date(month.getFullYear(), month.getMonth(),
          Math.min(now.getDate(), new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()), 12));
      setWeekAnchor(day);
      setSelectedWeekDay(selectedDay && days.includes(selectedDay) ? selectedDay : '');
    } else if (view === 'week' && next !== 'week') {
      const reference = selectedWeekDay || weekAnchor;
      const [year, monthNumber] = reference.split('-').map(Number);
      setMonth(new Date(year, monthNumber - 1, 1));
      setSelectedDay(reference);
    }
    setView(next);
  };
  const goToday = () => {
    if (view === 'week' && !discardPreview()) return;
    const target = mode === 'microcycles' ? clampMicrocycleDate(selectedContext, today) : today;
    setSelectedDay(target); setSelectedWeekDay(target); setWeekAnchor(target);
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };
  const changeContext = (nextId) => {
    if (!contexts.some((row) => row.id === nextId) || !discardPreview()) return;
    setContextId(nextId); setSessions([]); setPlan(null);
    if (mode === 'microcycles') {
      setWeekAnchor(clampMicrocycleDate(contexts.find((row) => row.id === nextId), today));
      setSelectedWeekDay(''); setAllWeeksOpen(false); setWeekSearch('');
    }
  };
  const openMicrocycleFromCalendar = (date) => {
    if (!contextId || !onOpenMicrocycle) return;
    onOpenMicrocycle({ date, contextId });
  };
  const selectSeasonWeek = (week) => {
    if (!discardPreview()) return;
    setWeekAnchor(week.monday);
    setSelectedWeekDay('');
    setAllWeeksOpen(false);
  };

  return <main className="space-y-4 pb-8 text-slate-100 xl:pb-32">
    {mode === 'calendar' ? <section className="rounded-[1.6rem] border border-white/10 bg-[#091428]/[0.72] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.20)] sm:p-5">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-caudal-electric/75">{mode === 'microcycles' ? 'Planificación' : 'Calendario'}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl font-semibold text-white">{mode === 'microcycles' ? 'Microciclos' : 'Entrenamientos y partidos'}</h2>
          <p className="mt-1 text-sm text-slate-400">{mode === 'microcycles'
            ? 'Planifica la semana y abre sus sesiones y partidos en sus módulos originales.'
            : 'Abre cada evento en su pestaña original.'}</p></div>
        <button type="button" onClick={refreshAll} disabled={loading || planSaving} className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">Actualizar</button>
      </div>
    </section> : null}
    <section className={`border border-white/10 bg-[#0b1a2d]/85 ${mode === 'microcycles' ? 'rounded-[1.6rem] p-4 sm:p-5' : 'rounded-xl p-3'}`}>
      {mode === 'microcycles' ? <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">NEXO CLUB · PLANIFICACIÓN</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {validWeek ? `MICROCICLO ${String(currentMicrocycle.number).padStart(2, '0')}` : 'MICROCICLOS'}</h2>
          {validWeek ? <p className="mt-1 text-sm capitalize text-slate-300">{microcycleRangeLabel(currentMicrocycle, true)}</p> : null}
          {selectedContext ? <p className="mt-1 text-xs text-slate-400">{selectedContext.team_name} · Temporada {selectedContext.label}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => moveWeek(-1)} disabled={selectedWeekIndex <= 0 || planSaving}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Anterior</button>
          <button type="button" onClick={() => moveWeek(1)} disabled={selectedWeekIndex < 0 || selectedWeekIndex >= seasonWeeks.length - 1 || planSaving}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Siguiente</button>
          <button type="button" onClick={goToday} disabled={!selectedContext || planSaving}
            className="rounded-lg border border-sky-300/40 px-3 py-2 text-xs font-bold text-sky-100 disabled:opacity-40">Hoy</button>
          <button type="button" onClick={() => setAllWeeksOpen((value) => !value)} disabled={!seasonWeeks.length}
            aria-expanded={allWeeksOpen} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-40">Ver todas las semanas</button>
          <button type="button" onClick={refreshAll} disabled={loading || planSaving}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-40">Actualizar</button>
        </div>
      </div> : null}
      <label className="block text-xs font-bold text-slate-200">Equipo y temporada
        <select value={contextId} disabled={contextsLoading || planSaving}
          onChange={(event) => changeContext(event.target.value)}
          className="mt-1 block min-h-10 w-full max-w-md rounded-lg border border-white/15 bg-[#091428] px-2 text-sm text-white">
          <option value="">{contextsLoading ? 'Cargando contextos…' : 'Selecciona un equipo y temporada'}</option>
          {contexts.map((row) => <option key={row.id} value={row.id}>{row.team_name} · {row.label}{row.status === 'closed' ? ' · Cerrada' : ''}</option>)}
        </select>
      </label>
      {contextsError ? <p role="alert" className="mt-2 text-xs text-red-200">{contextsError}</p> : null}
      {!contextsLoading && !contextsError && !contextId ? <p role="status" className="mt-2 text-xs text-amber-200">
        {contexts.length ? 'Selecciona un contexto autorizado para consultar o planificar.' : 'No hay equipos-temporadas autorizados.'}</p> : null}
      {selectedContext?.status === 'closed' ? <p className="mt-2 text-xs text-amber-200">Temporada cerrada: consulta únicamente.</p> : null}
      {permissionError ? <p role="alert" className="mt-2 text-xs text-red-200">{permissionError}</p> : null}
    </section>
    {mode === 'microcycles' && selectedContext ? <section className="rounded-2xl border border-white/10 bg-[#0b1a2d]/85 p-3 sm:p-4" aria-label="Microciclos de la temporada">
      {seasonPlansError ? <p role="alert" className="mt-2 text-sm text-red-200">{seasonPlansError}</p> : null}
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Semanas próximas">
        {nearbyWeeks.map((week) => {
          const planRow = planByMonday.get(week.monday);
          return <button key={week.monday} type="button" onClick={() => selectSeasonWeek(week)}
            aria-current={week.monday === monday ? 'date' : undefined}
            className={`min-w-32 flex-1 rounded-xl border px-3 py-2 text-left transition hover:bg-white/10 ${week.monday === monday
              ? 'border-sky-300/70 bg-sky-300/15' : 'border-white/10 bg-white/[0.025]'}`}>
            <strong className="block text-xs text-white">{week.label}</strong>
            <span className="mt-0.5 block whitespace-nowrap text-[11px] text-slate-400">{microcycleRangeLabel(week)}</span>
            {!seasonPlansError && planRow ? <span className="mt-1 flex items-center gap-1 text-[10px] text-sky-200"><span className="h-1.5 w-1.5 rounded-full bg-sky-300" />Plan guardado</span> : null}
          </button>;
        })}
      </div>
      {allWeeksOpen ? <div className="mt-3 rounded-xl border border-white/10 bg-[#091428] p-3" aria-label="Todas las semanas">
        <label className="text-xs text-slate-300">Buscar número de MC
          <input type="search" inputMode="numeric" value={weekSearch} onChange={(event) => setWeekSearch(event.target.value)}
            className="mt-1 block w-full max-w-xs rounded-lg border border-white/20 bg-[#0b1a2d] px-3 py-2 text-sm text-white" placeholder="Por ejemplo, 18" /></label>
        <div className="mt-3 grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-4 xl:grid-cols-7">
          {matchingWeeks.map((week) => <button key={week.monday} type="button" onClick={() => selectSeasonWeek(week)}
            aria-current={week.monday === monday ? 'date' : undefined}
            className={`rounded-lg border px-2 py-1.5 text-left text-xs ${week.monday === monday ? 'border-sky-300 bg-sky-300/15 text-white' : 'border-white/10 text-slate-300'}`}>
            {week.label} <span className="block text-[10px] text-slate-400">{microcycleRangeLabel(week)}</span></button>)}
        </div>
        {!matchingWeeks.length ? <p className="mt-2 text-xs text-slate-400">Ningún microciclo coincide.</p> : null}
      </div> : null}
    </section> : null}
    <section className="rounded-[1.35rem] border border-white/10 bg-[#0b1a2d]/85 p-3 sm:p-5">
      {mode === 'calendar' ? <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => view === 'week' ? moveWeek(-1) : moveMonth(-1)} aria-label={view === 'week' ? 'Semana anterior' : 'Mes anterior'} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">‹</button>
          <h3 className="min-w-40 text-center text-lg font-black capitalize sm:min-w-52">{view === 'week'
            ? currentMicrocycle && validWeek ? `${currentMicrocycle.label} · ${microcycleRangeLabel(currentMicrocycle, true)}` : weekRangeLabel(weekDays)
            : monthLabel(month)}</h3>
          <button type="button" onClick={() => view === 'week' ? moveWeek(1) : moveMonth(1)} aria-label={view === 'week' ? 'Semana siguiente' : 'Mes siguiente'} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">›</button>
          <button type="button" onClick={goToday} className="rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Hoy</button>
        </div>
        {mode === 'calendar' ? <div className="flex rounded-xl border border-white/15 p-1" aria-label="Vista del calendario">
          {[['month', 'Mes'], ['list', 'Lista']].map(([key, label]) => <button key={key} type="button" onClick={() => changeView(key)} aria-pressed={view === key} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${view === key ? 'bg-caudal-electric text-slate-950' : 'text-slate-300'}`}>{label}</button>)}
        </div> : null}
      </div> : null}
      {mode === 'calendar' && contextId && onOpenMicrocycle ? <button type="button"
        onClick={() => openMicrocycleFromCalendar(selectedDay || today)}
        className="mt-3 min-h-10 rounded-xl border border-sky-300/35 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-300/10">
        Abrir microciclo de {selectedDay ? 'la fecha seleccionada' : 'esta semana'}
      </button> : null}
      <div className="flex flex-wrap gap-2" aria-label="Filtros del calendario">
        {FILTERS.map(([key, label]) => <button key={key} type="button" onClick={() => setEnabled((current) => ({ ...current, [key]: !current[key] }))} aria-pressed={enabled[key]} className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${enabled[key] ? tone[key] : 'border-white/10 bg-white/[0.035] text-slate-500'}`}>{label}</button>)}
      </div>
      {loading ? <p role="status" className="mt-4 text-sm text-slate-400">Cargando sesiones…</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-100">{error}</p> : null}
      {matchError ? <p role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-100">{matchError}</p> : null}
      {view === 'month' ? <><div className="mt-4 sm:hidden">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-slate-400">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <span key={day} className="py-2">{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">{days.map((key, index) => key
          ? <button key={key} type="button" onClick={() => setSelectedDay(key)} aria-pressed={selectedDay === key}
              aria-label={`${dateLabel(key)}: ${(grouped.get(key) || []).length} eventos`}
              className={`min-h-12 rounded-lg border text-xs font-bold ${selectedDay === key ? 'border-caudal-electric bg-caudal-electric/20 text-white' : key === today ? 'border-caudal-electric/50 bg-caudal-electric/[0.06] text-caudal-electric' : 'border-white/10 bg-white/[0.025] text-slate-300'}`}>
              {Number(key.slice(-2))}{grouped.has(key) ? <span className="mx-auto mt-0.5 block h-1.5 w-1.5 rounded-full bg-current" /> : null}
            </button>
          : <span key={`blank-${index}`} />)}</div>
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-bold text-slate-300">{selectedDay && days.includes(selectedDay) ? dateLabel(selectedDay) : 'Eventos del mes'}</h4>
          {(selectedDay && days.includes(selectedDay) ? (grouped.get(selectedDay) || []) : events.filter((event) => days.includes(event.date)))
            .map((event) => <div key={`${event.kind}-${event.id}`}><p className="mb-1 text-[11px] text-slate-500">{dateLabel(event.date)}</p><EventButton event={event} onOpen={open} variant="list" /></div>)}
        </div>
      </div><div className="mt-4 hidden sm:block">
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-black uppercase text-slate-400">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day} className="py-2">{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">{days.map((key, index) => <div key={key || `blank-${index}`} className={`min-h-32 min-w-0 rounded-xl border p-1.5 sm:p-2 ${key === today ? 'border-caudal-electric/50 bg-caudal-electric/[0.06]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
            {key ? <><button type="button" onClick={() => setSelectedDay(key)} aria-pressed={selectedDay === key}
              aria-label={`Seleccionar ${dateLabel(key)}`}
              className={`rounded px-1 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${key === today ? 'text-caudal-electric' : 'text-slate-300'} ${selectedDay === key ? 'bg-sky-400/20' : ''}`}>
              {Number(key.slice(-2))}</button><div className="mt-1 max-h-56 space-y-1 overflow-y-auto overscroll-contain">{(grouped.get(key) || []).map((event) => <EventButton key={`${event.kind}-${event.id}`} event={event} onOpen={open} />)}</div></> : null}
          </div>)}</div>
        </div>
      </div></> : view === 'list' ? <div className="mt-4 space-y-3">{[...grouped].map(([key, rows]) => <section key={key} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black capitalize text-slate-300">{dateLabel(key)}</h4>
          {contextId && onOpenMicrocycle ? <button type="button" onClick={() => openMicrocycleFromCalendar(key)}
            className="min-h-9 rounded-lg border border-sky-300/30 px-2 text-xs font-bold text-sky-100">Abrir microciclo</button> : null}</div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{rows.map((event) => <EventButton key={`${event.kind}-${event.id}`} event={event} onOpen={open} variant="list" />)}</div>
      </section>)}</div> : <CalendarWeekView key={`${contextId}:${monday}:${previewEpoch}`} days={weekDays} grouped={grouped} events={events}
        selectedDay={selectedWeekDay} onSelectDay={setSelectedWeekDay} onOpen={open}
        today={today} loading={loading} error={Boolean(error || matchError)}
        onPreviewEditingChange={setPreviewEditing} plan={currentPlan}
        planLoading={planLoading || (MICROCYCLES_2B_BACKEND_VERIFIED && Boolean(contextId) && !planReady)}
        planError={planError} planSaving={planSaving} onSavePlan={savePlan}
        canWritePlan={canWritePlan && planReady} onReloadPlan={reloadPlan}
        sessionStatusVerified={SESSION_RETIREMENT_BACKEND_VERIFIED}
        mdReferences={mdReferences} mdLoading={matchesLoading} mdError={Boolean(matchError)}
        onCopyPlan={openCopy} onOpenPerformance={() => {
          if (discardPreview()) onOpenPerformance?.();
        }} copyAvailable={Boolean(contextId && contexts.length && !planSaving)} />}
      {!loading && !error && !matchError && view !== 'week' && !events.length ? <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No hay eventos para los filtros seleccionados.</p> : null}
      {!loading && !error && view === 'month' && events.length > 0 && !days.some((key) => grouped.has(key)) ? <p className="mt-4 text-sm text-slate-400">No hay eventos en este mes.</p> : null}
    </section>
    {copyOpen ? <MicrocycleCopyDialog client={client} contexts={contexts}
      initialContextId={contextId} initialMonday={monday} onClose={() => setCopyOpen(false)}
      onOpenDestination={openCopiedDestination} /> : null}
  </main>;
}
