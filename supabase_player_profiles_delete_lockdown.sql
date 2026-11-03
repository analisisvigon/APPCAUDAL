-- NEXO CLUB · Cierre del DELETE directo de perfiles globales.
-- INSTALACION MANUAL, antes de supabase_player_profiles_archive.sql.
-- No ejecuta DELETE ni modifica datos. Falla ante drift del contrato conocido.
begin;

do $lockdown$
declare
  v_function_oid oid := to_regprocedure('public.merge_global_player_profiles(uuid,uuid)');
  v_source text;
  v_owner_name text;
  v_executor_role oid;
  v_unguarded text;
  v_guard_count integer;
  v_begin text[];
  v_guard text := E'  if coalesce(auth.role(), '''') <> ''service_role''\n'
    || E'     and session_user <> ''service_role''\n'
    || E'     and not public.is_app_staff() then\n'
    || E'    raise exception using\n'
    || E'      errcode = ''42501'',\n'
    || E'      message = ''STAFF_ONLY'';\n'
    || E'  end if;\n\n';
  v_policy text;
  v_mode boolean;
  v_path text[];
begin
  if to_regclass('public.players_database') is null
     or to_regprocedure('public.is_app_staff()') is null
     or v_function_oid is null then
    raise exception 'Faltan players_database, is_app_staff o merge_global_player_profiles';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'merge_global_player_profiles') <> 1 then
    raise exception 'Hay sobrecargas inesperadas de merge_global_player_profiles';
  end if;
  if not exists (
    select 1 from pg_class c where c.oid = 'public.players_database'::regclass
      and pg_get_userbyid(c.relowner) = 'postgres'
      and c.relrowsecurity and not c.relforcerowsecurity
  ) then
    raise exception 'Propiedad o RLS inesperados de players_database';
  end if;

  select replace(p.prosrc, chr(13), ''), p.prosecdef, p.proconfig,
    pg_get_userbyid(p.proowner)
    into v_source, v_mode, v_path, v_owner_name
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = v_function_oid and l.lanname = 'plpgsql'
    and pg_get_function_result(p.oid) = 'uuid';
  if v_source is null or v_mode is null then
    raise exception 'Contrato inesperado de merge_global_player_profiles';
  end if;
  if (not v_mode and (v_owner_name <> 'postgres'
      or v_path is distinct from array['search_path=public']::text[]))
     or (v_mode and (v_owner_name <> 'nexo_profile_merge_executor'
      or v_path is distinct from array['search_path=pg_catalog']::text[])) then
    raise exception 'Modo o search_path inesperados de merge_global_player_profiles';
  end if;

  v_guard_count := (length(v_source) - length(replace(v_source, v_guard, '')))
    / length(v_guard);
  v_unguarded := replace(v_source, v_guard, '');
  v_begin := regexp_match(v_unguarded, E'^([[:blank:]]*begin[[:blank:]]*\n)', 'ni');
  if v_guard_count <> 1
     or md5(v_unguarded) <> '5c5121dbebf1c75b2ec013693c2e5a2e'
     or v_begin is null
     or v_source <> regexp_replace(v_unguarded,
       E'^[[:blank:]]*begin[[:blank:]]*\n', v_begin[1] || v_guard, 'ni') then
    raise exception 'La RPC de fusion no coincide con el cuerpo protegido del Bloque 14';
  end if;
  if not has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_function_oid, 'EXECUTE')
     or has_function_privilege('anon', v_function_oid, 'EXECUTE') then
    raise exception 'EXECUTE inesperado de la RPC de fusion';
  end if;
  if exists (
    select 1 from pg_proc p,
      aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = v_function_oid and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC puede ejecutar la RPC de fusion';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.oid <> v_function_oid
      and lower(p.prosrc) like '%players_database%'
      and lower(p.prosrc) like '%delete%'
  ) then
    raise exception 'Hay otras RPC que mencionan DELETE y players_database; revisar antes de retirar el privilegio';
  end if;

  if (select count(*) from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'players_database') not in (4, 5) then
    raise exception 'Numero de politicas inesperado en players_database';
  end if;
  if (select count(*) from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'players_database' and p.policyname in (
        'player_perimeter_staff_select', 'player_perimeter_staff_insert',
        'player_perimeter_staff_update', 'player_perimeter_staff_delete')) <> 4 then
    raise exception 'Faltan politicas conocidas en players_database';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'players_database' and p.policyname not in (
        'player_perimeter_staff_select', 'player_perimeter_staff_insert',
        'player_perimeter_staff_update', 'player_perimeter_staff_delete',
        'player_profile_merge_delete')) then
    raise exception 'Hay politicas ajenas al contrato en players_database';
  end if;
  select regexp_replace(lower(coalesce(p.qual, '')), '[[:space:]()]', '', 'g')
    into v_policy from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'players_database'
    and p.policyname = 'player_perimeter_staff_delete'
    and p.cmd = 'DELETE' and p.permissive = 'PERMISSIVE'
    and p.roles = array['authenticated']::name[] and p.with_check is null;
  if v_policy not in ('is_app_staff', 'public.is_app_staff', 'false')
     or v_policy is null then
    raise exception 'Politica DELETE desconocida en players_database';
  end if;
  if not has_table_privilege('service_role', 'public.players_database', 'DELETE') then
    raise exception 'service_role carece de DELETE antes del cambio';
  end if;

  -- Un ejecutor NOLOGIN hereda los permisos y RLS de authenticated, pero tiene
  -- DELETE solo para la RPC de fusion. No es propietario de tablas deportivas.
  if not v_mode and exists (
    select 1 from pg_roles where rolname = 'nexo_profile_merge_executor'
  ) then
    raise exception 'El nombre del rol ejecutor ya existe antes de esta migracion';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'nexo_profile_merge_executor') then
    execute 'create role nexo_profile_merge_executor nologin inherit nobypassrls nosuperuser nocreaterole nocreatedb noreplication';
  end if;
  select oid into v_executor_role from pg_roles
  where rolname = 'nexo_profile_merge_executor'
    and not rolcanlogin and rolinherit and not rolbypassrls
    and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication;
  if v_executor_role is null then
    raise exception 'El rol ejecutor existe con atributos incompatibles';
  end if;
  if not exists (
    select 1 from pg_auth_members m
    where m.roleid = (select oid from pg_roles where rolname = 'authenticated')
      and m.member = v_executor_role
  ) then
    execute 'grant authenticated to nexo_profile_merge_executor with inherit true, set false';
  end if;
  if not exists (
    select 1 from pg_auth_members m
    where m.roleid = (select oid from pg_roles where rolname = 'authenticated')
      and m.member = v_executor_role
      and m.inherit_option and not m.set_option and not m.admin_option
  ) or pg_has_role('authenticated', 'nexo_profile_merge_executor', 'MEMBER')
    or pg_has_role('nexo_profile_merge_executor', 'postgres', 'MEMBER')
    or pg_has_role('nexo_profile_merge_executor', 'service_role', 'MEMBER') then
    raise exception 'Membresia insegura del rol ejecutor';
  end if;
  if exists (
    select 1 from pg_auth_members m
    where (m.roleid = v_executor_role
      and m.member <> (select oid from pg_roles where rolname = 'postgres'))
       or (m.member = v_executor_role
      and m.roleid <> (select oid from pg_roles where rolname = 'authenticated'))
  ) then
    raise exception 'El rol ejecutor tiene membresias adicionales';
  end if;

  if not exists (
    select 1 from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'players_database'
      and p.policyname = 'player_profile_merge_delete'
  ) then
    execute 'create policy player_profile_merge_delete on public.players_database for delete to nexo_profile_merge_executor using (public.is_app_staff())';
  end if;
  if not exists (
    select 1 from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'players_database'
      and p.policyname = 'player_profile_merge_delete'
      and p.cmd = 'DELETE' and p.permissive = 'PERMISSIVE'
      and p.roles = array['nexo_profile_merge_executor']::name[]
      and regexp_replace(lower(coalesce(p.qual, '')),
        '[[:space:]()]', '', 'g') in ('is_app_staff', 'public.is_app_staff')
  ) then
    raise exception 'Politica de fusion inesperada';
  end if;
  execute 'grant usage on schema public to nexo_profile_merge_executor';
  execute 'grant delete on public.players_database to nexo_profile_merge_executor';
  if not has_function_privilege('nexo_profile_merge_executor',
       'public.is_app_staff()', 'EXECUTE') then
    raise exception 'El ejecutor no puede evaluar el guard STAFF';
  end if;

  -- El cuerpo no cambia. El rol ejecutor sigue sujeto a RLS en todas las
  -- tablas; no se utiliza postgres como definidor de la fusion.
  if not v_mode then
    execute 'grant nexo_profile_merge_executor to postgres with set true';
    execute 'grant create on schema public to nexo_profile_merge_executor';
    execute 'alter function public.merge_global_player_profiles(uuid,uuid) security definer';
    execute 'alter function public.merge_global_player_profiles(uuid,uuid) set search_path = pg_catalog';
    execute 'alter function public.merge_global_player_profiles(uuid,uuid) owner to nexo_profile_merge_executor';
    execute 'revoke create on schema public from nexo_profile_merge_executor';
  end if;
  execute 'alter policy player_perimeter_staff_delete on public.players_database using (false)';
  execute 'revoke delete on public.players_database from public, anon, authenticated';

  if has_table_privilege('authenticated', 'public.players_database', 'DELETE')
     or has_table_privilege('anon', 'public.players_database', 'DELETE')
     or not has_table_privilege('service_role', 'public.players_database', 'DELETE')
     or not has_table_privilege('nexo_profile_merge_executor', 'public.players_database', 'DELETE')
     or has_schema_privilege('nexo_profile_merge_executor', 'public', 'CREATE')
     or not has_function_privilege('nexo_profile_merge_executor',
       'public.is_app_staff()', 'EXECUTE')
     or exists (
       select 1 from pg_auth_members m
       where (m.roleid = v_executor_role
         and m.member <> (select oid from pg_roles where rolname = 'postgres'))
          or (m.member = v_executor_role
         and m.roleid <> (select oid from pg_roles where rolname = 'authenticated'))
     )
     or not has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_function_oid, 'EXECUTE')
     or has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not exists (
       select 1 from pg_proc p where p.oid = v_function_oid
         and p.prosecdef and p.proconfig = array['search_path=pg_catalog']::text[]
         and pg_get_userbyid(p.proowner) = 'nexo_profile_merge_executor'
         and replace(p.prosrc, chr(13), '') = v_source
     )
     or not exists (
       select 1 from pg_policies p where p.schemaname = 'public'
         and p.tablename = 'players_database'
         and p.policyname = 'player_perimeter_staff_delete'
         and p.cmd = 'DELETE' and p.roles = array['authenticated']::name[]
         and regexp_replace(lower(coalesce(p.qual, '')),
           '[[:space:]()]', '', 'g') = 'false'
     ) then
    raise exception 'Postflight de cierre DELETE fallido; transaccion revertida';
  end if;
end;
$lockdown$;

commit;
