-- Verificador de solo lectura para la propuesta manual de vinculación.
-- No inserta, actualiza ni elimina filas.
with requested(label, expected_name, player_id) as (
  values
    ('pepin', 'pepin', '8cc7cc91-b40d-4035-8812-1195f655afd9'::uuid),
    ('pepe', 'pepe', 'c59b5602-8c55-4d35-b164-eabca4858daa'::uuid),
    ('pepin2', 'pepin2', '61a95402-163c-464c-9032-78a1826b72d5'::uuid)
),
target as (
  select cts.id, cts.club_id, team.id as team_id, legacy_team.name as team_name,
    season.label as season_label, season.status as season_status,
    legacy_team.team_kind
  from public.club_team_seasons cts
  join public.club_teams team
    on team.id = cts.team_id and team.club_id = cts.club_id
  join public.club_seasons season
    on season.id = cts.season_id and season.club_id = cts.club_id
  join public.equipos_rivales legacy_team on legacy_team.id = team.id
  where cts.id = '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
)
select requested.label,
  requested.player_id,
  profile.name as profile_name,
  profile.dob,
  target.id as target_cts_id,
  target.team_name,
  target.season_label,
  target.season_status,
  coalesce(roster.cts_rows, 0) as cts_rows_for_profile,
  coalesce(stages.stage_rows, 0) as stage_rows_for_profile,
  coalesce(fichas.legacy_player_rows, 0) as legacy_player_rows_for_profile,
  coalesce(migrations.migration_rows, 0) as legacy_migration_rows_for_profile,
  case
    when profile.id is null then 'REVIEW_PROFILE_MISSING'
    when lower(btrim(profile.name)) <> requested.expected_name then 'REVIEW_NAME_MISMATCH'
    when target.id is null or target.team_kind <> 'own'
      or lower(btrim(target.team_name)) <> 'al-madina sc'
      or target.season_label <> '2026/2027'
      or target.season_status <> 'open' then 'REVIEW_TARGET_NOT_OPEN_OWN_CTS'
    when coalesce(roster.cts_rows, 0) <> 0
      or coalesce(stages.stage_rows, 0) <> 0
      or coalesce(fichas.legacy_player_rows, 0) <> 0
      or coalesce(migrations.migration_rows, 0) <> 0 then 'REVIEW_EXISTING_AFFILIATION'
    else 'ELIGIBLE_FOR_MANUAL_PROPOSAL'
  end as proposed_action
from requested
left join public.players_database profile on profile.id = requested.player_id
left join target on true
left join lateral (
  select count(*) as cts_rows
  from public.club_team_season_players roster_row
  where roster_row.player_id = requested.player_id
) roster on true
left join lateral (
  select count(*) as stage_rows
  from public.player_team_memberships stage_row
  where stage_row.player_id = requested.player_id
) stages on true
left join lateral (
  select count(*) as legacy_player_rows
  from public.jugadores ficha_row
  where ficha_row.global_player_id = requested.player_id
) fichas on true
left join lateral (
  select count(*) as migration_rows
  from public.legacy_own_player_migration migration_row
  where migration_row.global_player_id = requested.player_id
) migrations on true
order by requested.label;
