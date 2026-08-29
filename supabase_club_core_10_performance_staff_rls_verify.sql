-- BLOQUE 1.3 - Verificacion posterior transaccional de RLS.
--
-- Ejecutar el archivo completo en Supabase SQL Editor despues de aplicar
-- supabase_club_core_10_performance_staff_rls.sql.
--
-- La unica consulta que devuelve filas produce 20 resultados:
-- cuatro escenarios x cinco tablas. Todas las filas deben tener test_ok=true.
-- Las filas semilla se eliminan con el ROLLBACK final. Cada escritura de prueba
-- permitida se revierte ademas dentro de una subtransaccion PL/pgSQL.

begin;

create or replace function pg_temp.verify_performance_staff_rls()
returns table (
  scenario text,
  simulated_user_id uuid,
  table_name text,
  select_allowed boolean,
  insert_allowed boolean,
  update_allowed boolean,
  delete_allowed boolean,
  expected_access boolean,
  open_authenticated_policy_count integer,
  test_ok boolean,
  failure_details text
)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  scenario_row record;
  target_row record;
  fixture_jugador_id uuid;
  fixture_club_id uuid;
  fixture_session_id constant uuid :=
    'b1300000-0000-4000-8000-000000000001';
  fixture_metrics_parent_id constant uuid :=
    'b1300000-0000-4000-8000-000000000002';
  fixture_ids constant jsonb := pg_catalog.jsonb_build_object(
    'wellness_entries', 'b1300000-0000-4000-8000-000000000011',
    'rpe_entries', 'b1300000-0000-4000-8000-000000000012',
    'training_sessions', 'b1300000-0000-4000-8000-000000000013',
    'training_session_load_metrics', 'b1300000-0000-4000-8000-000000000014',
    'rpe_sync_pending', 'b1300000-0000-4000-8000-000000000015'
  );
  candidate_ids constant jsonb := pg_catalog.jsonb_build_object(
    'wellness_entries', 'b1300000-0000-4000-8000-000000000021',
    'rpe_entries', 'b1300000-0000-4000-8000-000000000022',
    'training_sessions', 'b1300000-0000-4000-8000-000000000023',
    'training_session_load_metrics', 'b1300000-0000-4000-8000-000000000024',
    'rpe_sync_pending', 'b1300000-0000-4000-8000-000000000025'
  );
  fixture_id uuid;
  candidate_id uuid;
  visible_rows integer;
  affected_rows integer;
  local_select_allowed boolean;
  local_insert_allowed boolean;
  local_update_allowed boolean;
  local_delete_allowed boolean;
  select_error text;
  insert_error text;
  update_error text;
  delete_error text;
  insert_state text;
  error_state text;
  error_message text;
  authenticated_oid oid;
