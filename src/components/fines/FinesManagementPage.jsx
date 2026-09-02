import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  cancelFine,
  createFineCollective,
  createFineIndividual,
  getFineRulesForManagement,
  getFineSubjectsForManagement,
  getFinesFinancialSummary,
  getFinesManagementList,
  getFinesSubjectSummary,
  recordFinePayment,
  recordFineRefund,
} from '../../data/finesManagementStore';
import {
  FINE_STATUS_FILTERS,
  formatFinesCurrency,
  formatFinesDate,
  formatFinesSeason,
  getFineActionAvailability,
  getFineStatusPresentation,
  getFinesUserMessage,
  getLocalToday,
  getPendingFinesCount,
  sortFineSubjectSummary,
  validateFineAmount,
} from '../../utils/finesPresentation';

const PAGE_SIZE = 50;
const CARD = 'rounded-[1.35rem] border border-white/10 bg-[#091428]/[0.88] shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
const INPUT = 'min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.065] px-3 py-2 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-caudal-electric focus:ring-2 focus:ring-caudal-electric/15 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.065] px-3 py-2 text-xs font-black text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45';
const PRIMARY_BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-[#7aacff] disabled:cursor-not-allowed disabled:opacity-50';

const numberValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function ReceiptIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function ModalShell({ title, eyebrow, onClose, children, busy = false }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="fines-modal-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-[1.6rem] border border-white/10 bg-[#071225] shadow-2xl sm:max-w-2xl sm:rounded-[1.6rem]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#071225]/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">{eyebrow}</p>
            <h2 id="fines-modal-title" className="mt-1 text-xl font-black text-white">{title}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg font-black text-slate-200 hover:bg-white/15 disabled:opacity-40">×</button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className="block space-y-2 text-sm font-bold text-slate-200">
      <span>{label}</span>
      {children}
      {hint ? <span className="block text-[11px] font-medium leading-4 text-slate-500">{hint}</span> : null}
      {error ? <span role="alert" className="block text-xs font-bold text-red-200">{error}</span> : null}
    </label>
  );
}

