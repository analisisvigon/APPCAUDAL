-- APPCAUDAL Sesiones 03C: preflight de contrato, SOLO SELECT.
-- Preparado localmente; NO ejecutado por Codex. No inspecciona datos personales.
-- READY_TO_DESIGN no autoriza aplicar una migración: falta decidir la custodia de Storage.
with
required_tables(name) as (values
  ('training_tasks'),('training_task_shares'),('training_task_media'),
  ('planned_training_sessions'),('planned_session_slots'),('planned_session_items'),
  ('planned_session_audit_events'),('club_team_seasons'),('club_seasons')
),
required_columns(table_name, column_name, type_name) as (values
  ('training_tasks','id','uuid'),('training_tasks','club_id','uuid'),
  ('training_tasks','name','text'),('training_tasks','editor_payload','jsonb'),
  ('training_tasks','preview_path','text'),('training_tasks','attachment_path','text'),
  ('training_task_media','task_id','uuid'),('training_task_media','source','text'),
  ('training_task_media','storage_path','text'),('training_task_media','original_url','text'),
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
      then 'READY' else 'BLOCKED' end,
    'owner='||coalesce(pg_get_userbyid(p.proowner),'ausente')||
      '; SECURITY DEFINER='||coalesce(p.prosecdef::text,'ausente')||
      '; config='||coalesce(p.proconfig::text,'ausente')||
      '; md5(definición)='||coalesce(md5(pg_get_functiondef(p.oid)),'ausente')
  from required_functions f
  left join pg_catalog.pg_proc p on p.oid=to_regprocedure(f.signature)
  union all
  select 'CONSTRAINT '||v.name,
    case when c.oid is not null and c.convalidated then 'READY' else 'BLOCKED' end,
    coalesce(pg_get_constraintdef(c.oid,true),'ausente')
  from (values ('planned_items_kind_check'),('planned_items_text_check'),
    ('planned_items_slot_fkey')) v(name)
  left join pg_catalog.pg_constraint c
    on c.conrelid=to_regclass('public.planned_session_items') and c.conname=v.name
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
)
select object_name,status,detail from checks
union all
select 'GLOBAL',case when count(*) filter (where status='BLOCKED')=0
  then 'READY_TO_DESIGN' else 'BLOCKED' end,
  'Comprobaciones bloqueadas: '||count(*) filter (where status='BLOCKED')||
  '. READY_TO_DESIGN no significa backend ni multimedia listos para instalar.'
from checks
order by object_name;
