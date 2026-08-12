-- M1: crear, editar o borrar un gol y derivar el marcador en una sola transacción.
-- Migración local. No modifica RLS y no debe ejecutarse remotamente sin revisión.

do $$
declare
  v_column text;
begin
  foreach v_column in array array[
    'id', 'partido_id', 'type', 'half', 'minute', 'scorer', 'assistant',
    'phase', 'subphase', 'shot_zone', 'assist_zone', 'goal_zone',
    'contact', 'video_url', 'scorer_id', 'assistant_id', 'created_at'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'partido_eventos_gol' and column_name = v_column
    ) then
      raise exception 'Preflight M1: falta public.partido_eventos_gol.%', v_column;
    end if;
  end loop;
  foreach v_column in array array[
    'id', 'is_home', 'goals_for', 'goals_against', 'home_score', 'away_score',
    'post_notes', 'post_ai_analysis'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'partidos' and column_name = v_column
    ) then
      raise exception 'Preflight M1: falta public.partidos.%', v_column;
    end if;
  end loop;
end $$;

create or replace function public.mutate_match_goal_atomic(
  p_operation text,
  p_partido_id uuid,
  p_goal_id uuid,
  p_goal jsonb,
  p_match_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_match public.partidos%rowtype;
  v_goal_input public.partido_eventos_gol%rowtype;
  v_saved_goal public.partido_eventos_gol%rowtype;
  v_goal_json jsonb;
  v_events jsonb;
  v_goals_for integer;
  v_goals_against integer;
  v_home_score integer;
  v_away_score integer;
begin
  if p_operation not in ('create', 'update', 'delete') then
    raise exception using errcode = '22023', message = 'Operación de gol no válida.';
  end if;
  if p_partido_id is null then
    raise exception using errcode = '22023', message = 'El partido es obligatorio.';
  end if;
  if p_operation in ('update', 'delete') and p_goal_id is null then
    raise exception using errcode = '22023', message = 'El ID del gol es obligatorio para editar o borrar.';
  end if;
  if p_operation in ('create', 'update') and jsonb_typeof(coalesce(p_goal, 'null'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'El payload del gol debe ser un objeto JSON.';
  end if;
  if jsonb_typeof(coalesce(p_match_patch, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'El parche del partido debe ser un objeto JSON.';
  end if;

  select * into v_match
  from public.partidos
  where id = p_partido_id
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'El partido no existe o no es accesible.';
  end if;

  if p_operation in ('create', 'update') then
    if coalesce(p_goal->>'type', '') not in ('Gol a favor', 'Gol en contra') then
      raise exception using errcode = '22023', message = 'El sentido del gol no es válido.';
    end if;
    if nullif(btrim(p_goal->>'half'), '') is null
       or coalesce(p_goal->>'minute', '') !~ '^[0-9]+$'
       or (p_goal->>'minute')::integer not between 0 and 120 then
      raise exception using errcode = '22023', message = 'Parte o minuto del gol no válidos.';
    end if;
    if p_goal->>'type' = 'Gol a favor' and nullif(btrim(p_goal->>'scorer'), '') is null then
      raise exception using errcode = '22023', message = 'El goleador es obligatorio para un gol a favor.';
    end if;
    if p_goal ? 'partido_id' and nullif(p_goal->>'partido_id', '')::uuid is distinct from p_partido_id then
      raise exception using errcode = '22023', message = 'El payload pertenece a otro partido.';
    end if;
    v_goal_input := jsonb_populate_record(null::public.partido_eventos_gol, p_goal || jsonb_build_object('partido_id', p_partido_id));
  end if;

  if p_operation = 'create' then
    insert into public.partido_eventos_gol (
      partido_id, type, half, minute, scorer, assistant, phase, subphase,
      shot_zone, assist_zone, goal_zone, contact, video_url, scorer_id, assistant_id
    ) values (
      p_partido_id, v_goal_input.type, v_goal_input.half, v_goal_input.minute,
      v_goal_input.scorer, v_goal_input.assistant, v_goal_input.phase, v_goal_input.subphase,
      v_goal_input.shot_zone, v_goal_input.assist_zone, v_goal_input.goal_zone,
      v_goal_input.contact, v_goal_input.video_url, v_goal_input.scorer_id, v_goal_input.assistant_id
    ) returning * into v_saved_goal;
    v_goal_json := to_jsonb(v_saved_goal);
  elsif p_operation = 'update' then
    update public.partido_eventos_gol
    set type = v_goal_input.type,
        half = v_goal_input.half,
        minute = v_goal_input.minute,
        scorer = v_goal_input.scorer,
        assistant = v_goal_input.assistant,
        phase = v_goal_input.phase,
        subphase = v_goal_input.subphase,
        shot_zone = v_goal_input.shot_zone,
        assist_zone = v_goal_input.assist_zone,
        goal_zone = v_goal_input.goal_zone,
        contact = v_goal_input.contact,
        video_url = v_goal_input.video_url,
        scorer_id = v_goal_input.scorer_id,
        assistant_id = v_goal_input.assistant_id
    where id = p_goal_id and partido_id = p_partido_id
    returning * into v_saved_goal;
    if not found then
      raise exception using errcode = 'P0002', message = 'El gol ya no existe o pertenece a otro partido.';
    end if;
    v_goal_json := to_jsonb(v_saved_goal);
  else
    delete from public.partido_eventos_gol
    where id = p_goal_id and partido_id = p_partido_id
    returning * into v_saved_goal;
    if not found then
      raise exception using errcode = 'P0002', message = 'El gol ya no existe o pertenece a otro partido.';
    end if;
    v_goal_json := null;
  end if;

  select
    count(*) filter (where type = 'Gol a favor'),
    count(*) filter (where type = 'Gol en contra')
  into v_goals_for, v_goals_against
  from public.partido_eventos_gol
  where partido_id = p_partido_id;

  if v_match.is_home then
    v_home_score := v_goals_for;
    v_away_score := v_goals_against;
  else
    v_home_score := v_goals_against;
    v_away_score := v_goals_for;
  end if;

  update public.partidos
  set goals_for = v_goals_for::text,
      goals_against = v_goals_against::text,
      home_score = v_home_score::text,
      away_score = v_away_score::text,
      post_notes = case when coalesce(p_match_patch, '{}'::jsonb) ? 'post_notes' then p_match_patch->>'post_notes' else post_notes end,
      post_ai_analysis = case when coalesce(p_match_patch, '{}'::jsonb) ? 'post_ai_analysis' then p_match_patch->'post_ai_analysis' else post_ai_analysis end
  where id = p_partido_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se pudo actualizar el marcador del partido.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(goal_row) order by goal_row.minute, goal_row.created_at, goal_row.id), '[]'::jsonb)
  into v_events
  from public.partido_eventos_gol goal_row
  where goal_row.partido_id = p_partido_id;

  return jsonb_build_object(
    'goal', v_goal_json,
    'deleted_goal_id', case when p_operation = 'delete' then p_goal_id else null end,
    'events', v_events,
    'score', jsonb_build_object(
      'goals_for', v_goals_for,
      'goals_against', v_goals_against,
      'home_score', v_home_score,
      'away_score', v_away_score
    )
  );
end;
$$;

comment on function public.mutate_match_goal_atomic(text, uuid, uuid, jsonb, jsonb) is
  'Crea, edita o elimina un gol y recalcula GF/GC y marcador local/visitante desde los eventos persistidos.';

revoke all on function public.mutate_match_goal_atomic(text, uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.mutate_match_goal_atomic(text, uuid, uuid, jsonb, jsonb) to authenticated;
