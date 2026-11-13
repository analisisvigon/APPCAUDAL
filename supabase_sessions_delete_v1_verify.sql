-- SOLO LECTURA. No llama RPC de borrado, no instala ni cambia datos.
-- SQL Editor con auth.uid() NULL no acredita permisos de una sesión STAFF real.
select signature,to_regprocedure(signature) is not null as installed,
  p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute
from (values
  ('public.planned_session_04b_lock(uuid,integer)'),
  ('public.can_write_club_team_season(uuid)'),
  ('public.planned_session_delete_ready_v1()'),
  ('public.delete_planned_session_v1(uuid,uuid,integer,boolean)'),
  ('public.planned_session_delete_authorized_v1(uuid)')
) signatures(signature) left join pg_proc p on p.oid=to_regprocedure(signature);

-- Dependencias directas E indirectas, incluidas las cascadas.
with recursive relations(oid) as (
  select to_regclass('public.planned_training_sessions')::oid
  union
  select c.conrelid from pg_constraint c join relations r on r.oid=c.confrelid where c.contype='f'
)
select c.conrelid::regclass as child,c.confrelid::regclass as parent,c.conname,
  pg_get_constraintdef(c.oid) as definition,
  case when c.conrelid::regclass::text = any(array[
    'planned_session_slots','planned_session_items','planned_session_player_roster',
    'planned_session_player_availability','planned_session_audit_events',
    'planned_session_date_change_authorizations','planned_session_distributions',
    'planned_session_board_seed_v11','planned_session_exercise_dimensions_v12'])
    then 'REVISAR CONTRATO' else 'DEPENDENCIA EXTERNA: BLOQUEA BORRADO' end as review
from pg_constraint c where c.contype='f' and c.confrelid in(select oid from relations)
order by c.confrelid::regclass::text,c.conrelid::regclass::text,c.conname;

with recursive relations(oid) as (
  select to_regclass('public.planned_training_sessions')::oid
  union
  select c.conrelid from pg_constraint c join relations r on r.oid=c.confrelid where c.contype='f'
)
select t.tgrelid::regclass as relation,t.tgname,t.tgenabled,
  pg_get_triggerdef(t.oid) as definition,pg_get_functiondef(t.tgfoid) as guard
from pg_trigger t where not t.tgisinternal and t.tgrelid in(select oid from relations)
order by t.tgrelid::regclass::text,t.tgname;

select c.oid::regclass as relation,c.relrowsecurity,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as direct_write,
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as anon_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and (c.relname='planned_training_sessions' or c.relname like 'planned_session_%')
  and c.relkind='r' order by c.oid::regclass::text;

select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and (tablename='planned_training_sessions' or tablename like 'planned_session_%')
order by tablename,policyname;

select p.oid::regprocedure as routine,pg_get_functiondef(p.oid) as definition
from pg_proc p where p.oid in (
  to_regprocedure('public.delete_planned_session_v1(uuid,uuid,integer,boolean)'),
  to_regprocedure('public.planned_session_delete_authorized_v1(uuid)'),
  to_regprocedure('public.planned_session_04b_lock(uuid,integer)'),
  to_regprocedure('public.can_write_club_team_season(uuid)'));
