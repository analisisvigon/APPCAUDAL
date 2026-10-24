import { useCallback, useEffect, useMemo, useState } from 'react';
import { listPlannedSessions, loadPlannedContexts } from '../../data/plannedSessionsStore.js';
import { buildTeamCalendarEvents, calendarDateKey, calendarMonthDays } from '../../utils/teamCalendar.js';

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

function EventButton({ event, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isMatch = event.kind !== 'training';
  return <button type="button" onClick={() => onOpen(event)}
    className={`flex min-w-0 w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric ${tone[event.kind]}`}
    aria-label={`Abrir ${event.label.toLowerCase()} ${event.title}, ${dateLabel(event.date)}`}>
    {isMatch ? <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/90 text-slate-900">
      {event.crest && !imageFailed ? <img src={event.crest} alt={`Escudo de ${event.opponent}`} onError={() => setImageFailed(true)} className="h-full w-full object-contain p-0.5" />
        : <span aria-hidden="true" className="text-base">⚽</span>}
    </span> : <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-300/15 text-sm">●</span>}
    <span className="min-w-0 flex-1">
      <span className="block truncate text-xs font-black">{event.title}</span>
      <span className="block truncate text-[11px] opacity-85">{event.label} · {event.time || (isMatch ? 'Hora pendiente' : 'Sin hora')}{isMatch && event.venue != null ? ` · ${event.venue ? 'Local' : 'Visitante'}` : ''}</span>
    </span>
  </button>;
}

export default function TeamCalendarSection({ client, clubId, matches, teams, onRefreshMatches, onOpenSession, onOpenMatch }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
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
    setMatchError('');
    await Promise.all([refresh(), onRefreshMatches?.().catch(() => setMatchError('No se pudieron actualizar los partidos.'))]);
  };
  const events = useMemo(() => buildTeamCalendarEvents(sessions, matches, teams)
    .filter((event) => enabled[event.kind]), [sessions, matches, teams, enabled]);
  const grouped = useMemo(() => {
    const byDate = new Map();
    for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) || []), event]);
    return byDate;
  }, [events]);
  const days = useMemo(() => calendarMonthDays(month.getFullYear(), month.getMonth()), [month]);
  const now = new Date();
  const today = calendarDateKey(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  const open = (event) => event.kind === 'training'
    ? onOpenSession({ id: event.id, contextId: event.contextId }) : onOpenMatch(event.match);
  const moveMonth = (step) => { setSelectedDay(''); setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1)); };

  return <main className="space-y-4 pb-8 text-slate-100">
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
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior" className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">‹</button>
          <h3 className="min-w-40 text-center text-lg font-black capitalize sm:min-w-52">{monthLabel(month)}</h3>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente" className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">›</button>
          <button type="button" onClick={() => { const current = new Date(); setSelectedDay(today); setMonth(new Date(current.getFullYear(), current.getMonth(), 1)); }} className="rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Hoy</button>
        </div>
        <div className="flex rounded-xl border border-white/15 p-1" aria-label="Vista del calendario">
          {[['month', 'Mes'], ['list', 'Lista']].map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${view === key ? 'bg-caudal-electric text-slate-950' : 'text-slate-300'}`}>{label}</button>)}
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
            .map((event) => <div key={`${event.kind}-${event.id}`}><p className="mb-1 text-[11px] text-slate-500">{dateLabel(event.date)}</p><EventButton event={event} onOpen={open} /></div>)}
        </div>
      </div><div className="mt-4 hidden sm:block">
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-black uppercase text-slate-400">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day} className="py-2">{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">{days.map((key, index) => <div key={key || `blank-${index}`} className={`min-h-32 min-w-0 rounded-xl border p-1.5 sm:p-2 ${key === today ? 'border-caudal-electric/50 bg-caudal-electric/[0.06]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
            {key ? <><span className={`block text-xs font-black ${key === today ? 'text-caudal-electric' : 'text-slate-300'}`}>{Number(key.slice(-2))}</span><div className="mt-1 space-y-1">{(grouped.get(key) || []).map((event) => <EventButton key={`${event.kind}-${event.id}`} event={event} onOpen={open} />)}</div></> : null}
          </div>)}</div>
        </div>
      </div></> : <div className="mt-4 space-y-3">{[...grouped].map(([key, rows]) => <section key={key} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <h4 className="mb-2 text-sm font-black capitalize text-slate-300">{dateLabel(key)}</h4>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{rows.map((event) => <EventButton key={`${event.kind}-${event.id}`} event={event} onOpen={open} />)}</div>
      </section>)}</div>}
      {!loading && !error && !events.length ? <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No hay eventos para los filtros seleccionados.</p> : null}
      {!loading && !error && view === 'month' && events.length > 0 && !days.some((key) => grouped.has(key)) ? <p className="mt-4 text-sm text-slate-400">No hay eventos en este mes.</p> : null}
    </section>
  </main>;
}
