-- BORRADOR NO AUTORIZADO · NO EJECUTAR hasta revisión y firma del propietario.
-- Sustituir TODAS las filas del VALUES por la selección expresa del inventario:
-- (ficha_id, players_database.id, player_team_memberships.id, joined_on).
-- joined_on NULL significa fecha de incorporación DESCONOCIDA, no 2026-07-01.
-- Esta operación vincula a la temporada, no afirma presencia en la sesión nº 1.
-- La fila NULL de fábrica hace fallar el preflight antes de cualquier INSERT.
begin;

do $preflight$
declare
  v_cts constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_club constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  v_team constant uuid := '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
  v_season constant uuid := 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae';
  v_owner constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3';
  v_starts date;
  v_ends date;
  v_manifest jsonb;
  v_row record;
  v_count bigint;
begin
  if to_regclass('public.club_team_season_players') is null
     or to_regclass('public.jugadores') is null
     or to_regclass('public.player_team_memberships') is null
     or to_regclass('public.players_database') is null then
    raise exception '04A: falta una tabla de identidad o pertenencias; no insertar';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = to_regclass('public.club_team_season_players')
      and t.tgname = 'club_team_season_players_guard'
      and t.tgenabled = 'O' and not t.tgisinternal
      and t.tgfoid = to_regprocedure('public.guard_club_team_season_player_mutation()')
  ) or not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = to_regclass('public.club_team_season_players')
      and c.relrowsecurity
  ) or (select count(*) from pg_catalog.pg_trigger t
        where t.tgrelid = to_regclass('public.club_team_season_players')
          and not t.tgisinternal and t.tgenabled <> 'D') <> 1 then
    raise exception '04A: guard/RLS de Sesiones 01 ausente o hay triggers adicionales';
  end if;

  -- El mismo bloqueo que toma el guard impide una transición concurrente a CLOSED.
  select se.starts_on, se.ends_on into v_starts, v_ends
  from public.club_team_seasons cts
  join public.club_seasons se on se.id = cts.season_id and se.club_id = cts.club_id
  where cts.id = v_cts and cts.club_id = v_club and cts.team_id = v_team
    and cts.season_id = v_season and se.status = 'open'
  for update of se;
  if not found then
    raise exception '04A: CTS/club/equipo/temporada no coincide o temporada cerrada';
  end if;
  perform 1 from public.club_memberships m
  where m.club_id = v_club and m.user_id = v_owner
    and m.role = 'owner' and m.is_active is true
  for share;
  if not found then
    raise exception '04A: owner previamente acreditado ya no está activo';
  end if;
  -- Revalidar la línea de base comunicada: el preflight cuenta perfiles
  -- canónicos DISTINCT, no necesariamente filas de ficha sin duplicar.
  if (select count(*) from public.player_team_memberships stage
      where stage.team_id = v_team and stage.is_current is true) <> 27
     or (select count(distinct j.global_player_id)
         from public.jugadores j
         join public.player_team_memberships stage on stage.id = j.membership_id
         where stage.team_id = v_team and j.active_in_squad is true
           and j.global_player_id is not null) <> 24 then
    raise exception '04A: población legacy distinta del preflight 27/24; revisar inventario';
  end if;
  if (select count(*) from public.planned_training_sessions s
      where s.club_team_season_id = v_cts and s.session_number = 1
        and s.planning_state = 'confirmed'
        and s.session_date = date '2026-10-25' and s.revision = 4) <> 1 then
    raise exception '04A: sesión nº 1 ya no coincide con la línea de base';
  end if;
  select count(*) into v_count from public.club_team_season_players ctp
  where ctp.club_team_season_id = v_cts;
  if v_count <> 0 then
    raise exception '04A: ya existen % pertenencias en el CTS; revisar antes de repetir', v_count;
  end if;

  -- MANIFIESTO FIRMADO: una fila por futbolista que el propietario confirme.
  -- Ejemplo de forma, NO de identidad: ('uuid ficha','uuid jugador','uuid etapa',NULL::date).
  select jsonb_agg(to_jsonb(x)) into v_manifest
  from (values
    (null::uuid, null::uuid, null::uuid, null::date)
  ) as x(ficha_id, player_id, stage_id, joined_on);
  if v_manifest is null or jsonb_array_length(v_manifest) = 0 then
    raise exception '04A: manifiesto vacío';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_manifest)
      as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date)
    where x.ficha_id is null or x.player_id is null or x.stage_id is null
  ) then
    raise exception '04A: completar los UUID reales; plantilla no ejecutable';
  end if;
  select count(*) into v_count from jsonb_to_recordset(v_manifest)
    as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date);
  if v_count <> (
    select count(distinct x.player_id) from jsonb_to_recordset(v_manifest)
      as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date)
  ) or v_count <> (
    select count(distinct x.ficha_id) from jsonb_to_recordset(v_manifest)
      as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date)
  ) or v_count <> (
    select count(distinct x.stage_id) from jsonb_to_recordset(v_manifest)
      as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date)
  ) then
    raise exception '04A: UUID repetido en manifiesto';
  end if;

  for v_row in
    select * from jsonb_to_recordset(v_manifest)
      as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date)
  loop
    -- Igualdad estricta de tres UUID; ni nombre ni fecha legacy asignan temporada.
    perform 1
    from public.jugadores j
    join public.players_database p on p.id = j.global_player_id
    join public.player_team_memberships stage on stage.id = j.membership_id
    where j.id = v_row.ficha_id and j.active_in_squad is true
      and p.id = v_row.player_id and stage.id = v_row.stage_id
      and stage.player_id = p.id and stage.team_id = v_team
      and stage.is_current is true
    for share of j, p, stage;
    if not found then
      raise exception '04A: ficha % no coincide con jugador/etapa actuales del Caudal', v_row.ficha_id;
    end if;
    if (select count(*) from public.jugadores j
        where j.active_in_squad is true and j.global_player_id = v_row.player_id) <> 1
       or (select count(*) from public.jugadores j
           where j.active_in_squad is true and j.membership_id = v_row.stage_id) <> 1 then
      raise exception '04A: duplicidad de ficha activa para jugador/etapa %', v_row.player_id;
    end if;
    if v_row.joined_on is not null
       and (v_row.joined_on < v_starts or v_row.joined_on > v_ends) then
      raise exception '04A: joined_on fuera de temporada para %', v_row.player_id;
    end if;
  end loop;
  perform set_config('appcaudal.sessions04a_manifest', v_manifest::text, true);
  raise notice 'PREFLIGHT PASS: % identidades seleccionadas y bloqueadas; aún sin INSERT', v_count;
