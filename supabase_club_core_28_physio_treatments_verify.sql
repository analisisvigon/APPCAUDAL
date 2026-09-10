-- APPCAUDAL - Club Core 28 - Verificacion transaccional de Fisio V1.
-- Ejecutar completo despues de la migracion 28. Todas las filas de prueba se
-- revierten mediante ROLLBACK; el resultado visible es test_name/test_ok/details.

begin;

create temporary table physio_verify_results (
  ordinal integer generated always as identity,
  test_name text not null,
  test_ok boolean not null,
  details text not null
) on commit drop;

-- Los checks STAFF se registran mientras el verifier simula el rol SQL
-- authenticated. El helper permanece SECURITY INVOKER: solo se habilitan el
-- INSERT temporal y el USAGE de la secuencia identity que ese INSERT necesita.
grant insert on table pg_temp.physio_verify_results to authenticated;
grant usage on sequence pg_temp.physio_verify_results_ordinal_seq to authenticated;

create function pg_temp.add_physio_check(p_name text, p_ok boolean, p_details text)
returns void
language sql
set search_path = pg_catalog
as $function$
  insert into pg_temp.physio_verify_results(test_name, test_ok, details)
  values (p_name, coalesce(p_ok, false), coalesce(p_details, ''));
$function$;

do $verify$
declare
  club_id_value uuid;
  actor_membership_id uuid;
  actor_user_id uuid;
  player_id_value uuid;
  player_for_role_test uuid;
  treatment_one uuid;
  treatment_two uuid;
  treatment_three uuid;
  original_created_at timestamptz;
  original_updated_at timestamptz;
  visible_count integer;
  policy_count integer;
  denied boolean;
  summary_row record;
  function_row pg_catalog.pg_proc%rowtype;
  error_message text;
