-- Solo lectura. Ejecutar manualmente tras instalar 4B. No simula identidades.
with policy_expected(table_name, policy_name, command, uses_check, column_name) as (
  values
    ('training_sessions','microcycle_4b_sessions_update','w',true,'id'),
    ('training_sessions','microcycle_4b_sessions_delete','d',false,'id'),
    ('training_session_load_metrics','microcycle_4b_metrics_insert','a',true,'session_id'),
    ('training_session_load_metrics','microcycle_4b_metrics_update','w',true,'session_id'),
    ('training_session_load_metrics','microcycle_4b_metrics_delete','d',false,'session_id')
), policy_actual as (
  select e.policy_name,
    p.oid is not null and not p.polpermissive and p.polcmd::text = e.command
      and pg_catalog.cardinality(p.polroles) = 1
      and p.polroles @> array[(select r.oid from pg_catalog.pg_roles r
        where r.rolname = 'authenticated')]::oid[]
      and (case when e.command = 'a' then p.polqual is null
        else pg_catalog.replace(pg_catalog.regexp_replace(pg_catalog.lower(
          pg_catalog.pg_get_expr(p.polqual,p.polrelid)), '[[:space:]()]','','g'),
          'public.','') = 'is_unlinked_physical_session_4b' || e.column_name end)
      and (case when e.uses_check then
        pg_catalog.replace(pg_catalog.regexp_replace(pg_catalog.lower(
          pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)), '[[:space:]()]','','g'),
          'public.','') = 'is_unlinked_physical_session_4b' || e.column_name
        else p.polwithcheck is null end) as ok
  from policy_expected e
  left join pg_catalog.pg_policy p on p.polrelid = pg_catalog.to_regclass('public.' || e.table_name)
    and p.polname = e.policy_name
), checks as (
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
  select 'helper RLS SECURITY DEFINER y EXECUTE controlado',
    coalesce((select p.prosecdef and p.provolatile = 's'
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and p.proowner = (select oid from pg_catalog.pg_roles where rolname = 'postgres')
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.is_unlinked_physical_session_4b(uuid)')), false)
    and coalesce(pg_catalog.has_function_privilege('authenticated',
      to_regprocedure('public.is_unlinked_physical_session_4b(uuid)'), 'EXECUTE'), false)
    and coalesce(not pg_catalog.has_function_privilege('anon',
      to_regprocedure('public.is_unlinked_physical_session_4b(uuid)'), 'EXECUTE'), false)
  union all
  select 'cinco politicas RESTRICTIVE exactas para escrituras legacy',
    (select count(*) from policy_actual where ok) = 5
  union all
  select 'RLS activa en sesiones y metricas legacy',
    (select count(*) from pg_catalog.pg_class c
      where c.oid in (to_regclass('public.training_sessions'),
                      to_regclass('public.training_session_load_metrics'))
        and c.relrowsecurity) = 2
  union all
  select 'authenticated no elude RLS en tablas legacy',
    not exists (select 1 from pg_catalog.pg_roles r
      where r.rolname = 'authenticated' and r.rolbypassrls)
    and not exists (select 1 from pg_catalog.pg_class c
      where c.oid in (to_regclass('public.training_sessions'),
                      to_regclass('public.training_session_load_metrics'))
        and c.relowner = (select r.oid from pg_catalog.pg_roles r
          where r.rolname = 'authenticated') and not c.relforcerowsecurity)
  union all
  select 'UNIQUE de id y fecha en sesiones',
    exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('public.training_sessions')
        and c.conname = 'training_sessions_id_date_4b_key'
        and c.contype = 'u' and c.convalidated
        and pg_catalog.cardinality(c.conkey) = 2
        and c.conkey[1] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = c.conrelid and a.attname = 'id')
        and c.conkey[2] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = c.conrelid and a.attname = 'session_date'))
  union all
  select 'UNIQUE real de CTS y fecha del vinculo',
    exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('public.microcycle_physical_session_links')
        and c.conname = 'microcycle_physical_session_links_cts_date_4b_key'
        and c.contype = 'u' and c.convalidated
        and pg_catalog.cardinality(c.conkey) = 2
        and c.conkey[1] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = c.conrelid and a.attname = 'club_team_season_id')
        and c.conkey[2] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = c.conrelid and a.attname = 'session_date'))
  union all
  select 'FK compuesta de fecha validada con UPDATE CASCADE y DELETE RESTRICT',
    exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('public.microcycle_physical_session_links')
        and c.conname = 'microcycle_physical_session_links_session_date_4b_fkey'
        and c.contype = 'f' and c.convalidated
        and c.confrelid = to_regclass('public.training_sessions')
        and c.confupdtype = 'c' and c.confdeltype = 'r'
        and pg_catalog.cardinality(c.conkey) = 2
        and pg_catalog.cardinality(c.confkey) = 2
        and c.conkey[1] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = c.conrelid and a.attname = 'training_session_id')
        and c.conkey[2] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = c.conrelid and a.attname = 'session_date')
        and c.confkey[1] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = c.confrelid and a.attname = 'id')
        and c.confkey[2] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = c.confrelid and a.attname = 'session_date'))
  union all
  select 'fechas vinculadas obligatorias y coherentes',
    exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('public.microcycle_physical_session_links')
        and a.attname = 'session_date' and a.attnotnull
        and pg_catalog.format_type(a.atttypid, null) = 'date')
    and not exists (select 1 from public.microcycle_physical_session_links l
      left join public.training_sessions s on s.id = l.training_session_id
      where s.id is null or l.session_date is distinct from s.session_date)
  union all
  select 'sin duplicados CTS y fecha en vinculos existentes',
    not exists (select 1 from public.microcycle_physical_session_links l
      group by l.club_team_season_id, l.session_date having count(*) > 1)
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
  select 'vinculos 4A sin escritura directa authenticated ni anon',
    coalesce(not pg_catalog.has_table_privilege('authenticated',
      to_regclass('public.microcycle_physical_session_links'),
      'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN'), false)
    and coalesce(not pg_catalog.has_table_privilege('anon',
      to_regclass('public.microcycle_physical_session_links'),
      'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN'), false)
    and coalesce(not pg_catalog.has_any_column_privilege('authenticated',
      to_regclass('public.microcycle_physical_session_links'), 'INSERT,UPDATE'), false)
    and coalesce(not pg_catalog.has_any_column_privilege('anon',
      to_regclass('public.microcycle_physical_session_links'), 'INSERT,UPDATE'), false)
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
