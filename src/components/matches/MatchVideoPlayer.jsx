import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  POST_EVENT_TYPES,
  getPostEventTypeLabel,
  getPostEventTypeMarkerClass,
  getPostEventTypeValue,
} from '../../constants/postEventTypes';

const IFRAME_PROVIDERS = {
  youtube: ['www.youtube-nocookie.com'],
  vimeo: ['player.vimeo.com'],
};

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.m3u8'];
const SUPABASE_STORAGE_HOST_PATTERN = /(?:^|\.)supabase\.co$/;

const TIMELINE_FILTERS = [
  { id: 'all', label: 'Todos', match: () => true },
  ...POST_EVENT_TYPES.map((eventType) => ({
    id: eventType.value,
    label: eventType.label,
    match: (event) => getPostEventTypeValue(event.type) === eventType.value,
  })),
];

const normalizeHost = (hostname) => hostname.replace(/^www\./, '').toLowerCase();

const isHttpsUrl = (url) => url.protocol === 'https:';

const hasAllowedIframeHost = (url, provider) => {
  const allowedHosts = IFRAME_PROVIDERS[provider] || [];
  return allowedHosts.includes(url.hostname.toLowerCase());
};

const getYouTubeId = (url) => {
  const host = normalizeHost(url.hostname);
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
  if (!['youtube.com', 'youtube-nocookie.com'].includes(host)) return '';
  if (url.pathname === '/watch') return url.searchParams.get('v') || '';
  const pathParts = url.pathname.split('/').filter(Boolean);
  if (['embed', 'v', 'shorts'].includes(pathParts[0])) return pathParts[1] || '';
  return '';
};

const getYouTubeStartSeconds = (url) => {
  const rawStart = url.searchParams.get('start') || url.searchParams.get('t') || '';
  const numericStart = rawStart.match(/^\d+$/) ? Number(rawStart) : null;
  if (Number.isFinite(numericStart)) return numericStart;

  const timeMatch = rawStart.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!timeMatch || !rawStart) return 0;
  const hours = Number(timeMatch[1] || 0);
  const minutes = Number(timeMatch[2] || 0);
  const seconds = Number(timeMatch[3] || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
};

const getVimeoId = (url) => {
  const host = normalizeHost(url.hostname);
  if (!['vimeo.com', 'player.vimeo.com'].includes(host)) return '';
  const pathParts = url.pathname.split('/').filter(Boolean);
  if (host === 'player.vimeo.com' && pathParts[0] === 'video') return pathParts[1] || '';
  return pathParts[0] || '';
};

const getVideoExtension = (url) => {
  const pathname = url.pathname.toLowerCase();
  return DIRECT_VIDEO_EXTENSIONS.find((extension) => pathname.endsWith(extension)) || '';
};

const isSupabaseStorageUrl = (url) => (
  SUPABASE_STORAGE_HOST_PATTERN.test(url.hostname.toLowerCase())
  && url.pathname.toLowerCase().includes('/storage/v1/object/')
);

const formatTimelineTime = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const getEventSeconds = (event) => {
  const explicitSeconds = Number(event?.videoSeconds ?? event?.video_seconds);
  if (Number.isFinite(explicitSeconds) && explicitSeconds >= 0) return Math.round(explicitSeconds);
  const minute = Number(event?.minute);
  return Number.isFinite(minute) ? Math.max(0, Math.round(minute * 60)) : null;
};

const getFilteredEvents = (events, activeFilter) => {
  const filter = TIMELINE_FILTERS.find((item) => item.id === activeFilter) || TIMELINE_FILTERS[0];
  return events.filter((event) => filter.match(event));
};

const isKeyEvent = (event) => /^\[Evento clave\]/i.test(String(event?.description || ''));

const cleanEventDescription = (event) => String(event?.description || '').replace(/^\[Evento clave\]\s*/i, '');

