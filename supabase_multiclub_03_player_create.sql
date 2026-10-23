-- Multiclub 03, fase B. Instalar MANUALMENTE despues de fase A.
-- Version CTS explicita del alta atomica; no reemplaza la RPC legacy.
-- Alta de perfil nuevo y enlace separado de perfil global ya existente.
-- Ninguna de las dos rutas reutiliza una ficha legacy de otro CTS.
begin;

do $preflight$
declare write_helper record;
begin
  if auth.uid() is not null then raise exception 'Instalar sin JWT de usuario'; end if;
  if to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is not null
    or to_regprocedure('public.link_existing_global_player_to_cts_v1(uuid,uuid)') is not null
    or to_regprocedure('public.my_cts_jugadores_v1(uuid)') is null
    or to_regprocedure('public.has_club_role(uuid,text[])') is null
    or to_regclass('public.legacy_jugador_cts_links_v1') is null
    or to_regclass('public.club_team_season_players') is null then
    raise exception 'Fase B ya existe o falta fase A';
  end if;
  if (select a.atttypid from pg_attribute a
      where a.attrelid = 'public.player_team_memberships'::regclass
        and a.attname = 'season' and not a.attisdropped) is distinct from 'pg_catalog.text'::regtype
    or (select a.atttypid from pg_attribute a
      where a.attrelid = 'public.club_seasons'::regclass
        and a.attname = 'label' and not a.attisdropped) is distinct from 'pg_catalog.text'::regtype then
    raise exception 'Contrato de temporada inesperado';
  end if;
  select prosecdef, proowner, proconfig, prosrc into write_helper from pg_proc
  where oid = to_regprocedure('public.can_write_club_team_season(uuid)');
  if not found or not write_helper.prosecdef
    or write_helper.proowner <> 'postgres'::regrole
    or not coalesce('search_path=pg_catalog' = any(write_helper.proconfig), false)
    or position('public.can_read_club_team_season(target_club_team_season_id)' in write_helper.prosrc) = 0
    or position('season.status = ''open''' in write_helper.prosrc) = 0 then
    raise exception 'can_write_club_team_season no acredita acceso y temporada abierta';
  end if;
  if to_regclass('public.players_database') is null
    or to_regclass('public.player_positions') is null
    or to_regclass('public.player_sources') is null
    or to_regclass('public.player_scouting_traits') is null
    or (select a.atttypid from pg_attribute a
        where a.attrelid = to_regclass('public.players_database')
          and a.attname = 'shirt_name' and not a.attisdropped)
       is distinct from 'pg_catalog.text'::regtype then
    raise exception 'Contrato de perfil global inesperado';
  end if;
  if exists (
    select 1 from pg_trigger trigger_row
    left join pg_proc function_row on function_row.oid = trigger_row.tgfoid
    where trigger_row.tgrelid = 'public.players_database'::regclass
      and not trigger_row.tgisinternal and trigger_row.tgenabled <> 'D'
      and (trigger_row.tgtype & 4) <> 0
      and (trigger_row.tgfoid is distinct from
             to_regprocedure('public.sync_global_player_shirt_name_to_legacy()')::oid
        or function_row.prosecdef
        or position('where global_player_id = new.id' in function_row.prosrc) = 0)
  ) then
    raise exception 'Trigger INSERT de perfil global no verificado';
  end if;
end
$preflight$;

