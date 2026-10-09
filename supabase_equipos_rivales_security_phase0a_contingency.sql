-- APPCAUDAL - Fase 0A - Contingencia de seguridad de equipos_rivales.
--
-- USAR UNICAMENTE si el parche principal ya hizo COMMIT y el acceso STAFF
-- falla por la evaluacion de public.is_app_staff(), mientras que
-- public.current_membership() conserva el contrato verificado.
--
-- No modifica datos, tablas, funciones, RPC ni grants. Mantiene anon bloqueado
-- y sustituye solo las cuatro policies del parche principal.

begin;

-- Evita que otro DDL o escritura sobre la tabla cambie el contrato entre los
-- prechecks y el postcheck. El bloqueo se libera automaticamente con COMMIT o
-- ROLLBACK.
lock table public.equipos_rivales in share row exclusive mode;

do $precheck$
declare
  target_relation oid := pg_catalog.to_regclass('public.equipos_rivales');
  authenticated_oid oid := pg_catalog.to_regrole('authenticated');
  anon_oid oid := pg_catalog.to_regrole('anon');
  membership_function_oid oid := pg_catalog.to_regprocedure(
    'public.current_membership()'
  );
  staff_function_oid oid := pg_catalog.to_regprocedure('public.is_app_staff()');
  actual_authenticated_privileges text[];
  expected_authenticated_privileges constant text[] := array[
    'DELETE', 'INSERT', 'SELECT', 'UPDATE'
  ]::text[];
  invalid_policy_count integer;
  unexpected_policy_count integer;
  function_count integer;
  invalid_function_count integer;
