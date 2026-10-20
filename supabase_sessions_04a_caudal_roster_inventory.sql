-- Sesiones 04A · inventario para decisión humana. SOLO LECTURA.
-- Ejecutar con una cuenta administrativa en SQL Editor; el CSV contiene nombres.
-- Una etapa del Caudal no acredita por sí sola pertenencia a 2026/2027.
with
constants as (
  select '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid as team_id,
         '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id
),
active_fichas_raw as (
  select j.id as ficha_id, j.global_player_id as player_id,
         j.membership_id as stage_id, m.id as resolved_stage_id,
         p.name as canonical_name, m.player_id as stage_player_id,
         m.team_id as stage_team_id, m.season as legacy_season,
         m.start_date as legacy_start_date, m.end_date as legacy_end_date,
         m.is_current as stage_is_current
  from public.jugadores j
  left join public.players_database p on p.id = j.global_player_id
  left join public.player_team_memberships m on m.id = j.membership_id
  where j.active_in_squad is true
),
caudal_related as (
  -- Contadores SOLO entre fichas cuya etapa acredita el UUID deportivo del Caudal.
  -- Las incoherentes de este mismo equipo cuentan para detectar colisiones.
  select r.*,
         count(*) over (partition by r.ficha_id) as fichas_for_ficha,
         count(*) over (partition by r.player_id) as fichas_for_player,
         count(*) over (partition by r.stage_id) as fichas_for_stage,
         count(*) over (partition by lower(btrim(r.canonical_name)))
           as fichas_with_same_name
  from active_fichas_raw r
  join constants c on c.team_id = r.stage_team_id
),
classified_fichas as (
  select r.*,
         c.fichas_for_ficha, c.fichas_for_player, c.fichas_for_stage,
         c.fichas_with_same_name,
         case when c.ficha_id is not null
                   and r.player_id is not null and r.canonical_name is not null
                   and r.stage_player_id = r.player_id
                   and r.stage_is_current is true
              then 'CAUDAL_FICHA_FOR_REVIEW'
              else 'IDENTITY_DIAGNOSTIC' end as row_type
  from active_fichas_raw r
  left join caudal_related c on c.ficha_id = r.ficha_id
  where c.ficha_id is not null
     or r.player_id is null or r.canonical_name is null
     or r.stage_id is null or r.resolved_stage_id is null
     or r.stage_player_id is distinct from r.player_id
  -- Una ficha coherente de otro equipo queda fuera, nunca como candidata.
),
position_agg as (
  select pp.player_id,
         array_agg(pp.position_key order by pp.position_key) filter
           (where pp.position_type = 'natural' and pp.is_primary)
           as primary_natural_keys,
         string_agg(pp.position_type || ':' || pp.position_key ||
           case when pp.is_primary then ':primary' else '' end,
           ', ' order by pp.position_type, pp.position_key) as all_positions
  from public.player_positions pp
  group by pp.player_id
),
position_summary as (
  select pa.player_id,
         cardinality(coalesce(pa.primary_natural_keys, array[]::text[]))
           as primary_natural_count,
         case when cardinality(pa.primary_natural_keys) = 1
              then pa.primary_natural_keys[1] end as primary_natural_position,
         array_to_string(pa.primary_natural_keys, ', ') as primary_natural_keys,
         pa.all_positions
  from position_agg pa
),
links as (
  select ctp.player_id, count(*) as existing_canonical_links
  from public.club_team_season_players ctp
  join constants c on c.cts_id = ctp.club_team_season_id
  where ctp.voided_at is null
  group by ctp.player_id
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
        and j.membership_id = m.id and j.global_player_id = m.player_id
    )
)
select f.row_type, f.ficha_id, f.player_id, f.stage_id,
       f.canonical_name, f.stage_player_id, f.stage_team_id,
       f.legacy_season, f.legacy_start_date, f.legacy_end_date,
       f.stage_is_current,
       ps.primary_natural_position,
       coalesce(ps.primary_natural_count, 0) as primary_natural_count,
       ps.primary_natural_keys, ps.all_positions,
       f.fichas_for_ficha, f.fichas_for_player, f.fichas_for_stage,
       f.fichas_with_same_name,
       coalesce(l.existing_canonical_links, 0) as existing_canonical_links,
       case when coalesce(ps.primary_natural_count, 0) > 1
            then 'BLOCKED_MULTIPLE_PRIMARY_NATURAL_POSITIONS'
            when coalesce(ps.primary_natural_count, 0) = 0
            then 'REVIEW_PRIMARY_POSITION_UNKNOWN'
            else null end as position_alert,
       case
         when f.row_type = 'IDENTITY_DIAGNOSTIC' then
           case when f.player_id is null then 'BLOCKED_MISSING_PLAYER_ID'
                when f.canonical_name is null then 'BLOCKED_MISSING_PLAYER_PROFILE'
                when f.stage_id is null or f.resolved_stage_id is null
                  then 'BLOCKED_MISSING_STAGE'
                when f.stage_player_id is distinct from f.player_id
                  then 'BLOCKED_STAGE_PLAYER_MISMATCH'
                when f.stage_is_current is distinct from true
                  then 'REVIEW_CAUDAL_STAGE_NOT_CURRENT'
                else 'BLOCKED_IDENTITY_INCOHERENT' end
         when f.fichas_for_ficha > 1 then 'BLOCKED_DUPLICATE_FICHA_ROW'
         when f.fichas_for_player > 1 then 'BLOCKED_DUPLICATE_PLAYER_IN_CAUDAL'
         when f.fichas_for_stage > 1 then 'BLOCKED_DUPLICATE_STAGE_IN_CAUDAL'
         when coalesce(ps.primary_natural_count, 0) > 1
           then 'BLOCKED_MULTIPLE_PRIMARY_NATURAL_POSITIONS'
         when coalesce(l.existing_canonical_links, 0) > 0
           then 'ALREADY_LINKED_REVIEW'
         when f.fichas_with_same_name > 1
           then 'REVIEW_SAME_NAME_NOT_PROOF_OF_DUPLICATE'
         when coalesce(ps.primary_natural_count, 0) = 0
           then 'REVIEW_PRIMARY_POSITION_UNKNOWN'
         else 'CANDIDATE_OWNER_MUST_CONFIRM'
       end as finding
from classified_fichas f
left join position_summary ps on ps.player_id = f.player_id
left join links l on l.player_id = f.player_id
union all
select 'CURRENT_STAGE_WITHOUT_ACTIVE_FICHA', null::uuid, s.player_id,
       s.stage_id, s.name, s.player_id, s.team_id, s.season,
       s.start_date, s.end_date, true,
       ps.primary_natural_position,
       coalesce(ps.primary_natural_count, 0),
       ps.primary_natural_keys, ps.all_positions,
       null::bigint, null::bigint, null::bigint, null::bigint,
       coalesce(l.existing_canonical_links, 0),
       case when coalesce(ps.primary_natural_count, 0) > 1
            then 'BLOCKED_MULTIPLE_PRIMARY_NATURAL_POSITIONS'
            when coalesce(ps.primary_natural_count, 0) = 0
            then 'REVIEW_PRIMARY_POSITION_UNKNOWN'
            else null end,
       'REVIEW_STAGE_NOT_AUTOMATIC_CANDIDATE'
from current_stages_without_ficha s
left join position_summary ps on ps.player_id = s.player_id
left join links l on l.player_id = s.player_id
order by row_type, canonical_name nulls last, player_id, ficha_id;
