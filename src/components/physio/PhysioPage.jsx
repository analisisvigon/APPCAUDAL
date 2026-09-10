import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  createTreatment,
  getPlayerPhysioSummary,
  listTodayTreatments,
  listTreatmentHistory,
  listTreatmentsRange,
  updateTreatment,
} from '../../data/physioStore';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import { formatPlayerNumberName } from '../../utils/playerNumberPresentation';
import {
  PHYSIO_AVAILABILITY,
  PHYSIO_AVAILABILITY_LABELS,
  PHYSIO_BODY_AREAS,
  PHYSIO_BODY_AREA_LABELS,
  PHYSIO_CASE_TYPES,
  PHYSIO_CASE_TYPE_LABELS,
  PHYSIO_TREATMENT_TYPES,
  PHYSIO_TREATMENT_TYPE_LABELS,
  buildEmptyPhysioDraft,
  buildPhysioDraftFromTreatment,
  formatPhysioDate,
  formatPhysioTime,
  getPhysioAvailabilityTone,
  getPhysioKpis,
  getPhysioLocalToday,
  getPhysioWeekRange,
  normalizeBodyAreaCounts,
  validatePhysioDraft,
} from '../../utils/physioPresentation';

const PAGE_SIZE = 50;
const CARD = 'rounded-[1.35rem] border border-white/10 bg-[#091428]/[0.88] shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
const INPUT = 'min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.065] px-3 py-2 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-caudal-electric focus:ring-2 focus:ring-caudal-electric/15 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.065] px-3 py-2 text-xs font-black text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45';
const PRIMARY_BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-[#7aacff] disabled:cursor-not-allowed disabled:opacity-50';
const EMPTY_FILTERS = Object.freeze({ playerId: '', dateFrom: '', dateTo: '', bodyArea: '', caseType: '', availabilityStatus: '', performedByName: '' });

const playerLabel = (player) => formatPlayerNumberName(player?.number, getPlayerDisplayName(player));

const treatmentPlayer = (treatment, players) => treatment?.player
  || players.find((player) => String(player.id) === String(treatment?.player_id))
  || { name: 'Jugador' };

function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`block space-y-2 text-sm font-bold text-slate-200 ${className}`}>
      <span>{label}</span>
      {children}
      {hint ? <span className="block text-xs font-medium leading-4 text-slate-500">{hint}</span> : null}
      {error ? <span role="alert" className="block text-xs font-bold text-red-200">{error}</span> : null}
    </label>
  );
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.07em] ${getPhysioAvailabilityTone(status)}`}>{PHYSIO_AVAILABILITY_LABELS[status] || status}</span>;
}

function TreatmentTypes({ values = [] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((type) => <span key={type} className="rounded-full bg-white/[0.065] px-2 py-1 text-[10px] font-bold text-slate-300">{PHYSIO_TREATMENT_TYPE_LABELS[type] || type}</span>)}
    </span>
  );
}

function TreatmentCard({ treatment, players, onEdit, showDate = false }) {
  const player = treatmentPlayer(treatment, players);
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{playerLabel(player)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">{PHYSIO_BODY_AREA_LABELS[treatment.body_area]} · {treatment.reason}</p>
        </div>
        <StatusBadge status={treatment.availability_status} />
      </div>
      <div className="mt-3"><TreatmentTypes values={treatment.treatment_types} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
        {showDate ? <span>{formatPhysioDate(treatment.treatment_date)}</span> : null}
        {!showDate && formatPhysioTime(treatment.created_at) ? <span>{formatPhysioTime(treatment.created_at)}</span> : null}
        <span>{PHYSIO_CASE_TYPE_LABELS[treatment.case_type]}</span>
        {treatment.duration_minutes ? <span>{treatment.duration_minutes} min</span> : null}
        <span>{treatment.performed_by_name_snapshot || 'Staff'}</span>
      </div>
      {treatment.notes ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{treatment.notes}</p> : null}
      <button type="button" onClick={() => onEdit(treatment)} className={`${SECONDARY_BUTTON} mt-3 w-full sm:w-auto`}>Editar</button>
    </article>
  );
}

function BlockState({ status, error, empty, emptyText, onRetry, children }) {
  if (status === 'loading') return <div role="status" className="h-28 animate-pulse rounded-2xl bg-white/[0.045]" />;
  if (status === 'error') return <div className="rounded-2xl border border-red-300/15 bg-red-400/[0.07] p-4"><p role="alert" className="text-sm font-bold text-red-100">{error}</p><button type="button" onClick={onRetry} className={`${SECONDARY_BUTTON} mt-3`}>Reintentar</button></div>;
  if (empty) return <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm font-bold text-slate-500">{emptyText}</p>;
  return children;
}

function TreatmentModal({ treatment, players, staffDisplayName, saving, saveError, onClose, onSave }) {
  const [draft, setDraft] = useState(() => treatment ? buildPhysioDraftFromTreatment(treatment) : buildEmptyPhysioDraft());
  const [errors, setErrors] = useState({});
  const closeRef = useRef(null);
  const playerOptions = treatment?.player && !players.some((player) => String(player.id) === String(treatment.player.id))
    ? [treatment.player, ...players]
    : players;

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const setField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };
  const toggleTreatment = (type) => setField('treatmentTypes', draft.treatmentTypes.includes(type)
    ? draft.treatmentTypes.filter((value) => value !== type)
    : [...draft.treatmentTypes, type]);
  const submit = (event) => {
    event.preventDefault();
    const validation = validatePhysioDraft(draft);
    if (!validation.valid) return setErrors(validation.errors);
    return onSave(draft);
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="physio-modal-title" className="mobile-form-controls max-h-[calc(100dvh-0.75rem)] w-full overflow-y-auto overscroll-contain rounded-t-[1.6rem] border border-white/10 bg-[#071225] shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-[1.6rem]">
        <header className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-white/10 bg-[#071225]/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Fisio</p><h2 id="physio-modal-title" className="mt-1 text-xl font-black text-white">{treatment ? 'Editar tratamiento' : 'Registrar tratamiento'}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl font-black text-slate-200 hover:bg-white/15 disabled:opacity-40">×</button>
        </header>
        <form onSubmit={submit} className="space-y-5 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha" error={errors.treatmentDate}><input required type="date" value={draft.treatmentDate} onChange={(event) => setField('treatmentDate', event.target.value)} className={INPUT} /></Field>
            <Field label="Jugador" error={errors.playerId}>
              <select required value={draft.playerId} onChange={(event) => setField('playerId', event.target.value)} className={INPUT}><option value="">Seleccionar jugador</option>{playerOptions.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select>
            </Field>
            <Field label="Zona corporal" error={errors.bodyArea}><select required value={draft.bodyArea} onChange={(event) => setField('bodyArea', event.target.value)} className={INPUT}><option value="">Seleccionar zona</option>{PHYSIO_BODY_AREAS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Fisio que lo realiza" hint="Se identifica automáticamente con la sesión STAFF."><input readOnly value={staffDisplayName || 'Staff autenticado'} className={`${INPUT} cursor-default`} /></Field>
          </div>
          <Field label="Molestia / motivo" error={errors.reason} hint="Descripción breve; no es un diagnóstico médico."><input required maxLength={200} value={draft.reason} onChange={(event) => setField('reason', event.target.value)} className={INPUT} placeholder="Ej. sobrecarga isquios" /></Field>
          <fieldset>
            <legend className="text-sm font-bold text-slate-200">Tipo de tratamiento</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{PHYSIO_TREATMENT_TYPES.map(([value, label]) => { const checked = draft.treatmentTypes.includes(value); return <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold ${checked ? 'border-caudal-electric/35 bg-caudal-electric/10 text-white' : 'border-white/10 bg-white/[0.035] text-slate-300'}`}><input type="checkbox" checked={checked} onChange={() => toggleTreatment(value)} className="h-5 w-5 shrink-0 accent-caudal-electric" /><span>{label}</span></label>; })}</div>
            {errors.treatmentTypes ? <p role="alert" className="mt-2 text-xs font-bold text-red-200">{errors.treatmentTypes}</p> : null}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de caso" error={errors.caseType}><select value={draft.caseType} onChange={(event) => setField('caseType', event.target.value)} className={INPUT}>{PHYSIO_CASE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Disponibilidad deportiva" error={errors.availabilityStatus}><select value={draft.availabilityStatus} onChange={(event) => setField('availabilityStatus', event.target.value)} className={INPUT}>{PHYSIO_AVAILABILITY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Duración aproximada" error={errors.durationMinutes} hint="Opcional, en minutos."><input type="number" min="1" step="1" inputMode="numeric" value={draft.durationMinutes} onChange={(event) => setField('durationMinutes', event.target.value)} className={INPUT} placeholder="Ej. 25" /></Field>
            <Field label="Observaciones" error={errors.notes}><textarea maxLength={1000} rows={3} value={draft.notes} onChange={(event) => setField('notes', event.target.value)} className={`${INPUT} resize-y`} placeholder="Opcional" /></Field>
          </div>
          {saveError ? <p role="alert" className="rounded-xl border border-red-300/15 bg-red-400/[0.07] p-3 text-sm font-bold text-red-100">{saveError}</p> : null}
          <footer className="app-safe-area-footer sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-white/10 bg-[#071225]/95 px-4 pt-3 backdrop-blur sm:static sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6 sm:pt-4">
            <button type="button" onClick={onClose} disabled={saving} className={SECONDARY_BUTTON}>Cancelar</button>
            <button type="submit" disabled={saving || !players.length} className={PRIMARY_BUTTON}>{saving ? 'Guardando…' : treatment ? 'Guardar cambios' : 'Registrar tratamiento'}</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}

