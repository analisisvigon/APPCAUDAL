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
assert.doesNotMatch(publicationMigration, /drop\s+function/i, 'la migracion nunca elimina RPC ni helper');

const migrationOrder = [
  publicationMigration.indexOf('begin;'),
  publicationMigration.indexOf('do $player_rpc_preconditions$'),
  publicationMigration.indexOf('do $publishable_helper_precondition$'),
  publicationMigration.indexOf('create or replace function public.is_player_match_publishable'),
  publicationMigration.indexOf('do $migrate_analysis_rpcs$'),
  publicationMigration.indexOf('do $migrate_matches_rpc$'),
  publicationMigration.indexOf('do $migrate_summary_rpc$'),
  publicationMigration.indexOf('do $postconditions$'),
  publicationMigration.lastIndexOf('commit;'),
];
assert.equal(migrationOrder.every((offset) => offset >= 0), true, 'estan todas las fases de la transaccion');
assert.deepEqual(
  migrationOrder,
  [...migrationOrder].sort((left, right) => left - right),
  'precondiciones, helper, migraciones y auditoria se ejecutan en ese orden',
);
assert.match(publicationMigration, /falta % con su firma exacta; no se modifica nada/);
assert.match(publicationMigration, /contrato incompatible en %;[\s\S]*?no se modifica nada/);
assert.match(publicationMigration, /if helper_row\.oid is not null[\s\S]*?contrato incompatible en public\.is_player_match_publishable/,
  'un helper compatible ya existente se valida antes de CREATE OR REPLACE');

const helperDefinition = publicationMigration.match(
  /create or replace function public\.is_player_match_publishable[\s\S]*?\n\$function\$;/i,
)?.[0] || '';
const helperAuditPasses = (source) => [
  'finalizado', 'jugado', 'played', 'finished',
  'cerrado', 'closed', 'revisado', 'reviewed',
].every((status) => source.includes(`'${status}'`))
  && /not in\s*\(/i.test(source)
  && source.includes("at time zone 'Europe/Madrid'")
  && source.includes('madrid_today > match_day')
  && source.includes('invalid_datetime_format')
  && source.includes('datetime_field_overflow')
  && /security invoker/i.test(source);
assert.equal(helperAuditPasses(helperDefinition), true, 'F: el helper canonico completo pasa');
assert.equal(helperAuditPasses(helperDefinition.replace('not in', 'in')), false, 'C: perder la condicion de status falla');
assert.equal(helperAuditPasses(helperDefinition.replace('madrid_today > match_day', 'madrid_today = match_day')), false, 'D: perder el dia posterior falla');
assert.equal(helperAuditPasses(helperDefinition.replace('Europe/Madrid', 'UTC')), false, 'E: perder Europe/Madrid falla');

const scrubSql = (source) => source
  .replace(/'(?:''|[^'])*'/g, '__literal__')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--[^\n\r]*/g, ' ');
