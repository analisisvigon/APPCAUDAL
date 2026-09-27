-- APPCAUDAL - Club Core 31 - Sustituciones canonicas encadenadas.
-- Migracion local aditiva. No ejecutada contra Supabase remoto.

begin;

do $preconditions$
declare
  required_relation text;
  required_column record;
begin
  if auth.uid() is not null then
    raise exception 'Club Core 31 debe ejecutarse sin una identidad JWT activa';
  end if;

  foreach required_relation in array array[
    'public.partidos',
    'public.jugadores',
    'public.partido_alineacion_slots',
    'public.partido_estadisticas_jugador',
    'public.club_memberships'
  ] loop
    if pg_catalog.to_regclass(required_relation) is null then
      raise exception 'Club Core 31: falta la relacion %', required_relation;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('partidos', 'id'),
      ('jugadores', 'id'), ('jugadores', 'name'),
      ('partido_alineacion_slots', 'partido_id'),
      ('partido_alineacion_slots', 'scope'),
      ('partido_alineacion_slots', 'slot'),
      ('partido_alineacion_slots', 'jugador_id'),
      ('partido_alineacion_slots', 'player_name'),
      ('partido_estadisticas_jugador', 'partido_id'),
      ('partido_estadisticas_jugador', 'jugador_id'),
      ('partido_estadisticas_jugador', 'player_name'),
      ('partido_estadisticas_jugador', 'role'),
      ('partido_estadisticas_jugador', 'minutes'),
      ('partido_estadisticas_jugador', 'replacement_name')
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
      raise exception 'Club Core 31: falta public.%.%',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.is_app_staff()') is null
     or pg_catalog.to_regprocedure('public.set_club_core_updated_at()') is null then
    raise exception 'Club Core 31: faltan helpers de identidad o updated_at';
  end if;

  if pg_catalog.to_regclass('public.partido_eventos_sustitucion') is not null
     or pg_catalog.to_regprocedure('public.get_match_substitution_events(uuid)') is not null
     or pg_catalog.to_regprocedure(
          'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)'
        ) is not null then
    raise exception 'Club Core 31: ya existe parte del contrato; revisar antes de reemplazar';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Club Core 31: faltan roles Supabase requeridos';
  end if;
end;
$preconditions$;

create table public.partido_eventos_sustitucion (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  partido_id uuid not null
    references public.partidos(id) on delete cascade,
  minute integer not null,
  event_order integer not null,
  outgoing_jugador_id uuid not null
    references public.jugadores(id) on delete restrict,
  incoming_jugador_id uuid not null
    references public.jugadores(id) on delete restrict,
  outgoing_name_snapshot text not null,
  incoming_name_snapshot text not null,
  reason text null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint partido_eventos_sustitucion_minute_check
    check (minute >= 0),
  constraint partido_eventos_sustitucion_event_order_check
    check (event_order >= 0),
  constraint partido_eventos_sustitucion_players_check
    check (outgoing_jugador_id <> incoming_jugador_id),
  constraint partido_eventos_sustitucion_outgoing_name_check
    check (nullif(pg_catalog.btrim(outgoing_name_snapshot), '') is not null),
  constraint partido_eventos_sustitucion_incoming_name_check
    check (nullif(pg_catalog.btrim(incoming_name_snapshot), '') is not null),
  constraint partido_eventos_sustitucion_reason_check
    check (reason is null or reason in ('tactical', 'injury', 'discomfort', 'other')),
  constraint partido_eventos_sustitucion_match_order_key
    unique (partido_id, minute, event_order)
);

create index partido_eventos_sustitucion_outgoing_idx
on public.partido_eventos_sustitucion (partido_id, outgoing_jugador_id);

create index partido_eventos_sustitucion_incoming_idx
on public.partido_eventos_sustitucion (partido_id, incoming_jugador_id);

create trigger partido_eventos_sustitucion_updated_at
before update on public.partido_eventos_sustitucion
for each row execute function public.set_club_core_updated_at();

alter table public.partido_eventos_sustitucion enable row level security;

create policy substitution_staff_select
on public.partido_eventos_sustitucion
for select
to authenticated
using (public.is_app_staff());

revoke all on table public.partido_eventos_sustitucion
from public, anon, authenticated;
grant select on table public.partido_eventos_sustitucion to authenticated;

