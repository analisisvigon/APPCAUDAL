-- Multiclub 03, fase C: CORTE RLS. INSTALACION MANUAL SOLO DESPUES de
-- desplegar el cliente CTS, instalar fase A/B, pasar sus postflight y probar
-- todas las altas/ediciones del Caudal. Una transaccion: fallo = rollback.
-- No altera filas historicas. INSERT directo en jugadores queda denegado:
-- las altas deben usar create_own_player_atomic_v2.
begin;

do $preconditions$
declare
  target text;
  prefix text;
  expected_count integer;
  actual_count integer;
  child_column text;
  expected_names text[];
begin
  if auth.uid() is not null then raise exception 'Instalar sin JWT de usuario'; end if;
  if to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.link_existing_global_player_to_cts_v1(uuid,uuid)') is null
    or to_regprocedure('public.my_cts_jugadores_v1(uuid)') is null
    or to_regprocedure('public.legacy_jugador_in_cts_v1(uuid,uuid)') is null
    or to_regprocedure('public.legacy_jugador_in_snapshot_cts_v1(uuid,uuid)') is null
    or to_regprocedure('public.can_read_legacy_jugador_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.can_write_legacy_jugador_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.can_read_match_snapshot_v1(uuid)') is null
    or to_regprocedure('public.can_write_match_snapshot_v1(uuid)') is null then
    raise exception 'Faltan las fases A/B de Multiclub 03';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)')
      and p.prosecdef and p.proowner = 'postgres'::regrole
      and 'search_path=pg_catalog' = any(p.proconfig)
      and position('public.can_write_club_team_season(p_club_team_season_id)' in p.prosrc) > 0
      and position('public.legacy_jugador_cts_links_v1' in p.prosrc) > 0
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'Contrato del alta CTS inesperado';
  end if;
  if exists (select 1 from public.partidos where club_team_season_id is null)
    or exists (
      select 1 from public.jugadores ficha
      left join public.legacy_jugador_cts_links_v1 binding on binding.jugador_id = ficha.id
      where ficha.active_in_squad and binding.jugador_id is null
    ) then
    raise exception 'Hay partidos sin CTS o fichas activas sin vinculo exacto';
  end if;
  if exists (
    select 1 from public.legacy_jugador_cts_links_v1 binding
    left join public.club_team_season_players roster
      on roster.id = binding.club_team_season_player_id
    left join public.jugadores ficha on ficha.id = binding.jugador_id
    left join public.player_team_memberships stage on stage.id = ficha.membership_id
    left join public.club_team_seasons cts on cts.id = roster.club_team_season_id
    where roster.id is null or ficha.id is null or stage.id is null or cts.id is null
      or roster.voided_at is not null
      or roster.player_id is distinct from ficha.global_player_id
      or stage.player_id is distinct from ficha.global_player_id
      or stage.team_id is distinct from cts.team_id
  ) then
    raise exception 'Hay vinculos ficha-CTSP incoherentes';
  end if;
  -- Ninguna referencia UUID puede enlazar un jugador de otro CTS. El corte
  -- se detiene; los datos historicos se revisan sin reasignarlos por nombre.
  if exists (
    with refs(partido_id, jugador_id) as (
      select id, captain_player_id from public.partidos
      union all select id, goalkeeper_protocol_primary_player_id from public.partidos
      union all select id, goalkeeper_protocol_secondary_player_id from public.partidos
      union all select partido_id, jugador_id from public.partido_estadisticas_jugador
      union all select partido_id, jugador_id from public.partido_alineacion_slots
      union all select partido_id, jugador_id from public.partido_convocados
      union all select partido_id, jugador_id from public.match_quick_events
      union all select partido_id, scorer_id from public.partido_eventos_gol
      union all select partido_id, assistant_id from public.partido_eventos_gol
      union all select partido_id, jugador_id from public.match_set_piece_takers
      union all select snapshot.partido_id, slot.jugador_id
        from public.partido_snapshot_tactico_slots slot
        join public.partido_snapshots_tacticos snapshot on snapshot.id = slot.snapshot_id
    )
    select 1 from refs
    where jugador_id is not null and not exists (
      select 1 from public.partidos match_row
      join public.legacy_jugador_cts_links_v1 binding
        on binding.jugador_id = refs.jugador_id
      join public.club_team_season_players roster
        on roster.id = binding.club_team_season_player_id
       and roster.club_team_season_id = match_row.club_team_season_id
       and roster.voided_at is null
      join public.jugadores ficha on ficha.id = binding.jugador_id
       and ficha.global_player_id = roster.player_id
      join public.player_team_memberships stage on stage.id = ficha.membership_id
       and stage.player_id = ficha.global_player_id
      join public.club_team_seasons cts on cts.id = roster.club_team_season_id
       and cts.team_id = stage.team_id
      where match_row.id = refs.partido_id
    )
  ) then
    raise exception 'Hay referencias de jugadores sin vinculo exacto con el CTS del partido';
  end if;
  if position('public.can_read_match(p_partido_id)' in
      (select prosrc from pg_proc where oid =
        to_regprocedure('public.get_match_substitution_events(uuid)'))) = 0
    or position('public.can_write_match(p_partido_id)' in
      (select prosrc from pg_proc where oid =
        to_regprocedure('public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)'))) = 0 then
    raise exception 'Las RPC SECURITY DEFINER de sustituciones no estan acotadas';
  end if;
  -- Una RPC definer ejecutable por authenticated puede saltarse RLS. Las de
  -- esta fase no pueden conservar un guard global basado en is_app_staff().
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and p.prosrc ~* '(public[.])?(jugadores|partidos|partido_estadisticas_jugador|partido_eventos_gol|match_quick_events|partido_convocados|partido_alineacion_slots|partido_eventos_sustitucion|match_set_piece_takers|match_set_piece_notes|match_set_piece_diagrams)'
      and p.prosrc ~* 'is_app_staff[[:space:]]*[(][[:space:]]*[)]'
  ) then
    raise exception 'RPC SECURITY DEFINER expuesta con guard global de staff';
  end if;
  for target in select unnest(array[
    'jugadores', 'partidos', 'partido_estadisticas_jugador',
    'partido_eventos_gol', 'match_quick_events', 'partido_alineacion_slots',
    'partido_eventos_sistema', 'partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots', 'partido_eventos_post',
    'partido_convocados', 'partido_notas_individuales_pre',
    'partido_eventos_sustitucion', 'match_set_piece_takers',
    'match_set_piece_notes', 'match_set_piece_diagrams'
  ]) loop
    if to_regclass('public.' || target) is null then
      raise exception 'Falta tabla %', target;
    end if;
    if not (select c.relrowsecurity and not c.relforcerowsecurity from pg_class c
      where c.oid = to_regclass('public.' || target))
      or has_table_privilege('anon', to_regclass('public.' || target), 'SELECT')
      or has_table_privilege('anon', to_regclass('public.' || target), 'INSERT')
      or has_table_privilege('anon', to_regclass('public.' || target), 'UPDATE')
      or has_table_privilege('anon', to_regclass('public.' || target), 'DELETE') then
      raise exception 'RLS o privilegios anon incompatibles en %', target;
    end if;
    prefix := case when target = 'jugadores' then 'player_perimeter_staff_'
                   when target = 'partido_eventos_sustitucion' then 'substitution_staff_'
                   else 'player_sports_staff_' end;
    expected_names := case
      when target = 'partido_eventos_sustitucion' then array['substitution_staff_select']
      when target = 'match_set_piece_takers' then array[
        'Authenticated staff can read match set piece takers',
        'Authenticated staff can write match set piece takers']
      when target = 'match_set_piece_notes' then array[
        'Authenticated staff can read match set piece notes',
        'Authenticated staff can write match set piece notes']
      when target = 'match_set_piece_diagrams' then array[
        'Authenticated staff can read match set piece diagrams',
        'Authenticated staff can write match set piece diagrams']
      else array[prefix || 'select', prefix || 'insert',
                 prefix || 'update', prefix || 'delete'] end;
    expected_count := array_length(expected_names, 1);
    select count(*) into actual_count from pg_policy p
    where p.polrelid = to_regclass('public.' || target);
    if actual_count <> expected_count or exists (
      select 1 from pg_policy p
      where p.polrelid = to_regclass('public.' || target)
        and p.polname <> all(expected_names)
    ) then
      raise exception 'Politicas inesperadas en %. Revisar preflight', target;
    end if;
    if target not in ('jugadores', 'partidos') then
      child_column := case when target = 'partido_snapshot_tactico_slots'
                           then 'snapshot_id' else 'partido_id' end;
      if not exists (select 1 from pg_attribute a
        where a.attrelid = to_regclass('public.' || target)
          and a.attname = child_column and not a.attisdropped) then
        raise exception 'Falta %.%', target, child_column;
      end if;
      if not exists (
        select 1 from pg_constraint fk
        where fk.conrelid = to_regclass('public.' || target)
          and fk.confrelid = case when child_column = 'snapshot_id'
            then 'public.partido_snapshots_tacticos'::regclass
            else 'public.partidos'::regclass end
          and fk.contype = 'f' and fk.convalidated
          and fk.conkey = array[(select a.attnum from pg_attribute a
            where a.attrelid = to_regclass('public.' || target)
              and a.attname = child_column)]::smallint[]
      ) then
        raise exception 'Falta FK validada para %.%', target, child_column;
      end if;
    end if;
  end loop;
  -- El corte no puede neutralizar una vista definer accesible al staff.
  if exists (
    select 1 from pg_views v
    join pg_class c on c.oid = format('%I.%I', v.schemaname, v.viewname)::regclass
    where v.schemaname = 'public'
      and v.definition ~* '(jugadores|partidos|partido_estadisticas_jugador|partido_eventos_gol|match_quick_events|match_set_piece_takers|match_set_piece_notes|match_set_piece_diagrams)'
      and has_table_privilege('authenticated', c.oid, 'SELECT')
      and not coalesce('security_invoker=true' = any(c.reloptions), false)
  ) then
    raise exception 'Vista SECURITY DEFINER expuesta sobre Plantilla/Partidos';
  end if;
