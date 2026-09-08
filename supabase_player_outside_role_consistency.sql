-- PLAYER: rol canonico Titular / Suplente / Fuera en analisis.
-- Reparacion focal posterior a club core 16-18 y publication gate.

begin;

do $preconditions$
declare
  target record;
  function_row pg_catalog.pg_proc%rowtype;
begin
  if pg_catalog.to_regclass('public.partido_estadisticas_jugador') is null
     or pg_catalog.to_regclass('public.partido_convocados') is null
     or pg_catalog.to_regclass('public.partido_alineacion_slots') is null then
    raise exception 'PLAYER fuera/convocatoria: faltan fuentes canonicas; no se modifica nada';
  end if;

  if pg_catalog.to_regprocedure('public.is_player_match_publishable(text,text,timestamptz)') is null then
    raise exception 'PLAYER fuera/convocatoria: falta publication gate; no se modifica nada';
  end if;

  for target in
    select *
    from (values
      (
        'public.get_my_player_analysis_overview(text,text)',
        'p_competition_scope text, p_venue text',
        'TABLE(competition_scope text, venue text, match_records integer, matches_played integer, minutes integer, possible_minutes integer, minutes_per_match numeric, starts integer, bench_entries integer, participation_percentage numeric, goals integer, goals_coverage text, assists integer, assists_coverage text, goal_contributions integer, goal_contributions_coverage text, goals_per_90 numeric, assists_per_90 numeric, goal_contributions_per_90 numeric, yellow_cards integer, red_cards integer)'
      ),
      (
        'public.get_my_player_match_history(text,text,integer,integer)',
        'p_competition_scope text, p_venue text, p_limit integer, p_offset integer',
        'TABLE(match_date date, opponent text, opponent_crest text, result text, outcome text, competition_key text, competition_name text, competition_logo_url text, venue text, role text, minutes integer, goals integer, goals_coverage text, assists integer, assists_coverage text, yellow_cards integer, red_cards integer, has_allowed_video boolean)'
      ),
      (
        'public.get_my_player_analysis_summary()',
        '',
        'TABLE(jugador_id uuid, matches bigint, minutes numeric, starts bigint, bench_entries bigint, goals bigint, goals_coverage text, assists bigint, assists_coverage text, yellow_cards numeric, red_cards bigint)'
      )
    ) specification(signature, expected_arguments, expected_result)
  loop
    select procedure.* into function_row
    from pg_catalog.pg_proc procedure
    where procedure.oid = pg_catalog.to_regprocedure(target.signature);

    if function_row.oid is null
       or function_row.proowner <> 'postgres'::regrole
       or function_row.prolang <> (
         select language.oid from pg_catalog.pg_language language
         where language.lanname = 'plpgsql'
       )
       or not function_row.prosecdef
       or function_row.provolatile <> 's'
       or function_row.prokind <> 'f'
       or pg_catalog.pg_get_function_identity_arguments(function_row.oid)
          <> target.expected_arguments
       or pg_catalog.replace(
            pg_catalog.pg_get_function_result(function_row.oid), '"', ''
          ) <> target.expected_result
       or function_row.proconfig is distinct from array['search_path=pg_catalog']::text[] then
      raise exception 'PLAYER fuera/convocatoria: contrato incompatible en %; no se modifica nada',
        target.signature;
    end if;

    if pg_catalog.strpos(
         function_row.prosrc,
         'public.is_player_match_publishable('
       ) = 0 then
      raise exception 'PLAYER fuera/convocatoria: % no conserva publication gate; no se modifica nada',
        target.signature;
    end if;
  end loop;
end;
$preconditions$;

