-- Multiclub 02, fase A. Instalacion manual despues del preflight.
-- Solo crea un vinculo explicito y helpers de autorizacion. No inserta vinculos,
-- no cambia datos, RLS legacy, current_membership() ni la rama PLAYER.
-- NO cierra por si sola el acceso directo a jugadores/partidos.
begin;

do $preconditions$
begin
  if to_regclass('public.jugadores') is null
     or to_regclass('public.player_team_memberships') is null
     or to_regclass('public.club_team_season_players') is null
     or to_regclass('public.club_team_seasons') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Faltan relaciones o helpers canonicos; no instalar';
  end if;
  if to_regclass('public.legacy_jugador_cts_links_v1') is not null
     or to_regprocedure('public.can_read_legacy_jugador_v1(uuid,uuid,uuid)') is not null
     or to_regprocedure('public.can_write_legacy_jugador_v1(uuid,uuid,uuid)') is not null then
    raise exception 'Objetos de fase A ya existentes; revisar antes de reinstalar';
  end if;
end
$preconditions$;

-- Una ficha legacy solo puede atribuirse a una pertenencia CTS revisada.
-- Si la ficha sirve para mas de una temporada, se necesita separar la ficha
-- antes del corte: no se inventa una temporada a partir de un nombre o fecha.
create table public.legacy_jugador_cts_links_v1 (
  jugador_id uuid primary key references public.jugadores(id) on delete cascade,
  club_team_season_player_id uuid not null
    references public.club_team_season_players(id) on delete restrict,
  asserted_at timestamptz not null default now()
);
alter table public.legacy_jugador_cts_links_v1 owner to postgres;
alter table public.legacy_jugador_cts_links_v1 enable row level security;
revoke all on public.legacy_jugador_cts_links_v1 from public, anon, authenticated;
create index legacy_jugador_cts_links_v1_ctsp_idx
  on public.legacy_jugador_cts_links_v1 (club_team_season_player_id);

-- Recibe los valores DE LA FILA evaluada por RLS. Un cambio posterior de
-- global_player_id o membership_id no puede reutilizar la autorizacion vieja.
create function public.can_read_legacy_jugador_v1(
  p_jugador_id uuid, p_global_player_id uuid, p_membership_id uuid
)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(
    auth.uid() is not null
    and p_jugador_id is not null
    and p_global_player_id is not null
    and p_membership_id is not null
    and exists (
      select 1
      from public.legacy_jugador_cts_links_v1 binding
      join public.club_team_season_players roster
        on roster.id = binding.club_team_season_player_id
       and roster.voided_at is null
      join public.club_team_seasons relation
        on relation.id = roster.club_team_season_id
      join public.player_team_memberships stage
        on stage.id = p_membership_id
       and stage.player_id = p_global_player_id
       and stage.team_id = relation.team_id
      where binding.jugador_id = p_jugador_id
        and roster.player_id = p_global_player_id
        and public.can_read_club_team_season(relation.id)
    ), false
  );
$function$;

create function public.can_write_legacy_jugador_v1(
  p_jugador_id uuid, p_global_player_id uuid, p_membership_id uuid
)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(
    auth.uid() is not null
    and p_jugador_id is not null
    and p_global_player_id is not null
    and p_membership_id is not null
    and exists (
      select 1
      from public.legacy_jugador_cts_links_v1 binding
      join public.club_team_season_players roster
        on roster.id = binding.club_team_season_player_id
       and roster.voided_at is null
      join public.club_team_seasons relation
        on relation.id = roster.club_team_season_id
      join public.player_team_memberships stage
        on stage.id = p_membership_id
       and stage.player_id = p_global_player_id
       and stage.team_id = relation.team_id
      where binding.jugador_id = p_jugador_id
        and roster.player_id = p_global_player_id
        and public.can_write_club_team_season(relation.id)
    ), false
  );
$function$;

alter function public.can_read_legacy_jugador_v1(uuid,uuid,uuid) owner to postgres;
alter function public.can_write_legacy_jugador_v1(uuid,uuid,uuid) owner to postgres;
revoke all on function public.can_read_legacy_jugador_v1(uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.can_write_legacy_jugador_v1(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.can_read_legacy_jugador_v1(uuid,uuid,uuid)
  to authenticated;
grant execute on function public.can_write_legacy_jugador_v1(uuid,uuid,uuid)
  to authenticated;

commit;
