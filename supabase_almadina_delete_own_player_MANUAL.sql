-- APPCAUDAL / Plantilla legacy. REVISION E INSTALACION MANUAL.
-- No ejecuta borrados al instalar. No activa CTS ni cambia el portal PLAYER.
-- El DELETE de una ficha ocurre solo al llamar la RPC con una sesion staff.
begin;

do $preflight$
begin
  if auth.uid() is not null then
    raise exception 'Instalar sin JWT de usuario';
  end if;
  if to_regprocedure('public.delete_own_player_atomic_v1(uuid)') is not null then
    raise exception 'La RPC ya existe: revisar antes de repetir';
  end if;
  if to_regprocedure('public.current_membership()') is null
    or to_regprocedure('public.is_app_staff()') is null
    or to_regprocedure('public.guard_fine_payment_integrity()') is null then
    raise exception 'Faltan helpers de identidad o ledger de Multas';
  end if;
  if exists (
    select 1 from unnest(array[
      'clubs','club_teams','equipos_rivales','jugadores','club_memberships',
      'player_team_memberships','legacy_jugador_cts_links_v1',
      'club_team_season_players','club_team_seasons','club_seasons',
      'fine_subjects','fines','fine_payments','physio_treatments',
      'training_session_load_metrics','partido_estadisticas_jugador',
      'partido_eventos_sustitucion'
    ]::text[]) as needed(name)
    where to_regclass(format('public.%I', needed.name)) is null
  ) then
    raise exception 'Faltan tablas documentadas para el borrado atomico';
  end if;
  if exists (
    select 1 from pg_class r
    where r.oid in (
      'public.jugadores'::regclass,
      'public.fines'::regclass,
      'public.fine_subjects'::regclass,
      'public.physio_treatments'::regclass,
      'public.training_session_load_metrics'::regclass,
      'public.partido_estadisticas_jugador'::regclass,
      'public.player_team_memberships'::regclass,
      'public.club_team_season_players'::regclass
    ) and r.relforcerowsecurity
  ) then
    raise exception 'FORCE RLS requiere revisar el contrato de la RPC';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.fine_payments'::regclass
      and t.tgfoid = to_regprocedure('public.guard_fine_payment_integrity()')
      and t.tgenabled in ('O','A') and (t.tgtype & 8) <> 0
  ) then
    raise exception 'No se acredita el bloqueo DELETE del ledger de pagos';
  end if;
  if to_regrole('authenticated') is null or to_regrole('anon') is null
    or to_regrole('service_role') is null then
    raise exception 'Faltan roles Supabase';
  end if;
end $preflight$;

-- El REVOKE de PUBLIC no debe retirar permisos efectivos de otros roles.
create temporary table own_player_delete_privileges_before on commit drop as
select r.oid as role_oid, r.rolname,
       has_table_privilege(r.oid,'public.jugadores'::regclass,'DELETE')
         as could_delete
from pg_roles r where r.rolname not in ('anon','authenticated');

