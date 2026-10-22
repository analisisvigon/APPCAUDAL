-- Multiclub 03, fase B. Instalar MANUALMENTE despues de fase A.
-- Version CTS explicita del alta atomica; no reemplaza la RPC legacy.
-- Requiere revisar el contrato de save_global_player_profile en preflight.
begin;

do $preflight$
declare p record;
begin
  if auth.uid() is not null then raise exception 'Instalar sin JWT de usuario'; end if;
  if to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is not null
    or to_regprocedure('public.my_cts_jugadores_v1(uuid)') is null then
    raise exception 'Fase B ya existe o falta fase A';
  end if;
  select prosecdef, proowner, prosrc into p from pg_proc
  where oid = to_regprocedure('public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)');
  if not found or p.prosecdef or p.proowner <> 'postgres'::regrole
    or position('if p_membership is not null' in p.prosrc) = 0 then
    raise exception 'Contrato save_global_player_profile inesperado';
  end if;
end
$preflight$;

create function public.create_own_player_atomic_v2(
  p_club_team_season_id uuid,
  p_own_player_id uuid,
  p_player jsonb,
  p_positions jsonb default '[]'::jsonb,
  p_sources jsonb default '[]'::jsonb,
  p_traits jsonb default '[]'::jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $function$
declare
  target_team_id uuid;
  target_club_id uuid;
  actor_membership_id uuid;
  actor_membership_count integer;
  created_global_id uuid;
  created_stage_id uuid;
  created_ctsp_id uuid;
  existing_ficha record;
  natural_position_key text;
  position_label text;
  photo_url text;
begin
  if auth.uid() is null or p_club_team_season_id is null
    or not public.can_write_club_team_season(p_club_team_season_id) then
    raise exception 'CTS_WRITE_DENIED' using errcode = '42501';
  end if;
  if p_own_player_id is null or nullif(pg_catalog.btrim(p_player->>'name'), '') is null
    or nullif(p_player->>'id', '') is not null
    or nullif(p_player->>'globalPlayerId', '') is not null then
    raise exception 'OWN_PLAYER_INPUT_INVALID' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_positions, 'null'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_sources, 'null'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_traits, 'null'::jsonb)) <> 'array' then
    raise exception 'OWN_PLAYER_ARRAYS_INVALID' using errcode = '22023';
  end if;

  select cts.team_id, cts.club_id into target_team_id, target_club_id
  from public.club_team_seasons cts
  join public.club_teams team on team.id = cts.team_id and team.club_id = cts.club_id
  join public.equipos_rivales legacy_team on legacy_team.id = team.id
  where cts.id = p_club_team_season_id and legacy_team.team_kind = 'own';
  if target_team_id is null then
    raise exception 'CTS_OWN_TEAM_REQUIRED' using errcode = '22023';
  end if;

  select count(*), min(membership.id::text)::uuid
    into actor_membership_count, actor_membership_id
  from public.club_memberships membership
  where membership.user_id = auth.uid()
    and membership.club_id = target_club_id
    and membership.is_active
    and membership.role in ('owner', 'admin', 'staff');
  if actor_membership_count <> 1 then
    raise exception 'CTS_MEMBERSHIP_AMBIGUOUS' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_own_player_id::text, 0));
  select ficha.id, ficha.global_player_id, ficha.membership_id,
         binding.club_team_season_player_id,
         roster.club_team_season_id
    into existing_ficha
  from public.jugadores ficha
  left join public.legacy_jugador_cts_links_v1 binding on binding.jugador_id = ficha.id
  left join public.club_team_season_players roster
    on roster.id = binding.club_team_season_player_id
  where ficha.id = p_own_player_id;
  if found then
    if existing_ficha.global_player_id is not null
      and existing_ficha.membership_id is not null
      and existing_ficha.club_team_season_id = p_club_team_season_id
      and exists (select 1 from public.player_team_memberships stage
        where stage.id = existing_ficha.membership_id
          and stage.player_id = existing_ficha.global_player_id
          and stage.team_id = target_team_id)
      and exists (select 1 from public.club_team_season_players roster
        where roster.id = existing_ficha.club_team_season_player_id
          and roster.player_id = existing_ficha.global_player_id
          and roster.voided_at is null) then
      return pg_catalog.jsonb_build_object(
        'status', 'already_created', 'ownPlayerId', p_own_player_id,
        'globalPlayerId', existing_ficha.global_player_id,
        'membershipId', existing_ficha.membership_id);
    end if;
    raise exception 'OWN_PLAYER_ID_CONFLICT' using errcode = '23505';
  end if;

  -- Conserva la proteccion contra duplicados del alta legacy, sin usar nombres
  -- para determinar el CTS. El CTS siempre procede del parametro autorizado.
  if exists (
    select 1 from public.players_database profile
    where (
      pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(profile.name)),
        '[^a-z0-9áéíóúüñ]+', '', 'g') =
      pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(p_player->>'name')),
        '[^a-z0-9áéíóúüñ]+', '', 'g')
      and (nullif(p_player->>'dob', '') is null or profile.dob is null
        or profile.dob = nullif(p_player->>'dob', '')::date)
    ) or (
      nullif(pg_catalog.btrim(p_player->>'externalSource'), '') is not null
      and nullif(pg_catalog.btrim(p_player->>'externalPlayerId'), '') is not null
      and pg_catalog.lower(pg_catalog.btrim(profile.external_source)) =
        pg_catalog.lower(pg_catalog.btrim(p_player->>'externalSource'))
      and profile.external_player_id = pg_catalog.btrim(p_player->>'externalPlayerId')
    ) or exists (
      select 1 from public.player_sources source
      join pg_catalog.jsonb_array_elements(p_sources) incoming on true
      where source.player_id = profile.id
        and nullif(pg_catalog.btrim(incoming->>'url'), '') is not null
        and pg_catalog.lower(pg_catalog.btrim(source.url)) =
          pg_catalog.lower(pg_catalog.btrim(incoming->>'url'))
    )
  ) then
    raise exception 'OWN_PLAYER_COMPATIBLE_GLOBAL_PROFILE_EXISTS' using errcode = '23505';
  end if;

  -- La funcion legacy guarda perfil, posiciones, fuentes y rasgos. Se llama
  -- ANTES de crear una pertenencia propia: no genera una ficha automaticamente.
  select public.save_global_player_profile(
    p_player - 'id' - 'globalPlayerId', p_positions, p_sources, p_traits, null
  ) into created_global_id;
  update public.players_database
  set shirt_name = nullif(pg_catalog.btrim(p_player->>'shirtName'), '')
  where id = created_global_id;

  insert into public.player_team_memberships (
    player_id, team_id, season, start_date, is_current, number,
    captain, is_key, observed, squad_role, source_url
  ) values (
    created_global_id, target_team_id,
    nullif(p_player->>'season', ''), nullif(p_player->>'startDate', '')::date,
    true, nullif(p_player->>'number', ''),
    coalesce((p_player->>'captain')::boolean, false),
    coalesce((p_player->>'isKey')::boolean, false),
    coalesce((p_player->>'observed')::boolean, false),
    nullif(p_player->>'role', ''), nullif(p_player->>'sourceUrl', '')
  ) returning id into created_stage_id;

  select item.position_key into natural_position_key
  from pg_catalog.jsonb_to_recordset(p_positions)
    as item(position_type text, position_key text, is_primary boolean)
  where item.position_type = 'natural'
  order by item.is_primary desc limit 1;
  position_label := case natural_position_key
    when 'goalkeeper' then 'Portero' when 'defender' then 'Defensa'
    when 'midfielder' then 'Centrocampista' when 'forward' then 'Delantero'
    else '' end;
  photo_url := nullif(p_player->>'photoUrl', '');

  insert into public.jugadores (
    id, name, shirt_name, google_forms_name, dob, number, position, foot,
    image, original_image, global_player_id, membership_id, active_in_squad
  ) values (
    p_own_player_id, pg_catalog.btrim(p_player->>'name'),
    nullif(pg_catalog.btrim(p_player->>'shirtName'), ''),
    nullif(pg_catalog.btrim(p_player->>'googleFormsName'), ''),
    nullif(p_player->>'dob', '')::date,
    coalesce(nullif(pg_catalog.regexp_replace(coalesce(p_player->>'number', ''),
      '[^0-9]', '', 'g'), ''), '0')::integer,
    position_label, coalesce(nullif(p_player->>'foot', ''), ''),
    coalesce(photo_url, ''), photo_url, created_global_id, created_stage_id, true
  );
  insert into public.club_team_season_players (
    club_team_season_id, player_id, created_by_membership_id
  ) values (
    p_club_team_season_id, created_global_id, actor_membership_id
  ) returning id into created_ctsp_id;
  insert into public.legacy_jugador_cts_links_v1 (
    jugador_id, club_team_season_player_id
  ) values (p_own_player_id, created_ctsp_id);
  insert into public.legacy_own_player_migration (
    legacy_player_id, global_player_id, membership_id, match_basis, review_status
  ) values (
    p_own_player_id, created_global_id, created_stage_id,
    'atomic_own_player_create', 'confirmed'
  );
  return pg_catalog.jsonb_build_object(
    'status', 'created', 'ownPlayerId', p_own_player_id,
    'globalPlayerId', created_global_id, 'membershipId', created_stage_id);
end;
$function$;

alter function public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)
  owner to postgres;
revoke all on function public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)
  to authenticated;
commit;
