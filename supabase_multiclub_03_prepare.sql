-- Multiclub 03, fase A. Instalacion MANUAL despues del preflight.
-- Aditiva: no cambia datos, tablas, RLS ni la rama PLAYER. Acota la RPC
-- existente de plantilla y las dos RPC de sustituciones, conservando ACL.
begin;

do $preflight$
declare
  target text;
  routine record;
begin
  if auth.uid() is not null then
    raise exception 'Instalar sin JWT de usuario';
  end if;
  if to_regprocedure('public.my_access_contexts_v1()') is null
    or to_regprocedure('public.my_cts_roster_links_v1(uuid)') is null
    or to_regprocedure('public.can_read_club_team_season(uuid)') is null
    or to_regprocedure('public.can_write_club_team_season(uuid)') is null
    or to_regprocedure('public.can_read_match(uuid)') is null
    or to_regprocedure('public.can_write_match(uuid)') is null
    or to_regclass('public.legacy_jugador_cts_links_v1') is null then
    raise exception 'Faltan objetos de Multiclub 01/02/02B';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.my_cts_roster_links_v1(uuid)')
      and p.prosecdef and p.proowner = 'postgres'::regrole
      and 'search_path=pg_catalog' = any(p.proconfig)
  ) then
    raise exception 'Contrato de my_cts_roster_links_v1 inesperado';
  end if;
  for target in select unnest(array[
    'get_match_substitution_events(uuid)',
    'mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)'
  ]) loop
    select p.prosrc, p.prosecdef, p.proowner,
           'search_path=pg_catalog' = any(p.proconfig) as safe_path
      into routine
    from pg_proc p where p.oid = to_regprocedure('public.' || target);
    if not found or not routine.prosecdef
      or routine.proowner <> 'postgres'::regrole or not routine.safe_path
      or (length(routine.prosrc) - length(replace(routine.prosrc,
          'if not public.is_app_staff() then', '')))
         / length('if not public.is_app_staff() then') <> 1 then
      raise exception 'Contrato de sustituciones inesperado: %', target;
    end if;
  end loop;
end
$preflight$;

-- Repara la proyeccion 02: la version anterior buscaba fichas por
-- jugador+equipo y podia mezclar temporadas del mismo equipo.
create or replace function public.my_cts_roster_links_v1(p_club_team_season_id uuid)
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
  select roster.id, roster.player_id,
    case when ficha.ficha_count = 1 then ficha.ficha_ids[1] else null::uuid end,
    ficha.ficha_count, roster.joined_on, roster.left_on, roster.has_departed
  from public.club_team_season_players roster
  join public.club_team_seasons cts on cts.id = roster.club_team_season_id
  left join lateral (
    select count(*) as ficha_count, array_agg(jugador.id order by jugador.id) as ficha_ids
    from public.legacy_jugador_cts_links_v1 binding
    join public.jugadores jugador on jugador.id = binding.jugador_id
      and jugador.global_player_id = roster.player_id
    join public.player_team_memberships stage on stage.id = jugador.membership_id
      and stage.player_id = jugador.global_player_id and stage.team_id = cts.team_id
    where binding.club_team_season_player_id = roster.id
  ) ficha on true
  where auth.uid() is not null
    and p_club_team_season_id = cts.id
    and public.can_read_club_team_season(cts.id)
    and roster.voided_at is null
  order by roster.player_id, roster.joined_on nulls first, roster.id;
$function$;

-- Proyeccion exacta: NO usa coincidencia por nombre ni por equipo global.
create function public.my_cts_jugadores_v1(p_club_team_season_id uuid)
returns setof public.jugadores
language sql stable security definer set search_path = pg_catalog
as $function$
  select ficha.*
  from public.legacy_jugador_cts_links_v1 binding
  join public.jugadores ficha on ficha.id = binding.jugador_id
  join public.club_team_season_players roster
    on roster.id = binding.club_team_season_player_id
   and roster.voided_at is null
   and roster.player_id = ficha.global_player_id
  join public.club_team_seasons cts on cts.id = roster.club_team_season_id
  join public.player_team_memberships stage
    on stage.id = ficha.membership_id
   and stage.player_id = ficha.global_player_id
   and stage.team_id = cts.team_id
  where auth.uid() is not null
    and cts.id = p_club_team_season_id
    and public.can_read_club_team_season(cts.id)
  order by ficha.name, ficha.id;
$function$;

