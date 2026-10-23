-- TRANSICION 02. SOLO LECTURA; ejecutar manualmente antes de preparar RPC.
-- Consulta catalogos y presencia estructural, no datos deportivos ni cuentas.
select name, to_regclass(name) is not null as present from (values
  ('public.club_team_seasons'), ('public.club_seasons'), ('public.club_teams'),
  ('public.club_memberships'), ('public.equipos_rivales'),
  ('public.jugadores'), ('public.partidos'),
  ('public.club_team_season_players'), ('public.player_team_memberships'),
  ('public.legacy_jugador_cts_links_v1')
) target(name);

select name, to_regprocedure(name) is not null as present from (values
  ('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),
  ('public.can_write_club_team_season(uuid)'),
  ('public.can_write_match(uuid)'),
  ('public.legacy_jugador_in_cts_v1(uuid,uuid)')
) target(name);

select c.relname as table_name, a.attname as column_name,
       format_type(a.atttypid,a.atttypmod) as data_type, a.attnotnull as not_null
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'public' and (
  (c.relname = 'jugadores' and a.attname in
    ('id','global_player_id','membership_id','name','number','position','foot'))
  or (c.relname = 'partidos' and a.attname in
    ('id','club_team_season_id','date','time','type','round','stadium',
     'opponent','is_home','home_team','away_team','status')))
order by c.relname, a.attname;

-- Contrato actual de escritura y posibles rutas definidoras que deben
-- cerrarse antes de designar el CTS operativo. No devuelve cuerpos de RPC.
select p.oid::regprocedure as routine, p.prosecdef as security_definer,
       p.proowner::regrole as owner,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_executes
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and p.prosrc ~* '(public[.])?(jugadores|partidos|club_team_season_players|player_team_memberships)'
order by p.oid::regprocedure::text;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
  and tablename in ('jugadores','partidos','club_team_season_players')
order by tablename, policyname;
