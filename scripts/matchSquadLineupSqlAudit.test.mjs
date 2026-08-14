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

assert.doesNotMatch(sql, /information_schema\.columns/i, 'el preflight no depende de information_schema');
assert.match(sql, /pg_catalog\.to_regclass/i, 'el preflight resuelve tablas public por OID');
assert.match(sql, /from pg_catalog\.pg_attribute existing/i, 'el preflight comprueba columnas en pg_catalog');
assert.ok(sql.includes("('partido_estadisticas_jugador', 'raw_data')"), 'el contrato real incluye raw_data');

assert.doesNotMatch(sql, /create\s+(?:unique\s+)?index/i, 'H2 no crea indices redundantes');
assert.doesNotMatch(sql, /alter\s+table/i, 'H2 no altera tablas del esquema real');
assert.doesNotMatch(sql, /create\s+policy|drop\s+policy|enable\s+row\s+level\s+security/i, 'H2 no modifica RLS');
assert.ok(sql.includes('partido_alineacion_slots (partido_id, scope, slot)'), 'documenta el UNIQUE real de slots');
assert.ok(sql.includes('partido_convocados (partido_id, player_name)'), 'documenta el UNIQUE real de convocatoria');
assert.ok(sql.includes('partido_estadisticas_jugador (partido_id, player_name)'), 'documenta el UNIQUE real de estadisticas');

assert.match(sql, /delete from public\.partido_alineacion_slots existing[\s\S]*existing\.scope = 'stats'[\s\S]*and not exists/i, 'solo elimina slots stats ausentes');
assert.match(sql, /on conflict \(partido_id, scope, slot\) do update/i, 'slots reutiliza el UNIQUE real por partido/scope/slot');

[
  'Match not found',
  'Stats system is required',
  'A lineup cannot contain more than 11 starters',
  'Invalid lineup slot',
  'Duplicated lineup slot',
  'Duplicated squad player',
  'Duplicated active player_name conflicts with legacy unique constraint',
  'Duplicated lineup player',
  'A lineup slot does not belong to a starter',
  'A starter has no lineup slot',
  'Squad player not found',
  'An unavailable player cannot be a starter',
].forEach((message) => assert.ok(sql.includes(message), `falta validacion RPC: ${message}`));

assert.doesNotMatch(sql, /delete from public\.partido_estadisticas_jugador/i, 'Fuera nunca elimina estadisticas historicas');
assert.match(sql, /else minutes[\s\S]*where partido_id = p_partido_id/i, 'los minutos existentes se preservan');
['yellow', 'yellow_count', 'red', 'injured', 'rating', 'replacement_name', 'raw_data'].forEach((column) => {
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
assert.ok(mainSave.includes('statsSquadSaveInFlightRef.current = true'), 'la UI bloquea llamadas simultaneas');
assert.ok(mainSave.includes('statsSquadSaveInFlightRef.current = false'), 'el bloqueo se libera al terminar');
assert.ok(appSource.includes("if (!refreshed) throw new Error('La operacion se guardo, pero no se pudo confirmar recargando el partido.')")
  || appSource.includes("if (!refreshed) throw new Error('La operación se guardó, pero no se pudo confirmar recargando el partido.')"), 'Guardado exige reload confirmado');
assert.ok(appSource.includes("statsSquadSaving ? 'Guardando…' : 'Guardar alineación'")
  || appSource.includes("statsSquadSaving ? 'Guardandoâ€¦' : 'Guardar alineaciÃ³n'"), 'el boton principal muestra Guardando');

const fragmentedLineupStart = appSource.indexOf('const persistStatsLineupSnapshot');
const fragmentedLineupEnd = appSource.indexOf('const saveStatsPlayerRole', fragmentedLineupStart);
assert.doesNotMatch(
  appSource.slice(fragmentedLineupStart, fragmentedLineupEnd),
  /from\(['"]partido_alineacion_slots['"]\)\s*\.(?:insert|upsert|update|delete)/,
  'el frontend puede leer histórico stats, pero DELETE/UPSERT de slots sigue dentro de H2'
);
assert.ok(appSource.includes("reason: 'marcar todos como suplentes'"));
assert.ok(appSource.includes("reason: 'marcar once inicial'"));
assert.ok(appSource.includes('return addStatsCalledPlayersBulk([playerName]);'));
assert.ok(appSource.includes('getActiveStatsCalledPlayerNames({'), 'convocatoria visible deriva de convocatoria/slots, no del historico');
assert.ok(!appSource.includes('starterNamesMissingMinutes'), 'cargar estadisticas no realiza escrituras laterales');
assert.doesNotMatch(appSource, /from\("partido_convocados"\)\s*\.(?:insert|upsert|update|delete)/, 'las mutaciones de convocatoria pasan por la RPC');

console.log('matchSquadLineup SQL/frontend audit passed');
