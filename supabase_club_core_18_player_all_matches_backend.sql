-- BLOQUE 2.7D PLAYER - Retirar player_visible como filtro funcional.
--
-- Alcance exclusivo:
--   * transforma cinco RPC PLAYER ya desplegadas;
--   * conserva literalmente cada cuerpo remoto salvo la sustitucion unica de
--       where match_row.player_visible
--     por
--       where true
--   * no modifica tablas, columnas, RLS, policies, datos ni frontend.
--
-- public.partidos.player_visible permanece en el esquema como campo legado,
-- pero deja de tener autoridad funcional en estas cinco RPC PLAYER.

begin;

do $preconditions_and_transform$
declare
  target record;
  function_before pg_catalog.pg_proc%rowtype;
  function_after pg_catalog.pg_proc%rowtype;
  original_source text;
  original_function_arguments text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  old_predicate constant text := 'where match_row.player_visible';
  new_predicate constant text := 'where true';
  old_predicate_count integer;
  unexpected_execute integer;
  perimeter_table text;
  perimeter_ok boolean;
begin
  if auth.uid() is not null then
    raise exception 'Bloque 2.7D debe ejecutarse sin una identidad JWT activa';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Bloque 2.7D: faltan roles Supabase requeridos';
  end if;

  if pg_catalog.to_regclass('public.partidos') is null
     or not exists (
       select 1
       from pg_catalog.pg_attribute attribute
       where attribute.attrelid = 'public.partidos'::regclass
         and attribute.attname = 'player_visible'
         and attribute.attnum > 0
         and not attribute.attisdropped
         and attribute.atttypid = 'pg_catalog.bool'::regtype
     ) then
    raise exception 'Bloque 2.7D: falta public.partidos.player_visible boolean legado';
  end if;

  -- El cierre directo de las fuentes debe seguir vigente antes de tocar RPC.
  if exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = any(array[
      'public.partidos'::regclass,
      'public.partido_estadisticas_jugador'::regclass,
      'public.partido_eventos_gol'::regclass,
      'public.match_quick_events'::regclass,
      'public.partido_alineacion_slots'::regclass,
      'public.partido_eventos_sistema'::regclass,
      'public.partido_snapshots_tacticos'::regclass,
      'public.partido_snapshot_tactico_slots'::regclass
    ])
      and not relation.relrowsecurity
  ) then
    raise exception 'Bloque 2.7D: alguna fuente deportiva no tiene RLS activo';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = any(array[
      'public.partidos'::regclass,
      'public.partido_estadisticas_jugador'::regclass,
      'public.partido_eventos_gol'::regclass,
      'public.match_quick_events'::regclass,
      'public.partido_alineacion_slots'::regclass,
      'public.partido_eventos_sistema'::regclass,
      'public.partido_snapshots_tacticos'::regclass,
      'public.partido_snapshot_tactico_slots'::regclass
    ])
      and 'authenticated'::regrole::oid = any(policy.polroles)
      and (
        (
          policy.polcmd in ('r', 'w', 'd', '*')
          and coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
            not like '%is_app_staff()%'
        )
        or (
          policy.polcmd in ('a', 'w', '*')
          and coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')
            not like '%is_app_staff()%'
        )
      )
  ) then
    raise exception 'Bloque 2.7D: existe una policy authenticated no limitada a STAFF';
  end if;

  foreach perimeter_table in array array[
    'partidos',
    'partido_estadisticas_jugador',
    'partido_eventos_gol',
    'match_quick_events',
    'partido_alineacion_slots',
    'partido_eventos_sistema',
    'partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots'
  ] loop
    select
      relation.relrowsecurity
      and pg_catalog.count(policy.oid) = 4
      and pg_catalog.bool_and(
        policy.polpermissive
        and policy.polname in (
          'player_sports_staff_select',
          'player_sports_staff_insert',
          'player_sports_staff_update',
          'player_sports_staff_delete'
        )
        and policy.polroles = array['authenticated'::regrole::oid]::oid[]
        and (
          policy.polcmd = 'a'
          or coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
             like '%is_app_staff()%'
        )
        and (
          policy.polcmd in ('r', 'd')
          or coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')
             like '%is_app_staff()%'
        )
      )
    into perimeter_ok
    from pg_catalog.pg_class relation
    left join pg_catalog.pg_policy policy on policy.polrelid = relation.oid
    where relation.oid = pg_catalog.to_regclass(
      pg_catalog.format('public.%I', perimeter_table)
    )
    group by relation.relrowsecurity;

    if perimeter_ok is not true then
      raise exception 'Bloque 2.7D: perimetro STAFF-only incompatible en public.%',
        perimeter_table;
    end if;
  end loop;

  for target in
    select *
    from (values
      (
        'public.get_my_player_matches()',
        0,
        0,
        '',
        'TABLE(partido_id uuid, match_date text, opponent text, opponent_crest text, is_home boolean, home_team text, away_team text, home_score text, away_score text, stadium text, competition_key text, competition_name text, competition_logo_url text, match_round text, timeline jsonb)',
        false
      ),
      (
        'public.get_my_player_analysis_overview(text,text)',
        2,
        2,
        'p_competition_scope text, p_venue text',
        'TABLE(competition_scope text, venue text, match_records integer, matches_played integer, minutes integer, possible_minutes integer, minutes_per_match numeric, starts integer, bench_entries integer, participation_percentage numeric, goals integer, goals_coverage text, assists integer, assists_coverage text, goal_contributions integer, goal_contributions_coverage text, goals_per_90 numeric, assists_per_90 numeric, goal_contributions_per_90 numeric, yellow_cards integer, red_cards integer)',
        true
      ),
      (
        'public.get_my_player_analysis_live_stats(text,text,text)',
        3,
        3,
        'p_competition_scope text, p_venue text, p_window text',
        'TABLE(competition_scope text, venue text, window text, matches_with_events integer, event_count integer, goals integer, goals_per_match numeric, shots integer, shots_per_match numeric, shots_on_target integer, shots_on_target_per_match numeric, shot_accuracy_percentage numeric, crosses integer, crosses_per_match numeric, turnovers integer, turnovers_per_match numeric, steals integer, steals_per_match numeric, fouls_committed integer, fouls_committed_per_match numeric, fouls_received integer, fouls_received_per_match numeric)',
        true
      ),
      (
        'public.get_my_player_production_actions(text,text)',
        2,
        2,
        'p_competition_scope text, p_venue text',
        'TABLE(action_type text, minute integer, match_date date, opponent text, opponent_crest text, result text, competition_key text, competition_name text, venue text, phase text, subphase text, contact text, shot_zone_key text, shot_zone_name text, assist_zone_key text, assist_zone_name text, goal_zone_key text, goal_zone_name text, counterpart_role text, counterpart_name text, video_url text, video_available boolean)',
        true
      ),
      (
        'public.get_my_player_match_history(text,text,integer,integer)',
        4,
        4,
        'p_competition_scope text, p_venue text, p_limit integer, p_offset integer',
        'TABLE(match_date date, opponent text, opponent_crest text, result text, outcome text, competition_key text, competition_name text, competition_logo_url text, venue text, role text, minutes integer, goals integer, goals_coverage text, assists integer, assists_coverage text, yellow_cards integer, red_cards integer, has_allowed_video boolean)',
        true
      )
    ) specifications(
      signature,
      expected_input_count,
      expected_default_count,
      expected_arguments,
      expected_result,
      requires_current_jugador
    )
  loop
    select procedure.*
    into function_before
    from pg_catalog.pg_proc procedure
    where procedure.oid = pg_catalog.to_regprocedure(target.signature);

    if function_before.oid is null then
      raise exception 'Bloque 2.7D: falta %', target.signature;
    end if;

    if function_before.proowner <> 'postgres'::regrole
       or function_before.prolang <> (
         select language.oid
         from pg_catalog.pg_language language
         where language.lanname = 'plpgsql'
       )
       or not function_before.prosecdef
       or function_before.provolatile <> 's'
       or function_before.prokind <> 'f'
       or function_before.pronargs <> target.expected_input_count
       or function_before.pronargdefaults <> target.expected_default_count
       or pg_catalog.pg_get_function_identity_arguments(function_before.oid)
          <> target.expected_arguments
       or pg_catalog.replace(
            pg_catalog.pg_get_function_result(function_before.oid), '"', ''
          ) <> target.expected_result
       or function_before.proconfig is distinct from array['search_path=pg_catalog']::text[] then
      raise exception 'Bloque 2.7D: contrato previo incompatible en %', target.signature;
    end if;

    original_source := function_before.prosrc;
    original_function_arguments :=
      pg_catalog.pg_get_function_arguments(function_before.oid);
    old_predicate_count := (
      pg_catalog.length(original_source)
      - pg_catalog.length(pg_catalog.replace(original_source, old_predicate, ''))
    ) / pg_catalog.length(old_predicate);

    if old_predicate_count <> 1 then
      raise exception 'Bloque 2.7D: % debe contener exactamente un predicado legado (encontrados=%)',
        target.signature, old_predicate_count;
    end if;

    if pg_catalog.strpos(original_source, 'public.current_membership()') = 0
       or pg_catalog.strpos(original_source, 'public.is_player()') = 0
       or pg_catalog.strpos(original_source, 'supported_club_id') = 0
       or (
         target.requires_current_jugador
         and (
           pg_catalog.strpos(original_source, 'auth.uid()') = 0
           or pg_catalog.strpos(original_source, 'public.current_jugador_id()') = 0
         )
       )
       or original_source ~* '(^|[^a-z0-9_])execute([^a-z0-9_]|$)'
       or original_source ~* '(^|[^a-z0-9_])(insert|update|delete|merge|truncate)([^a-z0-9_]|$)' then
      raise exception 'Bloque 2.7D: cuerpo previo inseguro o identidad incompleta en %',
        target.signature;
    end if;

    if pg_catalog.has_function_privilege('anon', function_before.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', function_before.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', function_before.oid, 'EXECUTE')
       or exists (
         select 1
         from pg_catalog.aclexplode(coalesce(
           function_before.proacl,
           pg_catalog.acldefault('f', function_before.proowner)
         )) acl
         where acl.grantee = 0
           and acl.privilege_type = 'EXECUTE'
       ) then
      raise exception 'Bloque 2.7D: ACL previa incompatible en %', target.signature;
    end if;

    select pg_catalog.count(*)::integer
    into unexpected_execute
    from pg_catalog.aclexplode(coalesce(
      function_before.proacl,
      pg_catalog.acldefault('f', function_before.proowner)
    )) acl
    where acl.privilege_type = 'EXECUTE'
      and acl.grantee <> 0
      and acl.grantee not in (
        function_before.proowner,
        'authenticated'::regrole::oid,
        'service_role'::regrole::oid
      );

    if unexpected_execute <> 0 then
      raise exception 'Bloque 2.7D: EXECUTE extra previo en %', target.signature;
    end if;

    transformed_source := pg_catalog.replace(
      original_source,
      old_predicate,
      new_predicate
    );

    if pg_catalog.strpos(transformed_source, 'player_visible') <> 0
       or pg_catalog.replace(transformed_source, new_predicate, old_predicate)
          is distinct from original_source then
      raise exception 'Bloque 2.7D: transformacion no reversible en %', target.signature;
    end if;

    original_definition := pg_catalog.pg_get_functiondef(function_before.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);

    if source_offset = 0
       or pg_catalog.strpos(
            pg_catalog.substr(
              original_definition,
              source_offset + pg_catalog.length(original_source)
            ),
            original_source
          ) <> 0 then
      raise exception 'Bloque 2.7D: no se pudo aislar de forma unica el cuerpo de %',
        target.signature;
    end if;

    transformed_definition :=
      pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(
           original_definition,
           source_offset + pg_catalog.length(original_source)
         );

    execute transformed_definition;

    select procedure.*
    into function_after
    from pg_catalog.pg_proc procedure
    where procedure.oid = pg_catalog.to_regprocedure(target.signature);

    if function_after.oid is distinct from function_before.oid
       or function_after.prosrc is distinct from transformed_source
       or (
         pg_catalog.to_jsonb(function_after)
         - array['prosrc', 'proargdefaults']::text[]
       ) is distinct from (
         pg_catalog.to_jsonb(function_before)
         - array['prosrc', 'proargdefaults']::text[]
       )
       or pg_catalog.pg_get_function_arguments(function_after.oid)
          is distinct from original_function_arguments then
      raise exception 'Bloque 2.7D: CREATE OR REPLACE altero algo ajeno al predicado en %',
        target.signature;
    end if;
  end loop;
