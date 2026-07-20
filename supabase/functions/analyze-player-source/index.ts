import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { analyzePlayerSourceHtml } from '../_shared/player-source-parser.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_RESPONSE_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
});

const isPrivateHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (['localhost', '0.0.0.0', '::1'].includes(normalized) || normalized.endsWith('.local')) return true;
  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [, aRaw, bRaw] = ipv4;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

const isPrivateAddress = (address: string) => isPrivateHostname(address)
  || /^::1$/i.test(address)
  || /^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f:]+$/i.test(address);

const validateResolvedHost = async (url: URL) => {
  if (isPrivateAddress(url.hostname)) throw new Error('No se permiten direcciones locales o privadas.');
  if (/^[0-9a-f:.]+$/i.test(url.hostname)) return;
  const addresses = (await Promise.allSettled([
    Deno.resolveDns(url.hostname, 'A'),
    Deno.resolveDns(url.hostname, 'AAAA'),
  ])).flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (addresses.some(isPrivateAddress)) throw new Error('El dominio resuelve a una dirección privada no permitida.');
};

const validateSourceUrl = (value: unknown) => {
  let url: URL;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('La URL no es válida.');
  }
  if (url.protocol !== 'https:') throw new Error('Solo se permiten fuentes HTTPS.');
  if (url.username || url.password) throw new Error('La URL no puede contener credenciales.');
  if (isPrivateHostname(url.hostname)) throw new Error('No se permiten direcciones locales o privadas.');
  return url;
};

const fetchHtml = async (initialUrl: URL) => {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validateResolvedHost(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/ld+json;q=0.9',
          'User-Agent': 'APPCAUDAL-SourceAnalyzer/1.0 (+scouting profile review)',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectCount === MAX_REDIRECTS) throw new Error('La página supera el límite seguro de redirecciones.');
      currentUrl = validateSourceUrl(new URL(location, currentUrl).href);
      continue;
    }
    if (!response.ok) throw new Error(`La fuente respondió con HTTP ${response.status}.`);

    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml|application\/ld\+json/i.test(contentType)) throw new Error('La fuente no devuelve contenido HTML compatible.');
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('La página supera el tamaño máximo permitido.');

    const reader = response.body?.getReader();
    if (!reader) throw new Error('La página no devolvió contenido legible.');
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('La página supera el tamaño máximo permitido.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    return { html: new TextDecoder().decode(bytes), finalUrl: currentUrl.href, contentType };
  }
  throw new Error('No se pudo completar el acceso a la fuente.');
};

serve(async (request) => {
  const requestId = crypto.randomUUID();
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ ok: false, requestId, error: 'Método no permitido.' }, 405);
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization) {
      console.warn(JSON.stringify({ event: 'player_source_auth_missing', requestId }));
      return jsonResponse({ ok: false, requestId, error: 'Sesión requerida.' }, 401);
    }
    const payload = await request.json();
    const sourceUrl = validateSourceUrl(payload?.url);
    console.info(JSON.stringify({ event: 'player_source_analysis_started', requestId, hostname: sourceUrl.hostname }));
    const fetched = await fetchHtml(sourceUrl);
    const analysis = analyzePlayerSourceHtml({ ...fetched, sourceUrl: sourceUrl.href });
    console.info(JSON.stringify({
      event: 'player_source_analysis_completed', requestId, hostname: sourceUrl.hostname,
      status: analysis.status, pageType: analysis.pageType, fieldsFound: analysis.fields.length,
    }));
    return jsonResponse({ ...analysis, requestId, accessed: true, analyzedAt: new Date().toISOString() });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'La fuente tardó demasiado en responder.'
      : error instanceof Error ? error.message : 'No se pudo analizar la fuente.';
    const isValidationError = /URL|HTTPS|credenciales|locales|privad[ao]s/i.test(message);
    const status = isTimeout ? 504 : isValidationError ? 400 : 502;
    console.error(JSON.stringify({
      event: 'player_source_analysis_failed', requestId, status,
      errorName: error instanceof Error ? error.name : 'UnknownError', message,
    }));
    return jsonResponse({ ok: false, requestId, accessed: false, status: 'access_error', error: message }, status);
  }
});
