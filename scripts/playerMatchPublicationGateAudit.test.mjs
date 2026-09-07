import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../src/utils/tacticalDispositionEditor.js', import.meta.url), 'utf8');
const sportsRpc = fs.readFileSync(new URL('../supabase_club_core_16_player_sports_backend_lockdown.sql', import.meta.url), 'utf8');
const analysisRpc = fs.readFileSync(new URL('../supabase_club_core_17_player_analysis_backend.sql', import.meta.url), 'utf8');
const allMatchesPatch = fs.readFileSync(new URL('../supabase_club_core_18_player_all_matches_backend.sql', import.meta.url), 'utf8');
const squadRpc = fs.readFileSync(new URL('../supabase_match_squad_lineup_atomic.sql', import.meta.url), 'utf8');
const publicationMigration = fs.readFileSync(new URL('../supabase_player_match_publication_gate.sql', import.meta.url), 'utf8');

const countOccurrences = (source, fragment) => source.split(fragment).length - 1;
const dollarTags = [...publicationMigration.matchAll(/\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$/g)]
  .map((match) => match[0]);
for (const tag of new Set(dollarTags)) {
  assert.equal(dollarTags.filter((candidate) => candidate === tag).length % 2, 0, `${tag} sin pareja`);
}

const finalizedStatuses = new Set(['finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed']);
const madridDayNumber = (instant) => {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
};
const matchDayNumber = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
};
const publishable = (match, now) => finalizedStatuses.has(String(match.status || '').trim().toLowerCase())
  && madridDayNumber(now) > matchDayNumber(match.date);
const playerView = ({ match, now, role = '', minutes = 0, hasPartialEvents = false }) => ({
  played: publishable(match, now) && (Number(minutes) > 0 || String(role).toLowerCase() === 'titular'),
  role: publishable(match, now) ? role : '',
  scoreVisible: publishable(match, now),
  timelineVisible: publishable(match, now) && hasPartialEvents,
});

const madridSameDay = new Date('2026-09-09T20:00:00Z');
const madridNextDay = new Date('2026-09-09T22:00:00Z');
const caseA = playerView({ match: { date: '2026-09-09', status: 'Previa' }, now: madridNextDay, role: 'Titular', minutes: 90 });
assert.deepEqual(caseA, { played: false, role: '', scoreVisible: false, timelineVisible: false }, 'A: no finalizado al dia siguiente no publica');
const caseB = playerView({ match: { date: '2026-09-09', status: 'Finalizado' }, now: madridSameDay, role: 'Titular', minutes: 90, hasPartialEvents: true });
assert.deepEqual(caseB, { played: false, role: '', scoreVisible: false, timelineVisible: false }, 'B: finalizado el mismo dia sigue privado');
const caseC = playerView({ match: { date: '2026-09-09', status: 'Finalizado' }, now: madridNextDay, role: 'Titular', minutes: 90, hasPartialEvents: true });
assert.deepEqual(caseC, { played: true, role: 'Titular', scoreVisible: true, timelineVisible: true }, 'C: finalizado al dia siguiente publica');
const caseD = playerView({ match: { date: '2026-09-09', status: 'Revisado' }, now: madridNextDay, role: 'Suplente', minutes: 24 });
assert.deepEqual(caseD, { played: true, role: 'Suplente', scoreVisible: true, timelineVisible: false }, 'D: revisado al dia siguiente publica');
const caseE = playerView({ match: { date: '2026-09-12', status: 'Previa' }, now: madridNextDay, role: 'Titular', minutes: 0 });
assert.deepEqual(caseE, { played: false, role: '', scoreVisible: false, timelineVisible: false }, 'E: XI futuro sigue siendo STAFF-only');
assert.equal(publishable({ date: '2025-05-01', status: 'Finalizado' }, madridNextDay), true, 'el historico antiguo finalizado sigue publicado');
assert.equal(publishable({ date: '2026-09-09', status: 'Finalizado' }, new Date('2026-09-09T21:59:59Z')), false, '23:59:59 de Madrid sigue siendo el mismo dia');
assert.equal(publishable({ date: '2026-09-09', status: 'Finalizado' }, new Date('2026-09-09T22:00:00Z')), true, '00:00:00 de Madrid desbloquea el dia siguiente');

