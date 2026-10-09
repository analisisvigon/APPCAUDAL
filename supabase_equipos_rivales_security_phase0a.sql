-- APPCAUDAL - Fase 0A - Cierre de seguridad de public.equipos_rivales.
--
-- Alcance exclusivo:
--   - grants de public.equipos_rivales para anon y authenticated;
--   - policies RLS de public.equipos_rivales.
--
-- No modifica datos, funciones, otras tablas ni dependencias.
-- Ejecutar el archivo completo en una sola operacion desde Supabase SQL Editor.

begin;

-- PRECHECK. El parche solo acepta el contrato remoto auditado. Cualquier
-- desviacion aborta antes de cambiar grants o policies.
do $precheck$
declare
  target_relation oid := pg_catalog.to_regclass('public.equipos_rivales');
  target_owner oid;
  anon_oid oid;
  authenticated_oid oid;
  service_role_oid oid;
  postgres_oid oid;
  actual_anon_privileges text[];
  actual_authenticated_privileges text[];
  expected_full_privileges constant text[] := array[
    'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER',
    'TRUNCATE', 'UPDATE'
  ]::text[];
  function_count integer;
  invalid_function_count integer;
  invalid_policy_count integer;
begin
  if target_relation is null then
    raise exception
      'Fase 0A abortada: no existe public.equipos_rivales';
  end if;

  select relation.relowner
    into target_owner
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where relation.oid = target_relation
    and namespace.nspname = 'public'
    and relation.relname = 'equipos_rivales'
    and relation.relkind in ('r', 'p')
    and relation.relrowsecurity;

  if target_owner is null then
    raise exception
      'Fase 0A abortada: equipos_rivales no es una tabla esperada o no tiene RLS habilitado';
  end if;

  select role.oid into anon_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'anon';

  select role.oid into authenticated_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'authenticated';

  select role.oid into service_role_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'service_role';

  select role.oid into postgres_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'postgres';

  if anon_oid is null
     or authenticated_oid is null
     or service_role_oid is null
     or postgres_oid is null then
    raise exception
      'Fase 0A abortada: faltan roles requeridos anon, authenticated, service_role o postgres';
  end if;

  if pg_catalog.to_regprocedure('public.is_app_staff()') is null then
    raise exception
      'Fase 0A abortada: no existe public.is_app_staff()';
  end if;

  if pg_catalog.to_regprocedure('public.current_membership()') is null then
    raise exception
      'Fase 0A abortada: no existe public.current_membership()';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    where procedure.oid = 'public.is_app_staff()'::pg_catalog.regprocedure
      and procedure.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and procedure.pronargs = 0
      and procedure.provolatile = 's'
  ) then
    raise exception
      'Fase 0A abortada: public.is_app_staff() no conserva la firma booleana STABLE esperada';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated',
       'public.is_app_staff()'::pg_catalog.regprocedure,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.current_membership()'::pg_catalog.regprocedure,
       'EXECUTE'
     ) then
    raise exception
      'Fase 0A abortada: authenticated no puede ejecutar is_app_staff() o current_membership()';
  end if;

  select pg_catalog.array_agg(
           distinct privilege.privilege_type
           order by privilege.privilege_type
         )
    into actual_anon_privileges
  from pg_catalog.pg_class relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      relation.relacl,
      pg_catalog.acldefault('r', relation.relowner)
    )
  ) privilege
  where relation.oid = target_relation
    and privilege.grantee = anon_oid;

  select pg_catalog.array_agg(
           distinct privilege.privilege_type
           order by privilege.privilege_type
         )
    into actual_authenticated_privileges
  from pg_catalog.pg_class relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      relation.relacl,
      pg_catalog.acldefault('r', relation.relowner)
    )
  ) privilege
  where relation.oid = target_relation
    and privilege.grantee = authenticated_oid;

  if actual_anon_privileges is distinct from expected_full_privileges then
    raise exception
      'Fase 0A abortada: privilegios directos de anon inesperados: %',
      actual_anon_privileges;
  end if;

  if actual_authenticated_privileges is distinct from expected_full_privileges then
    raise exception
      'Fase 0A abortada: privilegios directos de authenticated inesperados: %',
      actual_authenticated_privileges;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) privilege
    where relation.oid = target_relation
      and privilege.grantee in (anon_oid, authenticated_oid)
      and privilege.is_grantable
  ) then
    raise exception
      'Fase 0A abortada: anon o authenticated tienen grant option inesperado';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) privilege
    where relation.oid = target_relation
      and privilege.grantee = 0::oid
  ) then
    raise exception
      'Fase 0A abortada: PUBLIC tiene privilegios directos inesperados sobre equipos_rivales';
  end if;

  -- Conserva una instantanea transaccional de todos los ACL no dirigidos por
  -- este parche. El postcheck exigira igualdad exacta, sin asumir que
  -- service_role o postgres tengan un conjunto concreto de grants directos.
  perform pg_catalog.set_config(
    'appcaudal.phase0a_preserved_acl',
    coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_array(
                 privilege.grantor,
                 privilege.grantee,
                 privilege.privilege_type,
                 privilege.is_grantable
               )
               order by
                 privilege.grantor,
                 privilege.grantee,
                 privilege.privilege_type,
                 privilege.is_grantable
             )::text
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) privilege
      where relation.oid = target_relation
        and privilege.grantee not in (anon_oid, authenticated_oid)
    ), '[]'),
    true
  );

  if (select pg_catalog.count(*)
      from pg_catalog.pg_policy policy
      where policy.polrelid = target_relation) <> 2 then
    raise exception
      'Fase 0A abortada: se esperaban exactamente dos policies instaladas';
  end if;

  with expected(policy_name, role_oid) as (
    values
      ('allow anon all equipos_rivales'::text, anon_oid),
      ('allow authenticated all equipos_rivales'::text, authenticated_oid)
  )
  select pg_catalog.count(*)
    into invalid_policy_count
  from expected
  left join pg_catalog.pg_policy policy
    on policy.polrelid = target_relation
   and policy.polname = expected.policy_name
  where policy.oid is null
     or not policy.polpermissive
     or policy.polcmd <> '*'::"char"
     or policy.polroles <> array[expected.role_oid]::oid[]
     or pg_catalog.regexp_replace(
          coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), ''),
          '[[:space:]()]',
          '',
          'g'
        ) <> 'true'
     or (
       policy.polwithcheck is not null
       and pg_catalog.regexp_replace(
             pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
             '[[:space:]()]',
             '',
             'g'
           ) <> 'true'
     );

  if invalid_policy_count <> 0 then
    raise exception
      'Fase 0A abortada: % policies abiertas no coinciden con el contrato auditado',
      invalid_policy_count;
  end if;

  select pg_catalog.count(*),
         pg_catalog.count(*) filter (
           where procedure.prosecdef
              or not pg_catalog.has_function_privilege(
                'authenticated',
                procedure.oid,
                'EXECUTE'
              )
              or pg_catalog.has_function_privilege(
                'anon',
                procedure.oid,
                'EXECUTE'
              )
         )
    into function_count, invalid_function_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prokind = 'f'
    and pg_catalog.pg_get_functiondef(procedure.oid)
        ilike '%equipos_rivales%';

  if function_count <> 7 or invalid_function_count <> 0 then
    raise exception
      'Fase 0A abortada: contrato de funciones inesperado (total %, invalidas %)',
      function_count,
      invalid_function_count;
  end if;
