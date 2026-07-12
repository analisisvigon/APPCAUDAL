import { useMemo } from 'react';

const IFRAME_PROVIDERS = {
  youtube: ['www.youtube-nocookie.com'],
  vimeo: ['player.vimeo.com'],
};

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.m3u8'];
const SUPABASE_STORAGE_HOST_PATTERN = /(?:^|\.)supabase\.co$/;

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

export function detectMatchVideoProvider(videoUrl) {
  const rawUrl = String(videoUrl || '').trim();
  if (!rawUrl) {
    return {
      kind: 'empty',
      playable: false,
      message: 'No hay vídeo asociado a este partido.',
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return {
      kind: 'invalid',
      playable: false,
      message: 'El enlace del vídeo no es válido.',
    };
  }

  if (!isHttpsUrl(parsedUrl)) {
    return {
      kind: 'invalid',
      playable: false,
      message: 'El enlace del vídeo no es válido.',
    };
  }

  const host = normalizeHost(parsedUrl.hostname);
  const youtubeId = getYouTubeId(parsedUrl);
  if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    const startSeconds = getYouTubeStartSeconds(parsedUrl);
    const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${youtubeId}`);
    embedUrl.searchParams.set('rel', '0');
    embedUrl.searchParams.set('modestbranding', '1');
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
      provider: 'AsturFútbol',
      playable: false,
      originalUrl: rawUrl,
      message: 'Este proveedor no permite reproducir el vídeo dentro de la aplicación.',
      detail: 'El vídeo está guardado, pero este proveedor solo permite abrirlo externamente.',
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
    message: 'El vídeo está guardado, pero este proveedor solo permite abrirlo externamente.',
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

export default function MatchVideoPlayer({ videoUrl, isSaving = false }) {
  const analysis = useMemo(() => detectMatchVideoProvider(videoUrl), [videoUrl]);
  const canOpenExternally = Boolean(analysis.originalUrl);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Vídeo del partido</p>
        {canOpenExternally ? (
          <button
            type="button"
            onClick={() => window.open(analysis.originalUrl, '_blank', 'noopener,noreferrer')}
            className="self-start rounded-2xl border border-caudal-electric/25 bg-caudal-electric/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-caudal-electric transition hover:bg-caudal-electric hover:text-slate-950 sm:self-auto"
          >
            Abrir en una pestaña nueva
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        {isSaving ? (
          <p className="mb-3 text-xs font-semibold text-slate-500">Guardando vídeo…</p>
        ) : null}

        {analysis.kind === 'iframe' && analysis.playable ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-inner">
            <iframe
              src={analysis.embedUrl}
              title="Vídeo del partido"
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
            <video controls preload="metadata" className="absolute inset-0 h-full w-full bg-black">
              <source src={analysis.directVideoUrl} type={analysis.type} />
            </video>
          </div>
        ) : null}

        {!analysis.playable ? <MatchVideoFallback analysis={analysis} /> : null}
      </div>
    </div>
  );
}
