import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_tactical_snapshots.sql', import.meta.url), 'utf8');

assert.match(sql, /create table if not exists public\.partido_snapshots_tacticos/i);
assert.match(sql, /create table if not exists public\.partido_snapshot_tactico_slots/i);
assert.match(sql, /unique \(partido_id, minute\)/i, 'un partido solo tiene una fotografía vigente por minuto');
assert.match(sql, /primary key \(snapshot_id, slot\)/i, 'cada slot aparece una sola vez por snapshot');
assert.match(sql, /unique index[\s\S]*?\(snapshot_id, jugador_id\)[\s\S]*?where jugador_id is not null/i, 'un jugador no puede duplicarse');
assert.match(sql, /references public\.partidos\(id\) on delete cascade/i);
assert.match(sql, /references public\.jugadores\(id\) on delete set null/i);
assert.match(sql, /security invoker/gi);
assert.doesNotMatch(sql, /security definer/i);
assert.match(sql, /save_match_tactical_snapshot/i);
assert.match(sql, /save_match_system_change_with_snapshot/i);
assert.match(sql, /delete_match_system_change_with_snapshot/i);
assert.match(sql, /jsonb_typeof\(v_slots\) <> 'array'/i);
assert.match(sql, /duplicated tactical slot/i);
assert.match(sql, /duplicated tactical player/i);
assert.match(sql, /complete tactical snapshot needs exactly 11 slots/i, 'una fotografía completa exige once slots');
assert.match(sql, /La migracion no crea historico automaticamente/i);
assert.doesNotMatch(sql, /insert into public\.partido_snapshots_tacticos[\s\S]*?select[\s\S]*?from public\.partidos/i, 'no existe backfill automático');

console.log('tactical snapshots SQL audit passed');
