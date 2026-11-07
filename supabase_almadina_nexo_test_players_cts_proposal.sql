-- Propuesta MANUAL y acotada para vincular tres perfiles globales ya existentes.
-- Instalar esta funcion no modifica jugadores ni ejecuta las vinculaciones.
-- La llamada requiere JWT de usuario y permisos CTS; no usar service_role.
begin;

do $preflight$
begin
  if auth.uid() is not null then
    raise exception 'Instalar sin JWT de usuario';
  end if;
  if to_regprocedure('public.link_proposed_orphan_global_player_to_cts_v1(uuid,uuid)') is not null then
    raise exception 'La funcion de propuesta ya existe; revisar antes de repetir';
  end if;
  if to_regclass('public.players_database') is null
    or to_regclass('public.player_positions') is null
    or to_regclass('public.player_team_memberships') is null
    or to_regclass('public.club_team_season_players') is null
    or to_regclass('public.legacy_jugador_cts_links_v1') is null
    or to_regclass('public.legacy_own_player_migration') is null
    or to_regclass('public.jugadores') is null
    or to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Faltan dependencias CTS para la propuesta';
  end if;
end
$preflight$;

create function public.link_proposed_orphan_global_player_to_cts_v1(
  p_club_team_season_id uuid,
  p_global_player_id uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog
as $function$
declare
  target_team_id uuid;
  target_club_id uuid;
  target_team_name text;
  target_season_label text;
  actor_membership_id uuid;
  actor_membership_count integer;
  created_stage_id uuid;
  created_ctsp_id uuid;
  created_legacy_id uuid;
  target_profile public.players_database%rowtype;
  natural_position_key text;
  position_label text;
begin
  if auth.uid() is null
    or p_club_team_season_id is null
    or p_global_player_id is null
    or p_club_team_season_id <> '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
    or p_global_player_id not in (
      '8cc7cc91-b40d-4035-8812-1195f655afd9'::uuid,
      'c59b5602-8c55-4d35-b164-eabca4858daa'::uuid,
      '61a95402-163c-464c-9032-78a1826b72d5'::uuid
    )
    or public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'CTS_WRITE_DENIED' using errcode = '42501';
  end if;

  select cts.team_id, cts.club_id, legacy_team.name, season.label
    into target_team_id, target_club_id, target_team_name, target_season_label
  from public.club_team_seasons cts
  join public.club_teams team
    on team.id = cts.team_id and team.club_id = cts.club_id
  join public.club_seasons season
    on season.id = cts.season_id and season.club_id = cts.club_id
   and season.status = 'open'
  join public.equipos_rivales legacy_team
    on legacy_team.id = team.id and legacy_team.team_kind = 'own'
  where cts.id = p_club_team_season_id;
  if target_team_id is null
    or pg_catalog.lower(pg_catalog.btrim(target_team_name)) <> 'al-madina sc'
    or target_season_label <> '2026/2027' then
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
    pg_catalog.hashtextextended(p_global_player_id::text, 1));

  select profile.* into target_profile
  from public.players_database profile
  where profile.id = p_global_player_id
  for update;
  if not found then
    raise exception 'GLOBAL_PLAYER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (
    (p_global_player_id = '8cc7cc91-b40d-4035-8812-1195f655afd9'::uuid
      and pg_catalog.lower(pg_catalog.btrim(target_profile.name)) = 'pepin')
    or (p_global_player_id = 'c59b5602-8c55-4d35-b164-eabca4858daa'::uuid
      and pg_catalog.lower(pg_catalog.btrim(target_profile.name)) = 'pepe')
    or (p_global_player_id = '61a95402-163c-464c-9032-78a1826b72d5'::uuid
      and pg_catalog.lower(pg_catalog.btrim(target_profile.name)) = 'pepin2')
  ) then
    raise exception 'GLOBAL_PLAYER_IDENTITY_MISMATCH' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.club_team_season_players roster
    where roster.player_id = p_global_player_id
  ) or exists (
    select 1 from public.player_team_memberships stage
    where stage.player_id = p_global_player_id
  ) or exists (
    select 1 from public.jugadores ficha
    where ficha.global_player_id = p_global_player_id
  ) or exists (
    select 1 from public.legacy_own_player_migration migration
    where migration.global_player_id = p_global_player_id
  ) then
    raise exception 'GLOBAL_PLAYER_NOT_ORPHAN_REVIEW_REQUIRED'
      using errcode = '23505';
  end if;

  insert into public.player_team_memberships (
    player_id, team_id, season, is_current
  ) values (
    p_global_player_id, target_team_id, target_season_label, true
  ) returning id into created_stage_id;

  insert into public.club_team_season_players (
    club_team_season_id, player_id, created_by_membership_id
  ) values (
    p_club_team_season_id, p_global_player_id, actor_membership_id
  ) returning id into created_ctsp_id;

  select item.position_key into natural_position_key
  from public.player_positions item
  where item.player_id = p_global_player_id
    and item.position_type = 'natural'
  order by item.is_primary desc
  limit 1;
  position_label := case natural_position_key
    when 'goalkeeper' then 'Portero'
    when 'defender' then 'Defensa'
    when 'midfielder' then 'Centrocampista'
    when 'forward' then 'Delantero'
    else '' end;

  created_legacy_id := pg_catalog.gen_random_uuid();
  insert into public.jugadores (
    id, name, shirt_name, dob, number, position, foot, image,
    original_image, global_player_id, membership_id, active_in_squad
  ) values (
    created_legacy_id, target_profile.name, target_profile.shirt_name,
    target_profile.dob, 0, position_label, coalesce(target_profile.foot, ''),
    coalesce(target_profile.photo_url, ''), target_profile.photo_url,
    p_global_player_id, created_stage_id, true
  );

  insert into public.legacy_jugador_cts_links_v1 (
    jugador_id, club_team_season_player_id
  ) values (created_legacy_id, created_ctsp_id);
  insert into public.legacy_own_player_migration (
    legacy_player_id, global_player_id, membership_id, match_basis, review_status
  ) values (
    created_legacy_id, p_global_player_id, created_stage_id,
    'approved_orphan_cts_proposal', 'confirmed'
  );

  return pg_catalog.jsonb_build_object(
    'status', 'linked',
    'ownPlayerId', created_legacy_id,
    'globalPlayerId', p_global_player_id,
    'membershipId', created_stage_id,
    'clubTeamSeasonPlayerId', created_ctsp_id
  );
end;
$function$;

alter function public.link_proposed_orphan_global_player_to_cts_v1(uuid,uuid)
  owner to postgres;
revoke all on function public.link_proposed_orphan_global_player_to_cts_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.link_proposed_orphan_global_player_to_cts_v1(uuid,uuid)
  to authenticated;

comment on function public.link_proposed_orphan_global_player_to_cts_v1(uuid,uuid) is
  'Vinculacion manual acotada a tres perfiles preexistentes y al CTS Al-Madina 2026/2027. Rechaza cualquier afiliacion o ficha previa.';

commit;
