-- APPCAUDAL Sesiones 03A: postflight de catálogo. SOLO SELECT; no ejecutado.
-- Una tabla exportable. GLOBAL=PASS_STRUCTURAL no sustituye las pruebas dinámicas.
with
expected_tables(name) as (values
  ('planned_training_sessions'),('planned_session_number_state'),
  ('planned_session_slots'),('planned_session_items'),('planned_session_audit_events')
),
-- Huellas MD5 de prosrc con finales de línea CRLF normalizados a LF.
-- Detectan divergencias de cuerpo; no sustituyen pruebas dinámicas de permisos.
expected_functions(signature,client_rpc,expected_body_md5) as (values
  ('public.planned_session_state(uuid)',false,'3f276434e696206885bf72134ebd0444'),
  ('public.guard_planned_session_row()',false,'31814c93c421e4843d53e895cb3fe8db'),
  ('public.guard_planned_session_child()',false,'4b31719bab94c835a26a148b6f736142'),
  ('public.guard_planned_session_number()',false,'ba3b88309c883d8da1565da94b6321b5'),
  ('public.guard_planned_session_audit()',false,'0565cb0571a8c4519adf0ff50412cd22'),
  ('public.create_planned_session_draft(uuid,date)',true,'135f57bde0cdafd66cae14d2e994bbd4'),
  ('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])',
    true,'266abcf6cfa754b9779ed84ef664d842'),
  ('public.confirm_planned_session(uuid,integer)',true,'66095dfe8b535bb13c5d01bfdd10ff0d')
),
expected_triggers(table_name,trigger_name,function_name) as (values
  ('planned_training_sessions','planned_sessions_guard','guard_planned_session_row'),
  ('planned_session_number_state','planned_number_guard','guard_planned_session_number'),
  ('planned_session_slots','planned_slots_guard','guard_planned_session_child'),
  ('planned_session_items','planned_items_guard','guard_planned_session_child'),
  ('planned_session_audit_events','planned_audit_guard','guard_planned_session_audit')
),
expected_indexes(table_name,index_name,unique_required,predicate_required,key_columns) as (values
  ('planned_training_sessions','planned_sessions_number_uidx',true,true,
    array['club_team_season_id','session_number']),
  ('planned_training_sessions','planned_sessions_date_idx',false,false,
    array['club_team_season_id','session_date','id']),
  ('planned_session_items','planned_items_session_slot_idx',false,false,
    array['session_id','slot_id']),
  ('planned_session_audit_events','planned_audit_session_date_idx',false,false,
    array['session_id','occurred_at'])
),
expected_columns(table_name,column_name,type_name) as (values
  ('planned_training_sessions','id','uuid'),
  ('planned_training_sessions','club_team_season_id','uuid'),
  ('planned_training_sessions','session_date','date'),
  ('planned_training_sessions','starts_at','time'),
  ('planned_training_sessions','location','text'),
  ('planned_training_sessions','period_label','text'),
  ('planned_training_sessions','morphology_pattern','text'),
  ('planned_training_sessions','next_opponent_label','text'),
  ('planned_training_sessions','objectives','text'),
  ('planned_training_sessions','notes','text'),
  ('planned_training_sessions','material','text'),
  ('planned_training_sessions','staff_observations','text'),
  ('planned_training_sessions','planning_state','text'),
  ('planned_training_sessions','session_number','int4'),
  ('planned_training_sessions','revision','int4'),
  ('planned_training_sessions','created_by_membership_id','uuid'),
  ('planned_training_sessions','confirmed_at','timestamptz'),
  ('planned_training_sessions','team_name_snapshot','text'),
  ('planned_training_sessions','season_label_snapshot','text'),
  ('planned_training_sessions','created_at','timestamptz'),
  ('planned_training_sessions','updated_at','timestamptz'),
  ('planned_session_number_state','club_team_season_id','uuid'),
  ('planned_session_number_state','highest_ever_assigned','int4'),
  ('planned_session_number_state','updated_at','timestamptz'),
  ('planned_session_slots','id','uuid'),
  ('planned_session_slots','session_id','uuid'),
  ('planned_session_slots','phase','text'),
  ('planned_session_slots','sort_order','int4'),
  ('planned_session_slots','duration_minutes','int4'),
  ('planned_session_slots','created_at','timestamptz'),
  ('planned_session_slots','updated_at','timestamptz'),
  ('planned_session_items','id','uuid'),
  ('planned_session_items','session_id','uuid'),
  ('planned_session_items','slot_id','uuid'),
  ('planned_session_items','sort_order','int4'),
  ('planned_session_items','kind','text'),
  ('planned_session_items','source_task_uuid_snapshot','uuid'),
  ('planned_session_items','task_snapshot','jsonb'),
  ('planned_session_items','free_title','text'),
  ('planned_session_items','free_description','text'),
  ('planned_session_items','free_comments','text'),
  ('planned_session_items','free_url','text'),
  ('planned_session_items','activity_minutes','int4'),
  ('planned_session_items','created_at','timestamptz'),
  ('planned_session_items','updated_at','timestamptz'),
  ('planned_session_audit_events','id','uuid'),
  ('planned_session_audit_events','session_id','uuid'),
  ('planned_session_audit_events','revision','int4'),
  ('planned_session_audit_events','actor_membership_id','uuid'),
  ('planned_session_audit_events','event_type','text'),
  ('planned_session_audit_events','changed_sections','_text'),
  ('planned_session_audit_events','occurred_at','timestamptz'),
  ('planned_session_audit_events','before_hash','text'),
  ('planned_session_audit_events','after_hash','text'),
  ('planned_session_audit_events','metadata','jsonb')
),
nullable_columns(table_name,column_name) as (values
  ('planned_training_sessions','starts_at'),
  ('planned_training_sessions','location'),
  ('planned_training_sessions','period_label'),
  ('planned_training_sessions','morphology_pattern'),
  ('planned_training_sessions','next_opponent_label'),
  ('planned_training_sessions','objectives'),
  ('planned_training_sessions','notes'),
  ('planned_training_sessions','material'),
  ('planned_training_sessions','staff_observations'),
  ('planned_training_sessions','session_number'),
  ('planned_training_sessions','confirmed_at'),
  ('planned_training_sessions','team_name_snapshot'),
  ('planned_training_sessions','season_label_snapshot'),
  ('planned_session_items','source_task_uuid_snapshot'),
  ('planned_session_items','task_snapshot'),
  ('planned_session_items','free_title'),
  ('planned_session_items','free_description'),
  ('planned_session_items','free_comments'),
  ('planned_session_items','free_url'),
  ('planned_session_items','activity_minutes'),
  ('planned_session_audit_events','before_hash'),
  ('planned_session_audit_events','after_hash')
),
expected_fks(table_name,referenced_table,local_columns,remote_columns) as (values
  ('planned_training_sessions','club_team_seasons',
    array['club_team_season_id'],array['id']),
  ('planned_training_sessions','club_memberships',
    array['created_by_membership_id'],array['id']),
  ('planned_session_number_state','club_team_seasons',
    array['club_team_season_id'],array['id']),
  ('planned_session_slots','planned_training_sessions',
    array['session_id'],array['id']),
  ('planned_session_items','planned_training_sessions',
    array['session_id'],array['id']),
  ('planned_session_items','planned_session_slots',
    array['slot_id','session_id'],array['id','session_id']),
  ('planned_session_audit_events','planned_training_sessions',
    array['session_id'],array['id']),
  ('planned_session_audit_events','club_memberships',
    array['actor_membership_id'],array['id'])
),
expected_constraints(table_name,name) as (values
  ('planned_training_sessions','planned_sessions_state_check'),
  ('planned_training_sessions','planned_sessions_number_check'),
  ('planned_training_sessions','planned_sessions_revision_check'),
  ('planned_training_sessions','planned_sessions_text_check'),
  ('planned_session_number_state','planned_number_state_nonnegative'),
  ('planned_session_slots','planned_slots_phase_check'),
  ('planned_session_slots','planned_slots_order_check'),
  ('planned_session_slots','planned_slots_duration_check'),
  ('planned_session_items','planned_items_order_check'),
  ('planned_session_items','planned_items_kind_check'),
  ('planned_session_items','planned_items_duration_check'),
  ('planned_session_items','planned_items_text_check'),
  ('planned_session_audit_events','planned_audit_revision_check'),
  ('planned_session_audit_events','planned_audit_event_check'),
  ('planned_session_audit_events','planned_audit_sections_check'),
  ('planned_session_audit_events','planned_audit_metadata_check'),
  ('planned_session_audit_events','planned_audit_hash_check')
),
expected_keys(table_name,name,key_type,columns,is_deferred) as (values
  ('planned_training_sessions','planned_training_sessions_pkey','p',array['id'],false),
  ('planned_session_number_state','planned_session_number_state_pkey','p',
    array['club_team_season_id'],false),
  ('planned_session_slots','planned_session_slots_pkey','p',array['id'],false),
  ('planned_session_slots','planned_slots_session_order_key','u',
    array['session_id','phase','sort_order'],true),
  ('planned_session_slots','planned_slots_id_session_key','u',
    array['id','session_id'],false),
  ('planned_session_items','planned_session_items_pkey','p',array['id'],false),
  ('planned_session_items','planned_items_slot_order_key','u',
    array['slot_id','sort_order'],true),
  ('planned_session_items','planned_items_id_session_key','u',
    array['id','session_id'],false),
  ('planned_session_audit_events','planned_session_audit_events_pkey','p',
    array['id'],false),
  ('planned_session_audit_events','planned_audit_session_revision_key','u',
    array['session_id','revision'],false)
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
  select 'source_team_name_chain' as check_name,
    exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_team_seasons')
        and c.confrelid=to_regclass('public.club_teams')
        and c.contype='f' and c.convalidated and c.confdeltype='r'
        and c.conkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='team_id' and not a.attisdropped),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='club_id' and not a.attisdropped)]
        and c.confkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='id' and not a.attisdropped),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='club_id' and not a.attisdropped)])
    and exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_teams')
        and c.confrelid=to_regclass('public.equipos_rivales')
        and c.contype='f' and c.convalidated and c.confdeltype='r'
        and c.conkey=array[(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=c.conrelid and a.attname='id' and not a.attisdropped)]
        and c.confkey=array[(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=c.confrelid and a.attname='id' and not a.attisdropped)])
    and exists(select 1 from pg_catalog.pg_attribute a
      where a.attrelid=to_regclass('public.equipos_rivales')
        and a.attname='name' and a.atttypid=to_regtype('pg_catalog.text')
        and a.attnotnull and not a.attisdropped) as ok,
    'CTS -> club_teams -> equipos_rivales.name mediante FK validadas' as detail
  union all
  select 'source_season_label',
    exists(select 1 from pg_catalog.pg_attribute a
      where a.attrelid=to_regclass('public.club_seasons')
        and a.attname='label' and a.atttypid=to_regtype('pg_catalog.text')
        and a.attnotnull and not a.attisdropped),
    'Snapshot de temporada desde club_seasons.label'
  union all
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
        and not a.attisdropped
        and a.attnotnull=(not exists(select 1 from nullable_columns n
          where n.table_name=expected_columns.table_name
            and n.column_name=expected_columns.column_name))),
    'Columna, tipo y nulabilidad requerida' from expected_columns
  union all
  select 'fk:'||table_name||'('||array_to_string(local_columns,',')||')->'||
      referenced_table||'('||array_to_string(remote_columns,',')||')',
    exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.'||table_name)
        and c.confrelid=to_regclass('public.'||referenced_table)
        and c.contype='f' and c.convalidated and c.confdeltype='r'
        and c.conkey=(select array_agg(a.attnum order by x.ord)
          from unnest(local_columns) with ordinality x(attname,ord)
          join pg_catalog.pg_attribute a
            on a.attrelid=c.conrelid and a.attname=x.attname and not a.attisdropped)
        and c.confkey=(select array_agg(a.attnum order by x.ord)
          from unnest(remote_columns) with ordinality x(attname,ord)
          join pg_catalog.pg_attribute a
            on a.attrelid=c.confrelid and a.attname=x.attname and not a.attisdropped)),
    'FK validada sobre columnas exactas, ON DELETE RESTRICT' from expected_fks
  union all
  select 'constraint:'||table_name||'.'||name,
    exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.'||table_name)
        and c.conname=name and c.contype='c' and c.convalidated
        and not c.connoinherit),
    'CHECK validado; expresión íntegra incluida en fila de detalle'
  from expected_constraints
  union all
  select 'key:'||table_name||'.'||name,
    exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.'||table_name)
        and c.conname=name and c.contype::text=key_type
        and c.convalidated and c.condeferrable=is_deferred
        and c.condeferred=is_deferred
        and c.conkey=(select array_agg(a.attnum order by x.ord)
          from unnest(columns) with ordinality x(attname,ord)
          join pg_catalog.pg_attribute a
            on a.attrelid=c.conrelid and a.attname=x.attname and not a.attisdropped)),
    'PK/UNIQUE sobre columnas exactas; diferibilidad esperada'
  from expected_keys
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
        and ix.indisunique=unique_required
        and ix.indnatts=cardinality(key_columns)
        and ix.indnkeyatts=cardinality(key_columns)
        and ix.indkey::smallint[]=(select array_agg(a.attnum order by x.ord)
          from unnest(key_columns) with ordinality x(attname,ord)
          join pg_catalog.pg_attribute a
            on a.attrelid=ix.indrelid and a.attname=x.attname and not a.attisdropped)
        and ((predicate_required and regexp_replace(lower(
              pg_get_expr(ix.indpred,ix.indrelid)),
              '[[:space:]()]','','g')='session_numberisnotnull')
          or (not predicate_required and ix.indpred is null))),
    'Índice válido, columnas exactas, unicidad y predicado parcial esperado'
  from expected_indexes
  union all
  select 'rls_policy:'||name,
    (select count(*)=1 from pg_catalog.pg_policy p
      where p.polrelid=to_regclass('public.'||name)
        and p.polcmd::text='r' and p.polpermissive
        and p.polqual is not null and p.polwithcheck is null
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
        and position('ortrue' in regexp_replace(lower(
          pg_get_expr(p.polqual,p.polrelid)),
          '[[:space:]()]','','g'))=0
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
        and md5(replace(p.prosrc,E'\r\n',E'\n'))=expected_body_md5
        and p.proconfig @> array['search_path=pg_catalog']::text[]
        and pg_get_userbyid(p.proowner)='postgres'
        and not exists(select 1 from pg_catalog.aclexplode(
          coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
          where acl.grantee=0 and acl.privilege_type='EXECUTE')
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
select 'CONSTRAINT_DDL:'||c.relname||'.'||co.conname,'INFO',
  pg_get_constraintdef(co.oid)
from pg_catalog.pg_constraint co
join pg_catalog.pg_class c on c.oid=co.conrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (select name from expected_tables)
union all
select 'INDEX_DDL:'||i.relname,'INFO',pg_get_indexdef(i.oid)
from pg_catalog.pg_index ix
join pg_catalog.pg_class i on i.oid=ix.indexrelid
join pg_catalog.pg_class t on t.oid=ix.indrelid
join pg_catalog.pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and t.relname in (select name from expected_tables)
union all
select 'FUNCTION_BODY_MD5:'||f.signature,'INFO',
  'actual='||coalesce(md5(replace(p.prosrc,E'\r\n',E'\n')),'MISSING')||
  '; expected='||f.expected_body_md5
from expected_functions f
left join pg_catalog.pg_proc p on p.oid=to_regprocedure(f.signature)
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
select 'CHECK_EXPRESSIONS_REVIEW','PENDING',
  'Revisar CONSTRAINT_DDL frente a migración; el nombre/validación no prueba equivalencia lógica'
union all
select 'RLS_EXPRESSIONS_REVIEW','PENDING',
  'Revisar POLICY_USING completo; referencias textuales no prueban ausencia de OR permisivo'
union all
select 'GLOBAL',case when count(*) filter(where status='FAIL')=0
  then 'PASS_STRUCTURAL' else 'FAIL' end,
  count(*) filter(where status='PASS')::text||' PASS; '||
  count(*) filter(where status='FAIL')::text||' FAIL; pruebas dinámicas PENDING'
from result
order by check_name;