create function public.create_own_player_atomic_v2(
  p_club_team_season_id uuid,
  p_own_player_id uuid,
  p_player jsonb,
  p_positions jsonb default '[]'::jsonb,
  p_sources jsonb default '[]'::jsonb,
  p_traits jsonb default '[]'::jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $function$
declare
  target_team_id uuid;
  target_club_id uuid;
  target_season_label text;
  target_starts_on date;
  target_ends_on date;
  requested_start_date date;
  actor_membership_id uuid;
  actor_membership_count integer;
  created_global_id uuid;
  created_stage_id uuid;
  created_ctsp_id uuid;
  existing_ficha record;
  natural_position_key text;
  position_label text;
  photo_url text;
begin
  if auth.uid() is null or p_club_team_season_id is null
    or not public.can_write_club_team_season(p_club_team_season_id) then
    raise exception 'CTS_WRITE_DENIED' using errcode = '42501';
  end if;
  if p_own_player_id is null or nullif(pg_catalog.btrim(p_player->>'name'), '') is null
    or nullif(p_player->>'id', '') is not null
    or nullif(p_player->>'globalPlayerId', '') is not null then
    raise exception 'OWN_PLAYER_INPUT_INVALID' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_positions, 'null'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_sources, 'null'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_traits, 'null'::jsonb)) <> 'array' then
    raise exception 'OWN_PLAYER_ARRAYS_INVALID' using errcode = '22023';
  end if;

  select cts.team_id, cts.club_id, season.label, season.starts_on, season.ends_on
    into target_team_id, target_club_id, target_season_label,
         target_starts_on, target_ends_on
  from public.club_team_seasons cts
  join public.club_teams team on team.id = cts.team_id and team.club_id = cts.club_id
  join public.club_seasons season on season.id = cts.season_id
    and season.club_id = cts.club_id and season.status = 'open'
  join public.equipos_rivales legacy_team on legacy_team.id = team.id
  where cts.id = p_club_team_season_id and legacy_team.team_kind = 'own';
  if target_team_id is null or nullif(pg_catalog.btrim(target_season_label), '') is null then
    raise exception 'CTS_OWN_TEAM_REQUIRED' using errcode = '22023';
  end if;
  if nullif(p_player->>'teamId', '') is not null
    and p_player->>'teamId' <> target_team_id::text then
    raise exception 'CTS_TEAM_MISMATCH' using errcode = '22023';
  end if;
  requested_start_date := nullif(p_player->>'startDate', '')::date;
  if requested_start_date is not null
    and requested_start_date not between target_starts_on and target_ends_on then
    raise exception 'CTS_START_DATE_OUTSIDE_SEASON' using errcode = '22023';
  end if;

  select count(*), min(membership.id::text)::uuid
    into actor_membership_count, actor_membership_id
  from public.club_memberships membership
  where membership.user_id = auth.uid()
    and membership.club_id = target_club_id
    and membership.is_active
    and membership.role in ('owner', 'admin', 'staff');
  if actor_membership_count <> 1 then
    raise exception 'CTS_MEMBERSHIP_AMBIGUOUS' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_own_player_id::text, 0));
  select ficha.id, ficha.global_player_id, ficha.membership_id,
         binding.club_team_season_player_id,
         roster.club_team_season_id
    into existing_ficha
  from public.jugadores ficha
  left join public.legacy_jugador_cts_links_v1 binding on binding.jugador_id = ficha.id
  left join public.club_team_season_players roster
    on roster.id = binding.club_team_season_player_id
  where ficha.id = p_own_player_id;
  if found then
    if existing_ficha.global_player_id is not null
      and existing_ficha.membership_id is not null
      and existing_ficha.club_team_season_id = p_club_team_season_id
      and exists (select 1 from public.player_team_memberships stage
        where stage.id = existing_ficha.membership_id
          and stage.player_id = existing_ficha.global_player_id
          and stage.team_id = target_team_id)
      and exists (select 1 from public.club_team_season_players roster
        where roster.id = existing_ficha.club_team_season_player_id
          and roster.player_id = existing_ficha.global_player_id
          and roster.voided_at is null) then
      return pg_catalog.jsonb_build_object(
        'status', 'already_created', 'ownPlayerId', p_own_player_id,
        'globalPlayerId', existing_ficha.global_player_id,
        'membershipId', existing_ficha.membership_id);
    end if;
    raise exception 'OWN_PLAYER_ID_CONFLICT' using errcode = '23505';
  end if;

  -- Conserva la proteccion contra duplicados del alta legacy, sin usar nombres
  -- para determinar el CTS. El CTS siempre procede del parametro autorizado.
  if exists (
    select 1 from public.players_database profile
    where (
      pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(profile.name)),
        '[^a-z0-9áéíóúüñ]+', '', 'g') =
      pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(p_player->>'name')),
        '[^a-z0-9áéíóúüñ]+', '', 'g')
      and (nullif(p_player->>'dob', '') is null or profile.dob is null
        or profile.dob = nullif(p_player->>'dob', '')::date)
    ) or (
      nullif(pg_catalog.btrim(p_player->>'externalSource'), '') is not null
      and nullif(pg_catalog.btrim(p_player->>'externalPlayerId'), '') is not null
      and pg_catalog.lower(pg_catalog.btrim(profile.external_source)) =
        pg_catalog.lower(pg_catalog.btrim(p_player->>'externalSource'))
      and profile.external_player_id = pg_catalog.btrim(p_player->>'externalPlayerId')
    ) or exists (
      select 1 from public.player_sources source
      join pg_catalog.jsonb_array_elements(p_sources) incoming on true
      where source.player_id = profile.id
        and nullif(pg_catalog.btrim(incoming->>'url'), '') is not null
        and pg_catalog.lower(pg_catalog.btrim(source.url)) =
          pg_catalog.lower(pg_catalog.btrim(incoming->>'url'))
    )
  ) then
    raise exception 'OWN_PLAYER_COMPATIBLE_GLOBAL_PROFILE_EXISTS' using errcode = '23505';
  end if;

  -- INSERT sin ID del cliente; ninguna llamada puede actualizar otro perfil.
  insert into public.players_database (
    name, shirt_name, photo_url, dob, age, height, foot, scouting_summary,
    scouting_priority, card_alert, sent_off_alert, suspended_alert,
    injured_alert, external_source, external_player_id, field_sources
  ) values (
    pg_catalog.btrim(p_player->>'name'),
    nullif(pg_catalog.btrim(p_player->>'shirtName'), ''),
    nullif(p_player->>'photoUrl', ''), nullif(p_player->>'dob', '')::date,
    nullif(p_player->>'age', ''), nullif(p_player->>'height', ''),
    nullif(p_player->>'foot', ''),
    pg_catalog.left(nullif(p_player->>'scoutingSummary', ''), 500),
    nullif(p_player->>'scoutingPriority', ''),
    coalesce((p_player->>'cardAlert')::boolean, false),
    coalesce((p_player->>'sentOffAlert')::boolean, false),
    coalesce((p_player->>'suspendedAlert')::boolean, false),
    coalesce((p_player->>'injuredAlert')::boolean, false),
    nullif(p_player->>'externalSource', ''),
    nullif(p_player->>'externalPlayerId', ''),
    coalesce(p_player->'fieldSources', '{}'::jsonb)
  ) returning id into created_global_id;

  insert into public.player_positions (
    player_id, position_type, position_key, is_primary, source
  ) select created_global_id, item.position_type, item.position_key,
           item.is_primary, coalesce(nullif(item.source, ''), 'manual')
    from pg_catalog.jsonb_to_recordset(p_positions)
      as item(position_type text, position_key text, is_primary boolean, source text);
  insert into public.player_sources (
    player_id, url, source_name, is_primary, analysis_status, analyzed_at,
    analysis_error, analysis_summary
  ) select created_global_id, item.url,
           coalesce(nullif(item.source_name, ''), 'Otro'), item.is_primary,
           coalesce(nullif(item.analysis_status, ''), 'not_analyzed'),
           item.analyzed_at, nullif(item.analysis_error, ''),
           coalesce(item.analysis_summary, '{}'::jsonb)
    from pg_catalog.jsonb_to_recordset(p_sources)
      as item(url text, source_name text, is_primary boolean,
              analysis_status text, analyzed_at timestamptz,
              analysis_error text, analysis_summary jsonb)
    where nullif(pg_catalog.btrim(item.url), '') is not null;
  insert into public.player_scouting_traits (
    player_id, category, label, position_family
  ) select created_global_id, item.category, pg_catalog.btrim(item.label),
           nullif(item.position_family, '')
    from pg_catalog.jsonb_to_recordset(p_traits)
      as item(category text, label text, position_family text)
    where nullif(pg_catalog.btrim(item.label), '') is not null;

  insert into public.player_team_memberships (
    player_id, team_id, season, start_date, is_current, number,
    captain, is_key, observed, squad_role, source_url
  ) values (
    created_global_id, target_team_id,
    target_season_label, requested_start_date,
    true, nullif(p_player->>'number', ''),
    coalesce((p_player->>'captain')::boolean, false),
    coalesce((p_player->>'isKey')::boolean, false),
    coalesce((p_player->>'observed')::boolean, false),
    nullif(p_player->>'role', ''), nullif(p_player->>'sourceUrl', '')
  ) returning id into created_stage_id;

  select item.position_key into natural_position_key
  from pg_catalog.jsonb_to_recordset(p_positions)
    as item(position_type text, position_key text, is_primary boolean)
  where item.position_type = 'natural'
  order by item.is_primary desc limit 1;
  position_label := case natural_position_key
    when 'goalkeeper' then 'Portero' when 'defender' then 'Defensa'
    when 'midfielder' then 'Centrocampista' when 'forward' then 'Delantero'
    else '' end;
  photo_url := nullif(p_player->>'photoUrl', '');

  insert into public.jugadores (
    id, name, shirt_name, google_forms_name, dob, number, position, foot,
    image, original_image, global_player_id, membership_id, active_in_squad
  ) values (
    p_own_player_id, pg_catalog.btrim(p_player->>'name'),
    nullif(pg_catalog.btrim(p_player->>'shirtName'), ''),
    nullif(pg_catalog.btrim(p_player->>'googleFormsName'), ''),
    nullif(p_player->>'dob', '')::date,
    coalesce(nullif(pg_catalog.regexp_replace(coalesce(p_player->>'number', ''),
      '[^0-9]', '', 'g'), ''), '0')::integer,
    position_label, coalesce(nullif(p_player->>'foot', ''), ''),
    coalesce(photo_url, ''), photo_url, created_global_id, created_stage_id, true
  );
  insert into public.club_team_season_players (
    club_team_season_id, player_id, created_by_membership_id
  ) values (
    p_club_team_season_id, created_global_id, actor_membership_id
  ) returning id into created_ctsp_id;
  insert into public.legacy_jugador_cts_links_v1 (
    jugador_id, club_team_season_player_id
  ) values (p_own_player_id, created_ctsp_id);
  insert into public.legacy_own_player_migration (
    legacy_player_id, global_player_id, membership_id, match_basis, review_status
  ) values (
    p_own_player_id, created_global_id, created_stage_id,
    'atomic_own_player_create', 'confirmed'
  );
  return pg_catalog.jsonb_build_object(
    'status', 'created', 'ownPlayerId', p_own_player_id,
    'globalPlayerId', created_global_id, 'membershipId', created_stage_id);
