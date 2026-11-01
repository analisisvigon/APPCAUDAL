-- Solo lectura: ejecutar antes y despues de la migracion V1.2.
with objects as (
  select to_regclass('public.planned_session_exercise_dimensions_v12') as dimensions_table,
    to_regprocedure('public.save_planned_session_exercise_dimensions_v12(uuid,integer,text,jsonb,jsonb,jsonb)') as save_rpc
), checks as (
  select 'Dependencias V1.1 y RPC 05' as check_name,
    to_regclass('public.planned_session_board_seed_v11') is not null and
    to_regclass('public.planned_session_slots') is not null and
    to_regprocedure('public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)') is not null as ok from objects
  union all select 'Tabla y columnas V1.2', dimensions_table is not null and
    (select count(*) from pg_attribute where attrelid=dimensions_table and attnum>0 and not attisdropped)=6 from objects
  union all select 'PK, FK y rango validados',
    (select count(*) from pg_constraint where conrelid=dimensions_table and convalidated)=3 and
    exists (select 1 from pg_constraint where conrelid=dimensions_table and contype='f'
      and convalidated and confrelid=to_regclass('public.planned_session_slots')
      and confdeltype='c') from objects
  union all select 'RLS y lectura por CTS',
    coalesce((select relrowsecurity from pg_class where oid=dimensions_table),false) and
    exists (select 1 from pg_policy where polrelid=dimensions_table
      and polname='planned_session_exercise_dimensions_v12_read'
      and polcmd='r' and pg_get_expr(polqual,polrelid) like '%can_read_club_team_season%') from objects
  union all select 'Sin escritura directa de clientes',
    not coalesce(has_table_privilege('authenticated',dimensions_table,'INSERT,UPDATE,DELETE'),true) and
    not coalesce(has_table_privilege('anon',dimensions_table,'INSERT,UPDATE,DELETE'),true) from objects
  union all select 'RPC segura', exists (select 1 from pg_proc p where p.oid=save_rpc
      and p.prosecdef and p.proowner='postgres'::regrole
      and p.proconfig @> array['search_path=pg_catalog']) from objects
  union all select 'EXECUTE authenticated sin anon',
    coalesce(has_function_privilege('authenticated',save_rpc,'EXECUTE'),false) and
    not coalesce(has_function_privilege('anon',save_rpc,'EXECUTE'),true) from objects
), summary as (select count(*) as total,count(*) filter (where ok) as passed from checks)
select check_name,case when ok then 'PASS' else 'FAIL' end as result from checks
union all
select 'GLOBAL',case when passed=total then 'PASS'
  when passed=1 and (select dimensions_table is null and save_rpc is null from objects)
    then 'READY_TO_APPLY' else 'BLOCKED' end from summary;
