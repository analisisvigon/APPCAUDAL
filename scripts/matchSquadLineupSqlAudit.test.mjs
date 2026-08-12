import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_match_squad_lineup_atomic.sql', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(sql, /create or replace function public\.save_match_squad_lineup_atomic\(/i);
assert.match(sql, /security invoker/i);
assert.doesNotMatch(sql, /security definer/i);
assert.match(sql, /from public\.partidos[\s\S]*for update;/i, 'el partido se bloquea antes de escribir');
assert.ok(sql.indexOf('for update;') < sql.indexOf('update public.partidos'), 'el lock precede al primer write');
assert.doesNotMatch(sql, /exception\s+when/i, 'la RPC no captura excepciones que permitan commit parcial');
assert.match(sql, /delete from public\.partido_alineacion_slots existing[\s\S]*and not exists/i, 'solo elimina slots que cambian o desaparecen');
assert.match(sql, /insert into public\.partido_alineacion_slots[\s\S]*where not exists/i, 'un snapshot repetido conserva las filas de slot existentes');

[
  'partido_alineacion_slots_match_scope_slot_h2_uidx',
  'partido_alineacion_slots_match_scope_player_h2_uidx',
  'partido_alineacion_slots_match_scope_legacy_h2_uidx',
  'partido_convocados_match_player_h2_uidx',
  'partido_convocados_match_legacy_h2_uidx',
  'partido_estadisticas_match_player_h2_uidx',
  'partido_estadisticas_match_legacy_h2_uidx',
].forEach((indexName) => assert.ok(sql.includes(indexName), `falta índice ${indexName}`));

[
  'Match not found',
  'Stats system is required',
  'A lineup cannot contain more than 11 starters',
  'Invalid lineup slot',
  'Duplicated lineup slot',
  'Duplicated squad player',
  'Duplicated lineup player',
  'A lineup slot does not belong to a starter',
  'A starter has no lineup slot',
  'Squad player not found',
  'An unavailable player cannot be a starter',
].forEach((message) => assert.ok(sql.includes(message), `falta validación RPC: ${message}`));

assert.doesNotMatch(sql, /delete from public\.partido_estadisticas_jugador/i, 'Fuera nunca elimina estadísticas históricas');
assert.match(sql, /else minutes[\s\S]*where partido_id = p_partido_id/i, 'los minutos existentes se preservan');
['yellow', 'yellow_count', 'red', 'injured', 'rating', 'replacement_name'].forEach((column) => {
  const updates = [...sql.matchAll(new RegExp(`set[\\s\\S]{0,500}\\b${column}\\s*=`, 'gi'))];
  assert.equal(updates.length, 0, `${column} no debe sobrescribirse en updates de snapshot`);
});
assert.match(sql, /revoke all on function[\s\S]*from public, anon;/i);
assert.match(sql, /grant execute on function[\s\S]*to authenticated;/i);

const mainSaveStart = appSource.indexOf('const persistStatsSquadSnapshot');
const mainSaveEnd = appSource.indexOf('const persistStatsLineupSnapshot', mainSaveStart);
const mainSave = appSource.slice(mainSaveStart, mainSaveEnd);
assert.ok(mainSave.includes("supabase.rpc('save_match_squad_lineup_atomic', snapshot)"), 'el guardado principal usa una sola RPC');
assert.ok(!mainSave.includes('supabase.from('), 'el guardado principal no conserva writes fragmentados');
assert.ok(mainSave.includes('statsSquadSaveInFlightRef.current = true'), 'la UI bloquea llamadas simultáneas');
assert.ok(mainSave.includes('statsSquadSaveInFlightRef.current = false'), 'el bloqueo se libera al terminar');
assert.ok(appSource.includes("if (!refreshed) throw new Error('La operación se guardó, pero no se pudo confirmar recargando el partido.')"), 'Guardado exige reload confirmado');
assert.ok(appSource.includes("statsSquadSaving ? 'Guardando…' : 'Guardar alineación'"), 'el botón principal muestra Guardando…');

const fragmentedLineupStart = appSource.indexOf('const persistStatsLineupSnapshot');
const fragmentedLineupEnd = appSource.indexOf('const saveStatsPlayerRole', fragmentedLineupStart);
assert.ok(!appSource.slice(fragmentedLineupStart, fragmentedLineupEnd).includes('partido_alineacion_slots'), 'DELETE/UPSERT de slots salió del frontend principal');
assert.ok(appSource.includes("reason: 'marcar todos como suplentes'"));
assert.ok(appSource.includes("reason: 'marcar once inicial'"));
assert.ok(appSource.includes('return addStatsCalledPlayersBulk([playerName]);'));
assert.ok(appSource.includes('getActiveStatsCalledPlayerNames({'), 'convocatoria visible deriva de convocatoria/slots, no de histÃ³rico');
assert.ok(!appSource.includes('starterNamesMissingMinutes'), 'cargar estadÃ­sticas ya no realiza escrituras laterales');
assert.ok(!appSource.includes('await supabase.from("partido_convocados").upsert(\n          {\n            partido_id: selectedMatch.id,\n            jugador_id: replacementPayload.jugador_id'), 'la sustituciÃ³n no reescribe convocatoria fuera del snapshot');
assert.doesNotMatch(appSource, /from\("partido_convocados"\)\s*\.(?:insert|upsert|update|delete)/, 'todas las mutaciones de convocatoria pasan por la RPC');

console.log('matchSquadLineup SQL/frontend audit passed');
