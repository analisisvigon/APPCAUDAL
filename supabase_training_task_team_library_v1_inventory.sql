-- NEXO CLUB · Inventario previo de Biblioteca de Tareas por equipo (solo lectura)
begin;
set transaction read only;
set local statement_timeout = '30s';

with target as (
  select
    'ca0da100-0000-4000-8000-000000000001'::uuid as club_id,
    '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid as team_id,
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id
)
select
  club.id as club_id, club.name as club_name,
  team.id as team_id, legacy_team.name as team_name, team.is_active as team_active,
  relation.id as cts_id, season.label, season.status, season.is_active as season_active
from target
left join public.clubs club on club.id = target.club_id
left join public.club_teams team
  on team.id = target.team_id and team.club_id = target.club_id
left join public.equipos_rivales legacy_team on legacy_team.id = team.id
left join public.club_team_seasons relation
  on relation.id = target.cts_id and relation.club_id = target.club_id and relation.team_id = target.team_id
left join public.club_seasons season
  on season.id = relation.season_id and season.club_id = relation.club_id;

select
  to_regclass('public.training_tasks') is not null as tasks_ok,
  to_regclass('public.training_task_feedback') is not null as feedback_ok,
  to_regclass('public.training_task_media') is not null as media_ok,
  to_regclass('public.club_team_season_permissions') is not null as cts_permissions_ok,
  to_regprocedure('public.training_task_authorized(uuid,text)') is not null as task_helper_ok,
  to_regprocedure('public.can_read_club_team_season(uuid)') is not null as cts_read_helper_ok,
  to_regprocedure('public.can_write_club_team_season(uuid)') is not null as cts_write_helper_ok,
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_tasks'
      and column_name = 'library_visibility'
  ) as obsolete_club_visibility_absent,
  to_regprocedure('public.set_training_task_sharing_v1(uuid,text,uuid[])') is null
    as obsolete_club_rpc_absent;

with expected(email, expected_role) as (values
  ('analisisvigon@gmail.com', 'owner'),
  ('2samuelbc79@gmail.com', 'staff'),
  ('almadinacalvillo@gmail.com', 'staff'),
  ('turonovo@gmail.com', 'staff')
), target as (
  select
    'ca0da100-0000-4000-8000-000000000001'::uuid as club_id,
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id
)
select
  expected.email,
  account.id as user_id,
  membership.id as membership_id,
  membership.role,
  membership.is_active,
  case
    when membership.role in ('owner', 'admin') then true
    when membership.role = 'staff' then permission.id is not null
    else false
  end as authorized_for_target_cts,
  expected.expected_role = membership.role as expected_role_ok
from expected
cross join target
left join auth.users account on lower(account.email) = expected.email
left join public.club_memberships membership
  on membership.club_id = target.club_id and membership.user_id = account.id
left join public.club_team_season_permissions permission
  on permission.club_id = target.club_id
 and permission.club_team_season_id = target.cts_id
 and permission.membership_id = membership.id
order by expected.expected_role, expected.email;

-- Contrato exacto de las 30 tareas candidatas. El hash permite comprobar que
-- la lista de UUID copiada al backfill no ha cambiado entre revisión e instalación.
with target as (
  select 'ca0da100-0000-4000-8000-000000000001'::uuid as club_id
), owner_account as (
  select id from auth.users where lower(email) = 'analisisvigon@gmail.com'
), candidates as (
  select task.*
  from public.training_tasks task
  cross join target
  where task.club_id = target.club_id
)
select
  count(*) as club_task_count,
  count(*) filter (where author_user_id = (select id from owner_account)) as owner_task_count,
  count(distinct author_user_id) as distinct_authors,
  count(*) filter (where exists (
    select 1 from public.training_task_shares share where share.task_id = candidates.id
  )) as tasks_with_legacy_shares,
  md5(string_agg(id::text, ',' order by id)) as ordered_task_id_hash,
  min(created_at) as oldest_created_at,
  max(created_at) as newest_created_at
from candidates;

with target as (
  select 'ca0da100-0000-4000-8000-000000000001'::uuid as club_id
)
select
  task.id as task_id,
  task.task_code,
  task.name,
  task.author_user_id,
  task.created_at,
  task.updated_at,
  count(share.id) as legacy_share_count
from public.training_tasks task
cross join target
left join public.training_task_shares share on share.task_id = task.id
where task.club_id = target.club_id
group by task.id, task.task_code, task.name, task.author_user_id, task.created_at, task.updated_at
order by task.id;

-- Detecta tareas fuera del club objetivo sin revelar su contenido.
with target as (
  select 'ca0da100-0000-4000-8000-000000000001'::uuid as club_id
)
select
  task.club_id,
  club.name as club_name,
  task.author_user_id,
  count(*) as task_count
from public.training_tasks task
left join public.clubs club on club.id = task.club_id
cross join target
where task.club_id is distinct from target.club_id
group by task.club_id, club.name, task.author_user_id
order by club.name nulls first, task.author_user_id;

rollback;
