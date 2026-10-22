-- Multiclub 02B: SOLO LECTURA. Ejecutar manualmente en Supabase SQL Editor.
-- No insertar enlaces a partir de este resultado sin revisar cada fila.
-- Las coincidencias usan UUID de jugador global y equipo; los nombres solo
-- facilitan la revision humana y NUNCA intervienen en la correspondencia.
-- Se esperan 24 filas: una por ficha y una pertenencia CTSP por ficha.

with correspondences as (
  select
    ficha.id as jugador_id,
    ficha.name as ficha_nombre,
    ficha.global_player_id,
    global_player.name as global_player_nombre,
    ficha.membership_id as player_team_membership_id,
    stage.player_id as stage_player_id,
    stage.team_id as stage_team_id,
    candidate.club_team_season_player_id,
    candidate.ctsp_player_id,
    candidate.club_team_season_id,
    candidate.club_id,
    club.name as club_nombre,
    candidate.team_id as cts_team_id,
    team.code as team_code,
    sports_team.name as team_nombre,
    candidate.season_id,
    season.code as season_code,
    season.label as season_label,
    candidate.joined_on as ctsp_joined_on_existing,
    candidate.left_on as ctsp_left_on_existing,
    existing.club_team_season_player_id as linked_ctsp_id_existing,
    team.club_id as team_club_id,
    season.club_id as season_club_id
  from public.jugadores ficha
  left join public.players_database global_player
    on global_player.id = ficha.global_player_id
  left join public.player_team_memberships stage
    on stage.id = ficha.membership_id
  left join lateral (
    select roster.id as club_team_season_player_id,
           roster.player_id as ctsp_player_id,
           roster.club_team_season_id,
           relation.club_id, relation.team_id, relation.season_id,
           roster.joined_on, roster.left_on
    from public.club_team_season_players roster
    join public.club_team_seasons relation
      on relation.id = roster.club_team_season_id
    where roster.voided_at is null
      and roster.player_id = ficha.global_player_id
      and relation.team_id = stage.team_id
  ) candidate on true
  left join public.clubs club on club.id = candidate.club_id
  left join public.club_teams team
    on team.id = candidate.team_id
  left join public.equipos_rivales sports_team
    on sports_team.id = candidate.team_id
  left join public.club_seasons season
    on season.id = candidate.season_id
  left join public.legacy_jugador_cts_links_v1 existing
    on existing.jugador_id = ficha.id
), audited as (
  select correspondences.*,
         count(club_team_season_player_id) over (partition by jugador_id)
           as ctsp_candidates_for_ficha,
         case when club_team_season_player_id is null then 0
              else count(*) over (partition by club_team_season_player_id)
         end as fichas_sharing_ctsp,
         count(*) over () as result_rows
  from correspondences
)
select
  jugador_id, ficha_nombre, global_player_id, global_player_nombre,
  player_team_membership_id, stage_player_id, stage_team_id,
  club_team_season_player_id, ctsp_player_id, club_team_season_id,
  club_id, club_nombre, cts_team_id, team_code, team_nombre,
  season_id, season_code, season_label,
  ctsp_joined_on_existing, ctsp_left_on_existing,
  linked_ctsp_id_existing,
  ctsp_candidates_for_ficha, fichas_sharing_ctsp, result_rows,
  coalesce(global_player_id = stage_player_id, false)
    as same_global_player_in_stage,
  coalesce(global_player_id = ctsp_player_id, false)
    as same_global_player_in_ctsp,
  coalesce(stage_team_id = cts_team_id, false)
    as same_team_in_stage_and_cts,
  coalesce(team_club_id = club_id and season_club_id = club_id, false)
    as same_club_in_team_and_season,
  linked_ctsp_id_existing is null
    or linked_ctsp_id_existing = club_team_season_player_id
    as existing_link_compatible,
  (ctsp_candidates_for_ficha = 1
   and fichas_sharing_ctsp = 1
   and global_player_id is not null
   and global_player_nombre is not null
   and coalesce(global_player_id = stage_player_id, false)
   and coalesce(global_player_id = ctsp_player_id, false)
   and coalesce(stage_team_id = cts_team_id, false)
   and coalesce(team_club_id = club_id and season_club_id = club_id, false)
   and (linked_ctsp_id_existing is null
        or linked_ctsp_id_existing = club_team_season_player_id))
    as passes_automatic_checks
from audited
order by ficha_nombre, jugador_id, club_team_season_player_id;
