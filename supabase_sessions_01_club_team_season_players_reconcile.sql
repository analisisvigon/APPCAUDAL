-- APPCAUDAL / Sesiones 01 / Conciliación 27 frente a 24. Solo SELECT.
-- Esperado según diagnóstico recibido: exactamente 3 filas. Si cambia, detener la selección.
-- Ningún UUID de este resultado se incorpora automáticamente a la temporada.
select
  stage.id as sports_membership_id,
  stage.player_id as global_player_id,
  stage.is_current,
  stage.season as legacy_season_text,
  stage.start_date as legacy_start_date,
  stage.end_date as legacy_end_date,
  exists (
    select 1 from public.jugadores j
    where j.membership_id = stage.id
  ) as has_any_legacy_ficha_for_stage,
  exists (
    select 1 from public.jugadores j
    where j.global_player_id = stage.player_id
  ) as has_any_legacy_ficha_for_identity,
  exists (
    select 1 from public.jugadores j
    where j.global_player_id = stage.player_id and j.active_in_squad
  ) as has_active_legacy_ficha_for_identity
from public.player_team_memberships stage
where stage.team_id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
  and stage.is_current
  and not exists (
    select 1 from public.jugadores j
    where j.membership_id = stage.id
      and j.global_player_id = stage.player_id
      and j.active_in_squad
  )
order by stage.id;
