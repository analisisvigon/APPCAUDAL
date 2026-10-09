-- APPCAUDAL - Fase 0A - Verificacion READ ONLY.
-- Puede ejecutarse despues del parche principal o de la contingencia.
-- No contiene DDL ni DML.

-- 1. Tabla, RLS y numero de filas.
select
  pg_catalog.to_regclass('public.equipos_rivales') is not null as table_exists,
  coalesce(relation.relrowsecurity, false) as rls_enabled,
  coalesce(relation.relforcerowsecurity, false) as rls_forced,
  (select pg_catalog.count(*) from public.equipos_rivales) as row_count
from (values (1)) seed(value)
left join pg_catalog.pg_class relation
  on relation.oid = pg_catalog.to_regclass('public.equipos_rivales');

-- 2. Privilegios efectivos. Esperado: anon=false en todo; authenticated=true
-- solo para SELECT/INSERT/UPDATE/DELETE.
with target as (
  select pg_catalog.to_regclass('public.equipos_rivales') as relation_oid
), requested(role_name, privilege_name) as (
  values
    ('anon', 'SELECT'), ('anon', 'INSERT'), ('anon', 'UPDATE'),
    ('anon', 'DELETE'), ('anon', 'TRUNCATE'), ('anon', 'REFERENCES'),
    ('anon', 'TRIGGER'),
    ('authenticated', 'SELECT'), ('authenticated', 'INSERT'),
    ('authenticated', 'UPDATE'), ('authenticated', 'DELETE'),
    ('authenticated', 'TRUNCATE'), ('authenticated', 'REFERENCES'),
    ('authenticated', 'TRIGGER')
)
select
  requested.role_name,
  requested.privilege_name,
  pg_catalog.has_table_privilege(
    requested.role_name,
    target.relation_oid,
    requested.privilege_name
  ) as has_effective_privilege
from requested
cross join target
order by requested.role_name, requested.privilege_name;

-- 3. Grants directos instalados.
select
  case when privilege.grantee = 0 then 'PUBLIC'
       else role.rolname
  end as grantee,
  privilege.privilege_type,
  privilege.is_grantable,
  grantor.rolname as grantor
from pg_catalog.pg_class relation
cross join lateral pg_catalog.aclexplode(
  coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
) privilege
left join pg_catalog.pg_roles role on role.oid = privilege.grantee
left join pg_catalog.pg_roles grantor on grantor.oid = privilege.grantor
where relation.oid = pg_catalog.to_regclass('public.equipos_rivales')
order by grantee, privilege.privilege_type;

-- 4. Policies y funciones de las que dependen. Debe aparecer un unico modo:
-- cuatro equipos_rivales_staff_* o cuatro equipos_rivales_contingency_staff_*.
select
  policy.polname as policy_name,
  case policy.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when '*' then 'ALL'
  end as command,
  policy.polpermissive as permissive,
  array(
    select coalesce(role.rolname, 'PUBLIC')
    from unnest(policy.polroles) policy_role(role_oid)
    left join pg_catalog.pg_roles role on role.oid = policy_role.role_oid
    order by coalesce(role.rolname, 'PUBLIC')
  ) as roles,
  pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
  pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression,
  coalesce((
    select pg_catalog.array_agg(
             procedure.oid::pg_catalog.regprocedure::text
             order by procedure.oid::pg_catalog.regprocedure::text
           )
    from pg_catalog.pg_depend dependency
    join pg_catalog.pg_proc procedure
      on dependency.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
     and procedure.oid = dependency.refobjid
    where dependency.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency.objid = policy.oid
  ), array[]::text[]) as function_dependencies
from pg_catalog.pg_policy policy
where policy.polrelid = pg_catalog.to_regclass('public.equipos_rivales')
order by policy.polname;

