-- APPCAUDAL / Sesiones 01 / SOLO STAGING O CLON AISLADO.
-- BLOQUEO INTENCIONAL: no quitar hasta verificar manualmente la URL/proyecto
-- de staging. Este archivo NO debe ejecutarse en produccion.
begin;
do $staging_gate$
begin
  raise exception 'STAGING ONLY: comprobar proyecto aislado y retirar este bloqueo manualmente';
end
$staging_gate$;

-- Tras retirar el bloqueo SOLO en staging, ejecutar el archivo completo.
-- Todos los datos de prueba estan dentro de una transaccion que termina ROLLBACK.
-- Si una asercion falla, ejecutar ROLLBACK manualmente antes de continuar.
set local statement_timeout = '30s';

do $fixture$
declare
  v_club uuid := 'ca0da100-0000-4000-8000-000000000001';
  v_relation uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_team uuid := '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
  v_owner uuid;
  v_owner_membership uuid;
  v_staff uuid;
  v_staff_membership uuid;
  v_player_user uuid;
  v_player_id uuid;
  v_second_player_id uuid;
  v_unstaged_player_id uuid;
  v_starts date;
  v_ends date;
begin
  if current_user in ('anon','authenticated') then
    raise exception 'Fixture debe prepararse antes de SET ROLE';
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid=
      'public.club_team_season_players'::regclass and not t.tgisinternal
      and t.tgname='club_team_season_players_guard' and t.tgenabled='O')<>1
    or (select count(*) from pg_trigger t where t.tgrelid=
      'public.club_team_season_players'::regclass and not t.tgisinternal)<>1
    or (select count(*) from pg_trigger t where t.tgrelid=
      'public.club_team_season_permissions'::regclass and not t.tgisinternal
      and t.tgname='guard_club_team_season_permission_mutation' and t.tgenabled='O')<>1
    or (select count(*) from pg_trigger t where t.tgrelid=
      'public.club_team_season_permissions'::regclass and not t.tgisinternal)<>1
    or exists (select 1 from pg_trigger t where t.tgrelid=
      'public.club_seasons'::regclass and not t.tgisinternal) then
    raise exception 'Triggers de staging inesperados; revisar posibles efectos externos';
  end if;
  if not exists (select 1 from pg_proc p where
      p.oid='public.guard_club_team_season_player_mutation()'::regprocedure
      and p.prosecdef and p.proowner='postgres'::regrole
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and md5(regexp_replace(lower(p.prosrc),'[[:space:]]','','g'))=
        'c44e06581eb706161ae094456b67c11c') then
    raise exception 'Guard Sesiones 01 de staging no coincide con el aprobado';
  end if;
  select s.starts_on,s.ends_on into strict v_starts,v_ends
  from public.club_team_seasons cts
  join public.club_seasons s on s.id=cts.season_id and s.club_id=cts.club_id
  where cts.id=v_relation and cts.club_id=v_club and cts.team_id=v_team
    and s.status='open';
  if v_ends-v_starts < 20 then
    raise exception 'Temporada demasiado corta para los casos de fechas de esta bateria';
  end if;
  if (select count(*) from public.club_team_season_players)<>0 then
    raise exception 'Usar clon con tabla de pertenencias vacia; no tocar datos ya cargados';
  end if;
  select user_id,id into strict v_owner,v_owner_membership
  from public.club_memberships
  where club_id=v_club and role='owner' and is_active;
  select m.user_id,m.id into v_staff,v_staff_membership
  from public.club_memberships m
  where m.club_id=v_club and m.role='staff' and m.is_active
    and not exists (select 1 from public.club_team_season_permissions p
      where p.membership_id=m.id and p.club_team_season_id=v_relation)
  order by m.id limit 1;
  if v_staff is null then
    raise exception 'No hay staff activo sin asignacion en el clon';
  end if;
  select user_id into v_player_user from public.club_memberships
  where club_id=v_club and role='player' and is_active
  order by id limit 1;
  if v_player_user is null or v_player_user in (v_owner,v_staff) then
    raise exception 'No hay player activo y distinto';
  end if;
  select stage.player_id into v_player_id
  from public.jugadores j
  join public.player_team_memberships stage on stage.id=j.membership_id
  where stage.team_id=v_team and stage.is_current and j.active_in_squad
    and j.global_player_id=stage.player_id
  order by stage.player_id limit 1;
  if v_player_id is null then
    raise exception 'No hay ficha/etapa deportiva candidata; no inventar jugador';
  end if;
  select stage.player_id into v_second_player_id
  from public.jugadores j
  join public.player_team_memberships stage on stage.id=j.membership_id
  where stage.team_id=v_team and stage.is_current and j.active_in_squad
    and j.global_player_id=stage.player_id and stage.player_id<>v_player_id
  order by stage.player_id limit 1;
  if v_second_player_id is null then
    raise exception 'Falta una segunda ficha para probar limites desconocidos sin solapar fixtures';
  end if;
  select p.id into v_unstaged_player_id from public.players_database p
  where not exists (select 1 from public.player_team_memberships stage
    where stage.player_id=p.id and stage.team_id=v_team)
  order by p.id limit 1;
  perform set_config('appcaudal.sessions01.owner',v_owner::text,true);
  perform set_config('appcaudal.sessions01.owner_membership',v_owner_membership::text,true);
  perform set_config('appcaudal.sessions01.staff',v_staff::text,true);
  perform set_config('appcaudal.sessions01.staff_membership',v_staff_membership::text,true);
  perform set_config('appcaudal.sessions01.player_user',v_player_user::text,true);
  perform set_config('appcaudal.sessions01.player_id',v_player_id::text,true);
  perform set_config('appcaudal.sessions01.second_player_id',v_second_player_id::text,true);
  perform set_config('appcaudal.sessions01.unstaged_player_id',
    coalesce(v_unstaged_player_id::text,''),true);
  perform set_config('appcaudal.sessions01.starts',v_starts::text,true);
  perform set_config('appcaudal.sessions01.ends',v_ends::text,true);
  raise notice 'FIXTURE PASS: owner, staff sin asignacion, player y ficha real del clon disponibles';
