-- Verificador de solo lectura para determinar el destino real de los tres
-- perfiles y si sus registros legacy pueden reutilizarse sin duplicarlos.
-- No inserta, actualiza ni elimina filas.
with requested(label, expected_name, player_id) as (
  values
    ('pepin', 'pepin', '8cc7cc91-b40d-4035-8812-1195f655afd9'::uuid),
    ('pepe', 'pepe', 'c59b5602-8c55-4d35-b164-eabca4858daa'::uuid),
    ('pepin2', 'pepin2', '61a95402-163c-464c-9032-78a1826b72d5'::uuid)
),
target as (
  select cts.id, cts.club_id, club.name as club_name,
    team.id as team_id, team.code as team_code,
    legacy_team.name as team_name, legacy_team.team_kind,
    season.id as season_id, season.label as season_label,
    season.status as season_status,
    season.starts_on as season_starts_on,
    season.ends_on as season_ends_on
  from public.club_team_seasons cts
  join public.clubs club on club.id = cts.club_id
  join public.club_teams team
    on team.id = cts.team_id and team.club_id = cts.club_id
  join public.club_seasons season
    on season.id = cts.season_id and season.club_id = cts.club_id
  join public.equipos_rivales legacy_team on legacy_team.id = team.id
  where cts.id = '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
),
diagnostics as (
  select requested.*,
    profile.name as profile_name,
    profile.dob,
    target.id as target_cts_id,
    target.club_id as target_club_id,
    target.club_name,
    target.team_id as target_team_id,
    target.team_code,
    target.team_name,
    target.team_kind,
    target.season_id as target_season_id,
    target.season_label,
    target.season_status,
    target.season_starts_on,
    target.season_ends_on,
    coalesce(stages.row_count, 0) as stage_count,
    coalesce(stages.rows, '[]'::jsonb) as stage_rows,
    coalesce(fichas.row_count, 0) as legacy_player_count,
    coalesce(fichas.rows, '[]'::jsonb) as legacy_player_rows,
    coalesce(migrations.row_count, 0) as migration_count,
    coalesce(migrations.rows, '[]'::jsonb) as migration_rows,
    coalesce(bindings.row_count, 0) as binding_count,
    coalesce(bindings.rows, '[]'::jsonb) as binding_rows,
    coalesce(all_roster.row_count, 0) as all_cts_row_count,
    coalesce(all_roster.rows, '[]'::jsonb) as all_cts_rows,
    coalesce(roster.row_count, 0) as target_cts_row_count,
    coalesce(roster.rows, '[]'::jsonb) as target_cts_rows
  from requested
  left join public.players_database profile on profile.id = requested.player_id
  left join target on true
  left join lateral (
    select count(*) as row_count,
      jsonb_agg(jsonb_build_object(
        'id', roster.id, 'cts_id', roster.club_team_season_id,
        'player_id', roster.player_id, 'joined_on', roster.joined_on,
        'left_on', roster.left_on, 'has_departed', roster.has_departed,
        'voided_at', roster.voided_at
      ) order by roster.created_at, roster.id) as rows
    from public.club_team_season_players roster
    where roster.player_id = requested.player_id
  ) all_roster on true
  left join lateral (
    select count(*) as row_count,
      jsonb_agg(jsonb_build_object(
        'id', stage.id, 'team_id', stage.team_id,
        'team_name', stage_team.name, 'team_kind', stage_team.team_kind,
        'season', stage.season, 'is_current', stage.is_current,
        'start_date', stage.start_date, 'end_date', stage.end_date
      ) order by stage.created_at, stage.id) as rows
    from public.player_team_memberships stage
    left join public.equipos_rivales stage_team on stage_team.id = stage.team_id
    where stage.player_id = requested.player_id
  ) stages on true
  left join lateral (
    select count(*) as row_count,
      jsonb_agg(jsonb_build_object(
        'id', ficha.id, 'name', ficha.name,
        'global_player_id', ficha.global_player_id,
        'membership_id', ficha.membership_id,
        'active_in_squad', ficha.active_in_squad
      ) order by ficha.id) as rows
    from public.jugadores ficha
    where ficha.global_player_id = requested.player_id
  ) fichas on true
  left join lateral (
    select count(*) as row_count,
      jsonb_agg(jsonb_build_object(
        'legacy_player_id', migration.legacy_player_id,
        'global_player_id', migration.global_player_id,
        'membership_id', migration.membership_id,
        'match_basis', migration.match_basis,
        'review_status', migration.review_status
      ) order by migration.legacy_player_id) as rows
    from public.legacy_own_player_migration migration
    where migration.global_player_id = requested.player_id
  ) migrations on true
  left join lateral (
    select count(*) as row_count,
      jsonb_agg(jsonb_build_object(
        'jugador_id', binding.jugador_id,
        'club_team_season_player_id', binding.club_team_season_player_id,
        'cts_id', roster.club_team_season_id,
        'cts_player_id', roster.player_id,
        'voided_at', roster.voided_at,
        'has_departed', roster.has_departed
      ) order by binding.jugador_id) as rows
    from public.legacy_jugador_cts_links_v1 binding
    join public.jugadores ficha on ficha.id = binding.jugador_id
    left join public.club_team_season_players roster
      on roster.id = binding.club_team_season_player_id
    where ficha.global_player_id = requested.player_id
  ) bindings on true
  left join lateral (
    select count(*) as row_count,
      jsonb_agg(jsonb_build_object(
        'id', roster.id, 'cts_id', roster.club_team_season_id,
        'player_id', roster.player_id, 'joined_on', roster.joined_on,
        'left_on', roster.left_on, 'has_departed', roster.has_departed,
        'voided_at', roster.voided_at
      ) order by roster.created_at, roster.id) as rows
    from public.club_team_season_players roster
    where roster.player_id = requested.player_id
      and roster.club_team_season_id = target.id
  ) roster on true
)
select diagnostics.*,
  case
    when profile_name is null then 'REVIEW_PROFILE_MISSING'
    when lower(btrim(profile_name)) <> expected_name then 'REVIEW_NAME_MISMATCH'
    when target_cts_id is null then 'REVIEW_TARGET_CTS_MISSING'
    when lower(btrim(club_name)) <> 'al-madina sc'
      or lower(btrim(team_name)) <> 'al-madina sc sub-23'
      or team_kind <> 'own'
      or season_label <> '2026/2027'
      or season_status <> 'open' then 'REVIEW_TARGET_IDENTITY_OR_STATUS'
    when stage_count <> 1 then 'REVIEW_STAGE_COUNT'
    when not exists (
      select 1
      from jsonb_array_elements(stage_rows) as stage(item)
      where stage.item->>'team_id' = target_team_id::text
        and (
          stage.item->>'season' is null
          or stage.item->>'season' = season_label
        )
        and stage.item->>'is_current' = 'true'
        and stage.item->>'end_date' is null
        and (
          stage.item->>'start_date' is null
          or (stage.item->>'start_date')::date between season_starts_on and season_ends_on
        )
    ) then 'REVIEW_STAGE_NOT_TARGET_CURRENT_TEAM_SEASON'
    when legacy_player_count <> 1 then 'REVIEW_LEGACY_PLAYER_COUNT'
    when not exists (
      select 1
      from jsonb_array_elements(legacy_player_rows) as ficha(item)
      where ficha.item->>'membership_id' in (
        select stage.item->>'id' from jsonb_array_elements(stage_rows) as stage(item)
      )
        and ficha.item->>'active_in_squad' = 'true'
    ) then 'REVIEW_LEGACY_PLAYER_STAGE_OR_STATUS_MISMATCH'
    when migration_count <> 1 then 'REVIEW_MIGRATION_COUNT'
    when not exists (
      select 1
      from jsonb_array_elements(migration_rows) as migration(item)
      join jsonb_array_elements(legacy_player_rows) as ficha(item)
        on migration.item->>'legacy_player_id' = ficha.item->>'id'
       and migration.item->>'membership_id' = ficha.item->>'membership_id'
       and migration.item->>'global_player_id' = player_id::text
      where migration.item->>'match_basis' = 'atomic_own_player_create'
        and migration.item->>'review_status' = 'confirmed'
    ) then 'REVIEW_MIGRATION_IDENTITY_MISMATCH'
    when binding_count <> 0 then 'REVIEW_EXISTING_CTS_BINDING'
    when all_cts_row_count <> 0 then 'REVIEW_EXISTING_CTS_MEMBERSHIP'
    else 'READY_RECOVER_EXISTING_ROWS'
  end as proposed_action
from diagnostics
order by label;
