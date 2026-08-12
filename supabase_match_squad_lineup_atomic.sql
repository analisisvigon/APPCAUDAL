-- Guardado transaccional de sistema, XI, convocatoria y roles de un partido.
-- Migración aditiva: no borra estadísticas históricas ni modifica RLS.

do $$
declare
  missing_columns text[];
begin
  select array_agg(required.table_name || '.' || required.column_name order by required.table_name, required.column_name)
  into missing_columns
  from (values
    ('partidos', 'id'),
    ('partidos', 'stats_system'),
    ('partido_alineacion_slots', 'partido_id'),
    ('partido_alineacion_slots', 'scope'),
    ('partido_alineacion_slots', 'slot'),
    ('partido_alineacion_slots', 'jugador_id'),
    ('partido_alineacion_slots', 'player_name'),
    ('partido_convocados', 'partido_id'),
    ('partido_convocados', 'jugador_id'),
    ('partido_convocados', 'player_name'),
    ('partido_estadisticas_jugador', 'partido_id'),
    ('partido_estadisticas_jugador', 'jugador_id'),
    ('partido_estadisticas_jugador', 'player_name'),
    ('partido_estadisticas_jugador', 'role'),
    ('partido_estadisticas_jugador', 'minutes'),
    ('partido_estadisticas_jugador', 'yellow'),
    ('partido_estadisticas_jugador', 'yellow_count'),
    ('partido_estadisticas_jugador', 'red'),
    ('partido_estadisticas_jugador', 'injured'),
    ('partido_estadisticas_jugador', 'rating'),
    ('partido_estadisticas_jugador', 'replacement_name'),
    ('partido_estadisticas_jugador', 'raw_data'),
    ('jugadores', 'id'),
    ('jugadores', 'availability_status')
  ) as required(table_name, column_name)
  where pg_catalog.to_regclass(pg_catalog.format('public.%I', required.table_name)) is null
     or not exists (
    select 1
    from pg_catalog.pg_attribute existing
    where existing.attrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', required.table_name))
      and existing.attname = required.column_name
      and existing.attnum > 0
      and not existing.attisdropped
  );

  if missing_columns is not null then
    raise exception 'H2 schema mismatch. Missing columns: %', array_to_string(missing_columns, ', ');
  end if;
end $$;

-- Reutiliza los UNIQUE reales ya presentes:
--   partido_alineacion_slots (partido_id, scope, slot)
--   partido_convocados (partido_id, player_name)
--   partido_estadisticas_jugador (partido_id, player_name)
-- H2 no crea indices ni modifica constraints o RLS.

