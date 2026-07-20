import fs from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { analyzePlayerSourceHtml } from '../supabase/functions/_shared/player-source-parser.js';

const envText = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  if (separator < 1 || line.trim().startsWith('#')) return null;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
  return [key, value];
}).filter(Boolean));

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data: sources, error: sourceError } = await client
  .from('player_sources')
  .select('id,player_id,url,source_name,is_primary,created_at')
  .order('created_at', { ascending: false })
  .limit(1);
if (sourceError) throw sourceError;
let source = sources?.[0] || null;
let player = null;
if (!source) {
  const { data: legacySources, error: legacyError } = await client
    .from('jugadores_rivales')
    .select('id,name,source_profile_url,external_source')
    .not('source_profile_url', 'is', null)
    .limit(1);
  if (legacyError) throw legacyError;
  const legacy = legacySources?.[0];
  if (legacy?.source_profile_url) {
    source = { url: legacy.source_profile_url, source_name: legacy.external_source || 'Fuente legacy', is_primary: true, player_id: legacy.id };
    player = { id: legacy.id, name: legacy.name };
  }
}

if (source && !player) {
  const playerResponse = await client.from('players_database').select('id,name').eq('id', source.player_id).maybeSingle();
  player = playerResponse.data;
}
if (!source) {
  console.log(JSON.stringify({ found: false, message: 'No hay fuentes guardadas en player_sources ni en las filas legacy.' }, null, 2));
} else {
const url = new URL(source.url);
if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) throw new Error('La fuente guardada no supera la validación segura.');

let diagnostic;
try {
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'APPCAUDAL-SourceDiagnostic/1.0' },
    signal: AbortSignal.timeout(12000),
  });
  const contentType = response.headers.get('content-type') || '';
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!/text\/html|application\/xhtml\+xml|application\/ld\+json/i.test(contentType)) throw new Error(`Contenido no compatible: ${contentType}`);
  if (contentLength > 1_500_000) throw new Error('Respuesta superior a 1,5 MB.');
  const html = (await response.text()).slice(0, 1_500_000);
  const analysis = analyzePlayerSourceHtml({ html, sourceUrl: url.href, finalUrl: response.url || url.href, contentType });
  diagnostic = {
    accessible: true,
    httpStatus: response.status,
    finalUrl: response.url,
    sourceType: analysis.sourceType,
    pageType: analysis.pageType,
    structuredData: analysis.structuredData,
    extractedFields: analysis.fields.map(({ field, value, confidence, evidence }) => ({ field, value, confidence, evidence })),
    discarded: analysis.discarded,
    result: analysis.status,
  };
} catch (error) {
  diagnostic = { accessible: false, error: error.message };
}

console.log(JSON.stringify({
  found: true,
  player: player?.name || source.player_id,
  source: { url: source.url, sourceName: source.source_name, isPrimary: source.is_primary },
  diagnostic,
}, null, 2));
}
