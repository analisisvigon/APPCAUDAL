import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = await readFile(path.join(root, 'supabase_sessions_08_guests.sql'), 'utf8');
const realization = await readFile(path.join(root, 'supabase_sessions_07_realization.sql'), 'utf8');
const store = await readFile(path.join(root, 'src/data/plannedSessionsStore.js'), 'utf8');
const roster = await readFile(path.join(root, 'src/components/training/PlannedSessionRoster.jsx'), 'utf8');

assert.match(sql, /PROPUESTA MANUAL\. NO EJECUTAR AUTOMATICAMENTE/);
assert.match(sql, /public\.planned_session_04b_lock\(\s*p_session_id,p_expected_revision\)/);
assert.match(sql, /public\.can_read_club_team_season\(s\.club_team_season_id\)/);
assert.match(sql, /public\.planned_session_realization_ready_v1\(\) is not true/);
assert.match(sql, /planned_session_guests_v1_status_check[\s\S]*'first_team'/);
assert.match(sql, /planned_session_guests_v1_position_check[\s\S]*'goalkeeper','central','lateral','midfielder','winger','forward'/);
assert.match(sql, /v_cancelled_at is not null or v_retired_at is not null/);
assert.match(sql, /No se pueden cambiar invitados de una sesion realizada/);
assert.match(sql, /planned_session_realized_guest_snapshots_v1_immutable/);
assert.match(sql, /guest_count',v_guest_count,'guest_hash',v_guest_hash/);
assert.match(sql, /insert into public\.planned_session_realized_guest_snapshots_v1/);
assert.match(sql, /revoke all on table public\.planned_session_guests_v1,[\s\S]*from public,anon,authenticated,service_role/);
assert.match(sql, /grant execute on function public\.save_planned_session_guests_v1\(uuid,integer,jsonb\)[\s\S]*to authenticated/);
assert.match(sql, /planned_session_guests_v1_read/);
assert.match(sql, /planned_session_realized_guest_snapshots_v1_read/);
assert.doesNotMatch(sql, /insert into public\.(?:players_database|club_team_season_players|planned_session_player_roster)/i);
assert.match(realization, /NEXO Sesiones 07: explicit session realization/);
assert.match(store, /planned_session_guests_v1/);
assert.match(store, /planned_session_realized_guest_snapshots_v1/);
assert.match(roster, /planned-roster-guest-badge/);
assert.match(roster, /onGuestsChange/);

console.log('planned session guests SQL audit passed');
