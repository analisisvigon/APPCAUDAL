-- APPCAUDAL · Tareas V1.1 · postcheck remoto READ ONLY.
-- Devuelve una sola fila; todos los indicadores deben ser true.
begin;
set transaction read only;

with
task_columns as (
  select
    bool_or(column_name = 'stage_keys' and udt_name = '_text' and is_nullable = 'NO'
      and column_default like '%{}%') as stage_keys_ok,
    bool_or(column_name = 'variants' and data_type = 'text' and is_nullable = 'YES') as variants_ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'training_tasks'
    and column_name in ('stage_keys', 'variants')
),
feedback_columns as (
  select count(*) = 10
    and bool_or(column_name = 'used_on' and data_type = 'date' and is_nullable = 'NO')
    and bool_or(column_name = 'rating' and data_type = 'smallint' and is_nullable = 'YES')
    and bool_or(column_name = 'post_text' and data_type = 'text' and is_nullable = 'YES')
    and bool_or(column_name = 'session_occurrence_id' and udt_name = 'uuid' and is_nullable = 'YES')
    as columns_ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'training_task_feedback'
),
constraints_ok as (
  select
    count(*) filter (where conname = 'training_tasks_stage_keys_canonical' and contype = 'c') = 1
      as stage_constraint_ok,
    count(*) filter (where conname = 'training_tasks_variants_format' and contype = 'c') = 1
      as variants_constraint_ok,
    count(*) filter (where conname = 'training_task_feedback_content' and contype = 'c') = 1
      and count(*) filter (
        where contype = 'c'
          and pg_get_constraintdef(oid) ~* 'rating.*1.*5'
      ) >= 1 as feedback_constraints_ok,
    count(*) filter (
      where contype = 'f'
        and confrelid = 'public.training_tasks'::regclass
        and confdeltype = 'c'
    ) = 1 as task_fk_cascades
  from pg_catalog.pg_constraint
  where conrelid in (
    'public.training_tasks'::regclass,
    'public.training_task_feedback'::regclass
  )
),
policies_ok as (
  select count(*) = 4
    and count(*) filter (where policyname = 'training_task_feedback_select' and cmd = 'SELECT' and roles = '{authenticated}') = 1
    and count(*) filter (where policyname = 'training_task_feedback_insert' and cmd = 'INSERT' and roles = '{authenticated}') = 1
    and count(*) filter (where policyname = 'training_task_feedback_update' and cmd = 'UPDATE' and roles = '{authenticated}') = 1
    and count(*) filter (where policyname = 'training_task_feedback_delete' and cmd = 'DELETE' and roles = '{authenticated}') = 1
    and bool_and(coalesce(qual, with_check, '') ~ 'training_task_authorized')
    as feedback_policies_ok
  from pg_catalog.pg_policies
  where schemaname = 'public' and tablename = 'training_task_feedback'
),
existing_policies as (
  select
    count(*) filter (where schemaname = 'public' and tablename = 'training_tasks') = 4 as task_policies_preserved,
    count(*) filter (where schemaname = 'public' and tablename = 'training_task_shares') = 3 as share_policies_preserved,
    count(*) filter (
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'training_task_files_%'
    ) = 4 as storage_policies_preserved
  from pg_catalog.pg_policies
  where (schemaname = 'public' and tablename in ('training_tasks', 'training_task_shares'))
     or (schemaname = 'storage' and tablename = 'objects' and policyname like 'training_task_files_%')
),
triggers_ok as (
  select count(*) filter (where trigger_name = 'training_task_feedback_guard') = 1
    and count(*) filter (where trigger_name = 'training_task_feedback_touch') = 1
    as feedback_triggers_ok
  from information_schema.triggers
  where event_object_schema = 'public'
    and event_object_table = 'training_task_feedback'
),
indexes_ok as (
  select count(*) filter (where indexname = 'training_task_feedback_task_used_idx') = 1
    and count(*) filter (where indexname = 'training_task_feedback_club_task_idx') = 1
    as feedback_indexes_ok
  from pg_catalog.pg_indexes
  where schemaname = 'public' and tablename = 'training_task_feedback'
),
privileges_ok as (
  select
    has_table_privilege('authenticated', 'public.training_task_feedback', 'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('anon', 'public.training_task_feedback', 'SELECT,INSERT,UPDATE,DELETE')
      as grants_ok
)
select
  coalesce(task_columns.stage_keys_ok, false) as stage_keys_ok,
  coalesce(task_columns.variants_ok, false) as variants_ok,
  to_regclass('public.training_task_feedback') is not null
    and coalesce((select relrowsecurity from pg_catalog.pg_class where oid = 'public.training_task_feedback'::regclass), false)
    as feedback_table_rls_ok,
  coalesce(feedback_columns.columns_ok, false) as feedback_columns_ok,
  constraints_ok.stage_constraint_ok,
  constraints_ok.variants_constraint_ok,
  constraints_ok.feedback_constraints_ok,
  constraints_ok.task_fk_cascades,
  policies_ok.feedback_policies_ok,
  triggers_ok.feedback_triggers_ok,
  indexes_ok.feedback_indexes_ok,
  privileges_ok.grants_ok,
  existing_policies.task_policies_preserved,
  existing_policies.share_policies_preserved,
  existing_policies.storage_policies_preserved
from task_columns, feedback_columns, constraints_ok, policies_ok,
  existing_policies, triggers_ok, indexes_ok, privileges_ok;

rollback;
