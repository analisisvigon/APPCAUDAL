-- NEXO CLUB · Verificación posterior por equipo (solo lectura)
begin;
set transaction read only;

with contracts as (
  select
    to_regclass('public.training_task_library_links') is not null as link_table_ok,
    to_regprocedure('public.training_task_team_authorized(uuid,text)') is not null as team_helper_ok,
    to_regprocedure('public.training_task_library_scope_v1(uuid,timestamptz,timestamptz,integer,integer)') is not null as scope_rpc_ok,
    to_regprocedure('public.create_shared_training_task_v1(uuid,uuid,jsonb)') is not null as create_rpc_ok,
    to_regprocedure('public.set_training_task_team_link_v1(uuid,uuid,boolean)') is not null as link_rpc_ok,
    exists (
      select 1 from pg_catalog.pg_class table_row
      where table_row.oid = 'public.training_task_library_links'::regclass
        and table_row.relrowsecurity
    ) as link_rls_ok,
    to_regprocedure('public.set_training_task_sharing_v1(uuid,text,uuid[])') is null as obsolete_rpc_absent,
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'training_tasks'
        and column_name = 'library_visibility'
    ) as obsolete_column_absent
), constraints_ok as (
  select
    count(*) filter (where conname = 'training_task_library_links_task_team_key'
      and contype = 'u') = 1
    and count(*) filter (where conname = 'training_task_library_links_team_club_fkey'
      and contype = 'f' and convalidated) = 1
    and count(*) filter (where contype = 'f' and confrelid = 'public.training_tasks'::regclass
      and confdeltype = 'c') = 1 as ok
  from pg_catalog.pg_constraint
  where conrelid = 'public.training_task_library_links'::regclass
), policies_ok as (
  select
    count(*) filter (where polrelid = 'public.training_task_library_links'::regclass
      and polname = 'training_task_library_links_select' and polcmd = 'r') = 1
    and count(*) filter (where polrelid = 'public.training_tasks'::regclass
      and polname = 'training_tasks_select' and polcmd = 'r'
      and pg_get_expr(polqual, polrelid) ~ 'training_task_authorized') = 1
    and count(*) filter (where polrelid = 'public.training_task_feedback'::regclass
      and polname = 'training_task_feedback_insert' and polcmd = 'a'
      and pg_get_expr(polwithcheck, polrelid) ~ 'training_task_authorized'
      and pg_get_expr(polwithcheck, polrelid) !~ 'can_edit_club_data') = 1
    and count(*) filter (where polrelid = 'public.training_task_media'::regclass
      and polname in (
        'training_task_media_select', 'training_task_media_insert',
        'training_task_media_update', 'training_task_media_delete'
      )
      and (
        coalesce(pg_get_expr(polqual, polrelid), '')
        || coalesce(pg_get_expr(polwithcheck, polrelid), '')
      ) ~ 'training_task_authorized') = 4
    and count(*) filter (where polrelid = 'storage.objects'::regclass
      and polname in (
        'training_task_files_select', 'training_task_files_insert',
        'training_task_files_update', 'training_task_files_delete'
      )
      and (
        coalesce(pg_get_expr(polqual, polrelid), '')
        || coalesce(pg_get_expr(polwithcheck, polrelid), '')
      ) ~ 'training_task_storage_allowed') = 4 as ok
  from pg_catalog.pg_policy
), grants_ok as (
  select
    has_function_privilege('authenticated', 'public.training_task_library_scope_v1(uuid,timestamptz,timestamptz,integer,integer)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.create_shared_training_task_v1(uuid,uuid,jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.set_training_task_team_link_v1(uuid,uuid,boolean)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.create_shared_training_task_v1(uuid,uuid,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.training_task_library_scope_v1(uuid,timestamptz,timestamptz,integer,integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.set_training_task_team_link_v1(uuid,uuid,boolean)', 'EXECUTE')
    and not has_table_privilege('anon', 'public.training_task_library_links', 'SELECT')
    and not has_table_privilege('authenticated', 'public.training_task_library_links', 'INSERT')
    and not has_table_privilege('authenticated', 'public.training_task_library_links', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.training_task_library_links', 'DELETE') as ok
)
select contracts.*, constraints_ok.ok as constraints_ok,
  policies_ok.ok as policies_ok, grants_ok.ok as grants_ok,
  contracts.link_table_ok and contracts.team_helper_ok and contracts.scope_rpc_ok
    and contracts.create_rpc_ok and contracts.link_rpc_ok and contracts.link_rls_ok
    and contracts.obsolete_rpc_absent and contracts.obsolete_column_absent
    and constraints_ok.ok and policies_ok.ok and grants_ok.ok as contract_ok
from contracts, constraints_ok, policies_ok, grants_ok;

with target as (
  select
    'ca0da100-0000-4000-8000-000000000001'::uuid as club_id,
    '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid as team_id
), owner_account as (
  select id from auth.users where lower(email) = 'analisisvigon@gmail.com'
)
select
  count(*) as target_team_links,
  count(distinct linked.task_id) as distinct_linked_tasks,
  count(*) filter (where task.club_id = target.club_id) as links_to_target_club_tasks,
  count(*) filter (where task.author_user_id = (select id from owner_account)) as owner_authored_links,
  count(*) filter (where linked.club_id <> target.club_id) as wrong_link_club,
  count(*) filter (where linked.team_id <> target.team_id) as wrong_link_team
from target
left join public.training_task_library_links linked on linked.team_id = target.team_id
left join public.training_tasks task on task.id = linked.task_id;

-- Las sesiones y snapshots no tienen FK ni triggers nuevos hacia la biblioteca.
select
  count(*) filter (
    where constraint_row.conrelid::regclass::text like 'public.planned_%'
       or constraint_row.confrelid::regclass::text like 'public.planned_%'
  ) as planned_session_related_new_fks
from pg_catalog.pg_constraint constraint_row
where constraint_row.conrelid = 'public.training_task_library_links'::regclass
   or constraint_row.confrelid = 'public.training_task_library_links'::regclass;

rollback;
