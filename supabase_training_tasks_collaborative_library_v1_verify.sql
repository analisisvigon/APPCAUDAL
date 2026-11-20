-- NEXO CLUB · Verificador posterior de Biblioteca colaborativa (solo lectura)
begin;
set transaction read only;

with column_contract as (
  select
    count(*) = 1
      and bool_and(is_nullable = 'NO')
      and bool_and(column_default = '''club''::text') as ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'training_tasks'
    and column_name = 'library_visibility'
), constraint_contract as (
  select count(*) = 1 as ok
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.training_tasks'::regclass
    and constraint_row.conname = 'training_tasks_library_visibility_check'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) ~ 'private'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) ~ 'club'
), policy_contract as (
  select count(*) = 1 as ok
  from pg_catalog.pg_policy policy_row
  where policy_row.polrelid = 'public.training_tasks'::regclass
    and policy_row.polname = 'training_tasks_select'
    and pg_catalog.pg_get_expr(policy_row.polqual, policy_row.polrelid)
        ~ 'training_task_authorized'
), function_contract as (
  select
    to_regprocedure('public.training_task_authorized(uuid,text)') is not null
      and to_regprocedure('public.set_training_task_sharing_v1(uuid,text,uuid[])') is not null
      and pg_catalog.pg_get_functiondef('public.training_task_authorized(uuid,text)'::regprocedure)
          ~ 'library_visibility'
      and pg_catalog.pg_get_functiondef('public.set_training_task_sharing_v1(uuid,text,uuid[])'::regprocedure)
          ~ 'for update' as ok
), grants_contract as (
  select
    has_function_privilege('authenticated', 'public.set_training_task_sharing_v1(uuid,text,uuid[])', 'EXECUTE')
      and not has_function_privilege('anon', 'public.set_training_task_sharing_v1(uuid,text,uuid[])', 'EXECUTE')
      and not exists (
        select 1
        from pg_catalog.pg_proc function_row
        cross join lateral pg_catalog.aclexplode(
          coalesce(function_row.proacl, pg_catalog.acldefault('f', function_row.proowner))
        ) privilege_row
        where function_row.oid = 'public.set_training_task_sharing_v1(uuid,text,uuid[])'::regprocedure
          and privilege_row.grantee = 0
          and privilege_row.privilege_type = 'EXECUTE'
      ) as ok
)
select
  column_contract.ok as column_ok,
  constraint_contract.ok as constraint_ok,
  policy_contract.ok as select_policy_ok,
  function_contract.ok as functions_ok,
  grants_contract.ok as rpc_grants_ok,
  column_contract.ok and constraint_contract.ok and policy_contract.ok
    and function_contract.ok and grants_contract.ok as contract_ok
from column_contract, constraint_contract, policy_contract, function_contract, grants_contract;

select
  library_visibility,
  count(*) as task_count,
  count(distinct club_id) as club_count,
  count(distinct author_user_id) as author_count
from public.training_tasks
group by library_visibility
order by library_visibility;

select
  task.club_id,
  task.library_visibility,
  count(*) as task_count,
  count(*) filter (where exists (
    select 1 from public.training_task_shares share where share.task_id = task.id
  )) as tasks_with_explicit_shares
from public.training_tasks task
group by task.club_id, task.library_visibility
order by task.club_id, task.library_visibility;

rollback;
