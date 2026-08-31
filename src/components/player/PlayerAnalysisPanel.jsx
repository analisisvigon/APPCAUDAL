import { useEffect, useState } from 'react';
import { loadPlayerAnalysisSummary } from '../../data/playerAnalysisStore';
import {
  PLAYER_ANALYSIS_PARTIAL_NOTE,
  buildPlayerAnalysisPresentation,
} from '../../utils/playerAnalysisPresentation';

const CARD_CLASS = 'min-w-0 rounded-[1.35rem] border border-white/10 bg-[#0b1424]/92 shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#081326]';
const INITIAL_STATE = { status: 'loading', summary: null, errorKind: '' };
const numberFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

const formatMetric = (value) => numberFormatter.format(Number(value) || 0);

function CoverageNote({ visible }) {
  if (!visible) return null;
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-100/75">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-200/70" />
      {PLAYER_ANALYSIS_PARTIAL_NOTE}
    </p>
  );
}

function MetricCard({ label, value, detail = '', tone = 'text-white', featured = false, partial = false }) {
  return (
    <article className={`min-w-0 rounded-[1.15rem] border border-white/[0.08] bg-white/[0.045] ${featured ? 'p-4 sm:p-5' : 'p-3.5 sm:p-4'}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1.5 font-black tracking-tight ${featured ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'} ${tone}`}>{formatMetric(value)}</p>
      {detail ? <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{detail}</p> : null}
      <CoverageNote visible={partial} />
    </article>
  );
}

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric/80">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-black text-white sm:text-xl">{title}</h3>
      {description ? <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{description}</p> : null}
    </div>
  );
}

function AnalysisLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-3 sm:space-y-4">
      <section className={`${CARD_CLASS} animate-pulse p-5`}>
        <div className="h-3 w-24 rounded-full bg-white/10" />
        <div className="mt-3 h-7 w-64 max-w-full rounded-full bg-white/10" />
      </section>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
        {['Partidos', 'Minutos', 'Titularidades', 'Goles', 'Asistencias'].map((label) => (
          <div key={label} className={`${CARD_CLASS} min-h-28 animate-pulse p-4 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600`}>Cargando {label}</div>
        ))}
      </div>
    </div>
  );
}

function AnalysisMessage({ kind, onRetry }) {
  const content = kind === 'empty'
    ? {
      title: 'No hay un análisis vinculado a tu sesión',
      copy: 'Vuelve a intentarlo. Si continúa, será necesario revisar la vinculación de tu cuenta.',
    }
    : kind === 'invalid_session'
      ? {
        title: 'Tu sesión ya no es válida',
        copy: 'Cierra sesión y vuelve a identificarte para consultar tu análisis.',
      }
      : kind === 'identity_invalid'
        ? {
          title: 'No se pudo resolver tu análisis',
          copy: 'No hemos podido vincular de forma segura este resumen con tu cuenta.',
        }
        : {
          title: 'No se pudo cargar Mi análisis',
          copy: 'Comprueba tu conexión y vuelve a intentarlo.',
        };

  return (
    <section className={`${CARD_CLASS} px-5 py-8 text-center`}>
      <div aria-hidden="true" className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-lg text-caudal-electric">↻</div>
      <h2 className="mt-4 text-lg font-black text-white">{content.title}</h2>
      <p role={kind === 'empty' ? undefined : 'alert'} className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{content.copy}</p>
      <button type="button" onClick={onRetry} className={`mt-5 min-h-[46px] rounded-xl bg-white/10 px-5 py-2.5 text-sm font-black text-white transition hover:bg-white/15 ${FOCUS_RING}`}>Reintentar</button>
    </section>
  );
}

