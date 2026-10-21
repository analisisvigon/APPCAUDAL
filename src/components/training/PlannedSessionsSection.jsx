import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assertPlanned03cReload,
  buildPlannedSavePayload,
  canWritePlannedContext,
  createPlannedLibraryItem,
  createEmptyPlannedEditor,
  getPlannedDuration,
  getPlannedEditorIssues,
  hydratePlannedEditor,
  hasPlannedLibraryItems,
  PLANNED_PHASES,
} from '../../utils/plannedSessions';
import {
  confirmPlannedSession,
  createPlannedDraft,
  listPlannedSessions,
  loadPlannedContexts,
  loadPlannedSession,
  listPlannedLibraryTasks,
  savePlannedSession,
  loadPlannedRosterCandidates,
  loadPlannedSessionPlayers,
  freezePlannedRoster,
  savePlannedAvailability,
  reconcilePlannedDate,
  loadPlannedDistribution,
  loadPlannedSpecificPositions,
  savePlannedDistribution,
  savePlannedSessionValue,
} from '../../data/plannedSessionsStore';
import { availabilityChanges, eligibleRosterCandidates, hasUncertainRosterDate } from '../../utils/plannedSessionPlayers';
import { autoPlayerLayout, distributionPayloadKey, emptyDistribution, normalizeDistribution,
  reconcileSpaceZones, specificPositionMap, validateDistribution } from '../../utils/plannedSessionDistributions';
import { parsePlannedSessionValue, readPlannedSessionValue } from '../../utils/plannedSessionValue';
import PlannedSessionDocument from './PlannedSessionDocument';

const panel = 'rounded-2xl border border-white/10 bg-[#0b1a2d]/85 p-4 sm:p-5';
const input = 'min-h-11 w-full rounded-xl border border-white/15 bg-[#071325] px-3 py-2 text-sm text-white outline-none focus:border-caudal-electric';
const button = 'min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const formatDate = (value) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  : 'Sin fecha';
const createId = () => globalThis.crypto?.randomUUID?.() || null;
const readError = (error) => error?.message || 'No se pudo completar la operación.';

const blankTask = (id) => ({ id, kind: 'free', title: '', description: '', comments: '', url: '', minutes: '' });
const errorKind = (error) => {
  if (error?.code === '42501' || error?.code === 'PGRST301' || error?.status === 401 || error?.status === 403) return 'Permisos';
  if (['23514', '22023', '0A000', '22001'].includes(error?.code)) return 'Validación';
  return 'Conexión o servidor';
};
const unsupportedSession = (data, next) => data.items.some((item) =>
  !['free', 'library_task'].includes(item.kind) ||
  (item.kind === 'library_task' && (!item.task_snapshot ||
    item.task_snapshot.snapshot_version !== 1 ||
    !item.task_snapshot.source || !item.task_snapshot.working ||
    item.task_snapshot.source_task_id !== item.source_task_uuid_snapshot))) ||
  next.slots.some((slot) => slot.items.length > 2);

