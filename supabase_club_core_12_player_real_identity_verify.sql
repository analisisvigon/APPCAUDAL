-- BLOQUE 1.5 - Verificacion funcional de la identidad PLAYER real ficticia.
--
-- PRERREQUISITOS:
--   1. Migracion 12 aplicada y verificada.
--   2. Usuario Auth ficticio creado.
--   3. Membership PLAYER ficticia creada con el archivo de alta controlada.
--
-- La llamada final usa el UUID Auth real de la cuenta PLAYER de Borja.
-- El archivo simula el rol de base de datos authenticated Y define
-- request.jwt.claim.sub/request.jwt.claim.role; SET ROLE por si solo no basta.
--
-- Devuelve una unica tabla. Las escrituras se prueban en subtransacciones
-- PL/pgSQL y el ROLLBACK final elimina la funcion pg_temp y toda configuracion.

begin;
set transaction isolation level repeatable read;

create or replace function pg_temp.verify_real_player_identity(
  player_auth_user_id uuid
)
returns table (
  test_order integer,
  category text,
  test_name text,
  expected text,
  observed text,
  test_ok boolean,
  details text
)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_club_id constant uuid :=
    'ca0da100-0000-4000-8000-000000000001';
  expected_membership_id constant uuid :=
    '9f715ffc-4d19-47cd-a17f-49b425ee92e0';
  player_a_jugador_id constant uuid :=
    '2e0146e9-e9fc-45ad-b055-edc138a85f7e';
  player_b_jugador_id constant uuid :=
    'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7';
  staff_user_id constant uuid :=
    'e0933d02-76c7-4e71-9765-896593e1ae80';
  no_membership_user_id constant uuid :=
    'b1500000-0000-4000-8000-000000000099';
  wellness_insert_id constant uuid :=
    'b1500000-0000-4000-8000-000000000011';
  rpe_insert_id constant uuid :=
    'b1500000-0000-4000-8000-000000000012';
  membership_rows integer;
  membership_id uuid;
  membership_role text;
  membership_jugador_id uuid;
  helper_jugador_id uuid;
  helper_is_player boolean;
  helper_is_staff boolean;
  visible_rows integer;
  own_rows integer;
  other_rows integer;
  baseline_rows integer;
  borja_wellness_rows integer;
  borja_rpe_rows integer;
  jairo_wellness_rows integer;
  jairo_rpe_rows integer;
  target_row_id uuid;
  affected_rows integer;
  operation_allowed boolean;
  error_state text;
  error_message text;
  target_row record;
  invalid_staff_policy_count integer;
  audited_staff_policy_count integer;
