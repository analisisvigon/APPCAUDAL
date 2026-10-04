-- APPCAUDAL · Tareas V1 · postcheck READ-ONLY del patch SELECT autor.
begin;
set transaction read only;

select
  policy_row.policyname,
  policy_row.permissive,
  policy_row.roles,
  policy_row.cmd,
  policy_row.qual,
  policy_row.cmd = 'SELECT' as is_select_policy,
  policy_row.roles = array['authenticated']::name[] as authenticated_only,
  position('author_user_id = auth.uid()' in policy_row.qual) > 0 as author_checked_directly,
  position('can_edit_club_data(club_id)' in policy_row.qual) > 0 as active_staff_checked_directly,
  position('training_task_authorized(id, ''read''::text)' in policy_row.qual) > 0 as shared_access_preserved
from pg_catalog.pg_policies policy_row
where policy_row.schemaname = 'public'
  and policy_row.tablename = 'training_tasks'
  and policy_row.policyname = 'training_tasks_select';

select
  count(*) = 1 as exactly_one_named_select_policy
from pg_catalog.pg_policies policy_row
where policy_row.schemaname = 'public'
  and policy_row.tablename = 'training_tasks'
  and policy_row.policyname = 'training_tasks_select'
  and policy_row.cmd = 'SELECT';

rollback;
