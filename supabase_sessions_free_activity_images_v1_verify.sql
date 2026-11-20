-- Solo lectura. Ejecutar después de instalar supabase_sessions_free_activity_images_v1.sql.
select
  to_regclass('public.planned_session_activity_images') is not null as tabla_instalada,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.planned_session_activity_images')),false) as rls_activa,
  (select count(*)=4 from pg_policies where schemaname='public' and tablename='planned_session_activity_images') as cuatro_politicas_tabla,
  (select count(*)=3 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in('planned_session_activity_storage_select','planned_session_activity_storage_insert','planned_session_activity_storage_delete')) as tres_politicas_storage,
  exists(select 1 from storage.buckets where id='planned-session-activity-images' and not public
    and file_size_limit=10485760 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]) as bucket_privado,
  exists(select 1 from pg_trigger where tgrelid=to_regclass('public.planned_session_activity_images')
    and tgname='planned_session_activity_images_guard' and tgenabled in('O','A')) as guarda_activa,
  public.planned_session_delete_contract_v1() as contrato_borrado_actualizado,
  to_regclass('public.planned_session_activity_image_cleanup') is not null as cola_limpieza_instalada,
  not has_table_privilege('anon','public.planned_session_activity_images','SELECT,INSERT,UPDATE,DELETE') as anon_bloqueado;

select c.conname,pg_get_constraintdef(c.oid) definicion
from pg_constraint c where c.conrelid=to_regclass('public.planned_session_activity_images') order by c.conname;

select policyname,cmd,roles,qual,with_check
from pg_policies where (schemaname='public' and tablename='planned_session_activity_images')
  or (schemaname='storage' and tablename='objects' and policyname like 'planned_session_activity_storage_%')
order by schemaname,policyname;

select count(*) as objetos_pendientes_de_limpieza
from public.planned_session_activity_image_cleanup;
