-- PROPUESTA MANUAL. No ejecutada. Revisar verificador y probar antes de instalar.
-- Incorporacion CTS: NO traslado/cierre del equipo global de origen.
begin;
set local lock_timeout='5s';
create function public.incorporate_global_player_cts_v1(p_cts_id uuid,p_player_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  club uuid; team uuid; label text; status text; actor uuid; role_name text;
  profile public.players_database%rowtype;
  roster public.club_team_season_players%rowtype;
  stage uuid; ficha uuid; n integer; result_status text := 'linked';
begin
  if auth.uid() is null or p_player_id is null or p_cts_id is null
    or public.can_write_club_team_season(p_cts_id) is not true then
    raise exception 'CTS_WRITE_DENIED' using errcode='42501';
  end if;
  select c.club_id,c.team_id,s.label,s.status into club,team,label,status
    from public.club_team_seasons c join public.club_seasons s on s.id=c.season_id and s.club_id=c.club_id
    join public.club_teams t on t.id=c.team_id and t.club_id=c.club_id
    join public.equipos_rivales e on e.id=t.id and e.team_kind='own'
    where c.id=p_cts_id for update of s;
  if not found or status is distinct from 'open' or nullif(btrim(label),'') is null then
    raise exception 'CTS_WRITE_DENIED' using errcode='42501';
  end if;
  select m.id,m.role into actor,role_name from public.club_memberships m
    where m.club_id=club and m.user_id=auth.uid() and m.is_active
    and m.role in ('owner','admin','staff') order by m.id limit 1 for share of m;
  if actor is null then raise exception 'CTS_WRITE_DENIED' using errcode='42501'; end if;
  if role_name='staff' then
    perform 1 from public.club_team_season_permissions p where p.membership_id=actor
      and p.club_id=club and p.club_team_season_id=p_cts_id for share of p;
    if not found then raise exception 'CTS_WRITE_DENIED' using errcode='42501'; end if;
  end if;
  if public.can_write_club_team_season(p_cts_id) is not true then
    raise exception 'CTS_WRITE_DENIED' using errcode='42501';
  end if;
  -- Mismo bloqueo que el enlace 03B; fila global serializa incorporaciones.
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text,1));
  select * into profile from public.players_database where id=p_player_id for update;
  if not found then raise exception 'SOURCE_PLAYER_ACCESS_REQUIRED' using errcode='42501'; end if;
  -- Perfiles canonicos: exigir acceso a todos sus CTS. Perfiles de scouting:
  -- permitir solo procedencia rival acreditada, nunca fichas propias huerfanas.
  if exists(select 1 from public.club_team_season_players r where r.player_id=p_player_id
      and public.can_read_club_team_season(r.club_team_season_id) is not true)
    or exists(select 1 from public.jugadores j where j.global_player_id=p_player_id
      and not exists(select 1 from public.legacy_jugador_cts_links_v1 l
        join public.club_team_season_players r on r.id=l.club_team_season_player_id
        where l.jugador_id=j.id and r.player_id=p_player_id))
    or exists(select 1 from public.player_team_memberships m
      left join public.equipos_rivales e on e.id=m.team_id where m.player_id=p_player_id
      and (e.id is null or (e.team_kind='own' and not exists(
        select 1 from public.club_team_season_players r join public.club_team_seasons c on c.id=r.club_team_season_id
        where r.player_id=p_player_id and c.team_id=m.team_id))))
    or (not exists(select 1 from public.club_team_season_players r where r.player_id=p_player_id)
      and not exists(select 1 from public.player_team_memberships m join public.equipos_rivales e on e.id=m.team_id
        where m.player_id=p_player_id and e.team_kind='rival')) then
    raise exception 'SOURCE_PLAYER_ACCESS_REQUIRED' using errcode='42501';
  end if;
  select count(*) into n from public.club_team_season_players r
    where r.player_id=p_player_id and r.club_team_season_id=p_cts_id and r.voided_at is null;
  if n>1 then raise exception 'CTS_LINK_REVIEW_REQUIRED'; end if;
  if n=1 then
    select * into roster from public.club_team_season_players r
      where r.player_id=p_player_id and r.club_team_season_id=p_cts_id and r.voided_at is null for update;
    if roster.has_departed or roster.left_on is not null then raise exception 'CTS_PLAYER_DEPARTED'; end if;
    select count(*),min(j.id::text)::uuid,min(j.membership_id::text)::uuid into n,ficha,stage
      from public.legacy_jugador_cts_links_v1 l join public.jugadores j on j.id=l.jugador_id
      join public.player_team_memberships m on m.id=j.membership_id and m.player_id=p_player_id
        and m.team_id=team and m.season=label
      where l.club_team_season_player_id=roster.id and j.global_player_id=p_player_id and j.active_in_squad;
    if n<>1 then raise exception 'CTS_LINK_REVIEW_REQUIRED'; end if;
    result_status:='already_linked';
  else
    -- Nunca reutilizar ni modificar una etapa antigua de otra temporada.
    select count(*),min(m.id::text)::uuid into n,stage from public.player_team_memberships m
      where m.player_id=p_player_id and m.team_id=team and m.season=label and m.end_date is null;
    if n>1 then raise exception 'CTS_LINK_REVIEW_REQUIRED'; end if;
    if stage is null then
      insert into public.player_team_memberships(player_id,team_id,season,is_current)
        values(p_player_id,team,label,not exists(select 1 from public.player_team_memberships m
          where m.player_id=p_player_id and m.is_current)) returning id into stage;
    end if;
    if exists(select 1 from public.jugadores j where j.membership_id=stage) then
      raise exception 'CTS_LINK_REVIEW_REQUIRED';
    end if;
    ficha:=gen_random_uuid();
    insert into public.jugadores(id,name,shirt_name,dob,number,position,foot,image,global_player_id,membership_id,active_in_squad)
      values(ficha,profile.name,profile.shirt_name,profile.dob,0,
        coalesce((select case pos.position_key when 'goalkeeper' then 'Portero'
          when 'defender' then 'Defensa' when 'midfielder' then 'Centrocampista'
          when 'forward' then 'Delantero' else '' end from public.player_positions pos
          where pos.player_id=p_player_id and pos.position_type='natural'
          order by pos.is_primary desc,pos.id limit 1),''),coalesce(profile.foot,''),
        coalesce(profile.photo_url,''),p_player_id,stage,true);
    insert into public.club_team_season_players(club_team_season_id,player_id,created_by_membership_id)
      values(p_cts_id,p_player_id,actor) returning * into roster;
    insert into public.legacy_jugador_cts_links_v1(jugador_id,club_team_season_player_id) values(ficha,roster.id);
    insert into public.legacy_own_player_migration(legacy_player_id,global_player_id,membership_id,match_basis,review_status)
      values(ficha,p_player_id,stage,'cts_existing_profile_link','confirmed');
  end if;
  return jsonb_build_object('status',result_status,'ctsId',p_cts_id,'playerId',p_player_id,
    'ownPlayerId',ficha,'membershipId',stage,'clubTeamSeasonPlayerId',roster.id);
end $fn$;
alter function public.incorporate_global_player_cts_v1(uuid,uuid) owner to postgres;
revoke all on function public.incorporate_global_player_cts_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.incorporate_global_player_cts_v1(uuid,uuid) to authenticated;
commit;
