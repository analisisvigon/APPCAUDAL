-- NEXO CLUB / Videoanalisis 01A. Solo SELECT; valido antes y despues.
-- PASS confirma solo estas RPC y la lectura de sustituciones; las demas
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
         proc.proconfig, proc.proargnames, proc.pronargdefaults,
         proc.prorettype, proc.prolang,
         pg_catalog.md5(pg_catalog.replace(proc.prosrc,E'\r\n',E'\n'))
           as normalized_source_md5
  from pg_catalog.pg_proc proc
  where proc.oid = pg_catalog.to_regprocedure(
    'public.get_match_substitution_events(uuid)')
), child_policy as (
  select policy.polname, policy.polcmd::text as command_code,
         policy.polpermissive, policy.polroles,
         pg_catalog.lower(pg_catalog.regexp_replace(
           pg_catalog.replace(coalesce(pg_catalog.pg_get_expr(
             policy.polqual,policy.polrelid),''),'public.',''),
           '[[:space:]()]','','g')) as normalized_using
  from pg_catalog.pg_policy policy
  where policy.polrelid =
    pg_catalog.to_regclass('public.partido_eventos_sustitucion')
), state as (
  select
    (select count(*) from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace
        on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public'
        and proc.proname = 'mutate_match_substitution_atomic') = 1
      as unique_signature,
    coalesce((select normalized_source_md5 =
      'd5961a8a85c1fe340e5bb160fe4c6b28' from routine),false)
      as old_body,
    coalesce((select normalized_source_md5 =
      '745bd5f2d80cef1815a33698d30b2f2b' from routine),false)
      as new_body,
    (select count(*) from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace
        on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public'
        and proc.proname = 'get_match_substitution_events') = 1
      as unique_read_signature,
    coalesce((select normalized_source_md5 =
      '6ee09faf368fa5fba7e2b90032207e2a' from read_routine),false)
      as old_read_body,
    coalesce((select normalized_source_md5 =
      '5abccd5fdb69b1476268d72a1a2b3180' from read_routine),false)
      as new_read_body,
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
      from read_routine),false) as read_contract,
    (select count(*) = 1 from child_policy) as unique_child_policy,
    exists(select 1 from child_policy
      where polname = 'substitution_staff_select'
        and command_code = 'r' and polpermissive
        and polroles = array['authenticated'::regrole::oid]
        and normalized_using = 'is_app_staff') as old_child_policy,
    exists(select 1 from child_policy
      where polname = 'substitution_staff_select'
        and command_code = 'r' and polpermissive
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
  union all select 'Grants de tabla hija sin escritura directa', child_grants from state
  union all select 'Tablas y helper presentes', dependencies_present from state
), result as (
  select check_name,
         case when ok then 'PASS' else 'FAIL' end as status,
         'Comprobacion estructural de la RPC.'::text as explanation
  from checks
  union all
  select 'Cuerpo de autorizacion',
         case when new_body then 'PASS'
              when old_body then 'READY_TO_APPLY' else 'BLOCKED' end,
         'Huella normalizada: antiguo o corregido; otra huella requiere revision.'
  from state
  union all
  select 'Cuerpo de consulta de sustituciones',
         case when new_read_body then 'PASS'
              when old_read_body then 'READY_TO_APPLY' else 'BLOCKED' end,
         'Huella de la RPC de lectura: antigua o corregida.'
  from state
  union all
  select 'Policy SELECT de sustituciones',
         case when new_child_policy then 'PASS'
              when old_child_policy then 'READY_TO_APPLY' else 'BLOCKED' end,
         'No deben existir otras policies permisivas sobre esta tabla.'
  from state
  union all
  select 'Pruebas de identidades', 'PENDING',
         'Requieren entorno aislado y fixtures: owner, staff, revocacion, temporada cerrada y anon.'
  union all
  select 'GLOBAL_RPC',
         case when (select pg_catalog.bool_and(ok) from checks)
                   and (select new_body and new_read_body
                        and new_child_policy from state) then 'PASS'
              when (select pg_catalog.bool_and(ok) from checks)
                   and (select old_body and old_read_body
                        and old_child_policy from state) then 'READY_TO_APPLY'
              else 'BLOCKED' end,
         'Solo contrato de sustituciones; no valida todas las tablas deportivas.'
)
select check_name,status,explanation from result
order by case when check_name='GLOBAL_RPC' then 2
              when check_name='Pruebas de identidades' then 1 else 0 end,
         check_name;
