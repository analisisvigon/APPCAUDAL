-- NEXO CLUB / Sesiones 2C: PRUEBA DINAMICA, NO MIGRACION.
-- PENDIENTE DE REVISION Y AUTORIZACION: NO EJECUTAR CON LOS UUID DE MARCADOR.
-- Este archivo LLAMA A RPC QUE ESCRIBEN en una transaccion que acaba en ROLLBACK.
-- Usar solo una sesion ficticia creada expresamente para la prueba, con la marca
-- [NEXO_2C_TEST_ONLY] en notes. No usar la sesion n.º 1 ni sesiones deportivas reales.
-- Los posibles efectos externos no transaccionales NO quedan cubiertos por ROLLBACK.
-- Antes de ejecutarlo, revisar los triggers habilitados y cualquier integracion externa.
-- Solo tras esa revision, cambiar external_effects_reviewed de 'no' a 'yes'.
-- El resultado SQL simula JWT bajo ROLE authenticated; no sustituye una prueba E2E.

begin;

-- SUSTITUIR LOS TRES PRIMEROS UUID POR IDENTIDADES/SESION REALES VERIFICADAS.
-- El cuarto es opcional: una sesion de prueba ya perteneciente a temporada cerrada.
-- Nunca cerrar una temporada real para completar esta prueba.
select set_config('nexo_2c.test_session_id',
    '00000000-0000-0000-0000-000000000000',true),
  set_config('nexo_2c.owner_user_id',
    '00000000-0000-0000-0000-000000000000',true),
  set_config('nexo_2c.denied_user_id',
    '00000000-0000-0000-0000-000000000000',true),
  set_config('nexo_2c.closed_test_session_id',
    '00000000-0000-0000-0000-000000000000',true),
  set_config('nexo_2c.external_effects_reviewed','no',true);

do $pre$
declare
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_session_id uuid := current_setting('nexo_2c.test_session_id')::uuid;
  v_owner_id uuid := current_setting('nexo_2c.owner_user_id')::uuid;
  v_denied_id uuid := current_setting('nexo_2c.denied_user_id')::uuid;
  v_closed_id uuid := current_setting('nexo_2c.closed_test_session_id')::uuid;
  v_club_id uuid;
  v_closed_ok boolean := false;
begin
  perform set_config('nexo_2c.ready','no',true);
  perform set_config('nexo_2c.closed_ready','no',true);
  if current_user <> 'postgres' then
    raise notice 'BLOCKED: ejecutar el preflight desde SQL Editor como postgres; las RPC se probaran como authenticated';
    return;
  end if;
  if current_setting('nexo_2c.external_effects_reviewed',true) is distinct from 'yes' then
    raise notice 'BLOCKED: falta revisar y aprobar posibles efectos externos no transaccionales';
    return;
  end if;
  if v_session_id=v_zero or v_owner_id=v_zero or v_denied_id=v_zero or
     v_owner_id=v_denied_id then
    raise notice 'PENDING: faltan UUID de sesion ficticia, owner y usuario sin permiso';
    return;
  end if;
  if to_regprocedure('public.change_planned_session_lifecycle_2c(uuid,integer,text,text)') is null or
     to_regprocedure('public.save_planned_session_value_06(uuid,integer,numeric)') is null or
     to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') is null then
    raise notice 'BLOCKED: faltan las RPC necesarias para la prueba';
    return;
  end if;
  select cts.club_id into v_club_id
  from public.planned_training_sessions s
  join public.club_team_seasons cts on cts.id=s.club_team_season_id
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where s.id=v_session_id and s.planning_state='draft'
    and s.retired_at is null and s.cancelled_at is null
    and se.status='open'
    and position('[NEXO_2C_TEST_ONLY]' in coalesce(s.notes,''))>0;
  if v_club_id is null then
    raise notice 'BLOCKED: la sesion no es un borrador de prueba marcado, activo y de temporada abierta';
    return;
  end if;
  if not exists (select 1 from auth.users u where u.id=v_owner_id) or
     not exists (select 1 from public.club_memberships m
       where m.user_id=v_owner_id and m.club_id=v_club_id
         and m.role='owner' and m.is_active) or
     not exists (select 1 from auth.users u where u.id=v_denied_id) or
     not exists (select 1 from public.club_memberships m
       where m.user_id=v_denied_id and m.club_id=v_club_id
         and m.role='player' and m.is_active) or
     exists (select 1 from public.club_memberships m
       where m.user_id=v_denied_id and m.club_id=v_club_id
         and m.role in ('owner','admin','staff') and m.is_active) then
    raise notice 'BLOCKED: las identidades reales no cumplen owner activo / player activo del mismo club';
    return;
  end if;
  if exists (
    select 1 from pg_catalog.pg_trigger t
    where not t.tgisinternal and t.tgenabled in ('O','A') and (
      (t.tgrelid='public.planned_training_sessions'::regclass and
        t.tgname not in ('planned_sessions_guard','planned_sessions_04b_date_guard',
          'planned_sessions_lifecycle_2c_guard')) or
      (t.tgrelid='public.planned_session_audit_events'::regclass and
        t.tgname<>'planned_audit_guard'))
  ) then
    raise notice 'BLOCKED: trigger adicional; revisar efectos externos antes de llamar a la RPC';
    return;
  end if;
  if v_closed_id<>v_zero then
    select exists (
      select 1 from public.planned_training_sessions s
      join public.club_team_seasons cts on cts.id=s.club_team_season_id
      join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
      where s.id=v_closed_id and s.id<>v_session_id
        and cts.club_id=v_club_id and se.status='closed'
        and s.retired_at is null
        and position('[NEXO_2C_TEST_ONLY]' in coalesce(s.notes,''))>0
    ) into v_closed_ok;
    if v_closed_ok then
      perform set_config('nexo_2c.closed_ready','yes',true);
    else
      raise notice 'PENDING: el UUID de temporada cerrada no es un fixture cerrado y marcado del mismo club';
    end if;
  else
    raise notice 'PENDING: no hay fixture de sesion en temporada cerrada';
  end if;
  perform set_config('nexo_2c.ready','yes',true);
  raise notice 'READY: fixture e identidades acreditados; la prueba seguira con ROLE authenticated';
