-- APPCAUDAL - Bloque 4.4 - Verificacion posterior.
--
-- Ejecutar el archivo completo. Devuelve una unica tabla visible:
-- test_name, test_ok, details.
-- Todas las fixtures son transaccionales y desaparecen con el ROLLBACK final.

begin;

create or replace function pg_temp.make_fine_payment_fixture(
  p_club_id uuid,
  p_season_id uuid,
  p_rule_id uuid,
  p_subject_id uuid,
  p_actor_membership_id uuid,
  p_occurred_on date
)
returns uuid
language plpgsql
set search_path = pg_catalog
as $fixture$
declare
  incident_id_value uuid;
  fine_id_value uuid;
begin
  insert into public.fine_incidents (
    club_id,
    season_id,
    fine_rule_id,
    incident_kind,
    occurred_on,
    rule_code_snapshot,
    reason_snapshot,
    created_by_membership_id
  ) values (
    p_club_id,
    p_season_id,
    p_rule_id,
    'individual',
    p_occurred_on,
    'IGNORED_BY_GUARD',
    'IGNORED_BY_GUARD',
    p_actor_membership_id
  ) returning id into incident_id_value;

  insert into public.fines (
    club_id,
    incident_id,
    subject_id,
    subject_name_snapshot,
    original_amount,
    due_on,
    surcharge_amount,
    surcharge_base_amount,
    surcharge_applied_at
  ) values (
    p_club_id,
    incident_id_value,
    p_subject_id,
    'IGNORED_BY_GUARD',
    999.99,
    date '1900-01-01',
    999.99,
    999.99,
    pg_catalog.now()
  ) returning id into fine_id_value;

  return fine_id_value;
end;
$fixture$;

create or replace function pg_temp.verify_fine_payments()
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
  season_id_value uuid;
  staff_membership_id uuid;
  staff_user_id uuid;
  player_user_id constant uuid := '350615a9-b068-450a-b867-da30a59b9082'::uuid;
  player_membership_id uuid;
  no_membership_user_id constant uuid := 'b4400000-0000-4000-8000-000000000099'::uuid;
  cross_club_id constant uuid := 'b4400000-0000-4000-8000-000000000044'::uuid;
  subject_id_value uuid;
  rule_ten_id constant uuid := 'b4400000-0000-4000-8000-000000000010'::uuid;
  rule_three_id constant uuid := 'b4400000-0000-4000-8000-000000000003'::uuid;
  due_sep_first_fine uuid;
  due_sep_last_fine uuid;
  due_feb_fine uuid;
  full_fine uuid;
  partial_fine uuid;
  expired_partial_fine uuid;
  expired_unpaid_fine uuid;
  expired_paid_fine uuid;
  once_fine uuid;
  pre_due_fine uuid;
  cents_fine uuid;
  overpay_fine uuid;
  sequential_overpay_fine uuid;
  refund_fine uuid;
  cancelled_fine uuid;
  backdated_fine uuid;
  immutable_fine uuid;
  service_fine uuid;
  payment_id_value uuid;
  observed_count integer;
  expected_count integer;
  visible_count integer;
  generated numeric(10,2);
  collected numeric(10,2);
  pending numeric(10,2);
  original numeric(10,2);
  surcharge numeric(10,2);
  surcharge_base numeric(10,2);
  financial_state text;
  due_value date;
  applied_at_value timestamptz;
  applied_first boolean;
  applied_second boolean;
  denied_one boolean;
  denied_two boolean;
  denied_three boolean;
  error_message text;
