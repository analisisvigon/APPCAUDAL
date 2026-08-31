-- BLOQUE 2.7C PLAYER - Backend rico y seguro para Mi analisis.
-- Solo anade cuatro RPC de lectura. No modifica tablas, RLS, policies ni RPC previas.

begin;

do $preconditions$
declare
  required_relation text;
  required_column record;
  target_name text;
begin
  if auth.uid() is not null then
    raise exception 'Bloque 2.7C debe ejecutarse sin una identidad JWT activa';
  end if;

  foreach required_relation in array array[
    'public.club_memberships',
    'public.jugadores',
    'public.partidos',
    'public.competitions',
    'public.partido_estadisticas_jugador',
    'public.partido_eventos_gol',
    'public.match_quick_events'
  ] loop
    if pg_catalog.to_regclass(required_relation) is null then
      raise exception 'Bloque 2.7C: falta la relacion %', required_relation;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('partidos', 'id'), ('partidos', 'date'), ('partidos', 'opponent'),
      ('partidos', 'opponent_crest'), ('partidos', 'is_home'),
      ('partidos', 'home_score'), ('partidos', 'away_score'),
      ('partidos', 'competition_id'), ('partidos', 'competition_key'),
      ('partidos', 'player_visible'), ('partidos', 'delegated_data_status'),
      ('competitions', 'id'), ('competitions', 'club_id'),
      ('competitions', 'key'), ('competitions', 'name'),
      ('competitions', 'logo_url'), ('competitions', 'competition_type'),
      ('partido_estadisticas_jugador', 'partido_id'),
      ('partido_estadisticas_jugador', 'jugador_id'),
      ('partido_estadisticas_jugador', 'player_name'),
      ('partido_estadisticas_jugador', 'role'),
      ('partido_estadisticas_jugador', 'minutes'),
      ('partido_estadisticas_jugador', 'yellow'),
      ('partido_estadisticas_jugador', 'yellow_count'),
      ('partido_estadisticas_jugador', 'red'),
      ('partido_eventos_gol', 'id'), ('partido_eventos_gol', 'partido_id'),
      ('partido_eventos_gol', 'type'), ('partido_eventos_gol', 'minute'),
      ('partido_eventos_gol', 'scorer'), ('partido_eventos_gol', 'scorer_id'),
      ('partido_eventos_gol', 'assistant'), ('partido_eventos_gol', 'assistant_id'),
      ('partido_eventos_gol', 'phase'), ('partido_eventos_gol', 'subphase'),
      ('partido_eventos_gol', 'contact'), ('partido_eventos_gol', 'shot_zone'),
      ('partido_eventos_gol', 'assist_zone'), ('partido_eventos_gol', 'goal_zone'),
      ('partido_eventos_gol', 'video_url'),
      ('match_quick_events', 'partido_id'), ('match_quick_events', 'jugador_id'),
      ('match_quick_events', 'equipo'), ('match_quick_events', 'tipo_evento'),
      ('match_quick_events', 'reviewed')
    ) columns(table_name, column_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = pg_catalog.to_regclass('public.' || required_column.table_name)
        and attribute.attname = required_column.column_name
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      raise exception 'Bloque 2.7C: falta public.%.%',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.current_jugador_id()') is null
     or pg_catalog.to_regprocedure('public.is_player()') is null
     or pg_catalog.to_regprocedure('public.get_my_player_profile()') is null
     or pg_catalog.to_regprocedure('public.get_my_player_analysis_summary()') is null
     or pg_catalog.to_regprocedure('public.get_my_player_matches()') is null then
    raise exception 'Bloque 2.7C: faltan helpers de identidad cerrados';
  end if;

  foreach target_name in array array[
    'get_my_player_analysis_overview',
    'get_my_player_analysis_live_stats',
    'get_my_player_production_actions',
    'get_my_player_match_history',
    'get_my_player_position_distribution'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = target_name
    ) then
      raise exception 'Bloque 2.7C: ya existe public.%: revisar antes de reemplazar', target_name;
    end if;
  end loop;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Bloque 2.7C: faltan roles Supabase requeridos';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = any(array[
      'public.jugadores'::regclass,
      'public.partidos'::regclass,
      'public.competitions'::regclass,
      'public.partido_estadisticas_jugador'::regclass,
      'public.partido_eventos_gol'::regclass,
      'public.match_quick_events'::regclass
    ])
      and relation.relforcerowsecurity
  ) then
    raise exception 'Bloque 2.7C: una fuente usa FORCE RLS; revisar SECURITY DEFINER';
  end if;
end;
$preconditions$;

create function public.get_my_player_analysis_overview(
  p_competition_scope text default 'season',
  p_venue text default 'all'
)
returns table (
  competition_scope text,
  venue text,
  match_records integer,
  matches_played integer,
  minutes integer,
  possible_minutes integer,
  minutes_per_match numeric,
  starts integer,
  bench_entries integer,
  participation_percentage numeric,
  goals integer,
  goals_coverage text,
  assists integer,
  assists_coverage text,
  goal_contributions integer,
  goal_contributions_coverage text,
  goals_per_90 numeric,
  assists_per_90 numeric,
  goal_contributions_per_90 numeric,
  yellow_cards integer,
  red_cards integer
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
  own_player_name text;
  own_player_count integer;
  normalized_scope text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_competition_scope, '')));
  normalized_venue text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_venue, '')));
  supported_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