end
$preconditions$;

create function public.prevent_partido_cts_move_v1()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  if new.club_team_season_id is distinct from old.club_team_season_id then
    raise exception 'PARTIDO_CTS_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke all on function public.prevent_partido_cts_move_v1() from public, anon, authenticated;
create trigger prevent_partido_cts_move_v1
before update of club_team_season_id on public.partidos
for each row execute function public.prevent_partido_cts_move_v1();

-- Ficha legacy: vinculo exacto para lectura/escritura; alta solo por RPC v2.
drop policy player_perimeter_staff_select on public.jugadores;
drop policy player_perimeter_staff_insert on public.jugadores;
drop policy player_perimeter_staff_update on public.jugadores;
drop policy player_perimeter_staff_delete on public.jugadores;
create policy multiclub_03_read on public.jugadores for select to authenticated
  using (public.can_read_legacy_jugador_v1(id, global_player_id, membership_id));
create policy multiclub_03_insert on public.jugadores for insert to authenticated
  with check (false);
create policy multiclub_03_update on public.jugadores for update to authenticated
  using (public.can_write_legacy_jugador_v1(id, global_player_id, membership_id))
  with check (public.can_write_legacy_jugador_v1(id, global_player_id, membership_id));
create policy multiclub_03_delete on public.jugadores for delete to authenticated
  using (public.can_write_legacy_jugador_v1(id, global_player_id, membership_id));