create function public.get_match_substitution_events(p_partido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  result_events jsonb;
begin
  if not public.is_app_staff() then
    raise exception 'SUBSTITUTION_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_partido_id is null then
    raise exception 'SUBSTITUTION_MATCH_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.partidos match_row where match_row.id = p_partido_id) then
    raise exception 'SUBSTITUTION_MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event_row)
      order by event_row.minute, event_row.event_order, event_row.id),
    '[]'::jsonb
  )
  into result_events
  from public.partido_eventos_sustitucion event_row
  where event_row.partido_id = p_partido_id;

  return pg_catalog.jsonb_build_object(
    'partido_id', p_partido_id,
    'source', 'canonical',
    'events', result_events
  );
end;
$function$;

create function public.mutate_match_substitution_atomic(
  p_operation text,
  p_partido_id uuid,
  p_event_id uuid,
  p_event jsonb,
  p_match_duration integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_operation text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_operation, '')));
  match_duration integer;
  initial_player_ids uuid[] := array[]::uuid[];
  on_field_player_ids uuid[] := array[]::uuid[];
  entry_minutes jsonb := '{}'::jsonb;
  played_minutes jsonb := '{}'::jsonb;
  result_events jsonb;
  result_minutes jsonb;
  saved_event jsonb;
  materialized_count integer := 0;
  lineup_row record;
  legacy_row record;
  event_row record;
  current_player_id uuid;
  outgoing_player_id uuid;
  incoming_player_id uuid;
  outgoing_name text;
  incoming_name text;
  normalized_reason text;
  event_minute integer;
  event_order_value integer;
  identity_count integer;
  entered_at integer;
  accumulated_minutes integer;
