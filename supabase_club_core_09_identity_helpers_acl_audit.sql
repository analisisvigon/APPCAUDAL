-- APPCAUDAL - Bloque 1.2 - Auditoria ACL remota estrictamente READ ONLY.
-- Una sola sentencia, cuatro filas y ninguna invocacion de los helpers.

with expected(sort_order, helper_name) as (
  values
    (1, 'current_membership'),
    (2, 'current_jugador_id'),
    (3, 'is_app_staff'),
    (4, 'is_player')
), functions as (
  select
    expected.*,
    procedure_row.oid,
    procedure_row.proowner,
    procedure_row.proacl
  from expected
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.pronamespace = 'public'::regnamespace
   and procedure_row.proname = expected.helper_name
   and procedure_row.pronargs = 0
), acl_entries as (
  select
    functions.sort_order,
    functions.helper_name,
    functions.oid,
    functions.proowner,
    functions.proacl,
    acl.grantor,
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  from functions
  left join lateral pg_catalog.aclexplode(
    coalesce(
      functions.proacl,
      pg_catalog.acldefault('f', functions.proowner)
    )
  ) acl on true
)
select
  functions.helper_name,
  functions.oid,
  pg_catalog.pg_get_userbyid(functions.proowner) as owner,
  functions.proacl is null as acl_is_null,
  functions.proacl::text as raw_acl,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'grantor', pg_catalog.pg_get_userbyid(entry.grantor),
          'grantee', case
            when entry.grantee = 0 then 'PUBLIC'
            else pg_catalog.pg_get_userbyid(entry.grantee)
          end,
          'privilege', entry.privilege_type,
          'grantable', entry.is_grantable,
          'is_owner', entry.grantee = functions.proowner,
          'is_expected_authenticated',
            entry.grantee = 'authenticated'::regrole::oid
        )
        order by entry.grantee, entry.privilege_type
      )
      from acl_entries entry
      where entry.helper_name = functions.helper_name
        and entry.privilege_type is not null
    ),
    '[]'::jsonb
  ) as expanded_acl,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'grantee', pg_catalog.pg_get_userbyid(entry.grantee),
          'grantor', pg_catalog.pg_get_userbyid(entry.grantor),
          'grantable', entry.is_grantable
        )
        order by entry.grantee
      )
      from acl_entries entry
      where entry.helper_name = functions.helper_name
        and entry.privilege_type = 'EXECUTE'
        and entry.grantee <> 0
        and entry.grantee not in (
          functions.proowner,
          'authenticated'::regrole::oid
        )
    ),
    '[]'::jsonb
  ) as unexpected_execute_grantees,
  exists (
    select 1
    from acl_entries entry
    where entry.helper_name = functions.helper_name
      and entry.privilege_type = 'EXECUTE'
      and entry.grantee = functions.proowner
  ) as explicit_owner_execute,
  exists (
    select 1
    from acl_entries entry
    where entry.helper_name = functions.helper_name
      and entry.privilege_type = 'EXECUTE'
      and entry.grantee = 0
  ) as public_execute,
  coalesce(
    pg_catalog.has_function_privilege('anon', functions.oid, 'EXECUTE'),
    false
  ) as anon_execute,
  coalesce(
    pg_catalog.has_function_privilege(
      'authenticated', functions.oid, 'EXECUTE'
    ),
    false
  ) as authenticated_execute
from functions
order by functions.sort_order;
