-- APPCAUDAL - Club Core 30 - Training load metrics legacy RLS fix.
-- Removes only the two permissive V1 policies that were recreated after the
-- canonical Core 10 STAFF contract. Table grants and data remain intact.

begin;

do $preconditions$
declare
  authenticated_oid oid;
  invalid_policy_count integer;
begin
  if auth.uid() is not null then
    raise exception 'Core 30 must run without an active client identity';
  end if;

  if pg_catalog.to_regclass('public.training_session_load_metrics') is null
     or pg_catalog.to_regprocedure('public.is_app_staff()') is null then
    raise exception 'Core 30 requires training_session_load_metrics and is_app_staff()';
  end if;

  select role_row.oid into authenticated_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'authenticated';

  if authenticated_oid is null then
    raise exception 'Core 30 requires the authenticated role';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = 'public.training_session_load_metrics'::regclass
      and relation.relrowsecurity
  ) then
    raise exception 'Core 30 requires RLS enabled on training_session_load_metrics';
  end if;

  with expected(policy_name, command, needs_using, needs_check) as (
    values
      ('performance_staff_select'::text, 'r'::"char", true, false),
      ('performance_staff_insert'::text, 'a'::"char", false, true),
      ('performance_staff_update'::text, 'w'::"char", true, true),
      ('performance_staff_delete'::text, 'd'::"char", true, false)
  )
  select pg_catalog.count(*)::integer into invalid_policy_count
  from expected
  left join pg_catalog.pg_policy policy
    on policy.polrelid = 'public.training_session_load_metrics'::regclass
   and policy.polname = expected.policy_name
  where policy.oid is null
     or not policy.polpermissive
     or policy.polcmd <> expected.command
     or policy.polroles <> array[authenticated_oid]::oid[]
     or case
       when expected.needs_using then
         pg_catalog.replace(
           pg_catalog.regexp_replace(
             pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
             '[[:space:]()]', '', 'g'
           ),
           'public.', ''
         ) <> 'is_app_staff'
       else policy.polqual is not null
     end
     or case
       when expected.needs_check then
         pg_catalog.replace(
           pg_catalog.regexp_replace(
             pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
             '[[:space:]()]', '', 'g'
           ),
           'public.', ''
         ) <> 'is_app_staff'
       else policy.polwithcheck is not null
     end;

  if invalid_policy_count <> 0 then
    raise exception 'Core 30 found % invalid canonical STAFF policies', invalid_policy_count;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.training_session_load_metrics'::regclass
      and policy.polname = 'Authenticated staff can read training load metrics'
      and policy.polpermissive
      and policy.polcmd = 'r'
      and policy.polroles = array[authenticated_oid]::oid[]
      and pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
        '[[:space:]()]', '', 'g'
      ) = 'true'
      and policy.polwithcheck is null
  ) then
    raise exception 'Core 30 did not find the exact permissive legacy read policy';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.training_session_load_metrics'::regclass
      and policy.polname = 'Authenticated staff can write training load metrics'
      and policy.polpermissive
      and policy.polcmd = '*'
      and policy.polroles = array[authenticated_oid]::oid[]
      and pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
        '[[:space:]()]', '', 'g'
      ) = 'true'
      and pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
        '[[:space:]()]', '', 'g'
      ) = 'true'
  ) then
    raise exception 'Core 30 did not find the exact permissive legacy write policy';
  end if;

  if (select pg_catalog.count(*)
      from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.training_session_load_metrics'::regclass) <> 6
     or exists (
       select 1
       from pg_catalog.pg_policy policy
       where policy.polrelid = 'public.training_session_load_metrics'::regclass
         and policy.polname not in (
           'performance_staff_select',
           'performance_staff_insert',
           'performance_staff_update',
           'performance_staff_delete',
           'Authenticated staff can read training load metrics',
           'Authenticated staff can write training load metrics'
         )
     ) then
    raise exception 'Core 30 refuses an unexpected training load metrics policy inventory';
  end if;
end;
$preconditions$;

drop policy if exists "Authenticated staff can read training load metrics"
on public.training_session_load_metrics;

drop policy if exists "Authenticated staff can write training load metrics"
on public.training_session_load_metrics;

do $postconditions$
declare
  authenticated_oid oid;
  anon_oid oid;
  invalid_policy_count integer;
begin
  select role_row.oid into authenticated_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'authenticated';

  select role_row.oid into anon_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'anon';

  with expected(policy_name, command, needs_using, needs_check) as (
    values
      ('performance_staff_select'::text, 'r'::"char", true, false),
      ('performance_staff_insert'::text, 'a'::"char", false, true),
      ('performance_staff_update'::text, 'w'::"char", true, true),
      ('performance_staff_delete'::text, 'd'::"char", true, false)
  )
  select pg_catalog.count(*)::integer into invalid_policy_count
  from expected
  left join pg_catalog.pg_policy policy
    on policy.polrelid = 'public.training_session_load_metrics'::regclass
   and policy.polname = expected.policy_name
  where policy.oid is null
     or not policy.polpermissive
     or policy.polcmd <> expected.command
     or policy.polroles <> array[authenticated_oid]::oid[]
     or case
       when expected.needs_using then
         pg_catalog.replace(
           pg_catalog.regexp_replace(
             pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
             '[[:space:]()]', '', 'g'
           ),
           'public.', ''
         ) <> 'is_app_staff'
       else policy.polqual is not null
     end
     or case
       when expected.needs_check then
         pg_catalog.replace(
           pg_catalog.regexp_replace(
             pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
             '[[:space:]()]', '', 'g'
           ),
           'public.', ''
         ) <> 'is_app_staff'
       else policy.polwithcheck is not null
     end;

  if invalid_policy_count <> 0
     or (select pg_catalog.count(*)
         from pg_catalog.pg_policy policy
         where policy.polrelid = 'public.training_session_load_metrics'::regclass) <> 4 then
    raise exception 'Core 30 did not leave exactly the four canonical STAFF policies';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.training_session_load_metrics'::regclass
      and (
        policy.polname ilike '%player%'
        or exists (
          select 1
          from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
          where policy_role.role_oid in (0::oid, authenticated_oid, anon_oid)
        ) and (
          pg_catalog.regexp_replace(
            pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
            '[[:space:]()]', '', 'g'
          ) = 'true'
          or pg_catalog.regexp_replace(
            pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
            '[[:space:]()]', '', 'g'
          ) = 'true'
        )
      )
  ) then
    raise exception 'Core 30 left a PLAYER or permissive true client policy';
  end if;

  if not (select relation.relrowsecurity
          from pg_catalog.pg_class relation
          where relation.oid = 'public.training_session_load_metrics'::regclass) then
    raise exception 'Core 30 must preserve RLS enabled';
  end if;
end;
$postconditions$;

commit;
