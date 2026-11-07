-- Recuperacion MANUAL de la pertenencia CTS para tres perfiles ya creados.
-- Instalar la funcion no modifica datos. Ejecutar su RPC solo despues de que
-- el verificador muestre READY_RECOVER_EXISTING_ROWS para cada perfil.
-- Reutiliza etapa, ficha y migracion existentes: no crea perfiles ni fichas,
-- no cambia etapas/migraciones, y no toca bajas ni otras pertenencias.
-- La llamada requiere JWT de usuario autenticado; no usar service_role.
begin;

do $preflight$
begin
  if auth.uid() is not null then
    raise exception 'Instalar sin JWT de usuario';
  end if;
  if to_regprocedure('public.recover_nexo_test_player_cts_link_v1(uuid,uuid)') is not null then
    raise exception 'La funcion de recuperacion ya existe; revisar antes de repetir';
  end if;
  if to_regclass('public.clubs') is null
    or to_regclass('public.club_teams') is null
    or to_regclass('public.club_seasons') is null
    or to_regclass('public.club_team_seasons') is null
    or to_regclass('public.equipos_rivales') is null
    or to_regclass('public.players_database') is null
    or to_regclass('public.player_team_memberships') is null
    or to_regclass('public.club_memberships') is null
    or to_regclass('public.club_team_season_players') is null
    or to_regclass('public.legacy_jugador_cts_links_v1') is null
    or to_regclass('public.legacy_own_player_migration') is null
    or to_regclass('public.jugadores') is null
    or to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Faltan dependencias CTS para la recuperacion';
  end if;
end
$preflight$;

