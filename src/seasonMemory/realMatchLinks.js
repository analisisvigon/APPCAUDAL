// Un enlace en el PDF solo puede apuntar a una URL HTTPS externa sin caducidad
// declarada. La disponibilidad futura del archivo sigue dependiendo del host.
export function persistentVideoUrl(value) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
      || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)
      || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
      || /^(?:localhost|0\.0\.0\.0|\[?::1\]?)$/.test(url.hostname)) return null;
    const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
    if (keys.some((key) => /^(?:token|expires?|exp|signature|x-amz-|x-goog-|x-goog|access_token)/.test(key))
      || /\/storage\/v1\/object\/(?:sign|authenticated)\//i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function videoAtSeconds(value, seconds) {
  const safe = persistentVideoUrl(value);
  if (!safe || !Number.isInteger(seconds) || seconds < 0) return safe;
  const url = new URL(safe);
  const host = url.hostname.toLowerCase();
  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com'
    || host === 'youtu.be' || host === 'www.youtu.be') {
    url.searchParams.set('t', `${seconds}s`);
    return url.href;
  }
  if (/\.(?:mp4|webm|ogg)$/i.test(url.pathname)) {
    url.hash = `t=${seconds}`;
    return url.href;
  }
  return safe;
}