do $patch_overview$
declare
  function_before pg_catalog.pg_proc%rowtype;
  function_after pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  block_start integer;
  block_end integer;
  start_anchor constant text := '  ), own_rows as (';
  end_anchor constant text := '  ), production as (';
  replacement constant text := $replacement$  ), own_rows as (
    select
      stats.partido_id,
      case
        when not canonical_participation.is_starter
             and not canonical_participation.is_called then 0
        when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+([.][0-9]+)?$'
          then pg_catalog.round(pg_catalog.btrim(stats.minutes::text)::numeric, 0)::integer
        else 0
      end as played_minutes,
      case
        when canonical_participation.is_starter then 'titular'
        when canonical_participation.is_called then 'suplente'
        else 'fuera'
      end as normalized_role,
      case
        when pg_catalog.btrim(stats.yellow_count::text) ~ '^[0-9]+([.][0-9]+)?$'
          then pg_catalog.round(pg_catalog.btrim(stats.yellow_count::text)::numeric, 0)::integer
        when stats.yellow then 1 else 0
      end as yellow_cards,
      stats.red
    from public.partido_estadisticas_jugador stats
    join scoped_matches scoped on scoped.id = stats.partido_id
    cross join lateral (
      select
        exists (
          select 1
          from public.partido_alineacion_slots lineup
          where lineup.partido_id = stats.partido_id
            and lineup.scope = 'stats'
            and lineup.jugador_id = own_jugador_id
        ) as is_starter,
        exists (
          select 1
          from public.partido_convocados callup
          where callup.partido_id = stats.partido_id
            and callup.jugador_id = own_jugador_id
        ) as is_called
    ) canonical_participation
    where stats.jugador_id = own_jugador_id
  ), participation as (
    select
      pg_catalog.count(*) filter (
        where own_row.normalized_role <> 'fuera'
      )::integer as match_records,
      pg_catalog.count(*) filter (
        where own_row.played_minutes > 0 or own_row.normalized_role = 'titular'
      )::integer as matches_played,
      coalesce(pg_catalog.sum(own_row.played_minutes), 0)::integer as minutes,
      (pg_catalog.count(*) filter (
        where own_row.normalized_role <> 'fuera'
      ) * 90)::integer as possible_minutes,
      pg_catalog.count(*) filter (
        where own_row.normalized_role = 'titular'
      )::integer as starts,
      pg_catalog.count(*) filter (
        where own_row.played_minutes > 0
          and own_row.normalized_role = 'suplente'
      )::integer as bench_entries,
      coalesce(pg_catalog.sum(own_row.yellow_cards) filter (
        where own_row.normalized_role <> 'fuera'
      ), 0)::integer as yellow_cards,
      pg_catalog.count(*) filter (
        where own_row.red and own_row.normalized_role <> 'fuera'
      )::integer as red_cards
    from own_rows own_row
  ), production as (
$replacement$;
begin
  select procedure.* into function_before
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_analysis_overview(text,text)'::regprocedure;

  original_source := function_before.prosrc;
  if pg_catalog.strpos(original_source, ') canonical_participation') <> 0 then
    return;
  end if;

  block_start := pg_catalog.strpos(original_source, start_anchor);
  block_end := pg_catalog.strpos(original_source, end_anchor);
  if block_start = 0 or block_end <= block_start
     or pg_catalog.strpos(original_source, 'stats.role') = 0
     or pg_catalog.strpos(original_source, 'pg_catalog.count(*) * 90') = 0 then
    raise exception 'PLAYER fuera/convocatoria: cuerpo overview inesperado; no se modifica nada';
  end if;

  transformed_source := pg_catalog.substr(original_source, 1, block_start - 1)
    || replacement
    || pg_catalog.substr(original_source, block_end + pg_catalog.length(end_anchor));
  original_definition := pg_catalog.pg_get_functiondef(function_before.oid);
  source_offset := pg_catalog.strpos(original_definition, original_source);
  if source_offset = 0 then
    raise exception 'PLAYER fuera/convocatoria: no se pudo aislar overview';
  end if;
  transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
    || transformed_source
    || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
  execute transformed_definition;

  select procedure.* into function_after
  from pg_catalog.pg_proc procedure
  where procedure.oid = function_before.oid;
  if function_after.oid is distinct from function_before.oid
     or (pg_catalog.to_jsonb(function_after) - array['prosrc', 'proargdefaults']::text[])
        is distinct from (pg_catalog.to_jsonb(function_before) - array['prosrc', 'proargdefaults']::text[]) then
    raise exception 'PLAYER fuera/convocatoria: overview altero algo ajeno al cuerpo';
  end if;
end;
$patch_overview$;

do $patch_history$
declare
  function_before pg_catalog.pg_proc%rowtype;
  function_after pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  block_start integer;
  block_end integer;
  start_anchor constant text := '  ), history as (';
  end_anchor constant text := E'  select\n    case when row.payload';
  replacement constant text := $replacement$  ), history as (
    select
      scoped.*,
      case
        when canonical_participation.is_starter then 'Titular'
        when canonical_participation.is_called then 'Suplente'
        else 'Fuera'
      end as role,
      case
        when not canonical_participation.is_starter
             and not canonical_participation.is_called then null
        when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+([.][0-9]+)?$'
          then pg_catalog.round(pg_catalog.btrim(stats.minutes::text)::numeric, 0)::integer
        else 0
      end as played_minutes,
      case
        when pg_catalog.btrim(stats.yellow_count::text) ~ '^[0-9]+([.][0-9]+)?$'
          then pg_catalog.round(pg_catalog.btrim(stats.yellow_count::text)::numeric, 0)::integer
        when stats.yellow then 1 else 0
      end as yellow_total,
      case when stats.red then 1 else 0 end as red_total
    from public.partido_estadisticas_jugador stats
    join scoped_matches scoped on scoped.id = stats.partido_id
    cross join lateral (
      select
        exists (
          select 1
          from public.partido_alineacion_slots lineup
          where lineup.partido_id = stats.partido_id
            and lineup.scope = 'stats'
            and lineup.jugador_id = own_jugador_id
        ) as is_starter,
        exists (
          select 1
          from public.partido_convocados callup
          where callup.partido_id = stats.partido_id
            and callup.jugador_id = own_jugador_id
        ) as is_called
    ) canonical_participation
    where stats.jugador_id = own_jugador_id
  )
