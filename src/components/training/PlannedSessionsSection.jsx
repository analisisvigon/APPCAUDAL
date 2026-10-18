import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPlannedSavePayload,
  createEmptyPlannedEditor,
  getPlannedDuration,
  hydratePlannedEditor,
  PLANNED_PHASES,
  validatePlannedEditor,
} from '../../utils/plannedSessions';
import {
  confirmPlannedSession,
  createPlannedDraft,
  listPlannedSessions,
  loadPlannedContexts,
  loadPlannedSession,
  savePlannedSession,
} from '../../data/plannedSessionsStore';

const panel = 'rounded-2xl border border-white/10 bg-[#0b1a2d]/85 p-4 sm:p-5';
const input = 'min-h-11 w-full rounded-xl border border-white/15 bg-[#071325] px-3 py-2 text-sm text-white outline-none focus:border-caudal-electric';
const button = 'min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const formatDate = (value) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  : 'Sin fecha';
const createId = () => globalThis.crypto?.randomUUID?.() || null;
const readError = (error) => error?.message || 'No se pudo completar la operación.';

const headerFields = [
  ['starts_at', 'Hora de inicio', 'time'],
  ['location', 'Lugar', 'text'],
  ['period_label', 'Periodo', 'text'],
  ['morphology_pattern', 'Patrón morfológico', 'text'],
  ['next_opponent_label', 'Próximo rival', 'text'],
  ['objectives', 'Objetivos', 'textarea'],
  ['notes', 'Notas', 'textarea'],
  ['material', 'Material', 'textarea'],
  ['staff_observations', 'Observaciones del cuerpo técnico', 'textarea'],
];

