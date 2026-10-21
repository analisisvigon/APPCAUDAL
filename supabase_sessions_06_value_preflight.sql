-- Sesiones 06: solo lectura. Ejecutar antes de la migración.
with checks as (
  select 'PostgreSQL 17+'::text as check_name,
    current_setting('server_version_num')::integer >= 170000 as ok,
    current_setting('server_version') as detail
  union all select 'Tablas 03A y auditoría',
    to_regclass('public.planned_training_sessions') is not null and
    to_regclass('public.planned_session_audit_events') is not null,
    'Ambas tablas deben existir'
  union all select 'Bloqueo y estado 04B',
    to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is not null and
    to_regprocedure('public.planned_session_04b_state(uuid)') is not null,
    'La nueva RPC conserva CAS y autorización de temporada'
  union all select 'Guard de sesiones activo',
    exists (select 1 from pg_trigger t where t.tgrelid=
      to_regclass('public.planned_training_sessions') and t.tgname='planned_sessions_guard'
      and not t.tgisinternal and t.tgenabled<>'D'
      and t.tgfoid=to_regprocedure('public.guard_planned_session_row()')),
    'El guard existente debe proteger también la nueva columna'
  union all select 'Sin UPDATE directo de clientes',
    not coalesce(has_table_privilege('authenticated',
      to_regclass('public.planned_training_sessions'),'UPDATE'),true)
    and not coalesce(has_table_privilege('anon',
      to_regclass('public.planned_training_sessions'),'UPDATE'),true),
    'VALOR se escribirá únicamente mediante RPC autorizada'
  union all select 'Columna VALOR ausente o compatible',
    not exists (select 1 from pg_attribute a where a.attrelid=
      to_regclass('public.planned_training_sessions') and a.attname='session_value'
      and not a.attisdropped and (a.atttypid<>'numeric'::regtype or a.attnotnull)),
    'Si ya existe debe ser numeric nullable'
  union all select 'Restricción VALOR ausente o compatible',
    not exists (select 1 from pg_constraint c where c.conrelid=
      to_regclass('public.planned_training_sessions')
      and c.conname='planned_sessions_value_check'
      and (c.contype<>'c' or not c.convalidated or
        regexp_replace(lower(pg_get_expr(c.conbin,c.conrelid)),
          '(::(numeric|smallint|integer)|[[:space:]()])','','g') is distinct from
          'session_value>=0andsession_value<=10')),
    'Un constraint previo con el mismo nombre no puede tener otra definición'
  union all select 'Sin sobrecarga incompatible',
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='save_planned_session_value_06') =
    case when to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)')
      is null then 0 else 1 end,
    'La RPC debe estar ausente o tener exactamente la firma aprobada'
  union all select 'RPC 06 ausente o propia',
    to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)') is null
    or obj_description(to_regprocedure(
      'public.save_planned_session_value_06(uuid,integer,numeric)'),'pg_proc')=
      'APPCAUDAL Sesiones 06: save_planned_session_value_06',
    'Una RPC ajena con la misma firma bloquea la migración'
), results as (
  select check_name,case when ok then 'PASS' else 'FAIL' end as result,detail from checks
)
select check_name,result,detail from results
union all
select 'GLOBAL',case when bool_and(result='PASS') then 'READY_TO_APPLY' else 'BLOCKED' end,
  count(*)::text || ' comprobaciones' from results;
