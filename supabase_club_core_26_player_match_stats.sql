-- APPCAUDAL - PLAYER: estadisticas validadas partido a partido para evolucion.
-- Solo crea una RPC de lectura. No modifica tablas, RLS, policies ni RPC previas.

begin;

do $preconditions$
declare
  required_relation text;
  required_column record;
  function_row pg_catalog.pg_proc%rowtype;
  target_oid oid := pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  );
  expected_arguments constant text :=
    'p_competition_scope text, p_venue text, p_window text';
  expected_result constant text :=
    'TABLE(match_id uuid, match_date date, opponent text, opponent_crest text, competition_key text, competition_name text, is_home boolean, minutes integer, event_count integer, goals integer, shots integer, shots_on_target integer, shot_accuracy_percentage numeric, crosses integer, turnovers integer, steals integer, fouls_committed integer, fouls_received integer)';
begin
  if auth.uid() is not null then
    raise exception 'Club Core 26 debe ejecutarse sin una identidad JWT activa';
  end if;

  foreach required_relation in array array[
    'public.club_memberships',
    'public.jugadores',
    'public.partidos',
    'public.competitions',
    'public.partido_estadisticas_jugador',
    'public.match_quick_events'
  ] loop
    if pg_catalog.to_regclass(required_relation) is null then
      raise exception 'Club Core 26: falta la relacion %', required_relation;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('partidos', 'id'), ('partidos', 'date'),
      ('partidos', 'opponent'), ('partidos', 'opponent_crest'),
      ('partidos', 'is_home'), ('partidos', 'status'),
      ('partidos', 'competition_id'), ('partidos', 'competition_key'),
      ('partidos', 'player_visible'), ('partidos', 'delegated_data_status'),
      ('competitions', 'id'), ('competitions', 'club_id'),
      ('competitions', 'key'), ('competitions', 'name'),
      ('competitions', 'competition_type'),
      ('partido_estadisticas_jugador', 'partido_id'),
      ('partido_estadisticas_jugador', 'jugador_id'),
      ('partido_estadisticas_jugador', 'minutes'),
      ('match_quick_events', 'partido_id'),
      ('match_quick_events', 'jugador_id'),
      ('match_quick_events', 'equipo'),
      ('match_quick_events', 'tipo_evento'),
      ('match_quick_events', 'reviewed')
    ) columns(table_name, column_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = pg_catalog.to_regclass(
              'public.' || required_column.table_name
            )
        and attribute.attname = required_column.column_name
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      raise exception 'Club Core 26: falta public.%.%',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.current_jugador_id()') is null
     or pg_catalog.to_regprocedure('public.is_player()') is null
     or pg_catalog.to_regprocedure(
          'public.get_my_player_analysis_live_stats(text,text,text)'
        ) is null then
    raise exception 'Club Core 26: faltan helpers o la RPC live_stats de referencia';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Club Core 26: faltan roles Supabase requeridos';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'get_my_player_analysis_match_stats'
      and procedure.oid is distinct from target_oid
  ) then
    raise exception
      'Club Core 26: existe public.get_my_player_analysis_match_stats con firma incompatible; se esperaba (text,text,text) y no se modifica nada';
  end if;

  if target_oid is not null then
    select procedure.* into function_row
    from pg_catalog.pg_proc procedure
    where procedure.oid = target_oid;

    if function_row.prokind <> 'f'
       or function_row.proowner <> 'postgres'::regrole
       or function_row.prolang <> (
         select language.oid
         from pg_catalog.pg_language language
         where language.lanname = 'plpgsql'
       )
       or not function_row.prosecdef
       or function_row.provolatile <> 's'
       or function_row.pronargs <> 3
       or function_row.pronargdefaults <> 3
       or pg_catalog.pg_get_function_identity_arguments(function_row.oid)
          <> expected_arguments
       or pg_catalog.replace(
            pg_catalog.pg_get_function_result(function_row.oid), '"', ''
          ) <> expected_result
       or function_row.proconfig is distinct from
          array['search_path=pg_catalog']::text[] then
      raise exception
        'Club Core 26: contrato existente incompatible en public.get_my_player_analysis_match_stats(text,text,text); no se modifica nada';
    end if;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = any(array[
      'public.jugadores'::regclass,
      'public.partidos'::regclass,
      'public.competitions'::regclass,
      'public.partido_estadisticas_jugador'::regclass,
      'public.match_quick_events'::regclass
    ])
      and relation.relforcerowsecurity
  ) then
    raise exception 'Club Core 26: una fuente usa FORCE RLS; revisar SECURITY DEFINER';
  end if;
