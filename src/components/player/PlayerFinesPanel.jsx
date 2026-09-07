import { useEffect, useMemo, useRef, useState } from 'react';

import {
  PLAYER_FINES_PAGE_SIZE,
  getMyFines,
  getMyFinesSummary,
} from '../../data/playerFinesStore';
import {
  formatFinesCurrency,
  formatFinesDate,
  getFineStatusPresentation,
} from '../../utils/finesPresentation';
import {
  PLAYER_FINE_FILTERS,
  filterPlayerFines,
  hasPlayerFineSurcharge,
  isPlayerFineOverdue,
} from '../../utils/playerFinesPresentation';

const CARD = 'min-w-0 rounded-[1.35rem] border border-white/10 bg-[#0b1424]/92 shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#081326]';
const INITIAL_SUMMARY = { active_fines: 0, paid_count: 0, surcharge_total: 0, collected_total: 0, pending_total: 0 };

function FinesIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function PlayerFinesLoading() {
  return (
    <div role="status" aria-label="Cargando tus multas" className="space-y-3">
      <div className="grid animate-pulse grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className={`${CARD} h-[76px] bg-white/[0.045]`} />)}
      </div>
      <div className="grid animate-pulse gap-3 lg:grid-cols-2">
        {[0, 1].map((item) => <div key={item} className={`${CARD} h-36 bg-white/[0.045]`} />)}
      </div>
      <span className="sr-only">Cargando tus multas…</span>
    </div>
  );
}

function PlayerFinesError({ onRetry }) {
  return (
    <div className={`${CARD} p-5 text-center`}>
      <p role="alert" className="text-sm font-black text-white">No se pudieron cargar tus multas.</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">Comprueba tu conexión y vuelve a intentarlo.</p>
      <button type="button" onClick={onRetry} className={`mt-4 min-h-[44px] rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white transition hover:bg-white/10 ${FOCUS_RING}`}>Reintentar</button>
    </div>
  );
}

function KpiCard({ label, value, tone = 'text-white', detail = null }) {
  return (
    <article className={`${CARD} px-3 py-2.5 sm:px-4 sm:py-3`}>
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-lg font-black tabular-nums sm:text-xl ${tone}`}>{value}</p>
      {detail ? <p className="mt-1 text-[10px] font-bold leading-4 text-slate-500">{detail}</p> : null}
    </article>
  );
}

function FineBadges({ fine }) {
  const status = getFineStatusPresentation(fine);
  const overdue = isPlayerFineOverdue(fine);
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${status.tone}`}>{status.label}</span>
      {overdue ? <span className="inline-flex rounded-full border border-red-300/20 bg-red-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-red-100">Vencida</span> : null}
    </div>
  );
}

function AmountItem({ label, value, tone = 'text-white' }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className={`mt-1 truncate text-sm font-black tabular-nums ${tone}`}>{formatFinesCurrency(value)}</dd>
    </div>
  );
}

