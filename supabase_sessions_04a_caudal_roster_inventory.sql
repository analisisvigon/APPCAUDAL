-- Sesiones 04A · inventario para decisión humana. SOLO LECTURA.
-- Ejecutar con una cuenta administrativa en SQL Editor; el CSV contiene nombres.
-- No convierte la etapa legacy ni sus fechas en pertenencia a 2026/2027.
with
constants as (
  select '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid as team_id,
         '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id
),
active_fichas as (
  select j.id as ficha_id, j.global_player_id as player_id,
         j.membership_id as stage_id, p.name as canonical_name,
         m.player_id as stage_player_id, m.team_id as stage_team_id,
         m.season as legacy_season, m.start_date as legacy_start_date,
         m.end_date as legacy_end_date, m.is_current as stage_is_current,
         count(*) over (partition by j.global_player_id) as fichas_for_player,
         count(*) over (partition by j.membership_id) as fichas_for_stage,
         count(*) over (partition by lower(btrim(p.name))) as fichas_with_same_name
  from public.jugadores j
  left join public.players_database p on p.id = j.global_player_id
  left join public.player_team_memberships m on m.id = j.membership_id
  where j.active_in_squad is true
),
current_stages_without_ficha as (
  select m.id as stage_id, m.player_id, m.team_id, m.season,
         m.start_date, m.end_date, p.name
  from public.player_team_memberships m
  join constants c on c.team_id = m.team_id
  left join public.players_database p on p.id = m.player_id
  where m.is_current is true
    and not exists (
      select 1 from public.jugadores j
      where j.active_in_squad is true
        and j.membership_id = m.id
        and j.global_player_id = m.player_id
    )
)
select 'FICHA_ACTIVA'::text as row_type,
       a.ficha_id, a.player_id, a.stage_id, a.canonical_name,
       a.stage_player_id, a.stage_team_id, a.legacy_season,
       a.legacy_start_date, a.legacy_end_date, a.stage_is_current,
       pos.primary_natural_position, pos.all_positions,
       a.fichas_for_player, a.fichas_for_stage, a.fichas_with_same_name,
       (select count(*) from public.club_team_season_players ctp
        join constants c on c.cts_id = ctp.club_team_season_id
        where ctp.player_id = a.player_id and ctp.voided_at is null) as existing_canonical_links,
       case
         when a.player_id is null or a.stage_id is null or a.canonical_name is null
           then 'BLOCKED_MISSING_CANONICAL_IDENTITY'
         when a.stage_player_id is distinct from a.player_id
           then 'BLOCKED_STAGE_PLAYER_MISMATCH'
         when a.stage_team_id is distinct from (select team_id from constants)
           then 'BLOCKED_OTHER_TEAM_OR_MISSING_STAGE'
         when a.stage_is_current is distinct from true
           then 'REVIEW_LEGACY_STAGE_NOT_CURRENT'
         when a.fichas_for_player > 1 or a.fichas_for_stage > 1
           then 'BLOCKED_DUPLICATE_ACTIVE_FICHA'
         when exists (
           select 1 from public.club_team_season_players ctp
           join constants c on c.cts_id = ctp.club_team_season_id
           where ctp.player_id = a.player_id and ctp.voided_at is null
         ) then 'ALREADY_LINKED_REVIEW'
         when a.fichas_with_same_name > 1
           then 'REVIEW_SAME_NAME_NOT_PROOF_OF_DUPLICATE'
         when pos.primary_natural_position is null
           then 'REVIEW_PRIMARY_POSITION_UNKNOWN'
         else 'CANDIDATE_OWNER_MUST_CONFIRM'
       end as finding
from active_fichas a
left join lateral (
  select max(pp.position_key) filter
           (where pp.position_type = 'natural' and pp.is_primary) as primary_natural_position,
         string_agg(pp.position_type || ':' || pp.position_key ||
           case when pp.is_primary then ':primary' else '' end,
           ', ' order by pp.position_type, pp.position_key) as all_positions
  from public.player_positions pp
  where pp.player_id = a.player_id
) pos on true
union all
select 'CURRENT_STAGE_WITHOUT_ACTIVE_FICHA', null::uuid, s.player_id,
       s.stage_id, s.name, s.player_id, s.team_id, s.season,
       s.start_date, s.end_date, true,
       pos.primary_natural_position, pos.all_positions,
       null::bigint, null::bigint, null::bigint,
       (select count(*) from public.club_team_season_players ctp
        join constants c on c.cts_id = ctp.club_team_season_id
        where ctp.player_id = s.player_id and ctp.voided_at is null),
       'REVIEW_STAGE_NOT_AUTOMATIC_CANDIDATE'
from current_stages_without_ficha s
left join lateral (
  select max(pp.position_key) filter
           (where pp.position_type = 'natural' and pp.is_primary) as primary_natural_position,
         string_agg(pp.position_type || ':' || pp.position_key ||
           case when pp.is_primary then ':primary' else '' end,
           ', ' order by pp.position_type, pp.position_key) as all_positions
  from public.player_positions pp
  where pp.player_id = s.player_id
) pos on true
order by row_type, canonical_name nulls last, player_id, ficha_id;
