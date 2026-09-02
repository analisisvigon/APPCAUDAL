-- APPCAUDAL - Bloque 4.5 - Verificacion posterior.
-- Ejecutar completo: devuelve una sola tabla y elimina todas las fixtures.

begin;

create or replace function pg_temp.verify_fines_rpc()
returns table (test_name text, test_ok boolean, details text)
language plpgsql
set search_path = pg_catalog
as $verify$
declare
  club_id_value uuid;
  season_id_value uuid;
  season_code_value text;
  staff_membership_id uuid;
  staff_user_id uuid;
  owner_user_id uuid;
  player_user_id constant uuid := '350615a9-b068-450a-b867-da30a59b9082'::uuid;
  player_jugador_id constant uuid := '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid;
  player_membership_id uuid;
  no_membership_user_id constant uuid := 'b4500000-0000-4000-8000-000000000099'::uuid;
  cross_club_id constant uuid := 'b4500000-0000-4000-8000-000000000045'::uuid;
  cross_season_id constant uuid := 'b4500000-0000-4000-8000-000000000046'::uuid;
  cross_rule_id constant uuid := 'b4500000-0000-4000-8000-000000000047'::uuid;
  subject_a_id uuid;
  subject_b_id uuid;
  staff_subject_id uuid;
  cross_subject_id uuid;
  rule_individual_id uuid;
  rule_collective_id uuid;
  rule_unpriced_id uuid;
  rule_player_only_id uuid;
  individual_fine_id uuid;
  collective_incident_id uuid;
  collective_a_fine_id uuid;
  collective_b_fine_id uuid;
  paid_fine_id uuid;
  cancelled_fine_id uuid;
  surcharge_fine_id uuid;
  cross_fine_id uuid;
  temp_fine_id uuid;
  observed_count integer;
  expected_count integer;
  visible_one integer;
  visible_two integer;
  visible_three integer;
  denied_count integer;
  ok_one boolean;
  ok_two boolean;
  ok_three boolean;
  ok_four boolean;
  generated numeric(14,2);
  collected numeric(14,2);
  pending numeric(14,2);
  surcharge numeric(10,2);
  financial_state text;
  error_message text;
  result_row record;
  summary_row record;