begin
  select club.id into club_id_value
  from public.clubs club
  order by club.id
  limit 1;

  select membership.id, membership.user_id
  into actor_membership_id, actor_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value
    and membership.role in ('owner', 'admin', 'staff')
    and membership.is_active
  order by case membership.role when 'owner' then 1 when 'admin' then 2 else 3 end, membership.id
  limit 1;

  select player.id into player_id_value
  from public.jugadores player
  where player.active_in_squad
  order by player.id
  limit 1;

  perform pg_temp.add_physio_check(
    'PREREQUISITES_single_club_staff_player',
    (select pg_catalog.count(*) from public.clubs) = 1
      and club_id_value is not null
      and actor_user_id is not null
      and player_id_value is not null,
    'exactly one club, one active STAFF actor and one active canonical player'
  );

  perform pg_temp.add_physio_check(
    'SCHEMA_table_exists',
    pg_catalog.to_regclass('public.physio_treatments') is not null,
    'public.physio_treatments'
  );

  perform pg_temp.add_physio_check(
    'SCHEMA_exact_columns',
    (select pg_catalog.array_agg(column_row.column_name::text order by column_row.ordinal_position)
     from information_schema.columns column_row
     where column_row.table_schema = 'public' and column_row.table_name = 'physio_treatments')
    = array[
      'id','club_id','player_id','treatment_date','body_area','reason',
      'treatment_types','case_type','availability_status','duration_minutes',
      'notes','performed_by_user_id','performed_by_name_snapshot','created_at','updated_at'
    ]::text[],
    '15 V1 columns; treatment date is independent from created_at'
  );

  perform pg_temp.add_physio_check(
    'SCHEMA_foreign_keys_restrict',
    (select pg_catalog.count(*) from pg_catalog.pg_constraint constraint_row
     where constraint_row.conrelid = 'public.physio_treatments'::regclass
       and constraint_row.contype = 'f'
       and constraint_row.confdeltype = 'r') = 3,
    'club_id, player_id and performed_by_user_id use ON DELETE RESTRICT'
  );

  perform pg_temp.add_physio_check(
    'SCHEMA_catalog_checks',
    (select pg_catalog.count(*) from pg_catalog.pg_constraint constraint_row
     where constraint_row.conrelid = 'public.physio_treatments'::regclass
       and constraint_row.convalidated
       and constraint_row.conname in (
         'physio_treatments_body_area_check',
         'physio_treatments_reason_check',
         'physio_treatments_treatment_types_check',
         'physio_treatments_case_type_check',
         'physio_treatments_availability_status_check',
         'physio_treatments_duration_minutes_check',
         'physio_treatments_notes_check',
         'physio_treatments_performed_by_name_check'
       )) = 8,
    'body area, reason, treatments, case type, availability, duration, notes and name validated'
  );

  perform pg_temp.add_physio_check(
    'SCHEMA_three_query_indexes',
    (select pg_catalog.count(*) from pg_catalog.pg_class index_row
     join pg_catalog.pg_index index_definition on index_definition.indexrelid = index_row.oid
     where index_definition.indrelid = 'public.physio_treatments'::regclass
       and index_row.relname in (
         'physio_treatments_club_date_idx',
         'physio_treatments_club_player_date_idx',
         'physio_treatments_club_performer_date_idx'
       ) and index_definition.indisvalid) = 3,
    'club/date, club/player/date and club/performer/date'
  );

  select pg_catalog.count(*)::integer into policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.physio_treatments'::regclass;
  perform pg_temp.add_physio_check(
    'RLS_exact_staff_policies_no_delete',
    policy_count = 3
      and not exists (select 1 from pg_catalog.pg_policy policy where policy.polrelid = 'public.physio_treatments'::regclass and policy.polcmd = 'd')
      and (select pg_catalog.count(*) from pg_catalog.pg_policy policy
           where policy.polrelid = 'public.physio_treatments'::regclass
             and pg_catalog.strpos(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '') || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''), 'is_app_staff') > 0) = 3,
    pg_catalog.format('policies=%s; SELECT/INSERT/UPDATE only and STAFF helper present', policy_count)
  );

  perform pg_temp.add_physio_check(
    'GRANTS_authenticated_crud_without_delete',
    pg_catalog.has_table_privilege('authenticated', 'public.physio_treatments', 'SELECT')
      and pg_catalog.has_table_privilege('authenticated', 'public.physio_treatments', 'INSERT')
      and pg_catalog.has_table_privilege('authenticated', 'public.physio_treatments', 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', 'public.physio_treatments', 'DELETE')
      and not pg_catalog.has_table_privilege('anon', 'public.physio_treatments', 'SELECT')
      and not pg_catalog.has_table_privilege('anon', 'public.physio_treatments', 'INSERT')
      and not pg_catalog.has_table_privilege('anon', 'public.physio_treatments', 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', 'public.physio_treatments', 'DELETE')
      and not pg_catalog.has_table_privilege('service_role', 'public.physio_treatments', 'DELETE'),
    'authenticated gets SELECT/INSERT/UPDATE; anon and every client DELETE denied'
  );

  select procedure_row.* into function_row
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.guard_physio_treatment_integrity()'::regprocedure;
  perform pg_temp.add_physio_check(
    'TRIGGER_security_and_acl',
    function_row.prosecdef
      and function_row.provolatile = 'v'
      and function_row.proconfig = array['search_path=pg_catalog']::text[]
      and not pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
      and exists (select 1 from pg_catalog.pg_trigger trigger_row where trigger_row.tgrelid = 'public.physio_treatments'::regclass and trigger_row.tgname = 'guard_physio_treatment_integrity' and not trigger_row.tgisinternal),
    'SECURITY DEFINER volatile trigger, fixed search_path, no client EXECUTE'
  );

  select procedure_row.* into function_row
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.get_physio_player_summary()'::regprocedure;
  perform pg_temp.add_physio_check(
    'SUMMARY_security_and_acl',
    function_row.prosecdef
      and function_row.provolatile = 's'
      and function_row.proconfig = array['search_path=pg_catalog']::text[]
      and pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE'),
    'read-only aggregate RPC is stable, SECURITY DEFINER and authenticated-only'
  );

  if club_id_value is null or actor_user_id is null or player_id_value is null then
    return;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  insert into public.physio_treatments (
    player_id, treatment_date, body_area, reason, treatment_types,
    case_type, availability_status, duration_minutes, notes
  ) values (
    player_id_value, current_date, 'hamstrings', ' Sobrecarga descriptiva ',
    array['massage_release', 'stretching', 'massage_release'],
    'new', 'limited', null, ' Nota breve '
  ) returning id, created_at, updated_at into treatment_one, original_created_at, original_updated_at;

  insert into public.physio_treatments (
    player_id, treatment_date, body_area, reason, treatment_types,
    case_type, availability_status, duration_minutes
  ) values (
    player_id_value, current_date, 'hamstrings', 'Seguimiento descriptivo',
    array['manual_therapy'], 'follow_up', 'available', 25
  ) returning id into treatment_two;

  insert into public.physio_treatments (
    player_id, treatment_date, body_area, reason, treatment_types,
    case_type, availability_status
  ) values (
    player_id_value, current_date - 1, 'groin_adductor', 'Molestia descriptiva',
    array['mobility'], 'follow_up', 'available'
  ) returning id into treatment_three;

  perform pg_temp.add_physio_check(
    'STAFF_insert_derives_audit_fields',
    exists (
      select 1 from public.physio_treatments treatment
      where treatment.id = treatment_one
        and treatment.club_id = club_id_value
        and treatment.performed_by_user_id = actor_user_id
        and treatment.created_at = original_created_at
        and treatment.updated_at = original_updated_at
        and treatment.reason = 'Sobrecarga descriptiva'
        and treatment.notes = 'Nota breve'
        and treatment.duration_minutes is null
        and treatment.treatment_types = array['massage_release', 'stretching']::text[]
    ),
    'id, club, performer and timestamps derived; text trimmed; duplicate treatment type removed; blank duration stays NULL'
  );

  update public.physio_treatments
  set reason = 'Motivo corregido', duration_minutes = 30, availability_status = 'unavailable'
  where id = treatment_one;
  perform pg_temp.add_physio_check(
    'STAFF_update_editable_and_touches_updated_at',
    exists (
      select 1 from public.physio_treatments treatment
      where treatment.id = treatment_one
        and treatment.reason = 'Motivo corregido'
        and treatment.duration_minutes = 30
        and treatment.availability_status = 'unavailable'
        and treatment.created_at = original_created_at
        and treatment.updated_at >= original_updated_at
    ),
    'editable fields changed; created_at remains immutable; updated_at is automatic'
  );

  select summary.* into summary_row
  from public.get_physio_player_summary() summary
  where summary.player_id = player_id_value;
  perform pg_temp.add_physio_check(
    'SUMMARY_treatments_days_last_date_cases_areas',
    summary_row.total_treatments = 3
      and summary_row.total_treatment_days = 2
      and summary_row.last_treatment_date = current_date
      and summary_row.new_count = 1
      and summary_row.follow_up_count = 2
      and summary_row.body_area_counts @> '[{"body_area":"hamstrings","treatment_count":2}]'::jsonb,
    '3 treatments, 2 distinct days, current last date, 1 new, 2 follow-ups and descriptive area counts'
  );

  denied := false;
  begin
    update public.physio_treatments set created_at = created_at - interval '1 day' where id = treatment_one;
  exception when insufficient_privilege then denied := true;
  end;
  perform pg_temp.add_physio_check('TRIGGER_protected_fields_immutable', denied, 'attempted created_at mutation denied with 42501');

  denied := false;
  begin
    insert into public.physio_treatments (
      club_id, player_id, treatment_date, body_area, reason, treatment_types, case_type, availability_status
    ) values (
      pg_catalog.gen_random_uuid(), player_id_value, current_date, 'knee', 'Cross club', array['assessment'], 'new', 'available'
    );
  exception when insufficient_privilege then denied := true;
  end;
  perform pg_temp.add_physio_check('RLS_cross_club_insert_denied', denied, 'client supplied club_id cannot cross the authenticated club');

  denied := false;
  begin
    insert into public.physio_treatments (
      player_id, treatment_date, body_area, reason, treatment_types, case_type, availability_status, duration_minutes
    ) values (
      player_id_value, current_date, 'knee', 'Invalid duration', array['assessment'], 'new', 'available', 0
    );
  exception when check_violation then denied := true;
  end;
  perform pg_temp.add_physio_check('CHECK_duration_positive_or_null', denied, 'duration 0 denied; NULL and positive values already inserted');

  denied := false;
  begin
    insert into public.physio_treatments (
      player_id, treatment_date, body_area, reason, treatment_types, case_type, availability_status
    ) values (
      player_id_value, current_date, 'invented_area', '', array['invented_treatment'], 'invented_case', 'invented_status'
    );
  exception when check_violation then denied := true;
  end;
  perform pg_temp.add_physio_check('CHECK_closed_catalogs_and_reason', denied, 'invalid area/treatment/case/availability and empty reason cannot persist');

  denied := false;
  begin
    delete from public.physio_treatments where id = treatment_three;
  exception when insufficient_privilege then denied := true;
  end;
  perform pg_temp.add_physio_check('STAFF_physical_delete_denied', denied, 'no DELETE grant and no DELETE policy');

  execute 'reset role';

  -- VIEWER is exercised reversibly by changing only the selected test actor
  -- inside a forced-rollback subtransaction.
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    update public.club_memberships set role = 'viewer' where id = actor_membership_id;
    perform pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer into visible_count from public.physio_treatments;
    denied := false;
    begin
      insert into public.physio_treatments (player_id, treatment_date, body_area, reason, treatment_types, case_type, availability_status)
      values (player_id_value, current_date, 'knee', 'Viewer', array['assessment'], 'new', 'available');
    exception when insufficient_privilege then denied := true;
    end;
    execute 'reset role';
    if visible_count = 0 and denied then raise sqlstate 'P4821' using message = 'ROLLBACK_VIEWER_TEST'; end if;
    raise exception 'VIEWER obtained Physio access';
  exception
    when sqlstate 'P4821' then perform pg_temp.add_physio_check('ROLE_viewer_denied', true, 'SELECT returns zero and INSERT is denied');
    when others then execute 'reset role'; get stacked diagnostics error_message = message_text; perform pg_temp.add_physio_check('ROLE_viewer_denied', false, error_message);
  end;

  select player.id into player_for_role_test
  from public.jugadores player
  where player.active_in_squad
    and not exists (
      select 1 from public.club_memberships membership
      where membership.jugador_id = player.id and membership.role = 'player' and membership.is_active
    )
  order by player.id
  limit 1;

  if player_for_role_test is null then
    perform pg_temp.add_physio_check('ROLE_player_denied', false, 'no unbound active player available for reversible PLAYER identity test');
  else
    begin
      perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
      update public.club_memberships set role = 'player', jugador_id = player_for_role_test where id = actor_membership_id;
      perform pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);
      execute 'set local role authenticated';
      select pg_catalog.count(*)::integer into visible_count from public.physio_treatments;
      denied := false;
      begin
        insert into public.physio_treatments (player_id, treatment_date, body_area, reason, treatment_types, case_type, availability_status)
        values (player_for_role_test, current_date, 'knee', 'Player', array['assessment'], 'new', 'available');
      exception when insufficient_privilege then denied := true;
      end;
      execute 'reset role';
      if visible_count = 0 and denied then raise sqlstate 'P4822' using message = 'ROLLBACK_PLAYER_TEST'; end if;
      raise exception 'PLAYER obtained Physio access';
    exception
      when sqlstate 'P4822' then perform pg_temp.add_physio_check('ROLE_player_denied', true, 'SELECT returns zero and INSERT is denied');
      when others then execute 'reset role'; get stacked diagnostics error_message = message_text; perform pg_temp.add_physio_check('ROLE_player_denied', false, error_message);
    end;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  denied := false;
  begin
    select pg_catalog.count(*)::integer into visible_count from public.physio_treatments;
  exception when insufficient_privilege then denied := true;
  end;
  execute 'reset role';
  perform pg_temp.add_physio_check('ROLE_anon_denied', denied, 'anon has no table privileges');
end;
$verify$;

select test_name, test_ok, details
from pg_temp.physio_verify_results
order by ordinal;

rollback;
