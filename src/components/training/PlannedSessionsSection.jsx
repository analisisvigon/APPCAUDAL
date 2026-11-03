import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assertPlanned03cReload,
  buildPlannedSavePayload,
  canWritePlannedContext,
  createPlannedLibraryItem,
  createEmptyPlannedEditor,
  getPlannedDuration,
  getPlannedEditorIssues,
  getPlannedLibraryValue,
  plannedSeriesDuration,
  plannedExerciseTaskDuration,
  hydratePlannedEditor,
  hasPlannedLibraryItems,
  isPlannedMicrocycle,
  composeSessionMaterial,
  readSessionMaterialState,
  sessionMaterialStateFromInput,
  sessionMaterialKey,
  PLANNED_PHASES,
} from '../../utils/plannedSessions';
import {
  confirmPlannedSession,
  createPlannedDraft,
  checkPlannedMicrocycleV4,
  checkPlannedMaterialAutofill,
  checkPlannedTaskSeries,
  listPlannedSessions,
  listPlannedSessionsForExport,
  listPlannedLocations,
  listPlannedOpponents,
  loadPlannedContexts,
  loadPlannedSession,
  listPlannedLibraryTasks,
  savePlannedSession,
  savePlannedSessionMcV4,
  savePlannedSessionMaterial,
  loadPlannedRosterCandidates,
  loadPlannedSessionPlayers,
  freezePlannedRoster,
  savePlannedAvailability,
  reconcilePlannedDate,
  loadPlannedDistribution,
  loadPlannedSpecificPositions,
  savePlannedDistribution,
  checkPlannedExerciseDimensionsV12,
  loadPlannedExerciseDimensionsV12,
  savePlannedDistributionV12,
  loadPlannedBoardDefaultsV11,
  loadPlannedBoardSeedV11,
  savePlannedFieldDimensionsV11,
  fixPlannedBoardDefaultV11,
  savePlannedSessionValue,
  SESSION_RETIREMENT_BACKEND_VERIFIED,
  changePlannedSessionLifecycle,
} from '../../data/plannedSessionsStore';
import { availabilityChanges, eligibleRosterCandidates, hasUncertainRosterDate } from '../../utils/plannedSessionPlayers';
import { calendarWeekDays } from '../../utils/teamCalendar';
import { autoPlayerLayout, distributionForSave, distributionPayloadKey, emptyDistribution, movePlayerBoardLayout, normalizeDistribution,
  reconcileSpaceZones, specificPositionMap, validateDistribution } from '../../utils/plannedSessionDistributions';
import { parsePlannedSessionValue, readPlannedSessionValue } from '../../utils/plannedSessionValue';
import { BOARD_V11_ENABLED, applySessionBoardSeed, initialBoardFromDefaults,
  boardDefaultBlockReason, fieldIsMeasured, sameFieldDimensions,
  seededPlayerLayout, taskZoneMetres,
  validMetres, zoneFromMetres, metresFromZone, normalizeExerciseDimensions,
  exerciseDimensionsKey, exerciseDimensionsPayload } from '../../utils/plannedSessionFieldScale';
import PlannedSessionDocument from './PlannedSessionDocument';
import PlannedSessionBatchPrint from './PlannedSessionBatchPrint';
import { loadPlannedSessionPrintData, plannedSessionExportFileName } from '../../utils/plannedSessionBatchExport';

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