begin
  if not public.is_app_staff() then
    raise exception 'SUBSTITUTION_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if normalized_operation not in ('create', 'update', 'delete') then
    raise exception 'SUBSTITUTION_OPERATION_INVALID' using errcode = '22023';
  end if;
  if p_partido_id is null then
    raise exception 'SUBSTITUTION_MATCH_REQUIRED' using errcode = '22023';
  end if;
  if normalized_operation in ('update', 'delete') and p_event_id is null then
    raise exception 'SUBSTITUTION_EVENT_ID_REQUIRED' using errcode = '22023';
  end if;
  if normalized_operation in ('create', 'update')
     and pg_catalog.jsonb_typeof(coalesce(p_event, 'null'::jsonb)) <> 'object' then
    raise exception 'SUBSTITUTION_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  if p_match_duration is not null and p_match_duration <= 0 then
    raise exception 'SUBSTITUTION_DURATION_INVALID' using errcode = '22023';
  end if;

  perform 1
  from public.partidos match_row
  where match_row.id = p_partido_id
  for update;
  if not found then
    raise exception 'SUBSTITUTION_MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_match_duration is not null then
    match_duration := p_match_duration;
  else
    select pg_catalog.greatest(
      90,
      coalesce(pg_catalog.max(
        case
          when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+$'
            then pg_catalog.btrim(stats.minutes::text)::integer
          else null
        end
      ), 90)
    )
    into match_duration
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id;
  end if;

  for lineup_row in
    select lineup.slot, lineup.jugador_id, lineup.player_name
    from public.partido_alineacion_slots lineup
    where lineup.partido_id = p_partido_id
      and lineup.scope = 'stats'
    order by lineup.slot
  loop
    current_player_id := lineup_row.jugador_id;
    if current_player_id is null then
      select pg_catalog.count(distinct stats.jugador_id), pg_catalog.min(stats.jugador_id::text)::uuid
      into identity_count, current_player_id
      from public.partido_estadisticas_jugador stats
      where stats.partido_id = p_partido_id
        and stats.jugador_id is not null
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(stats.player_name), '[[:space:]]+', ' ', 'g'))
          = pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(lineup_row.player_name), '[[:space:]]+', ' ', 'g'));
      if identity_count <> 1 then
        raise exception 'SUBSTITUTION_LINEUP_IDENTITY_AMBIGUOUS:%', coalesce(lineup_row.player_name, '')
          using errcode = 'P0001';
      end if;
    end if;
    if current_player_id = any(initial_player_ids) then
      raise exception 'SUBSTITUTION_LINEUP_DUPLICATE_PLAYER:%', current_player_id
        using errcode = '23514';
    end if;
    initial_player_ids := pg_catalog.array_append(initial_player_ids, current_player_id);
  end loop;

  if pg_catalog.cardinality(initial_player_ids) <> 11 then
    raise exception 'SUBSTITUTION_LINEUP_REQUIRES_ELEVEN_CANONICAL_PLAYERS'
      using errcode = '23514';
  end if;

  -- La primera escritura de un partido historico materializa todos los
  -- replacement_name resolubles. Un saliente legacy no titular es ambiguo:
  -- su columna minutes ya representa duracion jugada, no minuto absoluto.
  if not exists (
    select 1 from public.partido_eventos_sustitucion existing
    where existing.partido_id = p_partido_id
  ) then
    for legacy_row in
      select stats.*
      from public.partido_estadisticas_jugador stats
      where stats.partido_id = p_partido_id
        and nullif(pg_catalog.btrim(coalesce(stats.replacement_name, '')), '') is not null
      order by
        case when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+$'
          then pg_catalog.btrim(stats.minutes::text)::integer else 2147483647 end,
        stats.jugador_id
    loop
      if legacy_row.jugador_id is null
         or not (legacy_row.jugador_id = any(initial_player_ids))
         or pg_catalog.btrim(legacy_row.minutes::text) !~ '^[0-9]+$'
         or pg_catalog.btrim(legacy_row.minutes::text)::integer > match_duration then
        raise exception 'LEGACY_SUBSTITUTION_AMBIGUOUS:%', legacy_row.player_name
          using errcode = 'P0001';
      end if;

      select pg_catalog.count(distinct stats.jugador_id),
             pg_catalog.min(stats.jugador_id::text)::uuid,
             pg_catalog.min(stats.player_name)
      into identity_count, incoming_player_id, incoming_name
      from public.partido_estadisticas_jugador stats
      where stats.partido_id = p_partido_id
        and stats.jugador_id is not null
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(stats.player_name), '[[:space:]]+', ' ', 'g'))
          = pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(legacy_row.replacement_name), '[[:space:]]+', ' ', 'g'));
      if identity_count <> 1 or incoming_player_id is null then
        raise exception 'LEGACY_SUBSTITUTION_AMBIGUOUS:%', legacy_row.replacement_name
          using errcode = 'P0001';
      end if;

      event_minute := pg_catalog.btrim(legacy_row.minutes::text)::integer;
      select coalesce(pg_catalog.max(existing.event_order), -1) + 1
      into event_order_value
      from public.partido_eventos_sustitucion existing
      where existing.partido_id = p_partido_id
        and existing.minute = event_minute;

      insert into public.partido_eventos_sustitucion (
        partido_id, minute, event_order,
        outgoing_jugador_id, incoming_jugador_id,
        outgoing_name_snapshot, incoming_name_snapshot, reason
      ) values (
        p_partido_id, event_minute, event_order_value,
        legacy_row.jugador_id, incoming_player_id,
        pg_catalog.btrim(legacy_row.player_name), pg_catalog.btrim(incoming_name), null
      );
      materialized_count := materialized_count + 1;
    end loop;
  end if;

  if normalized_operation in ('create', 'update') then
    if coalesce(p_event->>'minute', '') !~ '^[0-9]+$'
       or coalesce(p_event->>'event_order', '') !~ '^[0-9]+$' then
      raise exception 'SUBSTITUTION_MINUTE_OR_ORDER_INVALID' using errcode = '22023';
    end if;
    event_minute := (p_event->>'minute')::integer;
    event_order_value := (p_event->>'event_order')::integer;
    if event_minute > match_duration then
      raise exception 'SUBSTITUTION_MINUTE_OUT_OF_RANGE' using errcode = '22023';
    end if;
    begin
      outgoing_player_id := nullif(p_event->>'outgoing_jugador_id', '')::uuid;
      incoming_player_id := nullif(p_event->>'incoming_jugador_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SUBSTITUTION_PLAYER_ID_INVALID' using errcode = '22023';
    end;
    if outgoing_player_id is null or incoming_player_id is null then
      raise exception 'SUBSTITUTION_PLAYER_ID_REQUIRED' using errcode = '22023';
    end if;
    if outgoing_player_id = incoming_player_id then
      raise exception 'SUBSTITUTION_PLAYERS_MUST_DIFFER' using errcode = '23514';
    end if;
    normalized_reason := nullif(pg_catalog.lower(pg_catalog.btrim(p_event->>'reason')), '');
    if normalized_reason is not null
       and normalized_reason not in ('tactical', 'injury', 'discomfort', 'other') then
      raise exception 'SUBSTITUTION_REASON_INVALID' using errcode = '22023';
    end if;

    select pg_catalog.count(*), pg_catalog.min(stats.player_name)
    into identity_count, outgoing_name
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id
      and stats.jugador_id = outgoing_player_id;
    if identity_count <> 1 then
      raise exception 'SUBSTITUTION_OUTGOING_STATS_IDENTITY_INVALID'
        using errcode = '23514';
    end if;
    select pg_catalog.count(*), pg_catalog.min(stats.player_name)
    into identity_count, incoming_name
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id
      and stats.jugador_id = incoming_player_id;
    if identity_count <> 1 then
      raise exception 'SUBSTITUTION_INCOMING_STATS_IDENTITY_INVALID'
        using errcode = '23514';
    end if;

    if exists (
      select 1 from public.partido_eventos_sustitucion existing
      where existing.partido_id = p_partido_id
        and existing.minute = event_minute
        and existing.event_order = event_order_value
        and existing.id is distinct from p_event_id
    ) then
      raise exception 'SUBSTITUTION_EVENT_ORDER_DUPLICATE' using errcode = '23505';
    end if;

    if normalized_operation = 'create' then
      insert into public.partido_eventos_sustitucion (
        partido_id, minute, event_order,
        outgoing_jugador_id, incoming_jugador_id,
        outgoing_name_snapshot, incoming_name_snapshot, reason
      ) values (
        p_partido_id, event_minute, event_order_value,
        outgoing_player_id, incoming_player_id,
        pg_catalog.btrim(outgoing_name), pg_catalog.btrim(incoming_name), normalized_reason
      ) returning pg_catalog.to_jsonb(partido_eventos_sustitucion) into saved_event;
    else
      update public.partido_eventos_sustitucion existing
      set minute = event_minute,
          event_order = event_order_value,
          outgoing_jugador_id = outgoing_player_id,
          incoming_jugador_id = incoming_player_id,
          outgoing_name_snapshot = pg_catalog.btrim(outgoing_name),
          incoming_name_snapshot = pg_catalog.btrim(incoming_name),
          reason = normalized_reason
      where existing.id = p_event_id
        and existing.partido_id = p_partido_id
      returning pg_catalog.to_jsonb(existing) into saved_event;
      if saved_event is null then
        raise exception 'SUBSTITUTION_EVENT_NOT_FOUND' using errcode = 'P0002';
      end if;
    end if;
  else
    delete from public.partido_eventos_sustitucion existing
    where existing.id = p_event_id
      and existing.partido_id = p_partido_id
    returning pg_catalog.to_jsonb(existing) into saved_event;
    if saved_event is null then
      raise exception 'SUBSTITUTION_EVENT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  on_field_player_ids := initial_player_ids;
  foreach current_player_id in array initial_player_ids loop
    entry_minutes := pg_catalog.jsonb_set(entry_minutes, array[current_player_id::text], '0'::jsonb, true);
    played_minutes := pg_catalog.jsonb_set(played_minutes, array[current_player_id::text], '0'::jsonb, true);
  end loop;

  for event_row in
    select event.*
    from public.partido_eventos_sustitucion event
    where event.partido_id = p_partido_id
    order by event.minute, event.event_order, event.id
  loop
    if event_row.minute > match_duration then
      raise exception 'SUBSTITUTION_MINUTE_OUT_OF_RANGE:%', event_row.id
        using errcode = '22023';
    end if;
    if not (event_row.outgoing_jugador_id = any(on_field_player_ids)) then
      raise exception 'SUBSTITUTION_OUTGOING_NOT_ON_FIELD:%', event_row.id
        using errcode = '23514';
    end if;
    if event_row.incoming_jugador_id = any(on_field_player_ids) then
      raise exception 'SUBSTITUTION_INCOMING_ALREADY_ON_FIELD:%', event_row.id
        using errcode = '23514';
    end if;
    entered_at := (entry_minutes->>event_row.outgoing_jugador_id::text)::integer;
    if entered_at is null or event_row.minute < entered_at then
      raise exception 'SUBSTITUTION_EXIT_BEFORE_ENTRY:%', event_row.id
        using errcode = '23514';
    end if;
    accumulated_minutes := coalesce((played_minutes->>event_row.outgoing_jugador_id::text)::integer, 0)
      + event_row.minute - entered_at;
    played_minutes := pg_catalog.jsonb_set(
      played_minutes,
      array[event_row.outgoing_jugador_id::text],
      pg_catalog.to_jsonb(accumulated_minutes),
      true
    );
    on_field_player_ids := pg_catalog.array_remove(on_field_player_ids, event_row.outgoing_jugador_id);
    on_field_player_ids := pg_catalog.array_append(on_field_player_ids, event_row.incoming_jugador_id);
    entry_minutes := entry_minutes - event_row.outgoing_jugador_id::text;
    entry_minutes := pg_catalog.jsonb_set(
      entry_minutes,
      array[event_row.incoming_jugador_id::text],
      pg_catalog.to_jsonb(event_row.minute),
      true
    );
    if not (played_minutes ? event_row.incoming_jugador_id::text) then
      played_minutes := pg_catalog.jsonb_set(
        played_minutes,
        array[event_row.incoming_jugador_id::text],
        '0'::jsonb,
        true
      );
    end if;
  end loop;

  foreach current_player_id in array on_field_player_ids loop
    entered_at := (entry_minutes->>current_player_id::text)::integer;
    accumulated_minutes := coalesce((played_minutes->>current_player_id::text)::integer, 0)
      + match_duration - entered_at;
    played_minutes := pg_catalog.jsonb_set(
      played_minutes,
      array[current_player_id::text],
      pg_catalog.to_jsonb(accumulated_minutes),
      true
    );
  end loop;

  update public.partido_estadisticas_jugador stats
  set minutes = coalesce(played_minutes->>stats.jugador_id::text, '0')
  where stats.partido_id = p_partido_id
    and stats.jugador_id is not null;

  -- replacement_name solo conserva cambios simples de titulares que no
  -- volvieron a entrar y cuyo minuto absoluto coincide con minutos jugados.
  -- Un suplente que entra y sale conserva minutes, pero su salida vive solo
  -- en partido_eventos_sustitucion para no crear una semantica falsa.
  update public.partido_estadisticas_jugador stats
  set replacement_name = coalesce((
    select event.incoming_name_snapshot
    from public.partido_eventos_sustitucion event
    where event.partido_id = p_partido_id
      and event.outgoing_jugador_id = stats.jugador_id
      and stats.jugador_id = any(initial_player_ids)
      and event.minute = coalesce((played_minutes->>stats.jugador_id::text)::integer, -1)
      and not exists (
        select 1
        from public.partido_eventos_sustitucion incoming_event
        where incoming_event.partido_id = p_partido_id
          and incoming_event.incoming_jugador_id = stats.jugador_id
      )
      and (
        select pg_catalog.count(*)
        from public.partido_eventos_sustitucion outgoing_event
        where outgoing_event.partido_id = p_partido_id
          and outgoing_event.outgoing_jugador_id = stats.jugador_id
      ) = 1
    limit 1
  ), '')
  where stats.partido_id = p_partido_id
    and stats.jugador_id is not null;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event)
      order by event.minute, event.event_order, event.id),
    '[]'::jsonb
  )
  into result_events
  from public.partido_eventos_sustitucion event
  where event.partido_id = p_partido_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'jugador_id', stats.jugador_id,
        'player_name', stats.player_name,
        'minutes', coalesce((played_minutes->>stats.jugador_id::text)::integer, 0),
        'replacement_name', stats.replacement_name
      ) order by stats.player_name, stats.jugador_id
    ),
    '[]'::jsonb
  )
  into result_minutes
  from public.partido_estadisticas_jugador stats
  where stats.partido_id = p_partido_id
    and stats.jugador_id is not null;

  return pg_catalog.jsonb_build_object(
    'operation', normalized_operation,
    'partido_id', p_partido_id,
    'duration', match_duration,
    'materialized_legacy_events', materialized_count,
    'event', case when normalized_operation = 'delete' then null else saved_event end,
    'deleted_event_id', case when normalized_operation = 'delete' then p_event_id else null end,
    'events', result_events,
    'minutes', result_minutes
  );
end;
$function$;

alter function public.get_match_substitution_events(uuid) owner to postgres;
alter function public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer) owner to postgres;

revoke all on function public.get_match_substitution_events(uuid)
from public, anon, authenticated;
revoke all on function public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)
from public, anon, authenticated;

grant execute on function public.get_match_substitution_events(uuid)
to authenticated, service_role;
grant execute on function public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)
to authenticated, service_role;

comment on table public.partido_eventos_sustitucion is
'Fuente canonica de sustituciones ordenadas por partido, minuto y event_order.';

comment on function public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer) is
'Materializa legacy bajo demanda, valida la secuencia completa y proyecta minutos/replacement_name en una transaccion.';

commit;
