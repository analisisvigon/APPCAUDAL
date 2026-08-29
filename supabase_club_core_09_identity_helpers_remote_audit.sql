-- APPCAUDAL - Bloque 1.2 - Auditoria remota estrictamente READ ONLY.
-- Una sola sentencia y una unica tabla final de exactamente cuatro filas.
-- No invoca ninguno de los helpers auditados.

with expected(
  sort_order,
  helper_name,
  expected_language,
  expected_security_definer,
  expected_result_type,
  expected_source
) as (
  values
    (
      1,
      'current_membership',
      'plpgsql',
      true,
      'TABLE(membership_id uuid, club_id uuid, user_id uuid, role text, jugador_id uuid, is_active boolean)',
      $expected$
declare
  actor_id uuid := auth.uid();
  active_membership_count integer;
begin
  if actor_id is null then
    return;
  end if;

  select count(*)
    into active_membership_count
  from public.club_memberships membership
  where membership.user_id = actor_id
    and membership.is_active;

  if active_membership_count > 1 then
    raise exception
      'Identidad ambigua: auth.uid() tiene % memberships activas',
      active_membership_count
      using errcode = '21000';
  end if;

  return query
  select
    membership.id,
    membership.club_id,
    membership.user_id,
    membership.role,
    membership.jugador_id,
    membership.is_active
  from public.club_memberships membership
  where membership.user_id = actor_id
    and membership.is_active;
end;
$expected$
    ),
    (
      2,
      'current_jugador_id',
      'sql',
      false,
      'uuid',
      $expected$
  select case
    when membership.role = 'player' then membership.jugador_id
    else null::uuid
  end
  from public.current_membership() membership;
$expected$
    ),
    (
      3,
      'is_app_staff',
      'sql',
      false,
      'boolean',
      $expected$
  select coalesce(
    (
      select membership.role in ('owner', 'admin', 'staff')
      from public.current_membership() membership
    ),
    false
  );
$expected$
    ),
    (
      4,
      'is_player',
      'sql',
      false,
      'boolean',
      $expected$
  select coalesce(
    (
      select
        membership.role = 'player'
        and membership.jugador_id is not null
      from public.current_membership() membership
    ),
    false
  );
$expected$
    )
), actual as (
  select
    expected.*,
    procedure_row.oid,
    procedure_row.proowner,
    procedure_row.prosecdef,
    procedure_row.provolatile,
    procedure_row.proconfig,
    procedure_row.proacl,
    procedure_row.prosrc,
    procedure_row.prokind,
    procedure_row.proleakproof,
    procedure_row.proisstrict,
    procedure_row.proparallel,
    language_row.lanname,
    pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)
      as identity_arguments,
    pg_catalog.pg_get_function_result(procedure_row.oid) as actual_result_type
  from expected
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.pronamespace = 'public'::regnamespace
   and procedure_row.proname = expected.helper_name
   and procedure_row.pronargs = 0
  left join pg_catalog.pg_language language_row
    on language_row.oid = procedure_row.prolang
), evaluated as (
  select
    actual.*,
    coalesce(
      pg_catalog.btrim(
        pg_catalog.replace(actual.prosrc, E'\r\n', E'\n')
      ) = pg_catalog.btrim(
        pg_catalog.replace(actual.expected_source, E'\r\n', E'\n')
      ),
      false
    ) as definition_matches_expected,
    coalesce(
      actual.oid is not null
      and actual.identity_arguments = ''
      and pg_catalog.pg_get_userbyid(actual.proowner) = 'postgres'
      and actual.lanname = actual.expected_language
      and actual.prosecdef is not distinct from actual.expected_security_definer
      and actual.provolatile = 's'
      and actual.proconfig = array['search_path=pg_catalog']::text[]
      and actual.actual_result_type = actual.expected_result_type
      and actual.prokind = 'f'
      and not actual.proleakproof
      and not actual.proisstrict
      and actual.proparallel = 'u',
      false
    ) as security_matches_expected,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          actual.proacl,
          pg_catalog.acldefault('f', actual.proowner)
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_execute,
    coalesce(
      pg_catalog.has_function_privilege('anon', actual.oid, 'EXECUTE'),
      false
    ) as anon_execute,
    coalesce(
      pg_catalog.has_function_privilege(
        'authenticated', actual.oid, 'EXECUTE'
      ),
      false
    ) as authenticated_execute,
    coalesce(
      pg_catalog.has_function_privilege(
        'service_role', actual.oid, 'EXECUTE'
      ),
      false
    ) as service_role_execute,
    coalesce(
      not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            actual.proacl,
            pg_catalog.acldefault('f', actual.proowner)
          )
        ) acl
        where acl.privilege_type = 'EXECUTE'
          and acl.grantee not in (
            actual.proowner,
            'authenticated'::regrole::oid,
            'service_role'::regrole::oid
          )
      )
      and not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            actual.proacl,
            pg_catalog.acldefault('f', actual.proowner)
          )
        ) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon', actual.oid, 'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'authenticated', actual.oid, 'EXECUTE'
      ),
      false
    ) as acl_matches_expected
  from actual
), contracted as (
  select
    evaluated.*,
    evaluated.definition_matches_expected
      and evaluated.security_matches_expected
      and evaluated.acl_matches_expected as contract_matches_expected
  from evaluated
)
select
  contracted.helper_name,
  contracted.oid is not null as "exists",
  pg_catalog.pg_get_userbyid(contracted.proowner) as owner,
  case
    when contracted.oid is null then null
    when contracted.prosecdef then 'SECURITY DEFINER'
    else 'SECURITY INVOKER'
  end as security_mode,
  case contracted.provolatile
    when 'i' then 'IMMUTABLE'
    when 's' then 'STABLE'
    when 'v' then 'VOLATILE'
    else null
  end as volatility,
  case
    when contracted.oid is null then null
    else pg_catalog.array_to_string(contracted.proconfig, ', ')
  end as search_path,
  contracted.actual_result_type as result_type,
  contracted.public_execute,
  contracted.anon_execute,
  contracted.authenticated_execute,
  contracted.service_role_execute,
  contracted.definition_matches_expected,
  contracted.acl_matches_expected,
  contracted.contract_matches_expected,
  case
    when contracted.oid is null then 'MISSING'
    when not contracted.definition_matches_expected then 'DEFINITION_MISMATCH'
    when not contracted.security_matches_expected then 'SECURITY_MISMATCH'
    when not contracted.acl_matches_expected then 'ACL_MISMATCH'
    else 'EXACT_MATCH'
  end as diagnosis
from contracted
order by contracted.sort_order;
