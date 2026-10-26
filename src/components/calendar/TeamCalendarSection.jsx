import { useCallback, useEffect, useMemo, useState } from 'react';
import { listPlannedSessions, loadPlannedContexts } from '../../data/plannedSessionsStore.js';
import { buildTeamCalendarEvents, calendarLocalDateKey, calendarMonthDays,
  calendarWeekDays, calendarWeekSummary, calendarWeeklyCountLabel, shiftCalendarWeek } from '../../utils/teamCalendar.js';
import MicrocyclePlanningPreview from './MicrocyclePlanningPreview.jsx';

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
const monthLabel = (date) => date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
const dateLabel = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

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
    : `${event.title}${event.microcycle ? `, ${event.microcycle}` : ''}`;
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
          {variant === 'week' && event.durationKnown ? ` · ${event.durationMinutes} min` : ' · Entrenamiento'}</span>
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
  onPreviewEditingChange }) {
  const summary = calendarWeekSummary(events, days);
  const chosenDay = days.includes(selectedDay) ? selectedDay : '';
  const chosenEvents = chosenDay ? grouped.get(chosenDay) || [] : [];
  return <section className="mt-5 space-y-4" aria-label="Microciclo semanal">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-3">
      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-sky-300">Microciclo semanal</h3>
      {!loading && !error ? <p className="text-xs text-slate-300">{calendarWeeklyCountLabel(summary)}</p> : null}
    </div>
    {!loading && !error && summary.durationCoverage !== 'none' ? <p className="text-xs font-semibold text-slate-300">
      {summary.durationCoverage === 'complete'
        ? `${summary.durationMinutes} min planificados`
        : summary.durationMinutes > 0
          ? `${summary.durationMinutes} min acreditados · Duración parcial`
          : 'Duración no acreditada · Duración parcial'}</p> : null}
    {!loading && !error ? <>
      <MicrocyclePlanningPreview key={days[0]} days={days} selectedDay={selectedDay}
        onSelectDay={onSelectDay} onEditingChange={onPreviewEditingChange} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {days.map((key) => {
          const rows = grouped.get(key) || [];
          const day = new Date(`${key}T12:00:00`);
          return <article key={key} className={`min-w-0 rounded-2xl border p-3 ${key === today
            ? 'border-sky-400/55 bg-sky-400/[0.08]' : 'border-white/10 bg-white/[0.025]'}`}>
            <button type="button" onClick={() => onSelectDay(key)} aria-pressed={chosenDay === key}
              className={`mb-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${chosenDay === key ? 'bg-sky-400/15 text-white' : 'text-slate-200'}`}
              aria-label={`Ver detalle del ${dateLabel(key)}`}>
              <span className="text-xs font-black uppercase tracking-wide">{day.toLocaleDateString('es-ES', { weekday: 'long' })}</span>
              <span className="text-lg font-black tabular-nums">{day.getDate()}</span>
            </button>
            {rows.length ? <div className="space-y-2">{rows.map((event) =>
              <EventButton key={`${event.kind}-${event.id}`} event={event} onOpen={onOpen} variant="week" />)}</div>
              : <p className="px-2 py-3 text-xs text-slate-500">Sin actividad registrada</p>}
          </article>;
        })}
      </div>
      {summary.activeDays === 0 ? <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
        No hay actividades registradas esta semana.</p> : null}
      {chosenDay ? <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" aria-label="Detalle del día">
        <h4 className="text-base font-black capitalize text-white">{dateLabel(chosenDay)}</h4>
        {chosenEvents.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">
          {chosenEvents.map((event) => <div key={`${event.kind}-${event.id}`} className="min-w-0 rounded-xl border border-white/10 p-3">
            <EventButton event={event} onOpen={onOpen} variant="list" />
            {event.kind === 'training' && event.durationKnown ? <p className="mt-2 text-xs text-slate-300">Duración: {event.durationMinutes} min</p> : null}
            {event.kind === 'training' && event.objective ? <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">Objetivo: {event.objective}</p> : null}
            <button type="button" onClick={() => onOpen(event)}
              className="mt-3 min-h-10 rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-white hover:bg-white/10">
              {event.kind === 'training' ? 'Abrir sesión' : 'Abrir partido'}</button>
          </div>)}</div> : <p className="mt-2 text-sm text-slate-400">Sin actividad registrada.</p>}
      </section> : null}
    </> : null}
  </section>;
}

export default function TeamCalendarSection({ client, clubId, matches, teams, onRefreshMatches, onOpenSession, onOpenMatch }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [weekAnchor, setWeekAnchor] = useState(() => calendarLocalDateKey());
  const [selectedWeekDay, setSelectedWeekDay] = useState('');
  const [previewEditing, setPreviewEditing] = useState(false);
  const [view, setView] = useState('month');
  const [selectedDay, setSelectedDay] = useState('');
  const [enabled, setEnabled] = useState(() => Object.fromEntries(FILTERS.map(([key]) => [key, true])));
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matchError, setMatchError] = useState('');
  const refresh = useCallback(async (signal) => {
    setLoading(true); setError('');
    try {
      const contexts = await loadPlannedContexts(client, clubId);
      const rows = await Promise.all(contexts.map((context) => listPlannedSessions(client, context.id)));
      if (!signal?.cancelled) setSessions(rows.flat());
    } catch {
      if (!signal?.cancelled) { setSessions([]); setError('No se pudieron cargar las sesiones. Reintenta la actualización.'); }
    } finally { if (!signal?.cancelled) setLoading(false); }
  }, [client, clubId]);
  useEffect(() => {
    const signal = { cancelled: false };
    refresh(signal);
    onRefreshMatches?.({ shouldApply: () => !signal.cancelled }).catch(() => {
      if (!signal.cancelled) setMatchError('No se pudieron actualizar los partidos.');
    });
    return () => { signal.cancelled = true; };
  }, [refresh]);
  const refreshAll = async () => {
    if (previewEditing && !window.confirm('La vista previa no se guarda. ¿Descartar los cambios locales?')) return;
    setPreviewEditing(false);
    setMatchError('');
    await Promise.all([refresh(), onRefreshMatches?.().catch(() => setMatchError('No se pudieron actualizar los partidos.'))]);
  };
  const events = useMemo(() => buildTeamCalendarEvents(error ? [] : sessions, matchError ? [] : matches, teams)
    .filter((event) => enabled[event.kind]), [sessions, matches, teams, enabled, error, matchError]);
  const grouped = useMemo(() => {
    const byDate = new Map();
    for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) || []), event]);
    return byDate;
  }, [events]);
  const days = useMemo(() => calendarMonthDays(month.getFullYear(), month.getMonth()), [month]);
  const weekDays = useMemo(() => calendarWeekDays(weekAnchor), [weekAnchor]);
  const now = new Date();
  const today = calendarLocalDateKey(now);
  const moveMonth = (step) => { setSelectedDay(''); setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1)); };
  const discardPreview = () => {
    if (previewEditing && !window.confirm('La vista previa no se guarda. ¿Descartar los cambios locales?')) return false;
    setPreviewEditing(false);
    return true;
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
    setSelectedDay(today); setSelectedWeekDay(today); setWeekAnchor(today);
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return <main className="space-y-4 pb-8 text-slate-100 xl:pb-32">
    <section className="rounded-[1.6rem] border border-white/10 bg-[#091428]/[0.72] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.20)] sm:p-5">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-caudal-electric/75">Calendario</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl font-semibold text-white">Entrenamientos y partidos</h2>
          <p className="mt-1 text-sm text-slate-400">Abre cada evento en su pestaña original.</p></div>
        <button type="button" onClick={refreshAll} disabled={loading} className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">Actualizar</button>
      </div>
    </section>
    <section className="rounded-[1.35rem] border border-white/10 bg-[#0b1a2d]/85 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => view === 'week' ? moveWeek(-1) : moveMonth(-1)} aria-label={view === 'week' ? 'Semana anterior' : 'Mes anterior'} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">‹</button>
          <h3 className="min-w-40 text-center text-lg font-black capitalize sm:min-w-52">{view === 'week' ? weekRangeLabel(weekDays) : monthLabel(month)}</h3>
          <button type="button" onClick={() => view === 'week' ? moveWeek(1) : moveMonth(1)} aria-label={view === 'week' ? 'Semana siguiente' : 'Mes siguiente'} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">›</button>
          <button type="button" onClick={goToday} className="rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Hoy</button>
        </div>
        <div className="flex rounded-xl border border-white/15 p-1" aria-label="Vista del calendario">
          {[['month', 'Mes'], ['list', 'Lista'], ['week', 'Microciclo']].map(([key, label]) => <button key={key} type="button" onClick={() => changeView(key)} aria-pressed={view === key} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${view === key ? 'bg-caudal-electric text-slate-950' : 'text-slate-300'}`}>{label}</button>)}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtros del calendario">
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
            {key ? <><span className={`block text-xs font-black ${key === today ? 'text-caudal-electric' : 'text-slate-300'}`}>{Number(key.slice(-2))}</span><div className="mt-1 max-h-56 space-y-1 overflow-y-auto overscroll-contain">{(grouped.get(key) || []).map((event) => <EventButton key={`${event.kind}-${event.id}`} event={event} onOpen={open} />)}</div></> : null}
          </div>)}</div>
        </div>
      </div></> : view === 'list' ? <div className="mt-4 space-y-3">{[...grouped].map(([key, rows]) => <section key={key} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <h4 className="mb-2 text-sm font-black capitalize text-slate-300">{dateLabel(key)}</h4>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{rows.map((event) => <EventButton key={`${event.kind}-${event.id}`} event={event} onOpen={open} variant="list" />)}</div>
      </section>)}</div> : <CalendarWeekView days={weekDays} grouped={grouped} events={events}
        selectedDay={selectedWeekDay} onSelectDay={setSelectedWeekDay} onOpen={open}
        today={today} loading={loading} error={Boolean(error || matchError)}
        onPreviewEditingChange={setPreviewEditing} />}
      {!loading && !error && !matchError && view !== 'week' && !events.length ? <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No hay eventos para los filtros seleccionados.</p> : null}
      {!loading && !error && view === 'month' && events.length > 0 && !days.some((key) => grouped.has(key)) ? <p className="mt-4 text-sm text-slate-400">No hay eventos en este mes.</p> : null}
    </section>
  </main>;
}