end
$fixture$;

set local role authenticated;
do $owner_seed$
declare
  v_owner uuid := current_setting('appcaudal.sessions01.owner')::uuid;
  v_player uuid := current_setting('appcaudal.sessions01.player_id')::uuid;
  v_relation uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_start date := current_setting('appcaudal.sessions01.starts')::date;
  v_base uuid;
  v_rejected boolean;
begin
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_owner,'role','authenticated')::text,true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_owner
     or public.can_write_club_team_season(v_relation) is not true then
    raise exception 'OWNER FAIL: identidad o helper de escritura';
  end if;
  insert into public.club_team_season_players
    (club_team_season_id,player_id,joined_on,left_on,has_departed)
  values (v_relation,v_player,null,null,false) returning id into v_base;
  if not exists (select 1 from public.club_team_season_players
      where id=v_base and joined_on is null and left_on is null and not has_departed
        and created_by_membership_id=
          current_setting('appcaudal.sessions01.owner_membership')::uuid) then
    raise exception 'OWNER FAIL: alta con fecha desconocida o actor no acreditados';
  end if;
  update public.club_team_season_players set joined_on=v_start+1 where id=v_base;
  if not exists (select 1 from public.club_team_season_players
      where id=v_base and joined_on=v_start+1) then
    raise exception 'OWNER FAIL: no se completo la fecha desconocida';
  end if;
  v_rejected := false;
  begin
    update public.club_team_season_players set joined_on=v_start+2 where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'OWNER FAIL: se sobrescribio fecha acreditada'; end if;
  perform set_config('appcaudal.sessions01.base',v_base::text,true);
  raise notice 'OWNER SEED PASS: fecha NULL, creador, completado e inmutabilidad';
end
$owner_seed$;

do $staff_unassigned$
declare
  v_staff uuid := current_setting('appcaudal.sessions01.staff')::uuid;
  v_relation uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_base uuid := current_setting('appcaudal.sessions01.base')::uuid;
  v_player uuid := current_setting('appcaudal.sessions01.player_id')::uuid;
  v_rejected boolean := false;
  v_updated bigint;
