-- H7: XI, reservas, roles y sistema rival como un único snapshot transaccional.
-- Migración local. No modifica RLS y no debe ejecutarse remotamente sin revisión.

do $$
declare
  v_table text;
  v_column text;
  v_required jsonb := jsonb_build_object(
    'equipos_rivales', jsonb_build_array('id', 'system', 'field_sources'),
    'player_team_memberships', jsonb_build_array('id', 'team_id', 'is_current', 'end_date', 'squad_role', 'tactical_role', 'tactical_slot', 'tactical_reserve_slot'),
    'jugadores_rivales', jsonb_build_array('id', 'equipo_rival_id', 'membership_id', 'name', 'role', 'tactical_role', 'tactical_slot', 'tactical_reserve_slot'),
    'equipo_rival_alineacion', jsonb_build_array('equipo_rival_id', 'jugador_rival_id', 'global_player_id', 'membership_id', 'player_name', 'slot', 'role', 'x', 'y', 'player_snapshot'),
    'equipo_rival_banquillo', jsonb_build_array('equipo_rival_id', 'starter_name', 'slot', 'jugador_rival_id', 'global_player_id', 'membership_id', 'player_name', 'player_snapshot')
  );
begin
  for v_table in select jsonb_object_keys(v_required)
  loop
    for v_column in select jsonb_array_elements_text(v_required->v_table)
    loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table and column_name = v_column
      ) then
        raise exception 'Preflight H7: falta public.%.%', v_table, v_column;
      end if;
    end loop;
  end loop;
end $$;

create or replace function public.save_rival_lineup_atomic(
  p_team_id uuid,
  p_system text,
  p_field_sources jsonb,
  p_placements jsonb,
  p_lineup jsonb,
  p_bench jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_affected integer;
  v_result jsonb;
begin
  if p_team_id is null then
    raise exception using errcode = '22023', message = 'El equipo rival es obligatorio.';
  end if;
  if jsonb_typeof(coalesce(p_placements, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_lineup, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_bench, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Colocaciones, alineación y banquillo deben ser arrays JSON.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_team_id::text, 0));
  perform 1 from public.equipos_rivales where id = p_team_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'El equipo rival no existe o no es accesible.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_placements) as input(item)
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'player_name'), '') is null
       or coalesce(item->>'squad_role', '') not in ('Titular', 'Reserva')
       or coalesce(item->>'tactical_role', '') not in ('', 'Titular', 'Reserva')
       or (
         item->>'tactical_role' = 'Titular'
         and (coalesce(item->>'tactical_slot', '') !~ '^[0-9]+$' or (item->>'tactical_slot')::integer not between 0 and 10 or item->'tactical_reserve_slot' <> 'null'::jsonb)
       )
       or (
         item->>'tactical_role' = 'Reserva'
         and (coalesce(item->>'tactical_slot', '') !~ '^[0-9]+$' or (item->>'tactical_slot')::integer not between 0 and 10
              or coalesce(item->>'tactical_reserve_slot', '') !~ '^[0-1]$')
       )
       or (
         coalesce(item->>'tactical_role', '') = ''
         and (item->'tactical_slot' <> 'null'::jsonb or item->'tactical_reserve_slot' <> 'null'::jsonb)
       )
       or (nullif(item->>'membership_id', '') is null and nullif(item->>'rival_player_id', '') is null)
  ) then
    raise exception using errcode = '22023', message = 'El snapshot contiene una colocación rival inválida o sin identidad estable.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_placements) input(item)
    group by coalesce(nullif(item->>'membership_id', ''), nullif(item->>'rival_player_id', ''))
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'El snapshot contiene jugadores duplicados.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_placements) input(item)
    where item->>'tactical_role' = 'Titular'
    group by (item->>'tactical_slot')::integer
    having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_placements) input(item)
    where item->>'tactical_role' = 'Reserva'
    group by (item->>'tactical_slot')::integer, (item->>'tactical_reserve_slot')::integer
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'El snapshot rival contiene un slot táctico duplicado.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lineup) input(item)
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'player_name'), '') is null
       or coalesce(item->>'slot', '') !~ '^[0-9]+$'
       or (item->>'slot')::integer not between 0 and 10
  ) or exists (
    select 1 from jsonb_array_elements(p_lineup) input(item)
    group by (item->>'slot')::integer
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'La alineación rival contiene filas o slots inválidos.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_bench) input(item)
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'starter_name'), '') is null
       or coalesce(item->>'slot', '') !~ '^[0-1]$'
  ) or exists (
    select 1 from jsonb_array_elements(p_bench) input(item)
    group by item->>'starter_name', (item->>'slot')::integer
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'El banquillo rival contiene filas o slots inválidos.';
  end if;

  update public.equipos_rivales
  set system = coalesce(nullif(btrim(p_system), ''), system),
      field_sources = coalesce(p_field_sources, field_sources)
  where id = p_team_id;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using errcode = 'P0002', message = 'No se actualizó el equipo rival.';
  end if;

  update public.player_team_memberships
  set tactical_role = null,
      tactical_slot = null,
      tactical_reserve_slot = null,
      squad_role = 'Reserva'
  where team_id = p_team_id and is_current;

  update public.jugadores_rivales
  set tactical_role = null,
      tactical_slot = null,
      tactical_reserve_slot = null,
      role = 'Reserva'
  where equipo_rival_id = p_team_id;

  for v_item in select item from jsonb_array_elements(p_placements) input(item)
  loop
    if nullif(v_item->>'membership_id', '') is not null then
      update public.player_team_memberships
      set tactical_role = nullif(v_item->>'tactical_role', ''),
          tactical_slot = nullif(v_item->>'tactical_slot', '')::integer,
          tactical_reserve_slot = nullif(v_item->>'tactical_reserve_slot', '')::integer,
          squad_role = v_item->>'squad_role'
      where id = (v_item->>'membership_id')::uuid
        and team_id = p_team_id
        and is_current;
      get diagnostics v_affected = row_count;
      if v_affected <> 1 then
        raise exception using errcode = 'P0002', message = format('Membership rival no encontrado: %s', v_item->>'membership_id');
      end if;

      update public.jugadores_rivales
      set tactical_role = nullif(v_item->>'tactical_role', ''),
          tactical_slot = nullif(v_item->>'tactical_slot', '')::integer,
          tactical_reserve_slot = nullif(v_item->>'tactical_reserve_slot', '')::integer,
          role = v_item->>'squad_role'
      where equipo_rival_id = p_team_id
        and membership_id = (v_item->>'membership_id')::uuid;
    else
      update public.jugadores_rivales
      set tactical_role = nullif(v_item->>'tactical_role', ''),
          tactical_slot = nullif(v_item->>'tactical_slot', '')::integer,
          tactical_reserve_slot = nullif(v_item->>'tactical_reserve_slot', '')::integer,
          role = v_item->>'squad_role'
      where id = (v_item->>'rival_player_id')::uuid
        and equipo_rival_id = p_team_id;
      get diagnostics v_affected = row_count;
      if v_affected <> 1 then
        raise exception using errcode = 'P0002', message = format('Jugador rival no encontrado: %s', v_item->>'rival_player_id');
      end if;
    end if;
  end loop;

  delete from public.equipo_rival_alineacion where equipo_rival_id = p_team_id;
  insert into public.equipo_rival_alineacion (
    equipo_rival_id, jugador_rival_id, global_player_id, membership_id,
    player_name, slot, role, x, y, player_snapshot
  )
  select
    p_team_id,
    nullif(item->>'rival_player_id', '')::uuid,
    nullif(item->>'global_player_id', '')::uuid,
    nullif(item->>'membership_id', '')::uuid,
    item->>'player_name',
    (item->>'slot')::integer,
    'Titular',
    nullif(item->>'x', '')::numeric,
    nullif(item->>'y', '')::numeric,
    coalesce(item->'player_snapshot', '{}'::jsonb)
  from jsonb_array_elements(p_lineup) input(item);

  delete from public.equipo_rival_banquillo where equipo_rival_id = p_team_id;
  insert into public.equipo_rival_banquillo (
    equipo_rival_id, starter_name, slot, jugador_rival_id, global_player_id,
    membership_id, player_name, player_snapshot
  )
  select
    p_team_id,
    item->>'starter_name',
    (item->>'slot')::integer,
    nullif(item->>'rival_player_id', '')::uuid,
    nullif(item->>'global_player_id', '')::uuid,
    nullif(item->>'membership_id', '')::uuid,
    nullif(item->>'player_name', ''),
    coalesce(item->'player_snapshot', '{}'::jsonb)
  from jsonb_array_elements(p_bench) input(item);

  select jsonb_build_object(
    'team_id', p_team_id,
    'system', team.system,
    'placements', p_placements,
    'lineup', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.slot)
      from public.equipo_rival_alineacion row_data
      where row_data.equipo_rival_id = p_team_id
    ), '[]'::jsonb)
  ) into v_result
  from public.equipos_rivales team
  where team.id = p_team_id;

  return v_result;
