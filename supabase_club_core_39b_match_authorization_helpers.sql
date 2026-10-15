-- APPCAUDAL - Club core (change 39B)
-- Authorization helpers for canonical own-team seasons and matches.
-- Additive, transactional and idempotent. Run manually in Supabase SQL Editor.
-- This migration creates functions only; it does not alter tables, data or RLS.

begin;

do $preconditions$
declare
  v_count integer;
  v_function_oid oid;
  v_function_name text;
  v_expected_comment text;
  v_rls_fingerprint text;
begin
  if auth.uid() is not null then
    raise exception 'Change 39B must run without an application JWT identity';
  end if;

  if pg_catalog.current_setting('server_version_num')::integer < 170000 then
    raise exception 'Change 39B requires PostgreSQL 17 or newer';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'postgres'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'anon'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'service_role'
  ) then
    raise exception 'Change 39B requires the standard Supabase database roles';
  end if;

  if pg_catalog.to_regclass('public.club_seasons') is null
     or pg_catalog.to_regclass('public.club_teams') is null
     or pg_catalog.to_regclass('public.club_team_seasons') is null
     or pg_catalog.to_regclass('public.club_team_season_permissions') is null
     or pg_catalog.to_regclass('public.club_memberships') is null
     or pg_catalog.to_regclass('public.partidos') is null then
    raise exception 'Change 39B is missing a required Change 32-37 relation';
  end if;

  -- Exact columns consumed by the new helpers.
  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_attribute attribute
  where (
      attribute.attrelid = 'public.club_seasons'::regclass
      and (
        (attribute.attname = 'id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
        or (attribute.attname = 'club_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
        or (attribute.attname = 'status' and attribute.atttypid = 'text'::regtype and attribute.attnotnull)
      )
    )
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if v_count <> 3 then
    raise exception 'public.club_seasons does not expose the required id, club_id and status contract';
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_team_seasons'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
    and (
      (attribute.attname = 'id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
      or (attribute.attname = 'club_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
      or (attribute.attname = 'team_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
      or (attribute.attname = 'season_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
    );

  if v_count <> 4 then
    raise exception 'public.club_team_seasons does not expose its canonical uuid identity contract';
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.partidos'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
    and (
      (attribute.attname = 'id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
      or (
        attribute.attname = 'club_team_season_id'
        and attribute.atttypid = 'uuid'::regtype
        and not attribute.attnotnull
      )
    );

  if v_count <> 2 then
    raise exception 'public.partidos does not expose the expected id and nullable club_team_season_id contract';
  end if;

  -- A validated same-club season link makes status authoritative for the
  -- canonical team-season and prevents a cross-club composition.
  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_team_seasons'::regclass
    and constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.club_seasons'::regclass
    and constraint_row.conkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'season_id' and not attisdropped),
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_seasons'::regclass and attname = 'id' and not attisdropped),
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_seasons'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  if v_count <> 1 then
    raise exception 'club_team_seasons lacks its validated season/club ON DELETE RESTRICT foreign key';
  end if;

  -- The team side of the canonical relationship must also be same-club.
  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_team_seasons'::regclass
    and constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.club_teams'::regclass
    and constraint_row.conkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'team_id' and not attisdropped),
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_teams'::regclass and attname = 'id' and not attisdropped),
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_teams'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  if v_count <> 1 then
    raise exception 'club_team_seasons lacks its validated team/club ON DELETE RESTRICT foreign key';
  end if;

  -- Match scope must resolve through the validated Change 37 relationship.
  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.partidos'::regclass
    and constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.club_team_seasons'::regclass
    and constraint_row.conkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.partidos'::regclass and attname = 'club_team_season_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  if v_count <> 1 then
    raise exception 'partidos lacks its validated club_team_season_id ON DELETE RESTRICT foreign key';
  end if;

  -- Change 35 assignments must preserve the same club on both their
  -- team-season and membership edges. These constraints are part of the
  -- authorization boundary reused below.
  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_team_season_permissions'::regclass
    and constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.club_team_seasons'::regclass
    and constraint_row.conkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_team_season_id' and not attisdropped),
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'id' and not attisdropped),
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_seasons'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  if v_count <> 1 then
    raise exception 'club_team_season_permissions lacks its validated relation/club foreign key';
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_team_season_permissions'::regclass
    and constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.club_memberships'::regclass
    and constraint_row.conkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'membership_id' and not attisdropped),
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_team_season_permissions'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confkey = array[
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_memberships'::regclass and attname = 'id' and not attisdropped),
      (select attnum from pg_catalog.pg_attribute where attrelid = 'public.club_memberships'::regclass and attname = 'club_id' and not attisdropped)
    ]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'c'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  if v_count <> 1 then
    raise exception 'club_team_season_permissions lacks its validated membership/club ON DELETE CASCADE foreign key';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
      and constraint_row.conname = 'club_seasons_status_check'
  ) or exists (
    select 1
    from public.club_seasons season
    where season.status not in ('open', 'closed')
  ) then
    raise exception 'club_seasons.status is not protected by the validated open/closed lifecycle contract';
  end if;

  -- Change 35 is the sole source of owner/admin and explicit STAFF access.
  v_function_oid := pg_catalog.to_regprocedure(
    'public.can_read_club_team_season(uuid)'
  )::oid;

  if v_function_oid is null then
    raise exception 'Change 39B requires public.can_read_club_team_season(uuid)';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_language language on language.oid = routine.prolang
    where routine.oid = v_function_oid
      and routine.prokind = 'f'
      and routine.prorettype = 'boolean'::regtype
      and routine.provolatile = 's'
      and routine.prosecdef
      and routine.proowner = 'postgres'::regrole
      and routine.proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and language.lanname = 'sql'
      and pg_catalog.obj_description(routine.oid, 'pg_proc') =
        'APPCAUDAL Change 35 read-only team-season authorization helper.'
  ) then
    raise exception 'can_read_club_team_season(uuid) has an incompatible Change 35 contract';
  end if;

  if pg_catalog.has_function_privilege(
       'anon', v_function_oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc routine
       cross join lateral pg_catalog.aclexplode(
         coalesce(
           routine.proacl,
           pg_catalog.acldefault('f', routine.proowner)
         )
       ) acl_row
       where routine.oid = v_function_oid
         and acl_row.grantee = 0
         and acl_row.privilege_type = 'EXECUTE'
     ) then
    raise exception 'can_read_club_team_season(uuid) has unsafe EXECUTE privileges';
  end if;

  -- Do not replace unrelated functions and reject every unexpected overload.
  for v_function_name, v_expected_comment in
    select *
    from (values
      (
        'can_write_club_team_season'::text,
        'APPCAUDAL Change 39B: write authorization for an open club team-season.'::text
      ),
      (
        'can_read_match'::text,
        'APPCAUDAL Change 39B: match read authorization delegated to its canonical team-season.'::text
      ),
      (
        'can_write_match'::text,
        'APPCAUDAL Change 39B: match write authorization delegated to its canonical open team-season.'::text
      )
    ) expected(function_name, expected_comment)
  loop
    select pg_catalog.count(*)
    into v_count
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = v_function_name;

    v_function_oid := pg_catalog.to_regprocedure(
      pg_catalog.format('public.%I(uuid)', v_function_name)
    )::oid;

    if v_count > 1 or (v_count = 1 and v_function_oid is null) then
      raise exception 'public.% has an unexpected or conflicting overload', v_function_name;
    end if;

    if v_function_oid is not null then
      if pg_catalog.obj_description(v_function_oid, 'pg_proc') is distinct from
         v_expected_comment then
        raise exception 'public.%(uuid) exists outside the Change 39B contract', v_function_name;
      end if;

      if not exists (
        select 1
        from pg_catalog.pg_proc routine
        where routine.oid = v_function_oid
          and routine.prokind = 'f'
          and routine.prorettype = 'boolean'::regtype
      ) then
        raise exception 'public.%(uuid) has an incompatible routine kind or return type', v_function_name;
      end if;
    end if;
  end loop;

  -- Baseline used by the postcondition to prove this transaction did not
  -- change RLS flags or any existing policy definition.
  with target_relations(relation_name) as (
    values
      ('club_seasons'::text),
      ('club_teams'::text),
      ('club_team_seasons'::text),
      ('club_team_season_permissions'::text),
      ('club_memberships'::text),
      ('partidos'::text)
  )
  select pg_catalog.md5(
    coalesce(
      pg_catalog.string_agg(
        relation.relname
        || ':' || relation.relrowsecurity::text
        || ':' || relation.relforcerowsecurity::text
        || ':' || coalesce(policy.polname, '<NO_POLICY>')
        || ':' || coalesce(policy.polcmd::text, '')
        || ':' || coalesce(policy.polpermissive::text, '')
        || ':' || coalesce(policy.polroles::text, '')
        || ':' || coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ':' || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        '|' order by relation.relname, policy.polname
      ),
      ''
    )
  )
  into v_rls_fingerprint
  from target_relations target
  join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
  join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.relation_name
   and relation.relkind in ('r', 'p')
  left join pg_catalog.pg_policy policy on policy.polrelid = relation.oid;

  perform pg_catalog.set_config(
    'appcaudal.change39b_rls_fingerprint',
    v_rls_fingerprint,
    true
  );
