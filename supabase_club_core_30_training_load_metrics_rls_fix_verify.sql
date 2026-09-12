-- APPCAUDAL - Club Core 30 - Transactional verifier for the legacy metrics RLS fix.
-- Run the complete file after Core 30. Every fixture disappears with ROLLBACK.

begin;

create temporary table core30_verify_results (
  ordinal integer generated always as identity,
  test_name text not null,
  test_ok boolean not null,
  details text not null
) on commit drop;

create function pg_temp.add_core30_check(p_name text, p_ok boolean, p_details text)
returns void
language sql
set search_path = pg_catalog
as $function$
  insert into pg_temp.core30_verify_results(test_name, test_ok, details)
  values (p_name, coalesce(p_ok, false), coalesce(p_details, ''));
$function$;

do $verify$
declare
  canonical_club_id uuid;
  owner_user_id uuid;
  fixture_player_id uuid;
  player_user_id uuid := pg_catalog.gen_random_uuid();
  staff_user_id uuid := pg_catalog.gen_random_uuid();
  viewer_user_id uuid := pg_catalog.gen_random_uuid();
  fixture_start date := current_date + 7300;
  rpc_session_id uuid := pg_catalog.gen_random_uuid();
  mutable_session_id uuid := pg_catalog.gen_random_uuid();
  player_insert_session_id uuid := pg_catalog.gen_random_uuid();
  viewer_insert_session_id uuid := pg_catalog.gen_random_uuid();
  staff_insert_session_id uuid := pg_catalog.gen_random_uuid();
  rpc_team_metric_id uuid := pg_catalog.gen_random_uuid();
  rpc_player_metric_id uuid := pg_catalog.gen_random_uuid();
  mutable_metric_id uuid := pg_catalog.gen_random_uuid();
  player_insert_metric_id uuid := pg_catalog.gen_random_uuid();
  viewer_insert_metric_id uuid := pg_catalog.gen_random_uuid();
  staff_insert_metric_id uuid := pg_catalog.gen_random_uuid();
  authenticated_oid oid;
  anon_oid oid;
  visible_count integer;
  affected_count integer;
  invalid_policy_count integer;
  open_using_count integer;
  open_check_count integer;
  error_state text;
  player_context record;
  viewer_context record;
  staff_context record;
  rpc_count integer;
  rpc_load_units numeric;
  rpc_distance_m numeric;
  rpc_dates date[];
  rpc_keys text[];
  expected_keys text[] := array[
    'accelerations', 'actual_duration_minutes', 'decelerations', 'distance_m',
    'hsr_m', 'load_units', 'meters_per_minute', 'session_date', 'sprints'
  ]::text[];
  function_row pg_catalog.pg_proc%rowtype;
