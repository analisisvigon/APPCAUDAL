-- BLOQUE 1.5 - Verificacion posterior de visibilidad de memberships.
--
-- Ejecutar el archivo completo despues de aplicar la migracion 12 y ANTES de
-- crear la identidad PLAYER. Devuelve una unica tabla de cinco filas.
-- La funcion pg_temp, los claims y los cambios de role desaparecen al acabar
-- con ROLLBACK. No modifica datos ni objetos persistentes.

begin;

create or replace function pg_temp.verify_membership_visibility()
returns table (
  scenario text,
  simulated_user_id uuid,
  database_role text,
  visible_memberships integer,
  own_membership_rows integer,
  expected_own_club_rows integer,
  outside_own_club_rows integer,
  query_denied boolean,
  old_select_policy_absent boolean,
  own_select_policy_ok boolean,
  staff_select_policy_ok boolean,
  manager_write_policies_ok boolean,
  no_open_policy boolean,
  rls_ok boolean,
  test_ok boolean,
  details text
)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  membership_relation constant oid := 'public.club_memberships'::regclass;
  owner_id constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3';
  staff_id constant uuid := 'e0933d02-76c7-4e71-9765-896593e1ae80';
  no_membership_id constant uuid :=
    'b1500000-0000-4000-8000-000000000099';
  authenticated_oid oid;
  anon_oid oid;
  scenario_row record;
  actor_club_id uuid;
  local_visible integer;
  local_own integer;
  local_expected_club integer;
  local_outside integer;
  local_denied boolean;
  error_state text;
  error_message text;
  select_policy_count integer;
  invalid_manager_count integer;
  open_policy_count integer;
