import { useEffect, useMemo, useState } from 'react';
import { loadPlayerHomeDashboard } from '../../data/playerHomeStore';
import {
  buildPlayerHomePerformance,
  formatPlayerHomeDate,
  getPlayerHomeFirstName,
  selectPlayerHomeMatches,
} from '../../utils/playerHomePresentation';
import { getLocalPlayerDateKey } from '../../utils/playerPerformancePresentation';
import {
  getPlayerMatchCompetitionLabel,
  getPlayerMatchScorePresentation,
  getPlayerMatchTeams,
} from '../../utils/playerMatchesPresentation';

const INITIAL_DOMAIN = Object.freeze({ status: 'loading', data: null, errorKind: '' });
const INITIAL_STATE = Object.freeze({ analysis: INITIAL_DOMAIN, matches: INITIAL_DOMAIN, performance: INITIAL_DOMAIN });
const CARD_CLASS = 'min-w-0 rounded-[1.35rem] border border-white/10 bg-[#0b1424]/92 shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#081326]';

const isAvailable = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const formatMetric = (value) => Number(value).toLocaleString('es-ES', { maximumFractionDigits: 2 });

function DashboardSection({ eyebrow, title, target, onNavigate, children }) {
  return (
    <section className={`${CARD_CLASS} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric/80">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-black text-white sm:text-xl">{title}</h2>
        </div>
        <button type="button" onClick={() => onNavigate(target)} className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-xs font-black text-slate-200 transition hover:border-caudal-electric/30 hover:bg-caudal-electric/[0.08] ${FOCUS_RING}`}>
          Ver {title.toLocaleLowerCase('es')}<span aria-hidden="true" className="text-caudal-electric">→</span>
        </button>
      </div>
      {children}
    </section>
  );
}

function DomainMessage({ status, empty, error }) {
  if (status === 'loading') return <p role="status" className="mt-4 animate-pulse rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-4 text-xs font-bold text-slate-500">Cargando…</p>;
  if (status === 'error') return <p role="alert" className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-xs text-slate-400">{error}</p>;
  return <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-slate-500">{empty}</p>;
}

function AnalysisSummary({ domain }) {
  if (domain.status !== 'ready' || !domain.data) {
    return <DomainMessage status={domain.status} empty="Aún no hay estadísticas de temporada disponibles." error="No se pudo cargar el resumen de Mi análisis." />;
  }
  const overview = domain.data;
  const metrics = [
    ['Minutos', overview.minutes],
    ['Partidos', overview.matchesPlayed],
    ['Titularidades', overview.starts],
    ['G+A', overview.goalContributions],
  ];
  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-black/15 px-3 py-3 text-center">
            <dt className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</dt>
            <dd className="mt-1 text-2xl font-black tabular-nums text-white sm:text-3xl">{formatMetric(value)}</dd>
          </div>
        ))}
      </dl>
      {overview.goalContributionsCoverage === 'PARTIAL' ? <p className="mt-2 text-[10px] font-semibold text-slate-500">G+A refleja los datos actualmente disponibles.</p> : null}
    </>
  );
}

const getInitials = (name) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || 'EQ';

function MiniCrest({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img src={src} alt={`Escudo de ${name}`} onError={() => setFailed(true)} className="mx-auto h-11 w-11 object-contain sm:h-12 sm:w-12" />;
  return <span role="img" aria-label={`Escudo no disponible de ${name}`} className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[10px] font-black text-slate-400 sm:h-12 sm:w-12">{getInitials(name)}</span>;
}

function HomeMatchCard({ label, match, emptyText }) {
  if (!match) return (
    <article className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-5">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-xs leading-5 text-slate-500">{emptyText}</p>
    </article>
  );
  const teams = getPlayerMatchTeams(match);
  const score = getPlayerMatchScorePresentation(match);
  const competition = getPlayerMatchCompetitionLabel(match);
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-black/15 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <time dateTime={match.matchDate || undefined} className="text-[10px] font-black uppercase text-slate-400">{formatPlayerHomeDate(match.matchDate)}</time>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(72px,auto)_minmax(0,1fr)] items-start gap-2 text-center">
        <div className="min-w-0"><MiniCrest src={teams.home.crest} name={teams.home.name} /><p className="mt-1.5 line-clamp-2 text-[11px] font-black leading-4 text-white">{teams.home.name}</p></div>
        <div className="min-w-0 pt-1"><p className={`${score.isPending ? 'text-sm text-slate-300' : 'text-2xl text-white'} font-black tabular-nums`}>{score.score}</p>{competition ? <p className="mt-2 line-clamp-2 text-[9px] font-bold uppercase leading-4 text-slate-500">{competition}</p> : null}</div>
        <div className="min-w-0"><MiniCrest src={teams.away.crest} name={teams.away.name} /><p className="mt-1.5 line-clamp-2 text-[11px] font-black leading-4 text-white">{teams.away.name}</p></div>
      </div>
    </article>
  );
}

