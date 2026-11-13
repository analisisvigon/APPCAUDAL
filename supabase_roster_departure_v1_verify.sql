-- SOLO LECTURA. No consulta datos personales ni llama RPC de mutacion.
-- Ejecutar completo en SQL Editor como administrador y compartir TODOS los
-- resultados. Las funciones se devuelven completas, sin truncarlas con left().
-- No evalua si un jugador concreto es eliminable: inventaria el esquema real.
-- Funciona aunque la propuesta depart_roster_player_v1 aun no este instalada.
select current_user as execution_role, current_setting('server_version') as postgres_version,
  to_regprocedure('public.delete_own_player_atomic_v1(uuid)') is not null as legacy_rpc_present,
  to_regprocedure('public.guard_club_team_season_player_mutation()') is not null as canonical_guard_present;
select p.oid::regprocedure as routine,p.prosecdef,p.proconfig,
  pg_get_userbyid(p.proowner) as owner,pg_get_functiondef(p.oid) as definition
from pg_proc p where p.oid in (
  to_regprocedure('public.delete_own_player_atomic_v1(uuid)'),
  to_regprocedure('public.depart_roster_player_v1(uuid,uuid,boolean,date)'),
  to_regprocedure('public.guard_club_team_season_player_mutation()'),
  to_regprocedure('public.remove_global_player_from_current_team(uuid,date)'),
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

-- Sobrecargas, propietarios y ACL reales de las funciones bajo revision.
select p.oid::regprocedure as routine,pg_get_userbyid(p.proowner) as owner,
  p.proacl,has_function_privilege('authenticated',p.oid,'EXECUTE') as client_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (
  'delete_own_player_atomic_v1','guard_club_team_season_player_mutation',
  'depart_roster_player_v1','remove_global_player_from_current_team');

-- Referencias logicas/JSON y snapshots pueden no tener FK. Sus columnas,
-- constraints, triggers y funciones requieren revision; no se leen sus filas.
select c.oid::regclass as relation,a.attname,format_type(a.atttypid,a.atttypmod) as type,
  c.relrowsecurity,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
where n.nspname='public' and c.relkind in ('r','p','v','m')
  and (a.attname ~ '(jugador|player|membership|snapshot)'
    or c.relname in ('planned_session_player_roster','training_session_roster_snapshot',
      'planned_session_deletion_archive_v1','legacy_own_player_migration'))
order by c.oid::regclass::text,a.attnum;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename ~ '(player|jugador|roster|membership|fine)'
order by tablename,policyname;

-- Coincidencias EXACTAS con el rechazo preventivo de la RPC legacy revisada.
-- Cada fila basta para provocar PLAYER_DELETE_TRIGGER_REVIEW_REQUIRED,
-- independientemente del jugador y de si existen filas suyas en esa tabla.
select t.tgrelid::regclass as blocking_table,t.tgname as blocking_trigger,
  t.tgenabled,pg_get_triggerdef(t.oid) as definition,
  pg_get_functiondef(t.tgfoid) as full_guard_definition
from pg_trigger t where not t.tgisinternal and t.tgenabled in ('O','A')
  and (t.tgtype & 8)<>0 and t.tgrelid in (
    select to_regclass('public.'||name) from unnest(array[
      'jugadores','fines','fine_subjects','physio_treatments',
      'training_session_load_metrics','partido_estadisticas_jugador',
      'wellness_entries','rpe_entries','rpe_sync_pending',
      'jugador_suspension_consumptions','legacy_own_player_migration',
      'legacy_jugador_cts_links_v1']) name)
order by t.tgrelid::regclass::text,t.tgname;

-- Tras instalar: RPC nueva ejecutable por authenticated, no anon/service_role;
-- antigua no ejecutable por clientes; archivo sin privilegios ni politicas.
select p.oid::regprocedure as routine,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
from pg_proc p where p.oid in (
  to_regprocedure('public.depart_roster_player_v1(uuid,uuid,boolean,date)'),
  to_regprocedure('public.delete_own_player_atomic_v1(uuid)'));
select c.relrowsecurity,pg_get_userbyid(c.relowner) as owner,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as authenticated_access,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anon_access,
  has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as service_role_access,
  (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count
from pg_class c where c.oid=to_regclass('public.roster_departure_audit_v1');
