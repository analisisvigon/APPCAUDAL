-- Multiclub 02: lecturas deportivas acotadas por CTS. Instalacion manual.
-- No cambia tablas, RLS, current_membership() ni datos. No sustituye aun las
-- rutas legacy de escritura; el frontend no debe activar el selector todavia.

begin;

create function public.my_cts_matches_v1(p_club_team_season_id uuid)
returns setof public.partidos
language sql stable security definer set search_path = pg_catalog
as $function$
  select match_row.*
  from public.partidos match_row
  where auth.uid() is not null
    and p_club_team_season_id is not null
    and public.can_read_club_team_season(p_club_team_season_id)
    and match_row.club_team_season_id = p_club_team_season_id
  order by match_row.date desc, match_row.id;
$function$;

comment on function public.my_cts_matches_v1(uuid) is
  'Partidos de una relacion equipo-temporada autorizada; excluye partidos sin CTS.';

create function public.my_cts_roster_links_v1(p_club_team_season_id uuid)
returns table (
  club_team_season_player_id uuid,
  player_id uuid,
  legacy_jugador_id uuid,
  legacy_ficha_count bigint,
  joined_on date,
  left_on date,
  has_departed boolean
)
language sql stable security definer set search_path = pg_catalog
as $function$
  select
    membership.id,
    membership.player_id,
    case when ficha.ficha_count = 1 then ficha.ficha_ids[1] else null::uuid end,
    ficha.ficha_count,
    membership.joined_on,
    membership.left_on,
    membership.has_departed
  from public.club_team_season_players membership
  join public.club_team_seasons relation
    on relation.id = membership.club_team_season_id
  left join lateral (
    select count(*) as ficha_count, array_agg(jugador.id order by jugador.id) as ficha_ids
    from public.jugadores jugador
    join public.player_team_memberships stage
      on stage.id = jugador.membership_id
     and stage.player_id = jugador.global_player_id
     and stage.team_id = relation.team_id
    where jugador.global_player_id = membership.player_id
  ) ficha on true
  where auth.uid() is not null
    and p_club_team_season_id is not null
    and public.can_read_club_team_season(p_club_team_season_id)
    and membership.club_team_season_id = p_club_team_season_id
    and membership.voided_at is null
  order by membership.player_id, membership.joined_on nulls first, membership.id;
$function$;

comment on function public.my_cts_roster_links_v1(uuid) is
  'Pertenencias canonicas autorizadas y cobertura legacy verificada, sin elegir fichas ambiguas.';

alter function public.my_cts_matches_v1(uuid) owner to postgres;
alter function public.my_cts_roster_links_v1(uuid) owner to postgres;
revoke all on function public.my_cts_matches_v1(uuid) from public, anon, authenticated;
revoke all on function public.my_cts_roster_links_v1(uuid) from public, anon, authenticated;
grant execute on function public.my_cts_matches_v1(uuid) to authenticated;
grant execute on function public.my_cts_roster_links_v1(uuid) to authenticated;

commit;
