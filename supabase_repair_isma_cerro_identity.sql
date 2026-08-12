-- Reparación puntual autorizada para el UUID histórico de Isma Cerro.
-- REVISAR antes de ejecutar en Supabase. No modifica ningún otro jugador.
begin;

do $$
declare
  target_own_id constant uuid := '778c4e89-d806-4b7f-b7e5-072b1269fcb4';
  own_row record;
  own_before jsonb;
  own_after jsonb;
  own_team_id uuid;
  own_team_count integer;
  new_global_id uuid;
  new_membership_id uuid;
  compatible_profile_count integer;
  roster_count_before bigint;
  global_count_before bigint;
  membership_count_before bigint;
  mapping_count_before bigint;
  historical_counts_before jsonb := '{}'::jsonb;
  historical_count_before bigint;
  historical_count_after bigint;
  historical_table text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_own_id::text, 0));

  select own_player.*, to_jsonb(own_player) as snapshot
    into own_row
  from public.jugadores own_player
  where own_player.id = target_own_id
  for update;
  if not found then
    raise exception 'ISMA_REPAIR_ABORTED: jugadores.id no existe';
  end if;

  -- La segunda ejecución es un no-op únicamente si toda la identidad ya es coherente.
  if own_row.global_player_id is not null or own_row.membership_id is not null then
    if own_row.global_player_id is not null
       and own_row.membership_id is not null
       and exists (
         select 1
         from public.player_team_memberships membership
         join public.equipos_rivales team
           on team.id = membership.team_id and team.team_kind = 'own'
         where membership.id = own_row.membership_id
           and membership.player_id = own_row.global_player_id
           and membership.is_current
       )
       and exists (
         select 1
         from public.legacy_own_player_migration migration
         where migration.legacy_player_id = target_own_id
           and migration.global_player_id = own_row.global_player_id
           and migration.membership_id = own_row.membership_id
       ) then
      raise notice 'ISMA_REPAIR_ALREADY_APPLIED global_player_id=% membership_id=%',
        own_row.global_player_id, own_row.membership_id;
      return;
    end if;
    raise exception 'ISMA_REPAIR_ABORTED: identidad parcial o contradictoria';
  end if;

  if trim(own_row.name) <> 'ISMA CERRO'
     or own_row.dob is distinct from date '1995-07-07'
     or own_row.number is distinct from 16 then
    raise exception 'ISMA_REPAIR_ABORTED: la fila objetivo cambió sus datos de control';
  end if;
  if exists (
    select 1 from public.legacy_own_player_migration
    where legacy_player_id = target_own_id
  ) then
    raise exception 'ISMA_REPAIR_ABORTED: apareció un mapeo legacy previo';
  end if;

  select count(*)
    into own_team_count
  from public.equipos_rivales team
  where team.team_kind = 'own';
  if own_team_count <> 1 then
    raise exception 'ISMA_REPAIR_ABORTED: el equipo propio no es único';
  end if;
  select team.id
    into own_team_id
  from public.equipos_rivales team
  where team.team_kind = 'own';

  -- Revalidación segura: no considera candidato a Isma Fagir por compartir nombre.
  select count(distinct profile.id)
    into compatible_profile_count
  from public.players_database profile
  where (
    regexp_replace(lower(trim(profile.name)), '[^a-z0-9áéíóúüñ]+', '', 'g') =
      regexp_replace(lower(trim(own_row.name)), '[^a-z0-9áéíóúüñ]+', '', 'g')
    and profile.dob = own_row.dob
  ) or profile.legacy_origin_id = target_own_id
    or profile.field_sources #>> '{migration,legacyPlayerId}' = target_own_id::text
    or (
      nullif(own_row.image, '') is not null
      and profile.photo_url = own_row.image
    );
  if compatible_profile_count <> 0 then
    raise exception 'ISMA_REPAIR_ABORTED: aparecieron % perfiles globales compatibles', compatible_profile_count;
  end if;

  select count(*) into roster_count_before from public.jugadores;
  select count(*) into global_count_before from public.players_database;
  select count(*) into membership_count_before from public.player_team_memberships;
  select count(*) into mapping_count_before from public.legacy_own_player_migration;
  own_before := own_row.snapshot;

  foreach historical_table in array array[
    'partido_convocados',
    'partido_estadisticas_jugador',
    'partido_alineacion_slots',
    'partido_eventos_gol',
    'jugador_suspension_consumptions',
    'wellness_entries',
    'rpe_entries'
  ] loop
    if to_regclass('public.' || historical_table) is not null then
      execute format('select count(*) from public.%I', historical_table)
        into historical_count_before;
      historical_counts_before := historical_counts_before
        || jsonb_build_object(historical_table, historical_count_before);
    end if;
  end loop;

  new_global_id := gen_random_uuid();
  new_membership_id := gen_random_uuid();

  insert into public.players_database (
    id, name, shirt_name, photo_url, dob, height, foot,
    scouting_summary, scouting_priority,
    card_alert, sent_off_alert, suspended_alert, injured_alert,
    external_source, external_player_id, field_sources
  ) values (
    new_global_id,
    own_row.name,
    nullif(trim(own_row.shirt_name), ''),
    nullif(coalesce(own_row.image, own_row.original_image, own_row.processed_image), ''),
    own_row.dob,
    nullif(own_row.snapshot ->> 'height', ''),
    nullif(own_row.foot, ''),
    null,
    null,
    false,
    false,
    false,
    false,
    null,
    null,
    jsonb_build_object(
      'migration', jsonb_build_object(
        'source', 'authorized_own_roster_repair',
        'legacyPlayerId', target_own_id
      ),
      'photoUrl', jsonb_build_object('source', 'caudal_roster'),
      'position', jsonb_build_object('source', 'caudal_roster')
    )
  );

  insert into public.player_positions (
    player_id, position_type, position_key, is_primary, source
  ) values
    (new_global_id, 'natural', 'forward', true, 'caudal_roster'),
    (new_global_id, 'specific', 'left_winger', true, 'caudal_roster');

  insert into public.player_team_memberships (
    id, player_id, team_id, is_current, number, captain, is_key,
    observed, squad_role, tactical_role, tactical_slot, tactical_reserve_slot
  ) values (
    new_membership_id,
    new_global_id,
    own_team_id,
    true,
    own_row.number::text,
    coalesce((own_row.snapshot ->> 'captain')::boolean, false),
    coalesce((own_row.snapshot ->> 'is_key')::boolean, false),
    coalesce((own_row.snapshot ->> 'observed')::boolean, false),
    nullif(own_row.snapshot ->> 'role', ''),
    null,
    null,
    null
  );

  insert into public.legacy_own_player_migration (
    legacy_player_id, global_player_id, membership_id,
    match_basis, review_status, possible_duplicate_id
  ) values (
    target_own_id,
    new_global_id,
    new_membership_id,
    'authorized_orphan_repair',
    'confirmed',
    null
  );

  update public.jugadores
  set global_player_id = new_global_id,
      membership_id = new_membership_id
  where id = target_own_id
    and global_player_id is null
    and membership_id is null;
  if not found then
    raise exception 'ISMA_REPAIR_ABORTED: la fila cambió durante la transacción';
  end if;

  select to_jsonb(own_player)
    into own_after
  from public.jugadores own_player
  where own_player.id = target_own_id;
  if (own_before - 'global_player_id' - 'membership_id')
     is distinct from
     (own_after - 'global_player_id' - 'membership_id') then
    raise exception 'ISMA_REPAIR_ABORTED: se alteraron campos históricos de jugadores';
  end if;

  if (select count(*) from public.jugadores) <> roster_count_before
     or (select count(*) from public.players_database) <> global_count_before + 1
     or (select count(*) from public.player_team_memberships) <> membership_count_before + 1
     or (select count(*) from public.legacy_own_player_migration) <> mapping_count_before + 1 then
    raise exception 'ISMA_REPAIR_ABORTED: cardinalidad final inesperada';
  end if;

  foreach historical_table in array array[
    'partido_convocados',
    'partido_estadisticas_jugador',
    'partido_alineacion_slots',
    'partido_eventos_gol',
    'jugador_suspension_consumptions',
    'wellness_entries',
    'rpe_entries'
  ] loop
    if historical_counts_before ? historical_table then
      execute format('select count(*) from public.%I', historical_table)
        into historical_count_after;
      if historical_count_after <> (historical_counts_before ->> historical_table)::bigint then
        raise exception 'ISMA_REPAIR_ABORTED: cambió la tabla histórica %', historical_table;
      end if;
    end if;
  end loop;

  if not exists (
    select 1
    from public.jugadores own_player
    join public.players_database profile
      on profile.id = own_player.global_player_id
    join public.player_team_memberships membership
      on membership.id = own_player.membership_id
     and membership.player_id = profile.id
     and membership.is_current
    join public.equipos_rivales team
      on team.id = membership.team_id and team.team_kind = 'own'
    join public.legacy_own_player_migration migration
      on migration.legacy_player_id = own_player.id
     and migration.global_player_id = profile.id
     and migration.membership_id = membership.id
    where own_player.id = target_own_id
  ) then
    raise exception 'ISMA_REPAIR_ABORTED: la identidad final no es coherente';
  end if;

  raise notice 'ISMA_REPAIR_CREATED global_player_id=% membership_id=%', new_global_id, new_membership_id;
