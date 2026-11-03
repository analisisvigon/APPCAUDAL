-- Solo lectura. Ejecutar antes y después de la migración en Supabase SQL Editor.
with objects as (
  select to_regclass('public.training_tasks') as task_table,
    to_regclass('public.planned_session_items') as item_table,
    to_regprocedure('public.planned_library_snapshot(uuid)') as snapshot_rpc,
    to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') as save_rpc,
    to_regprocedure('public.planned_task_series_ready_v1()') as ready_rpc
), signatures as (
  select o.*,
    (select md5(pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g'))
       from pg_catalog.pg_proc p where p.oid=o.snapshot_rpc::oid) as snapshot_hash,
    (select md5(pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g'))
       from pg_catalog.pg_proc p where p.oid=o.save_rpc::oid) as save_hash,
    (select p.prosecdef and p.proowner='postgres'::regrole and
       p.proconfig @> array['search_path=pg_catalog']
       from pg_catalog.pg_proc p where p.oid=o.snapshot_rpc::oid) as snapshot_secure,
    (select p.prosecdef and p.proowner='postgres'::regrole and
       p.proconfig @> array['search_path=pg_catalog']
       from pg_catalog.pg_proc p where p.oid=o.save_rpc::oid) as save_secure,
    (select not p.prosecdef and p.provolatile='s' and
       p.proowner='postgres'::regrole and p.proconfig @> array['search_path=pg_catalog']
       and pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g')='selecttrue'
       from pg_catalog.pg_proc p where p.oid=o.ready_rpc::oid) as ready_secure,
    (select count(*) from pg_catalog.pg_attribute a where a.attrelid=o.task_table
       and a.attname in ('series_count','minutes_per_series') and not a.attisdropped
       and a.atttypid='pg_catalog.int4'::regtype and not a.attnotnull) as series_columns,
    (select count(*) from pg_catalog.pg_constraint c where c.conrelid=o.task_table
       and c.conname='training_tasks_series_duration_ck' and c.contype='c' and c.convalidated
       and lower(pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(c.oid),'[[:space:]()]','','g'))
         = lower(pg_catalog.regexp_replace(
           'CHECK (((series_count IS NULL) AND (minutes_per_series IS NULL)) OR ((series_count IS NOT NULL) AND (minutes_per_series IS NOT NULL) AND (series_count > 0) AND (minutes_per_series > 0) AND (duration_minutes IS NOT NULL) AND ((duration_minutes)::numeric = ((series_count)::numeric * (minutes_per_series)::numeric))))',
           '[[:space:]()]','','g'))) as series_constraints
  from objects o
), checks as (
  select 'Tablas base presentes' as check_name,
    task_table is not null and item_table is not null as passed, true as required from signatures
  union all select 'Funciones 03C reconocidas',
    snapshot_hash in ('27cb3f0ecb53a2cb02aeeb82c61327f7','dc709201ad400bca07da23e6a3ee33dc') and
    save_hash in ('d4838f0ee66a2d653d34f412d27994b7','42ca2b394d5545da2789c9b687f99ed8'), true from signatures
  union all select 'Seguridad original de funciones 03C',
    snapshot_secure is true and save_secure is true, true from signatures
  union all select 'Columnas de series', series_columns=2, true from signatures
  union all select 'Restricción validada y compatible', series_constraints=1, true from signatures
  union all select 'Snapshot del servidor actualizado', snapshot_hash='dc709201ad400bca07da23e6a3ee33dc', true from signatures
  union all select 'PATCH de copia actualizado', save_hash='42ca2b394d5545da2789c9b687f99ed8', true from signatures
  union all select 'Capacidad anunciada', ready_rpc is not null, true from signatures
  union all select 'Capacidad con propietario y search_path seguros', ready_secure is true, true from signatures
  union all select 'EXECUTE authenticated',
    case when ready_rpc is null then false else
      pg_catalog.has_function_privilege('authenticated',ready_rpc::oid,'EXECUTE') end, true from signatures
  union all select 'Sin EXECUTE anon ni PUBLIC',
    case when ready_rpc is null then false else
      not pg_catalog.has_function_privilege('anon',ready_rpc::oid,'EXECUTE') and
      not exists(select 1 from pg_catalog.pg_proc p,
        lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
        where p.oid=ready_rpc::oid and acl.grantee=0 and acl.privilege_type='EXECUTE') end, true from signatures
  union all select 'RLS original de training_tasks activo',
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid=task_table),false), true from signatures
), state as (
  select case
    when bool_and(passed) then 'PASS'
    when (select snapshot_hash='27cb3f0ecb53a2cb02aeeb82c61327f7' and
           save_hash='d4838f0ee66a2d653d34f412d27994b7' and
           snapshot_secure is true and save_secure is true and
           series_columns=0 and series_constraints=0 and ready_rpc is null from signatures)
      then 'READY_TO_APPLY'
    else 'BLOCKED' end as global_status from checks where required
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result,
  'Comprobación estructural; no sustituye pruebas con identidades reales.' as detail
from checks
union all
select 'GLOBAL',global_status,
  case global_status when 'PASS' then 'Migración instalada estructuralmente.'
    when 'READY_TO_APPLY' then 'Estado original compatible; revisar y aplicar manualmente.'
    else 'Existe una divergencia; no aplicar ni considerar instalado.' end
from state;