assert.match(app, /allowsCalledPlayerSelection = Number\(interval\.fromMinute\) === 0/);
assert.match(app, /knownPlayers\.length >= 11/);
assert.match(app, /allowKnownPlayerSubset: allowsCalledPlayerSelection/);
assert.match(app, /save_match_squad_lineup_atomic[\s\S]*?save_match_tactical_snapshot/, 'el XI inicial y el snapshot reutilizan las persistencias existentes');
assert.match(app, /sendTacticalEditorPlayerToBench/);
assert.match(editor, /allowKnownPlayerSubset/);
assert.match(editor, /removeTacticalDispositionPlayer/);

assert.match(sportsRpc, /case when[\s\S]*?status[\s\S]*?then match_json ->> 'home_score' else null end/);
assert.match(sportsRpc, /then coalesce\(public_timeline\.events, '\[\]'::jsonb\) else '\[\]'::jsonb end/);
assert.equal((analysisRpc.match(/serialized\.payload ->> 'status'/g) || []).length, 4, 'los cuatro RPC de analisis exigen cierre explicito');
const legacyAnalysisCondition = "pg_catalog.lower(pg_catalog.btrim(coalesce(serialized.payload ->> 'status', ''))) in\n        ('finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed')";
const legacyMatchesCondition = "pg_catalog.lower(pg_catalog.btrim(coalesce(match_json ->> 'status', ''))) in\n      ('finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed')";
const legacySummaryRpc = sportsRpc.match(/create or replace function public\.get_my_player_analysis_summary\(\)[\s\S]*?\n\$function\$;/i)?.[0] || '';
assert.ok(legacySummaryRpc, 'falta la definicion canonica del resumen PLAYER legado');
assert.equal(countOccurrences(analysisRpc, legacyAnalysisCondition), 4, 'la migracion puede transformar los cuatro gates de analisis canonicos');
assert.equal(countOccurrences(sportsRpc, legacyMatchesCondition), 3, 'la migracion puede transformar marcador y timeline canonicos');
assert.equal(countOccurrences(legacySummaryRpc, 'from public.partido_estadisticas_jugador stats\n    where stats.jugador_id = own_jugador_id'), 1, 'la migracion puede proteger las estadisticas del resumen legado');
assert.equal(countOccurrences(legacySummaryRpc, 'from public.partido_eventos_gol goal'), 1, 'la migracion puede proteger los goles del resumen legado');
assert.match(allMatchesPatch, /new_predicate constant text := 'where true'/, 'el parche all-matches conserva el resto del predicado finalizado');
assert.doesNotMatch(squadRpc, /then '90'/, 'preparar el XI no crea minutos oficiales');

[
  'get_my_player_matches',
  'get_my_player_analysis_overview',
  'get_my_player_analysis_live_stats',
  'get_my_player_production_actions',
  'get_my_player_match_history',
  'get_my_player_analysis_summary',
  'save_match_squad_lineup_atomic',
].forEach((rpc) => assert.ok(publicationMigration.includes(rpc), `la migracion repara ${rpc}`));
assert.doesNotMatch(publicationMigration, /create\s+table|alter\s+table|create\s+policy|drop\s+policy/i, 'la reparacion no cambia schema de tablas ni RLS');
assert.match(publicationMigration, /public\.partidos\.date debe ser fecha de calendario compatible/i);
assert.match(publicationMigration, /attribute\.attname = 'status'/i);
assert.match(publicationMigration, /create or replace function public\.is_player_match_publishable/i);
assert.match(publicationMigration, /security invoker[\s\S]*?set search_path = pg_catalog/i);
assert.match(publicationMigration, /at time zone 'Europe\/Madrid'/i);
assert.match(publicationMigration, /pg_catalog\.statement_timestamp\(\)/i);
assert.match(publicationMigration, /madrid_today > match_day/i);
assert.doesNotMatch(publicationMigration, /interval\s*'24 hours'/i);
assert.match(publicationMigration, /revoke all on function public\.is_player_match_publishable[\s\S]*?from public, anon, authenticated, service_role/i);
assert.doesNotMatch(publicationMigration, /grant execute on function public\.is_player_match_publishable/i);
assert.match(publicationMigration, /public\.is_player_match_publishable\(serialized\.payload ->> ''status'', serialized\.payload ->> ''date''\)/);
assert.match(publicationMigration, /public\.is_player_match_publishable\(match_json ->> ''status'', match_json ->> ''date''\)/);
assert.match(publicationMigration, /2026-09-09 21:59:59\+00/);
assert.match(publicationMigration, /2026-09-09 22:00:00\+00/);
assert.match(publicationMigration, /placeholder_count not in \(0, 4\)/);

console.log('player match next-day publication gate A-E and Madrid-midnight tests passed');
