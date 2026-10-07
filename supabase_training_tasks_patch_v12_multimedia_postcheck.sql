-- APPCAUDAL · Tareas / Multimedia V1 · postcheck remoto READ ONLY.
-- Devuelve una sola fila; todos los indicadores deben ser true.
begin;
set transaction read only;

with
columns_ok as (
  select count(*) = 19
    and count(*) filter (where is_nullable = 'NO') = 10
    and bool_or(column_name = 'size_bytes' and data_type = 'bigint')
    and bool_or(column_name = 'sort_order' and data_type = 'integer' and column_default = '10')
    and bool_or(column_name = 'is_primary' and data_type = 'boolean' and column_default = 'false')
    as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'training_task_media'
),
fk_ok as (
  select count(*) filter (
    where confrelid = 'public.training_tasks'::regclass and confdeltype = 'c'
  ) = 1 as task_cascade,
  count(*) filter (where contype = 'c' and conname in (
    'training_task_media_kind','training_task_media_source','training_task_media_provider',
    'training_task_media_sort_order','training_task_media_text_lengths','training_task_media_source_contract'
  )) = 6 as constraints
  from pg_catalog.pg_constraint
  where conrelid = 'public.training_task_media'::regclass
),
policies_ok as (
  select count(*) = 4
    and count(*) filter (where policyname = 'training_task_media_select' and cmd = 'SELECT'
      and roles = '{authenticated}' and qual ~ 'training_task_authorized') = 1
    and count(*) filter (where policyname = 'training_task_media_insert' and cmd = 'INSERT'
      and roles = '{authenticated}' and with_check ~ 'author_user_id = auth.uid' and with_check ~ 'training_task_authorized') = 1
    and count(*) filter (where policyname = 'training_task_media_update' and cmd = 'UPDATE'
      and roles = '{authenticated}' and qual ~ 'author_user_id = auth.uid' and with_check ~ 'training_task_authorized') = 1
    and count(*) filter (where policyname = 'training_task_media_delete' and cmd = 'DELETE'
      and roles = '{authenticated}' and qual ~ 'author_user_id = auth.uid') = 1 as value
  from pg_catalog.pg_policies
  where schemaname = 'public' and tablename = 'training_task_media'
),
index_contracts as (
  select
    index_relation.relname as indexname,
    index_catalog.indisunique,
    index_catalog.indisprimary,
    index_catalog.indisvalid,
    index_catalog.indisready,
    access_method.amname as access_method,
    index_catalog.indnatts = index_catalog.indnkeyatts as has_no_included_columns,
    array(
      select attribute_entry.attname
      from unnest(index_catalog.indkey::smallint[]) with ordinality
        as index_key(attnum, key_position)
      join pg_catalog.pg_attribute attribute_entry
        on attribute_entry.attrelid = table_relation.oid
       and attribute_entry.attnum = index_key.attnum
      where index_key.key_position <= index_catalog.indnkeyatts
      order by index_key.key_position
    ) as key_columns,
    pg_get_expr(index_catalog.indpred, index_catalog.indrelid, true) as predicate
  from pg_catalog.pg_class table_relation
  join pg_catalog.pg_namespace table_namespace
    on table_namespace.oid = table_relation.relnamespace
  join pg_catalog.pg_index index_catalog
    on index_catalog.indrelid = table_relation.oid
  join pg_catalog.pg_class index_relation
    on index_relation.oid = index_catalog.indexrelid
  join pg_catalog.pg_am access_method
    on access_method.oid = index_relation.relam
  where table_namespace.nspname = 'public'
    and table_relation.relname = 'training_task_media'
),
indexes_ok as (
  select count(*) filter (
    where indexname = 'training_task_media_task_order_idx'
      and not indisunique and not indisprimary
      and indisvalid and indisready
      and access_method = 'btree'
      and has_no_included_columns
      and key_columns = array['task_id','sort_order','created_at','id']::name[]
      and predicate is null
  ) = 1
    and count(*) filter (
      where indexname = 'training_task_media_one_primary_idx'
        and indisunique and not indisprimary
        and indisvalid and indisready
        and access_method = 'btree'
        and has_no_included_columns
        and key_columns = array['task_id']::name[]
        and predicate = 'is_primary'
    ) = 1 as value
  from index_contracts
),
bucket_ok as (
  select count(*) = 1 and bool_and(public = false) and bool_and(file_size_limit = 10485760)
    and bool_and(allowed_mime_types @> array['image/jpeg','image/png','image/webp','application/pdf']::text[])
    and bool_and(allowed_mime_types <@ array['image/jpeg','image/png','image/webp','application/pdf']::text[]) as value
  from storage.buckets where id = 'training-task-files'
),
storage_ok as (
  select count(*) = 4 as policies_preserved
  from pg_catalog.pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('training_task_files_select','training_task_files_insert','training_task_files_update','training_task_files_delete')
),
functions_ok as (
  select
    to_regprocedure('public.training_task_media_path_matches(text,uuid,uuid,uuid,uuid)') is not null as path_helper,
    exists (
      select 1 from pg_catalog.pg_proc
      where oid = to_regprocedure('public.training_task_media_guard()') and prosecdef
        and pg_get_functiondef(oid) ~ 'new\.updated_at := now\(\)'
    )
      and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.training_task_media_guard()'),'EXECUTE'),true)
      and not coalesce(has_function_privilege('anon',to_regprocedure('public.training_task_media_guard()'),'EXECUTE'),true) as guard,
    pg_get_functiondef(to_regprocedure('public.training_task_storage_allowed(text,text)'))
      ~ 'task\.preview_path = p_path or task\.attachment_path = p_path' as legacy_branch,
    pg_get_functiondef(to_regprocedure('public.training_task_storage_allowed(text,text)'))
      ~ 'media\.storage_path = p_path' as media_exact_path
),
trigger_ok as (
  select count(distinct trigger_name) = 1 as value
  from information_schema.triggers
  where event_object_schema = 'public' and event_object_table = 'training_task_media'
    and trigger_name = 'training_task_media_guard'
)
select
  to_regclass('public.training_task_media') is not null as table_exists,
  coalesce((select relrowsecurity from pg_catalog.pg_class where oid = 'public.training_task_media'::regclass), false) as rls_enabled,
  columns_ok.value as columns_ok,
  fk_ok.task_cascade as task_fk_cascade,
  fk_ok.constraints as constraints_ok,
  policies_ok.value as four_policies_ok,
  indexes_ok.value as order_and_unique_primary_indexes_ok,
  trigger_ok.value as guard_trigger_ok,
  functions_ok.path_helper and functions_ok.guard as helper_and_guard_ok,
  functions_ok.legacy_branch as legacy_attachment_authorization_preserved,
  functions_ok.media_exact_path as media_exact_path_authorization_ok,
  storage_ok.policies_preserved as storage_policies_preserved,
  bucket_ok.value as private_10_mib_current_mime_bucket_ok,
  has_table_privilege('authenticated','public.training_task_media','SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon','public.training_task_media','SELECT,INSERT,UPDATE,DELETE') as grants_ok,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'training_tasks'
    and column_name = 'attachment_path') as legacy_columns_preserved
from columns_ok, fk_ok, policies_ok, indexes_ok, bucket_ok, storage_ok, functions_ok, trigger_ok;

rollback;
