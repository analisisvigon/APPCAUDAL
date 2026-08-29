-- BLOQUE 1.4 - Acceso PLAYER de solo lectura a su propio Rendimiento.
--
-- Cambios unicos:
--   1. SELECT propio en public.wellness_entries.
--   2. SELECT propio en public.rpe_entries.
--
-- No modifica policies STAFF, grants, funciones, columnas ni datos.
-- rpe_entries.session_id debe permanecer uuid nullable.
--
-- RIESGO BLOQUEANTE ANTES DEL FRONTEND PLAYER:
-- La policy club_memberships."Club members can read memberships" permite
-- (user_id = auth.uid()) OR is_club_member(club_id). Debe revisarse antes de
-- exponer frontend PLAYER. Deliberadamente NO se modifica en este bloque.

begin;

do $$
declare
  missing_tables text[];
begin
  select pg_catalog.array_agg(target.table_name order by target.table_name)
    into missing_tables
  from (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  ) target(table_name)
  where pg_catalog.to_regclass(
    pg_catalog.format('public.%I', target.table_name)
  ) is null;

  if missing_tables is not null then
    raise exception
      'Bloque 1.4 abortado: faltan tablas del contrato: %',
      pg_catalog.array_to_string(missing_tables, ', ');
  end if;

  if pg_catalog.to_regprocedure('public.is_player()') is null
    or pg_catalog.to_regprocedure('public.current_jugador_id()') is null then
    raise exception
      'Bloque 1.4 abortado: faltan helpers PLAYER del Bloque 1.2';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      'public.wellness_entries'::regclass,
      'public.rpe_entries'::regclass
    )
      and policy.polname = 'performance_player_select_own'
  ) then
    raise exception
      'Bloque 1.4 abortado: ya existe alguna policy performance_player_select_own; audite antes de reemplazarla';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.rpe_entries'::regclass
      and attribute.attname = 'session_id'
      and attribute.atttypid = 'uuid'::regtype
      and not attribute.attnotnull
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception
      'Bloque 1.4 abortado: rpe_entries.session_id no es uuid nullable';
  end if;
end
$$;

create policy performance_player_select_own
on public.wellness_entries
for select
to authenticated
using (
  public.is_player()
  and jugador_id = public.current_jugador_id()
);

create policy performance_player_select_own
on public.rpe_entries
for select
to authenticated
using (
  public.is_player()
  and jugador_id = public.current_jugador_id()
);

do $$
declare
  authenticated_oid oid;
  anon_oid oid;
  invalid_staff_count integer;
  invalid_player_count integer;
  unexpected_client_policy_count integer;
  open_true_policy_count integer;
  player_write_policy_count integer;
  invalid_rls_count integer;
