-- BLOQUE 2.3 - Verificacion funcional de lectura de Mi rendimiento.
--
-- NO ES UNA MIGRACION. No modifica tablas, datos, RLS, policies ni grants.
-- Crea unicamente una funcion pg_temp dentro de esta transaccion para poder
-- simular cuatro roles y devolver UNA sola tabla; el ROLLBACK final la elimina.
-- Las consultas funcionales son exclusivamente SELECT/COUNT y nunca exponen
-- el contenido de comentarios o molestias.
--
-- Ejecutar el archivo COMPLETO en Supabase SQL Editor. Resultado esperado:
-- 10 filas con test_ok = true (2 catalogo + 2 PLAYER + 2 sin membership
-- + 2 anon + 2 STAFF).

begin;
set transaction isolation level repeatable read;

create or replace function pg_temp.verify_my_performance_reads()
returns table (
  test_order integer,
  scenario text,
  table_name text,
  expected text,
  baseline_rows integer,
  visible_rows integer,
  own_rows integer,
  other_player_rows integer,
  jairo_rows integer,
  access_denied boolean,
  test_ok boolean,
  details text
)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  borja_auth_user_id constant uuid :=
    '350615a9-b068-450a-b867-da30a59b9082';
  borja_jugador_id constant uuid :=
    '2e0146e9-e9fc-45ad-b055-edc138a85f7e';
  jairo_jugador_id constant uuid :=
    'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7';
  staff_user_id constant uuid :=
    'e0933d02-76c7-4e71-9765-896593e1ae80';
  no_membership_user_id constant uuid :=
    'b2300000-0000-4000-8000-000000000099';
  target record;
  borja_baseline integer;
  total_baseline integer;
  local_visible integer;
  local_own integer;
  local_other integer;
  local_jairo integer;
  denied boolean;
  error_state text;
  error_message text;
  policy_count integer;
  rls_enabled boolean;
