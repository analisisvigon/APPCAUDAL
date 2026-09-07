-- APPCAUDAL - Publicacion de participacion PLAYER solo tras cierre oficial
-- No crea tablas, columnas, politicas ni permisos. Ajusta exclusivamente los
-- cuerpos de RPC existentes y conserva sus firmas, propietarios y ACL.

begin;

do $publication_gate$
declare
  target regprocedure;
  function_row pg_catalog.pg_proc%rowtype;
  original_source text;
  transformed_source text;
  original_definition text;
  transformed_definition text;
  source_offset integer;
  old_predicate constant text := 'where true';
  finalized_predicate constant text := E'where true\n      and pg_catalog.lower(pg_catalog.btrim(coalesce(serialized.payload ->> ''status'', ''''))) in\n        (''finalizado'', ''jugado'', ''played'', ''finished'', ''cerrado'', ''closed'', ''revisado'', ''reviewed'')';
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
    if pg_catalog.strpos(original_source, 'serialized.payload ->> ''status''') = 0 then
      if (
        pg_catalog.length(original_source)
        - pg_catalog.length(pg_catalog.replace(original_source, old_predicate, ''))
      ) / pg_catalog.length(old_predicate) <> 1 then
        raise exception 'Publication gate: predicado base ambiguo en %', target;
      end if;
      transformed_source := pg_catalog.replace(original_source, old_predicate, finalized_predicate);
      original_definition := pg_catalog.pg_get_functiondef(function_row.oid);
      source_offset := pg_catalog.strpos(original_definition, original_source);
      if source_offset = 0 then
        raise exception 'Publication gate: no se pudo aislar el cuerpo de %', target;
      end if;
      transformed_definition := pg_catalog.substr(original_definition, 1, source_offset - 1)
        || transformed_source
        || pg_catalog.substr(original_definition, source_offset + pg_catalog.length(original_source));
      execute transformed_definition;
    end if;
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
  finalized_condition constant text := 'pg_catalog.lower(pg_catalog.btrim(coalesce(match_json ->> ''status'', ''''))) in (''finalizado'', ''jugado'', ''played'', ''finished'', ''cerrado'', ''closed'', ''revisado'', ''reviewed'')';
begin
  select procedure.* into function_row
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_matches()'::regprocedure;

  if function_row.oid is null or not function_row.prosecdef then
    raise exception 'Publication gate: get_my_player_matches ausente o sin SECURITY DEFINER';
  end if;

  original_source := function_row.prosrc;
  if pg_catalog.strpos(original_source, 'then match_json ->> ''home_score'' else null end') = 0 then
    if pg_catalog.strpos(original_source, 'match_json ->> ''home_score'',') = 0
       or pg_catalog.strpos(original_source, 'match_json ->> ''away_score'',') = 0
       or pg_catalog.strpos(original_source, 'coalesce(public_timeline.events, ''[]''::jsonb)') = 0 then
      raise exception 'Publication gate: contrato inesperado en get_my_player_matches';
    end if;
    transformed_source := pg_catalog.replace(
      original_source,
      'match_json ->> ''home_score'',',
      'case when ' || finalized_condition || ' then match_json ->> ''home_score'' else null end,'
    );
    transformed_source := pg_catalog.replace(
      transformed_source,
      'match_json ->> ''away_score'',',
      'case when ' || finalized_condition || ' then match_json ->> ''away_score'' else null end,'
    );
    transformed_source := pg_catalog.replace(
      transformed_source,
      'coalesce(public_timeline.events, ''[]''::jsonb)',
      'case when ' || finalized_condition || ' then coalesce(public_timeline.events, ''[]''::jsonb) else ''[]''::jsonb end'
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
  end if;
end;
$matches_gate$;

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
  source text;
begin
  foreach target in array array[
    'public.get_my_player_analysis_overview(text,text)'::regprocedure,
    'public.get_my_player_analysis_live_stats(text,text,text)'::regprocedure,
    'public.get_my_player_production_actions(text,text)'::regprocedure,
    'public.get_my_player_match_history(text,text,integer,integer)'::regprocedure
  ] loop
    select procedure.prosrc into source from pg_catalog.pg_proc procedure where procedure.oid = target;
    if pg_catalog.strpos(source, 'serialized.payload ->> ''status''') = 0 then
      raise exception 'Publication gate: falta cierre oficial en %', target;
    end if;
  end loop;

  select procedure.prosrc into source
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_my_player_matches()'::regprocedure;
  if pg_catalog.strpos(source, 'then match_json ->> ''home_score'' else null end') = 0
     or pg_catalog.strpos(source, 'else ''[]''::jsonb end') = 0 then
    raise exception 'Publication gate: partidos PLAYER no quedaron sanitizados';
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
