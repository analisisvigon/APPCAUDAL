-- APPCAUDAL - Club core (change 35)
-- Explicit STAFF permissions for a concrete own-team/season relationship.
-- Additive, transactional and idempotent. Run manually in Supabase SQL Editor.

begin;

do $preconditions$
declare
  v_existing_table_oid oid;
  v_existing_function_oid oid;
  v_constraint_count integer;
begin
  if auth.uid() is not null then
    raise exception 'Change 35 must run without an application JWT identity';
  end if;

  if to_regclass('public.clubs') is null
     or to_regclass('public.club_memberships') is null
     or to_regclass('public.club_team_seasons') is null then
    raise exception
      'Change 35 requires public.clubs, public.club_memberships and public.club_team_seasons';
  end if;

  if to_regprocedure('public.has_club_role(uuid,text[])') is null then
    raise exception
      'Change 35 requires public.has_club_role(uuid,text[])';
  end if;

  if not has_function_privilege(
       'authenticated', 'public.has_club_role(uuid,text[])', 'EXECUTE'
     ) then
    raise exception 'authenticated cannot execute the required club authorization helpers';
  end if;

  -- Change 1 must provide the same-club membership target for a composite FK.
  select count(*)
  into v_constraint_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_memberships'::regclass
    and constraint_row.contype = 'u'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and constraint_row.conkey = array[
      (select attnum from pg_attribute where attrelid = 'public.club_memberships'::regclass and attname = 'id' and not attisdropped),
      (select attnum from pg_attribute where attrelid = 'public.club_memberships'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[];

  if v_constraint_count <> 1 then
    raise exception
      'public.club_memberships must have one validated, non-deferrable UNIQUE (id, club_id) constraint';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_memberships'::regclass
      and trigger_row.tgname = 'guard_club_membership_mutation'
      and trigger_row.tgfoid = to_regprocedure(
        'public.guard_club_membership_mutation()'
      )
      and trigger_row.tgenabled = 'O'
      and (trigger_row.tgtype & 2) = 2
      and (trigger_row.tgtype & 16) = 16
      and not trigger_row.tgisinternal
  ) then
    raise exception 'The existing club_memberships BEFORE UPDATE guard must remain active';
  end if;

  -- Verify the Change 3 identity and club columns before adding its composite
  -- lookup key. The existing team/season link and its data are not modified.
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.club_team_seasons'::regclass
      and attname = 'id' and atttypid = 'uuid'::regtype
      and attnotnull and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.club_team_seasons'::regclass
      and attname = 'club_id' and atttypid = 'uuid'::regtype
      and attnotnull and not attisdropped
  ) then
    raise exception 'public.club_team_seasons identity columns are incompatible';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_team_seasons'::regclass
      and constraint_row.contype = 'p'
      and constraint_row.convalidated
      and not constraint_row.condeferrable
      and constraint_row.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'id' and not attisdropped)
      ]::smallint[]
  ) then
    raise exception 'public.club_team_seasons.id must remain its validated primary key';
  end if;

  v_existing_table_oid := to_regclass('public.club_team_season_permissions')::oid;
  if v_existing_table_oid is not null then
    if obj_description(v_existing_table_oid, 'pg_class') is distinct from
       'APPCAUDAL explicit STAFF access to a club team-season (change 35)' then
      raise exception
        'public.club_team_season_permissions exists without the Change 35 contract';
    end if;
  end if;

  v_existing_function_oid := to_regprocedure(
    'public.can_assign_club_team_season_permission(uuid,uuid)'
  )::oid;
  if v_existing_function_oid is not null then
    if obj_description(v_existing_function_oid, 'pg_proc') is distinct from
       'APPCAUDAL Change 35 RLS helper for assigning explicit STAFF access.' then
      raise exception
        'can_assign_club_team_season_permission(uuid,uuid) exists without the Change 35 contract';
    end if;
  end if;

  v_existing_function_oid := to_regprocedure(
    'public.can_read_club_team_season(uuid)'
  )::oid;
  if v_existing_function_oid is not null then
    if obj_description(v_existing_function_oid, 'pg_proc') is distinct from
       'APPCAUDAL Change 35 read-only team-season authorization helper.' then
      raise exception
        'can_read_club_team_season(uuid) exists without the Change 35 contract';
    end if;
  end if;

  v_existing_function_oid := to_regprocedure(
    'public.guard_club_team_season_permission_mutation()'
  )::oid;
  if v_existing_function_oid is not null then
    if obj_description(v_existing_function_oid, 'pg_proc') is distinct from
       'APPCAUDAL Change 35 guard: STAFF-only assignments and immutable keys.' then
      raise exception
        'guard_club_team_season_permission_mutation() exists without the Change 35 contract';
    end if;
  end if;

  v_existing_function_oid := to_regprocedure(
    'public.revoke_ineligible_club_team_season_permissions()'
  )::oid;
  if v_existing_function_oid is not null then
    if obj_description(v_existing_function_oid, 'pg_proc') is distinct from
       'APPCAUDAL Change 35: revoke team-season assignments when STAFF loses eligibility.' then
      raise exception
        'revoke_ineligible_club_team_season_permissions() exists without the Change 35 contract';
    end if;
  end if;
