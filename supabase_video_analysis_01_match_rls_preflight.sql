-- NEXO CLUB / Videoanalisis 01. SOLO SELECT. Ejecutar antes de revisar el corte.
-- Una tabla para exportar completa a CSV. No incluye texto tactico ni notas.
-- OWNER_HISTORICAL_ACCESS enumera owners activos del club; no identifica
-- por si solo al propietario permanente de la aplicacion.
with policy_rows as (
  select p.polname, p.polcmd::text as command_code, p.polpermissive,
         p.polroles,
         pg_catalog.pg_get_expr(p.polqual,p.polrelid) as using_expr,
         pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) as check_expr
  from pg_catalog.pg_policy p
  where p.polrelid = pg_catalog.to_regclass('public.partidos')
), routine_rows as (
  select p.oid, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
         p.prosecdef, p.provolatile, p.proconfig, p.proowner, p.prosrc,
         pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  where p.oid in (
    pg_catalog.to_regprocedure('public.is_app_staff()'),
    pg_catalog.to_regprocedure('public.current_membership()'),
    pg_catalog.to_regprocedure('public.can_read_club_team_season(uuid)'),
    pg_catalog.to_regprocedure('public.can_write_club_team_season(uuid)'),
    pg_catalog.to_regprocedure('public.can_read_match(uuid)'),
    pg_catalog.to_regprocedure('public.can_write_match(uuid)')
  )
), historical_cts as (
  select cts.id, cts.club_id, cts.team_id, cts.season_id,
         club.id is not null as club_exists,
         team.id is not null as team_in_club,
         season.id is not null as season_in_club,
         season.status as season_status,
         count(*) as match_count
  from public.partidos match_row
  join public.club_team_seasons cts
    on cts.id = match_row.club_team_season_id
  left join public.clubs club on club.id = cts.club_id
  left join public.club_teams team
    on team.id = cts.team_id and team.club_id = cts.club_id
  left join public.club_seasons season
    on season.id = cts.season_id and season.club_id = cts.club_id
  group by cts.id, cts.club_id, cts.team_id, cts.season_id,
           club.id, team.id, season.id, season.status
), owner_candidates as (
  select distinct membership.user_id
  from public.club_memberships membership
  where membership.role = 'owner'
), rows as (
  select 'PARTIDO_SIN_CTS'::text as finding, 'BLOCKED'::text as status,
         p.id::text as object_id,
         pg_catalog.jsonb_build_object('date',p.date,'opponent',p.opponent,
           'competition_id',p.competition_id,
           'has_tactical_analysis',p.pre_ai_analysis is not null,
           'pre_ai_analysis_md5',pg_catalog.md5(coalesce(p.pre_ai_analysis::text,'null')))
           as details
  from public.partidos p where p.club_team_season_id is null
  union all
  select 'PARTIDO_CTS_INVALIDO', 'BLOCKED', match_row.id::text,
         pg_catalog.jsonb_build_object(
           'club_team_season_id',match_row.club_team_season_id)
  from public.partidos match_row
  left join public.club_team_seasons cts
    on cts.id = match_row.club_team_season_id
  where match_row.club_team_season_id is not null and cts.id is null
  union all
  select 'OWNER_CANDIDATES',
         case when count(*) > 0 then 'REVIEW' else 'BLOCKED' end,
         'public.club_memberships',
         pg_catalog.jsonb_build_object('distinct_owner_user_count',count(*),
           'permanent_app_owner_identified',false)
  from owner_candidates
  union all
  select 'OWNER_HISTORICAL_ACCESS',
         case when cts.club_exists and cts.team_in_club and cts.season_in_club
           and exists (
           select 1 from public.club_memberships membership
           where membership.club_id = cts.club_id
             and membership.role = 'owner' and membership.is_active
         ) then 'REVIEW' else 'BLOCKED' end,
         cts.id::text,
         pg_catalog.jsonb_build_object('club_id',cts.club_id,
           'team_id',cts.team_id, 'season_id',cts.season_id,
           'club_exists',cts.club_exists,
           'team_in_club',cts.team_in_club,
           'season_in_club',cts.season_in_club,
           'season_status',cts.season_status,
           'match_count',cts.match_count,
           'permanent_app_owner_identified',false,
           'active_owner_user_ids',(
             select pg_catalog.jsonb_agg(owner_row.user_id order by owner_row.user_id)
             from (
               select distinct membership.user_id
               from public.club_memberships membership
               where membership.club_id = cts.club_id
                 and membership.role = 'owner' and membership.is_active
             ) owner_row))
  from historical_cts cts
  union all
  select 'OWNER_MEMBERSHIP', 'REVIEW', m.id::text,
         pg_catalog.jsonb_build_object('user_id',m.user_id,'club_id',m.club_id,
           'role',m.role,'active',m.is_active)
  from public.club_memberships m where m.role = 'owner'
  union all
  select 'POLICY_COUNT',
         case when count(*) = 4 then 'REVIEW' else 'BLOCKED' end,
         'public.partidos',
         pg_catalog.jsonb_build_object('count',count(*))
  from policy_rows
  union all
  select 'POLICY', 'REVIEW', p.polname,
         pg_catalog.jsonb_build_object('command',p.command_code,
           'permissive',p.polpermissive,
           'roles',(select pg_catalog.jsonb_agg(case when role.oid = 0::oid then 'PUBLIC'
                else coalesce((select rolname from pg_catalog.pg_roles where oid = role.oid),role.oid::text) end)
                from pg_catalog.unnest(p.polroles) as role(oid)),
           'using',p.using_expr,'with_check',p.check_expr)
  from policy_rows p
  union all
  select 'FUNCTION_REQUIRED',
         case when pg_catalog.to_regprocedure(expected.signature) is null
           then 'BLOCKED' else 'REVIEW' end,
         expected.signature,
         pg_catalog.jsonb_build_object(
           'exists',pg_catalog.to_regprocedure(expected.signature) is not null)
  from (values
    ('public.is_app_staff()'),
    ('public.current_membership()'),
    ('public.can_read_club_team_season(uuid)'),
    ('public.can_write_club_team_season(uuid)'),
    ('public.can_read_match(uuid)'),
    ('public.can_write_match(uuid)')
  ) as expected(signature)
  union all
  select 'FUNCTION', 'REVIEW', r.proname || '(' || r.arguments || ')',
         pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(r.proowner),
           'security_definer',r.prosecdef,'volatility',r.provolatile::text,
           'search_path',r.proconfig,'source_md5',pg_catalog.md5(r.prosrc),
           'execute_authenticated',pg_catalog.has_function_privilege('authenticated',r.oid,'EXECUTE'),
           'execute_anon',pg_catalog.has_function_privilege('anon',r.oid,'EXECUTE'),
           'definition',r.definition)
  from routine_rows r
  union all
  select 'SECURITY_DEFINER_MATCH_ROUTE',
         case when routine.proname = 'mutate_match_substitution_atomic'
                   and routine.prosrc ilike '%is_app_staff%'
                   and routine.prosrc not ilike '%can_write_match%'
              then 'BLOCKED' else 'REVIEW' end,
         routine.proname || '(' ||
           pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')',
         pg_catalog.jsonb_build_object(
           'owner',pg_catalog.pg_get_userbyid(routine.proowner),
           'search_path',routine.proconfig,
           'execute_authenticated',pg_catalog.has_function_privilege(
             'authenticated',routine.oid,'EXECUTE'),
           'execute_anon',pg_catalog.has_function_privilege(
             'anon',routine.oid,'EXECUTE'),
           'mentions_is_app_staff',routine.prosrc ilike '%is_app_staff%',
           'mentions_can_write_match',routine.prosrc ilike '%can_write_match%',
           'source_md5',pg_catalog.md5(routine.prosrc),
           'definition',pg_catalog.pg_get_functiondef(routine.oid),
           'classification','Textual candidate; review the deployed function body')
  from pg_catalog.pg_proc routine
  join pg_catalog.pg_namespace namespace
    on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public' and routine.prosecdef
    and routine.prosrc ~* '(partidos|partido_[a-z_]+|match_[a-z_]+)'
  union all
  select 'TRIGGER_COUNT', 'REVIEW', 'public.partidos',
         pg_catalog.jsonb_build_object('count',count(*))
  from pg_catalog.pg_trigger t
  where t.tgrelid = pg_catalog.to_regclass('public.partidos')
    and not t.tgisinternal
  union all
  select 'TRIGGER', 'REVIEW', t.tgname,
         pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_triggerdef(t.oid),
           'enabled',t.tgenabled::text)
  from pg_catalog.pg_trigger t
  where t.tgrelid = pg_catalog.to_regclass('public.partidos') and not t.tgisinternal
  union all
  select 'GRANT', 'REVIEW', role_name.name,
         pg_catalog.jsonb_build_object('select',pg_catalog.has_table_privilege(role_name.name,'public.partidos','SELECT'),
           'insert',pg_catalog.has_table_privilege(role_name.name,'public.partidos','INSERT'),
           'update',pg_catalog.has_table_privilege(role_name.name,'public.partidos','UPDATE'),
           'delete',pg_catalog.has_table_privilege(role_name.name,'public.partidos','DELETE'),
           'truncate',pg_catalog.has_table_privilege(role_name.name,'public.partidos','TRUNCATE'),
           'trigger',pg_catalog.has_table_privilege(role_name.name,'public.partidos','TRIGGER'))
  from (values ('authenticated'),('anon'),('service_role')) as role_name(name)
  where pg_catalog.to_regrole(role_name.name) is not null
)
select finding,status,object_id,details from rows order by finding,object_id;
