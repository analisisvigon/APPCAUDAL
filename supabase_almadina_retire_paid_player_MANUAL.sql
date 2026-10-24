-- APPCAUDAL / REVISION MANUAL. Actualiza SOLO la RPC ya instalada.
-- Requiere la correccion partido_convocados CASCADE previa. No borra datos
-- al instalar; cada baja ocurre solo al llamar la RPC con sesion staff.
-- Jugador con pagos: baja logica, sin DELETE de fines ni fine_payments.
-- Jugador sin pagos: conserva el borrado fisico atomico anterior.
begin;

do $preflight$
declare installed record;
begin
  if auth.uid() is not null then
    raise exception 'Instalar sin JWT de usuario';
  end if;
  select p.prosrc, p.prosecdef, p.proowner, p.proconfig, p.provolatile
    into installed from pg_proc p
    where p.oid = to_regprocedure('public.delete_own_player_atomic_v1(uuid)');
  if not found or not installed.prosecdef
    or installed.proowner <> 'postgres'::regrole
    or installed.provolatile <> 'v'
    or not coalesce('search_path=pg_catalog' = any(installed.proconfig), false)
    or md5(replace(installed.prosrc, chr(13), '')) <> 'a9dc12c5a1e9b078adbf41ba39d8377a' then
    raise exception 'La RPC instalada difiere de la version revisada; detener';
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
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.fine_subjects'::regclass
      and t.tgfoid = to_regprocedure('public.guard_fine_subject_identity()')
      and t.tgenabled in ('O','A') and (t.tgtype & 16) <> 0
  ) or not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.fine_payments'::regclass
      and t.tgfoid = to_regprocedure('public.guard_fine_payment_integrity()')
      and t.tgenabled in ('O','A') and (t.tgtype & 8) <> 0
  ) then
    raise exception 'Falta la proteccion esperada de multas o pagos';
  end if;
  if not has_function_privilege('authenticated',
      'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_function_privilege('anon',
      'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_table_privilege('authenticated','public.jugadores','DELETE') then
    raise exception 'Permisos de borrado inesperados';
  end if;
end $preflight$;

create temporary table own_player_retire_rpc_before on commit drop as
select p.proacl, p.proowner, p.prosecdef, p.proconfig, p.provolatile,
       p.prolang
from pg_proc p
where p.oid = 'public.delete_own_player_atomic_v1(uuid)'::regprocedure;

-- El cuerpo completo conserva el borrado previo y anade la rama de baja.
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
  removed_fines integer;
  removed_stats integer;
  has_fine_payments boolean;
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

  -- Estas relaciones no pertenecen exclusivamente al jugador. No se borra
  -- la cuenta PLAYER, un pago contable, ni la sustitucion del otro jugador.
  if exists (select 1 from public.club_memberships m
             where m.jugador_id = p_jugador_id) then
    raise exception 'PLAYER_IDENTITY_LINK_REVIEW_REQUIRED' using errcode = '23514';
  end if;
  select exists (
    select 1 from public.fine_payments payment
    join public.fines fine on fine.id = payment.fine_id
    join public.fine_subjects subject on subject.id = fine.subject_id
    where subject.jugador_id = p_jugador_id
  ) into has_fine_payments;
  if not has_fine_payments and exists (select 1 from public.partido_eventos_sustitucion e
             where e.outgoing_jugador_id = p_jugador_id
                or e.incoming_jugador_id = p_jugador_id) then
    raise exception 'PLAYER_SHARED_SUBSTITUTION_REVIEW_REQUIRED'
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

  -- Los pagos son inmutables: conservar sujeto, multas y ledger. La ficha
  -- deja de formar parte de la plantilla y el sujeto deja de ser sancionable.
  if has_fine_payments then
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
    return jsonb_build_object('status','retired','jugador_id',p_jugador_id,
      'fine_payments_preserved',true);
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

do $postflight$
declare previous record; installed record;
begin
  select * into previous from own_player_retire_rpc_before;
  select p.prosrc, p.proacl, p.proowner, p.prosecdef, p.proconfig,
         p.provolatile, p.prolang into installed
  from pg_proc p
  where p.oid = 'public.delete_own_player_atomic_v1(uuid)'::regprocedure;
  if md5(replace(installed.prosrc, chr(13), '')) <> 'a089bf278808492b8ba050879fa3d61f'
    or installed.proacl is distinct from previous.proacl
    or installed.proowner is distinct from previous.proowner
    or installed.prosecdef is distinct from previous.prosecdef
    or installed.proconfig is distinct from previous.proconfig
    or installed.provolatile is distinct from previous.provolatile
    or installed.prolang is distinct from previous.prolang then
    raise exception 'La RPC o sus permisos cambiaron inesperadamente: rollback';
  end if;
  if not has_function_privilege('authenticated',
      'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_function_privilege('anon',
      'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_table_privilege('authenticated','public.jugadores','DELETE') then
    raise exception 'Permisos de borrado alterados: rollback';
  end if;
end $postflight$;

commit;
