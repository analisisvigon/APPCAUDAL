-- TRANSICION 02 / GUARDAS DE FILA. INSTALACION MANUAL, SIN ACTIVACION.
-- Permanecen inertes hasta instalar el marcador de corte. Despues del corte,
-- writes_enabled=false bloquea todo DML cubierto, incluso el historico.
-- Al activarse en otra transaccion, tambien cubren SECURITY DEFINER y DML
-- directo: un propietario de tabla puede saltar RLS, no estas guardas.
-- No modifica datos, politicas ni funciones legacy.
begin;

do $pre$
declare t text;
begin
  if auth.uid() is not null then raise exception 'Instalar sin JWT de usuario'; end if;
  if to_regclass('public.operational_cts_v1') is null
    or to_regclass('public.operational_guard_versions_v1') is null
    or to_regprocedure('public.can_write_operational_cts_v1(uuid)') is null
    or to_regprocedure('public.transition_02_row_write_guard_v1()') is not null then
    raise exception 'Falta preparacion operativa o guardas ya instaladas';
  end if;
  if exists (select 1 from public.operational_guard_versions_v1)
    or exists (select 1 from public.operational_cts_v1 where writes_enabled) then
    raise exception 'No instalar guardas despues de activar escrituras';
  end if;
  foreach t in array array[
    'jugadores','partidos','partido_estadisticas_jugador',
    'partido_eventos_gol','match_quick_events','partido_alineacion_slots',
    'partido_eventos_sistema','partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots','partido_eventos_post',
    'partido_convocados','partido_notas_individuales_pre',
    'partido_eventos_sustitucion','match_set_piece_takers',
    'match_set_piece_notes','match_set_piece_diagrams',
    'club_team_season_players','legacy_jugador_cts_links_v1',
    'player_team_memberships','players_database','player_positions',
    'player_sources','player_scouting_traits','legacy_own_player_migration',
    'equipos_rivales','jugadores_rivales','equipo_rival_alineacion',
    'equipo_rival_banquillo','competitions'
  ] loop
    if to_regclass(format('public.%I',t)) is null then
      raise exception 'Falta tabla de la guarda: %',t;
    end if;
  end loop;
  foreach t in array array[
    'partido_estadisticas_jugador','partido_eventos_gol',
    'match_quick_events','partido_alineacion_slots',
    'partido_eventos_sistema','partido_snapshots_tacticos',
    'partido_eventos_post','partido_convocados',
    'partido_notas_individuales_pre','partido_eventos_sustitucion',
    'match_set_piece_takers','match_set_piece_notes',
    'match_set_piece_diagrams'
  ] loop
    if not exists (select 1 from pg_attribute a
      where a.attrelid=to_regclass(format('public.%I',t))
        and a.attname='partido_id' and not a.attisdropped
        and a.atttypid='uuid'::regtype) then
      raise exception 'Falta %.partido_id UUID',t;
    end if;
  end loop;
  if not exists (select 1 from pg_attribute a
      where a.attrelid='public.partido_snapshot_tactico_slots'::regclass
        and a.attname='snapshot_id' and not a.attisdropped
        and a.atttypid='uuid'::regtype)
    or not exists (select 1 from pg_attribute a
      where a.attrelid='public.partido_snapshots_tacticos'::regclass
        and a.attname='partido_id' and not a.attisdropped
        and a.atttypid='uuid'::regtype) then
    raise exception 'Contrato de snapshots incompleto';
  end if;
  if exists (
    select 1 from (values
      ('partidos','club_team_season_id'),('jugadores','id'),
      ('jugadores','global_player_id'),('jugadores','membership_id'),
      ('club_team_season_players','club_team_season_id'),
      ('club_team_season_players','player_id'),
      ('club_team_season_players','id'),
      ('legacy_jugador_cts_links_v1','jugador_id'),
      ('legacy_jugador_cts_links_v1','club_team_season_player_id'),
      ('player_team_memberships','player_id'),
      ('player_team_memberships','team_id'),
      ('players_database','id'),('player_positions','player_id'),
      ('player_sources','player_id'),('player_scouting_traits','player_id'),
      ('legacy_own_player_migration','legacy_player_id')
    ) expected(table_name,column_name)
    left join pg_attribute a on
      a.attrelid=to_regclass(format('public.%I',expected.table_name))
      and a.attname=expected.column_name and not a.attisdropped
    where a.atttypid is distinct from 'uuid'::regtype
  ) then raise exception 'Columnas de identidad de guardas incompatibles'; end if;
  if (select a.atttypid from pg_attribute a
      where a.attrelid='public.player_team_memberships'::regclass
        and a.attname='season' and not a.attisdropped)
      is distinct from 'text'::regtype
    or (select a.atttypid from pg_attribute a
      where a.attrelid='public.club_seasons'::regclass
        and a.attname='label' and not a.attisdropped)
      is distinct from 'text'::regtype then
    raise exception 'Contrato de temporada de etapas incompatible';
  end if;
