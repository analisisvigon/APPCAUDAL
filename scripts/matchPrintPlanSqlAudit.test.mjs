import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_match_print_plan_atomic.sql', import.meta.url), 'utf8');
const tabSource = fs.readFileSync(new URL('../src/components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const editorSource = fs.readFileSync(new URL('../src/components/print/MatchPlanEditor.jsx', import.meta.url), 'utf8');

assert.match(sql, /create or replace function public\.save_match_print_plan_atomic\s*\(/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_partido_id::text, 0\)\)/i, 'serializa todos los snapshots del partido, también el vacío');
assert.match(sql, /for key share/i, 'valida y bloquea la existencia del partido');
assert.match(sql, /for update/i, 'bloquea el snapshot actual del partido');
assert.match(sql, /jsonb_typeof\(p_situations\) <> 'array'/i);
assert.match(sql, /IDs duplicados/i);
assert.match(sql, /otro partido o a otro tipo de diagrama/i);
assert.match(sql, /plan_partido_sin_balon[\s\S]*plan_partido_con_balon/i);
assert.match(sql, /delete from public\.match_set_piece_diagrams/i);
assert.match(sql, /update public\.match_set_piece_diagrams/i);
assert.match(sql, /insert into public\.match_set_piece_diagrams/i);
assert.match(sql, /grant execute on function public\.save_match_print_plan_atomic\(uuid, jsonb\) to authenticated/i);
assert.doesNotMatch(sql, /alter table[\s\S]*enable row level security|create policy|drop policy/i, 'H6 no modifica RLS');

assert.match(tabSource, /supabase\.rpc\('save_match_print_plan_atomic', snapshot\)/, 'frontend realiza una única llamada RPC');
assert.doesNotMatch(tabSource, /orden:\s*10000\s*\+/, 'frontend ya no mueve órdenes temporalmente');
assert.doesNotMatch(tabSource, /from\('match_set_piece_diagrams'\)\.delete\(\)\.eq\('id', situation\.id\)/, 'eliminar queda local hasta guardar el snapshot');
assert.match(tabSource, /matchPlanSaveInFlightRef\.current/, 'bloquea doble guardado');
assert.match(tabSource, /setMatchPlanDirty\(true\)/, 'un error conserva dirty');
assert.match(editorSource, /error \? 'Reintentar'/, 'la interfaz ofrece reintentar');

console.log('match print plan SQL audit: ok');
