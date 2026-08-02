import { useEffect, useMemo, useState } from 'react';

const safeArray = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();

const filterOptions = [
  ['all', 'Todas'],
  ['confirmed', 'Confirmadas'],
  ['pending', 'Pendientes'],
  ['discarded', 'Descartadas'],
  ['attack', 'Ataque'],
  ['defense', 'Defensa'],
  ['transition', 'Transiciones'],
  ['set_piece', 'ABP'],
  ['players', 'Jugadores'],
  ['video', 'Vídeo'],
  ['board', 'Pizarra'],
];

const qualityTone = {
  Confirmada: 'border-emerald-300/25 bg-emerald-300/[0.10] text-emerald-100',
  Repetida: 'border-cyan-300/25 bg-cyan-300/[0.09] text-cyan-100',
  Observada: 'border-slate-300/15 bg-white/[0.045] text-slate-300',
  Descartada: 'border-rose-300/20 bg-rose-300/[0.07] text-rose-100',
  'Requiere revisión': 'border-amber-300/25 bg-amber-300/[0.09] text-amber-100',
};

const historyLabels = {
  confirmed: 'Confirmada por el staff',
  discarded: 'Descartada por el staff',
  review: 'Revisión solicitada',
  pending: 'Devuelta a pendiente',
};

const priorityStyles = {
  Crítica: { band: 'bg-rose-400', badge: 'border-rose-300/25 bg-rose-300/[0.10] text-rose-100' },
  Alta: { band: 'bg-orange-300', badge: 'border-orange-300/25 bg-orange-300/[0.10] text-orange-100' },
  Media: { band: 'bg-amber-300', badge: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100' },
  Baja: { band: 'bg-slate-500', badge: 'border-slate-300/15 bg-white/[0.04] text-slate-300' },
};

const maturityPresentation = {
  high: { label: 'Muy completo', icon: '●', tone: 'border-emerald-300/25 bg-emerald-300/[0.075] text-emerald-100', dot: 'bg-emerald-400' },
  medium: { label: 'En desarrollo', icon: '◐', tone: 'border-amber-300/25 bg-amber-300/[0.075] text-amber-100', dot: 'bg-amber-300' },
  initial: { label: 'Información insuficiente', icon: '○', tone: 'border-rose-300/20 bg-rose-300/[0.055] text-rose-100', dot: 'bg-rose-300' },
};

const formatDateTime = (value, fallback = 'Fecha no registrada') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return clean(value) || fallback;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
};

const plural = (count, singular, pluralLabel = `${singular}s`) => `${count} ${count === 1 ? singular : pluralLabel}`;

const matchesFilter = (item, filter, hasMatchVideo) => {
  if (filter === 'all') return true;
  if (filter === 'confirmed' || filter === 'discarded') return item.status === filter;
  if (filter === 'pending') return ['pending', 'review'].includes(item.status);
  if (filter === 'attack') return item.phaseKeys.includes('offensive');
  if (filter === 'defense') return item.phaseKeys.includes('defensive');
  if (filter === 'transition') return item.phaseKeys.includes('transition');
  if (filter === 'set_piece') return item.phaseKeys.includes('set_piece');
  if (filter === 'players') return item.participants.length > 0;
  if (filter === 'video') return item.hasVideo || (hasMatchVideo && item.playCount > 0);
  if (filter === 'board') return item.hasBoard;
  return true;
};

// Prioridad editorial de revisión. No altera la prioridad táctica ni alimenta el motor.
const getReviewPriority = (item) => {
  if (item.status === 'discarded' || !item.canConfirm) return 'Baja';
  if (item.status === 'review' && item.playCount >= 3 && item.sourceCount >= 2) return 'Crítica';
  if (['pending', 'review'].includes(item.status) && (item.playCount >= 3 || item.matchCount >= 2)) return 'Alta';
  return 'Media';
};

const getStrengthUnits = (item) => Math.min(10,
  Math.max(0, item.playCount)
  + Math.min(2, Math.max(0, item.matchCount))
  + Math.min(3, Math.max(0, item.sourceCount))
  + Math.min(2, Math.max(0, item.occurrenceCount - item.playCount)),
);

