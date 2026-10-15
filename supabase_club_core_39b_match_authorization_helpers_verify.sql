-- APPCAUDAL - Club core (change 39B) structural verifier
-- Read-only: one SELECT statement, safe to run before and after the migration.
--
-- GLOBAL READY_TO_APPLY: inherited contracts pass and all three helpers are absent.
-- GLOBAL PASS: inherited contracts and all three installed helper contracts pass.
-- GLOBAL BLOCKED: at least one mandatory structural or historical check fails.
--
-- Identity scenarios are deliberately PENDING here. Catalog inspection and
-- source hashes are not substitutes for authenticated end-to-end tests.

with
expected_functions(
  function_name,
  argument_name,
  expected_comment,
  expected_source_md5
) as (
  values
    (
      'can_write_club_team_season'::text,
      'target_club_team_season_id'::text,
      'APPCAUDAL Change 39B: write authorization for an open club team-season.'::text,
      '1c7f46f430cba9c9c16f298af6cd4c3b'::text
    ),
    (
      'can_read_match'::text,
      'target_partido_id'::text,
      'APPCAUDAL Change 39B: match read authorization delegated to its canonical team-season.'::text,
      '31c4128ac988bf3d02e665c00d18f2f9'::text
    ),
    (
      'can_write_match'::text,
      'target_partido_id'::text,
      'APPCAUDAL Change 39B: match write authorization delegated to its canonical open team-season.'::text,
      'dbdc12f9b182934afbea30dfafd60850'::text
    )
),
required_relations(relation_name) as (
  values
    ('club_seasons'::text),
    ('club_teams'::text),
    ('club_team_seasons'::text),
    ('club_team_season_permissions'::text),
    ('club_memberships'::text),
    ('partidos'::text)
),
relation_catalog as (
  select
    target.relation_name,
    relation.oid as relation_oid,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner) as owner_name
  from required_relations target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.relation_name
   and relation.relkind in ('r', 'p')
),
expected_columns(
  relation_name,
  column_name,
  type_name,
  expected_not_null,
  expected_has_default
) as (
  values
    ('club_seasons'::text, 'id'::text, 'uuid'::text, true, null::boolean),
    ('club_seasons', 'club_id', 'uuid', true, null),
    ('club_seasons', 'status', 'text', true, null),
    ('club_team_seasons', 'id', 'uuid', true, null),
    ('club_team_seasons', 'club_id', 'uuid', true, null),
    ('club_team_seasons', 'team_id', 'uuid', true, null),
    ('club_team_seasons', 'season_id', 'uuid', true, null),
    ('partidos', 'id', 'uuid', true, null),
    ('partidos', 'club_team_season_id', 'uuid', false, false)
),
column_contracts as (
  select
    expected.relation_name,
    expected.column_name,
    attribute.attnum,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as actual_type,
    attribute.attnotnull as actual_not_null,
    attribute.atthasdef as actual_has_default,
    attribute.attnum is not null
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = expected.type_name
      and attribute.attnotnull = expected.expected_not_null
      and (
        expected.expected_has_default is null
        or attribute.atthasdef = expected.expected_has_default
      ) as contract_ok
  from expected_columns expected
  left join pg_catalog.pg_attribute attribute
    on attribute.attrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   and attribute.attname = expected.column_name
   and attribute.attnum > 0
   and not attribute.attisdropped
),
inherited_function as (
  select routine.*
  from pg_catalog.pg_proc routine
  where routine.oid = pg_catalog.to_regprocedure(
    'public.can_read_club_team_season(uuid)'
  )
),
inherited_function_state as (
  select
    routine.oid,
    routine.prosrc,
    routine.proacl,
    routine.proowner,
    routine.oid is not null
      and routine.prokind = 'f'
      and routine.prorettype = 'boolean'::regtype
      and routine.provolatile = 's'
      and routine.prosecdef
      and routine.proowner = (
        select role_row.oid from pg_catalog.pg_roles role_row
        where role_row.rolname = 'postgres'
      )
      and routine.proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and routine.prolang = (
        select language.oid from pg_catalog.pg_language language
        where language.lanname = 'sql'
      )
      and pg_catalog.obj_description(routine.oid, 'pg_proc') =
        'APPCAUDAL Change 35 read-only team-season authorization helper.'
      as contract_ok,
    routine.oid is not null
      and pg_catalog.strpos(routine.prosrc, 'public.club_team_season_permissions') > 0
      and pg_catalog.strpos(routine.prosrc, 'actor.role in (''owner'', ''admin'')') > 0
      and pg_catalog.strpos(routine.prosrc, 'actor.role = ''staff''') > 0
      and pg_catalog.strpos(routine.prosrc, 'auth.uid()') > 0
      and pg_catalog.strpos(routine.prosrc, 'public.is_app_staff') = 0
      as authorization_shape_ok,
    case
      when routine.oid is null
        or not exists (
          select 1 from pg_catalog.pg_roles where rolname = 'anon'
        )
        or not exists (
          select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
        ) then false
      else
        not pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
        and not exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(
              routine.proacl,
              pg_catalog.acldefault('f', routine.proowner)
            )
          ) acl_row
          where acl_row.grantee = 0
            and acl_row.privilege_type = 'EXECUTE'
        )
    end as execute_ok
  from (select null::oid as oid, null::text as prosrc, null::aclitem[] as proacl,
               null::oid as proowner, null::"char" as prokind,
               null::oid as prorettype, null::"char" as provolatile,
               null::boolean as prosecdef, null::text[] as proconfig,
               null::oid as prolang
        where not exists (select 1 from inherited_function)
        union all
        select oid, prosrc, proacl, proowner, prokind, prorettype,
               provolatile, prosecdef, proconfig, prolang
        from inherited_function) routine
),
target_function_catalog as (
  select
    expected.*,
    routine.oid as function_oid,
    routine.prokind,
    routine.prorettype,
    routine.pronargs,
    routine.pronargdefaults,
    routine.proargnames,
    routine.provolatile,
    routine.prosecdef,
    routine.proowner,
    routine.proconfig,
    routine.prolang,
    routine.prosrc,
    routine.proacl,
    pg_catalog.obj_description(routine.oid, 'pg_proc') as actual_comment,
    (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc overload
      join pg_catalog.pg_namespace namespace on namespace.oid = overload.pronamespace
      where namespace.nspname = 'public'
        and overload.proname = expected.function_name
    ) as overload_count
  from expected_functions expected
  left join pg_catalog.pg_proc routine
    on routine.oid = pg_catalog.to_regprocedure(
      pg_catalog.format('public.%I(uuid)', expected.function_name)
    )
),
target_function_state as (
  select
    function_row.*,
    function_row.function_oid is not null
      and function_row.overload_count = 1 as identity_ok,
    function_row.function_oid is not null
      and function_row.overload_count = 1
      and function_row.prokind = 'f'
      and function_row.prorettype = 'boolean'::regtype
      and function_row.pronargs = 1
      and function_row.pronargdefaults = 0
      and function_row.proargnames = array[function_row.argument_name]::text[]
      and function_row.provolatile = 's'
      and function_row.prosecdef
      and function_row.proowner = (
        select role_row.oid from pg_catalog.pg_roles role_row
        where role_row.rolname = 'postgres'
      )
      and function_row.proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and function_row.prolang = (
        select language.oid from pg_catalog.pg_language language
        where language.lanname = 'sql'
      )
      and function_row.actual_comment = function_row.expected_comment
      as metadata_ok,
    function_row.function_oid is not null
      and pg_catalog.md5(
        pg_catalog.regexp_replace(
          pg_catalog.lower(function_row.prosrc),
          $regex$\s+$regex$,
          '',
          'g'
        )
      ) = function_row.expected_source_md5
      and pg_catalog.strpos(function_row.prosrc, 'auth.uid()') > 0
      and pg_catalog.strpos(function_row.prosrc, 'public.is_app_staff') = 0
      and pg_catalog.strpos(function_row.prosrc, 'execute ') = 0
      and pg_catalog.strpos(function_row.prosrc, 'set_config') = 0
      as source_ok,
    case
      when function_row.function_oid is null
        or not exists (
          select 1 from pg_catalog.pg_roles where rolname = 'anon'
        )
        or not exists (
          select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
        )
        or not exists (
          select 1 from pg_catalog.pg_roles where rolname = 'service_role'
        ) then false
      else
        not pg_catalog.has_function_privilege(
          'anon', function_row.function_oid, 'EXECUTE'
        )
        and pg_catalog.has_function_privilege(
          'authenticated', function_row.function_oid, 'EXECUTE'
        )
        and not pg_catalog.has_function_privilege(
          'service_role', function_row.function_oid, 'EXECUTE'
        )
        and not exists (
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
        and exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(
              function_row.proacl,
              pg_catalog.acldefault('f', function_row.proowner)
            )
          ) acl_row
          join pg_catalog.pg_roles grantee on grantee.oid = acl_row.grantee
          where grantee.rolname = 'authenticated'
            and acl_row.privilege_type = 'EXECUTE'
            and not acl_row.is_grantable
        )
    end as execute_ok
  from target_function_catalog function_row
),
structural_constraint_state as (
  select
    (
      select pg_catalog.count(*) = 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass('public.club_team_seasons')
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = pg_catalog.to_regclass('public.club_seasons')
        and constraint_row.conkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_seasons') and attname = 'season_id' and not attisdropped),
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_seasons') and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_seasons') and attname = 'id' and not attisdropped),
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_seasons') and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confupdtype = 'a'
        and constraint_row.confdeltype = 'r'
        and constraint_row.convalidated
        and not constraint_row.condeferrable
        and not constraint_row.condeferred
    ) as season_club_fk_ok,
    (
      select pg_catalog.count(*) = 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass('public.club_team_seasons')
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = pg_catalog.to_regclass('public.club_teams')
        and constraint_row.conkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_seasons') and attname = 'team_id' and not attisdropped),
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_seasons') and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_teams') and attname = 'id' and not attisdropped),
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_teams') and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confupdtype = 'a'
        and constraint_row.confdeltype = 'r'
        and constraint_row.convalidated
        and not constraint_row.condeferrable
        and not constraint_row.condeferred
    ) as team_club_fk_ok,
    (
      select pg_catalog.count(*) = 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass('public.partidos')
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = pg_catalog.to_regclass('public.club_team_seasons')
        and constraint_row.conkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.partidos') and attname = 'club_team_season_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_seasons') and attname = 'id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confupdtype = 'a'
        and constraint_row.confdeltype = 'r'
        and constraint_row.convalidated
        and not constraint_row.condeferrable
        and not constraint_row.condeferred
    ) as match_scope_fk_ok,
    (
      select pg_catalog.count(*) = 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass('public.club_team_season_permissions')
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = pg_catalog.to_regclass('public.club_team_seasons')
        and constraint_row.conkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_season_permissions') and attname = 'club_team_season_id' and not attisdropped),
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_season_permissions') and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_seasons') and attname = 'id' and not attisdropped),
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_seasons') and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confupdtype = 'a'
        and constraint_row.confdeltype = 'r'
        and constraint_row.convalidated
        and not constraint_row.condeferrable
        and not constraint_row.condeferred
    ) as permission_relation_club_fk_ok,
    (
      select pg_catalog.count(*) = 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass('public.club_team_season_permissions')
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = pg_catalog.to_regclass('public.club_memberships')
        and constraint_row.conkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_season_permissions') and attname = 'membership_id' and not attisdropped),
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_team_season_permissions') and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confkey = array[
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_memberships') and attname = 'id' and not attisdropped),
          (select attnum from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.club_memberships') and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confupdtype = 'a'
        and constraint_row.confdeltype = 'c'
        and constraint_row.convalidated
        and not constraint_row.condeferrable
        and not constraint_row.condeferred
    ) as permission_membership_club_fk_ok,
    exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass('public.club_seasons')
        and constraint_row.conname = 'club_seasons_status_check'
        and constraint_row.contype = 'c'
        and constraint_row.convalidated
    ) as season_status_check_ok
),
data_query_readiness as (
  select
    pg_catalog.to_regclass('public.partidos') is not null
      and pg_catalog.to_regclass('public.club_seasons') is not null
      and exists (
        select 1 from pg_catalog.pg_attribute
        where attrelid = pg_catalog.to_regclass('public.partidos')
          and attname = 'id' and atttypid = 'uuid'::regtype and not attisdropped
      )
      and exists (
        select 1 from pg_catalog.pg_attribute
        where attrelid = pg_catalog.to_regclass('public.partidos')
          and attname = 'club_team_season_id'
          and atttypid = 'uuid'::regtype and not attisdropped
      )
      and exists (
        select 1 from pg_catalog.pg_attribute
        where attrelid = pg_catalog.to_regclass('public.club_seasons')
          and attname = 'status' and atttypid = 'text'::regtype and not attisdropped
      ) as can_query
),
data_counts_xml as (
  select
    readiness.can_query,
    case
      when readiness.can_query then pg_catalog.query_to_xml(
        $query$
          select
            count(*) filter (
              where match_row.id = any(array[
                '12e019fb-e2bb-4a6d-91ce-f22a04c4f7dc'::uuid,
                '25cbc486-080a-4b82-9980-3c09cc103181'::uuid,
                '39e2d20d-5d6e-40fd-9645-d44e2eb40715'::uuid,
                '3a617129-de25-4531-a944-27832bb24b31'::uuid,
                '4b3312ed-96e6-440f-88e6-82c2b9baf622'::uuid,
                '65f6c0ab-66c8-47ad-882b-f12c529601bb'::uuid,
                '6785391e-a054-488b-acf4-67be3cd954c2'::uuid,
                '8ce7ceb8-60e6-4f55-9bc1-a24b4da2461e'::uuid,
                'ca6b6933-e075-4cee-b5a0-ab32abb61d41'::uuid,
                'd7e38bd4-1e63-492d-9676-cedc07b9a920'::uuid,
                'e98f09d2-fb31-4db3-89da-b53e5982b683'::uuid,
                'ebf6cc9c-ec1d-42d1-bf22-e09a9741ab3a'::uuid,
                'eca4bee3-4b98-42a1-9dff-b6f4187082d6'::uuid,
                'ffa62b07-b9a9-4f03-ad6c-2d65df327774'::uuid
              ]::uuid[])
            ) as manifest_count,
            count(*) filter (
              where match_row.id = any(array[
                '12e019fb-e2bb-4a6d-91ce-f22a04c4f7dc'::uuid,
                '25cbc486-080a-4b82-9980-3c09cc103181'::uuid,
                '39e2d20d-5d6e-40fd-9645-d44e2eb40715'::uuid,
                '3a617129-de25-4531-a944-27832bb24b31'::uuid,
                '4b3312ed-96e6-440f-88e6-82c2b9baf622'::uuid,
                '65f6c0ab-66c8-47ad-882b-f12c529601bb'::uuid,
                '6785391e-a054-488b-acf4-67be3cd954c2'::uuid,
                '8ce7ceb8-60e6-4f55-9bc1-a24b4da2461e'::uuid,
                'ca6b6933-e075-4cee-b5a0-ab32abb61d41'::uuid,
                'd7e38bd4-1e63-492d-9676-cedc07b9a920'::uuid,
                'e98f09d2-fb31-4db3-89da-b53e5982b683'::uuid,
                'ebf6cc9c-ec1d-42d1-bf22-e09a9741ab3a'::uuid,
                'eca4bee3-4b98-42a1-9dff-b6f4187082d6'::uuid,
                'ffa62b07-b9a9-4f03-ad6c-2d65df327774'::uuid
              ]::uuid[])
              and match_row.club_team_season_id =
                '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
            ) as assigned_count,
            (
              select count(*)
              from public.club_seasons season
              where season.status not in ('open', 'closed')
            ) as invalid_status_count
          from public.partidos match_row
        $query$,
        true,
        false,
        ''
      )
      else null::xml
    end as counts_xml
  from data_query_readiness readiness
),
data_counts as (
  select
    source.can_query,
    nullif(
      (pg_catalog.xpath(
        '/*[local-name()="table"]/*[local-name()="row"]/*[local-name()="manifest_count"]/text()',
        source.counts_xml
      ))[1]::text,
      ''
    )::bigint as manifest_count,
    nullif(
      (pg_catalog.xpath(
        '/*[local-name()="table"]/*[local-name()="row"]/*[local-name()="assigned_count"]/text()',
        source.counts_xml
      ))[1]::text,
      ''
    )::bigint as assigned_count,
    nullif(
      (pg_catalog.xpath(
        '/*[local-name()="table"]/*[local-name()="row"]/*[local-name()="invalid_status_count"]/text()',
        source.counts_xml
      ))[1]::text,
      ''
    )::bigint as invalid_status_count
  from data_counts_xml source
),
policy_inventory as (
  select
    relation_row.relation_name,
    relation_row.relrowsecurity,
    relation_row.relforcerowsecurity,
    policy.polname,
    policy.polcmd::text as policy_command,
    policy.polpermissive,
    policy.polroles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
  from relation_catalog relation_row
  left join pg_catalog.pg_policy policy
    on policy.polrelid = relation_row.relation_oid
),
policy_fingerprints as (
  select
    policy_row.relation_name,
    policy_row.relrowsecurity,
    policy_row.relforcerowsecurity,
    pg_catalog.count(policy_row.polname) as policy_count,
    pg_catalog.md5(
      coalesce(
        pg_catalog.string_agg(
          coalesce(policy_row.polname, '<NO_POLICY>')
          || ':' || coalesce(policy_row.policy_command, '')
          || ':' || coalesce(policy_row.polpermissive::text, '')
          || ':' || coalesce(policy_row.polroles::text, '')
          || ':' || coalesce(policy_row.using_expression, '')
          || ':' || coalesce(policy_row.check_expression, ''),
          '|' order by policy_row.polname
        ),
        ''
      )
    ) as policy_fingerprint
  from policy_inventory policy_row
  group by
    policy_row.relation_name,
    policy_row.relrowsecurity,
    policy_row.relforcerowsecurity
),
base_checks(check_name, passed, detail) as (
  select
    'POSTGRES_17_OR_NEWER'::text,
    pg_catalog.current_setting('server_version_num')::integer >= 170000,
    'server_version=' || pg_catalog.current_setting('server_version')

  union all

  select
    'REQUIRED_SUPABASE_ROLES',
    (
      select pg_catalog.count(*) = 4
      from pg_catalog.pg_roles
      where rolname in ('postgres', 'anon', 'authenticated', 'service_role')
    ),
    'required=postgres,anon,authenticated,service_role'

  union all

  select
    'REQUIRED_RELATIONS',
    pg_catalog.bool_and(relation_row.relation_oid is not null),
    pg_catalog.string_agg(
      relation_row.relation_name || '='
        || case when relation_row.relation_oid is null then 'missing' else 'present' end,
      ', ' order by relation_row.relation_name
    )
  from relation_catalog relation_row

  union all

  select
    'REQUIRED_COLUMNS',
    pg_catalog.bool_and(column_row.contract_ok),
    pg_catalog.string_agg(
      column_row.relation_name || '.' || column_row.column_name || '='
        || case when column_row.contract_ok then 'ok' else 'incompatible' end,
      ', ' order by column_row.relation_name, column_row.column_name
    )
  from column_contracts column_row

  union all

  select
    'CANONICAL_SEASON_CLUB_FK',
    constraint_row.season_club_fk_ok,
    'validated composite FK (season_id,club_id), ON UPDATE NO ACTION, ON DELETE RESTRICT'
  from structural_constraint_state constraint_row

  union all

  select
    'CANONICAL_TEAM_CLUB_FK',
    constraint_row.team_club_fk_ok,
    'validated composite FK (team_id,club_id), ON UPDATE NO ACTION, ON DELETE RESTRICT'
  from structural_constraint_state constraint_row

  union all

  select
    'MATCH_SCOPE_FK',
    constraint_row.match_scope_fk_ok,
    'validated FK partidos.club_team_season_id, ON UPDATE NO ACTION, ON DELETE RESTRICT'
  from structural_constraint_state constraint_row

  union all

  select
    'PERMISSION_RELATION_CLUB_FK',
    constraint_row.permission_relation_club_fk_ok,
    'validated composite FK (club_team_season_id,club_id), ON DELETE RESTRICT'
  from structural_constraint_state constraint_row

  union all

  select
    'PERMISSION_MEMBERSHIP_CLUB_FK',
    constraint_row.permission_membership_club_fk_ok,
    'validated composite FK (membership_id,club_id), ON DELETE CASCADE'
  from structural_constraint_state constraint_row

  union all

  select
    'SEASON_STATUS_CONTRACT',
    constraint_row.season_status_check_ok
      and data_row.can_query
      and data_row.invalid_status_count = 0,
    'validated_check=' || constraint_row.season_status_check_ok::text
      || '; invalid_values=' || coalesce(data_row.invalid_status_count::text, '<NOT_CHECKED>')
  from structural_constraint_state constraint_row
  cross join data_counts data_row

  union all

  select
    'INHERITED_CAN_READ_METADATA',
    inherited.contract_ok,
    'SECURITY DEFINER, STABLE, boolean, owner postgres, SQL, search_path=pg_catalog, Change 35 comment'
  from inherited_function_state inherited

  union all

  select
    'INHERITED_CAN_READ_AUTHORIZATION_SHAPE',
    inherited.authorization_shape_ok,
    'owner/admin or assigned staff via club_team_season_permissions; auth.uid(); no is_app_staff shortcut'
  from inherited_function_state inherited

  union all

  select
    'INHERITED_CAN_READ_EXECUTE',
    inherited.execute_ok,
    'authenticated=true; anon=false; PUBLIC=false'
  from inherited_function_state inherited

  union all

  select
    'TARGET_NAMES_AND_OVERLOADS',
    pg_catalog.bool_and(
      function_row.overload_count = 0
      or (function_row.overload_count = 1 and function_row.function_oid is not null)
    ),
    pg_catalog.string_agg(
      function_row.function_name || '=' || function_row.overload_count::text,
      ', ' order by function_row.function_name
    )
  from target_function_state function_row

  union all

  select
    'RLS_NOT_YET_USING_39B_HELPERS',
    not exists (
      select 1
      from policy_inventory policy_row
      where pg_catalog.strpos(
        pg_catalog.lower(coalesce(policy_row.using_expression, '')),
        'can_write_club_team_season'
      ) > 0
         or pg_catalog.strpos(
           pg_catalog.lower(coalesce(policy_row.using_expression, '')),
           'can_read_match'
         ) > 0
         or pg_catalog.strpos(
           pg_catalog.lower(coalesce(policy_row.using_expression, '')),
           'can_write_match'
         ) > 0
         or pg_catalog.strpos(
           pg_catalog.lower(coalesce(policy_row.check_expression, '')),
           'can_write_club_team_season'
         ) > 0
         or pg_catalog.strpos(
           pg_catalog.lower(coalesce(policy_row.check_expression, '')),
           'can_read_match'
         ) > 0
         or pg_catalog.strpos(
           pg_catalog.lower(coalesce(policy_row.check_expression, '')),
           'can_write_match'
         ) > 0
    ),
    'Change 39B must create helpers only; no current policy may depend on them yet'

  union all

  select
    'HISTORICAL_14_MATCHES',
    data_row.can_query
      and data_row.manifest_count = 14
      and data_row.assigned_count = 14,
    'manifest=' || coalesce(data_row.manifest_count::text, '<NOT_CHECKED>')
      || '/14; assigned_to_961970c8-0fcf-4c45-94d6-787647619c61='
      || coalesce(data_row.assigned_count::text, '<NOT_CHECKED>') || '/14'
  from data_counts data_row
),
function_checks(check_name, passed, detail) as (
  select
    'FUNCTION_' || pg_catalog.upper(function_row.function_name) || '_IDENTITY',
    function_row.identity_ok,
    'exists=' || (function_row.function_oid is not null)::text
      || '; overload_count=' || function_row.overload_count::text
  from target_function_state function_row

  union all

  select
    'FUNCTION_' || pg_catalog.upper(function_row.function_name) || '_METADATA',
    function_row.metadata_ok,
    'boolean, one named uuid input, no defaults, STABLE, SECURITY DEFINER, SQL, owner postgres, search_path=pg_catalog, exact comment'
  from target_function_state function_row

  union all

  select
    'FUNCTION_' || pg_catalog.upper(function_row.function_name) || '_BODY',
    function_row.source_ok,
    'exact normalized source md5=' || function_row.expected_source_md5
      || '; auth.uid required; is_app_staff/dynamic SQL/set_config forbidden'
  from target_function_state function_row

  union all

  select
    'FUNCTION_' || pg_catalog.upper(function_row.function_name) || '_EXECUTE',
    function_row.execute_ok,
    'authenticated=true direct without grant option; anon=false; service_role=false; PUBLIC=false'
  from target_function_state function_row
),
state_summary as (
  select
    (select pg_catalog.bool_and(coalesce(check_row.passed, false)) from base_checks check_row)
      as base_ok,
    pg_catalog.count(*) filter (where function_row.overload_count = 0)
      as absent_count,
    pg_catalog.count(*) filter (
      where function_row.identity_ok
        and function_row.metadata_ok
        and function_row.source_ok
        and function_row.execute_ok
    ) as valid_count
  from target_function_state function_row
),
global_state as (
  select
    case
      when not summary.base_ok then 'BLOCKED'
      when summary.absent_count = 3 then 'READY_TO_APPLY'
      when summary.valid_count = 3 then 'PASS'
      else 'BLOCKED'
    end as status,
    'base_checks=' || case when summary.base_ok then 'PASS' else 'FAIL' end
      || '; helpers_absent=' || summary.absent_count::text || '/3'
      || '; helpers_valid=' || summary.valid_count::text || '/3'
      || '; identity_tests=PENDING' as detail
  from state_summary summary
),
result_rows(section, check_name, mandatory, status, detail) as (
  select
    '00_GLOBAL'::text,
    'GLOBAL',
    true,
    global_row.status,
    global_row.detail
  from global_state global_row

  union all

  select
    '01_PRECONDITION',
    check_row.check_name,
    true,
    case when check_row.passed then 'PASS' else 'BLOCKED' end,
    check_row.detail
  from base_checks check_row

  union all

  select
    '02_HELPER',
    check_row.check_name,
    true,
    case
      when summary.absent_count = 3 then 'READY_TO_APPLY'
      when check_row.passed then 'PASS'
      else 'BLOCKED'
    end,
    case
      when summary.absent_count = 3 then
        'helper not installed yet; expected after migration. ' || check_row.detail
      else check_row.detail
    end
  from function_checks check_row
  cross join state_summary summary

  union all

  select
    '03_RLS_BASELINE',
    'RLS_' || pg_catalog.upper(policy_row.relation_name),
    false,
    'INFO',
    'enabled=' || coalesce(policy_row.relrowsecurity::text, '<NULL>')
      || '; forced=' || coalesce(policy_row.relforcerowsecurity::text, '<NULL>')
      || '; policy_count=' || policy_row.policy_count::text
      || '; fingerprint=' || policy_row.policy_fingerprint
  from policy_fingerprints policy_row

  union all

  select
    '03_RLS_BASELINE',
    'RLS_COMPARISON_LIMIT',
    false,
    'INFO',
    'Compare section 03 before/after. The migration also compares the effective RLS fingerprint inside its transaction and rolls back on any difference.'

  union all

  select
    '04_IDENTITY_TEST_PENDING',
    scenario.scenario_name,
    false,
    'PENDING',
    scenario.expected_result
  from (values
    ('OWNER_OPEN'::text, 'real active owner: read=true, write=true for team-season and linked match'::text),
    ('OWNER_CLOSED', 'real active owner on a controlled closed season: read=true, write=false'),
    ('ADMIN_OPEN', 'real active admin: read=true, write=true; remains pending until an admin identity exists'),
    ('STAFF_ASSIGNED_OPEN', 'real active assigned staff: read=true, write=true'),
    ('STAFF_OTHER_TEAM', 'real active staff assigned only elsewhere: read=false, write=false'),
    ('STAFF_OTHER_SEASON', 'real active staff assigned only to another season: read=false, write=false'),
    ('MEMBERSHIP_OR_ASSIGNMENT_REVOKED', 'after an authorized revocation in a rollback-only test: immediate read=false, write=false'),
    ('VIEWER', 'real viewer if that role exists: read=false, write=false'),
    ('PLAYER', 'real active player: read=false, write=false'),
    ('ANON', 'anon role/request: no EXECUTE and no general sports authorization'),
    ('NULL_AND_UNKNOWN_UUID', 'authenticated controlled identity: all helpers return false'),
    ('UNLINKED_MATCH', 'controlled rollback-only or non-production fixture: read=false, write=false')
  ) scenario(scenario_name, expected_result)
)
select
  section,
  check_name,
  mandatory,
  status,
  detail
from result_rows
order by section, check_name;
