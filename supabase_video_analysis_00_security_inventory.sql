-- NEXO CLUB / Videoanalisis Fase 0. Solo lectura, una tabla exportable a CSV.
-- Las marcas textuales indican REVISION; no constituyen una prueba de RLS efectivo.
-- Ejecutar con una cuenta administrativa de consulta. No simula identidades de usuarios.

with relevant_tables as (
  select c.oid, n.nspname as schema_name, c.relname as table_name,
         c.relrowsecurity, c.relforcerowsecurity, c.relowner,
         c.relacl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname in ('partidos', 'club_team_seasons', 'club_seasons',
      'club_memberships', 'club_team_season_permissions')
), policy_rows as (
  select t.*, p.polname, p.polcmd::text as command_code, p.polpermissive,
         p.polroles,
         pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expression,
         pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as check_expression
  from relevant_tables t join pg_catalog.pg_policy p on p.polrelid = t.oid
), routine_rows as (
  select p.oid, n.nspname as schema_name, p.proname, p.prosecdef,
         p.proowner, p.proconfig, p.proacl,
         pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
         pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
), relevant_routines as (
  select * from routine_rows r
  where r.proname in ('can_read_club_team_season','can_write_club_team_season',
    'can_read_match','can_write_match')
    or r.definition ~* '(pre_ai_analysis|partidos|tacticalEvidenceValidationsV1|matchPlanWorkspaceV1)'
), report as (
  select 'TABLE_RLS'::text as finding,
         case when t.table_name = 'partidos' and not t.relrowsecurity then 'BLOCKED' else 'REVIEW' end::text as severity,
         t.schema_name || '.' || t.table_name as object_name,
         pg_catalog.jsonb_build_object('rls_enabled', t.relrowsecurity,
           'force_rls', t.relforcerowsecurity,
           'owner', pg_catalog.pg_get_userbyid(t.relowner),
           'policy_count', (select count(*) from policy_rows p where p.oid = t.oid)) as details
  from relevant_tables t
  union all
  select 'POLICY', 'REVIEW', p.schema_name || '.' || p.table_name || ':' || p.polname,
         pg_catalog.jsonb_build_object('command', p.command_code,
           'mode', case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
           'roles', (select pg_catalog.jsonb_agg(case when policy_role.role_oid = 0::oid then 'PUBLIC'
             else coalesce((select rolname from pg_catalog.pg_roles where oid = policy_role.role_oid), policy_role.role_oid::text) end)
             from pg_catalog.unnest(p.polroles) as policy_role(role_oid)),
           'using', p.using_expression, 'with_check', p.check_expression,
           'uses_is_app_staff', coalesce(p.using_expression, '') ilike '%is_app_staff%'
             or coalesce(p.check_expression, '') ilike '%is_app_staff%',
           'mentions_cts_or_match_helper',
             (coalesce(p.using_expression, '') || ' ' || coalesce(p.check_expression, ''))
               ~* '(can_read_match|can_write_match|can_read_club_team_season|can_write_club_team_season|club_team_season_id)')
  from policy_rows p
  union all
  select 'EFFECTIVE_TABLE_PRIVILEGE', 'REVIEW',
         t.schema_name || '.' || t.table_name || ':' || role_name.name,
         pg_catalog.jsonb_build_object('select', pg_catalog.has_table_privilege(role_name.name, t.oid, 'SELECT'),
           'insert', pg_catalog.has_table_privilege(role_name.name, t.oid, 'INSERT'),
           'update', pg_catalog.has_table_privilege(role_name.name, t.oid, 'UPDATE'),
           'delete', pg_catalog.has_table_privilege(role_name.name, t.oid, 'DELETE'),
           'truncate', pg_catalog.has_table_privilege(role_name.name, t.oid, 'TRUNCATE'),
           'trigger', pg_catalog.has_table_privilege(role_name.name, t.oid, 'TRIGGER'),
           'maintain', pg_catalog.has_table_privilege(role_name.name, t.oid, 'MAINTAIN'))
  from relevant_tables t
  cross join (values ('authenticated'), ('anon')) as role_name(name)
  where exists (select 1 from pg_catalog.pg_roles where rolname = role_name.name)
  union all
  select 'PUBLIC_TABLE_GRANT', 'REVIEW', t.schema_name || '.' || t.table_name,
         pg_catalog.jsonb_build_object('privileges',
           (select pg_catalog.jsonb_agg(a.privilege_type order by a.privilege_type)
            from pg_catalog.aclexplode(coalesce(t.relacl,
              pg_catalog.acldefault('r', t.relowner))) a where a.grantee = 0))
  from relevant_tables t
  union all
  select 'ROUTINE', 'REVIEW',
         r.schema_name || '.' || r.proname || '(' || r.arguments || ')',
         pg_catalog.jsonb_build_object('security_definer', r.prosecdef,
           'owner', pg_catalog.pg_get_userbyid(r.proowner),
           'search_path', (select pg_catalog.jsonb_agg(config.setting)
                           from pg_catalog.unnest(r.proconfig) as config(setting)
                           where config.setting like 'search_path=%'),
           'execute_authenticated', case when exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
             then pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') else null end,
           'execute_anon', case when exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
             then pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE') else null end,
           'execute_public_direct', exists (
             select 1 from pg_catalog.aclexplode(coalesce(r.proacl,
               pg_catalog.acldefault('f', r.proowner))) acl
             where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'),
           'execute_service_role', case when exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
             then pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') else null end,
           'mentions_is_app_staff', r.definition ilike '%is_app_staff%',
           'mentions_cts_or_match_helper', r.definition ~* '(can_read_match|can_write_match|can_read_club_team_season|can_write_club_team_season|club_team_season_id)',
           'mentions_pre_ai_analysis', r.definition ilike '%pre_ai_analysis%')
  from relevant_routines r
  union all
  select 'REQUIRED_OBJECT', case when pg_catalog.to_regclass('public.' || expected.name) is null then 'BLOCKED' else 'INFO' end,
         'public.' || expected.name,
         pg_catalog.jsonb_build_object('exists', pg_catalog.to_regclass('public.' || expected.name) is not null)
  from (values ('partidos'), ('club_team_seasons'), ('club_seasons'),
    ('club_memberships'), ('club_team_season_permissions')) as expected(name)
  union all
  select 'REQUIRED_HELPER', case when pg_catalog.to_regprocedure('public.' || expected.signature) is null then 'BLOCKED' else 'INFO' end,
         'public.' || expected.signature,
         pg_catalog.jsonb_build_object('exists', pg_catalog.to_regprocedure('public.' || expected.signature) is not null)
  from (values ('can_read_club_team_season(uuid)'), ('can_write_club_team_season(uuid)'),
    ('can_read_match(uuid)'), ('can_write_match(uuid)')) as expected(signature)
)
select finding, severity, object_name, details
from report order by finding, object_name;
