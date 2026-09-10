import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase_goal_own_goal_support.sql', import.meta.url), 'utf8');
const atomicSql = fs.readFileSync(new URL('../supabase_match_goal_atomic.sql', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(migration, /^\s*--[\s\S]*?begin;/i, 'la migración es transaccional');
assert.match(migration, /add column if not exists is_own_goal boolean not null default false/i, 'la columna es idempotente y legacy-safe');
assert.doesNotMatch(migration, /update\s+public\.partido_eventos_gol/i, 'no reescribe ni infiere eventos históricos');
assert.match(migration, /if exists \([\s\S]*?where is_own_goal[\s\S]*?raise exception/i, 'verifica datos antes de crear la constraint');
assert.match(migration, /partido_eventos_gol_own_goal_participants_null_check[\s\S]*?not is_own_goal[\s\S]*?scorer is null[\s\S]*?scorer_id is null[\s\S]*?assistant is null[\s\S]*?assistant_id is null/i);
assert.match(migration, /commit;/i);
assert.doesNotMatch(migration, /enable row level security|create policy|alter policy/i, 'la migración no toca RLS');

assert.match(atomicSql, /'is_own_goal'/i, 'el preflight contractual exige la columna canónica');
assert.match(atomicSql, /jsonb_typeof\(p_goal->'is_own_goal'\) <> 'boolean'/i, 'la RPC rechaza marcas no booleanas');
assert.match(atomicSql, /if v_is_own_goal and \([\s\S]*?scorer is not null[\s\S]*?scorer_id is not null[\s\S]*?assistant is not null[\s\S]*?assistant_id is not null/i, 'la RPC rechaza participantes en una propia');
assert.match(atomicSql, /v_goal_input\.type = 'Gol a favor'[\s\S]*?and not v_is_own_goal[\s\S]*?goleador es obligatorio/i, 'un gol normal conserva el goleador obligatorio');
assert.match(atomicSql, /insert into public\.partido_eventos_gol \([\s\S]*?is_own_goal[\s\S]*?v_is_own_goal/i, 'crear persiste la marca');
assert.match(atomicSql, /update public\.partido_eventos_gol[\s\S]*?is_own_goal = v_is_own_goal/i, 'editar persiste la marca');
assert.match(atomicSql, /count\(\*\) filter \(where type = 'Gol a favor'\)/i, 'GF colectivo sigue derivado por type');
assert.match(atomicSql, /count\(\*\) filter \(where type = 'Gol en contra'\)/i, 'GC colectivo sigue derivado por type');

assert.match(appSource, /'is_own_goal'/, 'el adaptador de escritura admite la columna');
assert.match(appSource, /is_own_goal: isGoalOwnGoal\(draft\)/, 'el payload serializa una única fuente canónica');
assert.match(appSource, /isOwnGoal: isGoalOwnGoal\(event\)/, 'la lectura normaliza la columna');
assert.match(appSource, /aria-pressed=\{isGoalOwnGoal\(goalAnalysisDraft\)\}/, 'la UX usa un control específico, no un jugador ficticio');
assert.match(appSource, /disabled=\{isGoalOwnGoal\(goalAnalysisDraft\)\}/, 'la propia deshabilita controles de participantes');
assert.doesNotMatch(appSource, /scorer:\s*['"]Gol en propia/i, 'no se guarda texto falso como jugador');

console.log('goal own-goal SQL/UI audit: ok');