end
$preconditions$;

-- Required by the composite permission FK. This is deliberately a unique
-- index, not a fifth constraint: Change 3 validates that its table retains
-- exactly its original four constraints when that migration is rerun.
create unique index if not exists club_team_seasons_id_club_uidx
  on public.club_team_seasons (id, club_id);

do $team_season_composite_key$
begin
  if not exists (
    select 1
    from pg_index index_row
    where index_row.indexrelid = to_regclass('public.club_team_seasons_id_club_uidx')
      and index_row.indrelid = 'public.club_team_seasons'::regclass
      and index_row.indisunique
      and index_row.indisvalid and index_row.indisready
      and index_row.indnkeyatts = 2 and index_row.indnatts = 2
      and index_row.indpred is null and index_row.indexprs is null
      and index_row.indkey::text = (
        (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'id' and not attisdropped)::text
        || ' ' ||
        (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'club_id' and not attisdropped)::text
      )
  ) then
    raise exception 'club_team_seasons_id_club_uidx is missing or incompatible';
  end if;
end
$team_season_composite_key$;

create table if not exists public.club_team_season_permissions (
  id uuid not null default gen_random_uuid(),
  club_id uuid not null,
  club_team_season_id uuid not null,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  constraint club_team_season_permissions_pkey primary key (id),
  constraint club_team_season_permissions_membership_relation_key
    unique (membership_id, club_team_season_id),
  constraint club_team_season_permissions_relation_club_fkey
    foreign key (club_team_season_id, club_id)
    references public.club_team_seasons (id, club_id)
    on update no action
    on delete restrict,
  constraint club_team_season_permissions_membership_club_fkey
    foreign key (membership_id, club_id)
    references public.club_memberships (id, club_id)
    on update no action
    on delete cascade
);

comment on table public.club_team_season_permissions is
  'APPCAUDAL explicit STAFF access to a club team-season (change 35)';
comment on column public.club_team_season_permissions.club_id is
  'Repeated club identity used by both composite foreign keys.';
comment on column public.club_team_season_permissions.club_team_season_id is
  'Own-team/season relationship whose historical data may be read.';
comment on column public.club_team_season_permissions.membership_id is
  'Active STAFF membership receiving explicit read access.';

create index if not exists club_team_season_permissions_club_relation_idx
  on public.club_team_season_permissions
  (club_id, club_team_season_id, membership_id);

