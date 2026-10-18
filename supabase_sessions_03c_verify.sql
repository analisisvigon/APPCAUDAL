-- APPCAUDAL Sesiones 03C: postflight estructural SOLO SELECT.
-- No ejecutado por Codex. GLOBAL PASS no sustituye pruebas por identidad,
-- ejecución de RPC ni verificación de bytes en Storage.
with
expected_functions(signature, authenticated_execute, expected_comment, definer) as (values
  ('public.planned_editor_payload_snapshot_safe(jsonb)',false,
    'APPCAUDAL Sesiones 03C: filtro cerrado para recursos ocultos en editor_payload',false),
  ('public.planned_library_snapshot(uuid)',false,
    'APPCAUDAL Sesiones 03C: snapshot sin uploads, emitido solo desde RPC',true),
  ('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])',true,
    'APPCAUDAL Sesiones 03C: guardado diferencial de actividades libres y Biblioteca',true),
  ('public.confirm_planned_session_03c(uuid,integer)',true,
    'APPCAUDAL Sesiones 03C: confirmación de actividades libres y Biblioteca',true)
),
functions as (
  select e.signature,e.authenticated_execute,e.expected_comment,e.definer,
    p.oid,p.prosecdef,p.proconfig,
    p.proowner,p.proacl,pg_get_userbyid(p.proowner) owner_name
  from expected_functions e
  left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
),
checks as (
  select 'FUNCTION '||f.signature as check_name,
    case when f.oid is not null and f.prosecdef=f.definer and f.owner_name='postgres'
      and coalesce(f.proconfig,'{}'::text[]) @> array['search_path=pg_catalog']::text[]
      and obj_description(f.oid,'pg_proc')=f.expected_comment
      and has_function_privilege('authenticated',f.oid,'EXECUTE')=f.authenticated_execute
      and not has_function_privilege('anon',f.oid,'EXECUTE')
      and not exists(select 1 from pg_catalog.aclexplode(
        coalesce(f.proacl,acldefault('f',f.proowner))) acl
        where acl.grantee=0 and acl.privilege_type='EXECUTE')
      then 'PASS' else 'FAIL' end as result,
    'SECURITY DEFINER='||f.definer::text||
      ', owner=postgres, search_path=pg_catalog; EXECUTE authenticated='||
      f.authenticated_execute::text||', anon/PUBLIC=false' as detail
  from functions f
  union all
  select 'OVERLOAD '||f.signature,
    case when f.oid is not null and (select count(*) from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname=split_part(split_part(f.signature,'(',1),'.',2))=1
      then 'PASS' else 'FAIL' end,
    'No debe existir otra firma con el mismo nombre' from functions f
  union all
  select 'EDITOR FILTER '||sample.name,
    case when public.planned_editor_payload_snapshot_safe(sample.payload)
      is not distinct from sample.expected then 'PASS' else 'FAIL' end,
    'Caso sintético sin datos de usuarios; esperado='||sample.expected::text
  from (values
    ('V1 simple',
      '{"schemaVersion":1,"board":{"pitchType":"full","elements":[]}}'::jsonb,true),
    ('V1 con roster',
      '{"schemaVersion":1,"board":{"pitchType":"full","elements":[]},"assignments":{"teamColors":{"team-1":"blue"},"players":[]}}'::jsonb,true),
    ('URL en clave desconocida',
      '{"schemaVersion":1,"board":{"pitchType":"full","elements":[],"background":{"url":"https://private.example/a.png"}}}'::jsonb,false),
    ('URL en texto conocido',
      '{"schemaVersion":1,"board":{"pitchType":"full","elements":[{"id":"text-1","type":"text","x":1,"y":1,"label":"https://private.example/a.png"}]}}'::jsonb,false),
    ('Extensión desconocida sin URL',
      '{"schemaVersion":1,"board":{"pitchType":"full","elements":[],"background":{"color":"green"}}}'::jsonb,false),
    ('Versión futura intacta pero no importable',
      '{"schemaVersion":2,"scenes":[{"id":"scene-1"}]}'::jsonb,false)
  ) sample(name,payload,expected)
  union all
  select 'GUARD planned_items_guard',
    case when exists(select 1 from pg_catalog.pg_trigger t
      where t.tgrelid=to_regclass('public.planned_session_items')
        and t.tgname='planned_items_guard' and t.tgenabled in ('O','A')
        and t.tgfoid=to_regprocedure('public.guard_planned_session_child()'))
      then 'PASS' else 'FAIL' end,
    'Trigger de ítems activo, unido a guard_planned_session_child'
  union all
  select 'GUARD function',
    case when p.oid is not null and p.prosecdef and
      pg_get_userbyid(p.proowner)='postgres' and
      obj_description(p.oid,'pg_proc')='APPCAUDAL Sesiones 03C: guard_planned_session_child' and
      coalesce(p.proconfig,'{}'::text[]) @> array['search_path=pg_catalog']::text[]
      then 'PASS' else 'FAIL' end,
    'Guard compartido sigue siendo SECURITY DEFINER con search_path seguro'
  from (values (1)) expected(dummy)
  left join pg_catalog.pg_proc p
    on p.oid=to_regprocedure('public.guard_planned_session_child()')
  union all
  select 'ITEMS direct writes authenticated',
    case when not has_table_privilege('authenticated','public.planned_session_items','INSERT')
      and not has_table_privilege('authenticated','public.planned_session_items','UPDATE')
      and not has_table_privilege('authenticated','public.planned_session_items','DELETE')
      then 'PASS' else 'FAIL' end,
    'Las filas solo se escriben mediante RPC autorizada'
  union all
  select 'MEDIA FK immediate',
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
      then 'PASS' else 'FAIL' end,
    'La FK validada e inmediata serializa inserciones de multimedia con el bloqueo de tarea'
  union all
  select 'ITEMS RLS',
    case when c.relrowsecurity is true and exists(select 1 from pg_catalog.pg_policy p
      where p.polrelid=c.oid and p.polname='planned_items_read')
      then 'PASS' else 'FAIL' end,
    'RLS y política de lectura 03A continúan presentes'
  from (values (1)) expected(dummy)
  left join pg_catalog.pg_class c
    on c.oid=to_regclass('public.planned_session_items')
  union all
  select 'FREE RPC 03A preserved',
    case when to_regprocedure(
      'public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])')
      is not null and to_regprocedure('public.confirm_planned_session(uuid,integer)')
      is not null then 'PASS' else 'FAIL' end,
    'Las firmas 03A siguen disponibles; comparar sus hashes con el preflight'
  union all
  select 'FREE RPC hash '||v.signature,'INFO',
    coalesce(md5(pg_get_functiondef(to_regprocedure(v.signature)::oid)), 'función ausente')
  from (values
    ('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'),
    ('public.confirm_planned_session(uuid,integer)')) v(signature)
  union all
  select 'SESSION number 1', 'INFO',
    'Recuento de sesiones confirmadas con número 1: '||count(*)::text
  from public.planned_training_sessions where session_number=1
  union all
  select 'LIBRARY snapshots', 'INFO',
    'Recuento de ítems library_task: '||count(*)::text
  from public.planned_session_items where kind='library_task'
  union all
  select 'DYNAMIC identity tests','PENDING',
    'Owner, staff asignado/no asignado, player y lectura de Biblioteca no se han probado aquí'
  union all
  select 'DYNAMIC compatibility 03A/03C','PENDING',
    '03A con actividades libres, rechazo de snapshot en 03A y sesión número 1 requieren prueba reversible'
  union all
  select 'DYNAMIC working PATCH','PENDING',
    'Dos ediciones sucesivas, inmutabilidad de source y pizarra futura readonly requieren prueba reversible'
  union all
  select 'DYNAMIC closed/CAS','PENDING',
    'Temporada cerrada y revisión obsoleta requieren casos reales o pruebas reversibles autorizadas'
  union all
  select 'STORAGE bytes','PENDING',
    'La copia selectiva de uploads aún no está instalada; la RPC debe rechazarlos'
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
select check_name,result,detail from checks
union all
select 'GLOBAL STRUCTURAL',
  case when count(*) filter (where result='FAIL')=0 then 'PASS' else 'FAIL' end,
  'PASS estructural no significa autorización dinámica ni multimedia comprobada. FAIL='||
  count(*) filter (where result='FAIL')||', PENDING='||
  count(*) filter (where result='PENDING')
from checks
order by check_name;
