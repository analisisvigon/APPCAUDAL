-- Solo lectura. Ejecutar manualmente DESPUÉS de la migración.
-- PASS estructural no equivale a una prueba de identidad: probar owner/staff/temporada cerrada en la aplicación.
with checks as (
  select 'columnas de ciclo de vida'::text as check_name,
    (select count(*)=6 from pg_attribute a
      where a.attrelid=to_regclass('public.planned_training_sessions')
        and a.attname in ('retired_at','retired_by_membership_id','retirement_reason',
          'cancelled_at','cancelled_by_membership_id','cancellation_reason')
        and not a.attisdropped and not a.attnotnull) as ok
  union all select 'FK y CHECK validadas',
    (select count(*)=4 from pg_constraint c where c.conrelid=to_regclass('public.planned_training_sessions')
      and c.conname in ('planned_sessions_retired_by_fk','planned_sessions_cancelled_by_fk',
        'planned_sessions_retirement_check','planned_sessions_cancellation_check') and c.convalidated)
  union all select 'guard de retirada habilitado',
    exists(select 1 from pg_trigger t where t.tgrelid=to_regclass('public.planned_training_sessions')
      and t.tgname='planned_sessions_lifecycle_2c_guard' and t.tgenabled='O'
      and t.tgfoid=to_regprocedure('public.guard_planned_session_lifecycle_2c()'))
  union all select 'bloqueo CAS y permiso CTS conservados',
    exists(select 1 from pg_proc p where p.oid=
      to_regprocedure('public.planned_session_04b_lock(uuid,integer)')
      and p.prosecdef and p.provolatile='v' and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and obj_description(p.oid,'pg_proc')='APPCAUDAL Sesiones 04B: planned_session_04b_lock')
    and exists(select 1 from pg_proc p where p.oid=
      to_regprocedure('public.can_write_club_team_season(uuid)')
      and p.prosecdef and p.provolatile='s' and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and obj_description(p.oid,'pg_proc')=
        'APPCAUDAL Change 39B: write authorization for an open club team-season.')
  union all select 'RPC segura y propietario',
    exists(select 1 from pg_proc p where p.oid=
      to_regprocedure('public.change_planned_session_lifecycle_2c(uuid,integer,text,text)')
      and p.prosecdef and p.provolatile='v' and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig @> array['search_path=pg_catalog']::text[])
  union all select 'EXECUTE authenticated, no anon ni PUBLIC',
    case when to_regprocedure('public.change_planned_session_lifecycle_2c(uuid,integer,text,text)') is null
      then false else
      has_function_privilege('authenticated','public.change_planned_session_lifecycle_2c(uuid,integer,text,text)','EXECUTE')
      and not has_function_privilege('anon','public.change_planned_session_lifecycle_2c(uuid,integer,text,text)','EXECUTE')
      and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where p.oid=to_regprocedure('public.change_planned_session_lifecycle_2c(uuid,integer,text,text)')
          and acl.grantee=0 and acl.privilege_type='EXECUTE') end
  union all select 'sin UPDATE, DELETE ni TRUNCATE directo para clientes',
    case when to_regclass('public.planned_training_sessions') is null then false else
      not has_table_privilege('authenticated','public.planned_training_sessions','UPDATE')
      and not has_table_privilege('anon','public.planned_training_sessions','UPDATE')
      and not has_table_privilege('authenticated','public.planned_training_sessions','DELETE')
      and not has_table_privilege('anon','public.planned_training_sessions','DELETE')
      and not has_table_privilege('authenticated','public.planned_training_sessions','TRUNCATE')
      and not has_table_privilege('anon','public.planned_training_sessions','TRUNCATE') end
  union all select 'sin escritura directa en tablas hijas',
    (select count(*)=7 and bool_and(
      not has_table_privilege('authenticated',to_regclass('public.' || child.name),'INSERT,UPDATE,DELETE,TRUNCATE')
      and not has_table_privilege('anon',to_regclass('public.' || child.name),'INSERT,UPDATE,DELETE,TRUNCATE'))
      from (values ('planned_session_slots'),('planned_session_items'),
        ('planned_session_player_roster'),('planned_session_player_availability'),
        ('planned_session_distributions'),('planned_session_date_change_authorizations'),
        ('planned_session_audit_events')) as child(name)
      where to_regclass('public.' || child.name) is not null)
  union all select 'guards de franjas, tareas y jugadores activos',
    (select count(*)=4 from (values
        ('planned_session_slots','planned_slots_guard','public.guard_planned_session_child()'),
        ('planned_session_items','planned_items_guard','public.guard_planned_session_child()'),
        ('planned_session_player_roster','planned_session_player_roster_guard',
          'public.guard_planned_session_player_roster()'),
        ('planned_session_player_availability','planned_session_player_availability_guard',
          'public.guard_planned_session_player_availability()'))
      as expected(table_name,trigger_name,function_signature)
      join pg_trigger t on t.tgrelid=to_regclass('public.' || expected.table_name)
        and t.tgname=expected.trigger_name and not t.tgisinternal and t.tgenabled='O'
        and t.tgfoid=to_regprocedure(expected.function_signature))
  union all select 'RLS y guards originales intactos',
    exists(select 1 from pg_class where oid=to_regclass('public.planned_training_sessions') and relrowsecurity)
    and exists(select 1 from pg_trigger where tgrelid=to_regclass('public.planned_training_sessions')
      and tgname='planned_sessions_guard' and tgenabled='O'
      and tgfoid=to_regprocedure('public.guard_planned_session_row()'))
    and exists(select 1 from pg_trigger where tgrelid=to_regclass('public.planned_session_audit_events')
      and tgname='planned_audit_guard' and tgenabled='O'
      and tgfoid=to_regprocedure('public.guard_planned_session_audit()'))
  union all select 'sin sobrecargas de RPC',
    (select count(*)=1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='change_planned_session_lifecycle_2c')
), output as (
  select check_name,case when ok then 'PASS' else 'FAIL' end as result from checks
  union all select 'GLOBAL ESTRUCTURAL',case when bool_and(ok) then 'PASS' else 'FAIL' end from checks
  union all select 'PRUEBAS CON IDENTIDADES REALES','PENDING'
)
select * from output order by case when check_name='GLOBAL ESTRUCTURAL' then 2
  when check_name='PRUEBAS CON IDENTIDADES REALES' then 3 else 1 end,check_name;
