-- BLOQUE 2.6A - Cierre backend deportivo para VERSION PLAYER.
--
-- Esta migracion:
--   * deja las doce tablas deportivas exclusivamente bajo policies STAFF;
--   * normaliza grants de tabla para authenticated STAFF y service_role;
--   * crea public.partidos.player_visible, false por defecto;
--   * crea dos proyecciones SECURITY DEFINER sin argumentos de identidad;
--   * protege todas las RPC PL/pgSQL mutadoras del perimetro que authenticated
--     puede invocar, conservando literalmente su cuerpo remoto dentro de un
--     bloque anidado precedido por el guard STAFF;
--   * excluye expresamente las funciones trigger.
--
-- No crea acceso PLAYER directo a tablas. No modifica frontend ni Storage.

begin;

do $preconditions$
declare
  target_table text;
  required_column record;
  required_signature text;
  missing_tables text[] := array[]::text[];
  missing_columns text[] := array[]::text[];
begin
  foreach target_table in array array[
    'partido_estadisticas_jugador',
    'partido_eventos_gol',
    'match_quick_events',
    'partidos',
    'partido_alineacion_slots',
    'partido_eventos_sistema',
    'partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots',
    'partido_eventos_post',
    'competitions',
    'partido_convocados',
    'partido_notas_individuales_pre'
  ] loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', target_table)) is null then
      missing_tables := pg_catalog.array_append(missing_tables, 'public.' || target_table);
    end if;
  end loop;

  if coalesce(pg_catalog.array_length(missing_tables, 1), 0) > 0 then
    raise exception 'Bloque 2.6A: faltan tablas requeridas: %',
      pg_catalog.array_to_string(missing_tables, ', ');
  end if;

  foreach required_signature in array array[
    'public.current_membership()',
    'public.current_jugador_id()',
    'public.is_player()',
    'public.is_app_staff()',
    'auth.role()'
  ] loop
    if pg_catalog.to_regprocedure(required_signature) is null then
      raise exception 'Bloque 2.6A: falta helper requerido %', required_signature;
    end if;
  end loop;

  foreach required_signature in array array[
    'public.delete_match_system_change_with_snapshot(uuid)',
    'public.mutate_match_goal_atomic(text,uuid,uuid,jsonb,jsonb)',
    'public.save_match_print_plan_atomic(uuid,jsonb)',
    'public.set_delegated_match_status(uuid,text)'
  ] loop
    if pg_catalog.to_regprocedure(required_signature) is null then
      raise exception 'Bloque 2.6A: falta RPC mutadora confirmada %', required_signature;
    end if;
  end loop;

  foreach required_signature in array array[
    'public.get_my_player_matches()',
    'public.get_my_player_analysis_summary()'
  ] loop
    if pg_catalog.to_regprocedure(required_signature) is not null
       and not exists (
         select 1
         from pg_catalog.pg_proc procedure
         where procedure.oid = pg_catalog.to_regprocedure(required_signature)
           and pg_catalog.strpos(procedure.prosrc, 'supported_club_id') > 0
           and pg_catalog.strpos(procedure.prosrc, 'public.current_membership()') > 0
       ) then
      raise exception 'Bloque 2.6A: ya existe una RPC incompatible con %', required_signature;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'anon'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'service_role'
  ) then
    raise exception 'Bloque 2.6A: faltan roles Supabase requeridos';
  end if;

  if not exists (
    select 1
    from public.clubs club
    where club.id = 'ca0da100-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'Bloque 2.6A: falta el club Caudal canonico';
  end if;

  for required_column in
    select *
    from (values
      ('partidos', 'id'),
      ('partidos', 'date'),
      ('partidos', 'opponent'),
      ('partidos', 'opponent_crest'),
      ('partidos', 'is_home'),
      ('partidos', 'home_team'),
      ('partidos', 'away_team'),
      ('partidos', 'home_score'),
      ('partidos', 'away_score'),
      ('partidos', 'stadium'),
      ('partidos', 'competition_key'),
      ('partidos', 'competition_id'),
      ('partidos', 'round'),
      ('competitions', 'id'),
      ('competitions', 'club_id'),
      ('competitions', 'key'),
      ('competitions', 'name'),
      ('competitions', 'logo_url'),
      ('partido_eventos_gol', 'partido_id'),
      ('partido_eventos_gol', 'type'),
      ('partido_eventos_gol', 'minute'),
      ('partido_eventos_gol', 'scorer'),
      ('partido_eventos_gol', 'assistant'),
      ('partido_eventos_gol', 'video_url'),
      ('partido_eventos_gol', 'scorer_id'),
      ('partido_eventos_gol', 'assistant_id'),
      ('partido_estadisticas_jugador', 'partido_id'),
      ('partido_estadisticas_jugador', 'jugador_id'),
      ('partido_estadisticas_jugador', 'player_name'),
      ('partido_estadisticas_jugador', 'role'),
      ('partido_estadisticas_jugador', 'minutes'),
      ('partido_estadisticas_jugador', 'yellow'),
      ('partido_estadisticas_jugador', 'yellow_count'),
      ('partido_estadisticas_jugador', 'red')
    ) columns(table_name, column_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = pg_catalog.to_regclass(
          pg_catalog.format('public.%I', required_column.table_name)
        )
        and attribute.attname = required_column.column_name
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      missing_columns := pg_catalog.array_append(
        missing_columns,
        'public.' || required_column.table_name || '.' || required_column.column_name
      );
    end if;
  end loop;

  if coalesce(pg_catalog.array_length(missing_columns, 1), 0) > 0 then
    raise exception 'Bloque 2.6A: faltan columnas requeridas: %',
      pg_catalog.array_to_string(missing_columns, ', ');
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.partidos'::regclass
      and attribute.attname = 'player_visible'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.atttypid <> 'pg_catalog.bool'::regtype
  ) then
    raise exception 'Bloque 2.6A: public.partidos.player_visible existe con tipo no boolean';
  end if;
end;
$preconditions$;

alter table public.partidos
  add column if not exists player_visible boolean not null default false;

update public.partidos
set player_visible = false
where player_visible is null;

alter table public.partidos
  alter column player_visible set default false,
  alter column player_visible set not null;

comment on column public.partidos.player_visible is
  'Publicacion PLAYER explicita. Nunca se deriva de status, marcador ni delegated_data_status.';

do $table_lockdown$
declare
  target_table text;
  existing_policy record;
  explicit_grantee record;
begin
  foreach target_table in array array[
    'partido_estadisticas_jugador',
    'partido_eventos_gol',
    'match_quick_events',
    'partidos',
    'partido_alineacion_slots',
    'partido_eventos_sistema',
    'partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots',
    'partido_eventos_post',
    'competitions',
    'partido_convocados',
    'partido_notas_individuales_pre'
  ] loop
    execute pg_catalog.format(
      'alter table public.%I enable row level security',
      target_table
    );

    for existing_policy in
      select policy.polname
      from pg_catalog.pg_policy policy
      where policy.polrelid = pg_catalog.to_regclass(
        pg_catalog.format('public.%I', target_table)
      )
    loop
      execute pg_catalog.format(
        'drop policy %I on public.%I',
        existing_policy.polname,
        target_table
      );
    end loop;

    execute pg_catalog.format(
      'revoke all privileges on table public.%I from public, anon, authenticated, service_role',
      target_table
    );

    for explicit_grantee in
      select distinct role.rolname
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) acl
      join pg_catalog.pg_roles role on role.oid = acl.grantee
      where relation.oid = pg_catalog.to_regclass(
          pg_catalog.format('public.%I', target_table)
        )
        and role.rolname not in (
          pg_catalog.pg_get_userbyid(relation.relowner),
          'authenticated',
          'service_role',
          'anon'
        )
    loop
      execute pg_catalog.format(
        'revoke all privileges on table public.%I from %I',
        target_table,
        explicit_grantee.rolname
      );
    end loop;

    execute pg_catalog.format(
      'grant select, insert, update, delete on table public.%I to authenticated, service_role',
      target_table
    );

    execute pg_catalog.format(
      'create policy player_sports_staff_select on public.%I for select to authenticated using (public.is_app_staff())',
      target_table
    );
    execute pg_catalog.format(
      'create policy player_sports_staff_insert on public.%I for insert to authenticated with check (public.is_app_staff())',
      target_table
    );
    execute pg_catalog.format(
      'create policy player_sports_staff_update on public.%I for update to authenticated using (public.is_app_staff()) with check (public.is_app_staff())',
      target_table
    );
    execute pg_catalog.format(
      'create policy player_sports_staff_delete on public.%I for delete to authenticated using (public.is_app_staff())',
      target_table
    );
  end loop;
