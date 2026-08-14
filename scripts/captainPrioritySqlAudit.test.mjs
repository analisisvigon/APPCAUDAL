import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_own_captain_priority.sql', import.meta.url), 'utf8');
assert.match(sql, /add column if not exists captain_priority integer/i);
assert.match(sql, /check \(captain_priority is null or captain_priority > 0\)/i);
assert.match(sql, /create unique index if not exists[^]*\(team_id, captain_priority\)[^]*where is_current and captain_priority is not null/i);
assert.match(sql, /membership\.captain[^]*membership\.captain_priority is null/i, 'se conservan los capitanes booleanos existentes');
assert.match(sql, /create or replace function public\.save_own_captain_priorities/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /with ordinality/i);
assert.match(sql, /set captain_priority = null,\s*captain = false/i, 'la RPC limpia prioridad y booleano de forma coherente');
assert.match(sql, /set captain_priority = requested\.priority::integer,\s*captain = true/i, 'todo jugador priorizado conserva captain=true');
assert.doesNotMatch(sql, /disable row level security|security definer|drop\s+(table|column|policy)/i);
assert.doesNotMatch(sql, /where\s+(?:name|player_name)\s*=|insert\s+into\s+public\.jugadores/i, 'la migración no identifica capitanes mediante nombres');

console.log('captainPriority SQL audit passed');
