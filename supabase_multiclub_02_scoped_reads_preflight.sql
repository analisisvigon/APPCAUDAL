-- Solo lectura. Revisar antes de instalar las dos RPC de Multiclub 02.
-- Ejecutar primero la consulta de objetos; si falta alguno, detenerse.

select object_name, present
from (values
  ('public.my_access_contexts_v1()', to_regprocedure('public.my_access_contexts_v1()') is not null),
  ('public.can_read_club_team_season(uuid)', to_regprocedure('public.can_read_club_team_season(uuid)') is not null),
  ('public.club_team_seasons', to_regclass('public.club_team_seasons') is not null),
  ('public.club_team_season_players', to_regclass('public.club_team_season_players') is not null),
  ('public.player_team_memberships', to_regclass('public.player_team_memberships') is not null),
  ('public.jugadores', to_regclass('public.jugadores') is not null),
  ('public.partidos', to_regclass('public.partidos') is not null)
) checks(object_name, present);

select
  to_regprocedure('public.my_cts_matches_v1(uuid)') is not null as matches_rpc_already_exists,
  to_regprocedure('public.my_cts_roster_links_v1(uuid)') is not null as roster_rpc_already_exists,
  md5(pg_get_functiondef(to_regprocedure('public.current_membership()'))) as legacy_identity_definition_hash;

-- Cobertura global: no publicar el selector si hay partidos sin CTS o fichas
-- activas sin identificador canónico. No se muestran nombres ni datos privados.
select
  (select count(*) from public.partidos where club_team_season_id is null) as matches_without_cts,
  (select count(*) from public.jugadores
   where active_in_squad is true and (global_player_id is null or membership_id is null))
    as active_legacy_players_without_canonical_identity;

-- La relación CTSP puede ser histórica; una ficha legacy actual no debe
-- inferirse automáticamente para otra temporada. Revisar recuentos por CTS.
select relation.id as club_team_season_id,
  (select count(*) from public.club_team_season_players membership
   where membership.club_team_season_id = relation.id and membership.voided_at is null)
    as canonical_roster_links,
  (select count(*) from public.partidos match_row
   where match_row.club_team_season_id = relation.id) as linked_matches
from public.club_team_seasons relation
order by relation.id;

-- Las políticas legacy siguen siendo una dependencia: estas RPC no las cambian.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('jugadores', 'partidos')
order by tablename, policyname;
