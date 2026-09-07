-- APPCAUDAL - Publicacion PLAYER solo tras cierre oficial y cambio de dia en Espana
-- No crea tablas, columnas ni politicas. Ajusta exclusivamente los cuerpos de
-- RPC PLAYER existentes y conserva sus firmas, propietarios y ACL. El helper
-- central queda sin EXECUTE para roles de API.

begin;

do $match_calendar_precondition$
declare
  date_type oid;
  date_type_name text;
begin
  if pg_catalog.to_regclass('public.partidos') is null then
    raise exception 'Publication gate: falta public.partidos';
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
      'Publication gate: public.partidos.date debe ser fecha de calendario compatible (tipo=%)',
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
    raise exception 'Publication gate: falta public.partidos.status';
  end if;
end;
$match_calendar_precondition$;

do $publishable_helper_precondition$
declare
  helper_row pg_catalog.pg_proc%rowtype;
begin
  select procedure.* into helper_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.is_player_match_publishable(text,text,timestamp with time zone)'
  );

  if helper_row.oid is null and exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'is_player_match_publishable'
  ) then
    raise exception
      'Publication gate: existe public.is_player_match_publishable con firma incompatible';
  end if;

  if helper_row.oid is not null
     and (
       helper_row.prokind <> 'f'
       or helper_row.prorettype <> 'pg_catalog.bool'::regtype
       or helper_row.provolatile <> 's'
       or helper_row.prosecdef
       or helper_row.pronargs <> 3
       or helper_row.pronargdefaults <> 1
       or pg_catalog.pg_get_function_identity_arguments(helper_row.oid)
          <> 'p_status text, p_match_date text, p_reference_time timestamp with time zone'
       or helper_row.proconfig is distinct from array['search_path=pg_catalog']::text[]
     ) then
    raise exception
      'Publication gate: contrato incompatible en public.is_player_match_publishable(text,text,timestamptz)';
  end if;
end;
$publishable_helper_precondition$;

create or replace function public.is_player_match_publishable(
  p_status text,
  p_match_date text,
  p_reference_time timestamp with time zone default null
)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  match_day date;
  madrid_today date;
begin
  if pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, ''))) not in
    ('finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed')
  then
    return false;
  end if;

  if pg_catalog.btrim(coalesce(p_match_date, '')) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  begin
    match_day := pg_catalog.btrim(p_match_date)::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      return false;
  end;

  madrid_today := (
    coalesce(p_reference_time, pg_catalog.statement_timestamp()) at time zone 'Europe/Madrid'
  )::date;

  return madrid_today > match_day;
end;
$function$;

alter function public.is_player_match_publishable(text,text,timestamp with time zone)
  owner to postgres;
revoke all on function public.is_player_match_publishable(text,text,timestamp with time zone)
  from public, anon, authenticated, service_role;

