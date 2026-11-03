-- NEXO CLUB · Verificador de solo lectura del cierre de DELETE directo.
-- GLOBAL STRUCTURAL PASS no equivale a pruebas de identidad ejecutadas.
with guard_text as (
  select E'  if coalesce(auth.role(), '''') <> ''service_role''\n'
    || E'     and session_user <> ''service_role''\n'
    || E'     and not public.is_app_staff() then\n'
    || E'    raise exception using\n'
    || E'      errcode = ''42501'',\n'
    || E'      message = ''STAFF_ONLY'';\n'
    || E'  end if;\n\n' as body
),
merge_rpc as (
  select p.oid, replace(p.prosrc, chr(13), '') as source,
    p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner_name,
    l.lanname as language_name, pg_get_function_result(p.oid) as result_type
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.merge_global_player_profiles(uuid,uuid)')
),
merge_contract as (
  select m.*,
    replace(m.source, g.body, '') as unguarded,
    (length(m.source) - length(replace(m.source, g.body, '')))
      / nullif(length(g.body), 0) as guard_count,
    g.body as guard_body
  from merge_rpc m cross join guard_text g
),
delete_candidates as (
  select format('%I.%I(%s)', n.nspname, p.proname,
    regexp_replace(oidvectortypes(p.proargtypes), ',[[:space:]]*', ',', 'g'))
    as signature, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid <> to_regprocedure('public.merge_global_player_profiles(uuid,uuid)')
    and lower(p.prosrc) like '%players_database%'
    and lower(p.prosrc) like '%delete%'
),
checks as (
  select 'STRUCTURAL'::text as category, 'players_database RLS activo'::text as check_name,
    coalesce((select c.relrowsecurity from pg_class c
      where c.oid = to_regclass('public.players_database')), false) as ok
  union all select 'STRUCTURAL', 'authenticated sin DELETE efectivo',
    not coalesce(has_table_privilege('authenticated',
      to_regclass('public.players_database'), 'DELETE'), true)
  union all select 'STRUCTURAL', 'anon sin DELETE efectivo',
    not coalesce(has_table_privilege('anon',
      to_regclass('public.players_database'), 'DELETE'), true)
  union all select 'STRUCTURAL', 'PUBLIC sin DELETE directo', not exists (
    select 1 from pg_class c,
      aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where c.oid = to_regclass('public.players_database')
      and acl.grantee = 0 and acl.privilege_type = 'DELETE')
  union all select 'STRUCTURAL', 'service_role conserva DELETE',
    coalesce(has_table_privilege('service_role',
      to_regclass('public.players_database'), 'DELETE'), false)
  union all select 'STRUCTURAL', 'cinco politicas conocidas sin adicionales',
    (select count(*) = 5 and count(*) filter (where policyname in (
      'player_perimeter_staff_select', 'player_perimeter_staff_insert',
      'player_perimeter_staff_update', 'player_perimeter_staff_delete',
      'player_profile_merge_delete')) = 5
    from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'players_database')
  union all select 'STRUCTURAL', 'DELETE RLS inerte para authenticated', exists (
    select 1 from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'players_database'
      and p.policyname = 'player_perimeter_staff_delete'
      and p.cmd = 'DELETE' and p.permissive = 'PERMISSIVE'
      and p.roles = array['authenticated']::name[]
      and p.with_check is null
      and regexp_replace(lower(coalesce(p.qual, '')),
        '[[:space:]()]', '', 'g') = 'false')
  union all select 'STRUCTURAL', 'rol ejecutor aislado y sin BYPASSRLS', exists (
    select 1 from pg_roles r where r.rolname = 'nexo_profile_merge_executor'
      and not r.rolcanlogin and r.rolinherit and not r.rolbypassrls
      and not r.rolsuper and not r.rolcreaterole and not r.rolcreatedb
      and not r.rolreplication
      and not pg_has_role('authenticated', r.rolname, 'MEMBER')
      and not pg_has_role(r.rolname, 'postgres', 'MEMBER')
      and not pg_has_role(r.rolname, 'service_role', 'MEMBER')
      and not has_schema_privilege(r.rolname, 'public', 'CREATE'))
  union all select 'STRUCTURAL', 'ejecutor hereda authenticated sin SET ROLE', exists (
    select 1 from pg_auth_members m join pg_roles r on r.oid = m.member
    join pg_roles parent on parent.oid = m.roleid
    where r.rolname = 'nexo_profile_merge_executor'
      and parent.rolname = 'authenticated'
      and m.inherit_option and not m.set_option and not m.admin_option)
  union all select 'STRUCTURAL', 'ejecutor sin otras membresias', not exists (
    select 1 from pg_auth_members m
    where (m.roleid = (select oid from pg_roles
        where rolname = 'nexo_profile_merge_executor')
      and m.member <> (select oid from pg_roles where rolname = 'postgres'))
       or (m.member = (select oid from pg_roles
        where rolname = 'nexo_profile_merge_executor')
      and m.roleid <> (select oid from pg_roles where rolname = 'authenticated')))
  union all select 'STRUCTURAL', 'ejecutor tiene DELETE solo para RPC',
    coalesce(has_table_privilege('nexo_profile_merge_executor',
      to_regclass('public.players_database'), 'DELETE'), false)
  union all select 'STRUCTURAL', 'ejecutor puede evaluar guard STAFF',
    coalesce(has_function_privilege('nexo_profile_merge_executor',
      to_regprocedure('public.is_app_staff()'), 'EXECUTE'), false)
  union all select 'STRUCTURAL', 'politica DELETE solo para ejecutor', exists (
    select 1 from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'players_database'
      and p.policyname = 'player_profile_merge_delete'
      and p.cmd = 'DELETE' and p.permissive = 'PERMISSIVE'
      and p.roles = array['nexo_profile_merge_executor']::name[]
      and regexp_replace(lower(coalesce(p.qual, '')),
        '[[:space:]()]', '', 'g') in ('is_app_staff', 'public.is_app_staff'))
  union all select 'STRUCTURAL', 'merge sin sobrecargas',
    (select count(*) = 1 from pg_proc p join pg_namespace n
      on n.oid = p.pronamespace where n.nspname = 'public'
        and p.proname = 'merge_global_player_profiles')
  union all select 'STRUCTURAL', 'sin otras RPC DELETE detectables sobre perfiles',
    not exists (select 1 from delete_candidates)
  union all select 'STRUCTURAL', 'merge SECURITY DEFINER con ejecutor y path seguro',
    coalesce((select m.prosecdef and m.owner_name = 'nexo_profile_merge_executor'
      and m.proconfig = array['search_path=pg_catalog']::text[]
      and m.language_name = 'plpgsql' and m.result_type = 'uuid'
      from merge_contract m), false)
  union all select 'STRUCTURAL', 'cuerpo y guard de merge acreditados',
    coalesce((select m.guard_count = 1
      and md5(m.unguarded) = '5c5121dbebf1c75b2ec013693c2e5a2e'
      and m.source = regexp_replace(m.unguarded,
        E'^[[:blank:]]*begin[[:blank:]]*\n',
        (regexp_match(m.unguarded,
          E'^([[:blank:]]*begin[[:blank:]]*\n)', 'ni'))[1]
          || m.guard_body, 'ni')
      from merge_contract m), false)
  union all select 'STRUCTURAL', 'merge EXECUTE authenticated',
    coalesce(has_function_privilege('authenticated',
      to_regprocedure('public.merge_global_player_profiles(uuid,uuid)'), 'EXECUTE'), false)
  union all select 'STRUCTURAL', 'merge EXECUTE service_role',
    coalesce(has_function_privilege('service_role',
      to_regprocedure('public.merge_global_player_profiles(uuid,uuid)'), 'EXECUTE'), false)
  union all select 'STRUCTURAL', 'merge sin EXECUTE anon',
    not coalesce(has_function_privilege('anon',
      to_regprocedure('public.merge_global_player_profiles(uuid,uuid)'), 'EXECUTE'), true)
  union all select 'STRUCTURAL', 'merge sin EXECUTE PUBLIC', not exists (
    select 1 from pg_proc p,
      aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = to_regprocedure('public.merge_global_player_profiles(uuid,uuid)')
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
  union all select 'STRUCTURAL', 'retirada de equipo conserva EXECUTE',
    coalesce(has_function_privilege('authenticated',
      to_regprocedure('public.remove_global_player_from_current_team(uuid,date)'),
      'EXECUTE'), false)
  union all select 'STRUCTURAL', 'retirada de equipo conserva cuerpo y RLS invoker',
    coalesce((select not p.prosecdef
      and p.proconfig = array['search_path=public']::text[]
      and md5(replace(replace(p.prosrc, chr(13), ''), g.body, ''))
        = '0cd47394f23797cdefa3578eb84e2be9'
      from pg_proc p cross join guard_text g
      where p.oid = to_regprocedure('public.remove_global_player_from_current_team(uuid,date)')), false)
  union all select 'STRUCTURAL', 'guardado de perfil conserva EXECUTE',
    coalesce(has_function_privilege('authenticated',
      to_regprocedure('public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)'),
      'EXECUTE'), false)
  union all select 'STRUCTURAL', 'guardado de perfil conserva cuerpo y RLS invoker',
    coalesce((select not p.prosecdef
      and p.proconfig = array['search_path=public']::text[]
      and md5(replace(replace(p.prosrc, chr(13), ''), g.body, ''))
        = 'a638f6ca4d202abbcb562b5261b4b6e4'
      from pg_proc p cross join guard_text g
      where p.oid = to_regprocedure('public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)')), false)
),
report as (
  select category, check_name, case when ok then 'PASS' else 'FAIL' end as result
  from checks
  union all select 'IDENTITY', 'owner fusiona dos perfiles de prueba con ROLLBACK', 'PENDING'
  union all select 'IDENTITY', 'staff no puede DELETE directo', 'PENDING'
  union all select 'IDENTITY', 'staff autorizado conserva fusion por RPC', 'PENDING'
  union all select 'IDENTITY', 'player y anon sin DELETE ni fusion', 'PENDING'
  union all select 'IDENTITY', 'retirada de equipo y guardado siguen operativos', 'PENDING'
  union all select 'RPC_REVIEW',
    signature || case when prosecdef then ' · SECURITY DEFINER' else ' · SECURITY INVOKER' end,
    'PENDING' from delete_candidates
)
select category, check_name, result from report
union all
select 'SUMMARY', 'GLOBAL STRUCTURAL',
  case when bool_and(ok) then 'PASS' else 'BLOCKED' end from checks;