begin
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_staff,'role','authenticated')::text,true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_staff
     or public.can_read_club_team_season(v_relation) is distinct from false
     or public.can_write_club_team_season(v_relation) is distinct from false then
    raise exception 'STAFF NO ASIGNADO FAIL: contexto o helpers';
  end if;
  if exists (select 1 from public.club_team_season_players where id=v_base) then
    raise exception 'STAFF NO ASIGNADO FAIL: pudo leer la fila activa';
  end if;
  begin
    insert into public.club_team_season_players (club_team_season_id,player_id)
    values (v_relation,v_player);
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'STAFF NO ASIGNADO FAIL: pudo insertar'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players set has_departed=true where id=v_base;
    get diagnostics v_updated = row_count;
    v_rejected := v_updated=0;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'STAFF NO ASIGNADO FAIL: pudo actualizar'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players
      set void_reason='Anulacion prohibida sin asignacion' where id=v_base;
    get diagnostics v_updated = row_count;
    v_rejected := v_updated=0;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'STAFF NO ASIGNADO FAIL: pudo anular'; end if;
  raise notice 'STAFF NO ASIGNADO PASS: sin lectura, INSERT, UPDATE ni anulacion';
end
$staff_unassigned$;

do $owner_cases$
declare
  v_owner uuid := current_setting('appcaudal.sessions01.owner')::uuid;
  v_player uuid := current_setting('appcaudal.sessions01.player_id')::uuid;
  v_second_player uuid := current_setting('appcaudal.sessions01.second_player_id')::uuid;
  v_unstaged text := current_setting('appcaudal.sessions01.unstaged_player_id');
  v_relation uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_start date := current_setting('appcaudal.sessions01.starts')::date;
  v_end date := current_setting('appcaudal.sessions01.ends')::date;
  v_base uuid := current_setting('appcaudal.sessions01.base')::uuid;
  v_return uuid;
  v_open uuid;
  v_replacement uuid;
  v_unknown_exit uuid;
  v_rejected boolean;
