-- APPCAUDAL / Sesiones 01 / POST-FLIGHT. Solo SELECT; ejecutar tras la migración.
-- Este archivo verifica estructura, no simula identidades ni escribe datos.
-- Compare source_catalog_fingerprint con el valor del preflight: un hash igual
-- acredita que NO cambió el catálogo de las tablas fuente entre ambas capturas.
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
target as (
  select to_regclass('public.club_team_season_players') as rel,
    to_regprocedure('public.guard_club_team_season_player_mutation()') as guard
), checks as (
  select 'table_marker'::text as check_name,
    t.rel is not null and obj_description(t.rel, 'pg_class') =
      'APPCAUDAL Sesiones 01: canonical dated player membership in a club team-season' as ok,
    'Tabla nueva identificada'::text as explanation from target t
  union all select 'columns_and_types',
    (select count(*) from pg_attribute a, target t where a.attrelid=t.rel and not a.attisdropped
      and ((a.attname='id' and a.atttypid='uuid'::regtype and a.attnotnull)
        or (a.attname='club_team_season_id' and a.atttypid='uuid'::regtype and a.attnotnull)
        or (a.attname='player_id' and a.atttypid='uuid'::regtype and a.attnotnull)
        or (a.attname='joined_on' and a.atttypid='date'::regtype and a.attnotnull)
        or (a.attname='left_on' and a.atttypid='date'::regtype and not a.attnotnull)
        or (a.attname='created_at' and a.atttypid='timestamp with time zone'::regtype and a.attnotnull)
        or (a.attname='updated_at' and a.atttypid='timestamp with time zone'::regtype and a.attnotnull)))=7
    and (select count(*) from pg_attribute a, target t where a.attrelid=t.rel and a.attnum>0 and not a.attisdropped)=7,
    'Exactamente siete columnas y tipos esperados'
  union all select 'primary_key',
    exists (select 1 from pg_constraint c, target t where c.conrelid=t.rel
      and c.conname='club_team_season_players_pkey' and c.contype='p' and c.convalidated
      and c.conkey=array[(select attnum from pg_attribute where attrelid=t.rel and attname='id' and not attisdropped)]::smallint[]),
    'PK en id'
  union all select 'relation_fk_restrict',
    exists (select 1 from pg_constraint c, target t where c.conrelid=t.rel
      and c.conname='club_team_season_players_relation_fkey' and c.contype='f' and c.convalidated
      and c.confrelid=to_regclass('public.club_team_seasons') and c.confdeltype='r'
      and c.conkey=array[(select attnum from pg_attribute where attrelid=t.rel and attname='club_team_season_id' and not attisdropped)]::smallint[]),
    'FK validada hacia club_team_seasons; ON DELETE RESTRICT'
  union all select 'player_fk_restrict',
    exists (select 1 from pg_constraint c, target t where c.conrelid=t.rel
      and c.conname='club_team_season_players_player_fkey' and c.contype='f' and c.convalidated
      and c.confrelid=to_regclass('public.players_database') and c.confdeltype='r'
      and c.conkey=array[(select attnum from pg_attribute where attrelid=t.rel and attname='player_id' and not attisdropped)]::smallint[]),
    'FK validada hacia identidad global; ON DELETE RESTRICT'
  union all select 'period_check',
    exists (select 1 from pg_constraint c, target t where c.conrelid=t.rel
      and c.conname='club_team_season_players_period_check' and c.contype='c' and c.convalidated
      and pg_get_constraintdef(c.oid) like '%left_on%joined_on%'),
    'CHECK de intervalo no vacío; revisar definición si falla'
  union all select 'unique_start',
    exists (select 1 from pg_constraint c, target t where c.conrelid=t.rel
      and c.conname='club_team_season_players_start_key' and c.contype='u' and c.convalidated
      and c.conkey=array[
        (select attnum from pg_attribute where attrelid=t.rel and attname='club_team_season_id' and not attisdropped),
        (select attnum from pg_attribute where attrelid=t.rel and attname='player_id' and not attisdropped),
        (select attnum from pg_attribute where attrelid=t.rel and attname='joined_on' and not attisdropped)
      ]::smallint[]),
    'No se repite el inicio para el mismo jugador y equipo-temporada'
  union all select 'no_overlap_exclusion',
    exists (select 1 from pg_constraint c, target t where c.conrelid=t.rel
      and c.conname='club_team_season_players_no_overlap' and c.contype='x' and c.convalidated
      and pg_get_constraintdef(c.oid) like '%EXCLUDE USING gist%'
      and pg_get_constraintdef(c.oid) like '%daterange%'
      and pg_get_constraintdef(c.oid) like '%&&%'),
    'Exclusión GiST validada; la definición exacta procede de la migración'
  union all select 'btree_gist_installed',
    exists (select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
      where e.extname='btree_gist' and n.nspname in ('extensions','public')),
    'Dependencia de igualdad UUID para la exclusión GiST disponible'
  union all select 'indexes',
    (select count(*) from pg_class i join pg_index ix on ix.indexrelid=i.oid, target t
      where ix.indrelid=t.rel and ix.indisvalid and i.relname in
        ('club_team_season_players_date_idx','club_team_season_players_player_idx'))=2,
    'Índices de fecha y jugador válidos'
  union all select 'rls_enabled',
    exists (select 1 from pg_class c, target t where c.oid=t.rel and c.relrowsecurity),
    'RLS activado'
  union all select 'three_exact_policies',
    (select count(*) from pg_policy p, target t where p.polrelid=t.rel)=3
    and (select count(*) from pg_policy p, target t where p.polrelid=t.rel
      and p.polpermissive and p.polroles=array['authenticated'::regrole::oid]
      and ((p.polname='ctsp_read' and p.polcmd='r' and p.polwithcheck is null
        and replace(regexp_replace(lower(pg_get_expr(p.polqual,p.polrelid)),'[[:space:]()]','','g'),'public.','')='can_read_club_team_seasonclub_team_season_id')
      or (p.polname='ctsp_insert' and p.polcmd='a' and p.polqual is null
        and replace(regexp_replace(lower(pg_get_expr(p.polwithcheck,p.polrelid)),'[[:space:]()]','','g'),'public.','')='can_write_club_team_seasonclub_team_season_id')
      or (p.polname='ctsp_update' and p.polcmd='w'
        and replace(regexp_replace(lower(pg_get_expr(p.polqual,p.polrelid)),'[[:space:]()]','','g'),'public.','')='can_write_club_team_seasonclub_team_season_id'
        and replace(regexp_replace(lower(pg_get_expr(p.polwithcheck,p.polrelid)),'[[:space:]()]','','g'),'public.','')='can_write_club_team_seasonclub_team_season_id')))=3,
    'Solo SELECT, INSERT y UPDATE para authenticated; helpers por equipo-temporada'
  union all select 'guard_exact_body',
    exists (select 1 from pg_proc p, target t where p.oid=t.guard and p.prosecdef
      and p.proowner='postgres'::regrole
      and p.prorettype='trigger'::regtype
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and md5(regexp_replace(lower(p.prosrc),'[[:space:]]','','g'))=
        '4f389c9c1daa98720c1e4853cf8d74f3'),
    'Guard verificado por hash; incluye auth.uid, temporada abierta y fechas'
  union all select 'guard_trigger_enabled',
    exists (select 1 from pg_trigger tr, target t where tr.tgrelid=t.rel
      and tr.tgname='club_team_season_players_guard' and tr.tgfoid=t.guard
      and tr.tgenabled='O' and not tr.tgisinternal
      and (tr.tgtype::integer & 1)=1 and (tr.tgtype::integer & 2)=2
      and (tr.tgtype::integer & 4)=4 and (tr.tgtype::integer & 8)=8
      and (tr.tgtype::integer & 16)=16),
    'BEFORE ROW INSERT/UPDATE/DELETE activo'
  union all select 'guard_not_client_callable',
    not has_function_privilege('anon', t.guard, 'EXECUTE')
      and not has_function_privilege('authenticated', t.guard, 'EXECUTE'),
    'EXECUTE directo revocado al guard SECURITY DEFINER' from target t
  union all select 'source_helpers_unchanged',
    exists (select 1 from pg_proc p
      where p.oid=to_regprocedure('public.can_read_club_team_season(uuid)')
        and md5(regexp_replace(lower(p.prosrc),'[[:space:]]','','g'))=
          '2f244dec658b347e50a0591ce1dba3dd')
    and exists (select 1 from pg_proc p
      where p.oid=to_regprocedure('public.can_write_club_team_season(uuid)')
        and md5(regexp_replace(lower(p.prosrc),'[[:space:]]','','g'))=
          '1c7f46f430cba9c9c16f298af6cd4c3b'),
    'Los dos helpers existentes conservan su cuerpo aprobado'
  union all select 'authenticated_privileges',
    has_table_privilege('authenticated', t.rel, 'SELECT')
      and has_table_privilege('authenticated', t.rel, 'INSERT')
      and not has_table_privilege('authenticated', t.rel, 'UPDATE')
      and has_column_privilege('authenticated', t.rel, 'joined_on', 'UPDATE')
      and has_column_privilege('authenticated', t.rel, 'left_on', 'UPDATE')
      and not has_column_privilege('authenticated', t.rel, 'id', 'UPDATE')
      and not has_column_privilege('authenticated', t.rel, 'player_id', 'UPDATE')
      and not has_column_privilege('authenticated', t.rel, 'club_team_season_id', 'UPDATE')
      and not has_table_privilege('authenticated', t.rel, 'DELETE')
      and not has_table_privilege('authenticated', t.rel, 'TRUNCATE')
      and not has_table_privilege('authenticated', t.rel, 'TRIGGER')
      and not has_table_privilege('authenticated', t.rel, 'MAINTAIN'),
    'Lectura/alta y corrección de fechas; sin DELETE ni privilegios administrativos'
    from target t
  union all select 'anon_no_effective_access',
    not (has_table_privilege('anon', t.rel, 'SELECT')
      or has_table_privilege('anon', t.rel, 'INSERT')
      or has_table_privilege('anon', t.rel, 'UPDATE')
      or has_table_privilege('anon', t.rel, 'DELETE')
      or has_table_privilege('anon', t.rel, 'TRUNCATE')
      or has_table_privilege('anon', t.rel, 'TRIGGER')
      or has_table_privilege('anon', t.rel, 'MAINTAIN')),
    'Sin privilegios efectivos de tabla para anon' from target t
  union all select 'initially_empty',
    (select count(*) from public.club_team_season_players)=0,
    'Solo válido inmediatamente tras la primera aplicación, antes de la carga aprobada'
  union all select 'legacy_27_memberships_unchanged',
    (select count(*) from public.player_team_memberships
      where team_id='85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid and is_current)=27,
    'Referencia de inventario; cambios concurrentes legítimos pueden cambiar este recuento'
  union all select 'legacy_24_active_fichas_unchanged',
    (select count(*) from public.jugadores j
      join public.player_team_memberships stage on stage.id=j.membership_id
      where stage.team_id='85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and stage.is_current and j.active_in_squad
        and j.global_player_id=stage.player_id)=24,
    'Referencia de inventario; no prueba por sí sola ausencia absoluta de cambios'
), report as (
  select check_name, case when ok then 'PASS' else 'FAIL' end as result, explanation
  from checks
), output as (
  select check_name, result, explanation from report
  union all
  select 'source_catalog_fingerprint', 'INFO', value from source_fingerprint
  union all
  select 'GLOBAL',
    case when bool_and(result='PASS') then 'STRUCTURE_PASS_SOURCE_COMPARE_AND_RUNTIME_PENDING' else 'FAIL' end,
    format('%s/%s comprobaciones estructurales; comparar huella fuente y ejecutar pruebas dinámicas',
      count(*) filter (where result='PASS'),count(*))
  from report
  union all
  select 'closed_season_runtime', 'PENDING',
    'No se simula cierre ni se ejecutan escrituras en producción; el hash acredita el guard, no su ejecución'
  union all
  select 'identity_runtime', 'PENDING',
    'Owner, staff asignado/no asignado, player y anon requieren prueba aparte con identidades reales'
)
select check_name, result, explanation from output
order by case when check_name='GLOBAL' then 2 when result='PENDING' then 1 else 0 end, check_name;
