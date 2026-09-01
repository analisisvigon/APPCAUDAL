-- APPCAUDAL - Bloque 4.1 - Verificacion posterior.
--
-- Ejecutar el archivo completo. Devuelve una unica tabla visible con columnas:
-- test_name, test_ok, details.
-- Las mutaciones funcionales viven en subtransacciones que fuerzan excepcion;
-- por tanto se revierten incluso antes del ROLLBACK final.

begin;

create or replace function pg_temp.verify_fines_foundation()
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
  owner_user_id uuid;
  staff_membership_id uuid;
  staff_user_id uuid;
  player_membership_id uuid;
  player_user_id constant uuid := '350615a9-b068-450a-b867-da30a59b9082'::uuid;
  player_jugador_id constant uuid := '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid;
  no_membership_user_id constant uuid := 'b4100000-0000-4000-8000-000000000099'::uuid;
  player_subject_id uuid;
  permission_definition text;
  permission_keys text[];
  observed_count integer;
  expected_count integer;
  visible_count integer;
  helper_result boolean;
  function_row pg_catalog.pg_proc%rowtype;
  error_message text;
begin
  select club.id into club_id_value
  from public.clubs club
  order by club.id
  limit 1;

  select membership.user_id into owner_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value
    and membership.role = 'owner'
    and membership.is_active
  order by membership.id
  limit 1;

  select membership.id, membership.user_id
  into staff_membership_id, staff_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value
    and membership.role = 'staff'
    and membership.is_active
  order by membership.id
  limit 1;

  select membership.id
  into player_membership_id
  from public.club_memberships membership
  where membership.user_id = player_user_id
    and membership.jugador_id = player_jugador_id
    and membership.role = 'player'
    and membership.is_active;

  select subject.id into player_subject_id
  from public.fine_subjects subject
  where subject.club_id = club_id_value
    and subject.subject_type = 'player'
    and subject.jugador_id = player_jugador_id;

  ---------------------------------------------------------------------------
  -- Temporadas.
  ---------------------------------------------------------------------------
  test_name := 'A_club_seasons_exists';
  test_ok := pg_catalog.to_regclass('public.club_seasons') is not null;
  details := 'relation=' || coalesce(
    pg_catalog.to_regclass('public.club_seasons')::text,
    'NULL'
  );
  return next;

  with expected(column_name, data_type, nullable) as (
    values
      ('id'::text, 'uuid'::text, 'NO'::text),
      ('club_id', 'uuid', 'NO'),
      ('code', 'text', 'NO'),
      ('label', 'text', 'NO'),
      ('starts_on', 'date', 'NO'),
      ('ends_on', 'date', 'NO'),
      ('is_active', 'boolean', 'NO'),
      ('created_at', 'timestamp with time zone', 'NO'),
      ('updated_at', 'timestamp with time zone', 'NO')
  ), actual as (
    select actual_column.column_name, actual_column.data_type, actual_column.is_nullable as nullable
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'club_seasons'
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

  test_name := 'B_club_seasons_exact_columns';
  details := pg_catalog.format('observed=%s expected=%s', observed_count, expected_count);
  return next;

  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_seasons'::regclass
    and constraint_row.convalidated
    and constraint_row.conname in (
      'club_seasons_pkey',
      'club_seasons_club_id_fkey',
      'club_seasons_code_not_empty',
      'club_seasons_label_not_empty',
      'club_seasons_date_order_check',
      'club_seasons_club_code_key'
    );
  test_name := 'C_club_seasons_constraints';
  test_ok := observed_count = 6;
  details := pg_catalog.format('%s/6 constraints present and validated', observed_count);
  return next;

  test_name := 'D_club_seasons_unique_club_code';
  test_ok := exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_club_code_key'
      and constraint_row.contype = 'u'
      and constraint_row.convalidated
  );
  details := 'UNIQUE(club_id, code)';
  return next;

  test_name := 'E_club_seasons_one_active_per_club';
  test_ok := exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_class on index_class.oid = index_row.indexrelid
    where index_row.indrelid = 'public.club_seasons'::regclass
      and index_class.relname = 'club_seasons_one_active_per_club_uidx'
      and index_row.indisunique
      and index_row.indisvalid
      and pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid) = 'is_active'
  ) and not exists (
    select season.club_id
    from public.club_seasons season
    where season.is_active
    group by season.club_id
    having pg_catalog.count(*) > 1
  );
  details := 'partial unique index valid; no duplicate active season';
  return next;

  test_name := 'F_club_seasons_rls_on';
  select relation.relrowsecurity and not relation.relforcerowsecurity
  into test_ok
  from pg_catalog.pg_class relation
  where relation.oid = 'public.club_seasons'::regclass;
  details := 'RLS ON; FORCE RLS OFF';
  return next;

  test_name := 'G_club_seasons_grants';
  test_ok := not exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) acl
      where relation.oid = 'public.club_seasons'::regclass
        and acl.grantee = 0
        and acl.privilege_type = 'SELECT'
    )
    and not pg_catalog.has_table_privilege('anon', 'public.club_seasons', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'DELETE')
    and pg_catalog.has_table_privilege('service_role', 'public.club_seasons', 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.club_seasons', 'INSERT')
    and pg_catalog.has_table_privilege('service_role', 'public.club_seasons', 'UPDATE')
    and pg_catalog.has_table_privilege('service_role', 'public.club_seasons', 'DELETE');
  details := 'PUBLIC/anon=none; authenticated=SELECT; service_role=CRUD';
  return next;

  test_name := 'G2_season_2026_2027_seed';
  select pg_catalog.count(*)::integer into observed_count
  from public.club_seasons season
  where season.club_id = club_id_value
    and season.code = '2026'
    and season.label = '2026/2027'
    and season.starts_on = date '2026-07-01'
    and season.ends_on = date '2027-06-30'
    and season.is_active;
  test_ok := observed_count = 1;
  details := pg_catalog.format('matching_rows=%s; dates are authority', observed_count);
  return next;

  select pg_catalog.count(*)::integer into expected_count
  from public.club_seasons season
  where season.club_id = club_id_value;
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.club_seasons;
  execute 'reset role';
  test_name := 'G3_staff_reads_own_club_seasons';
  test_ok := visible_count = expected_count and expected_count > 0;
  details := pg_catalog.format('visible=%s baseline=%s', visible_count, expected_count);
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.club_seasons;
  execute 'reset role';
  test_name := 'G4_player_seasons_fail_closed';
  test_ok := visible_count = 0;
  details := 'visible=' || visible_count;
  return next;

  ---------------------------------------------------------------------------
  -- Permission y helpers heredados.
  ---------------------------------------------------------------------------
  select pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
  into permission_definition
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_member_permissions'::regclass
    and constraint_row.conname = 'club_member_permissions_key_check'
    and constraint_row.contype = 'c'
    and constraint_row.convalidated;

  select pg_catalog.array_agg(match[1] order by match[1])
  into permission_keys
  from pg_catalog.regexp_matches(permission_definition, $regex$'([^']+)'$regex$, 'g') match;

  test_name := 'H_fines_manage_allowed';
  test_ok := permission_keys is not distinct from array[
    'fines_manage',
    'performance_aggregate_read',
    'rpe_individual_read',
    'rpe_manage',
    'wellness_individual_read',
    'wellness_manage'
  ]::text[];
  details := 'allowlist=' || coalesce(permission_keys::text, 'NULL');
  return next;

  test_name := 'I_captain_is_not_role';
  test_ok := pg_catalog.strpos(
    pg_catalog.lower(pg_catalog.pg_get_constraintdef(
      (
        select constraint_row.oid
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = 'public.club_memberships'::regclass
          and constraint_row.conname = 'club_memberships_role_check'
      ),
      true
    )),
    '''captain'''
  ) = 0 and not exists (
    select 1 from public.club_memberships where role = 'captain'
  );
  details := 'role captain absent from CHECK and data';
  return next;

  select procedure_row.* into function_row
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.is_player()'::regprocedure;
  test_name := 'J_is_player_intact';
  test_ok := function_row.provolatile = 's'
    and not function_row.prosecdef
    and function_row.proconfig = array['search_path=pg_catalog']::text[]
    and pg_catalog.strpos(function_row.prosrc, 'membership.role = ''player''') > 0
    and pg_catalog.strpos(function_row.prosrc, 'membership.jugador_id is not null') > 0;
  details := 'STABLE INVOKER; still requires role=player and jugador_id';
  return next;

  select procedure_row.* into function_row
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.current_jugador_id()'::regprocedure;
  test_name := 'K_current_jugador_id_intact';
  test_ok := function_row.provolatile = 's'
    and not function_row.prosecdef
    and function_row.proconfig = array['search_path=pg_catalog']::text[]
    and pg_catalog.strpos(function_row.prosrc, 'membership.role = ''player''') > 0
    and pg_catalog.strpos(function_row.prosrc, 'membership.jugador_id') > 0;
  details := 'STABLE INVOKER; jugador_id only for role=player';
  return next;

  select procedure_row.* into function_row
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.can_manage_fines()'::regprocedure;
  test_name := 'L_can_manage_fines_contract';
  test_ok := pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
    and function_row.pronargs = 0
    and function_row.prorettype = 'boolean'::regtype
    and function_row.provolatile = 's'
    and not function_row.prosecdef
    and function_row.proconfig = array['search_path=pg_catalog']::text[]
    and pg_catalog.strpos(function_row.prosrc, 'public.is_app_staff()') > 0
    and pg_catalog.strpos(function_row.prosrc, 'public.is_player()') > 0
    and pg_catalog.strpos(function_row.prosrc, '''fines_manage''') > 0;
  details := 'postgres; zero args; boolean; STABLE; INVOKER; search_path=pg_catalog';
  return next;

  test_name := 'L2_can_manage_fines_acl';
  test_ok := not exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      cross join lateral pg_catalog.aclexplode(
        coalesce(procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner))
      ) acl
      where procedure_row.oid = 'public.can_manage_fines()'::regprocedure
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', 'public.can_manage_fines()', 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', 'public.can_manage_fines()', 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', 'public.can_manage_fines()', 'EXECUTE');
  details := 'PUBLIC=false anon=false authenticated=true service_role=true';
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select public.can_manage_fines() into helper_result;
  execute 'reset role';
  test_name := 'M_staff_can_manage_fines';
  test_ok := helper_result is true;
  details := 'owner result=' || coalesce(helper_result::text, 'NULL');
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  execute 'set local role authenticated';
  select public.can_manage_fines() into helper_result;
  execute 'reset role';
  test_name := 'N_borja_player_without_permission';
  test_ok := player_membership_id is not null and helper_result is false;
  details := pg_catalog.format(
    'membership=%s result=%s',
    coalesce(player_membership_id::text, 'NULL'),
    coalesce(helper_result::text, 'NULL')
  );
  return next;

  test_name := 'O_player_with_transient_permission';
  test_ok := false;
  details := null;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    insert into public.club_member_permissions (membership_id, permission_key)
    values (player_membership_id, 'fines_manage');

    perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    select public.can_manage_fines() into helper_result;
    execute 'reset role';

    if helper_result is not true then
      raise exception 'PLAYER con permiso no obtuvo autoridad';
    end if;
    raise sqlstate 'P4191' using message = 'ROLLBACK_PLAYER_PERMISSION_TEST';
  exception
    when sqlstate 'P4191' then
      test_ok := true;
      details := 'true inside forced-rollback subtransaction';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      test_ok := false;
      details := error_message;
  end;
  return next;

  test_name := 'P_viewer_with_transient_permission_denied';
  test_ok := false;
  details := null;
  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    update public.club_memberships
    set role = 'viewer'
    where id = staff_membership_id;
    insert into public.club_member_permissions (membership_id, permission_key)
    values (staff_membership_id, 'fines_manage');

    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    execute 'set local role authenticated';
    select public.can_manage_fines() into helper_result;
    execute 'reset role';

    if helper_result is not false then
      raise exception 'VIEWER con permiso obtuvo autoridad';
    end if;
    raise sqlstate 'P4192' using message = 'ROLLBACK_VIEWER_PERMISSION_TEST';
  exception
    when sqlstate 'P4192' then
      test_ok := true;
      details := 'false inside forced-rollback subtransaction';
    when others then
      execute 'reset role';
      get stacked diagnostics error_message = message_text;
      test_ok := false;
      details := error_message;
  end;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  execute 'set local role authenticated';
  select public.can_manage_fines() into helper_result;
  execute 'reset role';
  test_name := 'Q_uid_without_membership_denied';
  test_ok := helper_result is false;
  details := 'result=' || coalesce(helper_result::text, 'NULL');
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  test_name := 'R_anon_cannot_execute_helper';
  test_ok := false;
  details := null;
  begin
    perform public.can_manage_fines();
    details := 'unexpected EXECUTE success';
  exception
    when insufficient_privilege then
      test_ok := true;
      details := 'EXECUTE denied with 42501';
    when others then
      get stacked diagnostics error_message = message_text;
      details := error_message;
  end;
  execute 'reset role';
  return next;

  ---------------------------------------------------------------------------
  -- fine_subjects: catalogo, RLS y funcionalidad reversible.
  ---------------------------------------------------------------------------
  test_name := 'S_fine_subjects_exists';
  test_ok := pg_catalog.to_regclass('public.fine_subjects') is not null;
  details := 'relation=' || coalesce(
    pg_catalog.to_regclass('public.fine_subjects')::text,
    'NULL'
  );
  return next;

  with expected(column_name, data_type, nullable) as (
    values
      ('id'::text, 'uuid'::text, 'NO'::text),
      ('club_id', 'uuid', 'NO'),
      ('subject_type', 'text', 'NO'),
      ('jugador_id', 'uuid', 'YES'),
      ('staff_membership_id', 'uuid', 'YES'),
      ('display_name', 'text', 'YES'),
      ('active', 'boolean', 'NO'),
      ('created_at', 'timestamp with time zone', 'NO'),
      ('updated_at', 'timestamp with time zone', 'NO')
  ), actual as (
    select actual_column.column_name, actual_column.data_type, actual_column.is_nullable as nullable
    from information_schema.columns actual_column
    where actual_column.table_schema = 'public'
      and actual_column.table_name = 'fine_subjects'
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
  test_name := 'S2_fine_subjects_exact_columns';
  details := pg_catalog.format('observed=%s expected=%s', observed_count, expected_count);
  return next;

  test_name := 'T_fine_subjects_rls_on';
  select relation.relrowsecurity and not relation.relforcerowsecurity
  into test_ok
  from pg_catalog.pg_class relation
  where relation.oid = 'public.fine_subjects'::regclass;
  details := 'RLS ON; FORCE RLS OFF';
  return next;

  test_name := 'T2_fine_subjects_grants';
  test_ok := not exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) acl
      where relation.oid = 'public.fine_subjects'::regclass
        and acl.grantee = 0
        and acl.privilege_type = 'SELECT'
    )
    and not pg_catalog.has_table_privilege('anon', 'public.fine_subjects', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.fine_subjects', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_subjects', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_subjects', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.fine_subjects', 'DELETE')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_subjects', 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_subjects', 'INSERT')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_subjects', 'UPDATE')
    and pg_catalog.has_table_privilege('service_role', 'public.fine_subjects', 'DELETE');
  details := 'PUBLIC/anon=none; authenticated=SELECT with STAFF-only RLS; service_role=CRUD';
  return next;

  select pg_catalog.count(*)::integer into expected_count
  from public.fine_subjects subject
  where subject.club_id = club_id_value;

  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.fine_subjects;
  execute 'reset role';
  test_name := 'U_player_cannot_enumerate_subjects';
  test_ok := visible_count = 0;
  details := pg_catalog.format('visible=%s baseline=%s', visible_count, expected_count);
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count from public.fine_subjects;
  execute 'reset role';
  test_name := 'V_uid_without_membership_sees_zero_subjects';
  test_ok := visible_count = 0;
  details := 'visible=' || visible_count;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  test_name := 'W_anon_sees_zero_subjects';
  test_ok := false;
  details := null;
  begin
    select pg_catalog.count(*)::integer into visible_count from public.fine_subjects;
    test_ok := visible_count = 0;
    details := 'visible=' || visible_count;
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

  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select pg_catalog.count(*)::integer into visible_count
  from public.fine_subjects subject
  where subject.club_id = club_id_value;
  execute 'reset role';
  test_name := 'X_staff_reads_own_club_subjects';
  test_ok := visible_count = expected_count and expected_count > 0;
  details := pg_catalog.format('visible=%s baseline=%s', visible_count, expected_count);
  return next;

  test_name := 'Y_player_requires_jugador_id';
  test_ok := false;
  begin
    insert into public.fine_subjects (club_id, subject_type, jugador_id)
    values (club_id_value, 'player', null);
    raise sqlstate 'P4193' using message = 'UNEXPECTED_SUCCESS';
  exception
    when check_violation or foreign_key_violation then
      test_ok := true;
      details := 'identity rejected with 23514/23503';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'Z_player_rejects_staff_membership';
  test_ok := false;
  begin
    insert into public.fine_subjects (
      club_id, subject_type, jugador_id, staff_membership_id
    ) values (
      club_id_value, 'player', player_jugador_id, staff_membership_id
    );
    raise sqlstate 'P4194' using message = 'UNEXPECTED_SUCCESS';
  exception
    when check_violation or foreign_key_violation then
      test_ok := true;
      details := 'identity rejected with 23514/23503';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AA_staff_requires_membership';
  test_ok := false;
  begin
    insert into public.fine_subjects (club_id, subject_type, staff_membership_id)
    values (club_id_value, 'staff', null);
    raise sqlstate 'P4195' using message = 'UNEXPECTED_SUCCESS';
  exception
    when check_violation or foreign_key_violation then
      test_ok := true;
      details := 'identity rejected with 23514/23503';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AB_staff_rejects_jugador_id';
  test_ok := false;
  begin
    insert into public.fine_subjects (
      club_id, subject_type, jugador_id, staff_membership_id
    ) values (
      club_id_value, 'staff', player_jugador_id, staff_membership_id
    );
    raise sqlstate 'P4196' using message = 'UNEXPECTED_SUCCESS';
  exception
    when check_violation then test_ok := true; details := 'CHECK 23514';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AC_unknown_subject_type_rejected';
  test_ok := false;
  begin
    insert into public.fine_subjects (club_id, subject_type, jugador_id)
    values (club_id_value, 'captain', player_jugador_id);
    raise sqlstate 'P4197' using message = 'UNEXPECTED_SUCCESS';
  exception
    when check_violation then test_ok := true; details := 'CHECK/guard 23514';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AD_duplicate_player_rejected';
  test_ok := false;
  begin
    insert into public.fine_subjects (
      club_id, subject_type, jugador_id, display_name
    ) values (
      club_id_value, 'player', player_jugador_id, 'IGNORED'
    );
    raise sqlstate 'P4198' using message = 'UNEXPECTED_SUCCESS';
  exception
    when unique_violation then test_ok := true; details := 'UNIQUE 23505';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AE_duplicate_staff_rejected';
  test_ok := false;
  begin
    insert into public.fine_subjects (
      club_id, subject_type, staff_membership_id
    ) values (
      club_id_value, 'staff', staff_membership_id
    );
    insert into public.fine_subjects (
      club_id, subject_type, staff_membership_id
    ) values (
      club_id_value, 'staff', staff_membership_id
    );
    raise sqlstate 'P4199' using message = 'UNEXPECTED_SUCCESS';
  exception
    when unique_violation then test_ok := true; details := 'UNIQUE 23505; both inserts rolled back';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AF_cross_club_player_rejected';
  test_ok := false;
  begin
    insert into public.clubs (id, name)
    values ('b4100000-0000-4000-8000-000000000041'::uuid, 'BLOCK 4.1 CROSS CLUB TEST');
    insert into public.fine_subjects (
      club_id, subject_type, jugador_id, display_name
    ) values (
      'b4100000-0000-4000-8000-000000000041'::uuid,
      'player',
      player_jugador_id,
      'IGNORED'
    );
    raise sqlstate 'P4100' using message = 'UNEXPECTED_SUCCESS';
  exception
    when check_violation then test_ok := true; details := 'fail-closed guard 23514; test club rolled back';
    when others then get stacked diagnostics details = message_text;
  end;
  return next;

  test_name := 'AG_player_without_auth_is_subject';
  select pg_catalog.count(*)::integer into observed_count
  from public.fine_subjects subject
  join public.jugadores player on player.id = subject.jugador_id
  where subject.club_id = club_id_value
    and subject.subject_type = 'player'
    and subject.active
    and player.active_in_squad
    and not exists (
      select 1
      from public.club_memberships membership
      where membership.jugador_id = player.id
        and membership.role = 'player'
        and membership.is_active
    );
  test_ok := observed_count > 0;
  details := 'active player subjects without Auth membership=' || observed_count;
  return next;

  test_name := 'AH_no_destructive_cascade';
  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid in (
    'public.club_seasons'::regclass,
    'public.fine_subjects'::regclass
  )
    and constraint_row.contype = 'f'
    and constraint_row.confdeltype = 'c';
  test_ok := observed_count = 0;
  details := 'ON DELETE CASCADE foreign keys=' || observed_count;
  return next;

  test_name := 'AI_player_display_name_is_canonical';
  test_ok := exists (
    select 1
    from public.fine_subjects subject
    join public.jugadores player on player.id = subject.jugador_id
    where subject.id = player_subject_id
      and subject.display_name = coalesce(
        nullif(pg_catalog.btrim(player.name), ''),
        nullif(pg_catalog.btrim(player.shirt_name), '')
      )
  );
  details := 'Borja subject display_name is derived from jugadores';
  return next;

  test_name := 'AJ_staff_seed_deferred';
  select pg_catalog.count(*)::integer into observed_count
  from public.fine_subjects subject
  where subject.subject_type = 'staff';
  test_ok := observed_count = 0;
  details := 'staff subjects=' || observed_count || '; no reliable public display-name source';
  return next;

  test_name := 'AK_permissions_rls_unchanged';
  select pg_catalog.count(*)::integer into observed_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.club_member_permissions'::regclass
    and policy.polname in (
      'Members can read permitted permission rows',
      'Club managers can insert permissions',
      'Club managers can update permissions',
      'Club managers can delete permissions'
    );
  test_ok := observed_count = 4;
  details := pg_catalog.format('%s/4 inherited policies remain', observed_count);
  return next;

  test_name := 'AL_no_real_fines_manage_assignment';
  select pg_catalog.count(*)::integer into observed_count
  from public.club_member_permissions permission
  where permission.permission_key = 'fines_manage';
  test_ok := observed_count = 0;
  details := 'persistent fines_manage rows=' || observed_count;
  return next;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$verify$;

select test_name, test_ok, details
from pg_temp.verify_fines_foundation();

rollback;
