-- EXCLUSIVO PARA UN PROYECTO NUEVO DE ENSAYO. NO EJECUTAR EN PRODUCCION.
-- Ejecutar manualmente despues del preflight y de crear los cinco usuarios.
-- Solo nombres y partidos ficticios; ninguna fila procede de produccion.
begin;
do $seed$
declare
  a constant uuid := '040b0000-0000-4000-8000-000000000001';
  b constant uuid := '040b0000-0000-4000-8000-000000000002';
  ta constant uuid := '040b0000-0000-4000-8000-000000000011';
  tb constant uuid := '040b0000-0000-4000-8000-000000000012';
  sa constant uuid := '040b0000-0000-4000-8000-000000000021';
  sb constant uuid := '040b0000-0000-4000-8000-000000000022';
  ca constant uuid := '040b0000-0000-4000-8000-000000000031';
  cb constant uuid := '040b0000-0000-4000-8000-000000000032';
  pa constant uuid := '040b0000-0000-4000-8000-000000000041';
  pb constant uuid := '040b0000-0000-4000-8000-000000000042';
  ja constant uuid := '040b0000-0000-4000-8000-000000000051';
  jb constant uuid := '040b0000-0000-4000-8000-000000000052';
  owner_id uuid; staff_a_id uuid; staff_b_id uuid; outsider_id uuid; player_id uuid;
  ma uuid; mb uuid; stage_a uuid; stage_b uuid; roster_a uuid; roster_b uuid;
begin
  if auth.uid() is not null then raise exception 'SQL Editor sin JWT de usuario requerido'; end if;
  if to_regclass('public.nexoclub_04c_staging_guard') is null then
    raise exception 'Falta marcador 04C de proyecto de ensayo vacio';
  end if;
  if not exists (select 1 from public.nexoclub_04c_staging_guard
                 where marker = 'EMPTY_FIXTURE_04B_ONLY') then
    raise exception 'Marcador 04C invalido';
  end if;
  if (select count(*) from auth.users) <> 5
    or (select count(*) from auth.users where email in (
      'owner-04b@example.invalid', 'staff-a-04b@example.invalid',
      'staff-b-04b@example.invalid', 'outsider-04b@example.invalid',
      'player-04b@example.invalid')) <> 5 then
    raise exception 'Solo se permiten cinco cuentas ficticias 04B';
  end if;
  if exists (select 1 from public.clubs)
    or exists (select 1 from public.club_memberships)
    or exists (select 1 from public.club_team_seasons)
    or exists (select 1 from public.players_database)
    or exists (select 1 from public.equipos_rivales)
    or exists (select 1 from public.jugadores)
    or exists (select 1 from public.partidos) then
    raise exception 'El seed 04B requiere base deportiva vacia';
  end if;
  if to_regprocedure('public.my_cts_jugadores_v1(uuid)') is null
    or to_regprocedure('public.my_cts_matches_v1(uuid)') is null
    or to_regclass('public.legacy_jugador_cts_links_v1') is null then
    raise exception 'Faltan migraciones CTS';
  end if;
  select id into owner_id from auth.users where email='owner-04b@example.invalid';
  select id into staff_a_id from auth.users where email='staff-a-04b@example.invalid';
  select id into staff_b_id from auth.users where email='staff-b-04b@example.invalid';
  select id into outsider_id from auth.users where email='outsider-04b@example.invalid';
  select id into player_id from auth.users where email='player-04b@example.invalid';
  if owner_id is null or staff_a_id is null or staff_b_id is null
    or outsider_id is null or player_id is null then
    raise exception 'Crear primero los cinco usuarios ficticios';
  end if;
  if exists(select 1 from public.clubs where id in (a,b) or name in ('ENSAYO 04B A','ENSAYO 04B B'))
    or exists(select 1 from public.equipos_rivales where id in (ta,tb)) then
    raise exception 'Fixture ya presente: no duplicar ni sobrescribir';
  end if;
  -- Este indice legacy impide un segundo equipo propio. Cambio SOLO en ensayo.
  drop index if exists public.equipos_rivales_one_own_club_uidx;
  insert into public.clubs(id,name) values (a,'ENSAYO 04B A'),(b,'ENSAYO 04B B');
  insert into public.equipos_rivales(id,name,system,team_kind) values
    (ta,'Equipo ficticio Ámbar','4-4-2','own'),
    (tb,'Equipo ficticio Azul','4-3-3','own');
  insert into public.club_teams(id,club_id,code) values
    (ta,a,'ambar'),(tb,b,'azul');
  insert into public.club_seasons(id,club_id,code,label,starts_on,ends_on,is_active,status)
  values (sa,a,'2099','2099/2100',date '2099-07-01',date '2100-06-30',true,'open'),
         (sb,b,'2099','2099/2100',date '2099-07-01',date '2100-06-30',true,'open');
  insert into public.club_team_seasons(id,club_id,team_id,season_id) values
    (ca,a,ta,sa),(cb,b,tb,sb);
  insert into public.club_memberships(club_id,user_id,role,is_active) values
    (a,owner_id,'owner',true),(b,owner_id,'owner',true),
    (a,staff_a_id,'staff',true),(b,staff_b_id,'staff',true);
  -- El usuario externo no recibe membresia. PLAYER recibe solo su ficha A.
  insert into public.players_database(id,name) values
    (pa,'FICCIÓN Ámbar 04B'),(pb,'FICCIÓN Azul 04B');
  insert into public.player_team_memberships(player_id,team_id,season,is_current)
    values(pa,ta,'2099/2100',true) returning id into stage_a;
  insert into public.player_team_memberships(player_id,team_id,season,is_current)
    values(pb,tb,'2099/2100',true) returning id into stage_b;
  insert into public.jugadores(id,name,number,position,foot,image,global_player_id,membership_id,active_in_squad)
    values(ja,'FICCIÓN Ámbar 04B',4,'Defensa','','',pa,stage_a,true),
          (jb,'FICCIÓN Azul 04B',8,'Centrocampista','','',pb,stage_b,true);
  select id into ma from public.club_memberships where club_id=a and user_id=owner_id;
  select id into mb from public.club_memberships where club_id=b and user_id=owner_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.club_team_season_players(club_team_season_id,player_id,created_by_membership_id)
    values(ca,pa,ma) returning id into roster_a;
  insert into public.club_team_season_players(club_team_season_id,player_id,created_by_membership_id)
    values(cb,pb,mb) returning id into roster_b;
  insert into public.legacy_jugador_cts_links_v1(jugador_id,club_team_season_player_id)
    values(ja,roster_a),(jb,roster_b);
  insert into public.partidos(id,date,opponent,opponent_crest,is_home,status,club_team_season_id)
    values('040b0000-0000-4000-8000-000000000061',date '2099-09-01','Rival ficticio Ámbar','',true,'Previa',ca),
          ('040b0000-0000-4000-8000-000000000062',date '2099-09-02','Rival ficticio Azul','',true,'Previa',cb);
  insert into public.club_memberships(club_id,user_id,role,jugador_id,is_active)
    values(a,player_id,'player',ja,true);
  perform set_config('request.jwt.claim.sub','',true);
end $seed$;
commit;
