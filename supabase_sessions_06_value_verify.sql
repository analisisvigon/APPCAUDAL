-- Sesiones 06: solo lectura. Ejecutar después de la migración.
with checks as (
  select 'Columna VALOR'::text as check_name,
    exists (select 1 from pg_attribute a where a.attrelid=
      to_regclass('public.planned_training_sessions') and a.attname='session_value'
      and not a.attisdropped and a.atttypid='numeric'::regtype and not a.attnotnull) as ok,
    'numeric opcional; NULL conserva sesiones existentes'::text as detail
  union all select 'Constraint validado 0-10',
    exists (select 1 from pg_constraint c where c.conrelid=
      to_regclass('public.planned_training_sessions')
      and c.conname='planned_sessions_value_check' and c.contype='c' and c.convalidated
      and regexp_replace(lower(pg_get_expr(c.conbin,c.conrelid)),
        '(::(numeric|smallint|integer)|[[:space:]()])','','g')=
        'session_value>=0andsession_value<=10'),
    'La base rechaza valores fuera de 0-10'
  union all select 'RPC y propietario',
    exists (select 1 from pg_proc p where p.oid=
      to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)')
      and p.prosecdef and p.provolatile='v'
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_get_userbyid(p.proowner)='postgres'),
    'SECURITY DEFINER, VOLATILE y search_path aislado'
  union all select 'Sin sobrecargas',
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='save_planned_session_value_06')=1,
    'Firma única de la RPC 06'
  union all select 'EXECUTE authenticated/anon',
    coalesce(has_function_privilege('authenticated',
      to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)'),
      'EXECUTE'),false)
    and not coalesce(has_function_privilege('anon',
      to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)'),
      'EXECUTE'),true),
    'authenticated permitido; anon denegado'
  union all select 'PUBLIC sin EXECUTE directo',
    not exists (select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid=to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)')
        and a.grantee=0 and a.privilege_type='EXECUTE'),
    'Sin concesión directa a PUBLIC'
  union all select 'RLS de sesiones conservado',
    exists (select 1 from pg_class c where c.oid=
      to_regclass('public.planned_training_sessions') and c.relrowsecurity),
    'La migración no desactiva RLS'
  union all select 'Sin UPDATE directo de clientes',
    not coalesce(has_table_privilege('authenticated',
      to_regclass('public.planned_training_sessions'),'UPDATE'),true)
    and not coalesce(has_table_privilege('anon',
      to_regclass('public.planned_training_sessions'),'UPDATE'),true),
    'Los cambios de VALOR pasan por revisión CAS y auditoría'
  union all select 'Datos VALOR dentro de rango',
    not exists (select 1 from public.planned_training_sessions s
      where s.session_value is not null and
        (s.session_value<0 or s.session_value>10)),
    'No se imprimen valores de sesiones; solo se comprueba el rango'
  union all select 'Guard de sesiones activo',
    exists (select 1 from pg_trigger t where t.tgrelid=
      to_regclass('public.planned_training_sessions') and t.tgname='planned_sessions_guard'
      and not t.tgisinternal and t.tgenabled<>'D'
      and t.tgfoid=to_regprocedure('public.guard_planned_session_row()')),
    'La RPC 06 sigue pasando por el guard existente'
  union all select 'RPC 03A/03C/05 conservadas',
    to_regprocedure('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') is not null
    and to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') is not null
    and to_regprocedure('public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)') is not null,
    'Las tres funciones existentes siguen instaladas'
), results as (
  select check_name,case when ok then 'PASS' else 'FAIL' end as result,detail from checks
)
select check_name,result,detail from results
union all
select 'GLOBAL',case when bool_and(result='PASS') then 'PASS' else 'FAIL' end,
  count(*)::text || ' comprobaciones estructurales; faltan pruebas reales con identidades'
  from results;