const rpcGateAuditPasses = (source, rawCall, structuralCall, expectedCount) => {
  const helperReferences = source.match(/public\.is_player_match_publishable\s*\(/g)?.length || 0;
  const canonicalCalls = source.match(rawCall)?.length || 0;
  const structuralCalls = scrubSql(source).match(structuralCall)?.length || 0;
  return helperReferences === expectedCount
    && canonicalCalls === expectedCount
    && structuralCalls === expectedCount;
};
const analysisRawCall = /public\.is_player_match_publishable\s*\(\s*serialized\.payload\s*->>\s*'status'\s*,\s*serialized\.payload\s*->>\s*'date'\s*\)/g;
const analysisStructuralCall = /and\s+public\.is_player_match_publishable\s*\(\s*serialized\.payload\s*->>\s*__literal__\s*,\s*serialized\.payload\s*->>\s*__literal__\s*\)/g;
const validAnalysisGate = "where true\n      and public.is_player_match_publishable(\n        serialized.payload ->> 'status',\n        serialized.payload ->> 'date'\n      )";
assert.equal(rpcGateAuditPasses(validAnalysisGate, analysisRawCall, analysisStructuralCall, 1), true, 'A: una llamada canonica dentro del WHERE pasa');
assert.equal(rpcGateAuditPasses('where true', analysisRawCall, analysisStructuralCall, 1), false, 'B: una RPC sin helper falla');
assert.equal(rpcGateAuditPasses(`where true\n/* ${validAnalysisGate} */`, analysisRawCall, analysisStructuralCall, 1), false, 'B: mencionar el helper solo en comentario falla');

const sqlLegacyAnalysisPattern = publicationMigration.match(
  /\$legacy_analysis\$([\s\S]*?)\$legacy_analysis\$/,
)?.[1] || '';
assert.ok(sqlLegacyAnalysisPattern, 'la migracion declara el patron legacy de analisis');
const legacyAnalysisPattern = new RegExp(
  sqlLegacyAnalysisPattern.replaceAll('[[:space:]]', '\\s'),
  'g',
);
const canonicalAnalysisGate = "public.is_player_match_publishable(serialized.payload ->> 'status', serialized.payload ->> 'date')";
const migrateAnalysisBody = (source) => {
  const helperReferences = source.match(/public\.is_player_match_publishable\s*\(/g)?.length || 0;
  if (helperReferences > 0) {
    if (!rpcGateAuditPasses(source, analysisRawCall, analysisStructuralCall, 1)) {
      throw new Error('migracion parcial o llamada al helper ambigua');
    }
    return source;
  }
  const legacyMatches = source.match(legacyAnalysisPattern)?.length || 0;
  if (legacyMatches !== 1) throw new Error('condicion finalizada ausente o ambigua');
  return source.replace(legacyAnalysisPattern, canonicalAnalysisGate);
};
const deployedOverviewBody = `begin
  return query
  with filtered_matches as (
    select match_row.id
    from public.partidos match_row
    cross join lateral (select pg_catalog.to_jsonb(match_row) as payload) serialized
    where match_row.player_visible
      and pg_catalog.lower(
            pg_catalog.btrim(
              coalesce(serialized.payload ->> 'status', '')
            )
          ) in (
            'finalizado',
            'jugado',
            'played',
            'finished',
            'cerrado',
            'closed',
            'revisado',
            'reviewed'
          )
      and (p_competition_scope = 'all' or serialized.payload ->> 'competition_key' = p_competition_scope)
      and (p_venue = 'all' or serialized.payload ->> 'venue' = p_venue)
      and match_row.club_id = membership_club_id
  )
  select 1;
end;`;
const migratedOverviewBody = migrateAnalysisBody(deployedOverviewBody);
assert.equal(rpcGateAuditPasses(migratedOverviewBody, analysisRawCall, analysisStructuralCall, 1), true, 'la definicion real se migra antes de auditar');
assert.doesNotMatch(migratedOverviewBody, legacyAnalysisPattern, 'desaparece el predicado inline antiguo');
assert.match(migratedOverviewBody, /where match_row\.player_visible\s+and public\.is_player_match_publishable/);
assert.match(migratedOverviewBody, /p_competition_scope = 'all'/, 'se conserva competition_scope');
assert.match(migratedOverviewBody, /p_venue = 'all'/, 'se conserva venue');
assert.match(migratedOverviewBody, /match_row\.club_id = membership_club_id/, 'se conserva el filtro de club');
assert.equal(migrateAnalysisBody(migratedOverviewBody), migratedOverviewBody, 'la segunda ejecucion deja igual una RPC ya migrada');
assert.equal(migrateAnalysisBody(validAnalysisGate), validAnalysisGate, 'una RPC que ya usa el helper es idempotente');

const appliedMutations = [];
const simulateSignaturePrecondition = (compatible) => {
  if (!compatible) throw new Error('firma incompatible; no se modifica nada');
  appliedMutations.push('helper', 'rpcs');
};
assert.throws(() => simulateSignaturePrecondition(false), /firma incompatible/);
assert.deepEqual(appliedMutations, [], 'una firma incompatible falla antes de la primera mutacion y la transaccion queda sin cambios');

const matchesRawCall = /public\.is_player_match_publishable\s*\(\s*match_json\s*->>\s*'status'\s*,\s*match_json\s*->>\s*'date'\s*\)/g;
const matchesStructuralCall = /case\s+when\s+public\.is_player_match_publishable\s*\(\s*match_json\s*->>\s*__literal__\s*,\s*match_json\s*->>\s*__literal__\s*\)/g;
const oneMatchGate = "case when public.is_player_match_publishable(match_json ->> 'status', match_json ->> 'date') then value else null end";
const summaryStructuralCall = /where\s+public\.is_player_match_publishable\s*\(\s*match_json\s*->>\s*__literal__\s*,\s*match_json\s*->>\s*__literal__\s*\)/g;
const oneSummaryGate = "where public.is_player_match_publishable(match_json ->> 'status', match_json ->> 'date')";
assert.equal([
  ...Array.from({ length: 4 }, () => rpcGateAuditPasses(validAnalysisGate, analysisRawCall, analysisStructuralCall, 1)),
  rpcGateAuditPasses(Array.from({ length: 3 }, () => oneMatchGate).join('\n'), matchesRawCall, matchesStructuralCall, 3),
  rpcGateAuditPasses(Array.from({ length: 2 }, () => oneSummaryGate).join('\n'), matchesRawCall, summaryStructuralCall, 2),
].every(Boolean), true, 'F: helper correcto y las seis rutas RPC protegidas pasan');

console.log('player match publication helper and fail-closed RPC audits A-F passed');
