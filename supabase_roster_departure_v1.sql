-- PROPUESTA MANUAL: no ejecutada. Revisar primero el verificador.
-- Solo baja CTS. No habilita borrado global ni cambia guards existentes.
begin;
set local lock_timeout='5s';
create table public.roster_departure_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_membership_id uuid not null,
  occurred_at timestamptz not null default now(),
  club_team_season_id uuid not null,
  before_row jsonb not null,
  after_row jsonb not null
);
alter table public.roster_departure_audit_v1 owner to postgres;
alter table public.roster_departure_audit_v1 enable row level security;
revoke all on public.roster_departure_audit_v1 from public,anon,authenticated,service_role;
create function public.guard_roster_departure_audit_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  raise exception 'Auditoria de bajas inmutable' using errcode='42501';
end $fn$;
alter function public.guard_roster_departure_audit_v1() owner to postgres;
revoke all on function public.guard_roster_departure_audit_v1() from public,anon,authenticated,service_role;
create trigger roster_departure_audit_immutable before update or delete
  on public.roster_departure_audit_v1 for each row execute function public.guard_roster_departure_audit_v1();
create trigger roster_departure_audit_no_truncate before truncate
  on public.roster_departure_audit_v1 execute function public.guard_roster_departure_audit_v1();

create function public.depart_roster_player_v1(
  p_jugador_id uuid,p_cts_id uuid,p_confirm boolean,p_left_on date default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  season_status text; club uuid; actor uuid; actor_role text;
  before_row public.club_team_season_players%rowtype;
  after_row public.club_team_season_players%rowtype;
  binding uuid;
begin
  if p_confirm is distinct from true or p_jugador_id is null or p_cts_id is null then
    raise exception 'PLAYER_CONFIRM_REQUIRED' using errcode='22023';
  end if;
  if auth.uid() is null or public.can_write_club_team_season(p_cts_id) is not true then
    raise exception 'PLAYER_CTS_DENIED' using errcode='42501';
  end if;
  select c.club_id,s.status into club,season_status from public.club_team_seasons c
    join public.club_seasons s on s.id=c.season_id and s.club_id=c.club_id
    where c.id=p_cts_id for update of s;
  if not found or season_status is distinct from 'open' then
    raise exception 'SEASON_CLOSED' using errcode='42501';
  end if;
  select m.id,m.role into actor,actor_role from public.club_memberships m
    where m.club_id=club and m.user_id=auth.uid() and m.is_active
      and m.role in ('owner','admin','staff') order by m.id limit 1 for share of m;
  if actor is null then raise exception 'PLAYER_CTS_DENIED' using errcode='42501'; end if;
  if actor_role='staff' then
    perform 1 from public.club_team_season_permissions p where p.membership_id=actor
      and p.club_id=club and p.club_team_season_id=p_cts_id for share of p;
    if not found then raise exception 'PLAYER_CTS_DENIED' using errcode='42501'; end if;
  end if;
  select l.club_team_season_player_id into strict binding
    from public.legacy_jugador_cts_links_v1 l where l.jugador_id=p_jugador_id for share of l;
  select r.* into before_row from public.club_team_season_players r
    join public.jugadores j on j.id=p_jugador_id and j.global_player_id=r.player_id
    where r.id=binding and r.club_team_season_id=p_cts_id and r.voided_at is null for update of r;
  if not found then raise exception 'PLAYER_CTS_LINK_REVIEW_REQUIRED' using errcode='42501'; end if;
  -- Nunca inventar una fecha ni sobrescribir hechos acreditados.
  -- El guard canonico valida fechas, temporada, identidad y permisos otra vez.
  if before_row.has_departed then
    if p_left_on is not null and p_left_on is distinct from before_row.left_on then
      raise exception 'Baja ya registrada con otra fecha' using errcode='40001';
    end if;
  else
    update public.club_team_season_players set has_departed=true,
      left_on=coalesce(p_left_on,left_on) where id=binding returning * into after_row;
    if after_row.has_departed is distinct from true then
      raise exception 'Baja no confirmada';
    end if;
    insert into public.roster_departure_audit_v1
      (actor_user_id,actor_membership_id,club_team_season_id,before_row,after_row)
      values(auth.uid(),actor,p_cts_id,to_jsonb(before_row),to_jsonb(after_row));
  end if;
  return jsonb_build_object('status','departed','jugador_id',p_jugador_id,'cts_id',p_cts_id);
end $fn$;
alter function public.depart_roster_player_v1(uuid,uuid,boolean,date) owner to postgres;
revoke all on function public.depart_roster_player_v1(uuid,uuid,boolean,date) from public,anon,authenticated,service_role;
grant execute on function public.depart_roster_player_v1(uuid,uuid,boolean,date) to authenticated;
-- La RPC antigua mezcla baja y borrado sin contexto CTS: no es un fallback.
revoke all on function public.delete_own_player_atomic_v1(uuid) from public,anon,authenticated,service_role;
commit;
