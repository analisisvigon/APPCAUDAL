-- SOLO LECTURA. No repara datos ni ejecuta RPC de escritura.
select p.oid::regprocedure as routine,pg_get_functiondef(p.oid) as definition,p.proacl
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (
  'assign_global_player_to_team','link_existing_global_player_to_cts_v1',
  'incorporate_global_player_cts_v1','depart_roster_player_v1',
  'transition_02_row_write_guard_v1','can_read_club_team_season','can_write_club_team_season');
select c.conrelid::regclass as relation,c.conname,pg_get_constraintdef(c.oid)
from pg_constraint c where c.conrelid in (
  'public.jugadores'::regclass,'public.player_team_memberships'::regclass,
  'public.club_team_season_players'::regclass,'public.legacy_jugador_cts_links_v1'::regclass,
  'public.legacy_own_player_migration'::regclass);
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
  and tablename in ('jugadores','player_team_memberships','club_team_season_players','legacy_jugador_cts_links_v1');
select t.tgrelid::regclass as relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),pg_get_functiondef(t.tgfoid)
from pg_trigger t where not t.tgisinternal and t.tgrelid in (
  'public.jugadores'::regclass,'public.players_database'::regclass,'public.player_team_memberships'::regclass,
  'public.club_team_season_players'::regclass,'public.legacy_jugador_cts_links_v1'::regclass,
  'public.legacy_own_player_migration'::regclass);
select * from pg_policies where schemaname='public' and tablename in (
  'jugadores','players_database','player_team_memberships','club_team_season_players','legacy_jugador_cts_links_v1');
-- Diagnostico individual opcional: sustituir SOLO NULL por UUID del perfil global.
-- Ningun resultado con NULL. Etapas cerradas no demuestran por si solas un error:
-- comparar con auditoria/backups anteriores; no restaurar is_current automaticamente.
with input(player_id) as (values(null::uuid))
select p.id as global_player_id,m.id as stage_id,m.team_id,m.season,m.is_current,m.start_date,m.end_date,
  j.id as ficha_id,j.active_in_squad,l.club_team_season_player_id,
  r.club_team_season_id,r.has_departed,r.left_on,r.voided_at,
  case when j.id is not null and l.jugador_id is null then 'FICHA_SIN_CTS: REVISAR'
    when r.id is not null and r.player_id<>p.id then 'IDENTIDAD_INCONSISTENTE: REVISAR'
    else 'COMPARAR_CON_HISTORIAL' end as diagnosis
from input i join public.players_database p on p.id=i.player_id
left join public.player_team_memberships m on m.player_id=p.id
left join public.jugadores j on j.global_player_id=p.id and j.membership_id=m.id
left join public.legacy_jugador_cts_links_v1 l on l.jugador_id=j.id
left join public.club_team_season_players r on r.id=l.club_team_season_player_id;