begin
  if normalized_scope not in ('season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly') then
    raise exception using errcode = '22023', message = 'INVALID_COMPETITION_SCOPE';
  end if;
  if normalized_venue not in ('all', 'home', 'away') then
    raise exception using errcode = '22023', message = 'INVALID_VENUE';
  end if;
  if actor_id is null then return; end if;

  select pg_catalog.count(*)::integer into membership_count
  from public.current_membership();
  if membership_count <> 1 then return; end if;

  select membership.user_id, membership.club_id, membership.role,
         membership.jugador_id, membership.is_active
  into membership_user_id, membership_club_id, membership_role,
       own_jugador_id, membership_is_active
  from public.current_membership() membership;

  if membership_user_id is distinct from actor_id
     or membership_club_id is distinct from supported_club_id
     or membership_role is distinct from 'player'
     or membership_is_active is not true
     or own_jugador_id is null
     or own_jugador_id is distinct from public.current_jugador_id()
     or not public.is_player() then return; end if;

  select pg_catalog.count(*)::integer, pg_catalog.max(player.name)
  into own_player_count, own_player_name
  from public.jugadores player where player.id = own_jugador_id;
  if own_player_count <> 1 then return; end if;

  return query
  with scoped_matches as (
    select match_row.id
    from public.partidos match_row
    cross join lateral (select pg_catalog.to_jsonb(match_row) as payload) serialized
    left join lateral (
      select competition.key, competition.competition_type
      from public.competitions competition
      where (competition.id::text = serialized.payload ->> 'competition_id'
          or (nullif(serialized.payload ->> 'competition_id', '') is null
              and competition.key = serialized.payload ->> 'competition_key'))
        and (competition.club_id is null or competition.club_id = membership_club_id)
      order by (competition.id::text = serialized.payload ->> 'competition_id') desc,
               competition.key
      limit 1
    ) competition on true
    where match_row.player_visible
      and (normalized_venue = 'all'
        or (normalized_venue = 'home' and pg_catalog.lower(coalesce(serialized.payload ->> 'is_home', '')) = 'true')
        or (normalized_venue = 'away' and pg_catalog.lower(coalesce(serialized.payload ->> 'is_home', '')) = 'false'))
      and (normalized_scope = 'all'
        or (normalized_scope = 'season' and coalesce(
              competition.competition_type,
              case when coalesce(competition.key, serialized.payload ->> 'competition_key')
                     in ('league', 'copa_rfef', 'playoff') then 'official' else '' end
            ) = 'official')
        or (normalized_scope not in ('all', 'season')
            and coalesce(competition.key, serialized.payload ->> 'competition_key') = normalized_scope))
  ), own_rows as (
    select
      stats.partido_id,
      case when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+([.][0-9]+)?$'
        then pg_catalog.round(pg_catalog.btrim(stats.minutes::text)::numeric, 0)::integer else 0 end as played_minutes,
      pg_catalog.lower(pg_catalog.btrim(coalesce(stats.role, ''))) as normalized_role,
      case
        when pg_catalog.btrim(stats.yellow_count::text) ~ '^[0-9]+([.][0-9]+)?$'
          then pg_catalog.round(pg_catalog.btrim(stats.yellow_count::text)::numeric, 0)::integer
        when stats.yellow then 1 else 0
      end as yellow_cards,
      stats.red
    from public.partido_estadisticas_jugador stats
    join scoped_matches scoped on scoped.id = stats.partido_id
    where stats.jugador_id = own_jugador_id
  ), participation as (
    select
      pg_catalog.count(*)::integer as match_records,
      pg_catalog.count(*) filter (where own_row.played_minutes > 0 or own_row.normalized_role = 'titular')::integer as matches_played,
      coalesce(pg_catalog.sum(own_row.played_minutes), 0)::integer as minutes,
      (pg_catalog.count(*) * 90)::integer as possible_minutes,
      pg_catalog.count(*) filter (where own_row.normalized_role = 'titular')::integer as starts,
      pg_catalog.count(*) filter (where own_row.played_minutes > 0 and own_row.normalized_role <> 'titular')::integer as bench_entries,
      coalesce(pg_catalog.sum(own_row.yellow_cards), 0)::integer as yellow_cards,
      pg_catalog.count(*) filter (where own_row.red)::integer as red_cards
    from own_rows own_row
  ), production as (
    select
      pg_catalog.count(*) filter (where goal.scorer_id = own_jugador_id)::integer as goals,
      pg_catalog.count(*) filter (where goal.assistant_id = own_jugador_id)::integer as assists,
      pg_catalog.count(*) filter (
        where goal.scorer_id is null
          and nullif(pg_catalog.btrim(goal.scorer), '') is not null
          and pg_catalog.lower(pg_catalog.btrim(goal.scorer)) = pg_catalog.lower(pg_catalog.btrim(own_player_name))
      )::integer as unresolved_goals,
      pg_catalog.count(*) filter (
        where goal.assistant_id is null
          and nullif(pg_catalog.btrim(goal.assistant), '') is not null
          and pg_catalog.lower(pg_catalog.btrim(goal.assistant)) = pg_catalog.lower(pg_catalog.btrim(own_player_name))
      )::integer as unresolved_assists
    from public.partido_eventos_gol goal
    join scoped_matches scoped on scoped.id = goal.partido_id
    where goal.type = 'Gol a favor'
  )
  select
    normalized_scope,
    normalized_venue,
    participation.match_records,
    participation.matches_played,
    participation.minutes,
    participation.possible_minutes,
    case when participation.matches_played > 0
      then pg_catalog.round(participation.minutes::numeric / participation.matches_played, 2) else null end,
    participation.starts,
    participation.bench_entries,
    case when participation.possible_minutes > 0
      then pg_catalog.round(participation.minutes::numeric * 100 / participation.possible_minutes, 2) else null end,
    production.goals,
    case when production.unresolved_goals > 0 then 'PARTIAL' else 'COMPLETE' end,
    production.assists,
    case when production.unresolved_assists > 0 then 'PARTIAL' else 'COMPLETE' end,
    production.goals + production.assists,
    case when production.unresolved_goals > 0 or production.unresolved_assists > 0
      then 'PARTIAL' else 'COMPLETE' end,
    case when participation.minutes > 0
      then pg_catalog.round(production.goals::numeric * 90 / participation.minutes, 2) else null end,
    case when participation.minutes > 0
      then pg_catalog.round(production.assists::numeric * 90 / participation.minutes, 2) else null end,
    case when participation.minutes > 0
      then pg_catalog.round((production.goals + production.assists)::numeric * 90 / participation.minutes, 2) else null end,
    participation.yellow_cards,
    participation.red_cards
  from participation cross join production;
