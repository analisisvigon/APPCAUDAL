-- NEXO CLUB / Videoanalisis 01A. Solo SELECT; valido antes y despues.
-- PASS confirma las RPC desplegadas y las dos tablas hijas; las demas
-- tablas deportivas requieren su propio corte RLS.
with routine as (
  select proc.oid, proc.prosrc, proc.proowner, proc.prosecdef,
         proc.provolatile, proc.proconfig, proc.proacl, proc.pronargdefaults,
         proc.prorettype, proc.proargnames, proc.prolang,
         pg_catalog.md5(pg_catalog.replace(proc.prosrc, E'\r\n', E'\n'))
           as normalized_source_md5
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure(
    'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)')
), read_routine as (
  select proc.oid, proc.proowner, proc.prosecdef, proc.provolatile,
         proc.proconfig, proc.proacl, proc.proargnames, proc.pronargdefaults,
         proc.prorettype, proc.prolang,
         pg_catalog.md5(pg_catalog.replace(proc.prosrc,E'\r\n',E'\n'))
           as normalized_source_md5
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure(
    'public.get_match_substitution_events(uuid)')
), child_policy as (
  select policy.polname, policy.polcmd::text as command_code,
         policy.polpermissive, policy.polroles,
         policy.polwithcheck is null as no_with_check,
         pg_catalog.lower(pg_catalog.regexp_replace(
           pg_catalog.replace(coalesce(pg_catalog.pg_get_expr(
             policy.polqual,policy.polrelid),''),'public.',''),
           '[[:space:]()]','','g')) as normalized_using
  from pg_catalog.pg_policy policy
  where policy.polrelid =
    pg_catalog.to_regclass('public.partido_eventos_sustitucion')
), stats_policy as (
  select policy.polname, policy.polcmd::text as command_code,
         policy.polpermissive, policy.polroles,
         lower(pg_catalog.regexp_replace(replace(coalesce(
           pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
           'public.',''),'[[:space:]()]','','g')) as using_normalized,
         lower(pg_catalog.regexp_replace(replace(coalesce(
           pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid),''),
           'public.',''),'[[:space:]()]','','g')) as check_normalized
  from pg_catalog.pg_policy policy
  where policy.polrelid =
    pg_catalog.to_regclass('public.partido_estadisticas_jugador')
), stats_expected(name,command_code,old_using,old_check,new_using,new_check) as (
  values
    ('player_sports_staff_select','r','is_app_staff','',
      'can_read_matchpartido_id',''),
    ('player_sports_staff_insert','a','','is_app_staff',
      '','can_write_matchpartido_id'),
    ('player_sports_staff_update','w','is_app_staff','is_app_staff',
      'can_write_matchpartido_id','can_write_matchpartido_id'),
    ('player_sports_staff_delete','d','is_app_staff','',
      'can_write_matchpartido_id','')
), state as (
  select
    (select count(*) from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace
        on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public'
        and proc.proname = 'mutate_match_substitution_atomic') = 1
      as unique_signature,
    coalesce((select normalized_source_md5 =
      '97269e30607ddad0a54900f1b05f5f63' from routine),false)
      as verified_write_body,
    (select count(*) from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace
        on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public'
        and proc.proname = 'get_match_substitution_events') = 1
      as unique_read_signature,
    coalesce((select normalized_source_md5 =
      'f86960348fed755eecee4315b75858b8' from read_routine),false)
      as verified_read_body,
    coalesce((select prosecdef and proowner = 'postgres'::regrole
      and provolatile::text = 'v' and pronargdefaults = 1
      and prorettype = 'jsonb'::regtype
      and proargnames = array[
        'p_operation','p_partido_id','p_event_id','p_event','p_match_duration']::text[]
      and prolang = (select language.oid from pg_catalog.pg_language language
        where language.lanname = 'plpgsql')
      and proconfig = array['search_path=pg_catalog']::text[]
      from routine),false) as function_contract,
    coalesce((select pg_catalog.has_function_privilege(
      'authenticated',oid,'EXECUTE')
      and pg_catalog.has_function_privilege('service_role',oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',oid,'EXECUTE')
      and not exists (select 1 from pg_catalog.aclexplode(coalesce(
        proacl,pg_catalog.acldefault('f',proowner))) acl
        where acl.grantee=0 and acl.privilege_type='EXECUTE')
      from routine),false) as execute_contract,
    coalesce((select prosecdef and proowner = 'postgres'::regrole
      and provolatile::text = 's' and pronargdefaults = 0
      and prorettype = 'jsonb'::regtype
      and proargnames = array['p_partido_id']::text[]
      and prolang = (select language.oid from pg_catalog.pg_language language
        where language.lanname = 'plpgsql')
      and proconfig = array['search_path=pg_catalog']::text[]
      and pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE')
      and pg_catalog.has_function_privilege('service_role',oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',oid,'EXECUTE')
      and not exists (select 1 from pg_catalog.aclexplode(coalesce(
        proacl,pg_catalog.acldefault('f',proowner))) acl
        where acl.grantee=0 and acl.privilege_type='EXECUTE')
      from read_routine),false) as read_contract,
    (select count(*) = 1 from child_policy) as unique_child_policy,
    exists(select 1 from child_policy
      where polname = 'substitution_staff_select'
        and command_code = 'r' and polpermissive and no_with_check
        and polroles = array['authenticated'::regrole::oid]
        and normalized_using = 'is_app_staff') as old_child_policy,
    exists(select 1 from child_policy
      where polname = 'substitution_staff_select'
        and command_code = 'r' and polpermissive and no_with_check
        and polroles = array['authenticated'::regrole::oid]
        and normalized_using = 'can_read_matchpartido_id') as new_child_policy,
    coalesce(pg_catalog.has_table_privilege(
      'authenticated','public.partido_eventos_sustitucion','SELECT')
      and not pg_catalog.has_table_privilege(
        'authenticated','public.partido_eventos_sustitucion','INSERT')
      and not pg_catalog.has_table_privilege(
        'authenticated','public.partido_eventos_sustitucion','UPDATE')
      and not pg_catalog.has_table_privilege(
        'authenticated','public.partido_eventos_sustitucion','DELETE')
      and not pg_catalog.has_table_privilege(
        'authenticated','public.partido_eventos_sustitucion','TRUNCATE')
      and not pg_catalog.has_table_privilege(
        'authenticated','public.partido_eventos_sustitucion','TRIGGER')
      and not pg_catalog.has_table_privilege(
        'anon','public.partido_eventos_sustitucion','TRUNCATE'),false)
      as child_grants,
    coalesce((select relation.relrowsecurity from pg_catalog.pg_class relation
      where relation.oid=pg_catalog.to_regclass(
        'public.partido_eventos_sustitucion')),false) as child_rls_enabled,
    (select count(*) = 4 from stats_policy) as unique_stats_policies,
    (select count(*) = 4 from stats_expected expected
      join stats_policy actual
        on actual.polname=expected.name
       and actual.command_code=expected.command_code
       and actual.polpermissive
       and actual.polroles=array['authenticated'::regrole::oid]
       and actual.using_normalized=expected.old_using
       and actual.check_normalized=expected.old_check) as old_stats_policies,
    (select count(*) = 4 from stats_expected expected
      join stats_policy actual
        on actual.polname=expected.name
       and actual.command_code=expected.command_code
       and actual.polpermissive
       and actual.polroles=array['authenticated'::regrole::oid]
       and actual.using_normalized=expected.new_using
       and actual.check_normalized=expected.new_check) as new_stats_policies,
    coalesce((select relation.relrowsecurity from pg_catalog.pg_class relation
      where relation.oid=pg_catalog.to_regclass(
        'public.partido_estadisticas_jugador')),false) as stats_rls_enabled,
    coalesce(pg_catalog.has_table_privilege(
      'authenticated','public.partido_estadisticas_jugador','SELECT')
      and pg_catalog.has_table_privilege(
        'authenticated','public.partido_estadisticas_jugador','INSERT')
      and pg_catalog.has_table_privilege(
        'authenticated','public.partido_estadisticas_jugador','UPDATE')
      and pg_catalog.has_table_privilege(
        'authenticated','public.partido_estadisticas_jugador','DELETE')
      and not pg_catalog.has_table_privilege(
        'authenticated','public.partido_estadisticas_jugador','TRUNCATE')
      and not pg_catalog.has_table_privilege(
        'authenticated','public.partido_estadisticas_jugador','TRIGGER')
      and not pg_catalog.has_table_privilege(
        'anon','public.partido_estadisticas_jugador','TRUNCATE'),false)
      as stats_grants,
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
        'anon',helper.oid,'EXECUTE')) as helper_contract,
    pg_catalog.to_regclass('public.partidos') is not null
      and pg_catalog.to_regclass('public.partido_eventos_sustitucion') is not null
      and pg_catalog.to_regclass('public.partido_estadisticas_jugador') is not null
      and pg_catalog.to_regprocedure('public.can_write_match(uuid)') is not null
      and pg_catalog.to_regprocedure('public.can_read_match(uuid)') is not null
      as dependencies_present
), checks as (
  select 'Firma unica'::text as check_name, unique_signature as ok from state
  union all select 'Firma unica de lectura', unique_read_signature from state
  union all select 'Contrato SECURITY DEFINER y firma', function_contract from state
  union all select 'EXECUTE authenticated y service_role; anon denegado',
    execute_contract from state
  union all select 'Contrato y EXECUTE de lectura', read_contract from state
  union all select 'Una policy de sustituciones', unique_child_policy from state
  union all select 'RLS de sustituciones activada', child_rls_enabled from state
  union all select 'Cuatro policies de estadisticas', unique_stats_policies from state
  union all select 'RLS de estadisticas activada', stats_rls_enabled from state
  union all select 'Grants de estadisticas conservados', stats_grants from state
  union all select 'Cuatro helpers CTS y partido verificados', helper_contract from state
  union all select 'Grants de tabla hija sin escritura directa', child_grants from state
  union all select 'Tablas y helper presentes', dependencies_present from state
), result as (
  select check_name,
         case when ok then 'PASS' else 'FAIL' end as status,
         'Comprobacion estructural de la RPC.'::text as explanation
  from checks
  union all
  select 'Cuerpo de autorizacion',
         case when verified_write_body then 'PASS' else 'BLOCKED' end,
         'Huella completa de la RPC de escritura desplegada y revisada.'
  from state
  union all
  select 'Cuerpo de consulta de sustituciones',
         case when verified_read_body then 'PASS' else 'BLOCKED' end,
         'Huella completa de la RPC de lectura desplegada y revisada.'
  from state
  union all
  select 'Policy SELECT de sustituciones',
         case when new_child_policy then 'PASS'
              when old_child_policy then 'READY_TO_APPLY' else 'BLOCKED' end,
         'No deben existir otras policies permisivas sobre esta tabla.'
  from state
  union all
  select 'Policies CTS de estadisticas',
         case when new_stats_policies then 'PASS'
              when old_stats_policies then 'READY_TO_APPLY' else 'BLOCKED' end,
         'Las cuatro policies directas deben coincidir en comando, rol y expresiones.'
  from state
  union all
  select 'Pruebas de identidades', 'PENDING',
         'Requieren entorno aislado y fixtures: owner, staff, revocacion, temporada cerrada y anon.'
  union all
  select 'GLOBAL_RPC',
         case when (select pg_catalog.bool_and(ok) from checks)
                   and (select verified_write_body and verified_read_body
                        and new_child_policy and new_stats_policies from state)
                   then 'PASS'
              when (select pg_catalog.bool_and(ok) from checks)
                   and (select verified_write_body and verified_read_body
                        and old_child_policy and old_stats_policies from state)
                   then 'READY_TO_APPLY'
              else 'BLOCKED' end,
         'Solo contrato de sustituciones; no valida todas las tablas deportivas.'
)
select check_name,status,explanation from result
order by case when check_name='GLOBAL_RPC' then 2
              when check_name='Pruebas de identidades' then 1 else 0 end,
         check_name;