function StatusBadges({ fine }) {
  const status = getFineStatusPresentation(fine);
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${status.tone}`}>{status.label}</span>
      {fine.is_overdue && fine.lifecycle_status === 'active' ? <span className="inline-flex rounded-full border border-red-300/20 bg-red-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-red-100">Vencida</span> : null}
    </span>
  );
}

function BlockError({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-red-300/15 bg-red-400/[0.07] p-4 text-sm text-red-100">
      <p role="alert" className="font-bold">{message}</p>
      <button type="button" onClick={onRetry} className={`${SECONDARY_BUTTON} mt-3`}>Reintentar</button>
    </div>
  );
}

function KpiCard({ label, value, tone = 'text-white', badge = null }) {
  return (
    <article className={`${CARD} min-w-0 px-4 py-3.5`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
        {badge}
      </div>
      <p className={`mt-1.5 truncate text-xl font-black tabular-nums sm:text-2xl ${tone}`}>{value}</p>
    </article>
  );
}

function KpiLoading() {
  return <div role="status" aria-label="Cargando resumen económico" className="grid animate-pulse grid-cols-2 gap-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className={`${CARD} h-[84px] bg-white/[0.045]`} />)}</div>;
}

function FineActions({ fine, onAction }) {
  const availability = getFineActionAvailability(fine);
  if (fine.lifecycle_status === 'cancelled') return <span className="text-[10px] font-bold text-slate-600">Sin acciones</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {availability.payment ? <button type="button" onClick={() => onAction('payment', fine)} className="rounded-lg bg-caudal-electric/15 px-2.5 py-2 text-[10px] font-black text-caudal-electric hover:bg-caudal-electric/20">Registrar pago</button> : null}
      {availability.refund ? <button type="button" onClick={() => onAction('refund', fine)} className="rounded-lg bg-violet-300/10 px-2.5 py-2 text-[10px] font-black text-violet-200 hover:bg-violet-300/15">Reembolso</button> : null}
      {availability.cancel ? <button type="button" onClick={() => onAction('cancel', fine)} className="rounded-lg bg-white/[0.07] px-2.5 py-2 text-[10px] font-black text-slate-300 hover:bg-white/10">Anular</button> : null}
      {availability.cancelBlockedByCollection ? <button type="button" disabled title="Primero debe resolverse el importe cobrado." className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-[10px] font-black text-slate-600">Anular</button> : null}
    </div>
  );
}

function NewFineModal({ rulesState, subjectsState, onRetryCatalog, onClose, onSubmit, saving }) {
  const [mode, setMode] = useState('individual');
  const [ruleId, setRuleId] = useState('');
  const [subjectIds, setSubjectIds] = useState([]);
  const [occurredOn, setOccurredOn] = useState(getLocalToday());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const availableRules = useMemo(() => rulesState.rows.filter((rule) => mode === 'individual' || rule.collective_allowed), [mode, rulesState.rows]);
  const selectedRule = rulesState.rows.find((rule) => rule.fine_rule_id === ruleId) || null;
  const allSelected = subjectsState.rows.length > 0 && subjectIds.length === subjectsState.rows.length;

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    if (nextMode === 'collective' && selectedRule && !selectedRule.collective_allowed) setRuleId('');
    setSubjectIds([]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!occurredOn || !ruleId) return setError('Selecciona fecha y motivo.');
    if (mode === 'individual' && subjectIds.length !== 1) return setError('Selecciona una persona.');
    if (mode === 'collective' && subjectIds.length < 1) return setError('Selecciona al menos una persona.');
    if (note.length > 500) return setError('La nota no puede superar 500 caracteres.');
    setError('');
    await onSubmit({ mode, ruleId, subjectIds, occurredOn, note: note.trim() || null });
  };

  return (
    <ModalShell title="Nueva multa" eyebrow="Gestión" onClose={onClose} busy={saving}>
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <fieldset>
          <legend className="text-sm font-bold text-slate-200">Tipo</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[['individual', 'Individual'], ['collective', 'Colectiva']].map(([value, label]) => <button key={value} type="button" onClick={() => changeMode(value)} className={`min-h-11 rounded-xl border px-3 text-sm font-black ${mode === value ? 'border-caudal-electric/40 bg-caudal-electric/15 text-caudal-electric' : 'border-white/10 bg-white/[0.045] text-slate-300'}`}>{label}</button>)}
          </div>
        </fieldset>

        {rulesState.status === 'loading' || subjectsState.status === 'loading' ? <div role="status" className="animate-pulse rounded-2xl bg-white/[0.045] p-5 text-sm font-bold text-slate-400">Cargando catálogo y personas…</div> : null}
        {rulesState.status === 'error' || subjectsState.status === 'error' ? <BlockError message="No se han podido preparar las opciones de la multa." onRetry={onRetryCatalog} /> : null}

        {rulesState.status === 'ready' && subjectsState.status === 'ready' ? (
          <>
            <Field label="Fecha de infracción">
              <input type="date" required value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} className={INPUT} />
            </Field>
            <Field label="Motivo">
              <select required value={ruleId} onChange={(event) => setRuleId(event.target.value)} className={INPUT}>
                <option value="">Seleccionar motivo</option>
                {availableRules.map((rule) => <option key={rule.fine_rule_id} value={rule.fine_rule_id}>{rule.name} · {formatFinesCurrency(rule.default_amount)}</option>)}
              </select>
            </Field>

            {mode === 'individual' ? (
              <Field label="Persona">
                <select required value={subjectIds[0] || ''} onChange={(event) => setSubjectIds(event.target.value ? [event.target.value] : [])} className={INPUT}>
                  <option value="">Seleccionar persona</option>
                  {subjectsState.rows.map((subject) => <option key={subject.subject_id} value={subject.subject_id}>{subject.display_name}</option>)}
                </select>
              </Field>
            ) : (
              <fieldset className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <legend className="text-sm font-bold text-slate-200">Personas</legend>
                  <button type="button" onClick={() => setSubjectIds(allSelected ? [] : subjectsState.rows.map((subject) => subject.subject_id))} className="text-xs font-black text-caudal-electric">{allSelected ? 'Quitar selección' : `Seleccionar todos (${subjectsState.rows.length})`}</button>
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/15 p-2">
                  {subjectsState.rows.map((subject) => {
                    const checked = subjectIds.includes(subject.subject_id);
                    return <label key={subject.subject_id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.05]"><input type="checkbox" checked={checked} onChange={() => setSubjectIds((current) => checked ? current.filter((id) => id !== subject.subject_id) : [...current, subject.subject_id])} className="h-4 w-4 accent-caudal-electric" /><span>{subject.display_name}</span></label>;
                  })}
                </div>
                <p className="text-xs font-bold text-slate-400">{subjectIds.length} personas seleccionadas{selectedRule ? ` · ${formatFinesCurrency(selectedRule.default_amount)} por persona · Total orientativo ${formatFinesCurrency(numberValue(selectedRule.default_amount) * subjectIds.length)}` : ''}</p>
              </fieldset>
            )}

            <Field label="Nota" hint="Esta nota será visible para el jugador.">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} className={`${INPUT} resize-y`} placeholder="Opcional" />
              <span className="block text-right text-[10px] font-bold text-slate-600">{note.length}/500</span>
            </Field>
          </>
        ) : null}
        {error ? <p role="alert" className="rounded-xl bg-red-400/10 p-3 text-sm font-bold text-red-100">{error}</p> : null}
        <footer className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className={SECONDARY_BUTTON}>Cancelar</button>
          <button type="submit" disabled={saving || rulesState.status !== 'ready' || subjectsState.status !== 'ready'} className={PRIMARY_BUTTON}>{saving ? 'Creando…' : mode === 'collective' && subjectIds.length ? `Crear ${subjectIds.length} multas` : 'Crear multa'}</button>
        </footer>
      </form>
    </ModalShell>
  );
}

function FinancialActionModal({ kind, fine, onClose, onSubmit, saving }) {
  const isPayment = kind === 'payment';
  const isRefund = kind === 'refund';
  const [amount, setAmount] = useState(isPayment ? String(numberValue(fine.pending_amount)) : '');
  const [date, setDate] = useState(getLocalToday());
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const title = isPayment ? 'Registrar pago' : isRefund ? 'Registrar reembolso' : 'Anular multa';

  const submit = async (event) => {
    event.preventDefault();
    if (kind === 'cancel') {
      if (!reason.trim()) return setError('Indica el motivo de la anulación.');
      if (reason.length > 500) return setError('El motivo no puede superar 500 caracteres.');
      return onSubmit({ reason: reason.trim() });
    }
    const validation = validateFineAmount(amount, isPayment ? fine.pending_amount : fine.collected_amount);
    if (!validation.valid) return setError(validation.message);
    if (!date) return setError('Selecciona una fecha.');
    if (note.length > 500) return setError('La nota no puede superar 500 caracteres.');
    setError('');
    return onSubmit({ amount: validation.amount, date, note: note.trim() || null });
  };

  return (
    <ModalShell title={title} eyebrow={`${fine.subject_name} · ${fine.rule_name}`} onClose={onClose} busy={saving}>
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
          <div><p className="text-[9px] font-black uppercase text-slate-500">Persona</p><p className="mt-1 text-sm font-black text-white">{fine.subject_name}</p></div>
          <div><p className="text-[9px] font-black uppercase text-slate-500">Motivo</p><p className="mt-1 text-sm font-black text-white">{fine.rule_name}</p></div>
          <div><p className="text-[9px] font-black uppercase text-slate-500">Cobrado</p><p className="mt-1 text-sm font-black text-emerald-200">{formatFinesCurrency(fine.collected_amount)}</p></div>
          <div><p className="text-[9px] font-black uppercase text-slate-500">Pendiente</p><p className="mt-1 text-sm font-black text-amber-100">{formatFinesCurrency(fine.pending_amount)}</p></div>
        </div>

        {kind === 'cancel' ? (
          <>
            <Field label="Motivo de anulación" hint="La multa dejará de computar como deuda activa.">
              <textarea required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} className={`${INPUT} resize-y`} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Importe">
              <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={INPUT} placeholder="0,00" />
            </Field>
            <Field label={isPayment ? 'Fecha del pago' : 'Fecha del reembolso'}>
              <input required type="date" max={getLocalToday()} value={date} onChange={(event) => setDate(event.target.value)} className={INPUT} />
            </Field>
            <Field label="Nota">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} className={`${INPUT} resize-y`} placeholder="Opcional" />
            </Field>
            {isPayment && fine.is_overdue ? <p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.07] p-3 text-xs font-semibold leading-5 text-amber-100">Al registrar el pago se aplicará el recargo correspondiente si procede. El backend actualizará el importe definitivo.</p> : null}
          </>
        )}
        {error ? <p role="alert" className="rounded-xl bg-red-400/10 p-3 text-sm font-bold text-red-100">{error}</p> : null}
        <footer className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className={SECONDARY_BUTTON}>Volver</button>
          <button type="submit" disabled={saving} className={kind === 'cancel' ? `${PRIMARY_BUTTON} bg-red-300 text-red-950 hover:bg-red-200` : PRIMARY_BUTTON}>{saving ? 'Guardando…' : isPayment ? 'Registrar pago' : isRefund ? 'Registrar reembolso' : 'Anular multa'}</button>
        </footer>
      </form>
    </ModalShell>
  );
}

export default function FinesManagementPage({ client }) {
  const [summaryState, setSummaryState] = useState({ status: 'loading', data: null, error: '' });
  const [listState, setListState] = useState({ status: 'loading', rows: [], error: '', hasMore: false });
  const [subjectSummaryState, setSubjectSummaryState] = useState({ status: 'loading', rows: [], error: '' });
  const [rulesState, setRulesState] = useState({ status: 'idle', rows: [], error: '' });
  const [subjectsState, setSubjectsState] = useState({ status: 'idle', rows: [], error: '' });
  const [statusFilter, setStatusFilter] = useState('all');
  const [seasonCode, setSeasonCode] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [toast, setToast] = useState('');
  const requestRef = useRef(0);

  const refreshFinesData = () => setRefreshToken((current) => current + 1);

  useEffect(() => {
    const requestId = ++requestRef.current;
    let cancelled = false;
    const load = async () => {
      setSummaryState((current) => ({ ...current, status: 'loading', error: '' }));
      setListState((current) => ({ ...current, status: 'loading', error: '' }));
      setSubjectSummaryState((current) => ({ ...current, status: 'loading', error: '' }));
      let summary;
      try {
        summary = await getFinesFinancialSummary(client, seasonCode);
        if (cancelled || requestId !== requestRef.current) return;
        if (!summary?.season_code) throw new Error('Missing season');
        setSeasonCode(summary.season_code);
        setSummaryState({ status: 'ready', data: summary, error: '' });
      } catch (error) {
        if (cancelled || requestId !== requestRef.current) return;
        console.error('[FINES_SUMMARY_LOAD_ERROR]', error);
        setSummaryState({ status: 'error', data: null, error: getFinesUserMessage('financialSummary') });
        setListState({ status: 'error', rows: [], error: getFinesUserMessage('list'), hasMore: false });
        setSubjectSummaryState({ status: 'error', rows: [], error: getFinesUserMessage('subjectSummary') });
        return;
      }
      const resolvedSeason = summary.season_code;
      const [listResult, subjectResult] = await Promise.allSettled([
        getFinesManagementList(client, { status: statusFilter, limit: PAGE_SIZE, offset: 0, seasonCode: resolvedSeason }),
        getFinesSubjectSummary(client, resolvedSeason),
      ]);
      if (cancelled || requestId !== requestRef.current) return;
      if (listResult.status === 'fulfilled') setListState({ status: 'ready', rows: listResult.value, error: '', hasMore: listResult.value.length === PAGE_SIZE });
      else {
        console.error('[FINES_LIST_LOAD_ERROR]', listResult.reason);
        setListState({ status: 'error', rows: [], error: getFinesUserMessage('list'), hasMore: false });
      }
      if (subjectResult.status === 'fulfilled') setSubjectSummaryState({ status: 'ready', rows: sortFineSubjectSummary(subjectResult.value), error: '' });
      else {
        console.error('[FINES_SUBJECT_SUMMARY_LOAD_ERROR]', subjectResult.reason);
        setSubjectSummaryState({ status: 'error', rows: [], error: getFinesUserMessage('subjectSummary') });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [client, refreshToken, statusFilter]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const loadCatalog = async (force = false) => {
    if (!force && rulesState.status === 'ready' && subjectsState.status === 'ready') return;
    setRulesState((current) => ({ ...current, status: 'loading', error: '' }));
    setSubjectsState((current) => ({ ...current, status: 'loading', error: '' }));
    const [rulesResult, subjectsResult] = await Promise.allSettled([
      getFineRulesForManagement(client),
      getFineSubjectsForManagement(client),
    ]);
    if (rulesResult.status === 'fulfilled') setRulesState({ status: 'ready', rows: rulesResult.value, error: '' });
    else {
      console.error('[FINES_RULES_LOAD_ERROR]', rulesResult.reason);
      setRulesState({ status: 'error', rows: [], error: getFinesUserMessage('rules') });
    }
    if (subjectsResult.status === 'fulfilled') setSubjectsState({ status: 'ready', rows: subjectsResult.value, error: '' });
    else {
      console.error('[FINES_SUBJECTS_LOAD_ERROR]', subjectsResult.reason);
      setSubjectsState({ status: 'error', rows: [], error: getFinesUserMessage('subjects') });
    }
  };

  const openNewFine = () => {
    setMutationError('');
    setModal({ kind: 'create' });
    void loadCatalog();
  };

  const openAction = (kind, fine) => {
    setMutationError('');
    setModal({ kind, fine });
  };

  const runMutation = async (operation, task, successMessage) => {
    setSaving(true);
    setMutationError('');
    try {
      await task();
      setModal(null);
      setToast(successMessage);
      refreshFinesData();
    } catch (error) {
      console.error(`[FINES_${operation.toUpperCase()}_ERROR]`, error);
      setMutationError(getFinesUserMessage(operation));
    } finally {
      setSaving(false);
    }
  };

  const submitNewFine = (draft) => runMutation(
    draft.mode === 'individual' ? 'createIndividual' : 'createCollective',
    () => draft.mode === 'individual'
      ? createFineIndividual(client, { ruleId: draft.ruleId, subjectId: draft.subjectIds[0], occurredOn: draft.occurredOn, note: draft.note })
      : createFineCollective(client, { ruleId: draft.ruleId, subjectIds: draft.subjectIds, occurredOn: draft.occurredOn, note: draft.note }),
    draft.mode === 'individual' ? 'Multa creada correctamente.' : `${draft.subjectIds.length} multas creadas correctamente.`,
  );

  const submitFinancialAction = (payload) => {
    const fine = modal.fine;
    if (modal.kind === 'payment') return runMutation('payment', () => recordFinePayment(client, { fineId: fine.fine_id, amount: payload.amount, paidOn: payload.date, note: payload.note }), 'Pago registrado correctamente.');
    if (modal.kind === 'refund') return runMutation('refund', () => recordFineRefund(client, { fineId: fine.fine_id, amount: payload.amount, paidOn: payload.date, note: payload.note }), 'Reembolso registrado correctamente.');
    return runMutation('cancel', () => cancelFine(client, { fineId: fine.fine_id, reason: payload.reason }), 'Multa anulada correctamente.');
  };

  const loadMore = async () => {
    if (loadingMore || !listState.hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await getFinesManagementList(client, { status: statusFilter, limit: PAGE_SIZE, offset: listState.rows.length, seasonCode });
      setListState((current) => ({ ...current, rows: [...current.rows, ...rows], hasMore: rows.length === PAGE_SIZE }));
    } catch (error) {
      console.error('[FINES_LOAD_MORE_ERROR]', error);
      setToast('No se han podido cargar más multas.');
    } finally {
      setLoadingMore(false);
    }
  };

  const summary = summaryState.data || {};
  const pendingCount = getPendingFinesCount(summary);
  const overdueCount = numberValue(summary.overdue_count);
  const pendingSubjects = subjectSummaryState.rows.filter((row) => numberValue(row.pending_total) > 0);
  const maxPending = Math.max(0, ...pendingSubjects.map((row) => numberValue(row.pending_total)));

  return (
    <main className="space-y-4 pb-8 sm:space-y-5">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-caudal-electric"><ReceiptIcon /><p className="text-[10px] font-black uppercase tracking-[0.22em]">Gestión económica</p></div>
          <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Multas</h2>
          <p className="mt-1 text-sm text-slate-400">Control de sanciones y pagos del equipo</p>
        </div>
        <button type="button" onClick={openNewFine} className={`${PRIMARY_BUTTON} min-w-36`}>+ Nueva multa</button>
      </header>

      {toast ? <div role="status" aria-live="polite" className="fixed right-4 top-4 z-[160] max-w-sm rounded-2xl border border-emerald-300/20 bg-emerald-950/95 px-4 py-3 text-sm font-bold text-emerald-100 shadow-2xl">{toast}</div> : null}

      <section aria-labelledby="fines-summary-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 id="fines-summary-title" className="text-sm font-black uppercase tracking-[0.14em] text-white">Resumen económico</h3><p className="mt-1 text-xs text-slate-500">Importes de la temporada seleccionada</p></div>
          <label className="text-xs font-bold text-slate-400">Temporada
            <select value={seasonCode || ''} disabled className="ml-2 min-h-9 rounded-xl border border-white/10 bg-white/[0.06] px-3 font-black text-white disabled:opacity-100">
              <option value={seasonCode || ''}>{formatFinesSeason(seasonCode)}</option>
            </select>
          </label>
        </div>
        {summaryState.status === 'loading' ? <KpiLoading /> : null}
        {summaryState.status === 'error' ? <BlockError message={summaryState.error} onRetry={refreshFinesData} /> : null}
        {summaryState.status === 'ready' ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <KpiCard label="Generado" value={formatFinesCurrency(summary.generated_total)} />
            <KpiCard label="Cobrado" value={formatFinesCurrency(summary.collected_total)} tone="text-emerald-200" />
            <KpiCard label="Pendiente" value={formatFinesCurrency(summary.pending_total)} tone={numberValue(summary.pending_total) > 0 ? 'text-amber-100' : 'text-white'} badge={overdueCount > 0 ? <span className="rounded-full bg-red-400/15 px-2 py-1 text-[8px] font-black uppercase text-red-100">{overdueCount} vencidas</span> : null} />
            <KpiCard label="Multas pendientes" value={String(pendingCount)} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="fines-list-title" className={`${CARD} overflow-hidden`}>
        <div className="border-b border-white/10 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div><h3 id="fines-list-title" className="text-sm font-black uppercase tracking-[0.14em] text-white">Listado y gestión</h3><p className="mt-1 text-xs text-slate-500">Resultados paginados del backend · máximo {PAGE_SIZE} por carga</p></div>
            <div className="flex max-w-full gap-1 overflow-x-auto pb-1" aria-label="Filtrar multas por estado">
              {FINE_STATUS_FILTERS.map((filter) => <button key={filter.value} type="button" onClick={() => setStatusFilter(filter.value)} className={`min-h-9 shrink-0 rounded-xl px-3 text-[10px] font-black ${statusFilter === filter.value ? 'bg-caudal-electric text-slate-950' : 'bg-white/[0.065] text-slate-300 hover:bg-white/10'}`}>{filter.label}</button>)}
            </div>
          </div>
        </div>

        {listState.status === 'loading' ? <div role="status" className="grid animate-pulse gap-2 p-4"><div className="h-14 rounded-xl bg-white/[0.045]" /><div className="h-14 rounded-xl bg-white/[0.045]" /><div className="h-14 rounded-xl bg-white/[0.045]" /></div> : null}
        {listState.status === 'error' ? <div className="p-4"><BlockError message={listState.error} onRetry={refreshFinesData} /></div> : null}
        {listState.status === 'ready' && !listState.rows.length ? (
          <div className="px-5 py-10 text-center"><ReceiptIcon className="mx-auto h-9 w-9 text-slate-600" /><p className="mt-3 text-sm font-black text-slate-200">No hay multas registradas esta temporada.</p><button type="button" onClick={openNewFine} className={`${SECONDARY_BUTTON} mt-4`}>Crear primera multa</button></div>
        ) : null}
        {listState.status === 'ready' && listState.rows.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1120px] text-left text-xs">
                <thead className="bg-black/15 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500"><tr>{['Fecha', 'Persona', 'Motivo', 'Importe', 'Pagado', 'Pendiente', 'Estado', 'Vence', 'Acciones'].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-white/[0.055]">
                  {listState.rows.map((fine) => <tr key={fine.fine_id} className="align-top hover:bg-white/[0.025]"><td className="whitespace-nowrap px-3 py-3 font-bold text-slate-400">{formatFinesDate(fine.occurred_on)}</td><td className="max-w-40 px-3 py-3 font-black text-white">{fine.subject_name}</td><td className="max-w-52 px-3 py-3 text-slate-300"><span className="line-clamp-2">{fine.rule_name}</span></td><td className="whitespace-nowrap px-3 py-3 font-bold text-white">{formatFinesCurrency(fine.generated_amount)}</td><td className="whitespace-nowrap px-3 py-3 font-bold text-emerald-200">{formatFinesCurrency(fine.collected_amount)}</td><td className="whitespace-nowrap px-3 py-3 font-black text-amber-100">{formatFinesCurrency(fine.pending_amount)}</td><td className="px-3 py-3"><StatusBadges fine={fine} /></td><td className="whitespace-nowrap px-3 py-3 text-slate-400">{formatFinesDate(fine.due_on)}</td><td className="min-w-52 px-3 py-3"><FineActions fine={fine} onAction={openAction} /></td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 p-3 lg:hidden">
              {listState.rows.map((fine) => <article key={fine.fine_id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-white">{fine.subject_name}</p><p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-400">{fine.rule_name}</p></div><StatusBadges fine={fine} /></div><div className="mt-3 grid grid-cols-3 gap-2 border-y border-white/[0.055] py-2"><div><p className="text-[8px] font-black uppercase text-slate-600">Generado</p><p className="mt-1 text-xs font-black text-white">{formatFinesCurrency(fine.generated_amount)}</p></div><div><p className="text-[8px] font-black uppercase text-slate-600">Cobrado</p><p className="mt-1 text-xs font-black text-emerald-200">{formatFinesCurrency(fine.collected_amount)}</p></div><div><p className="text-[8px] font-black uppercase text-slate-600">Pendiente</p><p className="mt-1 text-xs font-black text-amber-100">{formatFinesCurrency(fine.pending_amount)}</p></div></div><div className="mt-2 flex justify-between gap-3 text-[10px] font-bold text-slate-500"><span>Fecha {formatFinesDate(fine.occurred_on)}</span><span>Vence {formatFinesDate(fine.due_on)}</span></div><div className="mt-3"><FineActions fine={fine} onAction={openAction} /></div></article>)}
            </div>
            {listState.hasMore ? <div className="border-t border-white/10 p-4 text-center"><button type="button" onClick={loadMore} disabled={loadingMore} className={SECONDARY_BUTTON}>{loadingMore ? 'Cargando…' : 'Cargar más'}</button></div> : null}
          </>
        ) : null}
      </section>

      <section aria-labelledby="fines-subject-title" className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className={`${CARD} p-4 sm:p-5`}>
          <h3 id="fines-subject-title" className="text-sm font-black uppercase tracking-[0.14em] text-white">Situación por jugador</h3>
          <p className="mt-1 text-xs text-slate-500">Ordenado por importe pendiente</p>
          {subjectSummaryState.status === 'loading' ? <div role="status" className="mt-4 h-36 animate-pulse rounded-2xl bg-white/[0.045]" /> : null}
          {subjectSummaryState.status === 'error' ? <div className="mt-4"><BlockError message={subjectSummaryState.error} onRetry={refreshFinesData} /></div> : null}
          {subjectSummaryState.status === 'ready' && !subjectSummaryState.rows.length ? <p className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm font-bold text-slate-500">Todavía no hay datos por jugador.</p> : null}
          {subjectSummaryState.status === 'ready' && subjectSummaryState.rows.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-600"><tr><th className="pb-2">Jugador</th><th className="pb-2">Multas</th><th className="pb-2">Generado</th><th className="pb-2">Pagado</th><th className="pb-2">Pendiente</th></tr></thead><tbody className="divide-y divide-white/[0.055]">{subjectSummaryState.rows.map((row) => <tr key={`${row.subject_type}-${row.subject_name}`}><td className="py-2.5 pr-3 font-black text-white">{row.subject_name}</td><td className="py-2.5 text-slate-400">{row.fine_count}</td><td className="py-2.5 font-bold text-slate-300">{formatFinesCurrency(row.generated_total)}</td><td className="py-2.5 font-bold text-emerald-200">{formatFinesCurrency(row.collected_total)}</td><td className="py-2.5 font-black text-amber-100">{formatFinesCurrency(row.pending_total)}</td></tr>)}</tbody></table></div> : null}
        </div>

        <div className={`${CARD} p-4 sm:p-5`}>
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-white">Pendiente por jugador</h3>
          <p className="mt-1 text-xs text-slate-500">Solo importes pendientes mayores que cero</p>
          {subjectSummaryState.status === 'loading' ? <div className="mt-4 h-36 animate-pulse rounded-2xl bg-white/[0.045]" /> : null}
          {subjectSummaryState.status === 'ready' && !pendingSubjects.length ? <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center"><p className="text-sm font-black text-slate-300">No hay importes pendientes.</p></div> : null}
          {subjectSummaryState.status === 'ready' && pendingSubjects.length ? <div className="mt-5 space-y-3" role="img" aria-label="Gráfico de barras: pendiente por jugador">{pendingSubjects.slice(0, 12).map((row) => { const amount = numberValue(row.pending_total); const width = maxPending > 0 ? Math.max(4, (amount / maxPending) * 100) : 0; return <div key={`${row.subject_type}-${row.subject_name}`}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold text-slate-300">{row.subject_name}</span><span className="shrink-0 font-black text-amber-100">{formatFinesCurrency(amount)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-caudal-electric" style={{ width: `${width}%` }} /></div></div>; })}</div> : null}
        </div>
      </section>

      {modal?.kind === 'create' ? <NewFineModal rulesState={rulesState} subjectsState={subjectsState} onRetryCatalog={() => loadCatalog(true)} onClose={() => !saving && setModal(null)} onSubmit={submitNewFine} saving={saving} /> : null}
      {modal && modal.kind !== 'create' ? <FinancialActionModal kind={modal.kind} fine={modal.fine} onClose={() => !saving && setModal(null)} onSubmit={submitFinancialAction} saving={saving} /> : null}
      {mutationError && modal ? <div role="alert" className="fixed bottom-4 left-1/2 z-[170] w-[min(92vw,480px)] -translate-x-1/2 rounded-2xl border border-red-300/20 bg-red-950/95 px-4 py-3 text-center text-sm font-bold text-red-100 shadow-2xl">{mutationError}</div> : null}
    </main>
  );
}
