-- Solo lectura. Ejecutar manualmente tras instalar 4B. No simula identidades.
with checks as (
  select 'RPC 4B instalada y sin sobrecargas' as check_name,
    (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'save_cts_daily_training_load_4b') = 1
    and to_regprocedure('public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)') is not null as ok
  union all
  select 'RPC SECURITY DEFINER, postgres y search_path fijo',
    coalesce((select p.prosecdef and p.proconfig = array['search_path=pg_catalog']::text[]
      and p.proowner = (select oid from pg_catalog.pg_roles where rolname = 'postgres')
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)')), false)
  union all
  select 'guards SECURITY DEFINER, postgres y search_path fijo',
    (select count(*) from pg_catalog.pg_proc p
      where p.oid in (to_regprocedure('public.guard_cts_physical_session_4b()'),
                      to_regprocedure('public.guard_cts_physical_metric_4b()'))
        and p.prosecdef and p.proconfig = array['search_path=pg_catalog']::text[]
        and p.proowner = (select oid from pg_catalog.pg_roles where rolname = 'postgres')) = 2
  union all
  select 'guards sin EXECUTE directo de clientes',
    (select count(*) from pg_catalog.pg_proc p
      where p.oid in (to_regprocedure('public.guard_cts_physical_session_4b()'),
                      to_regprocedure('public.guard_cts_physical_metric_4b()'))
        and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        and not exists (select 1 from pg_catalog.aclexplode(p.proacl) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE')) = 2
  union all
  select 'EXECUTE authenticated, sin anon ni PUBLIC',
    coalesce(pg_catalog.has_function_privilege('authenticated',
      to_regprocedure('public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)'), 'EXECUTE'), false)
    and coalesce(not pg_catalog.has_function_privilege('anon',
      to_regprocedure('public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)'), 'EXECUTE'), false)
    and not exists (select 1 from pg_catalog.pg_proc p,
      pg_catalog.aclexplode(p.proacl) acl
      where p.oid = to_regprocedure('public.save_cts_daily_training_load_4b(uuid,date,text,integer,numeric,numeric,integer,integer,integer,numeric,numeric,text,uuid)')
        and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
  union all
  select 'guard de sesiones en UPDATE y DELETE',
    exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = to_regclass('public.training_sessions')
        and t.tgname = 'guard_cts_physical_session_4b'
        and t.tgtype = 27 and t.tgenabled = 'O' and not t.tgisinternal
        and t.tgfoid = to_regprocedure('public.guard_cts_physical_session_4b()'))
  union all
  select 'guard de metricas en INSERT UPDATE y DELETE',
    exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = to_regclass('public.training_session_load_metrics')
        and t.tgname = 'guard_cts_physical_metric_4b'
        and t.tgtype = 31 and t.tgenabled = 'O' and not t.tgisinternal
        and t.tgfoid = to_regprocedure('public.guard_cts_physical_metric_4b()'))
  union all
  select 'vinculos 4A sin escritura directa authenticated',
    coalesce(not pg_catalog.has_table_privilege('authenticated',
      to_regclass('public.microcycle_physical_session_links'),
      'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN'), false)
  union all
  select 'consulta colectiva 4A disponible',
    to_regprocedure('public.get_microcycle_team_loads_4a(uuid,date)') is not null
), result as (
  select check_name, case when ok then 'PASS' else 'FAIL' end as status,
    case when ok then 'Contrato estructural esperado' else 'Revisar antes de activar el frontend' end as detail
  from checks
), diagnostics as (
  select 'sesiones fisicas sin vinculo CTS' as check_name, 'INFO' as status,
    count(*)::text as detail
  from public.training_sessions s
  left join public.microcycle_physical_session_links l on l.training_session_id = s.id
  where l.training_session_id is null
  union all
  select 'sesiones fisicas vinculadas', 'INFO', count(*)::text
  from public.microcycle_physical_session_links
)
select report.check_name, report.status, report.detail from (
  select * from result
  union all select * from diagnostics
  union all select 'GLOBAL',
    case when (select bool_and(status = 'PASS') from result) then 'PASS' else 'FAIL' end,
    (select count(*)::text from result) || ' verificaciones estructurales'
) report
order by (report.check_name = 'GLOBAL'), report.check_name;