function MetricCard({ icon, label, value, tone = 'text-white', large = false }) {
  return (
    <article className={`rounded-2xl border border-white/[0.07] bg-black/20 ${large ? 'p-5' : 'p-4'}`}>
      <div className="flex items-center gap-2"><span className="text-base" aria-hidden="true">{icon}</span><p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p></div>
      <p className={`mt-3 font-black ${large ? 'text-3xl' : 'text-2xl'} ${tone}`}>{value}</p>
    </article>
  );
}

function EmptyBlock({ children }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 py-7 text-center text-sm font-semibold text-slate-500">{children}</div>;
}

function EvidenceStrength({ item }) {
  const units = getStrengthUnits(item);
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3" title="Los segmentos representan unidades trazables disponibles, no un porcentaje ni una probabilidad.">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-500">Fuerza de la evidencia</p>
        <span className="text-[8px] font-bold text-slate-600">Datos trazables</span>
      </div>
      <div className="mt-2 grid grid-cols-10 gap-1" aria-label={`${units} de 10 segmentos de trazabilidad disponibles`}>
        {Array.from({ length: 10 }, (_, index) => <span key={index} className={`h-2 rounded-full ${index < units ? 'bg-gradient-to-r from-caudal-electric to-cyan-300' : 'bg-white/[0.06]'}`} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-bold text-slate-400 sm:grid-cols-4">
        <span>{plural(item.playCount, 'jugada')}</span>
        <span>{plural(item.matchCount || 0, 'partido')}</span>
        <span>{plural(item.occurrenceCount, 'observación', 'observaciones')}</span>
        <span>{plural(item.sourceCount, 'fuente')}</span>
      </div>
    </div>
  );
}

function SourceSummary({ item, match }) {
  const videoCount = new Set(item.contexts.filter((context) => clean(context.videoUrl)).map((context) => clean(context.videoUrl))).size
    || (clean(match?.videoUrl) && item.playCount ? 1 : 0);
  const staffCount = item.sources.filter((source) => source.type === 'staff_observation').length;
  const sources = [
    item.playCount ? ['▣', plural(item.playCount, 'jugada')] : null,
    videoCount ? ['▶', plural(videoCount, 'vídeo')] : null,
    item.hasBoard ? ['⌁', 'Pizarra'] : null,
    item.participants.length ? ['♟', plural(item.participants.length, 'jugador', 'jugadores')] : null,
    staffCount ? ['✎', 'Staff'] : null,
  ].filter(Boolean);
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">Fuentes</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {sources.length ? sources.map(([icon, label]) => <span key={`${icon}-${label}`} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400"><span className="text-caudal-electric" aria-hidden="true">{icon}</span>{label}</span>) : <span className="text-[10px] font-semibold text-slate-600">Sin fuentes vinculadas</span>}
      </div>
    </div>
  );
}

