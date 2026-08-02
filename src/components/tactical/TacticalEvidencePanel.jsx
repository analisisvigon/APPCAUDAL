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

const sourceLabels = {
  tactical_play: 'Jugada',
  tactical_play_description: 'Interpretación',
  player_profile: 'Jugadores',
  collective_profile: 'Perfil',
  tactical_connection: 'Conexiones',
  board_evidence: 'Pizarra',
  staff_observation: 'Staff',
  video: 'Vídeo',
};

const historyLabels = {
  confirmed: 'Confirmada',
  discarded: 'Descartada',
  review: 'Revisión solicitada',
  pending: 'Pendiente',
};

const formatDateTime = (value, fallback = 'Fecha no registrada') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return clean(value) || fallback;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
};

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

function MetricCard({ icon, label, value, tone = 'text-white' }) {
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
      <div className="flex items-center gap-2"><span aria-hidden="true">{icon}</span><p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p></div>
      <p className={`mt-3 text-2xl font-black ${tone}`}>{value}</p>
    </article>
  );
}

function EmptyBlock({ children }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 py-7 text-center text-sm font-semibold text-slate-500">{children}</div>;
}

function UsageChips({ item, onNavigate }) {
  const destinations = [
    ['rival', 'Rival'],
    ['plan', 'Plan de partido'],
    ['players', 'Jugadores'],
  ];
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
  if (!item.contexts.length) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-4">
        <p className="text-xs font-bold text-slate-400">Esta observación no está vinculada a una jugada guardada.</p>
        {item.manualMatch || item.manualDate ? <p className="mt-2 text-[10px] font-semibold text-slate-500">{item.manualMatch ? `Partido: ${item.manualMatch}` : 'Partido no identificado'}{item.manualDate ? ` · Fecha: ${item.manualDate}` : ''}</p> : null}
        <p className="mt-1 text-[10px] font-semibold text-slate-600">No puede confirmarse ni alimentar otras pestañas hasta disponer de trazabilidad real.</p>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-2 border-l border-white/10 pl-4">
      {item.contexts.map((context, index) => (
        <article key={`${context.playId}-${index}`} className="relative rounded-2xl border border-white/[0.07] bg-black/15 p-3">
          <span className="absolute -left-[1.28rem] top-4 h-2.5 w-2.5 rounded-full border-2 border-[#091428] bg-caudal-electric" />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-white">{context.playName || 'Jugada guardada'}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-500">{context.phaseLabel || item.phase}{context.situationLabel ? ` · ${context.situationLabel}` : ''}</p>
            </div>
            <span className="text-[9px] font-bold text-slate-500">{formatDateTime(context.updatedAt || context.createdAt)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
            <span>Partido: {match?.opponent || 'No identificado'}</span>
            <span>Fecha: {match?.date || 'No registrada'}</span>
            <span>Competición: {match?.competition || 'No registrada'}</span>
            <span>Resultado: {match?.result || 'No registrado'}</span>
          </div>
          {safeArray(context.involvedPlayers).filter((player) => player.meaningful).length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">{safeArray(context.involvedPlayers).filter((player) => player.meaningful).map((player) => <span key={player.playerId || player.boardKey || player.name} className="rounded-full border border-white/10 px-2 py-1 text-[8px] font-black uppercase text-slate-400">{player.name || 'Jugador identificado'}</span>)}</div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onViewPlay?.(context.playId, context.phase)} className="rounded-lg border border-caudal-electric/20 px-3 py-2 text-[9px] font-black uppercase text-caudal-electric">Abrir Pizarra</button>
            {match?.videoUrl || context.videoUrl ? <button type="button" onClick={() => onOpenVideo?.(context)} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Abrir vídeo</button> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function EvidenceCard({ item, match, expanded, editing, saving, onToggle, onEdit, onCancelEdit, onSaveEdit, onUpdateValidation, onViewPlay, onOpenVideo, onNavigate }) {
  const [interpretation, setInterpretation] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  const confirmed = item.status === 'confirmed';
  const discarded = item.status === 'discarded';
  const border = confirmed ? 'border-emerald-300/22 bg-emerald-300/[0.045]' : discarded ? 'border-rose-300/15 bg-rose-300/[0.025] opacity-75' : 'border-white/[0.08] bg-[#0a1729]';
  useEffect(() => {
    if (!editing) return;
    setInterpretation(item.title);
    setNotes(item.notes);
  }, [editing, item.notes, item.title]);
  return (
    <article className={`rounded-[1.6rem] border p-4 shadow-[0_18px_50px_rgba(0,0,0,0.16)] transition sm:p-5 ${border}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${qualityTone[item.quality] || qualityTone.Observada}`}>{item.quality}</span>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[8px] font-black uppercase text-slate-500">{item.phase}</span>
          </div>
          <h4 className="mt-3 text-lg font-black leading-6 text-white">{item.title}</h4>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500">
            <span>{item.occurrenceCount} observación{item.occurrenceCount === 1 ? '' : 'es'}</span>
            <span>{item.playCount} jugada{item.playCount === 1 ? '' : 's'}</span>
            <span>{item.matchCount || 0} partido{item.matchCount === 1 ? '' : 's'} identificado{item.matchCount === 1 ? '' : 's'}</span>
            <span>{item.sourceCount} fuente{item.sourceCount === 1 ? '' : 's'} trazable{item.sourceCount === 1 ? '' : 's'}</span>
            <span>Última observación · {formatDateTime(item.updatedAt)}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded-xl px-3 py-2 text-[9px] font-black uppercase ${confirmed ? 'bg-emerald-400 text-slate-950' : discarded ? 'bg-rose-300/10 text-rose-100' : 'bg-amber-300/10 text-amber-100'}`}>{confirmed ? 'Confirmada' : discarded ? 'Descartada' : 'Pendiente'}</span>
      </div>

      {item.participants.length ? <div className="mt-4 flex flex-wrap gap-1.5">{item.participants.map((player) => <span key={player.id || player.name} className="rounded-full border border-violet-300/15 bg-violet-300/[0.055] px-2.5 py-1 text-[8px] font-black uppercase text-violet-100">{player.name}</span>)}</div> : null}
      <div className="mt-4 flex flex-wrap gap-1.5">{item.sources.map((source, index) => <span key={`${source.type}-${source.id}-${index}`} className="rounded-full border border-white/[0.08] bg-black/15 px-2.5 py-1 text-[8px] font-black uppercase text-slate-500">{sourceLabels[source.type] || 'Fuente registrada'}</span>)}</div>

      {editing ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-caudal-electric/20 bg-black/15 p-3">
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Interpretación<input value={interpretation} onChange={(event) => setInterpretation(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-sm font-bold normal-case tracking-normal text-white outline-none" /></label>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Notas del staff<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="min-h-20 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-semibold normal-case tracking-normal text-white outline-none" /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={onCancelEdit} disabled={saving} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300 disabled:opacity-40">Cancelar</button><button type="button" onClick={() => onSaveEdit({ interpretation, notes })} disabled={saving || !clean(interpretation)} className="rounded-lg bg-caudal-electric px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar interpretación'}</button></div>
        </div>
      ) : null}

      {item.notes && !editing ? <p className="mt-4 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2 text-xs font-semibold leading-5 text-slate-400"><span className="font-black text-slate-300">Nota del staff · </span>{item.notes}</p> : null}
      <div className="mt-4"><UsageChips item={item} onNavigate={onNavigate} /></div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
        <button type="button" onClick={onToggle} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">{expanded ? 'Ocultar jugadas' : 'Ver jugadas'}</button>
        <button type="button" onClick={() => onUpdateValidation?.(item.id, { status: 'confirmed' })} disabled={saving || !item.canConfirm || confirmed} title={!item.canConfirm ? 'Se requieren al menos dos jugadas distintas.' : ''} className="rounded-lg border border-emerald-300/20 px-3 py-2 text-[9px] font-black uppercase text-emerald-100 disabled:cursor-not-allowed disabled:opacity-35">{saving ? 'Guardando…' : 'Confirmar'}</button>
        <button type="button" onClick={() => onUpdateValidation?.(item.id, { status: 'discarded' })} disabled={saving || discarded} className="rounded-lg border border-rose-300/15 px-3 py-2 text-[9px] font-black uppercase text-rose-100 disabled:opacity-35">Descartar</button>
        <button type="button" onClick={onEdit} disabled={saving} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300 disabled:opacity-40">Editar interpretación</button>
        <button type="button" onClick={() => onNavigate?.('plan', item)} disabled={!confirmed} title={!confirmed ? 'Confirma primero la evidencia.' : ''} className="rounded-lg border border-caudal-electric/20 px-3 py-2 text-[9px] font-black uppercase text-caudal-electric disabled:cursor-not-allowed disabled:opacity-35">Añadir al Plan</button>
      </div>

      {expanded ? <EvidenceTimeline item={item} match={match} onViewPlay={onViewPlay} onOpenVideo={onOpenVideo} /> : null}
      {expanded && item.history.length ? (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="text-[8px] font-black uppercase tracking-[0.13em] text-slate-600">Historial de validación</p>
          <div className="mt-2 space-y-1">{item.history.slice().reverse().map((entry, index) => <p key={`${entry.at}-${index}`} className="text-[10px] font-semibold text-slate-500">{historyLabels[entry.status] || 'Actualizada'} · {formatDateTime(entry.at)} · {entry.by || 'Staff'}</p>)}</div>
        </div>
      ) : null}
    </article>
  );
}

function EvidenceSection({ eyebrow, title, description, items, empty, ...cardProps }) {
  return (
    <section className="rounded-[2rem] border border-white/[0.07] bg-[#091428]/86 p-4 sm:p-6">
      <div className="mb-5"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">{eyebrow}</p><h3 className="mt-1 text-xl font-black text-white sm:text-2xl">{title}</h3>{description ? <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">{description}</p> : null}</div>
      {items.length ? <div className="grid gap-3 xl:grid-cols-2">{items.map((item) => <EvidenceCard key={item.id} item={item} {...cardProps} saving={cardProps.savingId === item.id} expanded={cardProps.expandedId === item.id} editing={cardProps.editingId === item.id} onToggle={() => cardProps.onToggle(item.id)} onEdit={() => cardProps.onEdit(item)} onCancelEdit={cardProps.onCancelEdit} onSaveEdit={(patch) => cardProps.onSaveEdit(item.id, patch)} />)}</div> : <EmptyBlock>{empty}</EmptyBlock>}
    </section>
  );
}

export default function TacticalEvidencePanel({ report, center, match, onUpdateValidation, onViewPlay, onOpenVideo, onNavigate }) {
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [savingId, setSavingId] = useState('');
  const hasMatchVideo = Boolean(clean(match?.videoUrl));
  const filteredItems = useMemo(() => safeArray(center?.items).filter((item) => matchesFilter(item, filter, hasMatchVideo)), [center?.items, filter, hasMatchVideo]);
  const ids = new Set(filteredItems.map((item) => item.id));
  const confirmed = safeArray(center?.confirmedItems).filter((item) => ids.has(item.id));
  const pending = safeArray(center?.pendingItems).filter((item) => ids.has(item.id));
  const signals = safeArray(center?.signalItems).filter((item) => ids.has(item.id));
  const discarded = safeArray(center?.discardedItems).filter((item) => ids.has(item.id));
  const relationships = filteredItems.filter((item) => item.type === 'connection' && item.status !== 'discarded');
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
  };

  return (
    <section className="min-w-0 space-y-5 xl:col-span-2" data-testid="tactical-evidence-center">
      <header className="overflow-hidden rounded-[2rem] border border-caudal-electric/18 bg-[radial-gradient(circle_at_top_right,rgba(79,140,255,0.18),transparent_38%),linear-gradient(145deg,#0b1930,#07111f)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] sm:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-caudal-electric">Centro de validación táctica</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-2xl font-black text-white sm:text-4xl">Laboratorio de evidencias</h2><p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">Revisa la trazabilidad antes de permitir que una lectura alimente el scouting operativo.</p></div><p className="text-[10px] font-bold uppercase text-slate-500">Última actualización · {formatDateTime(center?.lastUpdatedAt, 'Sin actualizaciones')}</p></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon="◆" label="Jugadas analizadas" value={center?.playCount || 0} tone="text-caudal-electric" />
          <MetricCard icon="◇" label="Evidencias independientes" value={center?.independentEvidenceCount || 0} />
          <MetricCard icon="●" label="Patrones confirmados" value={center?.confirmedCount || 0} tone="text-emerald-300" />
          <MetricCard icon="◐" label="Pendientes de validar" value={center?.pendingCount || 0} tone="text-amber-200" />
        </div>
      </header>

      <section className={`rounded-[2rem] border p-5 sm:p-7 ${center?.maturity?.key === 'high' ? 'border-emerald-300/20 bg-emerald-300/[0.05]' : center?.maturity?.key === 'medium' ? 'border-amber-300/20 bg-amber-300/[0.045]' : 'border-white/[0.08] bg-[#091428]/86'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Madurez del scouting</p><h3 className="mt-2 text-3xl font-black text-white">{center?.maturity?.label || 'Inicial'}</h3><p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-400">{center?.maturity?.description || 'No existe información suficiente.'}</p></div><div className="flex gap-2" aria-label={`Madurez ${center?.maturity?.label || 'Inicial'}`}><span className={`h-3 w-12 rounded-full ${center?.maturity?.key ? 'bg-caudal-electric' : 'bg-white/10'}`} /><span className={`h-3 w-12 rounded-full ${['medium', 'high'].includes(center?.maturity?.key) ? 'bg-amber-300' : 'bg-white/10'}`} /><span className={`h-3 w-12 rounded-full ${center?.maturity?.key === 'high' ? 'bg-emerald-400' : 'bg-white/10'}`} /></div></div>
      </section>

      <nav className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#091428]/86 p-2" aria-label="Filtros de evidencias"><div className="flex min-w-max gap-1.5">{filterOptions.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-xl px-3 py-2 text-[9px] font-black uppercase transition ${filter === key ? 'bg-white text-slate-950' : 'border border-white/[0.07] text-slate-400 hover:bg-white/[0.05]'}`}>{label}</button>)}</div></nav>

      <EvidenceSection eyebrow="Bloque principal" title="Evidencias pendientes de validar" description="Solo aparecen comportamientos repetidos en dos o más jugadas distintas. La confirmación siempre requiere una decisión del staff." items={pending} empty={filter === 'all' ? 'No hay comportamientos repetidos pendientes de validación.' : 'No hay evidencias pendientes para este filtro.'} {...cardProps} />
      <EvidenceSection eyebrow="Scouting validado" title="Patrones confirmados" description="Estas son las únicas evidencias que pueden alimentar Rival, Jugadores y Plan de partido." items={confirmed} empty="Todavía no existe ningún patrón confirmado por el staff." {...cardProps} />
      <EvidenceSection eyebrow="Muestra insuficiente" title="Señales detectadas" description="Observaciones aisladas que deben conservarse como señales, nunca como patrones." items={signals} empty="No hay señales aisladas para este filtro." {...cardProps} />

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-white/[0.07] bg-[#091428]/86 p-5 sm:p-6"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Cobertura del análisis</p><h3 className="mt-1 text-xl font-black text-white">Fases revisadas</h3><div className="mt-5 space-y-2">{safeArray(center?.coverage).map((row) => <div key={row.key} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-3"><div className="flex items-center gap-3"><span className={row.status === 'confirmed' ? 'text-emerald-300' : row.status === 'reviewed' ? 'text-amber-200' : 'text-slate-600'}>{row.status === 'confirmed' ? '●' : '○'}</span><span className="text-sm font-bold text-slate-200">{row.label}</span></div><span className="text-[9px] font-black uppercase text-slate-500">{row.status === 'confirmed' ? 'Confirmada' : row.status === 'reviewed' ? `Revisada · ${row.playCount} jugada${row.playCount === 1 ? '' : 's'}` : 'Sin revisar'}</span></div>)}</div></section>
        <section className="rounded-[2rem] border border-white/[0.07] bg-[#091428]/86 p-5 sm:p-6"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Relaciones detectadas</p><h3 className="mt-1 text-xl font-black text-white">Conexiones en lenguaje futbolístico</h3><div className="mt-5 space-y-2">{relationships.length ? relationships.slice(0, 6).map((item) => <button key={item.id} type="button" onClick={() => setExpandedId(item.id)} className="w-full rounded-xl border border-white/[0.06] bg-black/15 px-4 py-3 text-left"><span className="block text-sm font-black text-white">{item.title}</span><span className="mt-1 block text-[10px] font-semibold text-slate-500">{item.occurrenceCount} conexión{item.occurrenceCount === 1 ? '' : 'es'} · {item.quality}</span></button>) : <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm font-semibold text-slate-500">No hay conexiones explícitas en las jugadas guardadas.</p>}</div></section>
      </div>

      {discarded.length || filter === 'discarded' ? <EvidenceSection eyebrow="Archivo" title="Evidencias descartadas" description="Se conservan para mantener el historial y evitar conclusiones sin trazabilidad." items={discarded} empty="No hay evidencias descartadas." {...cardProps} /> : null}
      {!report?.playCount ? <EmptyBlock>No hay jugadas guardadas suficientes. El centro permanecerá en estado inicial y no alimentará ninguna recomendación.</EmptyBlock> : null}
    </section>
  );
}
