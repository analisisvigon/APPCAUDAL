-- APPCAUDAL Change 35: transactional, identity-based authorization probe.
-- Run ONLY in a trusted Supabase SQL Editor session, as ONE complete script.
-- Replace the five placeholders with existing UUIDs. Never use service_role
-- as the test role: it has BYPASSRLS. This script uses authenticated + real
-- auth user IDs, reports each result via NOTICE plus a final summary row,
-- and ALWAYS ends with ROLLBACK.
-- It writes only a temporary assignment row to the Change 35 table; no
-- membership, sports table, or existing assignment is changed persistently.
-- If execution is interrupted before ROLLBACK, issue ROLLBACK in that session.

begin;

do $setup$
begin
  perform set_config('appcaudal.verify_relation_id', '<CLUB_TEAM_SEASON_UUID>', true);
  perform set_config('appcaudal.verify_owner_user_id', '<OWNER_AUTH_USER_UUID>', true);
  perform set_config('appcaudal.verify_admin_user_id', '<ADMIN_AUTH_USER_UUID>', true);
  perform set_config('appcaudal.verify_staff_user_id', '<STAFF_AUTH_USER_UUID>', true);
  perform set_config('appcaudal.verify_player_user_id', '<PLAYER_AUTH_USER_UUID>', true);
end
$setup$;

-- Preflight runs as the SQL Editor's privileged role. A failure is recorded
-- as FAIL and prevents all mutation tests from running.
do $preflight$
declare
  v_relation_id uuid;
  v_owner uuid;
  v_admin uuid;
  v_staff uuid;
  v_player uuid;
  v_club_id uuid;
  v_staff_membership_id uuid;
  v_count integer;
  v_identity record;
begin
  begin
  v_relation_id := current_setting('appcaudal.verify_relation_id')::uuid;
  v_owner := current_setting('appcaudal.verify_owner_user_id')::uuid;
  v_admin := current_setting('appcaudal.verify_admin_user_id')::uuid;
  v_staff := current_setting('appcaudal.verify_staff_user_id')::uuid;
  v_player := current_setting('appcaudal.verify_player_user_id')::uuid;
  if auth.uid() is not null then
    raise exception 'Run without an application JWT identity';
  end if;
  if (select count(distinct user_id)
      from (values (v_owner), (v_admin), (v_staff), (v_player)) ids(user_id)) <> 4 then
    raise exception 'The four test users must be distinct';
  end if;

  select club_id into v_club_id
  from public.club_team_seasons where id = v_relation_id;
  if v_club_id is null then
    raise exception 'Test team-season relation does not exist';
  end if;

  for v_identity in
    select * from (values
      (v_owner, 'owner'::text),
      (v_admin, 'admin'::text),
      (v_staff, 'staff'::text),
      (v_player, 'player'::text)
    ) expected(user_id, expected_role)
  loop
    select count(*) into v_count
    from public.club_memberships membership
    where membership.club_id = v_club_id
      and membership.user_id = v_identity.user_id
      and membership.role = v_identity.expected_role
      and membership.is_active;
    if v_count <> 1 then
      raise exception 'Expected exactly one active % membership in the relation club',
        v_identity.expected_role;
    end if;
  end loop;

  select id into v_staff_membership_id
  from public.club_memberships
  where club_id = v_club_id and user_id = v_staff
    and role = 'staff' and is_active;
  if (select count(*) from public.club_team_season_permissions
      where club_team_season_id = v_relation_id
        and membership_id = v_staff_membership_id) <> 0 then
    raise exception 'Choose a staff/team-season pair without an existing assignment';
  end if;
  perform set_config('appcaudal.verify_club_id', v_club_id::text, true);
  perform set_config('appcaudal.verify_staff_membership_id',
    v_staff_membership_id::text, true);
  perform set_config('appcaudal.verify_preflight_ok', 'true', true);
  raise notice 'PASS preflight: real active identities and unassigned test pair';
  exception when others then
    perform set_config('appcaudal.verify_preflight_ok', 'false', true);
    raise notice 'FAIL preflight: [%] %', sqlstate, sqlerrm;
  end;
end
$preflight$;

-- SET LOCAL limits the impersonated database role to this transaction.
set local role authenticated;

do $identity_tests$
declare
  v_relation_id uuid;
  v_owner uuid;
  v_admin uuid;
  v_staff uuid;
  v_player uuid;
  v_club_id uuid;
  v_staff_membership_id uuid;
  v_permission_id uuid;
  v_count integer;
  v_inserted boolean;
  v_admin_deleted boolean := false;
  v_can_read boolean;
  v_required constant integer := 18; -- preflight + 17 identity/authorization tests
  v_pass integer := 0;
  v_fail integer := 0;
  v_skip integer := 0;