export default function PlannedSessionsSection({ client, membership, userId, onDirtyChange, leagueLogoUrl = '', openSessionRequest = null }) {
  const [contexts, setContexts] = useState([]);
  const [contextId, setContextId] = useState('');
  const [contextsLoading, setContextsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsLoadError, setSessionsLoadError] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [exportError, setExportError] = useState('');
  const [batchPrint, setBatchPrint] = useState(null);
  const batchPrintRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lifecycleAction, setLifecycleAction] = useState('retire');
  const [retirementReason, setRetirementReason] = useState('');
  const [libraryTasks, setLibraryTasks] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [seriesSupported, setSeriesSupported] = useState(false);
  const [locationOptions, setLocationOptions] = useState([]);
  const [opponentOptions, setOpponentOptions] = useState([]);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [editor, setEditor] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [unsupportedItems, setUnsupportedItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const operationRef = useRef(false);
  const openedCalendarRequestRef = useRef('');
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
  const [boardDefaults, setBoardDefaults] = useState(null);
  const [boardDefaultsLoading, setBoardDefaultsLoading] = useState(false);
  const [boardDefaultsContextId, setBoardDefaultsContextId] = useState('');
  const [sessionSeedFormation, setSessionSeedFormation] = useState(null);
  const [fieldDimensions, setFieldDimensions] = useState({ length_m: '', width_m: '' });
  const [fieldBaseline, setFieldBaseline] = useState({ length_m: '', width_m: '' });
  const [v12Supported, setV12Supported] = useState(false);
  const [v12ProbeError, setV12ProbeError] = useState('');
  const [v12ProbeReady, setV12ProbeReady] = useState(false);
  const [exerciseDimensions, setExerciseDimensions] = useState({});
  const [exerciseDimensionsBaseline, setExerciseDimensionsBaseline] = useState({});
  const [exerciseDimensionsLoadedFor, setExerciseDimensionsLoadedFor] = useState('');
  const [sessionValue, setSessionValue] = useState('');
  const [mcV4Supported, setMcV4Supported] = useState(false);
  const [mcNumber, setMcNumber] = useState('');
  const [mcBaseline, setMcBaseline] = useState('');
  const [materialSupported, setMaterialSupported] = useState(false);
  const [materialState, setMaterialState] = useState(null);
  const [materialBaseline, setMaterialBaseline] = useState(null);
  const materialStateRef = useRef(null);
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
  const savedBoardPayload = distribution ? distributionForSave(distribution, roster) : null;
  const savableDistributionDirty = Boolean(savedBoardPayload && distributionBaseline &&
    distributionPayloadKey(savedBoardPayload) !== distributionPayloadKey(distributionBaseline));
  const pendingEmptyFormation = Boolean(!roster.length && distribution &&
    distribution.formation_key !== sessionSeedFormation);
  const distributionDirty = Boolean(roster.length
    ? distribution && distributionBaseline &&
      distributionPayloadKey(distribution) !== distributionPayloadKey(distributionBaseline)
    : savableDistributionDirty || pendingEmptyFormation);
  const fieldDirty = BOARD_V11_ENABLED && !sameFieldDimensions(fieldDimensions, fieldBaseline);
  const exerciseDimensionsDirty = Boolean(editor && v12Supported &&
    exerciseDimensionsKey(exerciseDimensions) !== exerciseDimensionsKey(exerciseDimensionsBaseline));
  const valueDirty = valueSupported && sessionValue !== baselineSessionValue;
  const mcDirty = mcV4Supported && mcNumber !== mcBaseline;
  const materialDirty = materialSupported && JSON.stringify(materialState) !== JSON.stringify(materialBaseline);
  const dirty = editorDirty || availabilityDirty || selectionDirty || distributionDirty ||
    fieldDirty || exerciseDimensionsDirty || valueDirty || mcDirty || materialDirty;
  const boardDefaultSource = {
    sessionId: editor?.id, canEdit, busy: busy || operationRef.current,
    conflict, creationUncertain, boardsError, rosterCount: roster.length,
    formationKey: distribution?.formation_key, playerCount: distribution?.player_layout?.length ?? 0,
    fieldDimensions,
  };
  const playerDefaultBlockReason = boardDefaultBlockReason('players', boardDefaultSource);
  const fieldDefaultBlockReason = boardDefaultBlockReason('field', boardDefaultSource);
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
  const assignedMcNumbers = [...new Set(sessions.map((row) => row.mc_number)
    .filter((number) => Number.isInteger(number) && number > 0))].sort((a, b) => a - b);
  const nextMcNumber = (assignedMcNumbers.at(-1) || 0) + 1;
  const mcOptions = nextMcNumber <= 9999 ? [...assignedMcNumbers, nextMcNumber] : assignedMcNumbers;
  const storageKey = membership?.club_id && userId
    ? `appcaudal-planned-cts:${membership.club_id}:${userId}` : '';

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    setEditor(null); setBaseline(null); setSessions([]); setSessionsLoadError(false);
    setDeleteTarget(null);
    setRoster([]); setCandidates([]); setSelectedMembershipIds([]); setInitialSelectedMembershipIds([]);
    setAvailability({}); setAvailabilityBaseline({}); setPlayersError('');
    setDistribution(null); setDistributionBaseline(null); setSpecificPositions([]); setBoardsError('');
    setBoardDefaults(null); setSessionSeedFormation(null); setFieldDimensions({ length_m: '', width_m: '' });
    setFieldBaseline({ length_m: '', width_m: '' });
    setExerciseDimensions({}); setExerciseDimensionsBaseline({}); setExerciseDimensionsLoadedFor('');
    setSessionValue(''); setBaselineSessionValue(''); setValueSupported(false);
    setMcNumber(''); setMcBaseline('');
    materialStateRef.current = null; setMaterialState(null); setMaterialBaseline(null);
    setUnsupportedItems(false); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null); setContextId('');
  }, [membership?.club_id, userId]);
  useEffect(() => {
    let cancelled = false;
    checkPlannedMicrocycleV4(client).then((ready) => {
      if (!cancelled) setMcV4Supported(ready);
    }).catch(() => { if (!cancelled) setMcV4Supported(false); });
    return () => { cancelled = true; };
  }, [client]);
  useEffect(() => {
    let cancelled = false;
    checkPlannedMaterialAutofill(client).then((ready) => {
      if (!cancelled) setMaterialSupported(ready);
    }).catch(() => { if (!cancelled) setMaterialSupported(false); });
    return () => { cancelled = true; };
  }, [client]);
  useEffect(() => {
    let active = true;
    checkPlannedTaskSeries(client).then((ready) => { if (active) setSeriesSupported(ready); })
      .catch(() => { if (active) setSeriesSupported(false); });
    return () => { active = false; };
  }, [client]);
  useEffect(() => {
    let cancelled = false;
    setV12ProbeReady(false);
    checkPlannedExerciseDimensionsV12(client).then((supported) => {
      if (!cancelled) { setV12Supported(supported); setV12ProbeError(''); setV12ProbeReady(true); }
    }).catch((cause) => {
      if (!cancelled) { setV12ProbeError(`No se pudo comprobar Sesiones V1.2: ${readError(cause)}`); setV12ProbeReady(true); }
    });
    return () => { cancelled = true; };
  }, [client]);
  useEffect(() => {
    if (!v12Supported || !editor?.id || exerciseDimensionsLoadedFor === editor.id ||
        exerciseDimensionsDirty) return undefined;
    let cancelled = false;
    loadPlannedExerciseDimensionsV12(client, editor.id).then((rows) => {
      if (cancelled) return;
      const loaded = normalizeExerciseDimensions(rows);
      setExerciseDimensions(loaded); setExerciseDimensionsBaseline(loaded);
      setExerciseDimensionsLoadedFor(editor.id);
    }).catch((cause) => {
      if (!cancelled) setBoardsError(`${errorKind(cause)}: no se pudieron cargar las medidas de ejercicios. ${readError(cause)}`);
    });
    return () => { cancelled = true; };
  }, [client, v12Supported, editor?.id, exerciseDimensionsLoadedFor, exerciseDimensionsDirty]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!deleteTarget) return undefined;
    setRetirementReason('');
    const closeOnEscape = (event) => { if (event.key === 'Escape') setDeleteTarget(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [deleteTarget]);

  const performLifecycle = async () => {
    if (!deleteTarget || !SESSION_RETIREMENT_BACKEND_VERIFIED || !canWriteContext || busy || operationRef.current) return;
    if (editor?.id === deleteTarget.id && dirty) {
      setError('Guarda o descarta los cambios pendientes de esta sesión antes de cambiar su estado.');
      return;
    }
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const revision = await changePlannedSessionLifecycle(client, deleteTarget.id,
        deleteTarget.revision, lifecycleAction, retirementReason);
      const fresh = await loadPlannedSession(client, deleteTarget.id, contextId);
      if (fresh.session.revision !== revision ||
          (lifecycleAction === 'retire' ? !fresh.session.retired_at
            : lifecycleAction === 'cancel' ? !fresh.session.cancelled_at : Boolean(fresh.session.cancelled_at))) {
        throw new Error('La lectura posterior no confirma el cambio. Actualiza la lista antes de repetirlo.');
      }
      const rows = await listPlannedSessions(client, contextId);
      setSessions(rows); setSessionsLoadError(false);
      if (editor?.id === deleteTarget.id) {
        if (lifecycleAction === 'retire') {
          setEditor(null); setBaseline(null); setRoster([]); setAvailability({}); setAvailabilityBaseline({});
          setDistribution(null); setDistributionBaseline(null); setSessionValue(''); setBaselineSessionValue('');
          materialStateRef.current = null; setMaterialState(null); setMaterialBaseline(null);
        } else {
          const next = hydratePlannedEditor(fresh.session, fresh.slots, fresh.items);
          setEditor(next); setBaseline(next);
        }
      }
      setDeleteTarget(null);
      setNotice(lifecycleAction === 'retire' ? 'Sesión retirada y verificada en el servidor.'
        : lifecycleAction === 'cancel' ? 'Sesión anulada y verificada en el servidor.'
          : 'Sesión reactivada y verificada en el servidor.');
    } catch (cause) {
      if (cause?.code === '40001') setConflict(true);
      setError(`${errorKind(cause)}: no se pudo verificar el cambio de estado. ${readError(cause)}`);
    } finally { operationRef.current = false; setBusy(false); }
  };
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
      setSessions(await listPlannedSessions(client, targetId, mcV4Supported));
      setSessionsLoadError(false);
    } catch (cause) {
      setSessionsLoadError(true);
      setError(`${errorKind(cause)}: no se pudieron cargar las sesiones. ${readError(cause)}`);
    } finally { setSessionsLoading(false); }
  }, [client, contextId, mcV4Supported]);

  useEffect(() => {
    if (!BOARD_V11_ENABLED || !contextId) { setBoardDefaults(null); setBoardDefaultsLoading(false); setBoardDefaultsContextId(''); return undefined; }
    let cancelled = false;
    setBoardDefaults(null); setBoardDefaultsLoading(true); setBoardDefaultsContextId('');
    loadPlannedBoardDefaultsV11(client, contextId).then((row) => {
      if (!cancelled) { setBoardDefaults(row); setBoardDefaultsContextId(contextId); }
    }).catch((cause) => { if (!cancelled) setError(`${errorKind(cause)}: no se pudieron cargar las configuraciones habituales. ${readError(cause)}`); })
      .finally(() => { if (!cancelled) setBoardDefaultsLoading(false); });
    return () => { cancelled = true; };
  }, [client, contextId]);

  useEffect(() => {
    let cancelled = false;
    if (!contextId) { setSessions([]); setSessionsLoadError(false); return undefined; }
    setSessionsLoading(true);
    listPlannedSessions(client, contextId, mcV4Supported).then((rows) => {
      if (!cancelled) { setSessions(rows); setSessionsLoadError(false); }
    }).catch((cause) => {
      if (!cancelled) { setSessionsLoadError(true); setError(`${errorKind(cause)}: no se pudieron cargar las sesiones. ${readError(cause)}`); }
    }).finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [client, contextId, mcV4Supported]);

  useEffect(() => {
    if (!exportOpen || !contextId || !exportFrom || !exportTo || exportFrom > exportTo) {
      setExportResult(null); setExportLoading(false);
      return undefined;
    }
    let cancelled = false;
    setExportResult(null); setExportLoading(true); setExportError('');
    listPlannedSessionsForExport(client, contextId, exportFrom, exportTo)
      .then((rows) => { if (!cancelled) setExportResult({ contextId, from: exportFrom, to: exportTo, rows }); })
      .catch((cause) => { if (!cancelled) setExportError(`${errorKind(cause)}: no se pudieron consultar las sesiones. ${readError(cause)}`); })
      .finally(() => { if (!cancelled) setExportLoading(false); });
    return () => { cancelled = true; };
  }, [client, contextId, exportOpen, exportFrom, exportTo]);

  useEffect(() => {
    if (!batchPrint?.sessions.length) return undefined;
    let cancelled = false;
    const previousTitle = document.title;
    const finish = () => {
      if (cancelled) return;
      setBatchPrint(null); setExportBusy(false);
      setExportProgress('Cuadro de impresión cerrado. Si elegiste «Guardar como PDF», comprueba el archivo en tu equipo.');
    };
    const openPrint = async () => {
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      if (document.fonts?.ready) await document.fonts.ready;
      const images = [...(batchPrintRef.current?.querySelectorAll('img') || [])];
      await Promise.all(images.map((image) => image.decode?.() || Promise.resolve()));
      if (cancelled) return;
      const sheets = batchPrintRef.current?.querySelectorAll('.planned-print-sheet');
      if (!sheets?.length) throw new Error('No se pudieron preparar las hojas para imprimir.');
      document.title = batchPrint.fileName.replace(/\.pdf$/i, '');
      setExportProgress(`Abriendo la impresión de ${sheets.length} hojas. Elige «Guardar como PDF».`);
      window.addEventListener('afterprint', finish, { once: true });
      window.print();
    };
    openPrint().catch((cause) => {
      if (cancelled) return;
      setExportError(`No se generó ningún PDF: ${readError(cause)}`);
      setExportBusy(false); setBatchPrint(null);
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', finish);
      document.title = previousTitle;
    };
  }, [batchPrint]);

  useEffect(() => {
    let cancelled = false;
    setLocationOptions([]); setOpponentOptions([]); setSuggestionsError('');
    if (!contextId) return undefined;
    Promise.allSettled([listPlannedLocations(client, contextId), listPlannedOpponents(client, contextId)])
      .then(([locations, opponents]) => {
        if (cancelled) return;
        if (locations.status === 'fulfilled') setLocationOptions(locations.value);
        if (opponents.status === 'fulfilled') setOpponentOptions(opponents.value);
        const failures = [locations.status === 'rejected' && `lugares: ${readError(locations.reason)}`,
          opponents.status === 'rejected' && `rivales: ${readError(opponents.reason)}`].filter(Boolean);
        if (failures.length) setSuggestionsError(`No se pudieron cargar estas sugerencias del equipo-temporada: ${failures.join('; ')}`);
      });
    return () => { cancelled = true; };
  }, [client, contextId]);

  useEffect(() => {
    let cancelled = false;
    setLibraryTasks([]); setLibraryError('');
    if (!selected?.club_id || !editor) return undefined;
    setLibraryLoading(true);
    listPlannedLibraryTasks(client, selected.club_id, seriesSupported).then((rows) => {
      if (!cancelled) setLibraryTasks(rows.filter((row) => row.club_id === selected.club_id));
    }).catch((cause) => {
      if (!cancelled) setLibraryError(`${errorKind(cause)}: ${readError(cause)}`);
    }).finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [client, selected?.club_id, Boolean(editor), userId, seriesSupported]);

  const requestDiscard = () => !dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');
  const changeContext = (nextId) => {
    if (busy || !requestDiscard()) return;
    setDeleteTarget(null);
    setEditor(null); setBaseline(null); setUnsupportedItems(false); setValidationIssues([]); setExpandedSlotId(null);
    setRoster([]); setCandidates([]); setSelectedMembershipIds([]); setInitialSelectedMembershipIds([]);
    setAvailability({}); setAvailabilityBaseline({}); setPlayersError('');
    setDistribution(null); setDistributionBaseline(null); setSessionSeedFormation(null); setSpecificPositions([]); setBoardsError('');
    setExerciseDimensions({}); setExerciseDimensionsBaseline({}); setExerciseDimensionsLoadedFor('');
    setSessionValue(''); setBaselineSessionValue(''); setValueSupported(false);
    setMcNumber(''); setMcBaseline('');
    materialStateRef.current = null; setMaterialState(null); setMaterialBaseline(null);
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
      const savedMaterialState = readSessionMaterialState(data.session.material_state);
      if (data.session.material_state != null && !savedMaterialState)
        throw new Error('Esta sesión utiliza una versión de Material que el editor actual no reconoce.');
      const materialConsistent = !savedMaterialState ||
        (next.header.material || '') === composeSessionMaterial(next.slots, savedMaterialState);
      const { supported: supportsValue, value: loadedValue } = readPlannedSessionValue(data.session);
      const nextCandidates = players.roster.length ? [] : await loadPlannedRosterCandidates(client, contextId);
      const nextAvailability = Object.fromEntries(players.availability.map((row) => [row.player_id,
        { status: row.status, observation: row.observation || '' }]));
      let nextDistribution = null;
      let nextField = { length_m: '', width_m: '' };
      let nextPositions = [];
      let nextBoardsError = '';
      let nextExerciseDimensions = {};
      let nextSeedFormation = null;
      try {
        const [savedRow, seed, savedExerciseDimensions] = await Promise.all([
          loadPlannedDistribution(client, sessionId),
          BOARD_V11_ENABLED ? loadPlannedBoardSeedV11(client, sessionId) : Promise.resolve(null),
          v12Supported ? loadPlannedExerciseDimensionsV12(client, sessionId) : Promise.resolve([]),
        ]);
        nextExerciseDimensions = normalizeExerciseDimensions(savedExerciseDimensions);
        const savedDistribution = normalizeDistribution(savedRow);
        nextSeedFormation = seed?.formation_key || null;
        if (seed) nextField = { length_m: seed.field_length_m ?? '', width_m: seed.field_width_m ?? '' };
        nextDistribution = canWriteContext ? { ...savedDistribution,
          space_zones: reconcileSpaceZones(savedDistribution.space_zones, next.slots) }
          : savedDistribution;
        if (canWriteContext && v12Supported && fieldIsMeasured(nextField)) {
          nextDistribution = { ...nextDistribution, space_zones: nextDistribution.space_zones.map((zone) => {
            const metres = nextExerciseDimensions[zone.slot_id];
            return metres ? zoneFromMetres(zone, nextField, metres) || zone : zone;
          }) };
        }
        nextPositions = savedDistribution.specific_positions_snapshot.length
          ? savedDistribution.specific_positions_snapshot
          : await loadPlannedSpecificPositions(client, players.roster.map((row) => row.player_id));
        nextDistribution = applySessionBoardSeed(nextDistribution, savedRow, seed,
          players.roster, specificPositionMap(nextPositions), autoPlayerLayout);
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
      setSessionSeedFormation(nextSeedFormation);
      setFieldDimensions(nextField); setFieldBaseline(nextField);
      setExerciseDimensions(nextExerciseDimensions); setExerciseDimensionsBaseline(nextExerciseDimensions);
      setExerciseDimensionsLoadedFor(v12Supported ? sessionId : '');
      setValueSupported(supportsValue); setSessionValue(loadedValue); setBaselineSessionValue(loadedValue);
      setMcNumber(data.session.mc_number == null ? '' : String(data.session.mc_number));
      setMcBaseline(data.session.mc_number == null ? '' : String(data.session.mc_number));
      const activeMaterialState = materialSupported && materialConsistent ? savedMaterialState : null;
      materialStateRef.current = activeMaterialState;
      setMaterialState(activeMaterialState); setMaterialBaseline(activeMaterialState);
      if (!materialConsistent) setError('El Material guardado difiere del estado de sincronización. Revísalo y activa de nuevo la sincronización; no se cambiará automáticamente.');
    } catch (cause) {
      setPlayersError(`${errorKind(cause)}: ${readError(cause)}`);
      setError(`${errorKind(cause)}: no se pudo abrir la sesión. ${readError(cause)}`);
    } finally { operationRef.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!openSessionRequest?.id || !openSessionRequest?.contextId || contextsLoading) return;
    const requestKey = `${openSessionRequest.contextId}:${openSessionRequest.id}`;
    if (openedCalendarRequestRef.current === requestKey) return;
    if (!contexts.some((row) => row.id === openSessionRequest.contextId)) {
      openedCalendarRequestRef.current = requestKey;
      setError('La sesión seleccionada no pertenece a un contexto disponible.');
      return;
    }
    if (contextId !== openSessionRequest.contextId) {
      changeContext(openSessionRequest.contextId);
      return;
    }
    openedCalendarRequestRef.current = requestKey;
    openSession(openSessionRequest.id).then(() => {
      requestAnimationFrame(() => document.querySelector('[aria-label="Ficha de sesión"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
  }, [openSessionRequest?.id, openSessionRequest?.contextId, contextsLoading, contexts, contextId]);
  const startNew = async () => {
    if (!canWriteContext || busy || operationRef.current || boardDefaultsLoading ||
        (BOARD_V11_ENABLED && boardDefaultsContextId !== contextId) || !requestDiscard()) return;
    operationRef.current = true; setBusy(true); setError('');
    try {
      const latestDefaults = BOARD_V11_ENABLED ? await loadPlannedBoardDefaultsV11(client, contextId) : null;
      setBoardDefaults(latestDefaults);
      setEditor(createEmptyPlannedEditor()); setBaseline(null);
      setRoster([]); setCandidates([]); setSelectedMembershipIds([]); setInitialSelectedMembershipIds([]);
      setAvailability({}); setAvailabilityBaseline({}); setPlayersError('');
      const initialBoard = initialBoardFromDefaults(latestDefaults);
      setDistribution(initialBoard.distribution); setDistributionBaseline(emptyDistribution());
      setSessionSeedFormation(latestDefaults?.formation_key || null);
      setExerciseDimensions({}); setExerciseDimensionsBaseline({}); setExerciseDimensionsLoadedFor('');
      const defaultField = initialBoard.fieldDimensions;
      setFieldDimensions(defaultField); setFieldBaseline(defaultField);
      setSessionValue(''); setBaselineSessionValue(''); setValueSupported(false);
      setMcNumber(''); setMcBaseline('');
      const initialMaterialState = materialSupported ? { version: 1, manual: [], excluded: [] } : null;
      materialStateRef.current = initialMaterialState;
      setMaterialState(initialMaterialState); setMaterialBaseline(null);
      setSpecificPositions([]); setBoardsError('');
      setUnsupportedItems(false); setError(''); setNotice(''); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null);
      requestAnimationFrame(() => document.querySelector('[data-planned-session-document]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (cause) {
      setError(`${errorKind(cause)}: no se pudo comprobar la última configuración habitual. No se creó una sesión. ${readError(cause)}`);
    } finally { operationRef.current = false; setBusy(false); }
  };
  const updateEditor = (update) => {
    setValidationIssues([]);
    setEditor((current) => {
      if (!current) return current;
      const next = update(current);
      if (materialStateRef.current && next.slots !== current.slots) return {
        ...next, header: { ...next.header,
          material: composeSessionMaterial(next.slots, materialStateRef.current) },
      };
      return next;
    });
  };
  const updateMaterial = (value) => {
    if (materialStateRef.current) {
      const next = sessionMaterialStateFromInput(value, editor.slots, materialStateRef.current);
      materialStateRef.current = next; setMaterialState(next);
    }
    updateEditor((current) => ({ ...current, header: { ...current.header, material: value } }));
  };
  const enableMaterialAutofill = () => {
    const next = sessionMaterialStateFromInput(editor.header.material, editor.slots);
    materialStateRef.current = next; setMaterialState(next);
  };
  const pinMaterialManually = (entry) => {
    const current = materialStateRef.current;
    if (!current) return;
    const key = sessionMaterialKey(entry);
    const next = { ...current,
      manual: current.manual.some((value) => sessionMaterialKey(value) === key)
        ? current.manual : [...current.manual, entry],
      excluded: current.excluded.filter((value) => value !== key),
    };
    materialStateRef.current = next; setMaterialState(next);
    updateEditor((value) => ({ ...value, header: { ...value.header,
      material: composeSessionMaterial(value.slots, next) } }));
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
      setError('La fecha de una sesión con plantilla congelada requiere conciliación expresa antes de guardar otros cambios. Si cambia de semana y ya tiene MC, desasígnalo primero desde la fecha anterior.');
      return;
    }
    const issues = getPlannedEditorIssues(editor, selected);
    if (issues.length) {
      setValidationIssues(issues); setExpandedSlotId(issues.find((issue) => issue.slotId)?.slotId || null);
      setError(`Validación: ${issues[0].message} Corrige los campos señalados antes de guardar.`);
      return;
    }
    const availabilityPatch = roster.length ? availabilityChanges(availability, availabilityBaseline, roster) : [];
    if (availabilityPatch.some((row) => row.observation?.length > 1000)) {
      setError('Las observaciones individuales no pueden superar 1000 caracteres.'); return;
    }
    const emptyField = fieldDimensions.length_m === '' && fieldDimensions.width_m === '';
    if (fieldDirty && !emptyField && !fieldIsMeasured(fieldDimensions)) {
      setError('Indica largo y ancho válidos para el campo, o deja ambos vacíos.'); return;
    }
    const boardPayload = distribution ? distributionForSave(distribution, roster) : null;
    if ((savableDistributionDirty || exerciseDimensionsDirty) &&
        (boardsError || v12ProbeError || validateDistribution(boardPayload, roster, editor.slots))) {
      setError(boardsError || v12ProbeError || `Validación de pizarras: ${validateDistribution(boardPayload, roster, editor.slots)}`);
      return;
    }
    let dimensionsPayload = [];
    try {
      if (v12Supported) dimensionsPayload = exerciseDimensionsPayload(exerciseDimensions, editor.slots);
      if (valueDirty) parsePlannedSessionValue(sessionValue);
    } catch (cause) { setError(`Validación: ${readError(cause)}`); return; }
    const invalidExercise = v12Supported && editor.slots.find((slot) => exerciseDimensionIssue(slot.id));
    if (invalidExercise) { setError(`Ejercicio ${editor.slots.indexOf(invalidExercise) + 1}: ${exerciseDimensionIssue(invalidExercise.id)}`); return; }
    if (mcDirty && mcNumber !== '' && (!/^[1-9]\d{0,3}$/.test(mcNumber) || Number(mcNumber) > 9999)) {
      setError('El MC debe ser un número entero entre 1 y 9999, o quedar sin asignar.'); return;
    }
    operationRef.current = true;
    setBusy(true); setError(''); setNotice(''); setConflict(false);
    let working = editor;
    let original = baseline;
    let creating = false;
    const wasNew = !working.id;
    const materialNeedsSync = materialSupported && materialState &&
      (wasNew || materialDirty || working.header.material !== original?.header.material ||
        JSON.stringify(working.slots) !== JSON.stringify(original?.slots));
    const completed = [];
    let stage = 'la sesión';
    let revision = working.revision;
    const advance = (nextRevision) => {
      revision = nextRevision;
      setEditor((current) => current ? { ...current, id: working.id, revision } : current);
      setBaseline((current) => current ? { ...current, id: working.id, revision } : current);
    };
    try {
      if (!working.id) {
        stage = 'crear el borrador';
        creating = true;
        const id = await createPlannedDraft(client, selected.id, working.session_date);
        creating = false;
        working = { ...working, id, revision: 1 };
        revision = 1;
        original = { ...createEmptyPlannedEditor(), id, revision: 1,
          session_date: working.session_date };
        setEditor(working); setBaseline(original);
        completed.push('borrador creado');
      }
      const movingAssignedWeek = !wasNew && mcV4Supported && mcBaseline &&
        calendarWeekDays(baseline.session_date)[0] !== calendarWeekDays(working.session_date)[0];
      if (movingAssignedWeek) {
        stage = 'desasignar el MC de la semana anterior';
        const nextRevision = await savePlannedSessionMcV4(client, working.id, revision, null);
        advance(nextRevision); working = { ...working, revision: nextRevision };
        original = { ...original, revision: nextRevision };
        setMcBaseline('');
        completed.push('MC anterior desasignado');
      }
      if (editorDirty || wasNew) {
        stage = 'guardar datos generales y ejercicios';
        const use03c = hasPlannedLibraryItems(working) || hasPlannedLibraryItems(original);
        const nextRevision = await savePlannedSession(client, buildPlannedSavePayload(working, original), use03c);
        advance(nextRevision);
        const data = await loadPlannedSession(client, working.id, selected.id);
        const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
        if (fresh.revision !== revision) throw new Error('La revisión devuelta no coincide con la sesión recargada.');
        if (use03c) assertPlanned03cReload(working, fresh, revision);
        setEditor(fresh); setBaseline(fresh);
        const savedLocation = String(fresh.header.location || '').trim().replace(/\s+/g, ' ');
        if (savedLocation) setLocationOptions((current) => [...new Set([...current, savedLocation])]
          .filter((name, index, all) => all.findIndex((entry) => entry.toLocaleLowerCase('es') === name.toLocaleLowerCase('es')) === index)
          .sort((a, b) => a.localeCompare(b, 'es')));
        setValueSupported(readPlannedSessionValue(data.session).supported);
        if (wasNew) {
          if (BOARD_V11_ENABLED) {
            const seed = await loadPlannedBoardSeedV11(client, working.id);
            const initialField = { length_m: seed?.field_length_m ?? '', width_m: seed?.field_width_m ?? '' };
            setFieldBaseline(initialField);
            setSessionSeedFormation(seed?.formation_key || null);
          }
          const initialValue = readPlannedSessionValue(data.session).value;
          setSessionValue(initialValue); setBaselineSessionValue(initialValue);
        }
        setUnsupportedItems(unsupportedSession(data, fresh));
        setDistribution((current) => current ? { ...current,
          space_zones: reconcileSpaceZones(current.space_zones, fresh.slots) } : current);
        if (wasNew) {
          const nextCandidates = await loadPlannedRosterCandidates(client, selected.id);
          setCandidates(nextCandidates);
          const initialIds = eligibleRosterCandidates(nextCandidates, fresh.session_date).map((row) => row.id);
          setSelectedMembershipIds(initialIds); setInitialSelectedMembershipIds(initialIds);
        }
        completed.push('datos generales y ejercicios');
      }
      if (availabilityPatch.length) {
        stage = 'guardar disponibilidad';
        const nextRevision = await savePlannedAvailability(client, working.id, revision, availabilityPatch);
        advance(nextRevision);
        const [data, players] = await Promise.all([
          loadPlannedSession(client, working.id, selected.id), loadPlannedSessionPlayers(client, working.id),
        ]);
        if (data.session.revision !== revision) throw new Error('La revisión de disponibilidad no coincide.');
        const nextAvailability = Object.fromEntries(players.availability.map((row) => [row.player_id,
          { status: row.status, observation: row.observation || '' }]));
        if (availabilityChanges(nextAvailability, availability, roster).length)
          throw new Error('La disponibilidad recargada no coincide con los cambios enviados.');
        setAvailability(nextAvailability); setAvailabilityBaseline(nextAvailability);
        completed.push('disponibilidad');
      }
      if (fieldDirty) {
        stage = 'guardar dimensiones del campo';
        const nextRevision = await savePlannedFieldDimensionsV11(client, working.id, revision, fieldDimensions);
        advance(nextRevision);
        const [data, seed] = await Promise.all([loadPlannedSession(client, working.id, selected.id),
          loadPlannedBoardSeedV11(client, working.id)]);
        const nextField = { length_m: seed?.field_length_m ?? '', width_m: seed?.field_width_m ?? '' };
        if (data.session.revision !== revision || !sameFieldDimensions(nextField, fieldDimensions))
          throw new Error('Las dimensiones recargadas no coinciden con el guardado.');
        setFieldDimensions(nextField); setFieldBaseline(nextField);
        completed.push('dimensiones del campo');
      }
      if (savableDistributionDirty || exerciseDimensionsDirty) {
        stage = 'guardar pizarras y medidas de ejercicios';
        const nextRevision = v12Supported
          ? await savePlannedDistributionV12(client, working.id, revision, boardPayload, dimensionsPayload)
          : await savePlannedDistribution(client, working.id, revision, boardPayload);
        advance(nextRevision);
        const [data, savedRow, savedDimensions] = await Promise.all([
          loadPlannedSession(client, working.id, selected.id), loadPlannedDistribution(client, working.id),
          v12Supported ? loadPlannedExerciseDimensionsV12(client, working.id) : Promise.resolve([]),
        ]);
        const savedBoard = normalizeDistribution(savedRow);
        const loadedDimensions = normalizeExerciseDimensions(savedDimensions);
        if (data.session.revision !== revision ||
            distributionPayloadKey(savedBoard) !== distributionPayloadKey(boardPayload) ||
            (v12Supported && exerciseDimensionsKey(loadedDimensions) !==
              exerciseDimensionsKey(normalizeExerciseDimensions(dimensionsPayload))))
          throw new Error('Las pizarras recargadas no coinciden con el guardado.');
        setDistribution(!roster.length ? { ...savedBoard, formation_key: distribution.formation_key } : savedBoard);
        setDistributionBaseline(savedBoard);
        if (v12Supported) {
          setExerciseDimensions(loadedDimensions); setExerciseDimensionsBaseline(loadedDimensions);
          setExerciseDimensionsLoadedFor(working.id);
        }
        completed.push('pizarras y ejercicios');
      }
      if (valueDirty) {
        stage = 'guardar VALOR';
        const nextRevision = await savePlannedSessionValue(client, working.id, revision, sessionValue);
        advance(nextRevision);
        const data = await loadPlannedSession(client, working.id, selected.id);
        const received = readPlannedSessionValue(data.session).value;
        const expected = parsePlannedSessionValue(sessionValue);
        if (data.session.revision !== revision ||
            (expected == null ? received !== '' : Number(received) !== expected))
          throw new Error('VALOR no coincide con la lectura posterior.');
        setSessionValue(received); setBaselineSessionValue(received);
        completed.push('VALOR');
      }
      if (mcDirty || movingAssignedWeek) {
        stage = 'guardar número MC';
        const nextNumber = mcNumber === '' ? null : Number(mcNumber);
        const nextRevision = await savePlannedSessionMcV4(client, working.id, revision, nextNumber);
        advance(nextRevision);
        const data = await loadPlannedSession(client, working.id, selected.id);
        if (data.session.revision !== revision || data.session.mc_number !== nextNumber)
          throw new Error('El MC recargado no coincide con el valor enviado.');
        setMcBaseline(mcNumber);
        completed.push(nextNumber == null ? 'MC sin asignar' : `MC ${nextNumber}`);
      }
      if (materialNeedsSync) {
        stage = 'sincronizar Material';
        const nextRevision = await savePlannedSessionMaterial(client, working.id, revision, materialState);
        advance(nextRevision);
        const data = await loadPlannedSession(client, working.id, selected.id);
        const savedMaterialState = readSessionMaterialState(data.session.material_state);
        const expectedMaterial = composeSessionMaterial(
          hydratePlannedEditor(data.session, data.slots, data.items).slots, savedMaterialState);
        if (data.session.revision !== revision || !savedMaterialState ||
            data.session.material !== (expectedMaterial || null))
          throw new Error('El Material recargado no coincide con el guardado.');
        const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
        setEditor(fresh); setBaseline(fresh);
        materialStateRef.current = savedMaterialState;
        setMaterialState(savedMaterialState); setMaterialBaseline(savedMaterialState);
        completed.push('Material');
      }
      await refreshList(selected.id);
      const pending = [pendingEmptyFormation && 'sistema vacío', selectionDirty && 'selección de plantilla sin confirmar'].filter(Boolean);
      setNotice(pending.length
        ? `${completed.length ? `Guardado: ${completed.join(', ')}. ` : ''}Pendiente: ${pending.join(' y ')}. Confirma la plantilla para continuar.`
        : completed.length ? `Guardado y verificado: ${completed.join(', ')}.` : 'No hay cambios que guardar.');
      return { id: working.id, revision };
    } catch (cause) {
      if (creating && ['42501', '23514', '22023'].includes(cause?.code)) {
        setError(`${errorKind(cause)}: no se pudo crear el borrador. Los cambios siguen en el formulario. ${readError(cause)}`);
      } else if (creating) {
        setCreationUncertain(true);
        setError(`Conexión o servidor: no se pudo confirmar si se creó el borrador. No repitas Guardar: actualiza la lista y comprueba si apareció una sesión nueva antes de iniciar otra. ${readError(cause)}`);
      } else if (cause?.code === '40001') {
        setConflict(true);
        setError(`Revisión obsoleta al ${stage}. ${completed.length ? `Ya se guardó: ${completed.join(', ')}. ` : ''}Los demás cambios siguen en pantalla; recarga antes de reintentar.`);
      } else {
        if (!['42501', '23514', '22023', '0A000', '22001'].includes(cause?.code)) setCreationUncertain(true);
        setError(`${errorKind(cause)} al ${stage}. ${completed.length ? `Ya se guardó: ${completed.join(', ')}. ` : ''}No se garantiza que todo esté guardado; recarga la sesión antes de reintentar. ${readError(cause)}`);
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
    if (BOARD_V11_ENABLED && distribution?.formation_key && !distribution.player_layout.length) {
      const positions = await loadPlannedSpecificPositions(client, players.roster.map((row) => row.player_id));
      const seed = await loadPlannedBoardSeedV11(client, editor.id);
      const selectedFormation = distribution.formation_key;
      const positionMap = specificPositionMap(positions);
      setDistribution((current) => current ? { ...current,
        formation_key: selectedFormation,
        player_layout: seed?.formation_key === selectedFormation
          ? seededPlayerLayout(seed, players.roster, positionMap, autoPlayerLayout)
          : autoPlayerLayout(players.roster, positionMap, selectedFormation) } : current);
    }
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
    if (mcV4Supported && mcBaseline &&
        calendarWeekDays(baseline.session_date)[0] !== calendarWeekDays(editor.session_date)[0]) {
      setError('Esta sesión tiene MC asignado. Vuelve a la fecha anterior, selecciona «Sin asignar» y guarda; después cambia la fecha y concilia la plantilla. Por último, asigna el MC de la nueva semana.');
      return;
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
  const updateTask = (slotId, itemId, key, value) => updateSlot(slotId, (slot) => {
    const items = slot.items.map((item) => {
      if (item.id !== itemId) return item;
      if (item.kind !== 'library_task') return { ...item, [key]: value };
      if (key === 'series_count' || key === 'minutes_per_series') {
        const working = { ...item.working, [key]: value === '' ? null : Number(value) };
        const count = Object.prototype.hasOwnProperty.call(working, 'series_count')
          ? working.series_count : getPlannedLibraryValue(item, 'series_count');
        const minutes = Object.prototype.hasOwnProperty.call(working, 'minutes_per_series')
          ? working.minutes_per_series : getPlannedLibraryValue(item, 'minutes_per_series');
        const total = plannedSeriesDuration(count, minutes);
        if (total) { working.duration_minutes = total; return { ...item, working, minutes: String(total) }; }
        if (count == null && minutes == null) working.duration_minutes = item.minutes === '' ? null : Number(item.minutes);
        return { ...item, working };
      }
      if (key === 'minutes') return { ...item, minutes: value,
        working: { ...item.working, duration_minutes: value === '' ? null : Number(value) } };
      return { ...item, working: { ...item.working, [key]: value } };
    });
    const changed = items.find((item) => item.id === itemId);
    const recalculate = changed?.kind === 'library_task' &&
      ['series_count', 'minutes_per_series', 'minutes'].includes(key) &&
      (key === 'minutes' || plannedSeriesDuration(
        getPlannedLibraryValue(changed, 'series_count'), getPlannedLibraryValue(changed, 'minutes_per_series')));
    return { ...slot, items, duration: recalculate ? plannedExerciseTaskDuration(items, slot.duration) : slot.duration };
  });
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
    updateSlot(slotId, (slot) => {
      const items = slot.items.map((item) => item.id === itemId ? createPlannedLibraryItem(id, task) : item);
      return { ...slot, items, duration: plannedExerciseTaskDuration(items, slot.duration) };
    });
    const slot = editor.slots.find((entry) => entry.id === slotId);
    const zone = distribution?.space_zones.find((entry) => entry.slot_id === slotId);
    const prospective = slot && { ...slot, items: slot.items.map((entry) => entry.id === itemId
      ? createPlannedLibraryItem(id, task) : entry) };
    const metres = taskZoneMetres(prospective);
    if (BOARD_V11_ENABLED && fieldIsMeasured(fieldDimensions)) {
      const resized = zone && zoneFromMetres(zone, fieldDimensions, metres);
      if (resized && (!v12Supported ? zone.provisional : !exerciseDimensions[slotId]))
        changeZone(slotId, resized);
    }
    if (v12Supported && metres && !exerciseDimensions[slotId])
      setExerciseDimensions((current) => ({ ...current, [slotId]: metres }));
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
    updateSlot(slotId, (slot) => {
      const items = slot.items.filter((item) => item.id !== itemId);
      return { ...slot, items, duration: plannedExerciseTaskDuration(items, slot.duration) };
    });
  };
  const removeSlot = (slotId, number) => {
    const slot = editor?.slots.find((entry) => entry.id === slotId);
    if (!slot || !window.confirm(`¿Retirar el ejercicio ${number} y sus ${slot.items.length} tareas al guardar?`)) return;
    updateEditor((current) => ({ ...current, slots: current.slots.filter((entry) => entry.id !== slotId) }));
    setDistribution((current) => current ? { ...current,
      space_zones: current.space_zones.filter((zone) => zone.slot_id !== slotId) } : current);
    setExerciseDimensions((current) => { const next = { ...current }; delete next[slotId]; return next; });
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
    if (!canEdit || !distribution || boardsError) return;
    if (distribution.player_layout.some((item) => item.placement === 'manual') &&
        !window.confirm('Cambiar el sistema descartará los ajustes manuales de jugadores. ¿Continuar?')) return;
    const positionById = specificPositionMap(
      distribution.specific_positions_snapshot.length
        ? distribution.specific_positions_snapshot : specificPositions);
    setDistribution((current) => ({ ...current, formation_key: formationKey,
      player_layout: formationKey && roster.length ? autoPlayerLayout(roster, positionById, formationKey) : [] }));
  };
  const changeZone = (slotId, change) => {
    const zone = distribution?.space_zones.find((entry) => entry.slot_id === slotId);
    if (!zone) return;
    const resizing = Object.hasOwn(change, 'w') || Object.hasOwn(change, 'h');
    if (resizing && !fieldIsMeasured(fieldDimensions) && exerciseDimensions[slotId]) {
      setError('Define las dimensiones del campo antes de redimensionar un ejercicio con metros guardados.');
      return;
    }
    const nextZone = { ...zone, ...change };
    setDistribution((current) => current ? ({ ...current,
      space_zones: current.space_zones.map((item) => item.slot_id === slotId ? nextZone : item) }) : current);
    if (v12Supported && resizing && fieldIsMeasured(fieldDimensions))
      setExerciseDimensions((current) => ({ ...current,
        [slotId]: metresFromZone(nextZone, fieldDimensions) }));
  };
  const movePlayer = (playerId, target) => setDistribution((current) => current ? ({ ...current,
    player_layout: movePlayerBoardLayout(current.player_layout, playerId, target, current.formation_key),
  }) : current);

  const changeFieldDimensions = (key, value) => {
    const next = { ...fieldDimensions, [key]: value };
    setFieldDimensions(next);
    if (v12Supported && fieldIsMeasured(next)) {
      setDistribution((current) => current ? { ...current,
        space_zones: current.space_zones.map((zone) => {
          const metres = exerciseDimensions[zone.slot_id];
          return metres && validMetres(metres.length_m) && validMetres(metres.width_m)
            ? zoneFromMetres(zone, next, metres) || zone : zone;
        }) } : current);
    }
  };
  const changeExerciseDimension = (slotId, key, value) => {
    const current = exerciseDimensions[slotId] || { length_m: '', width_m: '' };
    const next = { ...current, [key]: value };
    setExerciseDimensions((all) => ({ ...all, [slotId]: next }));
    const zone = distribution?.space_zones.find((entry) => entry.slot_id === slotId);
    if (zone && fieldIsMeasured(fieldDimensions) && validMetres(next.length_m) && validMetres(next.width_m)) {
      const scaled = zoneFromMetres(zone, fieldDimensions, next);
      if (scaled) {
        changeZone(slotId, scaled);
        setExerciseDimensions((all) => ({ ...all, [slotId]: next }));
      }
    }
  };
  const exerciseDimensionIssue = (slotId) => {
    const metres = exerciseDimensions[slotId];
    if (!metres || (metres.length_m === '' && metres.width_m === '')) return '';
    if (!validMetres(metres.length_m) || !validMetres(metres.width_m))
      return 'Indica largo y ancho positivos, hasta 500 m, o deja ambos vacíos.';
    if (fieldIsMeasured(fieldDimensions) &&
        (Number(metres.length_m)>Number(fieldDimensions.length_m) ||
         Number(metres.width_m)>Number(fieldDimensions.width_m)))
      return 'El ejercicio debe caber dentro del campo.';
    return '';
  };
  const changeZoneMetres = (slotId, metres) => {
    const zone = distribution?.space_zones.find((entry) => entry.slot_id === slotId);
    const resized = zone && zoneFromMetres(zone, fieldDimensions, metres);
    if (!resized) { setError('La zona debe tener medidas positivas y caber dentro del campo.'); return false; }
    changeZone(slotId, resized);
    if (v12Supported) setExerciseDimensions((current) => ({ ...current, [slotId]: {
      length_m: Number(metres.length_m), width_m: Number(metres.width_m) } }));
    setError(''); return true;
  };

  const saveFieldDimensions = async () => {
    if (!BOARD_V11_ENABLED || !editor?.id || !canEdit || !fieldDirty || editorDirty ||
        busy || conflict || creationUncertain) return;
    const bothEmpty = fieldDimensions.length_m === '' && fieldDimensions.width_m === '';
    const oversizedSlot = v12Supported && editor.slots.find((slot) => exerciseDimensionIssue(slot.id));
    if (oversizedSlot) {
      setError(`Ejercicio ${editor.slots.indexOf(oversizedSlot) + 1}: ${exerciseDimensionIssue(oversizedSlot.id)}`);
      return;
    }
    if (!bothEmpty && (!validMetres(fieldDimensions.length_m) || !validMetres(fieldDimensions.width_m))) {
      setError('Indica largo y ancho positivos, hasta 500 m, o deja ambos vacíos.'); return;
    }
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const revision = await savePlannedFieldDimensionsV11(client, editor.id, editor.revision, fieldDimensions);
      const [data, seed] = await Promise.all([loadPlannedSession(client, editor.id, selected.id),
        loadPlannedBoardSeedV11(client, editor.id)]);
      const next = { length_m: seed?.field_length_m ?? '', width_m: seed?.field_width_m ?? '' };
      if (data.session.revision !== revision || Number(next.length_m || 0) !== Number(fieldDimensions.length_m || 0) ||
          Number(next.width_m || 0) !== Number(fieldDimensions.width_m || 0)) throw new Error('La lectura posterior no confirma las dimensiones.');
      const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
      setEditor(fresh); setBaseline(fresh); setFieldDimensions(next); setFieldBaseline(next);
      setNotice('Dimensiones guardadas y verificadas.');
    } catch (cause) { if (cause?.code === '40001') setConflict(true);
      setError(`${errorKind(cause)}: no se pudieron guardar las dimensiones. ${readError(cause)}`); }
    finally { operationRef.current = false; setBusy(false); }
  };

  const fixBoardDefault = async (kind) => {
    const blockReason = kind === 'players' ? playerDefaultBlockReason : fieldDefaultBlockReason;
    if (!BOARD_V11_ENABLED || !editor?.id || !canEdit || busy || operationRef.current) return;
    if (blockReason) { setError(blockReason); return; }
    if (
        !window.confirm(`¿Guardar los cambios pendientes y sustituir la ${kind === 'players' ? 'distribución' : 'dimensión'} habitual de ${selected.team_name} · ${selected.label}?`)) return;
    // La RPC de valores habituales copia el origen ya guardado; no recibe un estado del cliente.
    let expectedRevision = editor.revision;
    if (dirty) {
      const saved = await save();
      if (!saved) return;
      expectedRevision = saved.revision;
    }
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const current = await loadPlannedSession(client, editor.id, selected.id);
      if (current.session.revision !== expectedRevision) {
        setConflict(true);
        throw new Error('La revisión de la sesión ha cambiado. Recárgala antes de fijar la configuración habitual.');
      }
      await fixPlannedBoardDefaultV11(client, editor.id, kind);
      setBoardDefaults(await loadPlannedBoardDefaultsV11(client, contextId));
      setNotice(kind === 'players' ? 'Distribución habitual fijada para nuevas sesiones.' : 'Dimensiones habituales fijadas para nuevas sesiones.');
    } catch (cause) { setError(`${errorKind(cause)}: no se pudo fijar la configuración habitual. ${readError(cause)}`); }
    finally { operationRef.current = false; setBusy(false); }
  };

  const saveValue = async () => {
    if (!editor?.id || !valueSupported || !valueDirty || !canEdit || busy || operationRef.current ||
        editorDirty || distributionDirty || exerciseDimensionsDirty || availabilityDirty ||
        dateNeedsReconciliation || conflict || creationUncertain) return;
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
    if (!editor?.id || !canEdit || !distribution || boardsError || v12ProbeError ||
        !(savableDistributionDirty || exerciseDimensionsDirty) || fieldDirty ||
        editorDirty || dateNeedsReconciliation || busy || operationRef.current || conflict || creationUncertain) return;
    const payload = distributionForSave(distribution, roster);
    const issue = validateDistribution(payload, roster, editor.slots);
    let dimensionsPayload = [];
    try {
      if (v12Supported) dimensionsPayload = exerciseDimensionsPayload(exerciseDimensions, editor.slots);
    } catch (cause) { setError(`Validación de ejercicios: ${readError(cause)}`); return; }
    const badSlot = v12Supported && editor.slots.find((slot) => exerciseDimensionIssue(slot.id));
    if (badSlot) {
      setError(`Validación del ejercicio ${editor.slots.indexOf(badSlot) + 1}: ${exerciseDimensionIssue(badSlot.id)}`);
      return;
    }
    if (issue) { setError(`Validación de pizarras: ${issue}`); return; }
    operationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const revision = v12Supported
        ? await savePlannedDistributionV12(client, editor.id, editor.revision, payload, dimensionsPayload)
        : await savePlannedDistribution(client, editor.id, editor.revision, payload);
      const [data, savedRow, savedDimensions] = await Promise.all([
        loadPlannedSession(client, editor.id, selected.id),
        loadPlannedDistribution(client, editor.id),
        v12Supported ? loadPlannedExerciseDimensionsV12(client, editor.id) : Promise.resolve([]),
      ]);
      const fresh = hydratePlannedEditor(data.session, data.slots, data.items);
      const saved = normalizeDistribution(savedRow);
      const loadedDimensions = normalizeExerciseDimensions(savedDimensions);
      if (fresh.revision !== revision ||
          distributionPayloadKey(saved) !== distributionPayloadKey(payload) ||
          (v12Supported && exerciseDimensionsKey(loadedDimensions) !==
            exerciseDimensionsKey(normalizeExerciseDimensions(dimensionsPayload))))
        throw new Error('La distribución recargada no coincide con el guardado. Recarga la ficha.');
      setEditor(fresh); setBaseline(fresh);
      setDistribution(!roster.length
        ? { ...saved, formation_key: distribution.formation_key } : saved);
      setDistributionBaseline(saved);
      if (v12Supported) { setExerciseDimensions(loadedDimensions);
        setExerciseDimensionsBaseline(loadedDimensions); setExerciseDimensionsLoadedFor(editor.id); }
      if (saved.specific_positions_snapshot.length) setSpecificPositions(saved.specific_positions_snapshot);
      setNotice(pendingEmptyFormation
        ? 'Zonas guardadas. El cambio de sistema vacío sigue pendiente: la RPC actual requiere plantilla congelada para guardarlo.'
        : 'Pizarras guardadas y verificadas desde el servidor.');
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

  const openExportDialog = () => {
    const referenceDate = sessions.find((row) => row.club_team_season_id === contextId)?.session_date || selected?.starts_on;
    const week = calendarWeekDays(referenceDate);
    setExportFrom(week[0] || referenceDate || '');
    setExportTo(week[6] || referenceDate || '');
    setExportResult(null); setExportError(''); setExportProgress(''); setExportOpen(true);
  };

  const downloadSessionsPdf = async () => {
    if (!selected || busy || exportBusy || exportLoading || !v12ProbeReady || v12ProbeError ||
        exportResult?.contextId !== contextId || exportResult?.from !== exportFrom ||
        exportResult?.to !== exportTo || !exportResult.rows.length) return;
    setExportBusy(true); setExportError(''); setExportProgress('');
    const printSessions = [];
    try {
      for (const [index, row] of exportResult.rows.entries()) {
        setExportProgress(`Preparando sesión ${index + 1} de ${exportResult.rows.length}…`);
        printSessions.push(await loadPlannedSessionPrintData(client, row, contextId, v12Supported));
      }
      setExportProgress('Componiendo las hojas A4…');
      setBatchPrint({ sessions: printSessions,
        fileName: plannedSessionExportFileName(exportFrom, exportTo), selected });
    } catch (cause) {
      setExportError(`No se abrió la impresión; no se ha generado un archivo incompleto. ${readError(cause)}`);
      setExportProgress(''); setExportBusy(false);
    }
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
                onChange={(event) => changeContext(event.target.value)} disabled={busy || exportBusy}>
                {contexts.map((row) => <option key={row.id} value={row.id}>
                  {row.team_name} · {row.label}{row.status === 'closed' ? ' · Cerrada' : ''}
                </option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${button} border border-white/15 text-slate-100`}
                disabled={busy || exportBusy || sessionsLoading || sessionsLoadError || !v12ProbeReady || Boolean(v12ProbeError)}
                onClick={openExportDialog}>Exportar PDF</button>
            {canWriteContext ? <button type="button" className={`${button} bg-caudal-electric text-slate-950`}
              disabled={busy || exportBusy || boardDefaultsLoading || (BOARD_V11_ENABLED && boardDefaultsContextId !== contextId)}
              onClick={startNew}>Nueva sesión</button> : null}
            </div>
          </div>
        ) : null}
        {selected ? <p className="mt-3 text-sm text-slate-400">
          {formatDate(selected.starts_on)} — {formatDate(selected.ends_on)} ·
          {selected.status === 'closed' ? ' Temporada cerrada: solo consulta' :
            isManager ? ' Temporada abierta' : ' Consulta; escritura reservada al propietario/administrador de pruebas'}
        </p> : null}
      </header>

      {exportOpen && selected ? <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-3"
        role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !exportBusy) setExportOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="planned-export-title"
          className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1a2d] p-4 text-white shadow-2xl sm:p-5">
          <div className="flex items-start justify-between gap-3"><div>
            <h3 id="planned-export-title" className="text-lg font-black">Exportar sesiones a PDF</h3>
            <p className="mt-1 text-xs text-slate-400">{selected.team_name} · {selected.label}. Se usarán las sesiones guardadas que puedes consultar.</p>
          </div><button type="button" className={`${button} border border-white/15 text-slate-200`}
            disabled={exportBusy} onClick={() => setExportOpen(false)}>Cerrar</button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-300">Fecha inicial
              <input type="date" className={`${input} mt-1`} value={exportFrom}
                disabled={exportBusy} onChange={(event) => setExportFrom(event.target.value)} />
            </label>
            <label className="text-xs font-semibold text-slate-300">Fecha final
              <input type="date" className={`${input} mt-1`} value={exportTo}
                disabled={exportBusy} onChange={(event) => setExportTo(event.target.value)} />
            </label>
          </div>
          {!exportFrom || !exportTo || exportFrom > exportTo
            ? <p className="mt-3 text-xs text-amber-200">Selecciona dos fechas válidas y comprueba que la inicial no sea posterior a la final.</p>
            : exportLoading ? <p className="mt-3 text-xs text-slate-300" role="status">Buscando sesiones autorizadas…</p>
              : exportResult?.contextId === contextId && exportResult.from === exportFrom && exportResult.to === exportTo
                ? <p className="mt-3 text-sm text-slate-200" role="status">{exportResult.rows.length} {exportResult.rows.length === 1 ? 'sesión encontrada' : 'sesiones encontradas'} (fechas incluidas).{!exportResult.rows.length ? ' No se generará un PDF vacío.' : ''}</p>
                : null}
          {v12ProbeError ? <p className="mt-3 text-xs text-amber-200">No se pudieron verificar las medidas guardadas de los ejercicios. Recarga Sesiones antes de exportar.</p> : null}
          {exportError ? <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-950/40 p-2 text-xs text-red-100">{exportError}</p> : null}
          {exportProgress ? <p role="status" className="mt-3 text-xs text-caudal-electric">{exportProgress}</p> : null}
          <p className="mt-3 text-[11px] text-slate-500">En el cuadro de impresión selecciona «Guardar como PDF». El nombre sugerido será {plannedSessionExportFileName(exportFrom, exportTo)}.</p>
          <div className="mt-4 flex justify-end"><button type="button"
            className={`${button} bg-caudal-electric text-slate-950`}
            disabled={busy || exportBusy || exportLoading || !v12ProbeReady || Boolean(v12ProbeError) ||
              exportResult?.contextId !== contextId || exportResult?.from !== exportFrom ||
              exportResult?.to !== exportTo || !exportResult?.rows.length}
            onClick={downloadSessionsPdf}>{exportBusy ? 'Preparando…' : 'Descargar PDF'}</button></div>
        </section>
      </div> : null}

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
          {sessions.map((row) => <div key={row.id}
            className="flex min-w-0 items-start rounded-xl border border-white/10 bg-white/[0.04] transition hover:border-caudal-electric/50">
            <button type="button" onClick={() => openSession(row.id)} disabled={busy}
              className="min-w-0 flex-1 rounded-xl p-3 text-left disabled:opacity-60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">{formatDate(row.session_date)}{row.starts_at ? ` · ${String(row.starts_at).slice(0, 5)}` : ''}</span>
                <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${row.planning_state === 'confirmed'
                  ? 'bg-caudal-electric/15 text-caudal-electric' : 'bg-white/10 text-slate-300'}`}>
                  {row.planning_state === 'confirmed' ? `Confirmada · Nº ${row.session_number}` : 'Borrador'}
                </span>
                {row.cancelled_at ? <span className="rounded-full border border-amber-300/50 px-2 py-1 text-[11px] font-black text-amber-200">ANULADA</span> : null}
              </div>
              <p className="mt-2 text-xs text-slate-400">{row.total_minutes} min planificados
                {row.mc_number ? ` · MC ${row.mc_number}` : ''}
                {isPlannedMicrocycle(row.morphology_pattern) ? ` · ${row.morphology_pattern}` : ''} · Abrir sesión</p>
            </button>
            {canWriteContext ? <details className="relative z-10 mt-2 mr-2 shrink-0">
              <summary aria-label={`Acciones de ${row.planning_state === 'confirmed' ? `sesión nº ${row.session_number}` : 'borrador'} del ${formatDate(row.session_date)}`}
                className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-xl text-slate-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric">⋯</summary>
              <div className="absolute right-0 top-full z-20 w-44 rounded-xl border border-white/15 bg-[#102239] p-1 shadow-xl">
                <button type="button" disabled={busy} onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open');
                  setLifecycleAction('retire'); setDeleteTarget(row);
                }} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-semibold text-red-200 hover:bg-red-400/10 disabled:opacity-50">
                  Eliminar sesión</button>
                <button type="button" disabled={busy} onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open');
                  setLifecycleAction(row.cancelled_at ? 'reactivate' : 'cancel'); setDeleteTarget(row);
                }} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-semibold text-amber-100 hover:bg-amber-300/10 disabled:opacity-50">
                  {row.cancelled_at ? 'Reactivar sesión' : 'Anular sesión'}</button>
              </div>
            </details> : null}
          </div>)}
        </div>
      </section> : null}

      {deleteTarget ? <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="planned-delete-title"
          className="w-full max-w-md rounded-2xl border border-red-300/25 bg-[#0b1a2d] p-5 shadow-2xl">
          <h3 id="planned-delete-title" className="text-lg font-black text-white">
            {lifecycleAction === 'retire' ? '¿Eliminar esta sesión?'
              : lifecycleAction === 'cancel' ? '¿Anular esta sesión?' : '¿Reactivar esta sesión?'}</h3>
          <p className="mt-2 font-semibold text-white">{deleteTarget.planning_state === 'confirmed'
            ? `Sesión nº ${deleteTarget.session_number}` : 'Borrador de sesión'}</p>
          <p className="mt-1 text-sm text-slate-300">{formatDate(deleteTarget.session_date)}
            {deleteTarget.starts_at ? ` · ${String(deleteTarget.starts_at).slice(0, 5)}` : ''}</p>
          <p className="mt-4 text-sm text-slate-200">{lifecycleAction === 'retire'
            ? 'La sesión dejará de aparecer en Sesiones y Calendario, pero se conservará internamente para mantener el historial.'
            : lifecycleAction === 'cancel'
              ? 'La sesión seguirá visible como ANULADA y no contará como entrenamiento activo.'
              : 'La sesión volverá a contar como entrenamiento activo, sin crear otro registro.'}</p>
          {lifecycleAction !== 'reactivate' ? <label className="mt-3 block text-xs text-slate-300">Motivo opcional
            <textarea value={retirementReason} onChange={(event) => setRetirementReason(event.target.value)}
              maxLength={1000} rows={2} className={`${input} mt-1`} />
          </label> : null}
          {!SESSION_RETIREMENT_BACKEND_VERIFIED ? <p role="status" className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">
            Acción pendiente: instala y verifica la migración antes de habilitarla. No se guardará ningún cambio.</p> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" autoFocus disabled={busy} onClick={() => setDeleteTarget(null)}
              className={`${button} border border-white/20 text-white`}>Cancelar</button>
            <button type="button" onClick={performLifecycle}
              disabled={!SESSION_RETIREMENT_BACKEND_VERIFIED || busy || !canWriteContext}
              className={`${button} ${lifecycleAction === 'retire' ? 'bg-red-700' : 'bg-amber-700'} text-white`}>
              {busy ? 'Procesando…' : lifecycleAction === 'retire' ? 'Eliminar sesión'
                : lifecycleAction === 'cancel' ? 'Anular sesión' : 'Reactivar sesión'}</button>
          </div>
        </section>
      </div> : null}

      {editor && selected ? <section className="space-y-3" aria-label="Ficha de sesión">
        <div className={`${panel} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-caudal-electric">Editor de plantilla</p>
            <h3 className="text-lg font-bold text-white">{editor.id
              ? editor.planning_state === 'confirmed' ? `Sesión nº ${editor.session_number ?? '—'}` : 'Borrador de sesión'
              : 'Nueva sesión'}</h3>
            {editor.cancelled_at ? <span className="text-xs font-black text-amber-200">ANULADA</span> : null}
            <p className="text-xs text-slate-400">{selected.team_name} · {selected.label} ·
              {editor.id ? ` Revisión ${editor.revision}` : ' Se creará al guardar'} ·
              {getPlannedDuration(editor.slots)} min</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? <button type="button" className={`${button} bg-caudal-electric text-slate-950`}
              onClick={save} disabled={busy || !dirty || conflict || creationUncertain || dateNeedsReconciliation}>
              {busy ? 'Procesando…' : 'Guardar cambios'}</button> : null}
            {canEdit && editor.id && editor.planning_state === 'draft' ?
              <button type="button" className={`${button} border border-caudal-electric/50 text-caudal-electric`}
                onClick={confirm} disabled={busy || dirty || conflict || creationUncertain}>Confirmar y numerar</button> : null}
            {editor.id ? <button type="button" className={`${button} border border-white/15 text-slate-200`}
              onClick={() => { if (requestDiscard()) openSession(editor.id, true); }} disabled={busy}>Recargar</button> : null}
            <button type="button" className={`${button} border border-white/15 text-slate-200`}
              onClick={() => { if (requestDiscard()) { setEditor(null); setBaseline(null); setDistribution(null); setDistributionBaseline(null); setSpecificPositions([]); setBoardsError(''); setSessionValue(''); setBaselineSessionValue(''); setValueSupported(false); materialStateRef.current = null; setMaterialState(null); setMaterialBaseline(null); setConflict(false); setCreationUncertain(false); setValidationIssues([]); setExpandedSlotId(null); } }}
              disabled={busy}>Cerrar plantilla</button>
          </div>
          {dirty ? <p className="w-full text-xs text-amber-200">Cambios sin guardar. Guarda antes de confirmar.</p> : null}
          {distributionDirty && editorDirty ? <p className="w-full text-xs text-amber-200">Los ejercicios y las pizarras se guardarán en orden con «Guardar cambios».</p> : null}
          {pendingEmptyFormation ?
            <p className="w-full text-xs text-amber-200">El cambio de sistema vacío sigue pendiente. La RPC actual solo permite guardarlo cuando la plantilla de esta sesión está congelada; las zonas sí pueden guardarse por separado.</p> : null}
          {fieldDirty ? <p className="w-full text-xs text-amber-200">Dimensiones del campo pendientes de guardar.</p> : null}
          {exerciseDimensionsDirty ? <p className="w-full text-xs text-amber-200">Medidas de ejercicios pendientes de guardar.</p> : null}
          {v12ProbeError ? <p className="w-full text-xs text-red-200" role="alert">{v12ProbeError}. Recarga la página antes de guardar pizarras.</p> : null}
          {dateNeedsReconciliation && canEdit ? <button type="button" className={`${button} border border-amber-400/50 text-amber-200`}
            onClick={reconcileDate} disabled={busy || conflict || creationUncertain}>Confirmar cambio de fecha y conciliar plantilla</button> : null}
          {creationUncertain ? <p className="w-full text-xs text-amber-200">Guardado bloqueado: comprueba la sesión en la lista y recárgala antes de continuar.</p> : null}
          {unsupportedItems ? <p className="w-full text-xs text-amber-200">Esta sesión contiene un tipo de tarea o snapshot incompatible, o más de dos tareas en un ejercicio. Se muestra sin edición para preservar sus datos.</p> : null}
        </div>
        {playersError ? <p role="alert" className="rounded-xl border border-red-400/30 p-3 text-sm text-red-100">{playersError} Recarga la sesión; no se habilitarán operaciones de jugadores con datos incompletos.</p> : null}
        {boardsError ? <p role="alert" className="rounded-xl border border-red-400/30 p-3 text-sm text-red-100">{boardsError} La edición de pizarras está deshabilitada; la sesión y sus ejercicios siguen disponibles.</p> : null}
        {suggestionsError ? <p role="status" className="text-xs text-amber-200">{suggestionsError} Los campos Lugar y Rival siguen siendo editables.</p> : null}
        {!mcV4Supported ? <p role="status" className="text-xs text-amber-200">MC manual pendiente de instalar y verificar. MD sigue editable.</p> : null}
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
          {availabilityDirty ? <p>La disponibilidad visible se guardará con «Guardar cambios».</p> : null}
        </div> : null}
        <PlannedSessionDocument editor={editor} selected={selected} canEdit={canEdit} busy={busy}
          seriesSupported={seriesSupported}
          mcEnabled={mcV4Supported} mcNumber={mcNumber} printedMcNumber={mcBaseline}
          mcOptions={mcOptions} onMcChange={setMcNumber}
          locationOptions={locationOptions} opponentOptions={opponentOptions} suggestionsError={suggestionsError}
          distribution={distribution || emptyDistribution()} boardsError={boardsError}
          fieldDimensions={fieldDimensions} printedFieldDimensions={fieldBaseline}
          printedSpaceDistribution={distributionBaseline || emptyDistribution()}
          boardV11Enabled={BOARD_V11_ENABLED}
          exerciseDimensionsSupported={v12Supported}
          exerciseDimensions={exerciseDimensions} printedExerciseDimensions={exerciseDimensionsBaseline}
          onExerciseDimensionChange={changeExerciseDimension} exerciseDimensionIssue={exerciseDimensionIssue}
          onFieldDimensionsChange={changeFieldDimensions} onZoneMetresChange={changeZoneMetres}
          onFixBoardDefault={fixBoardDefault} playerDefaultBlockReason={playerDefaultBlockReason}
          fieldDefaultBlockReason={fieldDefaultBlockReason}
          positionById={specificPositionMap(distribution?.specific_positions_snapshot?.length
            ? distribution.specific_positions_snapshot : specificPositions)}
          onFormationChange={changeFormation} onZoneChange={changeZone}
          onPlayerMove={movePlayer} printedPlayerDistribution={distributionBaseline || emptyDistribution()}
          leagueLogoUrl={safeLeagueLogoUrl}
          sessionValue={sessionValue} printedSessionValue={baselineSessionValue}
          valueSupported={valueSupported} onValueChange={setSessionValue}
          materialAutofillEnabled={Boolean(materialState)} materialAvailable={materialSupported}
          onMaterialChange={updateMaterial} onEnableMaterialAutofill={enableMaterialAutofill}
          manualMaterial={materialState?.manual || []} onPinMaterialManually={pinMaterialManually}
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
      {batchPrint ? <PlannedSessionBatchPrint sessions={batchPrint.sessions}
        selected={batchPrint.selected} leagueLogoUrl={safeLeagueLogoUrl} printRef={batchPrintRef} /> : null}
    </main>
  );
}
