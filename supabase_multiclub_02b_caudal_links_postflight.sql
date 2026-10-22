-- Multiclub 02B: SOLO LECTURA. Ejecutar tras la futura insercion revisada.
-- No sustituye la comparacion con los 24 pares UUID aprobados manualmente.
with duplicate_ctsp as (
  select club_team_season_player_id
  from public.legacy_jugador_cts_links_v1
  group by club_team_season_player_id
  having count(*) > 1
), checked as (
  select ficha.id as jugador_id,
         binding.club_team_season_player_id,
         roster.player_id as ctsp_player_id,
         roster.voided_at,
         relation.id as club_team_season_id,
         relation.club_id,
         relation.team_id as cts_team_id,
         stage.player_id as stage_player_id,
         stage.team_id as stage_team_id,
         ficha.global_player_id,
         team.club_id as team_club_id,
         season.club_id as season_club_id,
         case when binding.jugador_id is null then false
              else coalesce(
                roster.voided_at is null
                and ficha.global_player_id = stage.player_id
                and ficha.global_player_id = roster.player_id
                and stage.team_id = relation.team_id
                and team.club_id = relation.club_id
                and season.club_id = relation.club_id,
                false
              )
         end as valid_link
  from public.jugadores ficha
  left join public.legacy_jugador_cts_links_v1 binding
    on binding.jugador_id = ficha.id
  left join public.player_team_memberships stage
    on stage.id = ficha.membership_id
  left join public.club_team_season_players roster
    on roster.id = binding.club_team_season_player_id
  left join public.club_team_seasons relation
    on relation.id = roster.club_team_season_id
  left join public.club_teams team
    on team.id = relation.team_id
  left join public.club_seasons season
    on season.id = relation.season_id
)
select count(*) as ficha_count,
       count(club_team_season_player_id) as link_count,
       count(*) filter (where club_team_season_player_id is null)
         as fichas_without_link,
       count(*) filter (where club_team_season_player_id is not null
                         and not valid_link) as incorrect_links,
       count(distinct club_id) filter (where valid_link)
         as clubs_with_valid_links,
       (select count(*) from duplicate_ctsp) as duplicated_ctsp_count,
       (count(*) = 24
        and count(club_team_season_player_id) = 24
        and count(*) filter (where not valid_link) = 0
        and count(distinct club_id) filter (where valid_link) = 1
        and (select count(*) from duplicate_ctsp) = 0)
         as structural_24_link_check_passes
from checked;

select club_team_season_player_id, count(*) as fichas_using_same_ctsp
from public.legacy_jugador_cts_links_v1
group by club_team_season_player_id
having count(*) > 1
order by club_team_season_player_id;

select relation.club_id, club.name as club_nombre,
       relation.id as club_team_season_id,
       count(*) as linked_fichas
from public.legacy_jugador_cts_links_v1 binding
join public.club_team_season_players roster
  on roster.id = binding.club_team_season_player_id
join public.club_team_seasons relation
  on relation.id = roster.club_team_season_id
join public.clubs club on club.id = relation.club_id
group by relation.club_id, club.name, relation.id
order by club.name, relation.id;

-- Confirmar que el postflight 02B no ha cambiado las politicas legacy.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('jugadores', 'partidos')
order by tablename, policyname;
