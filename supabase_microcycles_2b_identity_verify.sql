-- PREPARADO PARA DESPUÉS DE INSTALAR 2B. NO EJECUTADO POR CODEX.
-- Prueba REAL de identidad/lectura sin alterar datos. La escritura CAS mediante
-- save_planned_microcycle_2b requiere una prueba transaccional independiente.
-- Ejecutar el archivo completo desde una sesión de confianza sin auth.uid().
begin;

do $setup$
declare v_cts uuid; v_count integer; v_club uuid; v_owner uuid; v_staff uuid;
  v_unassigned uuid; v_player uuid;
begin
  perform pg_catalog.set_config('nexo.microcycle.preflight','false',true);
  perform pg_catalog.set_config('nexo.microcycle.results','[]',true);
  if auth.uid() is not null or
     to_regclass('public.planned_microcycles') is null or
     to_regprocedure('public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)') is null then
    raise notice 'BLOCKED: se requiere un runner sin JWT de aplicación y backend 2B instalado';
    return;
  end if;
  select count(*),(array_agg(cts.id order by cts.id))[1] into v_count,v_cts
  from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where se.is_active and se.status='open';
  if v_count<>1 then
    raise notice 'BLOCKED: se necesita un único CTS activo y abierto; encontrados %',v_count;
    return;
  end if;
  select club_id into v_club from public.club_team_seasons where id=v_cts;
  select count(*),(array_agg(m.user_id order by m.user_id))[1] into v_count,v_owner
  from public.club_memberships m join auth.users u on u.id=m.user_id
  where m.club_id=v_club and m.role='owner' and m.is_active;
  if v_count<>1 then
    raise notice 'BLOCKED: owner activo no inequívoco; encontrados %',v_count;
    return;
  end if;
  select (array_agg(m.user_id order by m.user_id))[1] into v_staff
  from public.club_memberships m join auth.users u on u.id=m.user_id
  join public.club_team_season_permissions p on p.membership_id=m.id
  where m.club_id=v_club and m.role='staff' and m.is_active
    and p.club_team_season_id=v_cts and m.user_id<>v_owner
    and not exists(select 1 from public.club_memberships elevated
      where elevated.user_id=m.user_id and elevated.club_id=v_club
        and elevated.is_active and elevated.role in ('owner','admin'));
  select (array_agg(m.user_id order by m.user_id))[1] into v_unassigned
  from public.club_memberships m join auth.users u on u.id=m.user_id
  where m.club_id=v_club and m.role='staff' and m.is_active
    and m.user_id<>v_owner and m.user_id is distinct from v_staff
    and not exists(select 1 from public.club_memberships elevated
      where elevated.user_id=m.user_id and elevated.club_id=v_club
        and elevated.is_active and elevated.role in ('owner','admin'))
    and not exists(select 1 from public.club_memberships other_staff
      join public.club_team_season_permissions p on p.membership_id=other_staff.id
      where other_staff.user_id=m.user_id and other_staff.club_id=v_club
        and other_staff.role='staff' and other_staff.is_active
        and p.club_team_season_id=v_cts);
  select (array_agg(m.user_id order by m.user_id))[1] into v_player
  from public.club_memberships m join auth.users u on u.id=m.user_id
  where m.club_id=v_club and m.role='player' and m.is_active
    and m.user_id<>v_owner and m.user_id is distinct from v_staff
    and m.user_id is distinct from v_unassigned
    and not exists(select 1 from public.club_memberships elevated
      where elevated.user_id=m.user_id and elevated.club_id=v_club
        and elevated.is_active and elevated.role in ('owner','admin','staff'));
  perform pg_catalog.set_config('nexo.microcycle.cts',v_cts::text,true);
  perform pg_catalog.set_config('nexo.microcycle.owner',v_owner::text,true);
  perform pg_catalog.set_config('nexo.microcycle.staff',coalesce(v_staff::text,''),true);
  perform pg_catalog.set_config('nexo.microcycle.unassigned',coalesce(v_unassigned::text,''),true);
  perform pg_catalog.set_config('nexo.microcycle.player',coalesce(v_player::text,''),true);
  perform pg_catalog.set_config('nexo.microcycle.preflight','true',true);
  raise notice 'Preflight: CTS único acreditado; staff asignado %, no asignado %, player %',
    case when v_staff is null then 'PENDING' else 'READY' end,
    case when v_unassigned is null then 'PENDING' else 'READY' end,
    case when v_player is null then 'PENDING' else 'READY' end;
end $setup$;

set local role authenticated;
do $identity$
declare v_cts uuid; v_results jsonb:='[]'::jsonb; v_case record;
  v_uid uuid; v_read boolean; v_write boolean; v_expected boolean;
  v_total integer; v_visible integer;