do $publication_gate$
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
  legacy_finalized_condition constant text := E'pg_catalog.lower(pg_catalog.btrim(coalesce(serialized.payload ->> ''status'', ''''))) in\n        (''finalizado'', ''jugado'', ''played'', ''finished'', ''cerrado'', ''closed'', ''revisado'', ''reviewed'')';
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
      raise exception 'Publication gate: RPC PLAYER ausente o sin SECURITY DEFINER: %', target;
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
      continue;
    end if;

    if helper_name_count <> 0
       or canonical_call_count <> 0
       or structural_call_count <> 0 then
      raise exception
        'Publication gate: llamada canonica al helper ausente, ambigua o fuera del WHERE en %',
        target;
    end if;

    legacy_condition_count := (
        pg_catalog.length(original_source)
        - pg_catalog.length(pg_catalog.replace(original_source, legacy_finalized_condition, ''))
      ) / pg_catalog.length(legacy_finalized_condition);

    if legacy_condition_count <> 1 then
      raise exception 'Publication gate: condicion finalizada ausente o ambigua en %', target;
    end if;

    transformed_source := pg_catalog.replace(
      original_source,
      legacy_finalized_condition,
      publishable_condition
    );
    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception 'Publication gate: no se pudo aislar el cuerpo de %', target;
    end if;
    transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
    execute transformed_definition;
  end loop;
end;
$publication_gate$;

do $matches_gate$
declare
  function_row pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  legacy_compact_count integer;
  legacy_expanded_count integer;
  helper_name_count integer;
  canonical_call_count integer;
  structural_call_count integer;
  code_source text;
  legacy_compact_condition constant text := 'pg_catalog.lower(pg_catalog.btrim(coalesce(match_json ->> ''status'', ''''))) in (''finalizado'', ''jugado'', ''played'', ''finished'', ''cerrado'', ''closed'', ''revisado'', ''reviewed'')';
  legacy_expanded_condition constant text := E'pg_catalog.lower(pg_catalog.btrim(coalesce(match_json ->> ''status'', ''''))) in\n      (''finalizado'', ''jugado'', ''played'', ''finished'', ''cerrado'', ''closed'', ''revisado'', ''reviewed'')';
  publishable_condition constant text :=
    'public.is_player_match_publishable(match_json ->> ''status'', match_json ->> ''date'')';
begin
  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_matches()'::regprocedure;

  if function_row.oid is null or not function_row.prosecdef then
    raise exception 'Publication gate: get_my_player_matches ausente o sin SECURITY DEFINER';
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
  legacy_compact_count := (
    pg_catalog.length(original_source)
    - pg_catalog.length(pg_catalog.replace(original_source, legacy_compact_condition, ''))
  ) / pg_catalog.length(legacy_compact_condition);
  legacy_expanded_count := (
    pg_catalog.length(original_source)
    - pg_catalog.length(pg_catalog.replace(original_source, legacy_expanded_condition, ''))
  ) / pg_catalog.length(legacy_expanded_condition);

  if helper_name_count = 3
     and canonical_call_count = 3
     and structural_call_count = 3
     and legacy_compact_count = 0
     and legacy_expanded_count = 0 then
    null;
  elsif helper_name_count <> 0
        or canonical_call_count <> 0
        or structural_call_count <> 0 then
    raise exception
      'Publication gate: llamadas canonicas ambiguas o fuera de CASE WHEN en get_my_player_matches (refs=%, canonicas=%, estructurales=%)',
      helper_name_count, canonical_call_count, structural_call_count;
  elsif legacy_compact_count + legacy_expanded_count = 3 then
    transformed_source := pg_catalog.replace(
      original_source,
      legacy_compact_condition,
      publishable_condition
    );
    transformed_source := pg_catalog.replace(
      transformed_source,
      legacy_expanded_condition,
      publishable_condition
    );
    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception 'Publication gate: no se pudo aislar get_my_player_matches';
    end if;
    transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
    execute transformed_definition;
  elsif legacy_compact_count = 0 and legacy_expanded_count = 0 then
    if pg_catalog.strpos(original_source, 'match_json ->> ''home_score'',') = 0
       or pg_catalog.strpos(original_source, 'match_json ->> ''away_score'',') = 0
       or pg_catalog.strpos(original_source, 'coalesce(public_timeline.events, ''[]''::jsonb)') = 0 then
      raise exception 'Publication gate: contrato inesperado en get_my_player_matches';
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
      raise exception 'Publication gate: no se pudo aislar get_my_player_matches';
    end if;
    transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
    execute transformed_definition;
  else
    raise exception
      'Publication gate: condiciones legacy ambiguas en get_my_player_matches (compactas=%, expandidas=%)',
      legacy_compact_count, legacy_expanded_count;
  end if;
end;
$matches_gate$;

do $legacy_summary_gate$
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
  code_source text;
  legacy_stats_source constant text :=
    E'from public.partido_estadisticas_jugador stats\n    where stats.jugador_id = own_jugador_id';
  guarded_stats_source constant text :=
    E'from public.partido_estadisticas_jugador stats\n'
    || E'    join public.partidos match_row on match_row.id = stats.partido_id\n'
    || E'    cross join lateral (select pg_catalog.to_jsonb(match_row) as match_json) serialized\n'
    || E'    where public.is_player_match_publishable(\n'
    || E'      match_json ->> ''status'', match_json ->> ''date''\n'
    || E'    )\n'
    || E'      and stats.jugador_id = own_jugador_id';
  legacy_goals_source constant text :=
    'from public.partido_eventos_gol goal';
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
      'Publication gate: get_my_player_analysis_summary ausente o sin SECURITY DEFINER';
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

  if helper_name_count = 2
     and canonical_call_count = 2
     and structural_call_count = 2 then
    null;
  elsif helper_name_count <> 0
        or canonical_call_count <> 0
        or structural_call_count <> 0 then
    raise exception
      'Publication gate: llamadas canonicas ambiguas o fuera del WHERE en get_my_player_analysis_summary (refs=%, canonicas=%, estructurales=%)',
      helper_name_count, canonical_call_count, structural_call_count;
  else
    if (
      pg_catalog.length(original_source)
      - pg_catalog.length(pg_catalog.replace(original_source, legacy_stats_source, ''))
    ) / pg_catalog.length(legacy_stats_source) <> 1
       or (
         pg_catalog.length(original_source)
         - pg_catalog.length(pg_catalog.replace(original_source, legacy_goals_source, ''))
       ) / pg_catalog.length(legacy_goals_source) <> 1 then
      raise exception
        'Publication gate: cuerpo legado ambiguo en get_my_player_analysis_summary';
    end if;

    transformed_source := pg_catalog.replace(
      original_source, legacy_stats_source, guarded_stats_source
    );
    transformed_source := pg_catalog.replace(
      transformed_source, legacy_goals_source, guarded_goals_source
    );
    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception
        'Publication gate: no se pudo aislar get_my_player_analysis_summary';
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
$legacy_summary_gate$;

do $planned_minutes$
declare
  function_row pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  placeholder_count integer;
begin
  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.save_match_squad_lineup_atomic(uuid,text,jsonb,jsonb)'::regprocedure;

  if function_row.oid is null or function_row.prosecdef then
    raise exception 'Publication gate: save_match_squad_lineup_atomic ausente o contrato SECURITY INVOKER inesperado';
  end if;

  original_source := function_row.prosrc;
  placeholder_count := (
    pg_catalog.length(original_source)
    - pg_catalog.length(pg_catalog.replace(original_source, 'then ''90''', ''))
  ) / pg_catalog.length('then ''90''');
  if placeholder_count not in (0, 4) then
    raise exception 'Publication gate: placeholders de minutos inesperados (%)', placeholder_count;
  end if;
  if placeholder_count = 4 then
    transformed_source := pg_catalog.replace(original_source, 'then ''90''', 'then ''''');
    original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
    source_offset := pg_catalog.strpos(original_definition, original_source);
    if source_offset = 0 then
      raise exception 'Publication gate: no se pudo aislar save_match_squad_lineup_atomic';
    end if;
    transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
      || transformed_source
      || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
    execute transformed_definition;
  end if;
end;
$planned_minutes$;

do $postconditions$
declare
  target regprocedure;
  function_row pg_catalog.pg_proc%rowtype;
  source text;
  code_source text;
  helper_name_count integer;
  canonical_call_count integer;
  structural_call_count integer;
  required_status text;
begin
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
       or structural_call_count <> 1 then
      raise exception
        'Publication gate: gate canonico ausente, ambiguo o fuera del WHERE en %',
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
     or pg_catalog.strpos(source, 'else ''[]''::jsonb end') = 0
     or helper_name_count <> 3
     or canonical_call_count <> 3
     or structural_call_count <> 3 then
    raise exception 'Publication gate: partidos PLAYER no quedaron sanitizados';
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
     or structural_call_count <> 2 then
    raise exception 'Publication gate: resumen PLAYER antiguo no quedo protegido';
  end if;

  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.is_player_match_publishable(text,text,timestamp with time zone)'
  );
  if function_row.oid is null
     or function_row.proowner <> 'postgres'::regrole
     or function_row.prorettype <> 'pg_catalog.bool'::regtype
     or function_row.prosecdef
     or function_row.provolatile <> 's'
     or function_row.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE') then
    raise exception 'Publication gate: helper publishable inseguro o incompatible';
  end if;

  source := function_row.prosrc;
  foreach required_status in array array[
    'finalizado', 'jugado', 'played', 'finished',
    'cerrado', 'closed', 'revisado', 'reviewed'
  ] loop
    if pg_catalog.strpos(source, '''' || required_status || '''') = 0 then
      raise exception
        'Publication gate: helper sin estado finalizado requerido %',
        required_status;
    end if;
  end loop;
  if pg_catalog.strpos(source, 'Europe/Madrid') = 0
     or pg_catalog.strpos(source, 'pg_catalog.statement_timestamp()') = 0
     or pg_catalog.strpos(source, 'madrid_today > match_day') = 0
     or pg_catalog.strpos(source, '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') = 0
     or pg_catalog.strpos(source, 'invalid_datetime_format') = 0
     or pg_catalog.strpos(source, 'datetime_field_overflow') = 0 then
    raise exception
      'Publication gate: helper sin fecha Madrid, comparacion posterior o cierre ante fecha invalida';
  end if;

  if public.is_player_match_publishable(
       'Previa', '2026-09-09', '2026-09-10 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Finalizado', '2026-09-09', '2026-09-09 23:59:59+02'::timestamptz
     )
     or not public.is_player_match_publishable(
       'Finalizado', '2026-09-09', '2026-09-10 00:00:00+02'::timestamptz
     )
     or not public.is_player_match_publishable(
       'Revisado', '2026-09-09', '2026-09-10 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Finalizado', '2026-09-12', '2026-09-10 10:00:00+02'::timestamptz
     )
     or not public.is_player_match_publishable(
       'Finalizado', '2025-05-01', '2026-09-10 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Finalizado', '2026-09-09', '2026-09-09 21:59:59+00'::timestamptz
     )
     or not public.is_player_match_publishable(
       'Finalizado', '2026-09-09', '2026-09-09 22:00:00+00'::timestamptz
     )
     or public.is_player_match_publishable(
       'Finalizado', null, '2026-09-10 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Finalizado', 'NO_ES_FECHA', '2026-09-10 10:00:00+02'::timestamptz
     )
     or public.is_player_match_publishable(
       'Finalizado', '2026-99-99', '2026-09-10 10:00:00+02'::timestamptz
     ) then
    raise exception 'Publication gate: casos calendario A-E o medianoche Madrid incorrectos';
  end if;

  select procedure.prosrc into source
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.save_match_squad_lineup_atomic(uuid,text,jsonb,jsonb)'::regprocedure;
  if pg_catalog.strpos(source, 'then ''90''') <> 0 then
    raise exception 'Publication gate: el XI planificado sigue creando minutos oficiales';
  end if;
end;
$postconditions$;

commit;