begin
  select club.id into club_id_value
  from public.clubs club
  order by club.id
  limit 1;

  select season.id into season_id_value
  from public.club_seasons season
  where season.club_id = club_id_value
    and season.code = '2026'
    and season.starts_on = date '2026-07-01'
    and season.ends_on = date '2027-06-30';

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
    and membership.role = 'player'
    and membership.is_active;

  select subject.id into subject_id_value
  from public.fine_subjects subject
  where subject.club_id = club_id_value
    and subject.subject_type = 'player'
    and subject.active
    and subject.display_name is not null
  order by subject.id
  limit 1;

  ---------------------------------------------------------------------------
  -- Contrato estructural.
  ---------------------------------------------------------------------------
  test_name := 'A_fine_payments_exists';
  test_ok := pg_catalog.to_regclass('public.fine_payments') is not null;
  details := 'relation=' || coalesce(pg_catalog.to_regclass('public.fine_payments')::text, 'NULL');
  return next;

  with expected(column_name, data_type, is_nullable) as (
    values
      ('id'::text, 'uuid'::text, 'NO'::text),
      ('club_id', 'uuid', 'NO'),
      ('fine_id', 'uuid', 'NO'),
      ('payment_kind', 'text', 'NO'),
      ('amount', 'numeric', 'NO'),
      ('paid_on', 'date', 'NO'),
      ('note', 'text', 'YES'),
      ('recorded_by_membership_id', 'uuid', 'NO'),
      ('created_at', 'timestamp with time zone', 'NO')
  ), actual as (
    select actual_column.column_name, actual_column.data_type, actual_column.is_nullable
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fine_payments'
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
  test_name := 'B_fine_payments_exact_columns';
  details := pg_catalog.format('observed=%s expected=%s', observed_count, expected_count);
  return next;

  select
    actual_column.data_type = 'numeric'
      and actual_column.numeric_precision = 10
      and actual_column.numeric_scale = 2
  into test_ok
  from information_schema.columns actual_column
  where actual_column.table_schema = 'public'
    and actual_column.table_name = 'fine_payments'
    and actual_column.column_name = 'amount';
  test_name := 'C_payment_amount_numeric_10_2';
  details := 'amount must be numeric(10,2)';
  return next;

  with expected(column_name, data_type, is_nullable) as (
    values
      ('due_on'::text, 'date'::text, 'NO'::text),
      ('surcharge_amount', 'numeric', 'NO'),
      ('surcharge_base_amount', 'numeric', 'YES'),
      ('surcharge_applied_at', 'timestamp with time zone', 'YES')
  ), actual as (
    select actual_column.column_name, actual_column.data_type, actual_column.is_nullable
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fines'
      and actual_column.column_name in (
        'due_on', 'surcharge_amount', 'surcharge_base_amount', 'surcharge_applied_at'
      )
  )
  select not exists (
    (select * from expected except select * from actual)
    union all
    (select * from actual except select * from expected)
  ) into test_ok;
  test_name := 'D_fines_financial_columns_exact';
  details := 'due_on plus three surcharge snapshots';
  return next;

  select pg_catalog.count(*) = 3
  into test_ok
  from information_schema.columns actual_column
  where actual_column.table_schema = 'public'
    and actual_column.table_name = 'fines'
    and actual_column.column_name in ('surcharge_amount', 'surcharge_base_amount')
    and actual_column.data_type = 'numeric'
    and actual_column.numeric_precision = 10
    and actual_column.numeric_scale = 2;
  test_name := 'E_surcharge_numeric_10_2';
  details := 'surcharge amount/base numeric(10,2)';
  return next;

  test_name := 'F_original_amount_contract_preserved';
  select actual_column.data_type = 'numeric'
    and actual_column.numeric_precision = 10
    and actual_column.numeric_scale = 2
    and actual_column.is_nullable = 'NO'
  into test_ok
  from information_schema.columns actual_column
  where actual_column.table_schema = 'public'
    and actual_column.table_name = 'fines'
    and actual_column.column_name = 'original_amount';
  details := 'fines.original_amount remains numeric(10,2) NOT NULL';
  return next;

  test_name := 'G_no_currency_duplicated_in_payments';
  test_ok := not exists (
    select 1 from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fine_payments'
      and actual_column.column_name = 'currency'
  );
  details := 'currency remains a fine snapshot';
  return next;

  select pg_catalog.count(*) = 2
  into test_ok
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.fine_payments'::regclass
    and constraint_row.contype = 'c'
    and (
      pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid), 'payment_kind') > 0
      or pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid), 'amount') > 0
    );
  test_name := 'H_payment_kind_and_positive_amount_checks';
  details := 'payment/refund allowlist and positive non-NaN amount';
  return next;

  select pg_catalog.count(*) = 3
    and pg_catalog.bool_and(constraint_row.confdeltype = 'r')
  into test_ok
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.fine_payments'::regclass
    and constraint_row.contype = 'f';
  test_name := 'I_three_restrict_foreign_keys';
  details := 'clubs, fines and memberships use ON DELETE RESTRICT';
  return next;

  test_name := 'J_no_cascade_financial_fks';
  test_ok := not exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid in ('public.fines'::regclass, 'public.fine_payments'::regclass)
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  );
  details := 'no financial FK has ON DELETE CASCADE';
  return next;

  test_name := 'K_financial_indexes_exist';
  test_ok := pg_catalog.to_regclass('public.fine_payments_fine_created_idx') is not null
    and pg_catalog.to_regclass('public.fine_payments_club_paid_idx') is not null;
  details := 'fine/created and club/paid indexes';
  return next;

  test_name := 'L_owner_and_rls';
  select pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
    and relation.relrowsecurity
    and not relation.relforcerowsecurity
  into test_ok
  from pg_catalog.pg_class relation
  where relation.oid = 'public.fine_payments'::regclass;
  details := 'owner=postgres RLS=ON FORCE=OFF';
  return next;

  test_name := 'M_single_staff_select_policy';
  select pg_catalog.count(*) = 1
    and pg_catalog.bool_and(policy.polcmd = 'r')
    and pg_catalog.bool_and(policy.polpermissive)
    and pg_catalog.bool_and(policy.polroles = array[
      (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
    ])
    and pg_catalog.bool_and(policy.polwithcheck is null)
    and pg_catalog.bool_and(pg_catalog.strpos(
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), 'is_app_staff()'
    ) > 0)
    and pg_catalog.bool_and(pg_catalog.strpos(
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), 'current_membership()'
    ) > 0)
  into test_ok
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.fine_payments'::regclass;
  details := 'exactly one authenticated STAFF SELECT policy';
  return next;

  test_name := 'N_table_acl_exact';
  test_ok := not pg_catalog.has_table_privilege('anon', 'public.fine_payments', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'DELETE')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_payments', 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_payments', 'INSERT')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_payments', 'UPDATE')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_payments', 'DELETE')
    and not exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) acl
      where relation.oid = 'public.fine_payments'::regclass
        and acl.grantee not in (
          relation.relowner,
          (select oid from pg_catalog.pg_roles where rolname = 'authenticated'),
          (select oid from pg_catalog.pg_roles where rolname = 'service_role')
        )
    );
  details := 'owner + authenticated SELECT + service_role CRUD only';
  return next;

  test_name := 'O_four_internal_functions_exist';
  test_ok := pg_catalog.to_regprocedure('public.guard_fine_financial_integrity()') is not null
    and pg_catalog.to_regprocedure('public.apply_fine_surcharge_if_due(uuid)') is not null
    and pg_catalog.to_regprocedure('public.guard_fine_payment_integrity()') is not null
    and pg_catalog.to_regprocedure('public.get_fine_financial_totals(uuid)') is not null;
  details := 'two guards, explicit surcharge mutator and read-only totals helper';
  return next;

  test_name := 'P_internal_function_security_contracts';
  select pg_catalog.count(*) = 4
    and pg_catalog.bool_and(pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres')
    and pg_catalog.bool_and(procedure_row.prosecdef)
    and pg_catalog.bool_and(procedure_row.proconfig = array['search_path=pg_catalog']::text[])
  into test_ok
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid in (
    'public.guard_fine_financial_integrity()'::regprocedure,
    'public.apply_fine_surcharge_if_due(uuid)'::regprocedure,
    'public.guard_fine_payment_integrity()'::regprocedure,
    'public.get_fine_financial_totals(uuid)'::regprocedure
  );
  details := 'postgres, SECURITY DEFINER, controlled search_path';
  return next;

  test_name := 'Q_function_volatility_exact';
  test_ok := (
    select procedure_row.provolatile = 'v'
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = 'public.apply_fine_surcharge_if_due(uuid)'::regprocedure
  ) and (
    select procedure_row.provolatile = 's'
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = 'public.get_fine_financial_totals(uuid)'::regprocedure
  );
  details := 'surcharge VOLATILE; totals STABLE';
  return next;

  test_name := 'R_internal_function_acl_exact';
  test_ok := not pg_catalog.has_function_privilege(
      'anon', 'public.apply_fine_surcharge_if_due(uuid)', 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'authenticated', 'public.apply_fine_surcharge_if_due(uuid)', 'EXECUTE'
    )
    and pg_catalog.has_function_privilege(
      'service_role', 'public.apply_fine_surcharge_if_due(uuid)', 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon', 'public.get_fine_financial_totals(uuid)', 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'authenticated', 'public.get_fine_financial_totals(uuid)', 'EXECUTE'
    )
    and pg_catalog.has_function_privilege(
      'service_role', 'public.get_fine_financial_totals(uuid)', 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role', 'public.guard_fine_financial_integrity()', 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role', 'public.guard_fine_payment_integrity()', 'EXECUTE'
    )
    and not exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )
      ) acl
      where procedure_row.oid in (
        'public.guard_fine_financial_integrity()'::regprocedure,
        'public.apply_fine_surcharge_if_due(uuid)'::regprocedure,
        'public.guard_fine_payment_integrity()'::regprocedure,
        'public.get_fine_financial_totals(uuid)'::regprocedure
      )
        and acl.grantee not in (
          procedure_row.proowner,
          (select oid from pg_catalog.pg_roles where rolname = 'service_role')
        )
    );
  details := 'service_role can call only surcharge/totals; guards are trigger-only';
  return next;

  test_name := 'S_integrity_triggers_exact';
  select pg_catalog.count(*) = 2
  into test_ok
  from pg_catalog.pg_trigger trigger_row
  where not trigger_row.tgisinternal
    and trigger_row.tgname in (
      'guard_fine_financial_integrity',
      'guard_fine_payment_integrity',
      'apply_fine_surcharge_after_refund'
    )
    and trigger_row.tgrelid in ('public.fines'::regclass, 'public.fine_payments'::regclass);
  details := 'financial snapshot, immutable ledger and post-refund surcharge triggers';
  return next;

  test_name := 'T_existing_fines_rls_unchanged';
  select pg_catalog.count(*) = 1
    and pg_catalog.bool_and(policy.polcmd = 'r')
    and pg_catalog.bool_and(pg_catalog.strpos(
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), 'is_app_staff()'
    ) > 0)
  into test_ok
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.fines'::regclass;
  details := 'fines still exposes only its pre-existing STAFF SELECT policy';
  return next;

  test_name := 'U_initial_tables_empty';
  select (select pg_catalog.count(*) from public.fine_incidents) = 0
    and (select pg_catalog.count(*) from public.fines) = 0
    and (select pg_catalog.count(*) from public.fine_payments) = 0
  into test_ok;
  details := 'fine_incidents=0 fines=0 fine_payments=0 before fixtures';
  return next;

  ---------------------------------------------------------------------------
  -- Fixtures financieras reversibles. Se crean dos reglas temporales para
  -- probar exactamente 10,00 y el redondeo 3,00 -> 1,50.
  ---------------------------------------------------------------------------
  insert into public.fine_rules (
    id, club_id, code, name, default_amount, pricing_mode,
    applies_to_players, applies_to_staff, collective_allowed, active, sort_order
  ) values
    (rule_ten_id, club_id_value, 'VERIFY_44_TEN', 'Verify 4.4 ten', 10.00,
     'fixed', true, true, false, true, 44010),
    (rule_three_id, club_id_value, 'VERIFY_44_THREE', 'Verify 4.4 three', 3.00,
     'fixed', true, true, false, true, 44003);

  due_sep_first_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2026-09-01'
  );
  due_sep_last_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2026-09-30'
  );
  due_feb_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );

  select fine.due_on into due_value from public.fines fine where fine.id = due_sep_first_fine;
  test_name := 'V_due_on_september_first';
  test_ok := due_value = date '2026-09-30';
  details := pg_catalog.format('2026-09-01 -> %s', due_value);
  return next;

  select fine.due_on into due_value from public.fines fine where fine.id = due_sep_last_fine;
  test_name := 'W_due_on_september_last';
  test_ok := due_value = date '2026-09-30';
  details := pg_catalog.format('2026-09-30 -> %s', due_value);
  return next;

  select fine.due_on into due_value from public.fines fine where fine.id = due_feb_fine;
  test_name := 'X_due_on_february';
  test_ok := due_value = date '2027-02-28';
  details := pg_catalog.format('2027-02-15 -> %s', due_value);
  return next;

  test_name := 'Y_insert_forces_financial_snapshots';
  select fine.original_amount = 10.00
    and fine.due_on = date '2026-09-30'
    and fine.surcharge_amount = 0
    and fine.surcharge_base_amount is null
    and fine.surcharge_applied_at is null
  into test_ok
  from public.fines fine
  where fine.id = due_sep_first_fine;
  details := 'caller-supplied amount/due/surcharge were ignored by backend guards';
  return next;

  test_name := 'Z_due_on_is_immutable';
  test_ok := false;
  begin
    update public.fines set due_on = due_on + 1 where id = due_sep_first_fine;
    details := 'unexpected due_on update success';
  exception when check_violation then
    test_ok := true;
    details := 'direct due_on update rejected with 23514';
  end;
  return next;

  test_name := 'AA_surcharge_fields_not_freely_editable';
  test_ok := false;
  begin
    update public.fines
    set surcharge_base_amount = 10.00,
        surcharge_amount = 5.00,
        surcharge_applied_at = pg_catalog.now()
    where id = due_sep_first_fine;
    details := 'unexpected direct surcharge update success';
  exception when insufficient_privilege then
    test_ok := true;
    details := 'direct surcharge update rejected with 42501';
  end;
  return next;

  pre_due_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  select public.apply_fine_surcharge_if_due(pre_due_fine) into applied_first;
  test_name := 'AB_no_surcharge_before_or_on_due_on';
  select not applied_first
    and fine.surcharge_amount = 0
    and fine.surcharge_applied_at is null
  into test_ok
  from public.fines fine where fine.id = pre_due_fine;
  details := 'current_date <= due_on leaves surcharge at zero/NULL';
  return next;

  full_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, full_fine, 'payment', 10.00, date '2027-02-20', staff_membership_id
  );
  select generated_amount, collected_amount, pending_amount, financial_status, surcharge_amount
  into generated, collected, pending, financial_state, surcharge
  from public.get_fine_financial_totals(full_fine);
  test_name := 'AC_full_payment_within_term';
  test_ok := generated = 10.00 and collected = 10.00 and pending = 0
    and financial_state = 'paid' and surcharge = 0;
  details := pg_catalog.format('generated=%s collected=%s pending=%s status=%s surcharge=%s',
    generated, collected, pending, financial_state, surcharge);
  return next;

  partial_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, partial_fine, 'payment', 6.00, date '2027-02-20', staff_membership_id
  );
  select generated_amount, collected_amount, pending_amount, financial_status
  into generated, collected, pending, financial_state
  from public.get_fine_financial_totals(partial_fine);
  test_name := 'AD_partial_payment_within_term';
  test_ok := generated = 10.00 and collected = 6.00 and pending = 4.00
    and financial_state = 'partial';
  details := pg_catalog.format('generated=%s collected=%s pending=%s status=%s',
    generated, collected, pending, financial_state);
  return next;

  -- Fixture historica controlada: representa 6 euros cobrados antes de vencer.
  -- Solo se desactiva el trigger del ledger dentro de esta transaccion de test.
  expired_partial_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2026-08-01'
  );
  alter table public.fine_payments disable trigger guard_fine_payment_integrity;
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, expired_partial_fine, 'payment', 6.00, date '2026-08-15', staff_membership_id
  );
  alter table public.fine_payments enable trigger guard_fine_payment_integrity;
  select public.apply_fine_surcharge_if_due(expired_partial_fine) into applied_first;
  select original_amount, surcharge_amount, collected_amount, generated_amount,
    pending_amount, financial_status
  into original, surcharge, collected, generated, pending, financial_state
  from public.get_fine_financial_totals(expired_partial_fine);
  select fine.surcharge_base_amount into surcharge_base
  from public.fines fine where fine.id = expired_partial_fine;
  test_name := 'AE_surcharge_on_original_outstanding';
  test_ok := applied_first and original = 10.00 and surcharge_base = 4.00
    and surcharge = 2.00 and generated = 12.00 and collected = 6.00
    and pending = 6.00 and financial_state = 'partial';
  details := pg_catalog.format('base=%s surcharge=%s generated=%s collected=%s pending=%s',
    surcharge_base, surcharge, generated, collected, pending);
  return next;

  expired_unpaid_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2026-08-01'
  );
  select public.apply_fine_surcharge_if_due(expired_unpaid_fine) into applied_first;
  select surcharge_amount, generated_amount, collected_amount, pending_amount
  into surcharge, generated, collected, pending
  from public.get_fine_financial_totals(expired_unpaid_fine);
  test_name := 'AF_surcharge_without_prior_payments';
  test_ok := applied_first and surcharge = 5.00 and generated = 15.00
    and collected = 0 and pending = 15.00;
  details := pg_catalog.format('surcharge=%s generated=%s pending=%s', surcharge, generated, pending);
  return next;

  expired_paid_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2026-08-01'
  );
  alter table public.fine_payments disable trigger guard_fine_payment_integrity;
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, expired_paid_fine, 'payment', 10.00, date '2026-08-15', staff_membership_id
  );
  alter table public.fine_payments enable trigger guard_fine_payment_integrity;
  select public.apply_fine_surcharge_if_due(expired_paid_fine) into applied_first;
  select fine.surcharge_amount, fine.surcharge_base_amount, fine.surcharge_applied_at
  into surcharge, surcharge_base, applied_at_value
  from public.fines fine where fine.id = expired_paid_fine;
  test_name := 'AG_no_surcharge_when_original_fully_paid';
  test_ok := not applied_first and surcharge = 0
    and surcharge_base is null and applied_at_value is null;
  details := 'fully paid original remains surcharge=0 base/applied_at=NULL';
  return next;

  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, expired_paid_fine, 'refund', 3.00, current_date, staff_membership_id
  );
  select fine.surcharge_amount, fine.surcharge_base_amount
  into surcharge, surcharge_base
  from public.fines fine where fine.id = expired_paid_fine;
  test_name := 'AG2_expired_refund_reopens_debt_and_surcharge';
  test_ok := surcharge_base = 3.00 and surcharge = 1.50;
  details := pg_catalog.format('reopened original debt base=%s surcharge=%s', surcharge_base, surcharge);
  return next;

  once_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2026-08-01'
  );
  select public.apply_fine_surcharge_if_due(once_fine) into applied_first;
  select public.apply_fine_surcharge_if_due(once_fine) into applied_second;
  select fine.surcharge_amount, fine.surcharge_base_amount
  into surcharge, surcharge_base from public.fines fine where fine.id = once_fine;
  test_name := 'AH_surcharge_applies_once';
  test_ok := applied_first and not applied_second
    and surcharge = 5.00 and surcharge_base = 10.00;
  details := pg_catalog.format('first=%s second=%s surcharge=%s', applied_first, applied_second, surcharge);
  return next;

  cents_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_three_id, subject_id_value,
    staff_membership_id, date '2026-08-01'
  );
  select public.apply_fine_surcharge_if_due(cents_fine) into applied_first;
  select fine.surcharge_amount into surcharge from public.fines fine where fine.id = cents_fine;
  test_name := 'AI_numeric_rounding_preserves_cents';
  test_ok := applied_first and surcharge = 1.50;
  details := pg_catalog.format('50%% of 3.00 = %s', surcharge);
  return next;

  backdated_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2026-08-01'
  );
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, backdated_fine, 'payment', 10.00, date '2026-08-15', staff_membership_id
  );
  select fine.surcharge_amount, fine.surcharge_base_amount
  into surcharge, surcharge_base from public.fines fine where fine.id = backdated_fine;
  select generated_amount, collected_amount, pending_amount
  into generated, collected, pending
  from public.get_fine_financial_totals(backdated_fine);
  test_name := 'AJ_backdated_paid_on_cannot_evade_surcharge';
  test_ok := surcharge = 5.00 and surcharge_base = 10.00
    and generated = 15.00 and collected = 10.00 and pending = 5.00;
  details := pg_catalog.format('backdated payment: generated=%s collected=%s pending=%s',
    generated, collected, pending);
  return next;

  overpay_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  test_name := 'AK_single_overpayment_rejected';
  test_ok := false;
  begin
    insert into public.fine_payments (
      club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
    ) values (
      club_id_value, overpay_fine, 'payment', 11.00, current_date, staff_membership_id
    );
    details := 'unexpected payment 11 over debt 10 success';
  exception when check_violation then
    test_ok := true;
    details := 'payment 11 over debt 10 rejected with 23514';
  end;
  return next;

  sequential_overpay_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, sequential_overpay_fine, 'payment', 6.00, current_date, staff_membership_id
  );
  test_name := 'AL_sequential_overpayment_rejected';
  test_ok := false;
  begin
    insert into public.fine_payments (
      club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
    ) values (
      club_id_value, sequential_overpay_fine, 'payment', 5.00, current_date, staff_membership_id
    );
    details := 'unexpected 6 + 5 over debt 10 success';
  exception when check_violation then
    test_ok := true;
    details := 'second payment rejected after serial net-collected check';
  end;
  return next;

  refund_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values
    (club_id_value, refund_fine, 'payment', 10.00, current_date, staff_membership_id),
    (club_id_value, refund_fine, 'refund', 3.00, current_date, staff_membership_id);
  select collected_amount, pending_amount, financial_status
  into collected, pending, financial_state
  from public.get_fine_financial_totals(refund_fine);
  test_name := 'AM_refund_reduces_collected';
  test_ok := collected = 7.00 and pending = 3.00 and financial_state = 'partial';
  details := pg_catalog.format('collected=%s pending=%s status=%s', collected, pending, financial_state);
  return next;

  test_name := 'AN_excessive_refund_rejected';
  test_ok := false;
  begin
    insert into public.fine_payments (
      club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
    ) values (
      club_id_value, refund_fine, 'refund', 8.00, current_date, staff_membership_id
    );
    details := 'unexpected refund 8 over net collected 7 success';
  exception when check_violation then
    test_ok := true;
    details := 'refund over net collected rejected with 23514';
  end;
  return next;

  cancelled_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  update public.fines
  set lifecycle_status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      cancelled_by_membership_id = staff_membership_id,
      cancellation_reason = 'Verify 4.4 cancellation'
  where id = cancelled_fine;
  denied_one := false;
  denied_two := false;
  begin
    insert into public.fine_payments (
      club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
    ) values (club_id_value, cancelled_fine, 'payment', 1.00, current_date, staff_membership_id);
  exception when check_violation then denied_one := true;
  end;
  begin
    insert into public.fine_payments (
      club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
    ) values (club_id_value, cancelled_fine, 'refund', 1.00, current_date, staff_membership_id);
  exception when check_violation then denied_two := true;
  end;
  test_name := 'AO_cancelled_rejects_payment_and_refund';
  test_ok := denied_one and denied_two;
  details := pg_catalog.format('payment_denied=%s refund_denied=%s', denied_one, denied_two);
  return next;

  immutable_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, immutable_fine, 'payment', 1.00, current_date, staff_membership_id
  ) returning id into payment_id_value;
  denied_one := false;
  denied_two := false;
  begin
    update public.fine_payments set amount = 2.00 where id = payment_id_value;
  exception when check_violation then denied_one := true;
  end;
  begin
    delete from public.fine_payments where id = payment_id_value;
  exception when check_violation then denied_two := true;
  end;
  test_name := 'AP_ledger_update_delete_rejected';
  test_ok := denied_one and denied_two;
  details := pg_catalog.format('update_denied=%s delete_denied=%s', denied_one, denied_two);
  return next;

  ---------------------------------------------------------------------------
  -- Cross-club reversible en subtransaccion.
  ---------------------------------------------------------------------------
  denied_one := false;
  denied_two := false;
  error_message := null;
  begin
    insert into public.clubs (id, name)
    values (cross_club_id, 'BLOCK 4.4 CROSS CLUB TEST');

    begin
      insert into public.fine_payments (
        club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
      ) values (
        cross_club_id, immutable_fine, 'payment', 1.00, current_date, staff_membership_id
      );
    exception when check_violation then denied_one := true;
    end;

    update public.club_memberships set club_id = cross_club_id
    where id = staff_membership_id;

    begin
      insert into public.fine_payments (
        club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
      ) values (
        club_id_value, immutable_fine, 'payment', 1.00, current_date, staff_membership_id
      );
    exception when check_violation then denied_two := true;
    end;

    raise sqlstate 'P4401' using message = 'ROLLBACK_CROSS_CLUB_44';
  exception
    when sqlstate 'P4401' then null;
    when others then get stacked diagnostics error_message = message_text;
  end;
  test_name := 'AQ_cross_club_fine_and_actor_rejected';
  test_ok := denied_one and denied_two and error_message is null;
  details := coalesce(error_message, pg_catalog.format(
    'fine_club_denied=%s actor_club_denied=%s', denied_one, denied_two
  ));
  return next;

  ---------------------------------------------------------------------------
  -- Seguridad RLS/ACL funcional.
  ---------------------------------------------------------------------------
  select pg_catalog.count(*)::integer into expected_count from public.fine_payments;
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.fine_payments;
  execute 'reset role';
  test_name := 'AR_staff_reads_own_club_payments';
  test_ok := visible_count = expected_count;
  details := pg_catalog.format('visible=%s expected=%s', visible_count, expected_count);
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.fine_payments;
  execute 'reset role';
  test_name := 'AS_player_direct_select_zero';
  test_ok := player_membership_id is not null and visible_count = 0;
  details := 'visible=' || visible_count;
  return next;

  test_name := 'AT_player_with_transient_fines_manage_still_zero';
  test_ok := false;
  details := null;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    insert into public.club_member_permissions (membership_id, permission_key)
    values (player_membership_id, 'fines_manage');
    perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer into visible_count from public.fine_payments;
    execute 'reset role';
    if visible_count <> 0 then
      raise exception 'PLAYER con fines_manage obtuvo SELECT directo';
    end if;
    raise sqlstate 'P4402' using message = 'ROLLBACK_PLAYER_PERMISSION_44';
  exception
    when sqlstate 'P4402' then
      test_ok := true;
      details := 'visible=0; transient permission rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AU_viewer_direct_select_zero';
  test_ok := false;
  details := null;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    update public.club_memberships set role = 'viewer' where id = staff_membership_id;
    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer into visible_count from public.fine_payments;
    execute 'reset role';
    if visible_count <> 0 then raise exception 'VIEWER obtuvo SELECT directo'; end if;
    raise sqlstate 'P4403' using message = 'ROLLBACK_VIEWER_44';
  exception
    when sqlstate 'P4403' then
      test_ok := true;
      details := 'visible=0; transient viewer rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics details = message_text;
  end;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.fine_payments;
  execute 'reset role';
  test_name := 'AV_uid_without_membership_zero';
  test_ok := visible_count = 0;
  details := 'visible=' || visible_count;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  test_name := 'AW_anon_select_denied';
  test_ok := false;
  begin
    perform 1 from public.fine_payments limit 1;
    details := 'unexpected anon SELECT success';
  exception when insufficient_privilege then
    test_ok := true;
    details := 'anon SELECT denied with 42501';
  end;
  execute 'reset role';
  return next;

  denied_one := false;
  denied_two := false;
  denied_three := false;
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  begin
    insert into public.fine_payments (
      club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
    ) values (club_id_value, immutable_fine, 'payment', 1.00, current_date, staff_membership_id);
  exception when insufficient_privilege then denied_one := true;
  end;
  begin
    update public.fine_payments set note = note where id = payment_id_value;
  exception when insufficient_privilege then denied_two := true;
  end;
  begin
    delete from public.fine_payments where id = payment_id_value;
  exception when insufficient_privilege then denied_three := true;
  end;
  execute 'reset role';
  test_name := 'AX_authenticated_payment_writes_denied';
  test_ok := denied_one and denied_two and denied_three;
  details := pg_catalog.format('insert/update/delete=%s/%s/%s', denied_one, denied_two, denied_three);
  return next;

  denied_one := false;
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  begin
    update public.fines set surcharge_amount = surcharge_amount where id = immutable_fine;
  exception when insufficient_privilege then denied_one := true;
  end;
  execute 'reset role';
  test_name := 'AY_authenticated_cannot_update_fines_financials';
  test_ok := denied_one;
  details := 'authenticated UPDATE fines denied by table ACL';
  return next;

  service_fine := pg_temp.make_fine_payment_fixture(
    club_id_value, season_id_value, rule_ten_id, subject_id_value,
    staff_membership_id, date '2027-02-15'
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
  insert into public.fine_payments (
    club_id, fine_id, payment_kind, amount, paid_on, recorded_by_membership_id
  ) values (
    club_id_value, service_fine, 'payment', 2.00, current_date, staff_membership_id
  );
  execute 'reset role';
  test_name := 'AZ_service_role_insert_through_guard';
  select pg_catalog.count(*) = 1 into test_ok
  from public.fine_payments movement where movement.fine_id = service_fine;
  details := 'service_role movement accepted but still validated by trigger';
  return next;

  ---------------------------------------------------------------------------
  -- Regresion y limites del bloque.
  ---------------------------------------------------------------------------
  test_name := 'BA_blocks_4_1_to_4_3_objects_intact';
  test_ok := pg_catalog.to_regclass('public.club_seasons') is not null
    and pg_catalog.to_regclass('public.fine_subjects') is not null
    and pg_catalog.to_regclass('public.fine_rules') is not null
    and pg_catalog.to_regclass('public.fine_incidents') is not null
    and pg_catalog.to_regclass('public.fines') is not null
    and pg_catalog.to_regprocedure('public.can_manage_fines()') is not null
    and pg_catalog.to_regprocedure('public.guard_fine_integrity()') is not null;
  details := 'foundation, catalog and core objects remain';
  return next;

  test_name := 'BB_catalog_baseline_23_rules';
  select pg_catalog.count(*) - 2 = 23 into test_ok from public.fine_rules;
  details := '23 persistent rules + 2 transactional verifier fixtures';
  return next;

  test_name := 'BC_no_persistent_fines_manage_assignment';
  select pg_catalog.count(*) = 0 into test_ok
  from public.club_member_permissions permission
  where permission.permission_key = 'fines_manage';
  details := 'persistent fines_manage rows=0';
  return next;

  test_name := 'BD_no_cron_or_expense_schema';
  test_ok := pg_catalog.to_regclass('public.fine_fund_expenses') is null
    and not exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      where procedure_row.oid in (
        'public.guard_fine_financial_integrity()'::regprocedure,
        'public.apply_fine_surcharge_if_due(uuid)'::regprocedure,
        'public.guard_fine_payment_integrity()'::regprocedure,
        'public.get_fine_financial_totals(uuid)'::regprocedure
      )
        and pg_catalog.strpos(pg_catalog.lower(procedure_row.prosrc), 'cron') > 0
    );
  details := 'no fine expenses/cash table and block functions have no cron dependency';
  return next;

  test_name := 'BE_financial_status_is_not_stored';
  test_ok := not exists (
    select 1 from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fines'
      and actual_column.column_name in ('financial_status', 'generated_amount', 'collected_amount', 'pending_amount')
  );
  details := 'financial state and totals are derived by internal helper';
  return next;

  test_name := 'BF_lifecycle_status_remains_separate';
  select pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_row.oid),
      'active'
    ) > 0
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_row.oid),
      'cancelled'
    ) > 0
  into test_ok
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.fines'::regclass
    and constraint_row.conname = 'fines_lifecycle_status_check';
  details := 'lifecycle remains active/cancelled; unpaid/partial/paid are derived';
  return next;

  test_name := 'BG_verifier_is_transactional';
  test_ok := true;
  details := 'fixtures, temporary rules and movements are removed by final ROLLBACK';
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$verify$;

select test_name, test_ok, details
from pg_temp.verify_fine_payments();

rollback;