begin
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_owner,'role','authenticated')::text,true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_owner then
    raise exception 'OWNER CASES FAIL: identidad no restaurada';
  end if;

  v_rejected := false;
  begin
    update public.club_team_season_players
      set has_departed=true,left_on=v_start+1 where id=v_base;
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: salida igual a incorporacion aceptada'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players
      set has_departed=true,left_on=v_start where id=v_base;
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: salida anterior a incorporacion aceptada'; end if;
  update public.club_team_season_players set has_departed=true where id=v_base;
  if not exists (select 1 from public.club_team_season_players
      where id=v_base and has_departed and left_on is null) then
    raise exception 'FAIL: salida conocida sin fecha no representada';
  end if;
  v_rejected := false;
  begin
    insert into public.club_team_season_players
      (club_team_season_id,player_id,joined_on)
    values (v_relation,v_player,v_start+8);
  exception when exclusion_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: regreso con salida desconocida aceptado'; end if;
  update public.club_team_season_players set left_on=v_start+5 where id=v_base;
  if not exists (select 1 from public.club_team_season_players
      where id=v_base
        and daterange(joined_on,left_on,'[)') @> (v_start+4)
        and not (daterange(joined_on,left_on,'[)') @> (v_start+5))) then
    raise exception 'FAIL: left_on no es limite exclusivo';
  end if;

  v_rejected := false;
  begin
    insert into public.club_team_season_players
      (club_team_season_id,player_id,joined_on,left_on,has_departed)
    values (v_relation,v_player,v_start+4,v_start+6,true);
  exception when exclusion_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: periodo solapado aceptado'; end if;
  insert into public.club_team_season_players
    (club_team_season_id,player_id,joined_on,left_on,has_departed)
  values (v_relation,v_player,v_start+5,v_start+7,true) returning id into v_return;
  insert into public.club_team_season_players
    (club_team_season_id,player_id,joined_on)
  values (v_relation,v_player,v_start+8) returning id into v_open;
  v_rejected := false;
  begin
    insert into public.club_team_season_players
      (club_team_season_id,player_id,joined_on)
    values (v_relation,v_player,v_start+9);
  exception when exclusion_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: dos periodos abiertos simultaneos'; end if;

  v_rejected := false;
  begin
    insert into public.club_team_season_players (club_team_season_id,player_id,joined_on)
    values (v_relation,v_player,v_start-1);
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: fecha anterior a temporada aceptada'; end if;
  v_rejected := false;
  begin
    insert into public.club_team_season_players (club_team_season_id,player_id,joined_on)
    values (v_relation,v_player,v_end+1);
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: fecha posterior a temporada aceptada'; end if;
  if v_unstaged <> '' then
    v_rejected := false;
    begin
      insert into public.club_team_season_players
        (club_team_season_id,player_id,joined_on)
      values (v_relation,v_unstaged::uuid,v_start+1);
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then raise exception 'FAIL: jugador sin etapa deportiva aceptado'; end if;
  else
    raise notice 'PENDING: el clon no contiene identidad global sin etapa en el equipo';
  end if;
  insert into public.club_team_season_players
    (club_team_season_id,player_id,joined_on,left_on,has_departed)
  values (v_relation,v_second_player,null,null,true) returning id into v_unknown_exit;
  if not exists (select 1 from public.club_team_season_players
      where id=v_unknown_exit and joined_on is null and has_departed and left_on is null) then
    raise exception 'FAIL: salida de fecha desconocida mal representada';
  end if;
  v_rejected := false;
  begin
    insert into public.club_team_season_players
      (club_team_season_id,player_id,joined_on)
    values (v_relation,v_second_player,v_start+10);
  exception when exclusion_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: limite desconocido permitio solapamiento'; end if;

  v_rejected := false;
  begin
    update public.club_team_season_players set void_reason='x' where id=v_base;
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: motivo insuficiente aceptado'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players set voided_at=now() where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: cliente falsifico voided_at'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players
      set voided_by_membership_id=current_setting('appcaudal.sessions01.owner_membership')::uuid
      where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: cliente falsifico actor de anulacion'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players set player_id=gen_random_uuid() where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: cliente modifico player_id'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players
      set created_by_membership_id=current_setting('appcaudal.sessions01.owner_membership')::uuid
      where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: cliente modifico procedencia de auditoria'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players
      set club_team_season_id=v_relation where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: cliente modifico identidad de vinculacion'; end if;
  v_rejected := false;
  begin
    delete from public.club_team_season_players where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: cliente pudo DELETE'; end if;

  update public.club_team_season_players
    set void_reason='Rectificacion administrativa de prueba' where id=v_base;
  if not exists (select 1 from public.club_team_season_players where id=v_base
      and voided_at is not null and void_reason='Rectificacion administrativa de prueba'
      and voided_by_membership_id=
        current_setting('appcaudal.sessions01.owner_membership')::uuid) then
    raise exception 'FAIL: anulacion no fija actor/instante/motivo';
  end if;
  v_rejected := false;
  begin
    update public.club_team_season_players set joined_on=v_start+2 where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: fila anulada se pudo editar'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players
      set void_reason='Segunda anulacion prohibida' where id=v_base;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: doble anulacion aceptada'; end if;
  insert into public.club_team_season_players
    (club_team_season_id,player_id,joined_on,left_on,has_departed)
  values (v_relation,v_player,v_start+1,v_start+5,true) returning id into v_replacement;
  update public.club_team_season_players set void_reason='Fin de caso de retorno'
    where id=v_return;
  update public.club_team_season_players set void_reason='Fin de caso abierto'
    where id=v_open;
  update public.club_team_season_players set void_reason='Fin de caso sin fechas'
    where id=v_unknown_exit;
  perform set_config('appcaudal.sessions01.active_row',v_replacement::text,true);
  raise notice 'OWNER CASES PASS: fechas, solapamiento, retorno, prohibiciones y anulacion trazable';
end
$owner_cases$;

do $grant_staff$
declare
  v_owner uuid := current_setting('appcaudal.sessions01.owner')::uuid;
  v_staff_membership uuid := current_setting('appcaudal.sessions01.staff_membership')::uuid;
begin
  if auth.uid() is distinct from v_owner then
    raise exception 'GRANT FAIL: owner no activo en contexto';
  end if;
  insert into public.club_team_season_permissions
    (club_id,club_team_season_id,membership_id)
  values ('ca0da100-0000-4000-8000-000000000001'::uuid,
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid,v_staff_membership);
  raise notice 'GRANT STAGING PASS: asignacion temporal exclusivamente dentro del ROLLBACK';
