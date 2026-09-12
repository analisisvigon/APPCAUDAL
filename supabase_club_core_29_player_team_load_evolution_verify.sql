-- APPCAUDAL - Club Core 29 - Transactional verifier for PLAYER team load evolution.
-- Run the complete file after Core 29. All fixtures disappear with ROLLBACK.

begin;

create temporary table core29_verify_results (
  ordinal integer generated always as identity,
  test_name text not null,
  test_ok boolean not null,
  details text not null
) on commit drop;

create function pg_temp.add_core29_check(p_name text, p_ok boolean, p_details text)
returns void
language sql
set search_path = pg_catalog
as $function$
  insert into pg_temp.core29_verify_results(test_name, test_ok, details)
  values (p_name, coalesce(p_ok, false), coalesce(p_details, ''));
$function$;

-- Snapshot the effective table security contract before creating fixtures.
-- This deliberately separates table ACLs from RLS policies: authenticated may
-- have SELECT while a PLAYER still sees zero rows because every applicable
-- SELECT policy evaluates to false.
create temporary table core29_table_security_audit (
  table_name text primary key,
  rls_enabled boolean not null,
  force_rls boolean not null,
  staff_contract_ok boolean not null,
  no_player_policy boolean not null,
  no_unexpected_client_policy boolean not null,
  authenticated_select_grant boolean not null,
  authenticated_select_policies jsonb not null,
  policies jsonb not null,
  grants jsonb not null
) on commit drop;