function TraceabilityChain({ item }) {
  const destinations = [
    ['Rival', item.usedIn.rival],
    ['Jugadores', item.usedIn.players],
    ['Plan', item.usedIn.plan],
  ];
  const statusLabel = item.status === 'confirmed' ? 'Confirmado' : item.status === 'discarded' ? 'Descartado' : 'Pendiente';
  const steps = [
    ['Jugada', item.playCount > 0],
    ['Interpretación', Boolean(clean(item.title))],
    ['Patrón detectado', item.canConfirm],
    [statusLabel, true],
    ...destinations,
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-black/20 p-3">
      <p className="mb-3 text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">Cadena de trazabilidad</p>
      <div className="flex min-w-max items-center gap-2">
        {steps.map(([label, active], index) => (
          <div key={`${label}-${index}`} className="flex items-center gap-2">
            {index ? <span className="text-slate-700" aria-hidden="true">→</span> : null}
            <span className={`rounded-lg border px-2.5 py-1.5 text-[8px] font-black uppercase ${active ? 'border-caudal-electric/20 bg-caudal-electric/[0.08] text-slate-200' : 'border-white/[0.06] text-slate-600'}`}>{active ? '●' : '○'} {label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageSummary({ item, onNavigate }) {
  const destinations = [['rival', 'Rival'], ['plan', 'Plan de partido'], ['players', 'Jugadores']];
  const active = destinations.filter(([key]) => item.usedIn[key]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-600">Utilizada en</span>
      {active.length ? active.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onNavigate?.(key, item)} className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[8px] font-black uppercase text-emerald-100">● {label}</button>
      )) : <span className="rounded-full border border-white/10 px-2.5 py-1 text-[8px] font-black uppercase text-slate-500">○ Sin utilizar</span>}
    </div>
  );
}

function EvidenceTimeline({ item, match, onViewPlay, onOpenVideo }) {
  const traceEvents = [
    ...item.contexts.map((context) => ({
      at: context.updatedAt || context.createdAt,
      label: `Jugada vinculada · ${context.playName || 'Jugada guardada'}`,
      context,
    })),
    ...item.history.map((entry) => ({ at: entry.at, label: historyLabels[entry.status] || 'Validación actualizada', by: entry.by })),
  ].sort((left, right) => String(left.at || '').localeCompare(String(right.at || '')));
  if (!traceEvents.length) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-4">
        <p className="text-xs font-bold text-slate-400">Esta observación no está vinculada a una jugada guardada.</p>
        {item.manualMatch || item.manualDate ? <p className="mt-2 text-[10px] font-semibold text-slate-500">{item.manualMatch ? `Partido: ${item.manualMatch}` : 'Partido no identificado'}{item.manualDate ? ` · Fecha: ${item.manualDate}` : ''}</p> : null}
        <p className="mt-1 text-[10px] font-semibold text-slate-600">No puede confirmarse ni alimentar otras pestañas hasta disponer de trazabilidad real.</p>
      </div>
    );
  }
  return (
    <div className="mt-4 border-l border-white/10 pl-5">
      {traceEvents.map((event, index) => (
        <article key={`${event.at}-${event.label}-${index}`} className="relative pb-4 last:pb-0">
          <span className="absolute -left-[1.55rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#091428] bg-caudal-electric" />
          <p className="text-[9px] font-black uppercase text-slate-500">{formatDateTime(event.at)}</p>
          <p className="mt-1 text-xs font-bold text-slate-200">{event.label}</p>
          {event.by ? <p className="mt-1 text-[9px] font-semibold text-slate-500">Responsable · {event.by}</p> : null}
          {event.context ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => onViewPlay?.(event.context.playId, event.context.phase)} className="rounded-lg border border-caudal-electric/20 px-2.5 py-1.5 text-[8px] font-black uppercase text-caudal-electric">Abrir Pizarra</button>
              {match?.videoUrl || event.context.videoUrl ? <button type="button" onClick={() => onOpenVideo?.(event.context)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[8px] font-black uppercase text-slate-300">Abrir vídeo</button> : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ImpactPanel({ item, onClose, onNavigate }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const confirmed = item.status === 'confirmed';
  const eligible = item.canConfirm;
  const impacts = [
    { key: 'rival', label: 'Rival', active: confirmed ? item.usedIn.rival : eligible },
    { key: 'players', label: 'Jugadores', active: confirmed ? item.usedIn.players : eligible && item.participants.length > 0 },
    { key: 'plan', label: 'Plan de partido', active: confirmed ? item.usedIn.plan : eligible },
    { key: 'rival', label: 'Asistente táctico', active: confirmed ? item.usedIn.rival : eligible },
  ];
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/80 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="evidence-impact-title" className="h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#081426] p-5 shadow-[-30px_0_80px_rgba(0,0,0,0.45)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Impacto trazable</p><h3 id="evidence-impact-title" className="mt-2 text-2xl font-black text-white">{confirmed ? 'Dónde se utiliza' : 'Qué ocurrirá al confirmar'}</h3></div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-lg text-slate-300" aria-label="Cerrar impacto">×</button>
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-slate-400">{item.title}</p>
        <div className="mt-6 space-y-2">
          {impacts.map((impact, index) => (
            <button key={`${impact.label}-${index}`} type="button" disabled={!impact.active || impact.label === 'Asistente táctico'} onClick={() => { onNavigate?.(impact.key, item); onClose(); }} className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left ${impact.active ? 'border-emerald-300/20 bg-emerald-300/[0.055] text-white' : 'border-white/[0.06] bg-black/10 text-slate-600'}`}>
              <span className="font-black">{impact.label}</span><span className="text-[9px] font-black uppercase">{impact.active ? '● Alimentará' : '○ Sin efecto registrado'}</span>
            </button>
          ))}
        </div>
        {!eligible && !confirmed ? <p className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4 text-xs font-semibold leading-5 text-amber-100">Esta señal todavía no dispone de las jugadas mínimas necesarias para alimentar el scouting oficial.</p> : null}
        <div className="mt-7"><TraceabilityChain item={item} /></div>
      </aside>
    </div>
  );
}

function EvidenceCard({ item, match, expanded, editing, saving, compact = false, onToggle, onEdit, onCancelEdit, onSaveEdit, onUpdateValidation, onViewPlay, onOpenVideo, onNavigate, onShowImpact }) {
  const [interpretation, setInterpretation] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  const confirmed = item.status === 'confirmed';
  const discarded = item.status === 'discarded';
  const priority = getReviewPriority(item);
  const priorityStyle = priorityStyles[priority];
  const border = confirmed ? 'border-emerald-300/22 bg-emerald-300/[0.045]' : discarded ? 'border-rose-300/15 bg-rose-300/[0.025] opacity-75' : 'border-white/[0.08] bg-[#0a1729]';
  useEffect(() => {
    if (!editing) return;
    setInterpretation(item.title);
    setNotes(item.notes);
  }, [editing, item.notes, item.title]);
  return (
    <article className={`relative overflow-hidden rounded-[1.6rem] border p-4 shadow-[0_18px_50px_rgba(0,0,0,0.16)] transition duration-300 hover:-translate-y-0.5 hover:border-white/15 sm:p-5 ${border}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${priorityStyle.band}`} aria-hidden="true" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${qualityTone[item.quality] || qualityTone.Observada}`}>{item.quality}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase ${priorityStyle.badge}`} title="Prioridad editorial para organizar la revisión; no modifica la conclusión táctica.">{priority} · prioridad de revisión</span>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[8px] font-black uppercase text-slate-500">{item.phase}</span>
          </div>
          <h4 className="mt-3 text-lg font-black leading-6 text-white">{item.title}</h4>
          <p className="mt-2 text-[10px] font-bold text-slate-500">Última observación · {formatDateTime(item.updatedAt)}</p>
        </div>
        <span className={`shrink-0 rounded-xl px-3 py-2 text-[9px] font-black uppercase ${confirmed ? 'bg-emerald-400 text-slate-950' : discarded ? 'bg-rose-300/10 text-rose-100' : 'bg-amber-300/10 text-amber-100'}`}>{confirmed ? 'Confirmada' : discarded ? 'Descartada' : 'Pendiente'}</span>
      </div>

      <div className="mt-4"><EvidenceStrength item={item} /></div>
      {!compact ? <div className="mt-4"><SourceSummary item={item} match={match} /></div> : null}
      {!compact && item.participants.length ? <div className="mt-3 flex flex-wrap gap-1.5">{item.participants.map((player) => <span key={player.id || player.name} className="rounded-full border border-violet-300/15 bg-violet-300/[0.055] px-2.5 py-1 text-[8px] font-black uppercase text-violet-100">{player.name}</span>)}</div> : null}

      {editing ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-caudal-electric/20 bg-black/15 p-3">
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Interpretación<input value={interpretation} onChange={(event) => setInterpretation(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-sm font-bold normal-case tracking-normal text-white outline-none" /></label>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Notas del staff<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="min-h-20 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-semibold normal-case tracking-normal text-white outline-none" /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={onCancelEdit} disabled={saving} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300 disabled:opacity-40">Cancelar</button><button type="button" onClick={() => onSaveEdit({ interpretation, notes })} disabled={saving || !clean(interpretation)} className="rounded-lg bg-caudal-electric px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar interpretación'}</button></div>
        </div>
      ) : null}

      {item.notes && !editing && !compact ? <p className="mt-4 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2 text-xs font-semibold leading-5 text-slate-400"><span className="font-black text-slate-300">Nota del staff · </span>{item.notes}</p> : null}
      {!compact ? <div className="mt-4"><TraceabilityChain item={item} /></div> : null}
      <div className="mt-4"><UsageSummary item={item} onNavigate={onNavigate} /></div>

      {!compact ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <p className="mb-2 text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">Acciones rápidas</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onToggle} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">{expanded ? 'Ocultar trazabilidad' : 'Ver jugadas'}</button>
            <button type="button" onClick={onEdit} disabled={saving} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300 disabled:opacity-40">Editar interpretación</button>
            <button type="button" onClick={() => onUpdateValidation?.(item.id, { status: 'confirmed' })} disabled={saving || !item.canConfirm || confirmed} title={!item.canConfirm ? 'Se requieren al menos dos jugadas distintas.' : ''} className="rounded-lg border border-emerald-300/20 px-3 py-2 text-[9px] font-black uppercase text-emerald-100 disabled:cursor-not-allowed disabled:opacity-35">{saving ? 'Guardando…' : 'Confirmar'}</button>
            <button type="button" onClick={() => onUpdateValidation?.(item.id, { status: 'discarded' })} disabled={saving || discarded} className="rounded-lg border border-rose-300/15 px-3 py-2 text-[9px] font-black uppercase text-rose-100 disabled:opacity-35">Descartar</button>
            <button type="button" onClick={() => onNavigate?.('plan', item)} disabled={!confirmed} title={!confirmed ? 'Confirma primero la evidencia.' : ''} className="rounded-lg border border-caudal-electric/20 px-3 py-2 text-[9px] font-black uppercase text-caudal-electric disabled:cursor-not-allowed disabled:opacity-35">Añadir al Plan</button>
            <button type="button" onClick={() => onShowImpact(item)} className="rounded-lg border border-violet-300/20 px-3 py-2 text-[9px] font-black uppercase text-violet-100">Ver impacto</button>
            <button type="button" onClick={() => item.contexts[0] && onViewPlay?.(item.contexts[0].playId, item.contexts[0].phase)} disabled={!item.hasBoard} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300 disabled:opacity-35">Abrir en Pizarra</button>
            <button type="button" onClick={() => onNavigate?.('players', item)} disabled={!item.participants.length} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300 disabled:opacity-35">Abrir jugador</button>
          </div>
        </div>
      ) : null}

      {expanded && !compact ? <EvidenceTimeline item={item} match={match} onViewPlay={onViewPlay} onOpenVideo={onOpenVideo} /> : null}
    </article>
  );
}

function EvidenceSection({ eyebrow, title, description, items, empty, compact = false, ...cardProps }) {
  return (
    <section className="rounded-[2rem] border border-white/[0.07] bg-[#091428]/86 p-4 sm:p-6">
      <div className="mb-5"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">{eyebrow}</p><h3 className="mt-1 text-xl font-black text-white sm:text-2xl">{title}</h3>{description ? <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">{description}</p> : null}</div>
      {items.length ? <div className={`grid gap-3 ${compact ? 'lg:grid-cols-3' : 'xl:grid-cols-2'}`}>{items.map((item) => <EvidenceCard key={item.id} item={item} compact={compact} {...cardProps} saving={cardProps.savingId === item.id} expanded={cardProps.expandedId === item.id} editing={cardProps.editingId === item.id} onToggle={() => cardProps.onToggle(item.id)} onEdit={() => cardProps.onEdit(item)} onCancelEdit={cardProps.onCancelEdit} onSaveEdit={(patch) => cardProps.onSaveEdit(item.id, patch)} />)}</div> : <EmptyBlock>{empty}</EmptyBlock>}
    </section>
  );
}

function IntelligenceSummary({ center }) {
  const confirmed = safeArray(center?.confirmedItems).slice(0, 3);
  const pending = safeArray(center?.pendingItems).slice().sort((left, right) => {
    const rank = { Crítica: 0, Alta: 1, Media: 2, Baja: 3 };
    return rank[getReviewPriority(left)] - rank[getReviewPriority(right)] || right.playCount - left.playCount;
  }).slice(0, 3);
  const unknown = safeArray(center?.coverage).filter((row) => row.status === 'missing');
  const columns = [
    { icon: '✓', title: 'Qué sabemos con seguridad', rows: confirmed.map((item) => item.title), empty: 'Todavía no hay patrones confirmados.', tone: 'text-emerald-300' },
    { icon: '◐', title: 'Qué falta validar', rows: pending.map((item) => item.title), empty: 'No hay evidencias repetidas pendientes.', tone: 'text-amber-200' },
    { icon: '?', title: 'Qué desconocemos', rows: unknown.map((row) => row.label), empty: 'Todas las fases definidas tienen alguna revisión.', tone: 'text-slate-300' },
  ];
  return (
    <section className="sticky top-3 z-20 rounded-[2rem] border border-caudal-electric/15 bg-[#081426]/95 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-5">
      <div className="grid gap-3 lg:grid-cols-3">
        {columns.map((column) => <div key={column.title} className="rounded-2xl border border-white/[0.06] bg-black/15 p-4"><p className={`text-[9px] font-black uppercase tracking-[0.12em] ${column.tone}`}>{column.icon} {column.title}</p><div className="mt-3 space-y-1.5">{column.rows.length ? column.rows.map((row) => <p key={row} className="line-clamp-1 text-xs font-bold text-slate-200">{row}</p>) : <p className="text-xs font-semibold text-slate-600">{column.empty}</p>}</div></div>)}
      </div>
    </section>
  );
}

function CoveragePanel({ coverage }) {
  const rows = safeArray(coverage);
  const maxCount = Math.max(1, ...rows.map((row) => row.playCount || 0));
  return (
    <section className="rounded-[2rem] border border-white/[0.07] bg-[#091428]/86 p-5 sm:p-6">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Cobertura del análisis</p>
      <h3 className="mt-1 text-xl font-black text-white">Fases revisadas</h3>
      <p className="mt-2 text-xs font-semibold text-slate-500">Longitud relativa según jugadas reales revisadas. No representa un porcentaje.</p>
      <div className="mt-5 space-y-4">
        {rows.map((row) => {
          const width = row.playCount ? Math.max(10, Math.round((row.playCount / maxCount) * 100)) : 0;
          return <div key={row.key}><div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-200">{row.label}</span><span className={`text-[8px] font-black uppercase ${row.status === 'confirmed' ? 'text-emerald-300' : row.status === 'reviewed' ? 'text-amber-200' : 'text-slate-600'}`}>{row.status === 'confirmed' ? '● Confirmada' : row.status === 'reviewed' ? `◐ ${plural(row.playCount, 'jugada')}` : '○ Sin revisar'}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-white/[0.055]"><div className={`h-full rounded-full transition-all duration-500 ${row.status === 'confirmed' ? 'bg-emerald-400' : 'bg-caudal-electric'}`} style={{ width: `${width}%` }} /></div></div>;
        })}
      </div>
    </section>
  );
}

function RelationshipDiagram({ items, onOpen }) {
  const relationNodes = (item) => {
    const parts = item.title.split(/\s+conecta habitualmente con\s+/i).map(clean).filter(Boolean);
    return parts.length > 1 ? parts : [item.title];
  };
  return (
    <section className="rounded-[2rem] border border-white/[0.07] bg-[#091428]/86 p-5 sm:p-6">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Relaciones detectadas</p>
      <h3 className="mt-1 text-xl font-black text-white">Conexiones observadas</h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.length ? items.slice(0, 6).map((item) => (
          <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="rounded-2xl border border-white/[0.06] bg-black/15 p-4 text-left transition hover:border-caudal-electric/25">
            <div className="grid justify-items-center gap-2 text-center">
              {relationNodes(item).map((node, index, nodes) => <div key={`${node}-${index}`} className="contents"><span className="rounded-xl border border-white/10 bg-[#0b1930] px-3 py-2 text-xs font-black text-white">{node}</span>{index < nodes.length - 1 ? <span className="text-caudal-electric" aria-hidden="true">↓</span> : null}</div>)}
            </div>
            <p className="mt-3 text-center text-[9px] font-bold text-slate-500">{plural(item.occurrenceCount, 'conexión', 'conexiones')} · {item.quality}</p>
          </button>
        )) : <div className="sm:col-span-2"><EmptyBlock>No hay conexiones explícitas en las jugadas guardadas.</EmptyBlock></div>}
      </div>
    </section>
  );
}

export default function TacticalEvidencePanel({ report, center, match, onUpdateValidation, onViewPlay, onOpenVideo, onNavigate }) {
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState('analysis');
  const [expandedId, setExpandedId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [savingId, setSavingId] = useState('');
  const [impactItem, setImpactItem] = useState(null);
  const hasMatchVideo = Boolean(clean(match?.videoUrl));
  const filteredItems = useMemo(() => safeArray(center?.items).filter((item) => matchesFilter(item, filter, hasMatchVideo)), [center?.items, filter, hasMatchVideo]);
  const ids = new Set(filteredItems.map((item) => item.id));
  const confirmed = safeArray(center?.confirmedItems).filter((item) => ids.has(item.id));
  const pending = safeArray(center?.pendingItems).filter((item) => ids.has(item.id));
  const signals = safeArray(center?.signalItems).filter((item) => ids.has(item.id));
  const discarded = safeArray(center?.discardedItems).filter((item) => ids.has(item.id));
  const relationships = filteredItems.filter((item) => item.type === 'connection' && item.status !== 'discarded');
  const importantPending = pending.filter((item) => ['Crítica', 'Alta'].includes(getReviewPriority(item)));
  const maturity = maturityPresentation[center?.maturity?.key] || maturityPresentation.initial;
  const updateValidation = async (itemId, patch) => {
    if (savingId) return false;
    setSavingId(itemId);
    try {
      const result = await onUpdateValidation?.(itemId, patch);
      return result?.ok !== false;
    } finally {
      setSavingId('');
    }
  };
  const saveEdit = async (itemId, patch) => {
    if (await updateValidation(itemId, patch)) setEditingId('');
  };
  const cardProps = {
    match,
    expandedId,
    editingId,
    savingId,
    onToggle: (id) => setExpandedId((current) => current === id ? '' : id),
    onEdit: (item) => { setEditingId(item.id); setExpandedId(item.id); },
    onCancelEdit: () => setEditingId(''),
    onSaveEdit: saveEdit,
    onUpdateValidation: updateValidation,
    onViewPlay,
    onOpenVideo,
    onNavigate,
    onShowImpact: setImpactItem,
  };

  return (
    <section className="min-w-0 space-y-5 xl:col-span-2" data-testid="tactical-evidence-center">
      <header className="overflow-hidden rounded-[2rem] border border-caudal-electric/18 bg-[radial-gradient(circle_at_top_right,rgba(79,140,255,0.22),transparent_36%),linear-gradient(145deg,#0b1930,#07111f)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-caudal-electric">Centro de Inteligencia Táctica</p><h2 className="mt-3 text-2xl font-black text-white sm:text-4xl">Capturar <span className="text-slate-600">→</span> Validar <span className="text-slate-600">→</span> Confirmar</h2><p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">El staff decide qué conocimiento trazable pasa a formar parte del scouting oficial.</p></div>
          <div className="flex shrink-0 rounded-2xl border border-white/[0.08] bg-black/20 p-1" aria-label="Modo de visualización">
            <button type="button" onClick={() => setViewMode('analysis')} aria-pressed={viewMode === 'analysis'} className={`rounded-xl px-4 py-2 text-[9px] font-black uppercase ${viewMode === 'analysis' ? 'bg-white text-slate-950' : 'text-slate-400'}`}>Analista</button>
            <button type="button" onClick={() => setViewMode('coach')} aria-pressed={viewMode === 'coach'} className={`rounded-xl px-4 py-2 text-[9px] font-black uppercase ${viewMode === 'coach' ? 'bg-white text-slate-950' : 'text-slate-400'}`}>Vista entrenador</button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon="◐" label="Evidencias pendientes" value={center?.pendingCount || 0} tone="text-amber-200" large />
          <MetricCard icon="●" label="Patrones confirmados" value={center?.confirmedCount || 0} tone="text-emerald-300" large />
          <MetricCard icon="◇" label="Señales aisladas" value={safeArray(center?.signalItems).length} tone="text-cyan-200" large />
          <article className={`rounded-2xl border p-5 ${maturity.tone}`}><div className="flex items-center gap-2"><span className="text-lg" aria-hidden="true">{maturity.icon}</span><p className="text-[9px] font-black uppercase tracking-[0.14em]">Madurez del scouting</p></div><p className="mt-3 text-xl font-black">{maturity.label}</p><div className="mt-3 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${maturity.dot}`} /><span className="text-[9px] font-bold opacity-75">{center?.maturity?.label || 'Inicial'} según evidencias confirmadas</span></div></article>
        </div>
        <p className="mt-4 text-right text-[9px] font-bold uppercase text-slate-600">Última actualización · {formatDateTime(center?.lastUpdatedAt, 'Sin actualizaciones')}</p>
      </header>

      <IntelligenceSummary center={center} />

      {viewMode === 'analysis' ? (
        <>
          <nav className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#091428]/86 p-2" aria-label="Filtros de evidencias"><div className="flex min-w-max gap-1.5">{filterOptions.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-xl px-3 py-2 text-[9px] font-black uppercase transition ${filter === key ? 'bg-white text-slate-950' : 'border border-white/[0.07] text-slate-400 hover:bg-white/[0.05]'}`}>{label}</button>)}</div></nav>
          <EvidenceSection eyebrow="Decisión del staff" title="Evidencias pendientes de validar" description="Comportamientos repetidos con trazabilidad suficiente para ser revisados. Nada alimenta el scouting hasta que el staff lo confirma." items={pending} empty={filter === 'all' ? 'No hay comportamientos repetidos pendientes de validación.' : 'No hay evidencias pendientes para este filtro.'} {...cardProps} />
          <EvidenceSection eyebrow="Scouting oficial" title="Patrones confirmados" description="Estas son las únicas evidencias autorizadas para alimentar Rival, Jugadores y Plan de partido." items={confirmed} empty="Todavía no existe ningún patrón confirmado por el staff." {...cardProps} />
          <EvidenceSection eyebrow="Muestra insuficiente" title="Señales aisladas" description="Se conservan como observaciones trazables, nunca como patrones confirmados." items={signals} empty="No hay señales aisladas para este filtro." {...cardProps} />
          <div className="grid gap-5 xl:grid-cols-2"><CoveragePanel coverage={center?.coverage} /><RelationshipDiagram items={relationships} onOpen={setExpandedId} /></div>
          {discarded.length || filter === 'discarded' ? <EvidenceSection eyebrow="Archivo trazable" title="Evidencias descartadas" description="Se conservan para explicar las decisiones del staff sin alimentar el scouting." items={discarded} empty="No hay evidencias descartadas." {...cardProps} /> : null}
        </>
      ) : (
        <>
          <EvidenceSection eyebrow="Conclusiones" title="Patrones confirmados" items={safeArray(center?.confirmedItems)} empty="Todavía no existe ningún patrón confirmado por el staff." compact {...cardProps} />
          <EvidenceSection eyebrow="Reunión técnica" title="Pendientes importantes" description="Prioridad de revisión alta o crítica calculada solo con la trazabilidad disponible." items={importantPending} empty="No hay pendientes de prioridad alta o crítica." compact {...cardProps} />
          <CoveragePanel coverage={center?.coverage} />
        </>
      )}

      {!report?.playCount ? <EmptyBlock>No hay jugadas guardadas suficientes. El centro permanecerá en estado inicial y no alimentará ninguna recomendación.</EmptyBlock> : null}
      {impactItem ? <ImpactPanel item={impactItem} onClose={() => setImpactItem(null)} onNavigate={onNavigate} /> : null}
    </section>
  );
}
