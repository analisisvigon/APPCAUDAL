-- APPCAUDAL / Sesiones 01 / pruebas de lectura con contexto simulado.
-- PRODUCCION: solo SELECT y SET LOCAL, ninguna escritura en tablas.
-- Los UUID proceden del inventario anterior; el preflight REVALIDA sus roles.
-- SET ROLE + JWT simulado prueba la logica SQL, NO la autenticacion real.
-- Revisar todo el script antes de ejecutarlo. Ejecutarlo completo; termina ROLLBACK.
begin;
set local statement_timeout = '20s';

do $preflight$
declare
  v_club uuid := 'ca0da100-0000-4000-8000-000000000001';
begin
  if current_user = 'authenticated' or current_user = 'anon' then
    raise exception 'Preflight debe consultar memberships antes de SET ROLE';
  end if;
  if (select count(*) from public.club_memberships
      where club_id=v_club and user_id='4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid
        and role='owner' and is_active)<>1
    or (select count(*) from public.club_memberships
      where club_id=v_club and user_id='414427ca-2870-4e46-92e7-ca5133e373fc'::uuid
        and role='staff' and is_active)<>1
    or (select count(*) from public.club_memberships
      where club_id=v_club and user_id='0436e377-83e1-45e9-af9f-74cc017963df'::uuid
        and role='player' and is_active)<>1 then
    raise exception 'Identidades anteriores no revalidadas; no simular JWT';
  end if;
  if exists (
    select 1 from public.club_team_season_permissions p
    join public.club_memberships m on m.id=p.membership_id and m.club_id=p.club_id
    where p.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
      and m.user_id='414427ca-2870-4e46-92e7-ca5133e373fc'::uuid
  ) then
    raise exception 'El staff elegido ya tiene asignacion; no es caso no autorizado';
  end if;
  if not exists (
    select 1 from public.club_team_seasons cts
    join public.club_seasons s on s.id=cts.season_id and s.club_id=cts.club_id
    where cts.id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
      and cts.club_id=v_club and s.status='open'
  ) then
    raise exception 'La relacion actual no esta abierta y vinculada al club esperado';
  end if;
  raise notice 'PREFLIGHT PASS: tres identidades reales revalidadas; staff sin asignacion';
end
$preflight$;

set local role authenticated;

do $owner$
begin
  perform set_config('request.jwt.claim.sub','4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3',true);
  perform set_config('request.jwt.claims',
    '{"sub":"4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3","role":"authenticated"}',true);
  if current_user <> 'authenticated'
     or auth.uid() is distinct from '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid then
    raise exception 'OWNER FAIL: rol o auth.uid no coinciden; no evaluar helpers';
  end if;
  if public.can_read_club_team_season('961970c8-0fcf-4c45-94d6-787647619c61') is not true
     or public.can_write_club_team_season('961970c8-0fcf-4c45-94d6-787647619c61') is not true then
    raise exception 'OWNER FAIL: lectura/escritura esperadas TRUE';
  end if;
  perform count(*) from public.club_team_season_players;
  raise notice 'OWNER PASS: identidad y helpers TRUE; SELECT ejecutado (tabla vacia no prueba RLS por fila)';
end
$owner$;

do $staff_unassigned$
begin
  perform set_config('request.jwt.claim.sub','414427ca-2870-4e46-92e7-ca5133e373fc',true);
  perform set_config('request.jwt.claims',
    '{"sub":"414427ca-2870-4e46-92e7-ca5133e373fc","role":"authenticated"}',true);
  if current_user <> 'authenticated'
     or auth.uid() is distinct from '414427ca-2870-4e46-92e7-ca5133e373fc'::uuid then
    raise exception 'STAFF FAIL: identidad anterior persistio o contexto invalido';
  end if;
  if public.can_read_club_team_season('961970c8-0fcf-4c45-94d6-787647619c61') is distinct from false
     or public.can_write_club_team_season('961970c8-0fcf-4c45-94d6-787647619c61') is distinct from false then
    raise exception 'STAFF FAIL: sin asignacion debe tener lectura/escritura FALSE';
  end if;
  perform count(*) from public.club_team_season_players;
  raise notice 'STAFF PASS: identidad nueva y helpers FALSE; SELECT vacio no prueba aislamiento por fila';
end
$staff_unassigned$;

do $player$
begin
  perform set_config('request.jwt.claim.sub','0436e377-83e1-45e9-af9f-74cc017963df',true);
  perform set_config('request.jwt.claims',
    '{"sub":"0436e377-83e1-45e9-af9f-74cc017963df","role":"authenticated"}',true);
  if current_user <> 'authenticated'
     or auth.uid() is distinct from '0436e377-83e1-45e9-af9f-74cc017963df'::uuid then
    raise exception 'PLAYER FAIL: identidad anterior persistio o contexto invalido';
  end if;
  if public.can_read_club_team_season('961970c8-0fcf-4c45-94d6-787647619c61') is distinct from false
     or public.can_write_club_team_season('961970c8-0fcf-4c45-94d6-787647619c61') is distinct from false then
    raise exception 'PLAYER FAIL: helpers generales deben devolver FALSE';
  end if;
  perform count(*) from public.club_team_season_players;
  raise notice 'PLAYER PASS: identidad nueva y helpers FALSE; SELECT vacio no prueba aislamiento por fila';
end
$player$;

set local role anon;
do $anonymous$
declare
  v_count bigint;
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  if current_user <> 'anon' or auth.uid() is not null then
    raise exception 'ANON FAIL: identidad no limpiada o rol incorrecto';
  end if;
  if has_table_privilege('anon','public.club_team_season_players','SELECT')
     or has_any_column_privilege('anon','public.club_team_season_players','SELECT') then
    raise exception 'ANON FAIL: SELECT efectivo concedido';
  end if;
  begin
    select count(*) into v_count from public.club_team_season_players;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'ANON FAIL: pudo ejecutar SELECT';
  end if;
  raise notice 'ANON PASS: auth.uid NULL y SELECT denegado';
end
$anonymous$;

-- La transaccion no incluye INSERT/UPDATE/DELETE. Los cambios de rol/JWT son locales.
rollback;