begin
  select jugador.id
    into fixture_jugador_id
  from public.jugadores jugador
  order by jugador.id
  limit 1;

  if fixture_jugador_id is null then
    raise exception
      'Verificacion Bloque 1.3 abortada: no existe ningun jugador para satisfacer las FKs';
  end if;

  select membership.club_id
    into fixture_club_id
  from public.club_memberships membership
  where membership.is_active
    and membership.role = 'owner'
  order by membership.club_id
  limit 1;

  if exists (
    select 1 from public.training_sessions
    where id in (
      fixture_session_id,
      fixture_metrics_parent_id,
      (fixture_ids ->> 'training_sessions')::uuid,
      (candidate_ids ->> 'training_sessions')::uuid
    )
  )
  or exists (
    select 1 from public.wellness_entries
    where id in (
      (fixture_ids ->> 'wellness_entries')::uuid,
      (candidate_ids ->> 'wellness_entries')::uuid
    )
  )
  or exists (
    select 1 from public.rpe_entries
    where id in (
      (fixture_ids ->> 'rpe_entries')::uuid,
      (candidate_ids ->> 'rpe_entries')::uuid
    )
  )
  or exists (
    select 1 from public.training_session_load_metrics
    where id in (
      (fixture_ids ->> 'training_session_load_metrics')::uuid,
      (candidate_ids ->> 'training_session_load_metrics')::uuid
    )
  )
  or exists (
    select 1 from public.rpe_sync_pending
    where id in (
      (fixture_ids ->> 'rpe_sync_pending')::uuid,
      (candidate_ids ->> 'rpe_sync_pending')::uuid
    )
  ) then
    raise exception
      'Verificacion Bloque 1.3 abortada: colisionaron UUID reservados de prueba';
  end if;

  -- Filas semilla creadas como postgres antes de simular los roles cliente.
  -- Todas pertenecen a esta transaccion y desaparecen con el ROLLBACK final.
  insert into public.training_sessions (
    id,
    session_date,
    title,
    session_type,
    record_kind
  )
  values
    (
      fixture_session_id,
      date '2199-01-01',
      'BLOQUE 1.3 RLS FIXTURE',
      'Entrenamiento',
      'legacy'
    ),
    (
      fixture_metrics_parent_id,
      date '2199-01-02',
      'BLOQUE 1.3 RLS METRICS PARENT',
      'Entrenamiento',
      'legacy'
    ),
    (
      (fixture_ids ->> 'training_sessions')::uuid,
      date '2199-01-03',
      'BLOQUE 1.3 RLS TARGET',
      'Entrenamiento',
      'legacy'
    );

  insert into public.wellness_entries (
    id,
    jugador_id,
    entry_date,
    comment
  ) values (
    (fixture_ids ->> 'wellness_entries')::uuid,
    fixture_jugador_id,
    date '2199-01-04',
    'BLOQUE 1.3 RLS FIXTURE'
  );

  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.rpe_entries'::regclass
      and attribute.attname = 'club_id'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    if fixture_club_id is null then
      raise exception
        'Verificacion Bloque 1.3 abortada: rpe_entries tiene club_id pero no existe club owner activo';
    end if;

    execute $insert$
      insert into public.rpe_entries (
        id, club_id, jugador_id, session_id, entry_date,
        submitted_at, rpe, comment
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    $insert$
    using
      (fixture_ids ->> 'rpe_entries')::uuid,
      fixture_club_id,
      fixture_jugador_id,
      fixture_session_id,
      date '2199-01-05',
      timestamptz '2199-01-05 12:00:00+00',
      1,
      'BLOQUE 1.3 RLS FIXTURE';
  else
    insert into public.rpe_entries (
      id,
      jugador_id,
      session_id,
      entry_date,
      submitted_at,
      rpe,
      comment
    ) values (
      (fixture_ids ->> 'rpe_entries')::uuid,
      fixture_jugador_id,
      fixture_session_id,
      date '2199-01-05',
      timestamptz '2199-01-05 12:00:00+00',
      1,
      'BLOQUE 1.3 RLS FIXTURE'
    );
  end if;

  insert into public.training_session_load_metrics (
    id,
    session_id,
    scope,
    aggregation_method,
    load_units
  ) values (
    (fixture_ids ->> 'training_session_load_metrics')::uuid,
    fixture_session_id,
    'team',
    'team_average',
    0
  );

  insert into public.rpe_sync_pending (
    id,
    jugador_id,
    entry_date,
    rpe,
    comment
  ) values (
    (fixture_ids ->> 'rpe_sync_pending')::uuid,
    fixture_jugador_id,
    date '2199-01-06',
    1,
    'BLOQUE 1.3 RLS FIXTURE'
  );

  select role.oid
    into authenticated_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'authenticated';

  select count(*)::integer
    into open_authenticated_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in (
      'wellness_entries',
      'rpe_entries',
      'training_sessions',
      'training_session_load_metrics',
      'rpe_sync_pending'
    )
    and policy.polpermissive
    and (
      0::oid = any(policy.polroles)
      or authenticated_oid = any(policy.polroles)
    )
    and (
      pg_catalog.regexp_replace(
        coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), ''),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
      or pg_catalog.regexp_replace(
        coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
    );

  for scenario_row in
    select *
    from (
      values
        (
          1,
          'OWNER'::text,
          'authenticated'::text,
          '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid,
          true
        ),
        (
          2,
          'STAFF'::text,
          'authenticated'::text,
          'e0933d02-76c7-4e71-9765-896593e1ae80'::uuid,
          true
        ),
        (
          3,
          'UID_WITHOUT_MEMBERSHIP'::text,
          'authenticated'::text,
          'b1300000-0000-4000-8000-000000000099'::uuid,
          false
        ),
        (4, 'ANON'::text, 'anon'::text, null::uuid, false)
    ) scenario_data(
      scenario_order,
      scenario_name,
      database_role,
      user_id,
      should_have_access
    )
    order by scenario_order
  loop
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      coalesce(scenario_row.user_id::text, ''),
      true
    );

    if scenario_row.database_role = 'anon' then
      execute 'set local role anon';
    else
      execute 'set local role authenticated';
    end if;

    for target_row in
      select *
      from (
        values
          (1, 'wellness_entries'::text, 'comment'::text),
          (2, 'rpe_entries'::text, 'comment'::text),
          (3, 'training_sessions'::text, 'notes'::text),
          (4, 'training_session_load_metrics'::text, 'load_units'::text),
          (5, 'rpe_sync_pending'::text, 'comment'::text)
      ) target_data(table_order, target_table, update_column)
      order by table_order
    loop
      fixture_id := (fixture_ids ->> target_row.target_table)::uuid;
      candidate_id := (candidate_ids ->> target_row.target_table)::uuid;
      local_select_allowed := false;
      local_insert_allowed := false;
      local_update_allowed := false;
      local_delete_allowed := false;
      select_error := null;
      insert_error := null;
      update_error := null;
      delete_error := null;
      insert_state := null;

      begin
        execute pg_catalog.format(
          'select count(*)::integer from public.%I where id = $1',
          target_row.target_table
        )
        into visible_rows
        using fixture_id;
        local_select_allowed := visible_rows = 1;
      exception
        when others then
          local_select_allowed := false;
          get stacked diagnostics
            error_state = returned_sqlstate,
            error_message = message_text;
          select_error := error_state || ': ' || error_message;
      end;

      begin
        case target_row.target_table
          when 'wellness_entries' then
            insert into public.wellness_entries (
              id, jugador_id, entry_date, comment
            ) values (
              candidate_id,
              fixture_jugador_id,
              date '2199-02-01',
              'BLOQUE 1.3 RLS INSERT'
            );
          when 'rpe_entries' then
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
                ) values ($1, $2, $3, $4, $5, $6, $7, $8)
              $insert$
              using
                candidate_id,
                fixture_club_id,
                fixture_jugador_id,
                fixture_metrics_parent_id,
                date '2199-02-02',
                timestamptz '2199-02-02 12:00:00+00',
                1,
                'BLOQUE 1.3 RLS INSERT';
            else
              insert into public.rpe_entries (
                id, jugador_id, session_id, entry_date, submitted_at, rpe, comment
              ) values (
                candidate_id,
                fixture_jugador_id,
                fixture_metrics_parent_id,
                date '2199-02-02',
                timestamptz '2199-02-02 12:00:00+00',
                1,
                'BLOQUE 1.3 RLS INSERT'
              );
            end if;
          when 'training_sessions' then
            insert into public.training_sessions (
              id, session_date, title, session_type, record_kind
            ) values (
              candidate_id,
              date '2199-02-03',
              'BLOQUE 1.3 RLS INSERT',
              'Entrenamiento',
              'legacy'
            );
          when 'training_session_load_metrics' then
            insert into public.training_session_load_metrics (
              id, session_id, scope, aggregation_method, load_units
            ) values (
              candidate_id,
              fixture_metrics_parent_id,
              'team',
              'team_average',
              0
            );
          when 'rpe_sync_pending' then
            insert into public.rpe_sync_pending (
              id, jugador_id, entry_date, rpe, comment
            ) values (
              candidate_id,
              fixture_jugador_id,
              date '2199-02-04',
              1,
              'BLOQUE 1.3 RLS INSERT'
            );
        end case;

        raise sqlstate 'P1301' using message = 'ROLLBACK_INSERT_TEST';
      exception
        when sqlstate 'P1301' then
          local_insert_allowed := true;
        when others then
          local_insert_allowed := false;
          get stacked diagnostics
            error_state = returned_sqlstate,
            error_message = message_text;
          insert_state := error_state;
          insert_error := error_state || ': ' || error_message;
      end;

      begin
        execute pg_catalog.format(
          'update public.%1$I set %2$I = %2$I where id = $1',
          target_row.target_table,
          target_row.update_column
        ) using fixture_id;
        get diagnostics affected_rows = row_count;

        if affected_rows = 1 then
          raise sqlstate 'P1302' using message = 'ROLLBACK_UPDATE_TEST';
        end if;
      exception
        when sqlstate 'P1302' then
          local_update_allowed := true;
        when others then
          local_update_allowed := false;
          get stacked diagnostics
            error_state = returned_sqlstate,
            error_message = message_text;
          update_error := error_state || ': ' || error_message;
      end;

      begin
        execute pg_catalog.format(
          'delete from public.%I where id = $1',
          target_row.target_table
        ) using fixture_id;
        get diagnostics affected_rows = row_count;

        if affected_rows = 1 then
          raise sqlstate 'P1303' using message = 'ROLLBACK_DELETE_TEST';
        end if;
      exception
        when sqlstate 'P1303' then
          local_delete_allowed := true;
        when others then
          local_delete_allowed := false;
          get stacked diagnostics
            error_state = returned_sqlstate,
            error_message = message_text;
          delete_error := error_state || ': ' || error_message;
      end;

      scenario := scenario_row.scenario_name;
      simulated_user_id := scenario_row.user_id;
      table_name := target_row.target_table;
      select_allowed := local_select_allowed;
      insert_allowed := local_insert_allowed;
      update_allowed := local_update_allowed;
      delete_allowed := local_delete_allowed;
      expected_access := scenario_row.should_have_access;
      test_ok := coalesce(
        open_authenticated_policy_count = 0
        and case
          when expected_access then
            select_allowed
            and insert_allowed
            and update_allowed
            and delete_allowed
          else
            not select_allowed
            and not insert_allowed
            and not update_allowed
            and not delete_allowed
            and insert_state = '42501'
        end,
        false
      );
      failure_details := pg_catalog.concat_ws(
        ' | ',
        case when select_error is not null then 'SELECT ' || select_error end,
        case when insert_error is not null then 'INSERT ' || insert_error end,
        case when update_error is not null then 'UPDATE ' || update_error end,
        case when delete_error is not null then 'DELETE ' || delete_error end
      );

      return next;
    end loop;

    execute 'reset role';
  end loop;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
end;
$$;

select *
from pg_temp.verify_performance_staff_rls()
order by
  case scenario
    when 'OWNER' then 1
    when 'STAFF' then 2
    when 'UID_WITHOUT_MEMBERSHIP' then 3
    when 'ANON' then 4
    else 5
  end,
  case table_name
    when 'wellness_entries' then 1
    when 'rpe_entries' then 2
    when 'training_sessions' then 3
    when 'training_session_load_metrics' then 4
    when 'rpe_sync_pending' then 5
    else 6
  end;

rollback;
