-- Solo lectura. Ejecutar después de instalar supabase_sessions_free_activity_images_v1.sql.
select
  to_regclass('public.planned_session_activity_images') is not null as tabla_instalada,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.planned_session_activity_images')),false) as rls_activa,
  (select count(*)=4 from pg_policies where schemaname='public' and tablename='planned_session_activity_images') as cuatro_politicas_tabla,
  (select count(*)=4 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in('planned_session_activity_storage_select','planned_session_activity_storage_insert','planned_session_activity_storage_update','planned_session_activity_storage_delete')) as cuatro_politicas_storage,
  exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='planned_session_activity_storage_select' and cmd='SELECT'
    and position('planned_session_activity_images' in coalesce(qual,''))>0
    and position('can_delete_planned_session_activity_storage' in coalesce(qual,''))>0)
    as select_permite_media_o_limpieza_autorizada,
  exists(select 1 from storage.buckets where id='planned-session-activity-images' and not public
    and file_size_limit=10485760 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]) as bucket_privado,
  exists(select 1 from pg_trigger where tgrelid=to_regclass('public.planned_session_activity_images')
    and tgname='planned_session_activity_images_guard' and tgenabled in('O','A')) as guarda_activa,
  public.planned_session_delete_contract_v1() as contrato_borrado_actualizado,
  to_regclass('public.planned_session_activity_image_cleanup') is not null as cola_limpieza_instalada,
  not has_table_privilege('authenticated','public.planned_session_activity_image_cleanup','SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon','public.planned_session_activity_image_cleanup','SELECT,INSERT,UPDATE,DELETE') as cola_no_accesible_a_clientes,
  to_regprocedure('public.list_planned_session_activity_cleanup_v1(uuid,uuid)') is not null
    and to_regprocedure('public.confirm_planned_session_activity_cleanup_v1(text)') is not null
    and to_regprocedure('public.can_delete_planned_session_activity_storage(text)') is not null as procedimiento_limpieza_instalado,
  (select position('can_write_club_team_season' in prosrc)=0
      and position('club_team_season_permissions' in prosrc)>0
    from pg_proc where oid=to_regprocedure('public.can_manage_planned_session_activity_cleanup(uuid)'))
    as limpieza_independiente_del_estado_temporada,
  has_function_privilege('authenticated','public.list_planned_session_activity_cleanup_v1(uuid,uuid)','EXECUTE')
    and has_function_privilege('authenticated','public.confirm_planned_session_activity_cleanup_v1(text)','EXECUTE')
    and has_function_privilege('authenticated','public.can_delete_planned_session_activity_storage(text)','EXECUTE')
    and not has_function_privilege('anon','public.list_planned_session_activity_cleanup_v1(uuid,uuid)','EXECUTE')
    and not has_function_privilege('anon','public.confirm_planned_session_activity_cleanup_v1(text)','EXECUTE')
    and not has_function_privilege('anon','public.can_delete_planned_session_activity_storage(text)','EXECUTE') as limpieza_privada,
  exists(select 1 from pg_constraint where conrelid=to_regclass('public.planned_session_activity_images')
    and conname='planned_session_activity_images_item_order_key' and condeferrable and condeferred) as limite_concurrente_instalado,
  exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.planned_session_items')
    and c.contype in('p','u') and c.convalidated and not c.condeferrable
    and array(select a.attname::text from unnest(c.conkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord)
      =array['id','session_id']::text[]) as clave_items_compuesta_compatible,
  not has_table_privilege('anon','public.planned_session_activity_images','SELECT,INSERT,UPDATE,DELETE') as anon_bloqueado;

select c.conname,pg_get_constraintdef(c.oid) definicion
from pg_constraint c where c.conrelid=to_regclass('public.planned_session_activity_images') order by c.conname;

select policyname,cmd,roles,qual,with_check
from pg_policies where (schemaname='public' and tablename='planned_session_activity_images')
  or (schemaname='storage' and tablename='objects' and policyname like 'planned_session_activity_storage_%')
order by schemaname,policyname;

select count(*) as objetos_pendientes_de_limpieza
from public.planned_session_activity_image_cleanup;

select proname,pg_get_functiondef(oid) definicion
from pg_proc where oid in(
  to_regprocedure('public.guard_planned_session_activity_image()'),
  to_regprocedure('public.can_manage_planned_session_activity_cleanup(uuid)'),
  to_regprocedure('public.can_delete_planned_session_activity_storage(text)'),
  to_regprocedure('public.list_planned_session_activity_cleanup_v1(uuid,uuid)'),
  to_regprocedure('public.confirm_planned_session_activity_cleanup_v1(text)'),
  to_regprocedure('public.reorder_planned_session_activity_images_v1(uuid,uuid[])'))
order by proname;
