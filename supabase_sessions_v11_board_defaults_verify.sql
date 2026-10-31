-- Solo lectura. Ejecutar antes (READY_TO_APPLY) y despues (PASS).
with objects as (
  select to_regclass('public.planned_cts_board_defaults_v11') as defaults_table,
    to_regclass('public.planned_session_board_seed_v11') as seed_table,
    to_regprocedure('public.fix_planned_board_default_v11(uuid,text)') as fix_fn,
    to_regprocedure('public.save_planned_field_dimensions_v11(uuid,integer,numeric,numeric)') as field_fn
), checks as (
  select 'dependencias 03A/04B/05' as check_name,
    to_regclass('public.club_team_seasons') is not null and
    to_regclass('public.planned_training_sessions') is not null and
    to_regclass('public.planned_session_distributions') is not null and
    to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is not null as ok from objects
  union all select 'tablas V1.1', defaults_table is not null and seed_table is not null from objects
  union all select 'columnas y restricciones V1.1',
    (select count(*) from pg_attribute where attrelid=defaults_table and attnum>0 and not attisdropped)=6 and
    (select count(*) from pg_attribute where attrelid=seed_table and attnum>0 and not attisdropped)=6 and
    (select count(*) from pg_constraint where conrelid=defaults_table and convalidated)=5 and
    (select count(*) from pg_constraint where conrelid=seed_table and convalidated)=5 from objects
  union all select 'RLS habilitada', coalesce((select bool_and(c.relrowsecurity)
    from pg_class c where c.oid in (defaults_table,seed_table)),false) and
    (select count(*) from pg_class c where c.oid in (defaults_table,seed_table))=2 from objects
  union all select 'FK validada de preferencias a CTS', exists (select 1 from pg_constraint c
    where c.conrelid=defaults_table and c.contype='f' and c.convalidated
      and c.confrelid=to_regclass('public.club_team_seasons')) from objects
  union all select 'FK validada de copia a sesion', exists (select 1 from pg_constraint c
    where c.conrelid=seed_table and c.contype='f' and c.convalidated
      and c.confrelid=to_regclass('public.planned_training_sessions')) from objects
  union all select 'politicas de lectura CTS instaladas', (select count(*) from pg_policy p
    where (p.polrelid=defaults_table and p.polname='planned_cts_board_defaults_v11_read') or
      (p.polrelid=seed_table and p.polname='planned_session_board_seed_v11_read'))=2 from objects
  union all select 'sin escritura directa authenticated/anon',
    not coalesce(has_table_privilege('authenticated',defaults_table,'INSERT,UPDATE,DELETE'),true) and
    not coalesce(has_table_privilege('authenticated',seed_table,'INSERT,UPDATE,DELETE'),true) and
    not coalesce(has_table_privilege('anon',defaults_table,'INSERT,UPDATE,DELETE'),true) and
    not coalesce(has_table_privilege('anon',seed_table,'INSERT,UPDATE,DELETE'),true) from objects
  union all select 'RPC SECURITY DEFINER y search_path', (select count(*) from pg_proc p
    where p.oid in (fix_fn,field_fn) and p.prosecdef and p.proowner='postgres'::regrole
      and p.proconfig @> array['search_path=pg_catalog'])=2 from objects
  union all select 'EXECUTE solo authenticated entre roles cliente',
    coalesce(has_function_privilege('authenticated',fix_fn,'EXECUTE'),false) and
    coalesce(has_function_privilege('authenticated',field_fn,'EXECUTE'),false) and
    not coalesce(has_function_privilege('anon',fix_fn,'EXECUTE'),true) and
    not coalesce(has_function_privilege('anon',field_fn,'EXECUTE'),true) from objects
  union all select 'trigger de copia inicial', exists (select 1 from pg_trigger t
    where t.tgrelid=to_regclass('public.planned_training_sessions')
      and t.tgname='planned_board_seed_v11' and t.tgenabled='O'
      and not t.tgisinternal and t.tgfoid=to_regprocedure('public.seed_planned_board_v11()')
      and (t.tgtype::integer & 4)=4 and (t.tgtype::integer & 2)=0
      and (t.tgtype::integer & 16)=0 and (t.tgtype::integer & 8)=0) from objects
  union all select 'RPC 05 original disponible',
    to_regprocedure('public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)') is not null from objects
), summary as (select count(*) as total, count(*) filter(where ok) as passed from checks)
select check_name, case when ok then 'PASS' else 'FAIL' end as result
from checks
union all
select 'GLOBAL', case when passed=total then 'PASS'
  when passed=2 and (select defaults_table is null and seed_table is null from objects)
    then 'READY_TO_APPLY' else 'BLOCKED' end from summary;
