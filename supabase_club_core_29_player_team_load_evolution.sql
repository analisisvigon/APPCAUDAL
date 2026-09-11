-- APPCAUDAL - Club Core 29 - PLAYER team load evolution.
-- Read-only, sanitized access to daily team load aggregates. This migration
-- does not alter tables, data, RLS policies or table grants.

begin;

do $preconditions$
declare
  club_count integer;
begin
  if auth.uid() is not null then
    raise exception 'Core 29 must run without an active client identity';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'get_my_team_load_evolution'
  ) then
    raise exception 'Core 29 already exists total or partially; it will not be replaced silently';
  end if;

  if pg_catalog.to_regclass('public.clubs') is null
     or pg_catalog.to_regclass('public.club_memberships') is null
     or pg_catalog.to_regclass('public.jugadores') is null
     or pg_catalog.to_regclass('public.training_sessions') is null
     or pg_catalog.to_regclass('public.training_session_load_metrics') is null
     or pg_catalog.to_regprocedure('public.current_membership()') is null then
    raise exception 'Core 29 requires clubs, memberships, jugadores, performance tables and current_membership()';
  end if;

  if pg_catalog.to_regclass('public.training_sessions_daily_team_load_date_key') is null
     or pg_catalog.to_regclass('public.training_session_load_metrics_team_session_key') is null then
    raise exception 'Core 29 requires the canonical one-team-load-per-day indexes';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index index_row
    where index_row.indexrelid = 'public.training_sessions_daily_team_load_date_key'::regclass
      and index_row.indisunique
      and index_row.indisvalid
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid)),
        'daily_team_load'
      ) > 0
  ) or not exists (
    select 1
    from pg_catalog.pg_index index_row
    where index_row.indexrelid = 'public.training_session_load_metrics_team_session_key'::regclass
      and index_row.indisunique
      and index_row.indisvalid
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid)),
        'team'
      ) > 0
  ) then
    raise exception 'Core 29 requires valid unique daily-team and team-session index contracts';
  end if;

  select pg_catalog.count(*)::integer into club_count
  from public.clubs;
  if club_count <> 1 then
    raise exception 'Core 29 preserves the single-club invariant and requires exactly one club; found %', club_count;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles role_row
    where role_row.rolname = 'postgres'
  ) or not exists (
    select 1
    from pg_catalog.pg_roles role_row
    where role_row.rolname = 'authenticated'
  ) or not exists (
    select 1
    from pg_catalog.pg_roles role_row
    where role_row.rolname = 'anon'
  ) or not exists (
    select 1
    from pg_catalog.pg_roles role_row
    where role_row.rolname = 'service_role'
  ) then
    raise exception 'Core 29 requires postgres, authenticated, anon and service_role roles';
  end if;
end;
$preconditions$;

create function public.get_my_team_load_evolution(
  p_start_date date,
  p_end_date date
)
returns table (
  session_date date,
  load_units numeric,
  distance_m numeric,
  hsr_m numeric,
  accelerations integer,
  decelerations integer,
  sprints integer,
  meters_per_minute numeric,
  actual_duration_minutes integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_club_id uuid;
  actor_role text;
  actor_jugador_id uuid;
  actor_active boolean;
  canonical_club_id uuid;
  club_count integer;
  inclusive_day_count integer;
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Invalid team load date range' using errcode = '22023';
  end if;

  inclusive_day_count := (p_end_date - p_start_date) + 1;
  if inclusive_day_count > 62 then
    raise exception 'Team load date range cannot exceed 62 inclusive days' using errcode = '22023';
  end if;

  select
    membership.club_id,
    membership.role,
    membership.jugador_id,
    membership.is_active
  into actor_club_id, actor_role, actor_jugador_id, actor_active
  from public.current_membership() membership;

  if auth.uid() is null
     or actor_club_id is null
     or actor_role is distinct from 'player'
     or actor_jugador_id is null
     or actor_active is not true
     or not exists (
       select 1
       from public.jugadores player
       where player.id = actor_jugador_id
     ) then
    raise exception 'PLAYER team load evolution is not available' using errcode = '42501';
  end if;

  select
    pg_catalog.count(*)::integer,
    (pg_catalog.array_agg(club.id order by club.id))[1]
  into club_count, canonical_club_id
  from public.clubs club;

  if club_count <> 1 or canonical_club_id is distinct from actor_club_id then
    raise exception 'PLAYER team load club scope is not available' using errcode = '42501';
  end if;

  return query
  select
    session_row.session_date,
    metric_row.load_units,
    metric_row.distance_m,
    metric_row.hsr_m,
    metric_row.accelerations,
    metric_row.decelerations,
    metric_row.sprints,
    metric_row.meters_per_minute,
    session_row.actual_duration_minutes
  from public.training_sessions session_row
  join public.training_session_load_metrics metric_row
    on metric_row.session_id = session_row.id
  where session_row.record_kind = 'daily_team_load'
    and metric_row.scope = 'team'
    and metric_row.jugador_id is null
    and metric_row.aggregation_method = 'team_average'
    and session_row.session_date >= p_start_date
    and session_row.session_date <= p_end_date
  order by session_row.session_date asc;
end;
$function$;

comment on function public.get_my_team_load_evolution(date,date) is
'Sanitized PLAYER-only evolution of collective daily team load; no individual rows, identities, notes or internal identifiers.';

alter function public.get_my_team_load_evolution(date,date) owner to postgres;

revoke all on function public.get_my_team_load_evolution(date,date)
from public, anon, authenticated, service_role;

grant execute on function public.get_my_team_load_evolution(date,date)
to authenticated;

do $postconditions$
declare
  function_row pg_catalog.pg_proc%rowtype;
  authenticated_oid oid;
begin
  select procedure_row.* into function_row
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = 'public.get_my_team_load_evolution(date,date)'::regprocedure;

  select role_row.oid into authenticated_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'authenticated';

  if function_row.oid is null
     or function_row.proowner <> (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'postgres')
     or not function_row.prosecdef
     or function_row.provolatile <> 's'
     or function_row.proconfig <> array['search_path=pg_catalog']::text[]
     or function_row.pronargdefaults <> 0 then
    raise exception 'Core 29 function security contract is incomplete';
  end if;

  if not exists (
    select 1
    from pg_catalog.aclexplode(function_row.proacl) acl
    where acl.grantee = authenticated_oid
      and acl.privilege_type = 'EXECUTE'
  ) or exists (
    select 1
    from pg_catalog.aclexplode(function_row.proacl) acl
    where acl.privilege_type = 'EXECUTE'
      and acl.grantee <> function_row.proowner
      and acl.grantee <> authenticated_oid
  ) then
    raise exception 'Core 29 function ACL must be authenticated-only';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.training_sessions'::regclass
      and policy.polname = 'performance_staff_select'
      and policy.polcmd = 'r'
  ) or not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.training_session_load_metrics'::regclass
      and policy.polname = 'performance_staff_select'
      and policy.polcmd = 'r'
  ) then
    raise exception 'Core 29 requires the existing STAFF-only performance RLS contract';
  end if;
end;
$postconditions$;

commit;
