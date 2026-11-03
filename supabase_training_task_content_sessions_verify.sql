-- Read-only. Run before and after installing supabase_training_task_content_sessions.sql.
-- PASS means installed; READY_TO_APPLY means the preceding series migration is present.
with objects as (
  select to_regclass('public.training_tasks') as task_table,
    to_regclass('public.planned_session_items') as item_table,
    to_regprocedure('public.planned_library_snapshot(uuid)') as snapshot_fn,
    to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') as save_fn,
    to_regprocedure('public.planned_task_series_ready_v1()') as series_fn,
    to_regprocedure('public.planned_task_content_ready_v1()') as content_fn
), checks as (
  select 'required_tables' as check_name,
    task_table is not null and item_table is not null as ok from objects
  union all
  select 'series_dependency', series_fn is not null and
    exists(select 1 from pg_catalog.pg_attribute a, objects o where a.attrelid=o.task_table
      and a.attname='series_count' and a.atttypid='pg_catalog.int4'::regtype and not a.attisdropped)
    from objects
  union all
  select 'new_columns',
    (select count(*)=3 from pg_catalog.pg_attribute a, objects o
      where a.attrelid=o.task_table and a.attname=any(array[
        'exercise_rules','tactical_content_offensive','tactical_content_defensive'])
        and a.atttypid='pg_catalog.text'::regtype and not a.attnotnull and not a.attisdropped)
    from objects
  union all
  select 'length_constraint', exists(select 1 from pg_catalog.pg_constraint c, objects o
    where c.conrelid=o.task_table and c.conname='training_tasks_content_length_ck'
      and c.contype='c' and c.convalidated
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(c.oid),'[[:space:]()]','','g')) =
        pg_catalog.lower(pg_catalog.regexp_replace(
          'CHECK (coalesce(char_length(exercise_rules),0)<=10000 AND coalesce(char_length(tactical_content_offensive),0)<=10000 AND coalesce(char_length(tactical_content_defensive),0)<=10000)',
          '[[:space:]()]','','g'))) from objects
  union all
  select 'snapshot_function', exists(select 1 from pg_catalog.pg_proc p, objects o
    where p.oid=o.snapshot_fn and p.prosecdef and p.proowner='postgres'::regrole
      and p.proconfig @> array['search_path=pg_catalog']
      and md5(pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g'))=
        '205c3c815b1b13c39d0690db72480b32') from objects
  union all
  select 'save_function', exists(select 1 from pg_catalog.pg_proc p, objects o
    where p.oid=o.save_fn and p.prosecdef and p.proowner='postgres'::regrole
      and p.proconfig @> array['search_path=pg_catalog']
      and md5(pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g'))=
        '5987149287ef42d6971c09fd3df7c94b') from objects
  union all
  select 'capability_function', exists(select 1 from pg_catalog.pg_proc p, objects o
    where p.oid=o.content_fn and not p.prosecdef and p.provolatile='s'
      and p.proowner='postgres'::regrole and p.proconfig @> array['search_path=pg_catalog']
      and pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g')='selecttrue') from objects
  union all
  select 'capability_execute', case when content_fn is null then false else
    pg_catalog.has_function_privilege('authenticated',content_fn,'EXECUTE') and
    not pg_catalog.has_function_privilege('anon',content_fn,'EXECUTE') and
    not exists(select 1 from pg_catalog.pg_proc p,
      lateral pg_catalog.aclexplode(coalesce(p.proacl,
        pg_catalog.acldefault('f',p.proowner))) acl
      where p.oid=content_fn and acl.grantee=0 and acl.privilege_type='EXECUTE')
    end from objects
  union all
  select 'task_rls_enabled', exists(select 1 from pg_catalog.pg_class c, objects o
    where c.oid=o.task_table and c.relrowsecurity) from objects
), baseline as (
  select
    (select md5(pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g'))
      from pg_catalog.pg_proc p where p.oid=o.snapshot_fn and p.prosecdef
        and p.proowner='postgres'::regrole and p.proconfig @> array['search_path=pg_catalog']) =
      'dc709201ad400bca07da23e6a3ee33dc' as snapshot_original,
    (select md5(pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g'))
      from pg_catalog.pg_proc p where p.oid=o.save_fn and p.prosecdef
        and p.proowner='postgres'::regrole and p.proconfig @> array['search_path=pg_catalog']) =
      '42ca2b394d5545da2789c9b687f99ed8' as save_original,
    not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=o.task_table
      and a.attname=any(array['exercise_rules','tactical_content_offensive',
        'tactical_content_defensive']) and not a.attisdropped) as no_columns,
    not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=o.task_table
      and c.conname='training_tasks_content_length_ck') as no_constraint,
    o.content_fn is null as no_capability
  from objects o
), summary as (
  select case
    when bool_and(ok) then 'PASS'
    when (select ok from checks where check_name='required_tables') and
         (select ok from checks where check_name='series_dependency') and
         (select ok from checks where check_name='task_rls_enabled') and
         (select snapshot_original and save_original and no_columns and
            no_constraint and no_capability from baseline) then 'READY_TO_APPLY'
    else 'BLOCKED' end as result from checks
)
select check_name, case when ok then 'PASS' else 'FAIL' end as result,
  case check_name
    when 'required_tables' then 'Biblioteca y Sesiones 03C disponibles'
    when 'series_dependency' then 'Instalar primero la migracion de series'
    when 'new_columns' then 'Tres columnas opcionales de texto'
    when 'length_constraint' then 'Limite de 10000 caracteres por campo'
    when 'snapshot_function' then 'Copia canonica del contenido al snapshot'
    when 'save_function' then 'PATCH permitido sin tocar source'
    when 'capability_function' then 'Capacidad anunciada al frontend'
    when 'capability_execute' then 'Solo authenticated ejecuta la capacidad'
    when 'task_rls_enabled' then 'RLS de Biblioteca permanece activo'
  end as explanation from checks
union all
select 'GLOBAL', result, 'PASS instalado; READY_TO_APPLY requiere revision; BLOCKED no aplicar' from summary;