begin
  if player_auth_user_id is null then
    raise exception 'Bloque 1.5: falta el UUID Auth PLAYER real';
  end if;

  if not exists (
    select 1
    from auth.users account
    where account.id = player_auth_user_id
      and account.deleted_at is null
      and not coalesce(account.is_anonymous, false)
  ) then
    raise exception
      'Bloque 1.5: el UUID no corresponde al usuario Auth ficticio esperado';
  end if;

  if (
    select count(*)
    from public.club_memberships membership
    where membership.id = expected_membership_id
      and membership.user_id = player_auth_user_id
      and membership.club_id = target_club_id
      and membership.role = 'player'
      and membership.jugador_id = player_a_jugador_id
      and membership.is_active
  ) <> 1 then
    raise exception
      'Bloque 1.5: no existe exactamente la membership PLAYER_A esperada';
  end if;

  if (select count(*) from public.club_memberships) <> 6
     or (select count(*) from public.club_memberships where is_active) <> 6
     or (
       select count(*) from public.club_memberships
       where is_active and role = 'owner'
     ) <> 1
     or (
       select count(*) from public.club_memberships
       where is_active and role = 'staff'
     ) <> 4
     or (
       select count(*) from public.club_memberships
       where is_active and role = 'player'
     ) <> 1 then
    raise exception
      'Bloque 1.5: el inventario no es 1 owner + 4 staff + 1 PLAYER activos';
  end if;

  select count(*)::integer into borja_wellness_rows
  from public.wellness_entries entry
  where entry.jugador_id = player_a_jugador_id;

  select count(*)::integer into borja_rpe_rows
  from public.rpe_entries entry
  where entry.jugador_id = player_a_jugador_id;

  select count(*)::integer into jairo_wellness_rows
  from public.wellness_entries entry
  where entry.jugador_id = player_b_jugador_id;

  select count(*)::integer into jairo_rpe_rows
  from public.rpe_entries entry
  where entry.jugador_id = player_b_jugador_id;

  if borja_wellness_rows = 0
     or borja_rpe_rows = 0
     or jairo_wellness_rows = 0
     or jairo_rpe_rows = 0 then
    raise exception
      'Bloque 1.5: PLAYER_A o PLAYER_B carece ya de datos para la prueba cruzada';
  end if;

  if exists (
    select 1 from public.wellness_entries entry
    where entry.id = wellness_insert_id
       or (
         entry.jugador_id = player_a_jugador_id
         and entry.entry_date = date '2199-12-30'
       )
  ) or exists (
    select 1 from public.rpe_entries entry
    where entry.id = rpe_insert_id
       or (
         entry.jugador_id = player_a_jugador_id
         and entry.entry_date = date '2199-12-31'
       )
  ) then
    raise exception
      'Bloque 1.5: colisionaron los UUID o fechas reservados de prueba';
  end if;

  -- El contrato STAFF de Rendimiento debe seguir exacto antes de probar.
  with targets(table_name) as (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  ),
  expected(policy_name, command, needs_using, needs_check) as (
    values
      ('performance_staff_select'::text, 'r'::"char", true, false),
      ('performance_staff_insert'::text, 'a'::"char", false, true),
      ('performance_staff_update'::text, 'w'::"char", true, true),
      ('performance_staff_delete'::text, 'd'::"char", true, false)
  ),
  expected_contract as (
    select relation.oid as relation_oid, expected.*
    from targets target
    join pg_catalog.pg_namespace namespace
      on namespace.nspname = 'public'
    join pg_catalog.pg_class relation
      on relation.relnamespace = namespace.oid
     and relation.relname = target.table_name
    cross join expected
  ),
  audited as (
    select
      contract.*,
      policy.oid as policy_oid,
      policy.polpermissive,
      policy.polcmd,
      policy.polroles,
      policy.polqual,
      policy.polwithcheck,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
            ''
          )),
          '[[:space:]()]', '', 'g'
        ),
        'public.', ''
      ) as normalized_using,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(
            pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
            ''
          )),
          '[[:space:]()]', '', 'g'
        ),
        'public.', ''
      ) as normalized_check
    from expected_contract contract
    left join pg_catalog.pg_policy policy
      on policy.polrelid = contract.relation_oid
     and policy.polname = contract.policy_name
  )
  select count(*)::integer
    into invalid_staff_policy_count
  from audited policy
  where policy.policy_oid is null
    or not policy.polpermissive
    or policy.polcmd <> policy.command
    or policy.polroles <> array[
      (select role.oid from pg_catalog.pg_roles role
       where role.rolname = 'authenticated')
    ]::oid[]
    or case when policy.needs_using then
      policy.normalized_using <> 'is_app_staff'
    else policy.polqual is not null end
    or case when policy.needs_check then
      policy.normalized_check <> 'is_app_staff'
    else policy.polwithcheck is not null end;

  select count(*)::integer
    into audited_staff_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in (
      'wellness_entries',
      'rpe_entries',
      'training_sessions',
      'training_session_load_metrics',
      'rpe_sync_pending'
    )
    and policy.polname in (
      'performance_staff_select',
      'performance_staff_insert',
      'performance_staff_update',
      'performance_staff_delete'
    );

  test_order := 1;
  category := 'CATALOG';
  test_name := 'performance_staff_policies_unchanged';
  expected := '20 exact STAFF policies';
  observed := pg_catalog.format(
    '%s audited; %s invalid/missing',
    audited_staff_policy_count,
    invalid_staff_policy_count
  );
  test_ok := audited_staff_policy_count = 20
    and invalid_staff_policy_count = 0;
  details := null;
  return next;

  -- Identidad JWT PLAYER real: role de BD + sub + role claim.
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    player_auth_user_id::text,
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );
  execute 'set local role authenticated';

  select
    count(membership.membership_id)::integer,
    (pg_catalog.array_agg(
      membership.membership_id order by membership.membership_id
    ))[1],
    min(membership.role),
    (pg_catalog.array_agg(
      membership.jugador_id order by membership.membership_id
    ))[1]
  into membership_rows, membership_id, membership_role, membership_jugador_id
  from public.current_membership() membership;

  select public.current_jugador_id(), public.is_player(), public.is_app_staff()
  into helper_jugador_id, helper_is_player, helper_is_staff;

  test_order := 10;
  category := 'IDENTITY';
  test_name := 'player_helpers';
  expected := '1 row; exact membership; player; Borja; is_player=true; is_app_staff=false';
  observed := pg_catalog.format(
    '%s row(s); membership=%s; role=%s; jugador=%s; is_player=%s; is_app_staff=%s',
    membership_rows,
    coalesce(membership_id::text, 'NULL'),
    coalesce(membership_role, 'NULL'),
    coalesce(membership_jugador_id::text, 'NULL'),
    coalesce(helper_is_player::text, 'NULL'),
    coalesce(helper_is_staff::text, 'NULL')
  );
  test_ok := coalesce(
    membership_rows = 1
    and membership_id = expected_membership_id
    and membership_role = 'player'
    and membership_jugador_id = player_a_jugador_id
    and helper_jugador_id = player_a_jugador_id
    and helper_is_player
    and not helper_is_staff,
    false
  );
  details := 'current_jugador_id=' || coalesce(
    helper_jugador_id::text,
    'NULL'
  );
  return next;

  select
    count(*)::integer,
    count(*) filter (
      where membership.user_id = player_auth_user_id
    )::integer,
    count(*) filter (
      where membership.user_id <> player_auth_user_id
    )::integer
  into visible_rows, own_rows, other_rows
  from public.club_memberships membership;

  test_order := 20;
  category := 'MEMBERSHIPS';
  test_name := 'player_reads_only_own_membership';
  expected := 'visible=1; own=1; other=0';
  observed := pg_catalog.format(
    'visible=%s; own=%s; other=%s',
    visible_rows,
    own_rows,
    other_rows
  );
  test_ok := visible_rows = 1 and own_rows = 1 and other_rows = 0;
  details := null;
  return next;

  select
    count(*)::integer,
    count(*) filter (
      where entry.jugador_id = player_a_jugador_id
    )::integer,
    count(*) filter (
      where entry.jugador_id <> player_a_jugador_id
    )::integer
  into visible_rows, own_rows, other_rows
  from public.wellness_entries entry;

  test_order := 30;
  category := 'WELLNESS';
  test_name := 'player_a_reads_all_and_only_own';
  expected := pg_catalog.format('visible Borja rows=%s', borja_wellness_rows);
  observed := pg_catalog.format(
    'visible=%s; Borja=%s; other_players=%s',
    visible_rows,
    own_rows,
    other_rows
  );
  test_ok := visible_rows = borja_wellness_rows
    and own_rows = borja_wellness_rows
    and other_rows = 0;
  details := null;
  return next;

  select count(*)::integer into visible_rows
  from public.wellness_entries entry
  where entry.jugador_id = player_b_jugador_id;

  test_order := 31;
  category := 'WELLNESS';
  test_name := 'cross_isolation_borja_to_jairo';
  expected := '0 rows';
  observed := pg_catalog.format(
    '%s rows (Jairo baseline=%s)',
    visible_rows,
    jairo_wellness_rows
  );
  test_ok := visible_rows = 0 and jairo_wellness_rows > 0;
  details := null;
  return next;

  select
    count(*)::integer,
    count(*) filter (
      where entry.jugador_id = player_a_jugador_id
    )::integer,
    count(*) filter (
      where entry.jugador_id <> player_a_jugador_id
    )::integer
  into visible_rows, own_rows, other_rows
  from public.rpe_entries entry;

  test_order := 40;
  category := 'RPE';
  test_name := 'player_a_reads_all_and_only_own';
  expected := pg_catalog.format('visible Borja rows=%s', borja_rpe_rows);
  observed := pg_catalog.format(
    'visible=%s; Borja=%s; other_players=%s',
    visible_rows,
    own_rows,
    other_rows
  );
  test_ok := visible_rows = borja_rpe_rows
    and own_rows = borja_rpe_rows
    and other_rows = 0;
  details := null;
  return next;

  select count(*)::integer into visible_rows
  from public.rpe_entries entry
  where entry.jugador_id = player_b_jugador_id;

  test_order := 41;
  category := 'RPE';
  test_name := 'cross_isolation_borja_to_jairo';
  expected := '0 rows';
  observed := pg_catalog.format(
    '%s rows (Jairo baseline=%s)',
    visible_rows,
    jairo_rpe_rows
  );
  test_ok := visible_rows = 0 and jairo_rpe_rows > 0;
  details := null;
  return next;

  -- INSERT Wellness: solo 42501 demuestra que RLS, no una constraint, lo nego.
  operation_allowed := false;
  error_state := null;
  error_message := null;
  begin
    insert into public.wellness_entries (
      id, jugador_id, entry_date, comment
    ) values (
      wellness_insert_id,
      player_a_jugador_id,
      date '2199-12-30',
      'BLOQUE 1.5 PLAYER INSERT TEST'
    );
    raise sqlstate 'P1501' using message = 'ROLLBACK_ALLOWED_INSERT';
  exception
    when sqlstate 'P1501' then
      operation_allowed := true;
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
  end;

  test_order := 50;
  category := 'WRITE_DENIAL';
  test_name := 'wellness_insert';
  expected := 'denied by RLS (42501)';
  observed := case
    when operation_allowed then 'ALLOWED'
    else coalesce(error_state, 'DENIED_WITHOUT_ERROR')
  end;
  test_ok := not operation_allowed and error_state = '42501';
  details := error_message;
  return next;

  select entry.id into target_row_id
  from public.wellness_entries entry
  where entry.jugador_id = player_a_jugador_id
  order by entry.entry_date, entry.id
  limit 1;

  operation_allowed := false;
  error_state := null;
  error_message := null;
  begin
    update public.wellness_entries entry
    set comment = entry.comment
    where entry.id = target_row_id;
    get diagnostics affected_rows = row_count;
    if affected_rows > 0 then
      raise sqlstate 'P1502' using message = 'ROLLBACK_ALLOWED_UPDATE';
    end if;
  exception
    when sqlstate 'P1502' then
      operation_allowed := true;
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
  end;

  test_order := 51;
  category := 'WRITE_DENIAL';
  test_name := 'wellness_update';
  expected := '0 affected rows';
  observed := case
    when operation_allowed then 'ALLOWED'
    when error_state is not null then error_state
    else pg_catalog.format('%s affected rows', affected_rows)
  end;
  test_ok := not operation_allowed
    and error_state is null
    and affected_rows = 0;
  details := error_message;
  return next;

  operation_allowed := false;
  error_state := null;
  error_message := null;
  begin
    delete from public.wellness_entries entry
    where entry.id = target_row_id;
    get diagnostics affected_rows = row_count;
    if affected_rows > 0 then
      raise sqlstate 'P1503' using message = 'ROLLBACK_ALLOWED_DELETE';
    end if;
  exception
    when sqlstate 'P1503' then
      operation_allowed := true;
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
  end;

  test_order := 52;
  category := 'WRITE_DENIAL';
  test_name := 'wellness_delete';
  expected := '0 affected rows';
  observed := case
    when operation_allowed then 'ALLOWED'
    when error_state is not null then error_state
    else pg_catalog.format('%s affected rows', affected_rows)
  end;
  test_ok := not operation_allowed
    and error_state is null
    and affected_rows = 0;
  details := error_message;
  return next;

  operation_allowed := false;
  error_state := null;
  error_message := null;
  begin
    if exists (
      select 1
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = 'public.rpe_entries'::regclass
        and attribute.attname = 'club_id'
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      execute $insert$
        insert into public.rpe_entries (
          id, club_id, jugador_id, session_id, entry_date,
          submitted_at, rpe, comment
        ) values ($1, $2, $3, null, $4, $5, $6, $7)
      $insert$
      using
        rpe_insert_id,
        target_club_id,
        player_a_jugador_id,
        date '2199-12-31',
        timestamptz '2199-12-31 12:00:00+00',
        1,
        'BLOQUE 1.5 PLAYER INSERT TEST';
    else
      insert into public.rpe_entries (
        id, jugador_id, session_id, entry_date,
        submitted_at, rpe, comment
      ) values (
        rpe_insert_id,
        player_a_jugador_id,
        null,
        date '2199-12-31',
        timestamptz '2199-12-31 12:00:00+00',
        1,
        'BLOQUE 1.5 PLAYER INSERT TEST'
      );
    end if;
    raise sqlstate 'P1504' using message = 'ROLLBACK_ALLOWED_INSERT';
  exception
    when sqlstate 'P1504' then
      operation_allowed := true;
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
  end;

  test_order := 53;
  category := 'WRITE_DENIAL';
  test_name := 'rpe_insert';
  expected := 'denied by RLS (42501)';
  observed := case
    when operation_allowed then 'ALLOWED'
    else coalesce(error_state, 'DENIED_WITHOUT_ERROR')
  end;
  test_ok := not operation_allowed and error_state = '42501';
  details := error_message;
  return next;

  select entry.id into target_row_id
  from public.rpe_entries entry
  where entry.jugador_id = player_a_jugador_id
  order by entry.entry_date, entry.id
  limit 1;

  operation_allowed := false;
  error_state := null;
  error_message := null;
  begin
    update public.rpe_entries entry
    set comment = entry.comment
    where entry.id = target_row_id;
    get diagnostics affected_rows = row_count;
    if affected_rows > 0 then
      raise sqlstate 'P1505' using message = 'ROLLBACK_ALLOWED_UPDATE';
    end if;
  exception
    when sqlstate 'P1505' then
      operation_allowed := true;
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
  end;

  test_order := 54;
  category := 'WRITE_DENIAL';
  test_name := 'rpe_update';
  expected := '0 affected rows';
  observed := case
    when operation_allowed then 'ALLOWED'
    when error_state is not null then error_state
    else pg_catalog.format('%s affected rows', affected_rows)
  end;
  test_ok := not operation_allowed
    and error_state is null
    and affected_rows = 0;
  details := error_message;
  return next;

  operation_allowed := false;
  error_state := null;
  error_message := null;
  begin
    delete from public.rpe_entries entry
    where entry.id = target_row_id;
    get diagnostics affected_rows = row_count;
    if affected_rows > 0 then
      raise sqlstate 'P1506' using message = 'ROLLBACK_ALLOWED_DELETE';
    end if;
  exception
    when sqlstate 'P1506' then
      operation_allowed := true;
    when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
  end;

  test_order := 55;
  category := 'WRITE_DENIAL';
  test_name := 'rpe_delete';
  expected := '0 affected rows';
  observed := case
    when operation_allowed then 'ALLOWED'
    when error_state is not null then error_state
    else pg_catalog.format('%s affected rows', affected_rows)
  end;
  test_ok := not operation_allowed
    and error_state is null
    and affected_rows = 0;
  details := error_message;
  return next;

  for target_row in
    select * from (
      values
        (60, 'training_sessions'::text),
        (61, 'training_session_load_metrics'::text),
        (62, 'rpe_sync_pending'::text)
    ) target_data(target_order, target_table)
    order by target_order
  loop
    visible_rows := 0;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format(
        'select count(*)::integer from public.%I',
        target_row.target_table
      ) into visible_rows;
    exception
      when others then
        visible_rows := 0;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
    end;

    test_order := target_row.target_order;
    category := 'STAFF_ONLY_TABLE';
    test_name := 'player_no_access_' || target_row.target_table;
    expected := '0 visible rows or 42501';
    observed := case
      when error_state is null then pg_catalog.format('%s rows', visible_rows)
      else error_state
    end;
    test_ok := visible_rows = 0
      and (error_state is null or error_state = '42501');
    details := error_message;
    return next;
  end loop;

  execute 'reset role';

  -- UID authenticated sin membership: helpers vacios/falsos y ninguna lectura.
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    no_membership_user_id::text,
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );
  execute 'set local role authenticated';

  select count(membership.membership_id)::integer
    into membership_rows
  from public.current_membership() membership;
  select public.current_jugador_id(), public.is_player(), public.is_app_staff()
    into helper_jugador_id, helper_is_player, helper_is_staff;

  test_order := 70;
  category := 'UID_WITHOUT_MEMBERSHIP';
  test_name := 'identity_helpers_empty';
  expected := '0 memberships; jugador=NULL; player=false; staff=false';
  observed := pg_catalog.format(
    '%s memberships; jugador=%s; player=%s; staff=%s',
    membership_rows,
    coalesce(helper_jugador_id::text, 'NULL'),
    helper_is_player,
    helper_is_staff
  );
  test_ok := membership_rows = 0
    and helper_jugador_id is null
    and not helper_is_player
    and not helper_is_staff;
  details := null;
  return next;

  for target_row in
    select * from (
      values
        (71, 'club_memberships'::text),
        (72, 'wellness_entries'::text),
        (73, 'rpe_entries'::text),
        (74, 'training_sessions'::text),
        (75, 'training_session_load_metrics'::text),
        (76, 'rpe_sync_pending'::text)
    ) target_data(target_order, target_table)
    order by target_order
  loop
    visible_rows := 0;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format(
        'select count(*)::integer from public.%I',
        target_row.target_table
      ) into visible_rows;
    exception
      when others then
        visible_rows := 0;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
    end;

    test_order := target_row.target_order;
    category := 'UID_WITHOUT_MEMBERSHIP';
    test_name := 'no_read_' || target_row.target_table;
    expected := '0 visible rows or 42501';
    observed := case
      when error_state is null then pg_catalog.format('%s rows', visible_rows)
      else error_state
    end;
    test_ok := visible_rows = 0
      and (error_state is null or error_state = '42501');
    details := error_message;
    return next;
  end loop;

  execute 'reset role';

  -- STAFF conserva las lecturas administrativas existentes.
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    staff_user_id::text,
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );

  for target_row in
    select * from (
      values
        (80, 'club_memberships'::text),
        (81, 'wellness_entries'::text),
        (82, 'rpe_entries'::text),
        (83, 'training_sessions'::text),
        (84, 'training_session_load_metrics'::text),
        (85, 'rpe_sync_pending'::text)
    ) target_data(target_order, target_table)
    order by target_order
  loop
    if target_row.target_table = 'club_memberships' then
      select count(*)::integer into baseline_rows
      from public.club_memberships membership
      where membership.club_id = target_club_id;
    else
      execute pg_catalog.format(
        'select count(*)::integer from public.%I',
        target_row.target_table
      ) into baseline_rows;
    end if;

    execute 'set local role authenticated';
    visible_rows := 0;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format(
        'select count(*)::integer from public.%I',
        target_row.target_table
      ) into visible_rows;
    exception
      when others then
        visible_rows := 0;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
    end;
    execute 'reset role';

    test_order := target_row.target_order;
    category := 'STAFF_REGRESSION';
    test_name := 'staff_reads_' || target_row.target_table;
    expected := pg_catalog.format('%s visible rows', baseline_rows);
    observed := case
      when error_state is null then pg_catalog.format('%s rows', visible_rows)
      else error_state
    end;
    test_ok := error_state is null and visible_rows = baseline_rows;
    details := error_message;
    return next;
  end loop;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
end;
$$;

select
  test_order,
  category,
  test_name,
  expected,
  observed,
  test_ok,
  details
from pg_temp.verify_real_player_identity(
  '350615a9-b068-450a-b867-da30a59b9082'::uuid
)
order by test_order;

rollback;