begin
  if pg_catalog.current_setting('nexo.microcycle.preflight')<>'true' then
    raise notice 'GLOBAL BLOCKED: preflight incompleto; no se simulan identidades';
    return;
  end if;
  v_cts:=pg_catalog.current_setting('nexo.microcycle.cts')::uuid;
  -- El total previo se lee únicamente como owner mediante RLS después de
  -- validar su JWT. Si no existen planes, la prueba de RLS queda PENDING.
  v_total:=null;
  for v_case in select * from (values
      ('owner'::text,pg_catalog.current_setting('nexo.microcycle.owner'),true),
      ('staff_asignado',pg_catalog.current_setting('nexo.microcycle.staff'),true),
      ('staff_sin_asignacion',pg_catalog.current_setting('nexo.microcycle.unassigned'),false),
      ('player',pg_catalog.current_setting('nexo.microcycle.player'),false)
    ) c(scenario,user_id,expected_access)
  loop
    if v_case.user_id='' then
      v_results:=v_results||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'scenario',v_case.scenario,'result','PENDING','detail','No existe identidad real adecuada'));
      continue;
    end if;
    v_uid:=v_case.user_id::uuid;
    perform pg_catalog.set_config('request.jwt.claim.sub',v_uid::text,true);
    perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
    if auth.uid() is distinct from v_uid then
      v_results:=v_results||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'scenario',v_case.scenario,'result','FAIL','detail','auth.uid() no coincide'));
      continue;
    end if;
    v_expected:=v_case.expected_access;
    select public.can_read_club_team_season(v_cts),
      public.can_write_club_team_season(v_cts) into v_read,v_write;
    v_results:=v_results||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'scenario',v_case.scenario,'result',case when v_read is not distinct from v_expected
        and v_write is not distinct from v_expected
        then 'PASS' else 'FAIL' end,
      'detail','auth.uid validado; lectura='||coalesce(v_read::text,'NULL')||
        '; escritura='||coalesce(v_write::text,'NULL')));
    select count(*) into v_visible from public.planned_microcycles
      where club_team_season_id=v_cts;
    if v_case.scenario='owner' then v_total:=v_visible; end if;
    v_results:=v_results||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'scenario',v_case.scenario||'_rls',
      'result',case when v_total is null or v_total=0 then 'PENDING'
        when (v_visible=v_total) is not distinct from v_expected then 'PASS' else 'FAIL' end,
      'detail','Filas visibles='||v_visible::text||'; planes existentes='||coalesce(v_total::text,'desconocido')));
  end loop;
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claim.role','',true);
  perform pg_catalog.set_config('nexo.microcycle.results',v_results::text,true);
end $identity$;
reset role;

with results as (
  select value as item from pg_catalog.jsonb_array_elements(
    coalesce(nullif(pg_catalog.current_setting('nexo.microcycle.results',true),''),'[]')::jsonb)
), rows as (
  select item->>'scenario' as scenario,item->>'result' as result,item->>'detail' as detail
  from results
  union all
  select 'anon_execute',case when to_regprocedure('public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)') is null
    then 'PENDING' when pg_catalog.has_function_privilege('anon',
      to_regprocedure('public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)'),'EXECUTE')
    then 'FAIL' else 'PASS' end,
    'Privilegio EXECUTE efectivo del rol anon'
  union all
  select 'rpc_write_cas','PENDING',
    'No se ejecuta una escritura aquí; probar RPC y CAS en una transacción separada con ROLLBACK'
)
select scenario,result,detail from rows
union all
select 'GLOBAL',case when count(*)=0 or count(*) filter(where result='FAIL')>0 then 'FAIL'
  else 'PENDING' end,
  'Solo helpers, RLS de lectura si existen filas y EXECUTE anon; escritura RPC sigue PENDING'
from rows;

do $summary$
declare v_results jsonb := coalesce(nullif(
  pg_catalog.current_setting('nexo.microcycle.results',true),''),'[]')::jsonb;
  v_fail integer; v_pass integer; v_pending integer; v_anon_exec boolean;
begin
  select count(*) filter(where value->>'result'='FAIL'),
    count(*) filter(where value->>'result'='PASS'),
    count(*) filter(where value->>'result'='PENDING')
  into v_fail,v_pass,v_pending
  from pg_catalog.jsonb_array_elements(v_results);
  v_anon_exec := coalesce(pg_catalog.has_function_privilege('anon',
    to_regprocedure('public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)'),
    'EXECUTE'),false);
  raise notice 'Microciclos 2B identidades: % PASS, % FAIL, % PENDING. GLOBAL %; prueba RPC CAS aún PENDING',
    v_pass,v_fail + case when v_anon_exec then 1 else 0 end,v_pending,
    case when v_fail>0 or v_anon_exec then 'FAIL' else 'PENDING' end;
end $summary$;

rollback;