exception when others then
  perform set_config('nexo_2c.ready','no',true);
  raise notice 'BLOCKED: fallo en preflight: %',sqlerrm;
end $pre$;

set local role authenticated;

do $test$
declare
  v_session_id uuid := current_setting('nexo_2c.test_session_id')::uuid;
  v_owner_id uuid := current_setting('nexo_2c.owner_user_id')::uuid;
  v_denied_id uuid := current_setting('nexo_2c.denied_user_id')::uuid;
  v_closed_id uuid := current_setting('nexo_2c.closed_test_session_id')::uuid;
  v_revision integer;
  v_result integer;
  v_db_revision integer;
  v_cancelled_at timestamptz;
  v_retired_at timestamptz;
  v_session_date date;
  v_old_value numeric;
  v_audit_before bigint;
  v_children_before jsonb;
  v_children_after jsonb;
  v_slot_id uuid;
  v_slots_payload jsonb;
  v_action text;
  v_sqlstate text;
  v_message text;
  v_pass integer := 0;
  v_fail integer := 0;
  v_pending integer := 0;
begin
  if current_setting('nexo_2c.ready',true) is distinct from 'yes' then
    raise notice 'GLOBAL PENDING: no se llamo a ninguna RPC; faltan fixture o identidades';
    return;
  end if;
  if current_user<>'authenticated' then
    raise notice 'GLOBAL FAIL: ROLE no es authenticated; no se llamo a ninguna RPC';
    return;
  end if;
  perform set_config('request.jwt.claim.sub',v_owner_id::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_owner_id::text,'role','authenticated')::text,true);
  if auth.uid() is distinct from v_owner_id then
    raise notice 'GLOBAL FAIL: auth.uid() no corresponde al owner; no se llamo a ninguna RPC';
    return;
  end if;
  perform set_config('request.jwt.claim.sub',v_denied_id::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_denied_id::text,'role','authenticated')::text,true);
  if auth.uid() is distinct from v_denied_id then
    raise notice 'GLOBAL FAIL: auth.uid() no corresponde al player; no se llamo a ninguna RPC';
    return;
  end if;
  perform set_config('request.jwt.claim.sub',v_owner_id::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_owner_id::text,'role','authenticated')::text,true);
  if auth.uid() is distinct from v_owner_id then
    raise notice 'GLOBAL FAIL: no se restauro la identidad owner; no se llamo a ninguna RPC';
    return;
  end if;
  select s.revision,s.session_date,s.session_value into v_revision,v_session_date,v_old_value
    from public.planned_training_sessions s where s.id=v_session_id;
  select count(*) into v_audit_before from public.planned_session_audit_events a
    where a.session_id=v_session_id;
  select jsonb_build_object(
    'slots',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]'))
      from public.planned_session_slots x where x.session_id=v_session_id),
    'items',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]'))
      from public.planned_session_items x where x.session_id=v_session_id),
    'roster',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.player_id)::text,'[]'))
      from public.planned_session_player_roster x where x.session_id=v_session_id),
    'availability',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.player_id)::text,'[]'))
      from public.planned_session_player_availability x where x.session_id=v_session_id),
    'distributions',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.session_id)::text,'[]'))
      from public.planned_session_distributions x where x.session_id=v_session_id))
    into v_children_before;
  if v_revision is null or v_session_date is null then
    raise notice 'GLOBAL FAIL: owner no puede leer el fixture mediante RLS';
    return;
  end if;

  -- Tres intentos sin permiso. Cada exito inesperado se deshace en su propia
  -- subtransaccion; el codigo 42501 acredita denegacion de autorizacion.
  perform set_config('request.jwt.claim.sub',v_denied_id::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_denied_id::text,'role','authenticated')::text,true);
  if auth.uid() is distinct from v_denied_id then
    raise notice 'GLOBAL FAIL: identidad denegada no valida antes de probar';
    return;
  end if;
  foreach v_action in array array['cancel','reactivate','retire'] loop
    begin
      perform public.change_planned_session_lifecycle_2c(v_session_id,v_revision,v_action,null);
      raise exception 'Exito inesperado' using errcode='ZX001';
    exception
      when sqlstate 'ZX001' then
        v_fail:=v_fail+1; raise notice 'FAIL: player pudo %',v_action;
      when others then
        get stacked diagnostics v_sqlstate=returned_sqlstate,v_message=message_text;
        if v_sqlstate='42501' then
          v_pass:=v_pass+1; raise notice 'PASS: player no puede %',v_action;
        else
          v_fail:=v_fail+1;
          raise notice 'FAIL: player % devolvio SQLSTATE % (%)',v_action,v_sqlstate,v_message;
        end if;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub',v_owner_id::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_owner_id::text,'role','authenticated')::text,true);
  if auth.uid() is distinct from v_owner_id then
    raise notice 'GLOBAL FAIL: identidad owner no restaurada antes de escribir';
    return;
  end if;
  select s.revision,s.cancelled_at,s.retired_at into v_db_revision,v_cancelled_at,v_retired_at
    from public.planned_training_sessions s where s.id=v_session_id;
  if v_db_revision is distinct from v_revision or v_cancelled_at is not null or
     v_retired_at is not null then
    raise notice 'GLOBAL FAIL: prueba negativa altero el fixture';
    return;
  end if;
  v_pass:=v_pass+1;

  -- DML TRANSACCIONAL 1: anulacion del fixture marcado.
  v_result:=public.change_planned_session_lifecycle_2c(v_session_id,v_revision,'cancel','Prueba reversible 2C');
  select s.revision,s.cancelled_at into v_db_revision,v_cancelled_at
    from public.planned_training_sessions s where s.id=v_session_id;
  if v_result<>v_revision+1 or v_db_revision<>v_result or v_cancelled_at is null then
    raise exception 'Anulacion o revision incoherente';
  end if;
  v_pass:=v_pass+1; raise notice 'PASS: cancel, cancelled_at y CAS +1';

  -- Revision antigua; cualquier exito inesperado se deshace en subtransaccion.
  begin
    perform public.change_planned_session_lifecycle_2c(v_session_id,v_revision,'reactivate',null);
    raise exception 'Exito inesperado' using errcode='ZX001';
  exception
    when sqlstate 'ZX001' then
      v_fail:=v_fail+1; raise notice 'FAIL: revision CAS antigua aceptada';
    when others then
      get stacked diagnostics v_sqlstate=returned_sqlstate,v_message=message_text;
      if v_sqlstate='40001' then
        v_pass:=v_pass+1; raise notice 'PASS: revision CAS antigua rechazada';
      else
        v_fail:=v_fail+1; raise notice 'FAIL: CAS devolvio SQLSTATE % (%)',v_sqlstate,v_message;
      end if;
  end;
  select s.revision,s.cancelled_at into v_db_revision,v_cancelled_at
    from public.planned_training_sessions s where s.id=v_session_id;
  if v_db_revision<>v_result or v_cancelled_at is null then
    raise exception 'CAS antiguo altero datos';
  end if;
  v_pass:=v_pass+1;

  -- DML TRANSACCIONAL 2: reactivacion del mismo UUID.
  v_result:=public.change_planned_session_lifecycle_2c(v_session_id,v_result,'reactivate',null);
  select s.revision,s.cancelled_at into v_db_revision,v_cancelled_at
    from public.planned_training_sessions s where s.id=v_session_id;
  if v_result<>v_revision+2 or v_db_revision<>v_result or v_cancelled_at is not null then
    raise exception 'Reactivacion o revision incoherente';
  end if;
  v_pass:=v_pass+1; raise notice 'PASS: reactivate limpia cancelled_at y conserva UUID';

  -- DML TRANSACCIONAL 3: retirada logica, sin DELETE fisico.
  v_result:=public.change_planned_session_lifecycle_2c(v_session_id,v_result,'retire','Prueba reversible 2C');
  select s.revision,s.retired_at into v_db_revision,v_retired_at
    from public.planned_training_sessions s where s.id=v_session_id;
  if v_result<>v_revision+3 or v_db_revision<>v_result or v_retired_at is null then
    raise exception 'Retirada o revision incoherente';
  end if;
  v_pass:=v_pass+1; raise notice 'PASS: retire marca retired_at sin borrar sesion';

  -- Las tres operaciones deben quedar prohibidas sobre una sesion retirada.
  foreach v_action in array array['reactivate','cancel','retire'] loop
    begin
      perform public.change_planned_session_lifecycle_2c(v_session_id,v_result,v_action,null);
      raise exception 'Exito inesperado' using errcode='ZX001';
    exception
      when sqlstate 'ZX001' then
        v_fail:=v_fail+1; raise notice 'FAIL: sesion retirada admite %',v_action;
      when others then
        get stacked diagnostics v_sqlstate=returned_sqlstate,v_message=message_text;
        if v_sqlstate='23514' and position('retirada' in lower(v_message))>0 then
          v_pass:=v_pass+1; raise notice 'PASS: sesion retirada rechaza %',v_action;
        else
          v_fail:=v_fail+1; raise notice 'FAIL: retirada % devolvio SQLSTATE % (%)',v_action,v_sqlstate,v_message;
        end if;
    end;
  end loop;

  -- Ruta de edicion de ficha: forzar valor distinto para evitar un no-op.
  begin
    perform public.save_planned_session_value_06(v_session_id,v_result,
      case when v_old_value is null then 5 when v_old_value<10 then 10 else 9 end);
    raise exception 'Exito inesperado' using errcode='ZX001';
  exception
    when sqlstate 'ZX001' then
      v_fail:=v_fail+1; raise notice 'FAIL: valor de sesion retirada editable';
    when others then
      get stacked diagnostics v_sqlstate=returned_sqlstate,v_message=message_text;
      if v_sqlstate='42501' and position('retirada' in lower(v_message))>0 then
        v_pass:=v_pass+1; raise notice 'PASS: ficha retirada no admite edicion de VALOR';
      else
        v_fail:=v_fail+1; raise notice 'FAIL: edicion de ficha devolvio SQLSTATE % (%)',v_sqlstate,v_message;
      end if;
  end;

  -- Ruta 03C de ejercicios: reconstruir el documento completo con UUID estables
  -- y variar la duracion de un slot. Si tiene exito inesperado, su escritura
  -- hija se revierte en esta subtransaccion. No se inventan tareas ni UUID.
  select sl.id into v_slot_id from public.planned_session_slots sl
    where sl.session_id=v_session_id and sl.duration_minutes<2147483647
    order by sl.phase,sl.sort_order,sl.id limit 1;
  if v_slot_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',sl.id,'phase',sl.phase,'sort_order',sl.sort_order,
      'duration_minutes',sl.duration_minutes+case when sl.id=v_slot_id then 1 else 0 end,
      'items',coalesce((select jsonb_agg(
        case when it.kind='free' then jsonb_build_object(
          'id',it.id,'sort_order',it.sort_order,'kind','free',
          'activity_minutes',it.activity_minutes,'free_title',it.free_title,
          'free_description',it.free_description,'free_comments',it.free_comments,
          'free_url',it.free_url)
        else jsonb_build_object('id',it.id,'sort_order',it.sort_order,
          'kind','library_task','activity_minutes',it.activity_minutes) end
        order by it.sort_order,it.id)
        from public.planned_session_items it where it.slot_id=sl.id),'[]'::jsonb))
      order by sl.phase,sl.sort_order,sl.id),'[]'::jsonb)
      into v_slots_payload from public.planned_session_slots sl
      where sl.session_id=v_session_id;
    begin
      perform public.save_planned_session_03c(v_session_id,v_result,v_session_date,
        '{}'::jsonb,v_slots_payload,null,'{}'::uuid[],'{}'::uuid[]);
      raise exception 'Exito inesperado' using errcode='ZX001';
    exception
      when sqlstate 'ZX001' then
        v_fail:=v_fail+1; raise notice 'FAIL: RPC 03C modifico ejercicios retirados';
      when others then
        get stacked diagnostics v_sqlstate=returned_sqlstate,v_message=message_text;
        if v_sqlstate='42501' and position('retirada' in lower(v_message))>0 then
          v_pass:=v_pass+1; raise notice 'PASS: RPC 03C no modifica ejercicios retirados';
        else
          v_fail:=v_fail+1;
          raise notice 'FAIL: RPC 03C devolvio SQLSTATE % (%)',v_sqlstate,v_message;
        end if;
    end;
  else
    v_pending:=v_pending+1;
    raise notice 'PENDING: falta al menos un ejercicio en el fixture para probar RPC 03C';
  end if;

  -- La persistencia de todas las filas hijas (hash de contenido) y la auditoria se comprueba,
  -- aunque una prueba especifica de roster/distribuciones sigue pendiente.
  select jsonb_build_object(
    'slots',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]'))
      from public.planned_session_slots x where x.session_id=v_session_id),
    'items',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]'))
      from public.planned_session_items x where x.session_id=v_session_id),
    'roster',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.player_id)::text,'[]'))
      from public.planned_session_player_roster x where x.session_id=v_session_id),
    'availability',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.player_id)::text,'[]'))
      from public.planned_session_player_availability x where x.session_id=v_session_id),
    'distributions',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.session_id)::text,'[]'))
      from public.planned_session_distributions x where x.session_id=v_session_id))
    into v_children_after;
  if v_children_after=v_children_before and
     (select count(*) from public.planned_session_audit_events a
       where a.session_id=v_session_id)=v_audit_before+3 and
     (select count(*) from public.planned_training_sessions s where s.id=v_session_id)=1 and
     (select revision from public.planned_training_sessions s where s.id=v_session_id)=v_result then
    v_pass:=v_pass+1; raise notice 'PASS: hijos, auditoria y revision conservados';
  else
    v_fail:=v_fail+1; raise notice 'FAIL: hijos, auditoria o revision cambiaron indebidamente';
  end if;
  v_pending:=v_pending+1;
  raise notice 'PENDING: probar 04B/05 con fixture de plantilla y distribucion pobladas';

  if current_setting('nexo_2c.closed_ready',true)='yes' then
    -- No se cambia el status de la temporada ni se escribe en el fixture cerrado.
    select s.revision into v_db_revision from public.planned_training_sessions s
      where s.id=v_closed_id;
    if v_db_revision is null then
      v_fail:=v_fail+1; raise notice 'FAIL: owner no puede leer fixture cerrado';
    else
      foreach v_action in array array['cancel','reactivate','retire'] loop
        begin
          perform public.change_planned_session_lifecycle_2c(v_closed_id,v_db_revision,v_action,null);
          raise exception 'Exito inesperado' using errcode='ZX001';
        exception
          when sqlstate 'ZX001' then
            v_fail:=v_fail+1; raise notice 'FAIL: temporada cerrada admite %',v_action;
          when others then
            get stacked diagnostics v_sqlstate=returned_sqlstate,v_message=message_text;
            if v_sqlstate='42501' then
              v_pass:=v_pass+1; raise notice 'PASS: temporada cerrada rechaza %',v_action;
            else
              v_fail:=v_fail+1;
              raise notice 'FAIL: temporada cerrada % devolvio SQLSTATE % (%)',v_action,v_sqlstate,v_message;
            end if;
        end;
      end loop;
    end if;
  else
    v_pending:=v_pending+3;
    raise notice 'PENDING: cancel/reactivate/retire de temporada cerrada: falta fixture aislado';
  end if;
  raise notice 'GLOBAL %: PASS %, FAIL %, PENDING %; ROLLBACK al final',
    case when v_fail>0 then 'FAIL' when v_pending>0 then 'PENDING' else 'PASS' end,
    v_pass,v_fail,v_pending;
exception when others then
  -- Un error inesperado revierte TODAS las escrituras efectuadas en este DO.
  get stacked diagnostics v_sqlstate=returned_sqlstate,v_message=message_text;
  raise notice 'GLOBAL FAIL: error inesperado SQLSTATE % (%). ROLLBACK al final',
    v_sqlstate,v_message;
end $test$;

-- Obligatorio: no sustituir por COMMIT.
rollback;