-- Valida que una referencia de hijo pertenece al MISMO CTS que el partido.
-- El permiso del actor se evalua separadamente con can_read/write_match().
create function public.legacy_jugador_in_match_cts_v1(
  p_jugador_id uuid, p_partido_id uuid
)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(exists (
    select 1
    from public.partidos partido
    join public.legacy_jugador_cts_links_v1 binding
      on binding.jugador_id = p_jugador_id
    join public.club_team_season_players roster
      on roster.id = binding.club_team_season_player_id
     and roster.voided_at is null
     and roster.club_team_season_id = partido.club_team_season_id
    join public.jugadores ficha
      on ficha.id = binding.jugador_id
     and ficha.global_player_id = roster.player_id
    join public.player_team_memberships stage
      on stage.id = ficha.membership_id
     and stage.player_id = ficha.global_player_id
    join public.club_team_seasons cts
      on cts.id = roster.club_team_season_id
     and cts.team_id = stage.team_id
    where partido.id = p_partido_id
      and auth.uid() is not null
      and public.can_read_match(partido.id)
  ), false);
$function$;

create function public.legacy_jugador_in_cts_v1(
  p_jugador_id uuid, p_club_team_season_id uuid
)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(exists (
    select 1
    from public.legacy_jugador_cts_links_v1 binding
    join public.club_team_season_players roster
      on roster.id = binding.club_team_season_player_id
     and roster.voided_at is null
    join public.jugadores ficha
      on ficha.id = binding.jugador_id
     and ficha.global_player_id = roster.player_id
    join public.player_team_memberships stage
      on stage.id = ficha.membership_id
     and stage.player_id = ficha.global_player_id
    join public.club_team_seasons cts
      on cts.id = roster.club_team_season_id
     and cts.team_id = stage.team_id
    where binding.jugador_id = p_jugador_id
      and cts.id = p_club_team_season_id
      and auth.uid() is not null
      and public.can_read_club_team_season(cts.id)
  ), false);
$function$;

create function public.can_read_match_snapshot_v1(p_snapshot_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(exists (
    select 1 from public.partido_snapshots_tacticos snapshot
    where snapshot.id = p_snapshot_id
      and public.can_read_match(snapshot.partido_id)
  ), false);
$function$;

create function public.can_write_match_snapshot_v1(p_snapshot_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(exists (
    select 1 from public.partido_snapshots_tacticos snapshot
    where snapshot.id = p_snapshot_id
      and public.can_write_match(snapshot.partido_id)
  ), false);
$function$;

create function public.legacy_jugador_in_snapshot_cts_v1(
  p_jugador_id uuid, p_snapshot_id uuid
)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(exists (
    select 1 from public.partido_snapshots_tacticos snapshot
    where snapshot.id = p_snapshot_id
      and public.legacy_jugador_in_match_cts_v1(p_jugador_id, snapshot.partido_id)
  ), false);
$function$;

alter function public.my_cts_jugadores_v1(uuid) owner to postgres;
alter function public.legacy_jugador_in_match_cts_v1(uuid,uuid) owner to postgres;
alter function public.legacy_jugador_in_cts_v1(uuid,uuid) owner to postgres;
alter function public.can_read_match_snapshot_v1(uuid) owner to postgres;
alter function public.can_write_match_snapshot_v1(uuid) owner to postgres;
alter function public.legacy_jugador_in_snapshot_cts_v1(uuid,uuid) owner to postgres;
revoke all on function public.my_cts_jugadores_v1(uuid) from public, anon, authenticated;
revoke all on function public.legacy_jugador_in_match_cts_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.legacy_jugador_in_cts_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.can_read_match_snapshot_v1(uuid) from public, anon, authenticated;
revoke all on function public.can_write_match_snapshot_v1(uuid) from public, anon, authenticated;
revoke all on function public.legacy_jugador_in_snapshot_cts_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.my_cts_jugadores_v1(uuid) to authenticated;
grant execute on function public.legacy_jugador_in_match_cts_v1(uuid,uuid) to authenticated;
grant execute on function public.legacy_jugador_in_cts_v1(uuid,uuid) to authenticated;
grant execute on function public.can_read_match_snapshot_v1(uuid) to authenticated;
grant execute on function public.can_write_match_snapshot_v1(uuid) to authenticated;
grant execute on function public.legacy_jugador_in_snapshot_cts_v1(uuid,uuid) to authenticated;

-- Parche quirurgico: preserva el resto del cuerpo, firma, owner y ACL.
-- El cambio se hace en la misma transaccion; un fallo revierte todo.
do $guards$
declare
  target text;
  helper text;
  definition text;
begin
  for target, helper in select * from (values
    ('get_match_substitution_events(uuid)', 'can_read_match'),
    ('mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)', 'can_write_match')
  ) as expected(signature, helper_name) loop
    definition := pg_get_functiondef(to_regprocedure('public.' || target));
    execute replace(definition,
      'if not public.is_app_staff() then',
      'if not public.' || helper || '(p_partido_id) then');
    if position('if not public.' || helper || '(p_partido_id) then' in
        (select prosrc from pg_proc where oid = to_regprocedure('public.' || target))) = 0 then
      raise exception 'No se actualizo el guard de %', target;
    end if;
  end loop;
end
$guards$;

commit;
