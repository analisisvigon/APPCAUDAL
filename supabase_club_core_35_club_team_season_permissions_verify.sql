-- APPCAUDAL - Read-only verification for Change 35.
-- Every executable statement in this file is SELECT or WITH ... SELECT.

-- 1. Relation inventory. Immediately after first application this must return
-- zero rows: Change 35 never creates initial STAFF assignments.
select
  permission.id,
  permission.club_id,
  permission.club_team_season_id,
  relation.team_id,
  relation.season_id,
  season.label as season_label,
  season.status as season_status,
  permission.membership_id,
  membership.user_id,
  membership.role,
  membership.is_active,
  permission.created_at
from public.club_team_season_permissions permission
join public.club_team_seasons relation
  on relation.id = permission.club_team_season_id
 and relation.club_id = permission.club_id
join public.club_seasons season
  on season.id = relation.season_id
 and season.club_id = relation.club_id
join public.club_memberships membership
  on membership.id = permission.membership_id
 and membership.club_id = permission.club_id
order by permission.created_at, permission.id;

select count(*) as permission_count
from public.club_team_season_permissions;

-- 2. Column contract.
select
  attribute.attnum,
  attribute.attname,
  format_type(attribute.atttypid, attribute.atttypmod) as data_type,
  attribute.attnotnull,
  pg_get_expr(default_row.adbin, default_row.adrelid) as column_default
from pg_attribute attribute
left join pg_attrdef default_row
  on default_row.adrelid = attribute.attrelid
 and default_row.adnum = attribute.attnum
where attribute.attrelid = 'public.club_team_season_permissions'::regclass
  and attribute.attnum > 0
  and not attribute.attisdropped
order by attribute.attnum;