function PlayerAnalysisContent({ summary }) {
  const presentation = buildPlayerAnalysisPresentation(summary);

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className={`${CARD_CLASS} relative overflow-hidden p-4 sm:p-5`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(61,217,255,0.12),transparent_42%)]" />
        <div className="relative">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-caudal-electric">Mi análisis</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">¿Cómo voy esta temporada?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {presentation.hasSeasonData
              ? 'Tu participación, producción y disciplina reunidas en un resumen propio.'
              : 'Aún no hay datos deportivos de temporada disponibles para mostrar.'}
          </p>
        </div>
      </section>

      <section aria-label="Resumen principal" className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
        <MetricCard label="Partidos" value={summary.matches} featured />
        <MetricCard label="Minutos" value={summary.minutes} featured tone="text-caudal-electric" />
        <MetricCard label="Titularidades" value={summary.starts} featured />
        <MetricCard label="Goles" value={summary.goals} featured tone="text-emerald-200" partial={presentation.goalsPartial} />
        <MetricCard label="Asistencias" value={summary.assists} featured tone="text-sky-200" partial={presentation.assistsPartial} />
      </section>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <section className={`${CARD_CLASS} p-4 sm:p-5`}>
          <SectionTitle eyebrow="Temporada" title="Participación" description="Presencia acumulada en los partidos registrados." />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <MetricCard label="Partidos" value={summary.matches} detail="con participación registrada" />
            <MetricCard label="Minutos" value={summary.minutes} detail="acumulados" tone="text-caudal-electric" />
          </div>
          <div className="mt-4 rounded-[1.1rem] border border-white/[0.08] bg-black/15 p-3.5">
            <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-300">
              <span>Titularidades</span>
              <span>{formatMetric(summary.starts)} / {formatMetric(summary.matches)} partidos</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10" role="img" aria-label={presentation.starterPercentage === null ? 'Sin porcentaje de titularidades disponible' : `${presentation.starterPercentage}% de titularidades sobre partidos registrados`}>
              <div className="h-full rounded-full bg-gradient-to-r from-caudal-electric to-sky-300" style={{ width: `${presentation.starterPercentage ?? 0}%` }} />
            </div>
            {presentation.starterPercentage !== null ? <p className="mt-2 text-right text-[10px] font-bold text-slate-500">{presentation.starterPercentage}% como titular</p> : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 divide-x divide-white/10 rounded-[1.1rem] border border-white/[0.08] bg-white/[0.035] py-3 text-center">
            <div className="px-2"><dt className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Titular</dt><dd className="mt-1 text-2xl font-black text-white">{formatMetric(summary.starts)}</dd></div>
            <div className="px-2"><dt className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Desde banquillo</dt><dd className="mt-1 text-2xl font-black text-white">{formatMetric(summary.benchEntries)}</dd></div>
          </dl>
        </section>

        <div className="grid min-w-0 gap-3">
          <section className={`${CARD_CLASS} p-4 sm:p-5`}>
            <SectionTitle eyebrow="Acciones decisivas" title="Producción" />
            <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
              <MetricCard label="Goles" value={summary.goals} tone="text-emerald-200" partial={presentation.goalsPartial} />
              <MetricCard label="Asistencias" value={summary.assists} tone="text-sky-200" partial={presentation.assistsPartial} />
              <MetricCard label="Goles + asist." value={presentation.contributions} tone="text-white" partial={presentation.contributionsPartial} />
            </div>
            {presentation.contributionsPartial ? <p className="mt-3 text-xs leading-5 text-slate-500">El total combina únicamente los datos actualmente disponibles.</p> : null}
          </section>

          <section className={`${CARD_CLASS} p-4 sm:p-5`}>
            <SectionTitle eyebrow="Registro" title="Disciplina" />
            <dl className="mt-4 grid grid-cols-2 divide-x divide-white/10 rounded-[1.1rem] border border-white/[0.08] bg-black/15 py-3 text-center">
              <div className="px-2"><dt className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Amarillas</dt><dd className="mt-1 text-3xl font-black text-amber-200">{formatMetric(summary.yellowCards)}</dd></div>
              <div className="px-2"><dt className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Rojas</dt><dd className="mt-1 text-3xl font-black text-rose-200">{formatMetric(summary.redCards)}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function PlayerAnalysisPanel({ client }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(INITIAL_STATE);
    loadPlayerAnalysisSummary(client)
      .then((summary) => {
        if (!cancelled) setState({ status: summary ? 'ready' : 'empty', summary, errorKind: '' });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', summary: null, errorKind: error?.kind || 'network' });
      });
    return () => { cancelled = true; };
  }, [client, reloadToken]);

  if (state.status === 'loading') return <AnalysisLoading />;
  if (state.status === 'empty') return <AnalysisMessage kind="empty" onRetry={() => setReloadToken((current) => current + 1)} />;
  if (state.status === 'error') return <AnalysisMessage kind={state.errorKind} onRetry={() => setReloadToken((current) => current + 1)} />;
  return <PlayerAnalysisContent summary={state.summary} />;
}
