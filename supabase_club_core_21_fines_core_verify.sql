-- APPCAUDAL - Bloque 4.3 - Verificacion posterior.
--
-- Ejecutar el archivo completo. Devuelve una unica tabla visible:
-- test_name, test_ok, details.
-- Las pruebas escriben solo dentro de esta transaccion y terminan en ROLLBACK.

begin;

create or replace function pg_temp.verify_fines_core()
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
  season_start date;
  season_end date;
  staff_membership_id uuid;
  staff_user_id uuid;
  player_user_id constant uuid := '350615a9-b068-450a-b867-da30a59b9082'::uuid;
  player_jugador_id constant uuid := '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid;
  player_membership_id uuid;
  no_membership_user_id constant uuid := 'b4300000-0000-4000-8000-000000000099'::uuid;
  cross_club_id constant uuid := 'b4300000-0000-4000-8000-000000000043'::uuid;
  cross_season_id constant uuid := 'b4300000-0000-4000-8000-000000000044'::uuid;
  cross_rule_id constant uuid := 'b4300000-0000-4000-8000-000000000045'::uuid;
  subject_a_id uuid;
  subject_b_id uuid;
  null_name_subject_id uuid;
  subject_a_name text;
  subject_b_name text;
  individual_rule_id uuid;
  individual_rule_code text;
  individual_rule_name text;
  individual_rule_description text;
  individual_rule_amount numeric(10,2);
  collective_rule_id uuid;
  unpriced_rule_id uuid;
  individual_incident_id uuid;
  individual_fine_id uuid;
  collective_incident_id uuid;
  cross_incident_id uuid;
  observed_count integer;
  expected_count integer;
  visible_incidents integer;
  visible_fines integer;
  amount_data_type text;
  amount_precision integer;
  amount_scale integer;
  error_message text;
  season_cross_denied boolean;
  rule_cross_denied boolean;
  actor_cross_denied boolean;
  incident_cross_denied boolean;
  subject_cross_denied boolean;
  canceller_cross_denied boolean;
  incident_insert_denied boolean;
  incident_update_denied boolean;
  incident_delete_denied boolean;
  fine_insert_denied boolean;
  fine_update_denied boolean;
  fine_delete_denied boolean;