end;
$function$;

create function public.get_my_player_analysis_live_stats(
  p_competition_scope text default 'season',
  p_venue text default 'all',
  p_window text default 'last_5_event_matches'
)
returns table (
  competition_scope text,
  venue text,
  "window" text,
  matches_with_events integer,
  event_count integer,
  goals integer,
  goals_per_match numeric,
  shots integer,
  shots_per_match numeric,
  shots_on_target integer,
  shots_on_target_per_match numeric,
  shot_accuracy_percentage numeric,
  crosses integer,
  crosses_per_match numeric,
  turnovers integer,
  turnovers_per_match numeric,
  steals integer,
  steals_per_match numeric,
  fouls_committed integer,
  fouls_committed_per_match numeric,
  fouls_received integer,
  fouls_received_per_match numeric
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
  normalized_scope text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_competition_scope, '')));
  normalized_venue text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_venue, '')));
  normalized_window text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_window, '')));
  supported_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
begin
  if normalized_scope not in ('season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly') then
    raise exception using errcode = '22023', message = 'INVALID_COMPETITION_SCOPE';
  end if;
  if normalized_venue not in ('all', 'home', 'away') then
    raise exception using errcode = '22023', message = 'INVALID_VENUE';
  end if;
  if normalized_window not in ('last_3_event_matches', 'last_5_event_matches', 'full_scope') then
    raise exception using errcode = '22023', message = 'INVALID_WINDOW';
  end if;
  if actor_id is null then return; end if;
  select pg_catalog.count(*)::integer into membership_count from public.current_membership();
  if membership_count <> 1 then return; end if;
  select membership.user_id, membership.club_id, membership.role,
         membership.jugador_id, membership.is_active
  into membership_user_id, membership_club_id, membership_role,
       own_jugador_id, membership_is_active
  from public.current_membership() membership;
  if membership_user_id is distinct from actor_id
     or membership_club_id is distinct from supported_club_id
     or membership_role is distinct from 'player'
     or membership_is_active is not true
     or own_jugador_id is null
     or own_jugador_id is distinct from public.current_jugador_id()
     or not public.is_player()
     or not exists (select 1 from public.jugadores player where player.id = own_jugador_id)
  then return; end if;

  return query
  with scoped_matches as (
    select match_row.id, serialized.payload ->> 'date' as match_date
    from public.partidos match_row
    cross join lateral (select pg_catalog.to_jsonb(match_row) as payload) serialized
    left join lateral (
      select competition.key, competition.competition_type
      from public.competitions competition
      where (competition.id::text = serialized.payload ->> 'competition_id'
          or (nullif(serialized.payload ->> 'competition_id', '') is null
              and competition.key = serialized.payload ->> 'competition_key'))
        and (competition.club_id is null or competition.club_id = membership_club_id)
      order by (competition.id::text = serialized.payload ->> 'competition_id') desc, competition.key
      limit 1
    ) competition on true
    where match_row.player_visible
      and match_row.delegated_data_status = 'Validado'
      and (normalized_venue = 'all'
        or (normalized_venue = 'home' and pg_catalog.lower(coalesce(serialized.payload ->> 'is_home', '')) = 'true')
        or (normalized_venue = 'away' and pg_catalog.lower(coalesce(serialized.payload ->> 'is_home', '')) = 'false'))
      and (normalized_scope = 'all'
        or (normalized_scope = 'season' and coalesce(competition.competition_type,
              case when coalesce(competition.key, serialized.payload ->> 'competition_key')
                in ('league', 'copa_rfef', 'playoff') then 'official' else '' end) = 'official')
        or (normalized_scope not in ('all', 'season')
            and coalesce(competition.key, serialized.payload ->> 'competition_key') = normalized_scope))
  ), valid_events as (
    select event.partido_id, event.tipo_evento, scoped.match_date
    from public.match_quick_events event
    join scoped_matches scoped on scoped.id = event.partido_id
    where event.jugador_id = own_jugador_id
      and event.equipo = 'caudal'
      and event.reviewed is true
      and event.tipo_evento in (
        'gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida',
        'robo', 'recuperacion', 'falta_realizada', 'falta_recibida'
      )
  ), ranked_event_matches as (
    select grouped.partido_id,
           pg_catalog.row_number() over (order by grouped.match_date desc nulls last, grouped.partido_id desc) as recency
    from (select event.partido_id, pg_catalog.max(event.match_date) as match_date
          from valid_events event group by event.partido_id) grouped
  ), selected_events as (
    select event.*
    from valid_events event
    join ranked_event_matches ranked on ranked.partido_id = event.partido_id
    where normalized_window = 'full_scope'
       or (normalized_window = 'last_3_event_matches' and ranked.recency <= 3)
       or (normalized_window = 'last_5_event_matches' and ranked.recency <= 5)
  ), totals as (
    select
      pg_catalog.count(distinct event.partido_id)::integer as matches_with_events,
      pg_catalog.count(*)::integer as event_count,
      pg_catalog.count(*) filter (where event.tipo_evento = 'gol')::integer as goals,
      pg_catalog.count(*) filter (where event.tipo_evento in ('gol', 'tiro', 'tiro_puerta'))::integer as shots,
      pg_catalog.count(*) filter (where event.tipo_evento in ('gol', 'tiro_puerta'))::integer as shots_on_target,
      pg_catalog.count(*) filter (where event.tipo_evento = 'centro')::integer as crosses,
      pg_catalog.count(*) filter (where event.tipo_evento = 'perdida')::integer as turnovers,
      pg_catalog.count(*) filter (where event.tipo_evento = 'robo')::integer as steals,
      pg_catalog.count(*) filter (where event.tipo_evento = 'falta_realizada')::integer as fouls_committed,
      pg_catalog.count(*) filter (where event.tipo_evento = 'falta_recibida')::integer as fouls_received
    from selected_events event
  )
  select normalized_scope, normalized_venue, normalized_window,
    totals.matches_with_events, totals.event_count,
    totals.goals,
    case when totals.matches_with_events > 0 then pg_catalog.round(totals.goals::numeric / totals.matches_with_events, 2) end,
    totals.shots,
    case when totals.matches_with_events > 0 then pg_catalog.round(totals.shots::numeric / totals.matches_with_events, 2) end,
    totals.shots_on_target,
    case when totals.matches_with_events > 0 then pg_catalog.round(totals.shots_on_target::numeric / totals.matches_with_events, 2) end,
    case when totals.shots > 0 then pg_catalog.round(totals.shots_on_target::numeric * 100 / totals.shots, 2) end,
    totals.crosses,
    case when totals.matches_with_events > 0 then pg_catalog.round(totals.crosses::numeric / totals.matches_with_events, 2) end,
    totals.turnovers,
    case when totals.matches_with_events > 0 then pg_catalog.round(totals.turnovers::numeric / totals.matches_with_events, 2) end,
    totals.steals,
    case when totals.matches_with_events > 0 then pg_catalog.round(totals.steals::numeric / totals.matches_with_events, 2) end,
    totals.fouls_committed,
    case when totals.matches_with_events > 0 then pg_catalog.round(totals.fouls_committed::numeric / totals.matches_with_events, 2) end,
    totals.fouls_received,
    case when totals.matches_with_events > 0 then pg_catalog.round(totals.fouls_received::numeric / totals.matches_with_events, 2) end
  from totals;