end $pre$;

create function public.transition_02_row_write_guard_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $function$
declare row_value jsonb; row_values jsonb[]; row_cts uuid; row_id uuid; mode text;
  active_cts uuid; target_team uuid; target_season text;
  matched_count integer; foreign_count integer; writes_open boolean;
begin
  -- La fila compartida serializa cada DML cubierto con la activacion o
  -- desactivacion. Una transaccion previa no atraviesa el corte a mitad.
  select active.club_team_season_id, active.writes_enabled
    into active_cts, writes_open
  from public.operational_cts_v1 active where active.singleton
  for share of active;
  if not exists (select 1 from public.operational_guard_versions_v1
                 where version=1) then
    if writes_open is true then
      raise exception 'OPERATIONAL_GUARD_MARKER_MISSING' using errcode='42501';
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if writes_open is not true then
    raise exception 'OPERATIONAL_WRITES_DISABLED' using errcode='42501';
  end if;
  mode := tg_argv[0];
  select cts.team_id, season.label into target_team, target_season
  from public.club_team_seasons cts
  join public.club_seasons season on season.id=cts.season_id
    and season.club_id=cts.club_id
  where cts.id=active_cts;
  if active_cts is null or target_team is null or target_season is null then
    raise exception 'OPERATIONAL_GUARD_UNAVAILABLE' using errcode='42501';
  end if;
  if mode='freeze' then
    raise exception 'UNSCOPED_SPORTS_WRITE_DENIED' using errcode='42501';
  end if;
  if tg_op='UPDATE' and mode='match' then
    if new.id is distinct from old.id
      or new.club_team_season_id is distinct from old.club_team_season_id then
      raise exception 'OPERATIONAL_ROW_IDENTITY_IMMUTABLE' using errcode='23514';
    end if;
  end if;
  if tg_op='UPDATE' and mode='ficha' then
    if new.id is distinct from old.id
      or new.global_player_id is distinct from old.global_player_id
      or new.membership_id is distinct from old.membership_id then
      raise exception 'OPERATIONAL_FICHA_IDENTITY_IMMUTABLE' using errcode='23514';
    end if;
  end if;
  if tg_op='UPDATE' and mode in ('cts','ctsp_link','stage') then
    if to_jsonb(new)->>'id' is distinct from to_jsonb(old)->>'id'
      or (mode='cts' and (
        to_jsonb(new)->>'club_team_season_id' is distinct from
          to_jsonb(old)->>'club_team_season_id'
        or to_jsonb(new)->>'player_id' is distinct from to_jsonb(old)->>'player_id'))
      or (mode='ctsp_link' and (
        to_jsonb(new)->>'jugador_id' is distinct from to_jsonb(old)->>'jugador_id'
        or to_jsonb(new)->>'club_team_season_player_id' is distinct from
          to_jsonb(old)->>'club_team_season_player_id'))
      or (mode='stage' and (
        to_jsonb(new)->>'player_id' is distinct from to_jsonb(old)->>'player_id'
        or to_jsonb(new)->>'team_id' is distinct from to_jsonb(old)->>'team_id'
        or to_jsonb(new)->>'season' is distinct from to_jsonb(old)->>'season'))
    then raise exception 'OPERATIONAL_LINK_IDENTITY_IMMUTABLE' using errcode='23514'; end if;
  end if;

  -- UPDATE comprueba OLD y NEW; evita mover un registro historico al activo.
  if tg_op='INSERT' then row_values:=array[to_jsonb(new)];
  elsif tg_op='DELETE' then row_values:=array[to_jsonb(old)];
  else row_values:=array[to_jsonb(old),to_jsonb(new)]; end if;
  foreach row_value in array row_values loop
    row_cts := null;
    if mode='match' or mode='cts' then
      row_cts := nullif(row_value->>tg_argv[1],'')::uuid;
    elsif mode='child' then
      row_id := nullif(row_value->>tg_argv[1],'')::uuid;
      if tg_argv[1]='snapshot_id' then
        select m.club_team_season_id into row_cts
        from public.partido_snapshots_tacticos s
        join public.partidos m on m.id=s.partido_id where s.id=row_id;
      else
        select m.club_team_season_id into row_cts
        from public.partidos m where m.id=row_id;
      end if;
    elsif mode='ctsp_link' then
      select roster.club_team_season_id into row_cts
      from public.club_team_season_players roster
      join public.club_team_seasons cts on cts.id=roster.club_team_season_id
      join public.jugadores ficha
        on ficha.id=nullif(row_value->>'jugador_id','')::uuid
        and ficha.global_player_id=roster.player_id
      join public.player_team_memberships stage
        on stage.id=ficha.membership_id
        and stage.player_id=ficha.global_player_id and stage.team_id=cts.team_id
        and stage.season=target_season
      where roster.id=nullif(row_value->>'club_team_season_player_id','')::uuid
        and roster.voided_at is null;
    elsif mode='ficha' or mode='migration' then
      row_id := case when mode='ficha' then nullif(row_value->>'id','')::uuid
        else nullif(row_value->>'legacy_player_id','')::uuid end;
      select count(*), min(roster.club_team_season_id::text)::uuid
        into matched_count,row_cts
      from public.jugadores ficha
      join public.legacy_jugador_cts_links_v1 binding on binding.jugador_id=ficha.id
      join public.club_team_season_players roster
        on roster.id=binding.club_team_season_player_id
        and roster.player_id=ficha.global_player_id and roster.voided_at is null
      join public.club_team_seasons cts on cts.id=roster.club_team_season_id
      join public.player_team_memberships stage
        on stage.id=ficha.membership_id and stage.player_id=ficha.global_player_id
        and stage.team_id=cts.team_id and stage.season=target_season
      where ficha.id=row_id;
      if matched_count<>1 then row_cts:=null; end if;
    elsif mode='stage' then
      if nullif(row_value->>'team_id','')::uuid=target_team
        and row_value->>'season'=target_season
        and exists (select 1 from public.club_team_season_players roster
          where roster.club_team_season_id=active_cts
            and roster.player_id=nullif(row_value->>'player_id','')::uuid
            and roster.voided_at is null)
      then row_cts:=active_cts; end if;
    elsif mode='global' then
      row_id := nullif(row_value->>tg_argv[1],'')::uuid;
      select count(*) filter (where roster.club_team_season_id=active_cts
                               and roster.voided_at is null),
             count(*) filter (where roster.club_team_season_id<>active_cts)
        into matched_count,foreign_count
      from public.club_team_season_players roster where roster.player_id=row_id;
      if matched_count=1 and foreign_count=0 then row_cts:=active_cts; end if;
    else
      raise exception 'OPERATIONAL_GUARD_MODE_INVALID' using errcode='42501';
    end if;
    if row_cts is distinct from active_cts
      or public.can_write_operational_cts_v1(row_cts) is not true then
      raise exception 'HISTORICAL_OR_OTHER_CTS_WRITE_DENIED'
        using errcode='42501';
    end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