begin
  if target_relation is null
     or authenticated_oid is null
     or anon_oid is null
     or membership_function_oid is null
     or staff_function_oid is null then
    raise exception
      'Contingencia Fase 0A abortada: faltan tabla, roles o helpers requeridos';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = target_relation
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
  ) then
    raise exception
      'Contingencia Fase 0A abortada: equipos_rivales no es una tabla RLS valida';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    where procedure.oid = membership_function_oid
      and procedure.prokind = 'f'
      and procedure.pronargs = 0
      and procedure.proretset
      and procedure.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and procedure.provolatile = 's'
      and procedure.prosecdef
      and procedure.proowner = pg_catalog.to_regrole('postgres')
      and coalesce(procedure.proconfig, array[]::text[])
          @> array['search_path=pg_catalog']::text[]
      and procedure.proallargtypes = array[
        'pg_catalog.uuid'::pg_catalog.regtype::oid,
        'pg_catalog.uuid'::pg_catalog.regtype::oid,
        'pg_catalog.uuid'::pg_catalog.regtype::oid,
        'pg_catalog.text'::pg_catalog.regtype::oid,
        'pg_catalog.uuid'::pg_catalog.regtype::oid,
        'pg_catalog.bool'::pg_catalog.regtype::oid
      ]::oid[]
      and procedure.proargmodes = array[
        't'::"char", 't'::"char", 't'::"char",
        't'::"char", 't'::"char", 't'::"char"
      ]::"char"[]
      and procedure.proargnames = array[
        'membership_id',
        'club_id',
        'user_id',
        'role',
        'jugador_id',
        'is_active'
      ]::text[]
  ) then
    raise exception
      'Contingencia Fase 0A abortada: current_membership() no conserva su contrato seguro';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated', membership_function_oid, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', membership_function_oid, 'EXECUTE'
     ) then
    raise exception
      'Contingencia Fase 0A abortada: ACL insegura o inutilizable en current_membership()';
  end if;

  if pg_catalog.has_table_privilege('anon', target_relation, 'SELECT')
     or pg_catalog.has_table_privilege('anon', target_relation, 'INSERT')
     or pg_catalog.has_table_privilege('anon', target_relation, 'UPDATE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'DELETE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', target_relation, 'TRIGGER') then
    raise exception
      'Contingencia Fase 0A abortada: anon conserva privilegios efectivos';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) privilege
    where relation.oid = target_relation
      and privilege.grantee in (0::oid, anon_oid)
  ) then
    raise exception
      'Contingencia Fase 0A abortada: PUBLIC o anon tienen grants directos';
  end if;

  select pg_catalog.array_agg(
           distinct privilege.privilege_type
           order by privilege.privilege_type
         )
    into actual_authenticated_privileges
  from pg_catalog.pg_class relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) privilege
  where relation.oid = target_relation
    and privilege.grantee = authenticated_oid;

  if actual_authenticated_privileges
     is distinct from expected_authenticated_privileges
     or not pg_catalog.has_table_privilege(
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
       'authenticated', target_relation, 'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', target_relation, 'TRIGGER'
     ) then
    raise exception
      'Contingencia Fase 0A abortada: grants de authenticated inesperados: %',
      actual_authenticated_privileges;
  end if;

  with expected(policy_name, command, needs_using, needs_check) as (
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
       when expected.needs_using then policy.polqual is null
       else policy.polqual is not null
     end
     or case
       when expected.needs_check then policy.polwithcheck is null
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
      'Contingencia Fase 0A abortada: el parche principal no conserva sus cuatro policies esperadas';
  end if;

  select pg_catalog.count(*),
         pg_catalog.count(*) filter (
           where procedure.prosecdef
              or not pg_catalog.has_function_privilege(
                'authenticated', procedure.oid, 'EXECUTE'
              )
              or pg_catalog.has_function_privilege(
                'anon', procedure.oid, 'EXECUTE'
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
      'Contingencia Fase 0A abortada: contrato RPC inesperado (total %, invalidas %)',
      function_count,
      invalid_function_count;
  end if;

  perform pg_catalog.set_config(
    'appcaudal.phase0a_contingency_row_count',
    (select pg_catalog.count(*)::text from public.equipos_rivales),
    true
  );
  perform pg_catalog.set_config(
    'appcaudal.phase0a_contingency_relacl',
    coalesce(
      (select relation.relacl::text
       from pg_catalog.pg_class relation
       where relation.oid = target_relation),
      '<NULL>'
    ),
    true
  );
end
$precheck$;

drop policy equipos_rivales_staff_select
on public.equipos_rivales;

drop policy equipos_rivales_staff_insert
on public.equipos_rivales;

drop policy equipos_rivales_staff_update
on public.equipos_rivales;

drop policy equipos_rivales_staff_delete
on public.equipos_rivales;

-- Fallback independiente de is_app_staff(). current_membership() ya resuelve
-- auth.uid(), descarta memberships inactivas y aborta identidades ambiguas.
create policy equipos_rivales_contingency_staff_select
on public.equipos_rivales
for select
to authenticated
using (
  exists (
    select 1
    from public.current_membership() membership
    where membership.is_active
      and membership.role in ('owner', 'admin', 'staff')
  )
);

create policy equipos_rivales_contingency_staff_insert
on public.equipos_rivales
for insert
to authenticated
with check (
  exists (
    select 1
    from public.current_membership() membership
    where membership.is_active
      and membership.role in ('owner', 'admin', 'staff')
  )
);

create policy equipos_rivales_contingency_staff_update
on public.equipos_rivales
for update
to authenticated
using (
  exists (
    select 1
    from public.current_membership() membership
    where membership.is_active
      and membership.role in ('owner', 'admin', 'staff')
  )
)
with check (
  exists (
    select 1
    from public.current_membership() membership
    where membership.is_active
      and membership.role in ('owner', 'admin', 'staff')
  )
);

create policy equipos_rivales_contingency_staff_delete
on public.equipos_rivales
for delete
to authenticated
using (
  exists (
    select 1
    from public.current_membership() membership
    where membership.is_active
      and membership.role in ('owner', 'admin', 'staff')
  )
);

do $postcheck$
declare
  target_relation oid := pg_catalog.to_regclass('public.equipos_rivales');
  authenticated_oid oid := pg_catalog.to_regrole('authenticated');
  anon_oid oid := pg_catalog.to_regrole('anon');
  membership_function_oid oid := pg_catalog.to_regprocedure(
    'public.current_membership()'
  );
  actual_authenticated_privileges text[];
  expected_authenticated_privileges constant text[] := array[
    'DELETE', 'INSERT', 'SELECT', 'UPDATE'
  ]::text[];
  invalid_policy_count integer;
  unexpected_policy_count integer;
  current_row_count text;
  current_relacl text;
begin
  if target_relation is null
     or authenticated_oid is null
     or anon_oid is null
     or membership_function_oid is null then
    raise exception
      'Contingencia Fase 0A postcheck: faltan objetos requeridos';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = target_relation
      and relation.relrowsecurity
  ) then
    raise exception
      'Contingencia Fase 0A postcheck: RLS dejo de estar habilitado';
  end if;

  if pg_catalog.has_table_privilege('anon', target_relation, 'SELECT')
     or pg_catalog.has_table_privilege('anon', target_relation, 'INSERT')
     or pg_catalog.has_table_privilege('anon', target_relation, 'UPDATE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'DELETE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', target_relation, 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', target_relation, 'TRIGGER') then
    raise exception
      'Contingencia Fase 0A postcheck: anon obtuvo privilegios efectivos';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) privilege
    where relation.oid = target_relation
      and privilege.grantee in (0::oid, anon_oid)
  ) then
    raise exception
      'Contingencia Fase 0A postcheck: PUBLIC o anon tienen grants directos';
  end if;

  select pg_catalog.array_agg(
           distinct privilege.privilege_type
           order by privilege.privilege_type
         )
    into actual_authenticated_privileges
  from pg_catalog.pg_class relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) privilege
  where relation.oid = target_relation
    and privilege.grantee = authenticated_oid;

  if actual_authenticated_privileges
     is distinct from expected_authenticated_privileges then
    raise exception
      'Contingencia Fase 0A postcheck: grants de authenticated cambiaron: %',
      actual_authenticated_privileges;
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated', membership_function_oid, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', membership_function_oid, 'EXECUTE'
     ) then
    raise exception
      'Contingencia Fase 0A postcheck: ACL de current_membership() cambio';
  end if;

  with expected(policy_name, command, needs_using, needs_check) as (
    values
      ('equipos_rivales_contingency_staff_select'::text, 'r'::"char", true, false),
      ('equipos_rivales_contingency_staff_insert'::text, 'a'::"char", false, true),
      ('equipos_rivales_contingency_staff_update'::text, 'w'::"char", true, true),
      ('equipos_rivales_contingency_staff_delete'::text, 'd'::"char", true, false)
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
       when expected.needs_using then policy.polqual is null
       else policy.polqual is not null
     end
     or case
       when expected.needs_check then policy.polwithcheck is null
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
         and dependency.refobjid = membership_function_oid
     )
     or exists (
       select 1
       from pg_catalog.pg_depend dependency
       where dependency.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
         and dependency.objid = policy.oid
         and dependency.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
         and dependency.refobjid <> membership_function_oid
     );

  select pg_catalog.count(*)
    into unexpected_policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = target_relation
    and policy.polname not in (
      'equipos_rivales_contingency_staff_select',
      'equipos_rivales_contingency_staff_insert',
      'equipos_rivales_contingency_staff_update',
      'equipos_rivales_contingency_staff_delete'
    );

  if invalid_policy_count <> 0 or unexpected_policy_count <> 0 then
    raise exception
      'Contingencia Fase 0A postcheck: policies invalidas %; inesperadas %',
      invalid_policy_count,
      unexpected_policy_count;
  end if;

  select pg_catalog.count(*)::text
    into current_row_count
  from public.equipos_rivales;

  select coalesce(relation.relacl::text, '<NULL>')
    into current_relacl
  from pg_catalog.pg_class relation
  where relation.oid = target_relation;

  if current_row_count is distinct from pg_catalog.current_setting(
       'appcaudal.phase0a_contingency_row_count', true
     ) then
    raise exception
      'Contingencia Fase 0A postcheck: cambio inesperado el numero de filas';
  end if;

  if current_relacl is distinct from pg_catalog.current_setting(
       'appcaudal.phase0a_contingency_relacl', true
     ) then
    raise exception
      'Contingencia Fase 0A postcheck: cambiaron los grants de la tabla';
  end if;
end
$postcheck$;

commit;
