import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPlannedSavePayload,
  createEmptyPlannedEditor,
  getPlannedDuration,
  getPlannedEditorIssues,
  hydratePlannedEditor,
  PLANNED_PHASES,
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

const detailFields = [
  ['period_label', 'Periodo', 'text'],
  ['morphology_pattern', 'Patrón morfológico', 'text'],
  ['next_opponent_label', 'Próximo rival', 'text'],
  ['material', 'Material', 'textarea'],
  ['notes', 'Notas', 'textarea'],
  ['staff_observations', 'Observaciones del cuerpo técnico', 'textarea'],
];
const blankTask = (id) => ({ id, title: '', description: '', comments: '', url: '', minutes: '' });
const errorKind = (error) => {
  if (error?.code === '42501' || error?.code === 'PGRST301' || error?.status === 401 || error?.status === 403) return 'Permisos';
  if (error?.code === '23514' || error?.code === '22023') return 'Validación';
  return 'Conexión o servidor';
};

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
  const [validationIssues, setValidationIssues] = useState([]);
  const [expandedSlotId, setExpandedSlotId] = useState(null);
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
    setUnsupportedItems(false); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null); setContextId('');
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
      if (!cancelled) setError(`${errorKind(cause)}: no se pudo cargar el contexto canónico. ${readError(cause)}`);
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
      setError(`${errorKind(cause)}: no se pudieron cargar las sesiones. ${readError(cause)}`);
    } finally { setSessionsLoading(false); }
  }, [client, contextId]);

  useEffect(() => {
    let cancelled = false;
    if (!contextId) { setSessions([]); setSessionsLoadError(false); return undefined; }
    setSessionsLoading(true);
    listPlannedSessions(client, contextId).then((rows) => {
      if (!cancelled) { setSessions(rows); setSessionsLoadError(false); }
    }).catch((cause) => {
      if (!cancelled) { setSessionsLoadError(true); setError(`${errorKind(cause)}: no se pudieron cargar las sesiones. ${readError(cause)}`); }
    }).finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [client, contextId]);

  const requestDiscard = () => !dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');
  const changeContext = (nextId) => {
    if (busy || !requestDiscard()) return;
    setEditor(null); setBaseline(null); setUnsupportedItems(false); setValidationIssues([]); setExpandedSlotId(null);
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
      setUnsupportedItems(data.items.some((item) => item.kind !== 'free') || next.slots.some((slot) => slot.items.length > 2));
      setEditor(next); setBaseline(next); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null);
    } catch (cause) {
      setError(`${errorKind(cause)}: no se pudo abrir la sesión. ${readError(cause)}`);
    } finally { operationRef.current = false; setBusy(false); }
  };
  const startNew = () => {
    if (!canWriteContext || busy || !requestDiscard()) return;
    setEditor(createEmptyPlannedEditor()); setBaseline(null);
    setUnsupportedItems(false); setError(''); setNotice(''); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null);
  };
  const updateEditor = (update) => {
    setValidationIssues([]);
    setEditor((current) => current ? update(current) : current);
  };
  const fieldIssue = (field, slotId = null, itemId = null) => validationIssues.find((issue) =>
    issue.field === field && issue.slotId === slotId && issue.itemId === itemId)?.message;
  const issueText = (field, slotId = null, itemId = null) => {
    const message = fieldIssue(field, slotId, itemId);
    return message ? <span className="mt-1 block text-xs font-medium text-rose-300">{message}</span> : null;
  };
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
    const target = current.slots.find((slot) => slot.id === targetId);
    const item = source?.items.find((entry) => entry.id === itemId);
    if (!item || !target || source.items.length < 2 || target.items.length >= 2) return current;
    return { ...current, slots: current.slots.map((slot) => slot.id === sourceId
      ? { ...slot, items: slot.items.filter((entry) => entry.id !== itemId) }
      : slot.id === targetId ? { ...slot, items: [...slot.items, item] } : slot) };
  });

  const save = async () => {
    if (!editor || !selected || !canEdit || busy || operationRef.current || creationUncertain) return;
    const issues = getPlannedEditorIssues(editor, selected);
    if (issues.length) {
      setValidationIssues(issues); setExpandedSlotId(issues.find((issue) => issue.slotId)?.slotId || null);
      setError(`Validación: ${issues[0].message} Corrige los campos señalados antes de guardar.`);
      return;
    }
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
        setUnsupportedItems(data.items.some((item) => item.kind !== 'free') || fresh.slots.some((slot) => slot.items.length > 2));
      } catch (reloadError) {
        setNotice(`Guardado confirmado, pero no se pudo recargar: ${readError(reloadError)}`);
      }
      await refreshList(selected.id);
    } catch (cause) {
      if (creating && ['42501', '23514', '22023'].includes(cause?.code)) {
        setError(`${errorKind(cause)}: no se pudo crear el borrador. Los cambios siguen en el formulario. ${readError(cause)}`);
      } else if (creating) {
        setCreationUncertain(true);
        setError(`Conexión o servidor: no se pudo confirmar si se creó el borrador. No repitas Guardar: actualiza la lista y comprueba si apareció una sesión nueva antes de iniciar otra. ${readError(cause)}`);
      } else if (cause?.code === '40001') {
        setConflict(true);
        setError('Otra edición cambió esta sesión. Tus cambios siguen aquí; recarga para ver la versión actual antes de volver a editar.');
      } else {
        setError(`${errorKind(cause)}: no se pudo guardar. Los cambios siguen en el formulario. ${readError(cause)}`);
      }
    } finally { operationRef.current = false; setBusy(false); }
  };

  const confirm = async () => {
    if (!editor?.id || !selected || !canEdit || busy || operationRef.current || dirty || conflict) return;
    const issues = getPlannedEditorIssues(editor, selected);
    if (issues.length) {
      setValidationIssues(issues); setExpandedSlotId(issues.find((issue) => issue.slotId)?.slotId || null);
      setError(`Validación: ${issues[0].message}`); return;
    }
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
      setError(`${errorKind(cause)}: no se pudo confirmar. ${readError(cause)}`);
    } finally { operationRef.current = false; setBusy(false); }
  };

  const phaseSlots = useMemo(() => Object.fromEntries(PLANNED_PHASES.map((phase) => [
    phase.key, editor?.slots.filter((slot) => slot.phase === phase.key) || [],
  ])), [editor?.slots]);
  const orderedSlots = useMemo(() => PLANNED_PHASES.flatMap((phase) => phaseSlots[phase.key]), [phaseSlots]);
  const exerciseNumber = (id) => orderedSlots.findIndex((slot) => slot.id === id) + 1;
  const addExercise = (phase) => {
    const slotId = createId();
    const taskId = createId();
    if (!slotId || !taskId) { setError('Este navegador no puede crear UUID seguros.'); return; }
    updateEditor((current) => ({ ...current, slots: [...current.slots,
      { id: slotId, phase, duration: '', items: [blankTask(taskId)] }] }));
    setExpandedSlotId(slotId);
  };
  const updateHeader = (key, value) => updateEditor((current) => ({ ...current,
    header: { ...current.header, [key]: value },
  }));
  const updateTask = (slotId, itemId, key, value) => updateSlot(slotId, (slot) => ({
    ...slot, items: slot.items.map((item) => item.id === itemId ? { ...item, [key]: value } : item),
  }));

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
        <div className={`${panel} border-caudal-electric/20 bg-gradient-to-br from-[#102a43] to-[#091726]`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-caudal-electric">Plan de entrenamiento</p>
              <h3 className="mt-1 text-xl font-black sm:text-2xl">{editor.id ?
                (editor.planning_state === 'confirmed'
                  ? editor.session_number == null ? 'Sesión confirmada · recarga pendiente' : `Sesión nº ${editor.session_number}`
                  : 'Borrador de sesión') : 'Nueva sesión'}</h3>
              <p className="mt-1 text-xs text-slate-400">{editor.id ? `Revisión ${editor.revision}` : 'El borrador se crea al guardar'} · {selected.team_name} · {selected.label}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-center text-xs font-semibold">
              <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><strong className="block text-lg text-white">{getPlannedDuration(editor.slots)}</strong>minutos</span>
              <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><strong className="block text-lg text-white">{editor.slots.length}</strong>ejercicios</span>
              <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><strong className="block text-sm text-white">{editor.planning_state === 'confirmed' ? 'Confirmada' : 'Borrador'}</strong>estado</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {canEdit ? <button type="button" className={`${button} bg-caudal-electric text-slate-950`}
              onClick={save} disabled={busy || !dirty || conflict || creationUncertain}>
              {busy ? 'Procesando…' : 'Guardar cambios'}</button> : null}
            {canEdit && editor.id && editor.planning_state === 'draft' ?
              <button type="button" className={`${button} border border-caudal-electric/50 text-caudal-electric`}
                onClick={confirm} disabled={busy || dirty || conflict}>Confirmar y numerar</button> : null}
            {editor.id ? <button type="button" className={`${button} border border-white/15 text-slate-200`}
              onClick={() => { if (requestDiscard()) openSession(editor.id, true); }} disabled={busy}>Recargar</button> : null}
            <button type="button" className={`${button} border border-white/15 text-slate-200`}
              onClick={() => { if (requestDiscard()) { setEditor(null); setBaseline(null); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null); } }}
              disabled={busy}>Cerrar ficha</button>
          </div>
          {dirty ? <p className="mt-3 text-xs text-amber-200">Cambios sin guardar. Guarda antes de confirmar.</p> : null}
          {creationUncertain ? <p className="mt-3 text-xs text-amber-200">Guardado bloqueado: revisa la lista antes de cerrar esta ficha o crear otra sesión.</p> : null}
          {unsupportedItems ? <p className="mt-3 text-xs text-amber-200">Esta sesión contiene tareas de Biblioteca o ejercicios con más de dos tareas. 03B bloquea su edición para conservar los datos originales; las tareas de Biblioteca no se muestran en esta ficha.</p> : null}
        </div>

        <div className={panel}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div><p className="text-xs font-bold uppercase tracking-widest text-caudal-electric">Datos esenciales</p><h4 className="text-lg font-bold">Cuándo y para qué</h4></div>
            <span className="text-xs text-slate-400">{formatDate(editor.session_date)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-semibold text-slate-300">Fecha
              <input className={`${input} mt-1`} type="date" min={selected.starts_on} max={selected.ends_on}
                value={editor.session_date} disabled={!canEdit || busy}
                aria-invalid={Boolean(fieldIssue('session_date'))}
                onChange={(event) => updateEditor((current) => ({ ...current, session_date: event.target.value }))} />
              {issueText('session_date')}
            </label>
            {[
              ['starts_at', 'Hora de inicio', 'time'], ['location', 'Lugar', 'text'],
            ].map(([key, label, type]) => <label key={key} className="text-xs font-semibold text-slate-300">{label}
              <input className={`${input} mt-1`} type={type} value={editor.header[key]} disabled={!canEdit || busy}
                aria-invalid={Boolean(fieldIssue(key))} onChange={(event) => updateHeader(key, event.target.value)} />
              {issueText(key)}
            </label>)}
            <label className="text-xs font-semibold text-slate-300 sm:col-span-2 lg:col-span-3">Objetivos
              <textarea className={`${input} mt-1 min-h-20 resize-y`} value={editor.header.objectives}
                disabled={!canEdit || busy} aria-invalid={Boolean(fieldIssue('objectives'))}
                onChange={(event) => updateHeader('objectives', event.target.value)} />
              {issueText('objectives')}
            </label>
          </div>
          <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3" open={validationIssues.some((issue) => detailFields.some(([key]) => key === issue.field)) || undefined}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">Más detalles</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {detailFields.map(([key, label, type]) => <label key={key}
                className={`text-xs font-semibold text-slate-300 ${type === 'textarea' ? 'sm:col-span-2' : ''}`}>{label}
                {type === 'textarea' ? <textarea className={`${input} mt-1 min-h-20 resize-y`}
                  value={editor.header[key]} disabled={!canEdit || busy} aria-invalid={Boolean(fieldIssue(key))}
                  onChange={(event) => updateHeader(key, event.target.value)} /> :
                  <input className={`${input} mt-1`} type={type} value={editor.header[key]}
                    disabled={!canEdit || busy} aria-invalid={Boolean(fieldIssue(key))}
                    onChange={(event) => updateHeader(key, event.target.value)} />}
                {issueText(key)}
              </label>)}
            </div>
          </details>
        </div>

        {PLANNED_PHASES.map((phase) => <section className={panel} key={phase.key}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-caudal-electric">{phaseSlots[phase.key].length} ejercicios · {getPlannedDuration(phaseSlots[phase.key])} min</p>
              <h4 className="text-lg font-bold">{phase.label}</h4>
            </div>
            {canEdit ? <button type="button" className={`${button} border border-caudal-electric/40 text-caudal-electric`}
              disabled={busy} onClick={() => addExercise(phase.key)}>+ Añadir ejercicio</button> : null}
          </div>
          {!phaseSlots[phase.key].length ? <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">Sin ejercicios en esta fase.</p> : null}
          <div className="mt-3 space-y-2">
            {phaseSlots[phase.key].map((slot, slotIndex) => {
              const isExpanded = expandedSlotId === slot.id;
              const slotHasIssue = validationIssues.some((issue) => issue.slotId === slot.id);
              const taskSummary = slot.items.map((item, index) => `Tarea ${String.fromCharCode(65 + index)}: ${item.title.trim() || 'Sin título'}`).join(' · ') || 'Sin Tarea A';
              return <article key={slot.id} className={`overflow-hidden rounded-xl border bg-[#071325] ${slotHasIssue ? 'border-rose-400/60' : isExpanded ? 'border-caudal-electric/40' : 'border-white/10'}`}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.035]"
                  aria-expanded={isExpanded} aria-controls={`exercise-${slot.id}`}
                  onClick={() => setExpandedSlotId(isExpanded ? null : slot.id)}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-caudal-electric/15 text-sm font-black text-caudal-electric">{exerciseNumber(slot.id)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">Ejercicio {exerciseNumber(slot.id)} <span className="font-normal text-slate-400">· {phase.label}</span></span>
                    <span className="block truncate text-xs text-slate-400">{taskSummary}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-300"><strong className="block text-sm text-white">{slot.duration || '—'} min</strong>{slot.items.length} {slot.items.length === 1 ? 'tarea' : 'tareas'}</span>
                  <span aria-hidden="true" className="ml-1 text-caudal-electric">{isExpanded ? '−' : '+'}</span>
                </button>
                {isExpanded ? <div id={`exercise-${slot.id}`} className="border-t border-white/10 px-4 pb-4 pt-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-36 flex-1 text-xs font-semibold text-slate-300">Duración del ejercicio · minutos
                      <input className={`${input} mt-1`} type="number" min="1" step="1" value={slot.duration}
                        disabled={!canEdit || busy} aria-invalid={Boolean(fieldIssue('duration', slot.id))}
                        onChange={(event) => updateSlot(slot.id, (current) => ({ ...current, duration: event.target.value }))} />
                      {issueText('duration', slot.id)}
                    </label>
                    {canEdit ? <div className="flex flex-wrap gap-1">
                      <button type="button" aria-label={`Subir ejercicio ${exerciseNumber(slot.id)}`} className={`${button} border border-white/15`}
                        disabled={busy || slotIndex === 0} onClick={() => moveSlot(slot.id, -1)}>↑</button>
                      <button type="button" aria-label={`Bajar ejercicio ${exerciseNumber(slot.id)}`} className={`${button} border border-white/15`}
                        disabled={busy || slotIndex === phaseSlots[phase.key].length - 1} onClick={() => moveSlot(slot.id, 1)}>↓</button>
                      <button type="button" className={`${button} border border-rose-400/25 text-rose-200`}
                        disabled={busy} onClick={() => {
                          if (window.confirm('¿Retirar este ejercicio y sus tareas al guardar?')) {
                            updateEditor((current) => ({ ...current, slots: current.slots.filter((entry) => entry.id !== slot.id) }));
                            setExpandedSlotId(null);
                          }
                        }}>Retirar</button>
                    </div> : null}
                  </div>
                  {canEdit ? <label className="mt-3 block max-w-xs text-xs text-slate-400">Mover ejercicio a fase
                    <select className={`${input} mt-1`} value={slot.phase} disabled={busy}
                      onChange={(event) => updateEditor((current) => {
                        const without = current.slots.filter((entry) => entry.id !== slot.id);
                        const last = without.reduce((found, entry, index) => entry.phase === event.target.value ? index : found, -1);
                        without.splice(last + 1, 0, { ...slot, phase: event.target.value });
                        return { ...current, slots: without };
                      })}>
                      {PLANNED_PHASES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                    </select>
                  </label> : null}
                  <p className="mt-4 text-xs text-slate-400">Tarea A y Tarea B son simultáneas; comparten la duración del ejercicio.</p>
                  {issueText('items', slot.id)}
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {slot.items.map((item, itemIndex) => <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h5 className="text-sm font-bold text-caudal-electric">Tarea {String.fromCharCode(65 + itemIndex)}{itemIndex === 0 ? ' · principal' : ' · opcional'}</h5>
                        {canEdit && itemIndex > 0 ? <div className="flex gap-1">
                          <button type="button" className="rounded-lg border border-white/15 px-2 py-1 text-xs text-slate-200" disabled={busy}
                            onClick={() => moveItem(slot.id, item.id, -1)}>Pasar a A</button>
                          <button type="button" className="rounded-lg border border-rose-400/25 px-2 py-1 text-xs text-rose-200" disabled={busy}
                            onClick={() => updateSlot(slot.id, (current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }))}>Retirar B</button>
                        </div> : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <label className="text-xs text-slate-300">Título
                          <input className={`${input} mt-1`} value={item.title} disabled={!canEdit || busy}
                            aria-invalid={Boolean(fieldIssue('title', slot.id, item.id))}
                            onChange={(event) => updateTask(slot.id, item.id, 'title', event.target.value)} />
                          {issueText('title', slot.id, item.id)}
                        </label>
                        <label className="text-xs text-slate-300">Duración propia (opcional)
                          <input className={`${input} mt-1`} type="number" min="1" step="1" value={item.minutes}
                            disabled={!canEdit || busy} aria-invalid={Boolean(fieldIssue('minutes', slot.id, item.id))}
                            onChange={(event) => updateTask(slot.id, item.id, 'minutes', event.target.value)} />
                          {issueText('minutes', slot.id, item.id)}
                        </label>
                        {[
                          ['description', 'Descripción', 'textarea'], ['comments', 'Comentarios', 'textarea'], ['url', 'Enlace HTTPS', 'url'],
                        ].map(([key, label, type]) => <label key={key} className="text-xs text-slate-300">{label}
                          {type === 'textarea' ? <textarea className={`${input} mt-1 min-h-20 resize-y`} value={item[key]}
                            disabled={!canEdit || busy} aria-invalid={Boolean(fieldIssue(key, slot.id, item.id))}
                            onChange={(event) => updateTask(slot.id, item.id, key, event.target.value)} /> :
                            <input className={`${input} mt-1`} type={type} value={item[key]} disabled={!canEdit || busy}
                              aria-invalid={Boolean(fieldIssue(key, slot.id, item.id))}
                              onChange={(event) => updateTask(slot.id, item.id, key, event.target.value)} />}
                          {issueText(key, slot.id, item.id)}
                        </label>)}
                      </div>
                      {canEdit && slot.items.length > 1 && editor.slots.some((target) => target.id !== slot.id && target.items.length < 2) ?
                        <label className="mt-3 block text-xs text-slate-400">Mover tarea a otro ejercicio
                          <select className={`${input} mt-1`} value={slot.id} disabled={busy}
                            onChange={(event) => moveItemToSlot(slot.id, item.id, event.target.value)}>
                            <option value={slot.id}>Este ejercicio</option>
                            {orderedSlots.filter((target) => target.id !== slot.id && target.items.length < 2).map((target) =>
                              <option key={target.id} value={target.id}>Ejercicio {exerciseNumber(target.id)} · {PLANNED_PHASES.find((entry) => entry.key === target.phase)?.label}</option>)}
                          </select>
                        </label> : null}
                    </div>)}
                  </div>
                  {canEdit && slot.items.length < 2 ? <button type="button" className={`${button} mt-3 border border-caudal-electric/40 text-caudal-electric`}
                    disabled={busy} onClick={() => {
                      const id = createId();
                      if (!id) { setError('Este navegador no puede crear UUID seguros.'); return; }
                      updateSlot(slot.id, (current) => ({ ...current, items: [...current.items, blankTask(id)] }));
                    }}>{slot.items.length ? '+ Añadir Tarea B' : '+ Añadir Tarea A'}</button> : null}
                </div> : null}
              </article>;
            })}
          </div>
        </section>)}
      </section> : null}
    </main>
  );
}
