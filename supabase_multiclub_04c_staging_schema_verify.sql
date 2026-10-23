-- SOLO LECTURA. Ejecutar MANUALMENTE en el proyecto ENSAYO, despues de
-- reconstruir el esquema y aplicar las migraciones, ANTES del guard/seed.
-- Todos los objetos deben existir. 03C debe seguir ausente.
select object_name, present from (values
 ('clubs', to_regclass('public.clubs') is not null),
 ('club_memberships', to_regclass('public.club_memberships') is not null),
 ('club_teams', to_regclass('public.club_teams') is not null),
 ('club_seasons', to_regclass('public.club_seasons') is not null),
 ('club_team_seasons', to_regclass('public.club_team_seasons') is not null),
 ('club_team_season_permissions', to_regclass('public.club_team_season_permissions') is not null),
 ('club_team_season_players', to_regclass('public.club_team_season_players') is not null),
 ('legacy_jugador_cts_links_v1', to_regclass('public.legacy_jugador_cts_links_v1') is not null),
 ('players_database', to_regclass('public.players_database') is not null),
 ('player_team_memberships', to_regclass('public.player_team_memberships') is not null),
 ('equipos_rivales', to_regclass('public.equipos_rivales') is not null),
 ('jugadores', to_regclass('public.jugadores') is not null),
 ('partidos', to_regclass('public.partidos') is not null),
 ('jugadores_rivales', to_regclass('public.jugadores_rivales') is not null),
 ('equipo_rival_alineacion', to_regclass('public.equipo_rival_alineacion') is not null),
 ('equipo_rival_banquillo', to_regclass('public.equipo_rival_banquillo') is not null),
 ('partido_alineacion_slots', to_regclass('public.partido_alineacion_slots') is not null),
 ('partido_eventos_sustitucion', to_regclass('public.partido_eventos_sustitucion') is not null),
 ('competitions', to_regclass('public.competitions') is not null),
 ('partido_estadisticas_jugador', to_regclass('public.partido_estadisticas_jugador') is not null),
 ('my_access_contexts_v1', to_regprocedure('public.my_access_contexts_v1()') is not null),
 ('my_cts_matches_v1', to_regprocedure('public.my_cts_matches_v1(uuid)') is not null),
 ('my_cts_jugadores_v1', to_regprocedure('public.my_cts_jugadores_v1(uuid)') is not null),
 ('my_cts_roster_links_v1', to_regprocedure('public.my_cts_roster_links_v1(uuid)') is not null),
 ('can_read_club_team_season', to_regprocedure('public.can_read_club_team_season(uuid)') is not null),
 ('can_write_club_team_season', to_regprocedure('public.can_write_club_team_season(uuid)') is not null),
 ('can_read_match', to_regprocedure('public.can_read_match(uuid)') is not null),
 ('can_write_match', to_regprocedure('public.can_write_match(uuid)') is not null),
 ('get_match_substitution_events', to_regprocedure('public.get_match_substitution_events(uuid)') is not null),
 ('mutate_match_substitution_atomic', to_regprocedure('public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)') is not null),
 ('create_own_player_atomic_v2',
   to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is not null),
 ('link_existing_global_player_to_cts_v1',
   to_regprocedure('public.link_existing_global_player_to_cts_v1(uuid,uuid)') is not null),
 ('get_my_player_profile',
   to_regprocedure('public.get_my_player_profile()') is not null)
) checks(object_name, present) order by object_name;

-- Inventario de columnas y restricciones del paquete 04C corregido.
-- Las diez tablas deben conservar exactamente estos recuentos estructurales.
with expected(table_name, columns_expected, constraints_expected) as (values
 ('equipos_rivales',13,3), ('jugadores',22,7),
 ('jugadores_rivales',42,8), ('competitions',12,3),
 ('partidos',123,11), ('partido_estadisticas_jugador',13,4),
 ('partido_alineacion_slots',9,8), ('equipo_rival_alineacion',11,5),
 ('equipo_rival_banquillo',9,5), ('partido_eventos_sustitucion',11,11)
)
select e.table_name, e.columns_expected, e.constraints_expected,
       (select count(*) from pg_attribute a
        where a.attrelid=to_regclass(format('public.%I',e.table_name))
          and a.attnum>0 and not a.attisdropped) as columns_actual,
       (select count(*) from pg_constraint k
        where k.conrelid=to_regclass(format('public.%I',e.table_name))
          and k.convalidated) as constraints_actual
from expected e order by e.table_name;