create function public.recover_nexo_test_player_cts_link_v1(
  p_club_team_season_id uuid,
  p_global_player_id uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog
as $function$
declare
  target_team_id uuid;
  target_club_id uuid;
  target_club_name text;
  target_team_name text;
  target_season_label text;
  target_season_status text;
  actor_membership_id uuid;
  actor_membership_count integer;
  profile_name text;
  stage_id uuid;
  stage_count integer;
  all_stage_count integer;
  ficha_id uuid;
  ficha_membership_id uuid;
  ficha_count integer;
  all_ficha_count integer;
  migration_count integer;
  all_migration_count integer;
  binding_count integer;
  roster_count integer;
  created_ctsp_id uuid;
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

  select cts.team_id, cts.club_id, club.name, legacy_team.name,
    season.label, season.status
    into target_team_id, target_club_id, target_club_name, target_team_name,
      target_season_label, target_season_status
  from public.club_team_seasons cts
  join public.clubs club on club.id = cts.club_id
  join public.club_teams team
    on team.id = cts.team_id and team.club_id = cts.club_id
  join public.club_seasons season
    on season.id = cts.season_id and season.club_id = cts.club_id
  join public.equipos_rivales legacy_team
    on legacy_team.id = team.id and legacy_team.team_kind = 'own'
  where cts.id = p_club_team_season_id;
  if target_team_id is null
    or pg_catalog.lower(pg_catalog.btrim(target_club_name)) <> 'al-madina sc'
    or pg_catalog.lower(pg_catalog.btrim(target_team_name)) <> 'al-madina sc sub-23'
    or target_season_label <> '2026/2027'
    or target_season_status <> 'open' then
    raise exception 'CTS_TARGET_IDENTITY_OR_STATUS_MISMATCH'
      using errcode = '22023';
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

  select profile.name into profile_name
  from public.players_database profile
  where profile.id = p_global_player_id
  for update;
  if not found or not (
    (p_global_player_id = '8cc7cc91-b40d-4035-8812-1195f655afd9'::uuid
      and pg_catalog.lower(pg_catalog.btrim(profile_name)) = 'pepin')
    or (p_global_player_id = 'c59b5602-8c55-4d35-b164-eabca4858daa'::uuid
      and pg_catalog.lower(pg_catalog.btrim(profile_name)) = 'pepe')
    or (p_global_player_id = '61a95402-163c-464c-9032-78a1826b72d5'::uuid
      and pg_catalog.lower(pg_catalog.btrim(profile_name)) = 'pepin2')
  ) then
    raise exception 'GLOBAL_PLAYER_IDENTITY_MISMATCH' using errcode = '22023';
  end if;

  select count(*),
    count(*) filter (where stage.team_id = target_team_id
      and stage.season = target_season_label and stage.is_current),
    (min(stage.id::text) filter (where stage.team_id = target_team_id
      and stage.season = target_season_label and stage.is_current))::uuid
    into all_stage_count, stage_count, stage_id
  from public.player_team_memberships stage
  where stage.player_id = p_global_player_id;
  if all_stage_count <> 1 or stage_count <> 1 then
    raise exception 'EXISTING_STAGE_NOT_UNIQUE_CURRENT_TARGET_TEAM_SEASON'
      using errcode = '23505';
  end if;

  select count(*),
    count(*) filter (where ficha.membership_id = stage_id and ficha.active_in_squad),
    (min(ficha.id::text) filter (where ficha.membership_id = stage_id
      and ficha.active_in_squad))::uuid,
    (min(ficha.membership_id::text) filter (where ficha.membership_id = stage_id
      and ficha.active_in_squad))::uuid
    into all_ficha_count, ficha_count, ficha_id, ficha_membership_id
  from public.jugadores ficha
  where ficha.global_player_id = p_global_player_id;
  if all_ficha_count <> 1 or ficha_count <> 1
    or ficha_membership_id is distinct from stage_id then
    raise exception 'EXISTING_ACTIVE_LEGACY_PLAYER_NOT_UNIQUE_OR_LINKED'
      using errcode = '23505';
  end if;

  select count(*),
    count(*) filter (where migration.legacy_player_id = ficha_id
      and migration.membership_id = stage_id)
    into all_migration_count, migration_count
  from public.legacy_own_player_migration migration
  where migration.global_player_id = p_global_player_id;
  if all_migration_count <> 1 or migration_count <> 1 then
    raise exception 'EXISTING_LEGACY_MIGRATION_NOT_UNIQUE_OR_LINKED'
      using errcode = '23505';
  end if;

  select count(*) into binding_count
  from public.legacy_jugador_cts_links_v1 binding
  where binding.jugador_id = ficha_id;
  if binding_count <> 0 then
    raise exception 'LEGACY_PLAYER_ALREADY_HAS_CTS_BINDING_REVIEW_REQUIRED'
      using errcode = '23505';
  end if;

  select count(*) into roster_count
  from public.club_team_season_players roster
  where roster.player_id = p_global_player_id;
  if roster_count <> 0 then
    raise exception 'GLOBAL_PLAYER_ALREADY_HAS_CTS_MEMBERSHIP_REVIEW_REQUIRED'
      using errcode = '23505';
  end if;

  insert into public.club_team_season_players (
    club_team_season_id, player_id, created_by_membership_id
  ) values (
    p_club_team_season_id, p_global_player_id, actor_membership_id
  ) returning id into created_ctsp_id;

  insert into public.legacy_jugador_cts_links_v1 (
    jugador_id, club_team_season_player_id
  ) values (
    ficha_id, created_ctsp_id
  );

  return pg_catalog.jsonb_build_object(
    'status', 'linked_existing_records',
    'legacyPlayerId', ficha_id,
    'globalPlayerId', p_global_player_id,
    'membershipId', stage_id,
    'clubTeamSeasonPlayerId', created_ctsp_id
  );
end;
$function$;

alter function public.recover_nexo_test_player_cts_link_v1(uuid,uuid)
  owner to postgres;
revoke all on function public.recover_nexo_test_player_cts_link_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.recover_nexo_test_player_cts_link_v1(uuid,uuid)
  to authenticated;

comment on function public.recover_nexo_test_player_cts_link_v1(uuid,uuid) is
  'Recupera solo el CTSP y el binding CTS para los tres perfiles aprobados, reutilizando etapa, ficha y migracion exactas; conserva todo el historial.';

commit;
