-- SOLO LECTURA. Una salida JSON exportable; no instala funciones ni lee fichas.
-- Ejecutar como administrador. Compartir el JSON completo, no una captura truncada.
-- Incluye archivos historicos sin FK: necesarios para no conservar datos borrados.
with recursive roots(oid) as (
  select to_regclass('public.'||name)::oid from unnest(array[
    'players_database','jugadores','jugadores_rivales','player_team_memberships',
    'club_team_season_players','fine_subjects','fines','fine_payments',
    'planned_session_player_roster','planned_session_player_availability',
    'planned_session_distributions','planned_session_audit_events',
    'planned_session_deletion_archive_v1','roster_departure_audit_v1',
    'player_merge_history','partido_eventos_sustitucion','club_memberships']) name
), related(oid) as (
  select oid from roots where oid is not null
  union
  select c.conrelid from pg_constraint c join related r on r.oid=c.confrelid where c.contype='f'
), targets(oid) as (
  select oid from related
  union
  -- Las referencias JSON, texto y arrays no necesariamente tienen FK.
  select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and exists(
    select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and (a.attname ~ '(player|jugador|snapshot|roster|lineup|callup|captain|scorer|assistant|diagram|board|payload|data)'
        or a.atttypid in ('jsonb'::regtype,'json'::regtype,'uuid[]'::regtype)))
), trigger_functions(oid) as (
  select distinct t.tgfoid from pg_trigger t where not t.tgisinternal and t.tgrelid in(select oid from targets)
), report as (
  select 'TABLE' as kind,c.oid::regclass::text as object_name,
    jsonb_build_object('kind',c.relkind,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'inherits',c.relhassubclass) as detail
  from pg_class c where c.oid in(select oid from targets)
  union all
  select 'COLUMN',a.attrelid::regclass::text||'.'||a.attname,
    jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
      'default',pg_get_expr(d.adbin,d.adrelid),'comment',col_description(a.attrelid,a.attnum))
  from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid in(select oid from targets) and a.attnum>0 and not a.attisdropped
  union all
  select 'CONSTRAINT',c.conrelid::regclass::text||'.'||c.conname,
    jsonb_build_object('definition',pg_get_constraintdef(c.oid),'validated',c.convalidated)
  from pg_constraint c where c.conrelid in(select oid from targets) or c.confrelid in(select oid from targets)
  union all
  select 'TRIGGER',t.tgrelid::regclass::text||'.'||t.tgname,
    jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text)
  from pg_trigger t where not t.tgisinternal and t.tgrelid in(select oid from targets)
  union all
  select 'FUNCTION',p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),
    'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig)
  from pg_proc p where p.oid in(select oid from trigger_functions)
    or (p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in (
      'delete_own_player_atomic_v1','current_membership','has_club_role','can_write_club_team_season',
      'can_read_club_team_season','depart_roster_player_v1','delete_planned_session_v1'))
  union all
  select 'RULE',r.ev_class::regclass::text||'.'||r.rulename,jsonb_build_object('definition',pg_get_ruledef(r.oid))
  from pg_rewrite r where r.ev_class in(select oid from targets)
  union all
  select 'POLICY',p.polrelid::regclass::text||'.'||p.polname,
    jsonb_build_object('command',p.polcmd,'roles',p.polroles,'permissive',p.polpermissive,
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
  from pg_policy p where p.polrelid in(select oid from targets)
  union all
  select 'INDEX',i.indexrelid::regclass::text,jsonb_build_object('definition',pg_get_indexdef(i.indexrelid))
  from pg_index i where i.indrelid in(select oid from targets)
)
select jsonb_build_object('version','player-erasure-inventory-v1','captured_at',now(),
  'postgres',current_setting('server_version'),'objects',
  coalesce(jsonb_agg(jsonb_build_object('kind',kind,'object',object_name,'detail',detail)
    order by kind,object_name),'[]'::jsonb)) as inventory
from report;
