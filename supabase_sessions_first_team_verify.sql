-- SOLO LECTURA. Ejecutar antes/después de la migración manual.
select to_regclass('public.planned_session_player_availability') is not null as table_installed,
  to_regprocedure('public.save_planned_session_availability_04b(uuid,integer,jsonb)') is not null as rpc_installed;

select p.oid::regprocedure as routine, p.prosecdef as security_definer, p.proconfig,
  position($$v_status<>all(array['available','absent','injured','adapted','first_team'])$$ in p.prosrc)>0
    as accepts_first_team,
  position('planned_session_04b_lock' in p.prosrc)>0 as retains_cts_revision_lock,
  position('planned_session_audit_events' in p.prosrc)>0 as retains_audit,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p where p.oid=to_regprocedure('public.save_planned_session_availability_04b(uuid,integer,jsonb)');

select c.conname, pg_get_constraintdef(c.oid) as definition,
  position('first_team' in pg_get_constraintdef(c.oid))>0 as accepts_first_team
from pg_constraint c
where c.conrelid=to_regclass('public.planned_session_player_availability')
  and c.conname='planned_session_player_availability_status_check';

select relrowsecurity as rls_enabled,
  has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE') as direct_write_privileges
from pg_class where oid=to_regclass('public.planned_session_player_availability');

select tgname,tgenabled from pg_trigger
where tgrelid=to_regclass('public.planned_session_player_availability') and not tgisinternal;
