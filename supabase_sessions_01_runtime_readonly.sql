-- APPCAUDAL / Sesiones 01 / diagnostico de solo lectura.
-- Ejecutar solo DESPUES del postflight de la migracion instalada.
-- Una unica tabla CSV. Los checks de catalogo NO son pruebas dinamicas de RLS.
with target as (
  select 'public.club_team_season_players'::regclass as rel,
    to_regprocedure('public.guard_club_team_season_player_mutation()') as guard,
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as relation_id
), facts as (
  select 'installed_table'::text as check_id, 'CATALOG'::text as kind,
    case when exists (select 1 from pg_class c, target t
      where c.oid=t.rel and c.relrowsecurity and not c.relforcerowsecurity)
      then 'PASS' else 'BLOCKED' end as result,
    'Tabla existente con RLS habilitada; esto no demuestra RLS por identidad'::text as detail
  union all
  select 'table_row_count', 'DATA_COUNT', 'INFO',
    format('%s filas; cero filas no permite demostrar SELECT/UPDATE RLS por fila',
      (select count(*) from public.club_team_season_players))
  union all
  select 'current_relation', 'DATA_COUNT',
    case when (select count(*) from public.club_team_seasons cts
      join public.club_seasons s on s.id=cts.season_id and s.club_id=cts.club_id,
      target t where cts.id=t.relation_id and s.status='open')=1
      then 'PASS' else 'BLOCKED' end,
    'Existe exactamente la relacion aprobada y su temporada esta abierta; no se cambia'
  union all
  select 'guard_trigger', 'CATALOG',
    case when exists (select 1 from pg_trigger tr, target t
      where tr.tgrelid=t.rel and tr.tgfoid=t.guard
        and tr.tgname='club_team_season_players_guard'
        and tr.tgenabled='O' and not tr.tgisinternal)
      then 'PASS' else 'BLOCKED' end,
    'Trigger activo; su existencia no demuestra que una escritura concreta sea rechazada'
  union all
  select 'guard_definer', 'CATALOG',
    case when exists (select 1 from pg_proc p, target t where p.oid=t.guard
      and p.prosecdef and p.proowner='postgres'::regrole
      and p.proconfig @> array['search_path=pg_catalog']::text[])
      then 'PASS' else 'BLOCKED' end,
    'Guard SECURITY DEFINER de postgres con search_path fijado'
  union all
  select 'guard_client_execute', 'PRIVILEGE',
    case when not has_function_privilege('anon',t.guard,'EXECUTE')
       and not has_function_privilege('authenticated',t.guard,'EXECUTE')
      then 'PASS' else 'BLOCKED' end,
    'El guard no debe ser invocable directamente por los clientes' from target t
  union all
  select 'authenticated_table_privileges', 'PRIVILEGE',
    case when has_table_privilege('authenticated',t.rel,'SELECT')
      and has_column_privilege('authenticated',t.rel,'club_team_season_id','INSERT')
      and has_column_privilege('authenticated',t.rel,'player_id','INSERT')
      and has_column_privilege('authenticated',t.rel,'joined_on','UPDATE')
      and has_column_privilege('authenticated',t.rel,'void_reason','UPDATE')
      and not has_table_privilege('authenticated',t.rel,'DELETE')
      and not has_table_privilege('authenticated',t.rel,'TRUNCATE')
      and not has_table_privilege('authenticated',t.rel,'MAINTAIN')
      then 'PASS' else 'BLOCKED' end,
    'SELECT y DML de columnas esperadas; DELETE/TRUNCATE/MAINTAIN denegados'
    from target t
  union all
  select 'anon_table_privileges', 'PRIVILEGE',
    case when not has_table_privilege('anon',t.rel,'SELECT')
      and not has_any_column_privilege('anon',t.rel,'SELECT')
      and not has_table_privilege('anon',t.rel,'INSERT')
      and not has_any_column_privilege('anon',t.rel,'INSERT')
      and not has_table_privilege('anon',t.rel,'UPDATE')
      and not has_any_column_privilege('anon',t.rel,'UPDATE')
      and not has_table_privilege('anon',t.rel,'DELETE')
      and not has_table_privilege('anon',t.rel,'TRUNCATE')
      and not has_table_privilege('anon',t.rel,'MAINTAIN')
      then 'PASS' else 'BLOCKED' end,
    'Ningun privilegio efectivo anon de lectura o modificacion de la tabla'
    from target t
  union all
  select 'owner_identity_available', 'DATA_COUNT',
    case when count(*)=1 then 'INFO' else 'BLOCKED' end,
    format('%s memberships owner activas en el club actual; comprobar identidad en archivo transaccional',count(*))
    from public.club_memberships m
    join public.club_team_seasons cts on cts.club_id=m.club_id, target t
    where cts.id=t.relation_id and m.role='owner' and m.is_active
  union all
  select 'staff_assignment_count', 'DATA_COUNT', 'INFO',
    format('%s asignaciones staff activas a la relacion actual; si es 0, staff autorizado queda PENDING',count(*))
    from public.club_team_season_permissions p
    join public.club_memberships m on m.id=p.membership_id and m.club_id=p.club_id
    join target t on t.relation_id=p.club_team_season_id
    where m.role='staff' and m.is_active
  union all
  select 'relation_assignment_total_count', 'DATA_COUNT', 'INFO',
    format('%s asignaciones totales a la relacion; comparar con el valor posterior al ROLLBACK de staging',count(*))
    from public.club_team_season_permissions p, target t
    where p.club_team_season_id=t.relation_id
  union all
  select 'closed_season_cases', 'DATA_COUNT', 'INFO',
    format('%s relaciones de temporada cerrada; el cierre real no se altera',count(*))
    from public.club_team_seasons cts
    join public.club_seasons s on s.id=cts.season_id and s.club_id=cts.club_id
    where s.status='closed'
  union all
  select 'identity_runtime', 'DYNAMIC', 'PENDING',
    'Este archivo no establece JWT ni ejecuta operaciones como authenticated'
  union all
  select 'void_and_date_runtime', 'DYNAMIC', 'PENDING',
    'Requiere registros de prueba y escrituras: solo staging'
  union all
  select 'closed_season_runtime', 'DYNAMIC', 'PENDING',
    'Requiere un caso cerrado controlado y escrituras: solo staging'
), policy_rows as (
  select format('policy:%s',p.polname) as check_id, 'CATALOG'::text as kind,
    'INFO'::text as result,
    format('cmd=%s; %s; roles=%s; USING=%s; WITH CHECK=%s',p.polcmd::text,
      case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
      p.polroles::text,
      coalesce(pg_get_expr(p.polqual,p.polrelid),'<none>'),
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'<none>')) as detail
  from pg_policy p, target t where p.polrelid=t.rel
), helper_rows as (
  select format('helper:%s',p.proname) as check_id, 'CATALOG'::text as kind,
    case when p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      then 'PASS' else 'BLOCKED' end as result,
    format('SECURITY DEFINER=%s; owner=%s; authenticated EXECUTE=%s; anon EXECUTE=%s',
      p.prosecdef,p.proowner::regrole,
      has_function_privilege('authenticated',p.oid,'EXECUTE'),
      has_function_privilege('anon',p.oid,'EXECUTE')) as detail
  from pg_proc p where p.oid in (
    to_regprocedure('public.can_read_club_team_season(uuid)'),
    to_regprocedure('public.can_write_club_team_season(uuid)'),
    to_regprocedure('public.has_club_role(uuid,text[])'))
)
select check_id, kind, result, detail from facts
union all select check_id, kind, result, detail from policy_rows
union all select check_id, kind, result, detail from helper_rows
order by kind, check_id;