end
$preconditions$;

create or replace function public.can_write_club_team_season(
  target_club_team_season_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    auth.uid() is not null
    and target_club_team_season_id is not null
    and public.can_read_club_team_season(target_club_team_season_id)
    and exists (
      select 1
      from public.club_team_seasons relation
      join public.club_seasons season
        on season.id = relation.season_id
       and season.club_id = relation.club_id
      where relation.id = target_club_team_season_id
        and season.status = 'open'
    ),
    false
  );
$function$;

comment on function public.can_write_club_team_season(uuid) is
  'APPCAUDAL Change 39B: write authorization for an open club team-season.';

create or replace function public.can_read_match(
  target_partido_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    auth.uid() is not null
    and target_partido_id is not null
    and exists (
      select 1
      from public.partidos match_row
      where match_row.id = target_partido_id
        and match_row.club_team_season_id is not null
        and public.can_read_club_team_season(
          match_row.club_team_season_id
        )
    ),
    false
  );
$function$;

comment on function public.can_read_match(uuid) is
  'APPCAUDAL Change 39B: match read authorization delegated to its canonical team-season.';

create or replace function public.can_write_match(
  target_partido_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    auth.uid() is not null
    and target_partido_id is not null
    and exists (
      select 1
      from public.partidos match_row
      where match_row.id = target_partido_id
        and match_row.club_team_season_id is not null
        and public.can_write_club_team_season(
          match_row.club_team_season_id
        )
    ),
    false
  );