begin
  select club.id into club_id_value
  from public.clubs club
  order by club.id
  limit 1;

  select season.id, season.starts_on, season.ends_on
  into season_id_value, season_start, season_end
  from public.club_seasons season
  where season.club_id = club_id_value
    and season.code = '2026'
    and season.is_active;

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

  select subject.id, subject.display_name
  into subject_a_id, subject_a_name
  from public.fine_subjects subject
  where subject.club_id = club_id_value
    and subject.subject_type = 'player'
    and subject.active
    and subject.display_name is not null
  order by subject.id
  limit 1;

  select subject.id, subject.display_name
  into subject_b_id, subject_b_name
  from public.fine_subjects subject
  where subject.club_id = club_id_value
    and subject.subject_type = 'player'
    and subject.active
    and subject.display_name is not null
    and subject.id <> subject_a_id
  order by subject.id
  limit 1;

  select rule.id, rule.code, rule.name, rule.description, rule.default_amount
  into
    individual_rule_id,
    individual_rule_code,
    individual_rule_name,
    individual_rule_description,
    individual_rule_amount
  from public.fine_rules rule
  where rule.club_id = club_id_value
    and rule.code = 'TRAINING_LATE';

  select rule.id into collective_rule_id
  from public.fine_rules rule
  where rule.club_id = club_id_value
    and rule.code = 'LOCKER_BAD_STATE_COLLECTIVE';

  select rule.id into unpriced_rule_id
  from public.fine_rules rule
  where rule.club_id = club_id_value
    and rule.code = 'TRAINING_EXIT_DELAY_AFTER_TALK';

  ---------------------------------------------------------------------------
  -- Estructura de fine_incidents.
  ---------------------------------------------------------------------------
  test_name := 'A_fine_incidents_exists';
  test_ok := pg_catalog.to_regclass('public.fine_incidents') is not null;
  details := 'relation=' || coalesce(pg_catalog.to_regclass('public.fine_incidents')::text, 'NULL');
  return next;

  with expected(column_name, data_type, is_nullable) as (
    values
      ('id'::text, 'uuid'::text, 'NO'::text),
      ('club_id', 'uuid', 'NO'),
      ('season_id', 'uuid', 'NO'),
      ('fine_rule_id', 'uuid', 'NO'),
      ('incident_kind', 'text', 'NO'),
      ('occurred_on', 'date', 'NO'),
      ('rule_code_snapshot', 'text', 'NO'),
      ('reason_snapshot', 'text', 'NO'),
      ('description_snapshot', 'text', 'YES'),
      ('note', 'text', 'YES'),
      ('created_by_membership_id', 'uuid', 'NO'),
      ('created_at', 'timestamp with time zone', 'NO')
  ), actual as (
    select
      actual_column.column_name,
      actual_column.data_type,
      actual_column.is_nullable
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fine_incidents'
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
  test_name := 'B_fine_incidents_exact_columns';
  details := pg_catalog.format('observed=%s expected=%s', observed_count, expected_count);
  return next;

  test_name := 'C_fine_incidents_owner_postgres';
  select pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
  into test_ok
  from pg_catalog.pg_class relation
  where relation.oid = 'public.fine_incidents'::regclass;
  details := 'owner=postgres';
  return next;

  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.fine_incidents'::regclass
    and constraint_row.convalidated
    and constraint_row.conname in (
      'fine_incidents_pkey',
      'fine_incidents_club_id_fkey',
      'fine_incidents_season_id_fkey',
      'fine_incidents_fine_rule_id_fkey',
      'fine_incidents_created_by_membership_id_fkey',
      'fine_incidents_kind_check',
      'fine_incidents_rule_code_snapshot_not_empty',
      'fine_incidents_reason_snapshot_not_empty'
    );
  test_name := 'D_fine_incidents_constraints';
  test_ok := observed_count = 8;
  details := pg_catalog.format('%s/8 constraints present and validated', observed_count);
  return next;

  test_name := 'E_fine_incidents_kind_contract';
  test_ok := exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fine_incidents'::regclass
      and constraint_row.conname = 'fine_incidents_kind_check'
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'individual') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'collective') > 0
  );
  details := 'incident_kind IN (individual, collective)';
  return next;

  test_name := 'F_fine_incidents_fks_restrict';
  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.fine_incidents'::regclass
    and constraint_row.contype = 'f'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated;
  test_ok := observed_count = 4 and not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fine_incidents'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  );
  details := pg_catalog.format('RESTRICT FKs=%s CASCADE=0', observed_count);
  return next;

  test_name := 'G_fine_incident_guard_contract';
  test_ok := exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_language language on language.oid = procedure_row.prolang
    where procedure_row.oid = 'public.guard_fine_incident_integrity()'::regprocedure
      and pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      and language.lanname = 'plpgsql'
      and procedure_row.prosecdef
      and procedure_row.provolatile = 'v'
      and procedure_row.proconfig = array['search_path=pg_catalog']::text[]
      and pg_catalog.strpos(procedure_row.prosrc, 'season_club_id is distinct from new.club_id') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'rule_club_id is distinct from new.club_id') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'actor_club_id is distinct from new.club_id') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'new.rule_code_snapshot := rule_code') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'new.reason_snapshot := rule_name') > 0
  );
  details := 'postgres SECURITY DEFINER VOLATILE search_path=pg_catalog; cross-club + snapshots';
  return next;

  test_name := 'H_fine_incident_guard_acl_and_trigger';
  test_ok := not pg_catalog.has_function_privilege('anon', 'public.guard_fine_incident_integrity()', 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', 'public.guard_fine_incident_integrity()', 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', 'public.guard_fine_incident_integrity()', 'EXECUTE')
    and exists (
      select 1
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = 'public.fine_incidents'::regclass
        and trigger_row.tgname = 'guard_fine_incident_integrity'
        and trigger_row.tgfoid = 'public.guard_fine_incident_integrity()'::regprocedure
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled = 'O'
    );
  details := 'direct EXECUTE denied; BEFORE INSERT/UPDATE trigger enabled';
  return next;

  ---------------------------------------------------------------------------
  -- Estructura de fines.
  ---------------------------------------------------------------------------
  test_name := 'I_fines_exists';
  test_ok := pg_catalog.to_regclass('public.fines') is not null;
  details := 'relation=' || coalesce(pg_catalog.to_regclass('public.fines')::text, 'NULL');
  return next;

  with expected(column_name, data_type, is_nullable, amount_precision, amount_scale) as (
    values
      ('id'::text, 'uuid'::text, 'NO'::text, null::integer, null::integer),
      ('club_id', 'uuid', 'NO', null, null),
      ('incident_id', 'uuid', 'NO', null, null),
      ('subject_id', 'uuid', 'NO', null, null),
      ('subject_name_snapshot', 'text', 'NO', null, null),
      ('original_amount', 'numeric', 'NO', 10, 2),
      ('currency', 'text', 'NO', null, null),
      ('lifecycle_status', 'text', 'NO', null, null),
      ('cancelled_at', 'timestamp with time zone', 'YES', null, null),
      ('cancelled_by_membership_id', 'uuid', 'YES', null, null),
      ('cancellation_reason', 'text', 'YES', null, null),
      ('created_at', 'timestamp with time zone', 'NO', null, null)
  ), actual as (
    select
      actual_column.column_name,
      actual_column.data_type,
      actual_column.is_nullable,
      case
        when actual_column.column_name = 'original_amount'
          then actual_column.numeric_precision
        else null::integer
      end,
      case
        when actual_column.column_name = 'original_amount'
          then actual_column.numeric_scale
        else null::integer
      end
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fines'
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
    and actual_column.table_name = 'fines'
    and actual_column.column_name = 'original_amount';

  test_name := 'J_fines_exact_columns';
  details := pg_catalog.format(
    'observed=%s expected=%s; original_amount=%s precision=%s scale=%s',
    observed_count,
    expected_count,
    coalesce(amount_data_type, 'NULL'),
    coalesce(amount_precision::text, 'NULL'),
    coalesce(amount_scale::text, 'NULL')
  );
  return next;

  test_name := 'K_fines_owner_postgres';
  select pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
  into test_ok
  from pg_catalog.pg_class relation
  where relation.oid = 'public.fines'::regclass;
  details := 'owner=postgres';
  return next;

  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.fines'::regclass
    and constraint_row.convalidated
    and constraint_row.conname in (
      'fines_pkey',
      'fines_club_id_fkey',
      'fines_incident_id_fkey',
      'fines_subject_id_fkey',
      'fines_cancelled_by_membership_id_fkey',
      'fines_subject_name_snapshot_not_empty',
      'fines_original_amount_positive',
      'fines_currency_eur_check',
      'fines_lifecycle_status_check',
      'fines_cancellation_consistency_check',
      'fines_incident_subject_key'
    );
  test_name := 'L_fines_constraints';
  test_ok := observed_count = 11;
  details := pg_catalog.format('%s/11 constraints present and validated', observed_count);
  return next;

  test_name := 'M_fines_amount_currency_lifecycle_contract';
  test_ok := exists (
      select 1 from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.fines'::regclass
        and constraint_row.conname = 'fines_original_amount_positive'
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'original_amount >') > 0
    ) and exists (
      select 1 from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.fines'::regclass
        and constraint_row.conname = 'fines_currency_eur_check'
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'EUR') > 0
    ) and exists (
      select 1 from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.fines'::regclass
        and constraint_row.conname = 'fines_lifecycle_status_check'
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'active') > 0
        and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'cancelled') > 0
    );
  details := 'positive numeric(10,2); EUR only; lifecycle active/cancelled';
  return next;

  test_name := 'M2_fines_defaults';
  test_ok := (
    select pg_catalog.count(*) = 4
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fines'
      and (
        (actual_column.column_name = 'id' and actual_column.column_default like '%gen_random_uuid%')
        or (actual_column.column_name = 'currency' and actual_column.column_default like '%EUR%')
        or (actual_column.column_name = 'lifecycle_status' and actual_column.column_default like '%active%')
        or (actual_column.column_name = 'created_at' and actual_column.column_default like '%now()%')
      )
  );
  details := 'id UUID; currency=EUR; lifecycle=active; created_at=now()';
  return next;

  test_name := 'N_fines_cancellation_contract';
  test_ok := exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fines'::regclass
      and constraint_row.conname = 'fines_cancellation_consistency_check'
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'cancelled_at IS NULL') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'cancelled_at IS NOT NULL') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'cancelled_by_membership_id') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), 'cancellation_reason') > 0
  );
  details := 'active has no cancellation fields; cancelled requires all three';
  return next;

  test_name := 'O_fines_unique_incident_subject';
  test_ok := exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fines'::regclass
      and constraint_row.conname = 'fines_incident_subject_key'
      and constraint_row.contype = 'u'
      and constraint_row.convalidated
  );
  details := 'UNIQUE(incident_id, subject_id)';
  return next;

  test_name := 'P_fines_fks_restrict';
  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.fines'::regclass
    and constraint_row.contype = 'f'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated;
  test_ok := observed_count = 4 and not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fines'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  );
  details := pg_catalog.format('RESTRICT FKs=%s CASCADE=0', observed_count);
  return next;

  test_name := 'P2_financial_indexes_valid';
  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_index index_row
  join pg_catalog.pg_class index_class on index_class.oid = index_row.indexrelid
  where index_row.indrelid in (
    'public.fine_incidents'::regclass,
    'public.fines'::regclass
  )
    and index_row.indisvalid
    and index_class.relname in (
      'fine_incidents_pkey',
      'fine_incidents_club_occurred_idx',
      'fine_incidents_rule_idx',
      'fines_pkey',
      'fines_incident_subject_key',
      'fines_club_created_idx',
      'fines_subject_created_idx'
    );
  test_ok := observed_count = 7;
  details := pg_catalog.format('%s/7 PK, uniqueness and lookup indexes valid', observed_count);
  return next;

  test_name := 'Q_fine_guard_contract';
  test_ok := exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_language language on language.oid = procedure_row.prolang
    where procedure_row.oid = 'public.guard_fine_integrity()'::regprocedure
      and pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      and language.lanname = 'plpgsql'
      and procedure_row.prosecdef
      and procedure_row.provolatile = 'v'
      and procedure_row.proconfig = array['search_path=pg_catalog']::text[]
      and pg_catalog.strpos(procedure_row.prosrc, 'incident_club_id is distinct from new.club_id') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'subject_club_id is distinct from new.club_id') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'canceller_club_id is distinct from new.club_id') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'new.subject_name_snapshot := subject_display_name') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'new.original_amount := rule_default_amount') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'new.currency := ''EUR''') > 0
  );
  details := 'postgres SECURITY DEFINER; cross-club; backend-derived name/amount/EUR';
  return next;

  test_name := 'R_fine_guard_acl_and_trigger';
  test_ok := not pg_catalog.has_function_privilege('anon', 'public.guard_fine_integrity()', 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', 'public.guard_fine_integrity()', 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', 'public.guard_fine_integrity()', 'EXECUTE')
    and exists (
      select 1
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = 'public.fines'::regclass
        and trigger_row.tgname = 'guard_fine_integrity'
        and trigger_row.tgfoid = 'public.guard_fine_integrity()'::regprocedure
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled = 'O'
    );
  details := 'direct EXECUTE denied; BEFORE INSERT/UPDATE trigger enabled';
  return next;

  ---------------------------------------------------------------------------
  -- RLS, ACL y estado inicial.
  ---------------------------------------------------------------------------
  test_name := 'S_rls_on_both_tables';
  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_class relation
  where relation.oid in (
    'public.fine_incidents'::regclass,
    'public.fines'::regclass
  )
    and relation.relrowsecurity
    and not relation.relforcerowsecurity;
  test_ok := observed_count = 2;
  details := pg_catalog.format('%s/2 tables with RLS ON and FORCE OFF', observed_count);
  return next;

  test_name := 'T_staff_select_policies_only';
  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_policy policy
  where policy.polrelid in (
    'public.fine_incidents'::regclass,
    'public.fines'::regclass
  )
    and policy.polcmd = 'r'
    and policy.polpermissive
    and policy.polroles = array[
      (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
    ]
    and pg_catalog.strpos(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), 'is_app_staff()') > 0
    and pg_catalog.strpos(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), 'current_membership()') > 0
    and policy.polwithcheck is null;
  test_ok := observed_count = 2 and (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      'public.fine_incidents'::regclass,
      'public.fines'::regclass
    )
  ) = 2 and not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      'public.fine_incidents'::regclass,
      'public.fines'::regclass
    )
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
  details := pg_catalog.format('%s/2 STAFF own-club SELECT policies; no write policy', observed_count);
  return next;

  test_name := 'U_exact_table_grants';
  test_ok := not exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) acl
      where relation.oid in (
        'public.fine_incidents'::regclass,
        'public.fines'::regclass
      )
        and (
          acl.grantee = 0
          or acl.grantee not in (
            relation.relowner,
            (select oid from pg_catalog.pg_roles where rolname = 'authenticated'),
            (select oid from pg_catalog.pg_roles where rolname = 'service_role')
          )
        )
    )
    and not pg_catalog.has_table_privilege('anon', 'public.fine_incidents', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'public.fines', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.fine_incidents', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.fines', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_incidents', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_incidents', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_incidents', 'DELETE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fines', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fines', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fines', 'DELETE')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_incidents', 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_incidents', 'INSERT')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_incidents', 'UPDATE')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_incidents', 'DELETE')
    and pg_catalog.has_table_privilege('service_role', 'public.fines', 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.fines', 'INSERT')
    and pg_catalog.has_table_privilege('service_role', 'public.fines', 'UPDATE')
    and pg_catalog.has_table_privilege('service_role', 'public.fines', 'DELETE');
  details := 'PUBLIC/anon=none; authenticated=SELECT; service_role=CRUD';
  return next;

  test_name := 'V_tables_initially_empty';
  select pg_catalog.count(*)::integer into visible_incidents from public.fine_incidents;
  select pg_catalog.count(*)::integer into visible_fines from public.fines;
  test_ok := visible_incidents = 0 and visible_fines = 0;
  details := pg_catalog.format('fine_incidents=%s fines=%s', visible_incidents, visible_fines);
  return next;

  ---------------------------------------------------------------------------
  -- Incidente y multa individual validos; snapshots derivados en backend.
  ---------------------------------------------------------------------------
  insert into public.fine_incidents (
    club_id,
    season_id,
    fine_rule_id,
    incident_kind,
    occurred_on,
    rule_code_snapshot,
    reason_snapshot,
    description_snapshot,
    note,
    created_by_membership_id
  ) values (
    club_id_value,
    season_id_value,
    individual_rule_id,
    'individual',
    date '2026-09-01',
    'CLIENT_CODE_IGNORED',
    'CLIENT_REASON_IGNORED',
    'CLIENT_DESCRIPTION_IGNORED',
    'Llegó 10 minutos tarde.',
    staff_membership_id
  ) returning id into individual_incident_id;

  test_name := 'W_valid_individual_incident';
  test_ok := individual_incident_id is not null and exists (
    select 1
    from public.fine_incidents incident
    where incident.id = individual_incident_id
      and incident.club_id = club_id_value
      and incident.season_id = season_id_value
      and incident.fine_rule_id = individual_rule_id
      and incident.incident_kind = 'individual'
      and incident.occurred_on = date '2026-09-01'
      and incident.created_by_membership_id = staff_membership_id
  );
  details := 'one valid individual incident created transactionally';
  return next;

  test_name := 'X_incident_snapshots_derived';
  test_ok := exists (
    select 1
    from public.fine_incidents incident
    where incident.id = individual_incident_id
      and incident.rule_code_snapshot = individual_rule_code
      and incident.reason_snapshot = individual_rule_name
      and incident.description_snapshot is not distinct from individual_rule_description
      and incident.rule_code_snapshot <> 'CLIENT_CODE_IGNORED'
      and incident.reason_snapshot <> 'CLIENT_REASON_IGNORED'
  );
  details := 'code/name/description equal canonical fine_rules values';
  return next;

  insert into public.fines (
    club_id,
    incident_id,
    subject_id,
    subject_name_snapshot,
    original_amount,
    currency
  ) values (
    club_id_value,
    individual_incident_id,
    subject_a_id,
    'CLIENT_SUBJECT_IGNORED',
    999.99,
    'USD'
  ) returning id into individual_fine_id;

  test_name := 'Y_valid_individual_fine';
  test_ok := individual_fine_id is not null and exists (
    select 1
    from public.fines fine
    where fine.id = individual_fine_id
      and fine.incident_id = individual_incident_id
      and fine.subject_id = subject_a_id
      and fine.lifecycle_status = 'active'
      and fine.cancelled_at is null
      and fine.cancelled_by_membership_id is null
      and fine.cancellation_reason is null
  );
  details := 'one active individual fine linked to exactly one incident';
  return next;

  test_name := 'Z_fine_snapshots_amount_currency_derived';
  test_ok := exists (
    select 1
    from public.fines fine
    where fine.id = individual_fine_id
      and fine.subject_name_snapshot = subject_a_name
      and fine.original_amount = individual_rule_amount
      and fine.currency = 'EUR'
      and fine.subject_name_snapshot <> 'CLIENT_SUBJECT_IGNORED'
      and fine.original_amount <> 999.99
  );
  details := pg_catalog.format('subject=%s amount=%s currency=EUR', subject_a_name, individual_rule_amount);
  return next;

  test_name := 'AA_historical_snapshots_survive_catalog_change';
  test_ok := false;
  details := null;
  begin
    update public.fine_rules
    set
      name = 'TEMPORARY CHANGED RULE',
      description = 'TEMPORARY CHANGED DESCRIPTION',
      default_amount = 77.00
    where id = individual_rule_id;

    if not exists (
      select 1
      from public.fine_incidents incident
      join public.fines fine on fine.incident_id = incident.id
      where incident.id = individual_incident_id
        and incident.rule_code_snapshot = individual_rule_code
        and incident.reason_snapshot = individual_rule_name
        and incident.description_snapshot is not distinct from individual_rule_description
        and fine.id = individual_fine_id
        and fine.original_amount = individual_rule_amount
        and fine.subject_name_snapshot = subject_a_name
    ) then
      raise exception 'El historico cambio con el catalogo';
    end if;

    raise sqlstate 'P4301' using message = 'ROLLBACK_CATALOG_CHANGE_TEST';
  exception
    when sqlstate 'P4301' then
      test_ok := true;
      details := 'incident/fine snapshots unchanged; catalog update rolled back';
    when others then
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  return next;

  test_name := 'AB_fine_snapshot_is_immutable';
  test_ok := false;
  begin
    update public.fines
    set original_amount = original_amount + 1
    where id = individual_fine_id;
    details := 'unexpected update success';
  exception
    when check_violation then
      test_ok := true;
      details := 'guard rejected historical amount update with 23514';
    when others then
      get stacked diagnostics details = message_text;
  end;
  return next;

  ---------------------------------------------------------------------------
  -- Incidencia colectiva: dos deudas individuales de 1 EUR.
  ---------------------------------------------------------------------------
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
    club_id_value,
    season_id_value,
    collective_rule_id,
    'collective',
    date '2026-09-02',
    'IGNORED',
    'IGNORED',
    staff_membership_id
  ) returning id into collective_incident_id;

  insert into public.fines (
    club_id, incident_id, subject_id, subject_name_snapshot, original_amount
  ) values
    (club_id_value, collective_incident_id, subject_a_id, 'IGNORED', 999.99),
    (club_id_value, collective_incident_id, subject_b_id, 'IGNORED', 999.99);

  test_name := 'AC_collective_creates_two_individual_fines';
  select pg_catalog.count(*)::integer into observed_count
  from public.fines fine
  where fine.incident_id = collective_incident_id;
  test_ok := observed_count = 2
    and (
      select pg_catalog.count(distinct fine.subject_id)
      from public.fines fine
      where fine.incident_id = collective_incident_id
    ) = 2;
  details := pg_catalog.format('fines=%s distinct_subjects=2', observed_count);
  return next;

  test_name := 'AD_collective_amount_is_per_subject';
  test_ok := not exists (
      select 1
      from public.fines fine
      where fine.incident_id = collective_incident_id
        and (fine.original_amount <> 1.00 or fine.currency <> 'EUR')
    ) and (
      select pg_catalog.sum(fine.original_amount)
      from public.fines fine
      where fine.incident_id = collective_incident_id
    ) = 2.00;
  details := '2 fines x 1.00 EUR; incident total=2.00; no shared debt';
  return next;

  test_name := 'AE_non_collective_rule_rejected';
  test_ok := false;
  begin
    insert into public.fine_incidents (
      club_id, season_id, fine_rule_id, incident_kind, occurred_on,
      rule_code_snapshot, reason_snapshot, created_by_membership_id
    ) values (
      club_id_value, season_id_value, individual_rule_id, 'collective', date '2026-09-03',
      'IGNORED', 'IGNORED', staff_membership_id
    );
    details := 'unexpected collective incident success';
  exception
    when check_violation then
      test_ok := true;
      details := 'TRAINING_LATE collective rejected with 23514';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AF_unpriced_rule_rejected';
  test_ok := false;
  begin
    insert into public.fine_incidents (
      club_id, season_id, fine_rule_id, incident_kind, occurred_on,
      rule_code_snapshot, reason_snapshot, created_by_membership_id
    ) values (
      club_id_value, season_id_value, unpriced_rule_id, 'individual', date '2026-09-03',
      'IGNORED', 'IGNORED', staff_membership_id
    );
    details := 'unexpected unpriced incident success';
  exception
    when check_violation then
      test_ok := true;
      details := 'inactive/unpriced rule rejected with 23514';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AF2_null_subject_name_rejected';
  test_ok := false;
  details := null;
  begin
    insert into public.fine_subjects (
      club_id, subject_type, staff_membership_id, display_name, active
    ) values (
      club_id_value, 'staff', staff_membership_id, null, true
    ) returning id into null_name_subject_id;

    begin
      insert into public.fines (
        club_id, incident_id, subject_id, subject_name_snapshot, original_amount
      ) values (
        club_id_value, individual_incident_id, null_name_subject_id, 'IGNORED', 9.00
      );
    exception
      when check_violation then
        test_ok := true;
    end;

    if not test_ok then
      raise exception 'Una multa acepto un sujeto sin display_name';
    end if;
    raise sqlstate 'P4307' using message = 'ROLLBACK_NULL_SUBJECT_TEST';
  exception
    when sqlstate 'P4307' then
      test_ok := true;
      details := 'fine_subject STAFF nullable accepted; fine creation rejected and rolled back';
    when others then
      get stacked diagnostics error_message = message_text;
      test_ok := false;
      details := error_message;
  end;
  return next;

  test_name := 'AG_occurred_on_must_be_inside_season';
  test_ok := false;
  begin
    insert into public.fine_incidents (
      club_id, season_id, fine_rule_id, incident_kind, occurred_on,
      rule_code_snapshot, reason_snapshot, created_by_membership_id
    ) values (
      club_id_value, season_id_value, individual_rule_id, 'individual', season_start - 1,
      'IGNORED', 'IGNORED', staff_membership_id
    );
    details := 'unexpected out-of-season incident success';
  exception
    when check_violation then
      test_ok := true;
      details := pg_catalog.format('%s rejected outside %s..%s', season_start - 1, season_start, season_end);
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AH_duplicate_subject_in_incident_rejected';
  test_ok := false;
  begin
    insert into public.fines (
      club_id, incident_id, subject_id, subject_name_snapshot, original_amount
    ) values (
      club_id_value, individual_incident_id, subject_a_id, 'IGNORED', 999.99
    );
    details := 'unexpected duplicate success';
  exception
    when unique_violation then
      test_ok := true;
      details := 'UNIQUE(incident_id, subject_id) rejected duplicate with 23505';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  ---------------------------------------------------------------------------
  -- Cancelacion estructural.
  ---------------------------------------------------------------------------
  test_name := 'AI_cancelled_requires_all_fields';
  test_ok := false;
  begin
    update public.fines
    set lifecycle_status = 'cancelled'
    where id = individual_fine_id;
    details := 'unexpected incomplete cancellation success';
  exception
    when check_violation then
      test_ok := true;
      details := 'cancelled without metadata rejected with 23514';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AJ_active_rejects_cancellation_fields';
  test_ok := false;
  begin
    update public.fines
    set
      cancelled_at = pg_catalog.now(),
      cancelled_by_membership_id = staff_membership_id,
      cancellation_reason = 'No procede'
    where id = individual_fine_id;
    details := 'unexpected active-with-cancellation success';
  exception
    when check_violation then
      test_ok := true;
      details := 'active with cancellation metadata rejected with 23514';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AK_valid_cancellation_reversible';
  test_ok := false;
  details := null;
  begin
    update public.fines
    set
      lifecycle_status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      cancelled_by_membership_id = staff_membership_id,
      cancellation_reason = 'Anulación de prueba'
    where id = individual_fine_id;

    if not exists (
      select 1
      from public.fines fine
      where fine.id = individual_fine_id
        and fine.lifecycle_status = 'cancelled'
        and fine.cancelled_at is not null
        and fine.cancelled_by_membership_id = staff_membership_id
        and fine.cancellation_reason = 'Anulación de prueba'
    ) then
      raise exception 'La cancelacion valida no quedo coherente';
    end if;

    raise sqlstate 'P4302' using message = 'ROLLBACK_VALID_CANCELLATION_TEST';
  exception
    when sqlstate 'P4302' then
      test_ok := true;
      details := 'valid cancellation accepted and rolled back';
    when others then
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  return next;

  ---------------------------------------------------------------------------
  -- Aislamiento cross-club completo, reversible en subtransaccion.
  ---------------------------------------------------------------------------
  season_cross_denied := false;
  rule_cross_denied := false;
  actor_cross_denied := false;
  incident_cross_denied := false;
  subject_cross_denied := false;
  canceller_cross_denied := false;
  error_message := null;
  begin
    insert into public.clubs (id, name)
    values (cross_club_id, 'BLOCK 4.3 CROSS CLUB TEST');

    insert into public.club_seasons (
      id, club_id, code, label, starts_on, ends_on, is_active
    ) values (
      cross_season_id, cross_club_id, 'VERIFY_43', 'VERIFY 4.3',
      date '2026-07-01', date '2027-06-30', true
    );

    insert into public.fine_rules (
      id, club_id, code, name, default_amount, pricing_mode,
      applies_to_players, applies_to_staff, collective_allowed, active, sort_order
    ) values (
      cross_rule_id, cross_club_id, 'VERIFY_CROSS_RULE', 'Regla cross-club', 4.00, 'fixed',
      true, true, false, true, 1
    );

    begin
      insert into public.fine_incidents (
        club_id, season_id, fine_rule_id, incident_kind, occurred_on,
        rule_code_snapshot, reason_snapshot, created_by_membership_id
      ) values (
        club_id_value, cross_season_id, individual_rule_id, 'individual', date '2026-09-04',
        'IGNORED', 'IGNORED', staff_membership_id
      );
    exception when check_violation then season_cross_denied := true;
    end;

    begin
      insert into public.fine_incidents (
        club_id, season_id, fine_rule_id, incident_kind, occurred_on,
        rule_code_snapshot, reason_snapshot, created_by_membership_id
      ) values (
        club_id_value, season_id_value, cross_rule_id, 'individual', date '2026-09-04',
        'IGNORED', 'IGNORED', staff_membership_id
      );
    exception when check_violation then rule_cross_denied := true;
    end;

    update public.club_memberships
    set club_id = cross_club_id
    where id = staff_membership_id;

    begin
      insert into public.fine_incidents (
        club_id, season_id, fine_rule_id, incident_kind, occurred_on,
        rule_code_snapshot, reason_snapshot, created_by_membership_id
      ) values (
        club_id_value, season_id_value, individual_rule_id, 'individual', date '2026-09-04',
        'IGNORED', 'IGNORED', staff_membership_id
      );
    exception when check_violation then actor_cross_denied := true;
    end;

    insert into public.fine_incidents (
      club_id, season_id, fine_rule_id, incident_kind, occurred_on,
      rule_code_snapshot, reason_snapshot, created_by_membership_id
    ) values (
      cross_club_id, cross_season_id, cross_rule_id, 'individual', date '2026-09-04',
      'IGNORED', 'IGNORED', staff_membership_id
    ) returning id into cross_incident_id;

    begin
      insert into public.fines (
        club_id, incident_id, subject_id, subject_name_snapshot, original_amount
      ) values (
        cross_club_id, individual_incident_id, subject_a_id, 'IGNORED', 9.00
      );
    exception when check_violation then incident_cross_denied := true;
    end;

    begin
      insert into public.fines (
        club_id, incident_id, subject_id, subject_name_snapshot, original_amount
      ) values (
        cross_club_id, cross_incident_id, subject_a_id, 'IGNORED', 9.00
      );
    exception when check_violation then subject_cross_denied := true;
    end;

    begin
      update public.fines
      set
        lifecycle_status = 'cancelled',
        cancelled_at = pg_catalog.now(),
        cancelled_by_membership_id = staff_membership_id,
        cancellation_reason = 'Cross-club test'
      where id = individual_fine_id;
    exception when check_violation then canceller_cross_denied := true;
    end;

    raise sqlstate 'P4303' using message = 'ROLLBACK_CROSS_CLUB_TESTS';
  exception
    when sqlstate 'P4303' then
      null;
    when others then
      get stacked diagnostics error_message = message_text;
  end;

  test_name := 'AL_cross_club_season_rejected';
  test_ok := season_cross_denied;
  details := coalesce(error_message, 'season.club_id mismatch rejected');
  return next;

  test_name := 'AM_cross_club_rule_rejected';
  test_ok := rule_cross_denied;
  details := coalesce(error_message, 'rule.club_id mismatch rejected');
  return next;

  test_name := 'AN_cross_club_actor_rejected';
  test_ok := actor_cross_denied;
  details := coalesce(error_message, 'created_by membership club mismatch rejected');
  return next;

  test_name := 'AO_cross_club_incident_link_rejected';
  test_ok := incident_cross_denied;
  details := coalesce(error_message, 'fine.club_id versus incident.club_id rejected');
  return next;

  test_name := 'AP_cross_club_subject_rejected';
  test_ok := subject_cross_denied;
  details := coalesce(error_message, 'fine subject club mismatch rejected');
  return next;

  test_name := 'AQ_cross_club_canceller_rejected';
  test_ok := canceller_cross_denied;
  details := coalesce(error_message, 'cancelled_by membership club mismatch rejected');
  return next;

  ---------------------------------------------------------------------------
  -- Seguridad funcional.
  ---------------------------------------------------------------------------
  select pg_catalog.count(*)::integer into expected_count from public.fine_incidents;
  select pg_catalog.count(*)::integer into observed_count from public.fines;

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_incidents from public.fine_incidents;
  select pg_catalog.count(*)::integer into visible_fines from public.fines;
  execute 'reset role';
  test_name := 'AR_staff_reads_own_club_financial_rows';
  test_ok := visible_incidents = expected_count and visible_fines = observed_count;
  details := pg_catalog.format(
    'incidents visible=%s/%s fines visible=%s/%s',
    visible_incidents, expected_count, visible_fines, observed_count
  );
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_incidents from public.fine_incidents;
  select pg_catalog.count(*)::integer into visible_fines from public.fines;
  execute 'reset role';
  test_name := 'AS_player_direct_select_zero';
  test_ok := player_membership_id is not null and visible_incidents = 0 and visible_fines = 0;
  details := pg_catalog.format('incidents=%s fines=%s', visible_incidents, visible_fines);
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
    select pg_catalog.count(*)::integer into visible_incidents from public.fine_incidents;
    select pg_catalog.count(*)::integer into visible_fines from public.fines;
    execute 'reset role';

    if visible_incidents <> 0 or visible_fines <> 0 then
      raise exception 'PLAYER con fines_manage obtuvo SELECT directo';
    end if;
    raise sqlstate 'P4304' using message = 'ROLLBACK_PLAYER_PERMISSION_TEST';
  exception
    when sqlstate 'P4304' then
      test_ok := true;
      details := 'incidents=0 fines=0; transient permission rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      details := error_message;
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
    select pg_catalog.count(*)::integer into visible_incidents from public.fine_incidents;
    select pg_catalog.count(*)::integer into visible_fines from public.fines;
    execute 'reset role';
    if visible_incidents <> 0 or visible_fines <> 0 then
      raise exception 'VIEWER obtuvo SELECT directo';
    end if;
    raise sqlstate 'P4305' using message = 'ROLLBACK_VIEWER_TEST';
  exception
    when sqlstate 'P4305' then
      test_ok := true;
      details := 'incidents=0 fines=0; transient role change rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_incidents from public.fine_incidents;
  select pg_catalog.count(*)::integer into visible_fines from public.fines;
  execute 'reset role';
  test_name := 'AV_uid_without_membership_zero';
  test_ok := visible_incidents = 0 and visible_fines = 0;
  details := pg_catalog.format('incidents=%s fines=%s', visible_incidents, visible_fines);
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  test_name := 'AW_anon_select_denied';
  test_ok := false;
  details := null;
  begin
    perform 1 from public.fine_incidents limit 1;
    details := 'unexpected incidents SELECT success';
  exception when insufficient_privilege then
    begin
      perform 1 from public.fines limit 1;
      details := 'unexpected fines SELECT success';
    exception when insufficient_privilege then
      test_ok := true;
      details := 'SELECT denied on both tables with 42501';
    end;
  end;
  execute 'reset role';
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
  select pg_catalog.count(*)::integer into visible_incidents from public.fine_incidents;
  select pg_catalog.count(*)::integer into visible_fines from public.fines;
  execute 'reset role';
  test_name := 'AX_service_role_reads_all_rows';
  test_ok := visible_incidents = expected_count and visible_fines = observed_count;
  details := pg_catalog.format('incidents=%s fines=%s', visible_incidents, visible_fines);
  return next;

  test_name := 'AY_service_role_incident_crud_reversible';
  test_ok := false;
  details := null;
  begin
    execute 'set local role service_role';
    insert into public.fine_incidents (
      club_id, season_id, fine_rule_id, incident_kind, occurred_on,
      rule_code_snapshot, reason_snapshot, created_by_membership_id
    ) values (
      club_id_value, season_id_value, individual_rule_id, 'individual', date '2026-09-05',
      'IGNORED', 'IGNORED', staff_membership_id
    ) returning id into cross_incident_id;
    update public.fine_incidents set note = 'Service role update' where id = cross_incident_id;
    delete from public.fine_incidents where id = cross_incident_id;
    execute 'reset role';
    raise sqlstate 'P4306' using message = 'ROLLBACK_SERVICE_ROLE_CRUD_TEST';
  exception
    when sqlstate 'P4306' then
      test_ok := true;
      details := 'service_role INSERT/UPDATE/DELETE accepted; rolled back';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  return next;

  incident_insert_denied := false;
  incident_update_denied := false;
  incident_delete_denied := false;
  fine_insert_denied := false;
  fine_update_denied := false;
  fine_delete_denied := false;
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  begin
    insert into public.fine_incidents (
      club_id, season_id, fine_rule_id, incident_kind, occurred_on,
      rule_code_snapshot, reason_snapshot, created_by_membership_id
    ) values (
      club_id_value, season_id_value, individual_rule_id, 'individual', date '2026-09-06',
      'IGNORED', 'IGNORED', staff_membership_id
    );
  exception when insufficient_privilege then incident_insert_denied := true;
  end;
  begin
    update public.fine_incidents set note = note where id = individual_incident_id;
  exception when insufficient_privilege then incident_update_denied := true;
  end;
  begin
    delete from public.fine_incidents where id = individual_incident_id;
  exception when insufficient_privilege then incident_delete_denied := true;
  end;
  begin
    insert into public.fines (
      club_id, incident_id, subject_id, subject_name_snapshot, original_amount
    ) values (
      club_id_value, collective_incident_id, subject_a_id, 'IGNORED', 1.00
    );
  exception when insufficient_privilege then fine_insert_denied := true;
  end;
  begin
    update public.fines set lifecycle_status = lifecycle_status where id = individual_fine_id;
  exception when insufficient_privilege then fine_update_denied := true;
  end;
  begin
    delete from public.fines where id = individual_fine_id;
  exception when insufficient_privilege then fine_delete_denied := true;
  end;
  execute 'reset role';
  test_name := 'AZ_authenticated_writes_denied';
  test_ok := incident_insert_denied
    and incident_update_denied
    and incident_delete_denied
    and fine_insert_denied
    and fine_update_denied
    and fine_delete_denied;
  details := pg_catalog.format(
    'incidents I/U/D=%s/%s/%s fines I/U/D=%s/%s/%s',
    incident_insert_denied,
    incident_update_denied,
    incident_delete_denied,
    fine_insert_denied,
    fine_update_denied,
    fine_delete_denied
  );
  return next;

  ---------------------------------------------------------------------------
  -- Regresion y limites del bloque.
  ---------------------------------------------------------------------------
  test_name := 'BA_block_4_1_objects_intact';
  test_ok := pg_catalog.to_regclass('public.club_seasons') is not null
    and pg_catalog.to_regclass('public.fine_subjects') is not null
    and pg_catalog.to_regprocedure('public.can_manage_fines()') is not null
    and pg_catalog.to_regprocedure('public.is_player()') is not null
    and pg_catalog.to_regprocedure('public.current_jugador_id()') is not null;
  details := '4.1 season, subjects, permission helper and PLAYER identity remain';
  return next;

  test_name := 'BB_block_4_2_catalog_intact';
  select pg_catalog.count(*)::integer into observed_count from public.fine_rules;
  test_ok := observed_count = 23;
  details := pg_catalog.format('fine_rules=%s expected=23', observed_count);
  return next;

  test_name := 'BC_no_real_fines_manage_assignment';
  select pg_catalog.count(*)::integer into observed_count
  from public.club_member_permissions permission
  where permission.permission_key = 'fines_manage';
  test_ok := observed_count = 0;
  details := 'persistent fines_manage rows=' || observed_count;
  return next;

  test_name := 'BD_no_payments_or_surcharge_schema';
  test_ok := pg_catalog.to_regclass('public.fine_payments') is null
    and not exists (
      select 1
      from information_schema.columns actual_column
      where actual_column.table_schema = 'public'
        and actual_column.table_name in ('fine_incidents', 'fines')
        and actual_column.column_name in (
          'paid', 'pending', 'partial', 'due_on', 'paid_at', 'payment_status',
          'surcharge', 'surcharge_amount', 'outstanding_amount', 'balance'
        )
    );
  details := 'fine_payments absent; payment/surcharge/balance columns absent';
  return next;

  test_name := 'BE_verifier_is_transactional';
  test_ok := true;
  details := 'all test incidents/fines and transient identity changes are removed by final ROLLBACK';
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$verify$;

select test_name, test_ok, details
from pg_temp.verify_fines_core();

rollback;