alter function public.transition_02_row_write_guard_v1() owner to postgres;
revoke all on function public.transition_02_row_write_guard_v1()
  from public, anon, authenticated, service_role;

-- Ficha y perfil nuevo se insertan antes de su CTSP en 03B. Solo esas
-- inserciones usan constraint triggers diferidos hasta el COMMIT.
create constraint trigger transition_02_ficha_insert_guard
after insert on public.jugadores deferrable initially deferred
for each row execute function public.transition_02_row_write_guard_v1('ficha');
create trigger transition_02_ficha_change_guard
before update or delete on public.jugadores
for each row execute function public.transition_02_row_write_guard_v1('ficha');

do $triggers$
declare t text; mode text; key_name text;
begin
  foreach t in array array[
    'partidos','partido_estadisticas_jugador','partido_eventos_gol',
    'match_quick_events','partido_alineacion_slots',
    'partido_eventos_sistema','partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots','partido_eventos_post',
    'partido_convocados','partido_notas_individuales_pre',
    'partido_eventos_sustitucion','match_set_piece_takers',
    'match_set_piece_notes','match_set_piece_diagrams',
    'club_team_season_players','legacy_jugador_cts_links_v1',
    'player_team_memberships'
  ] loop
    mode:=case when t='partidos' then 'match'
      when t='club_team_season_players' then 'cts'
      when t='legacy_jugador_cts_links_v1' then 'ctsp_link'
      when t='player_team_memberships' then 'stage' else 'child' end;
    key_name:=case when t='partidos' or t='club_team_season_players'
      then 'club_team_season_id'
      when t='partido_snapshot_tactico_slots' then 'snapshot_id'
      else 'partido_id' end;
    if t='player_team_memberships' then
      execute format(
        'create constraint trigger transition_02_stage_insert_guard after insert on public.%I deferrable initially deferred for each row execute function public.transition_02_row_write_guard_v1(%L,%L)',
        t,mode,key_name);
      execute format(
        'create trigger transition_02_stage_change_guard before update or delete on public.%I for each row execute function public.transition_02_row_write_guard_v1(%L,%L)',
        t,mode,key_name);
    else
      execute format(
        'create trigger transition_02_row_write_guard before insert or update or delete on public.%I for each row execute function public.transition_02_row_write_guard_v1(%L,%L)',
        t,mode,key_name);
    end if;
  end loop;
  foreach t in array array[
    'players_database','player_positions','player_sources',
    'player_scouting_traits','legacy_own_player_migration'
  ] loop
    mode:=case when t='legacy_own_player_migration' then 'migration' else 'global' end;
    key_name:=case when t='players_database' then 'id' else 'player_id' end;
    execute format(
      'create constraint trigger transition_02_insert_guard after insert on public.%I deferrable initially deferred for each row execute function public.transition_02_row_write_guard_v1(%L,%L)',
      t,mode,key_name);
    execute format(
      'create trigger transition_02_change_guard before update or delete on public.%I for each row execute function public.transition_02_row_write_guard_v1(%L,%L)',
      t,mode,key_name);
  end loop;
  foreach t in array array[
    'equipos_rivales','jugadores_rivales','equipo_rival_alineacion',
    'equipo_rival_banquillo','competitions'
  ] loop
    execute format(
      'create trigger transition_02_global_freeze_guard before insert or update or delete on public.%I for each row execute function public.transition_02_row_write_guard_v1(%L)',
      t,'freeze');
  end loop;
end $triggers$;
commit;
