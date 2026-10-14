-- APPCAUDAL - Club core (change 37)
-- Associates the 14 confirmed historical matches with their canonical own-team season.
-- Additive, transactional and idempotent. Run manually in Supabase SQL Editor.

begin;

do $preflight$
declare
  v_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  v_team_id constant uuid := '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
  v_season_id constant uuid := 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae';
  v_club_team_season_id constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_match_ids constant uuid[] := array[
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
  ];
  v_partidos_oid oid;
  v_club_team_seasons_oid oid;
  v_count bigint;
  v_column_count integer;
  v_column_ok boolean;
begin
  if auth.uid() is not null then
    raise exception 'Change 37 must run without an application JWT identity';
  end if;

  v_partidos_oid := to_regclass('public.partidos')::oid;
  v_club_team_seasons_oid := to_regclass('public.club_team_seasons')::oid;

  if v_partidos_oid is null or v_club_team_seasons_oid is null then
    raise exception 'Change 37 requires public.partidos and public.club_team_seasons';
  end if;

  if to_regclass('public.club_teams') is null
     or to_regclass('public.club_seasons') is null then
    raise exception 'Change 37 requires public.club_teams and public.club_seasons';
  end if;

  -- public.partidos must use the UUID identity observed by the application and
  -- referenced by its dependent tables. No other legacy columns are assumed.
  select count(*)
  into v_count
  from pg_attribute column_row
  where column_row.attrelid = v_partidos_oid
    and column_row.attname = 'id'
    and not column_row.attisdropped
    and column_row.atttypid = 'uuid'::regtype
    and column_row.attnotnull;

  if v_count <> 1 then
    raise exception 'public.partidos.id must exist as one NOT NULL uuid column';
  end if;

  select count(*)
  into v_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_partidos_oid
    and constraint_row.contype = 'p'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and constraint_row.conkey = array[
      (select column_row.attnum
       from pg_attribute column_row
       where column_row.attrelid = v_partidos_oid
         and column_row.attname = 'id'
         and not column_row.attisdropped)
    ]::smallint[];

  if v_count <> 1 then
    raise exception 'public.partidos must have one validated, non-deferrable PRIMARY KEY (id)';
  end if;

  -- No repository migration defines an UPDATE trigger on partidos. If
  -- production has drifted, stop before touching rows so an undocumented
  -- trigger cannot alter other match or child data as a side effect.
  select count(*)
  into v_count
  from pg_trigger trigger_row
  where trigger_row.tgrelid = v_partidos_oid
    and not trigger_row.tgisinternal
    and trigger_row.tgenabled <> 'D'
    and (trigger_row.tgtype::integer & 16) = 16;

  if v_count <> 0 then
    raise exception
      'public.partidos has % enabled user UPDATE triggers not present in the expected repository schema; review before Change 37',
      v_count;
  end if;

  -- Change 34 contract needed by the new foreign key and by the confirmed
  -- club/team/season identity check.
  select count(*) = 4
    and bool_and(
      column_row.atttypid = 'uuid'::regtype
      and column_row.attnotnull
      and column_row.attname in ('id', 'club_id', 'team_id', 'season_id')
    )
  into v_column_ok
  from pg_attribute column_row
  where column_row.attrelid = v_club_team_seasons_oid
    and column_row.attname in ('id', 'club_id', 'team_id', 'season_id')
    and not column_row.attisdropped;

  if v_column_ok is not true then
    raise exception 'public.club_team_seasons does not expose the expected NOT NULL uuid identity columns';
  end if;

  select count(*)
  into v_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_club_team_seasons_oid
    and constraint_row.contype = 'p'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and constraint_row.conkey = array[
      (select column_row.attnum
       from pg_attribute column_row
       where column_row.attrelid = v_club_team_seasons_oid
         and column_row.attname = 'id'
         and not column_row.attisdropped)
    ]::smallint[];

  if v_count <> 1 then
    raise exception 'public.club_team_seasons must have one validated, non-deferrable PRIMARY KEY (id)';
  end if;

  select count(*)
  into v_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_club_team_seasons_oid
    and constraint_row.contype = 'u'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and constraint_row.conkey = array[
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = v_club_team_seasons_oid and column_row.attname = 'team_id' and not column_row.attisdropped),
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = v_club_team_seasons_oid and column_row.attname = 'season_id' and not column_row.attisdropped)
    ]::smallint[];

  if v_count <> 1 then
    raise exception 'public.club_team_seasons must have one validated UNIQUE (team_id, season_id) constraint';
  end if;

  select count(*)
  into v_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_club_team_seasons_oid
    and constraint_row.contype = 'f'
    and constraint_row.conkey = array[
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = v_club_team_seasons_oid and column_row.attname = 'team_id' and not column_row.attisdropped),
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = v_club_team_seasons_oid and column_row.attname = 'club_id' and not column_row.attisdropped)
    ]::smallint[]
    and constraint_row.confrelid = 'public.club_teams'::regclass
    and constraint_row.confkey = array[
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = 'public.club_teams'::regclass and column_row.attname = 'id' and not column_row.attisdropped),
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = 'public.club_teams'::regclass and column_row.attname = 'club_id' and not column_row.attisdropped)
    ]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  if v_count <> 1 then
    raise exception 'public.club_team_seasons lacks the expected validated team/club composite FK';
  end if;

  select count(*)
  into v_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_club_team_seasons_oid
    and constraint_row.contype = 'f'
    and constraint_row.conkey = array[
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = v_club_team_seasons_oid and column_row.attname = 'season_id' and not column_row.attisdropped),
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = v_club_team_seasons_oid and column_row.attname = 'club_id' and not column_row.attisdropped)
    ]::smallint[]
    and constraint_row.confrelid = 'public.club_seasons'::regclass
    and constraint_row.confkey = array[
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = 'public.club_seasons'::regclass and column_row.attname = 'id' and not column_row.attisdropped),
      (select column_row.attnum from pg_attribute column_row
       where column_row.attrelid = 'public.club_seasons'::regclass and column_row.attname = 'club_id' and not column_row.attisdropped)
    ]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  if v_count <> 1 then
    raise exception 'public.club_team_seasons lacks the expected validated season/club composite FK';
  end if;

  select count(*)
  into v_count
  from public.club_team_seasons relation_row
  join public.club_teams team
    on team.id = relation_row.team_id
   and team.club_id = relation_row.club_id
  join public.club_seasons season
    on season.id = relation_row.season_id
   and season.club_id = relation_row.club_id
  where relation_row.id = v_club_team_season_id
    and relation_row.club_id = v_club_id
    and relation_row.team_id = v_team_id
    and relation_row.season_id = v_season_id;

  if v_count <> 1 then
    raise exception
      'The confirmed club_team_seasons row does not match club %, team % and season %',
      v_club_id,
      v_team_id,
      v_season_id;
  end if;

  if cardinality(v_match_ids) <> 14 then
    raise exception 'The Change 37 match manifest must contain 14 entries';
  end if;

  select count(distinct manifest.match_id)
  into v_count
  from unnest(v_match_ids) as manifest(match_id);

  if v_count <> 14 then
    raise exception 'The Change 37 match manifest contains duplicate UUIDs';
  end if;

  select count(*)
  into v_count
  from public.partidos;

  if v_count <> 14 then
    raise exception 'Expected exactly 14 total rows in public.partidos; found %', v_count;
  end if;

  select count(*)
  into v_count
  from public.partidos match_row
  where match_row.id = any(v_match_ids);

  if v_count <> 14 then
    raise exception 'Not all 14 confirmed match UUIDs exist in public.partidos; found %', v_count;
  end if;

  -- If a previous attempt or another migration already created the column,
  -- accept only the exact nullable/no-default contract required here.
  select count(*)
  into v_column_count
  from pg_attribute column_row
  where column_row.attrelid = v_partidos_oid
    and column_row.attname = 'club_team_season_id'
    and not column_row.attisdropped;

  if v_column_count > 1 then
    raise exception 'public.partidos has more than one live club_team_season_id attribute';
  end if;

  if v_column_count = 1 then
    select
      column_row.atttypid = 'uuid'::regtype
      and not column_row.attnotnull
      and not column_row.atthasdef
    into v_column_ok
    from pg_attribute column_row
    where column_row.attrelid = v_partidos_oid
      and column_row.attname = 'club_team_season_id'
      and not column_row.attisdropped;

    if v_column_ok is not true then
      raise exception 'Existing public.partidos.club_team_season_id is not a nullable uuid without a default';
    end if;
  end if;
