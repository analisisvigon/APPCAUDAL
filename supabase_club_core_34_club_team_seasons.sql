-- APPCAUDAL - Club core (change 34)
-- Links the club's own teams to club seasons.
-- Additive, transactional and idempotent. Run manually in Supabase SQL Editor.

begin;

do $migration$
declare
  v_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  v_season_id constant uuid := 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae';
  v_team_id uuid;
  v_count bigint;
  v_columns_ok boolean;
  v_constraint_count integer;
  v_policy_count integer;
  v_existing_relation_oid oid;
begin
  if auth.uid() is not null then
    raise exception 'Change 34 must run without an application JWT identity';
  end if;

  -- Required source objects from Changes 1 and 2 must already exist.
  if to_regclass('public.clubs') is null
     or to_regclass('public.club_seasons') is null
     or to_regclass('public.club_teams') is null
     or to_regclass('public.equipos_rivales') is null then
    raise exception
      'Change 34 requires public.clubs, public.club_seasons, public.club_teams and public.equipos_rivales';
  end if;

  if to_regprocedure('public.can_edit_club_data(uuid)') is null
     or to_regprocedure('public.can_manage_club(uuid)') is null then
    raise exception
      'Change 34 requires public.can_edit_club_data(uuid) and public.can_manage_club(uuid)';
  end if;

  if not has_function_privilege(
       'authenticated', 'public.can_edit_club_data(uuid)', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.can_manage_club(uuid)', 'EXECUTE'
     ) then
    raise exception
      'The authenticated role cannot execute the required club authorization helpers';
  end if;

  -- The composite foreign keys rely on the exact unique keys introduced by
  -- Changes 1 and 2. Checking column identities avoids accepting a same-name
  -- but incompatible constraint.
  select count(*)
  into v_constraint_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_seasons'::regclass
    and constraint_row.contype = 'u'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and constraint_row.conkey = array[
      (select attnum from pg_attribute where attrelid = 'public.club_seasons'::regclass and attname = 'id' and not attisdropped),
      (select attnum from pg_attribute where attrelid = 'public.club_seasons'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[];

  if v_constraint_count <> 1 then
    raise exception
      'public.club_seasons must have one validated, non-deferrable UNIQUE (id, club_id) constraint';
  end if;

  select count(*)
  into v_constraint_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_teams'::regclass
    and constraint_row.contype = 'u'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and constraint_row.conkey = array[
      (select attnum from pg_attribute where attrelid = 'public.club_teams'::regclass and attname = 'id' and not attisdropped),
      (select attnum from pg_attribute where attrelid = 'public.club_teams'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[];

  if v_constraint_count <> 1 then
    raise exception
      'public.club_teams must have one validated, non-deferrable UNIQUE (id, club_id) constraint';
  end if;

  -- Identify the already-created canonical own-team row. team_kind remains a
  -- legacy bootstrap check only; it is not a permanent club_teams invariant.
  select count(*)
  into v_count
  from public.equipos_rivales legacy_team
  where legacy_team.team_kind = 'own';

  if v_count <> 1 then
    raise exception
      'Expected exactly one legacy team_kind=own row before Change 34; found %',
      v_count;
  end if;

  select count(*)
  into v_count
  from public.club_teams team
  join public.equipos_rivales legacy_team on legacy_team.id = team.id
  where team.club_id = v_club_id
    and team.code = 'caudal'
    and legacy_team.team_kind = 'own'
    and regexp_replace(
      lower(btrim(legacy_team.name::text)), '[^a-z0-9]+', '', 'g'
    ) in ('cdcaudal', 'caudaldeportivo', 'caudaldeportivodemieres');

  if v_count <> 1 then
    raise exception
      'Expected exactly one canonical C.D. Caudal club_team backed by the legacy own team for club %; found %',
      v_club_id,
      v_count;
  end if;

  select team.id
  into strict v_team_id
  from public.club_teams team
  join public.equipos_rivales legacy_team on legacy_team.id = team.id
  where team.club_id = v_club_id
    and team.code = 'caudal'
    and legacy_team.team_kind = 'own'
    and regexp_replace(
      lower(btrim(legacy_team.name::text)), '[^a-z0-9]+', '', 'g'
    ) in ('cdcaudal', 'caudaldeportivo', 'caudaldeportivodemieres');

  -- The known season must retain its existing identity and lifecycle state.
  select count(*)
  into v_count
  from public.club_seasons season
  where season.id = v_season_id
    and season.club_id = v_club_id
    and season.code = '2026'
    and season.label = '2026/2027'
    and season.starts_on = date '2026-07-01'
    and season.ends_on = date '2027-06-30'
    and season.is_active is true
    and season.status = 'open'
    and season.closed_at is null
    and season.closed_by_membership_id is null;

  if v_count <> 1 then
    raise exception
      'Season 2026/2027 does not match the expected club, identity, dates and active/open state';
  end if;

  v_existing_relation_oid := to_regclass('public.club_team_seasons')::oid;

  if v_existing_relation_oid is not null then
    if obj_description(v_existing_relation_oid, 'pg_class') is distinct from
       'APPCAUDAL canonical links between club teams and club seasons (change 34)' then
      raise exception
        'public.club_team_seasons already exists but is not identified as the Change 34 table';
    end if;
  end if;

  create table if not exists public.club_team_seasons (
    id uuid not null default gen_random_uuid(),
    club_id uuid not null,
    team_id uuid not null,
    season_id uuid not null,
    created_at timestamptz not null default now(),
    constraint club_team_seasons_pkey primary key (id),
    constraint club_team_seasons_team_season_key unique (team_id, season_id),
    constraint club_team_seasons_team_club_fkey
      foreign key (team_id, club_id)
      references public.club_teams (id, club_id)
      on update no action
      on delete restrict,
    constraint club_team_seasons_season_club_fkey
      foreign key (season_id, club_id)
      references public.club_seasons (id, club_id)
      on update no action
      on delete restrict
  );

  comment on table public.club_team_seasons is
    'APPCAUDAL canonical links between club teams and club seasons (change 34)';
  comment on column public.club_team_seasons.club_id is
    'Club repeated deliberately so composite foreign keys enforce same-club links.';
  comment on column public.club_team_seasons.team_id is
    'Canonical own team from public.club_teams.';
  comment on column public.club_team_seasons.season_id is
    'Club season from public.club_seasons; independent of is_active.';

  create index if not exists club_team_seasons_club_season_idx
    on public.club_team_seasons (club_id, season_id, team_id);

  alter table public.club_team_seasons enable row level security;

  if not exists (
    select 1
    from pg_policy policy
    where policy.polrelid = 'public.club_team_seasons'::regclass
      and policy.polname = 'club_team_seasons_staff_select'
  ) then
    create policy club_team_seasons_staff_select
      on public.club_team_seasons
      for select
      to authenticated
      using (public.can_edit_club_data(club_id));
  end if;

  alter policy club_team_seasons_staff_select
    on public.club_team_seasons
    to authenticated
    using (public.can_edit_club_data(club_id));

  if not exists (
    select 1
    from pg_policy policy
    where policy.polrelid = 'public.club_team_seasons'::regclass
      and policy.polname = 'club_team_seasons_manager_insert'
  ) then
    create policy club_team_seasons_manager_insert
      on public.club_team_seasons
      for insert
      to authenticated
      with check (public.can_manage_club(club_id));
  end if;

  alter policy club_team_seasons_manager_insert
    on public.club_team_seasons
    to authenticated
    with check (public.can_manage_club(club_id));

  alter table public.club_team_seasons owner to postgres;

  revoke all on table public.club_team_seasons from public;
  revoke all on table public.club_team_seasons from anon;
  revoke all on table public.club_team_seasons from authenticated;
  revoke all on table public.club_team_seasons from service_role;

  -- The relation has no mutable business fields: clients and service_role get
  -- no UPDATE privilege, so identity and linkage keys cannot be rewritten.
  grant select, insert on table public.club_team_seasons to authenticated;
  grant select, insert, delete on table public.club_team_seasons to service_role;

  insert into public.club_team_seasons (club_id, team_id, season_id)
  values (v_club_id, v_team_id, v_season_id)
  on conflict (team_id, season_id) do nothing;

  -- Validate the exact table shape. This turns an incompatible pre-existing or
  -- partially modified Change 34 object into a rollback instead of accepting it.
  select count(*) = 5
    and bool_and(
      (column_row.attname = 'id' and column_row.atttypid = 'uuid'::regtype and column_row.attnotnull
        and column_row.atthasdef
        and (select pg_get_expr(default_row.adbin, default_row.adrelid)
             from pg_attrdef default_row
             where default_row.adrelid = column_row.attrelid and default_row.adnum = column_row.attnum) = 'gen_random_uuid()')
      or (column_row.attname = 'club_id' and column_row.atttypid = 'uuid'::regtype and column_row.attnotnull and not column_row.atthasdef)
      or (column_row.attname = 'team_id' and column_row.atttypid = 'uuid'::regtype and column_row.attnotnull and not column_row.atthasdef)
      or (column_row.attname = 'season_id' and column_row.atttypid = 'uuid'::regtype and column_row.attnotnull and not column_row.atthasdef)
      or (column_row.attname = 'created_at' and column_row.atttypid = 'timestamptz'::regtype and column_row.attnotnull
        and column_row.atthasdef
        and (select pg_get_expr(default_row.adbin, default_row.adrelid)
             from pg_attrdef default_row
             where default_row.adrelid = column_row.attrelid and default_row.adnum = column_row.attnum) = 'now()')
    )
  into v_columns_ok
  from pg_attribute column_row
  where column_row.attrelid = 'public.club_team_seasons'::regclass
    and column_row.attnum > 0
    and not column_row.attisdropped;

  if v_columns_ok is not true then
    raise exception 'public.club_team_seasons has an incompatible column contract';
  end if;

  select count(*)
  into v_constraint_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_team_seasons'::regclass
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and (
      (
        constraint_row.contype = 'p'
        and constraint_row.conkey = array[
          (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'id' and not attisdropped)
        ]::smallint[]
      )
      or (
        constraint_row.contype = 'u'
        and constraint_row.conkey = array[
          (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'team_id' and not attisdropped),
          (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'season_id' and not attisdropped)
        ]::smallint[]
      )
      or (
        constraint_row.contype = 'f'
        and constraint_row.confrelid = 'public.club_teams'::regclass
        and constraint_row.conkey = array[
          (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'team_id' and not attisdropped),
          (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confkey = array[
          (select attnum from pg_attribute where attrelid = 'public.club_teams'::regclass and attname = 'id' and not attisdropped),
          (select attnum from pg_attribute where attrelid = 'public.club_teams'::regclass and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confupdtype = 'a'
        and constraint_row.confdeltype = 'r'
      )
      or (
        constraint_row.contype = 'f'
        and constraint_row.confrelid = 'public.club_seasons'::regclass
        and constraint_row.conkey = array[
          (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'season_id' and not attisdropped),
          (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confkey = array[
          (select attnum from pg_attribute where attrelid = 'public.club_seasons'::regclass and attname = 'id' and not attisdropped),
          (select attnum from pg_attribute where attrelid = 'public.club_seasons'::regclass and attname = 'club_id' and not attisdropped)
        ]::smallint[]
        and constraint_row.confupdtype = 'a'
        and constraint_row.confdeltype = 'r'
      )
    );

  if v_constraint_count <> 4
     or (select count(*) from pg_constraint where conrelid = 'public.club_team_seasons'::regclass) <> 4 then
    raise exception 'public.club_team_seasons does not have the exact expected PK, UNIQUE and composite FK contract';
  end if;

  if not exists (
    select 1
    from pg_index index_row
    where index_row.indexrelid = 'public.club_team_seasons_club_season_idx'::regclass
      and index_row.indrelid = 'public.club_team_seasons'::regclass
      and index_row.indisvalid
      and index_row.indisready
      and not index_row.indisunique
      and index_row.indnkeyatts = 3
      and index_row.indnatts = 3
      and index_row.indpred is null
      and index_row.indexprs is null
      and index_row.indkey::text = (
        (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'club_id' and not attisdropped)::text
        || ' ' ||
        (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'season_id' and not attisdropped)::text
        || ' ' ||
        (select attnum from pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'team_id' and not attisdropped)::text
      )
  ) then
    raise exception 'club_team_seasons_club_season_idx is missing or incompatible';
  end if;

  select count(*)
  into v_policy_count
  from pg_policy policy
  where policy.polrelid = 'public.club_team_seasons'::regclass
    and policy.polpermissive
    and policy.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]
    and (
      (
        policy.polname = 'club_team_seasons_staff_select'
        and policy.polcmd = 'r'
        and policy.polwithcheck is null
        and regexp_replace(replace(
          lower(pg_get_expr(policy.polqual, policy.polrelid)), 'public.', ''
        ), '[[:space:]()]', '', 'g') = 'can_edit_club_dataclub_id'
      )
      or (
        policy.polname = 'club_team_seasons_manager_insert'
        and policy.polcmd = 'a'
        and policy.polqual is null
        and regexp_replace(replace(
          lower(pg_get_expr(policy.polwithcheck, policy.polrelid)), 'public.', ''
        ), '[[:space:]()]', '', 'g') = 'can_manage_clubclub_id'
      )
    );

  if v_policy_count <> 2
     or (select count(*) from pg_policy where polrelid = 'public.club_team_seasons'::regclass) <> 2 then
    raise exception 'public.club_team_seasons does not have the exact expected SELECT and INSERT RLS policies';
  end if;

  if not (
    select relowner = 'postgres'::regrole
       and relrowsecurity
       and not relforcerowsecurity
    from pg_class
    where oid = 'public.club_team_seasons'::regclass
  ) then
    raise exception 'Owner or RLS state is incompatible on public.club_team_seasons';
  end if;

  if has_table_privilege('anon', 'public.club_team_seasons', 'SELECT')
     or has_table_privilege('anon', 'public.club_team_seasons', 'INSERT')
     or has_table_privilege('anon', 'public.club_team_seasons', 'UPDATE')
     or has_table_privilege('anon', 'public.club_team_seasons', 'DELETE')
     or has_table_privilege('anon', 'public.club_team_seasons', 'TRUNCATE')
     or has_table_privilege('anon', 'public.club_team_seasons', 'REFERENCES')
     or has_table_privilege('anon', 'public.club_team_seasons', 'TRIGGER')
     or not has_table_privilege('authenticated', 'public.club_team_seasons', 'SELECT')
     or not has_table_privilege('authenticated', 'public.club_team_seasons', 'INSERT')
     or has_table_privilege('authenticated', 'public.club_team_seasons', 'UPDATE')
     or has_table_privilege('authenticated', 'public.club_team_seasons', 'DELETE')
     or has_table_privilege('authenticated', 'public.club_team_seasons', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.club_team_seasons', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.club_team_seasons', 'TRIGGER')
     or not has_table_privilege('service_role', 'public.club_team_seasons', 'SELECT')
     or not has_table_privilege('service_role', 'public.club_team_seasons', 'INSERT')
     or has_table_privilege('service_role', 'public.club_team_seasons', 'UPDATE')
     or not has_table_privilege('service_role', 'public.club_team_seasons', 'DELETE')
     or has_table_privilege('service_role', 'public.club_team_seasons', 'TRUNCATE')
     or has_table_privilege('service_role', 'public.club_team_seasons', 'REFERENCES')
     or has_table_privilege('service_role', 'public.club_team_seasons', 'TRIGGER') then
    raise exception 'public.club_team_seasons client privileges are incompatible with Change 34';
  end if;

  select count(*)
  into v_count
  from public.club_team_seasons relation
  where relation.club_id = v_club_id
    and relation.team_id = v_team_id
    and relation.season_id = v_season_id;

  if v_count <> 1 then
    raise exception 'Expected exactly one C.D. Caudal to 2026/2027 relationship; found %', v_count;
  end if;

  if exists (
    select 1
    from public.club_team_seasons relation
    join public.club_teams team on team.id = relation.team_id
    join public.club_seasons season on season.id = relation.season_id
    where relation.club_id is distinct from team.club_id
       or relation.club_id is distinct from season.club_id
  ) then
    raise exception 'Cross-club data exists in public.club_team_seasons';
  end if;
end
$migration$;

commit;