select
 (select a.atttypid = 'pg_catalog.bool'::regtype and not a.attnotnull
  from pg_attribute a
  where a.attrelid=to_regclass('public.partidos')
    and a.attname='clean_sheet' and not a.attisdropped)
   as corrected_clean_sheet_type_and_nullability,
 (select pg_get_expr(d.adbin,d.adrelid)
  from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  where d.adrelid=to_regclass('public.partidos') and a.attname='clean_sheet')='false'
   as corrected_clean_sheet_default,
 to_regclass('public.equipos_rivales_one_own_club_uidx') is null
   as staging_allows_two_own_teams,
 exists (select 1 from pg_constraint k
         where k.conrelid=to_regclass('public.competitions')
           and k.conname='competitions_key_key' and k.contype='u' and k.convalidated)
   as competition_key_remains_globally_unique;

-- La variante 04C de 03A excluye solo snapshots; los tres helpers que
-- requieren esa tabla deben seguir ausentes en este primer ensayo.
select to_regclass('public.partido_snapshots_tacticos') is null
         as snapshots_out_of_scope,
       to_regprocedure('public.can_read_match_snapshot_v1(uuid)') is null
         as snapshot_read_helper_not_installed,
       to_regprocedure('public.can_write_match_snapshot_v1(uuid)') is null
         as snapshot_write_helper_not_installed,
       to_regprocedure('public.legacy_jugador_in_snapshot_cts_v1(uuid,uuid)') is null
         as snapshot_player_helper_not_installed,
       to_regprocedure('public.legacy_jugador_in_match_cts_v1(uuid,uuid)') is not null
         as match_player_helper_present,
       to_regprocedure('public.legacy_jugador_in_cts_v1(uuid,uuid)') is not null
         as cts_player_helper_present;

select c.relname as table_name, t.tgname as trigger_name,
       t.tgenabled = 'O' as enabled,
       t.tgfoid::regprocedure as function_signature
from pg_trigger t join pg_class c on c.oid=t.tgrelid
where c.oid in (to_regclass('public.jugadores'),
                to_regclass('public.partido_eventos_sustitucion'),
                to_regclass('public.players_database'))
  and not t.tgisinternal and t.tgname in (
    'jugadores_project_global_shirt_name',
    'partido_eventos_sustitucion_updated_at',
    'players_database_sync_shirt_name')
order by c.relname, t.tgname;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       count(p.policyname) as policy_count
from pg_class c join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relname in (
 'jugadores','partidos','club_memberships','club_team_season_players',
 'jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo',
 'partido_estadisticas_jugador','competitions')
group by c.relname,c.relrowsecurity order by c.relname;

-- Contratos de relaciones que usan las RPC y el seed. La consulta informa
-- nombres y definiciones reales; no da por buenas FK ausentes o no validadas.
select child.relname as child_table, k.conname, k.convalidated,
       pg_get_constraintdef(k.oid, true) as definition
from pg_constraint k
join pg_class child on child.oid = k.conrelid
join pg_class parent on parent.oid = k.confrelid
where k.contype = 'f' and child.relnamespace = 'public'::regnamespace
  and ((child.relname = 'partidos' and parent.relname in ('competitions','club_team_seasons'))
    or (child.relname = 'partido_estadisticas_jugador'
        and parent.relname in ('partidos','jugadores'))
    or (child.relname = 'partido_eventos_sustitucion'
        and parent.relname in ('partidos','jugadores')))
order by child.relname, k.conname;

-- S1/S2: el usuario anon debe carecer de privilegios efectivos de tabla.
-- Las politicas legacy para authenticated siguen siendo un riesgo hasta 03C.
select c.relname as table_name,
       has_table_privilege('anon',c.oid,'SELECT') as anon_select,
       has_table_privilege('anon',c.oid,'INSERT') as anon_insert,
       has_table_privilege('anon',c.oid,'UPDATE') as anon_update,
       has_table_privilege('anon',c.oid,'DELETE') as anon_delete,
       has_table_privilege('anon',c.oid,'TRUNCATE') as anon_truncate,
       has_table_privilege('anon',c.oid,'REFERENCES') as anon_references,
       has_table_privilege('anon',c.oid,'TRIGGER') as anon_trigger
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('jugadores','jugadores_rivales',
                    'equipo_rival_alineacion','equipo_rival_banquillo')
order by c.relname;

-- Indicio de que 03C NO se aplico. Comparar las expresiones exactas con el
-- preflight 03; el mero recuento de politicas no acredita seguridad.
select tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname='public'
  and tablename in ('jugadores','partidos')
order by tablename, policyname;

select to_regclass('public.nexoclub_04c_staging_guard') is not null
  as staging_guard_installed;
