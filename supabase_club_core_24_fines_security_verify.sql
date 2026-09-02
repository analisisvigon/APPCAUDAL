-- APPCAUDAL - Bloque 4.6
-- Auditoria final end-to-end del backend de Multas.
-- No persiste datos: ejecutar el archivo completo; la unica salida es la tabla final.

begin;

create temporary table fines_security_results (
  seq integer generated always as identity,
  test_name text not null,
  test_ok boolean not null,
  details text not null
) on commit drop;

create or replace function pg_temp.add_fines_security_check(
  p_name text,
  p_ok boolean,
  p_details text
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog
as $function$
  insert into pg_temp.fines_security_results (test_name, test_ok, details)
  values (p_name, coalesce(p_ok, false), coalesce(p_details, ''));
$function$;

-- Una fila por cada RPC publica: firma, owner, modo, volatilidad, search_path,
-- ACL exacta y guard de autoridad.
with expected(signature, volatility, guard_fragment) as (
  values
    ('public.get_fine_rules_for_management()', 's', 'require_fines_manager'),
    ('public.get_fine_subjects_for_management()', 's', 'require_fines_manager'),
    ('public.create_fine_individual(uuid,uuid,date,text)', 'v', 'require_fines_manager'),
    ('public.create_fine_collective(uuid,uuid[],date,text)', 'v', 'require_fines_manager'),
    ('public.cancel_fine(uuid,text)', 'v', 'require_fines_manager'),
    ('public.record_fine_payment(uuid,numeric,date,text)', 'v', 'require_fines_manager'),
    ('public.record_fine_refund(uuid,numeric,date,text)', 'v', 'require_fines_manager'),
    ('public.get_my_fines(integer,integer)', 's', 'public.is_player()'),
    ('public.get_my_fines_summary()', 's', 'public.is_player()'),
    ('public.get_fines_management_list(text,integer,integer,text)', 's', 'require_fines_manager'),
    ('public.get_fines_financial_summary(text)', 's', 'require_fines_manager'),
    ('public.get_fines_subject_summary(text)', 's', 'require_fines_manager')
), audited as (
  select expected.*, procedure_row.*
  from expected
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
)
select pg_temp.add_fines_security_check(
  'RPC_' || audited.signature,
  audited.oid is not null
    and pg_catalog.pg_get_userbyid(audited.proowner) = 'postgres'
    and audited.prosecdef
    and audited.provolatile = audited.volatility::"char"
    and audited.proconfig = array['search_path=pg_catalog']::text[]
    and pg_catalog.strpos(audited.prosrc, audited.guard_fragment) > 0
    and not pg_catalog.has_function_privilege('anon', audited.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', audited.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', audited.oid, 'EXECUTE')
    and not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(audited.proacl, pg_catalog.acldefault('f', audited.proowner))
      ) acl
      where acl.privilege_type = 'EXECUTE'
        and acl.grantee not in (
          audited.proowner,
          (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'authenticated'),
          (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'service_role')
        )
    ),
  'owner=postgres; definer; volatility=' || audited.volatility
    || '; pg_catalog; EXECUTE owner/authenticated/service_role only'
)
from audited;

-- Una fila por helper interno. client_execute=false significa que ni PUBLIC,
-- anon ni authenticated pueden convertir el helper en una via lateral.
with expected(signature, volatility, security_definer, authenticated_execute, service_execute) as (
  values
    ('public.can_manage_fines()', 's', false, true, true),
    ('public.guard_fine_subject_identity()', 'v', true, false, false),
    ('public.guard_fine_incident_integrity()', 'v', true, false, false),
    ('public.guard_fine_integrity()', 'v', true, false, false),
    ('public.guard_fine_financial_integrity()', 'v', true, false, false),
    ('public.apply_fine_surcharge_if_due(uuid)', 'v', true, false, true),
    ('public.guard_fine_payment_integrity()', 'v', true, false, false),
    ('public.get_fine_financial_totals(uuid)', 's', true, false, true),
    ('public.require_fines_manager()', 's', true, false, false),
    ('public.resolve_fines_season(uuid,date,text)', 's', true, false, false)
), audited as (
  select expected.*, procedure_row.*
  from expected
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
)
select pg_temp.add_fines_security_check(
  'HELPER_' || audited.signature,
  audited.oid is not null
    and pg_catalog.pg_get_userbyid(audited.proowner) = 'postgres'
    and audited.prosecdef = audited.security_definer
    and audited.provolatile = audited.volatility::"char"
    and audited.proconfig = array['search_path=pg_catalog']::text[]
    and not pg_catalog.has_function_privilege('anon', audited.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', audited.oid, 'EXECUTE') = audited.authenticated_execute
    and pg_catalog.has_function_privilege('service_role', audited.oid, 'EXECUTE') = audited.service_execute
    and not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(audited.proacl, pg_catalog.acldefault('f', audited.proowner))
      ) acl
      where acl.privilege_type = 'EXECUTE'
        and acl.grantee not in (
          audited.proowner,
          case when audited.authenticated_execute then
            (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'authenticated')
          else audited.proowner end,
          case when audited.service_execute then
            (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'service_role')
          else audited.proowner end
        )
    ),
  'owner/search_path/volatility/ACL internal contract'
)
from audited;

-- Inventario de tablas, owners y RLS.
with expected(table_name, minimum_columns, rls_required) as (
  values
    ('club_seasons', 9, true),
    ('club_member_permissions', 4, true),
    ('fine_subjects', 9, true),
    ('fine_rules', 14, true),
    ('fine_incidents', 12, true),
    ('fines', 16, true),
    ('fine_payments', 8, true)
)
select pg_temp.add_fines_security_check(
  'TABLE_public.' || expected.table_name,
  relation.oid is not null
    and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
    and relation.relrowsecurity = expected.rls_required
    and (
      select pg_catalog.count(*)
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = relation.oid
        and attribute.attnum > 0 and not attribute.attisdropped
    ) >= expected.minimum_columns,
  'exists; owner=postgres; RLS=' || expected.rls_required::text
)
from expected
left join pg_catalog.pg_class relation
  on relation.oid = pg_catalog.to_regclass('public.' || expected.table_name);

-- ACL directa exacta de las seis tablas del dominio. Authenticated solo SELECT;
-- anon/PUBLIC nada; service_role mantiene infraestructura CRUD.
with expected(table_name) as (
  values ('club_seasons'), ('fine_subjects'), ('fine_rules'),
         ('fine_incidents'), ('fines'), ('fine_payments')
)
select pg_temp.add_fines_security_check(
  'TABLE_ACL_public.' || expected.table_name,
  pg_catalog.has_table_privilege('authenticated', 'public.' || expected.table_name, 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.' || expected.table_name, 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.' || expected.table_name, 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.' || expected.table_name, 'DELETE')
    and not pg_catalog.has_table_privilege('anon', 'public.' || expected.table_name, 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.' || expected.table_name, 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.' || expected.table_name, 'INSERT')
    and pg_catalog.has_table_privilege('service_role', 'public.' || expected.table_name, 'UPDATE')
    and pg_catalog.has_table_privilege('service_role', 'public.' || expected.table_name, 'DELETE')
    and not exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) acl
      where relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
        and acl.grantee = 0
    ),
  'authenticated SELECT only; anon/PUBLIC none; service_role CRUD'
)
from expected;

