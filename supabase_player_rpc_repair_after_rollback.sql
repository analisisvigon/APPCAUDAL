-- APPCAUDAL - Reparacion incremental de RPC PLAYER tras rollback.
-- Parte de las definiciones realmente desplegadas en pg_proc: retira
-- player_visible como compuerta, aplica el helper de publicacion existente a
-- datos deportivos sensibles y conserva firmas, cuerpos restantes, owner y ACL.
-- No modifica Core 16/17, tablas, datos, RLS, grants ni el helper.

begin;

do $match_calendar_precondition$
declare
  date_type oid;
  date_type_name text;
begin
  if pg_catalog.to_regclass('public.partidos') is null then
    raise exception 'RPC repair: falta public.partidos';
  end if;

  select attribute.atttypid,
         pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
  into date_type, date_type_name
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.partidos'::regclass
    and attribute.attname = 'date'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if date_type is null
     or date_type <> all(array[
       'pg_catalog.date'::regtype::oid,
       'pg_catalog.text'::regtype::oid,
       'pg_catalog.varchar'::regtype::oid
     ]) then
    raise exception
      'RPC repair: public.partidos.date debe ser fecha de calendario compatible (tipo=%)',
      coalesce(date_type_name, 'AUSENTE');
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.partidos'::regclass
      and attribute.attname = 'status'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'RPC repair: falta public.partidos.status';
  end if;
end;
$match_calendar_precondition$;

-- Las seis RPC deben conservar exactamente el contrato ya publicado. Esta
-- comprobacion ocurre antes del primer CREATE OR REPLACE para que una firma,
-- retorno, seguridad o ACL incompatible aborte sin haber modificado nada.
do $player_rpc_preconditions$
declare
  target record;
  function_row pg_catalog.pg_proc%rowtype;
  unexpected_execute integer;
begin
  for target in
    select * from (values
      ('public.get_my_player_matches()', 0, 0, '',
       'TABLE(partido_id uuid, match_date text, opponent text, opponent_crest text, is_home boolean, home_team text, away_team text, home_score text, away_score text, stadium text, competition_key text, competition_name text, competition_logo_url text, match_round text, timeline jsonb)'),
      ('public.get_my_player_analysis_overview(text,text)', 2, 2,
       'p_competition_scope text, p_venue text',
       'TABLE(competition_scope text, venue text, match_records integer, matches_played integer, minutes integer, possible_minutes integer, minutes_per_match numeric, starts integer, bench_entries integer, participation_percentage numeric, goals integer, goals_coverage text, assists integer, assists_coverage text, goal_contributions integer, goal_contributions_coverage text, goals_per_90 numeric, assists_per_90 numeric, goal_contributions_per_90 numeric, yellow_cards integer, red_cards integer)'),
      ('public.get_my_player_analysis_live_stats(text,text,text)', 3, 3,
       'p_competition_scope text, p_venue text, p_window text',
       'TABLE(competition_scope text, venue text, "window" text, matches_with_events integer, event_count integer, goals integer, goals_per_match numeric, shots integer, shots_per_match numeric, shots_on_target integer, shots_on_target_per_match numeric, shot_accuracy_percentage numeric, crosses integer, crosses_per_match numeric, turnovers integer, turnovers_per_match numeric, steals integer, steals_per_match numeric, fouls_committed integer, fouls_committed_per_match numeric, fouls_received integer, fouls_received_per_match numeric)'),
      ('public.get_my_player_production_actions(text,text)', 2, 2,
       'p_competition_scope text, p_venue text',
       'TABLE(action_type text, minute integer, match_date date, opponent text, opponent_crest text, result text, competition_key text, competition_name text, venue text, phase text, subphase text, contact text, shot_zone_key text, shot_zone_name text, assist_zone_key text, assist_zone_name text, goal_zone_key text, goal_zone_name text, counterpart_role text, counterpart_name text, video_url text, video_available boolean)'),
      ('public.get_my_player_match_history(text,text,integer,integer)', 4, 4,
       'p_competition_scope text, p_venue text, p_limit integer, p_offset integer',
       'TABLE(match_date date, opponent text, opponent_crest text, result text, outcome text, competition_key text, competition_name text, competition_logo_url text, venue text, role text, minutes integer, goals integer, goals_coverage text, assists integer, assists_coverage text, yellow_cards integer, red_cards integer, has_allowed_video boolean)'),
      ('public.get_my_player_analysis_summary()', 0, 0, '',
       'TABLE(jugador_id uuid, matches bigint, minutes numeric, starts bigint, bench_entries bigint, goals bigint, goals_coverage text, assists bigint, assists_coverage text, yellow_cards numeric, red_cards bigint)')
    ) specifications(
      signature, input_count, default_count, expected_arguments, expected_result
    )
  loop
    select procedure.* into function_row
    from pg_catalog.pg_proc procedure
    where procedure.oid = pg_catalog.to_regprocedure(target.signature);

    if function_row.oid is null then
      if exists (
        select 1
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = pg_catalog.split_part(
            pg_catalog.split_part(target.signature, '.', 2), '(', 1
          )
      ) then
        raise exception
          'RPC repair: existe public.% con firma incompatible; se esperaba % y no se modifica nada',
          pg_catalog.split_part(
            pg_catalog.split_part(target.signature, '.', 2), '(', 1
          ),
          target.signature;
      end if;

      raise exception
        'RPC repair: falta % con su firma exacta; no se modifica nada',
        target.signature;
    end if;

    if function_row.prokind <> 'f'
       or function_row.proowner <> 'postgres'::regrole
       or function_row.prolang <> (
         select language.oid
         from pg_catalog.pg_language language
         where language.lanname = 'plpgsql'
       )
       or not function_row.prosecdef
       or function_row.provolatile <> 's'
       or function_row.pronargs <> target.input_count
       or function_row.pronargdefaults <> target.default_count
       or pg_catalog.pg_get_function_identity_arguments(function_row.oid)
          <> target.expected_arguments
       or pg_catalog.replace(
            pg_catalog.pg_get_function_result(function_row.oid), '"', ''
          ) <> pg_catalog.replace(target.expected_result, '"', '')
       or function_row.proconfig is distinct from
          array['search_path=pg_catalog']::text[] then
      raise exception
        'RPC repair: contrato incompatible en %; se esperaban firma, retorno, SECURITY DEFINER y search_path publicados; no se modifica nada',
        target.signature;
    end if;

    if pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege(
         'authenticated', function_row.oid, 'EXECUTE'
       )
       or not pg_catalog.has_function_privilege(
         'service_role', function_row.oid, 'EXECUTE'
       )
       or exists (
         select 1
         from pg_catalog.aclexplode(coalesce(
           function_row.proacl,
           pg_catalog.acldefault('f', function_row.proowner)
         )) acl
         where acl.grantee = 0
           and acl.privilege_type = 'EXECUTE'
       ) then
      raise exception
        'RPC repair: ACL incompatible en %; no se modifica nada',
        target.signature;
    end if;

    select pg_catalog.count(*)::integer into unexpected_execute
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
      raise exception
        'RPC repair: EXECUTE adicional incompatible en %; no se modifica nada',
        target.signature;
    end if;
  end loop;
