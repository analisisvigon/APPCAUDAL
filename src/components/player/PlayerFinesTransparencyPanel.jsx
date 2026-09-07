import { useEffect, useState } from 'react';

import { FinesHorizontalRanking, FinesStatusDistribution } from '../fines/FinesTransparencyVisuals';
import {
  FINES_TRANSPARENCY_PAGE_SIZE,
  getFinesTransparencyList,
  getFinesTransparencyRules,
  getFinesTransparencySubjects,
  getFinesTransparencySummary,
} from '../../data/finesTransparencyStore';
import {
  formatFinesCurrency,
  formatFinesDate,
  formatFinesSeason,
  getFineStatusPresentation,
} from '../../utils/finesPresentation';

const CARD = 'min-w-0 rounded-[1.35rem] border border-white/10 bg-[#0b1424]/92 shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#081326]';
const INITIAL_STATE = { status: 'loading', summary: null, subjects: [], rules: [], rows: [], hasMore: false };

function Kpi({ label, value, tone = 'text-white' }) {
  return <article className={`${CARD} px-3.5 py-3 sm:px-4`}><p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500 sm:text-[9px]">{label}</p><p className={`mt-1.5 truncate text-lg font-black tabular-nums sm:text-xl ${tone}`}>{value}</p></article>;
}

function TransparencyLoading() {
  return <div role="status" aria-label="Cargando transparencia del grupo" className="space-y-3"><div className="grid animate-pulse grid-cols-2 gap-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className={`${CARD} h-20 bg-white/[0.045]`} />)}</div><div className="grid animate-pulse gap-3 lg:grid-cols-2"><div className={`${CARD} h-64 bg-white/[0.045]`} /><div className={`${CARD} h-64 bg-white/[0.045]`} /></div><span className="sr-only">Cargando transparencia del grupo…</span></div>;
}

function SubjectState({ subject }) {
  const overdue = Number(subject.overdue_count) > 0;
  const pending = Number(subject.pending_total) > 0;
  const label = overdue ? 'Con vencidas' : pending ? 'Pendiente' : Number(subject.active_count) > 0 ? 'Al día' : 'Sin activas';
  const tone = overdue ? 'border-red-300/20 bg-red-400/10 text-red-100' : pending ? 'border-amber-300/20 bg-amber-300/10 text-amber-100' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200';
  return <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] ${tone}`}>{label}</span>;
}

function SubjectSummaryCard({ subject }) {
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-black/15 p-3.5">
      <div className="flex items-start justify-between gap-3"><h4 className="min-w-0 truncate text-sm font-black text-white">{subject.subject_name || 'Jugador'}</h4><SubjectState subject={subject} /></div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 min-[420px]:grid-cols-3">
        {[['Multas', subject.fine_count], ['Activas', subject.active_count], ['Pagadas', subject.paid_count]].map(([label, value]) => <div key={label}><dt className="text-[8px] font-black uppercase text-slate-600">{label}</dt><dd className="mt-1 text-sm font-black text-white">{value}</dd></div>)}
        {[['Generado', subject.generated_total, 'text-white'], ['Pagado', subject.collected_total, 'text-emerald-200'], ['Pendiente', subject.pending_total, 'text-amber-100']].map(([label, value, tone]) => <div key={label}><dt className="text-[8px] font-black uppercase text-slate-600">{label}</dt><dd className={`mt-1 truncate text-sm font-black tabular-nums ${tone}`}>{formatFinesCurrency(value)}</dd></div>)}
      </dl>
    </article>
  );
}

function TransparencyFineCard({ fine }) {
  const status = getFineStatusPresentation(fine);
  const surcharge = Number(fine.surcharge_amount) > 0;
  return (
    <article className={`${CARD} p-4 sm:p-5`}>
      <header className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-caudal-electric">{fine.subject_name || 'Sujeto'}</p><h4 className="mt-1 text-base font-black leading-5 text-white">{fine.rule_name || 'Multa'}</h4><time dateTime={fine.occurred_on || undefined} className="mt-1 block text-[10px] font-bold text-slate-500">{formatFinesDate(fine.occurred_on)}</time></div><div className="flex flex-wrap justify-end gap-1"><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${status.tone}`}>{status.label}</span>{fine.is_overdue && fine.lifecycle_status === 'active' ? <span className="rounded-full border border-red-300/20 bg-red-400/10 px-2 py-1 text-[8px] font-black uppercase text-red-100">Vencida</span> : null}</div></header>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-y border-white/[0.06] py-3 min-[420px]:grid-cols-3">
        {[['Original', fine.original_amount, 'text-white'], ...(surcharge ? [['Recargo', fine.surcharge_amount, 'text-red-100'], ['Total generado', fine.generated_amount, 'text-white']] : []), ['Cobrado', fine.collected_amount, 'text-emerald-200'], ['Pendiente', fine.pending_amount, 'text-amber-100']].map(([label, value, tone]) => <div key={label}><dt className="text-[8px] font-black uppercase text-slate-600">{label}</dt><dd className={`mt-1 truncate text-sm font-black tabular-nums ${tone}`}>{formatFinesCurrency(value)}</dd></div>)}
        <div><dt className="text-[8px] font-black uppercase text-slate-600">Vence</dt><dd className="mt-1 text-sm font-black text-white"><time dateTime={fine.due_on || undefined}>{formatFinesDate(fine.due_on)}</time></dd></div>
      </dl>
      {fine.note ? <section className="mt-3 border-l-2 border-caudal-electric/40 pl-3"><h5 className="text-[8px] font-black uppercase tracking-[0.12em] text-caudal-electric/80">Nota</h5><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-300">{fine.note}</p></section> : null}
    </article>
  );
}

