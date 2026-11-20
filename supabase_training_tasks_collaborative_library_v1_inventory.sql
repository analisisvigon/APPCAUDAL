-- NEXO CLUB · Inventario previo de Biblioteca colaborativa (solo lectura)
begin;
set transaction read only;

select
  current_database() as database_name,
  to_regclass('public.training_tasks') is not null as training_tasks_exists,
  to_regclass('public.training_task_shares') is not null as training_task_shares_exists,
  to_regprocedure('public.training_task_authorized(uuid,text)') is not null as authorization_helper_exists,
  to_regprocedure('public.can_edit_club_data(uuid)') is not null as club_authorization_helper_exists;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'training_tasks'
order by ordinal_position;

select
  policy_row.polname as policy_name,
  policy_row.polcmd as command,
  pg_catalog.pg_get_expr(policy_row.polqual, policy_row.polrelid) as using_expression,
  pg_catalog.pg_get_expr(policy_row.polwithcheck, policy_row.polrelid) as check_expression
from pg_catalog.pg_policy policy_row
where policy_row.polrelid in (
  'public.training_tasks'::regclass,
  'public.training_task_shares'::regclass
)
order by policy_row.polrelid::regclass::text, policy_row.polname;

select pg_catalog.pg_get_functiondef('public.training_task_authorized(uuid,text)'::regprocedure)
  as training_task_authorized_definition;
select pg_catalog.pg_get_functiondef('public.can_edit_club_data(uuid)'::regprocedure)
  as can_edit_club_data_definition;

-- No expone contenido, nombres, pizarras ni textos: solo distribución por ámbito y autor.
select
  task.club_id,
  task.author_user_id,
  count(*) as task_count,
  count(*) filter (where exists (
    select 1 from public.training_task_shares share where share.task_id = task.id
  )) as tasks_with_explicit_shares,
  min(task.created_at) as oldest_created_at,
  max(task.created_at) as newest_created_at
from public.training_tasks task
group by task.club_id, task.author_user_id
order by task.club_id, task.author_user_id;

select
  task.club_id,
  count(*) as explicit_share_count,
  count(distinct share.task_id) as shared_task_count,
  count(distinct share.membership_id) as recipient_membership_count
from public.training_task_shares share
join public.training_tasks task on task.id = share.task_id
group by task.club_id
order by task.club_id;

rollback;
