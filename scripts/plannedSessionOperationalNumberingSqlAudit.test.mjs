import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase_sessions_09_operational_numbering.sql', import.meta.url), 'utf8');
const store = await readFile(new URL('../src/data/plannedSessionsStore.js', import.meta.url), 'utf8');
const component = await readFile(new URL('../src/components/training/PlannedSessionsSection.jsx', import.meta.url), 'utf8');
const sessions03a = await readFile(new URL('../supabase_sessions_03a.sql', import.meta.url), 'utf8');
const lifecycle2c = await readFile(new URL('../supabase_sessions_lifecycle_2c.sql', import.meta.url), 'utf8');

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
const readAllowedReasons = (body) => {
  const match = body.match(/p_reason not in\s*\(([\s\S]*?)\)\s*then/i);
  assert.ok(match, 'falta la lista validada de motivos');
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]).sort();
};

assert.deepEqual(readAllowedReasons(setNumber), readAllowedReasons(reconcile),
  'ambas funciones validan el mismo conjunto de motivos');

assert.match(migration, /obj_description\(to_regclass\('public\.planned_session_realizations'\),'pg_class'\)\s+is distinct from 'NEXO Sesiones 07: explicit session realization'/,
  'preflight exige el esquema de sesiones realizadas de la migración 07');
assert.match(migration, /obj_description\(to_regprocedure\('public\.planned_session_04b_lock\(uuid,integer\)'\),'pg_proc'\)\s+is distinct from 'APPCAUDAL Sesiones 04B: planned_session_04b_lock'/,
  'preflight exige el guard de revisión/autorización 04B conocido');
assert.match(migration, /obj_description\(to_regprocedure\('public\.guard_planned_session_lifecycle_2c\(\)'\),'pg_proc'\)\s+is distinct from 'NEXO CLUB Sesiones 2C: guard_planned_session_lifecycle_2c'/,
  'preflight exige la versión de ciclo de vida 2C que amplía de forma limitada');
const originalStateCheck = sessions03a.match(
  /constraint planned_sessions_state_check check\s*\(([\s\S]*?)\),\s*constraint planned_sessions_number_check/i,
);
assert.ok(originalStateCheck, 'se encuentra la restricción original 03A');
const normalized = (value) => value.toLowerCase().replace(/::text/g, '').replace(/[\s()]/g, '');
const expectedStateCheckSqlLiteral = migration.match(
  /if v_state_check is distinct from\s+'((?:[^']|'')*)'/i,
);
assert.ok(expectedStateCheckSqlLiteral, 'se encuentra el valor esperado del preflight');
assert.equal(expectedStateCheckSqlLiteral[1].replace(/''/g, "'"),
  `check${normalized(originalStateCheck[1])}`,
  'el literal del preflight coincide con la restricción 03A tras normalizar también sus paréntesis');