begin
  select role.oid into authenticated_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'authenticated';

  select role.oid into anon_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'anon';

  if authenticated_oid is null or anon_oid is null then
    raise exception
      'Verificacion Bloque 1.5 abortada: faltan authenticated o anon';
  end if;

  old_select_policy_absent := not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
      and policy.polname = 'Club members can read memberships'
  );

  own_select_policy_ok := exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
      and policy.polname = 'Membership users can read own'
      and policy.polpermissive
      and policy.polcmd = 'r'
      and policy.polroles = array[authenticated_oid]::oid[]
      and policy.polwithcheck is null
      and pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) = 'user_id=auth.uid'
  );

  staff_select_policy_ok := exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
      and policy.polname = 'Membership app staff can read own club'
      and policy.polpermissive
      and policy.polcmd = 'r'
      and policy.polroles = array[authenticated_oid]::oid[]
      and policy.polwithcheck is null
      and pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) like 'is_app_staffandclub_id=select%club_idfromcurrent_membership%'
      and coalesce(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
        ''
      ) !~* '(^|[^a-z_])or([^a-z_]|$)'
  );

  select count(*)::integer
    into select_policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = membership_relation
    and policy.polcmd in ('r', '*');

  with expected(policy_name, command, needs_using, needs_check) as (
    values
      ('Club managers can insert memberships'::text, 'a'::"char", false, true),
      ('Club managers can update memberships'::text, 'w'::"char", true, true),
      ('Club managers can delete memberships'::text, 'd'::"char", true, false)
  ),
  policies as (
    select
      policy.*,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) as normalized_using,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
            ''
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) as normalized_check
    from pg_catalog.pg_policy policy
    where policy.polrelid = membership_relation
  )
  select count(*)::integer
    into invalid_manager_count
  from expected
  left join policies policy on policy.polname = expected.policy_name
  where policy.oid is null
    or not policy.polpermissive
    or policy.polcmd <> expected.command
    or policy.polroles <> array[authenticated_oid]::oid[]
    or case
      when expected.needs_using then
        policy.normalized_using <> 'can_manage_clubclub_id'
      else policy.polqual is not null
    end
    or case
      when expected.needs_check then
        policy.normalized_check <> 'can_manage_clubclub_id'
      else policy.polwithcheck is not null
    end;

  manager_write_policies_ok := invalid_manager_count = 0;

  select count(*)::integer
    into open_policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = membership_relation
    and (
      pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(
          pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
          ''
        )),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
      or pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
          ''
        )),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
    );

  no_open_policy := open_policy_count = 0;
  rls_ok := exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = membership_relation
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
  );

  scenario := 'CATALOG';
  simulated_user_id := null;
  database_role := 'postgres';
  visible_memberships := null;
  own_membership_rows := null;
  expected_own_club_rows := null;
  outside_own_club_rows := null;
  query_denied := false;
  test_ok := coalesce(
    old_select_policy_absent
    and own_select_policy_ok
    and staff_select_policy_ok
    and manager_write_policies_ok
    and no_open_policy
    and rls_ok
    and select_policy_count = 2,
    false
  );
  details := case
    when test_ok then 'EXACT_POLICY_CONTRACT'
    else pg_catalog.format(
      'client_select_policy_count=%s; invalid_manager_count=%s; open_policy_count=%s',
      select_policy_count,
      invalid_manager_count,
      open_policy_count
    )
  end;
  return next;

  for scenario_row in
    select *
    from (
      values
        (1, 'OWNER'::text, 'authenticated'::text, owner_id, true),
        (2, 'STAFF'::text, 'authenticated'::text, staff_id, true),
        (
          3,
          'UID_WITHOUT_MEMBERSHIP'::text,
          'authenticated'::text,
          no_membership_id,
          false
        ),
        (4, 'ANON'::text, 'anon'::text, null::uuid, false)
    ) data(
      scenario_order,
      scenario_name,
      target_role,
      target_user_id,
      expects_staff_visibility
    )
    order by scenario_order
  loop
    actor_club_id := null;
    local_expected_club := 0;

    if scenario_row.target_user_id is not null then
      select membership.club_id
        into actor_club_id
      from public.club_memberships membership
      where membership.user_id = scenario_row.target_user_id
        and membership.is_active;
    end if;

    if scenario_row.expects_staff_visibility then
      select count(*)::integer
        into local_expected_club
      from public.club_memberships membership
      where membership.club_id = actor_club_id;
    end if;

    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      coalesce(scenario_row.target_user_id::text, ''),
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      scenario_row.target_role,
      true
    );

    execute pg_catalog.format('set local role %I', scenario_row.target_role);

    local_visible := 0;
    local_own := 0;
    local_outside := 0;
    local_denied := false;
    error_state := null;
    error_message := null;

    begin
      select
        count(*)::integer,
        count(*) filter (
          where membership.user_id = scenario_row.target_user_id
        )::integer,
        count(*) filter (
          where actor_club_id is not null
            and membership.club_id <> actor_club_id
        )::integer
      into local_visible, local_own, local_outside
      from public.club_memberships membership;
    exception
      when insufficient_privilege then
        local_denied := true;
        local_visible := 0;
        local_own := 0;
        local_outside := 0;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
      when others then
        local_denied := true;
        local_visible := 0;
        local_own := 0;
        local_outside := 0;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
    end;

    execute 'reset role';

    scenario := scenario_row.scenario_name;
    simulated_user_id := scenario_row.target_user_id;
    database_role := scenario_row.target_role;
    visible_memberships := local_visible;
    own_membership_rows := local_own;
    expected_own_club_rows := local_expected_club;
    outside_own_club_rows := local_outside;
    query_denied := local_denied;
    test_ok := coalesce(
      old_select_policy_absent
      and own_select_policy_ok
      and staff_select_policy_ok
      and manager_write_policies_ok
      and no_open_policy
      and rls_ok
      and case
        when scenario_row.expects_staff_visibility then
          not local_denied
          and local_visible = local_expected_club
          and local_own = 1
          and local_outside = 0
        when scenario_row.scenario_name = 'UID_WITHOUT_MEMBERSHIP' then
          not local_denied
          and local_visible = 0
          and local_own = 0
        when scenario_row.scenario_name = 'ANON' then
          local_visible = 0
          and local_own = 0
        else false
      end,
      false
    );
    details := case
      when error_state is null then null
      else error_state || ': ' || error_message
    end;
    return next;
  end loop;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
end;
$$;

select *
from pg_temp.verify_membership_visibility()
order by case scenario
  when 'CATALOG' then 1
  when 'OWNER' then 2
  when 'STAFF' then 3
  when 'UID_WITHOUT_MEMBERSHIP' then 4
  when 'ANON' then 5
  else 6
end;

rollback;
