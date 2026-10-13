-- APPCAUDAL - Read-only verification for Change 34 (club_team_seasons).
-- This file contains SELECT statements only. Run after the migration.

-- 1. Expected canonical C.D. Caudal -> 2026/2027 link and preserved identities.
select
  relation.id as relation_id,
  relation.club_id,
  relation.team_id,
  team.code as team_code,
  legacy_team.name as legacy_team_name,
  legacy_team.team_kind as legacy_team_kind,
  relation.season_id,
  season.code as season_code,
  season.label as season_label,
  season.is_active,
  season.status,
  season.closed_at,
  season.closed_by_membership_id,
  relation.created_at
from public.club_team_seasons relation
join public.club_teams team
  on team.id = relation.team_id
 and team.club_id = relation.club_id
join public.equipos_rivales legacy_team on legacy_team.id = team.id
join public.club_seasons season
  on season.id = relation.season_id
 and season.club_id = relation.club_id
where relation.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
  and relation.season_id = 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid;

-- Expected: all columns true and relation_count = 1. Save relation_id and
-- created_at, execute the migration again, then confirm they remain unchanged.
select
  count(*) = 1 as exactly_one_initial_link,
  bool_and(team.code = 'caudal') as canonical_team_code_ok,
  bool_and(season.code = '2026' and season.label = '2026/2027') as season_identity_ok,
  bool_and(season.starts_on = date '2026-07-01' and season.ends_on = date '2027-06-30') as season_dates_ok,
  bool_and(season.is_active and season.status = 'open') as season_still_active_and_open,
  bool_and(season.closed_at is null and season.closed_by_membership_id is null) as closure_fields_still_null
from public.club_team_seasons relation
join public.club_teams team
  on team.id = relation.team_id
 and team.club_id = relation.club_id
join public.club_seasons season
  on season.id = relation.season_id
 and season.club_id = relation.club_id
where relation.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
  and relation.season_id = 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid;

-- 2. Exact columns, types, nullability and defaults.
select
  column_row.attnum as ordinal_position,
  column_row.attname as column_name,
  format_type(column_row.atttypid, column_row.atttypmod) as data_type,
  column_row.attnotnull as not_null,
  pg_get_expr(default_row.adbin, default_row.adrelid) as column_default
from pg_attribute column_row
left join pg_attrdef default_row
  on default_row.adrelid = column_row.attrelid
 and default_row.adnum = column_row.attnum
where column_row.attrelid = 'public.club_team_seasons'::regclass
  and column_row.attnum > 0
  and not column_row.attisdropped
order by column_row.attnum;

