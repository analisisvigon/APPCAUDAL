-- NEXO CLUB / Videoanalisis 01. SOLO SELECT. Ejecutar antes de revisar el corte.
-- Una tabla para exportar completa a CSV. No incluye texto tactico ni notas.
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
  select 'OWNER_MEMBERSHIP', 'REVIEW', m.id::text,
         pg_catalog.jsonb_build_object('user_id',m.user_id,'club_id',m.club_id,
           'role',m.role,'active',m.is_active)
  from public.club_memberships m where m.role = 'owner'
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
  select 'FUNCTION', 'REVIEW', r.proname || '(' || r.arguments || ')',
         pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(r.proowner),
           'security_definer',r.prosecdef,'volatility',r.provolatile::text,
           'search_path',r.proconfig,'source_md5',pg_catalog.md5(r.prosrc),
           'execute_authenticated',pg_catalog.has_function_privilege('authenticated',r.oid,'EXECUTE'),
           'execute_anon',pg_catalog.has_function_privilege('anon',r.oid,'EXECUTE'),
           'definition',r.definition)
  from routine_rows r
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
           'delete',pg_catalog.has_table_privilege(role_name.name,'public.partidos','DELETE'))
  from (values ('authenticated'),('anon'),('service_role')) as role_name(name)
  where pg_catalog.to_regrole(role_name.name) is not null
)
select finding,status,object_id,details from rows order by finding,object_id;