end
$preflight$;

alter table public.partidos
  add column if not exists club_team_season_id uuid;

comment on column public.partidos.club_team_season_id is
  'Canonical own-team/season scope for the match; introduced by APPCAUDAL change 37.';

do $foreign_key$
declare
  v_partidos_oid oid := to_regclass('public.partidos')::oid;
  v_club_team_seasons_oid oid := to_regclass('public.club_team_seasons')::oid;
  v_source_attnum smallint;
  v_target_attnum smallint;
  v_named_count integer;
  v_named_exact_count integer;
  v_exact_count integer;
  v_touching_count integer;
  v_contradictory_count bigint;
  v_club_team_season_id constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
begin
  select column_row.attnum
  into strict v_source_attnum
  from pg_attribute column_row
  where column_row.attrelid = v_partidos_oid
    and column_row.attname = 'club_team_season_id'
    and not column_row.attisdropped;

  select column_row.attnum
  into strict v_target_attnum
  from pg_attribute column_row
  where column_row.attrelid = v_club_team_seasons_oid
    and column_row.attname = 'id'
    and not column_row.attisdropped;

  -- ALTER TABLE above holds its lock until commit, so this check cannot race
  -- with a concurrent write. Reject conflicting values before FK validation
  -- can turn them into a less descriptive generic referential-integrity error.
  select count(*)
  into v_contradictory_count
  from public.partidos match_row
  where match_row.club_team_season_id is not null
    and match_row.club_team_season_id is distinct from v_club_team_season_id;

  if v_contradictory_count <> 0 then
    raise exception
      '% matches already have a contradictory club_team_season_id; nothing was overwritten',
      v_contradictory_count;
  end if;

  select count(*)
  into v_named_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_partidos_oid
    and constraint_row.conname = 'partidos_club_team_season_id_fkey';

  select count(*)
  into v_exact_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_partidos_oid
    and constraint_row.contype = 'f'
    and constraint_row.conkey = array[v_source_attnum]::smallint[]
    and constraint_row.confrelid = v_club_team_seasons_oid
    and constraint_row.confkey = array[v_target_attnum]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  select count(*)
  into v_named_exact_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_partidos_oid
    and constraint_row.conname = 'partidos_club_team_season_id_fkey'
    and constraint_row.contype = 'f'
    and constraint_row.conkey = array[v_source_attnum]::smallint[]
    and constraint_row.confrelid = v_club_team_seasons_oid
    and constraint_row.confkey = array[v_target_attnum]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  select count(*)
  into v_touching_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_partidos_oid
    and constraint_row.contype = 'f'
    and v_source_attnum = any(constraint_row.conkey);

  if v_named_count > 1 then
    raise exception 'Duplicate constraints named partidos_club_team_season_id_fkey';
  end if;

  if v_named_count = 1 and v_named_exact_count <> 1 then
    raise exception 'Existing partidos_club_team_season_id_fkey has an incompatible definition';
  end if;

  if v_exact_count > 1 or v_touching_count > 1 then
    raise exception 'public.partidos.club_team_season_id has duplicate or overlapping foreign keys';
  end if;

  if v_exact_count = 0 and v_touching_count <> 0 then
    raise exception 'public.partidos.club_team_season_id already participates in an incompatible foreign key';
  end if;

  if v_exact_count = 0 then
    alter table public.partidos
      add constraint partidos_club_team_season_id_fkey
      foreign key (club_team_season_id)
      references public.club_team_seasons (id)
      on update no action
      on delete restrict;
  end if;
