-- APPCAUDAL / ACTUALIZACION PUNTUAL MANUAL. La RPC original ya esta instalada.
-- No ejecutar supabase_almadina_delete_own_player_MANUAL.sql de nuevo.
-- No borra jugadores al instalar; no cambia tablas, RLS, grants ni datos.
-- Si el contrato instalado o la FK difieren, la transaccion se revierte.
begin;

do $preflight$
declare p record;
begin
  if auth.uid() is not null then
    raise exception 'Instalar sin JWT de usuario';
  end if;
  select prosecdef, proowner, proconfig, provolatile, prolang, prosrc
    into p from pg_proc
    where oid = to_regprocedure('public.delete_own_player_atomic_v1(uuid)');
  if not found or not p.prosecdef or p.proowner <> 'postgres'::regrole
    or p.provolatile <> 'v'
    or p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
    or not coalesce('search_path=pg_catalog' = any(p.proconfig), false)
    or position($old$('public','club_memberships','jugador_id','r'),$old$ in p.prosrc) = 0
    or position($new$('public','partido_convocados','jugador_id','c'),$new$ in p.prosrc) > 0
    or position('PLAYER_DELETE_DENIED' in p.prosrc) = 0
    or position('PLAYER_IMMUTABLE_FINE_PAYMENTS_REVIEW_REQUIRED' in p.prosrc) = 0
    or position('PLAYER_SHARED_SUBSTITUTION_REVIEW_REQUIRED' in p.prosrc) = 0
    or position('delete from public.jugadores where id = p_jugador_id' in p.prosrc) = 0 then
    raise exception 'RPC instalada incompatible: detener y revisar';
  end if;
  if (select count(*) from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid
        and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.conrelid = to_regclass('public.partido_convocados')
        and c.confrelid = 'public.jugadores'::regclass
        and cardinality(c.conkey) = 1
        and a.attname = 'jugador_id'
        and c.confdeltype = 'c' and c.convalidated) <> 1 then
    raise exception 'FK partido_convocados.jugador_id CASCADE ausente o ambigua';
  end if;
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.partido_convocados'::regclass
      and not t.tgisinternal and t.tgenabled in ('O','A')
      and (t.tgtype & 8) <> 0
  ) or exists (
    select 1 from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.partido_convocados'::regclass
  ) then
    raise exception 'Borrado indirecto de convocados requiere revision';
  end if;
  if not has_function_privilege('authenticated',
       'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_function_privilege('anon',
       'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.jugadores', 'DELETE') then
    raise exception 'Permisos de borrado inesperados';
  end if;
end $preflight$;

create temporary table own_player_delete_rpc_before on commit drop as
select p.prosrc, p.proacl, p.proowner, p.prosecdef, p.proconfig,
       p.provolatile, p.prolang
from pg_proc p
where p.oid = 'public.delete_own_player_atomic_v1(uuid)'::regprocedure;

-- El cuerpo es identico al instalado salvo la relacion CASCADE documentada.
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

do $postflight$
declare previous record; installed record;
begin
  select * into previous from own_player_delete_rpc_before;
  select p.prosrc, p.proacl, p.proowner, p.prosecdef, p.proconfig,
         p.provolatile, p.prolang into installed
  from pg_proc p
  where p.oid = 'public.delete_own_player_atomic_v1(uuid)'::regprocedure;
  if installed.prosrc is distinct from replace(previous.prosrc,
      $old$('public','club_memberships','jugador_id','r'),$old$,
      $new$('public','partido_convocados','jugador_id','c'),
      ('public','club_memberships','jugador_id','r'),$new$)
    or installed.proacl is distinct from previous.proacl
    or installed.proowner is distinct from previous.proowner
    or installed.prosecdef is distinct from previous.prosecdef
    or installed.proconfig is distinct from previous.proconfig
    or installed.provolatile is distinct from previous.provolatile
    or installed.prolang is distinct from previous.prolang then
    raise exception 'La actualizacion modifico mas que el inventario FK: rollback';
  end if;
  if not has_function_privilege('authenticated',
       'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_function_privilege('anon',
       'public.delete_own_player_atomic_v1(uuid)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.jugadores', 'DELETE') then
    raise exception 'Permisos de borrado alterados: rollback';
  end if;
end $postflight$;

commit;