end;
$player_rpc_preconditions$;

do $required_publishable_helper$
declare
  helper_row pg_catalog.pg_proc%rowtype;
  helper_source text;
  unexpected_execute integer;
  blocked_status text;
  forbidden_finalized_status text;
begin
  select procedure.* into helper_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.is_player_match_publishable(text,text,timestamp with time zone)'
  );

  if helper_row.oid is null then
    raise exception
      'RPC repair: falta public.is_player_match_publishable(text,text,timestamptz); no se modifica ninguna RPC';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'is_player_match_publishable'
      and procedure.oid <> helper_row.oid
  ) then
    raise exception
      'RPC repair: existe una sobrecarga incompatible de public.is_player_match_publishable';
  end if;

  if helper_row.prokind <> 'f'
     or helper_row.proowner <> 'postgres'::regrole
     or helper_row.prolang <> (
       select language.oid
       from pg_catalog.pg_language language
       where language.lanname = 'plpgsql'
     )
     or helper_row.prorettype <> 'pg_catalog.bool'::regtype
     or helper_row.provolatile <> 's'
     or helper_row.prosecdef
     or helper_row.pronargs <> 3
     or helper_row.pronargdefaults <> 1
     or pg_catalog.pg_get_function_identity_arguments(helper_row.oid)
        <> 'p_status text, p_match_date text, p_reference_time timestamp with time zone'
     or helper_row.proconfig is distinct from
        array['search_path=pg_catalog']::text[] then
    raise exception
      'RPC repair: helper publishable desplegado con contrato incompatible; no se modifica ninguna RPC';
  end if;

  if pg_catalog.has_function_privilege('anon', helper_row.oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', helper_row.oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', helper_row.oid, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.aclexplode(coalesce(
         helper_row.proacl,
         pg_catalog.acldefault('f', helper_row.proowner)
       )) acl
       where acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception
      'RPC repair: ACL incompatible en el helper publishable; no se modifica ninguna RPC';
  end if;

  select pg_catalog.count(*)::integer into unexpected_execute
  from pg_catalog.aclexplode(coalesce(
    helper_row.proacl,
    pg_catalog.acldefault('f', helper_row.proowner)
  )) acl
  where acl.privilege_type = 'EXECUTE'
    and acl.grantee not in (0, helper_row.proowner);
  if unexpected_execute <> 0 then
    raise exception
      'RPC repair: helper publishable con EXECUTE adicional inesperado';
  end if;

  helper_source := helper_row.prosrc;
  foreach blocked_status in array array[
    'aplazado', 'postponed', 'suspendido', 'suspended',
    'cancelado', 'cancelled', 'canceled'
  ] loop
    if pg_catalog.strpos(helper_source, '''' || blocked_status || '''') = 0 then
      raise exception
        'RPC repair: helper sin veto para estado especial %', blocked_status;
    end if;
  end loop;

  foreach forbidden_finalized_status in array array[
    'finalizado', 'jugado', 'played', 'finished',
    'cerrado', 'closed', 'revisado', 'reviewed'
  ] loop
    if pg_catalog.strpos(
      helper_source, '''' || forbidden_finalized_status || ''''
    ) <> 0 then
      raise exception
        'RPC repair: helper aun exige estado positivo %',
        forbidden_finalized_status;
    end if;
  end loop;

  if pg_catalog.strpos(helper_source, 'Europe/Madrid') = 0
     or pg_catalog.strpos(helper_source, 'pg_catalog.statement_timestamp()') = 0
     or pg_catalog.strpos(helper_source, 'madrid_today > match_day') = 0
     or pg_catalog.strpos(helper_source, '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') = 0
     or pg_catalog.strpos(helper_source, 'invalid_datetime_format') = 0
     or pg_catalog.strpos(helper_source, 'datetime_field_overflow') = 0 then
    raise exception
      'RPC repair: helper sin fecha Madrid, dia posterior o cierre ante fecha invalida';
  end if;

  if not public.is_player_match_publishable(
       'Previa', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Finalizado', '2026-09-09', '2026-09-09 23:59:59+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Previa', '2026-09-08', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Aplazado', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Suspendido', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Cancelado', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     ) then
    raise exception
      'RPC repair: helper desplegado no supera los casos de fecha y estados bloqueados';
  end if;
end;
$required_publishable_helper$;

-- player_visible fue una compuerta manual con DEFAULT false. El contrato de
-- producto vigente publica automaticamente por fecha, asi que las cinco RPC
-- que aun lo usan conservan el resto del cuerpo y sustituyen solo ese
-- predicado por una base neutra. La columna permanece intacta en el esquema.
do $remove_player_visible_gate$
declare
  target regprocedure;
  function_row pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  legacy_gate_count integer;
  legacy_gate_pattern constant text :=
    'match_row[.]player_visible';
begin
  foreach target in array array[
    'public.get_my_player_matches()'::regprocedure,
    'public.get_my_player_analysis_overview(text,text)'::regprocedure,
    'public.get_my_player_analysis_live_stats(text,text,text)'::regprocedure,
    'public.get_my_player_production_actions(text,text)'::regprocedure,
    'public.get_my_player_match_history(text,text,integer,integer)'::regprocedure
  ] loop
    select procedure.* into function_row
    from pg_catalog.pg_proc procedure
    where procedure.oid = target;

    original_source := function_row.prosrc;
    select pg_catalog.count(*)::integer into legacy_gate_count
    from pg_catalog.regexp_matches(
      original_source,
      legacy_gate_pattern,
      'g'
    );

    if legacy_gate_count = 0 then
      if pg_catalog.strpos(original_source, 'player_visible') <> 0 then
        raise exception
          'RPC repair: estado ambiguo de player_visible en %',
          target;
      end if;
      continue;
    elsif legacy_gate_count <> 1 then
      raise exception
        'RPC repair: player_visible aparece de forma ambigua en % (encontrados=%)',
        target, legacy_gate_count;
    end if;

    transformed_source := pg_catalog.regexp_replace(
      original_source,
      legacy_gate_pattern,
      'true',
      'g'
    );
    if pg_catalog.strpos(transformed_source, 'player_visible') <> 0 then
      raise exception
        'RPC repair: player_visible no se retiro completamente de %',
        target;
    end if;

    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception
        'RPC repair: no se pudo aislar el cuerpo de % al retirar player_visible',
        target;
    end if;
    transformed_definition :=
      pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(
        original_definition,
        source_offset + pg_catalog.length(original_source)
      );
    execute transformed_definition;
  end loop;
end;
$remove_player_visible_gate$;

do $migrate_analysis_rpcs$
declare
  target regprocedure;
  function_row pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  helper_name_count integer;
  canonical_call_count integer;
  structural_call_count integer;
  legacy_condition_count integer;
  code_source text;
  legacy_finalized_pattern constant text := $legacy_analysis$pg_catalog[.]lower[[:space:]]*[(][[:space:]]*pg_catalog[.]btrim[[:space:]]*[(][[:space:]]*coalesce[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*''[[:space:]]*[)][[:space:]]*[)][[:space:]]*[)][[:space:]]+in[[:space:]]*[(][[:space:]]*'finalizado'[[:space:]]*,[[:space:]]*'jugado'[[:space:]]*,[[:space:]]*'played'[[:space:]]*,[[:space:]]*'finished'[[:space:]]*,[[:space:]]*'cerrado'[[:space:]]*,[[:space:]]*'closed'[[:space:]]*,[[:space:]]*'revisado'[[:space:]]*,[[:space:]]*'reviewed'[[:space:]]*[)]$legacy_analysis$;
  publishable_condition constant text :=
    'public.is_player_match_publishable(serialized.payload ->> ''status'', serialized.payload ->> ''date'')';
begin
  foreach target in array array[
    'public.get_my_player_analysis_overview(text,text)'::regprocedure,
    'public.get_my_player_analysis_live_stats(text,text,text)'::regprocedure,
    'public.get_my_player_production_actions(text,text)'::regprocedure,
    'public.get_my_player_match_history(text,text,integer,integer)'::regprocedure
  ] loop
    select procedure.* into function_row
    from pg_catalog.pg_proc procedure
    where procedure.oid = target;

    if function_row.oid is null or not function_row.prosecdef then
      raise exception 'RPC repair: RPC PLAYER ausente o sin SECURITY DEFINER: %', target;
    end if;

    original_source := function_row.prosrc;
    select pg_catalog.count(*)::integer into helper_name_count
    from pg_catalog.regexp_matches(
      original_source,
      'public[.]is_player_match_publishable[[:space:]]*[(]',
      'g'
    );
    select pg_catalog.count(*)::integer into canonical_call_count
    from pg_catalog.regexp_matches(
      original_source,
      $regex$public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'date'[[:space:]]*[)]$regex$,
      'g'
    );
    code_source := pg_catalog.regexp_replace(
      original_source,
      $quoted$'(?:''|[^'])*'$quoted$,
      '__literal__',
      'g'
    );
    code_source := pg_catalog.regexp_replace(
      code_source, '[/][*].*?[*][/]', ' ', 'gs'
    );
    code_source := pg_catalog.regexp_replace(
      code_source, E'--[^\n\r]*', ' ', 'g'
    );
    select pg_catalog.count(*)::integer into structural_call_count
    from pg_catalog.regexp_matches(
      code_source,
      'and[[:space:]]+public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*,[[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*[)]',
      'g'
    );

    if helper_name_count = 1
       and canonical_call_count = 1
       and structural_call_count = 1 then
      -- Ya migrada: la ejecucion repetida no altera el cuerpo ni el contrato.
      continue;
    elsif helper_name_count <> 0
          or canonical_call_count <> 0
          or structural_call_count <> 0 then
      raise exception
        'RPC repair: migracion parcial o llamada al helper ambigua en %',
        target;
    end if;

    select pg_catalog.count(*)::integer into legacy_condition_count
    from pg_catalog.regexp_matches(
      original_source,
      legacy_finalized_pattern,
      'g'
    );

    if legacy_condition_count <> 1 then
      raise exception 'RPC repair: condicion finalizada ausente o ambigua en %', target;
    end if;

    transformed_source := pg_catalog.regexp_replace(
      original_source,
      legacy_finalized_pattern,
      publishable_condition,
      'g'
    );
    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception 'RPC repair: no se pudo aislar el cuerpo de %', target;
    end if;
    transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
    execute transformed_definition;
  end loop;