create or replace function public.can_assign_club_team_season_permission(
  target_club_id uuid,
  target_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    auth.uid() is not null
    and public.has_club_role(target_club_id, array['owner']::text[])
    and exists (
      select 1
      from public.club_memberships target
      where target.id = target_membership_id
        and target.club_id = target_club_id
        and target.is_active
        and target.role = 'staff'
        and target.user_id <> auth.uid()
    );
$function$;

comment on function public.can_assign_club_team_season_permission(uuid, uuid) is
  'APPCAUDAL Change 35 RLS helper for assigning explicit STAFF access.';

create or replace function public.can_read_club_team_season(
  target_club_team_season_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    auth.uid() is not null
    and target_club_team_season_id is not null
    and exists (
      select 1
      from public.club_team_seasons relation
      join public.club_memberships actor
        on actor.club_id = relation.club_id
       and actor.user_id = auth.uid()
       and actor.is_active
      where relation.id = target_club_team_season_id
        and (
          actor.role in ('owner', 'admin')
          or (
            actor.role = 'staff'
            and exists (
              select 1
              from public.club_team_season_permissions permission
              where permission.club_id = relation.club_id
                and permission.club_team_season_id = relation.id
                and permission.membership_id = actor.id
            )
          )
        )
    );
$function$;

comment on function public.can_read_club_team_season(uuid) is
  'APPCAUDAL Change 35 read-only team-season authorization helper.';

create or replace function public.guard_club_team_season_permission_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'A team-season permission identity cannot be updated'
      using errcode = '23514';
  end if;

  if public.has_club_role(new.club_id, array['owner']::text[]) is not true then
    raise exception 'Not authorized to assign this team-season permission'
      using errcode = '42501';
  end if;

  -- Lock only the target membership. A concurrent role/is_active UPDATE
  -- either waits and revokes this INSERT, or finishes first and makes this
  -- INSERT fail. The membership guard retains its own existing club lock.
  perform 1
  from public.club_memberships target
  where target.id = new.membership_id
    and target.club_id = new.club_id
    and target.is_active
    and target.role = 'staff'
  for update;

  if not found then
    raise exception 'Team-season permissions can only be assigned to active STAFF memberships'
      using errcode = '23514';
  end if;

  if public.can_assign_club_team_season_permission(
       new.club_id,
       new.membership_id
     ) is not true then
    raise exception 'Not authorized to assign this team-season permission'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

comment on function public.guard_club_team_season_permission_mutation() is
  'APPCAUDAL Change 35 guard: STAFF-only assignments and immutable keys.';

-- Runs after the existing BEFORE UPDATE membership guard has accepted the
-- change. The DELETE uses the function owner's privileges and is atomic with
-- the membership UPDATE, regardless of whether it came from the API or a
-- trusted administrative process. Reactivation performs no INSERT.
create or replace function public.revoke_ineligible_club_team_season_permissions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if old.role = 'staff'
     and (new.role <> 'staff' or not new.is_active) then
    delete from public.club_team_season_permissions permission
    where permission.membership_id = old.id
      and permission.club_id = old.club_id;
  end if;

  return new;
end;
$function$;

comment on function public.revoke_ineligible_club_team_season_permissions() is
  'APPCAUDAL Change 35: revoke team-season assignments when STAFF loses eligibility.';

alter function public.can_assign_club_team_season_permission(uuid, uuid) owner to postgres;
alter function public.can_read_club_team_season(uuid) owner to postgres;
alter function public.guard_club_team_season_permission_mutation() owner to postgres;
alter function public.revoke_ineligible_club_team_season_permissions() owner to postgres;

revoke all on function public.can_assign_club_team_season_permission(uuid, uuid)
  from public, anon;
revoke all on function public.can_read_club_team_season(uuid)
  from public, anon;
revoke all on function public.guard_club_team_season_permission_mutation()
  from public, anon, authenticated;
revoke all on function public.revoke_ineligible_club_team_season_permissions()
  from public, anon, authenticated;

grant execute on function public.can_assign_club_team_season_permission(uuid, uuid)
  to authenticated;
grant execute on function public.can_read_club_team_season(uuid)
  to authenticated;

do $trigger$
begin
  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_team_season_permissions'::regclass
      and trigger_row.tgname = 'guard_club_team_season_permission_mutation'
      and not trigger_row.tgisinternal
  ) then
    create trigger guard_club_team_season_permission_mutation
      before insert or update on public.club_team_season_permissions
      for each row
      execute function public.guard_club_team_season_permission_mutation();
  end if;
end
$trigger$;

do $membership_revocation_trigger$
begin
  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_memberships'::regclass
      and trigger_row.tgname = 'revoke_ineligible_club_team_season_permissions'
      and not trigger_row.tgisinternal
  ) then
    create trigger revoke_ineligible_club_team_season_permissions
      after update on public.club_memberships
      for each row
      execute function public.revoke_ineligible_club_team_season_permissions();
  end if;
end
$membership_revocation_trigger$;

alter table public.club_team_season_permissions owner to postgres;
alter table public.club_team_season_permissions enable row level security;

