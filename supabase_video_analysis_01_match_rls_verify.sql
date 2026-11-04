-- NEXO CLUB / Videoanalisis 01. SOLO SELECT. Verificador estructural posterior.
-- No prueba identidades; nunca declara seguridad GLOBAL PASS.
with policies as (
  select p.polname,p.polcmd::text as command_code,p.polpermissive,p.polroles,
         lower(pg_catalog.regexp_replace(replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'public.',''),'[[:space:]()]','','g')) as using_normalized,
         lower(pg_catalog.regexp_replace(replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'public.',''),'[[:space:]()]','','g')) as check_normalized
  from pg_catalog.pg_policy p where p.polrelid=pg_catalog.to_regclass('public.partidos')
), expected(name,command_code,using_normalized,check_normalized) as (
  values
  ('player_sports_staff_select','r','can_read_club_team_seasonclub_team_season_id',''),
  ('player_sports_staff_insert','a','','can_write_club_team_seasonclub_team_season_id'),
  ('player_sports_staff_update','w','can_write_club_team_seasonclub_team_season_id','can_write_club_team_seasonclub_team_season_id'),
  ('player_sports_staff_delete','d','can_write_club_team_seasonclub_team_season_id','')
), checks as (
  select 'RLS activado'::text as check_name,
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c
      where c.oid=pg_catalog.to_regclass('public.partidos')),false) as ok
  union all
  select 'Exactamente cuatro politicas', (select count(*)=4 from policies)
  union all
  select 'Cuatro expresiones CTS esperadas', (select count(*)=4 from expected e
    join policies p on p.polname=e.name and p.command_code=e.command_code
      and p.using_normalized=e.using_normalized and p.check_normalized=e.check_normalized
      and p.polpermissive and p.polroles=array['authenticated'::regrole::oid])
  union all
  select 'Sin partido sin CTS', not exists (select 1 from public.partidos where club_team_season_id is null)
  union all
  select 'Club equipo y temporada canonicos validos', not exists (
    select 1 from public.partidos match_row
    left join public.club_team_seasons cts
      on cts.id=match_row.club_team_season_id
    left join public.clubs club on club.id=cts.club_id
    left join public.club_teams team
      on team.id=cts.team_id and team.club_id=cts.club_id
    left join public.club_seasons season
      on season.id=cts.season_id and season.club_id=cts.club_id
    where cts.id is null or club.id is null
       or team.id is null or season.id is null)
  union all
  select 'Trigger de identidad CTS', exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid=pg_catalog.to_regclass('public.partidos')
      and t.tgname='video_analysis_01_guard_match_cts'
      and not t.tgisinternal and t.tgenabled in ('O','A')
      and t.tgtype=17
      and t.tgfoid=pg_catalog.to_regprocedure('public.video_analysis_01_guard_match_cts()'))
  union all
  select 'Funcion del trigger sin EXECUTE cliente', exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure('public.video_analysis_01_guard_match_cts()')
      and p.proowner='postgres'::regrole
      and 'search_path=pg_catalog'=any(p.proconfig)
      and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'))
  union all
  select 'Cuatro helpers de lectura y escritura verificados',
    (select count(*)=4 from (values
      ('public.can_read_club_team_season(uuid)',
       'bbb2e5a9a81767749a2a26504a890442'),
      ('public.can_write_club_team_season(uuid)',
       'fc4a0e2c43689095da249ca834a2bde1'),
      ('public.can_read_match(uuid)',
       'ff69e4e15caed0a5e65f856ddfd94e61'),
      ('public.can_write_match(uuid)',
       '6bab76b45b9983a45a3a3dcb378a0096')
    ) as expected(signature,source_md5)
    join pg_catalog.pg_proc helper
      on helper.oid=pg_catalog.to_regprocedure(expected.signature)
    where helper.prosecdef and helper.proowner='postgres'::regrole
      and helper.proconfig=array['search_path=pg_catalog']::text[]
      and pg_catalog.md5(pg_catalog.replace(
        helper.prosrc,E'\r\n',E'\n'))=expected.source_md5
      and pg_catalog.has_function_privilege(
        'authenticated',helper.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege(
        'anon',helper.oid,'EXECUTE'))
  union all
  select 'Privilegios SQL authenticated conservados',
    pg_catalog.has_table_privilege('authenticated','public.partidos','SELECT')
    and pg_catalog.has_table_privilege('authenticated','public.partidos','INSERT')
    and pg_catalog.has_table_privilege('authenticated','public.partidos','UPDATE')
    and pg_catalog.has_table_privilege('authenticated','public.partidos','DELETE')
  union all
  select 'Sin TRUNCATE ni TRIGGER de clientes',
    not pg_catalog.has_table_privilege('authenticated','public.partidos','TRUNCATE')
    and not pg_catalog.has_table_privilege('anon','public.partidos','TRUNCATE')
    and not pg_catalog.has_table_privilege('authenticated','public.partidos','TRIGGER')
    and not pg_catalog.has_table_privilege('anon','public.partidos','TRIGGER')
  union all
  select 'RPC desplegada de sustituciones verificada',
    (select count(*)=1 from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace
        on namespace.oid=routine.pronamespace
      where namespace.nspname='public'
        and routine.proname='mutate_match_substitution_atomic')
    and exists (
    select 1 from pg_catalog.pg_proc routine
    where routine.oid=pg_catalog.to_regprocedure(
      'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)')
      and routine.prosecdef
      and routine.proowner='postgres'::regrole
      and pg_catalog.md5(pg_catalog.replace(
        routine.prosrc,E'\r\n',E'\n'))=
        '97269e30607ddad0a54900f1b05f5f63'
      and pg_catalog.has_function_privilege('authenticated',routine.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',routine.oid,'EXECUTE'))
  union all
  select 'Lectura y policy de sustituciones 01A verificadas',
    (select count(*)=1 from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace
        on namespace.oid=routine.pronamespace
      where namespace.nspname='public'
        and routine.proname='get_match_substitution_events')
    and exists (select 1 from pg_catalog.pg_proc routine
      where routine.oid=pg_catalog.to_regprocedure(
        'public.get_match_substitution_events(uuid)')
        and routine.prosecdef and routine.proowner='postgres'::regrole
        and pg_catalog.md5(pg_catalog.replace(
          routine.prosrc,E'\r\n',E'\n'))=
          'f86960348fed755eecee4315b75858b8'
        and pg_catalog.has_function_privilege(
          'authenticated',routine.oid,'EXECUTE')
        and not pg_catalog.has_function_privilege(
          'anon',routine.oid,'EXECUTE'))
    and (select count(*)=1 from pg_catalog.pg_policy policy
      where policy.polrelid=pg_catalog.to_regclass(
        'public.partido_eventos_sustitucion'))
    and exists (select 1 from pg_catalog.pg_policy policy
      where policy.polrelid=pg_catalog.to_regclass(
          'public.partido_eventos_sustitucion')
        and policy.polname='substitution_staff_select'
        and policy.polcmd::text='r' and policy.polpermissive
        and policy.polroles=array['authenticated'::regrole::oid]
        and lower(pg_catalog.regexp_replace(replace(
          pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),
          'public.',''),'[[:space:]()]','','g'))=
          'can_read_matchpartido_id')
  union all
  select 'Estadisticas de jugador protegidas por CTS',
    coalesce((select relation.relrowsecurity
      from pg_catalog.pg_class relation
      where relation.oid=pg_catalog.to_regclass(
        'public.partido_estadisticas_jugador')),false)
    and (select count(*) from pg_catalog.pg_policy policy
      where policy.polrelid=pg_catalog.to_regclass(
        'public.partido_estadisticas_jugador'))=4
    and (select count(*) from (values
      ('player_sports_staff_select','r','can_read_matchpartido_id',''),
      ('player_sports_staff_insert','a','','can_write_matchpartido_id'),
      ('player_sports_staff_update','w','can_write_matchpartido_id',
        'can_write_matchpartido_id'),
      ('player_sports_staff_delete','d','can_write_matchpartido_id','')
    ) as expected(name,command_code,using_expr,check_expr)
      join pg_catalog.pg_policy policy
        on policy.polrelid=pg_catalog.to_regclass(
          'public.partido_estadisticas_jugador')
       and policy.polname=expected.name
       and policy.polcmd::text=expected.command_code
       and policy.polpermissive
       and policy.polroles=array['authenticated'::regrole::oid]
       and lower(pg_catalog.regexp_replace(replace(coalesce(
         pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
         'public.',''),'[[:space:]()]','','g'))=expected.using_expr
       and lower(pg_catalog.regexp_replace(replace(coalesce(
         pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid),''),
         'public.',''),'[[:space:]()]','','g'))=expected.check_expr)=4
), result as (
  select check_name,case when ok then 'PASS' else 'FAIL' end as status,
         case when ok then 'Contrato estructural presente.'
              else 'Revisar catalogo y datos antes de continuar.' end as explanation
  from checks
  union all
  select 'Identidades reales', 'PENDING',
    'Probar owner, staff asignado/no asignado/revocado, temporada cerrada, historico, anon y consultas directas.'
  union all
  select 'GLOBAL',case when bool_and(ok) then 'PENDING_IDENTITY' else 'FAIL' end,
    'Nunca equivale a PASS de autorizacion sin pruebas autenticadas.'
  from checks
)
select check_name,status,explanation from result
order by case when check_name='GLOBAL' then 2 when check_name='Identidades reales' then 1 else 0 end,check_name;