end;
$migrate_analysis_rpcs$;

do $migrate_matches_rpc$
declare
  function_row pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  legacy_condition_count integer;
  helper_name_count integer;
  canonical_call_count integer;
  structural_call_count integer;
  code_source text;
  legacy_finalized_pattern constant text := $legacy_matches$pg_catalog[.]lower[[:space:]]*[(][[:space:]]*pg_catalog[.]btrim[[:space:]]*[(][[:space:]]*coalesce[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*''[[:space:]]*[)][[:space:]]*[)][[:space:]]*[)][[:space:]]+in[[:space:]]*[(][[:space:]]*'finalizado'[[:space:]]*,[[:space:]]*'jugado'[[:space:]]*,[[:space:]]*'played'[[:space:]]*,[[:space:]]*'finished'[[:space:]]*,[[:space:]]*'cerrado'[[:space:]]*,[[:space:]]*'closed'[[:space:]]*,[[:space:]]*'revisado'[[:space:]]*,[[:space:]]*'reviewed'[[:space:]]*[)]$legacy_matches$;
  publishable_condition constant text :=
    'public.is_player_match_publishable(match_json ->> ''status'', match_json ->> ''date'')';
begin
  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_matches()'::regprocedure;

  if function_row.oid is null or not function_row.prosecdef then
    raise exception 'RPC repair: get_my_player_matches ausente o sin SECURITY DEFINER';
  end if;

  original_source := function_row.prosrc;
  select pg_catalog.count(*)::integer into helper_name_count
  from pg_catalog.regexp_matches(
    original_source,
    'public[.]is_player_match_publishable[[:space:]]*[(]',
    'g'
  );
  select pg_catalog.count(*)::integer into canonical_call_count
  from pg_catalog.regexp_matches(
    original_source,
    $regex$public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*match_json[[:space:]]*->>[[:space:]]*'date'[[:space:]]*[)]$regex$,
    'g'
  );
  code_source := pg_catalog.regexp_replace(
    original_source,
    $quoted$'(?:''|[^'])*'$quoted$,
    '__literal__',
    'g'
  );
  code_source := pg_catalog.regexp_replace(
    code_source, '[/][*].*?[*][/]', ' ', 'gs'
  );
  code_source := pg_catalog.regexp_replace(
    code_source, E'--[^\n\r]*', ' ', 'g'
  );
  select pg_catalog.count(*)::integer into structural_call_count
  from pg_catalog.regexp_matches(
    code_source,
    'case[[:space:]]+when[[:space:]]+public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*,[[:space:]]*match_json[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*[)]',
    'g'
  );
  select pg_catalog.count(*)::integer into legacy_condition_count
  from pg_catalog.regexp_matches(
    original_source,
    legacy_finalized_pattern,
    'g'
  );

  if helper_name_count = 3
     and canonical_call_count = 3
     and structural_call_count = 3
     and legacy_condition_count = 0 then
    null;
  elsif helper_name_count <> 0
        or canonical_call_count <> 0
        or structural_call_count <> 0 then
    raise exception
      'RPC repair: llamadas canonicas ambiguas o fuera de CASE WHEN en get_my_player_matches (refs=%, canonicas=%, estructurales=%)',
      helper_name_count, canonical_call_count, structural_call_count;
  elsif legacy_condition_count = 3 then
    transformed_source := pg_catalog.regexp_replace(
      original_source,
      legacy_finalized_pattern,
      publishable_condition,
      'g'
    );
    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception 'RPC repair: no se pudo aislar get_my_player_matches';
    end if;
    transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
    execute transformed_definition;
  elsif legacy_condition_count = 0 then
    if pg_catalog.strpos(original_source, 'match_json ->> ''home_score'',') = 0
       or pg_catalog.strpos(original_source, 'match_json ->> ''away_score'',') = 0
       or pg_catalog.strpos(original_source, 'coalesce(public_timeline.events, ''[]''::jsonb)') = 0 then
      raise exception 'RPC repair: contrato inesperado en get_my_player_matches';
    end if;
    transformed_source := pg_catalog.replace(
      original_source,
      'match_json ->> ''home_score'',',
      'case when ' || publishable_condition || ' then match_json ->> ''home_score'' else null end,'
    );
    transformed_source := pg_catalog.replace(
      transformed_source,
      'match_json ->> ''away_score'',',
      'case when ' || publishable_condition || ' then match_json ->> ''away_score'' else null end,'
    );
    transformed_source := pg_catalog.replace(
      transformed_source,
      'coalesce(public_timeline.events, ''[]''::jsonb)',
      'case when ' || publishable_condition || ' then coalesce(public_timeline.events, ''[]''::jsonb) else ''[]''::jsonb end'
    );
    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception 'RPC repair: no se pudo aislar get_my_player_matches';
    end if;
    transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
    execute transformed_definition;
  else
    raise exception
      'RPC repair: condiciones legacy ambiguas en get_my_player_matches (encontradas=%)',
      legacy_condition_count;
  end if;
