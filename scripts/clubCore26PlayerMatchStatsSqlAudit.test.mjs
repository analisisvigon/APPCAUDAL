import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_club_core_26_player_match_stats.sql', import.meta.url),
  'utf8',
);
const verify = fs.readFileSync(
  new URL('../supabase_club_core_26_player_match_stats_verify.sql', import.meta.url),
  'utf8',
);
const liveMigration = fs.readFileSync(
  new URL('../supabase_club_core_17_player_analysis_backend.sql', import.meta.url),
  'utf8',
);

const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const executable = (value) => compact(value.replace(/--.*$/gm, ''));
const normalized = compact(migration);
const normalizedVerify = compact(verify);
const executableMigration = executable(migration);
const executableVerify = executable(verify);

const extractFunction = (sql, name) => {
  const match = sql.match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$function\\$;`,
    'i',
  ));
  assert.ok(match, `No se encontro ${name}.`);
  return compact(match[0]);
};

const matchStats = extractFunction(migration, 'get_my_player_analysis_match_stats');
const liveStats = extractFunction(liveMigration, 'get_my_player_analysis_live_stats');

assert.match(migration, /^-- APPCAUDAL - PLAYER: estadisticas validadas partido a partido/m);
assert.match(normalized, /^-- appcaudal[\s\S]* begin;[\s\S]* commit;$/);
assert.equal(
  (normalized.match(/create or replace function public\.get_my_player_analysis_match_stats/g) || []).length,
  1,
);
assert.match(
  normalized,
  /get_my_player_analysis_match_stats\( p_competition_scope text default 'season', p_venue text default 'all', p_window text default 'last_5_event_matches' \)/,
);
assert.match(
  normalized,
  /returns table \( match_id uuid, match_date date, opponent text, opponent_crest text, competition_key text, competition_name text, is_home boolean, minutes integer, event_count integer, goals integer, shots integer, shots_on_target integer, shot_accuracy_percentage numeric, crosses integer, turnovers integer, steals integer, fouls_committed integer, fouls_received integer \)/,
);

assert.match(matchStats, /actor_id uuid := auth\.uid\(\)/);
assert.match(matchStats, /from public\.current_membership\(\)/);
assert.match(matchStats, /public\.current_jugador_id\(\)/);
assert.match(matchStats, /public\.is_player\(\)/);
assert.match(matchStats, /membership_role is distinct from 'player'/);
assert.doesNotMatch(
  matchStats.slice(0, matchStats.indexOf('returns table')),
  /(jugador_id|player_id|user_id|membership_id|club_id|match_id)/,
  'La RPC no puede aceptar IDs de identidad ni de partido.',
);

for (const fragment of [
  "match_row.player_visible",
  "match_row.delegated_data_status = 'validado'",
  "event.reviewed is true",
  "event.equipo = 'caudal'",
  "event.jugador_id = own_jugador_id",
  "'finalizado', 'jugado', 'played', 'finished'",
  "'cerrado', 'closed', 'revisado', 'reviewed'",
]) {
  assert.ok(matchStats.includes(fragment), `Falta gate compartido: ${fragment}`);
  assert.ok(liveStats.includes(fragment), `live_stats no respalda el gate: ${fragment}`);
}

const eventCatalog = [
  'gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida',
  'robo', 'recuperacion', 'falta_realizada', 'falta_recibida',
];
for (const eventType of eventCatalog) {
  assert.ok(matchStats.includes(`'${eventType}'`), `Falta evento ${eventType}.`);
  assert.ok(liveStats.includes(`'${eventType}'`), `live_stats no contiene ${eventType}.`);
}
for (const metricFragment of [
  "event.tipo_evento = 'gol'",
  "event.tipo_evento in ('gol', 'tiro', 'tiro_puerta')",
  "event.tipo_evento in ('gol', 'tiro_puerta')",
  "event.tipo_evento = 'centro'",
  "event.tipo_evento = 'perdida'",
  "event.tipo_evento = 'robo'",
  "event.tipo_evento = 'falta_realizada'",
  "event.tipo_evento = 'falta_recibida'",
]) {
  assert.ok(matchStats.includes(metricFragment), `Falta metrica: ${metricFragment}`);
  assert.ok(liveStats.includes(metricFragment), `Metrica divergente de live_stats: ${metricFragment}`);
}

assert.match(matchStats, /join scoped_matches scoped on scoped\.id = event\.partido_id/);
assert.match(matchStats, /stats\.partido_id = match_stats\.partido_id/);
assert.match(matchStats, /stats\.jugador_id = own_jugador_id/);
assert.doesNotMatch(matchStats, /stats\.player_name\s*=/);
assert.doesNotMatch(matchStats, /join[^;]+on[^;]+(opponent|match_date|raw_match_date)\s*=/);
assert.match(matchStats, /event\.payload ->> 'opponent'/);
assert.match(matchStats, /event\.payload ->> 'opponent_crest'/);
assert.doesNotMatch(matchStats, /equipos_rivales|hardcod|storage\/v1/);

for (const allowlist of [
  "'season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly'",
  "'all', 'home', 'away'",
  "'last_3_event_matches', 'last_5_event_matches', 'full_scope'",
]) {
  assert.ok(matchStats.includes(allowlist), `Falta allowlist ${allowlist}.`);
  assert.ok(liveStats.includes(allowlist), `Allowlist distinta de live_stats: ${allowlist}.`);
}
assert.match(matchStats, /row_number\(\) over \( order by match_stats\.raw_match_date desc nulls last, match_stats\.partido_id desc \)/);
assert.match(matchStats, /order by case when match_stats\.raw_match_date[\s\S]*?end asc nulls last, match_stats\.partido_id asc/);
assert.match(matchStats, /when match_stats\.shots > 0 then pg_catalog\.round/);
assert.match(matchStats, /left join lateral \( select pg_catalog\.round\(pg_catalog\.max/);

assert.match(normalized, /language plpgsql stable security definer set search_path = pg_catalog/);
assert.match(normalized, /alter function public\.get_my_player_analysis_match_stats\(text,text,text\) owner to postgres/);
assert.match(normalized, /revoke all on function public\.get_my_player_analysis_match_stats\(text,text,text\) from public, anon, authenticated, service_role/);
assert.match(normalized, /grant execute on function public\.get_my_player_analysis_match_stats\(text,text,text\) to authenticated, service_role/);
assert.match(normalized, /existe public\.get_my_player_analysis_match_stats con firma incompatible/);
assert.match(normalized, /create or replace function public\.get_my_player_analysis_match_stats/);

assert.doesNotMatch(executableMigration, /\b(create index|alter table|create policy|drop policy|drop function)\b/);
assert.doesNotMatch(executableMigration, /\b(insert into|update|delete from) public\./);
assert.doesNotMatch(executableMigration, /\b(xg|duels?|passes?|expected_goals)\b/);
for (const existingRpc of [
  'get_my_player_analysis_live_stats',
  'get_my_player_match_history',
  'get_my_player_analysis_overview',
  'get_my_player_production_actions',
]) {
  assert.doesNotMatch(
    executableMigration,
    new RegExp(`create or replace function public\\.${existingRpc}\\s*\\(`),
    `${existingRpc} no se puede reemplazar en Club Core 26.`,
  );
}

assert.match(normalizedVerify, /begin;[\s\S]*rollback;$/);
assert.doesNotMatch(executableVerify, /(^|;) commit;/);
assert.match(normalizedVerify, /insert into public\.partidos/);
assert.match(normalizedVerify, /insert into public\.match_quick_events/);
assert.match(normalizedVerify, /insert into public\.partido_estadisticas_jugador/);
assert.match(normalizedVerify, /runtime_opponent_and_crest_same_match/);
assert.match(normalizedVerify, /runtime_minutes_null_vs_real_zero/);
assert.match(normalizedVerify, /filter_last3_exact/);
assert.match(normalizedVerify, /filter_last5_exact/);
assert.match(normalizedVerify, /filter_season_official/);
assert.match(normalizedVerify, /filter_competition_league/);
assert.match(normalizedVerify, /filter_venue_home/);
assert.match(normalizedVerify, /filter_venue_away/);
assert.match(normalizedVerify, /gate_unpublished_excluded/);
assert.match(normalizedVerify, /gate_delegated_invalid_excluded/);
assert.match(normalizedVerify, /gate_unreviewed_excluded/);
assert.match(normalizedVerify, /identity_other_player_excluded/);
assert.match(normalizedVerify, /role_viewer_denied/);
assert.match(normalizedVerify, /role_staff_player_rpc_denied/);
assert.match(normalizedVerify, /role_no_membership_denied/);
assert.match(normalizedVerify, /role_anon_denied/);
assert.match(normalizedVerify, /reconciliation_live_stats_exact/);
assert.match(normalizedVerify, /shots_per_match[\s\S]*shots_on_target_per_match[\s\S]*crosses_per_match[\s\S]*turnovers_per_match[\s\S]*steals_per_match[\s\S]*fouls_committed_per_match[\s\S]*fouls_received_per_match/);
assert.match(normalizedVerify, /checks_before_counter=%s; expected=36; total_output=37/);
assert.equal(
  (normalizedVerify.match(/add_player_match_stats_check\( '/g) || []).length,
  37,
  'El verifier debe emitir exactamente 37 checks, incluido el contador.',
);
assert.doesNotMatch(
  normalizedVerify,
  /(update|delete from) public\.(partidos|match_quick_events|partido_estadisticas_jugador|club_memberships)/,
  'Las fixtures no pueden mutar filas reales.',
);

console.log(
  'Club Core 26 PLAYER match stats SQL audit: RPC own-only, DTO por partido y verifier transaccional de 37 checks validados.',
);