drop policy player_sports_staff_select on public.partidos;
drop policy player_sports_staff_insert on public.partidos;
drop policy player_sports_staff_update on public.partidos;
drop policy player_sports_staff_delete on public.partidos;
create policy multiclub_03_read on public.partidos for select to authenticated
  using (public.can_read_club_team_season(club_team_season_id));
create policy multiclub_03_insert on public.partidos for insert to authenticated
  with check (
    public.can_write_club_team_season(club_team_season_id)
    and (captain_player_id is null or
      public.legacy_jugador_in_cts_v1(captain_player_id, club_team_season_id))
    and (goalkeeper_protocol_primary_player_id is null or
      public.legacy_jugador_in_cts_v1(goalkeeper_protocol_primary_player_id, club_team_season_id))
    and (goalkeeper_protocol_secondary_player_id is null or
      public.legacy_jugador_in_cts_v1(goalkeeper_protocol_secondary_player_id, club_team_season_id))
  );
create policy multiclub_03_update on public.partidos for update to authenticated
  using (public.can_write_club_team_season(club_team_season_id))
  with check (
    public.can_write_club_team_season(club_team_season_id)
    and (captain_player_id is null or
      public.legacy_jugador_in_cts_v1(captain_player_id, club_team_season_id))
    and (goalkeeper_protocol_primary_player_id is null or
      public.legacy_jugador_in_cts_v1(goalkeeper_protocol_primary_player_id, club_team_season_id))
    and (goalkeeper_protocol_secondary_player_id is null or
      public.legacy_jugador_in_cts_v1(goalkeeper_protocol_secondary_player_id, club_team_season_id))
  );
create policy multiclub_03_delete on public.partidos for delete to authenticated
  using (public.can_write_club_team_season(club_team_season_id));

-- Hijos: el permiso procede siempre del partido/snapshot de la fila.
do $children$
declare
  target text;
  key_column text;
  read_check text;
  write_check text;
  player_check text;
