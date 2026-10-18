-- APPCAUDAL Sesiones 03C: preflight de contrato, SOLO SELECT.
-- Preparado localmente; NO ejecutado por Codex. No inspecciona datos personales.
-- READY_TO_DESIGN no autoriza aplicar una migración: la copia selectiva de
-- Storage está decidida, pero aún no está implementada ni probada.
with
required_tables(name) as (values
  ('training_tasks'),('training_task_shares'),('training_task_media'),
  ('planned_training_sessions'),('planned_session_slots'),('planned_session_items'),
  ('planned_session_audit_events'),('club_team_seasons'),('club_seasons')
),
required_columns(table_name, column_name, type_name) as (values
  ('training_tasks','id','uuid'),('training_tasks','club_id','uuid'),
  ('training_tasks','name','text'),('training_tasks','editor_payload','jsonb'),
  ('training_tasks','task_code','text'),('training_tasks','stage_keys','_text'),
  ('training_tasks','variants','text'),('training_tasks','description','text'),
  ('training_tasks','objective','text'),('training_tasks','task_type','text'),
  ('training_tasks','players_spec','text'),('training_tasks','players_min','int4'),
  ('training_tasks','players_max','int4'),('training_tasks','duration_minutes','int4'),
  ('training_tasks','space_width_m','numeric'),('training_tasks','space_length_m','numeric'),
  ('training_tasks','material','text'),('training_tasks','technical_content','text'),
  ('training_tasks','tactical_content','text'),('training_tasks','game_phase','text'),
  ('training_tasks','game_moment','text'),('training_tasks','observations','text'),
  ('training_tasks','preview_path','text'),('training_tasks','attachment_path','text'),
  ('training_task_media','id','uuid'),('training_task_media','task_id','uuid'),
  ('training_task_media','club_id','uuid'),('training_task_media','kind','text'),
  ('training_task_media','source','text'),('training_task_media','storage_path','text'),
  ('training_task_media','original_url','text'),('training_task_media','provider','text'),
  ('training_task_media','provider_key','text'),('training_task_media','title','text'),
  ('training_task_media','caption','text'),('training_task_media','sort_order','int4'),
  ('training_task_media','is_primary','bool'),('training_task_media','created_at','timestamptz'),
  ('planned_session_items','id','uuid'),('planned_session_items','session_id','uuid'),
  ('planned_session_items','slot_id','uuid'),('planned_session_items','kind','text'),
  ('planned_session_items','source_task_uuid_snapshot','uuid'),
  ('planned_session_items','task_snapshot','jsonb'),
  ('planned_training_sessions','club_team_season_id','uuid'),
  ('planned_training_sessions','revision','int4'),
  ('club_seasons','status','text')
),
required_functions(signature) as (values
  ('public.training_task_authorized(uuid,text)'),
  ('public.can_read_club_team_season(uuid)'),
  ('public.can_write_club_team_season(uuid)'),
  ('public.planned_session_state(uuid)'),
  ('public.guard_planned_session_child()'),
  ('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'),
  ('public.confirm_planned_session(uuid,integer)')
),
checks as (
  select 'TABLE '||name as object_name,
    case when c.oid is not null and c.relkind='r' and c.relrowsecurity
      then 'READY' else 'BLOCKED' end as status,
    coalesce('owner='||pg_get_userbyid(c.relowner)||'; RLS='||c.relrowsecurity::text,
      'tabla inexistente') as detail
  from required_tables t
  left join pg_catalog.pg_class c on c.oid=to_regclass('public.'||t.name)
  union all
  select 'COLUMN '||r.table_name||'.'||r.column_name,
    case when a.atttypid=to_regtype('pg_catalog.'||r.type_name)
      and not a.attisdropped then 'READY' else 'BLOCKED' end,
    'tipo esperado: '||r.type_name||'; tipo observado: '||coalesce(format_type(a.atttypid,a.atttypmod),'ausente')
  from required_columns r
  left join pg_catalog.pg_attribute a
    on a.attrelid=to_regclass('public.'||r.table_name)
   and a.attname=r.column_name and a.attnum>0 and not a.attisdropped
  union all
  select 'FUNCTION '||f.signature,
    case when p.oid is not null and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
      and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=pg_catalog']::text[]
      then 'READY' else 'BLOCKED' end,
    'owner='||coalesce(pg_get_userbyid(p.proowner),'ausente')||
      '; SECURITY DEFINER='||coalesce(p.prosecdef::text,'ausente')||
      '; config='||coalesce(p.proconfig::text,'ausente')||
      '; md5(definición)='||coalesce(md5(pg_get_functiondef(p.oid)),'ausente')
  from required_functions f
  left join pg_catalog.pg_proc p on p.oid=to_regprocedure(f.signature)
  union all
  select '03C overloads',
    case when not exists(select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('planned_editor_payload_snapshot_safe','planned_library_snapshot',
         'save_planned_session_03c','confirm_planned_session_03c')
        and p.oid not in (
          coalesce(to_regprocedure('public.planned_editor_payload_snapshot_safe(jsonb)')::oid,'0'::oid),
          coalesce(to_regprocedure('public.planned_library_snapshot(uuid)')::oid,'0'::oid),
          coalesce(to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])')::oid,'0'::oid),
          coalesce(to_regprocedure('public.confirm_planned_session_03c(uuid,integer)')::oid,'0'::oid)))
      then 'READY' else 'BLOCKED' end,
    'No debe existir ninguna firma alternativa de los cuatro helpers/RPC nuevos'
  union all
  select '03C existing function marker '||v.signature,
    case when to_regprocedure(v.signature) is null or
      obj_description(to_regprocedure(v.signature)::oid,'pg_proc')=v.description
      then 'READY' else 'BLOCKED' end,
    'Una función preexistente con igual firma debe pertenecer a 03C'
  from (values
    ('public.planned_editor_payload_snapshot_safe(jsonb)',
      'APPCAUDAL Sesiones 03C: filtro cerrado para recursos ocultos en editor_payload'),
    ('public.planned_library_snapshot(uuid)',
      'APPCAUDAL Sesiones 03C: snapshot sin uploads, emitido solo desde RPC'),
    ('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])',
      'APPCAUDAL Sesiones 03C: guardado diferencial de actividades libres y Biblioteca'),
    ('public.confirm_planned_session_03c(uuid,integer)',
      'APPCAUDAL Sesiones 03C: confirmación de actividades libres y Biblioteca')
  ) v(signature,description)
  union all
  select 'GUARD marker 03A/03C',
    case when coalesce(obj_description(to_regprocedure(
      'public.guard_planned_session_child()')::oid,'pg_proc'),'') in
      ('APPCAUDAL Sesiones 03A: guard_planned_session_child',
       'APPCAUDAL Sesiones 03C: guard_planned_session_child')
      then 'READY' else 'BLOCKED' end,
    'El único reemplazo de función existente exige una marca conocida'
  union all
  select 'CONSTRAINT '||v.name,
    case when c.oid is not null and c.convalidated then 'READY' else 'BLOCKED' end,
    coalesce(pg_get_constraintdef(c.oid,true),'ausente')
  from (values ('planned_items_kind_check'),('planned_items_text_check'),
    ('planned_items_slot_fkey')) v(name)
  left join pg_catalog.pg_constraint c
    on c.conrelid=to_regclass('public.planned_session_items') and c.conname=v.name
  union all
  select 'FK training_task_media.task_id -> training_tasks.id',
    case when exists(select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute child_col
        on child_col.attrelid=c.conrelid and child_col.attnum=any(c.conkey)
      join pg_catalog.pg_attribute parent_col
        on parent_col.attrelid=c.confrelid and parent_col.attnum=any(c.confkey)
      where c.conrelid=to_regclass('public.training_task_media')
        and c.confrelid=to_regclass('public.training_tasks')
        and c.contype='f' and c.convalidated and not c.condeferrable
        and cardinality(c.conkey)=1 and cardinality(c.confkey)=1
        and child_col.attname='task_id' and parent_col.attname='id')
      then 'READY' else 'BLOCKED' end,
    'FK inmediata y validada requerida para serializar incorporaciones y multimedia'
  union all
  select 'TRIGGER '||v.name,
    case when t.oid is not null and t.tgenabled in ('O','A') then 'READY' else 'BLOCKED' end,
    coalesce(pg_get_triggerdef(t.oid,true),'ausente')
  from (values ('planned_items_guard','planned_session_items'),
    ('planned_slots_guard','planned_session_slots'),
    ('planned_sessions_guard','planned_training_sessions')) v(name,table_name)
  left join pg_catalog.pg_trigger t
    on t.tgrelid=to_regclass('public.'||v.table_name)
   and t.tgname=v.name and not t.tgisinternal
  union all
  select 'STORAGE bucket training-task-files',
    case when to_regclass('storage.buckets') is not null
      and to_regclass('storage.objects') is not null then 'INFO' else 'BLOCKED' end,
    'Este inventario no verifica bytes, bucket ni políticas efectivas de Storage'
  union all
  select 'EDITOR payload inventory','INFO',
    'tareas='||count(*)::text||'; vacío='||
    count(*) filter (where editor_payload='{}'::jsonb)::text||'; V1='||
    count(*) filter (where editor_payload->'schemaVersion'='1'::jsonb)::text||
    '; versión distinta/ausente no vacía='||count(*) filter (where
      editor_payload<>'{}'::jsonb and
      editor_payload->'schemaVersion' is distinct from '1'::jsonb)::text||
    '. Solo son recuentos; no certifican ausencia de recursos ocultos.'
  from public.training_tasks
  union all
  select 'FREE RPC hash '||v.signature,'INFO',
    coalesce(md5(pg_get_functiondef(to_regprocedure(v.signature)::oid)), 'función ausente')
  from (values
    ('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'),
    ('public.confirm_planned_session(uuid,integer)')) v(signature)
  union all
  select 'RLS fingerprint 03A','INFO',
    coalesce(md5(string_agg(
      c.relname||':'||p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||
      p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),
      '|' order by c.relname,p.polname)),'sin políticas')
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid=p.polrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in
    ('planned_training_sessions','planned_session_slots','planned_session_items',
     'planned_session_number_state','planned_session_audit_events')
  union all
  select 'SESSION state fingerprint','INFO',
    'sessions='||count(*)::text||'; number_1='||
    count(*) filter (where s.session_number=1)::text||'; state_hash='||
    coalesce(md5(string_agg(s.id::text||':'||
      md5(public.planned_session_state(s.id)::text),'|' order by s.id)),'sin sesiones')||
    '; number_1_hash='||coalesce(md5(string_agg(s.id::text||':'||
      md5(public.planned_session_state(s.id)::text),'|' order by s.id)
      filter (where s.session_number=1)),'sin número 1')
  from public.planned_training_sessions s
  union all
  select 'ITEM state fingerprint','INFO',
    'items='||count(*)::text||'; library='||
    count(*) filter (where it.kind='library_task')::text||'; hash='||
    coalesce(md5(string_agg(it.id::text||':'||md5(to_jsonb(it)::text),
      '|' order by it.id)),'sin ítems')
  from public.planned_session_items it
)
select object_name,status,detail from checks
union all
select 'GLOBAL',case when count(*) filter (where status='BLOCKED')=0
  then 'READY_TO_DESIGN' else 'BLOCKED' end,
  'Comprobaciones bloqueadas: '||count(*) filter (where status='BLOCKED')||
  '. READY_TO_DESIGN no significa backend ni multimedia listos para instalar.'
from checks
order by object_name;
