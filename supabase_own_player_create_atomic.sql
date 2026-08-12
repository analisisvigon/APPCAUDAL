-- Alta transaccional de jugadores propios.
-- Este archivo instala el contrato general; no repara ni modifica filas existentes.
begin;

create or replace function public.create_own_player_atomic(
  p_own_player_id uuid,
  p_player jsonb,
  p_positions jsonb default '[]'::jsonb,
  p_sources jsonb default '[]'::jsonb,
  p_traits jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  own_team_id uuid;
  own_team_count integer;
  created_global_id uuid;
  created_membership_id uuid;
  existing_own jsonb;
  compatible_profile_count integer;
  natural_position_key text;
  position_label text;
  photo_url text;
begin
  if p_own_player_id is null then
    raise exception 'OWN_PLAYER_ID_REQUIRED';
  end if;
  if nullif(trim(p_player ->> 'name'), '') is null then
    raise exception 'OWN_PLAYER_NAME_REQUIRED';
  end if;
  if nullif(p_player ->> 'id', '') is not null or nullif(p_player ->> 'globalPlayerId', '') is not null then
    raise exception 'OWN_PLAYER_CREATE_REJECTS_EXISTING_GLOBAL_ID';
  end if;

  -- El mismo UUID de solicitud serializa dobles clics y reintentos concurrentes.
  perform pg_advisory_xact_lock(hashtextextended(p_own_player_id::text, 0));

  select to_jsonb(own_player)
    into existing_own
  from public.jugadores own_player
  where own_player.id = p_own_player_id;

  if existing_own is not null then
    created_global_id := nullif(existing_own ->> 'global_player_id', '')::uuid;
    created_membership_id := nullif(existing_own ->> 'membership_id', '')::uuid;
    if created_global_id is not null
       and created_membership_id is not null
       and exists (
         select 1
         from public.player_team_memberships membership
         join public.equipos_rivales team
           on team.id = membership.team_id and team.team_kind = 'own'
         where membership.id = created_membership_id
           and membership.player_id = created_global_id
           and membership.is_current
       )
       and exists (
         select 1
         from public.legacy_own_player_migration migration
         where migration.legacy_player_id = p_own_player_id
           and migration.global_player_id = created_global_id
           and migration.membership_id = created_membership_id
       ) then
      return jsonb_build_object(
        'status', 'already_created',
        'ownPlayerId', p_own_player_id,
        'globalPlayerId', created_global_id,
        'membershipId', created_membership_id
      );
    end if;
    raise exception 'OWN_PLAYER_ID_ALREADY_EXISTS_WITH_INCOMPLETE_OR_CONTRADICTORY_IDENTITY';
  end if;

  select count(*)
    into own_team_count
  from public.equipos_rivales team
  where team.team_kind = 'own';
  if own_team_count <> 1 then
    raise exception 'OWN_TEAM_MUST_BE_UNIQUE';
  end if;
  select team.id
    into own_team_id
  from public.equipos_rivales team
  where team.team_kind = 'own';

  -- Bloqueo conservador: con datos parciales, un mismo nombre no se duplica.
  select count(distinct profile.id)
    into compatible_profile_count
  from public.players_database profile
  where (
    regexp_replace(lower(trim(profile.name)), '[^a-z0-9áéíóúüñ]+', '', 'g') =
      regexp_replace(lower(trim(p_player ->> 'name')), '[^a-z0-9áéíóúüñ]+', '', 'g')
    and (
      nullif(p_player ->> 'dob', '') is null
      or profile.dob is null
      or profile.dob = nullif(p_player ->> 'dob', '')::date
    )
  ) or (
    nullif(trim(p_player ->> 'externalSource'), '') is not null
    and nullif(trim(p_player ->> 'externalPlayerId'), '') is not null
    and lower(trim(profile.external_source)) = lower(trim(p_player ->> 'externalSource'))
    and profile.external_player_id = trim(p_player ->> 'externalPlayerId')
  ) or exists (
    select 1
    from public.player_sources existing_source
    join jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) incoming_source on true
    where existing_source.player_id = profile.id
      and nullif(trim(incoming_source ->> 'url'), '') is not null
      and lower(trim(existing_source.url)) = lower(trim(incoming_source ->> 'url'))
  );
  if compatible_profile_count > 0 then
    raise exception 'OWN_PLAYER_COMPATIBLE_GLOBAL_PROFILE_EXISTS:%', compatible_profile_count;
  end if;

  -- La función global ya persiste perfil, posiciones, fuentes y rasgos en una
  -- única transacción. Sin membership no genera todavía la proyección propia.
  select public.save_global_player_profile(
    p_player - 'id' - 'globalPlayerId',
    p_positions,
    p_sources,
    p_traits,
    null
  ) into created_global_id;

  update public.players_database
  set shirt_name = nullif(trim(p_player ->> 'shirtName'), '')
  where id = created_global_id;

  insert into public.player_team_memberships (
    player_id, team_id, season, start_date, is_current, number,
    captain, is_key, observed, squad_role, source_url
  ) values (
    created_global_id,
    own_team_id,
    nullif(p_player ->> 'season', ''),
    nullif(p_player ->> 'startDate', '')::date,
    true,
    nullif(p_player ->> 'number', ''),
    coalesce((p_player ->> 'captain')::boolean, false),
    coalesce((p_player ->> 'isKey')::boolean, false),
    coalesce((p_player ->> 'observed')::boolean, false),
    nullif(p_player ->> 'role', ''),
    nullif(p_player ->> 'sourceUrl', '')
  ) returning id into created_membership_id;

  select item.position_key
    into natural_position_key
  from jsonb_to_recordset(coalesce(p_positions, '[]'::jsonb))
    as item(position_type text, position_key text, is_primary boolean)
  where item.position_type = 'natural'
  order by item.is_primary desc
  limit 1;
  position_label := case natural_position_key
    when 'goalkeeper' then 'Portero'
    when 'defender' then 'Defensa'
    when 'midfielder' then 'Centrocampista'
    when 'forward' then 'Delantero'
    else ''
  end;
  photo_url := nullif(p_player ->> 'photoUrl', '');

  insert into public.jugadores (
    id, name, shirt_name, google_forms_name, dob, number, position, foot,
    image, original_image, global_player_id, membership_id, active_in_squad
  ) values (
    p_own_player_id,
    trim(p_player ->> 'name'),
    nullif(trim(p_player ->> 'shirtName'), ''),
    nullif(trim(p_player ->> 'googleFormsName'), ''),
    nullif(p_player ->> 'dob', '')::date,
    coalesce(nullif(regexp_replace(coalesce(p_player ->> 'number', ''), '[^0-9]', '', 'g'), ''), '0')::integer,
    position_label,
    coalesce(nullif(p_player ->> 'foot', ''), ''),
    coalesce(photo_url, ''),
    photo_url,
    created_global_id,
    created_membership_id,
    true
  );

  insert into public.legacy_own_player_migration (
    legacy_player_id, global_player_id, membership_id, match_basis, review_status
  ) values (
    p_own_player_id, created_global_id, created_membership_id, 'atomic_own_player_create', 'confirmed'
  );

  return jsonb_build_object(
    'status', 'created',
    'ownPlayerId', p_own_player_id,
    'globalPlayerId', created_global_id,
    'membershipId', created_membership_id
  );
end;
$$;

comment on function public.create_own_player_atomic(uuid, jsonb, jsonb, jsonb, jsonb) is
  'Crea de forma atómica perfil global, membership propio, proyección jugadores y mapeo legacy. El UUID propio actúa como clave idempotente.';

commit;
