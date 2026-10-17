-- APPCAUDAL / Sesiones 01 / PRE-FLIGHT. Solo SELECT; no ejecutado por Codex.
-- Una sola tabla exportable. BLOCKED obliga a revisar antes de ejecutar la migración.
with source_rel as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relowner, c.relacl
  from pg_class c
  where c.relnamespace=to_regnamespace('public')
    and c.relname in ('players_database','jugadores','player_team_memberships','equipos_rivales',
      'club_memberships','club_teams','club_team_seasons','club_seasons')
    and c.relkind in ('r','p')
), source_items as (
  select format('table|%s|%s|%s|%s|%s',relname,relrowsecurity,relforcerowsecurity,
    relowner,coalesce(relacl::text,'')) as signature
  from source_rel
  union all
  select format('column|%s|%s|%s|%s|%s',r.relname,a.attname,a.atttypid,
    a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),''))
  from source_rel r join pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  union all
  select format('constraint|%s|%s|%s',r.relname,c.conname,pg_get_constraintdef(c.oid,true))
  from source_rel r join pg_constraint c on c.conrelid=r.oid
  union all
  select format('trigger|%s|%s|%s',r.relname,t.tgenabled,pg_get_triggerdef(t.oid,true))
  from source_rel r join pg_trigger t on t.tgrelid=r.oid and not t.tgisinternal
  union all
  select format('policy|%s|%s|%s|%s|%s|%s|%s',r.relname,p.polname,p.polcmd::text,
    p.polpermissive,p.polroles::text,
    coalesce(pg_get_expr(p.polqual,p.polrelid),''),
    coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
  from source_rel r join pg_policy p on p.polrelid=r.oid
), source_fingerprint as (
  select md5(coalesce(string_agg(signature,E'\n' order by signature),'')) as value
  from source_items
),
checks as (
  select 'postgres_17_plus'::text as check_name,
    current_setting('server_version_num')::integer >= 170000 as ok,
    'La migración verifica MAINTAIN como privilegio de PostgreSQL 17+'::text as explanation
  union all select 'required_schemas',
    to_regnamespace('public') is not null and to_regnamespace('extensions') is not null,
    'public y extensions deben existir'
  union all select 'source_tables',
    to_regclass('public.equipos_rivales') is not null
    and to_regclass('public.club_team_seasons') is not null
    and to_regclass('public.club_teams') is not null
    and to_regclass('public.club_seasons') is not null
    and to_regclass('public.club_memberships') is not null
    and to_regclass('public.players_database') is not null
    and to_regclass('public.player_team_memberships') is not null,
    'Tablas origen por nombre exacto'
  union all select 'target_name_safe',
    to_regclass('public.club_team_season_players') is null
    or obj_description(to_regclass('public.club_team_season_players'), 'pg_class') =
      'APPCAUDAL Sesiones 01: canonical player membership in a club team-season, dates optional',
    'Si existe, debe ser nuestra tabla identificada; su estructura se valida después'
  union all select 'guard_name_safe',
    to_regprocedure('public.guard_club_team_season_player_mutation()') is null
    or obj_description(to_regprocedure('public.guard_club_team_season_player_mutation()'), 'pg_proc') =
      'APPCAUDAL Sesiones 01: block unauthorized and closed-season player membership mutations',
    'No reemplazar una función ajena'
  union all select 'btree_gist_schema',
    not exists (
      select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
      where e.extname='btree_gist' and n.nspname not in ('public','extensions')
    ),
    'Si falta, la migración instala btree_gist en extensions dentro de la transacción'
  union all select 'helper_read_exact',
    exists (select 1 from pg_proc p
      where p.oid=to_regprocedure('public.can_read_club_team_season(uuid)')
        and p.prosecdef and p.provolatile='s' and p.proowner='postgres'::regrole
        and p.prorettype='boolean'::regtype
        and p.proconfig @> array['search_path=pg_catalog']::text[]
        and has_function_privilege('authenticated',p.oid,'EXECUTE')
        and not has_function_privilege('anon',p.oid,'EXECUTE')
        and md5(regexp_replace(lower(p.prosrc),'[[:space:]]','','g'))=
          '2f244dec658b347e50a0591ce1dba3dd'),
    'Hash normalizado y metadatos del helper de lectura aprobado'
  union all select 'helper_write_exact',
    exists (select 1 from pg_proc p
      where p.oid=to_regprocedure('public.can_write_club_team_season(uuid)')
        and p.prosecdef and p.provolatile='s' and p.proowner='postgres'::regrole
        and p.prorettype='boolean'::regtype
        and p.proconfig @> array['search_path=pg_catalog']::text[]
        and has_function_privilege('authenticated',p.oid,'EXECUTE')
        and not has_function_privilege('anon',p.oid,'EXECUTE')
        and md5(regexp_replace(lower(p.prosrc),'[[:space:]]','','g'))=
          '1c7f46f430cba9c9c16f298af6cd4c3b'),
    'Hash normalizado y metadatos del helper de escritura aprobado'
  union all select 'helper_owner_role_exact',
    exists (select 1 from pg_proc p
      where p.oid=to_regprocedure('public.has_club_role(uuid,text[])')
        and p.prosecdef and p.provolatile='s' and p.proowner='postgres'::regrole
        and p.prorettype='boolean'::regtype
        and p.proconfig @> array['search_path=pg_catalog']::text[]
        and md5(regexp_replace(lower(p.prosrc),'[[:space:]]','','g'))=
          '774a3d46785e0253f305fb6c484f0a21'
        and has_function_privilege('authenticated',p.oid,'EXECUTE')
        and not has_function_privilege('anon',p.oid,'EXECUTE')),
    'Helper owner activo usado para la anulación; ninguna función existente se modifica'
  union all select 'source_columns',
    (select count(*) from pg_attribute a where a.attrelid=to_regclass('public.club_team_seasons')
      and not a.attisdropped and
      ((a.attname='id' and a.atttypid='uuid'::regtype) or
       (a.attname='team_id' and a.atttypid='uuid'::regtype) or
       (a.attname='season_id' and a.atttypid='uuid'::regtype) or
       (a.attname='club_id' and a.atttypid='uuid'::regtype)))=4
    and (select count(*) from pg_attribute a where a.attrelid=to_regclass('public.club_seasons')
      and not a.attisdropped and
      ((a.attname='id' and a.atttypid='uuid'::regtype) or
       (a.attname='club_id' and a.atttypid='uuid'::regtype) or
       (a.attname='starts_on' and a.atttypid='date'::regtype) or
       (a.attname='ends_on' and a.atttypid='date'::regtype) or
       (a.attname='status' and a.atttypid='text'::regtype)))=5
    and exists (select 1 from pg_attribute a where a.attrelid=to_regclass('public.players_database')
      and a.attname='id' and a.atttypid='uuid'::regtype and not a.attisdropped)
    and (select count(*) from pg_attribute a where a.attrelid=to_regclass('public.player_team_memberships')
      and not a.attisdropped and
      ((a.attname='player_id' and a.atttypid='uuid'::regtype) or
       (a.attname='team_id' and a.atttypid='uuid'::regtype) or
       (a.attname='is_current' and a.atttypid='boolean'::regtype)))=3
    and (select count(*) from pg_attribute a where a.attrelid=to_regclass('public.club_memberships')
      and not a.attisdropped and
      ((a.attname='id' and a.atttypid='uuid'::regtype) or
       (a.attname='club_id' and a.atttypid='uuid'::regtype) or
       (a.attname='user_id' and a.atttypid='uuid'::regtype) or
       (a.attname='role' and a.atttypid='text'::regtype) or
       (a.attname='is_active' and a.atttypid='boolean'::regtype)))=5,
    'Columnas y tipos realmente usados por la migración'
  union all select 'canonical_foreign_keys',
    exists (select 1 from pg_constraint where conrelid=to_regclass('public.club_team_seasons')
      and confrelid=to_regclass('public.club_seasons') and contype='f' and convalidated)
    and exists (select 1 from pg_constraint where conrelid=to_regclass('public.club_team_seasons')
      and confrelid=to_regclass('public.club_teams') and contype='f' and convalidated)
    and exists (select 1 from pg_constraint where conrelid=to_regclass('public.player_team_memberships')
      and confrelid=to_regclass('public.players_database') and contype='f' and convalidated)
    and exists (select 1 from pg_constraint where conrelid=to_regclass('public.player_team_memberships')
      and confrelid=to_regclass('public.equipos_rivales') and contype='f' and convalidated)
    and exists (select 1 from pg_constraint where conrelid=to_regclass('public.club_memberships')
      and conname='club_memberships_club_user_key' and contype='u' and convalidated),
    'FK validadas de relaciones fuente; comprobar columnas exactas en el inventario'
  union all select 'current_team_season',
    (select count(*) from public.club_team_seasons cts
      join public.club_seasons s on s.id=cts.season_id and s.club_id=cts.club_id
      where cts.id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
        and cts.team_id='85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and cts.season_id='a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid
        and s.status='open' and s.starts_on<=s.ends_on)=1,
    'Relación aprobada y temporada abierta, sin inferir pertenencias de jugadores'
  union all select 'authenticated_and_anon_roles',
    to_regrole('authenticated') is not null and to_regrole('anon') is not null
      and to_regrole('postgres') is not null and to_regrole('service_role') is not null,
    'Roles para RLS, privilegios y titularidad del guard'
), report as (
  select check_name, case when ok then 'PASS' else 'BLOCKED' end as result, explanation
  from checks
), output as (
  select check_name, result, explanation from report
  union all
  select 'source_catalog_fingerprint', 'INFO', value from source_fingerprint
  union all
  select 'GLOBAL', case when bool_and(result='PASS') then 'READY_TO_APPLY' else 'BLOCKED' end,
    format('%s/%s comprobaciones superadas; no son pruebas dinámicas de RLS',
      count(*) filter (where result='PASS'), count(*))
  from report
)
select check_name, result, explanation from output
order by case when check_name='GLOBAL' then 1 else 0 end, check_name;