end;
$migrate_matches_rpc$;

do $migrate_summary_rpc$
declare
  function_row pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  helper_name_count integer;
  canonical_call_count integer;
  structural_call_count integer;
  legacy_stats_count integer;
  legacy_goals_count integer;
  code_source text;
  legacy_stats_pattern constant text :=
    $legacy_stats$from[[:space:]]+public[.]partido_estadisticas_jugador[[:space:]]+stats[[:space:]]+where[[:space:]]+stats[.]jugador_id[[:space:]]*=[[:space:]]*own_jugador_id$legacy_stats$;
  guarded_stats_source constant text :=
    E'from public.partido_estadisticas_jugador stats\n'
    || E'    join public.partidos match_row on match_row.id = stats.partido_id\n'
    || E'    cross join lateral (select pg_catalog.to_jsonb(match_row) as match_json) serialized\n'
    || E'    where public.is_player_match_publishable(\n'
    || E'      match_json ->> ''status'', match_json ->> ''date''\n'
    || E'    )\n'
    || E'      and stats.jugador_id = own_jugador_id';
  legacy_goals_pattern constant text :=
    $legacy_goals$from[[:space:]]+public[.]partido_eventos_gol[[:space:]]+goal$legacy_goals$;
  guarded_goals_source constant text :=
    E'from public.partido_eventos_gol goal\n'
    || E'    join public.partidos match_row on match_row.id = goal.partido_id\n'
    || E'    cross join lateral (select pg_catalog.to_jsonb(match_row) as match_json) serialized\n'
    || E'    where public.is_player_match_publishable(\n'
    || E'      match_json ->> ''status'', match_json ->> ''date''\n'
    || E'    )';