function PlayerFineCard({ fine }) {
  const surchargeVisible = hasPlayerFineSurcharge(fine);
  return (
    <article className={`${CARD} p-3.5 sm:p-5`}>
      <header>
        <h3 className="text-base font-black leading-5 text-white">{fine.rule_name || 'Multa'}</h3>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <time dateTime={fine.occurred_on || undefined} className="text-xs font-bold text-slate-500">{formatFinesDate(fine.occurred_on)}</time>
          <FineBadges fine={fine} />
        </div>
      </header>

      {fine.rule_description ? <p className="mt-3 text-xs leading-5 text-slate-400">{fine.rule_description}</p> : null}

      <div className="mt-3 flex items-end justify-between gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2.5">
        <p className="text-[10px] font-black uppercase tracking-[0.09em] text-amber-200/75">Pendiente</p>
        <p className={`text-xl font-black tabular-nums ${Number(fine.pending_amount) > 0 ? 'text-amber-100' : 'text-white'}`}>{formatFinesCurrency(fine.pending_amount)}</p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-y border-white/[0.065] py-3">
        <AmountItem label="Original" value={fine.original_amount} />
        {surchargeVisible ? <AmountItem label="Recargo" value={fine.surcharge_amount} tone="text-red-100" /> : null}
        <AmountItem label="Pagado" value={fine.collected_amount} tone="text-emerald-200" />
        <div className="min-w-0">
          <dt className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Vence</dt>
          <dd className="mt-1 text-sm font-black text-white"><time dateTime={fine.due_on || undefined}>{formatFinesDate(fine.due_on)}</time></dd>
        </div>
      </dl>

      {fine.note ? <section className="mt-3 border-l-2 border-caudal-electric/45 pl-3"><h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-caudal-electric/80">Nota</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-300">{fine.note}</p></section> : null}
      {fine.lifecycle_status === 'cancelled' && fine.cancellation_reason ? <section className="mt-3 border-l-2 border-slate-500 pl-3"><h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Motivo de anulación</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-300">{fine.cancellation_reason}</p></section> : null}
    </article>
  );
}

export default function PlayerFinesPanel({ client }) {
  const [summaryState, setSummaryState] = useState({ status: 'loading', data: INITIAL_SUMMARY });
  const [listState, setListState] = useState({ status: 'loading', rows: [], hasMore: false });
  const [filter, setFilter] = useState('all');
  const [reloadToken, setReloadToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    let cancelled = false;
    const load = async () => {
      setSummaryState({ status: 'loading', data: INITIAL_SUMMARY });
      setListState({ status: 'loading', rows: [], hasMore: false });
      setLoadMoreError('');
      const [summaryResult, listResult] = await Promise.allSettled([
        getMyFinesSummary(client),
        getMyFines(client, { limit: PLAYER_FINES_PAGE_SIZE, offset: 0 }),
      ]);
      if (cancelled || requestId !== requestRef.current) return;
      setSummaryState(summaryResult.status === 'fulfilled'
        ? { status: 'ready', data: summaryResult.value }
        : { status: 'error', data: INITIAL_SUMMARY });
      setListState(listResult.status === 'fulfilled'
        ? { status: 'ready', rows: listResult.value, hasMore: listResult.value.length === PLAYER_FINES_PAGE_SIZE }
        : { status: 'error', rows: [], hasMore: false });
    };
    void load();
    return () => { cancelled = true; };
  }, [client, reloadToken]);

  const retry = () => setReloadToken((current) => current + 1);
  const visibleRows = useMemo(() => filterPlayerFines(listState.rows, filter), [filter, listState.rows]);
  const summary = summaryState.data;
  const bothRequestsFailed = summaryState.status === 'error' && listState.status === 'error';

  const loadMore = async () => {
    if (loadingMore || !listState.hasMore) return;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const rows = await getMyFines(client, { limit: PLAYER_FINES_PAGE_SIZE, offset: listState.rows.length });
      setListState((current) => ({ ...current, rows: [...current.rows, ...rows], hasMore: rows.length === PLAYER_FINES_PAGE_SIZE }));
    } catch {
      setLoadMoreError('No se pudieron cargar más multas.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section aria-labelledby="player-fines-title" className="space-y-4">
      <header className="border-b border-white/10 pb-3">
        <div className="flex items-center gap-2 text-caudal-electric/80"><FinesIcon /><p className="text-[10px] font-black uppercase tracking-[0.22em]">Tu historial</p></div>
        <h2 id="player-fines-title" className="mt-1 text-xl font-black text-white sm:text-2xl">Mis multas</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">Consulta tus sanciones y pagos.</p>
      </header>

      {summaryState.status === 'loading' && listState.status === 'loading' ? <PlayerFinesLoading /> : null}
      {bothRequestsFailed ? <PlayerFinesError onRetry={retry} /> : null}

      {summaryState.status !== 'loading' && !bothRequestsFailed ? (
        summaryState.status === 'error' ? <PlayerFinesError onRetry={retry} /> : (
          <section aria-label="Resumen de mis multas">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard label="Pendiente" value={formatFinesCurrency(summary.pending_total)} tone={summary.pending_total > 0 ? 'text-amber-100' : 'text-white'} />
              <KpiCard label="Pagado" value={formatFinesCurrency(summary.collected_total)} tone="text-emerald-200" />
              <KpiCard label="Activas" value={String(summary.active_fines)} />
              <KpiCard label="Pagadas" value={String(summary.paid_count)} detail={summary.surcharge_total > 0 ? `Recargos: ${formatFinesCurrency(summary.surcharge_total)}` : null} />
            </div>
          </section>
        )
      ) : null}

      {listState.status !== 'loading' && !bothRequestsFailed ? (
        listState.status === 'error' ? <PlayerFinesError onRetry={retry} /> : (
          <section aria-labelledby="player-fines-list-title" className="space-y-3">
            <div className={`${CARD} p-3 sm:p-4`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div><h3 id="player-fines-list-title" className="text-sm font-black text-white">Histórico</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">Los filtros se aplican a las multas cargadas.</p></div>
                <div className="flex max-w-full snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-smooth pb-1" aria-label="Filtrar mis multas">
                  {PLAYER_FINE_FILTERS.map((option) => <button key={option.value} type="button" onClick={() => setFilter(option.value)} aria-pressed={filter === option.value} className={`min-h-11 shrink-0 snap-start rounded-xl px-3 text-xs font-black transition ${filter === option.value ? 'bg-caudal-electric text-slate-950' : 'bg-white/[0.055] text-slate-400 hover:bg-white/[0.09] hover:text-white'} ${FOCUS_RING}`}>{option.label}</button>)}
                </div>
              </div>
            </div>

            {listState.rows.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-4 text-center"><p className="text-sm font-black text-slate-200">No tienes multas registradas.</p><p className="mt-1 text-xs text-slate-500">Cuando exista alguna, aparecerá aquí.</p></div> : null}
            {listState.rows.length > 0 && visibleRows.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-4 text-center"><p className="text-sm font-black text-slate-200">No hay multas cargadas con este estado.</p></div> : null}
            {visibleRows.length > 0 ? <div className="grid items-start gap-3 lg:grid-cols-2">{visibleRows.map((fine, index) => <PlayerFineCard key={fine.fine_id || `${fine.occurred_on || 'sin-fecha'}-${index}`} fine={fine} />)}</div> : null}

            {loadMoreError ? <p role="alert" className="rounded-xl border border-red-300/15 bg-red-400/[0.07] px-3 py-2 text-center text-xs font-bold text-red-100">{loadMoreError}</p> : null}
            {listState.hasMore ? <div className="text-center"><button type="button" onClick={loadMore} disabled={loadingMore} className={`min-h-[44px] rounded-xl border border-white/10 bg-white/[0.06] px-5 py-2 text-xs font-black text-white transition hover:bg-white/10 disabled:opacity-50 ${FOCUS_RING}`}>{loadingMore ? 'Cargando…' : 'Cargar más'}</button></div> : null}
          </section>
        )
      ) : null}
    </section>
  );
}