end;
$function$;

create function public.get_my_player_production_actions(
  p_competition_scope text default 'season',
  p_venue text default 'all'
)
returns table (
  action_type text,
  minute integer,
  match_date date,
  opponent text,
  opponent_crest text,
  result text,
  competition_key text,
  competition_name text,
  venue text,
  phase text,
  subphase text,
  contact text,
  shot_zone_key text,
  shot_zone_name text,
  assist_zone_key text,
  assist_zone_name text,
  goal_zone_key text,
  goal_zone_name text,
  counterpart_role text,
  counterpart_name text,
  video_url text,
  video_available boolean
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
  normalized_scope text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_competition_scope, '')));
  normalized_venue text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_venue, '')));
  supported_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
begin
  if normalized_scope not in ('season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly') then
    raise exception using errcode = '22023', message = 'INVALID_COMPETITION_SCOPE';
  end if;
  if normalized_venue not in ('all', 'home', 'away') then
    raise exception using errcode = '22023', message = 'INVALID_VENUE';
  end if;
  if actor_id is null then return; end if;
  select pg_catalog.count(*)::integer into membership_count from public.current_membership();
  if membership_count <> 1 then return; end if;
  select membership.user_id, membership.club_id, membership.role,
         membership.jugador_id, membership.is_active
  into membership_user_id, membership_club_id, membership_role,
       own_jugador_id, membership_is_active
  from public.current_membership() membership;
  if membership_user_id is distinct from actor_id
     or membership_club_id is distinct from supported_club_id
     or membership_role is distinct from 'player'
     or membership_is_active is not true
     or own_jugador_id is null
     or own_jugador_id is distinct from public.current_jugador_id()
     or not public.is_player()
     or not exists (select 1 from public.jugadores player where player.id = own_jugador_id)
  then return; end if;

  return query
  with scoped_matches as (
    select match_row.id, serialized.payload,
           coalesce(competition.key, serialized.payload ->> 'competition_key') as resolved_competition_key,
           competition.name as resolved_competition_name
    from public.partidos match_row
    cross join lateral (select pg_catalog.to_jsonb(match_row) as payload) serialized
    left join lateral (
      select competition.key, competition.name, competition.competition_type
      from public.competitions competition
      where (competition.id::text = serialized.payload ->> 'competition_id'
          or (nullif(serialized.payload ->> 'competition_id', '') is null
              and competition.key = serialized.payload ->> 'competition_key'))
        and (competition.club_id is null or competition.club_id = membership_club_id)
      order by (competition.id::text = serialized.payload ->> 'competition_id') desc, competition.key
      limit 1
    ) competition on true
    where match_row.player_visible
      and (normalized_venue = 'all'
        or (normalized_venue = 'home' and pg_catalog.lower(coalesce(serialized.payload ->> 'is_home', '')) = 'true')
        or (normalized_venue = 'away' and pg_catalog.lower(coalesce(serialized.payload ->> 'is_home', '')) = 'false'))
      and (normalized_scope = 'all'
        or (normalized_scope = 'season' and coalesce(competition.competition_type,
              case when coalesce(competition.key, serialized.payload ->> 'competition_key')
                in ('league', 'copa_rfef', 'playoff') then 'official' else '' end) = 'official')
        or (normalized_scope not in ('all', 'season')
            and coalesce(competition.key, serialized.payload ->> 'competition_key') = normalized_scope))
  ), actions as (
    select goal.*, scoped.payload, scoped.resolved_competition_key, scoped.resolved_competition_name,
      case
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('finalizacion_izquierda','f_finalizacion_izquierda','arriba_izquierda') then 'finalizacion_izquierda'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('finalizacion_centro','f_finalizacion_centro','arriba_centro') then 'finalizacion_centro'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('finalizacion_derecha','f_finalizacion_derecha','arriba_derecha') then 'finalizacion_derecha'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('creacion_izquierda','f_creacion_izquierda','medio_izquierda') then 'creacion_izquierda'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('creacion_centro','f_creacion_centro','medio_centro') then 'creacion_centro'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('creacion_derecha','f_creacion_derecha','medio_derecha') then 'creacion_derecha'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('inicio_izquierda','f_inicio_izquierda','bajo_izquierda') then 'inicio_izquierda'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('inicio_centro','f_inicio_centro','bajo_centro') then 'inicio_centro'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.shot_zone, ''))) in ('inicio_derecha','f_inicio_derecha','bajo_derecha') then 'inicio_derecha'
      end as normalized_shot_zone,
      case
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('finalizacion_izquierda','f_finalizacion_izquierda','arriba_izquierda') then 'finalizacion_izquierda'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('finalizacion_centro','f_finalizacion_centro','arriba_centro') then 'finalizacion_centro'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('finalizacion_derecha','f_finalizacion_derecha','arriba_derecha') then 'finalizacion_derecha'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('creacion_izquierda','f_creacion_izquierda','medio_izquierda') then 'creacion_izquierda'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('creacion_centro','f_creacion_centro','medio_centro') then 'creacion_centro'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('creacion_derecha','f_creacion_derecha','medio_derecha') then 'creacion_derecha'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('inicio_izquierda','f_inicio_izquierda','bajo_izquierda') then 'inicio_izquierda'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('inicio_centro','f_inicio_centro','bajo_centro') then 'inicio_centro'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(goal.assist_zone, ''))) in ('inicio_derecha','f_inicio_derecha','bajo_derecha') then 'inicio_derecha'
      end as normalized_assist_zone,
      case pg_catalog.lower(pg_catalog.btrim(coalesce(goal.goal_zone, '')))
        when 'high_left' then 'alta_izquierda' when 'high_center' then 'alta_centro' when 'high_right' then 'alta_derecha'
        when 'middle_left' then 'media_izquierda' when 'middle_center' then 'media_centro' when 'middle_right' then 'media_derecha'
        when 'low_left' then 'baja_izquierda' when 'low_center' then 'baja_centro' when 'low_right' then 'baja_derecha'
        when 'alta_izquierda' then 'alta_izquierda' when 'alta_centro' then 'alta_centro' when 'alta_derecha' then 'alta_derecha'
        when 'media_izquierda' then 'media_izquierda' when 'media_centro' then 'media_centro' when 'media_derecha' then 'media_derecha'
        when 'baja_izquierda' then 'baja_izquierda' when 'baja_centro' then 'baja_centro' when 'baja_derecha' then 'baja_derecha'
      end as normalized_goal_zone
    from public.partido_eventos_gol goal
    join scoped_matches scoped on scoped.id = goal.partido_id
    where goal.type = 'Gol a favor'
      and (goal.scorer_id = own_jugador_id or goal.assistant_id = own_jugador_id)
  )
  select
    case when action.scorer_id = own_jugador_id then 'goal' else 'assist' end,
    case when pg_catalog.btrim(action.minute::text) ~ '^[0-9]+$'
      then pg_catalog.btrim(action.minute::text)::integer end,
    case when action.payload ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (action.payload ->> 'date')::date end,
    nullif(pg_catalog.btrim(action.payload ->> 'opponent'), ''),
    nullif(pg_catalog.btrim(action.payload ->> 'opponent_crest'), ''),
    case when action.payload ->> 'home_score' ~ '^[0-9]+$'
           and action.payload ->> 'away_score' ~ '^[0-9]+$'
      then case when pg_catalog.lower(coalesce(action.payload ->> 'is_home', '')) = 'true'
        then (action.payload ->> 'home_score') || '-' || (action.payload ->> 'away_score')
        else (action.payload ->> 'away_score') || '-' || (action.payload ->> 'home_score') end
    end,
    action.resolved_competition_key,
    action.resolved_competition_name,
    case when pg_catalog.lower(coalesce(action.payload ->> 'is_home', '')) = 'true' then 'home' else 'away' end,
    case when action.phase in ('Juego combinativo', 'Juego directo', 'Transición', 'ABP') then action.phase end,
    case
      when action.phase = 'Juego combinativo' and action.subphase in ('Dentro del área', 'Fuera del área') then action.subphase
      when action.phase = 'Juego directo' and action.subphase in ('Centro al área', 'Segunda jugada') then action.subphase
      when action.phase = 'Transición' and action.subphase in ('Tras robo', 'Tras ABP') then action.subphase
      when action.phase = 'ABP' and action.subphase in ('Córner', 'Falta directa', 'Falta con remate', 'Saque de banda', 'Penalti', 'Segunda jugada') then action.subphase
    end,
    case when action.contact in ('Pie derecho', 'Pie izquierdo', 'Cabeza', 'Rechace', 'Desvío', 'Otro') then action.contact end,
    action.normalized_shot_zone,
    case action.normalized_shot_zone
      when 'finalizacion_izquierda' then 'F.Finalización izquierda' when 'finalizacion_centro' then 'F.Finalización centro' when 'finalizacion_derecha' then 'F.Finalización derecha'
      when 'creacion_izquierda' then 'F.Creación izquierda' when 'creacion_centro' then 'F.Creación centro' when 'creacion_derecha' then 'F.Creación derecha'
      when 'inicio_izquierda' then 'F.Inicio izquierda' when 'inicio_centro' then 'F.Inicio centro' when 'inicio_derecha' then 'F.Inicio derecha' end,
    action.normalized_assist_zone,
    case action.normalized_assist_zone
      when 'finalizacion_izquierda' then 'F.Finalización izquierda' when 'finalizacion_centro' then 'F.Finalización centro' when 'finalizacion_derecha' then 'F.Finalización derecha'
      when 'creacion_izquierda' then 'F.Creación izquierda' when 'creacion_centro' then 'F.Creación centro' when 'creacion_derecha' then 'F.Creación derecha'
      when 'inicio_izquierda' then 'F.Inicio izquierda' when 'inicio_centro' then 'F.Inicio centro' when 'inicio_derecha' then 'F.Inicio derecha' end,
    action.normalized_goal_zone,
    case action.normalized_goal_zone
      when 'alta_izquierda' then 'Alta izquierda' when 'alta_centro' then 'Alta centro' when 'alta_derecha' then 'Alta derecha'
      when 'media_izquierda' then 'Media izquierda' when 'media_centro' then 'Media centro' when 'media_derecha' then 'Media derecha'
      when 'baja_izquierda' then 'Baja izquierda' when 'baja_centro' then 'Baja centro' when 'baja_derecha' then 'Baja derecha' end,
    case
      when action.scorer_id = own_jugador_id and action.assistant_id is distinct from own_jugador_id then 'assistant'
      when action.assistant_id = own_jugador_id and action.scorer_id is distinct from own_jugador_id then 'scorer'
    end,
    case
      when action.scorer_id = own_jugador_id
           and action.assistant_id is distinct from own_jugador_id
           and nullif(pg_catalog.btrim(action.assistant), '') is not null
           and pg_catalog.btrim(action.assistant) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           and pg_catalog.btrim(action.assistant) !~ '[[:cntrl:]]'
           and pg_catalog.length(pg_catalog.btrim(action.assistant)) <= 100
        then pg_catalog.btrim(action.assistant)
      when action.assistant_id = own_jugador_id
           and action.scorer_id is distinct from own_jugador_id
           and nullif(pg_catalog.btrim(action.scorer), '') is not null
           and pg_catalog.btrim(action.scorer) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           and pg_catalog.btrim(action.scorer) !~ '[[:cntrl:]]'
           and pg_catalog.length(pg_catalog.btrim(action.scorer)) <= 100
        then pg_catalog.btrim(action.scorer)
    end,
    case when pg_catalog.btrim(coalesce(action.video_url, ''))
      ~* '^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)'
      then pg_catalog.btrim(action.video_url) end,
    pg_catalog.btrim(coalesce(action.video_url, ''))
      ~* '^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)'
  from actions action
  order by case when action.payload ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                  then (action.payload ->> 'date')::date end desc nulls last,
           case when pg_catalog.btrim(action.minute::text) ~ '^[0-9]+$'
                  then pg_catalog.btrim(action.minute::text)::integer end desc nulls last,
           action.id desc;