begin
  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_analysis_summary()'::regprocedure;

  if function_row.oid is null or not function_row.prosecdef then
    raise exception
      'RPC repair: get_my_player_analysis_summary ausente o sin SECURITY DEFINER';
  end if;

  original_source := function_row.prosrc;
  select pg_catalog.count(*)::integer into helper_name_count
  from pg_catalog.regexp_matches(
    original_source,
    'public[.]is_player_match_publishable[[:space:]]*[(]',
    'g'
  );
  select pg_catalog.count(*)::integer into canonical_call_count
  from pg_catalog.regexp_matches(
    original_source,
    $regex$public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*match_json[[:space:]]*->>[[:space:]]*'date'[[:space:]]*[)]$regex$,
    'g'
  );
  code_source := pg_catalog.regexp_replace(
    original_source,
    $quoted$'(?:''|[^'])*'$quoted$,
    '__literal__',
    'g'
  );
  code_source := pg_catalog.regexp_replace(
    code_source, '[/][*].*?[*][/]', ' ', 'gs'
  );
  code_source := pg_catalog.regexp_replace(
    code_source, E'--[^\n\r]*', ' ', 'g'
  );
  select pg_catalog.count(*)::integer into structural_call_count
  from pg_catalog.regexp_matches(
    code_source,
    'where[[:space:]]+public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*,[[:space:]]*match_json[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*[)]',
      'g'
    );
  select pg_catalog.count(*)::integer into legacy_stats_count
  from pg_catalog.regexp_matches(original_source, legacy_stats_pattern, 'g');
  select pg_catalog.count(*)::integer into legacy_goals_count
  from pg_catalog.regexp_matches(original_source, legacy_goals_pattern, 'g');

  if helper_name_count = 2
     and canonical_call_count = 2
     and structural_call_count = 2 then
    null;
  elsif helper_name_count <> 0
        or canonical_call_count <> 0
        or structural_call_count <> 0 then
    raise exception
      'RPC repair: llamadas canonicas ambiguas o fuera del WHERE en get_my_player_analysis_summary (refs=%, canonicas=%, estructurales=%)',
      helper_name_count, canonical_call_count, structural_call_count;
  else
    if legacy_stats_count <> 1 or legacy_goals_count <> 1 then
      raise exception
        'RPC repair: cuerpo legado ambiguo en get_my_player_analysis_summary';
    end if;

    transformed_source := pg_catalog.regexp_replace(
      original_source, legacy_stats_pattern, guarded_stats_source, 'g'
    );
    transformed_source := pg_catalog.regexp_replace(
      transformed_source, legacy_goals_pattern, guarded_goals_source, 'g'
    );
    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception
        'RPC repair: no se pudo aislar get_my_player_analysis_summary';
    end if;
    transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(
        original_definition,
        source_offset + pg_catalog.length(original_source)
      );
    execute transformed_definition;
  end if;
end;
$migrate_summary_rpc$;

do $postconditions$
declare
  target regprocedure;
  contract record;
  function_row pg_catalog.pg_proc%rowtype;
  source text;
  code_source text;
  helper_name_count integer;
  canonical_call_count integer;
  structural_call_count integer;
  unexpected_execute integer;
  blocked_status text;
  forbidden_finalized_status text;
  legacy_analysis_pattern constant text := $post_analysis$pg_catalog[.]lower[[:space:]]*[(][[:space:]]*pg_catalog[.]btrim[[:space:]]*[(][[:space:]]*coalesce[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*''[[:space:]]*[)][[:space:]]*[)][[:space:]]*[)][[:space:]]+in[[:space:]]*[(][[:space:]]*'finalizado'[[:space:]]*,[[:space:]]*'jugado'[[:space:]]*,[[:space:]]*'played'[[:space:]]*,[[:space:]]*'finished'[[:space:]]*,[[:space:]]*'cerrado'[[:space:]]*,[[:space:]]*'closed'[[:space:]]*,[[:space:]]*'revisado'[[:space:]]*,[[:space:]]*'reviewed'[[:space:]]*[)]$post_analysis$;
  legacy_matches_pattern constant text := $post_matches$pg_catalog[.]lower[[:space:]]*[(][[:space:]]*pg_catalog[.]btrim[[:space:]]*[(][[:space:]]*coalesce[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*''[[:space:]]*[)][[:space:]]*[)][[:space:]]*[)][[:space:]]+in[[:space:]]*[(][[:space:]]*'finalizado'[[:space:]]*,[[:space:]]*'jugado'[[:space:]]*,[[:space:]]*'played'[[:space:]]*,[[:space:]]*'finished'[[:space:]]*,[[:space:]]*'cerrado'[[:space:]]*,[[:space:]]*'closed'[[:space:]]*,[[:space:]]*'revisado'[[:space:]]*,[[:space:]]*'reviewed'[[:space:]]*[)]$post_matches$;