export default function PlannedSessionsSection({ client, membership, userId, onDirtyChange, leagueLogoUrl = '' }) {
  const [contexts, setContexts] = useState([]);
  const [contextId, setContextId] = useState('');
  const [contextsLoading, setContextsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsLoadError, setSessionsLoadError] = useState(false);
  const [libraryTasks, setLibraryTasks] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
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
  const [roster, setRoster] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedMembershipIds, setSelectedMembershipIds] = useState([]);
  const [initialSelectedMembershipIds, setInitialSelectedMembershipIds] = useState([]);
  const [availability, setAvailability] = useState({});
  const [availabilityBaseline, setAvailabilityBaseline] = useState({});
  const [playersError, setPlayersError] = useState('');
  const [distribution, setDistribution] = useState(null);
  const [distributionBaseline, setDistributionBaseline] = useState(null);
  const [specificPositions, setSpecificPositions] = useState([]);
  const [boardsError, setBoardsError] = useState('');
  const [sessionValue, setSessionValue] = useState('');
  const [baselineSessionValue, setBaselineSessionValue] = useState('');
  const [valueSupported, setValueSupported] = useState(false);
  const selected = contexts.find((row) => row.id === contextId) || null;
  const isManager = membership?.is_active === true && ['owner', 'admin'].includes(membership?.role);
  const canWriteContext = canWritePlannedContext(membership, selected);
  const canEdit = canWriteContext && !unsupportedItems && !playersError &&
    !(editor?.id && editor.planning_state === 'confirmed' && editor.session_number == null);
  const editorDirty = Boolean(editor && (!baseline || JSON.stringify(editor) !== JSON.stringify(baseline)));
  const availabilityDirty = Boolean(roster.length && availabilityChanges(availability, availabilityBaseline, roster).length);
  const selectionDirty = Boolean(editor?.id && !roster.length &&
    JSON.stringify([...selectedMembershipIds].sort()) !== JSON.stringify([...initialSelectedMembershipIds].sort()));
  const distributionDirty = Boolean(distribution && distributionBaseline &&
    distributionPayloadKey(distribution) !== distributionPayloadKey(distributionBaseline));
  const valueDirty = valueSupported && sessionValue !== baselineSessionValue;
  const dirty = editorDirty || availabilityDirty || selectionDirty || distributionDirty || valueDirty;
  const safeLeagueLogoUrl = (() => {
    try {
      const parsed = new URL(String(leagueLogoUrl).trim());
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
    } catch { return ''; }
  })();
  const frozen = roster.length > 0;
  const dateNeedsReconciliation = Boolean(frozen && editor?.session_date !== baseline?.session_date);
  const onlyDateDirty = Boolean(dateNeedsReconciliation && baseline &&
    JSON.stringify({ ...editor, session_date: baseline.session_date }) === JSON.stringify(baseline));
  const proposed = eligibleRosterCandidates(candidates, editor?.session_date);
  const storageKey = membership?.club_id && userId
    ? `appcaudal-planned-cts:${membership.club_id}:${userId}` : '';

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    setEditor(null); setBaseline(null); setSessions([]); setSessionsLoadError(false);
    setRoster([]); setCandidates([]); setSelectedMembershipIds([]); setInitialSelectedMembershipIds([]);
    setAvailability({}); setAvailabilityBaseline({}); setPlayersError('');
    setDistribution(null); setDistributionBaseline(null); setSpecificPositions([]); setBoardsError('');
    setSessionValue(''); setBaselineSessionValue(''); setValueSupported(false);
    setUnsupportedItems(false); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null); setContextId('');
  }, [membership?.club_id, userId]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!expandedSlotId) return;
    document.querySelector(`[data-planned-slot-id="${expandedSlotId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [expandedSlotId]);
  useEffect(() => {
    if (!canWriteContext || !editor || boardsError) return;
    setDistribution((current) => {
      if (!current) return current;
      const zones = reconcileSpaceZones(current.space_zones, editor.slots);
      return JSON.stringify(zones) === JSON.stringify(current.space_zones)
        ? current : { ...current, space_zones: zones };
    });
  }, [canWriteContext, editor?.slots, boardsError]);

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

  useEffect(() => {
    let cancelled = false;
    setLibraryTasks([]); setLibraryError('');
    if (!selected?.club_id || !editor) return undefined;
    setLibraryLoading(true);
    listPlannedLibraryTasks(client, selected.club_id).then((rows) => {
      if (!cancelled) setLibraryTasks(rows.filter((row) => row.club_id === selected.club_id));
    }).catch((cause) => {
      if (!cancelled) setLibraryError(`${errorKind(cause)}: ${readError(cause)}`);
    }).finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [client, selected?.club_id, Boolean(editor), userId]);

  const requestDiscard = () => !dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');
  const changeContext = (nextId) => {
    if (busy || !requestDiscard()) return;
    setEditor(null); setBaseline(null); setUnsupportedItems(false); setValidationIssues([]); setExpandedSlotId(null);
    setRoster([]); setCandidates([]); setSelectedMembershipIds([]); setInitialSelectedMembershipIds([]);
    setAvailability({}); setAvailabilityBaseline({}); setPlayersError('');
    setDistribution(null); setDistributionBaseline(null); setSpecificPositions([]); setBoardsError('');
    setSessionValue(''); setBaselineSessionValue(''); setValueSupported(false);
    setContextId(nextId); setError(''); setNotice(''); setConflict(false); setCreationUncertain(false);
    try { if (storageKey) window.localStorage.setItem(storageKey, nextId); } catch { /* opcional */ }
  };
  const openSession = async (sessionId, discard = false) => {
    if (busy || operationRef.current || (!discard && !requestDiscard())) return;
    operationRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const [data, players] = await Promise.all([
        loadPlannedSession(client, sessionId, contextId), loadPlannedSessionPlayers(client, sessionId),
      ]);
      const next = hydratePlannedEditor(data.session, data.slots, data.items);
      const { supported: supportsValue, value: loadedValue } = readPlannedSessionValue(data.session);
      const nextCandidates = players.roster.length ? [] : await loadPlannedRosterCandidates(client, contextId);
      const nextAvailability = Object.fromEntries(players.availability.map((row) => [row.player_id,
        { status: row.status, observation: row.observation || '' }]));
      let nextDistribution = null;
      let nextPositions = [];
      let nextBoardsError = '';
      try {
        const savedDistribution = normalizeDistribution(await loadPlannedDistribution(client, sessionId));
        nextDistribution = canWriteContext ? { ...savedDistribution,
          space_zones: reconcileSpaceZones(savedDistribution.space_zones, next.slots) }
          : savedDistribution;
        nextPositions = savedDistribution.specific_positions_snapshot.length
          ? savedDistribution.specific_positions_snapshot
          : await loadPlannedSpecificPositions(client, players.roster.map((row) => row.player_id));
        setDistributionBaseline(savedDistribution);
      } catch (cause) {
        nextBoardsError = `${errorKind(cause)}: no se pudieron cargar las pizarras o posiciones. ${readError(cause)}`;
        setDistributionBaseline(null);
      }
      setUnsupportedItems(unsupportedSession(data, next));
      setEditor(next); setBaseline(next); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null);
      setRoster(players.roster); setCandidates(nextCandidates);
      const initialIds = eligibleRosterCandidates(nextCandidates, next.session_date).map((row) => row.id);
      setSelectedMembershipIds(initialIds); setInitialSelectedMembershipIds(initialIds);
      setAvailability(nextAvailability); setAvailabilityBaseline(nextAvailability); setPlayersError('');
      setDistribution(nextDistribution); setSpecificPositions(nextPositions); setBoardsError(nextBoardsError);
      setValueSupported(supportsValue); setSessionValue(loadedValue); setBaselineSessionValue(loadedValue);
    } catch (cause) {
      setPlayersError(`${errorKind(cause)}: ${readError(cause)}`);
      setError(`${errorKind(cause)}: no se pudo abrir la sesión. ${readError(cause)}`);
    } finally { operationRef.current = false; setBusy(false); }
  };
  const startNew = () => {
    if (!canWriteContext || busy || !requestDiscard()) return;
    setEditor(createEmptyPlannedEditor()); setBaseline(null);
    setRoster([]); setCandidates([]); setSelectedMembershipIds([]); setInitialSelectedMembershipIds([]);
    setAvailability({}); setAvailabilityBaseline({}); setPlayersError('');
    setDistribution(emptyDistribution()); setDistributionBaseline(emptyDistribution());
    setSessionValue(''); setBaselineSessionValue(''); setValueSupported(false);
    setSpecificPositions([]); setBoardsError('');
    setUnsupportedItems(false); setError(''); setNotice(''); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null);
    requestAnimationFrame(() => document.querySelector('[data-planned-session-document]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const updateEditor = (update) => {
    setValidationIssues([]);
    setEditor((current) => current ? update(current) : current);
  };
  const fieldIssue = (field, slotId = null, itemId = null) => validationIssues.find((issue) =>
    issue.field === field && issue.slotId === slotId && issue.itemId === itemId)?.message;
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
    if (dateNeedsReconciliation) {
      setError('La fecha de una sesión con plantilla congelada requiere conciliación expresa antes de guardar otros cambios.');
      return;
    }
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
    const wasNew = !working.id;
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
      const use03c = hasPlannedLibraryItems(working) || hasPlannedLibraryItems(original);
      const revision = await savePlannedSession(client, buildPlannedSavePayload(working, original), use03c);
      const saved = { ...working, revision };
      if (!use03c) { setEditor(saved); setBaseline(saved); }
      try {
        const data = await loadPlannedSession(client, working.id, selected.id);
        const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
        setValueSupported(readPlannedSessionValue(data.session).supported);
        if (wasNew) {
          const initialValue = readPlannedSessionValue(data.session).value;
          setSessionValue(initialValue); setBaselineSessionValue(initialValue);
        }
        if (use03c) assertPlanned03cReload(working, fresh, revision);
        setEditor(fresh); setBaseline(fresh);
        setUnsupportedItems(unsupportedSession(data, fresh));
        setDistribution((current) => current ? { ...current,
          space_zones: reconcileSpaceZones(current.space_zones, fresh.slots) } : current);
        if (wasNew) {
          const nextCandidates = await loadPlannedRosterCandidates(client, selected.id);
          setCandidates(nextCandidates);
          const initialIds = eligibleRosterCandidates(nextCandidates, fresh.session_date).map((row) => row.id);
          setSelectedMembershipIds(initialIds); setInitialSelectedMembershipIds(initialIds);
        }
        setNotice(distributionDirty
          ? 'Ejercicios guardados y recargados. Las pizarras siguen pendientes: pulsa «Guardar pizarras».'
          : 'Sesión guardada y recargada desde el servidor.');
      } catch (reloadError) {
        if (use03c) setCreationUncertain(true);
        setNotice(`Guardado confirmado, pero no se pudo verificar la lectura posterior: ${readError(reloadError)}. Recarga la ficha antes de continuar.`);
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
        if (hasPlannedLibraryItems(working) && !['42501', '23514', '22023', '0A000', '22001'].includes(cause?.code))
          setCreationUncertain(true);
        setError(`${errorKind(cause)}: no se pudo guardar. Los cambios siguen en el formulario. ${readError(cause)}`);
      }
    } finally { operationRef.current = false; setBusy(false); }
  };

  const confirm = async () => {
    if (!editor?.id || !selected || !canEdit || busy || operationRef.current || dirty || conflict || creationUncertain) return;
    const issues = getPlannedEditorIssues(editor, selected);
    if (issues.length) {
      setValidationIssues(issues); setExpandedSlotId(issues.find((issue) => issue.slotId)?.slotId || null);
      setError(`Validación: ${issues[0].message}`); return;
    }
    if (!window.confirm('¿Confirmar esta sesión? Se asignará su número definitivo.')) return;
    operationRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const revision = await confirmPlannedSession(client, editor.id, editor.revision,
        hasPlannedLibraryItems(editor));
      setEditor((current) => ({ ...current, revision, planning_state: 'confirmed' }));
      setBaseline((current) => ({ ...current, revision, planning_state: 'confirmed' }));
      try {
        const data = await loadPlannedSession(client, editor.id, selected.id);
        const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
        if (fresh.revision !== revision || fresh.planning_state !== 'confirmed' || fresh.session_number == null)
          throw new Error('La confirmación aún no se refleja en la lectura; recarga la ficha antes de continuar.');
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

  const reloadPlayersAfter04b = async (expectedRevision, pendingDate = null) => {
    const [data, players] = await Promise.all([
      loadPlannedSession(client, editor.id, selected.id), loadPlannedSessionPlayers(client, editor.id),
    ]);
    if (data.session.revision !== expectedRevision) throw new Error('La revisión devuelta no coincide con la sesión recargada. Recarga la ficha.');
    const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
    const nextAvailability = Object.fromEntries(players.availability.map((row) => [row.player_id,
      { status: row.status, observation: row.observation || '' }]));
    setEditor(pendingDate ? { ...fresh, session_date: pendingDate } : fresh);
    setBaseline(fresh); setRoster(players.roster);
    setAvailability(nextAvailability); setAvailabilityBaseline(nextAvailability);
    if (!distribution?.specific_positions_snapshot?.length) {
      try {
        setSpecificPositions(await loadPlannedSpecificPositions(client,
          players.roster.map((row) => row.player_id)));
      } catch (cause) {
        setBoardsError(`${errorKind(cause)}: no se pudieron cargar las posiciones específicas. ${readError(cause)}`);
      }
    }
    setCandidates([]); setSelectedMembershipIds([]); setInitialSelectedMembershipIds([]); setPlayersError('');
    return players;
  };

  const handle04bError = (cause, action) => {
    if (cause?.code === '40001') {
      setConflict(true);
      setError(`La revisión cambió mientras intentabas ${action}. No se sobrescribieron tus cambios; recarga la sesión para continuar.`);
    } else {
      if (!['42501', '23514', '23505', '22023'].includes(cause?.code)) setCreationUncertain(true);
      setError(`${errorKind(cause)}: no se pudo ${action}. ${readError(cause)}`);
    }
  };

  const freezeRoster = async () => {
    if (!editor?.id || !canEdit || busy || operationRef.current || conflict || creationUncertain || playersError ||
        frozen || editorDirty || availabilityDirty) return;
    const chosen = proposed.filter((row) => selectedMembershipIds.includes(row.id));
    if (!chosen.length || chosen.length > 100 || new Set(chosen.map((row) => row.player_id)).size !== chosen.length) {
      setError('Selecciona entre 1 y 100 jugadores sin identidades duplicadas antes de confirmar.'); return;
    }
    if (!window.confirm(`¿Congelar ${chosen.length} jugadores en esta sesión? La selección se guardará como instantánea histórica y no se podrá retirar desde esta interfaz.`)) return;
    const confirmedExisting = editor.planning_state === 'confirmed';
    if (confirmedExisting && !window.confirm('Esta sesión ya está confirmada. ¿Confirmas expresamente incorporar su plantilla sin alterar número ni ejercicios?')) return;
    const uncertain = chosen.some(hasUncertainRosterDate);
    if (uncertain && !window.confirm('Hay jugadores con fecha de incorporación o salida desconocida. Su pertenencia de temporada no prueba presencia en este entrenamiento. ¿Confirmas expresamente su inclusión?')) return;
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const revision = await freezePlannedRoster(client, editor.id, editor.revision,
        chosen.map((row) => row.id), uncertain, confirmedExisting);
      const players = await reloadPlayersAfter04b(revision);
      if (players.roster.length !== chosen.length) throw new Error('La plantilla recargada no coincide con la selección.');
      setNotice(`Plantilla de ${chosen.length} jugadores confirmada por el servidor.`);
    } catch (cause) { handle04bError(cause, 'congelar la plantilla'); }
    finally { operationRef.current = false; setBusy(false); }
  };

  const saveAvailability = async () => {
    if (!editor?.id || !canEdit || !frozen || busy || operationRef.current || conflict || creationUncertain ||
        (editorDirty && !onlyDateDirty)) return;
    const changes = availabilityChanges(availability, availabilityBaseline, roster);
    if (!changes.length) return;
    if (changes.some((row) => row.observation && row.observation.length > 1000)) {
      setError('Las observaciones no pueden superar 1000 caracteres.'); return;
    }
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const revision = await savePlannedAvailability(client, editor.id, editor.revision, changes);
      await reloadPlayersAfter04b(revision, dateNeedsReconciliation ? editor.session_date : null);
      setNotice('Disponibilidad guardada y recargada desde el servidor.');
    } catch (cause) { handle04bError(cause, 'guardar la disponibilidad'); }
    finally { operationRef.current = false; setBusy(false); }
  };

  const reconcileDate = async () => {
    if (!editor?.id || !canEdit || !dateNeedsReconciliation || busy || operationRef.current || conflict ||
        creationUncertain || availabilityDirty) return;
    if (!onlyDateDirty) {
      setError('Guarda o descarta los demás cambios antes de conciliar la fecha.'); return;
    }
    const issues = getPlannedEditorIssues(editor, selected).filter((issue) => issue.field === 'session_date');
    if (issues.length) { setError(`Validación: ${issues[0].message}`); return; }
    const names = roster.map((row) => row.player_name_snapshot).join(', ');
    const cancelDate = () => setEditor((current) => ({ ...current, session_date: baseline.session_date }));
    if (!window.confirm(`¿Cambiar la fecha a ${editor.session_date} manteniendo exactamente estos ${roster.length} jugadores congelados?\n${names}`)) {
      cancelDate(); return;
    }
    if (!window.confirm('Si alguna fecha de incorporación o salida es incierta, ¿confirmas expresamente que has revisado la pertenencia de todos estos jugadores para la nueva fecha?')) {
      cancelDate(); return;
    }
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const revision = await reconcilePlannedDate(client, editor.id, editor.revision, editor.session_date,
        roster.map((row) => row.source_membership_id), true);
      await reloadPlayersAfter04b(revision);
      setNotice('Fecha conciliada y recargada desde el servidor.');
      await refreshList(selected.id);
    } catch (cause) { handle04bError(cause, 'conciliar la fecha'); }
    finally { operationRef.current = false; setBusy(false); }
  };

  const addExercise = (phase) => {
    const slotId = createId();
    const taskId = createId();
    if (!slotId || !taskId) { setError('Este navegador no puede crear UUID seguros.'); return; }
    updateEditor((current) => ({ ...current, slots: [...current.slots,
      { id: slotId, phase, duration: '', items: [blankTask(taskId)] }] }));
    setDistribution((current) => current ? { ...current,
      space_zones: reconcileSpaceZones(current.space_zones, [...editor.slots,
        { id: slotId, phase }]) } : current);
    setExpandedSlotId(slotId);
  };
  const updateTask = (slotId, itemId, key, value) => updateSlot(slotId, (slot) => ({
    ...slot, items: slot.items.map((item) => item.id !== itemId ? item :
      item.kind === 'library_task' && key !== 'minutes'
        ? { ...item, working: { ...item.working, [key]: value } }
        : { ...item, [key]: value }),
  }));
  const selectLibraryTask = (slotId, itemId, taskId) => {
    const task = libraryTasks.find((entry) => entry.id === taskId && entry.club_id === selected?.club_id);
    if (!task) { setError('La tarea no está disponible en la Biblioteca autorizada de este club.'); return; }
    const previous = editor?.slots.flatMap((slot) => slot.items).find((item) => item.id === itemId);
    if (!previous) return;
    if ((previous.kind === 'library_task' && previous.snapshot) ||
        baseline?.slots.some((slot) => slot.items.some((item) => item.id === itemId))) {
      if (!window.confirm('Se sustituirá esta tarea al guardar. La copia anterior dejará de pertenecer a la sesión. ¿Continuar?')) return;
    }
    const id = baseline?.slots.some((slot) => slot.items.some((item) => item.id === itemId)) ? createId() : itemId;
    if (!id) { setError('Este navegador no puede crear UUID seguros.'); return; }
    updateSlot(slotId, (slot) => ({ ...slot, items: slot.items.map((item) => item.id === itemId
      ? createPlannedLibraryItem(id, task) : item) }));
  };
  const switchToFreeTask = (slotId, itemId) => {
    const previous = editor?.slots.flatMap((slot) => slot.items).find((item) => item.id === itemId);
    if (!previous || previous.kind === 'free') return;
    if (!window.confirm('Se sustituirá la copia de Biblioteca por una actividad libre al guardar. ¿Continuar?')) return;
    const id = previous.snapshot ? createId() : itemId;
    if (!id) { setError('Este navegador no puede crear UUID seguros.'); return; }
    updateSlot(slotId, (slot) => ({ ...slot, items: slot.items.map((item) => item.id === itemId
      ? blankTask(id) : item) }));
  };
  const addTask = (slotId) => {
    const id = createId();
    if (!id) { setError('Este navegador no puede crear UUID seguros.'); return; }
    updateSlot(slotId, (slot) => slot.items.length >= 2 ? slot :
      { ...slot, items: [...slot.items, blankTask(id)] });
  };
  const removeTask = (slotId, itemId) => {
    if (!window.confirm('¿Retirar la segunda tarea al guardar? Sus datos dejarán de formar parte de este ejercicio.')) return;
    updateSlot(slotId, (slot) => ({ ...slot, items: slot.items.filter((item) => item.id !== itemId) }));
  };
  const removeSlot = (slotId, number) => {
    const slot = editor?.slots.find((entry) => entry.id === slotId);
    if (!slot || !window.confirm(`¿Retirar el ejercicio ${number} y sus ${slot.items.length} tareas al guardar?`)) return;
    updateEditor((current) => ({ ...current, slots: current.slots.filter((entry) => entry.id !== slotId) }));
    setDistribution((current) => current ? { ...current,
      space_zones: current.space_zones.filter((zone) => zone.slot_id !== slotId) } : current);
  };
  const changePhase = (slotId, nextPhase) => updateEditor((current) => {
    const slot = current.slots.find((entry) => entry.id === slotId);
    if (!slot || !PLANNED_PHASES.some((phase) => phase.key === nextPhase)) return current;
    const without = current.slots.filter((entry) => entry.id !== slotId);
    const last = without.reduce((found, entry, index) => entry.phase === nextPhase ? index : found, -1);
    without.splice(last + 1, 0, { ...slot, phase: nextPhase });
    return { ...current, slots: without };
  });

  const changeFormation = (formationKey) => {
    if (!roster.length || !distribution || boardsError) return;
    if (distribution.player_layout.some((item) => item.placement === 'manual') &&
        !window.confirm('Cambiar el sistema descartará los ajustes manuales de jugadores. ¿Continuar?')) return;
    const positionById = specificPositionMap(
      distribution.specific_positions_snapshot.length
        ? distribution.specific_positions_snapshot : specificPositions);
    setDistribution((current) => ({ ...current, formation_key: formationKey,
      player_layout: formationKey ? autoPlayerLayout(roster, positionById, formationKey) : [] }));
  };
  const changeZone = (slotId, change) => setDistribution((current) => current ? ({ ...current,
    space_zones: current.space_zones.map((zone) => zone.slot_id === slotId
      ? { ...zone, ...change } : zone) }) : current);
  const movePlayer = (playerId, x, y) => setDistribution((current) => current ? ({ ...current,
    player_layout: current.player_layout.map((item) => item.player_id === playerId
      ? { ...item, placement: 'manual', x, y } : item),
  }) : current);

  const saveValue = async () => {
    if (!editor?.id || !valueSupported || !valueDirty || !canEdit || busy || operationRef.current ||
        editorDirty || distributionDirty || availabilityDirty || dateNeedsReconciliation || conflict || creationUncertain) return;
    let parsedValue;
    try { parsedValue = parsePlannedSessionValue(sessionValue); }
    catch (cause) { setError(`Validación: ${readError(cause)}`); return; }
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const expectedValue = parsedValue == null ? '' : String(parsedValue);
      const revision = await savePlannedSessionValue(client, editor.id, editor.revision, sessionValue);
      const data = await loadPlannedSession(client, editor.id, selected.id);
      const received = readPlannedSessionValue(data.session).value;
      if (data.session.revision !== revision ||
          (received === '' || expectedValue === ''
            ? received !== expectedValue : Number(received) !== Number(expectedValue)))
        throw new Error('VALOR no coincide con la lectura posterior. Recarga la sesión antes de continuar.');
      const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
      setEditor(fresh); setBaseline(fresh); setSessionValue(received); setBaselineSessionValue(received);
      setNotice('VALOR guardado y verificado desde el servidor.');
    } catch (cause) {
      if (cause?.code === '40001') {
        setConflict(true);
        setError('Revisión obsoleta: VALOR sigue en pantalla. Recarga la sesión antes de volver a guardar.');
      } else {
        if (!['42501', '23514', '22023'].includes(cause?.code)) setCreationUncertain(true);
        setError(`${errorKind(cause)}: no se pudo verificar el guardado de VALOR. ${readError(cause)}`);
      }
    } finally { operationRef.current = false; setBusy(false); }
  };

  const saveDistributions = async () => {
    if (!editor?.id || !canEdit || !distribution || boardsError || !distributionDirty ||
        editorDirty || dateNeedsReconciliation || busy || operationRef.current || conflict || creationUncertain) return;
    const issue = validateDistribution(distribution, roster, editor.slots);
    if (issue) { setError(`Validación de pizarras: ${issue}`); return; }
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const revision = await savePlannedDistribution(client, editor.id, editor.revision, distribution);
      const [data, savedRow] = await Promise.all([
        loadPlannedSession(client, editor.id, selected.id),
        loadPlannedDistribution(client, editor.id),
      ]);
      const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
      const saved = normalizeDistribution(savedRow);
      if (fresh.revision !== revision ||
          distributionPayloadKey(saved) !== distributionPayloadKey(distribution))
        throw new Error('La distribución recargada no coincide con el guardado. Recarga la ficha.');
      setEditor(fresh); setBaseline(fresh); setDistribution(saved); setDistributionBaseline(saved);
      if (saved.specific_positions_snapshot.length) setSpecificPositions(saved.specific_positions_snapshot);
      setNotice('Pizarras guardadas y verificadas desde el servidor.');
    } catch (cause) {
      if (cause?.code === '40001') {
        setConflict(true);
        setError('Revisión obsoleta: tus pizarras siguen en pantalla. Recarga la sesión antes de volver a guardar.');
      } else {
        if (!['42501', '23514', '22023'].includes(cause?.code)) setCreationUncertain(true);
        setError(`${errorKind(cause)}: no se pudo verificar el guardado de pizarras. ${readError(cause)}`);
      }
    } finally { operationRef.current = false; setBusy(false); }
  };

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

      {editor && selected ? <section className="space-y-3" aria-label="Ficha de sesión">
        <div className={`${panel} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-caudal-electric">Editor de plantilla</p>
            <h3 className="text-lg font-bold text-white">{editor.id
              ? editor.planning_state === 'confirmed' ? `Sesión nº ${editor.session_number ?? '—'}` : 'Borrador de sesión'
              : 'Nueva sesión'}</h3>
            <p className="text-xs text-slate-400">{selected.team_name} · {selected.label} ·
              {editor.id ? ` Revisión ${editor.revision}` : ' Se creará al guardar'} ·
              {getPlannedDuration(editor.slots)} min</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? <button type="button" className={`${button} bg-caudal-electric text-slate-950`}
              onClick={save} disabled={busy || !editorDirty || conflict || creationUncertain || dateNeedsReconciliation}>
              {busy ? 'Procesando…' : 'Guardar cambios'}</button> : null}
            {canEdit && editor.id && !boardsError ? <button type="button"
              className={`${button} border border-caudal-electric/50 text-caudal-electric`}
              onClick={saveDistributions}
              disabled={busy || !distributionDirty || editorDirty || dateNeedsReconciliation || conflict || creationUncertain}>
              Guardar pizarras</button> : null}
            {canEdit && editor.id && valueSupported ? <button type="button"
              className={`${button} border border-caudal-electric/50 text-caudal-electric`}
              onClick={saveValue}
              disabled={busy || !valueDirty || editorDirty || distributionDirty || availabilityDirty ||
                dateNeedsReconciliation || conflict || creationUncertain}>
              Guardar VALOR</button> : null}
            {canEdit && editor.id && editor.planning_state === 'draft' ?
              <button type="button" className={`${button} border border-caudal-electric/50 text-caudal-electric`}
                onClick={confirm} disabled={busy || dirty || conflict || creationUncertain}>Confirmar y numerar</button> : null}
            {editor.id ? <button type="button" className={`${button} border border-white/15 text-slate-200`}
              onClick={() => { if (requestDiscard()) openSession(editor.id, true); }} disabled={busy}>Recargar</button> : null}
            <button type="button" className={`${button} border border-white/15 text-slate-200`}
              onClick={() => { if (requestDiscard()) { setEditor(null); setBaseline(null); setDistribution(null); setDistributionBaseline(null); setSpecificPositions([]); setBoardsError(''); setSessionValue(''); setBaselineSessionValue(''); setValueSupported(false); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null); } }}
              disabled={busy}>Cerrar plantilla</button>
          </div>
          {dirty ? <p className="w-full text-xs text-amber-200">Cambios sin guardar. Guarda antes de confirmar.</p> : null}
          {distributionDirty && editorDirty ? <p className="w-full text-xs text-amber-200">Guarda primero los ejercicios y después las pizarras; cada operación actualiza la revisión de la sesión.</p> : null}
          {valueDirty && (editorDirty || distributionDirty || availabilityDirty) ?
            <p className="w-full text-xs text-amber-200">Guarda primero los otros cambios; después podrás guardar VALOR con la revisión actualizada.</p> : null}
          {dateNeedsReconciliation && canEdit ? <button type="button" className={`${button} border border-amber-400/50 text-amber-200`}
            onClick={reconcileDate} disabled={busy || conflict || creationUncertain}>Confirmar cambio de fecha y conciliar plantilla</button> : null}
          {creationUncertain ? <p className="w-full text-xs text-amber-200">Guardado bloqueado: comprueba la sesión en la lista y recárgala antes de continuar.</p> : null}
          {unsupportedItems ? <p className="w-full text-xs text-amber-200">Esta sesión contiene un tipo de tarea o snapshot incompatible, o más de dos tareas en un ejercicio. Se muestra sin edición para preservar sus datos.</p> : null}
        </div>
        {playersError ? <p role="alert" className="rounded-xl border border-red-400/30 p-3 text-sm text-red-100">{playersError} Recarga la sesión; no se habilitarán operaciones de jugadores con datos incompletos.</p> : null}
        {boardsError ? <p role="alert" className="rounded-xl border border-red-400/30 p-3 text-sm text-red-100">{boardsError} La edición de pizarras está deshabilitada; la sesión y sus ejercicios siguen disponibles.</p> : null}
        {editor.id && !frozen && !playersError ? <div className={`${panel} space-y-2 text-sm`}>
          <p className="font-bold">Plantilla propuesta · aún no guardada</p>
          <p>Seleccionados {proposed.filter((row) => selectedMembershipIds.includes(row.id)).length} de {proposed.length} candidatos válidos para esta fecha. La apertura de la sesión no incorpora jugadores.</p>
          {canEdit ? <button type="button" className={`${button} border border-caudal-electric/50 text-caudal-electric`}
            onClick={freezeRoster} disabled={busy || editorDirty || conflict || creationUncertain || !proposed.length}>
            Confirmar y congelar plantilla</button> : null}
          {editorDirty ? <p>Guarda primero los cambios de sesión; la plantilla utilizará la fecha ya guardada.</p> : null}
        </div> : null}
        {editor.id && frozen ? <div className={`${panel} space-y-2 text-sm`}>
          <p className="font-bold">Plantilla histórica congelada · {roster.length} jugadores</p>
          {availabilityDirty && canEdit ? <button type="button" className={`${button} border border-caudal-electric/50 text-caudal-electric`}
            onClick={saveAvailability} disabled={busy || (editorDirty && !onlyDateDirty) || conflict || creationUncertain}>
            Guardar disponibilidad</button> : null}
          {availabilityDirty ? <p>La disponibilidad visible aún no está guardada.</p> : null}
        </div> : null}
        <PlannedSessionDocument editor={editor} selected={selected} canEdit={canEdit} busy={busy}
          distribution={distribution || emptyDistribution()} boardsError={boardsError}
          positionById={specificPositionMap(distribution?.specific_positions_snapshot?.length
            ? distribution.specific_positions_snapshot : specificPositions)}
          onFormationChange={changeFormation} onZoneChange={changeZone}
          onPlayerMove={movePlayer} leagueLogoUrl={safeLeagueLogoUrl}
          sessionValue={sessionValue} printedSessionValue={baselineSessionValue}
          valueSupported={valueSupported} onValueChange={setSessionValue}
          roster={frozen ? roster : proposed} frozen={frozen} selectedMembershipIds={selectedMembershipIds}
          availability={availability} onSelectPlayer={(id, checked) => setSelectedMembershipIds((current) =>
            checked ? [...new Set([...current, id])] : current.filter((entry) => entry !== id))}
          onAvailability={(id, key, value) => setAvailability((current) => ({ ...current,
            [id]: { status: current[id]?.status || 'available', observation: current[id]?.observation || '', [key]: value } }))}
          fieldIssue={fieldIssue} updateEditor={updateEditor} updateSlot={updateSlot} updateTask={updateTask}
          moveSlot={moveSlot} moveItem={moveItem} moveItemToSlot={moveItemToSlot}
          addExercise={addExercise} addTask={addTask} removeTask={removeTask} removeSlot={removeSlot}
          changePhase={changePhase} libraryTasks={libraryTasks} libraryLoading={libraryLoading}
          libraryError={libraryError} selectLibraryTask={selectLibraryTask}
          switchToFreeTask={switchToFreeTask} />
      </section> : null}
    </main>
  );
}