$replacement$;
begin
  select procedure.* into function_before
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_match_history(text,text,integer,integer)'::regprocedure;

  original_source := function_before.prosrc;
  if pg_catalog.strpos(original_source, ') canonical_participation') <> 0 then
    return;
  end if;

  block_start := pg_catalog.strpos(original_source, start_anchor);
  block_end := pg_catalog.strpos(original_source, end_anchor);
  if block_start = 0 or block_end <= block_start
     or pg_catalog.strpos(original_source, 'select scoped.*, stats.role') = 0 then
    raise exception 'PLAYER fuera/convocatoria: cuerpo history inesperado; no se modifica nada';
  end if;

  transformed_source := pg_catalog.substr(original_source, 1, block_start - 1)
    || replacement
    || pg_catalog.substr(original_source, block_end);
  original_definition := pg_catalog.pg_get_functiondef(function_before.oid);
  source_offset := pg_catalog.strpos(original_definition, original_source);
  if source_offset = 0 then
    raise exception 'PLAYER fuera/convocatoria: no se pudo aislar history';
  end if;
  transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
    || transformed_source
    || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
  execute transformed_definition;

  select procedure.* into function_after
  from pg_catalog.pg_proc procedure
  where procedure.oid = function_before.oid;
  if function_after.oid is distinct from function_before.oid
     or (pg_catalog.to_jsonb(function_after) - array['prosrc', 'proargdefaults']::text[])
        is distinct from (pg_catalog.to_jsonb(function_before) - array['prosrc', 'proargdefaults']::text[]) then
    raise exception 'PLAYER fuera/convocatoria: history altero algo ajeno al cuerpo';
  end if;
end;
$patch_history$;