begin
  -- CREATE OR REPLACE debe haber conservado contrato, propietario y ACL.
  for contract in
    select * from (values
      ('public.get_my_player_matches()', 0, 0, '',
       'TABLE(partido_id uuid, match_date text, opponent text, opponent_crest text, is_home boolean, home_team text, away_team text, home_score text, away_score text, stadium text, competition_key text, competition_name text, competition_logo_url text, match_round text, timeline jsonb)'),
      ('public.get_my_player_analysis_overview(text,text)', 2, 2,
       'p_competition_scope text, p_venue text',
       'TABLE(competition_scope text, venue text, match_records integer, matches_played integer, minutes integer, possible_minutes integer, minutes_per_match numeric, starts integer, bench_entries integer, participation_percentage numeric, goals integer, goals_coverage text, assists integer, assists_coverage text, goal_contributions integer, goal_contributions_coverage text, goals_per_90 numeric, assists_per_90 numeric, goal_contributions_per_90 numeric, yellow_cards integer, red_cards integer)'),
      ('public.get_my_player_analysis_live_stats(text,text,text)', 3, 3,
       'p_competition_scope text, p_venue text, p_window text',
       'TABLE(competition_scope text, venue text, "window" text, matches_with_events integer, event_count integer, goals integer, goals_per_match numeric, shots integer, shots_per_match numeric, shots_on_target integer, shots_on_target_per_match numeric, shot_accuracy_percentage numeric, crosses integer, crosses_per_match numeric, turnovers integer, turnovers_per_match numeric, steals integer, steals_per_match numeric, fouls_committed integer, fouls_committed_per_match numeric, fouls_received integer, fouls_received_per_match numeric)'),
      ('public.get_my_player_production_actions(text,text)', 2, 2,
       'p_competition_scope text, p_venue text',
       'TABLE(action_type text, minute integer, match_date date, opponent text, opponent_crest text, result text, competition_key text, competition_name text, venue text, phase text, subphase text, contact text, shot_zone_key text, shot_zone_name text, assist_zone_key text, assist_zone_name text, goal_zone_key text, goal_zone_name text, counterpart_role text, counterpart_name text, video_url text, video_available boolean)'),
      ('public.get_my_player_match_history(text,text,integer,integer)', 4, 4,
       'p_competition_scope text, p_venue text, p_limit integer, p_offset integer',
       'TABLE(match_date date, opponent text, opponent_crest text, result text, outcome text, competition_key text, competition_name text, competition_logo_url text, venue text, role text, minutes integer, goals integer, goals_coverage text, assists integer, assists_coverage text, yellow_cards integer, red_cards integer, has_allowed_video boolean)'),
      ('public.get_my_player_analysis_summary()', 0, 0, '',
       'TABLE(jugador_id uuid, matches bigint, minutes numeric, starts bigint, bench_entries bigint, goals bigint, goals_coverage text, assists bigint, assists_coverage text, yellow_cards numeric, red_cards bigint)')
    ) specifications(
      signature, input_count, default_count, expected_arguments, expected_result
    )
  loop
    select procedure.* into function_row
    from pg_catalog.pg_proc procedure
    where procedure.oid = pg_catalog.to_regprocedure(contract.signature);

    if function_row.oid is null
       or function_row.prokind <> 'f'
       or function_row.proowner <> 'postgres'::regrole
       or function_row.prolang <> (
         select language.oid
         from pg_catalog.pg_language language
         where language.lanname = 'plpgsql'
       )
       or not function_row.prosecdef
       or function_row.provolatile <> 's'
       or function_row.pronargs <> contract.input_count
       or function_row.pronargdefaults <> contract.default_count
       or pg_catalog.pg_get_function_identity_arguments(function_row.oid)
          <> contract.expected_arguments
       or pg_catalog.replace(
            pg_catalog.pg_get_function_result(function_row.oid), '"', ''
          ) <> pg_catalog.replace(contract.expected_result, '"', '')
       or function_row.proconfig is distinct from
          array['search_path=pg_catalog']::text[] then
      raise exception
        'RPC repair: postcondicion de contrato incorrecta en %',
        contract.signature;
    end if;

    if pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege(
         'authenticated', function_row.oid, 'EXECUTE'
       )
       or not pg_catalog.has_function_privilege(
         'service_role', function_row.oid, 'EXECUTE'
       )
       or exists (
         select 1
         from pg_catalog.aclexplode(coalesce(
           function_row.proacl,
           pg_catalog.acldefault('f', function_row.proowner)
         )) acl
         where acl.grantee = 0
           and acl.privilege_type = 'EXECUTE'
       ) then
      raise exception
        'RPC repair: postcondicion de ACL incorrecta en %',
        contract.signature;
    end if;

    select pg_catalog.count(*)::integer into unexpected_execute
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
      raise exception
        'RPC repair: postcondicion con EXECUTE adicional en %',
        contract.signature;
    end if;

    source := function_row.prosrc;
    code_source := pg_catalog.regexp_replace(
      source,
      $quoted$'(?:''|[^'])*'$quoted$,
      '__literal__',
      'g'
    );
    code_source := pg_catalog.regexp_replace(
      code_source, '[/][*].*?[*][/]', ' ', 'gs'
    );
    code_source := pg_catalog.regexp_replace(
      code_source, E'--[^\n\r]*', ' ', 'g'
    );
    if code_source ~* '(^|[^a-z0-9_])(where[[:space:]]+where|and[[:space:]]+and|or[[:space:]]+or|case[[:space:]]+case|then[[:space:]]+then)([^a-z0-9_]|$)' then
      raise exception
        'RPC repair: SQL final con palabra clave duplicada en %',
        contract.signature;
    end if;
  end loop;

  foreach target in array array[
    'public.get_my_player_analysis_overview(text,text)'::regprocedure,
    'public.get_my_player_analysis_live_stats(text,text,text)'::regprocedure,
    'public.get_my_player_production_actions(text,text)'::regprocedure,
    'public.get_my_player_match_history(text,text,integer,integer)'::regprocedure
  ] loop
    select procedure.prosrc into source from pg_catalog.pg_proc procedure where procedure.oid = target;
    select pg_catalog.count(*)::integer into helper_name_count
    from pg_catalog.regexp_matches(
      source,
      'public[.]is_player_match_publishable[[:space:]]*[(]',
      'g'
    );
    select pg_catalog.count(*)::integer into canonical_call_count
    from pg_catalog.regexp_matches(
      source,
      $regex$public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'date'[[:space:]]*[)]$regex$,
      'g'
    );
    code_source := pg_catalog.regexp_replace(
      source,
      $quoted$'(?:''|[^'])*'$quoted$,
      '__literal__',
      'g'
    );
    code_source := pg_catalog.regexp_replace(
      code_source, '[/][*].*?[*][/]', ' ', 'gs'
    );
    code_source := pg_catalog.regexp_replace(
      code_source, E'--[^\n\r]*', ' ', 'g'
    );
    select pg_catalog.count(*)::integer into structural_call_count
    from pg_catalog.regexp_matches(
      code_source,
      'and[[:space:]]+public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*,[[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*[)]',
      'g'
    );
    if helper_name_count <> 1
       or canonical_call_count <> 1
       or structural_call_count <> 1
       or source ~ legacy_analysis_pattern
       or pg_catalog.strpos(source, 'player_visible') <> 0
       or source !~ 'where[[:space:]]+true'
       or pg_catalog.strpos(source, 'auth.uid()') = 0
       or pg_catalog.strpos(source, 'public.current_membership()') = 0
       or pg_catalog.strpos(
         source, 'membership_role is distinct from ''player'''
       ) = 0
       or pg_catalog.strpos(source, 'public.current_jugador_id()') = 0
       or pg_catalog.strpos(source, 'public.is_player()') = 0
       or pg_catalog.strpos(source, 'supported_club_id') = 0
       or pg_catalog.strpos(source, 'own_jugador_id') = 0 then
      raise exception
        'RPC repair: gate canonico ausente, ambiguo o fuera del WHERE en %',
        target;
    end if;
  end loop;

  select procedure.prosrc into source
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_matches()'::regprocedure;
  select pg_catalog.count(*)::integer into helper_name_count
  from pg_catalog.regexp_matches(
    source,
    'public[.]is_player_match_publishable[[:space:]]*[(]',
    'g'
  );
  select pg_catalog.count(*)::integer into canonical_call_count
  from pg_catalog.regexp_matches(
    source,
    $regex$public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*match_json[[:space:]]*->>[[:space:]]*'date'[[:space:]]*[)]$regex$,
    'g'
  );
  code_source := pg_catalog.regexp_replace(
    source,
    $quoted$'(?:''|[^'])*'$quoted$,
    '__literal__',
    'g'
  );
  code_source := pg_catalog.regexp_replace(
    code_source, '[/][*].*?[*][/]', ' ', 'gs'
  );
  code_source := pg_catalog.regexp_replace(
    code_source, E'--[^\n\r]*', ' ', 'g'
  );
  select pg_catalog.count(*)::integer into structural_call_count
  from pg_catalog.regexp_matches(
    code_source,
    'case[[:space:]]+when[[:space:]]+public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*,[[:space:]]*match_json[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*[)]',
    'g'
  );
  if pg_catalog.strpos(source, 'then match_json ->> ''home_score'' else null end') = 0
     or pg_catalog.strpos(source, 'then match_json ->> ''away_score'' else null end') = 0
     or pg_catalog.strpos(source, 'else ''[]''::jsonb end') = 0
     or (
       pg_catalog.length(source)
       - pg_catalog.length(pg_catalog.replace(
         source, 'match_json ->> ''home_score''', ''
       ))
     ) / pg_catalog.length('match_json ->> ''home_score''') <> 1
     or (
       pg_catalog.length(source)
       - pg_catalog.length(pg_catalog.replace(
         source, 'match_json ->> ''away_score''', ''
       ))
     ) / pg_catalog.length('match_json ->> ''away_score''') <> 1
     or (
       pg_catalog.length(source)
       - pg_catalog.length(pg_catalog.replace(
         source, 'coalesce(public_timeline.events, ''[]''::jsonb)', ''
       ))
     ) / pg_catalog.length(
       'coalesce(public_timeline.events, ''[]''::jsonb)'
     ) <> 1
     or helper_name_count <> 3
     or canonical_call_count <> 3
     or structural_call_count <> 3
     or source ~ legacy_matches_pattern
     or pg_catalog.strpos(source, 'player_visible') <> 0
     or source !~ 'public_timeline[[:space:]]+on[[:space:]]+true[[:space:]]+where[[:space:]]+true[[:space:]]+order[[:space:]]+by[[:space:]]+match_json[[:space:]]*->>[[:space:]]*''date''[[:space:]]+desc[[:space:]]*,[[:space:]]*match_row[.]id'
     or pg_catalog.strpos(source, 'public.current_membership()') = 0
     or pg_catalog.strpos(source, 'membership_role <> ''player''') = 0
     or pg_catalog.strpos(source, 'membership_jugador_id') = 0
     or pg_catalog.strpos(source, 'public.is_player()') = 0
     or pg_catalog.strpos(source, 'supported_club_id') = 0 then
    raise exception 'RPC repair: partidos PLAYER no quedaron sanitizados';
  end if;

  select procedure.prosrc into source
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_analysis_summary()'::regprocedure;
  select pg_catalog.count(*)::integer into helper_name_count
  from pg_catalog.regexp_matches(
    source,
    'public[.]is_player_match_publishable[[:space:]]*[(]',
    'g'
  );
  select pg_catalog.count(*)::integer into canonical_call_count
  from pg_catalog.regexp_matches(
    source,
    $regex$public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*match_json[[:space:]]*->>[[:space:]]*'date'[[:space:]]*[)]$regex$,
    'g'
  );
  code_source := pg_catalog.regexp_replace(
    source,
    $quoted$'(?:''|[^'])*'$quoted$,
    '__literal__',
    'g'
  );
  code_source := pg_catalog.regexp_replace(
    code_source, '[/][*].*?[*][/]', ' ', 'gs'
  );
  code_source := pg_catalog.regexp_replace(
    code_source, E'--[^\n\r]*', ' ', 'g'
  );
  select pg_catalog.count(*)::integer into structural_call_count
  from pg_catalog.regexp_matches(
    code_source,
    'where[[:space:]]+public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*match_json[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*,[[:space:]]*match_json[[:space:]]*->>[[:space:]]*__literal__[[:space:]]*[)]',
    'g'
  );
  if helper_name_count <> 2
     or canonical_call_count <> 2
     or structural_call_count <> 2
     or pg_catalog.strpos(source, 'public.current_membership()') = 0
     or pg_catalog.strpos(source, 'membership_role <> ''player''') = 0
     or pg_catalog.strpos(source, 'public.current_jugador_id()') = 0
     or pg_catalog.strpos(source, 'public.is_player()') = 0
     or pg_catalog.strpos(source, 'supported_club_id') = 0
     or pg_catalog.strpos(source, 'own_jugador_id') = 0 then
    raise exception 'RPC repair: resumen PLAYER antiguo no quedo protegido';
  end if;

  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.is_player_match_publishable(text,text,timestamp with time zone)'
  );
  if function_row.oid is null
     or function_row.prokind <> 'f'
     or function_row.proowner <> 'postgres'::regrole
     or function_row.prorettype <> 'pg_catalog.bool'::regtype
     or function_row.prosecdef
     or function_row.provolatile <> 's'
     or function_row.pronargs <> 3
     or function_row.pronargdefaults <> 1
     or pg_catalog.pg_get_function_identity_arguments(function_row.oid)
        <> 'p_status text, p_match_date text, p_reference_time timestamp with time zone'
     or function_row.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc procedure
       join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname = 'public'
         and procedure.proname = 'is_player_match_publishable'
         and procedure.oid <> function_row.oid
     ) then
    raise exception 'RPC repair: helper publishable inseguro o incompatible';
  end if;

  select pg_catalog.count(*)::integer into unexpected_execute
  from pg_catalog.aclexplode(coalesce(
    function_row.proacl,
    pg_catalog.acldefault('f', function_row.proowner)
  )) acl
  where acl.privilege_type = 'EXECUTE'
    and acl.grantee not in (0, function_row.proowner);
  if unexpected_execute <> 0 then
    raise exception 'RPC repair: helper con EXECUTE adicional inesperado';
  end if;

  source := function_row.prosrc;
  foreach blocked_status in array array[
    'aplazado', 'postponed', 'suspendido', 'suspended',
    'cancelado', 'cancelled', 'canceled'
  ] loop
    if pg_catalog.strpos(source, '''' || blocked_status || '''') = 0 then
      raise exception
        'RPC repair: helper sin veto para estado especial %',
        blocked_status;
    end if;
  end loop;
  foreach forbidden_finalized_status in array array[
    'finalizado', 'jugado', 'played', 'finished',
    'cerrado', 'closed', 'revisado', 'reviewed'
  ] loop
    if pg_catalog.strpos(
      source, '''' || forbidden_finalized_status || ''''
    ) <> 0 then
      raise exception
        'RPC repair: helper aun exige estado finalizado %',
        forbidden_finalized_status;
    end if;
  end loop;
  if pg_catalog.strpos(source, 'Europe/Madrid') = 0
     or pg_catalog.strpos(source, 'pg_catalog.statement_timestamp()') = 0
     or pg_catalog.strpos(source, 'madrid_today > match_day') = 0
     or pg_catalog.strpos(source, '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') = 0
     or pg_catalog.strpos(source, 'invalid_datetime_format') = 0
     or pg_catalog.strpos(source, 'datetime_field_overflow') = 0 then
    raise exception
      'RPC repair: helper sin fecha Madrid, comparacion posterior o cierre ante fecha invalida';
  end if;

  if not public.is_player_match_publishable(
       'Previa', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Finalizado', '2026-09-09', '2026-09-09 23:59:59+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Previa', '2026-09-08', '2026-09-07 10:00:00+02'::timestamptz
     )
     or not public.is_player_match_publishable(
       'Finalizado', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     )
     or not public.is_player_match_publishable(
       'Previa', '2026-08-23', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Previa', null, '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Previa', 'NO_ES_FECHA', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Previa', '2026-99-99', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Previa', '2026-09-09', '2026-09-09 21:59:59+00'::timestamptz
     )
     or not public.is_player_match_publishable(
       'Previa', '2026-09-09', '2026-09-09 22:00:00+00'::timestamptz
     )
     or public.is_player_match_publishable(
       'Aplazado', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Suspendido', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Cancelado', '2026-09-06', '2026-09-07 10:00:00+02'::timestamptz
     ) then
    raise exception
      'RPC repair: casos fecha A-I, medianoche Madrid o estados especiales incorrectos';
  end if;

end;
$postconditions$;

commit;