with expected(column_name, type_oid, is_not_null, expected_default) as (
  values
    ('id'::name, 'uuid'::regtype::oid, true, 'gen_random_uuid()'::text),
    ('club_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('club_team_season_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('membership_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('created_at'::name, 'timestamptz'::regtype::oid, true, 'now()'::text)
), actual as (
  select
    attribute.attname as column_name,
    attribute.atttypid as type_oid,
    attribute.attnotnull as is_not_null,
    pg_get_expr(default_row.adbin, default_row.adrelid) as actual_default
  from pg_attribute attribute
  left join pg_attrdef default_row
    on default_row.adrelid = attribute.attrelid
   and default_row.adnum = attribute.attnum
  where attribute.attrelid = 'public.club_team_season_permissions'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
)
select
  (select count(*) from actual) = 5
  and not exists (
    select 1 from expected
    full join actual using (column_name)
    where expected.column_name is null
       or actual.column_name is null
       or expected.type_oid is distinct from actual.type_oid
       or expected.is_not_null is distinct from actual.is_not_null
       or expected.expected_default is distinct from actual.actual_default
  ) as exact_column_contract_ok;

-- 3. Constraints and referential actions.
select
  constraint_row.conname,
  constraint_row.contype,
  constraint_row.convalidated,
  constraint_row.condeferrable,
  constraint_row.condeferred,
  pg_get_constraintdef(constraint_row.oid, true) as definition
from pg_constraint constraint_row
where constraint_row.conrelid in (
  'public.club_team_seasons'::regclass,
  'public.club_team_season_permissions'::regclass
)
order by constraint_row.conrelid::regclass::text, constraint_row.conname;

with permission_attributes as (
  select
    max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum,
    max(attnum) filter (where attname = 'club_team_season_id') as relation_attnum,
    max(attnum) filter (where attname = 'membership_id') as membership_attnum
  from pg_attribute
  where attrelid = 'public.club_team_season_permissions'::regclass
    and not attisdropped
), relation_attributes as (
  select
    max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum
  from pg_attribute
  where attrelid = 'public.club_team_seasons'::regclass
    and not attisdropped
), membership_attributes as (
  select
    max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum
  from pg_attribute
  where attrelid = 'public.club_memberships'::regclass
    and not attisdropped
)
select
  (select count(*) from pg_constraint where conrelid = 'public.club_team_season_permissions'::regclass) = 4
    as exact_permission_constraint_count,
  exists (
    select 1 from pg_index index_row, relation_attributes
    where index_row.indexrelid = to_regclass('public.club_team_seasons_id_club_uidx')
      and index_row.indrelid = 'public.club_team_seasons'::regclass
      and index_row.indisunique
      and index_row.indisvalid and index_row.indisready
      and index_row.indnkeyatts = 2 and index_row.indnatts = 2
      and index_row.indpred is null and index_row.indexprs is null
      and index_row.indkey::text =
        relation_attributes.id_attnum::text || ' ' || relation_attributes.club_attnum::text
  ) as relation_id_club_unique_index_ok,
  exists (
    select 1 from pg_constraint, permission_attributes
    where conrelid = 'public.club_team_season_permissions'::regclass
      and contype = 'p' and convalidated and not condeferrable
      and conkey = array[permission_attributes.id_attnum]::smallint[]
  ) as primary_key_ok,
  exists (
    select 1 from pg_constraint, permission_attributes
    where conrelid = 'public.club_team_season_permissions'::regclass
      and contype = 'u' and convalidated and not condeferrable
      and conkey = array[permission_attributes.membership_attnum, permission_attributes.relation_attnum]::smallint[]
  ) as no_duplicate_assignment_ok,
  exists (
    select 1
    from pg_constraint, permission_attributes, relation_attributes
    where conrelid = 'public.club_team_season_permissions'::regclass
      and contype = 'f'
      and confrelid = 'public.club_team_seasons'::regclass
      and conkey = array[permission_attributes.relation_attnum, permission_attributes.club_attnum]::smallint[]
      and confkey = array[relation_attributes.id_attnum, relation_attributes.club_attnum]::smallint[]
      and confupdtype = 'a' and confdeltype = 'r'
      and convalidated and not condeferrable
  ) as relation_same_club_restrict_fk_ok,
  exists (
    select 1
    from pg_constraint, permission_attributes, membership_attributes
    where conrelid = 'public.club_team_season_permissions'::regclass
      and contype = 'f'
      and confrelid = 'public.club_memberships'::regclass
      and conkey = array[permission_attributes.membership_attnum, permission_attributes.club_attnum]::smallint[]
      and confkey = array[membership_attributes.id_attnum, membership_attributes.club_attnum]::smallint[]
      and confupdtype = 'a' and confdeltype = 'c'
      and convalidated and not condeferrable
  ) as membership_same_club_cascade_fk_ok;

-- 4. Index inventory and the explicit club/relation lookup index.
select
  index_row.indexrelid::regclass as index_name,
  index_row.indisunique,
  index_row.indisvalid,
  index_row.indisready,
  pg_get_indexdef(index_row.indexrelid) as definition
from pg_index index_row
where index_row.indrelid = 'public.club_team_season_permissions'::regclass
order by index_row.indexrelid::regclass::text;

with attributes as (
  select
    max(attnum) filter (where attname = 'club_id') as club_attnum,
    max(attnum) filter (where attname = 'club_team_season_id') as relation_attnum,
    max(attnum) filter (where attname = 'membership_id') as membership_attnum
  from pg_attribute
  where attrelid = 'public.club_team_season_permissions'::regclass
    and not attisdropped
)
select exists (
  select 1 from pg_index index_row, attributes
  where index_row.indexrelid = to_regclass('public.club_team_season_permissions_club_relation_idx')
    and index_row.indrelid = 'public.club_team_season_permissions'::regclass
    and index_row.indisvalid and index_row.indisready
    and not index_row.indisunique
    and index_row.indnkeyatts = 3 and index_row.indnatts = 3
    and index_row.indpred is null and index_row.indexprs is null
    and index_row.indkey::text =
      attributes.club_attnum::text || ' ' ||
      attributes.relation_attnum::text || ' ' ||
      attributes.membership_attnum::text
) as permission_lookup_index_ok;

-- 5. Integrity and current eligibility. All counts must be zero after the
-- migration and after any staff deactivation or role change.
select
  count(*) filter (
    where relation.id is null or membership.id is null
       or permission.club_id is distinct from relation.club_id
       or permission.club_id is distinct from membership.club_id
  ) as invalid_or_cross_club_assignments,
  count(*) filter (where membership.role = 'player') as player_rows,
  count(*) filter (where membership.role <> 'staff' or not membership.is_active)
    as ineligible_assignments_that_should_have_been_revoked
from public.club_team_season_permissions permission
left join public.club_team_seasons relation
  on relation.id = permission.club_team_season_id
 and relation.club_id = permission.club_id
left join public.club_memberships membership
  on membership.id = permission.membership_id
 and membership.club_id = permission.club_id;

select membership_id, club_team_season_id, count(*) as duplicate_count
from public.club_team_season_permissions
group by membership_id, club_team_season_id
having count(*) > 1;

-- 6. RLS inventory and normalized predicates.
select
  policy.polname,
  policy.polcmd::text as command,
  policy.polpermissive,
  array(
    select role_row.rolname from pg_roles role_row
    where role_row.oid = any(policy.polroles)
    order by role_row.rolname
  ) as roles,
  pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
  pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
from pg_policy policy
where policy.polrelid = 'public.club_team_season_permissions'::regclass
order by policy.polname;

with normalized as (
  select
    policy.polname,
    policy.polcmd,
    policy.polpermissive,
    policy.polroles,
    regexp_replace(replace(replace(replace(lower(pg_get_expr(policy.polqual, policy.polrelid)), 'public.', ''), '::text[]', ''), '::text', ''), '[[:space:]()]', '', 'g') as using_expr,
    regexp_replace(replace(lower(pg_get_expr(policy.polwithcheck, policy.polrelid)), 'public.', ''), '[[:space:]()]', '', 'g') as check_expr
  from pg_policy policy
  where policy.polrelid = 'public.club_team_season_permissions'::regclass
)
select
  (select count(*) from normalized) = 3 as exact_policy_count,
  exists (
    select 1 from normalized
    where polname = 'club_team_season_permissions_manager_select'
      and polcmd = 'r' and polpermissive
      and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
      and using_expr = 'has_club_roleclub_id,array[''owner'']' and check_expr is null
  ) as manager_select_ok,
  exists (
    select 1 from normalized
    where polname = 'club_team_season_permissions_manager_insert'
      and polcmd = 'a' and polpermissive
      and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
      and using_expr is null
      and check_expr = 'can_assign_club_team_season_permissionclub_id,membership_id'
  ) as manager_insert_without_self_grant_ok,
  exists (
    select 1 from normalized
    where polname = 'club_team_season_permissions_manager_delete'
      and polcmd = 'd' and polpermissive
      and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
      and using_expr = 'has_club_roleclub_id,array[''owner'']' and check_expr is null
  ) as manager_delete_ok,
  not exists (select 1 from normalized where polcmd in ('w', '*'))
    as no_update_or_all_policy;

-- Owner-only administrative contract (static catalog check, not a JWT/RLS
-- impersonation test). Both management policies must call the owner-only
-- helper; the grant helper and INSERT guard must do the same.
with owner_policies as (
  select count(*) = 2 as select_and_delete_owner_only
  from pg_policy policy
  where policy.polrelid = 'public.club_team_season_permissions'::regclass
    and policy.polname in (
      'club_team_season_permissions_manager_select',
      'club_team_season_permissions_manager_delete'
    )
    and regexp_replace(replace(replace(replace(lower(pg_get_expr(policy.polqual, policy.polrelid)), 'public.', ''), '::text[]', ''), '::text', ''), '[[:space:]()]', '', 'g') = 'has_club_roleclub_id,array[''owner'']'
), owner_functions as (
  select
    position('public.has_club_role(target_club_id, array[''owner'']::text[])' in lower(pg_get_functiondef('public.can_assign_club_team_season_permission(uuid,uuid)'::regprocedure))) > 0 as grant_owner_only,
    position('public.has_club_role(new.club_id, array[''owner'']::text[]) is not true' in lower(pg_get_functiondef('public.guard_club_team_season_permission_mutation()'::regprocedure))) > 0 as insertion_guard_owner_only,
    position('membership.is_active' in lower(pg_get_functiondef('public.has_club_role(uuid,text[])'::regprocedure))) > 0 as active_membership_required,
    position('membership.role = any(allowed_roles)' in lower(pg_get_functiondef('public.has_club_role(uuid,text[])'::regprocedure))) > 0 as role_list_enforced
)
select
  select_and_delete_owner_only and grant_owner_only
    and insertion_guard_owner_only and active_membership_required
    and role_list_enforced as active_owner_can_manage_assignments,
  select_and_delete_owner_only and grant_owner_only
    and insertion_guard_owner_only and active_membership_required
    and role_list_enforced as admin_cannot_manage_assignments
from owner_policies cross join owner_functions;

-- 7. Trigger and helper-function security. The read helper has no season-status
-- condition: a closed season remains readable, but the helper grants no edit.
select
  trigger_row.tgname,
  trigger_row.tgfoid::regprocedure as function_signature,
  trigger_row.tgenabled,
  trigger_row.tgtype,
  not trigger_row.tgisinternal as is_user_trigger
from pg_trigger trigger_row
where trigger_row.tgrelid = 'public.club_team_season_permissions'::regclass
order by trigger_row.tgname;

-- Expected: all true. The pre-existing membership guard must still run BEFORE
-- UPDATE, and the new trigger must run AFTER every membership UPDATE in the
-- same transaction. Its function deletes assignments only when STAFF becomes
-- inactive or leaves the STAFF role; reactivation does not insert anything.
select
  exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_memberships'::regclass
      and trigger_row.tgname = 'guard_club_membership_mutation'
      and trigger_row.tgfoid = 'public.guard_club_membership_mutation()'::regprocedure
      and trigger_row.tgenabled = 'O'
      and (trigger_row.tgtype & 2) = 2
      and (trigger_row.tgtype & 16) = 16
      and not trigger_row.tgisinternal
  ) as existing_before_update_guard_preserved,
  exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_memberships'::regclass
      and trigger_row.tgname = 'revoke_ineligible_club_team_season_permissions'
      and trigger_row.tgfoid = 'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 17
      and trigger_row.tgqual is null
      and trigger_row.tgattr::text = ''
      and not trigger_row.tgisinternal
  ) as after_every_update_revocation_trigger_ok,
  (select count(*) from pg_trigger trigger_row
   where trigger_row.tgrelid = 'public.club_memberships'::regclass
     and trigger_row.tgname = 'revoke_ineligible_club_team_season_permissions'
     and not trigger_row.tgisinternal) = 1
    as no_duplicate_revocation_trigger;

