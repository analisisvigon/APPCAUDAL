-- APPCAUDAL Sesiones 03A: postflight de catálogo. SOLO SELECT; no ejecutado.
-- Una tabla exportable. GLOBAL=PASS_STRUCTURAL no sustituye las pruebas dinámicas.
with
expected_tables(name) as (values
  ('planned_training_sessions'),('planned_session_number_state'),
  ('planned_session_slots'),('planned_session_items'),('planned_session_audit_events')
),
expected_functions(signature,client_rpc) as (values
  ('public.planned_session_state(uuid)',false),
  ('public.guard_planned_session_row()',false),
  ('public.guard_planned_session_child()',false),
  ('public.guard_planned_session_number()',false),
  ('public.guard_planned_session_audit()',false),
  ('public.create_planned_session_draft(uuid,date)',true),
  ('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer)',true),
  ('public.confirm_planned_session(uuid,integer)',true)
),
expected_triggers(table_name,trigger_name,function_name) as (values
  ('planned_training_sessions','planned_sessions_guard','guard_planned_session_row'),
  ('planned_session_number_state','planned_number_guard','guard_planned_session_number'),
  ('planned_session_slots','planned_slots_guard','guard_planned_session_child'),
  ('planned_session_items','planned_items_guard','guard_planned_session_child'),
  ('planned_session_audit_events','planned_audit_guard','guard_planned_session_audit')
),
expected_indexes(table_name,index_name,unique_required,predicate_required) as (values
  ('planned_training_sessions','planned_sessions_number_uidx',true,true),
  ('planned_training_sessions','planned_sessions_date_idx',false,false),
  ('planned_session_items','planned_items_session_slot_idx',false,false),
  ('planned_session_audit_events','planned_audit_session_date_idx',false,false)
),
expected_columns(table_name,column_name,type_name) as (values
  ('planned_training_sessions','id','uuid'),
  ('planned_training_sessions','club_team_season_id','uuid'),
  ('planned_training_sessions','session_date','date'),
  ('planned_training_sessions','planning_state','text'),
  ('planned_training_sessions','session_number','int4'),
  ('planned_training_sessions','revision','int4'),
  ('planned_training_sessions','created_by_membership_id','uuid'),
  ('planned_session_number_state','club_team_season_id','uuid'),
  ('planned_session_number_state','highest_ever_assigned','int4'),
  ('planned_session_slots','id','uuid'),
  ('planned_session_slots','session_id','uuid'),
  ('planned_session_slots','phase','text'),
  ('planned_session_slots','duration_minutes','int4'),
  ('planned_session_items','id','uuid'),
  ('planned_session_items','session_id','uuid'),
  ('planned_session_items','slot_id','uuid'),
  ('planned_session_items','kind','text'),
  ('planned_session_items','task_snapshot','jsonb'),
  ('planned_session_audit_events','session_id','uuid'),
  ('planned_session_audit_events','revision','int4'),
  ('planned_session_audit_events','actor_membership_id','uuid')
),
expected_fks(table_name,referenced_table) as (values
  ('planned_training_sessions','club_team_seasons'),
  ('planned_training_sessions','club_memberships'),
  ('planned_session_number_state','club_team_seasons'),
  ('planned_session_slots','planned_training_sessions'),
  ('planned_session_items','planned_training_sessions'),
  ('planned_session_items','planned_session_slots'),
  ('planned_session_audit_events','planned_training_sessions'),
  ('planned_session_audit_events','club_memberships')
),
expected_constraints(table_name,name) as (values
  ('planned_training_sessions','planned_sessions_state_check'),
  ('planned_training_sessions','planned_sessions_number_check'),
  ('planned_training_sessions','planned_sessions_revision_check'),
  ('planned_session_number_state','planned_number_state_nonnegative'),
  ('planned_session_slots','planned_slots_phase_check'),
  ('planned_session_slots','planned_slots_duration_check'),
  ('planned_session_slots','planned_slots_session_order_key'),
  ('planned_session_items','planned_items_kind_check'),
  ('planned_session_items','planned_items_duration_check'),
  ('planned_session_items','planned_items_slot_order_key'),
  ('planned_session_audit_events','planned_audit_session_revision_key')
),
fingerprint as (
  select md5(coalesce(string_agg(
    c.oid::text||':'||c.relname||':'||c.relrowsecurity::text||':'||
    c.relforcerowsecurity::text||':'||coalesce(c.relacl::text,'NULL')||':'||
    coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||
      coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'|' order by p.polname)
      from pg_catalog.pg_policy p where p.polrelid=c.oid),'')
    ,'|' order by c.relname),'')) as hash
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in
    ('club_seasons','club_team_seasons','club_memberships','club_team_season_players',
     'training_sessions','rpe_entries','training_tasks','partidos')
),
checks as (
  select 'table:'||name as check_name,
    (select count(*)=1 from pg_catalog.pg_class c
     where c.oid=to_regclass('public.'||name) and c.relkind='r'
       and c.relrowsecurity and pg_get_userbyid(c.relowner)='postgres'
       and obj_description(c.oid,'pg_class')='APPCAUDAL Sesiones 03A: '||name) as ok,
    'Tabla ordinaria, RLS, propietario y marcador 03A' as detail
  from expected_tables
  union all
  select 'column:'||table_name||'.'||column_name,
    exists(select 1 from pg_catalog.pg_attribute a
      where a.attrelid=to_regclass('public.'||table_name)
        and a.attname=column_name and a.atttypid=to_regtype('pg_catalog.'||type_name)
        and not a.attisdropped),
    'Columna y tipo requerido' from expected_columns
  union all
  select 'fk:'||table_name||'->'||referenced_table,
    exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.'||table_name)
        and c.confrelid=to_regclass('public.'||referenced_table)
        and c.contype='f' and c.convalidated and c.confdeltype='r'),
    'FK validada ON DELETE RESTRICT' from expected_fks
  union all
  select 'constraint:'||table_name||'.'||name,
    exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.'||table_name)
        and c.conname=name and c.convalidated),
    'Restricción validada; definición debe revisarse en catálogo detallado'
  from expected_constraints
  union all
  select 'trigger:'||table_name||'.'||trigger_name,
    exists(select 1 from pg_catalog.pg_trigger t
      join pg_catalog.pg_proc p on p.oid=t.tgfoid
      where t.tgrelid=to_regclass('public.'||table_name)
        and t.tgname=trigger_name and not t.tgisinternal and t.tgenabled='O'
        and p.proname=function_name),
    'Guard activo' from expected_triggers
  union all
  select 'index:'||index_name,
    exists(select 1 from pg_catalog.pg_index ix
      where ix.indrelid=to_regclass('public.'||table_name)
        and ix.indexrelid=to_regclass('public.'||index_name)
        and ix.indisvalid and ix.indisready
        and (not unique_required or ix.indisunique)
        and (not predicate_required or ix.indpred is not null)),
    'Índice válido, unicidad y predicado parcial cuando corresponde'
  from expected_indexes
  union all
  select 'rls_policy:'||name,
    (select count(*)=1 from pg_catalog.pg_policy p
      where p.polrelid=to_regclass('public.'||name)
        and p.polcmd::text='r' and p.polpermissive
        and p.polroles=array[(select oid from pg_catalog.pg_roles where rolname='authenticated')])
    and (select count(*)=1 from pg_catalog.pg_policy p
      where p.polrelid=to_regclass('public.'||name)),
    'Solo una política SELECT para authenticated; inspeccionar USING completo'
  from expected_tables
  union all
  select 'rls_expression:'||name,
    exists(select 1 from pg_catalog.pg_policy p
      where p.polrelid=to_regclass('public.'||name)
        and position('can_read_club_team_season' in
          pg_get_expr(p.polqual,p.polrelid))>0
        and (name<>'planned_session_audit_events' or
          position('has_club_role' in pg_get_expr(p.polqual,p.polrelid))>0)
        and (name not in ('planned_session_slots','planned_session_items',
          'planned_session_audit_events') or
          position('planned_training_sessions' in
            pg_get_expr(p.polqual,p.polrelid))>0)),
    'Referencia textual a helpers/padre; no equivale a prueba de identidad'
  from expected_tables
  union all
  select 'table_privileges:'||name,
    case when to_regclass('public.'||name) is null then false else
    has_table_privilege('authenticated','public.'||name,'SELECT')
    and has_table_privilege('service_role','public.'||name,'SELECT')
    and not has_table_privilege('anon','public.'||name,'SELECT')
    and not has_table_privilege('anon','public.'||name,'INSERT')
    and not has_table_privilege('anon','public.'||name,'UPDATE')
    and not has_table_privilege('anon','public.'||name,'DELETE')
    and not has_table_privilege('anon','public.'||name,'TRUNCATE')
    and not has_table_privilege('anon','public.'||name,'TRIGGER')
    and not has_table_privilege('anon','public.'||name,'MAINTAIN')
    and not has_table_privilege('authenticated','public.'||name,'INSERT')
    and not has_table_privilege('authenticated','public.'||name,'UPDATE')
    and not has_table_privilege('authenticated','public.'||name,'DELETE')
    and not has_table_privilege('authenticated','public.'||name,'TRUNCATE')
    and not has_table_privilege('authenticated','public.'||name,'TRIGGER')
    and not has_table_privilege('authenticated','public.'||name,'MAINTAIN') end,
    'Privilegios efectivos; no escritura cliente, TRIGGER ni MAINTAIN'
  from expected_tables
  union all
  select 'function:'||signature,
    exists(select 1 from pg_catalog.pg_proc p
      where p.oid=to_regprocedure(signature) and p.prosecdef
        and p.provolatile::text='v'
        and p.proconfig @> array['search_path=pg_catalog']::text[]
        and pg_get_userbyid(p.proowner)='postgres'
        and obj_description(p.oid,'pg_proc')=
          'APPCAUDAL Sesiones 03A: '||p.proname)
    and case when to_regprocedure(signature) is null then false else
      has_function_privilege('authenticated',signature,'EXECUTE')=client_rpc
      and not has_function_privilege('anon',signature,'EXECUTE')
      and not has_function_privilege('service_role',signature,'EXECUTE') end,
    'SECURITY DEFINER, search_path, propietario y EXECUTE esperado'
  from expected_functions
  union all
  select 'function_overloads',not exists(
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('planned_session_state','guard_planned_session_row','guard_planned_session_child',
       'guard_planned_session_number','guard_planned_session_audit',
       'create_planned_session_draft','save_planned_session','confirm_planned_session')
      and not exists(select 1 from expected_functions f
        where p.oid=to_regprocedure(f.signature))),
    'Sin sobrecargas adicionales'
),
result as (
  select check_name,case when ok is true then 'PASS' else 'FAIL' end as status,detail
  from checks
)
select check_name,status,detail from result
union all
select 'BASELINE_EXISTING_RLS_ACL_HASH','INFO',hash from fingerprint
union all
select 'BASELINE_PARTIDOS_COUNT','INFO',(select count(*)::text from public.partidos)
union all
select 'BASELINE_TRAINING_SESSIONS_COUNT','INFO',
  (select count(*)::text from public.training_sessions)
union all
select 'BASELINE_RPE_ENTRIES_COUNT','INFO',
  (select count(*)::text from public.rpe_entries)
union all
select 'BASELINE_TRAINING_TASKS_COUNT','INFO',
  (select count(*)::text from public.training_tasks)
union all
select 'POLICY_USING:'||c.relname||'.'||p.polname,'INFO',
  coalesce(pg_get_expr(p.polqual,p.polrelid),'NULL')
from pg_catalog.pg_policy p
join pg_catalog.pg_class c on c.oid=p.polrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (select name from expected_tables)
union all
select 'IDENTITY_AND_CONCURRENCY_TESTS','PENDING',
  'Solo staging: roles reales, concurrencia, revisión obsoleta y cierre'
union all
select 'GLOBAL',case when count(*) filter(where status='FAIL')=0
  then 'PASS_STRUCTURAL' else 'FAIL' end,
  count(*) filter(where status='PASS')::text||' PASS; '||
  count(*) filter(where status='FAIL')::text||' FAIL; pruebas dinámicas PENDING'
from result
order by check_name;
