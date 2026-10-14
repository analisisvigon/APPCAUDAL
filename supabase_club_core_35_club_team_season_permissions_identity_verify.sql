-- APPCAUDAL Change 35: identity-based authorization probe (owner/staff/player).
-- Run the COMPLETE script once in a trusted Supabase SQL Editor session.
-- Replace the four placeholders with REAL auth.users UUIDs. Choose one existing
-- club_team_seasons row and an active STAFF member of its club who has no
-- assignment for that row. No admin account is needed or tested here; the
-- admin rules remain in migration 35 and their dynamic test is pending.
-- The 22 mandatory checks are: preflight (1); identity simulation (8: first
-- owner, staff, player, then owner, staff, player, owner, staff); authorization
-- (13: owner read/insert/select/delete; staff unassigned read, self-assign,
-- assigned read, assignment select/delete, post-delete read; player helper
-- read, assignment insert/select). PASS requires 22 PASS, 0 FAIL, 0 SKIP.
-- All writes target only the assignment table, are inside this transaction,
-- and negative writes have their own rollback-on-success subtransactions.
-- If the SQL Editor stops before the final ROLLBACK, issue ROLLBACK manually
-- in that same session. Never COMMIT this test transaction.

begin;

do $setup$
begin
  perform set_config('appcaudal.verify_relation_id', '<CLUB_TEAM_SEASON_UUID>', true);
  perform set_config('appcaudal.verify_owner_user_id', '<OWNER_AUTH_USER_UUID>', true);
  perform set_config('appcaudal.verify_staff_user_id', '<STAFF_AUTH_USER_UUID>', true);
  perform set_config('appcaudal.verify_player_user_id', '<PLAYER_AUTH_USER_UUID>', true);
end
$setup$;

-- This preflight uses the SQL Editor's privileged role. It never writes data.
do $preflight$
declare
  v_relation_id uuid;
  v_owner uuid;
  v_staff uuid;
  v_player uuid;
  v_club_id uuid;
  v_staff_membership_id uuid;
  v_count integer;
  v_role_count integer;
  v_identity record;
begin
  begin
    v_relation_id := current_setting('appcaudal.verify_relation_id')::uuid;
    v_owner := current_setting('appcaudal.verify_owner_user_id')::uuid;
    v_staff := current_setting('appcaudal.verify_staff_user_id')::uuid;
    v_player := current_setting('appcaudal.verify_player_user_id')::uuid;
    if auth.uid() is not null then
      raise exception 'Run without an application JWT identity';
    end if;
    if (select count(distinct user_id)
        from (values (v_owner), (v_staff), (v_player)) ids(user_id)) <> 3 then
      raise exception 'The owner, staff and player auth users must be distinct';
    end if;
    select count(*) into v_count from auth.users
    where id in (v_owner, v_staff, v_player);
    if v_count <> 3 then
      raise exception 'All three auth users must exist';
    end if;

    select club_id into v_club_id
    from public.club_team_seasons where id = v_relation_id;
    if v_club_id is null then
      raise exception 'The test team-season relation does not exist';
    end if;

    for v_identity in
      select * from (values
        (v_owner, 'owner'::text),
        (v_staff, 'staff'::text),
        (v_player, 'player'::text)
      ) expected(user_id, expected_role)
    loop
      select count(*), count(*) filter (where membership.role = v_identity.expected_role)
        into v_count, v_role_count
      from public.club_memberships membership
      where membership.club_id = v_club_id
        and membership.user_id = v_identity.user_id
        and membership.is_active;
      if v_count <> 1 or v_role_count <> 1 then
        raise exception 'Expected exactly one active % membership in the relation club',
          v_identity.expected_role;
      end if;
    end loop;

    select id into v_staff_membership_id
    from public.club_memberships
    where club_id = v_club_id and user_id = v_staff
      and role = 'staff' and is_active;
    if exists (
      select 1 from public.club_team_season_permissions
      where club_team_season_id = v_relation_id
        and membership_id = v_staff_membership_id
    ) then
      raise exception 'Choose an unassigned staff/team-season pair';
    end if;
    perform set_config('appcaudal.verify_club_id', v_club_id::text, true);
    perform set_config('appcaudal.verify_staff_membership_id',
      v_staff_membership_id::text, true);
    perform set_config('appcaudal.verify_preflight_ok', 'true', true);
    raise notice 'PASS preflight: distinct real users, active same-club roles, unassigned staff';
  exception when others then
    perform set_config('appcaudal.verify_preflight_ok', 'false', true);
    raise notice 'FAIL preflight: [%] %', sqlstate, sqlerrm;
  end;