end
$preflight$;

-- El SQL Editor es privilegiado: este contexto solo reproduce al owner verificado.
-- No es una prueba de inicio de sesión real. El guard y RLS siguen ejecutándose.
set local role authenticated;

do $apply$
declare
  v_cts constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_owner constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3';
  v_manifest jsonb := current_setting('appcaudal.sessions04a_manifest', true)::jsonb;
  v_expected bigint;
  v_inserted bigint;
  v_actual bigint;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_owner
     or public.can_write_club_team_season(v_cts) is not true
     or v_manifest is null then
    raise exception '04A: contexto authenticated/owner/CTS no validado';
  end if;
  select count(*) into v_expected from jsonb_to_recordset(v_manifest)
    as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date);

  insert into public.club_team_season_players
    (club_team_season_id, player_id, joined_on, left_on, has_departed)
  select v_cts, x.player_id, x.joined_on, null::date, false
  from jsonb_to_recordset(v_manifest)
    as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date);
  get diagnostics v_inserted = row_count;
  if v_inserted <> v_expected then
    raise exception '04A: INSERT incompleto: % de %', v_inserted, v_expected;
  end if;

  select count(*) into v_actual from public.club_team_season_players ctp
  where ctp.club_team_season_id = v_cts;
  if v_actual <> v_expected or exists (
    select 1 from jsonb_to_recordset(v_manifest)
      as x(ficha_id uuid, player_id uuid, stage_id uuid, joined_on date)
    where not exists (
      select 1 from public.club_team_season_players ctp
      where ctp.club_team_season_id = v_cts and ctp.player_id = x.player_id
        and ctp.joined_on is not distinct from x.joined_on
        and ctp.left_on is null and ctp.has_departed is false
        and ctp.voided_at is null
        and ctp.created_by_membership_id in (
          select m.id from public.club_memberships m
          where m.user_id = v_owner and m.club_id =
            'ca0da100-0000-4000-8000-000000000001'::uuid
            and m.role = 'owner' and m.is_active is true
        )
    )
  ) then
    raise exception '04A: postcondición de identidad/pertenencia no superada';
  end if;
  if (select count(*) from public.planned_training_sessions s
      where s.club_team_season_id = v_cts and s.session_number = 1
        and s.planning_state = 'confirmed'
        and s.session_date = date '2026-10-25' and s.revision = 4) <> 1 then
    raise exception '04A: sesión nº 1 cambió durante la transacción';
  end if;
  raise notice 'POSTCONDITION PASS: % vínculos explícitos; ninguna otra tabla modificada', v_actual;
end
$apply$;

commit;
