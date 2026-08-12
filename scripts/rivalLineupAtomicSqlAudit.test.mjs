import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_rival_lineup_atomic.sql', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const canonicalStart = appSource.indexOf('const persistCanonicalRivalPlacements');
const canonicalEnd = appSource.indexOf('const retryPendingRivalPlacementSave', canonicalStart);
const canonicalSource = appSource.slice(canonicalStart, canonicalEnd);

assert.ok(canonicalStart >= 0 && canonicalEnd > canonicalStart, 'existe el flujo canónico rival');
assert.match(sql, /create or replace function public\.save_rival_lineup_atomic/i);
assert.match(sql, /security invoker/i, 'la RPC respeta RLS y permisos del usuario');
assert.doesNotMatch(sql, /security definer/i);
assert.match(sql, /pg_advisory_xact_lock/i);
assert.match(sql, /from public\.equipos_rivales[\s\S]*for update/i);
assert.match(sql, /update public\.player_team_memberships[\s\S]*squad_role/i);
assert.match(sql, /update public\.jugadores_rivales[\s\S]*role/i);
assert.match(sql, /delete from public\.equipo_rival_alineacion[\s\S]*insert into public\.equipo_rival_alineacion/i);
assert.match(sql, /delete from public\.equipo_rival_banquillo[\s\S]*insert into public\.equipo_rival_banquillo/i);
assert.match(sql, /update public\.equipos_rivales[\s\S]*system[\s\S]*field_sources/i);
assert.match(sql, /create or replace function public\.remove_rival_player_from_team_atomic/i);
assert.match(sql, /remove_rival_player_from_team_atomic[\s\S]*delete from public\.equipo_rival_alineacion[\s\S]*delete from public\.equipo_rival_banquillo/i);
assert.doesNotMatch(sql, /enable row level security|create policy|alter policy/i, 'H7 no cambia RLS');

assert.match(canonicalSource, /supabase\.rpc\('save_rival_lineup_atomic'/, 'el flujo canónico hace una sola escritura remota');
assert.doesNotMatch(canonicalSource, /persistTeamLineup|persistTeamBench|persistRivalPlacementPatches|supabase\.from/, 'el flujo canónico no fragmenta el guardado');
assert.match(appSource, /pendingRivalPlacementSave[\s\S]*Reintentar/, 'un fallo deja un reintento explícito');
assert.match(appSource, /isRivalSaveResponseCurrent/, 'descarta respuestas tardías de otro rival');
assert.match(appSource, /supabase\.rpc\('remove_rival_player_from_team_atomic'/, 'el borrado de plantilla tampoco deja XI parcial');

console.log('rival lineup atomic SQL/UI audit: ok');