begin
  select role.oid
    into authenticated_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'authenticated';

  select role.oid
    into anon_oid
  from pg_catalog.pg_roles role
  where role.rolname = 'anon';

  if authenticated_oid is null or anon_oid is null then
    raise exception
      'Bloque 1.4 abortado: faltan roles authenticated o anon';
  end if;

  with
  targets(table_name) as (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  ),
  expected_staff(policy_name, command, needs_using, needs_check) as (
    values
      ('performance_staff_select'::text, 'r'::"char", true, false),
      ('performance_staff_insert'::text, 'a'::"char", false, true),
      ('performance_staff_update'::text, 'w'::"char", true, true),
      ('performance_staff_delete'::text, 'd'::"char", true, false)
  ),
  expected_contract as (
    select
      relation.oid as relation_oid,
      target.table_name,
      expected.policy_name,
      expected.command,
      expected.needs_using,
      expected.needs_check
    from targets target
    join pg_catalog.pg_namespace namespace
      on namespace.nspname = 'public'
    join pg_catalog.pg_class relation
      on relation.relnamespace = namespace.oid
     and relation.relname = target.table_name
    cross join expected_staff expected
  )
  select count(*)::integer
    into invalid_staff_count
  from expected_contract contract
  left join pg_catalog.pg_policy policy
    on policy.polrelid = contract.relation_oid
   and policy.polname = contract.policy_name
  where policy.oid is null
    or not policy.polpermissive
    or policy.polcmd <> contract.command
    or policy.polroles <> array[authenticated_oid]::oid[]
    or case
      when contract.needs_using then
        pg_catalog.replace(
          pg_catalog.regexp_replace(
            pg_catalog.lower(
              coalesce(
                pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
                ''
              )
            ),
            '[[:space:]()]',
            '',
            'g'
          ),
          'public.',
          ''
        ) <> 'is_app_staff'
      else policy.polqual is not null
    end
    or case
      when contract.needs_check then
        pg_catalog.replace(
          pg_catalog.regexp_replace(
            pg_catalog.lower(
              coalesce(
                pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
                ''
              )
            ),
            '[[:space:]()]',
            '',
            'g'
          ),
          'public.',
          ''
        ) <> 'is_app_staff'
      else policy.polwithcheck is not null
    end;

  with expected_player(table_name) as (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text)
  )
  select count(*)::integer
    into invalid_player_count
  from expected_player expected
  join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = expected.table_name
  left join pg_catalog.pg_policy policy
    on policy.polrelid = relation.oid
   and policy.polname = 'performance_player_select_own'
  where policy.oid is null
    or not policy.polpermissive
    or policy.polcmd <> 'r'
    or policy.polroles <> array[authenticated_oid]::oid[]
    or policy.polwithcheck is not null
    or pg_catalog.replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(
          coalesce(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
            ''
          )
        ),
        '[[:space:]()]',
        '',
        'g'
      ),
      'public.',
      ''
    ) <> 'is_playerandjugador_id=current_jugador_id';

  with targets(table_name) as (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  )
  select count(*)::integer
    into unexpected_client_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join targets target on target.table_name = relation.relname
  where namespace.nspname = 'public'
    and exists (
      select 1
      from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
      where policy_role.role_oid in (0::oid, authenticated_oid, anon_oid)
    )
    and not (
      policy.polname in (
        'performance_staff_select',
        'performance_staff_insert',
        'performance_staff_update',
        'performance_staff_delete'
      )
      or (
        relation.relname in ('wellness_entries', 'rpe_entries')
        and policy.polname = 'performance_player_select_own'
      )
    );

  with targets(table_name) as (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  )
  select count(*)::integer
    into open_true_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join targets target on target.table_name = relation.relname
  where namespace.nspname = 'public'
    and (
      pg_catalog.regexp_replace(
        coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), ''),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
      or pg_catalog.regexp_replace(
        coalesce(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
          ''
        ),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
    );

  with targets(table_name) as (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  )
  select count(*)::integer
    into player_write_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join targets target on target.table_name = relation.relname
  where namespace.nspname = 'public'
    and policy.polcmd <> 'r'
    and (
      policy.polname ilike '%player%'
      or coalesce(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
        ''
      ) ilike '%is_player%'
      or coalesce(
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
        ''
      ) ilike '%is_player%'
      or coalesce(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
        ''
      ) ilike '%current_jugador_id%'
      or coalesce(
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
        ''
      ) ilike '%current_jugador_id%'
    );

  with targets(table_name) as (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  )
  select count(*)::integer
    into invalid_rls_count
  from targets target
  join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
  join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.table_name
  where not relation.relrowsecurity;

  if invalid_staff_count <> 0 then
    raise exception
      'Bloque 1.4 abortado: faltan o difieren % policies STAFF',
      invalid_staff_count;
  end if;

  if invalid_player_count <> 0 then
    raise exception
      'Bloque 1.4 abortado: % policies PLAYER no cumplen SELECT propio exacto',
      invalid_player_count;
  end if;

  if unexpected_client_policy_count <> 0 then
    raise exception
      'Bloque 1.4 abortado: quedan % policies cliente inesperadas',
      unexpected_client_policy_count;
  end if;

  if open_true_policy_count <> 0 then
    raise exception
      'Bloque 1.4 abortado: quedan % policies USING(true)/WITH CHECK(true)',
      open_true_policy_count;
  end if;

  if player_write_policy_count <> 0 then
    raise exception
      'Bloque 1.4 abortado: existen % policies de escritura PLAYER',
      player_write_policy_count;
  end if;

  if invalid_rls_count <> 0 then
    raise exception
      'Bloque 1.4 abortado: % tablas del contrato no tienen RLS activo',
      invalid_rls_count;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.rpe_entries'::regclass
      and attribute.attname = 'session_id'
      and attribute.atttypid = 'uuid'::regtype
      and not attribute.attnotnull
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception
      'Bloque 1.4 abortado: rpe_entries.session_id dejo de ser uuid nullable';
  end if;
end
$$;

commit;
