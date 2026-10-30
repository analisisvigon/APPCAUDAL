-- Solo lectura. Ejecutar despues de la migracion 4A; no prueba identidades.
with checks as (
  select 'tabla de vinculos y RLS' as check_name,
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c
      where c.oid = pg_catalog.to_regclass('public.microcycle_physical_session_links')), false) as ok
  union all
  select 'sin politicas de acceso directo',
    not exists (select 1 from pg_catalog.pg_policy p
      where p.polrelid = pg_catalog.to_regclass('public.microcycle_physical_session_links'))
  union all
  select 'FK validadas y restrictivas',
    (select count(*) from pg_catalog.pg_constraint c
      where c.conrelid = pg_catalog.to_regclass('public.microcycle_physical_session_links')
        and c.contype = 'f' and c.convalidated and c.confdeltype = 'r'
        and c.confrelid in (pg_catalog.to_regclass('public.training_sessions'),
                            pg_catalog.to_regclass('public.club_team_seasons'))) = 2
    and exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = pg_catalog.to_regclass('public.microcycle_physical_session_links')
        and c.confrelid = pg_catalog.to_regclass('public.training_sessions')
        and c.contype = 'f' and c.convalidated and c.confdeltype = 'r')
    and exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = pg_catalog.to_regclass('public.microcycle_physical_session_links')
        and c.confrelid = pg_catalog.to_regclass('public.club_team_seasons')
        and c.contype = 'f' and c.convalidated and c.confdeltype = 'r')
  union all
  select 'indice CTS valido',
    exists (select 1 from pg_catalog.pg_index i
      where i.indexrelid = pg_catalog.to_regclass(
        'public.microcycle_physical_session_links_cts_idx')
        and i.indrelid = pg_catalog.to_regclass('public.microcycle_physical_session_links')
        and i.indisvalid and i.indnkeyatts = 2
        and i.indkey[0] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = i.indrelid and a.attname = 'club_team_season_id')
        and i.indkey[1] = (select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = i.indrelid and a.attname = 'training_session_id'))
  union all
  select 'anon y authenticated sin acceso directo',
    coalesce(not pg_catalog.has_table_privilege('anon',
      pg_catalog.to_regclass('public.microcycle_physical_session_links'),
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN'), false)
    and coalesce(not pg_catalog.has_table_privilege('authenticated',
      pg_catalog.to_regclass('public.microcycle_physical_session_links'),
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN'), false)
  union all
  select 'RPC SECURITY DEFINER, STABLE y search_path seguro',
    coalesce((select p.prosecdef and p.provolatile = 's'
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and p.proowner = (select r.oid from pg_catalog.pg_roles r
        where r.rolname = 'postgres')
      from pg_catalog.pg_proc p where p.oid =
        pg_catalog.to_regprocedure('public.get_microcycle_team_loads_4a(uuid,date)')), false)
  union all
  select 'RPC solo ejecutable por authenticated entre roles cliente',
    coalesce(pg_catalog.has_function_privilege('authenticated',
      pg_catalog.to_regprocedure('public.get_microcycle_team_loads_4a(uuid,date)'), 'EXECUTE'), false)
    and coalesce(not pg_catalog.has_function_privilege('anon',
      pg_catalog.to_regprocedure('public.get_microcycle_team_loads_4a(uuid,date)'), 'EXECUTE'), false)
    and not exists (select 1 from pg_catalog.pg_proc p,
      pg_catalog.aclexplode(p.proacl) acl
      where p.oid = pg_catalog.to_regprocedure('public.get_microcycle_team_loads_4a(uuid,date)')
        and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
  union all
  select 'sin sobrecargas nuevas de la RPC',
    (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_microcycle_team_loads_4a') = 1
  union all
  select 'una sola atribucion por sesion fisica',
    (select count(*) from pg_catalog.pg_constraint c
      where c.conrelid = pg_catalog.to_regclass('public.microcycle_physical_session_links')
        and c.contype = 'p') = 1
), result as (
  select check_name, case when ok then 'PASS' else 'FAIL' end as status,
    case when ok then 'Contrato esperado' else 'Revisar antes de continuar' end as detail
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
  union all
  select 'vinculos fuera de fechas de temporada',
    case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::text
  from public.microcycle_physical_session_links l
  join public.training_sessions s on s.id = l.training_session_id
  join public.club_team_seasons cts on cts.id = l.club_team_season_id
  join public.club_seasons season on season.id = cts.season_id
    and season.club_id = cts.club_id
  where s.session_date not between season.starts_on and season.ends_on
  union all
  select 'dias con varias sesiones fisicas en el mismo CTS', 'INFO', count(*)::text
  from (select l.club_team_season_id, s.session_date
    from public.microcycle_physical_session_links l
    join public.training_sessions s on s.id = l.training_session_id
    group by l.club_team_season_id, s.session_date having count(*) > 1) days
)
select report.check_name, report.status, report.detail
from (
  select * from result
  union all
  select * from diagnostics
  union all
  select 'GLOBAL',
    case when (select bool_and(status = 'PASS') from result)
        and (select count(*) = 0 from diagnostics where status = 'FAIL')
      then 'PASS' else 'FAIL' end,
    (select count(*)::text from result) || ' comprobaciones estructurales'
) report
order by (report.check_name = 'GLOBAL'), report.check_name;
