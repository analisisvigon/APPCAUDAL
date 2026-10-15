-- APPCAUDAL - Club core (change 39B preflight inventory)
-- Read-only inventory required before defining STAFF write semantics.
--
-- This file intentionally contains one SELECT statement only. It does not
-- create helpers, alter RLS, inspect personal data or mutate database state.
-- Run it in Supabase SQL Editor and export the single result grid as CSV.

with
target_relations(object_name) as (
  values
    ('club_seasons'::text),
    ('club_team_seasons'::text),
    ('club_team_season_permissions'::text),
    ('club_member_permissions'::text),
    ('club_memberships'::text),
    ('partidos'::text)
),
relation_catalog as (
  select
    target.object_name,
    relation.oid as relation_oid,
    relation.relkind,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner) as owner_name,
    pg_catalog.obj_description(relation.oid, 'pg_class') as object_comment
  from target_relations target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.object_name
   and relation.relkind in ('r', 'p')
),
target_functions(function_name, identity_arguments) as (
  values
    ('can_read_club_team_season'::text, 'uuid'::text),
    ('can_write_club_team_season'::text, 'uuid'::text),
    ('can_read_match'::text, 'uuid'::text),
    ('can_write_match'::text, 'uuid'::text),
    ('has_club_role'::text, 'uuid, text[]'::text),
    ('can_manage_club'::text, 'uuid'::text),
    ('can_edit_club_data'::text, 'uuid'::text),
    ('is_app_staff'::text, ''::text)
),
function_catalog as (
  select
    target.function_name,
    target.identity_arguments,
    routine.oid as function_oid,
    routine.prosecdef,
    routine.provolatile,
    routine.prokind,
    routine.prorettype,
    routine.proowner,
    routine.proacl,
    routine.proconfig,
    pg_catalog.pg_get_userbyid(routine.proowner) as owner_name,
    pg_catalog.pg_get_function_identity_arguments(routine.oid)
      as actual_identity_arguments,
    pg_catalog.pg_get_function_result(routine.oid) as result_type,
    pg_catalog.pg_get_functiondef(routine.oid) as function_definition,
    pg_catalog.obj_description(routine.oid, 'pg_proc') as object_comment
  from target_functions target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_proc routine
    on routine.pronamespace = namespace.oid
   and routine.oid = pg_catalog.to_regprocedure(
     'public.' || target.function_name || '(' || target.identity_arguments || ')'
   )
),
target_overload_counts as (
  select
    target.function_name,
    pg_catalog.count(routine.oid) as overload_count,
    pg_catalog.string_agg(
      pg_catalog.pg_get_function_identity_arguments(routine.oid),
      ' | ' order by pg_catalog.pg_get_function_identity_arguments(routine.oid)
    ) as overloads
  from (
    select distinct function_name
    from target_functions
  ) target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_proc routine
    on routine.pronamespace = namespace.oid
   and routine.proname = target.function_name
  group by target.function_name
),
target_roles(role_name) as (
  values
    ('anon'::text),
    ('authenticated'::text),
    ('service_role'::text)
),
function_execute_matrix as (
  select
    function_row.function_name,
    function_row.identity_arguments,
    role_row.role_name,
    case
      when function_row.function_oid is null then null::boolean
      when not exists (
        select 1
        from pg_catalog.pg_roles role_catalog
        where role_catalog.rolname = role_row.role_name
      ) then null::boolean
      else pg_catalog.has_function_privilege(
        role_row.role_name,
        function_row.function_oid,
        'EXECUTE'
      )
    end as effective_execute
  from function_catalog function_row
  cross join target_roles role_row
),
function_public_execute as (
  select
    function_row.function_name,
    function_row.identity_arguments,
    case
      when function_row.function_oid is null then null::boolean
      else exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            function_row.proacl,
            pg_catalog.acldefault('f', function_row.proowner)
          )
        ) acl_row
        where acl_row.grantee = 0
          and acl_row.privilege_type = 'EXECUTE'
      )
    end as public_execute
  from function_catalog function_row
),
column_inventory as (
  select
    relation_row.object_name,
    attribute.attnum,
    attribute.attname,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
    attribute.attnotnull,
    case
      when default_row.oid is null then null::text
      else pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)
    end as default_expression,
    pg_catalog.col_description(attribute.attrelid, attribute.attnum)
      as column_comment
  from relation_catalog relation_row
  join pg_catalog.pg_attribute attribute
    on attribute.attrelid = relation_row.relation_oid
   and attribute.attnum > 0
   and not attribute.attisdropped
  left join pg_catalog.pg_attrdef default_row
    on default_row.adrelid = attribute.attrelid
   and default_row.adnum = attribute.attnum
),
constraint_inventory as (
  select
    relation_row.object_name,
    constraint_row.conname,
    constraint_row.contype::text as constraint_type,
    constraint_row.convalidated,
    constraint_row.condeferrable,
    constraint_row.condeferred,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
      as constraint_definition
  from relation_catalog relation_row
  join pg_catalog.pg_constraint constraint_row
    on constraint_row.conrelid = relation_row.relation_oid
),
policy_inventory as (
  select
    relation_row.object_name,
    policy.polname,
    policy.polcmd::text as policy_command,
    policy.polpermissive,
    coalesce(
      (
        select pg_catalog.string_agg(
          coalesce(
            role_catalog.rolname,
            case
              when policy_role.role_oid = 0 then 'PUBLIC'
              else 'OID:' || policy_role.role_oid::text
            end
          ),
          ',' order by policy_role.role_oid
        )
        from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
        left join pg_catalog.pg_roles role_catalog
          on role_catalog.oid = policy_role.role_oid
      ),
      ''
    ) as policy_roles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
  from relation_catalog relation_row
  join pg_catalog.pg_policy policy
    on policy.polrelid = relation_row.relation_oid
),
policy_fingerprints as (
  select
    relation_row.object_name,
    pg_catalog.count(policy_row.polname) as policy_count,
    pg_catalog.md5(
      coalesce(
        pg_catalog.string_agg(
          policy_row.polname
          || ':' || policy_row.policy_command
          || ':' || policy_row.polpermissive::text
          || ':' || coalesce(policy_row.policy_roles, '')
          || ':' || coalesce(policy_row.using_expression, '')
          || ':' || coalesce(policy_row.check_expression, ''),
          '|' order by policy_row.polname
        ),
        ''
      )
    ) as policy_fingerprint
  from relation_catalog relation_row
  left join policy_inventory policy_row
    on policy_row.object_name = relation_row.object_name
  group by relation_row.object_name
),
trigger_inventory as (
  select
    relation_row.object_name,
    trigger_row.tgname,
    trigger_row.tgenabled::text as enabled_mode,
    pg_catalog.pg_get_triggerdef(trigger_row.oid, true) as trigger_definition
  from relation_catalog relation_row
  join pg_catalog.pg_trigger trigger_row
    on trigger_row.tgrelid = relation_row.relation_oid
   and not trigger_row.tgisinternal
),
results(section, object_name, status, detail) as (
  select
    '00_environment'::text,
    'server_version',
    case
      when pg_catalog.current_setting('server_version_num')::integer >= 170000
        then 'PASS'
      else 'REVIEW'
    end,
    pg_catalog.current_setting('server_version')

  union all

  select
    '01_relation',
    'public.' || relation_row.object_name,
    case when relation_row.relation_oid is null then 'FAIL' else 'PASS' end,
    case
      when relation_row.relation_oid is null then 'missing'
      else 'kind=' || relation_row.relkind::text
        || '; owner=' || relation_row.owner_name
        || '; rls=' || relation_row.relrowsecurity::text
        || '; force_rls=' || relation_row.relforcerowsecurity::text
        || '; comment=' || coalesce(relation_row.object_comment, '<NULL>')
    end
  from relation_catalog relation_row

  union all

  select
    '02_column',
    'public.' || column_row.object_name || '.' || column_row.attname,
    'INFO',
    'position=' || column_row.attnum::text
      || '; type=' || column_row.data_type
      || '; not_null=' || column_row.attnotnull::text
      || '; default=' || coalesce(column_row.default_expression, '<NULL>')
      || '; comment=' || coalesce(column_row.column_comment, '<NULL>')
  from column_inventory column_row

  union all

  select
    '03_constraint',
    'public.' || constraint_row.object_name || '.' || constraint_row.conname,
    case when constraint_row.convalidated then 'PASS' else 'FAIL' end,
    'type=' || constraint_row.constraint_type
      || '; validated=' || constraint_row.convalidated::text
      || '; deferrable=' || constraint_row.condeferrable::text
      || '; initially_deferred=' || constraint_row.condeferred::text
      || '; definition=' || constraint_row.constraint_definition
  from constraint_inventory constraint_row

  union all

  select
    '04_function',
    'public.' || function_row.function_name
      || '(' || function_row.identity_arguments || ')',
    case when function_row.function_oid is null then 'MISSING' else 'INFO' end,
    case
      when function_row.function_oid is null then 'not present'
      else 'actual_args=' || function_row.actual_identity_arguments
        || '; result=' || function_row.result_type
        || '; security=' || case when function_row.prosecdef then 'DEFINER' else 'INVOKER' end
        || '; volatility=' || function_row.provolatile::text
        || '; kind=' || function_row.prokind::text
        || '; owner=' || function_row.owner_name
        || '; config=' || coalesce(function_row.proconfig::text, '<NULL>')
        || '; comment=' || coalesce(function_row.object_comment, '<NULL>')
    end
  from function_catalog function_row

  union all

  select
    '05_function_definition',
    'public.' || function_row.function_name
      || '(' || function_row.identity_arguments || ')',
    case when function_row.function_oid is null then 'MISSING' else 'INFO' end,
    coalesce(function_row.function_definition, 'not present')
  from function_catalog function_row

  union all

  select
    '06_overloads',
    'public.' || overload_row.function_name,
    case
      when overload_row.function_name in (
        'can_write_club_team_season', 'can_read_match', 'can_write_match'
      ) and overload_row.overload_count = 0 then 'READY'
      when overload_row.function_name in (
        'can_write_club_team_season', 'can_read_match', 'can_write_match'
      ) then 'REVIEW'
      when overload_row.overload_count = 1 then 'PASS'
      else 'FAIL'
    end,
    'count=' || overload_row.overload_count::text
      || '; signatures=' || coalesce(overload_row.overloads, '<NONE>')
  from target_overload_counts overload_row

  union all

  select
    '07_execute',
    execute_row.role_name || ' -> public.' || execute_row.function_name
      || '(' || execute_row.identity_arguments || ')',
    case
      when execute_row.effective_execute is null then 'N/A'
      else 'INFO'
    end,
    'effective_execute=' || coalesce(execute_row.effective_execute::text, '<NULL>')
  from function_execute_matrix execute_row

  union all

  select
    '07_execute',
    'PUBLIC -> public.' || public_row.function_name
      || '(' || public_row.identity_arguments || ')',
    case when public_row.public_execute is null then 'N/A' else 'INFO' end,
    'direct_or_default_public_execute='
      || coalesce(public_row.public_execute::text, '<NULL>')
  from function_public_execute public_row

  union all

  select
    '08_policy',
    'public.' || policy_row.object_name || '.' || policy_row.polname,
    'INFO',
    'command=' || policy_row.policy_command
      || '; permissive=' || policy_row.polpermissive::text
      || '; roles=' || coalesce(policy_row.policy_roles, '')
      || '; using=' || coalesce(policy_row.using_expression, '<NULL>')
      || '; check=' || coalesce(policy_row.check_expression, '<NULL>')
  from policy_inventory policy_row

  union all

  select
    '09_policy_baseline',
    'public.' || fingerprint_row.object_name,
    'INFO',
    'policy_count=' || fingerprint_row.policy_count::text
      || '; md5=' || fingerprint_row.policy_fingerprint
  from policy_fingerprints fingerprint_row

  union all

  select
    '10_trigger',
    'public.' || trigger_row.object_name || '.' || trigger_row.tgname,
    case when trigger_row.enabled_mode = 'D' then 'FAIL' else 'INFO' end,
    'enabled=' || trigger_row.enabled_mode
      || '; definition=' || trigger_row.trigger_definition
  from trigger_inventory trigger_row

  union all

  select
    '11_staff_write_model',
    'club_team_season_permissions.write_dimension',
    case
      when exists (
        select 1
        from column_inventory column_row
        where column_row.object_name = 'club_team_season_permissions'
          and (
            pg_catalog.lower(column_row.attname) like '%write%'
            or pg_catalog.lower(column_row.attname) like '%edit%'
            or pg_catalog.lower(column_row.attname) like '%capability%'
            or pg_catalog.lower(column_row.attname) like '%access_level%'
          )
      ) then 'REVIEW'
      else 'BLOCKER'
    end,
    case
      when exists (
        select 1
        from column_inventory column_row
        where column_row.object_name = 'club_team_season_permissions'
          and (
            pg_catalog.lower(column_row.attname) like '%write%'
            or pg_catalog.lower(column_row.attname) like '%edit%'
            or pg_catalog.lower(column_row.attname) like '%capability%'
            or pg_catalog.lower(column_row.attname) like '%access_level%'
          )
      ) then 'A possible write-capability column exists; review its exact contract.'
      else 'No write-capability column is present. Production structure cannot decide whether an assignment is read-only or also permits writes.'
    end

  union all

  select
    '11_staff_write_model',
    'club_member_permissions.allowlist',
    case
      when exists (
        select 1
        from constraint_inventory constraint_row
        where constraint_row.object_name = 'club_member_permissions'
          and constraint_row.constraint_type = 'c'
          and (
            pg_catalog.lower(constraint_row.constraint_definition) like '%match%write%'
            or pg_catalog.lower(constraint_row.constraint_definition) like '%partido%write%'
            or pg_catalog.lower(constraint_row.constraint_definition) like '%match%manage%'
            or pg_catalog.lower(constraint_row.constraint_definition) like '%partido%manage%'
          )
      ) then 'REVIEW'
      else 'BLOCKER'
    end,
    coalesce(
      (
        select pg_catalog.string_agg(
          constraint_row.conname || '=' || constraint_row.constraint_definition,
          ' | ' order by constraint_row.conname
        )
        from constraint_inventory constraint_row
        where constraint_row.object_name = 'club_member_permissions'
          and constraint_row.constraint_type = 'c'
      ),
      'No CHECK allowlist found.'
    )
)
select
  section,
  object_name,
  status,
  detail
from results
order by section, object_name, detail;