end;
$table_lockdown$;

create or replace function public.get_my_player_matches()
returns table (
  partido_id uuid,
  match_date text,
  opponent text,
  opponent_crest text,
  is_home boolean,
  home_team text,
  away_team text,
  home_score text,
  away_score text,
  stadium text,
  competition_key text,
  competition_name text,
  competition_logo_url text,
  match_round text,
  timeline jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  membership_count bigint;
  membership_role text;
  membership_club_id uuid;
  membership_jugador_id uuid;
  supported_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
begin
  select pg_catalog.count(*)::bigint
  into membership_count
  from public.current_membership();

  if membership_count <> 1::bigint then
    return;
  end if;

  select membership.role::text, membership.club_id, membership.jugador_id
  into membership_role, membership_club_id, membership_jugador_id
  from public.current_membership() membership;

  if membership_role <> 'player'
     or membership_jugador_id is null
     or membership_club_id is distinct from supported_club_id
     or not public.is_player() then
    return;
  end if;

  return query
  select
    match_row.id,
    match_json ->> 'date',
    match_json ->> 'opponent',
    match_json ->> 'opponent_crest',
    case pg_catalog.lower(coalesce(match_json ->> 'is_home', ''))
      when 'true' then true
      when 'false' then false
      else null
    end,
    match_json ->> 'home_team',
    match_json ->> 'away_team',
    match_json ->> 'home_score',
    match_json ->> 'away_score',
    match_json ->> 'stadium',
    match_json ->> 'competition_key',
    competition.name,
    competition.logo_url,
    match_json ->> 'round',
    coalesce(public_timeline.events, '[]'::jsonb)
  from public.partidos match_row
  cross join lateral (
    select pg_catalog.to_jsonb(match_row) as match_json
  ) serialized_match
  left join lateral (
    select competition_row.name, competition_row.logo_url
    from public.competitions competition_row
    where (
        competition_row.id::text = match_json ->> 'competition_id'
        or (
          nullif(match_json ->> 'competition_id', '') is null
          and competition_row.key = match_json ->> 'competition_key'
        )
      )
      and (
        competition_row.club_id is null
        or competition_row.club_id = membership_club_id
      )
    order by
      (competition_row.id::text = match_json ->> 'competition_id') desc,
      competition_row.name
    limit 1
  ) competition on true
  left join lateral (
    select coalesce(
      pg_catalog.jsonb_agg(
        event_row.payload
        order by event_row.event_minute nulls last, event_row.event_order, event_row.player_name
      ),
      '[]'::jsonb
    ) as events
    from (
      select
        case
          when pg_catalog.btrim(goal.minute::text) ~ '^[0-9]+$'
            then pg_catalog.btrim(goal.minute::text)::integer
          else null
        end as event_minute,
        10::integer as event_order,
        coalesce(goal.scorer, '')::text as player_name,
        pg_catalog.jsonb_build_object(
          'event_type', goal.type,
          'minute', case
            when pg_catalog.btrim(goal.minute::text) ~ '^[0-9]+$'
              then pg_catalog.btrim(goal.minute::text)::integer
            else null
          end,
          'player_name', nullif(pg_catalog.btrim(goal.scorer), ''),
          'assistant_name', case
            when goal.type = 'Gol a favor'
              then nullif(pg_catalog.btrim(goal.assistant), '')
            else null
          end,
          'card_count', null,
          'video_url', case
            when pg_catalog.btrim(coalesce(goal.video_url, ''))
              ~* '^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)'
              then pg_catalog.btrim(goal.video_url)
            else null
          end
        ) as payload
      from public.partido_eventos_gol goal
      where goal.partido_id = match_row.id
        and goal.type in ('Gol a favor', 'Gol en contra')

      union all

      select
        null::integer,
        20::integer,
        coalesce(stats.player_name, '')::text,
        pg_catalog.jsonb_build_object(
          'event_type', 'Amarilla',
          'minute', null,
          'player_name', nullif(pg_catalog.btrim(stats.player_name), ''),
          'assistant_name', null,
          'card_count', case
            when pg_catalog.btrim(stats.yellow_count::text) ~ '^[0-9]+$'
              then stats.yellow_count::integer
            else 1
          end,
          'video_url', null
        )
      from public.partido_estadisticas_jugador stats
      where stats.partido_id = match_row.id
        and (
          stats.yellow
          or case
            when pg_catalog.btrim(stats.yellow_count::text) ~ '^[0-9]+$'
              then stats.yellow_count::integer > 0
            else false
          end
        )

      union all

      select
        null::integer,
        30::integer,
        coalesce(stats.player_name, '')::text,
        pg_catalog.jsonb_build_object(
          'event_type', 'Roja',
          'minute', null,
          'player_name', nullif(pg_catalog.btrim(stats.player_name), ''),
          'assistant_name', null,
          'card_count', 1,
          'video_url', null
        )
      from public.partido_estadisticas_jugador stats
      where stats.partido_id = match_row.id
        and stats.red
    ) event_row
  ) public_timeline on true
  where match_row.player_visible
  order by match_json ->> 'date' desc, match_row.id;
end;
$function$;

alter function public.get_my_player_matches() owner to postgres;
revoke all on function public.get_my_player_matches()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_matches()
  to authenticated, service_role;

comment on function public.get_my_player_matches() is
  'Proyeccion PLAYER sin parametros: partidos publicados y timeline deportivo sanitizado del club Caudal.';

create or replace function public.get_my_player_analysis_summary()
returns table (
  jugador_id uuid,
  matches bigint,
  minutes numeric,
  starts bigint,
  bench_entries bigint,
  goals bigint,
  goals_coverage text,
  assists bigint,
  assists_coverage text,
  yellow_cards numeric,
  red_cards bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  membership_count bigint;
  membership_role text;
  membership_club_id uuid;
  own_jugador_id uuid;
  supported_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
begin
  select pg_catalog.count(*)::bigint
  into membership_count
  from public.current_membership();

  if membership_count <> 1::bigint then
    return;
  end if;

  select membership.role::text, membership.club_id, membership.jugador_id
  into membership_role, membership_club_id, own_jugador_id
  from public.current_membership() membership;

  if membership_role <> 'player'
     or own_jugador_id is null
     or own_jugador_id is distinct from public.current_jugador_id()
     or membership_club_id is distinct from supported_club_id
     or not public.is_player() then
    return;
  end if;

  return query
  with own_stats as (
    select
      pg_catalog.count(distinct stats.partido_id)::bigint as matches,
      coalesce(
        pg_catalog.sum(
          case
            when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+([.][0-9]+)?$'
              then pg_catalog.btrim(stats.minutes::text)::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as minutes,
      pg_catalog.count(*) filter (
        where pg_catalog.lower(coalesce(stats.role, '')) = 'titular'
      )::bigint as starts,
      pg_catalog.count(*) filter (
        where pg_catalog.lower(coalesce(stats.role, '')) <> 'titular'
          and case
            when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+([.][0-9]+)?$'
              then pg_catalog.btrim(stats.minutes::text)::numeric
            else 0::numeric
          end > 0::numeric
      )::bigint as bench_entries,
      coalesce(
        pg_catalog.sum(
          case
            when pg_catalog.btrim(stats.yellow_count::text) ~ '^[0-9]+([.][0-9]+)?$'
              then pg_catalog.btrim(stats.yellow_count::text)::numeric
            when stats.yellow then 1::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as yellow_cards,
      pg_catalog.count(*) filter (where stats.red)::bigint as red_cards
    from public.partido_estadisticas_jugador stats
    where stats.jugador_id = own_jugador_id
  ),
  goal_stats as (
    select
      pg_catalog.count(*) filter (
        where goal.scorer_id = own_jugador_id
      )::bigint as goals,
      pg_catalog.count(*) filter (
        where goal.assistant_id = own_jugador_id
      )::bigint as assists,
      pg_catalog.count(*) filter (
        where goal.scorer_id is null
          and nullif(pg_catalog.btrim(goal.scorer), '') is not null
      )::bigint as unresolved_scorers,
      pg_catalog.count(*) filter (
        where goal.assistant_id is null
          and nullif(pg_catalog.btrim(goal.assistant), '') is not null
      )::bigint as unresolved_assistants
    from public.partido_eventos_gol goal
  )
  select
    own_jugador_id,
    own_stats.matches,
    own_stats.minutes,
    own_stats.starts,
    own_stats.bench_entries,
    goal_stats.goals,
    case when goal_stats.unresolved_scorers > 0::bigint then 'PARTIAL' else 'COMPLETE' end,
    goal_stats.assists,
    case when goal_stats.unresolved_assistants > 0::bigint then 'PARTIAL' else 'COMPLETE' end,
    own_stats.yellow_cards,
    own_stats.red_cards
  from own_stats
  cross join goal_stats;
end;
$function$;

alter function public.get_my_player_analysis_summary() owner to postgres;
revoke all on function public.get_my_player_analysis_summary()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_analysis_summary()
  to authenticated, service_role;

comment on function public.get_my_player_analysis_summary() is
  'Agregados propios PLAYER por UUID canonico; nombres legacy nunca se atribuyen al jugador.';

do $player_rpc_acl$
declare
  target_signature text;
  extra_grantee record;
begin
  foreach target_signature in array array[
    'public.get_my_player_matches()',
    'public.get_my_player_analysis_summary()'
  ] loop
    for extra_grantee in
      select distinct role.rolname
      from pg_catalog.pg_proc procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) acl
      join pg_catalog.pg_roles role on role.oid = acl.grantee
      where procedure.oid = pg_catalog.to_regprocedure(target_signature)
        and role.rolname not in (
          pg_catalog.pg_get_userbyid(procedure.proowner),
          'authenticated',
          'service_role'
        )
    loop
      execute pg_catalog.format(
        'revoke all privileges on function %s from %I',
        target_signature,
        extra_grantee.rolname
      );
    end loop;
  end loop;
end;
$player_rpc_acl$;

do $mutator_guards$
declare
  function_target record;
  extra_grantee record;
  original_source text;
  original_source_md5 text;
  guarded_source text;
  function_definition text;
  guarded_definition text;
  source_position integer;
  second_source_position integer;
  after_oid oid;
  after_source text;
  after_owner oid;
  after_language oid;
  after_security_definer boolean;
  after_volatility "char";
  after_parallel "char";
  after_config text[];
  after_result text;
  after_arguments text;
  after_strict boolean;
  after_leakproof boolean;
  after_cost real;
  after_rows real;
  after_support oid;
  after_unwrapped_source text;
  after_unwrapped_source_md5 text;
  guard_occurrence_count integer;
  staff_guard_clause constant text := E'  if coalesce(auth.role(), '''') <> ''service_role''\n'
    || E'     and session_user <> ''service_role''\n'
    || E'     and not public.is_app_staff() then\n'
    || E'    raise exception using\n'
    || E'      errcode = ''42501'',\n'
    || E'      message = ''STAFF_ONLY'';\n'
    || E'  end if;\n\n';
  staff_guard text;
begin
  staff_guard := E'begin\n' || staff_guard_clause;

  for function_target in
    select
      procedure.oid,
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as signature,
      procedure.prosrc,
      procedure.proowner,
      procedure.prolang,
      procedure.prosecdef,
      procedure.provolatile,
      procedure.proparallel,
      procedure.proconfig,
      pg_catalog.pg_get_function_result(procedure.oid) as result_type,
      pg_catalog.pg_get_function_arguments(procedure.oid) as full_arguments,
      procedure.proisstrict,
      procedure.proleakproof,
      procedure.procost,
      procedure.prorows,
      procedure.prosupport
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    join pg_catalog.pg_language language on language.oid = procedure.prolang
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and language.lanname = 'plpgsql'
      and procedure.prorettype <> 'pg_catalog.trigger'::regtype
      and pg_catalog.has_function_privilege(
        'authenticated', procedure.oid, 'EXECUTE'
      )
      and (
        pg_catalog.lower(procedure.prosrc) ~ (
          '(^|[^a-z_])(insert[[:space:]]+into|update|delete[[:space:]]+from)'
          || '[[:space:]]+(public[.])?'
          || '(partido_estadisticas_jugador|partido_eventos_gol|match_quick_events|partidos|'
          || 'partido_alineacion_slots|partido_eventos_sistema|partido_snapshots_tacticos|'
          || 'partido_snapshot_tactico_slots|partido_eventos_post|competitions|'
          || 'partido_convocados|partido_notas_individuales_pre)'
          || '([^a-z0-9_]|$)'
        )
        -- Estas cuatro RPC forman parte obligatoria del perimetro aunque una
        -- escriba en una tabla deportiva auxiliar fuera de la lista anterior.
        or procedure.oid = any(array[
          pg_catalog.to_regprocedure('public.delete_match_system_change_with_snapshot(uuid)'),
          pg_catalog.to_regprocedure('public.mutate_match_goal_atomic(text,uuid,uuid,jsonb,jsonb)'),
          pg_catalog.to_regprocedure('public.save_match_print_plan_atomic(uuid,jsonb)'),
          pg_catalog.to_regprocedure('public.set_delegated_match_status(uuid,text)')
        ]::oid[])
      )
    order by procedure.oid
  loop
    guard_occurrence_count := (
      (
        pg_catalog.length(function_target.prosrc)
        - pg_catalog.length(
          pg_catalog.replace(function_target.prosrc, staff_guard_clause, '')
        )
      ) / pg_catalog.length(staff_guard_clause)
    )::integer;

    if guard_occurrence_count > 1
       or (
         guard_occurrence_count = 0
         and (
           pg_catalog.strpos(function_target.prosrc, 'STAFF_ONLY') > 0
           or pg_catalog.strpos(
             pg_catalog.lower(function_target.prosrc),
             'public.is_app_staff()'
           ) > 0
         )
       ) then
      raise exception 'Bloque 2.6A: guard STAFF parcial/incompatible en %',
        function_target.signature;
    end if;

    if guard_occurrence_count = 0 then
      original_source := function_target.prosrc;
      original_source_md5 := pg_catalog.md5(original_source);
      guarded_source := staff_guard || original_source || E'\nend;';
      function_definition := pg_catalog.pg_get_functiondef(function_target.oid);
      source_position := pg_catalog.strpos(function_definition, original_source);

      if source_position = 0 then
        raise exception 'Bloque 2.6A: prosrc no localizado en pg_get_functiondef para %',
          function_target.signature;
      end if;

      second_source_position := pg_catalog.strpos(
        pg_catalog.substr(
          function_definition,
          source_position + pg_catalog.length(original_source)
        ),
        original_source
      );

      if second_source_position > 0 then
        raise exception 'Bloque 2.6A: prosrc ambiguo en pg_get_functiondef para %',
          function_target.signature;
      end if;

      guarded_definition :=
        pg_catalog.substr(function_definition, 1, source_position - 1)
        || guarded_source
        || pg_catalog.substr(
          function_definition,
          source_position + pg_catalog.length(original_source)
        );

      execute guarded_definition;

      select
        procedure.oid,
        procedure.prosrc,
        procedure.proowner,
        procedure.prolang,
        procedure.prosecdef,
        procedure.provolatile,
        procedure.proparallel,
        procedure.proconfig,
        pg_catalog.pg_get_function_result(procedure.oid),
        pg_catalog.pg_get_function_arguments(procedure.oid),
        procedure.proisstrict,
        procedure.proleakproof,
        procedure.procost,
        procedure.prorows,
        procedure.prosupport
      into
        after_oid,
        after_source,
        after_owner,
        after_language,
        after_security_definer,
        after_volatility,
        after_parallel,
        after_config,
        after_result,
        after_arguments,
        after_strict,
        after_leakproof,
        after_cost,
        after_rows,
        after_support
      from pg_catalog.pg_proc procedure
      where procedure.oid = function_target.oid;

      after_unwrapped_source := pg_catalog.substr(
        after_source,
        pg_catalog.length(staff_guard) + 1,
        pg_catalog.length(original_source)
      );
      after_unwrapped_source_md5 := pg_catalog.md5(after_unwrapped_source);

      if after_oid is distinct from function_target.oid
         or after_source is distinct from guarded_source
         or after_unwrapped_source is distinct from original_source
         or after_unwrapped_source_md5 is distinct from original_source_md5
         or after_owner is distinct from function_target.proowner
         or after_language is distinct from function_target.prolang
         or after_security_definer is distinct from function_target.prosecdef
         or after_volatility is distinct from function_target.provolatile
         or after_parallel is distinct from function_target.proparallel
         or after_config is distinct from function_target.proconfig
         or after_result is distinct from function_target.result_type
         or after_arguments is distinct from function_target.full_arguments
         or after_strict is distinct from function_target.proisstrict
         or after_leakproof is distinct from function_target.proleakproof
         or after_cost is distinct from function_target.procost
         or after_rows is distinct from function_target.prorows
         or after_support is distinct from function_target.prosupport then
        raise exception 'Bloque 2.6A: contrato alterado al proteger %',
          function_target.signature;
      end if;
    end if;

    execute pg_catalog.format(
      'revoke all privileges on function %s from public, anon, authenticated, service_role',
      function_target.signature
    );
    execute pg_catalog.format(
      'grant execute on function %s to authenticated, service_role',
      function_target.signature
    );

    for extra_grantee in
      select distinct role.rolname
      from pg_catalog.pg_proc procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) acl
      join pg_catalog.pg_roles role on role.oid = acl.grantee
      where procedure.oid = function_target.oid
        and role.rolname not in (
          pg_catalog.pg_get_userbyid(procedure.proowner),
          'authenticated',
          'service_role',
          'anon'
        )
    loop
      execute pg_catalog.format(
        'revoke all privileges on function %s from %I',
        function_target.signature,
        extra_grantee.rolname
      );
    end loop;
  end loop;
end;
$mutator_guards$;

do $postconditions$
declare
  target_table text;
  required_signature text;
  policy_count integer;
  unsafe_policy_count integer;
  mutator_count integer;
  unguarded_mutator_count integer;
  staff_guard_clause constant text := E'  if coalesce(auth.role(), '''') <> ''service_role''\n'
    || E'     and session_user <> ''service_role''\n'
    || E'     and not public.is_app_staff() then\n'
    || E'    raise exception using\n'
    || E'      errcode = ''42501'',\n'
    || E'      message = ''STAFF_ONLY'';\n'
    || E'  end if;\n\n';
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.partidos'::regclass
      and attribute.attname = 'player_visible'
      and attribute.atttypid = 'pg_catalog.bool'::regtype
      and attribute.attnotnull
      and not attribute.attisdropped
  ) then
    raise exception 'Bloque 2.6A: contrato invalido de partidos.player_visible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attrdef default_row
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = default_row.adrelid
     and attribute.attnum = default_row.adnum
    where attribute.attrelid = 'public.partidos'::regclass
      and attribute.attname = 'player_visible'
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)),
        '[[:space:]():]', '', 'g'
      ) in ('false', 'falseboolean')
  ) then
    raise exception 'Bloque 2.6A: player_visible no tiene DEFAULT false';
  end if;

  foreach target_table in array array[
    'partido_estadisticas_jugador',
    'partido_eventos_gol',
    'match_quick_events',
    'partidos',
    'partido_alineacion_slots',
    'partido_eventos_sistema',
    'partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots',
    'partido_eventos_post',
    'competitions',
    'partido_convocados',
    'partido_notas_individuales_pre'
  ] loop
    if not (
      select relation.relrowsecurity
      from pg_catalog.pg_class relation
      where relation.oid = pg_catalog.to_regclass(
        pg_catalog.format('public.%I', target_table)
      )
    ) then
      raise exception 'Bloque 2.6A: RLS no activo en public.%', target_table;
    end if;

    select pg_catalog.count(*)::integer
    into policy_count
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = target_table
      and policy.roles = array['authenticated']::name[]
      and (
        (
          policy.policyname = 'player_sports_staff_select'
          and policy.cmd = 'SELECT'
          and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.qual, '')), 'is_app_staff()') > 0
          and policy.with_check is null
        )
        or (
          policy.policyname = 'player_sports_staff_insert'
          and policy.cmd = 'INSERT'
          and policy.qual is null
          and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.with_check, '')), 'is_app_staff()') > 0
        )
        or (
          policy.policyname = 'player_sports_staff_update'
          and policy.cmd = 'UPDATE'
          and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.qual, '')), 'is_app_staff()') > 0
          and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.with_check, '')), 'is_app_staff()') > 0
        )
        or (
          policy.policyname = 'player_sports_staff_delete'
          and policy.cmd = 'DELETE'
          and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.qual, '')), 'is_app_staff()') > 0
          and policy.with_check is null
        )
      );

    select pg_catalog.count(*)::integer
    into unsafe_policy_count
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = target_table
      and (
        policy.roles && array['anon']::name[]
        or pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.qual, '')),
          '[[:space:]():]', '', 'g'
        ) in ('true', 'trueboolean')
        or pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.with_check, '')),
          '[[:space:]():]', '', 'g'
        ) in ('true', 'trueboolean')
      );

    if policy_count <> 4
       or unsafe_policy_count <> 0
       or (
         select pg_catalog.count(*)
         from pg_catalog.pg_policies policy
         where policy.schemaname = 'public'
           and policy.tablename = target_table
       ) <> 4::bigint then
      raise exception 'Bloque 2.6A: policies finales invalidas en public.%', target_table;
    end if;

    if pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', target_table), 'SELECT')
       or pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', target_table), 'INSERT')
       or pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', target_table), 'UPDATE')
       or pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', target_table), 'DELETE') then
      raise exception 'Bloque 2.6A: anon conserva grants en public.%', target_table;
    end if;

    if not pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', target_table), 'SELECT')
       or not pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', target_table), 'INSERT')
       or not pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', target_table), 'UPDATE')
       or not pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', target_table), 'DELETE')
       or not pg_catalog.has_table_privilege('service_role', pg_catalog.format('public.%I', target_table), 'SELECT')
       or not pg_catalog.has_table_privilege('service_role', pg_catalog.format('public.%I', target_table), 'INSERT')
       or not pg_catalog.has_table_privilege('service_role', pg_catalog.format('public.%I', target_table), 'UPDATE')
       or not pg_catalog.has_table_privilege('service_role', pg_catalog.format('public.%I', target_table), 'DELETE') then
      raise exception 'Bloque 2.6A: grants STAFF/service_role incompletos en public.%', target_table;
    end if;
  end loop;

  foreach required_signature in array array[
    'public.get_my_player_matches()',
    'public.get_my_player_analysis_summary()'
  ] loop
    if pg_catalog.to_regprocedure(required_signature) is null then
      raise exception 'Bloque 2.6A: falta RPC PLAYER %', required_signature;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc procedure
      where procedure.oid = pg_catalog.to_regprocedure(required_signature)
        and pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
        and procedure.prosecdef
        and procedure.provolatile = 's'
        and procedure.pronargs = 0
        and procedure.proconfig = array['search_path=pg_catalog']::text[]
        and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
        and not exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(
              procedure.proacl,
              pg_catalog.acldefault('f', procedure.proowner)
            )
          ) acl
          join pg_catalog.pg_roles role on role.oid = acl.grantee
          where acl.privilege_type = 'EXECUTE'
            and role.rolname not in (
              pg_catalog.pg_get_userbyid(procedure.proowner),
              'authenticated',
              'service_role'
            )
        )
    ) then
      raise exception 'Bloque 2.6A: contrato/ACL invalido de %', required_signature;
    end if;
  end loop;

  foreach required_signature in array array[
    'public.delete_match_system_change_with_snapshot(uuid)',
    'public.mutate_match_goal_atomic(text,uuid,uuid,jsonb,jsonb)',
    'public.save_match_print_plan_atomic(uuid,jsonb)',
    'public.set_delegated_match_status(uuid,text)'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc procedure
      where procedure.oid = pg_catalog.to_regprocedure(required_signature)
        and (
          (
            pg_catalog.length(procedure.prosrc)
            - pg_catalog.length(
              pg_catalog.replace(procedure.prosrc, staff_guard_clause, '')
            )
          ) / pg_catalog.length(staff_guard_clause)
        )::integer = 1
        and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
    ) then
      raise exception 'Bloque 2.6A: RPC mutadora no protegida %', required_signature;
    end if;
  end loop;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where (
        (
          pg_catalog.length(procedure.prosrc)
          - pg_catalog.length(
            pg_catalog.replace(procedure.prosrc, staff_guard_clause, '')
          )
        ) / pg_catalog.length(staff_guard_clause)
      )::integer <> 1
    )::integer
  into mutator_count, unguarded_mutator_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_language language on language.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.prokind = 'f'
    and language.lanname = 'plpgsql'
    and procedure.prorettype <> 'pg_catalog.trigger'::regtype
    and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
    and (
      pg_catalog.lower(procedure.prosrc) ~ (
        '(^|[^a-z_])(insert[[:space:]]+into|update|delete[[:space:]]+from)'
        || '[[:space:]]+(public[.])?'
        || '(partido_estadisticas_jugador|partido_eventos_gol|match_quick_events|partidos|'
        || 'partido_alineacion_slots|partido_eventos_sistema|partido_snapshots_tacticos|'
        || 'partido_snapshot_tactico_slots|partido_eventos_post|competitions|'
        || 'partido_convocados|partido_notas_individuales_pre)'
        || '([^a-z0-9_]|$)'
      )
      or procedure.oid = any(array[
        pg_catalog.to_regprocedure('public.delete_match_system_change_with_snapshot(uuid)'),
        pg_catalog.to_regprocedure('public.mutate_match_goal_atomic(text,uuid,uuid,jsonb,jsonb)'),
        pg_catalog.to_regprocedure('public.save_match_print_plan_atomic(uuid,jsonb)'),
        pg_catalog.to_regprocedure('public.set_delegated_match_status(uuid,text)')
      ]::oid[])
    );

  if mutator_count < 4 or unguarded_mutator_count <> 0 then
    raise exception 'Bloque 2.6A: inventario mutador invalido (total %, sin guard %)',
      mutator_count, unguarded_mutator_count;
  end if;
end;
$postconditions$;

commit;