begin
  if (
    select count(*)
    from public.club_memberships membership
    where membership.user_id = borja_auth_user_id
      and membership.jugador_id = borja_jugador_id
      and membership.role = 'player'
      and membership.is_active
  ) <> 1 then
    raise exception
      'Bloque 2.3: no existe exactamente la identidad PLAYER activa esperada';
  end if;

  -- El catalogo debe conservar exactamente una policy SELECT propia en cada
  -- tabla y ninguna expresion abierta USING(true)/WITH CHECK(true).
  for target in
    select * from (
      values
        (1, 'wellness_entries'::text),
        (2, 'rpe_entries'::text)
    ) target_data(target_order, target_table)
    order by target_order
  loop
    select relation.relrowsecurity
      into rls_enabled
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = target.target_table
      and relation.relkind in ('r', 'p');

    select count(*)::integer
      into policy_count
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = target.target_table
      and policy.polname = 'performance_player_select_own'
      and policy.polpermissive
      and policy.polcmd = 'r'
      and policy.polroles = array[
        (select role.oid
         from pg_catalog.pg_roles role
         where role.rolname = 'authenticated')
      ]::oid[]
      and policy.polwithcheck is null
      and pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_expr(
            policy.polqual,
            policy.polrelid
          )),
          '[[:space:]()]',
          '',
          'g'
        ),
        'public.',
        ''
      ) = 'is_playerandjugador_id=current_jugador_id';

    test_order := target.target_order;
    scenario := 'CATALOG';
    table_name := target.target_table;
    expected := 'RLS ON; exactly 1 own SELECT policy; no open true policy';
    baseline_rows := 1;
    visible_rows := policy_count;
    own_rows := null;
    other_player_rows := null;
    jairo_rows := null;
    access_denied := false;
    test_ok := coalesce(rls_enabled, false)
      and policy_count = 1
      and not exists (
        select 1
        from pg_catalog.pg_policy policy
        join pg_catalog.pg_class relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = target.target_table
          and (
            pg_catalog.regexp_replace(
              pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(
                policy.polqual,
                policy.polrelid
              ), '')),
              '[[:space:]()]', '', 'g'
            ) = 'true'
            or pg_catalog.regexp_replace(
              pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(
                policy.polwithcheck,
                policy.polrelid
              ), '')),
              '[[:space:]()]', '', 'g'
            ) = 'true'
          )
      );
    details := pg_catalog.format(
      'rls=%s; valid_player_policy_count=%s',
      coalesce(rls_enabled::text, 'NULL'),
      policy_count
    );
    return next;
  end loop;

  -- BORJA PLAYER: los baselines se obtienen como postgres, antes de SET ROLE.
  for target in
    select * from (
      values
        (10, 'wellness_entries'::text),
        (11, 'rpe_entries'::text)
    ) target_data(target_order, target_table)
    order by target_order
  loop
    execute pg_catalog.format(
      'select count(*)::integer from public.%I where jugador_id = $1',
      target.target_table
    ) into borja_baseline using borja_jugador_id;

    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      borja_auth_user_id::text,
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      'authenticated',
      true
    );
    execute 'set local role authenticated';

    local_visible := 0;
    local_own := 0;
    local_other := 0;
    local_jairo := 0;
    denied := false;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format(
        'select count(*)::integer, '
        || 'count(*) filter (where jugador_id = $1)::integer, '
        || 'count(*) filter (where jugador_id <> $1)::integer, '
        || 'count(*) filter (where jugador_id = $2)::integer '
        || 'from public.%I',
        target.target_table
      ) into local_visible, local_own, local_other, local_jairo
        using borja_jugador_id, jairo_jugador_id;
    exception
      when others then
        denied := true;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
    end;
    execute 'reset role';

    test_order := target.target_order;
    scenario := 'BORJA_PLAYER';
    table_name := target.target_table;
    expected := pg_catalog.format(
      'visible=own baseline (%s); other=0; Jairo=0',
      borja_baseline
    );
    baseline_rows := borja_baseline;
    visible_rows := local_visible;
    own_rows := local_own;
    other_player_rows := local_other;
    jairo_rows := local_jairo;
    access_denied := denied;
    test_ok := not denied
      and local_visible = borja_baseline
      and local_own = borja_baseline
      and local_other = 0
      and local_jairo = 0;
    details := case
      when error_state is null then
        case when borja_baseline > 0
          then 'Las filas propias existentes son visibles.'
          else 'No existen filas propias; el cero visible coincide con el baseline.'
        end
      else error_state || ': ' || coalesce(error_message, '')
    end;
    return next;
  end loop;

  -- UID authenticated sin membership: la misma ruta SELECT debe devolver 0.
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

  for target in
    select * from (
      values
        (20, 'wellness_entries'::text),
        (21, 'rpe_entries'::text)
    ) target_data(target_order, target_table)
    order by target_order
  loop
    local_visible := 0;
    denied := false;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format(
        'select count(*)::integer from public.%I',
        target.target_table
      ) into local_visible;
    exception
      when others then
        denied := true;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
    end;

    test_order := target.target_order;
    scenario := 'UID_WITHOUT_MEMBERSHIP';
    table_name := target.target_table;
    expected := '0 visible rows';
    baseline_rows := 0;
    visible_rows := local_visible;
    own_rows := null;
    other_player_rows := null;
    jairo_rows := null;
    access_denied := denied;
    test_ok := local_visible = 0 and (not denied or error_state = '42501');
    details := case when error_state is null then null
      else error_state || ': ' || coalesce(error_message, '') end;
    return next;
  end loop;
  execute 'reset role';

  -- ANON: los privilegios o RLS deben impedir cualquier lectura efectiva.
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';

  for target in
    select * from (
      values
        (30, 'wellness_entries'::text),
        (31, 'rpe_entries'::text)
    ) target_data(target_order, target_table)
    order by target_order
  loop
    local_visible := 0;
    denied := false;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format(
        'select count(*)::integer from public.%I',
        target.target_table
      ) into local_visible;
    exception
      when others then
        denied := true;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
    end;

    test_order := target.target_order;
    scenario := 'ANON';
    table_name := target.target_table;
    expected := '0 visible rows or access denied (42501)';
    baseline_rows := 0;
    visible_rows := local_visible;
    own_rows := null;
    other_player_rows := null;
    jairo_rows := null;
    access_denied := denied;
    test_ok := local_visible = 0 and (not denied or error_state = '42501');
    details := case when error_state is null then null
      else error_state || ': ' || coalesce(error_message, '') end;
    return next;
  end loop;
  execute 'reset role';

  -- STAFF: conserva la visibilidad completa previa sobre ambas tablas.
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

  for target in
    select * from (
      values
        (40, 'wellness_entries'::text),
        (41, 'rpe_entries'::text)
    ) target_data(target_order, target_table)
    order by target_order
  loop
    execute pg_catalog.format(
      'select count(*)::integer from public.%I',
      target.target_table
    ) into total_baseline;

    execute 'set local role authenticated';
    local_visible := 0;
    denied := false;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format(
        'select count(*)::integer from public.%I',
        target.target_table
      ) into local_visible;
    exception
      when others then
        denied := true;
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
    end;
    execute 'reset role';

    test_order := target.target_order;
    scenario := 'STAFF';
    table_name := target.target_table;
    expected := pg_catalog.format('visible=full baseline (%s)', total_baseline);
    baseline_rows := total_baseline;
    visible_rows := local_visible;
    own_rows := null;
    other_player_rows := null;
    jairo_rows := null;
    access_denied := denied;
    test_ok := not denied and local_visible = total_baseline;
    details := case when error_state is null then null
      else error_state || ': ' || coalesce(error_message, '') end;
    return next;
  end loop;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
end;
$$;

select
  test_order,
  scenario,
  table_name,
  expected,
  baseline_rows,
  visible_rows,
  own_rows,
  other_player_rows,
  jairo_rows,
  access_denied,
  test_ok,
  details
from pg_temp.verify_my_performance_reads()
order by test_order;

rollback;
