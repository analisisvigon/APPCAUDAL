const IFRAME_PROVIDERS = {
  youtube: ['www.youtube-nocookie.com'],
  vimeo: ['player.vimeo.com'],
};

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.m3u8'];
const SUPABASE_STORAGE_HOST_PATTERN = /(?:^|\.)supabase\.co$/;

const normalizeHost = (hostname) => hostname.replace(/^www\./, '').toLowerCase();
const isHostOrSubdomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const hasAllowedIframeHost = (url, provider) => (IFRAME_PROVIDERS[provider] || []).includes(url.hostname.toLowerCase());

const getYouTubeId = (url) => {
  const host = normalizeHost(url.hostname);
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
  if (!isHostOrSubdomain(host, 'youtube.com') && !isHostOrSubdomain(host, 'youtube-nocookie.com')) return '';
  if (url.pathname === '/watch') return url.searchParams.get('v') || '';
  const pathParts = url.pathname.split('/').filter(Boolean);
  if (['embed', 'v', 'shorts'].includes(pathParts[0])) return pathParts[1] || '';
  return '';
};

const getYouTubeStartSeconds = (url) => {
  const rawStart = url.searchParams.get('start') || url.searchParams.get('t') || '';
  if (/^\d+$/.test(rawStart)) return Number(rawStart);
  const match = rawStart.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  return match && rawStart ? (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0) : 0;
};

const getVimeoId = (url) => {
  const host = normalizeHost(url.hostname);
  if (!isHostOrSubdomain(host, 'vimeo.com')) return '';
  const parts = url.pathname.split('/').filter(Boolean);
  return host === 'player.vimeo.com' && parts[0] === 'video' ? parts[1] || '' : parts[0] || '';
};

const getVideoExtension = (url) => DIRECT_VIDEO_EXTENSIONS.find((extension) => url.pathname.toLowerCase().endsWith(extension)) || '';
const isSupabaseStorageUrl = (url) => SUPABASE_STORAGE_HOST_PATTERN.test(url.hostname.toLowerCase())
  && url.pathname.toLowerCase().includes('/storage/v1/object/');

export function detectVideoProvider(videoUrl) {
  const rawUrl = String(videoUrl || '').trim();
  if (!rawUrl) return { kind: 'empty', playable: false, message: 'No hay vídeo asociado.' };
  let parsedUrl;
  try { parsedUrl = new URL(rawUrl); } catch { return { kind: 'invalid', playable: false, message: 'El enlace del vídeo no es válido.' }; }
  if (parsedUrl.protocol !== 'https:') return { kind: 'invalid', playable: false, message: 'El enlace del vídeo debe usar HTTPS.' };

  const host = normalizeHost(parsedUrl.hostname);
  const youtubeId = getYouTubeId(parsedUrl);
  if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${youtubeId}`);
    embedUrl.searchParams.set('rel', '0');
    embedUrl.searchParams.set('modestbranding', '1');
    embedUrl.searchParams.set('enablejsapi', '1');
    if (typeof window !== 'undefined') embedUrl.searchParams.set('origin', window.location.origin);
    const startSeconds = getYouTubeStartSeconds(parsedUrl);
    if (startSeconds > 0) embedUrl.searchParams.set('start', String(Math.floor(startSeconds)));
    return { kind: 'iframe', provider: 'YouTube', providerKey: youtubeId, playable: hasAllowedIframeHost(embedUrl, 'youtube'), embedUrl: embedUrl.toString(), originalUrl: rawUrl };
  }

  const vimeoId = getVimeoId(parsedUrl);
  if (vimeoId && /^\d+$/.test(vimeoId)) {
    const embedUrl = new URL(`https://player.vimeo.com/video/${vimeoId}`);
    return { kind: 'iframe', provider: 'Vimeo', providerKey: vimeoId, playable: hasAllowedIframeHost(embedUrl, 'vimeo'), embedUrl: embedUrl.toString(), originalUrl: rawUrl };
  }

  if (host === 'play.asturfutbol.es') return { kind: 'external', provider: 'AsturFutbol', playable: false, originalUrl: rawUrl, message: 'Este proveedor solo permite abrir el vídeo externamente.' };
  const extension = getVideoExtension(parsedUrl);
  if (extension || isSupabaseStorageUrl(parsedUrl)) {
    return {
      kind: 'video', provider: isSupabaseStorageUrl(parsedUrl) ? 'Supabase Storage' : extension.slice(1).toUpperCase(),
      playable: true, directVideoUrl: rawUrl, originalUrl: rawUrl,
      type: extension === '.webm' ? 'video/webm' : extension === '.m3u8' ? 'application/vnd.apple.mpegurl' : 'video/mp4',
    };
  }
  return { kind: 'external', provider: 'Enlace externo', playable: false, originalUrl: rawUrl, message: 'Este enlace se abre externamente.' };
}

export const getVideoThumbnailUrl = (analysis = {}) => analysis.provider === 'YouTube' && analysis.providerKey
  ? `https://i.ytimg.com/vi/${analysis.providerKey}/hqdefault.jpg`
  : '';
