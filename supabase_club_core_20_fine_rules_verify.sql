-- APPCAUDAL - Bloque 4.2 - Verificacion posterior.
--
-- Ejecutar el archivo completo. Devuelve una unica tabla visible con columnas:
-- test_name, test_ok, details.
-- Toda mutacion funcional se revierte en una subtransaccion y el archivo
-- termina ademas con ROLLBACK.

begin;

create or replace function pg_temp.verify_fine_rules()
returns table (
  test_name text,
  test_ok boolean,
  details text
)
language plpgsql
set search_path = pg_catalog
as $verify$
declare
  club_id_value uuid;
  staff_user_id uuid;
  staff_membership_id uuid;
  player_user_id constant uuid := '350615a9-b068-450a-b867-da30a59b9082'::uuid;
  player_jugador_id constant uuid := '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid;
  player_membership_id uuid;
  no_membership_user_id constant uuid := 'b4200000-0000-4000-8000-000000000099'::uuid;
  cross_club_id constant uuid := 'b4200000-0000-4000-8000-000000000042'::uuid;
  observed_count integer;
  expected_count integer;
  visible_count integer;
  expected_rule record;
  insert_denied boolean;
  update_denied boolean;
  delete_denied boolean;
  inserted_ok boolean;
  updated_ok boolean;
  deleted_ok boolean;
  amount_data_type text;
  amount_precision integer;
  amount_scale integer;
  error_message text;
