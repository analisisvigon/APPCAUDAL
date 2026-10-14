-- APPCAUDAL - Club core (change 37) verification
-- Read-only. Run independently after the migration in Supabase SQL Editor.
-- Every mandatory check must pass for the GLOBAL result to be PASS.

with
constants as (
  select
    'ca0da100-0000-4000-8000-000000000001'::uuid as club_id,
    '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid as team_id,
    'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid as season_id,
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as club_team_season_id
),
manifest(match_id) as (
  values
    ('12e019fb-e2bb-4a6d-91ce-f22a04c4f7dc'::uuid),
    ('25cbc486-080a-4b82-9980-3c09cc103181'::uuid),
    ('39e2d20d-5d6e-40fd-9645-d44e2eb40715'::uuid),
    ('3a617129-de25-4531-a944-27832bb24b31'::uuid),
    ('4b3312ed-96e6-440f-88e6-82c2b9baf622'::uuid),
    ('65f6c0ab-66c8-47ad-882b-f12c529601bb'::uuid),
    ('6785391e-a054-488b-acf4-67be3cd954c2'::uuid),
    ('8ce7ceb8-60e6-4f55-9bc1-a24b4da2461e'::uuid),
    ('ca6b6933-e075-4cee-b5a0-ab32abb61d41'::uuid),
    ('d7e38bd4-1e63-492d-9676-cedc07b9a920'::uuid),
    ('e98f09d2-fb31-4db3-89da-b53e5982b683'::uuid),
    ('ebf6cc9c-ec1d-42d1-bf22-e09a9741ab3a'::uuid),
    ('eca4bee3-4b98-42a1-9dff-b6f4187082d6'::uuid),
    ('ffa62b07-b9a9-4f03-ad6c-2d65df327774'::uuid)
),
catalog_ids as (
  select
    to_regclass('public.partidos')::oid as partidos_oid,
    to_regclass('public.club_team_seasons')::oid as club_team_seasons_oid
),
attribute_ids as (
  select
    catalog_ids.*,
    (select column_row.attnum
     from pg_attribute column_row
     where column_row.attrelid = catalog_ids.partidos_oid
       and column_row.attname = 'id'
       and not column_row.attisdropped) as partidos_id_attnum,
    (select column_row.attnum
     from pg_attribute column_row
     where column_row.attrelid = catalog_ids.partidos_oid
       and column_row.attname = 'club_team_season_id'
       and not column_row.attisdropped) as partidos_scope_attnum,
    (select column_row.attnum
     from pg_attribute column_row
     where column_row.attrelid = catalog_ids.club_team_seasons_oid
       and column_row.attname = 'id'
       and not column_row.attisdropped) as relation_id_attnum
  from catalog_ids
),
checks(check_order, check_name, passed, detail) as (
  select 1, 'required_tables_exist',
    to_regclass('public.partidos') is not null
      and to_regclass('public.club_team_seasons') is not null
      and to_regclass('public.club_teams') is not null
      and to_regclass('public.club_seasons') is not null,
    'partidos, club_team_seasons, club_teams and club_seasons exist'

  union all
  select 2, 'partidos_uuid_primary_key',
    (select
       (select count(*) = 1
        from pg_attribute column_row
        where column_row.attrelid = ids.partidos_oid
          and column_row.attname = 'id'
          and not column_row.attisdropped
          and column_row.atttypid = 'uuid'::regtype
          and column_row.attnotnull)
       and
       (select count(*) = 1
        from pg_constraint constraint_row
        where constraint_row.conrelid = ids.partidos_oid
          and constraint_row.contype = 'p'
          and constraint_row.convalidated
          and not constraint_row.condeferrable
          and constraint_row.conkey = array[ids.partidos_id_attnum]::smallint[])
     from attribute_ids ids),
    'partidos.id is NOT NULL uuid with one validated, non-deferrable primary key'

  union all
  select 3, 'no_undocumented_partidos_update_trigger',
    (select count(*) = 0
     from pg_trigger trigger_row
     cross join attribute_ids ids
     where trigger_row.tgrelid = ids.partidos_oid
       and not trigger_row.tgisinternal
       and trigger_row.tgenabled <> 'D'
       and (trigger_row.tgtype::integer & 16) = 16),
    'no enabled user UPDATE trigger can introduce undocumented update side effects'

  union all
  select 4, 'relation_uuid_primary_key',
    (select
       (select count(*) = 1
        from pg_attribute column_row
        where column_row.attrelid = ids.club_team_seasons_oid
          and column_row.attname = 'id'
          and not column_row.attisdropped
          and column_row.atttypid = 'uuid'::regtype
          and column_row.attnotnull)
       and
       (select count(*) = 1
        from pg_constraint constraint_row
        where constraint_row.conrelid = ids.club_team_seasons_oid
          and constraint_row.contype = 'p'
          and constraint_row.convalidated
          and not constraint_row.condeferrable
          and constraint_row.conkey = array[ids.relation_id_attnum]::smallint[])
     from attribute_ids ids),
    'club_team_seasons.id is NOT NULL uuid with one validated, non-deferrable primary key'

  union all
  select 5, 'relation_team_season_unique',
    (select count(*) = 1
     from pg_constraint constraint_row
     cross join attribute_ids ids
     where constraint_row.conrelid = ids.club_team_seasons_oid
       and constraint_row.contype = 'u'
       and constraint_row.convalidated
       and not constraint_row.condeferrable
       and constraint_row.conkey = array[
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = ids.club_team_seasons_oid and column_row.attname = 'team_id' and not column_row.attisdropped),
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = ids.club_team_seasons_oid and column_row.attname = 'season_id' and not column_row.attisdropped)
       ]::smallint[]),
    'club_team_seasons enforces one row per team and season'

  union all
  select 6, 'relation_team_club_fk',
    (select count(*) = 1
     from pg_constraint constraint_row
     cross join attribute_ids ids
     where constraint_row.conrelid = ids.club_team_seasons_oid
       and constraint_row.contype = 'f'
       and constraint_row.conkey = array[
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = ids.club_team_seasons_oid and column_row.attname = 'team_id' and not column_row.attisdropped),
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = ids.club_team_seasons_oid and column_row.attname = 'club_id' and not column_row.attisdropped)
       ]::smallint[]
       and constraint_row.confrelid = to_regclass('public.club_teams')
       and constraint_row.confkey = array[
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = to_regclass('public.club_teams') and column_row.attname = 'id' and not column_row.attisdropped),
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = to_regclass('public.club_teams') and column_row.attname = 'club_id' and not column_row.attisdropped)
       ]::smallint[]
       and constraint_row.confupdtype = 'a'
       and constraint_row.confdeltype = 'r'
       and constraint_row.convalidated
       and not constraint_row.condeferrable
       and not constraint_row.condeferred),
    'club_team_seasons retains its validated same-club team composite FK'

  union all
  select 7, 'relation_season_club_fk',
    (select count(*) = 1
     from pg_constraint constraint_row
     cross join attribute_ids ids
     where constraint_row.conrelid = ids.club_team_seasons_oid
       and constraint_row.contype = 'f'
       and constraint_row.conkey = array[
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = ids.club_team_seasons_oid and column_row.attname = 'season_id' and not column_row.attisdropped),
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = ids.club_team_seasons_oid and column_row.attname = 'club_id' and not column_row.attisdropped)
       ]::smallint[]
       and constraint_row.confrelid = to_regclass('public.club_seasons')
       and constraint_row.confkey = array[
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = to_regclass('public.club_seasons') and column_row.attname = 'id' and not column_row.attisdropped),
         (select column_row.attnum from pg_attribute column_row
          where column_row.attrelid = to_regclass('public.club_seasons') and column_row.attname = 'club_id' and not column_row.attisdropped)
       ]::smallint[]
       and constraint_row.confupdtype = 'a'
       and constraint_row.confdeltype = 'r'
       and constraint_row.convalidated
       and not constraint_row.condeferrable
       and not constraint_row.condeferred),
    'club_team_seasons retains its validated same-club season composite FK'

  union all
  select 8, 'confirmed_relation_identity',
    (select count(*) = 1
     from public.club_team_seasons relation_row
     join public.club_teams team
       on team.id = relation_row.team_id
      and team.club_id = relation_row.club_id
     join public.club_seasons season
       on season.id = relation_row.season_id
      and season.club_id = relation_row.club_id
     cross join constants expected
     where relation_row.id = expected.club_team_season_id
       and relation_row.club_id = expected.club_id
       and relation_row.team_id = expected.team_id
       and relation_row.season_id = expected.season_id),
    'relation UUID maps to the confirmed club, C.D. Caudal team and 2026/2027 season'

  union all
  select 9, 'manifest_has_14_unique_ids',
    (select count(*) = 14 and count(distinct match_id) = 14 from manifest),
    'the explicit migration manifest contains exactly 14 distinct UUIDs'

  union all
  select 10, 'partidos_has_exactly_14_rows',
    (select count(*) = 14 from public.partidos),
    'production still contains exactly the 14 confirmed historical matches'

  union all
  select 11, 'all_manifest_matches_exist',
    (select count(*) = 14
     from public.partidos match_row
     join manifest on manifest.match_id = match_row.id),
    'all 14 explicit match UUIDs exist'

  union all
  select 12, 'no_additional_matches_exist',
    not exists (
      select 1
      from public.partidos match_row
      where not exists (
        select 1 from manifest where manifest.match_id = match_row.id
      )
    ),
    'no partido outside the explicit 14-UUID manifest exists'

  union all
  select 13, 'scope_column_contract',
    (select count(*) = 1
     from pg_attribute column_row
     cross join attribute_ids ids
     where column_row.attrelid = ids.partidos_oid
       and column_row.attname = 'club_team_season_id'
       and not column_row.attisdropped
       and column_row.atttypid = 'uuid'::regtype
       and not column_row.attnotnull
       and not column_row.atthasdef),
    'club_team_season_id is one nullable uuid column without a default'

  union all
  select 14, 'one_fk_touches_scope_column',
    (select count(*) = 1
     from pg_constraint constraint_row
     cross join attribute_ids ids
     where constraint_row.conrelid = ids.partidos_oid
       and constraint_row.contype = 'f'
       and ids.partidos_scope_attnum = any(constraint_row.conkey)),
    'exactly one foreign key involves partidos.club_team_season_id'

  union all
  select 15, 'scope_fk_exact_definition',
    (select count(*) = 1
     from pg_constraint constraint_row
     cross join attribute_ids ids
     where constraint_row.conrelid = ids.partidos_oid
       and constraint_row.contype = 'f'
       and constraint_row.conkey = array[ids.partidos_scope_attnum]::smallint[]
       and constraint_row.confrelid = ids.club_team_seasons_oid
       and constraint_row.confkey = array[ids.relation_id_attnum]::smallint[]
       and constraint_row.confupdtype = 'a'
       and constraint_row.confdeltype = 'r'
       and constraint_row.convalidated
       and not constraint_row.condeferrable
       and not constraint_row.condeferred),
    'FK targets club_team_seasons(id), is validated/non-deferrable and uses ON DELETE RESTRICT'

  union all
  select 16, 'all_14_matches_are_assigned',
    (select count(*) = 14
     from public.partidos match_row
     join manifest on manifest.match_id = match_row.id
     cross join constants expected
     where to_jsonb(match_row) ->> 'club_team_season_id' = expected.club_team_season_id::text),
    'all 14 manifest matches point to the confirmed relation UUID'

  union all
  select 17, 'no_null_or_contradictory_assignment',
    not exists (
      select 1
      from public.partidos match_row
      cross join constants expected
      where (to_jsonb(match_row) ->> 'club_team_season_id') is distinct from expected.club_team_season_id::text
    ),
    'no partido has a null or different club_team_season_id'
),
results as (
  select check_order, check_name,
    case when passed is true then 'PASS' else 'FAIL' end as result,
    detail
  from checks

  union all

  select 999, 'GLOBAL',
    case
      when count(*) = 17 and bool_and(passed is true) then 'PASS'
      else 'FAIL'
    end,
    format('%s/17 mandatory checks passed', count(*) filter (where passed is true))
  from checks
)
select check_name, result, detail
from results
order by check_order;
