import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(projectRoot, 'supabase_training_daily_load_phase1.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /^begin;/i);
assert.match(sql, /commit;\s*$/i);
assert.match(sql, /alter table public\.training_sessions\s+add column if not exists actual_duration_minutes integer/i);
assert.match(sql, /add column if not exists record_kind text/i);
assert.match(sql, /add column if not exists updated_at timestamptz/i);
assert.match(sql, /actual_duration_minutes is null or actual_duration_minutes > 0/i);
assert.match(sql, /record_kind is null or record_kind in \('legacy', 'daily_team_load'\)/i);
assert.match(sql, /unique index if not exists training_sessions_daily_team_load_date_key[\s\S]*on public\.training_sessions\(session_date\)[\s\S]*where record_kind = 'daily_team_load'/i);
assert.doesNotMatch(sql, /unique\s*\(session_date\)/i, 'No debe existir unicidad general por fecha.');
assert.doesNotMatch(sql, /update\s+public\.training_sessions\s+set\s+record_kind/i, 'La migración no debe reclasificar sesiones legacy.');

assert.match(sql, /create table if not exists public\.training_session_load_metrics/i);
for (const column of [
  'session_id',
  'scope',
  'jugador_id',
  'aggregation_method',
  'distance_m',
  'hsr_m',
  'accelerations',
  'decelerations',
  'sprints',
  'meters_per_minute',
]) assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'));

assert.match(sql, /scope in \('team', 'player'\)/i);
assert.match(sql, /scope = 'team'[\s\S]*jugador_id is null[\s\S]*aggregation_method = 'team_average'/i);
assert.match(sql, /scope = 'player'[\s\S]*jugador_id is not null/i);
assert.match(sql, /where scope = 'team'/i);
assert.match(sql, /where scope = 'player'/i);
for (const column of ['distance_m', 'hsr_m', 'accelerations', 'decelerations', 'sprints', 'meters_per_minute']) {
  assert.match(sql, new RegExp(`${column} is null or ${column} >= 0`, 'i'));
}

assert.match(sql, /create or replace function public\.upsert_team_daily_training_load/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /on conflict \(session_date\) where record_kind = 'daily_team_load'/i);
assert.match(sql, /on conflict \(session_id\) where scope = 'team'/i);
assert.match(sql, /jsonb_build_object\([\s\S]*'session'[\s\S]*'metrics'/i);
assert.match(sql, /alter table public\.training_session_load_metrics enable row level security/i);
assert.doesNotMatch(sql, /add column if not exists club_id|\n\s*club_id\s+uuid/i);
assert.doesNotMatch(sql, /\bintensity|\bint\b/i);
assert.doesNotMatch(sql, /rpe_entries|wellness_entries|google forms|apps script/i);

console.log('trainingLoadSqlAudit: all assertions passed');
