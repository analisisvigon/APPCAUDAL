-- SOLO LECTURA. No consulta datos personales ni llama RPC de mutacion.
select p.oid::regprocedure as routine,p.prosecdef,p.proconfig,
  pg_get_userbyid(p.proowner) as owner,pg_get_functiondef(p.oid) as definition
from pg_proc p where p.oid in (
  to_regprocedure('public.delete_own_player_atomic_v1(uuid)'),
  to_regprocedure('public.depart_roster_player_v1(uuid,uuid,boolean,date)'),
  to_regprocedure('public.guard_club_team_season_player_mutation()'),
  to_regprocedure('public.can_write_club_team_season(uuid)'));
-- Incluye dependencias indirectas: fichas, etapas, pertenencias y perfil global.
with recursive relations(oid) as (
  select to_regclass('public.'||name)::oid from unnest(array[
    'jugadores','players_database','player_team_memberships','club_team_season_players',
    'legacy_jugador_cts_links_v1','fine_subjects','fines','physio_treatments',
    'training_session_load_metrics','partido_estadisticas_jugador','wellness_entries',
    'rpe_entries','rpe_sync_pending','jugador_suspension_consumptions','legacy_own_player_migration']) name
  union
  select c.conrelid from pg_constraint c join relations r on r.oid=c.confrelid where c.contype='f'
)
select 'FK' as kind,c.conrelid::regclass::text as relation,c.conname::text as name,
  pg_get_constraintdef(c.oid) as definition,null::text as routine_definition
from pg_constraint c where c.contype='f' and c.confrelid in(select oid from relations)
union all
select 'TRIGGER',t.tgrelid::regclass::text,t.tgname::text,
  pg_get_triggerdef(t.oid)||' enabled='||t.tgenabled::text,pg_get_functiondef(t.tgfoid)
from pg_trigger t where not t.tgisinternal and t.tgrelid in(select oid from relations)
union all
select 'RULE',r.ev_class::regclass::text,r.rulename::text,pg_get_ruledef(r.oid),null
from pg_rewrite r where r.ev_class in(select oid from relations)
order by kind,relation,name;
select * from pg_policies where schemaname='public' and tablename in (
  'jugadores','players_database','player_team_memberships','club_team_season_players',
  'legacy_jugador_cts_links_v1','roster_departure_audit_v1');
select c.oid::regclass as relation,c.relrowsecurity,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as client_write
from pg_class c where c.oid in(to_regclass('public.club_team_season_players'),
  to_regclass('public.roster_departure_audit_v1'));