end;
$preconditions$;

create or replace function public.get_my_player_analysis_match_stats(
  p_competition_scope text default 'season',
  p_venue text default 'all',
  p_window text default 'last_5_event_matches'
)
returns table (
  match_id uuid,
  match_date date,
  opponent text,
  opponent_crest text,
  competition_key text,
  competition_name text,
  is_home boolean,
  minutes integer,
  event_count integer,
  goals integer,
  shots integer,
  shots_on_target integer,
  shot_accuracy_percentage numeric,
  crosses integer,
  turnovers integer,
  steals integer,
  fouls_committed integer,
  fouls_received integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  membership_count integer;
  membership_user_id uuid;
  membership_club_id uuid;
  membership_role text;
  own_jugador_id uuid;
  membership_is_active boolean;
  normalized_scope text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_competition_scope, ''))
  );
  normalized_venue text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_venue, ''))
  );
  normalized_window text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_window, ''))
  );
  supported_club_id constant uuid :=
    'ca0da100-0000-4000-8000-000000000001'::uuid;
begin
  if normalized_scope not in (
    'season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly'
  ) then
    raise exception using
      errcode = '22023', message = 'INVALID_COMPETITION_SCOPE';
  end if;

  if normalized_venue not in ('all', 'home', 'away') then
    raise exception using errcode = '22023', message = 'INVALID_VENUE';
  end if;

  if normalized_window not in (
    'last_3_event_matches', 'last_5_event_matches', 'full_scope'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_WINDOW';
  end if;

  if actor_id is null then return; end if;

  select pg_catalog.count(*)::integer
  into membership_count
  from public.current_membership();

  if membership_count <> 1 then return; end if;

  select
    membership.user_id,
    membership.club_id,
    membership.role,
    membership.jugador_id,
    membership.is_active
  into
    membership_user_id,
    membership_club_id,
    membership_role,
    own_jugador_id,
    membership_is_active
  from public.current_membership() membership;

  if membership_user_id is distinct from actor_id
     or membership_club_id is distinct from supported_club_id
     or membership_role is distinct from 'player'
     or membership_is_active is not true
     or own_jugador_id is null
     or own_jugador_id is distinct from public.current_jugador_id()
     or not public.is_player()
     or not exists (
       select 1 from public.jugadores player where player.id = own_jugador_id
     ) then
    return;
  end if;

  return query
  with scoped_matches as (
    select
      match_row.id,
      serialized.payload,
      coalesce(
        competition.key,
        serialized.payload ->> 'competition_key'
      ) as resolved_competition_key,
      competition.name as resolved_competition_name
    from public.partidos match_row
    cross join lateral (
      select pg_catalog.to_jsonb(match_row) as payload
    ) serialized
    left join lateral (
      select
        competition_row.key,
        competition_row.name,
        competition_row.competition_type
      from public.competitions competition_row
      where (
          competition_row.id::text = serialized.payload ->> 'competition_id'
          or (
            nullif(serialized.payload ->> 'competition_id', '') is null
            and competition_row.key = serialized.payload ->> 'competition_key'
          )
        )
        and (
          competition_row.club_id is null
          or competition_row.club_id = membership_club_id
        )
      order by
        (competition_row.id::text = serialized.payload ->> 'competition_id') desc,
        competition_row.key
      limit 1
    ) competition on true
    where match_row.player_visible
      and pg_catalog.lower(
        pg_catalog.btrim(coalesce(serialized.payload ->> 'status', ''))
      ) in (
        'finalizado', 'jugado', 'played', 'finished',
        'cerrado', 'closed', 'revisado', 'reviewed'
      )
      and match_row.delegated_data_status = 'Validado'
      and (
        normalized_venue = 'all'
        or (
          normalized_venue = 'home'
          and pg_catalog.lower(
            coalesce(serialized.payload ->> 'is_home', '')
          ) = 'true'
        )
        or (
          normalized_venue = 'away'
          and pg_catalog.lower(
            coalesce(serialized.payload ->> 'is_home', '')
          ) = 'false'
        )
      )
      and (
        normalized_scope = 'all'
        or (
          normalized_scope = 'season'
          and coalesce(
            competition.competition_type,
            case
              when coalesce(
                competition.key,
                serialized.payload ->> 'competition_key'
              ) in ('league', 'copa_rfef', 'playoff') then 'official'
              else ''
            end
          ) = 'official'
        )
        or (
          normalized_scope not in ('all', 'season')
          and coalesce(
            competition.key,
            serialized.payload ->> 'competition_key'
          ) = normalized_scope
        )
      )
  ), valid_events as (
    select
      event.partido_id,
      event.tipo_evento,
      scoped.payload,
      scoped.resolved_competition_key,
      scoped.resolved_competition_name
    from public.match_quick_events event
    join scoped_matches scoped on scoped.id = event.partido_id
    where event.jugador_id = own_jugador_id
      and event.equipo = 'caudal'
      and event.reviewed is true
      and event.tipo_evento in (
        'gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida',
        'robo', 'recuperacion', 'falta_realizada', 'falta_recibida'
      )
  ), per_match as (
    select
      event.partido_id,
      pg_catalog.max(event.payload ->> 'date') as raw_match_date,
      pg_catalog.max(event.payload ->> 'opponent') as raw_opponent,
      pg_catalog.max(event.payload ->> 'opponent_crest') as raw_opponent_crest,
      pg_catalog.max(event.payload ->> 'is_home') as raw_is_home,
      pg_catalog.max(event.resolved_competition_key) as resolved_competition_key,
      pg_catalog.max(event.resolved_competition_name) as resolved_competition_name,
      pg_catalog.count(*)::integer as event_count,
      pg_catalog.count(*) filter (
        where event.tipo_evento = 'gol'
      )::integer as goals,
      pg_catalog.count(*) filter (
        where event.tipo_evento in ('gol', 'tiro', 'tiro_puerta')
      )::integer as shots,
      pg_catalog.count(*) filter (
        where event.tipo_evento in ('gol', 'tiro_puerta')
      )::integer as shots_on_target,
      pg_catalog.count(*) filter (
        where event.tipo_evento = 'centro'
      )::integer as crosses,
      pg_catalog.count(*) filter (
        where event.tipo_evento = 'perdida'
      )::integer as turnovers,
      pg_catalog.count(*) filter (
        where event.tipo_evento = 'robo'
      )::integer as steals,
      pg_catalog.count(*) filter (
        where event.tipo_evento = 'falta_realizada'
      )::integer as fouls_committed,
      pg_catalog.count(*) filter (
        where event.tipo_evento = 'falta_recibida'
      )::integer as fouls_received
    from valid_events event
    group by event.partido_id
  ), ranked_matches as (
    select
      match_stats.*,
      pg_catalog.row_number() over (
        order by match_stats.raw_match_date desc nulls last,
                 match_stats.partido_id desc
      ) as recency
    from per_match match_stats
  ), selected_matches as (
    select match_stats.*
    from ranked_matches match_stats
    where normalized_window = 'full_scope'
       or (
         normalized_window = 'last_3_event_matches'
         and match_stats.recency <= 3
       )
       or (
         normalized_window = 'last_5_event_matches'
         and match_stats.recency <= 5
       )
  )
  select
    match_stats.partido_id,
    case
      when match_stats.raw_match_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then match_stats.raw_match_date::date
    end,
    nullif(pg_catalog.btrim(match_stats.raw_opponent), ''),
    nullif(pg_catalog.btrim(match_stats.raw_opponent_crest), ''),
    match_stats.resolved_competition_key,
    match_stats.resolved_competition_name,
    case
      when pg_catalog.lower(coalesce(match_stats.raw_is_home, '')) = 'true'
        then true
      when pg_catalog.lower(coalesce(match_stats.raw_is_home, '')) = 'false'
        then false
    end,
    player_stats.minutes,
    match_stats.event_count,
    match_stats.goals,
    match_stats.shots,
    match_stats.shots_on_target,
    case
      when match_stats.shots > 0 then pg_catalog.round(
        match_stats.shots_on_target::numeric * 100 / match_stats.shots,
        2
      )
    end,
    match_stats.crosses,
    match_stats.turnovers,
    match_stats.steals,
    match_stats.fouls_committed,
    match_stats.fouls_received
  from selected_matches match_stats
  left join lateral (
    select pg_catalog.round(pg_catalog.max(
      case
        when pg_catalog.btrim(stats.minutes::text)
          ~ '^[0-9]+([.][0-9]+)?$'
          then pg_catalog.btrim(stats.minutes::text)::numeric
      end
    ), 0)::integer as minutes
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = match_stats.partido_id
      and stats.jugador_id = own_jugador_id
  ) player_stats on true
  order by
    case
      when match_stats.raw_match_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then match_stats.raw_match_date::date
    end asc nulls last,
    match_stats.partido_id asc;
end;
$function$;

comment on function public.get_my_player_analysis_match_stats(text,text,text) is
'PLAYER own-only: una fila por partido con eventos delegados validados y revisados; comparte filtros, ventana y metricas con live_stats. Orden cronologico para J1..Jn del filtro actual.';

alter function public.get_my_player_analysis_match_stats(text,text,text)
  owner to postgres;

revoke all on function public.get_my_player_analysis_match_stats(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_analysis_match_stats(text,text,text)
  to authenticated, service_role;

do $postconditions$
declare
  function_row pg_catalog.pg_proc%rowtype;
  unexpected_execute integer;
begin
  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  );

  if function_row.oid is null
     or function_row.proowner <> 'postgres'::regrole
     or not function_row.prosecdef
     or function_row.provolatile <> 's'
     or function_row.proconfig is distinct from
        array['search_path=pg_catalog']::text[]
     or pg_catalog.has_function_privilege(
          'anon', function_row.oid, 'EXECUTE'
        )
     or not pg_catalog.has_function_privilege(
          'authenticated', function_row.oid, 'EXECUTE'
        )
     or not pg_catalog.has_function_privilege(
          'service_role', function_row.oid, 'EXECUTE'
        ) then
    raise exception 'Club Core 26: postcondiciones de contrato o ACL incumplidas';
  end if;

  select pg_catalog.count(*)::integer
  into unexpected_execute
  from pg_catalog.aclexplode(coalesce(
    function_row.proacl,
    pg_catalog.acldefault('f', function_row.proowner)
  )) acl
  where acl.privilege_type = 'EXECUTE'
    and acl.grantee not in (
      function_row.proowner,
      'authenticated'::regrole::oid,
      'service_role'::regrole::oid
    );

  if unexpected_execute <> 0 then
    raise exception 'Club Core 26: existe EXECUTE fuera de la ACL esperada';
  end if;
end;
$postconditions$;

commit;

commit;