end
$grant_staff$;

do $staff_assigned$
declare
  v_staff uuid := current_setting('appcaudal.sessions01.staff')::uuid;
  v_player uuid := current_setting('appcaudal.sessions01.player_id')::uuid;
  v_start date := current_setting('appcaudal.sessions01.starts')::date;
  v_relation uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_active uuid := current_setting('appcaudal.sessions01.active_row')::uuid;
  v_base uuid := current_setting('appcaudal.sessions01.base')::uuid;
  v_staff_row uuid;
  v_rejected boolean := false;
begin
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_staff,'role','authenticated')::text,true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_staff
    or public.can_read_club_team_season(v_relation) is not true
    or public.can_write_club_team_season(v_relation) is not true then
    raise exception 'STAFF ASIGNADO FAIL: identidad o helpers';
  end if;
  if not exists (select 1 from public.club_team_season_players where id=v_active)
     or exists (select 1 from public.club_team_season_players where id=v_base) then
    raise exception 'STAFF ASIGNADO FAIL: fila activa invisible o anulada visible';
  end if;
  insert into public.club_team_season_players
    (club_team_season_id,player_id,joined_on)
  values (v_relation,v_player,v_start+5) returning id into v_staff_row;
  update public.club_team_season_players
    set has_departed=true,left_on=v_start+6 where id=v_staff_row;
  if not exists (select 1 from public.club_team_season_players
      where id=v_staff_row and has_departed and left_on=v_start+6) then
    raise exception 'STAFF ASIGNADO FAIL: escritura de fecha acreditada';
  end if;
  begin
    update public.club_team_season_players
      set void_reason='Anulacion prohibida a staff' where id=v_active;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'STAFF ASIGNADO FAIL: pudo anular'; end if;
  perform set_config('appcaudal.sessions01.staff_row',v_staff_row::text,true);
  raise notice 'STAFF ASIGNADO PASS: lectura y escritura, sin ver anuladas ni poder anular';
end
$staff_assigned$;

do $player$
declare
  v_user uuid := current_setting('appcaudal.sessions01.player_user')::uuid;
  v_relation uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_player uuid := current_setting('appcaudal.sessions01.player_id')::uuid;
  v_rejected boolean := false;
  v_updated bigint;
  v_active uuid := current_setting('appcaudal.sessions01.active_row')::uuid;
begin
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_user,'role','authenticated')::text,true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_user
    or public.can_read_club_team_season(v_relation) is distinct from false
    or public.can_write_club_team_season(v_relation) is distinct from false
    or exists (select 1 from public.club_team_season_players where club_team_season_id=v_relation) then
    raise exception 'PLAYER FAIL: acceso general o contexto incorrecto';
  end if;
  begin
    insert into public.club_team_season_players (club_team_season_id,player_id)
    values (v_relation,v_player);
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'PLAYER FAIL: pudo insertar'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players set has_departed=true where id=v_active;
    get diagnostics v_updated = row_count;
    v_rejected := v_updated=0;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'PLAYER FAIL: pudo actualizar'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players
      set void_reason='Anulacion prohibida a player' where id=v_active;
    get diagnostics v_updated = row_count;
    v_rejected := v_updated=0;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'PLAYER FAIL: pudo anular'; end if;
  raise notice 'PLAYER PASS: sin SELECT, INSERT, UPDATE ni anulacion general';
end
$player$;

set local role anon;
do $anon$
declare
  v_denied boolean := false;
  v_insert_denied boolean := false;
  v_count bigint;
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  if current_user <> 'anon' or auth.uid() is not null then
    raise exception 'ANON FAIL: contexto';
  end if;
  begin
    select count(*) into v_count from public.club_team_season_players;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'ANON FAIL: SELECT permitido'; end if;
  begin
    insert into public.club_team_season_players (club_team_season_id,player_id)
    values ('961970c8-0fcf-4c45-94d6-787647619c61'::uuid,
      current_setting('appcaudal.sessions01.player_id')::uuid);
  exception when insufficient_privilege then v_insert_denied := true;
  end;
  if not v_insert_denied then raise exception 'ANON FAIL: INSERT permitido'; end if;
  raise notice 'ANON PASS: SELECT e INSERT denegados';