select
  position('old.role = ''staff''' in lower(pg_get_functiondef(
    'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
  ))) > 0 as revokes_only_prior_staff,
  position('new.role <> ''staff''' in lower(pg_get_functiondef(
    'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
  ))) > 0 as revokes_on_role_change,
  position('not new.is_active' in lower(pg_get_functiondef(
    'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
  ))) > 0 as revokes_on_deactivation,
  position('delete from public.club_team_season_permissions' in lower(pg_get_functiondef(
    'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
  ))) > 0 as deletes_assignments,
  position('permission.membership_id = old.id' in lower(pg_get_functiondef(
    'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
  ))) > 0 as limits_delete_to_membership,
  position('insert into' in lower(pg_get_functiondef(
    'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
  ))) = 0 as never_restores_assignments;

select
  routine.oid::regprocedure as function_signature,
  pg_get_userbyid(routine.proowner) as owner,
  routine.prosecdef as security_definer,
  routine.provolatile,
  routine.proconfig,
  has_function_privilege('authenticated', routine.oid, 'EXECUTE')
    as authenticated_can_execute,
  obj_description(routine.oid, 'pg_proc') as description
from pg_proc routine
where routine.oid in (
  'public.can_assign_club_team_season_permission(uuid,uuid)'::regprocedure,
  'public.can_read_club_team_season(uuid)'::regprocedure,
  'public.guard_club_team_season_permission_mutation()'::regprocedure,
  'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
)
order by routine.oid::regprocedure::text;

