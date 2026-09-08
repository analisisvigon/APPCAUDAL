-- APPCAUDAL - PLAYER match stats: alineacion con el publication gate canonico.
-- Corrige solo el cuerpo de get_my_player_analysis_match_stats. No toca tablas,
-- RLS, policies, ACL, firmas ni las RPC PLAYER existentes.

begin;

do $publication_fix$
declare
  target_signature constant text :=
    'public.get_my_player_analysis_match_stats(text,text,text)';
  function_row pg_catalog.pg_proc%rowtype;
  helper_row pg_catalog.pg_proc%rowtype;
  live_row pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  player_visible_count integer;
  legacy_status_count integer;
  helper_name_count integer;
  canonical_call_count integer;
  unexpected_execute integer;
  legacy_player_visible_pattern constant text :=
    'where[[:space:]]+match_row[.]player_visible';
  legacy_status_pattern constant text :=
    $legacy$pg_catalog[.]lower[[:space:]]*[(][[:space:]]*pg_catalog[.]btrim[[:space:]]*[(][[:space:]]*coalesce[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*''[[:space:]]*[)][[:space:]]*[)][[:space:]]*[)][[:space:]]+in[[:space:]]*[(][[:space:]]*'finalizado'[[:space:]]*,[[:space:]]*'jugado'[[:space:]]*,[[:space:]]*'played'[[:space:]]*,[[:space:]]*'finished'[[:space:]]*,[[:space:]]*'cerrado'[[:space:]]*,[[:space:]]*'closed'[[:space:]]*,[[:space:]]*'revisado'[[:space:]]*,[[:space:]]*'reviewed'[[:space:]]*[)]$legacy$;
  canonical_condition constant text :=
    'public.is_player_match_publishable(serialized.payload ->> ''status'', serialized.payload ->> ''date'')';
  expected_result constant text :=
    'TABLE(match_id uuid, match_date date, opponent text, opponent_crest text, competition_key text, competition_name text, is_home boolean, minutes integer, event_count integer, goals integer, shots integer, shots_on_target integer, shot_accuracy_percentage numeric, crosses integer, turnovers integer, steals integer, fouls_committed integer, fouls_received integer)';
begin
  if auth.uid() is not null then
    raise exception 'Club Core 27 debe ejecutarse sin una identidad JWT activa';
  end if;

  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(target_signature);

  if function_row.oid is null then
    raise exception 'Club Core 27: falta %; aplicar primero Club Core 26',
      target_signature;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'get_my_player_analysis_match_stats'
      and procedure.oid <> function_row.oid
  ) then
    raise exception
      'Club Core 27: existe una sobrecarga incompatible de get_my_player_analysis_match_stats';
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
     or function_row.pronargs <> 3
     or function_row.pronargdefaults <> 3
     or pg_catalog.pg_get_function_identity_arguments(function_row.oid)
        <> 'p_competition_scope text, p_venue text, p_window text'
     or pg_catalog.replace(
          pg_catalog.pg_get_function_result(function_row.oid), '"', ''
        ) <> expected_result
     or function_row.proconfig is distinct from
        array['search_path=pg_catalog']::text[] then
    raise exception
      'Club Core 27: contrato incompatible en %; no se modifica nada',
      target_signature;
  end if;

  if pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated', function_row.oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', function_row.oid, 'EXECUTE'
     ) then
    raise exception 'Club Core 27: ACL incompatible en %', target_signature;
  end if;

  select pg_catalog.count(*)::integer into unexpected_execute
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
    raise exception 'Club Core 27: EXECUTE adicional incompatible en %',
      target_signature;
  end if;

  select procedure.* into helper_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.is_player_match_publishable(text,text,timestamp with time zone)'
  );

  if helper_row.oid is null
     or helper_row.prokind <> 'f'
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
      'Club Core 27: falta el publication gate canonico con su contrato exacto';
  end if;

  select procedure.* into live_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_live_stats(text,text,text)'
  );

  if live_row.oid is null
     or pg_catalog.strpos(
       live_row.prosrc,
       canonical_condition
     ) = 0
     or pg_catalog.strpos(live_row.prosrc, 'player_visible') <> 0 then
    raise exception
      'Club Core 27: live_stats no usa el publication gate final esperado';
  end if;

  original_source := function_row.prosrc;

  select pg_catalog.count(*)::integer into player_visible_count
  from pg_catalog.regexp_matches(
    original_source, legacy_player_visible_pattern, 'g'
  );
  select pg_catalog.count(*)::integer into legacy_status_count
  from pg_catalog.regexp_matches(original_source, legacy_status_pattern, 'g');
  select pg_catalog.count(*)::integer into helper_name_count
  from pg_catalog.regexp_matches(
    original_source,
    'public[.]is_player_match_publishable[[:space:]]*[(]',
    'g'
  );
  select pg_catalog.count(*)::integer into canonical_call_count
  from pg_catalog.regexp_matches(
    original_source,
    $canonical$public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'date'[[:space:]]*[)]$canonical$,
    'g'
  );

  if player_visible_count = 0
     and legacy_status_count = 0
     and helper_name_count = 1
     and canonical_call_count = 1 then
    -- Ya corregida: segunda ejecucion sin cambios.
    null;
  elsif player_visible_count = 1
        and legacy_status_count = 1
        and helper_name_count = 0
        and canonical_call_count = 0 then
    transformed_source := pg_catalog.regexp_replace(
      original_source,
      legacy_player_visible_pattern,
      'where true',
      'g'
    );
    transformed_source := pg_catalog.regexp_replace(
      transformed_source,
      legacy_status_pattern,
      canonical_condition,
      'g'
    );

    if pg_catalog.strpos(transformed_source, 'player_visible') <> 0 then
      raise exception 'Club Core 27: player_visible no se retiro completamente';
    end if;

    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception 'Club Core 27: no se pudo aislar el cuerpo de la RPC';
    end if;

    transformed_definition :=
      pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(
        original_definition,
        source_offset + pg_catalog.length(original_source)
      );
    execute transformed_definition;
  else
    raise exception
      'Club Core 27: publication gate legacy/canonico ambiguo (player_visible=%, legacy_status=%, helper=%, canonical=%)',
      player_visible_count, legacy_status_count,
      helper_name_count, canonical_call_count;
  end if;