begin
  select club.id into canonical_club_id
  from public.clubs club
  order by club.id
  limit 1;

  select membership.user_id into owner_user_id
  from public.club_memberships membership
  where membership.club_id = canonical_club_id
    and membership.role = 'owner'
    and membership.is_active
  order by membership.id
  limit 1;

  select player.id into fixture_player_id
  from public.jugadores player
  where player.active_in_squad
    and not exists (
      select 1
      from public.club_memberships membership
      where membership.jugador_id = player.id
        and membership.role = 'player'
        and membership.is_active
    )
  order by player.id
  limit 1;

  select role_row.oid into authenticated_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'authenticated';

  select role_row.oid into anon_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'anon';

  perform pg_temp.add_core30_check(
    'PREREQUISITES_single_club_owner_unbound_player',
    (select pg_catalog.count(*) from public.clubs) = 1
      and canonical_club_id is not null
      and owner_user_id is not null
      and fixture_player_id is not null
      and authenticated_oid is not null
      and anon_oid is not null
      and pg_catalog.to_regprocedure('public.get_my_team_load_evolution(date,date)') is not null,
    'one club, active OWNER, active unbound player, Supabase roles and Core 29 RPC'
  );

  perform pg_temp.add_core30_check(
    'RLS_training_load_metrics_enabled',
    (select relation.relrowsecurity
     from pg_catalog.pg_class relation
     where relation.oid = 'public.training_session_load_metrics'::regclass),
    'public.training_session_load_metrics has relrowsecurity=true'
  );

  with expected(policy_name, command, needs_using, needs_check) as (
    values
      ('performance_staff_select'::text, 'r'::"char", true, false),
      ('performance_staff_insert'::text, 'a'::"char", false, true),
      ('performance_staff_update'::text, 'w'::"char", true, true),
      ('performance_staff_delete'::text, 'd'::"char", true, false)
  )
  select pg_catalog.count(*)::integer into invalid_policy_count
  from expected
  left join pg_catalog.pg_policy policy
    on policy.polrelid = 'public.training_session_load_metrics'::regclass
   and policy.polname = expected.policy_name
  where policy.oid is null
     or not policy.polpermissive
     or policy.polcmd <> expected.command
     or policy.polroles <> array[authenticated_oid]::oid[]
     or case
       when expected.needs_using then
         pg_catalog.replace(
           pg_catalog.regexp_replace(
             pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
             '[[:space:]()]', '', 'g'
           ),
           'public.', ''
         ) <> 'is_app_staff'
       else policy.polqual is not null
     end
     or case
       when expected.needs_check then
         pg_catalog.replace(
           pg_catalog.regexp_replace(
             pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
             '[[:space:]()]', '', 'g'
           ),
           'public.', ''
         ) <> 'is_app_staff'
       else policy.polwithcheck is not null
     end;

  perform pg_temp.add_core30_check(
    'RLS_exact_four_canonical_staff_policies',
    invalid_policy_count = 0
      and (select pg_catalog.count(*)
           from pg_catalog.pg_policy policy
           where policy.polrelid = 'public.training_session_load_metrics'::regclass) = 4,
    pg_catalog.format('invalid canonical policies=%s; total policies=%s',
      invalid_policy_count,
      (select pg_catalog.count(*) from pg_catalog.pg_policy policy
       where policy.polrelid = 'public.training_session_load_metrics'::regclass))
  );

  perform pg_temp.add_core30_check(
    'RLS_legacy_read_policy_absent',
    not exists (
      select 1 from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.training_session_load_metrics'::regclass
        and policy.polname = 'Authenticated staff can read training load metrics'
    ),
    'legacy SELECT USING(true) policy is absent'
  );

  perform pg_temp.add_core30_check(
    'RLS_legacy_write_policy_absent',
    not exists (
      select 1 from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.training_session_load_metrics'::regclass
        and policy.polname = 'Authenticated staff can write training load metrics'
    ),
    'legacy ALL USING(true) WITH CHECK(true) policy is absent'
  );

  select pg_catalog.count(*)::integer into open_using_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.training_session_load_metrics'::regclass
    and exists (
      select 1 from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
      where policy_role.role_oid in (0::oid, authenticated_oid, anon_oid)
    )
    and pg_catalog.regexp_replace(
      pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
      '[[:space:]()]', '', 'g'
    ) = 'true';
  perform pg_temp.add_core30_check(
    'RLS_zero_client_using_true',
    open_using_count = 0,
    pg_catalog.format('client-applicable USING(true) policies=%s', open_using_count)
  );

  select pg_catalog.count(*)::integer into open_check_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.training_session_load_metrics'::regclass
    and exists (
      select 1 from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
      where policy_role.role_oid in (0::oid, authenticated_oid, anon_oid)
    )
    and pg_catalog.regexp_replace(
      pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
      '[[:space:]()]', '', 'g'
    ) = 'true';
  perform pg_temp.add_core30_check(
    'RLS_zero_client_with_check_true',
    open_check_count = 0,
    pg_catalog.format('client-applicable WITH CHECK(true) policies=%s', open_check_count)
  );

  perform pg_temp.add_core30_check(
    'RLS_no_player_policy',
    not exists (
      select 1
      from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.training_session_load_metrics'::regclass
        and (
          policy.polname ilike '%player%'
          or coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_player%'
          or coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_player%'
        )
    ),
    'no direct PLAYER policy exists on training_session_load_metrics'
  );

  perform pg_temp.add_core30_check(
    'GRANTS_preserved_authenticated_crud_anon_denied',
    pg_catalog.has_table_privilege('authenticated', 'public.training_session_load_metrics', 'SELECT')
      and pg_catalog.has_table_privilege('authenticated', 'public.training_session_load_metrics', 'INSERT')
      and pg_catalog.has_table_privilege('authenticated', 'public.training_session_load_metrics', 'UPDATE')
      and pg_catalog.has_table_privilege('authenticated', 'public.training_session_load_metrics', 'DELETE')
      and pg_catalog.has_table_privilege('service_role', 'public.training_session_load_metrics', 'SELECT')
      and pg_catalog.has_table_privilege('service_role', 'public.training_session_load_metrics', 'INSERT')
      and pg_catalog.has_table_privilege('service_role', 'public.training_session_load_metrics', 'UPDATE')
      and pg_catalog.has_table_privilege('service_role', 'public.training_session_load_metrics', 'DELETE')
      and not pg_catalog.has_table_privilege('anon', 'public.training_session_load_metrics', 'SELECT')
      and not pg_catalog.has_table_privilege('anon', 'public.training_session_load_metrics', 'INSERT')
      and not pg_catalog.has_table_privilege('anon', 'public.training_session_load_metrics', 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', 'public.training_session_load_metrics', 'DELETE'),
    'authenticated and service_role keep CRUD grants; anon keeps none; RLS remains the row gate'
  );

  with expected(policy_name, command, needs_using, needs_check) as (
    values
      ('performance_staff_select'::text, 'r'::"char", true, false),
      ('performance_staff_insert'::text, 'a'::"char", false, true),
      ('performance_staff_update'::text, 'w'::"char", true, true),
      ('performance_staff_delete'::text, 'd'::"char", true, false)
  )
  select pg_catalog.count(*)::integer into invalid_policy_count
  from expected
  left join pg_catalog.pg_policy policy
    on policy.polrelid = 'public.training_sessions'::regclass
   and policy.polname = expected.policy_name
  where policy.oid is null
     or not policy.polpermissive
     or policy.polcmd <> expected.command
     or policy.polroles <> array[authenticated_oid]::oid[]
     or case when expected.needs_using then
       pg_catalog.replace(pg_catalog.regexp_replace(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')), '[[:space:]()]', '', 'g'), 'public.', '') <> 'is_app_staff'
       else policy.polqual is not null end
     or case when expected.needs_check then
       pg_catalog.replace(pg_catalog.regexp_replace(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')), '[[:space:]()]', '', 'g'), 'public.', '') <> 'is_app_staff'
       else policy.polwithcheck is not null end;
  perform pg_temp.add_core30_check(
    'REGRESSION_training_sessions_contract_intact',
    invalid_policy_count = 0
      and (select relation.relrowsecurity from pg_catalog.pg_class relation
           where relation.oid = 'public.training_sessions'::regclass)
      and (select pg_catalog.count(*) from pg_catalog.pg_policy policy
           where policy.polrelid = 'public.training_sessions'::regclass) = 4,
    'training_sessions still has RLS and exactly the four canonical STAFF policies'
  );

  if canonical_club_id is null or owner_user_id is null or fixture_player_id is null then
    return;
  end if;

  while exists (
    select 1 from public.training_sessions session_row
    where session_row.session_date between fixture_start and fixture_start + 10
  ) loop
    fixture_start := fixture_start + 11;
  end loop;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  select
    account.instance_id,
    fixture.user_id,
    'authenticated',
    'authenticated',
    pg_catalog.format('verify30.%s.%s@appcaudal.invalid', fixture.fixture_role, fixture.user_id),
    '',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  from auth.users account
  cross join (
    values
      (player_user_id, 'player'::text),
      (staff_user_id, 'staff'::text),
      (viewer_user_id, 'viewer'::text)
  ) fixture(user_id, fixture_role)
  where account.id = owner_user_id;

  insert into public.club_memberships (club_id, user_id, role, jugador_id, is_active)
  values
    (canonical_club_id, player_user_id, 'player', fixture_player_id, true),
    (canonical_club_id, staff_user_id, 'staff', null, true),
    (canonical_club_id, viewer_user_id, 'viewer', null, true);

  insert into public.training_sessions (
    id, session_date, session_type, actual_duration_minutes, record_kind, notes
  ) values
    (rpc_session_id, fixture_start, 'training', 90, 'daily_team_load', 'VERIFY30_PRIVATE_RPC_NOTE'),
    (mutable_session_id, fixture_start + 1, 'training', 60, 'legacy', 'VERIFY30_MUTABLE'),
    (player_insert_session_id, fixture_start + 2, 'training', 60, 'legacy', 'VERIFY30_PLAYER_INSERT'),
    (viewer_insert_session_id, fixture_start + 3, 'training', 60, 'legacy', 'VERIFY30_VIEWER_INSERT'),
    (staff_insert_session_id, fixture_start + 4, 'training', 60, 'legacy', 'VERIFY30_STAFF_INSERT');

  insert into public.training_session_load_metrics (
    id, session_id, scope, jugador_id, aggregation_method,
    load_units, distance_m, hsr_m, accelerations, decelerations, sprints,
    meters_per_minute
  ) values
    (rpc_team_metric_id, rpc_session_id, 'team', null, 'team_average', 450.5, 7200.25, 640.5, 33, 28, 14, 80.25),
    (rpc_player_metric_id, rpc_session_id, 'player', fixture_player_id, null, 999, 99999, 9999, 999, 999, 999, 999),
    (mutable_metric_id, mutable_session_id, 'team', null, 'team_average', 200, 2000, 200, 20, 20, 10, 50);

  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  select auth.uid() as actor_id, current_user as database_role,
         membership.role as membership_role, membership.jugador_id,
         public.is_player() as is_player, public.is_app_staff() as is_staff
  into player_context
  from public.current_membership() membership;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'PLAYER_context_exact',
    player_context.actor_id = player_user_id
      and player_context.database_role = 'authenticated'
      and player_context.membership_role = 'player'
      and player_context.jugador_id = fixture_player_id
      and player_context.is_player
      and not player_context.is_staff,
    pg_catalog.format('uid=%s; db_role=%s; membership=%s; jugador=%s; player=%s; staff=%s',
      player_context.actor_id, player_context.database_role, player_context.membership_role,
      player_context.jugador_id, player_context.is_player, player_context.is_staff)
  );

  execute 'set local role authenticated';
  visible_count := null;
  error_state := null;
  begin
    select pg_catalog.count(*)::integer into visible_count
    from public.training_session_load_metrics;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'PLAYER_direct_select_zero',
    error_state is null and visible_count = 0,
    pg_catalog.format('sqlstate=%s; visible_rows=%s', coalesce(error_state, 'NULL'), coalesce(visible_count::text, 'NULL'))
  );

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    insert into public.training_session_load_metrics (
      id, session_id, scope, jugador_id, aggregation_method, load_units
    ) values (
      player_insert_metric_id, player_insert_session_id, 'team', null, 'team_average', 111
    );
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'PLAYER_insert_denied',
    error_state = '42501' and affected_count = 0
      and not exists (select 1 from public.training_session_load_metrics where id = player_insert_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    update public.training_session_load_metrics set load_units = 777 where id = mutable_metric_id;
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'PLAYER_update_denied_or_zero',
    affected_count = 0 and (error_state is null or error_state = '42501')
      and (select load_units = 200 from public.training_session_load_metrics where id = mutable_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    delete from public.training_session_load_metrics where id = mutable_metric_id;
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'PLAYER_delete_denied_or_zero',
    affected_count = 0 and (error_state is null or error_state = '42501')
      and exists (select 1 from public.training_session_load_metrics where id = mutable_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', viewer_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select auth.uid() as actor_id, current_user as database_role,
         membership.role as membership_role, public.is_player() as is_player,
         public.is_app_staff() as is_staff
  into viewer_context
  from public.current_membership() membership;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'VIEWER_context_exact',
    viewer_context.actor_id = viewer_user_id
      and viewer_context.database_role = 'authenticated'
      and viewer_context.membership_role = 'viewer'
      and not viewer_context.is_player
      and not viewer_context.is_staff,
    pg_catalog.format('uid=%s; db_role=%s; membership=%s; player=%s; staff=%s',
      viewer_context.actor_id, viewer_context.database_role, viewer_context.membership_role,
      viewer_context.is_player, viewer_context.is_staff)
  );

  execute 'set local role authenticated';
  visible_count := null;
  error_state := null;
  begin
    select pg_catalog.count(*)::integer into visible_count from public.training_session_load_metrics;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'VIEWER_direct_select_zero',
    error_state is null and visible_count = 0,
    pg_catalog.format('sqlstate=%s; visible_rows=%s', coalesce(error_state, 'NULL'), coalesce(visible_count::text, 'NULL'))
  );

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    insert into public.training_session_load_metrics (
      id, session_id, scope, jugador_id, aggregation_method, load_units
    ) values (
      viewer_insert_metric_id, viewer_insert_session_id, 'team', null, 'team_average', 112
    );
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'VIEWER_insert_denied',
    error_state = '42501' and affected_count = 0
      and not exists (select 1 from public.training_session_load_metrics where id = viewer_insert_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    update public.training_session_load_metrics set load_units = 778 where id = mutable_metric_id;
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'VIEWER_update_denied_or_zero',
    affected_count = 0 and (error_state is null or error_state = '42501')
      and (select load_units = 200 from public.training_session_load_metrics where id = mutable_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    delete from public.training_session_load_metrics where id = mutable_metric_id;
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'VIEWER_delete_denied_or_zero',
    affected_count = 0 and (error_state is null or error_state = '42501')
      and exists (select 1 from public.training_session_load_metrics where id = mutable_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  visible_count := null;
  error_state := null;
  begin
    select pg_catalog.count(*)::integer into visible_count from public.training_session_load_metrics;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'ANON_select_denied',
    error_state = '42501',
    pg_catalog.format('sqlstate=%s; visible_rows=%s', coalesce(error_state, 'NULL'), coalesce(visible_count::text, 'NULL'))
  );

  execute 'set local role anon';
  affected_count := 0;
  error_state := null;
  begin
    insert into public.training_session_load_metrics (
      id, session_id, scope, jugador_id, aggregation_method, load_units
    ) values (
      pg_catalog.gen_random_uuid(), player_insert_session_id, 'team', null, 'team_average', 113
    );
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'ANON_insert_denied',
    error_state = '42501' and affected_count = 0,
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select auth.uid() as actor_id, current_user as database_role,
         membership.role as membership_role, public.is_player() as is_player,
         public.is_app_staff() as is_staff
  into staff_context
  from public.current_membership() membership;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'STAFF_context_exact',
    staff_context.actor_id = staff_user_id
      and staff_context.database_role = 'authenticated'
      and staff_context.membership_role = 'staff'
      and not staff_context.is_player
      and staff_context.is_staff,
    pg_catalog.format('uid=%s; db_role=%s; membership=%s; player=%s; staff=%s',
      staff_context.actor_id, staff_context.database_role, staff_context.membership_role,
      staff_context.is_player, staff_context.is_staff)
  );

  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count
  from public.training_session_load_metrics where id = mutable_metric_id;
  execute 'reset role';
  perform pg_temp.add_core30_check('STAFF_select_works', visible_count = 1, pg_catalog.format('fixture rows=%s', visible_count));

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    insert into public.training_session_load_metrics (
      id, session_id, scope, jugador_id, aggregation_method, load_units
    ) values (
      staff_insert_metric_id, staff_insert_session_id, 'team', null, 'team_average', 300
    );
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'STAFF_insert_works',
    error_state is null and affected_count = 1
      and exists (select 1 from public.training_session_load_metrics where id = staff_insert_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    update public.training_session_load_metrics set load_units = 321 where id = staff_insert_metric_id;
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'STAFF_update_works',
    error_state is null and affected_count = 1
      and (select load_units = 321 from public.training_session_load_metrics where id = staff_insert_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  execute 'set local role authenticated';
  affected_count := 0;
  error_state := null;
  begin
    delete from public.training_session_load_metrics where id = staff_insert_metric_id;
    get diagnostics affected_count = row_count;
  exception when others then get stacked diagnostics error_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core30_check(
    'STAFF_delete_works',
    error_state is null and affected_count = 1
      and not exists (select 1 from public.training_session_load_metrics where id = staff_insert_metric_id),
    pg_catalog.format('sqlstate=%s; affected=%s', coalesce(error_state, 'NULL'), affected_count)
  );

  select procedure_row.* into function_row
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.get_my_team_load_evolution(date,date)'::regprocedure;
  perform pg_temp.add_core30_check(
    'CORE29_function_security_contract_intact',
    function_row.prosecdef
      and function_row.provolatile = 's'
      and function_row.proconfig = array['search_path=pg_catalog']::text[]
      and pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE'),
    'Core 29 remains STABLE SECURITY DEFINER, fixed search_path and authenticated-only'
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select
    pg_catalog.count(*)::integer,
    pg_catalog.max(output_row.load_units),
    pg_catalog.max(output_row.distance_m),
    pg_catalog.array_agg(output_row.session_date order by output_row.session_date)
  into rpc_count, rpc_load_units, rpc_distance_m, rpc_dates
  from public.get_my_team_load_evolution(fixture_start, fixture_start) output_row;

  select pg_catalog.array_agg(key_row.key order by key_row.key)
  into rpc_keys
  from public.get_my_team_load_evolution(fixture_start, fixture_start) output_row
  cross join lateral pg_catalog.jsonb_object_keys(pg_catalog.to_jsonb(output_row)) key_row(key);
  execute 'reset role';

  perform pg_temp.add_core30_check(
    'CORE29_rpc_player_works',
    rpc_count = 1
      and rpc_load_units = 450.5
      and rpc_distance_m = 7200.25
      and rpc_dates = array[fixture_start]::date[],
    pg_catalog.format('rows=%s; load=%s; distance=%s; dates=%s', rpc_count, rpc_load_units, rpc_distance_m, rpc_dates)
  );

  perform pg_temp.add_core30_check(
    'CORE29_dto_and_team_only_privacy_intact',
    pg_catalog.pg_get_function_result(function_row.oid) =
      'TABLE(session_date date, load_units numeric, distance_m numeric, hsr_m numeric, accelerations integer, decelerations integer, sprints integer, meters_per_minute numeric, actual_duration_minutes integer)'
      and rpc_keys = expected_keys
      and rpc_load_units <> 999,
    pg_catalog.format('runtime keys=%s; player-scope sentinel 999 excluded', rpc_keys)
  );

  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$verify$;

select test_name, test_ok, details
from pg_temp.core30_verify_results
order by ordinal;

rollback;
