import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_delegated_match_validation.sql', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(sql, /create or replace function public\.set_delegated_match_status/i);
assert.match(sql, /security invoker/i, 'la RPC conserva los permisos y RLS del usuario');
assert.doesNotMatch(sql, /security definer/i);
assert.match(sql, /from public\.partidos[\s\S]*for update/i, 'bloquea el partido antes de la transición');
assert.match(sql, /update public\.match_quick_events[\s\S]*set reviewed = case/i, 'valida eventos con una actualización en bloque');
assert.match(sql, /when e\.equipo = 'rival'[\s\S]*then true/i, 'los eventos rivales no exigen jugador propio');
assert.match(sql, /when regexp_replace\(e\.tipo_evento[\s\S]*= 'corner' then true/i, 'el córner colectivo no exige jugador');
assert.match(sql, /else e\.jugador_id is not null/i, 'los eventos individuales solo se validan con UUID');
assert.match(sql, /update public\.partidos[\s\S]*delegated_data_status/i);
assert.match(sql, /grant execute[\s\S]*to authenticated/i);
assert.doesNotMatch(sql, /create policy|drop policy|alter policy/i, 'la migración no cambia RLS');
assert.match(appSource, /supabase\.rpc\('set_delegated_match_status'/, 'la UI usa la RPC transaccional');
assert.doesNotMatch(appSource, /from\(["']partidos["']\)\.update\(\{ delegated_data_status: status \}\)/, 'la UI no cambia solo el estado global');
assert.match(appSource, /runDelegatedMatchStatusBatch\([\s\S]*updateDelegatedDataStatus/i, 'la selección múltiple reutiliza la misma transición');
assert.match(appSource, /showOnlyPendingQuickEvents[\s\S]*filter\(\(event\) => !showOnlyPendingQuickEvents \|\| !event\.reviewed\)/i, 'el acceso de incidencias muestra solo pendientes');

console.log('delegated match validation SQL/UI audit: ok');