do $policies$
begin
  if not exists (
    select 1 from pg_policy policy
    where policy.polrelid = 'public.club_team_season_permissions'::regclass
      and policy.polname = 'club_team_season_permissions_manager_select'
  ) then
    create policy club_team_season_permissions_manager_select
      on public.club_team_season_permissions
      for select to authenticated
      using (public.has_club_role(club_id, array['owner']::text[]));
  end if;

  if not exists (
    select 1 from pg_policy policy
    where policy.polrelid = 'public.club_team_season_permissions'::regclass
      and policy.polname = 'club_team_season_permissions_manager_insert'
  ) then
    create policy club_team_season_permissions_manager_insert
      on public.club_team_season_permissions
      for insert to authenticated
      with check (
        public.can_assign_club_team_season_permission(club_id, membership_id)
      );
  end if;

  if not exists (
    select 1 from pg_policy policy
    where policy.polrelid = 'public.club_team_season_permissions'::regclass
      and policy.polname = 'club_team_season_permissions_manager_delete'
  ) then
    create policy club_team_season_permissions_manager_delete
      on public.club_team_season_permissions
      for delete to authenticated
      using (public.has_club_role(club_id, array['owner']::text[]));
  end if;
end
$policies$;

-- Repeated executions restore the intended predicates without changing the
-- policy commands. A wrong pre-existing command is rejected below.
alter policy club_team_season_permissions_manager_select
  on public.club_team_season_permissions
  to authenticated
  using (public.has_club_role(club_id, array['owner']::text[]));

alter policy club_team_season_permissions_manager_insert
  on public.club_team_season_permissions
  to authenticated
  with check (
    public.can_assign_club_team_season_permission(club_id, membership_id)
  );

alter policy club_team_season_permissions_manager_delete
  on public.club_team_season_permissions
  to authenticated
  using (public.has_club_role(club_id, array['owner']::text[]));

revoke all on table public.club_team_season_permissions
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.club_team_season_permissions
  to authenticated;

do $postconditions$
declare
  v_columns_ok boolean;
  v_constraint_count integer;
  v_policy_count integer;