export default function PlannedSessionsSection({ client, membership, userId, onDirtyChange }) {
  const [contexts, setContexts] = useState([]);
  const [contextId, setContextId] = useState('');
  const [contextsLoading, setContextsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsLoadError, setSessionsLoadError] = useState(false);
  const [editor, setEditor] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [unsupportedItems, setUnsupportedItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const operationRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const selected = contexts.find((row) => row.id === contextId) || null;
  const isManager = membership?.is_active === true && ['owner', 'admin'].includes(membership?.role);
  const canWriteContext = isManager && selected?.status === 'open';
  const canEdit = canWriteContext && !unsupportedItems &&
    !(editor?.id && editor.planning_state === 'confirmed' && editor.session_number == null);
  const dirty = Boolean(editor && (!baseline || JSON.stringify(editor) !== JSON.stringify(baseline)));
  const storageKey = membership?.club_id && userId
    ? `appcaudal-planned-cts:${membership.club_id}:${userId}` : '';

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    setEditor(null); setBaseline(null); setSessions([]); setSessionsLoadError(false);
    setUnsupportedItems(false); setConflict(false); setCreationUncertain(false); setContextId('');
  }, [membership?.club_id, userId]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    setContextsLoading(true);
    setError('');
    setContexts([]);
    loadPlannedContexts(client, membership?.club_id).then((rows) => {
      if (cancelled) return;
      setContexts(rows);
      let stored = '';
      try { stored = storageKey ? window.localStorage.getItem(storageKey) || '' : ''; } catch { /* almacenamiento opcional */ }
      const next = rows.find((row) => row.id === stored) ||
        rows.find((row) => row.is_active) || rows[0];
      setContextId(next?.id || '');
    }).catch((cause) => {
      if (!cancelled) setError(`No se pudo cargar el contexto canónico: ${readError(cause)}`);
    }).finally(() => { if (!cancelled) setContextsLoading(false); });
    return () => { cancelled = true; };
  }, [client, membership?.club_id, storageKey]);

  const refreshList = useCallback(async (targetId = contextId) => {
    if (!targetId) { setSessions([]); setSessionsLoadError(false); return; }
    setSessionsLoading(true);
    try {
      setSessions(await listPlannedSessions(client, targetId));
      setSessionsLoadError(false);
    } catch (cause) {
      setSessionsLoadError(true);
      setError(`No se pudieron cargar las sesiones: ${readError(cause)}`);
    } finally { setSessionsLoading(false); }
  }, [client, contextId]);

  useEffect(() => {
    let cancelled = false;
    if (!contextId) { setSessions([]); setSessionsLoadError(false); return undefined; }
    setSessionsLoading(true);
    listPlannedSessions(client, contextId).then((rows) => {
      if (!cancelled) { setSessions(rows); setSessionsLoadError(false); }
    }).catch((cause) => {
      if (!cancelled) { setSessionsLoadError(true); setError(`No se pudieron cargar las sesiones: ${readError(cause)}`); }
    }).finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [client, contextId]);

  const requestDiscard = () => !dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');
  const changeContext = (nextId) => {
    if (busy || !requestDiscard()) return;
    setEditor(null); setBaseline(null); setUnsupportedItems(false);
    setContextId(nextId); setError(''); setNotice(''); setConflict(false); setCreationUncertain(false);
    try { if (storageKey) window.localStorage.setItem(storageKey, nextId); } catch { /* opcional */ }
  };
  const openSession = async (sessionId, discard = false) => {
    if (busy || operationRef.current || (!discard && !requestDiscard())) return;
    operationRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await loadPlannedSession(client, sessionId, contextId);
      const next = hydratePlannedEditor(data.session, data.slots, data.items);
      setUnsupportedItems(data.items.some((item) => item.kind !== 'free'));
      setEditor(next); setBaseline(next); setConflict(false); setCreationUncertain(false);
    } catch (cause) {
      setError(`No se pudo abrir la sesión: ${readError(cause)}`);
    } finally { operationRef.current = false; setBusy(false); }
  };
  const startNew = () => {
    if (!canWriteContext || busy || !requestDiscard()) return;
    setEditor(createEmptyPlannedEditor()); setBaseline(null);
    setUnsupportedItems(false); setError(''); setNotice(''); setConflict(false); setCreationUncertain(false);
  };
  const updateEditor = (update) => setEditor((current) => current ? update(current) : current);
  const updateSlot = (slotId, update) => updateEditor((current) => ({
    ...current, slots: current.slots.map((slot) => slot.id === slotId ? update(slot) : slot),
  }));
  const moveSlot = (slotId, direction) => updateEditor((current) => {
    const slots = [...current.slots];
    const index = slots.findIndex((slot) => slot.id === slotId);
    const siblings = slots.map((slot, position) => slot.phase === slots[index]?.phase ? position : -1)
      .filter((position) => position >= 0);
    const siblingIndex = siblings.indexOf(index);
    const target = siblings[siblingIndex + direction];
    if (target == null) return current;
    [slots[index], slots[target]] = [slots[target], slots[index]];
    return { ...current, slots };
  });
  const moveItem = (slotId, itemId, direction) => updateSlot(slotId, (slot) => {
    const items = [...slot.items];
    const index = items.findIndex((item) => item.id === itemId);
    const target = index + direction;
    if (target < 0 || target >= items.length) return slot;
    [items[index], items[target]] = [items[target], items[index]];
    return { ...slot, items };
  });
  const moveItemToSlot = (sourceId, itemId, targetId) => updateEditor((current) => {
    if (sourceId === targetId) return current;
    const source = current.slots.find((slot) => slot.id === sourceId);
    const item = source?.items.find((entry) => entry.id === itemId);
    if (!item || !current.slots.some((slot) => slot.id === targetId)) return current;
    return { ...current, slots: current.slots.map((slot) => slot.id === sourceId
      ? { ...slot, items: slot.items.filter((entry) => entry.id !== itemId) }
      : slot.id === targetId ? { ...slot, items: [...slot.items, item] } : slot) };
  });

  const save = async () => {
    if (!editor || !selected || !canEdit || busy || operationRef.current || creationUncertain) return;
    const issues = validatePlannedEditor(editor, selected);
    if (issues.length) { setError(issues.join(' ')); return; }
    operationRef.current = true;
    setBusy(true); setError(''); setNotice(''); setConflict(false);
    let working = editor;
    let original = baseline;
    let creating = false;
    try {
      if (!working.id) {
        creating = true;
        const id = await createPlannedDraft(client, selected.id, working.session_date);
        creating = false;
        working = { ...working, id, revision: 1 };
        original = { ...createEmptyPlannedEditor(), id, revision: 1,
          session_date: working.session_date };
        setEditor(working); setBaseline(original);
      }
      const revision = await savePlannedSession(client, buildPlannedSavePayload(working, original));
      const saved = { ...working, revision };
      setEditor(saved); setBaseline(saved);
      setNotice('Sesión guardada.');
      try {
        const data = await loadPlannedSession(client, working.id, selected.id);
        const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
        setEditor(fresh); setBaseline(fresh);
        setUnsupportedItems(data.items.some((item) => item.kind !== 'free'));
      } catch (reloadError) {
        setNotice(`Guardado confirmado, pero no se pudo recargar: ${readError(reloadError)}`);
      }
      await refreshList(selected.id);
    } catch (cause) {
      if (creating) {
        setCreationUncertain(true);
        setError('No se pudo confirmar si el servidor creó el borrador. No repitas Guardar: actualiza la lista y comprueba si apareció una sesión nueva antes de iniciar otra. ' + readError(cause));
      } else if (cause?.code === '40001') {
        setConflict(true);
        setError('Otra edición cambió esta sesión. Tus cambios siguen aquí; recarga para ver la versión actual antes de volver a editar.');
      } else {
        setError(`No se pudo guardar. Los cambios siguen en el formulario. ${readError(cause)}`);
      }
    } finally { operationRef.current = false; setBusy(false); }
  };

  const confirm = async () => {
    if (!editor?.id || !selected || !canEdit || busy || operationRef.current || dirty || conflict) return;
    const issues = validatePlannedEditor(editor, selected);
    if (editor.slots.some((slot) => !slot.items.length)) {
      issues.push('Para confirmar, cada franja existente necesita al menos una actividad.');
    }
    if (issues.length) { setError(issues.join(' ')); return; }
    if (!window.confirm('¿Confirmar esta sesión? Se asignará su número definitivo.')) return;
    operationRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const revision = await confirmPlannedSession(client, editor.id, editor.revision);
      setEditor((current) => ({ ...current, revision, planning_state: 'confirmed' }));
      setBaseline((current) => ({ ...current, revision, planning_state: 'confirmed' }));
      try {
        const data = await loadPlannedSession(client, editor.id, selected.id);
        const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
        setEditor(fresh); setBaseline(fresh);
        setNotice(`Sesión confirmada con el número ${fresh.session_number}.`);
      } catch (reloadError) {
        setNotice('Confirmación aceptada por el servidor. Recarga la ficha para ver el número asignado.');
        setError(`No se pudo recargar la sesión: ${readError(reloadError)}`);
      }
      await refreshList(selected.id);
    } catch (cause) {
      if (cause?.code === '40001') setConflict(true);
      setError(`No se pudo confirmar. ${readError(cause)}`);
    } finally { operationRef.current = false; setBusy(false); }
  };

  const phaseSlots = useMemo(() => Object.fromEntries(PLANNED_PHASES.map((phase) => [
    phase.key, editor?.slots.filter((slot) => slot.phase === phase.key) || [],
  ])), [editor?.slots]);

  return (
    <main className="space-y-5 pb-24 xl:pb-8">
      <header className={panel}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-caudal-electric">Planificación de entrenamientos</p>
        <h2 className="mt-1 text-2xl font-black text-white">Sesiones</h2>
        {contextsLoading ? <p className="mt-3 text-sm text-slate-300">Cargando equipo y temporada…</p> : null}
        {!contextsLoading && !contexts.length && !error ? (
          <p className="mt-3 text-sm text-slate-300">No hay relaciones equipo-temporada visibles para esta cuenta. Puede que no exista ninguna o que falte autorización; la aplicación no puede distinguir ambos casos con esta consulta.</p>
        ) : null}
        {contexts.length ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block w-full max-w-md text-xs font-semibold text-slate-300">
              Equipo y temporada
              <select className={`${input} mt-1`} value={contextId}
                onChange={(event) => changeContext(event.target.value)} disabled={busy}>
                {contexts.map((row) => <option key={row.id} value={row.id}>
                  {row.team_name} · {row.label}{row.status === 'closed' ? ' · Cerrada' : ''}
                </option>)}
              </select>
            </label>
            {canWriteContext ? <button type="button" className={`${button} bg-caudal-electric text-slate-950`}
              disabled={busy} onClick={startNew}>Nueva sesión</button> : null}
          </div>
        ) : null}
        {selected ? <p className="mt-3 text-sm text-slate-400">
          {formatDate(selected.starts_on)} — {formatDate(selected.ends_on)} ·
          {selected.status === 'closed' ? ' Temporada cerrada: solo consulta' :
            isManager ? ' Temporada abierta' : ' Consulta; escritura reservada al propietario/administrador de pruebas'}
        </p> : null}
      </header>

      {error ? <div role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-100">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-caudal-electric/30 bg-caudal-electric/10 p-3 text-sm text-slate-100">{notice}</div> : null}

      {selected ? <section className={panel}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">Sesiones de {selected.label}</h3>
          <button type="button" className={`${button} border border-white/15 text-slate-200`}
            disabled={sessionsLoading || busy} onClick={() => refreshList()}>Actualizar</button>
        </div>
        {sessionsLoading ? <p className="mt-3 text-sm text-slate-400">Cargando sesiones…</p> : null}
        {!sessionsLoading && !sessionsLoadError && !sessions.length ? <p className="mt-3 text-sm text-slate-400">Todavía no hay sesiones planificadas para este equipo-temporada.</p> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {sessions.map((row) => <button type="button" key={row.id} onClick={() => openSession(row.id)}
            disabled={busy} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-caudal-electric/50 disabled:opacity-60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-white">{formatDate(row.session_date)}{row.starts_at ? ` · ${String(row.starts_at).slice(0, 5)}` : ''}</span>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${row.planning_state === 'confirmed'
                ? 'bg-caudal-electric/15 text-caudal-electric' : 'bg-white/10 text-slate-300'}`}>
                {row.planning_state === 'confirmed' ? `Confirmada · Nº ${row.session_number}` : 'Borrador'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{row.total_minutes} min planificados · Abrir sesión</p>
          </button>)}
        </div>
      </section> : null}

      {editor && selected ? <section className="space-y-4" aria-label="Ficha de sesión">
        <div className={`${panel} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h3 className="text-xl font-bold">{editor.id ?
              (editor.planning_state === 'confirmed'
                ? editor.session_number == null ? 'Sesión confirmada · recarga pendiente' : `Sesión nº ${editor.session_number}`
                : 'Borrador') : 'Nueva sesión'}</h3>
            <p className="text-xs text-slate-400">{editor.id ? `Revisión ${editor.revision}` : 'Se creará un borrador al guardar'} · {getPlannedDuration(editor.slots)} min por franjas</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? <button type="button" className={`${button} bg-caudal-electric text-slate-950`}
              onClick={save} disabled={busy || !dirty || conflict || creationUncertain}>
              {busy ? 'Procesando…' : 'Guardar'}</button> : null}
            {canEdit && editor.id && editor.planning_state === 'draft' ?
              <button type="button" className={`${button} border border-caudal-electric/50 text-caudal-electric`}
                onClick={confirm} disabled={busy || dirty || conflict}>Confirmar y numerar</button> : null}
            {editor.id ? <button type="button" className={`${button} border border-white/15 text-slate-200`}
              onClick={() => { if (requestDiscard()) openSession(editor.id, true); }} disabled={busy}>Recargar</button> : null}
            <button type="button" className={`${button} border border-white/15 text-slate-200`}
              onClick={() => { if (requestDiscard()) { setEditor(null); setBaseline(null); setConflict(false); setCreationUncertain(false); } }}
              disabled={busy}>Cerrar ficha</button>
          </div>
          {dirty ? <p className="w-full text-xs text-amber-200">Hay cambios sin guardar. La confirmación exige guardarlos primero.</p> : null}
          {creationUncertain ? <p className="w-full text-xs text-amber-200">Guardado bloqueado hasta revisar la lista de sesiones y cerrar esta ficha.</p> : null}
          {unsupportedItems ? <p className="w-full text-xs text-amber-200">Esta sesión contiene tareas de Biblioteca; 03B solo permite consultarla, no editarla.</p> : null}
        </div>

        <div className={panel}>
          <h4 className="font-bold">Datos de la sesión</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-300">Fecha
              <input className={`${input} mt-1`} type="date" min={selected.starts_on} max={selected.ends_on}
                value={editor.session_date} disabled={!canEdit || busy}
                onChange={(event) => updateEditor((current) => ({ ...current, session_date: event.target.value }))} />
            </label>
            {headerFields.map(([key, label, type]) => <label key={key}
              className={`text-xs font-semibold text-slate-300 ${type === 'textarea' ? 'sm:col-span-2' : ''}`}>
              {label}
              {type === 'textarea' ? <textarea className={`${input} mt-1 min-h-24 resize-y`}
                value={editor.header[key]} disabled={!canEdit || busy}
                onChange={(event) => updateEditor((current) => ({ ...current,
                  header: { ...current.header, [key]: event.target.value } }))} /> :
                <input className={`${input} mt-1`} type={type} value={editor.header[key]}
                  disabled={!canEdit || busy}
                  onChange={(event) => updateEditor((current) => ({ ...current,
                    header: { ...current.header, [key]: event.target.value } }))} />}
            </label>)}
          </div>
        </div>

        {PLANNED_PHASES.map((phase) => <section className={panel} key={phase.key}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-lg font-bold">{phase.label}</h4>
            {canEdit ? <button type="button" className={`${button} border border-white/15 text-slate-200`}
              disabled={busy} onClick={() => {
                const id = createId();
                if (!id) { setError('Este navegador no puede crear UUID seguros.'); return; }
                updateEditor((current) => ({ ...current, slots: [...current.slots,
                  { id, phase: phase.key, duration: '', items: [] }] }));
              }}>Añadir franja</button> : null}
          </div>
          {!phaseSlots[phase.key].length ? <p className="mt-3 text-sm text-slate-400">Fase vacía.</p> : null}
          <div className="mt-3 space-y-3">
            {phaseSlots[phase.key].map((slot, slotIndex) => <div key={slot.id}
              className="rounded-xl border border-white/10 bg-[#071325] p-3 sm:p-4">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-32 flex-1 text-xs font-semibold text-slate-300">
                  Franja {slotIndex + 1} · minutos
                  <input className={`${input} mt-1`} type="number" min="1" step="1"
                    value={slot.duration} disabled={!canEdit || busy}
                    onChange={(event) => updateSlot(slot.id, (current) => ({ ...current, duration: event.target.value }))} />
                </label>
                {canEdit ? <div className="flex flex-wrap gap-1">
                  <button type="button" aria-label="Subir franja" className={`${button} border border-white/15`}
                    disabled={busy || slotIndex === 0} onClick={() => moveSlot(slot.id, -1)}>↑</button>
                  <button type="button" aria-label="Bajar franja" className={`${button} border border-white/15`}
                    disabled={busy || slotIndex === phaseSlots[phase.key].length - 1} onClick={() => moveSlot(slot.id, 1)}>↓</button>
                  <button type="button" className={`${button} border border-red-400/30 text-red-200`}
                    disabled={busy} onClick={() => {
                      if (window.confirm('¿Retirar esta franja y sus actividades al guardar?')) {
                        updateEditor((current) => ({ ...current,
                          slots: current.slots.filter((entry) => entry.id !== slot.id) }));
                      }
                    }}>Retirar</button>
                </div> : null}
              </div>
              {canEdit && editor.slots.length > 1 ? <label className="mt-2 block text-xs text-slate-400">
                Mover franja a fase
                <select className={`${input} mt-1`} value={slot.phase} disabled={busy}
                  onChange={(event) => updateEditor((current) => {
                    const without = current.slots.filter((entry) => entry.id !== slot.id);
                    const targetPhase = event.target.value;
                    const last = without.reduce((found, entry, index) =>
                      entry.phase === targetPhase ? index : found, -1);
                    without.splice(last + 1, 0, { ...slot, phase: targetPhase });
                    return { ...current, slots: without };
                  })}>
                  {PLANNED_PHASES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                </select>
              </label> : null}
              <p className="mt-3 text-xs text-slate-400">Las actividades de esta franja se realizan en paralelo.</p>
              <div className="mt-2 space-y-2">
                {slot.items.map((item, itemIndex) => <div key={item.id}
                  className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-slate-300">Título
                      <input className={`${input} mt-1`} value={item.title} disabled={!canEdit || busy}
                        onChange={(event) => updateSlot(slot.id, (current) => ({ ...current,
                          items: current.items.map((entry) => entry.id === item.id
                            ? { ...entry, title: event.target.value } : entry) }))} />
                    </label>
                    <label className="text-xs text-slate-300">Duración propia (opcional)
                      <input className={`${input} mt-1`} type="number" min="1" step="1"
                        value={item.minutes} disabled={!canEdit || busy}
                        onChange={(event) => updateSlot(slot.id, (current) => ({ ...current,
                          items: current.items.map((entry) => entry.id === item.id
                            ? { ...entry, minutes: event.target.value } : entry) }))} />
                    </label>
                    {[
                      ['description', 'Descripción', 'textarea'],
                      ['comments', 'Comentarios', 'textarea'],
                      ['url', 'Enlace HTTPS', 'url'],
                    ].map(([key, label, type]) => <label key={key}
                      className={`text-xs text-slate-300 ${type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                      {label}
                      {type === 'textarea' ? <textarea className={`${input} mt-1 min-h-20 resize-y`}
                        value={item[key]} disabled={!canEdit || busy}
                        onChange={(event) => updateSlot(slot.id, (current) => ({ ...current,
                          items: current.items.map((entry) => entry.id === item.id
                            ? { ...entry, [key]: event.target.value } : entry) }))} /> :
                        <input className={`${input} mt-1`} type={type} value={item[key]}
                          disabled={!canEdit || busy}
                          onChange={(event) => updateSlot(slot.id, (current) => ({ ...current,
                            items: current.items.map((entry) => entry.id === item.id
                              ? { ...entry, [key]: event.target.value } : entry) }))} />}
                    </label>)}
                  </div>
                  {canEdit ? <div className="mt-3 flex flex-wrap items-end gap-2">
                    <button type="button" aria-label="Subir actividad" className={`${button} border border-white/15`}
                      disabled={busy || itemIndex === 0} onClick={() => moveItem(slot.id, item.id, -1)}>↑</button>
                    <button type="button" aria-label="Bajar actividad" className={`${button} border border-white/15`}
                      disabled={busy || itemIndex === slot.items.length - 1} onClick={() => moveItem(slot.id, item.id, 1)}>↓</button>
                    {editor.slots.length > 1 ? <label className="min-w-40 flex-1 text-xs text-slate-400">
                      Mover a otra franja
                      <select className={`${input} mt-1`} value={slot.id} disabled={busy}
                        onChange={(event) => moveItemToSlot(slot.id, item.id, event.target.value)}>
                        {editor.slots.map((target) => <option key={target.id} value={target.id}>
                          {PLANNED_PHASES.find((entry) => entry.key === target.phase)?.label} · franja {editor.slots.filter((entry) => entry.phase === target.phase).findIndex((entry) => entry.id === target.id) + 1}
                        </option>)}
                      </select>
                    </label> : null}
                    <button type="button" className={`${button} border border-red-400/30 text-red-200`}
                      disabled={busy} onClick={() => updateSlot(slot.id, (current) => ({ ...current,
                        items: current.items.filter((entry) => entry.id !== item.id) }))}>Retirar actividad</button>
                  </div> : null}
                </div>)}
              </div>
              {canEdit ? <button type="button" className={`${button} mt-3 border border-white/15 text-slate-200`}
                disabled={busy} onClick={() => {
                  const id = createId();
                  if (!id) { setError('Este navegador no puede crear UUID seguros.'); return; }
                  updateSlot(slot.id, (current) => ({ ...current, items: [...current.items,
                    { id, title: '', description: '', comments: '', url: '', minutes: '' }] }));
                }}>Añadir actividad libre</button> : null}
            </div>)}
          </div>
        </section>)}
      </section> : null}
    </main>
  );
}