begin
  select club.id into club_id_value
  from public.clubs club
  order by club.id
  limit 1;

  select membership.id, membership.user_id
  into staff_membership_id, staff_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value
    and membership.role = 'staff'
    and membership.is_active
  order by membership.id
  limit 1;

  select membership.id into player_membership_id
  from public.club_memberships membership
  where membership.user_id = player_user_id
    and membership.jugador_id = player_jugador_id
    and membership.role = 'player'
    and membership.is_active;

  test_name := 'A_fine_rules_exists';
  test_ok := pg_catalog.to_regclass('public.fine_rules') is not null;
  details := 'relation=' || coalesce(pg_catalog.to_regclass('public.fine_rules')::text, 'NULL');
  return next;

  with expected(column_name, data_type, is_nullable, amount_precision, amount_scale) as (
    values
      ('id'::text, 'uuid'::text, 'NO'::text, null::integer, null::integer),
      ('club_id', 'uuid', 'NO', null, null),
      ('code', 'text', 'NO', null, null),
      ('name', 'text', 'NO', null, null),
      ('description', 'text', 'YES', null, null),
      ('default_amount', 'numeric', 'YES', 10, 2),
      ('pricing_mode', 'text', 'NO', null, null),
      ('applies_to_players', 'boolean', 'NO', null, null),
      ('applies_to_staff', 'boolean', 'NO', null, null),
      ('collective_allowed', 'boolean', 'NO', null, null),
      ('active', 'boolean', 'NO', null, null),
      ('sort_order', 'integer', 'NO', null, null),
      ('created_at', 'timestamp with time zone', 'NO', null, null),
      ('updated_at', 'timestamp with time zone', 'NO', null, null)
  ), actual as (
    select
      actual_column.column_name,
      actual_column.data_type,
      actual_column.is_nullable,
      case
        when actual_column.column_name = 'default_amount'
          then actual_column.numeric_precision
        else null::integer
      end as amount_precision,
      case
        when actual_column.column_name = 'default_amount'
          then actual_column.numeric_scale
        else null::integer
      end as amount_scale
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fine_rules'
  )
  select
    (select pg_catalog.count(*) from actual),
    (select pg_catalog.count(*) from expected),
    not exists (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
  into observed_count, expected_count, test_ok;

  select
    actual_column.data_type,
    actual_column.numeric_precision,
    actual_column.numeric_scale
  into amount_data_type, amount_precision, amount_scale
  from information_schema.columns actual_column
  where actual_column.table_schema = 'public'
    and actual_column.table_name = 'fine_rules'
    and actual_column.column_name = 'default_amount';

  test_name := 'B_exact_columns';
  details := pg_catalog.format(
    'observed=%s expected=%s; default_amount=%s precision=%s scale=%s',
    observed_count,
    expected_count,
    coalesce(amount_data_type, 'NULL'),
    coalesce(amount_precision::text, 'NULL'),
    coalesce(amount_scale::text, 'NULL')
  );
  return next;

  test_name := 'C_owner_postgres';
  select pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
  into test_ok
  from pg_catalog.pg_class relation
  where relation.oid = 'public.fine_rules'::regclass;
  details := 'owner=' || pg_catalog.pg_get_userbyid(
    (select relation.relowner from pg_catalog.pg_class relation where relation.oid = 'public.fine_rules'::regclass)
  );
  return next;

  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.fine_rules'::regclass
    and constraint_row.convalidated
    and constraint_row.conname in (
      'fine_rules_pkey',
      'fine_rules_club_id_fkey',
      'fine_rules_code_not_empty',
      'fine_rules_name_not_empty',
      'fine_rules_pricing_mode_check',
      'fine_rules_amount_check',
      'fine_rules_applicability_check',
      'fine_rules_sort_order_check',
      'fine_rules_club_code_key',
      'fine_rules_club_sort_order_key'
    );
  test_name := 'D_constraints_present';
  test_ok := observed_count = 10;
  details := pg_catalog.format('%s/10 named constraints present and validated', observed_count);
  return next;

  test_name := 'E_constraint_contracts';
  test_ok := exists (
      select 1 from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.fine_rules'::regclass
        and constraint_row.conname = 'fine_rules_pricing_mode_check'
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'per_subject') > 0
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'unpriced') > 0
    )
    and exists (
      select 1 from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.fine_rules'::regclass
        and constraint_row.conname = 'fine_rules_amount_check'
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'default_amount >') > 0
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'default_amount IS NULL') > 0
    )
    and exists (
      select 1 from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.fine_rules'::regclass
        and constraint_row.conname = 'fine_rules_applicability_check'
    );
  details := 'pricing modes, positive amount/unpriced NULL and applicability are constrained';
  return next;

  test_name := 'F_indexes_valid';
  select pg_catalog.count(*)::integer = 4 into test_ok
  from pg_catalog.pg_index index_row
  join pg_catalog.pg_class index_class on index_class.oid = index_row.indexrelid
  where index_row.indrelid = 'public.fine_rules'::regclass
    and index_row.indisvalid
    and index_class.relname in (
      'fine_rules_pkey',
      'fine_rules_club_code_key',
      'fine_rules_club_sort_order_key',
      'fine_rules_club_active_sort_idx'
    );
  details := 'PK, unique club/code, unique club/sort_order and lookup index valid';
  return next;

  test_name := 'G_club_fk_restrict';
  test_ok := exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fine_rules'::regclass
      and constraint_row.conname = 'fine_rules_club_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.clubs'::regclass
      and constraint_row.confdeltype = 'r'
      and constraint_row.convalidated
  ) and not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fine_rules'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  );
  details := 'club_id -> clubs(id) ON DELETE RESTRICT; CASCADE=0';
  return next;

  test_name := 'H_defaults_and_timestamps';
  test_ok := (
    select pg_catalog.count(*) = 5
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fine_rules'
      and (
        (actual_column.column_name = 'id' and actual_column.column_default like '%gen_random_uuid%')
        or (actual_column.column_name = 'collective_allowed' and actual_column.column_default = 'false')
        or (actual_column.column_name = 'active' and actual_column.column_default = 'true')
        or (actual_column.column_name = 'created_at' and actual_column.column_default like '%now()%')
        or (actual_column.column_name = 'updated_at' and actual_column.column_default like '%now()%')
      )
  );
  details := 'UUID/default booleans/timestamps use deterministic defaults';
  return next;

  test_name := 'I_updated_at_trigger';
  test_ok := exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.fine_rules'::regclass
      and trigger_row.tgname = 'set_fine_rules_updated_at'
      and trigger_row.tgfoid = 'public.set_club_core_updated_at()'::regprocedure
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
  );
  details := 'reuses public.set_club_core_updated_at()';
  return next;

  test_name := 'J_rls_on';
  select relation.relrowsecurity and not relation.relforcerowsecurity
  into test_ok
  from pg_catalog.pg_class relation
  where relation.oid = 'public.fine_rules'::regclass;
  details := 'RLS ON; FORCE RLS OFF';
  return next;

  test_name := 'K_single_staff_select_policy';
  test_ok := (
      select pg_catalog.count(*) = 1
      from pg_catalog.pg_policy policy
      join pg_catalog.pg_roles policy_role on policy_role.oid = any(policy.polroles)
      where policy.polrelid = 'public.fine_rules'::regclass
        and policy.polname = 'Fines staff can read rules'
        and policy.polcmd = 'r'
        and policy.polpermissive
        and policy_role.rolname = 'authenticated'
        and pg_catalog.strpos(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), 'is_app_staff()') > 0
        and pg_catalog.strpos(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), 'current_membership()') > 0
        and policy.polwithcheck is null
    ) and (
      select pg_catalog.count(*) = 1
      from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.fine_rules'::regclass
    ) and not exists (
      select 1
      from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.fine_rules'::regclass
        and (
          pg_catalog.regexp_replace(
            pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
            '[[:space:]()]', '', 'g'
          ) = 'true'
          or pg_catalog.regexp_replace(
            pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
            '[[:space:]()]', '', 'g'
          ) = 'true'
        )
    );
  details := 'one authenticated SELECT policy; STAFF + own club; no USING(true)/WITH CHECK(true)';
  return next;

  test_name := 'L_exact_grants';
  test_ok := not exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) acl
      where relation.oid = 'public.fine_rules'::regclass
        and (
          acl.grantee = 0
          or acl.grantee not in (
            relation.relowner,
            (select oid from pg_catalog.pg_roles where rolname = 'authenticated'),
            (select oid from pg_catalog.pg_roles where rolname = 'service_role')
          )
        )
    )
    and not pg_catalog.has_table_privilege('anon', 'public.fine_rules', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'DELETE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'TRUNCATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'REFERENCES')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'TRIGGER')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'INSERT')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'UPDATE')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'DELETE')
    and not pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'TRUNCATE')
    and not pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'REFERENCES')
    and not pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'TRIGGER');
  details := 'PUBLIC/anon=none; authenticated=SELECT only; service_role=CRUD; no other explicit grantee';
  return next;

  select pg_catalog.count(*)::integer into observed_count
  from public.fine_rules rule
  where rule.club_id = club_id_value;
  test_name := 'M_exactly_23_seed_rules';
  test_ok := observed_count = 23
    and (select pg_catalog.count(*) from public.fine_rules) = 23;
  details := pg_catalog.format('club=%s total=%s expected=23', observed_count, (select pg_catalog.count(*) from public.fine_rules));
  return next;

  for expected_rule in
    select *
    from (
      values
        ('TRAINING_LATE'::text, 2.00::numeric, 'fixed'::text, true, true, false, true, 1),
        ('MATCH_LATE', 3.00, 'fixed', true, true, false, true, 2),
        ('LOCKER_MATERIAL_FORGOTTEN', 2.00, 'fixed', true, true, false, true, 3),
        ('TRAINING_EARRINGS', 2.00, 'fixed', true, true, false, true, 4),
        ('PHONE_DURING_COACH_TALK', 2.00, 'fixed', true, true, false, true, 5),
        ('PHONE_AFTER_TRAINING_TALK', 2.00, 'fixed', true, true, false, true, 6),
        ('TRAINING_EXIT_DELAY_AFTER_TALK', null, 'unpriced', true, true, false, false, 7),
        ('PHONE_MATCH_AFTER_LINEUP', 2.00, 'fixed', true, true, false, true, 8),
        ('MATCH_WRONG_UNIFORM', 2.00, 'fixed', true, true, false, true, 9),
        ('LEAGUE_MATCH_NON_ATTENDANCE_INJURED', 2.00, 'fixed', true, false, false, true, 10),
        ('LEAVE_BENCH_WITHOUT_PERMISSION', 2.00, 'fixed', true, false, false, true, 11),
        ('MATCH_ABSENCE', 20.00, 'fixed', true, true, false, true, 12),
        ('LOCKER_BAD_STATE_IDENTIFIED', 2.00, 'fixed', true, true, false, true, 13),
        ('LOCKER_BAD_STATE_COLLECTIVE', 1.00, 'per_subject', true, false, true, true, 14),
        ('WEEKLY_MATERIAL_COLLECTIVE', 2.00, 'per_subject', true, false, true, true, 15),
        ('MANDATORY_GROUP_EVENT_ABSENCE', 2.00, 'fixed', true, true, false, true, 16),
        ('YOUTH_NAME_NOT_USED', 2.00, 'fixed', true, true, false, true, 17),
        ('YELLOW_PROTEST', 3.00, 'fixed', true, false, false, true, 18),
        ('FIFTH_YELLOW_PROTEST', 5.00, 'fixed', true, false, false, true, 19),
        ('RED_PROTEST', 20.00, 'fixed', true, false, false, true, 20),
        ('TRAINING_NOTICE_UNDER_2H', 2.00, 'fixed', true, false, false, true, 21),
        ('PF_SURVEY_MISSING', 2.00, 'fixed', true, false, false, true, 22),
        ('DISRESPECT_TEAMMATE_STAFF', 50.00, 'fixed', true, true, false, true, 23)
    ) as seed(
      code,
      default_amount,
      pricing_mode,
      applies_to_players,
      applies_to_staff,
      collective_allowed,
      active,
      sort_order
    )
  loop
    test_name := 'RULE_' || expected_rule.code;
    test_ok := exists (
      select 1
      from public.fine_rules rule
      where rule.club_id = club_id_value
        and rule.code = expected_rule.code
        and rule.default_amount is not distinct from expected_rule.default_amount
        and rule.pricing_mode = expected_rule.pricing_mode
        and rule.applies_to_players = expected_rule.applies_to_players
        and rule.applies_to_staff = expected_rule.applies_to_staff
        and rule.collective_allowed = expected_rule.collective_allowed
        and rule.active = expected_rule.active
        and rule.sort_order = expected_rule.sort_order
    );
    details := pg_catalog.format(
      'amount=%s mode=%s players=%s staff=%s collective=%s active=%s order=%s',
      coalesce(expected_rule.default_amount::text, 'NULL'),
      expected_rule.pricing_mode,
      expected_rule.applies_to_players,
      expected_rule.applies_to_staff,
      expected_rule.collective_allowed,
      expected_rule.active,
      expected_rule.sort_order
    );
    return next;
  end loop;

  test_name := 'N_catalog_mode_distribution';
  test_ok := (select pg_catalog.count(*) from public.fine_rules where pricing_mode = 'fixed') = 20
    and (select pg_catalog.count(*) from public.fine_rules where pricing_mode = 'per_subject') = 2
    and (select pg_catalog.count(*) from public.fine_rules where pricing_mode = 'unpriced') = 1
    and (select pg_catalog.count(*) from public.fine_rules where collective_allowed) = 2
    and (select pg_catalog.count(*) from public.fine_rules where not active) = 1;
  details := 'fixed=20 per_subject=2 unpriced=1 collective=2 inactive=1';
  return next;

  test_name := 'O_amount_contract_holds';
  select pg_catalog.count(*)::integer = 0 into test_ok
  from public.fine_rules rule
  where not (
    (
      rule.pricing_mode in ('fixed', 'per_subject')
      and rule.default_amount is not null
      and rule.default_amount > 0
      and rule.default_amount <> 'NaN'::numeric
    )
    or (rule.pricing_mode = 'unpriced' and rule.default_amount is null)
  );
  details := 'invalid pricing/amount rows=0';
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.fine_rules;
  execute 'reset role';
  test_name := 'P_staff_reads_23_own_club_rules';
  test_ok := staff_membership_id is not null and visible_count = 23;
  details := pg_catalog.format('visible=%s expected=23', visible_count);
  return next;

  test_name := 'Q_staff_cross_club_isolation';
  test_ok := false;
  details := null;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    insert into public.clubs (id, name)
    values (cross_club_id, 'BLOCK 4.2 CROSS CLUB TEST');
    insert into public.fine_rules (
      club_id, code, name, default_amount, pricing_mode,
      applies_to_players, applies_to_staff, collective_allowed, active, sort_order
    ) values (
      cross_club_id, 'VERIFY_CROSS_CLUB', 'Verificación cross-club', null, 'unpriced',
      true, false, false, false, 1
    );

    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer into visible_count
    from public.fine_rules rule
    where rule.club_id = cross_club_id;
    execute 'reset role';

    if visible_count <> 0 then
      raise exception 'STAFF pudo leer reglas cross-club';
    end if;
    raise sqlstate 'P4201' using message = 'ROLLBACK_CROSS_CLUB_TEST';
  exception
    when sqlstate 'P4201' then
      test_ok := true;
      details := 'cross-club visible=0; transient club/rule rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.fine_rules;
  execute 'reset role';
  test_name := 'R_player_direct_select_zero';
  test_ok := player_membership_id is not null and visible_count = 0;
  details := 'visible=' || visible_count;
  return next;

  test_name := 'S_player_with_transient_fines_manage_still_zero';
  test_ok := false;
  details := null;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    insert into public.club_member_permissions (membership_id, permission_key)
    values (player_membership_id, 'fines_manage');

    perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer into visible_count from public.fine_rules;
    execute 'reset role';

    if visible_count <> 0 then
      raise exception 'PLAYER con fines_manage pudo leer fine_rules directamente';
    end if;
    raise sqlstate 'P4202' using message = 'ROLLBACK_PLAYER_PERMISSION_TEST';
  exception
    when sqlstate 'P4202' then
      test_ok := true;
      details := 'visible=0; transient fines_manage rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  return next;

  test_name := 'T_viewer_direct_select_zero';
  test_ok := false;
  details := null;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    update public.club_memberships
    set role = 'viewer'
    where id = staff_membership_id;

    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer into visible_count from public.fine_rules;
    execute 'reset role';

    if visible_count <> 0 then
      raise exception 'VIEWER pudo leer fine_rules';
    end if;
    raise sqlstate 'P4203' using message = 'ROLLBACK_VIEWER_TEST';
  exception
    when sqlstate 'P4203' then
      test_ok := true;
      details := 'visible=0; transient role change rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.fine_rules;
  execute 'reset role';
  test_name := 'U_uid_without_membership_zero';
  test_ok := visible_count = 0;
  details := 'visible=' || visible_count;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  test_name := 'V_anon_select_denied';
  test_ok := false;
  details := null;
  begin
    select pg_catalog.count(*)::integer into visible_count from public.fine_rules;
    details := 'unexpected SELECT success; visible=' || visible_count;
  exception
    when insufficient_privilege then
      test_ok := true;
      details := 'SELECT denied with 42501';
    when others then
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  execute 'reset role';
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
  select pg_catalog.count(*)::integer into visible_count from public.fine_rules;
  execute 'reset role';
  test_name := 'W_service_role_reads_catalog';
  test_ok := visible_count = 23;
  details := pg_catalog.format('visible=%s expected=23', visible_count);
  return next;

  test_name := 'X_service_role_crud_reversible';
  test_ok := false;
  details := null;
  begin
    inserted_ok := false;
    updated_ok := false;
    deleted_ok := false;
    execute 'set local role service_role';
    insert into public.fine_rules (
      club_id, code, name, default_amount, pricing_mode,
      applies_to_players, applies_to_staff, collective_allowed, active, sort_order
    ) values (
      club_id_value, 'VERIFY_SERVICE_ROLE_CRUD', 'Verificación service_role', null, 'unpriced',
      true, false, false, false, 999
    );
    inserted_ok := found;
    update public.fine_rules
    set name = 'Verificación service_role actualizada'
    where club_id = club_id_value and code = 'VERIFY_SERVICE_ROLE_CRUD';
    updated_ok := found;
    delete from public.fine_rules
    where club_id = club_id_value and code = 'VERIFY_SERVICE_ROLE_CRUD';
    deleted_ok := found;
    execute 'reset role';

    if not (inserted_ok and updated_ok and deleted_ok) then
      raise exception 'CRUD service_role incompleto';
    end if;
    raise sqlstate 'P4204' using message = 'ROLLBACK_SERVICE_ROLE_CRUD_TEST';
  exception
    when sqlstate 'P4204' then
      test_ok := true;
      details := 'INSERT/UPDATE/DELETE succeeded; subtransaction rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  return next;

  test_name := 'Y_authenticated_writes_denied';
  insert_denied := false;
  update_denied := false;
  delete_denied := false;
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  begin
    insert into public.fine_rules (
      club_id, code, name, default_amount, pricing_mode,
      applies_to_players, applies_to_staff, collective_allowed, active, sort_order
    ) values (
      club_id_value, 'VERIFY_AUTH_WRITE', 'Verificación authenticated', null, 'unpriced',
      true, false, false, false, 998
    );
  exception when insufficient_privilege then
    insert_denied := true;
  end;
  begin
    update public.fine_rules set name = name where club_id = club_id_value;
  exception when insufficient_privilege then
    update_denied := true;
  end;
  begin
    delete from public.fine_rules where club_id = club_id_value and code = 'NEVER_EXISTS';
  exception when insufficient_privilege then
    delete_denied := true;
  end;
  execute 'reset role';
  test_ok := insert_denied and update_denied and delete_denied;
  details := pg_catalog.format(
    'INSERT denied=%s UPDATE denied=%s DELETE denied=%s',
    insert_denied, update_denied, delete_denied
  );
  return next;

  test_name := 'Z_no_real_fines_manage_assignment';
  select pg_catalog.count(*)::integer into observed_count
  from public.club_member_permissions permission
  where permission.permission_key = 'fines_manage';
  test_ok := observed_count = 0;
  details := 'persistent fines_manage rows=' || observed_count;
  return next;

  test_name := 'AA_no_downstream_financial_tables';
  test_ok := pg_catalog.to_regclass('public.fine_incidents') is null
    and pg_catalog.to_regclass('public.fines') is null
    and pg_catalog.to_regclass('public.fine_payments') is null;
  details := 'fine_incidents=NULL fines=NULL fine_payments=NULL';
  return next;

  test_name := 'AB_block_4_1_objects_remain';
  test_ok := pg_catalog.to_regclass('public.club_seasons') is not null
    and pg_catalog.to_regclass('public.fine_subjects') is not null
    and pg_catalog.to_regprocedure('public.can_manage_fines()') is not null;
  details := 'club_seasons, fine_subjects and can_manage_fines() still present';
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$verify$;

select test_name, test_ok, details
from pg_temp.verify_fine_rules();

rollback;