-- Expected: all true. The revocation function executes as postgres with a
-- fixed search path, while application roles cannot invoke it directly.
select
  exists (
    select 1 from pg_proc routine
    where routine.oid = 'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
      and routine.proowner = 'postgres'::regrole
      and routine.prosecdef
      and routine.provolatile = 'v'
      and routine.proconfig = array['search_path=pg_catalog']::text[]
  ) as revocation_function_security_ok,
  not has_function_privilege(
    'authenticated',
    'public.revoke_ineligible_club_team_season_permissions()',
    'EXECUTE'
  ) as clients_cannot_invoke_revocation_function,
  not has_function_privilege(
    'anon',
    'public.revoke_ineligible_club_team_season_permissions()',
    'EXECUTE'
  ) as anon_cannot_invoke_revocation_function;

-- Expected: all true. Assignment creation locks the target membership row,
-- so a concurrent deactivation cannot leave a permission behind.
select
  position('public.has_club_role(new.club_id, array[''owner'']::text[]) is not true' in lower(pg_get_functiondef(
    'public.guard_club_team_season_permission_mutation()'::regprocedure
  ))) > 0 as active_owner_checked_before_row_lock,
  position('for update' in lower(pg_get_functiondef(
    'public.guard_club_team_season_permission_mutation()'::regprocedure
  ))) > 0 as insertion_locks_membership_row,
  position('target.is_active' in lower(pg_get_functiondef(
    'public.guard_club_team_season_permission_mutation()'::regprocedure
  ))) > 0 as insertion_checks_active,
  position('target.role = ''staff''' in lower(pg_get_functiondef(
    'public.guard_club_team_season_permission_mutation()'::regprocedure
  ))) > 0 as insertion_checks_staff,
  position(') is not true' in lower(pg_get_functiondef(
    'public.guard_club_team_season_permission_mutation()'::regprocedure
  ))) > 0 as no_backend_identity_bypass;

