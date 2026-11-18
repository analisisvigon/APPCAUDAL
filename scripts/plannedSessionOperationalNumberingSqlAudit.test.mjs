import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase_sessions_09_operational_numbering.sql', import.meta.url), 'utf8');
const store = await readFile(new URL('../src/data/plannedSessionsStore.js', import.meta.url), 'utf8');
const component = await readFile(new URL('../src/components/training/PlannedSessionsSection.jsx', import.meta.url), 'utf8');
const sessions03a = await readFile(new URL('../supabase_sessions_03a.sql', import.meta.url), 'utf8');

const functionBody = (name) => {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `falta la función ${name}`);
  const end = migration.indexOf('$fn$;', start);
  assert.notEqual(end, -1, `no termina la función ${name}`);
  return migration.slice(start, end);
};
const reconcile = functionBody('reconcile_planned_session_operational_numbers_v1');
const setNumber = functionBody('set_planned_session_operational_number_v1');
const deferredTrigger = functionBody('guard_planned_session_operational_numbering_v1');

assert.match(migration, /obj_description\(to_regclass\('public\.planned_session_realizations'\),'pg_class'\)\s+is distinct from 'NEXO Sesiones 07: explicit session realization'/,
  'preflight exige el esquema de sesiones realizadas de la migración 07');
assert.match(migration, /obj_description\(to_regprocedure\('public\.planned_session_04b_lock\(uuid,integer\)'\),'pg_proc'\)\s+is distinct from 'APPCAUDAL Sesiones 04B: planned_session_04b_lock'/,
  'preflight exige el guard de revisión/autorización 04B conocido');
assert.match(migration, /obj_description\(to_regprocedure\('public\.guard_planned_session_lifecycle_2c\(\)'\),'pg_proc'\)\s+is distinct from 'NEXO CLUB Sesiones 2C: guard_planned_session_lifecycle_2c'/,
  'preflight exige la versión de ciclo de vida 2C que amplía de forma limitada');
assert.match(migration, /drop constraint planned_sessions_state_check[\s\S]*?session_number is not null or cancelled_at is not null or retired_at is not null/,
  'el estado confirmado solo permite número nulo para sesiones canceladas o retiradas');
assert.match(sessions03a, /create unique index if not exists planned_sessions_number_uidx[\s\S]*?where session_number is not null/i,
  'se conserva la unicidad parcial existente del número');
assert.match(migration, /planned_sessions_number_uidx[\s\S]*?indisunique and i\.indisvalid[\s\S]*?club_team_season_id, session_number[\s\S]*?session_number is not null/,
  'preflight verifica las columnas y el predicado reales del índice');

assert.match(reconcile, /can_write_club_team_season\(p_club_team_season_id\)/,
  'la reconciliación exige permiso sobre el equipo-temporada');
assert.match(reconcile, /v_status is distinct from 'open'/,
  'las temporadas cerradas no se modifican');
assert.match(setNumber, /planned_session_04b_lock\(/,
  'cada renumeración conserva los guards de revisión y autorización 04B');
assert.match(reconcile, /planning_state='confirmed' and s\.cancelled_at is null\s+and s\.retired_at is null/,
  'solo participan en la secuencia las sesiones confirmadas, activas y no retiradas');
assert.match(reconcile, /order by s\.session_date,s\.starts_at nulls first,s\.id/,
  'la secuencia sigue el orden cronológico determinista');
assert.match(reconcile, /where s\.club_team_season_id=p_club_team_season_id/,
  'cada equipo-temporada mantiene su propia secuencia');
assert.match(reconcile, /not exists\(select 1 from public\.planned_session_realizations r\s+where r\.session_id=s\.id\)/,
  'las sesiones realizadas quedan ancladas y excluidas de renumeración');
assert.match(reconcile, /set_planned_session_operational_number_v1\(\s*v_session\.id,null,'inactive'/,
  'las canceladas o retiradas no realizadas liberan su número');
assert.match(reconcile, /v_temporary[\s\S]*?set_planned_session_operational_number_v1\(\s*v_ids\[v_cycle_index\],v_temporary,'temporary'/,
  'los ciclos de intercambio se resuelven sin colisionar con el índice único');
assert.match(setNumber, /revision=revision\+1/);
assert.match(setNumber, /insert into public\.planned_session_audit_events[\s\S]*?'renumbered',array\['number'\]/,
  'cada cambio de número incrementa revisión y queda auditado');
assert.match(setNumber, /exists\(select 1 from public\.planned_session_realizations r\s+where r\.session_id=p_session_id\)/,
  'el helper bloquea expresamente cambios en números realizados');
assert.match(migration, /after insert or update or delete on public\.planned_training_sessions\s+deferrable initially deferred/,
  'confirmación, cancelación, baja, borrado e inserción disparan conciliación al final de transacción');
assert.match(deferredTrigger, /row\(new\.planning_state,new\.session_date,new\.starts_at,new\.cancelled_at,new\.retired_at\)/,
  'el trigger observa fecha, hora y ciclo de vida');
assert.match(deferredTrigger, /tg_op='INSERT'[\s\S]*?v_reason:='confirm'/,
  'confirmar una sesión nueva incorpora su fecha en el orden');
assert.match(deferredTrigger, /tg_op='DELETE'[\s\S]*?v_reason:='delete'/,
  'eliminar una sesión confirmada vuelve a compactar la secuencia');
assert.match(deferredTrigger, /old\.cancelled_at is distinct from new\.cancelled_at[\s\S]*?'cancel'/,
  'cancelar o reactivar una sesión recalcula la secuencia operativa');
assert.match(migration, /enable row level security[\s\S]*?revoke all on table public\.planned_session_number_reindex_authorizations_v1\s+from public,anon,authenticated,service_role/,
  'la autorización transaccional permanece privada y protegida por RLS');

assert.match(store, /listPlannedSessions = async[\s\S]*?await reconcilePlannedSessionNumbering\(client, clubTeamSeasonId\)/,
  'la lista y el calendario concilian antes de leer');
assert.match(store, /listPlannedSessionsForExport = async[\s\S]*?await reconcilePlannedSessionNumbering\(client, clubTeamSeasonId\)/,
  'la exportación concilia antes de leer');
assert.match(component, /fresh\.revision < revision/);
assert.match(component, /assertPlanned03cReload\(working, fresh, revision, orderChanged\)/,
  'la ficha solo tolera revisiones adicionales al ordenar una sesión confirmada');
assert.match(component, /assertPlanned03cReload\(expected, fresh, revision, true\)/,
  'la confirmación vuelve a leer el número y la revisión persistidos tras el trigger diferido');

console.log('planned session operational numbering SQL audit passed');