create or replace function public.save_match_squad_lineup_atomic(
  p_partido_id uuid,
  p_stats_system text,
  p_squad jsonb,
  p_slots jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  squad_row record;
  normalized_name text;
  starter_count integer;
  called_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_partido_id is null then
    raise exception 'Match id is required';
  end if;

  if nullif(btrim(p_stats_system), '') is null then
    raise exception 'Stats system is required';
  end if;

  if jsonb_typeof(p_squad) is distinct from 'array'
     or jsonb_typeof(p_slots) is distinct from 'array' then
    raise exception 'Squad and slots must be JSON arrays';
  end if;

  -- Serializa todos los snapshots del mismo partido. Si el partido no existe,
  -- no se inicia ninguna escritura.
  perform 1
  from public.partidos
  where id = p_partido_id
  for update;

  if not found then
    raise exception 'Match not found: %', p_partido_id;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_squad)
      as item(jugador_id uuid, player_name text, role text)
    where nullif(btrim(item.player_name), '') is null
       or item.role not in ('Titular', 'Suplente', 'Fuera')
  ) then
    raise exception 'Invalid squad row';
  end if;

  if exists (
    select 1
    from (
      select coalesce(
        item.jugador_id::text,
        'legacy:' || lower(regexp_replace(btrim(item.player_name), '[[:space:]]+', ' ', 'g'))
      ) as identity_key
      from jsonb_to_recordset(p_squad)
        as item(jugador_id uuid, player_name text, role text)
    ) identities
    group by identities.identity_key
    having count(*) > 1
  ) then
    raise exception 'Duplicated squad player';
  end if;

  -- jugador_id sigue siendo la identidad logica. Esta validacion separada
  -- protege los UNIQUE legacy de convocatoria/estadisticas basados en nombre.
  if exists (
    select lower(regexp_replace(btrim(item.player_name), '[[:space:]]+', ' ', 'g'))
    from jsonb_to_recordset(p_squad)
      as item(jugador_id uuid, player_name text, role text)
    where item.role in ('Titular', 'Suplente')
    group by lower(regexp_replace(btrim(item.player_name), '[[:space:]]+', ' ', 'g'))
    having count(*) > 1
  ) then
    raise exception 'Duplicated active player_name conflicts with legacy unique constraint';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots)
      as item(slot integer, jugador_id uuid, player_name text)
    where item.slot is null
       or item.slot < 0
       or item.slot > 10
       or nullif(btrim(item.player_name), '') is null
  ) then
    raise exception 'Invalid lineup slot';
  end if;

  if exists (
    select item.slot
    from jsonb_to_recordset(p_slots)
      as item(slot integer, jugador_id uuid, player_name text)
    group by item.slot
    having count(*) > 1
  ) then
    raise exception 'Duplicated lineup slot';
  end if;

  if exists (
    select 1
    from (
      select coalesce(
        item.jugador_id::text,
        'legacy:' || lower(regexp_replace(btrim(item.player_name), '[[:space:]]+', ' ', 'g'))
      ) as identity_key
      from jsonb_to_recordset(p_slots)
        as item(slot integer, jugador_id uuid, player_name text)
    ) identities
    group by identities.identity_key
    having count(*) > 1
  ) then
    raise exception 'Duplicated lineup player';
  end if;

  select count(*)
  into starter_count
  from jsonb_to_recordset(p_slots)
    as item(slot integer, jugador_id uuid, player_name text);

  if starter_count > 11 then
    raise exception 'A lineup cannot contain more than 11 starters';
  end if;

  -- Todo slot debe corresponder a un Titular usando UUID; el nombre solo se
  -- compara cuando ambas filas son legacy.
  if exists (
    select 1
    from jsonb_to_recordset(p_slots)
      as slot_row(slot integer, jugador_id uuid, player_name text)
    where not exists (
      select 1
      from jsonb_to_recordset(p_squad)
        as member(jugador_id uuid, player_name text, role text)
      where member.role = 'Titular'
        and (
          (slot_row.jugador_id is not null and member.jugador_id = slot_row.jugador_id)
          or (
            slot_row.jugador_id is null
            and member.jugador_id is null
            and lower(regexp_replace(btrim(member.player_name), '[[:space:]]+', ' ', 'g'))
              = lower(regexp_replace(btrim(slot_row.player_name), '[[:space:]]+', ' ', 'g'))
          )
        )
    )
  ) then
    raise exception 'A lineup slot does not belong to a starter';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_squad)
      as member(jugador_id uuid, player_name text, role text)
    where member.role = 'Titular'
      and not exists (
        select 1
        from jsonb_to_recordset(p_slots)
          as slot_row(slot integer, jugador_id uuid, player_name text)
        where (
          (member.jugador_id is not null and slot_row.jugador_id = member.jugador_id)
          or (
            member.jugador_id is null
            and slot_row.jugador_id is null
            and lower(regexp_replace(btrim(member.player_name), '[[:space:]]+', ' ', 'g'))
              = lower(regexp_replace(btrim(slot_row.player_name), '[[:space:]]+', ' ', 'g'))
          )
        )
      )
  ) then
    raise exception 'A starter has no lineup slot';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_squad)
      as member(jugador_id uuid, player_name text, role text)
    left join public.jugadores player on player.id = member.jugador_id
    where member.jugador_id is not null
      and player.id is null
  ) then
    raise exception 'Squad player not found';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_squad)
      as member(jugador_id uuid, player_name text, role text)
    left join public.jugadores player on player.id = member.jugador_id
    where member.role = 'Titular'
      and member.jugador_id is not null
      and coalesce(player.availability_status, 'available') <> 'available'
  ) then
    raise exception 'An unavailable player cannot be a starter';
  end if;

  update public.partidos
  set stats_system = btrim(p_stats_system)
  where id = p_partido_id;

  -- Elimina solo posiciones stats ausentes del snapshot. Nunca toca otros scopes.
  delete from public.partido_alineacion_slots existing
  where existing.partido_id = p_partido_id
    and existing.scope = 'stats'
    and not exists (
      select 1
      from jsonb_to_recordset(p_slots)
        as desired(slot integer, jugador_id uuid, player_name text)
      where desired.slot = existing.slot
    );

  insert into public.partido_alineacion_slots (
    partido_id,
    scope,
    slot,
    jugador_id,
    player_name
  )
  select
    p_partido_id,
    'stats',
    item.slot,
    item.jugador_id,
    regexp_replace(btrim(item.player_name), '[[:space:]]+', ' ', 'g')
  from jsonb_to_recordset(p_slots)
    as item(slot integer, jugador_id uuid, player_name text)
  on conflict (partido_id, scope, slot) do update
  set jugador_id = excluded.jugador_id,
      player_name = excluded.player_name;

  -- Convocatoria: Titular y Suplente están dentro; Fuera queda eliminado.
  -- La identidad se resuelve por jugador_id y solo cae a nombre en legacy.
  delete from public.partido_convocados existing
  where existing.partido_id = p_partido_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_squad)
        as desired(jugador_id uuid, player_name text, role text)
      where desired.role in ('Titular', 'Suplente')
        and (
          (existing.jugador_id is not null and desired.jugador_id = existing.jugador_id)
          or (
            existing.jugador_id is null
            and lower(regexp_replace(btrim(existing.player_name), '[[:space:]]+', ' ', 'g'))
              = lower(regexp_replace(btrim(desired.player_name), '[[:space:]]+', ' ', 'g'))
          )
        )
    );

  for squad_row in
    select item.jugador_id, item.player_name, item.role
    from jsonb_to_recordset(p_squad)
      as item(jugador_id uuid, player_name text, role text)
    where item.role in ('Titular', 'Suplente')
  loop
    normalized_name := regexp_replace(btrim(squad_row.player_name), '[[:space:]]+', ' ', 'g');

    if squad_row.jugador_id is not null then
      update public.partido_convocados
      set player_name = normalized_name
      where partido_id = p_partido_id
        and jugador_id = squad_row.jugador_id;

      if not found then
        update public.partido_convocados
        set jugador_id = squad_row.jugador_id,
            player_name = normalized_name
        where partido_id = p_partido_id
          and jugador_id is null
          and lower(regexp_replace(btrim(player_name), '[[:space:]]+', ' ', 'g'))
            = lower(normalized_name);
      end if;
    else
      update public.partido_convocados
      set player_name = normalized_name
      where partido_id = p_partido_id
        and jugador_id is null
        and lower(regexp_replace(btrim(player_name), '[[:space:]]+', ' ', 'g'))
          = lower(normalized_name);
    end if;

    if not found then
      insert into public.partido_convocados (
        partido_id,
        jugador_id,
        player_name
      ) values (
        p_partido_id,
        squad_row.jugador_id,
        normalized_name
      );
    end if;

    -- Nunca se borran estadísticas por pasar a Fuera. Para convocados se
    -- actualizan identidad y role, preservando cualquier dato histórico.
    if squad_row.jugador_id is not null then
      update public.partido_estadisticas_jugador
      set player_name = normalized_name,
          role = squad_row.role,
          minutes = case
            when nullif(btrim(coalesce(minutes, '')), '') is null
              and squad_row.role = 'Titular'
              then '90'
            else minutes
          end
      where partido_id = p_partido_id
        and jugador_id = squad_row.jugador_id;

      if not found then
        update public.partido_estadisticas_jugador
        set jugador_id = squad_row.jugador_id,
            player_name = normalized_name,
            role = squad_row.role,
            minutes = case
              when nullif(btrim(coalesce(minutes, '')), '') is null
                and squad_row.role = 'Titular'
                then '90'
              else minutes
            end
        where partido_id = p_partido_id
          and jugador_id is null
          and lower(regexp_replace(btrim(player_name), '[[:space:]]+', ' ', 'g'))
            = lower(normalized_name);
      end if;
    else
      update public.partido_estadisticas_jugador
      set player_name = normalized_name,
          role = squad_row.role,
          minutes = case
            when nullif(btrim(coalesce(minutes, '')), '') is null
              and squad_row.role = 'Titular'
              then '90'
            else minutes
          end
      where partido_id = p_partido_id
        and jugador_id is null
        and lower(regexp_replace(btrim(player_name), '[[:space:]]+', ' ', 'g'))
          = lower(normalized_name);
    end if;

    if not found then
      insert into public.partido_estadisticas_jugador (
        partido_id,
        jugador_id,
        player_name,
        role,
        minutes,
        yellow,
        yellow_count,
        red,
        injured,
        rating,
        replacement_name
      ) values (
        p_partido_id,
        squad_row.jugador_id,
        normalized_name,
        squad_row.role,
        case when squad_row.role = 'Titular' then '90' else '' end,
        false,
        0,
        false,
        false,
        '',
        ''
      );
    end if;
  end loop;

  select count(*)
  into called_count
  from public.partido_convocados
  where partido_id = p_partido_id;

  return jsonb_build_object(
    'partido_id', p_partido_id,
    'stats_system', btrim(p_stats_system),
    'starter_count', starter_count,
    'called_count', called_count,
    'slot_count', starter_count
  );
end;
$function$;

comment on function public.save_match_squad_lineup_atomic(uuid, text, jsonb, jsonb) is
  'Guarda sistema, XI, convocatoria y roles en una transacción; preserva estadísticas históricas.';

revoke all on function public.save_match_squad_lineup_atomic(uuid, text, jsonb, jsonb)
  from public, anon;

grant execute on function public.save_match_squad_lineup_atomic(uuid, text, jsonb, jsonb)
  to authenticated;