-- 5. Resumen estructural del modo instalado.
with target as (
  select
    pg_catalog.to_regclass('public.equipos_rivales') as relation_oid,
    pg_catalog.to_regrole('authenticated') as authenticated_oid,
    pg_catalog.to_regprocedure('public.is_app_staff()') as staff_function_oid,
    pg_catalog.to_regprocedure('public.current_membership()') as membership_function_oid
), expected(policy_name, command, needs_using, needs_check, mode, function_oid) as (
  select
    expected_row.policy_name,
    expected_row.command,
    expected_row.needs_using,
    expected_row.needs_check,
    expected_row.mode,
    case expected_row.mode
      when 'PRIMARY_IS_APP_STAFF' then target.staff_function_oid
      when 'CONTINGENCY_CURRENT_MEMBERSHIP' then target.membership_function_oid
    end
  from target
  cross join (values
    ('equipos_rivales_staff_select'::text, 'r'::"char", true, false, 'PRIMARY_IS_APP_STAFF'::text),
    ('equipos_rivales_staff_insert'::text, 'a'::"char", false, true, 'PRIMARY_IS_APP_STAFF'::text),
    ('equipos_rivales_staff_update'::text, 'w'::"char", true, true, 'PRIMARY_IS_APP_STAFF'::text),
    ('equipos_rivales_staff_delete'::text, 'd'::"char", true, false, 'PRIMARY_IS_APP_STAFF'::text),
    ('equipos_rivales_contingency_staff_select'::text, 'r'::"char", true, false, 'CONTINGENCY_CURRENT_MEMBERSHIP'::text),
    ('equipos_rivales_contingency_staff_insert'::text, 'a'::"char", false, true, 'CONTINGENCY_CURRENT_MEMBERSHIP'::text),
    ('equipos_rivales_contingency_staff_update'::text, 'w'::"char", true, true, 'CONTINGENCY_CURRENT_MEMBERSHIP'::text),
    ('equipos_rivales_contingency_staff_delete'::text, 'd'::"char", true, false, 'CONTINGENCY_CURRENT_MEMBERSHIP'::text)
  ) expected_row(policy_name, command, needs_using, needs_check, mode)
), validation as (
  select
    expected.mode,
    pg_catalog.count(*) filter (
      where policy.oid is not null
        and policy.polpermissive
        and policy.polcmd = expected.command
        and policy.polroles = array[target.authenticated_oid::oid]
        and case
          when expected.needs_using then policy.polqual is not null
          else policy.polqual is null
        end
        and case
          when expected.needs_check then policy.polwithcheck is not null
          else policy.polwithcheck is null
        end
        and (
          expected.command <> 'w'::"char"
          or policy.polqual = policy.polwithcheck
        )
        and exists (
          select 1
          from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
            and dependency.objid = policy.oid
            and dependency.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            and dependency.refobjid = expected.function_oid
        )
        and not exists (
          select 1
          from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
            and dependency.objid = policy.oid
            and dependency.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            and dependency.refobjid <> expected.function_oid
        )
    ) as valid_policy_count
  from expected
  cross join target
  left join pg_catalog.pg_policy policy
    on policy.polrelid = target.relation_oid
   and policy.polname = expected.policy_name
  group by expected.mode
), summary as (
  select
    (select pg_catalog.count(*)
     from pg_catalog.pg_policy policy, target
     where policy.polrelid = target.relation_oid) as policy_count,
    coalesce(pg_catalog.max(valid_policy_count) filter (
      where mode = 'PRIMARY_IS_APP_STAFF'
    ), 0) as primary_policy_count,
    coalesce(pg_catalog.max(valid_policy_count) filter (
      where mode = 'CONTINGENCY_CURRENT_MEMBERSHIP'
    ), 0) as contingency_policy_count
  from validation
)
select
  policy_count,
  case
    when policy_count = 4
     and primary_policy_count = 4 then 'PRIMARY_IS_APP_STAFF'
    when policy_count = 4
     and contingency_policy_count = 4 then 'CONTINGENCY_CURRENT_MEMBERSHIP'
    else 'UNEXPECTED'
  end as installed_policy_mode,
  policy_count = 4
    and (primary_policy_count = 4 or contingency_policy_count = 4)
    as policy_contract_ok
from summary;

-- 6. Helpers de autorizacion.
select
  procedure.oid::pg_catalog.regprocedure::text as function_name,
  procedure.provolatile = 's' as is_stable,
  procedure.prosecdef as security_definer,
  pg_catalog.has_function_privilege(
    'authenticated', procedure.oid, 'EXECUTE'
  ) as authenticated_can_execute,
  pg_catalog.has_function_privilege(
    'anon', procedure.oid, 'EXECUTE'
  ) as anon_can_execute,
  pg_catalog.pg_get_function_result(procedure.oid) as result_type
from pg_catalog.pg_proc procedure
where procedure.oid in (
  pg_catalog.to_regprocedure('public.is_app_staff()'),
  pg_catalog.to_regprocedure('public.current_membership()')
)
order by function_name;

-- 7. Inventario de las siete RPC SECURITY INVOKER dependientes.
select
  procedure.oid::pg_catalog.regprocedure::text as function_name,
  not procedure.prosecdef as security_invoker,
  pg_catalog.has_function_privilege(
    'authenticated', procedure.oid, 'EXECUTE'
  ) as authenticated_can_execute,
  pg_catalog.has_function_privilege(
    'anon', procedure.oid, 'EXECUTE'
  ) as anon_can_execute
from pg_catalog.pg_proc procedure
join pg_catalog.pg_namespace namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.prokind = 'f'
  and pg_catalog.pg_get_functiondef(procedure.oid)
      ilike '%equipos_rivales%'
order by function_name;
