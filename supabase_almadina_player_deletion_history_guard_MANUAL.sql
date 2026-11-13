-- APPCAUDAL / REVISION E INSTALACION MANUAL.
-- Actualiza la RPC public.delete_own_player_atomic_v1(uuid).
-- Conservacion estricta del historial deportivo:
-- 1. Jugador con historial deportivo (partidos, estadisticas, sesiones, fisio, multas):
--    Se retira de la plantilla activa (baja logica en jugadores, stage y CTS) sin
--    borrar partidos, actas, alineaciones, estadisticas, sesiones ni informes.
-- 2. Jugador sin historial ni referencias asociadas:
--    Borrado fisico definitivo de su ficha y registros exclusivos.
-- 3. Temporadas cerradas: prohibicion estricta de modificacion.
begin;

do $preflight$
begin
  if auth.uid() is not null then
    raise exception 'Instalar sin JWT de usuario';
  end if;
  if to_regprocedure('public.delete_own_player_atomic_v1(uuid)') is null then
    raise exception 'La RPC delete_own_player_atomic_v1(uuid) no existe; instalar base previa';
  end if;
  if to_regprocedure('public.current_membership()') is null
    or to_regprocedure('public.is_app_staff()') is null then
    raise exception 'Faltan helpers de identidad de staff';
  end if;
  if exists (
    select 1 from unnest(array[
      'clubs','club_teams','equipos_rivales','jugadores','club_memberships',
      'player_team_memberships','legacy_jugador_cts_links_v1',
      'club_team_season_players','club_team_seasons','club_seasons',
      'fine_subjects','fines','fine_payments','physio_treatments',
      'training_session_load_metrics','partido_estadisticas_jugador',
      'partido_convocados','partido_alineacion_slots','partido_eventos_sustitucion'
    ]::text[]) as needed(name)
    where to_regclass(format('public.%I', needed.name)) is null
  ) then
    raise exception 'Faltan tablas documentadas para la actualizacion de la RPC';
  end if;
  if exists (
    select 1 from (values
      ('jugadores','active_in_squad'),('fine_subjects','active')
    ) as target(table_name,column_name)
    left join pg_attribute a
      on a.attrelid = to_regclass(format('public.%I',target.table_name))
      and a.attname = target.column_name and not a.attisdropped
    where a.atttypid is distinct from 'boolean'::regtype or not a.attnotnull
  ) then
    raise exception 'Faltan indicadores booleanos NOT NULL de baja';
  end if;
  if not has_function_privilege('authenticated',
      'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_function_privilege('anon',
      'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_table_privilege('authenticated','public.jugadores','DELETE') then
    raise exception 'Permisos de borrado inesperados';
  end if;
end $preflight$;

create or replace function public.delete_own_player_atomic_v1(p_jugador_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog
as $function$
declare
  actor_club_id uuid;
  ficha public.jugadores%rowtype;
  stage_id uuid;
  stage_team_id uuid;
  ctsp_id uuid;
  ctsp_cts_id uuid;
  ctsp_player_id uuid;
  ctsp_voided_at timestamptz;
  season_status text;
  dependency record;
  has_history boolean := false;
  has_fine_payments boolean := false;
begin
  if auth.uid() is null or public.is_app_staff() is not true then
    raise exception 'PLAYER_DELETE_DENIED' using errcode = '42501';
  end if;
  select membership.club_id into actor_club_id
  from public.current_membership() membership
  where membership.role in ('owner','admin','staff');
  if actor_club_id is null
    or (select count(*) from public.clubs) <> 1 then
    raise exception 'SINGLE_CLUB_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_jugador_id is null then
    raise exception 'PLAYER_ID_REQUIRED' using errcode = '22023';
  end if;

  -- Rechazar cualquier FK nueva o cambiada antes de tocar una fila.
  for dependency in
    select n.nspname, r.relname, a.attname, c.confdeltype,
           cardinality(c.conkey) as column_count
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    left join pg_attribute a on a.attrelid = c.conrelid
      and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.jugadores'::regclass
  loop
    if dependency.column_count <> 1 or coalesce(dependency.attname, '') = ''
      or (dependency.nspname, dependency.relname,
        dependency.attname, dependency.confdeltype) not in (
      ('public','partido_convocados','jugador_id','c'),
      ('public','club_memberships','jugador_id','r'),
      ('public','fine_subjects','jugador_id','r'),
      ('public','physio_treatments','player_id','r'),
      ('public','partido_eventos_sustitucion','outgoing_jugador_id','r'),
      ('public','partido_eventos_sustitucion','incoming_jugador_id','r'),
      ('public','training_session_load_metrics','jugador_id','a'),
      ('public','partido_estadisticas_jugador','jugador_id','n'),
      ('public','partido_alineacion_slots','jugador_id','n'),
      ('public','partido_snapshot_tactico_slots','jugador_id','n'),
      ('public','match_quick_events','jugador_id','n'),
      ('public','match_set_piece_takers','jugador_id','n'),
      ('public','partido_eventos_gol','scorer_id','n'),
      ('public','partido_eventos_gol','assistant_id','n'),
      ('public','partidos','captain_player_id','n'),
      ('public','partidos','goalkeeper_protocol_primary_player_id','n'),
      ('public','partidos','goalkeeper_protocol_secondary_player_id','n'),
      ('public','rival_scouting_evidence','source_jugador_id','n'),
      ('public','rival_scouting_connections','source_jugador_id','n'),
      ('public','rival_scouting_connections','target_jugador_id','n'),
      ('public','jugador_suspension_consumptions','jugador_id','c'),
      ('public','wellness_entries','jugador_id','c'),
      ('public','rpe_entries','jugador_id','c'),
      ('public','rpe_sync_pending','jugador_id','c'),
      ('public','legacy_own_player_migration','legacy_player_id','c'),
      ('public','legacy_jugador_cts_links_v1','jugador_id','c')
    ) then
      raise exception 'PLAYER_DELETE_FK_REVIEW_REQUIRED: %.% / % / %',
        dependency.nspname, dependency.relname,
        dependency.attname, dependency.confdeltype
        using errcode = '23514';
    end if;
  end loop;

  if exists (
    select 1 from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid
      and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid in ('public.fine_subjects'::regclass,
                         'public.fines'::regclass)
      and (cardinality(c.conkey) <> 1 or
        (n.nspname, r.relname, a.attname, c.confdeltype, c.confrelid) not in (
          ('public','fines','subject_id','r','public.fine_subjects'::regclass),
          ('public','fine_payments','fine_id','r','public.fines'::regclass)
        ))
  ) then
    raise exception 'PLAYER_FINE_FK_REVIEW_REQUIRED' using errcode = '23514';
  end if;

  if exists (
    select 1 from pg_trigger t
    join pg_class r on r.oid = t.tgrelid
    where not t.tgisinternal and t.tgenabled in ('O','A')
      and (t.tgtype & 8) <> 0
      and r.oid in (
        'public.jugadores'::regclass, 'public.fines'::regclass,
        'public.fine_subjects'::regclass,
        'public.physio_treatments'::regclass,
        'public.training_session_load_metrics'::regclass,
        'public.partido_estadisticas_jugador'::regclass,
        to_regclass('public.wellness_entries'),
        to_regclass('public.rpe_entries'),
        to_regclass('public.rpe_sync_pending'),
        to_regclass('public.jugador_suspension_consumptions'),
        to_regclass('public.legacy_own_player_migration'),
        to_regclass('public.legacy_jugador_cts_links_v1')
      )
  ) then
    raise exception 'PLAYER_DELETE_TRIGGER_REVIEW_REQUIRED'
      using errcode = '23514';
  end if;

  select * into ficha from public.jugadores
  where id = p_jugador_id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = '22023';
  end if;
  if ficha.global_player_id is null or ficha.membership_id is null then
    raise exception 'PLAYER_GLOBAL_LINK_REVIEW_REQUIRED' using errcode = '23514';
  end if;

  select stage.id, stage.team_id into stage_id, stage_team_id
  from public.player_team_memberships stage
  join public.club_teams team on team.id = stage.team_id
    and team.club_id = actor_club_id
  join public.equipos_rivales own_team on own_team.id = team.id
    and own_team.team_kind = 'own'
  where stage.id = ficha.membership_id
    and stage.player_id = ficha.global_player_id
  for update of stage;
  if stage_id is null then
    raise exception 'PLAYER_NOT_IN_OWN_TEAM' using errcode = '42501';
  end if;

  if exists (select 1 from public.jugadores other_ficha
    where other_ficha.id <> p_jugador_id
      and other_ficha.membership_id = stage_id) then
    raise exception 'PLAYER_STAGE_SHARED_REVIEW_REQUIRED' using errcode = '23514';
  end if;

  select binding.club_team_season_player_id into ctsp_id
  from public.legacy_jugador_cts_links_v1 binding
  where binding.jugador_id = p_jugador_id;
  if ctsp_id is not null then
    select roster.club_team_season_id, roster.player_id, roster.voided_at,
           season.status
      into ctsp_cts_id, ctsp_player_id, ctsp_voided_at, season_status
    from public.club_team_season_players roster
    join public.club_team_seasons cts
      on cts.id = roster.club_team_season_id
      and cts.team_id = stage_team_id and cts.club_id = actor_club_id
    join public.club_seasons season on season.id = cts.season_id
      and season.club_id = cts.club_id
    where roster.id = ctsp_id;
    if ctsp_cts_id is null or ctsp_player_id <> ficha.global_player_id
      or ctsp_voided_at is not null
      or exists (select 1 from public.legacy_jugador_cts_links_v1 other_link
        where other_link.club_team_season_player_id = ctsp_id
          and other_link.jugador_id <> p_jugador_id) then
      raise exception 'PLAYER_CTS_LINK_REVIEW_REQUIRED' using errcode = '23514';
    end if;
  end if;

  -- Las temporadas cerradas no permiten modificacion de plantilla
  if season_status is not null and season_status <> 'open' then
    raise exception 'SEASON_CLOSED' using errcode = '42501';
  end if;

  -- Bloquear si tiene cuenta de usuario (portal PLAYER) vinculada
  if exists (select 1 from public.club_memberships m
             where m.jugador_id = p_jugador_id) then
    raise exception 'PLAYER_IDENTITY_LINK_REVIEW_REQUIRED' using errcode = '23514';
  end if;

  -- Bloquear si tiene datos asociados a otro club
  if exists (select 1 from public.fine_subjects subject
             where subject.jugador_id = p_jugador_id
               and subject.club_id <> actor_club_id)
    or exists (select 1 from public.physio_treatments treatment
               where treatment.player_id = p_jugador_id
                 and treatment.club_id <> actor_club_id) then
    raise exception 'PLAYER_CROSS_CLUB_DEPENDENCY_REVIEW_REQUIRED'
      using errcode = '42501';
  end if;

  -- Comprobar si existen pagos contables de multas
  select exists (
    select 1 from public.fine_payments payment
    join public.fines fine on fine.id = payment.fine_id
    join public.fine_subjects subject on subject.id = fine.subject_id
    where subject.jugador_id = p_jugador_id
  ) into has_fine_payments;

  -- Evaluar de forma exhaustiva si existe historial deportivo o referencias asociadas
  select (
    has_fine_payments
    or exists (select 1 from public.fines fine
               join public.fine_subjects subject on subject.id = fine.subject_id
               where subject.jugador_id = p_jugador_id)
    or exists (select 1 from public.partido_convocados c
               where c.jugador_id = p_jugador_id)
    or exists (select 1 from public.partido_alineacion_slots a
               where a.jugador_id = p_jugador_id)
    or exists (select 1 from public.partido_snapshot_tactico_slots s
               where s.jugador_id = p_jugador_id)
    or exists (select 1 from public.partido_estadisticas_jugador st
               where st.jugador_id = p_jugador_id)
    or exists (select 1 from public.partido_eventos_sustitucion sub
               where sub.outgoing_jugador_id = p_jugador_id
                  or sub.incoming_jugador_id = p_jugador_id)
    or exists (select 1 from public.match_quick_events qe
               where qe.jugador_id = p_jugador_id)
    or exists (select 1 from public.match_set_piece_takers spt
               where spt.jugador_id = p_jugador_id)
    or exists (select 1 from public.partido_eventos_gol gol
               where gol.scorer_id = p_jugador_id
                  or gol.assistant_id = p_jugador_id)
    or exists (select 1 from public.partidos part
               where part.captain_player_id = p_jugador_id
                  or part.goalkeeper_protocol_primary_player_id = p_jugador_id
                  or part.goalkeeper_protocol_secondary_player_id = p_jugador_id)
    or exists (select 1 from public.physio_treatments pt
               where pt.player_id = p_jugador_id)
    or exists (select 1 from public.training_session_load_metrics tm
               where tm.jugador_id = p_jugador_id)
    or exists (select 1 from public.training_session_attendance tsa
               where tsa.player_id = ficha.global_player_id)
    or exists (select 1 from public.training_session_roster_snapshot tsrs
               where tsrs.player_id = ficha.global_player_id)
    or exists (select 1 from public.wellness_entries we
               where we.jugador_id = p_jugador_id)
    or exists (select 1 from public.rpe_entries rpe
               where rpe.jugador_id = p_jugador_id)
    or exists (select 1 from public.rpe_sync_pending rsp
               where rsp.jugador_id = p_jugador_id)
    or exists (select 1 from public.jugador_suspension_consumptions jsc
               where jsc.jugador_id = p_jugador_id)
    or exists (select 1 from public.rival_scouting_evidence rse
               where rse.source_jugador_id = p_jugador_id)
    or exists (select 1 from public.rival_scouting_connections rsc
               where rsc.source_jugador_id = p_jugador_id
                  or rsc.target_jugador_id = p_jugador_id)
    or exists (select 1 from public.player_team_memberships other_stage
               where other_stage.player_id = ficha.global_player_id
                 and other_stage.id <> stage_id)
    or exists (select 1 from public.club_team_season_players other_ctsp
               where other_ctsp.player_id = ficha.global_player_id
                 and (ctsp_id is null or other_ctsp.id <> ctsp_id))
  ) into has_history;

  -- CASO 1: JUGADOR CON HISTORIAL DEPORTIVO O REFERENCIAS ASOCIADAS
  -- Retirar de la plantilla activa sin borrar partidos, actas, alineaciones,
  -- estadisticas, sesiones, tratamientos ni ningun otro registro historico.
  if has_history then
    update public.fine_subjects set active = false
    where jugador_id = p_jugador_id and club_id = actor_club_id and active;

    update public.jugadores set active_in_squad = false
    where id = p_jugador_id and active_in_squad;

    update public.player_team_memberships set is_current = false
    where id = stage_id and is_current;

    if ctsp_id is not null and season_status = 'open' then
      update public.club_team_season_players set has_departed = true
      where id = ctsp_id and not has_departed;
    end if;

    return jsonb_build_object(
      'status', 'retired',
      'jugador_id', p_jugador_id,
      'history_preserved', true,
      'fine_payments_preserved', true
    );
  end if;

  -- CASO 2: JUGADOR SIN HISTORIAL NI REFERENCIAS ASOCIADAS
  -- Eliminacion fisica definitiva de su registro exclusivo sin dependencias.
  delete from public.fine_subjects
  where jugador_id = p_jugador_id and club_id = actor_club_id;

  update public.player_team_memberships set is_current = false
  where id = stage_id and is_current;

  if ctsp_id is not null and season_status = 'open' then
    update public.club_team_season_players set has_departed = true
    where id = ctsp_id and not has_departed;
  end if;

  delete from public.jugadores where id = p_jugador_id;

  return jsonb_build_object(
    'status', 'deleted',
    'jugador_id', p_jugador_id
  );
end;
$function$;

alter function public.delete_own_player_atomic_v1(uuid) owner to postgres;
revoke all on function public.delete_own_player_atomic_v1(uuid) from public, anon;
grant execute on function public.delete_own_player_atomic_v1(uuid) to authenticated;

do $postflight$
begin
  if not has_function_privilege('authenticated',
      'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_function_privilege('anon',
      'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_table_privilege('authenticated','public.jugadores','DELETE') then
    raise exception 'Permisos de borrado alterados inesperadamente';
  end if;
end $postflight$;

commit;
