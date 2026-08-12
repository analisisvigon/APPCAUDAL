import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase_rival_scouting_persistence.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();
const tables = [
  'rival_scouting_profiles',
  'rival_scouting_player_profiles',
  'rival_scouting_evidence',
  'rival_scouting_connections',
  'rival_scouting_legacy_imports',
];

tables.forEach((table) => {
  assert.match(normalized, new RegExp(`create table if not exists public\\.${table}\\b`));
  assert.match(normalized, new RegExp(`'${table}'`));
});
assert.doesNotMatch(normalized, /\bdrop\s+(table|column|policy|trigger|function)\b/);
assert.doesNotMatch(normalized, /security\s+definer/);
assert.match(normalized, /security\s+invoker/);
assert.match(normalized, /enable row level security/);
assert.match(normalized, /to authenticated/);
assert.match(normalized, /revoke all on table public\.%i from public, anon/);
assert.doesNotMatch(normalized, /grant[^;]+\bto\s+(public|anon)\b/);
assert.match(normalized, /references public\.equipos_rivales\(id\) on delete cascade/);
assert.match(normalized, /partido_id uuid references public\.partidos\(id\) on delete set null/);
assert.match(normalized, /global_player_id uuid references public\.players_database\(id\) on delete cascade/);
assert.match(normalized, /membership_id uuid references public\.player_team_memberships\(id\) on delete cascade/);
assert.match(normalized, /jugador_rival_id uuid references public\.jugadores_rivales\(id\) on delete cascade/);
assert.match(normalized, /source_jugador_id uuid references public\.jugadores\(id\) on delete set null/);
assert.match(normalized, /target_jugador_id uuid references public\.jugadores\(id\) on delete set null/);
assert.match(normalized, /status in \('pending', 'confirmed', 'discarded'\)/);
assert.match(normalized, /constraint rival_scouting_legacy_imports_unique unique \(equipo_rival_id, storage_key, legacy_item_id\)/);
assert.doesNotMatch(normalized, /alter table public\.(?!%i)/);

console.log('rivalScoutingSqlAudit tests: OK');