export default function PhysioPage({ client, players = [], staffDisplayName = '' }) {
  const today = useMemo(() => getPhysioLocalToday(), []);
  const week = useMemo(() => getPhysioWeekRange(today), [today]);
  const orderedPlayers = useMemo(() => [...players].sort((left, right) => playerLabel(left).localeCompare(playerLabel(right), 'es')), [players]);
  const [dashboardState, setDashboardState] = useState({ status: 'loading', todayRows: [], weekRows: [], summaryRows: [], error: '' });
  const [historyState, setHistoryState] = useState({ status: 'loading', rows: [], hasMore: false, error: '' });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [refreshToken, setRefreshToken] = useState(0);
  const [historyToken, setHistoryToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modalTreatment, setModalTreatment] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const dashboardRequest = useRef(0);
  const historyRequest = useRef(0);

  useEffect(() => {
    const requestId = ++dashboardRequest.current;
    setDashboardState((current) => ({ ...current, status: 'loading', error: '' }));
    Promise.all([
      listTodayTreatments(client, today),
      listTreatmentsRange(client, week.startDate, week.endDate),
      getPlayerPhysioSummary(client),
    ]).then(([todayRows, weekRows, summaryRows]) => {
      if (requestId !== dashboardRequest.current) return;
      setDashboardState({ status: 'ready', todayRows, weekRows, summaryRows, error: '' });
    }).catch((error) => {
      if (requestId !== dashboardRequest.current) return;
      console.error('[PHYSIO_DASHBOARD_LOAD_ERROR]', error);
      setDashboardState({ status: 'error', todayRows: [], weekRows: [], summaryRows: [], error: 'No se han podido cargar los datos de Fisio.' });
    });
  }, [client, refreshToken, today, week.endDate, week.startDate]);

  useEffect(() => {
    const requestId = ++historyRequest.current;
    setHistoryState({ status: 'loading', rows: [], hasMore: false, error: '' });
    listTreatmentHistory(client, appliedFilters, { limit: PAGE_SIZE, offset: 0 }).then((rows) => {
      if (requestId !== historyRequest.current) return;
      setHistoryState({ status: 'ready', rows, hasMore: rows.length === PAGE_SIZE, error: '' });
    }).catch((error) => {
      if (requestId !== historyRequest.current) return;
      console.error('[PHYSIO_HISTORY_LOAD_ERROR]', error);
      setHistoryState({ status: 'error', rows: [], hasMore: false, error: 'No se ha podido cargar el histórico.' });
    });
  }, [appliedFilters, client, historyToken, refreshToken]);

  const kpis = getPhysioKpis(dashboardState.todayRows, dashboardState.weekRows);
  const summaryRows = useMemo(() => {
    const byPlayer = new Map(dashboardState.summaryRows.map((row) => [String(row.player_id), row]));
    orderedPlayers.forEach((player) => {
      const key = String(player.id);
      if (!byPlayer.has(key)) byPlayer.set(key, { player_id: player.id, player_name: player.name, player_shirt_name: player.shirtName || player.shirt_name, player_number: player.number, total_treatments: 0, total_treatment_days: 0, last_treatment_date: null, body_area_counts: [], new_count: 0, follow_up_count: 0 });
    });
    return [...byPlayer.values()].sort((left, right) => Number(right.total_treatments) - Number(left.total_treatments) || String(left.player_shirt_name || left.player_name).localeCompare(String(right.player_shirt_name || right.player_name), 'es'));
  }, [dashboardState.summaryRows, orderedPlayers]);
  const physioNames = useMemo(() => [...new Set([...dashboardState.weekRows, ...historyState.rows].map((row) => row.performed_by_name_snapshot).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [dashboardState.weekRows, historyState.rows]);

  const retryAll = () => { setRefreshToken((value) => value + 1); setHistoryToken((value) => value + 1); };
  const openCreate = () => { setSaveError(''); setModalTreatment(null); };
  const openEdit = (treatment) => { setSaveError(''); setModalTreatment(treatment); };
  const closeModal = () => { if (!saving) { setModalTreatment(undefined); setSaveError(''); } };
  const saveTreatment = async (draft) => {
    setSaving(true);
    setSaveError('');
    try {
      if (modalTreatment?.id) await updateTreatment(client, modalTreatment.id, draft);
      else await createTreatment(client, draft);
      setModalTreatment(undefined);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      console.error('[PHYSIO_SAVE_ERROR]', error);
      setSaveError(modalTreatment?.id ? 'No se han podido guardar los cambios.' : 'No se ha podido registrar el tratamiento.');
    } finally {
      setSaving(false);
    }
  };
  const applyFilters = (event) => { event.preventDefault(); setAppliedFilters({ ...filters }); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); };
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const rows = await listTreatmentHistory(client, appliedFilters, { limit: PAGE_SIZE, offset: historyState.rows.length });
      setHistoryState((current) => ({ ...current, rows: [...current.rows, ...rows], hasMore: rows.length === PAGE_SIZE }));
    } catch (error) {
      console.error('[PHYSIO_HISTORY_MORE_ERROR]', error);
      setHistoryState((current) => ({ ...current, error: 'No se han podido cargar más tratamientos.' }));
    } finally { setLoadingMore(false); }
  };

  return (
    <main className="space-y-4 pb-8 sm:space-y-5">
      <section className={`${CARD} overflow-hidden p-4 sm:p-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">STAFF · Registro descriptivo</p><h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Fisio</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Registro diario de molestias y tratamientos. La información introducida no constituye diagnóstico ni recomendación clínica.</p></div>
          <button type="button" onClick={openCreate} disabled={!orderedPlayers.length} className={`${PRIMARY_BUTTON} min-h-12 shrink-0 px-5`}>Registrar tratamiento</button>
        </div>
        {!orderedPlayers.length ? <p role="alert" className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] p-3 text-sm font-bold text-amber-100">No hay jugadores activos disponibles en la plantilla.</p> : null}
      </section>

      <BlockState status={dashboardState.status} error={dashboardState.error} onRetry={retryAll}>
        <section aria-label="Métricas de Fisio" className="grid grid-cols-2 gap-2 lg:grid-cols-4 sm:gap-3">
          {[
            ['Tratamientos hoy', kpis.treatmentsToday], ['Jugadores hoy', kpis.playersToday],
            ['Tratamientos esta semana', kpis.treatmentsWeek], ['Jugadores esta semana', kpis.playersWeek],
          ].map(([label, value]) => <article key={label} className={`${CARD} min-w-0 p-3.5 sm:p-4`}><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black tabular-nums text-white">{value}</p></article>)}
        </section>
      </BlockState>

      <section aria-labelledby="physio-today-title" className={`${CARD} p-4 sm:p-5`}>
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 id="physio-today-title" className="text-sm font-black uppercase tracking-[0.14em] text-white">Tratamientos de hoy</h2><p className="mt-1 text-xs text-slate-500">{formatPhysioDate(today)} · más recientes primero</p></div><span className="rounded-full bg-white/[0.065] px-3 py-1 text-xs font-black text-slate-300">{dashboardState.todayRows.length}</span></div>
        <BlockState status={dashboardState.status} error={dashboardState.error} empty={dashboardState.status === 'ready' && !dashboardState.todayRows.length} emptyText="Todavía no hay tratamientos registrados hoy." onRetry={retryAll}>
          <div className="grid gap-2 lg:grid-cols-2">{dashboardState.todayRows.map((row) => <TreatmentCard key={row.id} treatment={row} players={orderedPlayers} onEdit={openEdit} />)}</div>
        </BlockState>
      </section>

      <section aria-labelledby="physio-history-title" className={`${CARD} overflow-hidden`}>
        <div className="border-b border-white/10 p-4 sm:p-5"><h2 id="physio-history-title" className="text-sm font-black uppercase tracking-[0.14em] text-white">Histórico</h2><p className="mt-1 text-xs text-slate-500">Filtros y carga progresiva · {PAGE_SIZE} registros por página</p>
          <form onSubmit={applyFilters} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select aria-label="Filtrar por jugador" value={filters.playerId} onChange={(event) => setFilters((current) => ({ ...current, playerId: event.target.value }))} className={INPUT}><option value="">Todos los jugadores</option>{orderedPlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select>
            <input aria-label="Fecha desde" type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} className={INPUT} />
            <input aria-label="Fecha hasta" type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} className={INPUT} />
            <select aria-label="Filtrar por zona" value={filters.bodyArea} onChange={(event) => setFilters((current) => ({ ...current, bodyArea: event.target.value }))} className={INPUT}><option value="">Todas las zonas</option>{PHYSIO_BODY_AREAS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="Filtrar por tipo de caso" value={filters.caseType} onChange={(event) => setFilters((current) => ({ ...current, caseType: event.target.value }))} className={INPUT}><option value="">Nueva y seguimiento</option>{PHYSIO_CASE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="Filtrar por disponibilidad" value={filters.availabilityStatus} onChange={(event) => setFilters((current) => ({ ...current, availabilityStatus: event.target.value }))} className={INPUT}><option value="">Toda disponibilidad</option>{PHYSIO_AVAILABILITY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="Filtrar por fisio" value={filters.performedByName} onChange={(event) => setFilters((current) => ({ ...current, performedByName: event.target.value }))} className={INPUT}><option value="">Todo el staff</option>{physioNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>
            <div className="grid grid-cols-2 gap-2"><button type="submit" className={PRIMARY_BUTTON}>Aplicar</button><button type="button" onClick={clearFilters} className={SECONDARY_BUTTON}>Limpiar</button></div>
          </form>
        </div>
        <div className="p-3 sm:p-4">
          <BlockState status={historyState.status} error={historyState.error} empty={historyState.status === 'ready' && !historyState.rows.length} emptyText="No hay tratamientos para estos filtros." onRetry={() => setHistoryToken((value) => value + 1)}>
            {historyState.error ? <p role="alert" className="mb-3 rounded-xl border border-red-300/15 bg-red-400/[0.07] p-3 text-sm font-bold text-red-100">{historyState.error}</p> : null}
            <div className="grid gap-2 lg:hidden">{historyState.rows.map((row) => <TreatmentCard key={row.id} treatment={row} players={orderedPlayers} onEdit={openEdit} showDate />)}</div>
            <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1080px] text-left text-xs"><thead className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500"><tr>{['Fecha', 'Jugador', 'Zona / motivo', 'Tratamientos', 'Caso', 'Disponibilidad', 'Fisio', 'Duración', ''].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.055]">{historyState.rows.map((row) => <tr key={row.id}><td className="whitespace-nowrap px-3 py-3 font-bold text-slate-300">{formatPhysioDate(row.treatment_date)}</td><td className="px-3 py-3 font-black text-white">{playerLabel(treatmentPlayer(row, orderedPlayers))}</td><td className="max-w-64 px-3 py-3"><p className="font-bold text-white">{PHYSIO_BODY_AREA_LABELS[row.body_area]}</p><p className="mt-1 line-clamp-2 text-slate-400">{row.reason}</p></td><td className="min-w-52 px-3 py-3"><TreatmentTypes values={row.treatment_types} /></td><td className="px-3 py-3 text-slate-300">{PHYSIO_CASE_TYPE_LABELS[row.case_type]}</td><td className="px-3 py-3"><StatusBadge status={row.availability_status} /></td><td className="px-3 py-3 text-slate-400">{row.performed_by_name_snapshot || 'Staff'}</td><td className="px-3 py-3 text-slate-400">{row.duration_minutes ? `${row.duration_minutes} min` : '—'}</td><td className="px-3 py-3"><button type="button" onClick={() => openEdit(row)} className={SECONDARY_BUTTON}>Editar</button></td></tr>)}</tbody></table></div>
            {historyState.hasMore ? <div className="mt-4 text-center"><button type="button" onClick={loadMore} disabled={loadingMore} className={SECONDARY_BUTTON}>{loadingMore ? 'Cargando…' : 'Cargar más'}</button></div> : null}
          </BlockState>
        </div>
      </section>

      <section aria-labelledby="physio-summary-title" className={`${CARD} p-4 sm:p-5`}>
        <h2 id="physio-summary-title" className="text-sm font-black uppercase tracking-[0.14em] text-white">Resumen por jugador</h2><p className="mt-1 text-xs leading-5 text-slate-500">Conteos descriptivos de la actividad registrada; no representan diagnósticos ni valoración clínica.</p>
        <div className="mt-4"><BlockState status={dashboardState.status} error={dashboardState.error} empty={dashboardState.status === 'ready' && !summaryRows.length} emptyText="No hay jugadores para resumir." onRetry={retryAll}>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{summaryRows.map((row) => { const areaCounts = normalizeBodyAreaCounts(row.body_area_counts); const displayPlayer = { name: row.player_name, shirtName: row.player_shirt_name, number: row.player_number }; return <article key={row.player_id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-black text-white">{playerLabel(displayPlayer)}</p><span className="shrink-0 text-xl font-black tabular-nums text-caudal-electric">{Number(row.total_treatments) || 0}</span></div><dl className="mt-3 grid grid-cols-3 gap-2 border-y border-white/[0.055] py-3 text-center"><div><dt className="text-[9px] font-black uppercase text-slate-600">Tratamientos</dt><dd className="mt-1 text-sm font-black text-white">{Number(row.total_treatments) || 0}</dd></div><div><dt className="text-[9px] font-black uppercase text-slate-600">Días tratados</dt><dd className="mt-1 text-sm font-black text-white">{Number(row.total_treatment_days) || 0}</dd></div><div><dt className="text-[9px] font-black uppercase text-slate-600">Última fecha</dt><dd className="mt-1 text-xs font-black text-white">{formatPhysioDate(row.last_treatment_date)}</dd></div></dl><div className="mt-3 flex gap-3 text-xs font-bold text-slate-400"><span>Nuevas: {Number(row.new_count) || 0}</span><span>Seguimientos: {Number(row.follow_up_count) || 0}</span></div><div className="mt-3"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-600">Zonas más tratadas</p>{areaCounts.length ? <div className="mt-1.5 flex flex-wrap gap-1.5">{areaCounts.slice(0, 3).map((area) => <span key={area.bodyArea} className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-bold text-slate-300">{PHYSIO_BODY_AREA_LABELS[area.bodyArea]} · {area.treatmentCount} {area.treatmentCount === 1 ? 'registro' : 'registros'}</span>)}</div> : <p className="mt-1 text-xs text-slate-600">Sin actividad registrada.</p>}</div></article>; })}</div>
        </BlockState></div>
      </section>

      {modalTreatment !== undefined ? <TreatmentModal key={modalTreatment?.id || 'new'} treatment={modalTreatment} players={orderedPlayers} staffDisplayName={staffDisplayName} saving={saving} saveError={saveError} onClose={closeModal} onSave={saveTreatment} /> : null}
    </main>
  );
}