begin
  for target in select unnest(array[
    'partido_estadisticas_jugador', 'partido_eventos_gol',
    'match_quick_events', 'partido_alineacion_slots',
    'partido_eventos_sistema', 'partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots', 'partido_eventos_post',
    'partido_convocados', 'partido_notas_individuales_pre'
  ]) loop
    key_column := case when target = 'partido_snapshot_tactico_slots'
      then 'snapshot_id' else 'partido_id' end;
    read_check := case when key_column = 'snapshot_id'
      then 'public.can_read_match_snapshot_v1(snapshot_id)'
      else 'public.can_read_match(partido_id)' end;
    write_check := case when key_column = 'snapshot_id'
      then 'public.can_write_match_snapshot_v1(snapshot_id)'
      else 'public.can_write_match(partido_id)' end;
    player_check := '';
    if exists (select 1 from pg_attribute a
      where a.attrelid = to_regclass('public.' || target)
        and a.attname = 'jugador_id' and not a.attisdropped) then
      player_check := case when key_column = 'snapshot_id'
        then ' and (jugador_id is null or public.legacy_jugador_in_snapshot_cts_v1(jugador_id,snapshot_id))'
        else ' and (jugador_id is null or public.legacy_jugador_in_match_cts_v1(jugador_id,partido_id))' end;
    end if;
    if target = 'partido_eventos_gol' then
      player_check := player_check
        || ' and (scorer_id is null or public.legacy_jugador_in_match_cts_v1(scorer_id,partido_id))'
        || ' and (assistant_id is null or public.legacy_jugador_in_match_cts_v1(assistant_id,partido_id))';
    end if;
    execute format('drop policy player_sports_staff_select on public.%I', target);
    execute format('drop policy player_sports_staff_insert on public.%I', target);
    execute format('drop policy player_sports_staff_update on public.%I', target);
    execute format('drop policy player_sports_staff_delete on public.%I', target);
    execute format('create policy multiclub_03_read on public.%I for select to authenticated using (%s)',
      target, read_check);
    execute format('create policy multiclub_03_insert on public.%I for insert to authenticated with check (%s)',
      target, write_check || player_check);
    execute format('create policy multiclub_03_update on public.%I for update to authenticated using (%s) with check (%s)',
      target, write_check, write_check || player_check);
    execute format('create policy multiclub_03_delete on public.%I for delete to authenticated using (%s)',
      target, write_check);
  end loop;
end
$children$;

-- Plan de partido: las tres tablas tenian politicas authenticated USING (true).
-- Los lanzadores referenciados deben pertenecer al mismo CTS del partido.
do $set_pieces$
declare
  target text;
  label text;
  write_check text;
begin
  for target, label in select * from (values
    ('match_set_piece_takers', 'takers'),
    ('match_set_piece_notes', 'notes'),
    ('match_set_piece_diagrams', 'diagrams')
  ) as expected(table_name, policy_suffix) loop
    write_check := 'public.can_write_match(partido_id)';
    if target = 'match_set_piece_takers' then
      write_check := write_check ||
        ' and (jugador_id is null or public.legacy_jugador_in_match_cts_v1(jugador_id,partido_id))';
    end if;
    execute format('drop policy %I on public.%I',
      'Authenticated staff can read match set piece ' || label, target);
    execute format('drop policy %I on public.%I',
      'Authenticated staff can write match set piece ' || label, target);
    execute format('create policy multiclub_03_read on public.%I for select to authenticated using (public.can_read_match(partido_id))', target);
    execute format('create policy multiclub_03_insert on public.%I for insert to authenticated with check (%s)', target, write_check);
    execute format('create policy multiclub_03_update on public.%I for update to authenticated using (public.can_write_match(partido_id)) with check (%s)', target, write_check);
    execute format('create policy multiclub_03_delete on public.%I for delete to authenticated using (public.can_write_match(partido_id))', target);
  end loop;
end
$set_pieces$;

drop policy substitution_staff_select on public.partido_eventos_sustitucion;
create policy multiclub_03_read on public.partido_eventos_sustitucion
for select to authenticated using (public.can_read_match(partido_id));

-- Ninguna politica permisiva anterior debe sobrevivir en las tablas cortadas.
do $postconditions$
declare target text; expected_count integer; actual_count integer;
begin
  for target in select unnest(array[
    'jugadores', 'partidos', 'partido_estadisticas_jugador',
    'partido_eventos_gol', 'match_quick_events', 'partido_alineacion_slots',
    'partido_eventos_sistema', 'partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots', 'partido_eventos_post',
    'partido_convocados', 'partido_notas_individuales_pre',
    'partido_eventos_sustitucion', 'match_set_piece_takers',
    'match_set_piece_notes', 'match_set_piece_diagrams'
  ]) loop
    expected_count := case when target = 'partido_eventos_sustitucion' then 1 else 4 end;
    select count(*) into actual_count from pg_policy p
    where p.polrelid = to_regclass('public.' || target);
    if actual_count <> expected_count or exists (
      select 1 from pg_policy p
      where p.polrelid = to_regclass('public.' || target)
        and p.polname not like 'multiclub_03_%'
    ) then
      raise exception 'Corte incompleto en %', target;
    end if;
  end loop;
end
$postconditions$;

commit;
