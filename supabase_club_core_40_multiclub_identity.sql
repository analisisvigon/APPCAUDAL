-- NEXO CLUB - Multiclub 01. Instalacion manual, una sola vez.
-- Aditiva: no cambia current_membership(), helpers, RLS ni datos.
-- Ejecutar solo despues de revisar el preflight y antes de crear otra membresia.

begin;

create function public.my_access_contexts_v1()
returns table (
  membership_id uuid,
  club_id uuid,
  user_id uuid,
  role text,
  jugador_id uuid,
  is_active boolean,
  club_name text,
  contexts jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    membership.id,
    membership.club_id,
    membership.user_id,
    membership.role,
    membership.jugador_id,
    membership.is_active,
    club.name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'club_team_season_id', relation.id,
          'club_id', relation.club_id,
          'team_id', relation.team_id,
          'season_id', relation.season_id,
          'team_name', legacy_team.name,
          'team_code', team.code,
          'team_crest', legacy_team.crest,
          'season_label', season.label,
          'season_is_active', season.is_active,
          'season_status', season.status
        ) order by season.starts_on desc, team.code, relation.id
      )
      from public.club_team_seasons relation
      join public.club_teams team
        on team.id = relation.team_id and team.club_id = relation.club_id
      join public.equipos_rivales legacy_team on legacy_team.id = team.id
      join public.club_seasons season
        on season.id = relation.season_id and season.club_id = relation.club_id
      where relation.club_id = membership.club_id
        and membership.role in ('owner', 'admin', 'staff')
        and public.can_read_club_team_season(relation.id)
    ), '[]'::jsonb) as contexts
  from public.club_memberships membership
  join public.clubs club on club.id = membership.club_id
  where membership.user_id = auth.uid()
    and membership.is_active
  order by club.name, membership.id;
$function$;

comment on function public.my_access_contexts_v1() is
  'Membresias activas de auth.uid() y contextos de lectura verificados por can_read_club_team_season; no sustituye current_membership().';

alter function public.my_access_contexts_v1() owner to postgres;
revoke all on function public.my_access_contexts_v1() from public, anon, authenticated;
grant execute on function public.my_access_contexts_v1() to authenticated;

commit;