export function detectMatchVideoProvider(videoUrl) {
  const rawUrl = String(videoUrl || '').trim();
  if (!rawUrl) {
    return {
      kind: 'empty',
      playable: false,
      message: 'No hay video asociado a este partido.',
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return {
      kind: 'invalid',
      playable: false,
      message: 'El enlace del video no es valido.',
    };
  }

  if (!isHttpsUrl(parsedUrl)) {
    return {
      kind: 'invalid',
      playable: false,
      message: 'El enlace del video no es valido.',
    };
  }

  const host = normalizeHost(parsedUrl.hostname);
  const youtubeId = getYouTubeId(parsedUrl);
  if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    const startSeconds = getYouTubeStartSeconds(parsedUrl);
    const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${youtubeId}`);
    embedUrl.searchParams.set('rel', '0');
    embedUrl.searchParams.set('modestbranding', '1');
    embedUrl.searchParams.set('enablejsapi', '1');
    if (typeof window !== 'undefined') embedUrl.searchParams.set('origin', window.location.origin);
    if (startSeconds > 0) embedUrl.searchParams.set('start', String(Math.floor(startSeconds)));
    return {
      kind: 'iframe',
      provider: 'YouTube',
      playable: hasAllowedIframeHost(embedUrl, 'youtube'),
      embedUrl: embedUrl.toString(),
      originalUrl: rawUrl,
    };
  }

  const vimeoId = getVimeoId(parsedUrl);
  if (vimeoId && /^\d+$/.test(vimeoId)) {
    const embedUrl = new URL(`https://player.vimeo.com/video/${vimeoId}`);
    return {
      kind: 'iframe',
      provider: 'Vimeo',
      playable: hasAllowedIframeHost(embedUrl, 'vimeo'),
      embedUrl: embedUrl.toString(),
      originalUrl: rawUrl,
    };
  }

  if (host === 'play.asturfutbol.es') {
    return {
      kind: 'external',
      provider: 'AsturFutbol',
      playable: false,
      originalUrl: rawUrl,
      message: 'Este proveedor no permite reproducir el video dentro de la aplicacion.',
      detail: 'El video esta guardado, pero este proveedor solo permite abrirlo externamente.',
    };
  }

  const extension = getVideoExtension(parsedUrl);
  if (extension || isSupabaseStorageUrl(parsedUrl)) {
    return {
      kind: 'video',
      provider: isSupabaseStorageUrl(parsedUrl) ? 'Supabase Storage' : extension.replace('.', '').toUpperCase(),
      playable: true,
      directVideoUrl: rawUrl,
      originalUrl: rawUrl,
      type: extension === '.webm' ? 'video/webm' : extension === '.m3u8' ? 'application/vnd.apple.mpegurl' : 'video/mp4',
    };
  }

  return {
    kind: 'external',
    provider: 'Enlace externo',
    playable: false,
    originalUrl: rawUrl,
    message: 'El video esta guardado, pero este proveedor solo permite abrirlo externamente.',
  };
}

function MatchVideoFallback({ analysis }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5">
      <p className="text-sm font-semibold text-slate-200">{analysis.message}</p>
      {analysis.detail ? <p className="mt-2 text-xs leading-5 text-slate-500">{analysis.detail}</p> : null}
    </div>
  );
}

