-- APPCAUDAL · Tareas V1 · postcheck READ-ONLY de task_code.
begin;
set transaction read only;

with column_metadata as (
  select
    columns.data_type,
    columns.is_nullable,
    columns.column_default
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'training_tasks'
    and columns.column_name = 'task_code'
)
select
  exists (select 1 from column_metadata) as column_exists,
  coalesce((select data_type = 'text' from column_metadata), false) as type_is_text,
  coalesce((select is_nullable = 'YES' from column_metadata), false) as is_nullable,
  coalesce((select column_default is null from column_metadata), false) as has_no_default,
  not exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_attribute attribute_row
      on attribute_row.attrelid = index_row.indrelid
     and attribute_row.attname = 'task_code'
     and attribute_row.attnum = any(index_row.indkey)
    where index_row.indrelid = 'public.training_tasks'::regclass
      and index_row.indisunique
  ) as has_no_unique_index,
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.training_tasks'::regclass
      and constraint_row.conname = 'training_tasks_task_code_format'
      and constraint_row.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%char_length(task_code)%'
  ) as format_constraint_present;

rollback;