select
  position('public.has_club_role(target_club_id, array[''owner'']::text[])' in lower(pg_get_functiondef(
    'public.can_assign_club_team_season_permission(uuid,uuid)'::regprocedure
  ))) > 0 as active_owner_only_assignment_check,
  position('target.role = ''staff''' in lower(pg_get_functiondef(
    'public.can_assign_club_team_season_permission(uuid,uuid)'::regprocedure
  ))) > 0 as grant_only_to_staff,
  position('target.user_id <> auth.uid()' in lower(pg_get_functiondef(
    'public.can_assign_club_team_season_permission(uuid,uuid)'::regprocedure
  ))) > 0 as self_grant_blocked;

select
  position('actor.role in (''owner'', ''admin'')' in lower(pg_get_functiondef(
    'public.can_read_club_team_season(uuid)'::regprocedure
  ))) > 0 as owner_admin_implicit_read_present,
  position('actor.role = ''staff''' in lower(pg_get_functiondef(
    'public.can_read_club_team_season(uuid)'::regprocedure
  ))) > 0 as explicit_staff_branch_present,
  position('permission.membership_id = actor.id' in lower(pg_get_functiondef(
    'public.can_read_club_team_season(uuid)'::regprocedure
  ))) > 0 as explicit_assignment_required,
  position('status' in lower(pg_get_functiondef(
    'public.can_read_club_team_season(uuid)'::regprocedure
  ))) = 0 as closed_season_not_excluded,
  position('player' in lower(pg_get_functiondef(
    'public.can_read_club_team_season(uuid)'::regprocedure
  ))) = 0 as player_not_granted;

-- 8. Table privileges and role attributes. authenticated is constrained by
-- owner-only RLS. Revoking direct grants from service_role restricts direct
-- access to this table; it does not remove BYPASSRLS or other administrative
-- paths (for example, authorized SECURITY DEFINER functions or SQL Editor).
select
  role_name,
  has_table_privilege(role_name, 'public.club_team_season_permissions', 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.club_team_season_permissions', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.club_team_season_permissions', 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.club_team_season_permissions', 'DELETE') as can_delete,
  has_table_privilege(role_name, 'public.club_team_season_permissions', 'TRUNCATE') as can_truncate,
  has_table_privilege(role_name, 'public.club_team_season_permissions', 'REFERENCES') as can_reference,
  has_table_privilege(role_name, 'public.club_team_season_permissions', 'TRIGGER') as can_trigger
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
order by role_name;

select rolname, rolbypassrls, rolsuper
from pg_roles
where rolname in ('authenticated', 'service_role')
order by rolname;

select
  pg_get_userbyid(relation.relowner) = 'postgres' as owner_is_postgres,
  relation.relrowsecurity as rls_enabled,
  not relation.relforcerowsecurity as rls_not_forced
from pg_class relation
where relation.oid = 'public.club_team_season_permissions'::regclass;

-- 9. Read-only non-regression inventory. Compare with an independently saved
-- pre-migration baseline if one is available.
with protected_tables(table_name) as (
  values
    ('clubs'::text),
    ('club_memberships'),
    ('club_member_permissions'),
    ('club_seasons'),
    ('club_teams'),
    ('club_team_seasons'),
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
    select count(*) from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = protected.table_name
  ), 0) as column_count,
  coalesce((
    select count(*) from pg_policy policy
    where policy.polrelid = to_regclass('public.' || protected.table_name)
  ), 0) as policy_count
from protected_tables protected
order by protected.table_name;

-- 10. Idempotence procedure: save the table/function/constraint inventories,
-- run Change 35 again, and confirm inventories and assignment rows are unchanged.