end;
$function$;

alter function public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)
  owner to postgres;
revoke all on function public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)
  to authenticated;

-- Perfil global existente: solo vinculo canonico. No crea ni reutiliza fichas
-- legacy; Plantilla requiere despues una proyeccion CTS propia para mostrarlo.
create function public.link_existing_global_player_to_cts_v1(
  p_club_team_season_id uuid,
  p_global_player_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $function$
declare
  target_team_id uuid;
  target_club_id uuid;
  target_season_label text;
  actor_membership_id uuid;
  actor_membership_count integer;
  existing_ctsp_id uuid;
  existing_ctsp_count integer;
  existing_has_departed boolean;
  created_stage_id uuid;
  created_ctsp_id uuid;
begin
  if auth.uid() is null or p_club_team_season_id is null
    or p_global_player_id is null
    or public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'CTS_WRITE_DENIED' using errcode = '42501';
  end if;
  select cts.team_id, cts.club_id, season.label
    into target_team_id, target_club_id, target_season_label
  from public.club_team_seasons cts
  join public.club_teams team on team.id = cts.team_id and team.club_id = cts.club_id
  join public.club_seasons season on season.id = cts.season_id
    and season.club_id = cts.club_id and season.status = 'open'
  join public.equipos_rivales legacy_team on legacy_team.id = team.id
  where cts.id = p_club_team_season_id and legacy_team.team_kind = 'own';
  if target_team_id is null or nullif(pg_catalog.btrim(target_season_label), '') is null then
    raise exception 'CTS_OWN_TEAM_REQUIRED' using errcode = '22023';
  end if;
  select count(*), min(membership.id::text)::uuid
    into actor_membership_count, actor_membership_id
  from public.club_memberships membership
  where membership.user_id = auth.uid()
    and membership.club_id = target_club_id
    and membership.is_active
    and membership.role in ('owner', 'admin');
  if actor_membership_count <> 1 then
    raise exception 'CTS_OWNER_OR_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_global_player_id::text, 1));
  -- Un UUID conocido no acredita procedencia: exigir CTSP canonico previo
  -- y autorizacion owner/admin en todos sus clubes de origen.
  if not exists (select 1 from public.players_database profile
                 where profile.id = p_global_player_id)
    or not exists (
      select 1 from public.club_team_season_players roster
      where roster.player_id = p_global_player_id and roster.voided_at is null
    ) or exists (
    select 1 from public.club_team_season_players roster
    join public.club_team_seasons source_cts
      on source_cts.id = roster.club_team_season_id
    where roster.player_id = p_global_player_id
      and public.has_club_role(source_cts.club_id, array['owner','admin']::text[]) is not true
  ) or exists (
    select 1 from public.player_team_memberships stage
    left join public.club_teams source_team on source_team.id = stage.team_id
    where stage.player_id = p_global_player_id
      and (source_team.id is null
        or public.has_club_role(source_team.club_id, array['owner','admin']::text[]) is not true
        or not exists (
          select 1 from public.club_team_season_players roster
          join public.club_team_seasons source_cts
            on source_cts.id = roster.club_team_season_id
          where roster.player_id = p_global_player_id
            and roster.voided_at is null
            and source_cts.team_id = stage.team_id
        ))
  ) or exists (
    select 1 from public.jugadores ficha
    left join public.legacy_jugador_cts_links_v1 binding
      on binding.jugador_id = ficha.id
    left join public.club_team_season_players roster
      on roster.id = binding.club_team_season_player_id
    where ficha.global_player_id = p_global_player_id
      and (roster.id is null or roster.player_id <> p_global_player_id
        or roster.voided_at is not null)
  ) then
    raise exception 'SOURCE_CLUB_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  select count(*), min(roster.id::text)::uuid,
         coalesce(bool_or(roster.has_departed), false)
    into existing_ctsp_count, existing_ctsp_id, existing_has_departed
  from public.club_team_season_players roster
  where roster.club_team_season_id = p_club_team_season_id
    and roster.player_id = p_global_player_id
    and roster.voided_at is null;
  if existing_ctsp_count > 0 then
    if existing_ctsp_count <> 1 or existing_has_departed then
      raise exception 'CTS_PLAYER_LINK_REVIEW_REQUIRED' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'already_linked', 'playerId', p_global_player_id,
      'clubTeamSeasonPlayerId', existing_ctsp_id);
  end if;
  -- El modelo global actual no permite trasladar de forma implicita una
  -- etapa activa de otro equipo. Su resolucion queda para un flujo CTS propio.
  if exists (select 1 from public.player_team_memberships stage
             where stage.player_id = p_global_player_id and stage.is_current) then
    raise exception 'GLOBAL_PLAYER_HAS_CURRENT_STAGE_REVIEW_REQUIRED'
      using errcode = '23505';
  end if;
  insert into public.player_team_memberships (
    player_id, team_id, season, is_current
  ) values (
    p_global_player_id, target_team_id, target_season_label, true
  ) returning id into created_stage_id;
  insert into public.club_team_season_players (
    club_team_season_id, player_id, created_by_membership_id
  ) values (
    p_club_team_season_id, p_global_player_id, actor_membership_id
  ) returning id into created_ctsp_id;
  return pg_catalog.jsonb_build_object(
    'status', 'linked', 'playerId', p_global_player_id,
    'clubTeamSeasonPlayerId', created_ctsp_id,
    'membershipId', created_stage_id);
end;
$function$;
alter function public.link_existing_global_player_to_cts_v1(uuid,uuid)
  owner to postgres;
revoke all on function public.link_existing_global_player_to_cts_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.link_existing_global_player_to_cts_v1(uuid,uuid)
  to authenticated;
commit;
