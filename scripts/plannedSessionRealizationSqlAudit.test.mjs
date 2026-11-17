import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = await readFile(path.join(root, 'supabase_sessions_07_realization.sql'), 'utf8');
const store = await readFile(path.join(root, 'src/data/plannedSessionsStore.js'), 'utf8');
const confirmFunctionStart = sql.indexOf('create or replace function public.confirm_planned_training_session_realized_v1');

assert.match(sql, /PROPUESTA MANUAL\. NO EJECUTADA/);
assert.notEqual(confirmFunctionStart, -1);
assert.doesNotMatch(sql.slice(0, confirmFunctionStart),
  /insert into public\.planned_session_(?:realizations|realized_player_statuses)/i,
  'la migración no marca sesiones antiguas como realizadas');
assert.match(sql, /lifecycle_verified_at is not null/);
assert.match(sql, /verification_note is not null/);
assert.match(sql, /cancelled_at/);
assert.match(sql, /retired_at/);
assert.match(sql, /first_team/);
assert.match(sql, /p_review_acknowledged is not true/);
assert.match(sql, /v_session_date>current_date/);
assert.match(sql, /v_planning_state<>'confirmed'/);
assert.match(sql, /v_cancelled_at is not null or v_retired_at is not null/);
assert.match(sql, /left join public\.planned_session_player_availability a/);
assert.match(sql, /case when a\.session_id is null then 'default' else 'explicit' end/);
assert.match(sql, /default_available_count/);
assert.match(sql, /planned_session_realization_audit_immutable/);
assert.match(sql, /planned_session_realized_availability_sync/);
assert.match(sql, /update public\.planned_session_realized_player_statuses/);
assert.match(sql, /'player_status_corrected'/);
assert.match(sql, /can_write_club_team_season\(v_cts\) is not true/);
assert.match(sql, /revoke all on table public\.planned_session_realizations/);
assert.match(sql, /-- update public\.planned_session_realization_settings/);

assert.match(store, /\.eq\('club_team_season_id', clubTeamSeasonId\)/);
assert.match(store, /\.eq\('planning_state', 'confirmed'\)/);
assert.match(store, /\.lte\('session_date', throughDate\)/);
assert.match(store, /\.is\('cancelled_at', null\)/);
assert.match(store, /\.is\('retired_at', null\)/);
assert.match(store, /new Set\(sessions\.map\(\(row\) => row\.id\)/);
assert.match(store, /\.eq\('player_id', playerId\)/);

console.log('planned session realization SQL audit passed');