-- RLS: una sola policy STAFF SELECT por tabla, sin policy PLAYER ni writes.
with expected(table_name) as (
  values ('club_seasons'), ('fine_subjects'), ('fine_rules'),
         ('fine_incidents'), ('fines'), ('fine_payments')
)
select pg_temp.add_fines_security_check(
  'RLS_public.' || expected.table_name,
  (
    select pg_catalog.count(*) = 1
      and pg_catalog.bool_and(policy.polcmd = 'r')
      and pg_catalog.bool_and(
        pg_catalog.strpos(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), 'is_app_staff()') > 0
      )
    from pg_catalog.pg_policy policy
    where policy.polrelid = pg_catalog.to_regclass('public.' || expected.table_name)
  ),
  'exactly one authenticated STAFF SELECT policy'
)
from expected;

do $verify$
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
  no_membership_user_id constant uuid := 'b4600000-0000-4000-8000-000000000099'::uuid;
  subject_a uuid;
  subject_b uuid;
  subject_c uuid;
  staff_subject uuid;
  rule_ten uuid;
  rule_collective uuid;
  rule_unpriced uuid;
  rule_player_only uuid;
  rule_staff_allowed uuid;
  original_rule_name text;
  original_rule_amount numeric(10,2);
  fine_main uuid;
  fine_other uuid;
  fine_cancel uuid;
  fine_blank_note uuid;
  fine_staff uuid;
  collective_incident uuid;
  collective_count integer;
  due_first uuid;
  due_last uuid;
  due_feb uuid;
  surcharge_fine uuid;
  surcharge_cancel_fine uuid;
  backdated_fine uuid;
  refund_reopen_fine uuid;
  payment_id_value uuid;
  result_row record;
  summary_row record;
  manager_summary record;
  own_rows integer;
  admin_own_rows integer;
  other_visible integer;
  denied_count integer;
  visible_count integer;
  ok_one boolean;
  ok_two boolean;
  ok_three boolean;
  cap_identity boolean := false;
  cap_management boolean := false;
  cap_direct_zero boolean := false;
  cap_own boolean := false;
  cap_writes_denied boolean := false;
  viewer_denied boolean := false;
  cross_denied boolean := false;
  cross_no_leak boolean := false;
  cross_club uuid := 'b4600000-0000-4000-8000-000000000045'::uuid;
  cross_season uuid := 'b4600000-0000-4000-8000-000000000046'::uuid;
  cross_rule uuid := 'b4600000-0000-4000-8000-000000000047'::uuid;
  cross_subject uuid;
  cross_fine uuid;
  cross_incident uuid;
  error_text text := '';