end
$foreign_key$;

-- Keep the manifest check, contradiction check and update in one lock window.
-- The lock also prevents a concurrent match insert from invalidating the
-- confirmed statement that these are exactly the 14 existing matches.
lock table public.partidos in share row exclusive mode;
lock table public.club_team_seasons in share mode;

do $assign_and_verify$
declare
  v_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  v_team_id constant uuid := '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
  v_season_id constant uuid := 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae';
  v_club_team_season_id constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_match_ids constant uuid[] := array[
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
  ];
  v_count bigint;
  v_updated_count bigint;
begin
  select count(*)
  into v_count
  from public.club_team_seasons relation_row
  where relation_row.id = v_club_team_season_id
    and relation_row.club_id = v_club_id
    and relation_row.team_id = v_team_id
    and relation_row.season_id = v_season_id;

  if v_count <> 1 then
    raise exception 'Locked relation identity check failed; no match association was applied';
  end if;

  select count(*)
  into v_count
  from public.partidos;

  if v_count <> 14 then
    raise exception 'Concurrent state check failed: public.partidos contains % rows, expected 14', v_count;
  end if;

  select count(*)
  into v_count
  from public.partidos match_row
  where match_row.id = any(v_match_ids);

  if v_count <> 14 then
    raise exception 'Concurrent state check failed: only % confirmed matches remain', v_count;
  end if;

  select count(*)
  into v_count
  from public.partidos match_row
  where match_row.id = any(v_match_ids)
    and match_row.club_team_season_id is not null
    and match_row.club_team_season_id is distinct from v_club_team_season_id;

  if v_count <> 0 then
    raise exception
      '% confirmed matches already have a contradictory club_team_season_id; nothing was overwritten',
      v_count;
  end if;

  update public.partidos match_row
  set club_team_season_id = v_club_team_season_id
  where match_row.id = any(v_match_ids)
    and match_row.club_team_season_id is null;

  get diagnostics v_updated_count = row_count;

  select count(*)
  into v_count
  from public.partidos match_row
  where match_row.id = any(v_match_ids)
    and match_row.club_team_season_id = v_club_team_season_id;

  if v_count <> 14 then
    raise exception 'Postcondition failed: % of 14 matches have the confirmed association', v_count;
  end if;

  select count(*)
  into v_count
  from public.partidos match_row
  where match_row.club_team_season_id is distinct from v_club_team_season_id;

  if v_count <> 0 then
    raise exception 'Postcondition failed: % matches do not have the confirmed association', v_count;
  end if;

  raise notice 'Change 37 association complete: % rows updated in this execution; 14 rows verified',
    v_updated_count;