with
roles as (
  select
    max(role_row.oid) filter (where role_row.rolname = 'authenticated') as authenticated_oid,
    max(role_row.oid) filter (where role_row.rolname = 'anon') as anon_oid
  from pg_catalog.pg_roles role_row
),
targets(table_name) as (
  values
    ('training_sessions'::text),
    ('training_session_load_metrics'::text)
),
relations as (
  select
    target.table_name,
    relation.oid as relation_oid,
    relation.relowner,
    relation.relacl,
    relation.relrowsecurity,
    relation.relforcerowsecurity
  from targets target
  join pg_catalog.pg_namespace namespace_row
    on namespace_row.nspname = 'public'
  join pg_catalog.pg_class relation
    on relation.relnamespace = namespace_row.oid
   and relation.relname = target.table_name
   and relation.relkind in ('r', 'p')
),
policy_inventory as (
  select
    relation.table_name,
    policy.oid as policy_oid,
    policy.polname,
    policy.polpermissive,
    policy.polcmd,
    policy.polroles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as qual,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as with_check,
    pg_catalog.replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
        '[[:space:]()]', '', 'g'
      ),
      'public.', ''
    ) as normalized_qual,
    pg_catalog.replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
        '[[:space:]()]', '', 'g'
      ),
      'public.', ''
    ) as normalized_with_check
  from relations relation
  join pg_catalog.pg_policy policy on policy.polrelid = relation.relation_oid
),
expected_staff(policy_name, command, needs_using, needs_check) as (
  values
    ('performance_staff_select'::text, 'r'::"char", true, false),
    ('performance_staff_insert'::text, 'a'::"char", false, true),
    ('performance_staff_update'::text, 'w'::"char", true, true),
    ('performance_staff_delete'::text, 'd'::"char", true, false)
)
insert into pg_temp.core29_table_security_audit (
  table_name,
  rls_enabled,
  force_rls,
  staff_contract_ok,
  no_player_policy,
  no_unexpected_client_policy,
  authenticated_select_grant,
  authenticated_select_policies,
  policies,
  grants
)
select
  relation.table_name,
  relation.relrowsecurity,
  relation.relforcerowsecurity,
  not exists (
    select 1
    from expected_staff expected
    left join policy_inventory policy
      on policy.table_name = relation.table_name
     and policy.polname = expected.policy_name
    cross join roles
    where policy.policy_oid is null
       or not policy.polpermissive
       or policy.polcmd <> expected.command
       or policy.polroles <> array[roles.authenticated_oid]::oid[]
       or case
         when expected.needs_using then policy.normalized_qual <> 'is_app_staff'
         else policy.qual is not null
       end
       or case
         when expected.needs_check then policy.normalized_with_check <> 'is_app_staff'
         else policy.with_check is not null
       end
  ),
  not exists (
    select 1
    from policy_inventory policy
    where policy.table_name = relation.table_name
      and (
        policy.polname ilike '%player%'
        or policy.normalized_qual like '%is_player%'
        or policy.normalized_qual like '%current_jugador_id%'
        or policy.normalized_with_check like '%is_player%'
        or policy.normalized_with_check like '%current_jugador_id%'
      )
  ),
  not exists (
    select 1
    from policy_inventory policy
    cross join roles
    where policy.table_name = relation.table_name
      and exists (
        select 1
        from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
        where policy_role.role_oid in (0::oid, roles.authenticated_oid, roles.anon_oid)
      )
      and policy.polname not in (
        'performance_staff_select',
        'performance_staff_insert',
        'performance_staff_update',
        'performance_staff_delete'
      )
  ),
  pg_catalog.has_table_privilege('authenticated', relation.relation_oid, 'SELECT'),
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'policyname', policy.polname,
          'cmd', case policy.polcmd when 'r' then 'SELECT' else 'ALL' end,
          'qual', policy.qual
        )
        order by policy.polname
      )
      from policy_inventory policy
      cross join roles
      where policy.table_name = relation.table_name
        and policy.polcmd in ('r', '*')
        and exists (
          select 1
          from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
          where policy_role.role_oid in (0::oid, roles.authenticated_oid)
        )
    ),
    '[]'::jsonb
  ),
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'policyname', policy.polname,
          'permissive', policy.polpermissive,
          'cmd', case policy.polcmd
            when 'r' then 'SELECT'
            when 'a' then 'INSERT'
            when 'w' then 'UPDATE'
            when 'd' then 'DELETE'
            when '*' then 'ALL'
            else policy.polcmd::text
          end,
          'roles', (
            select pg_catalog.jsonb_agg(
              coalesce(policy_role_name.rolname, 'PUBLIC')
              order by coalesce(policy_role_name.rolname, 'PUBLIC')
            )
            from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
            left join pg_catalog.pg_roles policy_role_name
              on policy_role_name.oid = policy_role.role_oid
          ),
          'qual', policy.qual,
          'with_check', policy.with_check
        )
        order by policy.polname
      )
      from policy_inventory policy
      where policy.table_name = relation.table_name
    ),
    '[]'::jsonb
  ),
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'grantor', coalesce(grantor.rolname, 'PUBLIC'),
          'grantee', coalesce(grantee.rolname, 'PUBLIC'),
          'privilege', acl.privilege_type,
          'is_grantable', acl.is_grantable
        )
        order by coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
      )
      from pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) acl
      left join pg_catalog.pg_roles grantor on grantor.oid = acl.grantor
      left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
    ),
    '[]'::jsonb
  )
from relations relation;

do $verify$
declare
  function_oid oid;
  function_row pg_catalog.pg_proc%rowtype;
  canonical_club_id uuid;
  other_club_id uuid;
  owner_user_id uuid;
  fixture_player_id uuid;
  player_user_id uuid := pg_catalog.gen_random_uuid();
  staff_user_id uuid := pg_catalog.gen_random_uuid();
  viewer_user_id uuid := pg_catalog.gen_random_uuid();
  no_membership_user_id uuid := pg_catalog.gen_random_uuid();
  player_membership_id uuid;
  fixture_start date := current_date + 3650;
  session_null_id uuid := pg_catalog.gen_random_uuid();
  session_zero_id uuid := pg_catalog.gen_random_uuid();
  session_values_id uuid := pg_catalog.gen_random_uuid();
  output_count integer;
  distinct_date_count integer;
  training_sessions_visible_count integer;
  load_metrics_visible_count integer;
  training_sessions_sqlstate text;
  load_metrics_sqlstate text;
  training_sessions_blocked boolean;
  load_metrics_blocked boolean;
  fixture_auth_uid uuid;
  fixture_database_role text;
  fixture_membership_role text;
  fixture_membership_jugador_id uuid;
  fixture_is_player boolean;
  fixture_is_staff boolean;
  accepted boolean;
  observed_sqlstate text;
  output_dates date[];
  output_keys text[];
  null_row record;
  zero_row record;
  values_row record;
  source_text text;
  expected_columns text[] := array[
    'session_date', 'load_units', 'distance_m', 'hsr_m', 'accelerations',
    'decelerations', 'sprints', 'meters_per_minute', 'actual_duration_minutes'
  ]::text[];
