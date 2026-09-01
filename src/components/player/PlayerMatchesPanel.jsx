import { useEffect, useState } from 'react';
import {
  isAllowedPlayerMatchVideo,
  loadMyPlayerMatches,
} from '../../data/playerMatchesStore';
import {
  formatPlayerMatchDate,
  getPlayerMatchCompetitionLabel,
  getPlayerMatchScorePresentation,
  getPlayerMatchTeams,
} from '../../utils/playerMatchesPresentation';

const INITIAL_STATE = { status: 'loading', rows: [], errorKind: '' };
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#081326]';

const getInitials = (name) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || 'EQ';

function TeamCrest({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={`Escudo no disponible de ${name}`}
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-sm font-black text-slate-400 sm:h-16 sm:w-16"
      >
        {getInitials(name)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={`Escudo de ${name}`}
      onError={() => setFailed(true)}
      className="mx-auto h-14 w-14 object-contain sm:h-16 sm:w-16"
    />
  );
}

function CompetitionIdentity({ match }) {
  const label = getPlayerMatchCompetitionLabel(match);
  if (!label && !match.competitionLogoUrl) return null;
  return (
    <div className="mx-auto mt-3 flex max-w-[150px] flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.045] px-2.5 py-2">
      {match.competitionLogoUrl ? (
        <img src={match.competitionLogoUrl} alt={`Logo de ${label || 'la competición'}`} className="h-7 w-7 object-contain" />
      ) : null}
      {label ? <p className="max-w-full text-center text-[10px] font-black uppercase leading-4 tracking-[0.1em] text-slate-200">{label}</p> : null}
      {match.matchRound ? <p className="max-w-full text-center text-[9px] font-bold uppercase leading-4 tracking-[0.08em] text-slate-500">{match.matchRound}</p> : null}
    </div>
  );
}

const EVENT_PRESENTATION = Object.freeze({
  'Gol a favor': { icon: '⚽', tone: 'text-emerald-100', label: 'Gol a favor' },
  'Gol en contra': { icon: '⚽', tone: 'text-red-100', label: 'Gol en contra' },
  Amarilla: { icon: '🟨', tone: 'text-amber-100', label: 'Amarilla' },
  Roja: { icon: '🟥', tone: 'text-red-100', label: 'Roja' },
});

function TimelineEvent({ event }) {
  const presentation = EVENT_PRESENTATION[event.eventType];
  if (!presentation) return null;
  const hasVideo = isAllowedPlayerMatchVideo(event.videoUrl);
  const playerLabel = event.playerName || 'Jugador no indicado';
  return (
    <li className="grid grid-cols-[38px_26px_minmax(0,1fr)] items-start gap-1.5 border-b border-white/[0.055] px-1.5 py-2 text-xs last:border-b-0 sm:grid-cols-[52px_28px_minmax(0,1fr)] sm:gap-2">
      <span className="pt-1 font-black tabular-nums text-slate-500">{event.minute === null ? '' : `${event.minute}'`}</span>
      <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-white/[0.055] text-[11px] leading-none">{presentation.icon}</span>
      <span className={`min-w-0 font-semibold ${presentation.tone}`}>
        <span className="block break-words"><span className="font-black">{presentation.label}:</span> {playerLabel}{event.cardCount && event.cardCount > 1 ? ` · x${event.cardCount}` : ''}</span>
        {event.assistantName ? <span className="mt-0.5 block break-words text-[11px] font-bold text-caudal-electric">Asistencia: {event.assistantName}</span> : null}
        {hasVideo ? (
          <a
            href={event.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ver vídeo de ${presentation.label.toLowerCase()} de ${playerLabel}`}
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            className={`mt-2 inline-flex min-h-[44px] items-center rounded-lg border border-caudal-electric/25 bg-caudal-electric/10 px-3 py-1.5 text-[11px] font-black text-caudal-electric transition hover:bg-caudal-electric/15 ${FOCUS_RING}`}
          >
            ▶ Ver vídeo
          </a>
        ) : null}
      </span>
    </li>
  );
}

export function PlayerMatchCard({ match }) {
  const teams = getPlayerMatchTeams(match);
  const score = getPlayerMatchScorePresentation(match);
  const matchLabel = `${teams.home.name} contra ${teams.away.name}, ${score.score}`;
  return (
    <article
      aria-label={matchLabel}
      className="relative min-w-0 self-start overflow-hidden rounded-[1.45rem] border border-t-[6px] border-white/10 border-t-caudal-electric bg-[#091428]/[0.86] shadow-[0_18px_48px_rgba(0,0,0,0.22),0_-8px_30px_rgba(79,140,255,0.08)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_38%)]" />
      <div className="relative flex items-center justify-between gap-2 px-3 pt-3 sm:px-4">
        <time dateTime={match.matchDate || undefined} className="rounded-xl bg-caudal-950/80 px-2.5 py-1 text-[10px] font-bold text-slate-400 sm:text-xs">
          {formatPlayerMatchDate(match.matchDate)}
        </time>
        {teams.context ? <span className="rounded-full border border-caudal-electric/20 bg-caudal-electric/[0.08] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-caudal-electric">{teams.context}</span> : null}
      </div>

      <div className="relative mx-auto grid w-full max-w-[620px] grid-cols-[minmax(0,1fr)_minmax(98px,auto)_minmax(0,1fr)] items-start gap-1 px-2 pb-4 pt-3 min-[390px]:gap-2 min-[390px]:px-3 sm:gap-4 sm:px-5">
        <div className="min-w-0 text-center">
          <TeamCrest src={teams.home.crest} name={teams.home.name} />
          <p className="mt-2 line-clamp-2 break-words text-xs font-bold leading-4 text-white sm:text-sm" title={teams.home.name}>{teams.home.name}</p>
        </div>
        <div className="min-w-0 text-center">
          <p className={`${score.isPending ? 'mt-2 text-lg text-slate-200 sm:text-2xl' : 'text-3xl text-white sm:text-5xl'} font-black leading-tight tabular-nums tracking-normal`}>
            {score.score}
          </p>
          <span className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-400 sm:text-[9px]">
            {score.status}
          </span>
          <CompetitionIdentity match={match} />
        </div>
        <div className="min-w-0 text-center">
          <TeamCrest src={teams.away.crest} name={teams.away.name} />
          <p className="mt-2 line-clamp-2 break-words text-xs font-bold leading-4 text-white sm:text-sm" title={teams.away.name}>{teams.away.name}</p>
        </div>
      </div>

      {match.stadium ? (
        <p className="relative border-t border-white/[0.065] px-4 py-2.5 text-center text-[11px] font-semibold leading-5 text-slate-400 sm:text-xs">
          <span aria-hidden="true">⌖</span> {match.stadium}
        </p>
      ) : null}

      {match.timeline.length ? (
        <div className="relative border-t border-white/10 px-3 py-3 sm:px-4">
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Timeline</p>
          <ul className="rounded-2xl border border-white/10 bg-slate-950/[0.18] p-1">
            {match.timeline.map((event, index) => (
              <TimelineEvent key={`${event.eventType}-${event.minute ?? 'sin-minuto'}-${event.playerName || 'sin-jugador'}-${index}`} event={event} />
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function PlayerMatchesLoading() {
  return (
    <div role="status" aria-live="polite" className="grid items-start gap-4 xl:grid-cols-2">
      {[0, 1].map((item) => (
        <div key={item} className="min-h-[310px] animate-pulse rounded-[1.45rem] border border-white/10 bg-[#091428]/[0.86] p-4">
          <div className="h-6 w-28 rounded-full bg-white/10" />
          <div className="mt-6 grid grid-cols-3 items-center gap-3">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-white/10" />
            <div className="mx-auto h-12 w-24 rounded-2xl bg-white/10" />
            <div className="mx-auto h-16 w-16 rounded-2xl bg-white/10" />
          </div>
          <div className="mx-auto mt-5 h-20 w-36 rounded-2xl bg-white/[0.055]" />
        </div>
      ))}
      <span className="sr-only">Cargando partidos…</span>
    </div>
  );
}

export default function PlayerMatchesPanel({ client }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState(INITIAL_STATE);
      try {
        const rows = await loadMyPlayerMatches(client);
        if (!cancelled) setState({ status: 'ready', rows, errorKind: '' });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', rows: [], errorKind: error?.kind || 'network' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [client, reloadToken]);

  return (
    <section aria-labelledby="player-matches-title" className="space-y-4">
      <header className="border-b border-white/10 pb-3">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-caudal-electric/80">Temporada</p>
        <h2 id="player-matches-title" className="mt-1 text-xl font-black uppercase text-white sm:text-2xl">Partidos</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">Tus partidos con el Caudal.</p>
      </header>

      {state.status === 'loading' ? <PlayerMatchesLoading /> : null}

      {state.status === 'error' ? (
        <div className="rounded-[1.35rem] border border-white/10 bg-[#0b1424]/92 p-5 text-center shadow-[0_16px_42px_rgba(0,0,0,0.18)]">
          <p role="alert" className="text-sm font-black text-white">No se pudieron cargar los partidos.</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Comprueba tu conexión y vuelve a intentarlo.</p>
          <button type="button" onClick={() => setReloadToken((current) => current + 1)} className={`mt-4 min-h-[44px] rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white transition hover:bg-white/10 ${FOCUS_RING}`}>
            Reintentar
          </button>
        </div>
      ) : null}

      {state.status === 'ready' && state.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-8 text-center">
          <p className="text-sm font-black text-slate-200">No hay partidos disponibles.</p>
        </div>
      ) : null}

      {state.status === 'ready' && state.rows.length > 0 ? (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {state.rows.map((match, index) => (
            <PlayerMatchCard key={match.partidoId || `${match.matchDate || 'sin-fecha'}-${index}`} match={match} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