-- Expected: true. There must be exactly five columns and no mutable metadata.
with expected(column_name, type_oid, is_not_null, expected_default) as (
  values
    ('id'::name, 'uuid'::regtype::oid, true, 'gen_random_uuid()'::text),
    ('club_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('team_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('season_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('created_at'::name, 'timestamptz'::regtype::oid, true, 'now()'::text)
), actual as (
  select
    column_row.attname as column_name,
    column_row.atttypid as type_oid,
    column_row.attnotnull as is_not_null,
    pg_get_expr(default_row.adbin, default_row.adrelid) as actual_default
  from pg_attribute column_row
  left join pg_attrdef default_row
    on default_row.adrelid = column_row.attrelid
   and default_row.adnum = column_row.attnum
  where column_row.attrelid = 'public.club_team_seasons'::regclass
    and column_row.attnum > 0
    and not column_row.attisdropped
)
select
  (select count(*) from actual) = 5
  and not exists (
    select 1
    from expected
    full join actual using (column_name)
    where expected.column_name is null
       or actual.column_name is null
       or expected.type_oid is distinct from actual.type_oid
       or expected.is_not_null is distinct from actual.is_not_null
       or expected.expected_default is distinct from actual.actual_default
  ) as exact_column_contract_ok;

-- 3. Constraint definitions. Expected: one PK, one UNIQUE and two composite
-- FKs. Both FKs must show ON UPDATE NO ACTION and ON DELETE RESTRICT.
select
  constraint_row.conname,
  constraint_row.contype,
  constraint_row.convalidated,
  constraint_row.condeferrable,
  constraint_row.condeferred,
  pg_get_constraintdef(constraint_row.oid, true) as definition
from pg_constraint constraint_row
where constraint_row.conrelid = 'public.club_team_seasons'::regclass
order by constraint_row.conname;

-- Expected: all booleans true.
with attributes as (
  select
    max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum,
    max(attnum) filter (where attname = 'team_id') as team_attnum,
    max(attnum) filter (where attname = 'season_id') as season_attnum
  from pg_attribute
  where attrelid = 'public.club_team_seasons'::regclass
    and not attisdropped
), team_attributes as (
  select
    max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum
  from pg_attribute
  where attrelid = 'public.club_teams'::regclass
    and not attisdropped
), season_attributes as (
  select
    max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum
  from pg_attribute
  where attrelid = 'public.club_seasons'::regclass
    and not attisdropped
)
select
  (select count(*) from pg_constraint where conrelid = 'public.club_team_seasons'::regclass) = 4 as exact_constraint_count,
  exists (
    select 1 from pg_constraint, attributes
    where conrelid = 'public.club_team_seasons'::regclass
      and contype = 'p'
      and convalidated and not condeferrable
      and conkey = array[attributes.id_attnum]::smallint[]
  ) as primary_key_ok,
  exists (
    select 1 from pg_constraint, attributes
    where conrelid = 'public.club_team_seasons'::regclass
      and contype = 'u'
      and convalidated and not condeferrable
      and conkey = array[attributes.team_attnum, attributes.season_attnum]::smallint[]
  ) as unique_team_season_ok,
  exists (
    select 1
    from pg_constraint, attributes, team_attributes
    where conrelid = 'public.club_team_seasons'::regclass
      and contype = 'f'
      and confrelid = 'public.club_teams'::regclass
      and conkey = array[attributes.team_attnum, attributes.club_attnum]::smallint[]
      and confkey = array[team_attributes.id_attnum, team_attributes.club_attnum]::smallint[]
      and confupdtype = 'a' and confdeltype = 'r'
      and convalidated and not condeferrable
  ) as team_same_club_fk_ok,
  exists (
    select 1
    from pg_constraint, attributes, season_attributes
    where conrelid = 'public.club_team_seasons'::regclass
      and contype = 'f'
      and confrelid = 'public.club_seasons'::regclass
      and conkey = array[attributes.season_attnum, attributes.club_attnum]::smallint[]
      and confkey = array[season_attributes.id_attnum, season_attributes.club_attnum]::smallint[]
      and confupdtype = 'a' and confdeltype = 'r'
      and convalidated and not condeferrable
  ) as season_same_club_fk_ok;

-- 4. Supporting indexes. The PK and UNIQUE indexes are implicit; the explicit
-- history lookup index must use (club_id, season_id, team_id), in that order.
select
  index_row.indexrelid::regclass as index_name,
  index_row.indisunique,
  index_row.indisvalid,
  index_row.indisready,
  pg_get_indexdef(index_row.indexrelid) as definition
from pg_index index_row
where index_row.indrelid = 'public.club_team_seasons'::regclass
order by index_row.indexrelid::regclass::text;

with attributes as (
  select
    max(attnum) filter (where attname = 'club_id') as club_attnum,
    max(attnum) filter (where attname = 'team_id') as team_attnum,
    max(attnum) filter (where attname = 'season_id') as season_attnum
  from pg_attribute
  where attrelid = 'public.club_team_seasons'::regclass
    and not attisdropped
)
select exists (
  select 1
  from pg_index index_row, attributes
  where index_row.indexrelid = 'public.club_team_seasons_club_season_idx'::regclass
    and index_row.indrelid = 'public.club_team_seasons'::regclass
    and index_row.indisvalid
    and index_row.indisready
    and not index_row.indisunique
    and index_row.indnkeyatts = 3
    and index_row.indnatts = 3
    and index_row.indpred is null
    and index_row.indexprs is null
    and index_row.indkey::text =
      attributes.club_attnum::text || ' ' ||
      attributes.season_attnum::text || ' ' ||
      attributes.team_attnum::text
) as club_season_history_index_ok;

-- 5. Data integrity and idempotence invariants. Expected: zero invalid rows,
-- zero duplicates, one initial link.
select
  count(*) filter (
    where team.id is null
       or season.id is null
       or relation.club_id is distinct from team.club_id
       or relation.club_id is distinct from season.club_id
  ) as invalid_or_cross_club_links,
  count(*) filter (
    where relation.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
      and relation.season_id = 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid
      and team.code = 'caudal'
  ) as initial_link_count
from public.club_team_seasons relation
left join public.club_teams team
  on team.id = relation.team_id
 and team.club_id = relation.club_id
left join public.club_seasons season
  on season.id = relation.season_id
 and season.club_id = relation.club_id;

select team_id, season_id, count(*) as duplicate_count
from public.club_team_seasons
group by team_id, season_id
having count(*) > 1;

-- Expected: no rows. A relation can remain visible for a closed or inactive
-- historical season; neither lifecycle field is part of this integrity test.
select relation.*
from public.club_team_seasons relation
left join public.club_teams team
  on team.id = relation.team_id
 and team.club_id = relation.club_id
left join public.club_seasons season
  on season.id = relation.season_id
 and season.club_id = relation.club_id
where team.id is null or season.id is null;

-- 6. RLS policy inventory and exact predicates.
select
  policy.polname,
  policy.polcmd::text as command,
  policy.polpermissive,
  array(
    select role_name.rolname
    from pg_roles role_name
    where role_name.oid = any(policy.polroles)
    order by role_name.rolname
  ) as roles,
  pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
  pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
from pg_policy policy
where policy.polrelid = 'public.club_team_seasons'::regclass
order by policy.polname;

-- Expected: every boolean true. There must be no UPDATE or DELETE policy.
select
  pg_get_userbyid(class_row.relowner) = 'postgres' as owner_is_postgres,
  class_row.relrowsecurity as rls_enabled,
  not class_row.relforcerowsecurity as rls_not_forced,
  (select count(*) from pg_policy where polrelid = class_row.oid) = 2 as exact_policy_count,
  exists (
    select 1 from pg_policy policy
    where policy.polrelid = class_row.oid
      and policy.polname = 'club_team_seasons_staff_select'
      and policy.polcmd = 'r'
      and policy.polpermissive
      and policy.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]
      and policy.polwithcheck is null
      and regexp_replace(replace(
        lower(pg_get_expr(policy.polqual, policy.polrelid)), 'public.', ''
      ), '[[:space:]()]', '', 'g') = 'can_edit_club_dataclub_id'
  ) as staff_select_policy_ok,
  exists (
    select 1 from pg_policy policy
    where policy.polrelid = class_row.oid
      and policy.polname = 'club_team_seasons_manager_insert'
      and policy.polcmd = 'a'
      and policy.polpermissive
      and policy.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]
      and policy.polqual is null
      and regexp_replace(replace(
        lower(pg_get_expr(policy.polwithcheck, policy.polrelid)), 'public.', ''
      ), '[[:space:]()]', '', 'g') = 'can_manage_clubclub_id'
  ) as manager_insert_policy_ok,
  not exists (
    select 1 from pg_policy policy
    where policy.polrelid = class_row.oid and policy.polcmd in ('w', 'd', '*')
  ) as no_update_delete_or_all_policy