end
$preflight$;

-- SET LOCAL confines the simulated database role to this transaction.
set local role authenticated;

do $identity_tests$
declare
  v_relation_id uuid;
  v_owner uuid;
  v_staff uuid;
  v_player uuid;
  v_club_id uuid;
  v_staff_membership_id uuid;
  v_permission_id uuid;
  v_count integer;
  v_inserted boolean;
  v_deleted boolean;
  v_can_read boolean;
  v_required constant integer := 22;
  v_pass integer := 0;
  v_fail integer := 0;
  v_skip integer := 0;
begin
  <<checks>>
  begin
    if current_setting('appcaudal.verify_preflight_ok', true) is distinct from 'true' then
      v_fail := 1;
      raise notice 'SKIP identity and authorization tests: preflight failed';
      exit checks;
    end if;
    v_pass := v_pass + 1; -- 1: preflight
    v_relation_id := current_setting('appcaudal.verify_relation_id')::uuid;
    v_owner := current_setting('appcaudal.verify_owner_user_id')::uuid;
    v_staff := current_setting('appcaudal.verify_staff_user_id')::uuid;
    v_player := current_setting('appcaudal.verify_player_user_id')::uuid;
    v_club_id := current_setting('appcaudal.verify_club_id')::uuid;
    v_staff_membership_id := current_setting('appcaudal.verify_staff_membership_id')::uuid;

    -- 2-3: owner identity and implicit read.
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_owner then
      v_fail := v_fail + 1;
      raise notice 'FAIL owner JWT simulation';
      exit checks;
    end if;
    v_pass := v_pass + 1;
    select public.can_read_club_team_season(v_relation_id) into v_can_read;
    if v_can_read is true then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% owner implicit team-season read',
      case when v_can_read is true then 'PASS' else 'FAIL' end;

    -- 4-6: an unassigned staff user cannot read or self-assign.
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_staff then
      v_fail := v_fail + 1;
      raise notice 'FAIL staff JWT simulation';
      exit checks;
    end if;
    v_pass := v_pass + 1;
    select public.can_read_club_team_season(v_relation_id) into v_can_read;
    if v_can_read is false then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% unassigned staff team-season read denied',
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
        raise notice 'FAIL staff self-assignment succeeded (rolled back)';
      elsif sqlstate = '42501' then
        v_pass := v_pass + 1;
        raise notice 'PASS staff self-assignment denied [42501]';
      else
        v_fail := v_fail + 1;
        raise notice 'FAIL staff self-assignment unexpected error: [%] %', sqlstate, sqlerrm;
      end if;
    end;

    -- 7-9: player cannot read through the helper or grant staff access.
    perform set_config('request.jwt.claim.sub', v_player::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_player then
      v_fail := v_fail + 1;
      raise notice 'FAIL player JWT simulation';
      exit checks;
    end if;
    v_pass := v_pass + 1;
    select public.can_read_club_team_season(v_relation_id) into v_can_read;
    if v_can_read is false then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% player team-season read denied',
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
        raise notice 'FAIL player INSERT succeeded (rolled back)';
      elsif sqlstate = '42501' then
        v_pass := v_pass + 1;
        raise notice 'PASS player INSERT denied [42501]';
      else
        v_fail := v_fail + 1;
        raise notice 'FAIL player INSERT unexpected error: [%] %', sqlstate, sqlerrm;
      end if;
    end;

    -- 10-12: owner creates a temporary assignment and can see its row.
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_owner then
      v_fail := v_fail + 1;
      raise notice 'FAIL restored owner JWT simulation';
      exit checks;
    end if;
    v_pass := v_pass + 1;
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
      exit checks;
    end;
    select count(*) into v_count
    from public.club_team_season_permissions where id = v_permission_id;
    if v_count = 1 then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% owner administrative SELECT',
      case when v_count = 1 then 'PASS' else 'FAIL' end;

    -- 13-16: the assigned staff may read via helper, but not the assignment
    -- table. A surprisingly successful DELETE is reverted before continuing.
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_staff then
      v_fail := v_fail + 1;
      raise notice 'FAIL restored staff JWT simulation';
      exit checks;
    end if;
    v_pass := v_pass + 1;
    select public.can_read_club_team_season(v_relation_id) into v_can_read;
    if v_can_read is true then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% temporarily assigned staff team-season read',
      case when v_can_read is true then 'PASS' else 'FAIL' end;
    select count(*) into v_count
    from public.club_team_season_permissions where id = v_permission_id;
    if v_count = 0 then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% staff assignment SELECT denied',
      case when v_count = 0 then 'PASS' else 'FAIL' end;
    v_deleted := false;
    begin
      delete from public.club_team_season_permissions where id = v_permission_id;
      get diagnostics v_count = row_count;
      if v_count <> 0 then
        v_deleted := true;
        raise exception 'probe_rollback';
      end if;
      v_pass := v_pass + 1;
      raise notice 'PASS staff DELETE denied (zero rows)';
    exception when others then
      if v_deleted then
        v_fail := v_fail + 1;
        raise notice 'FAIL staff DELETE succeeded (rolled back)';
      elsif sqlstate = '42501' then
        v_pass := v_pass + 1;
        raise notice 'PASS staff DELETE denied [42501]';
      else
        v_fail := v_fail + 1;
        raise notice 'FAIL staff DELETE unexpected error: [%] %', sqlstate, sqlerrm;
      end if;
    end;

    -- 17-18: player sees no assignment, tested against the live temporary row.
    perform set_config('request.jwt.claim.sub', v_player::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_player then
      v_fail := v_fail + 1;
      raise notice 'FAIL restored player JWT simulation';
      exit checks;
    end if;
    v_pass := v_pass + 1;
    select count(*) into v_count
    from public.club_team_season_permissions where id = v_permission_id;
    if v_count = 0 then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% player assignment SELECT denied',
      case when v_count = 0 then 'PASS' else 'FAIL' end;

    -- 19-20: owner restores identity and removes the temporary assignment.
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_owner then
      v_fail := v_fail + 1;
      raise notice 'FAIL restored owner JWT simulation before DELETE';
      exit checks;
    end if;
    v_pass := v_pass + 1;
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

    -- 21-22: after removal, staff loses helper access again.
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_staff then
      v_fail := v_fail + 1;
      raise notice 'FAIL restored staff JWT simulation after DELETE';
      exit checks;
    end if;
    v_pass := v_pass + 1;
    select public.can_read_club_team_season(v_relation_id) into v_can_read;
    if v_can_read is false then v_pass := v_pass + 1;
    else v_fail := v_fail + 1; end if;
    raise notice '% staff team-season read denied after owner DELETE',
      case when v_can_read is false then 'PASS' else 'FAIL' end;
  exception when others then
    v_fail := v_fail + 1;
    raise notice 'FAIL unexpected identity-test error: [%] %', sqlstate, sqlerrm;
  end checks;

  -- Every unexecuted mandatory check is a SKIP; none can yield GLOBAL PASS.
  v_skip := greatest(0, v_required - v_pass - v_fail);
  perform set_config('appcaudal.verify_global_result',
    case when v_pass = v_required and v_fail = 0 and v_skip = 0
      then 'PASS' else 'FAIL' end, true);
  perform set_config('appcaudal.verify_pass_count', v_pass::text, true);
  perform set_config('appcaudal.verify_fail_count', v_fail::text, true);
  perform set_config('appcaudal.verify_skip_count', v_skip::text, true);
  raise notice 'GLOBAL % | PASS=% FAIL=% SKIP=% REQUIRED=% | admin dynamic test PENDING',
    current_setting('appcaudal.verify_global_result'),
    v_pass, v_fail, v_skip, v_required;
end
$identity_tests$;

-- The result row is for SQL clients that display the last SELECT. GLOBAL PASS
-- covers only these 22 owner/staff/player checks, not the pending admin test.
select
  current_setting('appcaudal.verify_global_result') as global_result,
  current_setting('appcaudal.verify_pass_count')::integer as passed,
  current_setting('appcaudal.verify_fail_count')::integer as failed,
  current_setting('appcaudal.verify_skip_count')::integer as skipped,
  22 as required,
  'PENDING: no real admin identity'::text as admin_dynamic_test;

rollback;