end
$assign_and_verify$;

-- Final structural postcondition: exactly one compatible, validated FK protects
-- the nullable column and no second FK overlaps it.
do $postflight$
declare
  v_partidos_oid oid := to_regclass('public.partidos')::oid;
  v_club_team_seasons_oid oid := to_regclass('public.club_team_seasons')::oid;
  v_source_attnum smallint;
  v_target_attnum smallint;
  v_count bigint;
  v_column_ok boolean;
begin
  select column_row.attnum,
         column_row.atttypid = 'uuid'::regtype
           and not column_row.attnotnull
           and not column_row.atthasdef
  into strict v_source_attnum, v_column_ok
  from pg_attribute column_row
  where column_row.attrelid = v_partidos_oid
    and column_row.attname = 'club_team_season_id'
    and not column_row.attisdropped;

  if v_column_ok is not true then
    raise exception 'Postcondition failed: club_team_season_id is not a nullable uuid without a default';
  end if;

  select column_row.attnum
  into strict v_target_attnum
  from pg_attribute column_row
  where column_row.attrelid = v_club_team_seasons_oid
    and column_row.attname = 'id'
    and not column_row.attisdropped;

  select count(*)
  into v_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_partidos_oid
    and constraint_row.contype = 'f'
    and v_source_attnum = any(constraint_row.conkey);

  if v_count <> 1 then
    raise exception 'Postcondition failed: expected one FK involving club_team_season_id; found %', v_count;
  end if;

  select count(*)
  into v_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = v_partidos_oid
    and constraint_row.contype = 'f'
    and constraint_row.conkey = array[v_source_attnum]::smallint[]
    and constraint_row.confrelid = v_club_team_seasons_oid
    and constraint_row.confkey = array[v_target_attnum]::smallint[]
    and constraint_row.confupdtype = 'a'
    and constraint_row.confdeltype = 'r'
    and constraint_row.convalidated
    and not constraint_row.condeferrable
    and not constraint_row.condeferred;

  if v_count <> 1 then
    raise exception 'Postcondition failed: the required validated ON DELETE RESTRICT FK is absent or incompatible';
  end if;
end
$postflight$;

commit;
