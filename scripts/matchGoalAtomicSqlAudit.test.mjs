import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_match_goal_atomic.sql', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(sql, /create or replace function public\.mutate_match_goal_atomic/i);
assert.match(sql, /security invoker/i, 'la RPC respeta RLS y permisos del usuario');
assert.doesNotMatch(sql, /security definer/i);
assert.match(sql, /from public\.partidos[\s\S]*for update/i, 'serializa mutaciones del mismo partido');
assert.match(sql, /p_operation not in \('create', 'update', 'delete'\)/i);
assert.match(sql, /insert into public\.partido_eventos_gol/i);
assert.match(sql, /update public\.partido_eventos_gol/i);
assert.match(sql, /delete from public\.partido_eventos_gol/i);
assert.match(sql, /count\(\*\) filter \(where type = 'Gol a favor'\)/i);
assert.match(sql, /count\(\*\) filter \(where type = 'Gol en contra'\)/i);
assert.match(sql, /update public\.partidos[\s\S]*goals_for[\s\S]*home_score[\s\S]*away_score/i);
assert.match(sql, /'events'[\s\S]*'score'/i, 'devuelve eventos y marcador de la misma transacción');
assert.doesNotMatch(sql, /enable row level security|create policy|alter policy/i, 'M1 no cambia RLS');

assert.match(appSource, /supabase\.rpc\('mutate_match_goal_atomic'/, 'la UI usa la RPC atómica');
assert.doesNotMatch(appSource, /from\(["']partido_eventos_gol["']\)\.(insert|update|delete)/, 'la UI no escribe goles directamente');
assert.match(appSource, /goalMutationInFlightRef\.current/, 'bloquea dobles envíos');
assert.match(appSource, /isGoalMutationResponseCurrent/, 'descarta respuestas tardías de otro partido');

console.log('match goal atomic SQL/UI audit: ok');
