import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_player_outside_role_consistency.sql', import.meta.url),
  'utf8',
);
const atomic = fs.readFileSync(
  new URL('../supabase_match_squad_lineup_atomic.sql', import.meta.url),
  'utf8',
);
const publicationGate = fs.readFileSync(
  new URL('../supabase_player_match_publication_gate.sql', import.meta.url),
  'utf8',
);

const canonicalHistoryProjection = ({ isStarter, isCalled, minutes }) => ({
  role: isStarter ? 'Titular' : isCalled ? 'Suplente' : 'Fuera',
  minutes: !isStarter && !isCalled ? null : Number(minutes || 0),
  countsAsPlayed: (isStarter || isCalled) && (isStarter || Number(minutes || 0) > 0),
  countsAsBenchEntry: !isStarter && isCalled && Number(minutes || 0) > 0,
});

assert.deepEqual(canonicalHistoryProjection({ isStarter: true, isCalled: true, minutes: 77 }), {
  role: 'Titular', minutes: 77, countsAsPlayed: true, countsAsBenchEntry: false,
}, 'A: titular con 77 minutos');
assert.deepEqual(canonicalHistoryProjection({ isStarter: false, isCalled: true, minutes: 18 }), {
  role: 'Suplente', minutes: 18, countsAsPlayed: true, countsAsBenchEntry: true,
}, 'B: suplente que juega 18 minutos');
assert.deepEqual(canonicalHistoryProjection({ isStarter: false, isCalled: true, minutes: '' }), {
  role: 'Suplente', minutes: 0, countsAsPlayed: false, countsAsBenchEntry: false,
}, 'C: suplente convocado que no juega');
assert.deepEqual(canonicalHistoryProjection({ isStarter: false, isCalled: false, minutes: 63 }), {
  role: 'Fuera', minutes: null, countsAsPlayed: false, countsAsBenchEntry: false,
}, 'D-F/H: Fuera domina incluso sobre estadisticas historicas obsoletas');

assert.match(migration, /^-- PLAYER:[\s\S]*?\nbegin;/i);
assert.match(migration, /\ncommit;\s*$/i);
assert.equal((migration.match(/^begin;$/gim) || []).length, 1);
assert.equal((migration.match(/^commit;$/gim) || []).length, 1);
assert.doesNotMatch(migration, /\bdrop\s+(?:function|table)|\balter\s+table|\bcreate\s+(?:table|policy)|\bdrop\s+policy/i);
assert.doesNotMatch(migration, /\b(?:insert|update|delete|merge|truncate)\s+(?:into\s+|from\s+)?public\./i);
assert.doesNotMatch(migration, /\b(?:grant|revoke)\b/i, 'CREATE OR REPLACE conserva ACL sin reescribir permisos');

for (const signature of [
  'public.get_my_player_analysis_overview(text,text)',
  'public.get_my_player_match_history(text,text,integer,integer)',
  'public.get_my_player_analysis_summary()',
]) assert.ok(migration.includes(signature), `falta contrato ${signature}`);

assert.match(migration, /pg_get_function_identity_arguments/i);
assert.match(migration, /pg_get_function_result/i);
assert.match(migration, /function_row\.proconfig is distinct from array\['search_path=pg_catalog'\]/i);
assert.match(migration, /not function_row\.prosecdef/i);
assert.match(migration, /function_after\.oid is distinct from function_before\.oid/i);
assert.match(migration, /to_jsonb\(function_after\) - array\['prosrc', 'proargdefaults'\]/i);

assert.match(migration, /when canonical_participation\.is_starter then 'Titular'[\s\S]*?when canonical_participation\.is_called then 'Suplente'[\s\S]*?else 'Fuera'/i);
assert.match(migration, /from public\.partido_alineacion_slots lineup[\s\S]*?lineup\.scope = 'stats'[\s\S]*?lineup\.jugador_id = own_jugador_id/i);
assert.match(migration, /from public\.partido_convocados callup[\s\S]*?callup\.jugador_id = own_jugador_id/i);
assert.match(migration, /not canonical_participation\.is_starter[\s\S]*?not canonical_participation\.is_called then null/i);
assert.match(migration, /own_row\.normalized_role <> 'fuera'[\s\S]*?as match_records/i);
assert.match(migration, /own_row\.normalized_role = 'suplente'[\s\S]*?as bench_entries/i);
assert.match(migration, /count\(distinct stats\.partido_id\) filter[\s\S]*?partido_convocados callup[\s\S]*?as matches/i);
assert.match(migration, /count\(\*\) filter[\s\S]*?partido_alineacion_slots lineup[\s\S]*?as starts/i);
assert.match(migration, /public\.is_player_match_publishable\(/i);
assert.match(migration, /publication gate se perdio/i);
assert.match(publicationGate, /madrid_today > match_day/i, 'G: el dia del partido sigue sin ser publicable');
assert.match(publicationGate, /get_my_player_match_history/i, 'G: history permanece bajo el gate temporal');

assert.match(atomic, /desired\.role in \('Titular', 'Suplente'\)/i);
assert.doesNotMatch(atomic, /delete from public\.partido_estadisticas_jugador/i);

console.log('PLAYER outside role consistency SQL audit passed');