from pg_class class_row
where class_row.oid = 'public.club_team_seasons'::regclass;

-- 7. Client privileges. Expected: authenticated can SELECT/INSERT only; anon
-- has no data privilege. service_role is intentionally backend-only.
select
  role_name,
  has_table_privilege(role_name, 'public.club_team_seasons', 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.club_team_seasons', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.club_team_seasons', 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.club_team_seasons', 'DELETE') as can_delete,
  has_table_privilege(role_name, 'public.club_team_seasons', 'TRUNCATE') as can_truncate,
  has_table_privilege(role_name, 'public.club_team_seasons', 'REFERENCES') as can_reference,
  has_table_privilege(role_name, 'public.club_team_seasons', 'TRIGGER') as can_trigger
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
order by role_name;

-- 8. Authorization function contract used by the two policies.
select
  routine.oid::regprocedure as function_signature,
  has_function_privilege('authenticated', routine.oid, 'EXECUTE') as authenticated_can_execute,
  routine.prosecdef as security_definer,
  routine.provolatile,
  routine.proconfig,
  pg_get_userbyid(routine.proowner) as owner
from pg_proc routine
where routine.oid in (
  'public.can_edit_club_data(uuid)'::regprocedure,
  'public.can_manage_club(uuid)'::regprocedure
)
order by routine.oid::regprocedure::text;

-- 9. Read-only non-regression inventory. Compare these fingerprints with the
-- corresponding pre-migration capture if an independent baseline was saved.
with protected_tables(table_name) as (
  values
    ('clubs'::text),
    ('club_seasons'),
    ('club_teams'),
    ('equipos_rivales'),
    ('player_team_memberships'),
    ('partidos'),
    ('competitions'),
    ('training_sessions'),
    ('training_tasks'),
    ('rpe_entries')
)
select
  protected.table_name,
  to_regclass('public.' || protected.table_name) is not null as table_exists,
  coalesce((
    select count(*)
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = protected.table_name
  ), 0) as column_count,
  coalesce((
    select count(*)
    from pg_policy policy
    where policy.polrelid = to_regclass('public.' || protected.table_name)
  ), 0) as policy_count
from protected_tables protected
order by protected.table_name;

-- 10. Confirm this file remains read-only through review: every executable
-- statement above is SELECT or WITH ... SELECT. No mutation is performed here.
