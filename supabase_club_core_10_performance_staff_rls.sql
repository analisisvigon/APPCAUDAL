-- BLOQUE 1.3 - Cierre RLS de Rendimiento para STAFF.
--
-- Alcance exclusivo:
--   public.wellness_entries
--   public.rpe_entries
--   public.training_sessions
--   public.training_session_load_metrics
--   public.rpe_sync_pending
--
-- No modifica grants, funciones/RPC, tablas de datos ni otros esquemas.

begin;

do $$
declare
  missing_tables text[];
begin
  select pg_catalog.array_agg(target.table_name order by target.table_name)
    into missing_tables
  from (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  ) target(table_name)
  where pg_catalog.to_regclass(
    pg_catalog.format('public.%I', target.table_name)
  ) is null;

  if missing_tables is not null then
    raise exception
      'Bloque 1.3 abortado: faltan tablas objetivo: %',
      pg_catalog.array_to_string(missing_tables, ', ');
  end if;

  if pg_catalog.to_regprocedure('public.is_app_staff()') is null then
    raise exception
      'Bloque 1.3 abortado: no existe public.is_app_staff()';
  end if;
end
$$;

alter table public.wellness_entries enable row level security;
alter table public.rpe_entries enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_session_load_metrics enable row level security;
alter table public.rpe_sync_pending enable row level security;

-- Policies abiertas heredadas de Rendimiento V1.
drop policy if exists "Authenticated staff can read wellness entries"
  on public.wellness_entries;
drop policy if exists "Authenticated staff can write wellness entries"
  on public.wellness_entries;

drop policy if exists "Authenticated staff can read rpe entries"
  on public.rpe_entries;
drop policy if exists "Authenticated staff can write rpe entries"
  on public.rpe_entries;

drop policy if exists "Authenticated staff can read training sessions"
  on public.training_sessions;
drop policy if exists "Authenticated staff can write training sessions"
  on public.training_sessions;

drop policy if exists "Authenticated staff can read training load metrics"
  on public.training_session_load_metrics;
drop policy if exists "Authenticated staff can write training load metrics"
  on public.training_session_load_metrics;

drop policy if exists "Authenticated staff can read pending RPE sync"
  on public.rpe_sync_pending;
drop policy if exists "Authenticated staff can write pending RPE sync"
  on public.rpe_sync_pending;

-- Nombres canonicos: permiten reaplicar localmente la migracion sin duplicar
-- policies y sin conservar una version anterior del mismo contrato.
drop policy if exists performance_staff_select on public.wellness_entries;
drop policy if exists performance_staff_insert on public.wellness_entries;
drop policy if exists performance_staff_update on public.wellness_entries;
drop policy if exists performance_staff_delete on public.wellness_entries;

create policy performance_staff_select
on public.wellness_entries
for select
to authenticated
using (public.is_app_staff());

create policy performance_staff_insert
on public.wellness_entries
for insert
to authenticated
with check (public.is_app_staff());

create policy performance_staff_update
on public.wellness_entries
for update
to authenticated
using (public.is_app_staff())
with check (public.is_app_staff());

create policy performance_staff_delete
on public.wellness_entries
for delete
to authenticated
using (public.is_app_staff());

drop policy if exists performance_staff_select on public.rpe_entries;
drop policy if exists performance_staff_insert on public.rpe_entries;
drop policy if exists performance_staff_update on public.rpe_entries;
drop policy if exists performance_staff_delete on public.rpe_entries;

create policy performance_staff_select
on public.rpe_entries
for select
to authenticated
using (public.is_app_staff());

create policy performance_staff_insert
on public.rpe_entries
for insert
to authenticated
with check (public.is_app_staff());

create policy performance_staff_update
on public.rpe_entries
for update
to authenticated
using (public.is_app_staff())
with check (public.is_app_staff());

create policy performance_staff_delete
on public.rpe_entries
for delete
to authenticated
using (public.is_app_staff());

drop policy if exists performance_staff_select on public.training_sessions;
drop policy if exists performance_staff_insert on public.training_sessions;
drop policy if exists performance_staff_update on public.training_sessions;
drop policy if exists performance_staff_delete on public.training_sessions;

create policy performance_staff_select
on public.training_sessions
for select
to authenticated
using (public.is_app_staff());

create policy performance_staff_insert
on public.training_sessions
for insert
to authenticated
with check (public.is_app_staff());

create policy performance_staff_update
on public.training_sessions
for update
to authenticated
using (public.is_app_staff())
with check (public.is_app_staff());

create policy performance_staff_delete
on public.training_sessions
for delete
to authenticated
using (public.is_app_staff());

drop policy if exists performance_staff_select
  on public.training_session_load_metrics;
drop policy if exists performance_staff_insert
  on public.training_session_load_metrics;
drop policy if exists performance_staff_update
  on public.training_session_load_metrics;