end;
$function$;

create function public.get_my_player_match_history(
  p_competition_scope text default 'season',
  p_venue text default 'all',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  match_date date,
  opponent text,
  opponent_crest text,
  result text,
  outcome text,
  competition_key text,
  competition_name text,
  competition_logo_url text,
  venue text,
  role text,
  minutes integer,
  goals integer,
  goals_coverage text,
  assists integer,
  assists_coverage text,
  yellow_cards integer,
  red_cards integer,
  has_allowed_video boolean
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
  own_player_name text;
  own_player_count integer;
  normalized_scope text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_competition_scope, '')));
  normalized_venue text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_venue, '')));
  supported_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
begin
  if normalized_scope not in ('season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly') then
    raise exception using errcode = '22023', message = 'INVALID_COMPETITION_SCOPE';
  end if;
  if normalized_venue not in ('all', 'home', 'away') then
    raise exception using errcode = '22023', message = 'INVALID_VENUE';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'INVALID_LIMIT';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'INVALID_OFFSET';
  end if;
  if actor_id is null then return; end if;
  select pg_catalog.count(*)::integer into membership_count from public.current_membership();
  if membership_count <> 1 then return; end if;
  select membership.user_id, membership.club_id, membership.role,
         membership.jugador_id, membership.is_active
  into membership_user_id, membership_club_id, membership_role,
       own_jugador_id, membership_is_active
  from public.current_membership() membership;
  if membership_user_id is distinct from actor_id
     or membership_club_id is distinct from supported_club_id
     or membership_role is distinct from 'player'
     or membership_is_active is not true
     or own_jugador_id is null
     or own_jugador_id is distinct from public.current_jugador_id()
     or not public.is_player() then return; end if;
  select pg_catalog.count(*)::integer, pg_catalog.max(player.name)
  into own_player_count, own_player_name
  from public.jugadores player where player.id = own_jugador_id;
  if own_player_count <> 1 then return; end if;

  return query
  with scoped_matches as (
    select match_row.id, serialized.payload,
           coalesce(competition.key, serialized.payload ->> 'competition_key') as resolved_competition_key,
           competition.name as resolved_competition_name,
           competition.logo_url as resolved_competition_logo
    from public.partidos match_row
    cross join lateral (select pg_catalog.to_jsonb(match_row) as payload) serialized
    left join lateral (
      select competition.key, competition.name, competition.logo_url, competition.competition_type
      from public.competitions competition
      where (competition.id::text = serialized.payload ->> 'competition_id'
          or (nullif(serialized.payload ->> 'competition_id', '') is null
              and competition.key = serialized.payload ->> 'competition_key'))
        and (competition.club_id is null or competition.club_id = membership_club_id)
      order by (competition.id::text = serialized.payload ->> 'competition_id') desc, competition.key
      limit 1
    ) competition on true
    where match_row.player_visible
      and (normalized_venue = 'all'
        or (normalized_venue = 'home' and pg_catalog.lower(coalesce(serialized.payload ->> 'is_home', '')) = 'true')
        or (normalized_venue = 'away' and pg_catalog.lower(coalesce(serialized.payload ->> 'is_home', '')) = 'false'))
      and (normalized_scope = 'all'
        or (normalized_scope = 'season' and coalesce(competition.competition_type,
              case when coalesce(competition.key, serialized.payload ->> 'competition_key')
                in ('league', 'copa_rfef', 'playoff') then 'official' else '' end) = 'official')
        or (normalized_scope not in ('all', 'season')
            and coalesce(competition.key, serialized.payload ->> 'competition_key') = normalized_scope))
  ), history as (
    select scoped.*, stats.role,
      case when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+([.][0-9]+)?$'
        then pg_catalog.round(pg_catalog.btrim(stats.minutes::text)::numeric, 0)::integer else 0 end as played_minutes,
      case when pg_catalog.btrim(stats.yellow_count::text) ~ '^[0-9]+([.][0-9]+)?$'
        then pg_catalog.round(pg_catalog.btrim(stats.yellow_count::text)::numeric, 0)::integer
        when stats.yellow then 1 else 0 end as yellow_total,
      case when stats.red then 1 else 0 end as red_total
    from public.partido_estadisticas_jugador stats
    join scoped_matches scoped on scoped.id = stats.partido_id
    where stats.jugador_id = own_jugador_id
  )
  select
    case when row.payload ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (row.payload ->> 'date')::date end,
    nullif(pg_catalog.btrim(row.payload ->> 'opponent'), ''),
    nullif(pg_catalog.btrim(row.payload ->> 'opponent_crest'), ''),
    score.result,
    case when score.caudal_score is null or score.rival_score is null then null
         when score.caudal_score > score.rival_score then 'win'
         when score.caudal_score < score.rival_score then 'loss' else 'draw' end,
    row.resolved_competition_key,
    row.resolved_competition_name,
    row.resolved_competition_logo,
    case when pg_catalog.lower(coalesce(row.payload ->> 'is_home', '')) = 'true' then 'home' else 'away' end,
    nullif(pg_catalog.btrim(row.role), ''),
    row.played_minutes,
    goal_stats.goals,
    case when goal_stats.unresolved_goals > 0 then 'PARTIAL' else 'COMPLETE' end,
    goal_stats.assists,
    case when goal_stats.unresolved_assists > 0 then 'PARTIAL' else 'COMPLETE' end,
    row.yellow_total,
    row.red_total,
    goal_stats.has_allowed_video
  from history row
  cross join lateral (
    select
      case when row.payload ->> 'home_score' ~ '^[0-9]+$' then (row.payload ->> 'home_score')::integer end as home_score,
      case when row.payload ->> 'away_score' ~ '^[0-9]+$' then (row.payload ->> 'away_score')::integer end as away_score
  ) parsed_score
  cross join lateral (
    select
      case when pg_catalog.lower(coalesce(row.payload ->> 'is_home', '')) = 'true' then parsed_score.home_score else parsed_score.away_score end as caudal_score,
      case when pg_catalog.lower(coalesce(row.payload ->> 'is_home', '')) = 'true' then parsed_score.away_score else parsed_score.home_score end as rival_score,
      case when parsed_score.home_score is not null and parsed_score.away_score is not null
        then case when pg_catalog.lower(coalesce(row.payload ->> 'is_home', '')) = 'true'
          then parsed_score.home_score::text || '-' || parsed_score.away_score::text
          else parsed_score.away_score::text || '-' || parsed_score.home_score::text end end as result
  ) score
  cross join lateral (
    select
      pg_catalog.count(*) filter (where goal.scorer_id = own_jugador_id)::integer as goals,
      pg_catalog.count(*) filter (where goal.assistant_id = own_jugador_id)::integer as assists,
      pg_catalog.count(*) filter (where goal.scorer_id is null
        and nullif(pg_catalog.btrim(goal.scorer), '') is not null
        and pg_catalog.lower(pg_catalog.btrim(goal.scorer)) = pg_catalog.lower(pg_catalog.btrim(own_player_name)))::integer as unresolved_goals,
      pg_catalog.count(*) filter (where goal.assistant_id is null
        and nullif(pg_catalog.btrim(goal.assistant), '') is not null
        and pg_catalog.lower(pg_catalog.btrim(goal.assistant)) = pg_catalog.lower(pg_catalog.btrim(own_player_name)))::integer as unresolved_assists,
      coalesce(pg_catalog.bool_or(
        (goal.scorer_id = own_jugador_id or goal.assistant_id = own_jugador_id)
        and pg_catalog.btrim(coalesce(goal.video_url, ''))
          ~* '^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)'
      ), false) as has_allowed_video
    from public.partido_eventos_gol goal
    where goal.partido_id = row.id and goal.type = 'Gol a favor'
  ) goal_stats
  order by case when row.payload ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                  then (row.payload ->> 'date')::date end desc nulls last,
           row.id desc
  limit p_limit offset p_offset;
