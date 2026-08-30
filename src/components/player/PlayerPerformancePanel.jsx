import { useCallback, useEffect, useState } from 'react';
import {
  PLAYER_PERFORMANCE_PAGE_SIZE,
  loadPlayerPerformancePage,
  loadPlayerRpePage,
  loadPlayerWellnessPage,
} from '../../data/playerPerformanceStore';
import { getRpeWorkloadAvailability } from '../../utils/performanceRpe';

const INITIAL_STATE = {
  status: 'loading',
  errorKind: '',
  wellness: [],
  rpe: [],
  wellnessHasMore: false,
  rpeHasMore: false,
  loadingMore: false,
  loadMoreError: false,
};

const formatDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Fecha no disponible';
};

const displayNumber = (value, suffix = '') => (
  value === null || value === undefined ? '—' : `${value}${suffix}`
);

function Metric({ label, value, accent = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${accent ? 'text-caudal-electric' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function TextValue({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-200">{value || 'Sin dato'}</p>
    </div>
  );
}

function MetricTrend({ title, entries, field, max, color }) {
  const points = entries
    .slice(0, 7)
    .reverse()
    .map((entry) => ({ date: entry.entry_date, value: entry[field] }))
    .filter((point) => Number.isFinite(point.value));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</p>
      {points.length ? (
        <div className="mt-4 flex h-24 items-end gap-2" aria-label={`Evolución reciente: ${title}`}>
          {points.map((point) => (
            <div key={`${point.date}-${field}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[9px] font-bold text-slate-300">{point.value}</span>
              <span
                className={`w-full min-w-2 rounded-t-md ${color}`}
                style={{ height: `${Math.max(8, Math.min(100, (point.value / max) * 100))}%` }}
              />
              <span className="text-[8px] font-bold text-slate-600">{point.date.slice(8, 10)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Todavía no hay valores para esta tendencia.</p>
      )}
    </div>
  );
}

function LatestWellnessCard({ entry }) {
  return (
    <article className="rounded-[1.4rem] border border-cyan-300/15 bg-cyan-300/[0.055] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Último Wellness</p>
          <p className="mt-1 text-sm font-bold text-slate-400">{entry ? formatDate(entry.entry_date) : 'Sin respuestas'}</p>
        </div>
        <span className="rounded-xl bg-cyan-300/10 px-3 py-2 text-2xl" aria-hidden="true">☀</span>
      </div>
      {entry ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Metric label="Sueño" value={displayNumber(entry.sleep_hours, ' h')} accent />
            <Metric label="Calidad sueño" value={displayNumber(entry.sleep_quality)} />
            <Metric label="Fatiga" value={displayNumber(entry.fatigue)} />
            <Metric label="Dolor muscular" value={displayNumber(entry.muscle_soreness)} />
            <Metric label="Estrés" value={displayNumber(entry.stress)} />
            <Metric label="Ánimo" value={displayNumber(entry.mood)} />
            <Metric label="Peso" value={displayNumber(entry.weight, ' kg')} />
          </div>
          <div className="mt-3 grid gap-2">
            <TextValue label="Molestias" value={entry.discomfort} />
            <TextValue label="Comentario" value={entry.comment} />
          </div>
        </>
      ) : (
        <p className="mt-5 text-sm leading-6 text-slate-400">Aún no tienes respuestas Wellness registradas.</p>
      )}
    </article>
  );
}

function LatestRpeCard({ entry }) {
  const workload = getRpeWorkloadAvailability(entry);
  return (
    <article className="rounded-[1.4rem] border border-violet-300/15 bg-violet-300/[0.055] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Último RPE</p>
          <p className="mt-1 text-sm font-bold text-slate-400">{entry ? formatDate(entry.entry_date) : 'Sin respuestas'}</p>
        </div>
        <span className="rounded-xl bg-violet-300/10 px-3 py-2 text-2xl" aria-hidden="true">↗</span>
      </div>
      {entry ? (
        <>
          <p className="mt-5 text-6xl font-black tracking-tight text-white">{displayNumber(entry.rpe)}</p>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Esfuerzo percibido</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Metric label="Duración válida" value={displayNumber(workload.durationMinutes, ' min')} />
            <Metric label="Carga interna" value={displayNumber(workload.load)} />
          </div>
          <p className="mt-3 text-[10px] leading-5 text-slate-500">
            Duración y carga solo aparecen cuando el RPE está vinculado a una sesión válida. No son U.C. externas.
          </p>
          <div className="mt-3">
            <TextValue label="Comentario" value={entry.comment} />
          </div>
        </>
      ) : (
        <p className="mt-5 text-sm leading-6 text-slate-400">Aún no tienes respuestas RPE registradas.</p>
      )}
    </article>
  );
}

function WellnessHistoryEntry({ entry }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-black text-white">{formatDate(entry.entry_date)}</p>
        <p className="text-sm font-black text-cyan-300">Sueño {displayNumber(entry.sleep_hours, ' h')}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-300">
        <span>Fatiga {displayNumber(entry.fatigue)}</span>
        <span>Dolor {displayNumber(entry.muscle_soreness)}</span>
        <span>Ánimo {displayNumber(entry.mood)}</span>
      </div>
      {entry.discomfort ? <TextValue label="Molestias" value={entry.discomfort} /> : null}
      {entry.comment ? <div className="mt-2"><TextValue label="Comentario" value={entry.comment} /></div> : null}
    </article>
  );
}

function RpeHistoryEntry({ entry }) {
  const workload = getRpeWorkloadAvailability(entry);
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-black text-white">{formatDate(entry.entry_date)}</p>
        <p className="text-2xl font-black text-violet-300">RPE {displayNumber(entry.rpe)}</p>
      </div>
      <div className="mt-2 flex gap-4 text-xs font-bold text-slate-400">
        <span>Duración: {displayNumber(workload.durationMinutes, ' min')}</span>
        <span>Carga interna: {displayNumber(workload.load)}</span>
      </div>
      {entry.comment ? <div className="mt-3"><TextValue label="Comentario" value={entry.comment} /></div> : null}
    </article>
  );
}

function PlayerPerformancePanel({ client }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(INITIAL_STATE);

    loadPlayerPerformancePage(client)
      .then((result) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          errorKind: '',
          wellness: result.wellness.rows,
          rpe: result.rpe.rows,
          wellnessHasMore: result.wellness.hasMore,
          rpeHasMore: result.rpe.hasMore,
          loadingMore: false,
          loadMoreError: false,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          ...INITIAL_STATE,
          status: 'error',
          errorKind: error?.kind === 'invalid_session' ? 'invalid_session' : 'network',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [client, reloadToken]);

  const loadMore = useCallback(async () => {
    if (state.loadingMore || (!state.wellnessHasMore && !state.rpeHasMore)) return;
    setState((current) => ({ ...current, loadingMore: true, loadMoreError: false }));

    try {
      const [wellnessPage, rpePage] = await Promise.all([
        state.wellnessHasMore
          ? loadPlayerWellnessPage(client, { offset: state.wellness.length })
          : Promise.resolve(null),
        state.rpeHasMore
          ? loadPlayerRpePage(client, { offset: state.rpe.length })
          : Promise.resolve(null),
      ]);
      setState((current) => ({
        ...current,
        wellness: wellnessPage ? [...current.wellness, ...wellnessPage.rows] : current.wellness,
        rpe: rpePage ? [...current.rpe, ...rpePage.rows] : current.rpe,
        wellnessHasMore: wellnessPage ? wellnessPage.hasMore : current.wellnessHasMore,
        rpeHasMore: rpePage ? rpePage.hasMore : current.rpeHasMore,
        loadingMore: false,
        loadMoreError: false,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loadingMore: false,
        loadMoreError: true,
        errorKind: error?.kind === 'invalid_session' ? 'invalid_session' : current.errorKind,
      }));
    }
  }, [client, state.loadingMore, state.rpe, state.rpeHasMore, state.wellness, state.wellnessHasMore]);

  if (state.status === 'loading') {
    return (
      <div role="status" className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-5 py-14 text-center">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-caudal-electric">Cargando Mi rendimiento…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-[1.4rem] border border-rose-300/20 bg-rose-300/[0.055] px-5 py-10 text-center">
        <h2 className="text-xl font-black text-white">
          {state.errorKind === 'invalid_session' ? 'Tu sesión ya no es válida' : 'No se pudo cargar Mi rendimiento'}
        </h2>
        <p role="alert" className="mt-3 text-sm leading-6 text-slate-400">
          {state.errorKind === 'invalid_session'
            ? 'Cierra sesión y vuelve a identificarte para continuar.'
            : 'Comprueba tu conexión y vuelve a intentarlo.'}
        </p>
        <button
          type="button"
          onClick={() => setReloadToken((current) => current + 1)}
          className="mt-6 min-h-[48px] w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/15"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const hasAnyData = state.wellness.length > 0 || state.rpe.length > 0;
  return (
    <div className="space-y-5">
      {!hasAnyData ? (
        <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-5 py-12 text-center">
          <h2 className="text-xl font-black text-white">Tu historial empieza aquí</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Todavía no hay respuestas Wellness ni RPE asociadas a tu jugador.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <LatestWellnessCard entry={state.wellness[0] || null} />
        <LatestRpeCard entry={state.rpe[0] || null} />
      </div>

      <section className="rounded-[1.4rem] border border-white/10 bg-[#081326]/80 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Solo tus respuestas</p>
          <h2 className="mt-1 text-xl font-black text-white">Evolución reciente</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricTrend title="Ánimo" entries={state.wellness} field="mood" max={5} color="bg-emerald-400" />
          <MetricTrend title="Fatiga" entries={state.wellness} field="fatigue" max={5} color="bg-cyan-400" />
          <MetricTrend title="RPE" entries={state.rpe} field="rpe" max={10} color="bg-violet-400" />
        </div>
      </section>

      <section className="rounded-[1.4rem] border border-white/10 bg-[#081326]/80 p-4 sm:p-5">
        <h2 className="text-xl font-black text-white">Histórico Wellness</h2>
        {state.wellness.length ? (
          <div className="mt-4 grid gap-3">
            {state.wellness.map((entry) => <WellnessHistoryEntry key={entry.id} entry={entry} />)}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Sin respuestas Wellness.</p>
        )}
      </section>

      <section className="rounded-[1.4rem] border border-white/10 bg-[#081326]/80 p-4 sm:p-5">
        <h2 className="text-xl font-black text-white">Histórico RPE</h2>
        {state.rpe.length ? (
          <div className="mt-4 grid gap-3">
            {state.rpe.map((entry) => <RpeHistoryEntry key={entry.id} entry={entry} />)}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Sin respuestas RPE.</p>
        )}
      </section>

      {state.wellnessHasMore || state.rpeHasMore ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={state.loadingMore}
          className="min-h-[50px] w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white hover:bg-white/10 disabled:opacity-60"
        >
          {state.loadingMore ? 'Cargando…' : `Ver ${PLAYER_PERFORMANCE_PAGE_SIZE} más`}
        </button>
      ) : null}

      {state.loadMoreError ? (
        <p role="alert" className="text-center text-sm font-semibold text-rose-300">
          No se pudo ampliar el historial. Puedes volver a intentarlo.
        </p>
      ) : null}
    </div>
  );
}

export default PlayerPerformancePanel;