function MatchesSummary({ domain, today }) {
  if (domain.status === 'loading' || domain.status === 'error') {
    return <DomainMessage status={domain.status} error="No se pudo cargar el resumen de partidos." />;
  }
  const { latest, next } = selectPlayerHomeMatches(domain.data, today);
  return (
    <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
      <HomeMatchCard label="Último partido" match={latest} emptyText="No hay partidos anteriores registrados." />
      <HomeMatchCard label="Próximo partido" match={next} emptyText="No hay próximo partido registrado." />
    </div>
  );
}

function PerformanceValue({ label, entry, value }) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/15 px-3 py-3">
      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{isAvailable(value) ? `${formatMetric(value)} / 10` : 'Sin registros'}</p>
      {entry?.entry_date ? <time dateTime={entry.entry_date} className="mt-1 block text-[10px] font-bold uppercase text-slate-600">{formatPlayerHomeDate(entry.entry_date)}</time> : null}
    </article>
  );
}

function PerformanceSummary({ domain, today }) {
  if (domain.status !== 'ready') {
    return <DomainMessage status={domain.status} error="No se pudo cargar el resumen de Rendimiento." />;
  }
  const summary = buildPlayerHomePerformance(domain.data, today);
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <PerformanceValue label="Último Wellness" entry={summary.latestWellness} value={summary.latestWellness?.health_ratio} />
        <PerformanceValue label="Último RPE" entry={summary.latestRpe} value={summary.latestRpe?.rpe} />
        <article className="col-span-2 rounded-2xl border border-white/[0.07] bg-black/15 px-3 py-3 sm:col-span-1">
          <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-500">Hoy</p>
          <p className="mt-2 text-xs font-bold text-slate-300">Wellness · {summary.wellnessAnsweredToday ? 'Respondido' : 'Sin respuesta'}</p>
          <p className="mt-1 text-xs font-bold text-slate-300">RPE · {summary.rpeAnsweredToday ? 'Respondido' : 'Sin respuesta'}</p>
        </article>
      </div>
      {summary.latestWellness?.discomfort ? <p className="mt-2 line-clamp-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-slate-400"><span className="font-black text-slate-300">Molestia indicada</span> · {summary.latestWellness.discomfort}</p> : null}
    </>
  );
}

export default function PlayerHomeDashboard({ client, profile, onNavigate }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const today = getLocalPlayerDateKey();
  const firstName = useMemo(() => getPlayerHomeFirstName(profile), [profile]);

  useEffect(() => {
    let cancelled = false;
    setState(INITIAL_STATE);
    loadPlayerHomeDashboard(client).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => { cancelled = true; };
  }, [client, reloadToken]);

  const hasError = Object.values(state).some((domain) => domain.status === 'error');

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4" data-player-home-dashboard="true">
      <section className={`${CARD_CLASS} relative overflow-hidden px-4 py-4 sm:px-5`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(61,217,255,0.12),transparent_42%)]" />
        <div className="relative">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Hola, {firstName}</p>
          <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Tu espacio de jugador</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">Consulta de un vistazo tu temporada, tus partidos y tus últimos registros de rendimiento.</p>
          {hasError ? <button type="button" onClick={() => setReloadToken((current) => current + 1)} className={`mt-3 min-h-[42px] rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-slate-300 ${FOCUS_RING}`}>Reintentar datos no disponibles</button> : null}
        </div>
      </section>

      <DashboardSection eyebrow="Temporada" title="Mi análisis" target="analysis" onNavigate={onNavigate}>
        <AnalysisSummary domain={state.analysis} />
      </DashboardSection>

      <DashboardSection eyebrow="Calendario" title="Partidos" target="matches" onNavigate={onNavigate}>
        <MatchesSummary domain={state.matches} today={today} />
      </DashboardSection>

      <DashboardSection eyebrow="Tus registros" title="Rendimiento" target="performance" onNavigate={onNavigate}>
        <PerformanceSummary domain={state.performance} today={today} />
      </DashboardSection>
    </div>
  );
}