end;
$function$;

alter function public.get_my_player_analysis_overview(text,text) owner to postgres;
alter function public.get_my_player_analysis_live_stats(text,text,text) owner to postgres;
alter function public.get_my_player_production_actions(text,text) owner to postgres;
alter function public.get_my_player_match_history(text,text,integer,integer) owner to postgres;

revoke all on function public.get_my_player_analysis_overview(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_player_analysis_live_stats(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_player_production_actions(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_player_match_history(text,text,integer,integer)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_player_analysis_overview(text,text)
  to authenticated, service_role;
grant execute on function public.get_my_player_analysis_live_stats(text,text,text)
  to authenticated, service_role;
grant execute on function public.get_my_player_production_actions(text,text)
  to authenticated, service_role;
grant execute on function public.get_my_player_match_history(text,text,integer,integer)
  to authenticated, service_role;

comment on function public.get_my_player_analysis_overview(text,text) is
  'Overview PLAYER filtrado; identidad por auth.uid, participacion compatible con STAFF y produccion UUID-only.';
comment on function public.get_my_player_analysis_live_stats(text,text,text) is
  'Registro en vivo PLAYER agregado: solo eventos propios reviewed de partidos Validado y player_visible.';
comment on function public.get_my_player_production_actions(text,text) is
  'Produccion PLAYER propia UUID-only, categorizada y con video HTTPS YouTube allowlisted.';
comment on function public.get_my_player_match_history(text,text,integer,integer) is
  'Historial PLAYER paginado y sanitizado, reconciliable con Overview para el mismo ambito.';

do $postconditions$
declare
  target record;
  function_row pg_catalog.pg_proc%rowtype;
  source text;
  unexpected_execute integer;
begin
  for target in
    select * from (values
      ('public.get_my_player_analysis_overview(text,text)', 2,
       'p_competition_scope text, p_venue text',
       'TABLE(competition_scope text, venue text, match_records integer, matches_played integer, minutes integer, possible_minutes integer, minutes_per_match numeric, starts integer, bench_entries integer, participation_percentage numeric, goals integer, goals_coverage text, assists integer, assists_coverage text, goal_contributions integer, goal_contributions_coverage text, goals_per_90 numeric, assists_per_90 numeric, goal_contributions_per_90 numeric, yellow_cards integer, red_cards integer)'),
      ('public.get_my_player_analysis_live_stats(text,text,text)', 3,
       'p_competition_scope text, p_venue text, p_window text',
       'TABLE(competition_scope text, venue text, "window" text, matches_with_events integer, event_count integer, goals integer, goals_per_match numeric, shots integer, shots_per_match numeric, shots_on_target integer, shots_on_target_per_match numeric, shot_accuracy_percentage numeric, crosses integer, crosses_per_match numeric, turnovers integer, turnovers_per_match numeric, steals integer, steals_per_match numeric, fouls_committed integer, fouls_committed_per_match numeric, fouls_received integer, fouls_received_per_match numeric)'),
      ('public.get_my_player_production_actions(text,text)', 2,
       'p_competition_scope text, p_venue text',
       'TABLE(action_type text, minute integer, match_date date, opponent text, opponent_crest text, result text, competition_key text, competition_name text, venue text, phase text, subphase text, contact text, shot_zone_key text, shot_zone_name text, assist_zone_key text, assist_zone_name text, goal_zone_key text, goal_zone_name text, counterpart_role text, counterpart_name text, video_url text, video_available boolean)'),
      ('public.get_my_player_match_history(text,text,integer,integer)', 4,
       'p_competition_scope text, p_venue text, p_limit integer, p_offset integer',
       'TABLE(match_date date, opponent text, opponent_crest text, result text, outcome text, competition_key text, competition_name text, competition_logo_url text, venue text, role text, minutes integer, goals integer, goals_coverage text, assists integer, assists_coverage text, yellow_cards integer, red_cards integer, has_allowed_video boolean)')
    ) specifications(signature, input_count, expected_arguments, expected_result)
  loop
    select procedure.* into function_row
    from pg_catalog.pg_proc procedure
    where procedure.oid = pg_catalog.to_regprocedure(target.signature);

    if function_row.oid is null
       or function_row.proowner <> 'postgres'::regrole
       or function_row.prolang <> (select language.oid from pg_catalog.pg_language language where language.lanname = 'plpgsql')
       or not function_row.prosecdef
       or function_row.provolatile <> 's'
       or function_row.pronargs <> target.input_count
       or function_row.pronargdefaults <> target.input_count
       or pg_catalog.pg_get_function_identity_arguments(function_row.oid) <> target.expected_arguments
       or pg_catalog.replace(pg_catalog.pg_get_function_result(function_row.oid), '"', '')
          <> pg_catalog.replace(target.expected_result, '"', '')
       or function_row.proconfig is distinct from array['search_path=pg_catalog']::text[] then
      raise exception 'Bloque 2.7C postcondicion: contrato incorrecto en %', target.signature;
    end if;

    source := function_row.prosrc;
    if pg_catalog.strpos(source, 'auth.uid()') = 0
       or pg_catalog.strpos(source, 'public.current_membership()') = 0
       or pg_catalog.strpos(source, 'public.current_jugador_id()') = 0
       or pg_catalog.strpos(source, 'public.is_player()') = 0
       or pg_catalog.strpos(source, 'player_visible') = 0
       or source ~* '(^|[^a-z0-9_])execute([^a-z0-9_]|$)'
       or source ~* '(^|[^a-z0-9_])(insert|update|delete|merge|truncate)([^a-z0-9_]|$)' then
      raise exception 'Bloque 2.7C postcondicion: cuerpo inseguro en %', target.signature;
    end if;

    if pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
       or exists (
         select 1 from pg_catalog.aclexplode(coalesce(function_row.proacl,
           pg_catalog.acldefault('f', function_row.proowner))) acl
         where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
       ) then
      raise exception 'Bloque 2.7C postcondicion: ACL basica incorrecta en %', target.signature;
    end if;

    select pg_catalog.count(*)::integer into unexpected_execute
    from pg_catalog.aclexplode(coalesce(function_row.proacl,
      pg_catalog.acldefault('f', function_row.proowner))) acl
    where acl.privilege_type = 'EXECUTE'
      and acl.grantee <> 0
      and acl.grantee not in (
        function_row.proowner,
        'authenticated'::regrole::oid,
        'service_role'::regrole::oid
      );
    if unexpected_execute <> 0 then
      raise exception 'Bloque 2.7C postcondicion: EXECUTE extra en %', target.signature;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.get_my_player_position_distribution(text,text)') is not null then
    raise exception 'Bloque 2.7C: posiciones debe permanecer fail-closed';
  end if;

  if pg_catalog.strpos(
      (select procedure.prosrc from pg_catalog.pg_proc procedure
       where procedure.oid = 'public.get_my_player_analysis_live_stats(text,text,text)'::regprocedure),
      'event.reviewed is true'
    ) = 0
     or pg_catalog.strpos(
      (select procedure.prosrc from pg_catalog.pg_proc procedure
       where procedure.oid = 'public.get_my_player_analysis_live_stats(text,text,text)'::regprocedure),
      'match_row.delegated_data_status = ''Validado'''
    ) = 0 then
    raise exception 'Bloque 2.7C: Live Stats no conserva validacion obligatoria';
  end if;
end;
$postconditions$;

commit;