function MatchTimeline({ duration, events, selectedEventId, onJump }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const timedEvents = useMemo(
    () => events
      .map((event) => ({ ...event, timelineSeconds: getEventSeconds(event) }))
      .filter((event) => event.timelineSeconds !== null)
      .sort((a, b) => a.timelineSeconds - b.timelineSeconds),
    [events]
  );
  const visibleEvents = useMemo(() => getFilteredEvents(timedEvents, activeFilter), [timedEvents, activeFilter]);
  const hasDuration = Number(duration) > 0;

  return (
    <div className="mt-4 rounded-2xl bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Timeline de analisis</p>
        <div className="flex flex-wrap gap-1.5">
          {TIMELINE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`rounded-xl px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.10em] transition ${activeFilter === filter.id ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-400 hover:bg-white/15 hover:text-white'}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {hasDuration && visibleEvents.length ? (
        <div className="mt-4 px-1 pb-3 pt-5">
          <div className="relative h-2 rounded-full bg-white/10">
            {visibleEvents.map((event) => {
              const left = Math.max(0, Math.min(100, (event.timelineSeconds / duration) * 100));
              const markerClass = getPostEventTypeMarkerClass(event.type);
              const typeLabel = getPostEventTypeLabel(event.type);
              const description = cleanEventDescription(event);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onJump(event)}
                  className={`group absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 shadow-[0_0_0_2px_rgba(255,255,255,0.12)] transition hover:scale-125 ${markerClass} ${selectedEventId === event.id ? 'ring-2 ring-caudal-electric' : ''}`}
                  style={{ left: `${left}%` }}
                  aria-label={`${formatTimelineTime(event.timelineSeconds)} ${typeLabel}`}
                >
                  <span className="pointer-events-none absolute bottom-5 left-1/2 z-20 hidden w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-[#071326] p-3 text-left shadow-glow group-hover:block">
                    <span className="block text-xs font-black text-white">{formatTimelineTime(event.timelineSeconds)}</span>
                    <span className="mt-1 block text-xs font-bold text-caudal-electric">{typeLabel}</span>
                    {event.player ? <span className="mt-1 block truncate text-xs text-slate-300">{event.player}</span> : null}
                    {isKeyEvent(event) ? <span className="mt-1 inline-flex rounded-lg bg-amber-300/15 px-2 py-1 text-[10px] font-black uppercase tracking-[0.10em] text-amber-100">Evento clave</span> : null}
                    {description ? <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-400">{description}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!hasDuration ? <p className="mt-4 text-sm text-slate-500">La duracion del video todavia no esta disponible.</p> : null}
      {hasDuration && !timedEvents.length ? <p className="mt-4 text-sm text-slate-500">No hay clips registrados.</p> : null}
      {hasDuration && timedEvents.length > 0 && !visibleEvents.length ? <p className="mt-4 text-sm text-slate-500">No hay clips registrados para este filtro.</p> : null}

      {visibleEvents.length ? (
        <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/[0.035]">
          {visibleEvents.map((event) => {
            const markerClass = getPostEventTypeMarkerClass(event.type);
            const typeLabel = getPostEventTypeLabel(event.type);
            const description = cleanEventDescription(event);
            return (
              <button
                key={`row-${event.id}`}
                type="button"
                onClick={() => onJump(event)}
                className={`grid w-full gap-2 px-3 py-3 text-left transition hover:bg-white/[0.06] sm:grid-cols-[82px_1fr] ${selectedEventId === event.id ? 'bg-caudal-electric/10' : ''}`}
              >
                <span className="flex items-center gap-2 text-xs font-black text-white">
                  <span className={`h-2.5 w-2.5 rounded-full ${markerClass}`} />
                  {formatTimelineTime(event.timelineSeconds)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-white">{typeLabel}{event.player ? ` · ${event.player}` : ''}{isKeyEvent(event) ? ' · Evento clave' : ''}</span>
                  {description ? <span className="mt-0.5 block truncate text-xs text-slate-400">{description}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const MatchVideoPlayer = forwardRef(function MatchVideoPlayer({
  videoUrl,
  isSaving = false,
  events = [],
  selectedEventId = null,
  onEventSelect = null,
  onTimeUpdate = null,
  onDurationChange = null,
}, ref) {
  const analysis = useMemo(() => detectMatchVideoProvider(videoUrl), [videoUrl]);
  const canOpenExternally = Boolean(analysis.originalUrl);
  const iframeRef = useRef(null);
  const videoRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const currentSecondsRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [youtubeReady, setYoutubeReady] = useState(false);

  const updateDuration = (nextDuration) => {
    const numericDuration = Math.max(0, Math.round(Number(nextDuration || 0)));
    setDuration(numericDuration);
    onDurationChange?.(numericDuration);
  };

  const updateCurrentSeconds = (nextSeconds) => {
    const numericSeconds = Math.max(0, Math.round(Number(nextSeconds || 0)));
    currentSecondsRef.current = numericSeconds;
    onTimeUpdate?.(numericSeconds);
  };

  const jumpToSeconds = (seconds) => {
    const nextSeconds = Math.max(0, Math.round(Number(seconds || 0)));
    if (analysis.kind === 'video' && videoRef.current) {
      videoRef.current.currentTime = nextSeconds;
      videoRef.current.play?.();
      updateCurrentSeconds(nextSeconds);
      return true;
    }
    if (analysis.provider === 'YouTube' && youtubePlayerRef.current?.seekTo) {
      youtubePlayerRef.current.seekTo(nextSeconds, true);
      youtubePlayerRef.current.playVideo?.();
      updateCurrentSeconds(nextSeconds);
      return true;
    }
    return false;
  };

  const handleJumpToEvent = (event) => {
    const seconds = getEventSeconds(event);
    if (seconds === null) return;
    jumpToSeconds(seconds);
    onEventSelect?.(event, seconds);
  };

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => currentSecondsRef.current,
    getDuration: () => duration,
    jumpTo: jumpToSeconds,
  }), [analysis.kind, analysis.provider, duration]);

  useEffect(() => {
    updateDuration(0);
    updateCurrentSeconds(0);
    setYoutubeReady(false);
    if (youtubePlayerRef.current?.destroy) {
      try {
        youtubePlayerRef.current.destroy();
      } catch {
        // Player may already be disposed by the iframe reload.
      }
    }
    youtubePlayerRef.current = null;
  }, [videoUrl]);

  useEffect(() => {
    if (analysis.provider !== 'YouTube' || !analysis.playable) return undefined;
    let cancelled = false;
    let pollId = null;

    const initializePlayer = () => {
      if (cancelled || !iframeRef.current || !window.YT?.Player || youtubePlayerRef.current) return;
      youtubePlayerRef.current = new window.YT.Player(iframeRef.current, {
        events: {
          onReady: (event) => {
            if (cancelled) return;
            setYoutubeReady(true);
            updateDuration(event.target.getDuration?.());
            pollId = window.setInterval(() => {
              updateCurrentSeconds(event.target.getCurrentTime?.());
              updateDuration(event.target.getDuration?.());
            }, 500);
          },
          onStateChange: (event) => {
            updateCurrentSeconds(event.target.getCurrentTime?.());
            updateDuration(event.target.getDuration?.());
          },
        },
      });
    };

    if (window.YT?.Player) {
      initializePlayer();
    } else {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        initializePlayer();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      setYoutubeReady(false);
      try {
        youtubePlayerRef.current?.destroy?.();
      } catch {
        // YouTube may have already removed the iframe.
      }
      youtubePlayerRef.current = null;
    };
  }, [analysis.embedUrl, analysis.playable, analysis.provider]);

  const canShowTimeline = analysis.playable && (analysis.kind === 'video' || (analysis.provider === 'YouTube' && youtubeReady));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Video del partido</p>
        {canOpenExternally ? (
          <button
            type="button"
            onClick={() => window.open(analysis.originalUrl, '_blank', 'noopener,noreferrer')}
            className="self-start rounded-2xl border border-caudal-electric/25 bg-caudal-electric/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-caudal-electric transition hover:bg-caudal-electric hover:text-slate-950 sm:self-auto"
          >
            Abrir en una pestana nueva
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        {isSaving ? (
          <p className="mb-3 text-xs font-semibold text-slate-500">Guardando video...</p>
        ) : null}

        {analysis.kind === 'iframe' && analysis.playable ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-inner">
            <iframe
              ref={iframeRef}
              src={analysis.embedUrl}
              title="Video del partido"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        ) : null}

        {analysis.kind === 'video' && analysis.playable ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-inner">
            <video
              ref={videoRef}
              controls
              preload="metadata"
              onLoadedMetadata={(event) => updateDuration(event.currentTarget.duration)}
              onDurationChange={(event) => updateDuration(event.currentTarget.duration)}
              onTimeUpdate={(event) => updateCurrentSeconds(event.currentTarget.currentTime)}
              className="absolute inset-0 h-full w-full bg-black"
            >
              <source src={analysis.directVideoUrl} type={analysis.type} />
            </video>
          </div>
        ) : null}

        {!analysis.playable ? <MatchVideoFallback analysis={analysis} /> : null}
        {canShowTimeline ? (
          <MatchTimeline
            duration={duration}
            events={events}
            selectedEventId={selectedEventId}
            onJump={handleJumpToEvent}
          />
        ) : null}
      </div>
    </div>
  );
});

export default MatchVideoPlayer;