end;
$preconditions_and_transform$;

-- CREATE OR REPLACE conserva ACL, pero se normaliza de forma explicita para
-- que el contrato final sea inequivoco e idempotente.
alter function public.get_my_player_matches() owner to postgres;
revoke all on function public.get_my_player_matches()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_matches()
  to authenticated, service_role;

alter function public.get_my_player_analysis_overview(text,text) owner to postgres;
revoke all on function public.get_my_player_analysis_overview(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_analysis_overview(text,text)
  to authenticated, service_role;

alter function public.get_my_player_analysis_live_stats(text,text,text) owner to postgres;
revoke all on function public.get_my_player_analysis_live_stats(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_analysis_live_stats(text,text,text)
  to authenticated, service_role;

alter function public.get_my_player_production_actions(text,text) owner to postgres;
revoke all on function public.get_my_player_production_actions(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_production_actions(text,text)
  to authenticated, service_role;

alter function public.get_my_player_match_history(text,text,integer,integer) owner to postgres;
revoke all on function public.get_my_player_match_history(text,text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_match_history(text,text,integer,integer)
  to authenticated, service_role;

do $postconditions$
declare
  target record;
  function_row pg_catalog.pg_proc%rowtype;
  source text;
  unexpected_execute integer;
begin
  for target in
    select *
    from (values
      (
        'public.get_my_player_matches()', 0, 0, '',
        'TABLE(partido_id uuid, match_date text, opponent text, opponent_crest text, is_home boolean, home_team text, away_team text, home_score text, away_score text, stadium text, competition_key text, competition_name text, competition_logo_url text, match_round text, timeline jsonb)',
        false
      ),
      (
        'public.get_my_player_analysis_overview(text,text)', 2, 2,
        'p_competition_scope text, p_venue text',
        'TABLE(competition_scope text, venue text, match_records integer, matches_played integer, minutes integer, possible_minutes integer, minutes_per_match numeric, starts integer, bench_entries integer, participation_percentage numeric, goals integer, goals_coverage text, assists integer, assists_coverage text, goal_contributions integer, goal_contributions_coverage text, goals_per_90 numeric, assists_per_90 numeric, goal_contributions_per_90 numeric, yellow_cards integer, red_cards integer)',
        true
      ),
      (
        'public.get_my_player_analysis_live_stats(text,text,text)', 3, 3,
        'p_competition_scope text, p_venue text, p_window text',
        'TABLE(competition_scope text, venue text, window text, matches_with_events integer, event_count integer, goals integer, goals_per_match numeric, shots integer, shots_per_match numeric, shots_on_target integer, shots_on_target_per_match numeric, shot_accuracy_percentage numeric, crosses integer, crosses_per_match numeric, turnovers integer, turnovers_per_match numeric, steals integer, steals_per_match numeric, fouls_committed integer, fouls_committed_per_match numeric, fouls_received integer, fouls_received_per_match numeric)',
        true
      ),
      (
        'public.get_my_player_production_actions(text,text)', 2, 2,
        'p_competition_scope text, p_venue text',
        'TABLE(action_type text, minute integer, match_date date, opponent text, opponent_crest text, result text, competition_key text, competition_name text, venue text, phase text, subphase text, contact text, shot_zone_key text, shot_zone_name text, assist_zone_key text, assist_zone_name text, goal_zone_key text, goal_zone_name text, counterpart_role text, counterpart_name text, video_url text, video_available boolean)',
        true
      ),
      (
        'public.get_my_player_match_history(text,text,integer,integer)', 4, 4,
        'p_competition_scope text, p_venue text, p_limit integer, p_offset integer',
        'TABLE(match_date date, opponent text, opponent_crest text, result text, outcome text, competition_key text, competition_name text, competition_logo_url text, venue text, role text, minutes integer, goals integer, goals_coverage text, assists integer, assists_coverage text, yellow_cards integer, red_cards integer, has_allowed_video boolean)',
        true
      )
    ) specifications(
      signature,
      expected_input_count,
      expected_default_count,
      expected_arguments,
      expected_result,
      requires_current_jugador
    )
  loop
    select procedure.*
    into function_row
    from pg_catalog.pg_proc procedure
    where procedure.oid = pg_catalog.to_regprocedure(target.signature);

    if function_row.oid is null
       or function_row.proowner <> 'postgres'::regrole
       or function_row.prolang <> (
         select language.oid
         from pg_catalog.pg_language language
         where language.lanname = 'plpgsql'
       )
       or not function_row.prosecdef
       or function_row.provolatile <> 's'
       or function_row.prokind <> 'f'
       or function_row.pronargs <> target.expected_input_count
       or function_row.pronargdefaults <> target.expected_default_count
       or pg_catalog.pg_get_function_identity_arguments(function_row.oid)
          <> target.expected_arguments
       or pg_catalog.replace(
            pg_catalog.pg_get_function_result(function_row.oid), '"', ''
          ) <> target.expected_result
       or function_row.proconfig is distinct from array['search_path=pg_catalog']::text[] then
      raise exception 'Bloque 2.7D postcondicion: contrato incorrecto en %',
        target.signature;
    end if;

    source := function_row.prosrc;
    if pg_catalog.strpos(source, 'player_visible') <> 0
       or pg_catalog.strpos(source, 'where true') = 0
       or pg_catalog.strpos(source, 'public.current_membership()') = 0
       or pg_catalog.strpos(source, 'public.is_player()') = 0
       or pg_catalog.strpos(source, 'supported_club_id') = 0
       or (
         target.requires_current_jugador
         and (
           pg_catalog.strpos(source, 'auth.uid()') = 0
           or pg_catalog.strpos(source, 'public.current_jugador_id()') = 0
         )
       )
       or source ~* 'select[[:space:]]+[*][[:space:]]+from[[:space:]]+public[.]partidos'
       or source ~* '(^|[^a-z0-9_])execute([^a-z0-9_]|$)'
       or source ~* '(^|[^a-z0-9_])(insert|update|delete|merge|truncate)([^a-z0-9_]|$)' then
      raise exception 'Bloque 2.7D postcondicion: cuerpo inseguro en %', target.signature;
    end if;

    if pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
       or exists (
         select 1
         from pg_catalog.aclexplode(coalesce(
           function_row.proacl,
           pg_catalog.acldefault('f', function_row.proowner)
         )) acl
         where acl.grantee = 0
           and acl.privilege_type = 'EXECUTE'
       ) then
      raise exception 'Bloque 2.7D postcondicion: ACL basica incorrecta en %',
        target.signature;
    end if;

    select pg_catalog.count(*)::integer
    into unexpected_execute
    from pg_catalog.aclexplode(coalesce(
      function_row.proacl,
      pg_catalog.acldefault('f', function_row.proowner)
    )) acl
    where acl.privilege_type = 'EXECUTE'
      and acl.grantee <> 0
      and acl.grantee not in (
        function_row.proowner,
        'authenticated'::regrole::oid,
        'service_role'::regrole::oid
      );

    if unexpected_execute <> 0 then
      raise exception 'Bloque 2.7D postcondicion: EXECUTE extra en %', target.signature;
    end if;
  end loop;

  if pg_catalog.strpos(
       (
         select procedure.prosrc
         from pg_catalog.pg_proc procedure
         where procedure.oid =
           'public.get_my_player_analysis_live_stats(text,text,text)'::regprocedure
       ),
       'event.reviewed is true'
     ) = 0
     or pg_catalog.strpos(
       (
         select procedure.prosrc
         from pg_catalog.pg_proc procedure
         where procedure.oid =
           'public.get_my_player_analysis_live_stats(text,text,text)'::regprocedure
       ),
       'match_row.delegated_data_status = ''Validado'''
     ) = 0 then
    raise exception 'Bloque 2.7D: Live Stats no conserva validacion obligatoria';
  end if;

  if pg_catalog.strpos(
       (
         select procedure.prosrc
         from pg_catalog.pg_proc procedure
         where procedure.oid =
           'public.get_my_player_production_actions(text,text)'::regprocedure
       ),
       'goal.scorer_id = own_jugador_id or goal.assistant_id = own_jugador_id'
     ) = 0 then
    raise exception 'Bloque 2.7D: Produccion no conserva atribucion UUID-only';
  end if;

  if pg_catalog.to_regprocedure(
       'public.get_my_player_position_distribution(text,text)'
     ) is not null then
    raise exception 'Bloque 2.7D: posiciones debe permanecer fail-closed';
  end if;
end;
$postconditions$;

commit;