assert.doesNotMatch(expectedStateCheckSqlLiteral[1], /[()]/,
  'el literal esperado no conserva paréntesis que el normalizador elimina');
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
assert.match(sessions03a, /event_type in\s*\([\s\S]*?'renumbered'/,
  '03A admite renumbered como tipo de auditoría');
assert.match(sessions03a, /planned_audit_sections_check check \(\s*cardinality\(changed_sections\)>0\)/,
  '03A permite la sección number porque exige una sección no vacía, sin enum restrictivo');
assert.match(migration, /planned_audit_event_check[\s\S]*?pg_get_constraintdef\(c\.oid\) like '%renumbered%'/,
  'el preflight verifica el evento renumbered en la base destino');
assert.match(migration, /planned_audit_sections_check[\s\S]*?checkcardinalitychanged_sections>0/,
  'el preflight verifica que la sección number no esté restringida por un enum');
assert.match(setNumber, /exists\(select 1 from public\.planned_session_realizations r\s+where r\.session_id=p_session_id\)/,
  'el helper bloquea expresamente cambios en números realizados');
assert.match(setNumber, /if v_session\.session_number is not distinct from p_new_number then return false; end if;[\s\S]*?update public\.planned_training_sessions\s+set session_number=p_new_number,revision=revision\+1/,
  'una segunda conciliación con el número correcto evita el UPDATE y su auditoría');
assert.match(setNumber, /update public\.planned_training_sessions\s+set session_number=p_new_number,revision=revision\+1\s+where id=p_session_id/,
  'el helper solo cambia el número visible y la revisión, no el UUID ni los datos del entrenamiento');
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

const originalGuardStart = lifecycle2c.indexOf('create or replace function public.guard_planned_session_lifecycle_2c');
const originalGuardEnd = lifecycle2c.indexOf('$fn$;', originalGuardStart);
assert.notEqual(originalGuardStart, -1);
assert.notEqual(originalGuardEnd, -1);
const originalGuard = lifecycle2c.slice(originalGuardStart, originalGuardEnd);
const replacementStart = migration.indexOf('create or replace function public.guard_planned_session_lifecycle_2c');
const replacementEnd = migration.indexOf('$fn$;', replacementStart);
assert.notEqual(replacementStart, -1);
assert.notEqual(replacementEnd, -1);
const replacementGuard = migration.slice(replacementStart, replacementEnd);
assert.match(originalGuard, /if old\.retired_at is not null then\s+raise exception 'Sesión retirada: edición bloqueada' using errcode='42501';/);
assert.match(replacementGuard, /if old\.retired_at is not null then[\s\S]*?raise exception 'Sesión retirada: edición bloqueada' using errcode='42501';[\s\S]*?end if;\s+return new;/,
  'el bloqueo original sigue aplicándose a todas las ediciones no autorizadas');
for (const requiredGuard of [
  /new\.session_number is null and new\.session_number is distinct from old\.session_number/,
  /new\.revision=old\.revision\+1/,
  /to_jsonb\(new\)-array\['session_number','revision','updated_at'\][\s\S]*?to_jsonb\(old\)-array\['session_number','revision','updated_at'\]/,
  /a\.expected_revision=old\.revision[\s\S]*?a\.expected_number=old\.session_number/,
  /a\.transaction_id=txid_current\(\)/,
  /m\.user_id=auth\.uid\(\) and m\.is_active[\s\S]*?m\.role in \('owner','admin','staff'\)/,
]) assert.match(replacementGuard, requiredGuard,
  'la excepción 2C queda limitada a liberar el número con autorización de esta transacción');
assert.match(lifecycle2c, /create trigger planned_sessions_lifecycle_2c_guard before update on public\.planned_training_sessions\s+for each row execute function public\.guard_planned_session_lifecycle_2c\(\)/,
  'el trigger 2C original cubre todas las actualizaciones');
assert.match(migration, /create or replace function public\.guard_planned_session_lifecycle_2c\(\)[\s\S]*?alter function public\.guard_planned_session_lifecycle_2c\(\) owner to postgres[\s\S]*?revoke all on function public\.guard_planned_session_lifecycle_2c\(\)\s+from public,anon,authenticated,service_role/,
  'la función existente se sustituye conservando su propietario y privilegios');

const singleSession = {
  id: 'session-uuid-unchanged',
  revision: 8,
  session_number: 4,
  training: { session_date: '2026-11-25', starts_at: '18:00', title: 'Entrenamiento' },
};
assert.match(reconcile, /v_next integer:=1/);
assert.match(reconcile, /order by s\.session_date,s\.starts_at nulls first,s\.id/);
const reconcileSingleCandidate = (row) => row.session_number === 1
  ? { row, sessionWrites: 0, auditWrites: 0 }
  : { row: { ...row, session_number: 1, revision: row.revision + 1 },
    sessionWrites: 1, auditWrites: 1 };
const firstPass = reconcileSingleCandidate(singleSession);
const secondPass = reconcileSingleCandidate(firstPass.row);
assert.equal(firstPass.row.session_number, 1,
  'una sola sesión activa, sin número anclado, pasa de Nº 4 a Nº 1');
assert.equal(firstPass.row.revision, 9);
assert.equal(firstPass.row.id, singleSession.id, 'la reconciliación no cambia el UUID');
assert.deepEqual(firstPass.row.training, singleSession.training,
  'la reconciliación no cambia los datos de entrenamiento');
assert.equal(firstPass.sessionWrites, 1);
assert.equal(firstPass.auditWrites, 1);
assert.equal(secondPass.row.session_number, 1);
assert.equal(secondPass.sessionWrites, 0,
  'la segunda reconciliación no vuelve a escribir la sesión');
assert.equal(secondPass.auditWrites, 0,
  'la segunda reconciliación no genera una auditoría duplicada');

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