begin
  function_oid := pg_catalog.to_regprocedure(
    'public.get_my_team_load_evolution(date,date)'
  );

  select procedure_row.* into function_row
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = function_oid;

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

  perform pg_temp.add_core29_check(
    'PREREQUISITES_single_club_owner_unbound_player',
    (select pg_catalog.count(*) from public.clubs) = 1
      and canonical_club_id is not null
      and owner_user_id is not null
      and fixture_player_id is not null,
    'one canonical club, active OWNER and an active unbound sports identity for the transactional PLAYER fixture'
  );

  perform pg_temp.add_core29_check(
    'FUNCTION_exact_signature',
    function_oid is not null
      and function_row.pronargs = 2
      and function_row.proargtypes = '1082 1082'::pg_catalog.oidvector
      and array[
        (function_row.proargnames)[1]::text,
        (function_row.proargnames)[2]::text
      ]::text[] = array['p_start_date', 'p_end_date']::text[],
    'get_my_team_load_evolution(date,date); no identity or club input'
  );

  perform pg_temp.add_core29_check(
    'FUNCTION_no_defaults',
    function_oid is not null
      and function_row.pronargdefaults = 0
      and function_row.proargdefaults is null,
    'both dates are explicit and there are no hidden defaults'
  );

  perform pg_temp.add_core29_check(
    'FUNCTION_owner_postgres',
    function_oid is not null
      and function_row.proowner = (
        select role_row.oid from pg_catalog.pg_roles role_row
        where role_row.rolname = 'postgres'
      ),
    'owner=postgres'
  );

  perform pg_temp.add_core29_check(
    'FUNCTION_stable_security_definer_search_path',
    function_oid is not null
      and function_row.provolatile = 's'
      and function_row.prosecdef
      and function_row.proconfig = array['search_path=pg_catalog']::text[],
    'STABLE SECURITY DEFINER with fixed pg_catalog search_path'
  );

  perform pg_temp.add_core29_check(
    'FUNCTION_authenticated_only_acl',
    function_oid is not null
      and exists (
        select 1
        from pg_catalog.aclexplode(function_row.proacl) acl
        join pg_catalog.pg_roles role_row on role_row.oid = acl.grantee
        where role_row.rolname = 'authenticated'
          and acl.privilege_type = 'EXECUTE'
      )
      and not exists (
        select 1
        from pg_catalog.aclexplode(function_row.proacl) acl
        left join pg_catalog.pg_roles role_row on role_row.oid = acl.grantee
        where acl.privilege_type = 'EXECUTE'
          and acl.grantee <> function_row.proowner
          and coalesce(role_row.rolname, 'PUBLIC') <> 'authenticated'
      ),
    'only owner and authenticated can execute; PUBLIC, anon and service_role have no grant'
  );

  perform pg_temp.add_core29_check(
    'DTO_exact_columns_and_types',
    function_oid is not null
      and pg_catalog.pg_get_function_result(function_oid) =
        'TABLE(session_date date, load_units numeric, distance_m numeric, hsr_m numeric, accelerations integer, decelerations integer, sprints integer, meters_per_minute numeric, actual_duration_minutes integer)',
    'nine typed output columns: date plus the eight supported team metrics'
  );

  perform pg_temp.add_core29_check(
    'DTO_no_identifiers_or_private_fields',
    function_oid is not null
      and not exists (
        select 1
        from pg_catalog.unnest(function_row.proargnames) argument_name
        where argument_name = any(array[
          'id', 'club_id', 'jugador_id', 'user_id', 'membership_id', 'session_id',
          'notes', 'scope', 'aggregation_method', 'created_at', 'updated_at',
          'rpe', 'wellness', 'comment', 'discomfort', 'name'
        ]::text[])
      ),
    'no IDs, names, notes, individual markers, RPE, Wellness or comments in the RPC contract'
  );

  source_text := pg_catalog.lower(coalesce(function_row.prosrc, ''));
  perform pg_temp.add_core29_check(
    'SOURCE_exact_team_filters',
    pg_catalog.strpos(source_text, 'public.current_membership()') > 0
      and pg_catalog.strpos(source_text, 'actor_role is distinct from ''player''') > 0
      and pg_catalog.strpos(source_text, 'record_kind = ''daily_team_load''') > 0
      and pg_catalog.strpos(source_text, 'scope = ''team''') > 0
      and pg_catalog.strpos(source_text, 'jugador_id is null') > 0
      and pg_catalog.strpos(source_text, 'aggregation_method = ''team_average''') > 0,
    'membership-derived PLAYER plus canonical daily team-average filters'
  );

  perform pg_temp.add_core29_check(
    'TABLE_RLS_training_sessions_staff_contract',
    audit.rls_enabled
      and audit.staff_contract_ok
      and audit.no_player_policy
      and audit.no_unexpected_client_policy,
    pg_catalog.format(
      'relrowsecurity=%s; relforcerowsecurity=%s; authenticated SELECT=%s; policies=%s; grants=%s',
      audit.rls_enabled,
      audit.force_rls,
      audit.authenticated_select_grant,
      audit.policies::text,
      audit.grants::text
    )
  )
  from pg_temp.core29_table_security_audit audit
  where audit.table_name = 'training_sessions';

  perform pg_temp.add_core29_check(
    'TABLE_RLS_training_session_load_metrics_staff_contract',
    audit.rls_enabled
      and audit.staff_contract_ok
      and audit.no_player_policy
      and audit.no_unexpected_client_policy,
    pg_catalog.format(
      'relrowsecurity=%s; relforcerowsecurity=%s; authenticated SELECT=%s; policies=%s; grants=%s',
      audit.rls_enabled,
      audit.force_rls,
      audit.authenticated_select_grant,
      audit.policies::text,
      audit.grants::text
    )
  )
  from pg_temp.core29_table_security_audit audit
  where audit.table_name = 'training_session_load_metrics';

  perform pg_temp.add_core29_check(
    'TABLE_RLS_staff_contract_intact',
    coalesce(
      (
        select pg_catalog.bool_and(
          audit.rls_enabled
          and audit.staff_contract_ok
          and audit.no_player_policy
          and audit.no_unexpected_client_policy
        )
        from pg_temp.core29_table_security_audit audit
      ),
      false
    ),
    'semantic contract: RLS enabled; four canonical STAFF operations intact; no PLAYER or unexpected client-applicable policy'
  );

  if canonical_club_id is null or owner_user_id is null or fixture_player_id is null
     or function_oid is null then
    return;
  end if;

  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';

  while exists (
    select 1
    from public.training_sessions session_row
    where session_row.record_kind = 'daily_team_load'
      and session_row.session_date between fixture_start and fixture_start + 70
  ) loop
    fixture_start := fixture_start + 71;
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
    pg_catalog.format('verify29.%s.%s@appcaudal.invalid', fixture.fixture_role, fixture.user_id),
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
      (viewer_user_id, 'viewer'::text),
      (no_membership_user_id, 'none'::text)
  ) fixture(user_id, fixture_role)
  where account.id = owner_user_id;

  insert into public.club_memberships (club_id, user_id, role, jugador_id, is_active)
  values
    (canonical_club_id, player_user_id, 'player', fixture_player_id, true),
    (canonical_club_id, staff_user_id, 'staff', null, true),
    (canonical_club_id, viewer_user_id, 'viewer', null, true);

  select membership.id into player_membership_id
  from public.club_memberships membership
  where membership.user_id = player_user_id
    and membership.club_id = canonical_club_id;

  insert into public.training_sessions (
    id, session_date, session_type, actual_duration_minutes, record_kind, notes
  ) values
    (session_null_id, fixture_start, 'rest', null, 'daily_team_load', 'VERIFY29_PRIVATE_NOTE_NULL'),
    (session_zero_id, fixture_start + 1, 'training', 60, 'daily_team_load', 'VERIFY29_PRIVATE_NOTE_ZERO'),
    (session_values_id, fixture_start + 2, 'training', 90, 'daily_team_load', 'VERIFY29_PRIVATE_NOTE_VALUES');

  insert into public.training_session_load_metrics (
    session_id, scope, jugador_id, aggregation_method,
    load_units, distance_m, hsr_m, accelerations, decelerations, sprints,
    meters_per_minute
  ) values
    (session_null_id, 'team', null, 'team_average', null, null, null, null, null, null, null),
    (session_zero_id, 'team', null, 'team_average', 0, 0, 0, 0, 0, 0, 0),
    (session_values_id, 'team', null, 'team_average', 450.5, 7200.25, 640.5, 33, 28, 14, 80.25),
    (session_values_id, 'player', fixture_player_id, null, 999, 99999, 9999, 999, 999, 999, 999);

  -- Invalid date ranges are tested as the valid PLAYER so authorization cannot
  -- mask the controlled 22023 contract.
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  observed_sqlstate := null;
  begin
    perform * from public.get_my_team_load_evolution(null, fixture_start);
  exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('RANGE_null_start_22023', observed_sqlstate = '22023', 'NULL start is rejected');

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  observed_sqlstate := null;
  begin
    perform * from public.get_my_team_load_evolution(fixture_start, null);
  exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('RANGE_null_end_22023', observed_sqlstate = '22023', 'NULL end is rejected');

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  observed_sqlstate := null;
  begin
    perform * from public.get_my_team_load_evolution(fixture_start + 1, fixture_start);
  exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('RANGE_reversed_22023', observed_sqlstate = '22023', 'start after end is rejected');

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  observed_sqlstate := null;
  begin
    perform * from public.get_my_team_load_evolution(fixture_start, fixture_start + 62);
  exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('RANGE_over_62_days_22023', observed_sqlstate = '22023', '63 inclusive days are rejected');

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  accepted := true;
  begin
    perform * from public.get_my_team_load_evolution(fixture_start, fixture_start + 61);
  exception when others then accepted := false;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('RANGE_62_days_allowed', accepted, '62 inclusive days are accepted');

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(distinct output_row.session_date)::integer,
    pg_catalog.array_agg(output_row.session_date order by output_row.ordinality)
  into output_count, distinct_date_count, output_dates
  from public.get_my_team_load_evolution(fixture_start, fixture_start + 2)
       with ordinality output_row;

  select output_row.* into null_row
  from public.get_my_team_load_evolution(fixture_start, fixture_start + 2) output_row
  where output_row.session_date = fixture_start;

  select output_row.* into zero_row
  from public.get_my_team_load_evolution(fixture_start, fixture_start + 2) output_row
  where output_row.session_date = fixture_start + 1;

  select output_row.* into values_row
  from public.get_my_team_load_evolution(fixture_start, fixture_start + 2) output_row
  where output_row.session_date = fixture_start + 2;

  select pg_catalog.array_agg(key_row.key order by key_row.key)
  into output_keys
  from pg_catalog.jsonb_object_keys(pg_catalog.to_jsonb(values_row)) key_row(key);

  select
    auth.uid(),
    current_user,
    membership.role,
    membership.jugador_id,
    public.is_player(),
    public.is_app_staff()
  into
    fixture_auth_uid,
    fixture_database_role,
    fixture_membership_role,
    fixture_membership_jugador_id,
    fixture_is_player,
    fixture_is_staff
  from public.current_membership() membership;

  training_sessions_visible_count := null;
  training_sessions_sqlstate := null;
  begin
    select pg_catalog.count(*)::integer into training_sessions_visible_count
    from public.training_sessions;
  exception when others then
    get stacked diagnostics training_sessions_sqlstate = returned_sqlstate;
  end;

  load_metrics_visible_count := null;
  load_metrics_sqlstate := null;
  begin
    select pg_catalog.count(*)::integer into load_metrics_visible_count
    from public.training_session_load_metrics;
  exception when others then
    get stacked diagnostics load_metrics_sqlstate = returned_sqlstate;
  end;

  execute 'reset role';

  training_sessions_blocked := training_sessions_sqlstate = '42501'
    or (training_sessions_sqlstate is null and training_sessions_visible_count = 0);
  load_metrics_blocked := load_metrics_sqlstate = '42501'
    or (load_metrics_sqlstate is null and load_metrics_visible_count = 0);

  perform pg_temp.add_core29_check('PLAYER_valid_allowed', output_count = 3 and player_membership_id is not null, 'valid PLAYER receives the three collective fixture dates');
  perform pg_temp.add_core29_check(
    'PLAYER_fixture_context_exact',
    fixture_auth_uid = player_user_id
      and fixture_database_role = 'authenticated'
      and fixture_membership_role = 'player'
      and fixture_membership_jugador_id = fixture_player_id
      and fixture_is_player
      and not fixture_is_staff,
    pg_catalog.format(
      'auth.uid=%s; current_user=%s; membership.role=%s; jugador_id=%s; is_player=%s; is_app_staff=%s',
      coalesce(fixture_auth_uid::text, 'NULL'),
      coalesce(fixture_database_role, 'NULL'),
      coalesce(fixture_membership_role, 'NULL'),
      coalesce(fixture_membership_jugador_id::text, 'NULL'),
      coalesce(fixture_is_player::text, 'NULL'),
      coalesce(fixture_is_staff::text, 'NULL')
    )
  );
  perform pg_temp.add_core29_check(
    'PLAYER_direct_training_sessions_blocked',
    training_sessions_blocked,
    pg_catalog.format(
      'sqlstate=%s; visible_rows=%s; authenticated SELECT=%s; applicable SELECT policies=%s',
      coalesce(training_sessions_sqlstate, 'NULL'),
      coalesce(training_sessions_visible_count::text, 'NULL'),
      (select audit.authenticated_select_grant
       from pg_temp.core29_table_security_audit audit
       where audit.table_name = 'training_sessions'),
      (select audit.authenticated_select_policies::text
       from pg_temp.core29_table_security_audit audit
       where audit.table_name = 'training_sessions')
    )
  );
  perform pg_temp.add_core29_check(
    'PLAYER_direct_training_session_load_metrics_blocked',
    load_metrics_blocked,
    pg_catalog.format(
      'sqlstate=%s; visible_rows=%s; authenticated SELECT=%s; applicable SELECT policies=%s',
      coalesce(load_metrics_sqlstate, 'NULL'),
      coalesce(load_metrics_visible_count::text, 'NULL'),
      (select audit.authenticated_select_grant
       from pg_temp.core29_table_security_audit audit
       where audit.table_name = 'training_session_load_metrics'),
      (select audit.authenticated_select_policies::text
       from pg_temp.core29_table_security_audit audit
       where audit.table_name = 'training_session_load_metrics')
    )
  );
  perform pg_temp.add_core29_check(
    'PLAYER_direct_tables_still_denied',
    training_sessions_blocked and load_metrics_blocked,
    'both direct table checks accept only SQLSTATE 42501 or a successful SELECT returning exactly zero rows'
  );
  perform pg_temp.add_core29_check('RESULT_only_team_rows', output_count = 3 and values_row.load_units = 450.5, 'the player-scope 999 row is excluded');
  perform pg_temp.add_core29_check('RESULT_one_row_per_day', output_count = distinct_date_count, 'daily session and team metric unique indexes prevent duplicates');
  perform pg_temp.add_core29_check('RESULT_order_ascending', output_dates = array[fixture_start, fixture_start + 1, fixture_start + 2]::date[], 'session_date ASC');
  perform pg_temp.add_core29_check('RESULT_runtime_exact_keys', output_keys = (select pg_catalog.array_agg(item order by item) from pg_catalog.unnest(expected_columns) item), 'runtime JSON object has the exact safe DTO keys');
  perform pg_temp.add_core29_check(
    'RESULT_null_preserved',
    null_row.load_units is null and null_row.distance_m is null and null_row.hsr_m is null
      and null_row.accelerations is null and null_row.decelerations is null
      and null_row.sprints is null and null_row.meters_per_minute is null
      and null_row.actual_duration_minutes is null,
    'NULL remains absence for every supported metric'
  );
  perform pg_temp.add_core29_check(
    'RESULT_zero_preserved',
    zero_row.load_units = 0 and zero_row.distance_m = 0 and zero_row.hsr_m = 0
      and zero_row.accelerations = 0 and zero_row.decelerations = 0
      and zero_row.sprints = 0 and zero_row.meters_per_minute = 0,
    'real metric zero remains numeric zero and is not converted to NULL'
  );
  perform pg_temp.add_core29_check(
    'RESULT_eight_metrics_exact_values',
    values_row.load_units = 450.5 and values_row.distance_m = 7200.25
      and values_row.hsr_m = 640.5 and values_row.accelerations = 33
      and values_row.decelerations = 28 and values_row.sprints = 14
      and values_row.meters_per_minute = 80.25
      and values_row.actual_duration_minutes = 90,
    'U.C., distance, HSR, ACC, DCC, sprint, M/min and volume preserve backend types and values'
  );
  perform pg_temp.add_core29_check('RESULT_actual_duration_minutes', values_row.actual_duration_minutes = 90 and zero_row.actual_duration_minutes = 60, 'session volume comes from training_sessions without coercion');

  -- Authenticated non-PLAYER roles have EXECUTE at the PostgreSQL role level,
  -- but the function rejects them using current_membership().
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  observed_sqlstate := null;
  begin
    perform * from public.get_my_team_load_evolution(fixture_start, fixture_start + 2);
  exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('ROLE_staff_denied', observed_sqlstate = '42501', 'STAFF membership is rejected fail-closed');

  perform pg_catalog.set_config('request.jwt.claim.sub', viewer_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  observed_sqlstate := null;
  begin
    perform * from public.get_my_team_load_evolution(fixture_start, fixture_start + 2);
  exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('ROLE_viewer_denied', observed_sqlstate = '42501', 'VIEWER membership is rejected fail-closed');

  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  observed_sqlstate := null;
  begin
    perform * from public.get_my_team_load_evolution(fixture_start, fixture_start + 2);
  exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('ROLE_no_membership_denied', observed_sqlstate = '42501', 'authenticated identity without membership is rejected');

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  observed_sqlstate := null;
  begin
    perform * from public.get_my_team_load_evolution(fixture_start, fixture_start + 2);
  exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  execute 'reset role';
  perform pg_temp.add_core29_check('ROLE_anon_denied', observed_sqlstate = '42501', 'anon has no EXECUTE grant');

  -- A second club invalidates the current single-club data ownership model.
  -- The valid PLAYER must then fail closed instead of seeing canonical data.
  observed_sqlstate := null;
  begin
    insert into public.clubs (id, name)
    values (pg_catalog.gen_random_uuid(), 'VERIFY29 SECOND CLUB')
    returning id into other_club_id;

    update public.club_memberships
    set club_id = other_club_id
    where id = player_membership_id;

    perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    begin
      perform * from public.get_my_team_load_evolution(fixture_start, fixture_start + 2);
    exception when others then get stacked diagnostics observed_sqlstate = returned_sqlstate;
    end;
    execute 'reset role';
    if observed_sqlstate = '42501' then
      raise sqlstate 'P2901' using message = 'ROLLBACK_EXPECTED_CROSS_CLUB';
    end if;
    raise exception 'Core 29 did not fail closed with a second club';
  exception
    when sqlstate 'P2901' then null;
    when others then
      execute 'reset role';
      get stacked diagnostics observed_sqlstate = returned_sqlstate;
  end;
  perform pg_temp.add_core29_check('CROSS_CLUB_fail_closed', observed_sqlstate = '42501', 'a PLAYER membership from a second club cannot read canonical team data');

  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$verify$;

select test_name, test_ok, details
from pg_temp.core29_verify_results
order by ordinal;

rollback;