end
$precheck$;

-- GRANTS. La revocacion previa evita conservar privilegios amplios como
-- MAINTAIN, TRUNCATE, REFERENCES o TRIGGER en authenticated.
revoke all privileges on table public.equipos_rivales from anon;
revoke all privileges on table public.equipos_rivales from authenticated;

grant select, insert, update, delete
on table public.equipos_rivales
to authenticated;

-- Se eliminan exclusivamente las dos policies abiertas confirmadas.
drop policy "allow anon all equipos_rivales"
on public.equipos_rivales;

drop policy "allow authenticated all equipos_rivales"
on public.equipos_rivales;

-- Contrato RLS cerrado por operacion. INSERT usa exclusivamente WITH CHECK;
-- UPDATE exige permiso tanto sobre la fila anterior como sobre la resultante.
create policy equipos_rivales_staff_select
on public.equipos_rivales
for select
to authenticated
using (public.is_app_staff());

create policy equipos_rivales_staff_insert
on public.equipos_rivales
for insert
to authenticated
with check (public.is_app_staff());

create policy equipos_rivales_staff_update
on public.equipos_rivales
for update
to authenticated
using (public.is_app_staff())
with check (public.is_app_staff());

create policy equipos_rivales_staff_delete
on public.equipos_rivales
for delete
to authenticated
using (public.is_app_staff());