export default function PlayerFinesTransparencyPanel({ client }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState(INITIAL_STATE);
      setLoadMoreError('');
      try {
        const [summary, subjects, rules, rows] = await Promise.all([
          getFinesTransparencySummary(client),
          getFinesTransparencySubjects(client),
          getFinesTransparencyRules(client),
          getFinesTransparencyList(client, { limit: FINES_TRANSPARENCY_PAGE_SIZE, offset: 0 }),
        ]);
        if (!cancelled) setState({ status: 'ready', summary, subjects, rules, rows, hasMore: rows.length === FINES_TRANSPARENCY_PAGE_SIZE });
      } catch {
        if (!cancelled) setState({ ...INITIAL_STATE, status: 'error' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [client, reloadToken]);

  const loadMore = async () => {
    if (loadingMore || !state.hasMore) return;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const rows = await getFinesTransparencyList(client, { limit: FINES_TRANSPARENCY_PAGE_SIZE, offset: state.rows.length });
      setState((current) => ({ ...current, rows: [...current.rows, ...rows], hasMore: rows.length === FINES_TRANSPARENCY_PAGE_SIZE }));
    } catch {
      setLoadMoreError('No se pudieron cargar más multas del grupo.');
    } finally {
      setLoadingMore(false);
    }
  };

  const summary = state.summary || {};
  const pendingCount = Number(summary.unpaid_count || 0) + Number(summary.partial_count || 0);
  const byPending = [...state.subjects].sort((left, right) => right.pending_total - left.pending_total);

  return (
    <section aria-labelledby="fines-transparency-title" className="space-y-4 border-t border-white/10 pt-5">
      <header><p className="text-[10px] font-black uppercase tracking-[0.22em] text-caudal-electric/80">Datos compartidos</p><div className="mt-1 flex flex-wrap items-end justify-between gap-2"><div><h2 id="fines-transparency-title" className="text-xl font-black text-white sm:text-2xl">Transparencia del grupo</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">Resumen económico y estado de las multas de la temporada.</p></div>{summary.season_code ? <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-black text-slate-300">{formatFinesSeason(summary.season_code)}</span> : null}</div></header>

      {state.status === 'loading' ? <TransparencyLoading /> : null}
      {state.status === 'error' ? <div className={`${CARD} p-5 text-center`}><p role="alert" className="text-sm font-black text-white">No se pudo cargar la transparencia del grupo.</p><p className="mt-1 text-xs text-slate-400">Vuelve a intentarlo en unos instantes.</p><button type="button" onClick={() => setReloadToken((current) => current + 1)} className={`mt-4 min-h-[44px] rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white hover:bg-white/10 ${FOCUS_RING}`}>Reintentar</button></div> : null}

      {state.status === 'ready' ? <>
        <section aria-label="Indicadores grupales" className="space-y-2"><div className="grid grid-cols-2 gap-2 lg:grid-cols-3"><Kpi label="Total generado" value={formatFinesCurrency(summary.generated_total)} /><Kpi label="Total cobrado" value={formatFinesCurrency(summary.collected_total)} tone="text-emerald-200" /><Kpi label="Total pendiente" value={formatFinesCurrency(summary.pending_total)} tone="text-amber-100" /></div><div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-3 lg:grid-cols-5"><Kpi label="Total multas" value={String(summary.total_fines)} /><Kpi label="Pendientes" value={String(pendingCount)} tone="text-amber-100" /><Kpi label="Pagadas" value={String(summary.paid_count)} tone="text-emerald-200" /><Kpi label="Anuladas" value={String(summary.cancelled_count)} tone="text-slate-300" /><Kpi label="Vencidas" value={String(summary.overdue_count)} tone="text-red-100" /></div></section>

        <section aria-label="Gráficas y rankings de multas" className="grid gap-3 xl:grid-cols-2">
          <FinesStatusDistribution summary={summary} />
          <FinesHorizontalRanking title="Quién ha aportado más" subtitle="Importe cobrado registrado" rows={state.subjects} labelKey="subject_name" valueKey="collected_total" tone="bg-emerald-300" />
          <FinesHorizontalRanking title="Mayor importe pendiente" rows={state.subjects} labelKey="subject_name" valueKey="pending_total" tone="bg-amber-300" />
          <FinesHorizontalRanking title="Motivos con mayor importe" subtitle="Total generado por motivo" rows={state.rules} labelKey="rule_name" valueKey="generated_total" />
          <FinesHorizontalRanking title="Motivos más frecuentes" rows={state.rules} labelKey="rule_name" valueKey="fine_count" formatValue={(value) => `${value} multas`} tone="bg-violet-300" />
        </section>

        <section aria-labelledby="subject-transparency-title" className={`${CARD} p-4 sm:p-5`}><div><h3 id="subject-transparency-title" className="text-sm font-black uppercase tracking-[0.13em] text-white">Resumen por jugador</h3><p className="mt-1 text-[10px] text-slate-500">Ordenado por importe pendiente</p></div>{!byPending.length ? <p className="mt-4 rounded-xl border border-dashed border-white/[0.08] px-3 py-7 text-center text-xs font-bold text-slate-500">No hay datos por jugador esta temporada.</p> : <div className="mt-4 grid gap-2 lg:grid-cols-2">{byPending.map((subject, index) => <SubjectSummaryCard key={`${subject.subject_name}-${index}`} subject={subject} />)}</div>}</section>

        <section aria-labelledby="group-fines-list-title" className="space-y-3"><div><h3 id="group-fines-list-title" className="text-sm font-black uppercase tracking-[0.13em] text-white">Multas del grupo</h3><p className="mt-1 text-[10px] text-slate-500">Información visible y sanitizada de la temporada actual</p></div>{!state.rows.length ? <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-9 text-center"><p className="text-sm font-black text-slate-200">No hay multas registradas en el grupo.</p></div> : <div className="grid items-start gap-3 lg:grid-cols-2">{state.rows.map((fine, index) => <TransparencyFineCard key={`${fine.subject_name}-${fine.occurred_on}-${index}`} fine={fine} />)}</div>}{loadMoreError ? <p role="alert" className="rounded-xl border border-red-300/15 bg-red-400/[0.07] px-3 py-2 text-center text-xs font-bold text-red-100">{loadMoreError}</p> : null}{state.hasMore ? <div className="text-center"><button type="button" onClick={loadMore} disabled={loadingMore} className={`min-h-[44px] rounded-xl border border-white/10 bg-white/[0.06] px-5 py-2 text-xs font-black text-white hover:bg-white/10 disabled:opacity-50 ${FOCUS_RING}`}>{loadingMore ? 'Cargando…' : 'Cargar más'}</button></div> : null}</section>
      </> : null}
    </section>
  );
}