-- La RPC ejecuta una sola transaccion PostgREST. Una excepcion revierte
-- TODOS los DELETE/UPDATE anteriores. No acepta CTS, equipo ni club del cliente.
create function public.delete_own_player_atomic_v1(p_jugador_id uuid)
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
  removed_fines integer;
  removed_stats integer;
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

  -- Rechazar cualquier FK nueva o cambiada antes de tocar una fila. El
  -- inventario cubre tambien SET NULL/CASCADE: una dependencia nueva no puede
  -- borrarse silenciosamente por una accion referencial automatica.
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

  -- Estas relaciones no pertenecen exclusivamente al jugador. No se borra
  -- la cuenta PLAYER, un pago contable, ni la sustitucion del otro jugador.
  if exists (select 1 from public.club_memberships m
             where m.jugador_id = p_jugador_id) then
    raise exception 'PLAYER_IDENTITY_LINK_REVIEW_REQUIRED' using errcode = '23514';
  end if;
  if exists (select 1 from public.partido_eventos_sustitucion e
             where e.outgoing_jugador_id = p_jugador_id
                or e.incoming_jugador_id = p_jugador_id) then
    raise exception 'PLAYER_SHARED_SUBSTITUTION_REVIEW_REQUIRED'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.fine_payments payment
    join public.fines fine on fine.id = payment.fine_id
    join public.fine_subjects subject on subject.id = fine.subject_id
    where subject.jugador_id = p_jugador_id
  ) then
    raise exception 'PLAYER_IMMUTABLE_FINE_PAYMENTS_REVIEW_REQUIRED'
      using errcode = '23514';
  end if;
  if exists (select 1 from public.fine_subjects subject
             where subject.jugador_id = p_jugador_id
               and subject.club_id <> actor_club_id)
    or exists (select 1 from public.physio_treatments treatment
               where treatment.player_id = p_jugador_id
                 and treatment.club_id <> actor_club_id) then
    raise exception 'PLAYER_CROSS_CLUB_DEPENDENCY_REVIEW_REQUIRED'
      using errcode = '42501';
  end if;

  -- Hijos exclusivos identificados por UUID. Los eventos y snapshots de
  -- partidos, sesiones, equipos y bibliotecas permanecen intactos.
  delete from public.fines fine where fine.subject_id in (
    select subject.id from public.fine_subjects subject
    where subject.jugador_id = p_jugador_id
  );
  get diagnostics removed_fines = row_count;
  delete from public.fine_subjects where jugador_id = p_jugador_id;
  delete from public.physio_treatments where player_id = p_jugador_id;
  delete from public.training_session_load_metrics
    where jugador_id = p_jugador_id;
  delete from public.partido_estadisticas_jugador
    where jugador_id = p_jugador_id;
  get diagnostics removed_stats = row_count;

  -- Conservar el perfil global y la pertenencia historica canonica. Cerrar
  -- solo la etapa exacta y marcar baja en el CTS si su temporada sigue abierta.
  update public.player_team_memberships set is_current = false
  where id = stage_id and is_current;
  if ctsp_id is not null and season_status = 'open' then
    update public.club_team_season_players set has_departed = true
    where id = ctsp_id and not has_departed;
  end if;

  -- CASCADE exclusivamente de filas personales ya inventariadas. Las FK
  -- SET NULL conservan partidos, eventos, alineaciones y snapshots compartidos.
  delete from public.jugadores where id = p_jugador_id;
  return jsonb_build_object('status','deleted','jugador_id',p_jugador_id,
    'fines_deleted',removed_fines,'match_stats_deleted',removed_stats);
end;
$function$;

alter function public.delete_own_player_atomic_v1(uuid) owner to postgres;
revoke all on function public.delete_own_player_atomic_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_own_player_atomic_v1(uuid)
  to authenticated;

-- Evita la antigua ruta DELETE directa. INSERT/UPDATE/SELECT y RLS actuales
-- quedan iguales; el definidor de la RPC puede ejecutar el DELETE controlado.
revoke delete on table public.jugadores from public, anon, authenticated;

do $postflight$
declare previous record;
begin
  for previous in select * from own_player_delete_privileges_before loop
    if has_table_privilege(previous.role_oid,'public.jugadores'::regclass,
                           'DELETE') is distinct from previous.could_delete then
      raise exception 'El permiso efectivo de % cambio: rollback',
        previous.rolname;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.jugadores','DELETE')
    or has_table_privilege('anon','public.jugadores','DELETE')
    or has_function_privilege('anon',
      'public.delete_own_player_atomic_v1(uuid)','EXECUTE')
    or not has_function_privilege('authenticated',
      'public.delete_own_player_atomic_v1(uuid)','EXECUTE') then
    raise exception 'Permisos efectivos de borrado inesperados: rollback';
  end if;
end $postflight$;

commit;