$function$;

comment on function public.can_write_match(uuid) is
  'APPCAUDAL Change 39B: match write authorization delegated to its canonical open team-season.';

alter function public.can_write_club_team_season(uuid) owner to postgres;
alter function public.can_read_match(uuid) owner to postgres;
alter function public.can_write_match(uuid) owner to postgres;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. Remove every client and
-- backend grant first, then expose only the authenticated application role.
-- postgres retains the unavoidable owner capability.
revoke all on function public.can_write_club_team_season(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_read_match(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_write_match(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.can_write_club_team_season(uuid)
  to authenticated;
grant execute on function public.can_read_match(uuid)
  to authenticated;
grant execute on function public.can_write_match(uuid)
  to authenticated;

do $postconditions$
declare
  v_target record;
  v_function_oid oid;
  v_count integer;
  v_result boolean;
  v_rls_fingerprint text;
begin
  for v_target in
    select *
    from (values
      (
        'can_write_club_team_season'::text,
        'target_club_team_season_id'::text,
        'APPCAUDAL Change 39B: write authorization for an open club team-season.'::text,
        'public.can_read_club_team_season'::text,
        'season.status = ''open'''::text,
        '1c7f46f430cba9c9c16f298af6cd4c3b'::text
      ),
      (
        'can_read_match'::text,
        'target_partido_id'::text,
        'APPCAUDAL Change 39B: match read authorization delegated to its canonical team-season.'::text,
        'public.can_read_club_team_season'::text,
        'match_row.club_team_season_id'::text,
        '31c4128ac988bf3d02e665c00d18f2f9'::text
      ),
      (
        'can_write_match'::text,
        'target_partido_id'::text,
        'APPCAUDAL Change 39B: match write authorization delegated to its canonical open team-season.'::text,
        'public.can_write_club_team_season'::text,
        'match_row.club_team_season_id'::text,
        'dbdc12f9b182934afbea30dfafd60850'::text
      )
    ) expected(
      function_name,
      argument_name,
      expected_comment,
      required_source_fragment_1,
      required_source_fragment_2,
      expected_source_md5
    )
  loop
    select pg_catalog.count(*)
    into v_count
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = v_target.function_name;

    v_function_oid := pg_catalog.to_regprocedure(
      pg_catalog.format('public.%I(uuid)', v_target.function_name)
    )::oid;

    if v_count <> 1 or v_function_oid is null then
      raise exception 'public.%(uuid) is missing or has an unexpected overload', v_target.function_name;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc routine
      join pg_catalog.pg_language language on language.oid = routine.prolang
      where routine.oid = v_function_oid
        and routine.prokind = 'f'
        and routine.prorettype = 'boolean'::regtype
        and routine.pronargs = 1
        and routine.pronargdefaults = 0
        and routine.proargnames = array[v_target.argument_name]::text[]
        and routine.provolatile = 's'
        and routine.prosecdef
        and routine.proowner = 'postgres'::regrole
        and routine.proconfig is not distinct from array['search_path=pg_catalog']::text[]
        and language.lanname = 'sql'
        and pg_catalog.obj_description(routine.oid, 'pg_proc') = v_target.expected_comment
        and pg_catalog.strpos(routine.prosrc, v_target.required_source_fragment_1) > 0
        and pg_catalog.strpos(routine.prosrc, v_target.required_source_fragment_2) > 0
        and pg_catalog.md5(
          pg_catalog.regexp_replace(
            pg_catalog.lower(routine.prosrc),
            $regex$\s+$regex$,
            '',
            'g'
          )
        ) = v_target.expected_source_md5
    ) then
      raise exception 'public.%(uuid) has an incompatible Change 39B contract', v_target.function_name;
    end if;

    if pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE')
       or exists (
         select 1
         from pg_catalog.pg_proc routine
         cross join lateral pg_catalog.aclexplode(
           coalesce(
             routine.proacl,
             pg_catalog.acldefault('f', routine.proowner)
           )
         ) acl_row
         where routine.oid = v_function_oid
           and acl_row.grantee = 0
           and acl_row.privilege_type = 'EXECUTE'
       )
       or not exists (
         select 1
         from pg_catalog.pg_proc routine
         cross join lateral pg_catalog.aclexplode(
           coalesce(
             routine.proacl,
             pg_catalog.acldefault('f', routine.proowner)
           )
         ) acl_row
         join pg_catalog.pg_roles grantee on grantee.oid = acl_row.grantee
         where routine.oid = v_function_oid
           and grantee.rolname = 'authenticated'
           and acl_row.privilege_type = 'EXECUTE'
           and not acl_row.is_grantable
       ) then
      raise exception 'public.%(uuid) has incompatible effective EXECUTE privileges', v_target.function_name;
    end if;
  end loop;

  -- With no JWT identity every helper must fail closed for NULL and unknown IDs.
  select public.can_write_club_team_season(null::uuid) into v_result;
  if v_result is not false then
    raise exception 'can_write_club_team_season(NULL) did not fail closed';
  end if;

  select public.can_write_club_team_season(
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into v_result;
  if v_result is not false then
    raise exception 'can_write_club_team_season(unknown) did not fail closed';
  end if;

  select public.can_read_match(null::uuid) into v_result;
  if v_result is not false then
    raise exception 'can_read_match(NULL) did not fail closed';
  end if;

  select public.can_read_match(
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into v_result;
  if v_result is not false then
    raise exception 'can_read_match(unknown) did not fail closed';
  end if;

  select public.can_write_match(null::uuid) into v_result;
  if v_result is not false then
    raise exception 'can_write_match(NULL) did not fail closed';
  end if;

  select public.can_write_match(
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into v_result;
  if v_result is not false then
    raise exception 'can_write_match(unknown) did not fail closed';
  end if;

  with target_relations(relation_name) as (
    values
      ('club_seasons'::text),
      ('club_teams'::text),
      ('club_team_seasons'::text),
      ('club_team_season_permissions'::text),
      ('club_memberships'::text),
      ('partidos'::text)
  )
  select pg_catalog.md5(
    coalesce(
      pg_catalog.string_agg(
        relation.relname
        || ':' || relation.relrowsecurity::text
        || ':' || relation.relforcerowsecurity::text
        || ':' || coalesce(policy.polname, '<NO_POLICY>')
        || ':' || coalesce(policy.polcmd::text, '')
        || ':' || coalesce(policy.polpermissive::text, '')
        || ':' || coalesce(policy.polroles::text, '')
        || ':' || coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ':' || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        '|' order by relation.relname, policy.polname
      ),
      ''
    )
  )
  into v_rls_fingerprint
  from target_relations target
  join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
  join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.relation_name
   and relation.relkind in ('r', 'p')
  left join pg_catalog.pg_policy policy on policy.polrelid = relation.oid;

  if v_rls_fingerprint is distinct from pg_catalog.current_setting(
       'appcaudal.change39b_rls_fingerprint',
       true
     ) then
    raise exception 'Change 39B detected an RLS flag or policy change and will roll back';
  end if;
end
$postconditions$;

commit;