begin
  select club.id into club_id_value from public.clubs club order by club.id limit 1;
  select season.id, season.code into season_id_value, season_code_value
  from public.club_seasons season
  where season.club_id = club_id_value
    and season.starts_on <= current_date and season.ends_on >= current_date;
  select membership.id, membership.user_id into staff_membership_id, staff_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value and membership.role = 'staff' and membership.is_active
  order by membership.id limit 1;
  select membership.user_id into owner_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value and membership.role = 'owner' and membership.is_active
  order by membership.id limit 1;
  select membership.id into player_membership_id
  from public.club_memberships membership
  where membership.user_id = player_user_id and membership.jugador_id = player_jugador_id
    and membership.role = 'player' and membership.is_active;
  select subject.id into subject_a from public.fine_subjects subject
  where subject.club_id = club_id_value and subject.jugador_id = player_jugador_id and subject.active;
  select (pg_catalog.array_agg(subject.id order by subject.id))[1],
         (pg_catalog.array_agg(subject.id order by subject.id))[2]
  into subject_b, subject_c
  from public.fine_subjects subject
  where subject.club_id = club_id_value and subject.subject_type = 'player'
    and subject.id <> subject_a and subject.active;
  select rule.id, rule.name, rule.default_amount
  into rule_ten, original_rule_name, original_rule_amount
  from public.fine_rules rule where rule.club_id = club_id_value and rule.code = 'MATCH_ABSENCE';
  select rule.id into rule_collective from public.fine_rules rule
  where rule.club_id = club_id_value and rule.code = 'LOCKER_BAD_STATE_COLLECTIVE';
  select rule.id into rule_unpriced from public.fine_rules rule
  where rule.club_id = club_id_value and rule.code = 'TRAINING_EXIT_DELAY_AFTER_TALK';
  select rule.id into rule_player_only from public.fine_rules rule
  where rule.club_id = club_id_value and rule.active and rule.default_amount is not null
    and rule.applies_to_players and not rule.applies_to_staff order by rule.sort_order limit 1;
  select rule.id into rule_staff_allowed from public.fine_rules rule
  where rule.club_id = club_id_value and rule.active and rule.default_amount is not null
    and rule.applies_to_staff order by rule.sort_order limit 1;

  perform pg_temp.add_fines_security_check('INVENTORY_required_identities',
    club_id_value is not null and season_id_value is not null and staff_membership_id is not null
      and owner_user_id is not null and player_membership_id is not null
      and subject_a is not null and subject_b is not null and subject_c is not null,
    'club, season, STAFF, OWNER, Borja and three PLAYER subjects');
  perform pg_temp.add_fines_security_check('INVENTORY_23_rules',
    (select pg_catalog.count(*) = 23 from public.fine_rules), 'exactly 23 rules');
  perform pg_temp.add_fines_security_check('INVENTORY_financial_tables_initially_empty',
    (select pg_catalog.count(*) = 0 from public.fine_incidents)
      and (select pg_catalog.count(*) = 0 from public.fines)
      and (select pg_catalog.count(*) = 0 from public.fine_payments),
    'no production fine data before fixtures');
  perform pg_temp.add_fines_security_check('INVENTORY_no_real_fines_manage',
    not exists (select 1 from public.club_member_permissions permission where permission.permission_key = 'fines_manage'),
    'persistent fines_manage count=0');
  perform pg_temp.add_fines_security_check('INVENTORY_no_captain_role',
    not exists (select 1 from public.club_memberships membership where membership.role = 'captain'),
    'captain remains PLAYER + permission, never a role');
  perform pg_temp.add_fines_security_check('INVENTORY_no_expenses',
    pg_catalog.to_regclass('public.fine_fund_expenses') is null, 'no expenses/cash schema');
  perform pg_temp.add_fines_security_check('INVENTORY_no_cron',
    not exists (select 1 from pg_catalog.pg_proc procedure_row
      where procedure_row.pronamespace = 'public'::regnamespace
        and pg_catalog.strpos(pg_catalog.lower(procedure_row.prosrc), 'pg_cron') > 0),
    'no cron dependency in public functions');
  perform pg_temp.add_fines_security_check('INVENTORY_required_triggers',
    (select pg_catalog.count(*) = 8 from pg_catalog.pg_trigger trigger_row
      where not trigger_row.tgisinternal and trigger_row.tgenabled = 'O'
        and trigger_row.tgname in (
          'guard_fine_subject_identity','set_fine_subjects_updated_at','set_fine_rules_updated_at',
          'guard_fine_incident_integrity','guard_fine_integrity','guard_fine_financial_integrity',
          'guard_fine_payment_integrity','apply_fine_surcharge_after_refund'
        )), 'all integrity and financial triggers enabled');
  perform pg_temp.add_fines_security_check('INVENTORY_no_destructive_fks',
    not exists (select 1 from pg_catalog.pg_constraint constraint_row
      where constraint_row.contype = 'f'
        and constraint_row.conrelid in (
          'public.club_seasons'::regclass,'public.fine_subjects'::regclass,
          'public.fine_rules'::regclass,'public.fine_incidents'::regclass,
          'public.fines'::regclass,'public.fine_payments'::regclass
        ) and constraint_row.confdeltype = 'c'), 'all domain FKs avoid ON DELETE CASCADE');
  perform pg_temp.add_fines_security_check('INVENTORY_indexes_present',
    (select pg_catalog.count(*) >= 13 from pg_catalog.pg_index index_row
      where index_row.indrelid in (
        'public.club_seasons'::regclass,'public.fine_subjects'::regclass,
        'public.fine_rules'::regclass,'public.fine_incidents'::regclass,
        'public.fines'::regclass,'public.fine_payments'::regclass
      ) and index_row.indisvalid), 'PK/unique/query indexes valid');
  perform pg_temp.add_fines_security_check('RPC_no_client_actor_or_club_arguments',
    not exists (
      select 1 from pg_catalog.pg_proc procedure_row
      cross join lateral pg_catalog.generate_subscripts(procedure_row.proargnames, 1) argument(position)
      where procedure_row.pronamespace = 'public'::regnamespace
        and procedure_row.proname in (
          'create_fine_individual','create_fine_collective','cancel_fine',
          'record_fine_payment','record_fine_refund'
        ) and procedure_row.proargmodes[argument.position] in ('i','b')
        and procedure_row.proargnames[argument.position] in ('p_club_id','p_season_id','p_created_by_membership_id',
          'p_recorded_by_membership_id','p_cancelled_by_membership_id')
    ), 'club, season and actor cannot be supplied by clients');
  perform pg_temp.add_fines_security_check('DTO_no_sensitive_output_identifiers',
    not exists (
      select 1 from pg_catalog.pg_proc procedure_row
      cross join lateral pg_catalog.generate_subscripts(procedure_row.proargnames, 1) argument(position)
      where procedure_row.oid in (
        'public.get_my_fines(integer,integer)'::regprocedure,
        'public.get_my_fines_summary()'::regprocedure,
        'public.get_fines_management_list(text,integer,integer,text)'::regprocedure,
        'public.get_fines_financial_summary(text)'::regprocedure,
        'public.get_fines_subject_summary(text)'::regprocedure
      ) and procedure_row.proargmodes[argument.position] in ('o','t','b')
        and procedure_row.proargnames[argument.position] in ('club_id','membership_id','user_id','auth_uid','subject_id','jugador_id',
          'staff_membership_id','created_by_membership_id','cancelled_by_membership_id','recorded_by_membership_id')
    ), 'PLAYER and management read DTOs expose no identity/actor internals');
  perform pg_temp.add_fines_security_check('DTO_no_internal_note_column',
    not exists (select 1 from information_schema.columns column_row
      where column_row.table_schema = 'public' and column_row.table_name = 'fine_incidents'
        and column_row.column_name = 'internal_note'), 'note is documented PLAYER-visible; no accidental internal_note');
  perform pg_temp.add_fines_security_check('CONCURRENCY_locking_contract',
    pg_catalog.strpos((select procedure_row.prosrc from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = 'public.apply_fine_surcharge_if_due(uuid)'::regprocedure), 'for update') > 0
    and pg_catalog.strpos((select procedure_row.prosrc from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = 'public.guard_fine_payment_integrity()'::regprocedure), 'for update') > 0,
    'fine row locking serializes surcharge/payment/refund');
  perform pg_temp.add_fines_security_check('CONCURRENCY_overpayment_contract',
    pg_catalog.strpos((select procedure_row.prosrc from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = 'public.guard_fine_payment_integrity()'::regprocedure),
      'collected_before + new.amount > generated_amount') > 0,
    'overpayment checked while fine row is locked');
  perform pg_temp.add_fines_security_check('CONCURRENCY_refund_contract',
    pg_catalog.strpos((select procedure_row.prosrc from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = 'public.guard_fine_payment_integrity()'::regprocedure),
      'new.amount > collected_before') > 0,
    'refund cannot exceed serialized net collected');

  -- Reversible STAFF subject and reversible 10 EUR rule fixture.
  insert into public.fine_subjects (club_id,subject_type,staff_membership_id,display_name,active)
  values (club_id_value,'staff',staff_membership_id,'STAFF VERIFY 4.6',true)
  returning id into staff_subject;
  update public.fine_rules set default_amount = 10.00 where id = rule_ten;

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  perform pg_temp.add_fines_security_check('STAFF_authority', public.can_manage_fines(), 'real STAFF can_manage_fines=true');
  perform pg_temp.add_fines_security_check('STAFF_catalog_rpc',
    (select pg_catalog.count(*) > 0 from public.get_fine_rules_for_management()), 'priced active rules visible via RPC');
  perform pg_temp.add_fines_security_check('STAFF_subjects_rpc',
    (select pg_catalog.count(*) >= 4 from public.get_fine_subjects_for_management()), 'three PLAYER plus reversible STAFF subject');
  select created.fine_id into fine_main
  from public.create_fine_individual(rule_ten, subject_a, current_date, '  visible note  ') created;
  execute 'reset role';

  perform pg_temp.add_fines_security_check('INDIVIDUAL_one_incident_one_fine',
    (select pg_catalog.count(*) = 1 from public.fines fine where fine.id = fine_main)
      and (select pg_catalog.count(*) = 1 from public.fine_incidents incident
        join public.fines fine on fine.incident_id = incident.id where fine.id = fine_main),
    'one incident and one fine');
  perform pg_temp.add_fines_security_check('INDIVIDUAL_backend_derived_identity',
    (select incident.club_id = club_id_value and incident.season_id = season_id_value
       and incident.created_by_membership_id = staff_membership_id
     from public.fine_incidents incident join public.fines fine on fine.incident_id = incident.id
     where fine.id = fine_main), 'club, season and actor backend-derived');
  perform pg_temp.add_fines_security_check('INDIVIDUAL_snapshots_amount_currency',
    (select incident.incident_kind = 'individual' and incident.reason_snapshot = original_rule_name
       and fine.subject_name_snapshot is not null and fine.original_amount = 10.00 and fine.currency = 'EUR'
     from public.fines fine join public.fine_incidents incident on incident.id = fine.incident_id
     where fine.id = fine_main), 'individual/snapshots/10.00/EUR');
  perform pg_temp.add_fines_security_check('NOTE_trimmed',
    (select incident.note = 'visible note' from public.fine_incidents incident
      join public.fines fine on fine.incident_id = incident.id where fine.id = fine_main), 'outer whitespace removed');

  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  execute 'set local role authenticated';
  select created.fine_id into fine_blank_note
  from public.create_fine_individual(rule_ten, subject_b, current_date, '   ') created;
  select created.fine_id into fine_other
  from public.create_fine_individual(rule_ten, subject_b, current_date, null) created;
  select created.fine_id into fine_cancel
  from public.create_fine_individual(rule_ten, subject_a, current_date, null) created;
  select created.fine_id into fine_staff
  from public.create_fine_individual(rule_staff_allowed, staff_subject, current_date, null) created;
  execute 'reset role';
  perform pg_temp.add_fines_security_check('NOTE_blank_becomes_null',
    (select incident.note is null from public.fine_incidents incident
      join public.fines fine on fine.incident_id = incident.id where fine.id = fine_blank_note), 'blank note stored NULL');
  ok_one := false;
  begin
    execute 'set local role authenticated';
    perform 1 from public.create_fine_individual(rule_ten,subject_a,current_date,pg_catalog.repeat('x',501));
    execute 'reset role';
  exception when string_data_right_truncation then execute 'reset role'; ok_one := true; end;
  perform pg_temp.add_fines_security_check('NOTE_over_500_rejected', ok_one, '501 characters rejected');

  -- Due date is derived from occurred_on, not created_at.
  execute 'set local role authenticated';
  select created.fine_id into due_first from public.create_fine_individual(rule_ten,subject_a,date '2026-09-01',null) created;
  select created.fine_id into due_last from public.create_fine_individual(rule_ten,subject_b,date '2026-09-30',null) created;
  select created.fine_id into due_feb from public.create_fine_individual(rule_ten,subject_c,date '2027-02-15',null) created;
  execute 'reset role';
  perform pg_temp.add_fines_security_check('DUE_ON_2026_09_01',
    (select fine.due_on = date '2026-09-30' from public.fines fine where fine.id = due_first), '01/09 -> 30/09');
  perform pg_temp.add_fines_security_check('DUE_ON_2026_09_30',
    (select fine.due_on = date '2026-09-30' from public.fines fine where fine.id = due_last), '30/09 -> 30/09');
  perform pg_temp.add_fines_security_check('DUE_ON_2027_02_15',
    (select fine.due_on = date '2027-02-28' from public.fines fine where fine.id = due_feb), '15/02 -> 28/02');

  -- Collective: three independent balances plus validation failures.
  execute 'set local role authenticated';
  select created.incident_id into collective_incident
  from public.create_fine_collective(rule_collective,array[subject_a,subject_b,subject_c],current_date,'three') created;
  execute 'reset role';
  select pg_catalog.count(*) into collective_count from public.fines fine where fine.incident_id = collective_incident;
  perform pg_temp.add_fines_security_check('COLLECTIVE_one_incident_three_fines',
    collective_count = 3 and (select incident.incident_kind = 'collective' from public.fine_incidents incident where incident.id = collective_incident),
    'one collective incident, three fines');
  perform pg_temp.add_fines_security_check('COLLECTIVE_independent_balances',
    (select pg_catalog.count(distinct totals.fine_id) = 3 and pg_catalog.sum(totals.generated_amount) = 3.00
     from public.fines fine cross join lateral public.get_fine_financial_totals(fine.id) totals
     where fine.incident_id = collective_incident), 'three fine IDs; generated total=sum individual');
  ok_one := false; ok_two := false; ok_three := false;
  begin execute 'set local role authenticated'; perform 1 from public.create_fine_collective(rule_collective,array[subject_a,subject_a],current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_one := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.create_fine_collective(rule_collective,array[]::uuid[],current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_two := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.create_fine_collective(rule_collective,pg_catalog.array_fill(subject_a,array[101]),current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_three := true; end;
  perform pg_temp.add_fines_security_check('COLLECTIVE_duplicate_rejected', ok_one, 'duplicate UUID rejected');
  perform pg_temp.add_fines_security_check('COLLECTIVE_empty_rejected', ok_two, 'empty array rejected');
  perform pg_temp.add_fines_security_check('COLLECTIVE_over_100_rejected', ok_three, '101 subjects rejected');

  ok_one := false; ok_two := false; ok_three := false;
  begin execute 'set local role authenticated'; perform 1 from public.create_fine_individual(rule_player_only,staff_subject,current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_one := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.create_fine_individual(rule_unpriced,subject_a,current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_two := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.create_fine_collective(rule_unpriced,array[subject_a],current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_three := true; end;
  perform pg_temp.add_fines_security_check('APPLICABILITY_player_only_rejects_staff', ok_one, 'reversible STAFF subject rejected');
  perform pg_temp.add_fines_security_check('APPLICABILITY_staff_allowed_valid', fine_staff is not null, 'reliable STAFF subject accepted by applicable rule');
  perform pg_temp.add_fines_security_check('UNPRICED_absent_from_catalog',
    not exists (select 1 from public.get_fine_rules_for_management() catalog where catalog.fine_rule_id = rule_unpriced), 'unpriced rule omitted');
  perform pg_temp.add_fines_security_check('UNPRICED_individual_rejected', ok_two, 'known UUID rejected');
  perform pg_temp.add_fines_security_check('UNPRICED_collective_rejected', ok_three, 'known UUID rejected');

  -- STAFF payment 4 + 6 + refund 3 and cancellation lifecycle.
  execute 'set local role authenticated';
  select * into result_row from public.record_fine_payment(fine_main,4.00,current_date,null);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('PAYMENT_4_partial',
    result_row.generated_amount = 10 and result_row.collected_amount = 4
      and result_row.pending_amount = 6 and result_row.financial_status = 'partial', '10/4/6 partial');
  execute 'set local role authenticated';
  select * into result_row from public.record_fine_payment(fine_main,6.00,current_date,null);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('PAYMENT_6_paid',
    result_row.collected_amount = 10 and result_row.pending_amount = 0 and result_row.financial_status = 'paid', '10 collected; paid');
  ok_one := false;
  begin execute 'set local role authenticated'; perform 1 from public.record_fine_payment(fine_main,0.01,current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_one := true; end;
  perform pg_temp.add_fines_security_check('PAYMENT_overpayment_rejected', ok_one, 'extra cent rejected');
  execute 'set local role authenticated';
  select * into result_row from public.record_fine_refund(fine_main,3.00,current_date,null);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('REFUND_3_partial',
    result_row.collected_amount = 7 and result_row.pending_amount = 3 and result_row.financial_status = 'partial', 'paid 10 -> refund 3 -> 7/3 partial');
  ok_one := false;
  begin execute 'set local role authenticated'; perform 1 from public.record_fine_refund(fine_main,7.01,current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_one := true; end;
  perform pg_temp.add_fines_security_check('REFUND_above_net_rejected', ok_one, 'refund >7 rejected');

  execute 'set local role authenticated';
  select * into result_row from public.cancel_fine(fine_cancel,' cancelled ');
  execute 'reset role';
  perform pg_temp.add_fines_security_check('CANCEL_zero_collected_ok',
    result_row.lifecycle_status = 'cancelled' and result_row.cancellation_reason = 'cancelled', 'active zero-collected cancelled');
  ok_one := false; ok_two := false; ok_three := false;
  begin execute 'set local role authenticated'; perform 1 from public.cancel_fine(fine_cancel,'again'); execute 'reset role'; exception when others then execute 'reset role'; ok_one := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.cancel_fine(fine_main,'money'); execute 'reset role'; exception when others then execute 'reset role'; ok_two := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.cancel_fine(fine_other,' '); execute 'reset role'; exception when others then execute 'reset role'; ok_three := true; end;
  perform pg_temp.add_fines_security_check('CANCEL_double_rejected', ok_one, 'already cancelled rejected');
  perform pg_temp.add_fines_security_check('CANCEL_collected_rejected', ok_two, 'net collected nonzero rejected');
  perform pg_temp.add_fines_security_check('CANCEL_blank_reason_rejected', ok_three, 'blank reason rejected');
  ok_one := false; ok_two := false;
  begin execute 'set local role authenticated'; perform 1 from public.record_fine_payment(fine_cancel,1,current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_one := true; end;
  begin execute 'set local role authenticated'; perform 1 from public.record_fine_refund(fine_cancel,1,current_date,null); execute 'reset role'; exception when others then execute 'reset role'; ok_two := true; end;
  perform pg_temp.add_fines_security_check('CANCELLED_no_new_movements', ok_one and ok_two, 'payment/refund both rejected');

  -- Ledger immutability even for owner-level direct SQL.
  select movement.id into payment_id_value from public.fine_payments movement where movement.fine_id = fine_main order by movement.created_at limit 1;
  ok_one := false; ok_two := false;
  begin update public.fine_payments set amount = amount where id = payment_id_value; exception when check_violation then ok_one := true; end;
  begin delete from public.fine_payments where id = payment_id_value; exception when check_violation then ok_two := true; end;
  perform pg_temp.add_fines_security_check('LEDGER_update_immutable', ok_one, 'trigger rejects UPDATE');
  perform pg_temp.add_fines_security_check('LEDGER_delete_immutable', ok_two, 'trigger rejects DELETE; correction is refund');

  -- Surcharge on original outstanding, once, backdating and refund-reopen.
  execute 'set local role authenticated';
  select created.fine_id into surcharge_fine from public.create_fine_individual(rule_ten,subject_a,date '2026-08-01',null) created;
  execute 'reset role';
  alter table public.fine_payments disable trigger guard_fine_payment_integrity;
  insert into public.fine_payments (club_id,fine_id,payment_kind,amount,paid_on,recorded_by_membership_id)
  values (club_id_value,surcharge_fine,'payment',6,date '2026-08-15',staff_membership_id);
  alter table public.fine_payments enable trigger guard_fine_payment_integrity;
  select public.apply_fine_surcharge_if_due(surcharge_fine) into ok_one;
  select public.apply_fine_surcharge_if_due(surcharge_fine) into ok_two;
  select * into result_row from public.get_fine_financial_totals(surcharge_fine);
  perform pg_temp.add_fines_security_check('SURCHARGE_original_outstanding',
    ok_one and result_row.surcharge_amount = 2 and result_row.generated_amount = 12
      and result_row.collected_amount = 6 and result_row.pending_amount = 6,
    'original 10; paid 6; base 4; surcharge 2; generated 12; pending 6');
  perform pg_temp.add_fines_security_check('SURCHARGE_once', not ok_two and result_row.surcharge_amount = 2, 'second application is no-op');

  execute 'set local role authenticated';
  select created.fine_id into backdated_fine from public.create_fine_individual(rule_ten,subject_b,date '2026-08-01',null) created;
  select * into result_row from public.record_fine_payment(backdated_fine,10,date '2026-08-15',null);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('SURCHARGE_backdating_cannot_evade',
    result_row.generated_amount = 15 and result_row.collected_amount = 10 and result_row.pending_amount = 5,
    'backdated paid_on still applies current overdue surcharge');

  execute 'set local role authenticated';
  select created.fine_id into refund_reopen_fine from public.create_fine_individual(rule_ten,subject_c,date '2026-08-01',null) created;
  execute 'reset role';
  alter table public.fine_payments disable trigger guard_fine_payment_integrity;
  insert into public.fine_payments (club_id,fine_id,payment_kind,amount,paid_on,recorded_by_membership_id)
  values (club_id_value,refund_reopen_fine,'payment',10,date '2026-08-15',staff_membership_id);
  alter table public.fine_payments enable trigger guard_fine_payment_integrity;
  execute 'set local role authenticated';
  select * into result_row from public.record_fine_refund(refund_reopen_fine,3,current_date,null);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('SURCHARGE_refund_reopens_debt',
    result_row.surcharge_amount = 1.50 and result_row.generated_amount = 11.50
      and result_row.collected_amount = 7 and result_row.pending_amount = 4.50,
    'refund 3 reopens base 3 and materializes surcharge 1.50 once');

  execute 'set local role authenticated';
  select created.fine_id into surcharge_cancel_fine from public.create_fine_individual(rule_ten,subject_c,date '2026-08-01',null) created;
  execute 'reset role';
  perform public.apply_fine_surcharge_if_due(surcharge_cancel_fine);
  execute 'set local role authenticated';
  perform 1 from public.cancel_fine(surcharge_cancel_fine,'surcharge no cash');
  execute 'reset role';
  perform pg_temp.add_fines_security_check('CANCELLED_with_surcharge_zero_cash',
    (select fine.lifecycle_status = 'cancelled' and fine.surcharge_amount = 5 from public.fines fine where fine.id = surcharge_cancel_fine),
    'cancel allowed; surcharge snapshot retained');

  -- Snapshots survive live catalogue/subject changes.
  update public.fine_rules set name = 'TEMP CHANGED', default_amount = 11 where id = rule_ten;
  update public.fine_subjects set display_name = 'TEMP STAFF CHANGED' where id = staff_subject;
  perform pg_temp.add_fines_security_check('SNAPSHOT_rule_immutable',
    (select incident.reason_snapshot = original_rule_name from public.fine_incidents incident
      join public.fines fine on fine.incident_id = incident.id where fine.id = fine_main), 'live rule name change does not rewrite incident');
  perform pg_temp.add_fines_security_check('SNAPSHOT_amount_immutable',
    (select fine.original_amount = 10 from public.fines fine where fine.id = fine_main), 'live default amount change does not rewrite fine');
  perform pg_temp.add_fines_security_check('SNAPSHOT_subject_immutable',
    (select fine.subject_name_snapshot = 'STAFF VERIFY 4.6' from public.fines fine where fine.id = fine_staff), 'live subject name change does not rewrite fine');
  update public.fine_rules set name = original_rule_name, default_amount = 10 where id = rule_ten;
  update public.fine_subjects set display_name = 'STAFF VERIFY 4.6' where id = staff_subject;

  -- STAFF lists and summaries match administrative baselines.
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  execute 'set local role authenticated';
  select * into manager_summary from public.get_fines_financial_summary(season_code_value);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('SUMMARY_financial_counts',
    (select manager_summary.total_fines = pg_catalog.count(*)
      and manager_summary.active_fines = pg_catalog.count(*) filter (where fine.lifecycle_status = 'active')
      and manager_summary.cancelled_fines = pg_catalog.count(*) filter (where fine.lifecycle_status = 'cancelled')
     from public.fines fine join public.fine_incidents incident on incident.id = fine.incident_id
     where fine.club_id = club_id_value and incident.season_id = season_id_value), 'season counts match backend baseline');
  perform pg_temp.add_fines_security_check('SUMMARY_financial_amounts',
    (select manager_summary.original_total = coalesce(pg_catalog.sum(fine.original_amount),0)
      and manager_summary.surcharge_total = coalesce(pg_catalog.sum(fine.surcharge_amount),0)
      and manager_summary.generated_total = coalesce(pg_catalog.sum(totals.generated_amount),0)
      and manager_summary.collected_total = coalesce(pg_catalog.sum(totals.collected_amount),0)
      and manager_summary.pending_total = coalesce(pg_catalog.sum(totals.pending_amount),0)
     from public.fines fine join public.fine_incidents incident on incident.id = fine.incident_id
     cross join lateral public.get_fine_financial_totals(fine.id) totals
     where fine.club_id = club_id_value and incident.season_id = season_id_value and fine.lifecycle_status = 'active'),
    'active-only amounts match baseline');
  execute 'set local role authenticated';
  select pg_catalog.count(*) into visible_count from public.get_fines_subject_summary(season_code_value);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('SUMMARY_subject_three_or_more', visible_count >= 3, 'ranking aggregates at least three subjects');
  execute 'set local role authenticated';
  select pg_catalog.count(*) into visible_count from public.get_fines_management_list('overdue',200,0,null);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('OVERDUE_exact_definition',
    visible_count = (select pg_catalog.count(*) from public.fines fine
      cross join lateral public.get_fine_financial_totals(fine.id) totals
      where fine.club_id = club_id_value and fine.lifecycle_status = 'active'
        and current_date > fine.due_on and totals.pending_amount > 0),
    'active AND today>due_on AND pending>0');

  -- service_role conserva infraestructura, pero los triggers siguen siendo autoridad.
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claim.role','service_role',true);
  execute 'set local role service_role';
  insert into public.fine_payments(club_id,fine_id,payment_kind,amount,paid_on,recorded_by_membership_id)
  values(club_id_value,fine_blank_note,'payment',1,current_date,staff_membership_id)
  returning id into payment_id_value;
  execute 'reset role';
  perform pg_temp.add_fines_security_check('SERVICE_ROLE_infrastructure_write',
    exists(select 1 from public.fine_payments movement where movement.id=payment_id_value),
    'trusted backend can write with a valid active STAFF actor');
  ok_one:=false;
  begin
    execute 'set local role service_role';
    insert into public.fine_payments(club_id,fine_id,payment_kind,amount,paid_on,recorded_by_membership_id)
    values(club_id_value,fine_blank_note,'payment',100,current_date,staff_membership_id);
    execute 'reset role';
  exception when check_violation then execute 'reset role'; ok_one:=true; end;
  perform pg_temp.add_fines_security_check('SERVICE_ROLE_still_guarded',ok_one,'overpayment rejected by the same financial trigger');

  -- OWNER basic authority.
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  perform pg_temp.add_fines_security_check('OWNER_authority', public.can_manage_fines(), 'OWNER remains manager');
  perform pg_temp.add_fines_security_check('OWNER_catalog_and_summary',
    (select pg_catalog.count(*) > 0 from public.get_fine_rules_for_management())
      and (select pg_catalog.count(*) = 1 from public.get_fines_financial_summary()),
    'OWNER can read management catalogue and current summary');
  execute 'reset role';

  -- Normal PLAYER own-only paths and dynamic exact summary baseline.
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*), pg_catalog.count(*) filter (where own.fine_id = fine_other)
  into own_rows, other_visible from public.get_my_fines(100,0) own;
  select * into summary_row from public.get_my_fines_summary();
  execute 'reset role';
  select pg_catalog.count(*) into admin_own_rows
  from public.fines fine join public.fine_subjects subject on subject.id = fine.subject_id
  where fine.club_id = club_id_value and subject.jugador_id = player_jugador_id;
  perform pg_temp.add_fines_security_check('PLAYER_own_rows_only', own_rows = admin_own_rows and other_visible = 0, 'Borja sees exact own baseline and not other fine');
  perform pg_temp.add_fines_security_check('PLAYER_own_identity_source',
    pg_catalog.strpos((select procedure_row.prosrc from pg_catalog.pg_proc procedure_row where procedure_row.oid = 'public.get_my_fines(integer,integer)'::regprocedure),'public.current_jugador_id()') > 0,
    'identity derived from current_jugador_id(), never name/input ID');
  perform pg_temp.add_fines_security_check('PLAYER_summary_counts',
    (select summary_row.total_fines = pg_catalog.count(*)
      and summary_row.active_fines = pg_catalog.count(*) filter (where fine.lifecycle_status='active')
      and summary_row.unpaid_count = pg_catalog.count(*) filter (where fine.lifecycle_status='active' and totals.financial_status='unpaid')
      and summary_row.partial_count = pg_catalog.count(*) filter (where fine.lifecycle_status='active' and totals.financial_status='partial')
      and summary_row.paid_count = pg_catalog.count(*) filter (where fine.lifecycle_status='active' and totals.financial_status='paid')
      and summary_row.cancelled_count = pg_catalog.count(*) filter (where fine.lifecycle_status='cancelled')
     from public.fines fine join public.fine_subjects subject on subject.id=fine.subject_id
     cross join lateral public.get_fine_financial_totals(fine.id) totals
     where fine.club_id=club_id_value and subject.jugador_id=player_jugador_id), 'all six own counts match baseline');
  perform pg_temp.add_fines_security_check('PLAYER_summary_active_amounts',
    (select summary_row.original_total=coalesce(pg_catalog.sum(fine.original_amount),0)
      and summary_row.surcharge_total=coalesce(pg_catalog.sum(fine.surcharge_amount),0)
      and summary_row.generated_total=coalesce(pg_catalog.sum(totals.generated_amount),0)
      and summary_row.collected_total=coalesce(pg_catalog.sum(totals.collected_amount),0)
      and summary_row.pending_total=coalesce(pg_catalog.sum(totals.pending_amount),0)
     from public.fines fine join public.fine_subjects subject on subject.id=fine.subject_id
     cross join lateral public.get_fine_financial_totals(fine.id) totals
     where fine.club_id=club_id_value and subject.jugador_id=player_jugador_id and fine.lifecycle_status='active'),
    'all five amounts match active-only baseline');
  denied_count := 0;
  begin execute 'set local role authenticated'; perform 1 from public.get_fine_rules_for_management(); exception when others then execute 'reset role'; denied_count:=denied_count+1; end;
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  begin perform 1 from public.get_fine_subjects_for_management(); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.create_fine_individual(rule_ten,subject_a,current_date,null); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.create_fine_collective(rule_collective,array[subject_a],current_date,null); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.cancel_fine(fine_other,'denied'); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.record_fine_payment(fine_other,1,current_date,null); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.record_fine_refund(fine_main,1,current_date,null); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.get_fines_management_list(); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.get_fines_financial_summary(); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.get_fines_subject_summary(); exception when others then denied_count:=denied_count+1; end;
  execute 'reset role';
  perform pg_temp.add_fines_security_check('PLAYER_normal_management_denied', denied_count=10, '10/10 management RPCs denied');
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  ok_one := (select pg_catalog.count(*)=0 from public.fine_rules)
      and (select pg_catalog.count(*)=0 from public.fine_subjects)
      and (select pg_catalog.count(*)=0 from public.fine_incidents)
      and (select pg_catalog.count(*)=0 from public.fines)
      and (select pg_catalog.count(*)=0 from public.fine_payments);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('PLAYER_direct_tables_zero',
    ok_one, 'five direct tables return zero');

  -- PLAYER + fines_manage is a reversible subtransaction.
  begin
    insert into public.club_member_permissions(membership_id,permission_key) values(player_membership_id,'fines_manage');
    perform pg_catalog.set_config('request.jwt.claim.sub',player_user_id::text,true);
    perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
    execute 'set local role authenticated';
    cap_identity := public.is_player() and public.current_jugador_id()=player_jugador_id
      and public.can_manage_fines() and (select membership.role='player' from public.current_membership() membership);
    perform 1 from public.get_fine_rules_for_management();
    perform 1 from public.get_fine_subjects_for_management();
    perform 1 from public.get_fines_management_list();
    perform 1 from public.get_fines_financial_summary();
    perform 1 from public.get_fines_subject_summary();
    select created.fine_id into fine_other from public.create_fine_individual(rule_ten,subject_b,current_date,null) created;
    perform 1 from public.record_fine_payment(fine_other,1,current_date,null);
    perform 1 from public.record_fine_refund(fine_other,0.50,current_date,null);
    select created.fine_id into fine_other from public.create_fine_individual(rule_ten,subject_b,current_date,null) created;
    perform 1 from public.cancel_fine(fine_other,'captain');
    perform 1 from public.create_fine_collective(rule_collective,array[subject_a,subject_b,subject_c],current_date,null);
    cap_management := true;
    cap_direct_zero := (select pg_catalog.count(*)=0 from public.fine_rules)
      and (select pg_catalog.count(*)=0 from public.fine_subjects)
      and (select pg_catalog.count(*)=0 from public.fine_incidents)
      and (select pg_catalog.count(*)=0 from public.fines)
      and (select pg_catalog.count(*)=0 from public.fine_payments);
    cap_own := (select pg_catalog.count(*) from public.get_my_fines(100,0)) >= own_rows
      and (select total_fines from public.get_my_fines_summary()) >= summary_row.total_fines;
    cap_writes_denied := not pg_catalog.has_table_privilege('authenticated','public.fine_incidents','INSERT')
      and not pg_catalog.has_table_privilege('authenticated','public.fines','UPDATE')
      and not pg_catalog.has_table_privilege('authenticated','public.fine_payments','DELETE');
    execute 'reset role';
    raise sqlstate 'P4601' using message='ROLLBACK_PLAYER_MANAGER';
  exception when sqlstate 'P4601' then null; when others then execute 'reset role'; end;
  perform pg_temp.add_fines_security_check('CAPTAIN_player_identity_preserved',cap_identity,'role=player; is_player/current_jugador_id unchanged; can_manage=true');
  perform pg_temp.add_fines_security_check('CAPTAIN_management_e2e',cap_management,'catalogue, subjects, create, collective, payment, refund, cancel, lists and summaries');
  perform pg_temp.add_fines_security_check('CAPTAIN_direct_five_tables_zero',cap_direct_zero,'fines_manage does not open RLS');
  perform pg_temp.add_fines_security_check('CAPTAIN_own_context_preserved',cap_own,'own read/summary remain PLAYER-scoped');
  perform pg_temp.add_fines_security_check('CAPTAIN_direct_writes_denied',cap_writes_denied,'authenticated has no direct mutations');
  perform pg_temp.add_fines_security_check('CAPTAIN_permission_rolled_back',
    not exists(select 1 from public.club_member_permissions permission where permission.permission_key='fines_manage'), 'no persistent permission');

  -- VIEWER + permission remains fail-closed.
  begin
    update public.club_memberships set role='viewer' where id=staff_membership_id;
    insert into public.club_member_permissions(membership_id,permission_key) values(staff_membership_id,'fines_manage');
    perform pg_catalog.set_config('request.jwt.claim.sub',staff_user_id::text,true);
    perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
    execute 'set local role authenticated';
    denied_count:=0;
    if public.is_player() or public.can_manage_fines() then raise exception 'viewer authority'; end if;
    begin perform 1 from public.get_fine_rules_for_management(); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.get_fine_subjects_for_management(); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.create_fine_individual(rule_ten,subject_a,current_date,null); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.create_fine_collective(rule_collective,array[subject_a],current_date,null); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.cancel_fine(fine_other,'denied'); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.record_fine_payment(fine_other,1,current_date,null); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.record_fine_refund(fine_main,1,current_date,null); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.get_fines_management_list(); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.get_fines_financial_summary(); exception when others then denied_count:=denied_count+1; end;
    begin perform 1 from public.get_fines_subject_summary(); exception when others then denied_count:=denied_count+1; end;
    viewer_denied := denied_count=10 and (select pg_catalog.count(*)=0 from public.fines);
    execute 'reset role';
    raise sqlstate 'P4602' using message='ROLLBACK_VIEWER';
  exception when sqlstate 'P4602' then null; when others then execute 'reset role'; end;
  perform pg_temp.add_fines_security_check('VIEWER_permission_fail_closed',viewer_denied,'is_player=false; can_manage=false; 10 RPCs denied; direct zero');

  -- No membership and anon.
  perform pg_catalog.set_config('request.jwt.claim.sub',no_membership_user_id::text,true);
  perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  ok_one:=not public.can_manage_fines(); denied_count:=0;
  begin perform 1 from public.get_my_fines(); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.get_my_fines_summary(); exception when others then denied_count:=denied_count+1; end;
  begin perform 1 from public.get_fine_rules_for_management(); exception when others then denied_count:=denied_count+1; end;
  visible_count := (select pg_catalog.count(*) from public.fines);
  execute 'reset role';
  perform pg_temp.add_fines_security_check('UID_WITHOUT_MEMBERSHIP_fail_closed',ok_one and denied_count=3 and visible_count=0,'own/manager denied; direct zero');
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claim.role','anon',true);
  execute 'set local role anon'; denied_count:=0;
  begin perform 1 from public.get_my_fines(); exception when insufficient_privilege then denied_count:=denied_count+1; end;
  begin perform 1 from public.get_fine_rules_for_management(); exception when insufficient_privilege then denied_count:=denied_count+1; end;
  begin perform 1 from public.require_fines_manager(); exception when insufficient_privilege then denied_count:=denied_count+1; end;
  execute 'reset role';
  perform pg_temp.add_fines_security_check('ANON_all_function_paths_denied',denied_count=3,'PLAYER, manager and internal helper EXECUTE denied');

  -- Cross-club UUID knowledge, mixed array and season code are not authority.
  begin
    insert into public.clubs(id,name) values(cross_club,'VERIFY 4.6 CROSS CLUB');
    insert into public.club_seasons(id,club_id,code,label,starts_on,ends_on,is_active)
    values(cross_season,cross_club,'VERIFY46','VERIFY 4.6 CROSS',date '2026-07-01',date '2027-06-30',true);
    insert into public.fine_rules(id,club_id,code,name,default_amount,pricing_mode,applies_to_players,applies_to_staff,collective_allowed,active,sort_order)
    values(cross_rule,cross_club,'VERIFY46','SECRET CROSS RULE',10,'fixed',true,true,true,true,1);
    update public.club_memberships set club_id=cross_club where id=staff_membership_id;
    insert into public.fine_subjects(club_id,subject_type,staff_membership_id,display_name,active)
    values(cross_club,'staff',staff_membership_id,'SECRET CROSS SUBJECT',true) returning id into cross_subject;
    insert into public.fine_incidents(club_id,season_id,fine_rule_id,incident_kind,occurred_on,rule_code_snapshot,reason_snapshot,created_by_membership_id)
    values(cross_club,cross_season,cross_rule,'individual',current_date,'x','x',staff_membership_id) returning id into cross_incident;
    insert into public.fines(club_id,incident_id,subject_id,subject_name_snapshot,original_amount,due_on)
    values(cross_club,cross_incident,cross_subject,'x',10,current_date) returning id into cross_fine;
    update public.club_memberships set club_id=club_id_value where id=staff_membership_id;
    perform pg_catalog.set_config('request.jwt.claim.sub',staff_user_id::text,true);
    perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
    execute 'set local role authenticated'; denied_count:=0; error_text:='';
    begin perform 1 from public.create_fine_individual(cross_rule,subject_a,current_date,null); exception when others then denied_count:=denied_count+1; error_text:=error_text||sqlerrm; end;
    begin perform 1 from public.create_fine_individual(rule_ten,cross_subject,current_date,null); exception when others then denied_count:=denied_count+1; error_text:=error_text||sqlerrm; end;
    begin perform 1 from public.create_fine_collective(rule_collective,array[subject_a,cross_subject],current_date,null); exception when others then denied_count:=denied_count+1; error_text:=error_text||sqlerrm; end;
    begin perform 1 from public.cancel_fine(cross_fine,'denied'); exception when others then denied_count:=denied_count+1; error_text:=error_text||sqlerrm; end;
    begin perform 1 from public.get_fines_financial_summary('VERIFY46'); exception when others then denied_count:=denied_count+1; error_text:=error_text||sqlerrm; end;
    cross_denied:=denied_count=5;
    cross_no_leak:=pg_catalog.strpos(error_text,'SECRET CROSS')=0
      and pg_catalog.strpos(error_text,cross_club::text)=0 and pg_catalog.strpos(error_text,cross_subject::text)=0;
    execute 'reset role';
    raise sqlstate 'P4603' using message='ROLLBACK_CROSS';
  exception when sqlstate 'P4603' then null; when others then execute 'reset role'; end;
  perform pg_temp.add_fines_security_check('IDOR_cross_club_five_paths_denied',cross_denied,'rule, subject, mixed array, fine and season rejected');
  perform pg_temp.add_fines_security_check('IDOR_error_messages_no_cross_leak',cross_no_leak,'no cross club/subject identifiers or fixture names in errors');

  -- Pagination, ordering and season semantics.
  perform pg_catalog.set_config('request.jwt.claim.sub',player_user_id::text,true);
  perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  ok_one:=(select pg_catalog.count(*)<=1 from public.get_my_fines(1,0)); ok_two:=false; ok_three:=false;
  begin perform 1 from public.get_my_fines(101,0); exception when others then ok_two:=true; end;
  begin perform 1 from public.get_my_fines(1,-1); exception when others then ok_three:=true; end;
  execute 'reset role';
  perform pg_temp.add_fines_security_check('PAGINATION_player_limits',ok_one and ok_two and ok_three,'1 valid; 101 and negative offset rejected');
  perform pg_catalog.set_config('request.jwt.claim.sub',staff_user_id::text,true);
  perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated'; ok_one:=false; ok_two:=false; ok_three:=false;
  begin perform 1 from public.get_fines_management_list('all',201,0); exception when others then ok_one:=true; end;
  begin perform 1 from public.get_fines_management_list('all',1,-1); exception when others then ok_two:=true; end;
  begin perform 1 from public.get_fines_financial_summary('UNKNOWN'); exception when others then ok_three:=true; end;
  execute 'reset role';
  perform pg_temp.add_fines_security_check('PAGINATION_management_limits',ok_one and ok_two,'201 and negative offset rejected');
  perform pg_temp.add_fines_security_check('SEASON_unknown_rejected',ok_three,'unknown/cross-club season reveals no data');
  perform pg_temp.add_fines_security_check('ORDERING_deterministic_contract',
    pg_catalog.strpos((select procedure_row.prosrc from pg_catalog.pg_proc procedure_row where procedure_row.oid='public.get_my_fines(integer,integer)'::regprocedure),'fine.id')>0
      and pg_catalog.strpos((select procedure_row.prosrc from pg_catalog.pg_proc procedure_row where procedure_row.oid='public.get_fines_management_list(text,integer,integer,text)'::regprocedure),'fine.id')>0,
    'occurred_on DESC, created_at DESC, fine.id tie-break present');
  perform pg_temp.add_fines_security_check('SEASON_management_default_historical',
    pg_catalog.strpos((select pg_catalog.obj_description(procedure_row.oid,'pg_proc') from pg_catalog.pg_proc procedure_row where procedure_row.oid='public.get_fines_management_list(text,integer,integer,text)'::regprocedure),'sin filtro de temporada por defecto')>0,
    'NULL season keeps historical management list');

  perform pg_temp.add_fines_security_check('FINAL_real_permission_still_zero',
    not exists(select 1 from public.club_member_permissions permission where permission.permission_key='fines_manage'), 'all permission fixtures rolled back');
  perform pg_temp.add_fines_security_check('FINAL_rules_contract_restored',
    (select rule.name=original_rule_name and rule.default_amount=10 from public.fine_rules rule where rule.id=rule_ten),
    'live rule restored inside transaction; outer ROLLBACK restores original 20');
  perform pg_temp.add_fines_security_check('FINAL_transactional_fixture_inventory',
    (select pg_catalog.count(*)>0 from public.fine_incidents)
      and (select pg_catalog.count(*)>0 from public.fines)
      and (select pg_catalog.count(*)>0 from public.fine_payments),
    'fixtures exist only in this transaction and final ROLLBACK removes all');
  perform pg_temp.add_fines_security_check('FINAL_blocks_4_1_to_4_5_intact',
    pg_catalog.to_regprocedure('public.can_manage_fines()') is not null
      and pg_catalog.to_regprocedure('public.get_my_fines(integer,integer)') is not null
      and pg_catalog.to_regprocedure('public.get_fines_subject_summary(text)') is not null,
    'foundation, rules, core, ledger and RPC objects remain');

  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claim.role','',true);
  execute 'reset role';
end;
$verify$;

select pg_temp.add_fines_security_check(
  'FINAL_check_count_at_least_80',
  (select pg_catalog.count(*) >= 80 from pg_temp.fines_security_results),
  'meaningful checks before this count=' || (select pg_catalog.count(*)::text from pg_temp.fines_security_results)
);

select test_name, test_ok, details
from pg_temp.fines_security_results
order by seq;

rollback;