end;
$$;

-- Este SELECT devuelve los UUID creados y la auditoría 21/21 tras la ejecución.
select
  own_player.id as jugadores_id,
  own_player.global_player_id,
  own_player.membership_id,
  membership.player_id as membership_player_id,
  membership.team_id,
  team.name as team_name,
  team.team_kind,
  membership.is_current,
  migration.legacy_player_id,
  migration.global_player_id as migration_global_player_id,
  migration.membership_id as migration_membership_id,
  profile.name,
  profile.shirt_name,
  profile.dob,
  profile.foot,
  profile.photo_url,
  (select count(*) from public.jugadores) as roster_count,
  (
    select count(*)
    from public.jugadores roster
    join public.player_team_memberships coherent_membership
      on coherent_membership.id = roster.membership_id
     and coherent_membership.player_id = roster.global_player_id
     and coherent_membership.is_current
    join public.equipos_rivales coherent_team
      on coherent_team.id = coherent_membership.team_id
     and coherent_team.team_kind = 'own'
    join public.legacy_own_player_migration coherent_mapping
      on coherent_mapping.legacy_player_id = roster.id
     and coherent_mapping.global_player_id = roster.global_player_id
     and coherent_mapping.membership_id = roster.membership_id
    where roster.active_in_squad
  ) as resolved_roster_count
from public.jugadores own_player
join public.players_database profile on profile.id = own_player.global_player_id
join public.player_team_memberships membership on membership.id = own_player.membership_id
join public.equipos_rivales team on team.id = membership.team_id
join public.legacy_own_player_migration migration on migration.legacy_player_id = own_player.id
where own_player.id = '778c4e89-d806-4b7f-b7e5-072b1269fcb4'::uuid;

commit;