end
$anon$;

-- Cierre de TEMPORADA CLONADA, nunca de la real. ROLLBACK revierte tambien esto.
reset role;
do $close_clone$
begin
  if current_user <> session_user then
    raise exception 'No se restauro el rol privilegiado del SQL Editor';
  end if;
  update public.club_seasons
  set status='closed',closed_at=now(),
      closed_by_membership_id=current_setting('appcaudal.sessions01.owner_membership')::uuid
  where id='a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid
    and status='open';
  if not found then raise exception 'No se pudo cerrar la temporada clonada'; end if;
end
$close_clone$;
set local role authenticated;
do $closed$
declare
  v_owner uuid := current_setting('appcaudal.sessions01.owner')::uuid;
  v_relation uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_active uuid := current_setting('appcaudal.sessions01.active_row')::uuid;
  v_player uuid := current_setting('appcaudal.sessions01.player_id')::uuid;
  v_rejected boolean;
  v_updated bigint;
begin
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_owner,'role','authenticated')::text,true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_owner
    or public.can_read_club_team_season(v_relation) is not true
    or public.can_write_club_team_season(v_relation) is distinct from false
    or not exists (select 1 from public.club_team_season_players where id=v_active) then
    raise exception 'CLOSED FAIL: lectura historica o helper de escritura';
  end if;
  v_rejected := false;
  begin
    insert into public.club_team_season_players (club_team_season_id,player_id)
    values (v_relation,v_player);
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'CLOSED FAIL: INSERT aceptado'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players set has_departed=true where id=v_active;
    get diagnostics v_updated = row_count;
    v_rejected := v_updated=0;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'CLOSED FAIL: UPDATE aceptado'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players
      set void_reason='Anulacion prohibida tras cierre' where id=v_active;
    get diagnostics v_updated = row_count;
    v_rejected := v_updated=0;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'CLOSED FAIL: anulacion aceptada'; end if;
  v_rejected := false;
  begin
    delete from public.club_team_season_players where id=v_active;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'CLOSED FAIL: DELETE aceptado'; end if;
  v_rejected := false;
  begin
    update public.club_team_season_players set voided_at=now() where id=v_active;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'CLOSED FAIL: metadatos arbitrarios aceptados'; end if;
  raise notice 'CLOSED PASS: lectura historica y rechazo de INSERT/UPDATE/anulacion/DELETE/auditoria';
end
$closed$;

do $closed_staff$
declare
  v_staff uuid := current_setting('appcaudal.sessions01.staff')::uuid;
  v_relation uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_active uuid := current_setting('appcaudal.sessions01.active_row')::uuid;
  v_rejected boolean := false;
  v_updated bigint;
begin
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_staff,'role','authenticated')::text,true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_staff
    or public.can_read_club_team_season(v_relation) is not true
    or public.can_write_club_team_season(v_relation) is distinct from false
    or not exists (select 1 from public.club_team_season_players where id=v_active) then
    raise exception 'CLOSED STAFF FAIL: no conserva lectura sin escritura';
  end if;
  begin
    update public.club_team_season_players
      set void_reason='No permitido en temporada cerrada' where id=v_active;
    get diagnostics v_updated = row_count;
    v_rejected := v_updated=0;
  exception when insufficient_privilege then v_rejected := true;
  end;
  if not v_rejected then raise exception 'CLOSED STAFF FAIL: pudo escribir'; end if;
  raise notice 'CLOSED STAFF PASS: SELECT historico autorizado y UPDATE rechazado';
end
$closed_staff$;

rollback;

-- Prueba posterior, exclusivamente de lectura. Debe coincidir con el preflight.
select
  case when (select count(*) from public.club_team_season_players)=0
    and (select status from public.club_seasons
      where id='a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid)='open'
    then 'STATE_ONLY_NOT_SUITE_PASS_COMPARE_ASSIGNMENTS'
    else 'FAIL_REVISAR_STAGING' end as result,
  (select count(*) from public.club_team_season_players) as remaining_test_rows,
  (select count(*) from public.club_team_season_permissions
    where club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid)
    as assignment_count_to_compare_with_preflight;