begin
  select count(*) = 5
    and bool_and(
      (attribute.attname = 'id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull
       and attribute.atthasdef
       and (select pg_get_expr(default_row.adbin, default_row.adrelid)
            from pg_attrdef default_row
            where default_row.adrelid = attribute.attrelid and default_row.adnum = attribute.attnum) = 'gen_random_uuid()')
      or (attribute.attname = 'club_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull and not attribute.atthasdef)
      or (attribute.attname = 'club_team_season_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull and not attribute.atthasdef)
      or (attribute.attname = 'membership_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull and not attribute.atthasdef)
      or (attribute.attname = 'created_at' and attribute.atttypid = 'timestamptz'::regtype and attribute.attnotnull
       and attribute.atthasdef
       and (select pg_get_expr(default_row.adbin, default_row.adrelid)
            from pg_attrdef default_row
            where default_row.adrelid = attribute.attrelid and default_row.adnum = attribute.attnum) = 'now()')
    )
  into v_columns_ok
  from pg_attribute attribute
  where attribute.attrelid = 'public.club_team_season_permissions'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if v_columns_ok is not true then
    raise exception 'club_team_season_permissions has an incompatible column contract';
  end if;

  select count(*)
  into v_constraint_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_team_season_permissions'::regclass
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and (
      (constraint_row.contype = 'p' and constraint_row.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'id' and not attisdropped)
      ]::smallint[])
      or
      (constraint_row.contype = 'u' and constraint_row.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'membership_id' and not attisdropped),
        (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_team_season_id' and not attisdropped)
      ]::smallint[])
      or
      (constraint_row.contype = 'f'
       and constraint_row.confrelid = 'public.club_team_seasons'::regclass
       and constraint_row.conkey = array[
         (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_team_season_id' and not attisdropped),
         (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_id' and not attisdropped)
       ]::smallint[]
       and constraint_row.confkey = array[
         (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'id' and not attisdropped),
         (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'club_id' and not attisdropped)
       ]::smallint[]
       and constraint_row.confupdtype = 'a' and constraint_row.confdeltype = 'r')
      or
      (constraint_row.contype = 'f'
       and constraint_row.confrelid = 'public.club_memberships'::regclass
       and constraint_row.conkey = array[
         (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'membership_id' and not attisdropped),
         (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_id' and not attisdropped)
       ]::smallint[]
       and constraint_row.confkey = array[
         (select attnum from pg_attribute where attrelid = 'public.club_memberships'::regclass and attname = 'id' and not attisdropped),
         (select attnum from pg_attribute where attrelid = 'public.club_memberships'::regclass and attname = 'club_id' and not attisdropped)
       ]::smallint[]
       and constraint_row.confupdtype = 'a' and constraint_row.confdeltype = 'c')
    );

  if v_constraint_count <> 4
     or (select count(*) from pg_constraint where conrelid = 'public.club_team_season_permissions'::regclass) <> 4 then
    raise exception 'club_team_season_permissions constraints are incompatible';
  end if;

  if not exists (
    select 1
    from pg_index index_row
    where index_row.indexrelid = to_regclass(
      'public.club_team_season_permissions_club_relation_idx'
    )
      and index_row.indrelid = 'public.club_team_season_permissions'::regclass
      and index_row.indisvalid and index_row.indisready
      and not index_row.indisunique
      and index_row.indnkeyatts = 3 and index_row.indnatts = 3
      and index_row.indpred is null and index_row.indexprs is null
      and index_row.indkey::text = (
        (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_id' and not attisdropped)::text
        || ' ' ||
        (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_team_season_id' and not attisdropped)::text
        || ' ' ||
        (select attnum from pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'membership_id' and not attisdropped)::text
      )
  ) then
    raise exception 'club_team_season_permissions lookup index is missing or incompatible';
  end if;

  if not exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_team_season_permissions'::regclass
      and trigger_row.tgname = 'guard_club_team_season_permission_mutation'
      and trigger_row.tgfoid = 'public.guard_club_team_season_permission_mutation()'::regprocedure
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 23
      and not trigger_row.tgisinternal
  ) then
    raise exception 'club_team_season_permissions mutation guard is missing or incompatible';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_memberships'::regclass
      and trigger_row.tgname = 'revoke_ineligible_club_team_season_permissions'
      and trigger_row.tgfoid = 'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 17
      and trigger_row.tgqual is null
      and trigger_row.tgattr::text = ''
      and not trigger_row.tgisinternal
  ) then
    raise exception 'club_memberships revocation trigger is missing or incompatible';
  end if;

  select count(*) into v_policy_count
  from pg_policy policy
  where policy.polrelid = 'public.club_team_season_permissions'::regclass
    and policy.polpermissive
    and policy.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
    and (
      (policy.polname = 'club_team_season_permissions_manager_select' and policy.polcmd = 'r'
       and policy.polwithcheck is null
       and regexp_replace(replace(replace(replace(lower(pg_get_expr(policy.polqual, policy.polrelid)), 'public.', ''), '::text[]', ''), '::text', ''), '[[:space:]()]', '', 'g') = 'has_club_roleclub_id,array[''owner'']')
      or
      (policy.polname = 'club_team_season_permissions_manager_insert' and policy.polcmd = 'a'
       and policy.polqual is null
       and regexp_replace(replace(lower(pg_get_expr(policy.polwithcheck, policy.polrelid)), 'public.', ''), '[[:space:]()]', '', 'g') = 'can_assign_club_team_season_permissionclub_id,membership_id')
      or
      (policy.polname = 'club_team_season_permissions_manager_delete' and policy.polcmd = 'd'
       and policy.polwithcheck is null
       and regexp_replace(replace(replace(replace(lower(pg_get_expr(policy.polqual, policy.polrelid)), 'public.', ''), '::text[]', ''), '::text', ''), '[[:space:]()]', '', 'g') = 'has_club_roleclub_id,array[''owner'']')
    );

  if v_policy_count <> 3
     or (select count(*) from pg_policy where polrelid = 'public.club_team_season_permissions'::regclass) <> 3 then
    raise exception 'club_team_season_permissions RLS policies are incompatible';
  end if;

  if not exists (
    select 1 from pg_class relation
    where relation.oid = 'public.club_team_season_permissions'::regclass
      and relation.relowner = 'postgres'::regrole
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
  ) then
    raise exception 'club_team_season_permissions owner or RLS state is incompatible';
  end if;

  if has_table_privilege('anon', 'public.club_team_season_permissions', 'SELECT')
     or has_table_privilege('anon', 'public.club_team_season_permissions', 'INSERT')
     or has_table_privilege('anon', 'public.club_team_season_permissions', 'UPDATE')
     or has_table_privilege('anon', 'public.club_team_season_permissions', 'DELETE')
     or has_table_privilege('anon', 'public.club_team_season_permissions', 'TRUNCATE')
     or has_table_privilege('anon', 'public.club_team_season_permissions', 'REFERENCES')
     or has_table_privilege('anon', 'public.club_team_season_permissions', 'TRIGGER')
     or not has_table_privilege('authenticated', 'public.club_team_season_permissions', 'SELECT')
     or not has_table_privilege('authenticated', 'public.club_team_season_permissions', 'INSERT')
     or has_table_privilege('authenticated', 'public.club_team_season_permissions', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.club_team_season_permissions', 'DELETE')
     or has_table_privilege('authenticated', 'public.club_team_season_permissions', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.club_team_season_permissions', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.club_team_season_permissions', 'TRIGGER')
     or has_table_privilege('service_role', 'public.club_team_season_permissions', 'SELECT')
     or has_table_privilege('service_role', 'public.club_team_season_permissions', 'INSERT')
     or has_table_privilege('service_role', 'public.club_team_season_permissions', 'UPDATE')
     or has_table_privilege('service_role', 'public.club_team_season_permissions', 'DELETE')
     or has_table_privilege('service_role', 'public.club_team_season_permissions', 'TRUNCATE')
     or has_table_privilege('service_role', 'public.club_team_season_permissions', 'REFERENCES')
     or has_table_privilege('service_role', 'public.club_team_season_permissions', 'TRIGGER') then
    raise exception 'club_team_season_permissions privileges are incompatible';
  end if;

  if not has_function_privilege(
       'authenticated', 'public.can_assign_club_team_season_permission(uuid,uuid)', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.can_read_club_team_season(uuid)', 'EXECUTE'
     )
     or has_function_privilege(
       'authenticated', 'public.guard_club_team_season_permission_mutation()', 'EXECUTE'
     )
     or has_function_privilege(
       'authenticated', 'public.revoke_ineligible_club_team_season_permissions()', 'EXECUTE'
     ) then
    raise exception 'Change 35 function privileges are incompatible';
  end if;

  if not exists (
    select 1 from pg_proc routine
    where routine.oid = 'public.can_assign_club_team_season_permission(uuid,uuid)'::regprocedure
      and routine.proowner = 'postgres'::regrole
      and routine.prosecdef and routine.provolatile = 's'
      and routine.proconfig = array['search_path=pg_catalog']::text[]
  ) or not exists (
    select 1 from pg_proc routine
    where routine.oid = 'public.can_read_club_team_season(uuid)'::regprocedure
      and routine.proowner = 'postgres'::regrole
      and routine.prosecdef and routine.provolatile = 's'
      and routine.proconfig = array['search_path=pg_catalog']::text[]
  ) or not exists (
    select 1 from pg_proc routine
    where routine.oid = 'public.guard_club_team_season_permission_mutation()'::regprocedure
      and routine.proowner = 'postgres'::regrole
      and routine.prosecdef and routine.provolatile = 'v'
      and routine.proconfig = array['search_path=pg_catalog']::text[]
  ) or not exists (
    select 1 from pg_proc routine
    where routine.oid = 'public.revoke_ineligible_club_team_season_permissions()'::regprocedure
      and routine.proowner = 'postgres'::regrole
      and routine.prosecdef and routine.provolatile = 'v'
      and routine.proconfig = array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'Change 35 function security attributes are incompatible';
  end if;

  if exists (
    select 1
    from public.club_team_season_permissions permission
    join public.club_memberships membership
      on membership.id = permission.membership_id
     and membership.club_id = permission.club_id
    where membership.role <> 'staff' or not membership.is_active
  ) then
    raise exception 'Ineligible membership retains team-season assignments';
  end if;
end
$postconditions$;

commit;