drop policy if exists performance_staff_delete
  on public.training_session_load_metrics;

create policy performance_staff_select
on public.training_session_load_metrics
for select
to authenticated
using (public.is_app_staff());

create policy performance_staff_insert
on public.training_session_load_metrics
for insert
to authenticated
with check (public.is_app_staff());

create policy performance_staff_update
on public.training_session_load_metrics
for update
to authenticated
using (public.is_app_staff())
with check (public.is_app_staff());

create policy performance_staff_delete
on public.training_session_load_metrics
for delete
to authenticated
using (public.is_app_staff());

drop policy if exists performance_staff_select on public.rpe_sync_pending;
drop policy if exists performance_staff_insert on public.rpe_sync_pending;
drop policy if exists performance_staff_update on public.rpe_sync_pending;
drop policy if exists performance_staff_delete on public.rpe_sync_pending;

create policy performance_staff_select
on public.rpe_sync_pending
for select
to authenticated
using (public.is_app_staff());

create policy performance_staff_insert
on public.rpe_sync_pending
for insert
to authenticated
with check (public.is_app_staff());

create policy performance_staff_update
on public.rpe_sync_pending
for update
to authenticated
using (public.is_app_staff())
with check (public.is_app_staff());

create policy performance_staff_delete
on public.rpe_sync_pending
for delete
to authenticated
using (public.is_app_staff());

-- Postcondicion contractual. Cualquier policy adicional que pueda aplicarse a
-- authenticated, anon o PUBLIC aborta y revierte la migracion completa.
do $$
declare
  authenticated_oid oid;
  anon_oid oid;
  invalid_policy_count integer;
begin
  select oid into authenticated_oid
  from pg_catalog.pg_roles
  where rolname = 'authenticated';

  select oid into anon_oid
  from pg_catalog.pg_roles
  where rolname = 'anon';

  if authenticated_oid is null or anon_oid is null then
    raise exception
      'Bloque 1.3 abortado: faltan los roles authenticated o anon';
  end if;

  with
  targets(table_name) as (
    values
      ('wellness_entries'::text),
      ('rpe_entries'::text),
      ('training_sessions'::text),
      ('training_session_load_metrics'::text),
      ('rpe_sync_pending'::text)
  ),
  expected(policy_name, command, needs_using, needs_check) as (
    values
      ('performance_staff_select'::text, 'r'::"char", true, false),
      ('performance_staff_insert'::text, 'a'::"char", false, true),
      ('performance_staff_update'::text, 'w'::"char", true, true),
      ('performance_staff_delete'::text, 'd'::"char", true, false)
  ),
  expected_contract as (
    select
      relation.oid as relation_oid,
      target.table_name,
      expected.policy_name,
      expected.command,
      expected.needs_using,
      expected.needs_check
    from targets target
    join pg_catalog.pg_namespace namespace
      on namespace.nspname = 'public'
    join pg_catalog.pg_class relation
      on relation.relnamespace = namespace.oid
     and relation.relname = target.table_name
    cross join expected
  ),
  invalid_expected as (
    select contract.table_name, contract.policy_name
    from expected_contract contract
    left join pg_catalog.pg_policy policy
      on policy.polrelid = contract.relation_oid
     and policy.polname = contract.policy_name
    where policy.oid is null
      or not policy.polpermissive
      or policy.polcmd <> contract.command
      or policy.polroles <> array[authenticated_oid]::oid[]
      or case
        when contract.needs_using then
          pg_catalog.regexp_replace(
            coalesce(
              pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
              ''
            ),
            '[[:space:]()]',
            '',
            'g'
          ) not in ('is_app_staff', 'public.is_app_staff')
        else policy.polqual is not null
      end
      or case
        when contract.needs_check then
          pg_catalog.regexp_replace(
            coalesce(
              pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
              ''
            ),
            '[[:space:]()]',
            '',
            'g'
          ) not in ('is_app_staff', 'public.is_app_staff')
        else policy.polwithcheck is not null
      end
  ),
  unexpected_client_policy as (
    select policy.polrelid, policy.polname
    from pg_catalog.pg_policy policy
    join expected_contract contract
      on contract.relation_oid = policy.polrelid
    where exists (
      select 1
      from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
      where policy_role.role_oid in (0::oid, authenticated_oid, anon_oid)
    )
      and policy.polname not in (
        'performance_staff_select',
        'performance_staff_insert',
        'performance_staff_update',
        'performance_staff_delete'
      )
    group by policy.polrelid, policy.polname
  )
  select
    (select count(*) from invalid_expected)
    + (select count(*) from unexpected_client_policy)
    into invalid_policy_count;

  if invalid_policy_count <> 0 then
    raise exception
      'Bloque 1.3 abortado: % policies no cumplen el contrato STAFF cerrado',
      invalid_policy_count;
  end if;
end
$$;

commit;