-- POSTCHECK. Si cualquier condicion falla, la excepcion revierte tambien los
-- REVOKE, GRANT, DROP POLICY y CREATE POLICY anteriores.
do $postcheck$
declare
  target_relation oid := pg_catalog.to_regclass('public.equipos_rivales');
  authenticated_oid oid;
  anon_oid oid;
  actual_authenticated_privileges text[];
  staff_function_oid oid := pg_catalog.to_regprocedure(
    'public.is_app_staff()'
  );
  expected_authenticated_privileges constant text[] := array[
    'DELETE', 'INSERT', 'SELECT', 'UPDATE'
  ]::text[];
  invalid_policy_count integer;
  unexpected_policy_count integer;
  function_count integer;
  invalid_function_count integer;
  preserved_acl_before text;
  preserved_acl_after text;
begin
  select role.oid into authenticated_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'authenticated';

  select role.oid into anon_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'anon';

  if target_relation is null
     or authenticated_oid is null
     or anon_oid is null
     or staff_function_oid is null then
    raise exception
      'Fase 0A postcheck: faltan tabla, roles o public.is_app_staff()';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = target_relation
      and relation.relrowsecurity
  ) then
    raise exception
      'Fase 0A postcheck: RLS no esta habilitado';
  end if;

  if pg_catalog.has_table_privilege('anon', target_relation, 'SELECT')
     or pg_catalog.has_table_privilege('anon', target_relation, 'INSERT')
     or pg_catalog.has_table_privilege('anon', target_relation, 'UPDATE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'DELETE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'MAINTAIN')
     or pg_catalog.has_table_privilege('anon', target_relation, 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', target_relation, 'TRIGGER') then
    raise exception
      'Fase 0A postcheck: anon conserva algun privilegio sobre equipos_rivales';
  end if;

  select pg_catalog.array_agg(
           distinct privilege.privilege_type
           order by privilege.privilege_type
         )
    into actual_authenticated_privileges
  from pg_catalog.pg_class relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      relation.relacl,
      pg_catalog.acldefault('r', relation.relowner)
    )
  ) privilege
  where relation.oid = target_relation
    and privilege.grantee = authenticated_oid;

  if actual_authenticated_privileges
     is distinct from expected_authenticated_privileges then
    raise exception
      'Fase 0A postcheck: privilegios de authenticated inesperados: %',
      actual_authenticated_privileges;
  end if;

  if not pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'MAINTAIN'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'TRIGGER'
     ) then
    raise exception
      'Fase 0A postcheck: privilegios efectivos de authenticated incorrectos';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) privilege
    where relation.oid = target_relation
      and privilege.grantee = authenticated_oid
      and privilege.is_grantable
  ) then
    raise exception
      'Fase 0A postcheck: authenticated conserva grant option';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) privilege
    where relation.oid = target_relation
      and privilege.grantee in (0::oid, anon_oid)
  ) then
    raise exception
      'Fase 0A postcheck: PUBLIC o anon conservan grants directos';
  end if;

  preserved_acl_before := pg_catalog.current_setting(
    'appcaudal.phase0a_preserved_acl',
    true
  );

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_array(
               privilege.grantor,
               privilege.grantee,
               privilege.privilege_type,
               privilege.is_grantable
             )
             order by
               privilege.grantor,
               privilege.grantee,
               privilege.privilege_type,
               privilege.is_grantable
           )::text,
           '[]'
         )
    into preserved_acl_after
  from pg_catalog.pg_class relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      relation.relacl,
      pg_catalog.acldefault('r', relation.relowner)
    )
  ) privilege
  where relation.oid = target_relation
    and privilege.grantee not in (anon_oid, authenticated_oid);

  if preserved_acl_before is null
     or preserved_acl_after is distinct from preserved_acl_before then
    raise exception
      'Fase 0A postcheck: cambiaron ACL ajenos a anon/authenticated';
  end if;

  with expected(
    policy_name,
    command,
    needs_using,
    needs_check
  ) as (
    values
      ('equipos_rivales_staff_select'::text, 'r'::"char", true, false),
      ('equipos_rivales_staff_insert'::text, 'a'::"char", false, true),
      ('equipos_rivales_staff_update'::text, 'w'::"char", true, true),
      ('equipos_rivales_staff_delete'::text, 'd'::"char", true, false)
  )
  select pg_catalog.count(*)
    into invalid_policy_count
  from expected
  left join pg_catalog.pg_policy policy
    on policy.polrelid = target_relation
   and policy.polname = expected.policy_name
  where policy.oid is null
     or not policy.polpermissive
     or policy.polcmd <> expected.command
     or policy.polroles <> array[authenticated_oid]::oid[]
     or case
       when expected.needs_using then
         policy.polqual is null
       else policy.polqual is not null
     end
     or case
       when expected.needs_check then
         policy.polwithcheck is null
       else policy.polwithcheck is not null
     end
     or (
       expected.command = 'w'::"char"
       and policy.polqual is distinct from policy.polwithcheck
     )
     or not exists (
       select 1
       from pg_catalog.pg_depend dependency
       where dependency.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
         and dependency.objid = policy.oid
         and dependency.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
         and dependency.refobjid = staff_function_oid
     )
     or exists (
       select 1
       from pg_catalog.pg_depend dependency
       where dependency.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
         and dependency.objid = policy.oid
         and dependency.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
         and dependency.refobjid <> staff_function_oid
     );

  select pg_catalog.count(*)
    into unexpected_policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = target_relation
    and policy.polname not in (
      'equipos_rivales_staff_select',
      'equipos_rivales_staff_insert',
      'equipos_rivales_staff_update',
      'equipos_rivales_staff_delete'
    );

  if invalid_policy_count <> 0 or unexpected_policy_count <> 0 then
    raise exception
      'Fase 0A postcheck: policies invalidas %; policies inesperadas %',
      invalid_policy_count,
      unexpected_policy_count;
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated',
       staff_function_oid,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.current_membership()'::pg_catalog.regprocedure,
       'EXECUTE'
     ) then
    raise exception
      'Fase 0A postcheck: authenticated no puede resolver la identidad STAFF';
  end if;

  select pg_catalog.count(*),
         pg_catalog.count(*) filter (
           where procedure.prosecdef
              or not pg_catalog.has_function_privilege(
                'authenticated',
                procedure.oid,
                'EXECUTE'
              )
              or pg_catalog.has_function_privilege(
                'anon',
                procedure.oid,
                'EXECUTE'
              )
         )
    into function_count, invalid_function_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prokind = 'f'
    and pg_catalog.pg_get_functiondef(procedure.oid)
        ilike '%equipos_rivales%';

  if function_count <> 7 or invalid_function_count <> 0 then
    raise exception
      'Fase 0A postcheck: las funciones dependientes cambiaron (total %, invalidas %)',
      function_count,
      invalid_function_count;
  end if;
end
$postcheck$;

commit;