begin
  <<checks>>
  begin
  if current_setting('appcaudal.verify_preflight_ok', true) is distinct from 'true' then
    v_fail := v_fail + 1;
    v_skip := v_skip + 17;
    raise notice 'SKIP all 17 identity/authorization tests: preflight failed';
    exit checks;
  end if;
  v_pass := v_pass + 1;
  v_relation_id := current_setting('appcaudal.verify_relation_id')::uuid;
  v_owner := current_setting('appcaudal.verify_owner_user_id')::uuid;
  v_admin := current_setting('appcaudal.verify_admin_user_id')::uuid;
  v_staff := current_setting('appcaudal.verify_staff_user_id')::uuid;
  v_player := current_setting('appcaudal.verify_player_user_id')::uuid;
  v_club_id := current_setting('appcaudal.verify_club_id')::uuid;
  v_staff_membership_id := current_setting('appcaudal.verify_staff_membership_id')::uuid;
  -- Owner: INSERT and administrative SELECT must succeed.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_owner then
    raise notice 'FAIL JWT simulation: auth.uid() is not the owner';
    v_fail := v_fail + 1;
    exit checks;
  end if;
  v_pass := v_pass + 1;
  select public.can_read_club_team_season(v_relation_id) into v_can_read;
  if v_can_read is true then v_pass := v_pass + 1;
  else v_fail := v_fail + 1; end if;
  raise notice '% owner implicit team-season data read',
    case when v_can_read is true then 'PASS' else 'FAIL' end;
  begin
    insert into public.club_team_season_permissions
      (club_id, club_team_season_id, membership_id)
    values (v_club_id, v_relation_id, v_staff_membership_id)
    returning id into v_permission_id;
    v_pass := v_pass + 1;
    raise notice 'PASS owner INSERT';
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL owner INSERT: [%] %', sqlstate, sqlerrm;
  end;

  if v_permission_id is not null then
    select count(*) into v_count
    from public.club_team_season_permissions where id = v_permission_id;
    if v_count = 1 then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% owner administrative SELECT',
      case when v_count = 1 then 'PASS' else 'FAIL' end;
  else
    v_skip := v_skip + 3; -- owner SELECT, admin SELECT, admin DELETE
    raise notice 'SKIP owner/admin SELECT and DELETE: owner INSERT failed';
  end if;

  -- Admin: no administrative SELECT, INSERT, or DELETE.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_admin then
    raise notice 'FAIL JWT simulation: auth.uid() is not the admin';
    v_fail := v_fail + 1;
    exit checks;
  end if;
  v_pass := v_pass + 1;
  select public.can_read_club_team_season(v_relation_id) into v_can_read;
  if v_can_read is true then v_pass := v_pass + 1;
  else v_fail := v_fail + 1; end if;
  raise notice '% admin implicit team-season data read',
    case when v_can_read is true then 'PASS' else 'FAIL' end;
  if v_permission_id is not null then
    select count(*) into v_count
    from public.club_team_season_permissions where id = v_permission_id;
    if v_count = 0 then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% admin administrative SELECT denied',
      case when v_count = 0 then 'PASS' else 'FAIL' end;
    begin
      delete from public.club_team_season_permissions where id = v_permission_id;
      get diagnostics v_count = row_count;
      v_admin_deleted := v_count <> 0;
      if v_count = 0 then v_pass := v_pass + 1;
      else v_fail := v_fail + 1; end if;
      raise notice '% admin DELETE denied',
        case when v_count = 0 then 'PASS' else 'FAIL' end;
    exception when sqlstate '42501' then
      v_pass := v_pass + 1;
      raise notice 'PASS admin DELETE denied [42501]';
    when others then
      v_fail := v_fail + 1;
      raise notice 'FAIL admin DELETE unexpected error: [%] %', sqlstate, sqlerrm;
    end;
  end if;

  -- Player SELECT is tested while the owner-created row still exists, so
  -- seeing zero rows proves RLS filtering rather than an empty table.
  perform set_config('request.jwt.claim.sub', v_player::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
  if v_permission_id is not null and not v_admin_deleted then
    select count(*) into v_count
    from public.club_team_season_permissions where id = v_permission_id;
    if v_count = 0 then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% player assignment SELECT denied',
      case when v_count = 0 then 'PASS' else 'FAIL' end;
  else
    v_skip := v_skip + 1;
    raise notice 'SKIP player assignment SELECT: owner-created row unavailable';
  end if;

  -- Restore the owner identity to delete the temporary row. This also proves
  -- owner DELETE; the final ROLLBACK remains the persistence guarantee.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  if v_permission_id is not null then
    begin
      delete from public.club_team_season_permissions where id = v_permission_id;
      get diagnostics v_count = row_count;
      if v_count = 1 then v_pass := v_pass + 1;
      else v_fail := v_fail + 1; end if;
      raise notice '% owner DELETE',
        case when v_count = 1 then 'PASS' else 'FAIL' end;
    exception when others then
      v_fail := v_fail + 1;
      raise notice 'FAIL owner DELETE: [%] %', sqlstate, sqlerrm;
    end;
  else
    v_skip := v_skip + 1;
    raise notice 'SKIP owner DELETE: owner INSERT failed';
  end if;

  -- A forced exception rolls back any unexpectedly successful negative INSERT
  -- inside its PL/pgSQL subtransaction, keeping later tests independent.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_inserted := false;
  begin
    insert into public.club_team_season_permissions
      (club_id, club_team_season_id, membership_id)
    values (v_club_id, v_relation_id, v_staff_membership_id);
    v_inserted := true;
    raise exception 'probe_rollback';
  exception when others then
    if v_inserted then
      v_fail := v_fail + 1;
      raise notice 'FAIL admin INSERT succeeded (test row rolled back)';
    elsif sqlstate = '42501' then
      v_pass := v_pass + 1;
      raise notice 'PASS admin INSERT denied [42501]';
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL admin INSERT unexpected error: [%] %', sqlstate, sqlerrm;
    end if;
  end;

  -- Staff: cannot grant itself access.
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_staff then
    raise notice 'FAIL JWT simulation: auth.uid() is not the staff user';
    v_fail := v_fail + 1;
    exit checks;
  end if;
  v_pass := v_pass + 1;
  select public.can_read_club_team_season(v_relation_id) into v_can_read;
  if v_can_read is false then v_pass := v_pass + 1;
  else v_fail := v_fail + 1; end if;
  raise notice '% unassigned staff team-season data read denied',
    case when v_can_read is false then 'PASS' else 'FAIL' end;
  v_inserted := false;
  begin
    insert into public.club_team_season_permissions
      (club_id, club_team_season_id, membership_id)
    values (v_club_id, v_relation_id, v_staff_membership_id);
    v_inserted := true;
    raise exception 'probe_rollback';
  exception when others then
    if v_inserted then
      v_fail := v_fail + 1;
      raise notice 'FAIL staff self-assignment succeeded (test row rolled back)';
    elsif sqlstate = '42501' then
      v_pass := v_pass + 1;
      raise notice 'PASS staff self-assignment denied [42501]';
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL staff self-assignment unexpected error: [%] %', sqlstate, sqlerrm;
    end if;
  end;

  -- Player: no team-season data read through the helper and no ability to
  -- grant STAFF access. Assignment visibility was tested against a live row.
  perform set_config('request.jwt.claim.sub', v_player::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_player then
    raise notice 'FAIL JWT simulation: auth.uid() is not the player';
    v_fail := v_fail + 1;
    exit checks;
  end if;
  v_pass := v_pass + 1;
  select public.can_read_club_team_season(v_relation_id) into v_can_read;
  if v_can_read is false then v_pass := v_pass + 1;
  else v_fail := v_fail + 1; end if;
  raise notice '% player team-season helper denies access',
    case when v_can_read is false then 'PASS' else 'FAIL' end;
  v_inserted := false;
  begin
    insert into public.club_team_season_permissions
      (club_id, club_team_season_id, membership_id)
    values (v_club_id, v_relation_id, v_staff_membership_id);
    v_inserted := true;
    raise exception 'probe_rollback';
  exception when others then
    if v_inserted then
      v_fail := v_fail + 1;
      raise notice 'FAIL player INSERT succeeded (test row rolled back)';
    elsif sqlstate = '42501' then
      v_pass := v_pass + 1;
      raise notice 'PASS player INSERT denied [42501]';
    else
      v_fail := v_fail + 1;
      raise notice 'FAIL player INSERT unexpected error: [%] %', sqlstate, sqlerrm;
    end if;
  end;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL unexpected identity-test error: [%] %', sqlstate, sqlerrm;
  end checks;

  -- Any mandatory test not reached (including after an identity mismatch)
  -- counts as SKIP. A PASS requires all 18 checks, with no FAIL or SKIP.
  v_skip := v_skip + greatest(0, v_required - v_pass - v_fail - v_skip);
  perform set_config('appcaudal.verify_global_result',
    case when v_pass = v_required and v_fail = 0 and v_skip = 0
      then 'PASS' else 'FAIL' end, true);
  perform set_config('appcaudal.verify_pass_count', v_pass::text, true);
  perform set_config('appcaudal.verify_fail_count', v_fail::text, true);
  perform set_config('appcaudal.verify_skip_count', v_skip::text, true);
  raise notice 'GLOBAL % | PASS=% FAIL=% SKIP=% REQUIRED=%',
    current_setting('appcaudal.verify_global_result'),
    v_pass, v_fail, v_skip, v_required;
end
$identity_tests$;

-- The GLOBAL notice is the verdict. This SELECT mirrors it for SQL clients
-- that display intermediate result sets before the final ROLLBACK.
select
  current_setting('appcaudal.verify_global_result') as global_result,
  current_setting('appcaudal.verify_pass_count')::integer as passed,
  current_setting('appcaudal.verify_fail_count')::integer as failed,
  current_setting('appcaudal.verify_skip_count')::integer as skipped,
  18 as required;

rollback;