end;
$publication_fix$;

do $postconditions$
declare
  function_row pg_catalog.pg_proc%rowtype;
  live_row pg_catalog.pg_proc%rowtype;
  canonical_condition constant text :=
    'public.is_player_match_publishable(serialized.payload ->> ''status'', serialized.payload ->> ''date'')';
  legacy_status_pattern constant text :=
    $legacy$pg_catalog[.]lower[[:space:]]*[(][[:space:]]*pg_catalog[.]btrim[[:space:]]*[(][[:space:]]*coalesce[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*''[[:space:]]*[)][[:space:]]*[)][[:space:]]*[)][[:space:]]+in[[:space:]]*[(][[:space:]]*'finalizado'[[:space:]]*,[[:space:]]*'jugado'[[:space:]]*,[[:space:]]*'played'[[:space:]]*,[[:space:]]*'finished'[[:space:]]*,[[:space:]]*'cerrado'[[:space:]]*,[[:space:]]*'closed'[[:space:]]*,[[:space:]]*'revisado'[[:space:]]*,[[:space:]]*'reviewed'[[:space:]]*[)]$legacy$;
  helper_count integer;
  legacy_count integer;
begin
  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  );
  select procedure.* into live_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_live_stats(text,text,text)'
  );

  select pg_catalog.count(*)::integer into helper_count
  from pg_catalog.regexp_matches(
    function_row.prosrc,
    'public[.]is_player_match_publishable[[:space:]]*[(]',
    'g'
  );
  select pg_catalog.count(*)::integer into legacy_count
  from pg_catalog.regexp_matches(function_row.prosrc, legacy_status_pattern, 'g');

  if function_row.oid is null
     or function_row.proowner <> 'postgres'::regrole
     or not function_row.prosecdef
     or function_row.provolatile <> 's'
     or function_row.proconfig is distinct from
        array['search_path=pg_catalog']::text[]
     or helper_count <> 1
     or pg_catalog.strpos(function_row.prosrc, canonical_condition) = 0
     or pg_catalog.strpos(function_row.prosrc, 'player_visible') <> 0
     or legacy_count <> 0
     or pg_catalog.strpos(
       function_row.prosrc,
       'match_row.delegated_data_status = ''Validado'''
     ) = 0
     or pg_catalog.strpos(function_row.prosrc, 'event.reviewed is true') = 0
     or pg_catalog.strpos(live_row.prosrc, canonical_condition) = 0 then
    raise exception
      'Club Core 27: la definicion final no conserva el gate canonico y los filtros requeridos';
  end if;

  if pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated', function_row.oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', function_row.oid, 'EXECUTE'
     ) then
    raise exception 'Club Core 27: la ACL cambio durante el reemplazo';
  end if;
end;
$postconditions$;

commit;