do $patch_summary$
declare
  function_before pg_catalog.pg_proc%rowtype;
  function_after pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  block_start integer;
  block_end integer;
  start_anchor constant text := '  with own_stats as (';
  end_anchor constant text := E'  ),\n  goal_stats as (';
  replacement constant text := $replacement$  with own_stats as (
    select
      pg_catalog.count(distinct stats.partido_id) filter (
        where exists (
          select 1 from public.partido_convocados callup
          where callup.partido_id = stats.partido_id
            and callup.jugador_id = own_jugador_id
        )
      )::bigint as matches,
      coalesce(
        pg_catalog.sum(
          case
            when exists (
              select 1 from public.partido_convocados callup
              where callup.partido_id = stats.partido_id
                and callup.jugador_id = own_jugador_id
            ) and pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+([.][0-9]+)?$'
              then pg_catalog.btrim(stats.minutes::text)::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as minutes,
      pg_catalog.count(*) filter (
        where exists (
          select 1 from public.partido_alineacion_slots lineup
          where lineup.partido_id = stats.partido_id
            and lineup.scope = 'stats'
            and lineup.jugador_id = own_jugador_id
        )
      )::bigint as starts,
      pg_catalog.count(*) filter (
        where exists (
          select 1 from public.partido_convocados callup
          where callup.partido_id = stats.partido_id
            and callup.jugador_id = own_jugador_id
        )
          and not exists (
            select 1 from public.partido_alineacion_slots lineup
            where lineup.partido_id = stats.partido_id
              and lineup.scope = 'stats'
              and lineup.jugador_id = own_jugador_id
          )
          and case
            when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+([.][0-9]+)?$'
              then pg_catalog.btrim(stats.minutes::text)::numeric
            else 0::numeric
          end > 0::numeric
      )::bigint as bench_entries,
      coalesce(
        pg_catalog.sum(
          case
            when not exists (
              select 1 from public.partido_convocados callup
              where callup.partido_id = stats.partido_id
                and callup.jugador_id = own_jugador_id
            ) then 0::numeric
            when pg_catalog.btrim(stats.yellow_count::text) ~ '^[0-9]+([.][0-9]+)?$'
              then pg_catalog.btrim(stats.yellow_count::text)::numeric
            when stats.yellow then 1::numeric
            else 0::numeric
          end
        ),
        0::numeric
      ) as yellow_cards,
      pg_catalog.count(*) filter (
        where stats.red
          and exists (
            select 1 from public.partido_convocados callup
            where callup.partido_id = stats.partido_id
              and callup.jugador_id = own_jugador_id
          )
      )::bigint as red_cards
    from public.partido_estadisticas_jugador stats
    join public.partidos match_row on match_row.id = stats.partido_id
    cross join lateral (select pg_catalog.to_jsonb(match_row) as match_json) serialized
    where public.is_player_match_publishable(
      match_json ->> 'status', match_json ->> 'date'
    )
      and stats.jugador_id = own_jugador_id
$replacement$;
begin
  select procedure.* into function_before
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_analysis_summary()'::regprocedure;

  original_source := function_before.prosrc;
  if pg_catalog.strpos(original_source, 'count(distinct stats.partido_id) filter (') <> 0
     and pg_catalog.strpos(original_source, 'from public.partido_convocados callup') <> 0 then
    return;
  end if;

  block_start := pg_catalog.strpos(original_source, start_anchor);
  block_end := pg_catalog.strpos(original_source, end_anchor);
  if block_start = 0 or block_end <= block_start
     or pg_catalog.strpos(original_source, 'count(distinct stats.partido_id)::bigint as matches') = 0
     or pg_catalog.strpos(original_source, 'public.is_player_match_publishable(') = 0 then
    raise exception 'PLAYER fuera/convocatoria: cuerpo summary inesperado; no se modifica nada';
  end if;

  transformed_source := pg_catalog.substr(original_source, 1, block_start - 1)
    || replacement
    || pg_catalog.substr(original_source, block_end);
  original_definition := pg_catalog.pg_get_functiondef(function_before.oid);
  source_offset := pg_catalog.strpos(original_definition, original_source);
  if source_offset = 0 then
    raise exception 'PLAYER fuera/convocatoria: no se pudo aislar summary';
  end if;
  transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
    || transformed_source
    || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
  execute transformed_definition;

  select procedure.* into function_after
  from pg_catalog.pg_proc procedure
  where procedure.oid = function_before.oid;
  if function_after.oid is distinct from function_before.oid
     or (pg_catalog.to_jsonb(function_after) - array['prosrc', 'proargdefaults']::text[])
        is distinct from (pg_catalog.to_jsonb(function_before) - array['prosrc', 'proargdefaults']::text[]) then
    raise exception 'PLAYER fuera/convocatoria: summary altero algo ajeno al cuerpo';
  end if;
end;
$patch_summary$;

do $postconditions$
declare
  overview_source text;
  history_source text;
  summary_source text;
begin
  select procedure.prosrc into overview_source
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_analysis_overview(text,text)'::regprocedure;
  select procedure.prosrc into history_source
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_match_history(text,text,integer,integer)'::regprocedure;
  select procedure.prosrc into summary_source
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_analysis_summary()'::regprocedure;

  if pg_catalog.strpos(overview_source, ') canonical_participation') = 0
     or pg_catalog.strpos(overview_source, 'own_row.normalized_role <> ''fuera''') = 0
     or pg_catalog.strpos(history_source, 'else ''Fuera''') = 0
     or pg_catalog.strpos(history_source, 'then null') = 0
     or pg_catalog.strpos(summary_source, 'from public.partido_convocados callup') = 0 then
    raise exception 'PLAYER fuera/convocatoria: postcondicion de rol canonico incumplida';
  end if;

  if pg_catalog.strpos(overview_source, 'public.is_player_match_publishable(') = 0
     or pg_catalog.strpos(history_source, 'public.is_player_match_publishable(') = 0
     or pg_catalog.strpos(summary_source, 'public.is_player_match_publishable(') = 0 then
    raise exception 'PLAYER fuera/convocatoria: publication gate se perdio';
  end if;
end;
$postconditions$;

commit;