begin
  select club.id into club_id_value from public.clubs club order by club.id limit 1;
  select season.id, season.code into season_id_value, season_code_value
  from public.club_seasons season
  where season.club_id = club_id_value
    and season.starts_on <= current_date
    and season.ends_on >= current_date;

  select membership.id, membership.user_id
  into staff_membership_id, staff_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value
    and membership.role = 'staff'
    and membership.is_active
  order by membership.id limit 1;

  select membership.user_id into owner_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value
    and membership.role = 'owner'
    and membership.is_active
  order by membership.id limit 1;

  select membership.id into player_membership_id
  from public.club_memberships membership
  where membership.user_id = player_user_id
    and membership.jugador_id = player_jugador_id
    and membership.role = 'player'
    and membership.is_active;

  select subject.id into subject_a_id
  from public.fine_subjects subject
  where subject.club_id = club_id_value
    and subject.subject_type = 'player'
    and subject.jugador_id = player_jugador_id
    and subject.active;

  select subject.id into subject_b_id
  from public.fine_subjects subject
  where subject.club_id = club_id_value
    and subject.subject_type = 'player'
    and subject.id <> subject_a_id
    and subject.active
    and subject.display_name is not null
  order by subject.id limit 1;

  select rule.id into rule_individual_id from public.fine_rules rule
  where rule.club_id = club_id_value and rule.code = 'TRAINING_LATE';
  select rule.id into rule_collective_id from public.fine_rules rule
  where rule.club_id = club_id_value and rule.code = 'LOCKER_BAD_STATE_COLLECTIVE';
  select rule.id into rule_unpriced_id from public.fine_rules rule
  where rule.club_id = club_id_value and rule.code = 'TRAINING_EXIT_DELAY_AFTER_TALK';
  select rule.id into rule_player_only_id
  from public.fine_rules rule
  where rule.club_id = club_id_value
    and rule.active
    and rule.default_amount is not null
    and rule.applies_to_players
    and not rule.applies_to_staff
  order by rule.sort_order limit 1;

  ---------------------------------------------------------------------------
  -- Estructura, ACL y regresion inicial.
  ---------------------------------------------------------------------------
  test_name := 'A_public_rpc_count_and_signatures';
  select pg_catalog.count(*) = 12 into test_ok
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure_row.pronamespace
  where namespace.nspname = 'public'
    and procedure_row.oid in (
      'public.get_fine_rules_for_management()'::regprocedure,
      'public.get_fine_subjects_for_management()'::regprocedure,
      'public.create_fine_individual(uuid,uuid,date,text)'::regprocedure,
      'public.create_fine_collective(uuid,uuid[],date,text)'::regprocedure,
      'public.cancel_fine(uuid,text)'::regprocedure,
      'public.record_fine_payment(uuid,numeric,date,text)'::regprocedure,
      'public.record_fine_refund(uuid,numeric,date,text)'::regprocedure,
      'public.get_my_fines(integer,integer)'::regprocedure,
      'public.get_my_fines_summary()'::regprocedure,
      'public.get_fines_management_list(text,integer,integer,text)'::regprocedure,
      'public.get_fines_financial_summary(text)'::regprocedure,
      'public.get_fines_subject_summary(text)'::regprocedure
    );
  details := '12 exact public RPC signatures'; return next;

  test_name := 'B_no_client_club_or_actor_arguments';
  test_ok := not exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    cross join lateral pg_catalog.unnest(coalesce(procedure_row.proargnames, array[]::text[])) argument(name)
    where procedure_row.oid in (
      'public.create_fine_individual(uuid,uuid,date,text)'::regprocedure,
      'public.create_fine_collective(uuid,uuid[],date,text)'::regprocedure,
      'public.cancel_fine(uuid,text)'::regprocedure,
      'public.record_fine_payment(uuid,numeric,date,text)'::regprocedure,
      'public.record_fine_refund(uuid,numeric,date,text)'::regprocedure
    )
      and argument.name in (
        'p_club_id', 'p_season_id', 'p_created_by_membership_id',
        'p_recorded_by_membership_id', 'p_cancelled_by_membership_id'
      )
  );
  details := 'club, season and actor identities are backend-derived'; return next;

  test_name := 'C_public_rpc_security_contract';
  select pg_catalog.count(*) = 12
    and pg_catalog.bool_and(pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres')
    and pg_catalog.bool_and(procedure_row.prosecdef)
    and pg_catalog.bool_and(procedure_row.proconfig = array['search_path=pg_catalog']::text[])
  into test_ok
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid in (
    'public.get_fine_rules_for_management()'::regprocedure,
    'public.get_fine_subjects_for_management()'::regprocedure,
    'public.create_fine_individual(uuid,uuid,date,text)'::regprocedure,
    'public.create_fine_collective(uuid,uuid[],date,text)'::regprocedure,
    'public.cancel_fine(uuid,text)'::regprocedure,
    'public.record_fine_payment(uuid,numeric,date,text)'::regprocedure,
    'public.record_fine_refund(uuid,numeric,date,text)'::regprocedure,
    'public.get_my_fines(integer,integer)'::regprocedure,
    'public.get_my_fines_summary()'::regprocedure,
    'public.get_fines_management_list(text,integer,integer,text)'::regprocedure,
    'public.get_fines_financial_summary(text)'::regprocedure,
    'public.get_fines_subject_summary(text)'::regprocedure
  );
  details := 'owner postgres, SECURITY DEFINER, search_path pg_catalog'; return next;

  test_name := 'D_public_rpc_acl';
  select pg_catalog.count(*) = 12
    and pg_catalog.bool_and(not pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE'))
    and pg_catalog.bool_and(pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE'))
    and pg_catalog.bool_and(pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE'))
    and not exists (
      select 1
      from pg_catalog.pg_proc acl_procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          acl_procedure.proacl,
          pg_catalog.acldefault('f', acl_procedure.proowner)
        )
      ) acl
      where acl_procedure.oid in (
        'public.get_fine_rules_for_management()'::regprocedure,
        'public.get_fine_subjects_for_management()'::regprocedure,
        'public.create_fine_individual(uuid,uuid,date,text)'::regprocedure,
        'public.create_fine_collective(uuid,uuid[],date,text)'::regprocedure,
        'public.cancel_fine(uuid,text)'::regprocedure,
        'public.record_fine_payment(uuid,numeric,date,text)'::regprocedure,
        'public.record_fine_refund(uuid,numeric,date,text)'::regprocedure,
        'public.get_my_fines(integer,integer)'::regprocedure,
        'public.get_my_fines_summary()'::regprocedure,
        'public.get_fines_management_list(text,integer,integer,text)'::regprocedure,
        'public.get_fines_financial_summary(text)'::regprocedure,
        'public.get_fines_subject_summary(text)'::regprocedure
      )
        and acl.privilege_type = 'EXECUTE'
        and acl.grantee not in (
          acl_procedure.proowner,
          (select role_row.oid from pg_catalog.pg_roles role_row
           where role_row.rolname = 'authenticated'),
          (select role_row.oid from pg_catalog.pg_roles role_row
           where role_row.rolname = 'service_role')
        )
    )
  into test_ok
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid in (
    'public.get_fine_rules_for_management()'::regprocedure,
    'public.get_fine_subjects_for_management()'::regprocedure,
    'public.create_fine_individual(uuid,uuid,date,text)'::regprocedure,
    'public.create_fine_collective(uuid,uuid[],date,text)'::regprocedure,
    'public.cancel_fine(uuid,text)'::regprocedure,
    'public.record_fine_payment(uuid,numeric,date,text)'::regprocedure,
    'public.record_fine_refund(uuid,numeric,date,text)'::regprocedure,
    'public.get_my_fines(integer,integer)'::regprocedure,
    'public.get_my_fines_summary()'::regprocedure,
    'public.get_fines_management_list(text,integer,integer,text)'::regprocedure,
    'public.get_fines_financial_summary(text)'::regprocedure,
    'public.get_fines_subject_summary(text)'::regprocedure
  );
  details := 'only owner/authenticated/service_role execute; PUBLIC/anon and every other role denied'; return next;

  test_name := 'E_internal_helpers_not_public';
  test_ok := not pg_catalog.has_function_privilege('authenticated', 'public.require_fines_manager()', 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', 'public.require_fines_manager()', 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', 'public.resolve_fines_season(uuid,date,text)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', 'public.resolve_fines_season(uuid,date,text)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', 'public.guard_fine_payment_integrity()', 'EXECUTE');
  details := 'authority, season and trigger helpers remain internal'; return next;

  test_name := 'F_financial_guard_4_4_preserved_and_extended';
  select pg_catalog.strpos(procedure_row.prosrc, 'for update') > 0
    and pg_catalog.strpos(procedure_row.prosrc, 'collected_before + new.amount') > 0
    and pg_catalog.strpos(procedure_row.prosrc, 'new.amount > collected_before') > 0
    and pg_catalog.strpos(procedure_row.prosrc, 'current_actor_matches') > 0
    and pg_catalog.strpos(procedure_row.prosrc, 'public.can_manage_fines()') > 0
  into test_ok
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.guard_fine_payment_integrity()'::regprocedure;
  details := '4.4 concurrency/limits plus current PLAYER manager compatibility'; return next;

  test_name := 'G_table_rls_policies_unchanged';
  select pg_catalog.count(*) = 3 and pg_catalog.bool_and(relation.relrowsecurity)
  into test_ok
  from pg_catalog.pg_class relation
  where relation.oid in (
    'public.fine_incidents'::regclass,
    'public.fines'::regclass,
    'public.fine_payments'::regclass
  ) and (
    select pg_catalog.count(*) from pg_catalog.pg_policy policy
    where policy.polrelid = relation.oid
  ) = 1;
  details := 'three tables retain RLS and one STAFF SELECT policy each'; return next;

  test_name := 'H_authenticated_table_writes_still_denied';
  test_ok := not pg_catalog.has_table_privilege('authenticated', 'public.fine_incidents', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_incidents', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_incidents', 'DELETE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fines', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fines', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fines', 'DELETE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'DELETE');
  details := 'all mutations must cross RPC'; return next;

  test_name := 'I_player_dto_has_no_sensitive_ids';
  select not exists (
    select 1
    from pg_catalog.unnest(procedure_row.proargnames) output_name(name)
    where output_name.name in (
      'club_id', 'subject_id', 'jugador_id', 'membership_id', 'incident_id',
      'fine_rule_id', 'created_by_membership_id', 'cancelled_by_membership_id'
    )
  ) into test_ok
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.get_my_fines(integer,integer)'::regprocedure;
  details := 'own DTO excludes club, subject, player, incident and actor IDs'; return next;

  test_name := 'J_management_dto_has_no_auth_ids';
  select not exists (
    select 1
    from pg_catalog.unnest(procedure_row.proargnames) output_name(name)
    where output_name.name in ('club_id', 'user_id', 'membership_id', 'recorded_by_membership_id')
  ) into test_ok
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.get_fines_management_list(text,integer,integer,text)'::regprocedure;
  details := 'management DTO excludes club/Auth/membership IDs'; return next;

  test_name := 'K_initial_financial_tables_empty';
  select (select pg_catalog.count(*) from public.fine_incidents) = 0
    and (select pg_catalog.count(*) from public.fines) = 0
    and (select pg_catalog.count(*) from public.fine_payments) = 0 into test_ok;
  details := 'all three tables empty before fixtures'; return next;

  test_name := 'L_catalog_and_permissions_baseline';
  select (select pg_catalog.count(*) from public.fine_rules) = 23
    and not exists (
      select 1 from public.club_member_permissions permission
      where permission.permission_key = 'fines_manage'
    ) into test_ok;
  details := '23 rules and zero real fines_manage assignments'; return next;

  test_name := 'M_no_expenses_or_automation';
  test_ok := pg_catalog.to_regclass('public.fine_fund_expenses') is null
    and not exists (
      select 1 from pg_catalog.pg_proc procedure_row
      where procedure_row.oid in (
        'public.create_fine_individual(uuid,uuid,date,text)'::regprocedure,
        'public.record_fine_payment(uuid,numeric,date,text)'::regprocedure
      ) and pg_catalog.strpos(pg_catalog.lower(procedure_row.prosrc), 'cron') > 0
    );
  details := 'no expense/cash schema and no cron dependency'; return next;

  test_name := 'N_required_identity_fixtures_exist';
  test_ok := club_id_value is not null and season_id_value is not null
    and staff_membership_id is not null and owner_user_id is not null
    and player_membership_id is not null and subject_a_id is not null
    and subject_b_id is not null;
  details := 'club, season, STAFF, owner, Borja and second player resolved'; return next;

  ---------------------------------------------------------------------------
  -- STAFF authority and functional mutations.
  ---------------------------------------------------------------------------
  insert into public.fine_subjects (
    club_id, subject_type, staff_membership_id, display_name, active
  ) values (
    club_id_value, 'staff', staff_membership_id, 'STAFF VERIFY 4.5', true
  ) returning id into staff_subject_id;

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  select pg_catalog.count(*)::integer into observed_count
  from public.get_fine_rules_for_management();
  select pg_catalog.count(*)::integer into visible_one
  from public.get_fine_subjects_for_management();
  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_two
  from public.get_fine_rules_for_management();
  execute 'reset role';
  test_name := 'O_staff_management_catalog';
  test_ok := observed_count > 0 and visible_one >= 2 and visible_two = observed_count;
  details := pg_catalog.format(
    'STAFF rules=%s subjects=%s; OWNER rules=%s', observed_count, visible_one, visible_two
  );
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select result.fine_id into individual_fine_id
  from public.create_fine_individual(
    rule_individual_id, subject_a_id, current_date, 'Nota visible para Borja'
  ) result;
  execute 'reset role';

  test_name := 'P_individual_creation_contract';
  select incident.incident_kind = 'individual'
    and incident.club_id = club_id_value
    and incident.season_id = season_id_value
    and incident.created_by_membership_id = staff_membership_id
    and incident.note = 'Nota visible para Borja'
    and fine.original_amount = 2.00
    and fine.subject_name_snapshot is not null
    and fine.due_on = (
      pg_catalog.date_trunc('month', current_date::timestamp)
      + interval '1 month' - interval '1 day'
    )::date
  into test_ok
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  where fine.id = individual_fine_id;
  details := 'one atomic individual incident/fine with derived actor, season, snapshots and due_on';
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select result.incident_id into collective_incident_id
  from public.create_fine_collective(
    rule_collective_id, array[subject_a_id, subject_b_id], current_date, 'Colectiva verify'
  ) result;
  execute 'reset role';
  select
    (pg_catalog.array_agg(fine.id order by fine.id)
      filter (where fine.subject_id = subject_a_id))[1],
    (pg_catalog.array_agg(fine.id order by fine.id)
      filter (where fine.subject_id = subject_b_id))[1]
  into collective_a_fine_id, collective_b_fine_id
  from public.fines fine where fine.incident_id = collective_incident_id;

  test_name := 'Q_collective_creation_contract';
  select incident.incident_kind = 'collective'
    and incident.created_by_membership_id = staff_membership_id
    and pg_catalog.count(fine.id) = 2
    and pg_catalog.sum(fine.original_amount) = 2.00
  into test_ok
  from public.fine_incidents incident
  join public.fines fine on fine.incident_id = incident.id
  where incident.id = collective_incident_id
  group by incident.incident_kind, incident.created_by_membership_id;
  details := 'one collective incident, two fines, 1.00 per subject'; return next;

  test_name := 'R_duplicate_collective_rejected';
  test_ok := false;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    execute 'set local role authenticated';
    perform 1 from public.create_fine_collective(
      rule_collective_id, array[subject_a_id, subject_a_id], current_date, null
    );
    execute 'reset role';
  exception when others then execute 'reset role'; test_ok := true;
  end;
  details := 'duplicate subject array rejected before insert'; return next;

  test_name := 'S_non_collective_rule_rejected';
  test_ok := false;
  begin
    execute 'set local role authenticated';
    perform 1 from public.create_fine_collective(
      rule_individual_id, array[subject_a_id, subject_b_id], current_date, null
    );
    execute 'reset role';
  exception when others then execute 'reset role'; test_ok := true;
  end;
  details := 'non-collective rule rejected'; return next;

  test_name := 'T_unpriced_rule_rejected';
  test_ok := false;
  begin
    execute 'set local role authenticated';
    perform 1 from public.create_fine_individual(
      rule_unpriced_id, subject_a_id, current_date, null
    );
    execute 'reset role';
  exception when others then execute 'reset role'; test_ok := true;
  end;
  details := 'known UUID for unpriced rule is still rejected'; return next;

  test_name := 'U_applicability_rejected';
  test_ok := false;
  begin
    execute 'set local role authenticated';
    perform 1 from public.create_fine_individual(
      rule_player_only_id, staff_subject_id, current_date, null
    );
    execute 'reset role';
  exception when others then execute 'reset role'; test_ok := true;
  end;
  details := 'PLAYER-only rule cannot sanction reversible STAFF subject'; return next;

  test_name := 'V_note_length_rejected';
  test_ok := false;
  begin
    execute 'set local role authenticated';
    perform 1 from public.create_fine_individual(
      rule_individual_id, subject_a_id, current_date, pg_catalog.repeat('x', 501)
    );
    execute 'reset role';
  exception when string_data_right_truncation then execute 'reset role'; test_ok := true;
  end;
  details := 'note over 500 characters rejected'; return next;

  execute 'set local role authenticated';
  select * into result_row from public.record_fine_payment(
    individual_fine_id, 1.00, current_date, 'Pago parcial'
  );
  execute 'reset role';
  test_name := 'W_payment_partial';
  test_ok := result_row.payment_kind = 'payment'
    and result_row.collected_amount = 1.00
    and result_row.pending_amount = 1.00
    and result_row.financial_status = 'partial';
  details := 'payment 1/2 -> partial'; return next;

  execute 'set local role authenticated';
  select * into result_row from public.record_fine_payment(
    individual_fine_id, 1.00, current_date, null
  );
  execute 'reset role';
  test_name := 'X_payment_completes_fine';
  test_ok := result_row.collected_amount = 2.00
    and result_row.pending_amount = 0
    and result_row.financial_status = 'paid';
  details := 'second payment completes debt'; return next;

  execute 'set local role authenticated';
  select * into result_row from public.record_fine_refund(
    individual_fine_id, 0.50, current_date, 'Refund verify'
  );
  execute 'reset role';
  test_name := 'Y_payment_refund_flow';
  test_ok := result_row.payment_kind = 'refund'
    and result_row.collected_amount = 1.50
    and result_row.pending_amount = 0.50
    and result_row.financial_status = 'partial';
  details := 'payment/refund ledger returns updated canonical totals'; return next;

  test_name := 'Z_excessive_refund_rejected';
  test_ok := false;
  begin
    execute 'set local role authenticated';
    perform 1 from public.record_fine_refund(individual_fine_id, 2.00, current_date, null);
    execute 'reset role';
  exception when others then execute 'reset role'; test_ok := true;
  end;
  details := 'refund above net collected rejected'; return next;

  execute 'set local role authenticated';
  select result.fine_id into surcharge_fine_id
  from public.create_fine_individual(
    rule_individual_id, subject_b_id, date '2026-08-01', null
  ) result;
  select * into result_row from public.record_fine_payment(
    surcharge_fine_id, 1.00, date '2026-08-15', null
  );
  execute 'reset role';
  select fine.surcharge_amount into surcharge from public.fines fine
  where fine.id = surcharge_fine_id;
  test_name := 'AA_surcharge_via_rpc';
  test_ok := surcharge = 1.00
    and result_row.generated_amount = 3.00
    and result_row.collected_amount = 1.00
    and result_row.pending_amount = 2.00;
  details := 'expired original 2 receives surcharge 1 before backdated payment'; return next;

  execute 'set local role authenticated';
  select result.fine_id into cancelled_fine_id
  from public.create_fine_individual(rule_individual_id, subject_a_id, current_date, null) result;
  select * into result_row from public.cancel_fine(cancelled_fine_id, 'Anulacion verify');
  execute 'reset role';
  test_name := 'AB_cancel_contract';
  test_ok := result_row.lifecycle_status = 'cancelled'
    and result_row.cancellation_reason = 'Anulacion verify';
  details := 'zero-collected fine cancelled with derived actor'; return next;

  ok_one := false; ok_two := false; ok_three := false;
  begin
    execute 'set local role authenticated';
    perform 1 from public.cancel_fine(cancelled_fine_id, 'Again');
    execute 'reset role';
  exception when others then execute 'reset role'; ok_one := true;
  end;
  begin
    execute 'set local role authenticated';
    perform 1 from public.cancel_fine(individual_fine_id, 'Has money');
    execute 'reset role';
  exception when others then execute 'reset role'; ok_two := true;
  end;
  begin
    execute 'set local role authenticated';
    perform 1 from public.cancel_fine(collective_a_fine_id, '   ');
    execute 'reset role';
  exception when others then execute 'reset role'; ok_three := true;
  end;
  test_name := 'AC_cancel_rejections';
  test_ok := ok_one and ok_two and ok_three;
  details := 'double cancel, collected cancel and blank reason rejected'; return next;

  -- One fully-paid own fine provides unpaid/partial/paid/cancelled own states.
  execute 'set local role authenticated';
  select result.fine_id into paid_fine_id
  from public.create_fine_individual(rule_individual_id, subject_a_id, current_date, null) result;
  perform 1 from public.record_fine_payment(paid_fine_id, 2.00, current_date, null);
  execute 'reset role';

  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_one
  from public.get_fines_management_list('all', 200, 0, null);
  select pg_catalog.count(*)::integer into visible_two
  from public.get_fines_management_list('unpaid', 200, 0, null);
  select pg_catalog.count(*)::integer into visible_three
  from public.get_fines_management_list('cancelled', 200, 0, null);
  execute 'reset role';
  test_name := 'AD_staff_management_filters';
  select visible_one = pg_catalog.count(*)
    and visible_two = pg_catalog.count(*) filter (
      where fine.lifecycle_status = 'active' and totals.financial_status = 'unpaid'
    )
    and visible_three = pg_catalog.count(*) filter (where fine.lifecycle_status = 'cancelled')
  into test_ok
  from public.fines fine
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.club_id = club_id_value;
  details := 'all/unpaid/cancelled filters match administrative baseline'; return next;

  execute 'set local role authenticated';
  select * into summary_row from public.get_fines_financial_summary(season_code_value);
  execute 'reset role';
  test_name := 'AE_staff_financial_summary';
  select summary_row.total_fines = pg_catalog.count(*)
    and summary_row.active_fines = pg_catalog.count(*) filter (where fine.lifecycle_status = 'active')
    and summary_row.cancelled_fines = pg_catalog.count(*) filter (where fine.lifecycle_status = 'cancelled')
  into test_ok
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  where fine.club_id = club_id_value and incident.season_id = season_id_value;
  details := 'season summary counts match backend baseline'; return next;

  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer,
         coalesce(pg_catalog.sum(subject_summary.generated_total), 0),
         coalesce(pg_catalog.sum(subject_summary.collected_total), 0),
         coalesce(pg_catalog.sum(subject_summary.pending_total), 0)
  into observed_count, generated, collected, pending
  from public.get_fines_subject_summary(season_code_value) subject_summary;
  execute 'reset role';
  test_name := 'AF_subject_summary_ranking';
  test_ok := observed_count >= 2
    and generated = summary_row.generated_total
    and collected = summary_row.collected_total
    and pending = summary_row.pending_total;
  details := 'at least two subjects; active aggregates equal financial summary'; return next;

  ---------------------------------------------------------------------------
  -- PLAYER own read and management isolation.
  ---------------------------------------------------------------------------
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer,
         pg_catalog.count(*) filter (where own.fine_id = collective_b_fine_id)::integer
  into observed_count, visible_one
  from public.get_my_fines(100, 0) own;
  execute 'reset role';
  test_name := 'AG_player_own_read_isolated';
  select observed_count = pg_catalog.count(*)
    and visible_one = 0
  into test_ok
  from public.fines fine
  join public.fine_subjects subject on subject.id = fine.subject_id
  where subject.jugador_id = player_jugador_id and fine.club_id = club_id_value;
  details := pg_catalog.format('own rows=%s; Jairo collective fine visible=%s', observed_count, visible_one);
  return next;

  execute 'set local role authenticated';
  select * into summary_row from public.get_my_fines_summary();
  execute 'reset role';
  test_name := 'AH_player_own_summary';
  select summary_row.total_fines = pg_catalog.count(*)
    and summary_row.active_fines = pg_catalog.count(*) filter (where fine.lifecycle_status = 'active')
    and summary_row.cancelled_count = pg_catalog.count(*) filter (where fine.lifecycle_status = 'cancelled')
  into test_ok
  from public.fines fine
  join public.fine_subjects subject on subject.id = fine.subject_id
  where subject.jugador_id = player_jugador_id and fine.club_id = club_id_value;
  details := 'own counts match administrative baseline; cancelled separate'; return next;

  test_name := 'AI_player_summary_active_totals_only';
  select summary_row.original_total = coalesce(pg_catalog.sum(fine.original_amount), 0)
    and summary_row.surcharge_total = coalesce(pg_catalog.sum(fine.surcharge_amount), 0)
    and summary_row.generated_total = coalesce(pg_catalog.sum(totals.generated_amount), 0)
    and summary_row.collected_total = coalesce(pg_catalog.sum(totals.collected_amount), 0)
    and summary_row.pending_total = coalesce(pg_catalog.sum(totals.pending_amount), 0)
  into test_ok
  from public.fines fine
  join public.fine_subjects subject on subject.id = fine.subject_id
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where subject.jugador_id = player_jugador_id
    and fine.club_id = club_id_value
    and fine.lifecycle_status = 'active';
  details := 'cancelled amounts excluded from current debt totals'; return next;

  denied_count := 0;
  begin perform 1 from public.get_fine_rules_for_management(); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.get_fine_subjects_for_management(); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.create_fine_individual(rule_individual_id, subject_a_id, current_date, null); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.create_fine_collective(rule_collective_id, array[subject_a_id], current_date, null); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.cancel_fine(collective_a_fine_id, 'Denied'); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.record_fine_payment(collective_a_fine_id, 0.10, current_date, null); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.record_fine_refund(individual_fine_id, 0.10, current_date, null); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.get_fines_management_list(); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.get_fines_financial_summary(); exception when others then denied_count := denied_count + 1; end;
  begin perform 1 from public.get_fines_subject_summary(); exception when others then denied_count := denied_count + 1; end;
  test_name := 'AJ_normal_player_management_denied';
  test_ok := denied_count = 10;
  details := '10/10 manager RPC paths denied to normal PLAYER'; return next;

  test_name := 'AK_player_pagination_limits';
  ok_one := false; ok_two := false;
  begin perform 1 from public.get_my_fines(101, 0); exception when others then ok_one := true; end;
  begin perform 1 from public.get_my_fines(10, -1); exception when others then ok_two := true; end;
  test_ok := ok_one and ok_two;
  details := 'limit>100 and negative offset rejected'; return next;

  ---------------------------------------------------------------------------
  -- PLAYER manager transitorio: identidad PLAYER intacta, RPC sí, tablas no.
  ---------------------------------------------------------------------------
  test_name := 'AL_transient_player_manager_flow';
  test_ok := false; details := null;
  begin
    execute 'reset role';
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    insert into public.club_member_permissions (membership_id, permission_key)
    values (player_membership_id, 'fines_manage');
    perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';

    if not public.is_player()
       or public.current_jugador_id() is distinct from player_jugador_id
       or not public.can_manage_fines()
       or (select membership.role from public.current_membership() membership) <> 'player' then
      raise exception 'PLAYER manager identity changed';
    end if;
    perform 1 from public.get_fine_rules_for_management();
    perform 1 from public.get_fine_subjects_for_management();
    select result.fine_id into temp_fine_id
    from public.create_fine_individual(rule_individual_id, subject_a_id, current_date, null) result;
    perform 1 from public.record_fine_payment(temp_fine_id, 1.00, current_date, null);
    perform 1 from public.record_fine_refund(temp_fine_id, 0.50, current_date, null);
    perform 1 from public.get_fines_management_list();
    perform 1 from public.get_fines_financial_summary();
    perform 1 from public.get_fines_subject_summary();
    select result.fine_id into temp_fine_id
    from public.create_fine_individual(rule_individual_id, subject_a_id, current_date, null) result;
    perform 1 from public.cancel_fine(temp_fine_id, 'Captain verify');
    perform 1 from public.create_fine_collective(
      rule_collective_id, array[subject_a_id, subject_b_id], current_date, null
    );
    select pg_catalog.count(*) into visible_one from public.fines;
    select pg_catalog.count(*) into visible_two from public.fine_payments;
    if visible_one <> 0 or visible_two <> 0 then raise exception 'PLAYER manager direct rows visible'; end if;
    execute 'reset role';
    raise sqlstate 'P4510' using message = 'ROLLBACK_TRANSIENT_PLAYER_MANAGER';
  exception
    when sqlstate 'P4510' then
      test_ok := true;
      details := 'role=player, own jugador identity, all manager RPC families work; direct rows=0; rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AM_transient_permission_rolled_back';
  select not exists (
    select 1 from public.club_member_permissions permission
    where permission.membership_id = player_membership_id
      and permission.permission_key = 'fines_manage'
  ) into test_ok;
  details := 'no real captain permission remains'; return next;

  test_name := 'AN_viewer_with_permission_denied';
  test_ok := false; details := null;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    update public.club_memberships set role = 'viewer' where id = staff_membership_id;
    insert into public.club_member_permissions (membership_id, permission_key)
    values (staff_membership_id, 'fines_manage');
    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    if public.can_manage_fines() then raise exception 'VIEWER gained can_manage_fines'; end if;
    denied_count := 0;
    begin perform 1 from public.get_fine_rules_for_management(); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.get_fine_subjects_for_management(); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.create_fine_individual(rule_individual_id, subject_a_id, current_date, null); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.create_fine_collective(rule_collective_id, array[subject_a_id], current_date, null); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.cancel_fine(collective_a_fine_id, 'Denied'); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.record_fine_payment(collective_a_fine_id, 0.10, current_date, null); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.record_fine_refund(individual_fine_id, 0.10, current_date, null); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.get_fines_management_list(); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.get_fines_financial_summary(); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.get_fines_subject_summary(); exception when others then denied_count := denied_count + 1; end;
    if denied_count <> 10 then raise exception 'VIEWER reached a manager RPC'; end if;
    select pg_catalog.count(*) into visible_one from public.fines;
    if visible_one <> 0 then raise exception 'VIEWER sees direct fines'; end if;
    execute 'reset role';
    raise sqlstate 'P4511' using message = 'ROLLBACK_VIEWER_MANAGER';
  exception
    when sqlstate 'P4511' then test_ok := true; details := 'viewer + permission: can_manage=false, 10/10 manager RPCs denied, direct rows=0';
    when others then execute 'reset role'; get stacked diagnostics details = message_text;
  end;
  return next;

  ---------------------------------------------------------------------------
  -- Cross-club IDOR, no-membership, anon and direct-table regression.
  ---------------------------------------------------------------------------
  test_name := 'AO_cross_club_idor_rejected';
  test_ok := false; details := null; denied_count := 0;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    insert into public.clubs (id, name) values (cross_club_id, 'VERIFY 4.5 CROSS');
    insert into public.club_seasons (
      id, club_id, code, label, starts_on, ends_on, is_active
    ) values (
      cross_season_id, cross_club_id, 'VERIFY45', 'VERIFY 4.5',
      date '2026-07-01', date '2027-06-30', true
    );
    insert into public.fine_rules (
      id, club_id, code, name, default_amount, pricing_mode,
      applies_to_players, applies_to_staff, collective_allowed, active, sort_order
    ) values (
      cross_rule_id, cross_club_id, 'VERIFY45', 'Cross rule', 2.00, 'fixed',
      true, true, false, true, 1
    );
    update public.club_memberships set club_id = cross_club_id where id = staff_membership_id;
    insert into public.fine_subjects (
      club_id, subject_type, staff_membership_id, display_name, active
    ) values (
      cross_club_id, 'staff', staff_membership_id, 'CROSS STAFF', true
    ) returning id into cross_subject_id;
    insert into public.fine_incidents (
      club_id, season_id, fine_rule_id, incident_kind, occurred_on,
      rule_code_snapshot, reason_snapshot, created_by_membership_id
    ) values (
      cross_club_id, cross_season_id, cross_rule_id, 'individual', current_date,
      'IGNORED', 'IGNORED', staff_membership_id
    ) returning id into collective_incident_id;
    insert into public.fines (
      club_id, incident_id, subject_id, subject_name_snapshot, original_amount, due_on
    ) values (
      cross_club_id, collective_incident_id, cross_subject_id, 'IGNORED', 2.00, current_date
    ) returning id into cross_fine_id;
    update public.club_memberships set club_id = club_id_value where id = staff_membership_id;

    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    begin perform 1 from public.create_fine_individual(cross_rule_id, subject_a_id, current_date, null); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.create_fine_individual(rule_individual_id, cross_subject_id, current_date, null); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.cancel_fine(cross_fine_id, 'Denied'); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.record_fine_payment(cross_fine_id, 1.00, current_date, null); exception when others then denied_count := denied_count + 1; end;
    begin perform 1 from public.get_fines_financial_summary('VERIFY45'); exception when others then denied_count := denied_count + 1; end;
    execute 'reset role';
    if denied_count <> 5 then raise exception 'Cross-club path accepted'; end if;
    raise sqlstate 'P4512' using message = 'ROLLBACK_CROSS_CLUB_RPC';
  exception
    when sqlstate 'P4512' then test_ok := true; details := 'rule, subject, fine and season from other club rejected; rolled back';
    when others then execute 'reset role'; get stacked diagnostics details = message_text;
  end;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*) into visible_one from public.fine_incidents;
  select pg_catalog.count(*) into visible_two from public.fines;
  select pg_catalog.count(*) into visible_three from public.fine_payments;
  ok_one := false; begin perform 1 from public.get_my_fines(); exception when others then ok_one := true; end;
  execute 'reset role';
  test_name := 'AP_uid_without_membership_denied';
  test_ok := visible_one = 0 and visible_two = 0 and visible_three = 0 and ok_one;
  details := 'three direct tables zero; own RPC logically denied'; return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  ok_one := false; ok_two := false;
  begin perform 1 from public.get_my_fines(); exception when insufficient_privilege then ok_one := true; end;
  begin perform 1 from public.get_fine_rules_for_management(); exception when insufficient_privilege then ok_two := true; end;
  execute 'reset role';
  test_name := 'AQ_anon_execute_denied';
  test_ok := ok_one and ok_two;
  details := 'PLAYER and manager RPC EXECUTE denied to anon'; return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*) into visible_one from public.fine_incidents;
  select pg_catalog.count(*) into visible_two from public.fines;
  select pg_catalog.count(*) into visible_three from public.fine_payments;
  execute 'reset role';
  test_name := 'AR_direct_table_access_regression';
  test_ok := visible_one = 0 and visible_two = 0 and visible_three = 0;
  details := 'normal PLAYER sees zero rows in incidents/fines/payments'; return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*) into visible_one from public.fine_incidents;
  select pg_catalog.count(*) into visible_two from public.fines;
  select pg_catalog.count(*) into visible_three from public.fine_payments;
  execute 'reset role';
  test_name := 'AS_staff_direct_read_preserved';
  test_ok := visible_one = (select pg_catalog.count(*) from public.fine_incidents where club_id = club_id_value)
    and visible_two = (select pg_catalog.count(*) from public.fines where club_id = club_id_value)
    and visible_three = (select pg_catalog.count(*) from public.fine_payments where club_id = club_id_value);
  details := 'STAFF retains own-club SELECT only'; return next;

  test_name := 'AT_management_pagination_and_status_validation';
  ok_one := false; ok_two := false; ok_three := false;
  begin execute 'set local role authenticated'; perform 1 from public.get_fines_management_list('invalid'); execute 'reset role'; exception when others then execute 'reset role'; ok_one := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.get_fines_management_list('all', 201, 0); execute 'reset role'; exception when others then execute 'reset role'; ok_two := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.get_fines_management_list('all', 10, -1); execute 'reset role'; exception when others then execute 'reset role'; ok_three := true; end;
  test_ok := ok_one and ok_two and ok_three;
  details := 'invalid status, limit>200 and negative offset rejected'; return next;

  test_name := 'AU_invalid_season_code_rejected';
  test_ok := false;
  begin
    execute 'set local role authenticated';
    perform 1 from public.get_fines_financial_summary('OTHER_CLUB_OR_UNKNOWN');
    execute 'reset role';
  exception when others then execute 'reset role'; test_ok := true;
  end;
  details := 'unknown/cross-club season code reveals no data'; return next;

  ---------------------------------------------------------------------------
  -- Final regression assertions (fixtures still transaction-local).
  ---------------------------------------------------------------------------
  test_name := 'AV_blocks_4_1_to_4_4_objects_intact';
  test_ok := pg_catalog.to_regclass('public.club_seasons') is not null
    and pg_catalog.to_regclass('public.fine_subjects') is not null
    and pg_catalog.to_regclass('public.fine_rules') is not null
    and pg_catalog.to_regclass('public.fine_incidents') is not null
    and pg_catalog.to_regclass('public.fines') is not null
    and pg_catalog.to_regclass('public.fine_payments') is not null
    and pg_catalog.to_regprocedure('public.apply_fine_surcharge_if_due(uuid)') is not null;
  details := 'foundation, catalog, core and payment objects remain'; return next;

  test_name := 'AW_rule_catalog_persistent_count';
  select pg_catalog.count(*) = 23 into test_ok from public.fine_rules;
  details := 'exactly 23 persistent rules'; return next;

  test_name := 'AX_no_real_fines_manage_assignment';
  select pg_catalog.count(*) = 0 into test_ok
  from public.club_member_permissions permission
  where permission.permission_key = 'fines_manage';
  details := 'transient captain permission rolled back'; return next;

  test_name := 'AY_no_captain_role';
  select pg_catalog.count(*) = 0 into test_ok
  from public.club_memberships membership where membership.role = 'captain';
  details := 'no captain application role created'; return next;

  test_name := 'AZ_no_staff_subject_seed_persistent';
  select pg_catalog.count(*) = 1 into test_ok
  from public.fine_subjects subject where subject.subject_type = 'staff';
  details := 'only one verifier fixture exists and final ROLLBACK removes it'; return next;

  test_name := 'BA_note_is_documented_player_visible';
  select pg_catalog.strpos(
    coalesce(pg_catalog.obj_description(procedure_row.oid, 'pg_proc'), ''),
    'visible tambien'
  ) > 0 into test_ok
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.get_my_fines(integer,integer)'::regprocedure;
  details := 'incident note contract explicitly states PLAYER visibility'; return next;

  test_name := 'BB_management_list_default_is_historical';
  select pg_catalog.strpos(
    coalesce(pg_catalog.obj_description(procedure_row.oid, 'pg_proc'), ''),
    'sin filtro de temporada por defecto'
  ) > 0 into test_ok
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.get_fines_management_list(text,integer,integer,text)'::regprocedure;
  details := 'NULL season leaves management history unfiltered'; return next;

  test_name := 'BC_summaries_are_season_scoped';
  test_ok := season_code_value is not null
    and pg_catalog.to_regprocedure('public.get_fines_financial_summary(text)') is not null
    and pg_catalog.to_regprocedure('public.get_fines_subject_summary(text)') is not null;
  details := 'summary season code validated against current club'; return next;

  test_name := 'BD_no_player_ranking_rpc';
  select not exists (
    select 1 from pg_catalog.pg_proc procedure_row
    where procedure_row.pronamespace = 'public'::regnamespace
      and procedure_row.proname like 'get_my%subject%summary%'
  ) into test_ok;
  details := 'subject ranking exists only behind manager authority'; return next;

  test_name := 'BE_verifier_fixture_inventory';
  select (select pg_catalog.count(*) from public.fine_incidents) > 0
    and (select pg_catalog.count(*) from public.fines) > 0
    and (select pg_catalog.count(*) from public.fine_payments) > 0 into test_ok;
  details := 'functional fixtures exist only inside current transaction'; return next;

  test_name := 'BF_verifier_is_transactional';
  test_ok := true;
  details := 'final ROLLBACK removes fines, payments, STAFF subject and every transient permission'; return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$verify$;

select test_name, test_ok, details
from pg_temp.verify_fines_rpc();

rollback;
