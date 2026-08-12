import assert from 'node:assert/strict';
import fs from 'node:fs';

const createSql = fs.readFileSync(new URL('../supabase_own_player_create_atomic.sql', import.meta.url), 'utf8');
const repairSql = fs.readFileSync(new URL('../supabase_repair_isma_cerro_identity.sql', import.meta.url), 'utf8');

assert.match(createSql, /begin;[\s\S]*create or replace function public\.create_own_player_atomic[\s\S]*commit;/i);
assert.match(createSql, /pg_advisory_xact_lock[\s\S]*p_own_player_id/i, 'el UUID propio serializa dobles envíos');
assert.match(createSql, /OWN_PLAYER_ID_ALREADY_EXISTS_WITH_INCOMPLETE_OR_CONTRADICTORY_IDENTITY/i);
assert.match(createSql, /status'[\s\S]*already_created/i, 'una segunda ejecución coherente es idempotente');
assert.match(createSql, /save_global_player_profile[\s\S]*insert into public\.player_team_memberships[\s\S]*insert into public\.jugadores[\s\S]*insert into public\.legacy_own_player_migration/is);
assert.match(createSql, /OWN_PLAYER_COMPATIBLE_GLOBAL_PROFILE_EXISTS/i, 'la RPC bloquea perfiles compatibles existentes');
assert.doesNotMatch(createSql, /alter table[\s\S]*enable row level security|create policy|drop policy/i, 'el contrato no modifica RLS');

assert.match(repairSql, /begin;[\s\S]*do \$\$[\s\S]*commit;/i);
assert.match(repairSql, /778c4e89-d806-4b7f-b7e5-072b1269fcb4/i, 'la reparación queda limitada al UUID histórico autorizado');
assert.match(repairSql, /for update/i, 'la fila histórica se bloquea antes de revalidar');
assert.match(repairSql, /compatible_profile_count <> 0[\s\S]*raise exception/i);
assert.match(repairSql, /ISMA_REPAIR_ALREADY_APPLIED/i, 'la doble ejecución no crea duplicados');
assert.match(repairSql, /own_before - 'global_player_id' - 'membership_id'[\s\S]*own_after - 'global_player_id' - 'membership_id'/i, 'solo cambian los dos vínculos autorizados');
assert.match(repairSql, /global_count_before \+ 1[\s\S]*membership_count_before \+ 1[\s\S]*mapping_count_before \+ 1/i);
assert.match(repairSql, /partido_convocados[\s\S]*partido_estadisticas_jugador[\s\S]*partido_alineacion_slots[\s\S]*partido_eventos_gol/i);
assert.doesNotMatch(repairSql, /delete from|alter table|create policy|drop policy/i, 'la reparación no borra datos ni modifica seguridad');

console.log('own player atomic SQL/UI audit passed');