end;
$$;

comment on function public.save_rival_lineup_atomic(uuid, text, jsonb, jsonb, jsonb, jsonb) is
  'Guarda sistema, XI, colocaciones tácticas y roles Titular/Reserva del rival en una transacción.';

revoke all on function public.save_rival_lineup_atomic(uuid, text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_rival_lineup_atomic(uuid, text, jsonb, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.remove_rival_player_from_team_atomic(
  p_team_id uuid,
  p_membership_id uuid,
  p_rival_player_id uuid,
  p_player_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_affected integer;
begin
  if p_team_id is null or nullif(btrim(p_player_name), '') is null then
    raise exception using errcode = '22023', message = 'Equipo y nombre del jugador rival son obligatorios.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_team_id::text, 0));
  perform 1 from public.equipos_rivales where id = p_team_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'El equipo rival no existe o no es accesible.';
  end if;

  if p_membership_id is not null then
    update public.player_team_memberships
    set is_current = false,
        end_date = current_date,
        tactical_role = null,
        tactical_slot = null,
        tactical_reserve_slot = null,
        squad_role = 'Reserva'
    where id = p_membership_id and team_id = p_team_id and is_current;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = 'P0002', message = 'La pertenencia rival ya no existe o no está activa.';
    end if;
  else
    delete from public.jugadores_rivales
    where equipo_rival_id = p_team_id
      and (
        (p_rival_player_id is not null and id = p_rival_player_id)
        or (p_rival_player_id is null and name = p_player_name)
      );
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = 'P0002', message = 'El jugador rival no existe o su identidad no es unívoca.';
    end if;
  end if;

  delete from public.equipo_rival_alineacion
  where equipo_rival_id = p_team_id and player_name = p_player_name;
  delete from public.equipo_rival_banquillo
  where equipo_rival_id = p_team_id and (player_name = p_player_name or starter_name = p_player_name);

  return jsonb_build_object('team_id', p_team_id, 'removed_player_name', p_player_name);
end;
$$;

comment on function public.remove_rival_player_from_team_atomic(uuid, uuid, uuid, text) is
  'Retira un jugador de la plantilla rival y limpia XI/banquillo en la misma transacción.';

revoke all on function public.remove_rival_player_from_team_atomic(uuid, uuid, uuid, text) from public;
grant execute on function public.remove_rival_player_from_team_atomic(uuid, uuid, uuid, text) to authenticated;
