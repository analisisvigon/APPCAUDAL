-- APPCAUDAL Sesiones 03A: inventario previo. SOLO SELECT; no ejecutado por Codex.
-- Una única tabla exportable (incluida la fila GLOBAL y las referencias al cierre).
with
required_tables(name) as (values
  ('club_seasons'),('club_team_seasons'),('club_memberships'),
  ('club_team_season_permissions'),
  ('club_teams'),('equipos_rivales')
),
new_objects(name,kind) as (values
  ('planned_training_sessions','table'),('planned_session_number_state','table'),
  ('planned_session_slots','table'),('planned_session_items','table'),
  ('planned_session_audit_events','table'),
  ('planned_session_state','function'),('guard_planned_session_row','function'),
  ('guard_planned_session_child','function'),('guard_planned_session_number','function'),
  ('guard_planned_session_audit','function'),
  ('create_planned_session_draft','function'),('save_planned_session','function'),
  ('confirm_planned_session','function')
),
new_indexes(name) as (values
  ('planned_sessions_number_uidx'),('planned_sessions_date_idx'),
  ('planned_items_session_slot_idx'),('planned_audit_session_date_idx')
),
source_columns(table_name,column_name,type_name) as (values
  ('club_seasons','id','uuid'),('club_seasons','club_id','uuid'),
  ('club_seasons','starts_on','date'),('club_seasons','ends_on','date'),
  ('club_seasons','status','text'),('club_seasons','label','text'),
  ('club_team_seasons','id','uuid'),('club_team_seasons','club_id','uuid'),
  ('club_team_seasons','team_id','uuid'),('club_team_seasons','season_id','uuid'),
  ('club_teams','id','uuid'),('club_teams','club_id','uuid'),
  ('club_memberships','id','uuid'),('club_memberships','club_id','uuid'),
  ('club_memberships','user_id','uuid'),('club_memberships','role','text'),
  ('club_memberships','is_active','bool'),
  ('club_team_season_permissions','club_id','uuid'),
  ('club_team_season_permissions','club_team_season_id','uuid'),
  ('club_team_season_permissions','membership_id','uuid'),
  ('equipos_rivales','id','uuid'),
  ('equipos_rivales','name','text')
),
source_functions as (
  select n.nspname||'.'||p.proname||'('||
      pg_get_function_identity_arguments(p.oid)||')' as object_name,
    p.proname,pg_get_userbyid(p.proowner) as owner_name,
    p.prosecdef as security_definer,p.proconfig::text as function_config,
    case when p.prokind in ('f','p') then pg_get_functiondef(p.oid)
      else '' end as definition
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
),
findings as (
  select 'source_table:'||name as check_name,
    case when to_regclass('public.'||name) is not null then 'PASS' else 'BLOCKED' end as status,
    'Tabla fuente requerida' as detail from required_tables
  union all
  select 'source_column:'||table_name||'.'||column_name,
    case when exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid=to_regclass('public.'||table_name)
        and a.attname=column_name and a.atttypid=to_regtype('pg_catalog.'||type_name)
        and a.attnotnull and not a.attisdropped
    ) then 'PASS' else 'BLOCKED' end,
    'Columna/tipo/NOT NULL del contrato de origen' from source_columns
  union all
  select 'new_name:'||kind||':'||name,
    case when (kind='table' and to_regclass('public.'||name) is null)
           or (kind='function' and not exists (
             select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname=name))
      then 'PASS' else 'BLOCKED' end,
    'Nombre nuevo libre; si existe un despliegue 03A previo, usar postflight, no preflight'
  from new_objects
  union all
  select 'new_index:'||name,
    case when to_regclass('public.'||name) is null then 'PASS' else 'BLOCKED' end,
    'Nombre de índice libre' from new_indexes
  union all
  select 'helper:'||x.signature,
    case when to_regprocedure(x.signature) is null then 'BLOCKED'
      when has_function_privilege('authenticated',x.signature,'EXECUTE')
       and not has_function_privilege('anon',x.signature,'EXECUTE')
      then 'PASS' else 'BLOCKED' end,
    'Helper presente; authenticated EXECUTE; anon sin EXECUTE'
  from (values ('public.can_read_club_team_season(uuid)'),
               ('public.can_write_club_team_season(uuid)'),
               ('public.has_club_role(uuid,text[])')) x(signature)
  union all
  select 'cts_season_fk',
    case when exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_team_seasons')
        and c.confrelid=to_regclass('public.club_seasons')
        and c.contype='f' and c.convalidated and c.confdeltype='r'
        and c.conkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='season_id'),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='club_id')]
        and c.confkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='id'),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='club_id')]
    ) then 'PASS' else 'BLOCKED' end,
    'FK compuesta validada (season_id,club_id) a (id,club_id), DELETE RESTRICT'
  union all
  select 'cts_team_fk',
    case when exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_team_seasons')
        and c.confrelid=to_regclass('public.club_teams')
        and c.contype='f' and c.convalidated and c.confdeltype='r'
        and c.conkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='team_id'),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='club_id')]
        and c.confkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='id'),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='club_id')]
    ) then 'PASS' else 'BLOCKED' end,
    'FK compuesta validada (team_id,club_id) a (id,club_id), DELETE RESTRICT'
  union all
  select 'canonical_team_primary_key',
    case when exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_teams')
        and c.contype='p' and c.convalidated
        and c.conkey=array[(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=c.conrelid and a.attname='id' and not a.attisdropped)])
      then 'PASS' else 'BLOCKED' end,
    'club_teams.id es la identidad canónica del equipo'
  union all
  select 'canonical_team_club_key',
    case when exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_teams')
        and c.contype='u' and c.convalidated
        and c.conkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='id' and not a.attisdropped),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='club_id' and not a.attisdropped)])
      then 'PASS' else 'BLOCKED' end,
    'UNIQUE (id,club_id) sostiene la FK compuesta CTS-equipo'
  union all
  select 'canonical_team_name_fk',
    case when exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_teams')
        and c.confrelid=to_regclass('public.equipos_rivales')
        and c.contype='f' and c.convalidated and c.confdeltype='r'
        and c.conkey=array[(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=c.conrelid and a.attname='id' and not a.attisdropped)]
        and c.confkey=array[(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=c.confrelid and a.attname='id' and not a.attisdropped)])
      then 'PASS' else 'BLOCKED' end,
    'FK validada club_teams.id a equipos_rivales.id; nombre deportivo en equipos_rivales.name'
  union all
  select 'season_lifecycle_constraints',
    case when (select count(*) from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_seasons')
        and c.conname in ('club_seasons_status_check',
          'club_seasons_lifecycle_consistency_check')
        and c.contype='c' and c.convalidated)=2
      then 'PASS' else 'BLOCKED' end,
    'CHECKs de estado y coherencia existentes y validadas; contrastar sus definiciones'
  union all
  select 'membership_unique_club_user',
    case when exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_memberships')
        and c.conname='club_memberships_club_user_key'
        and c.contype='u' and c.convalidated
        and c.conkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='club_id'),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='user_id')])
      then 'PASS' else 'BLOCKED' end,
    'Una membership por usuario y club para el actor de cada RPC'
  union all
  select 'permission_fks',
    case when exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_team_season_permissions')
        and c.confrelid=to_regclass('public.club_memberships')
        and c.contype='f' and c.convalidated and c.confdeltype='c'
        and c.conkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='membership_id' and not a.attisdropped),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='club_id' and not a.attisdropped)]
        and c.confkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='id' and not a.attisdropped),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='club_id' and not a.attisdropped)])
      and exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid=to_regclass('public.club_team_season_permissions')
        and c.confrelid=to_regclass('public.club_team_seasons')
        and c.contype='f' and c.convalidated and c.confdeltype='r'
        and c.conkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='club_team_season_id' and not a.attisdropped),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.conrelid and a.attname='club_id' and not a.attisdropped)]
        and c.confkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='id' and not a.attisdropped),
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=c.confrelid and a.attname='club_id' and not a.attisdropped)])
      then 'PASS' else 'BLOCKED' end,
    'FKs compuestas validadas: membership+club CASCADE y CTS+club RESTRICT'
  union all
  select 'session_context',
    case when current_user='postgres' and auth.uid() is null then 'PASS' else 'BLOCKED' end,
    'La migración exige postgres en SQL Editor, sin JWT de usuario'
  union all
  select 'CLOSURE_FUNCTION:'||object_name,'INFO',
    'owner='||owner_name||'; security_definer='||security_definer::text||
    '; config='||coalesce(function_config,'NULL')||
    '; references_status='||(position('status' in definition)>0)::text
  from source_functions
  where position('club_seasons' in definition)>0
    or proname in ('can_read_club_team_season','can_write_club_team_season')
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
)
select check_name,status,detail from findings
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
select 'SEASON_CONSTRAINT:'||c.conname,'INFO',pg_get_constraintdef(c.oid)
from pg_catalog.pg_constraint c
where c.conrelid=to_regclass('public.club_seasons')
  and c.conname in ('club_seasons_status_check',
    'club_seasons_lifecycle_consistency_check')
union all
select 'GLOBAL',case when count(*) filter(where status='BLOCKED')=0 then 'READY_TO_APPLY' else 'BLOCKED' end,
  count(*) filter(where status='PASS')::text||' PASS; '||count(*) filter(where status='BLOCKED')::text||' BLOCKED'
from findings
order by check_name;
