-- Multiclub 04C. SOLO LECTURA de catalogos; ejecutar MANUALMENTE en
-- produccion y compartir SOLO los resultados estructurales. No lee filas de
-- tablas deportivas, auth.users, claves, tokens ni valores de configuracion.
-- Si un default o definicion de trigger contiene un literal sensible,
-- redactarlo antes de compartir el resultado.

-- Tablas que las RPC y el seed 04B necesitan, incluidas las dependencias
-- legacy citadas por las migraciones incrementales. Anotar las ausentes.
with targets(name) as (values
 ('clubs'), ('club_memberships'), ('club_member_permissions'),
 ('club_teams'), ('club_seasons'), ('club_team_seasons'),
 ('club_team_season_permissions'), ('club_team_season_players'),
 ('players_database'), ('player_team_memberships'), ('player_positions'),
 ('player_sources'), ('player_scouting_traits'),
 ('legacy_own_player_migration'), ('legacy_jugador_cts_links_v1'),
 ('equipos_rivales'), ('jugadores'), ('partidos'),
 ('jugadores_rivales'), ('equipo_rival_alineacion'),
 ('equipo_rival_banquillo'), ('partido_alineacion_slots'),
 ('partido_eventos_sustitucion')
)
select name, to_regclass(format('public.%I', name)) is not null as exists_in_database
from targets order by name;

-- Contrato de columnas para el nucleo legacy y tablas auxiliares que la
-- migracion global_players o la fase 03A esperan encontrar.
select c.relname as table_name, a.attnum as ordinal, a.attname as column_name,
       format_type(a.atttypid, a.atttypmod) as data_type,
       a.attnotnull as not_null, a.attidentity as identity_kind,
       a.attgenerated as generated_kind,
       pg_get_expr(d.adbin, d.adrelid) as default_expression
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
where n.nspname = 'public' and c.relname in (
 'equipos_rivales','jugadores','partidos','jugadores_rivales',
 'equipo_rival_alineacion','equipo_rival_banquillo',
 'partido_alineacion_slots','partido_eventos_sustitucion')
order by c.relname, a.attnum;

-- PK, FK, CHECK, UNIQUE, indices, RLS y permisos de las tablas base.
select c.relname as table_name, con.conname, con.contype,
       con.convalidated, pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
 'equipos_rivales','jugadores','partidos','jugadores_rivales',
 'equipo_rival_alineacion','equipo_rival_banquillo',
 'partido_alineacion_slots','partido_eventos_sustitucion')
order by c.relname, con.conname;

select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in (
 'equipos_rivales','jugadores','partidos','jugadores_rivales',
 'equipo_rival_alineacion','equipo_rival_banquillo',
 'partido_alineacion_slots','partido_eventos_sustitucion')
order by tablename, indexname;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
 'equipos_rivales','jugadores','partidos','jugadores_rivales',
 'equipo_rival_alineacion','equipo_rival_banquillo',
 'partido_alineacion_slots','partido_eventos_sustitucion')
order by c.relname;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
  and tablename in (
   'equipos_rivales','jugadores','partidos','jugadores_rivales',
   'equipo_rival_alineacion','equipo_rival_banquillo',
   'partido_alineacion_slots','partido_eventos_sustitucion')
order by tablename, policyname;

-- Solo firmas y definiciones de disparadores, sin leer cuerpos de funciones.
-- Las funciones que no esten versionadas en el repositorio requeriran un
-- segundo paso de metadatos revisado antes de construir el esquema base.
select c.relname as table_name, t.tgname as trigger_name,
       t.tgenabled as enabled, pg_get_triggerdef(t.oid, true) as definition,
       t.tgfoid::regprocedure as function_signature,
       md5(pg_get_functiondef(t.tgfoid)) as function_definition_hash
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
 'equipos_rivales','jugadores','partidos','jugadores_rivales',
 'equipo_rival_alineacion','equipo_rival_banquillo',
 'partido_alineacion_slots','partido_eventos_sustitucion')
  and not t.tgisinternal
order by c.relname, t.tgname;

-- Tipos enum usados por las tres tablas (si los hay).
select distinct t.typname as enum_name, e.enumsortorder, e.enumlabel
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
join pg_type t on t.oid = a.atttypid and t.typtype = 'e'
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and c.relname in (
 'equipos_rivales','jugadores','partidos','jugadores_rivales',
 'equipo_rival_alineacion','equipo_rival_banquillo',
 'partido_alineacion_slots','partido_eventos_sustitucion')
order by enum_name, e.enumsortorder;

-- Estas dos RPC existentes son reemplazadas por 03A. Su cuerpo forma parte
-- del contrato y no esta definido en las migraciones base del repositorio.
-- Solo devuelve DDL de funciones, nunca registros. Revisar literales antes
-- de compartir; si aparece algun dato sensible, detenerse y redactarlo.
select p.oid::regprocedure as routine, p.prosecdef as security_definer,
       p.proowner::regrole as owner, p.proconfig as settings,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.oid in (
 to_regprocedure('public.get_match_substitution_events(uuid)'),
 to_regprocedure('public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)'))
order by p.oid::regprocedure::text;
