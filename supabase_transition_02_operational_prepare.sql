-- TRANSICION 02 / PREPARACION. INSTALACION MANUAL tras revisar preflight.
-- No designa ningun CTS, no cambia datos deportivos, RLS ni RPC legacy.
-- Las RPC nuevas deniegan toda escritura mientras el registro este vacio.
-- La habilitacion requiere un marcador FK insertado en el corte posterior.
begin;

do $preflight$
begin
  if auth.uid() is not null then raise exception 'Instalar sin JWT de usuario'; end if;
  if to_regclass('public.operational_cts_v1') is not null
    or to_regclass('public.operational_guard_versions_v1') is not null
    or to_regprocedure('public.can_write_operational_cts_v1(uuid)') is not null
    or to_regprocedure('public.my_operational_cts_v1()') is not null
    or to_regprocedure('public.can_open_historical_cts_v1(uuid)') is not null
    or to_regprocedure('public.create_operational_player_v1(uuid,uuid,jsonb,jsonb)') is not null
    or to_regprocedure('public.edit_operational_player_v1(uuid,uuid,jsonb)') is not null
    or to_regprocedure('public.create_operational_match_v1(uuid,jsonb)') is not null
    or to_regprocedure('public.edit_operational_match_v1(uuid,uuid,jsonb)') is not null then
    raise exception 'Transicion 02 ya existe: revisar antes de repetir';
  end if;
  if to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.can_write_club_team_season(uuid)') is null
    or to_regprocedure('public.can_write_match(uuid)') is null
    or to_regprocedure('public.legacy_jugador_in_cts_v1(uuid,uuid)') is null
    or to_regclass('public.legacy_jugador_cts_links_v1') is null then
    raise exception 'Faltan dependencias 02/03A/03B';
  end if;
  if not exists (select 1 from pg_proc p
    where p.oid = to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)')
      and p.prosecdef and p.proowner = 'postgres'::regrole
      and 'search_path=pg_catalog' = any(p.proconfig)) then
    raise exception 'Contrato de RPC 03B inesperado';
  end if;
  if to_regclass('public.jugadores') is null
    or to_regclass('public.partidos') is null
    or to_regclass('public.club_team_seasons') is null
    or to_regclass('public.club_seasons') is null
    or to_regclass('public.club_teams') is null
    or to_regclass('public.club_memberships') is null
    or to_regclass('public.club_team_season_players') is null
    or to_regclass('public.player_team_memberships') is null
    or to_regclass('public.equipos_rivales') is null then
    raise exception 'Faltan tablas de Plantilla/Partidos/CTS';
  end if;
  if exists (
    select 1 from (values
      ('jugadores','id','uuid'),('jugadores','number','integer'),
      ('jugadores','position','text'),('jugadores','foot','text'),
      ('partidos','id','uuid'),('partidos','club_team_season_id','uuid'),
      ('partidos','date','date'),('partidos','time','text'),
      ('partidos','type','text'),('partidos','round','text'),
      ('partidos','stadium','text'),('partidos','opponent','text'),
      ('partidos','is_home','boolean'),('partidos','home_team','text'),
      ('partidos','away_team','text'),('partidos','status','text')
    ) expected(table_name,column_name,type_name)
    left join pg_attribute a on a.attrelid =
      to_regclass(format('public.%I',expected.table_name))
      and a.attname = expected.column_name and not a.attisdropped
    where a.atttypid is distinct from expected.type_name::regtype
  ) then raise exception 'Columnas de Plantilla/Partidos incompatibles'; end if;
  if exists (
    select 1 from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.partidos'::regclass
      and a.attnum > 0 and not a.attisdropped and a.attnotnull
      and d.oid is null and a.attidentity = '' and a.attgenerated = ''
      and a.attname not in ('club_team_season_id','date','time','type',
        'round','stadium','opponent','is_home','home_team','away_team','status')
  ) then raise exception 'partidos requiere columnas adicionales sin default'; end if;
  if not exists (select 1 from pg_roles where rolname = 'postgres')
    or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'Faltan roles Supabase';
  end if;
end $preflight$;

-- Solo una fila posible en toda la base. El propietario se fija expresamente
-- durante la activacion futura y debe ser owner del club del CTS elegido.
-- La fila de version 1 no existe en esta fase: el CHECK+FK impide activar
-- writes_enabled por un UPDATE aislado, sin inspeccionar texto de funciones.
create table public.operational_guard_versions_v1 (
  version smallint primary key check (version = 1),
  installed_at timestamptz not null default now()
);
alter table public.operational_guard_versions_v1 owner to postgres;
alter table public.operational_guard_versions_v1 enable row level security;
revoke all on table public.operational_guard_versions_v1
  from public, anon, authenticated, service_role;

create table public.operational_cts_v1 (
  singleton boolean primary key default true check (singleton),
  club_team_season_id uuid not null unique
    references public.club_team_seasons(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  writes_enabled boolean not null default false,
  guard_version smallint references public.operational_guard_versions_v1(version)
    on delete restrict,
  constraint operational_guard_required_check
    check (not writes_enabled or (guard_version is not null and guard_version = 1)),
  designated_at timestamptz not null default now()
);
alter table public.operational_cts_v1 owner to postgres;
alter table public.operational_cts_v1 enable row level security;
revoke all on table public.operational_cts_v1 from public, anon, authenticated, service_role;

create function public.validate_operational_cts_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare target_club uuid;
begin
  if auth.uid() is not null then
    raise exception 'OPERATIONAL_CTS_ADMIN_ONLY' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.guard_version is not null or old.writes_enabled then
      raise exception 'OPERATIONAL_CTS_DESIGNATION_IMMUTABLE'
        using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.guard_version is not null and (
    new.club_team_season_id is distinct from old.club_team_season_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.guard_version is distinct from old.guard_version
  ) then
    raise exception 'OPERATIONAL_CTS_DESIGNATION_IMMUTABLE'
      using errcode = '23514';
  end if;
  select cts.club_id into target_club
  from public.club_team_seasons cts
  join public.club_teams team on team.id = cts.team_id and team.club_id = cts.club_id
  join public.club_seasons season on season.id = cts.season_id
    and season.club_id = cts.club_id and season.status = 'open'
    and season.is_active
  join public.equipos_rivales legacy_team on legacy_team.id = team.id
    and legacy_team.team_kind = 'own'
  where cts.id = new.club_team_season_id;
  if target_club is null or not exists (
    select 1 from public.club_memberships membership
    where membership.user_id = new.owner_user_id
      and membership.club_id = target_club
      and membership.is_active and membership.role = 'owner'
  ) then
    raise exception 'OPERATIONAL_CTS_OWNER_OR_OPEN_SEASON_INVALID'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;
alter function public.validate_operational_cts_v1() owner to postgres;
revoke all on function public.validate_operational_cts_v1() from public, anon, authenticated;
create trigger validate_operational_cts_v1
before insert or update or delete on public.operational_cts_v1
for each row execute function public.validate_operational_cts_v1();

create function public.can_write_operational_cts_v1(target_cts_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(auth.uid() is not null and target_cts_id is not null
    and exists (select 1 from public.operational_cts_v1 active
      join public.club_team_seasons cts
        on cts.id = active.club_team_season_id
      join public.club_memberships owner_membership
        on owner_membership.user_id = active.owner_user_id
        and owner_membership.club_id = cts.club_id
        and owner_membership.role = 'owner' and owner_membership.is_active
      where active.singleton and active.club_team_season_id = target_cts_id
        and active.writes_enabled)
    and public.can_write_club_team_season(target_cts_id), false);
$function$;
alter function public.can_write_operational_cts_v1(uuid) owner to postgres;
revoke all on function public.can_write_operational_cts_v1(uuid) from public, anon, authenticated;
grant execute on function public.can_write_operational_cts_v1(uuid) to authenticated;

-- Preferencia de entrada para la cuenta owner designada. No expone el
-- registro a otros usuarios ni concede permiso de lectura/escritura.
create function public.my_operational_cts_v1()
returns uuid language sql stable security definer set search_path = pg_catalog
as $function$
  select active.club_team_season_id
  from public.operational_cts_v1 active
  join public.club_team_seasons cts on cts.id = active.club_team_season_id
  join public.club_memberships membership
    on membership.user_id = active.owner_user_id
    and membership.club_id = cts.club_id
    and membership.role = 'owner' and membership.is_active
  where active.singleton and auth.uid() = active.owner_user_id
    and public.can_read_club_team_season(active.club_team_season_id)
  limit 1;
$function$;
alter function public.my_operational_cts_v1() owner to postgres;
revoke all on function public.my_operational_cts_v1() from public, anon, authenticated;
grant execute on function public.my_operational_cts_v1() to authenticated;

-- El archivo solo abre tras el corte, para un CTS cerrado autorizado por la
-- misma RPC de lectura que usan Plantilla y Partidos. No concede escritura.
create function public.can_open_historical_cts_v1(target_cts_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(auth.uid() is not null and target_cts_id is not null
    and public.can_read_club_team_season(target_cts_id)
    and exists (
      select 1 from public.operational_cts_v1 active
      join public.club_team_seasons archived
        on archived.id = target_cts_id
      join public.club_seasons season on season.id = archived.season_id
        and season.club_id = archived.club_id
      where active.singleton and active.writes_enabled
        and active.club_team_season_id <> target_cts_id
        and season.status = 'closed'
    ), false);
$function$;
alter function public.can_open_historical_cts_v1(uuid) owner to postgres;
revoke all on function public.can_open_historical_cts_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.can_open_historical_cts_v1(uuid)
  to authenticated;

-- La fase 03B hace el INSERT atomico del perfil, etapa, ficha y vinculo exacto.
-- Esta envoltura añade el CTS operativo sin alterar la RPC 03B existente.
create function public.create_operational_player_v1(
  p_cts_id uuid, p_jugador_id uuid, p_player jsonb,
  p_positions jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare result jsonb;
begin
  perform 1 from public.operational_cts_v1 active
    where active.singleton and active.club_team_season_id = p_cts_id for share;
  if not found or public.can_write_operational_cts_v1(p_cts_id) is not true then
    raise exception 'OPERATIONAL_CTS_WRITE_DENIED' using errcode = '42501';
  end if;
  select public.create_own_player_atomic_v2(
    p_cts_id, p_jugador_id, p_player, p_positions, '[]'::jsonb, '[]'::jsonb
  ) into result;
  return result;
end;
$function$;
alter function public.create_operational_player_v1(uuid,uuid,jsonb,jsonb) owner to postgres;
revoke all on function public.create_operational_player_v1(uuid,uuid,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_operational_player_v1(uuid,uuid,jsonb,jsonb)
  to authenticated;

-- Solo campos locales de la ficha: no altera perfil global ni etapa historica.
create function public.edit_operational_player_v1(
  p_cts_id uuid, p_jugador_id uuid, p_patch jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare ficha_row public.jugadores%rowtype; key_name text;
begin
  perform 1 from public.operational_cts_v1 active
    where active.singleton and active.club_team_season_id = p_cts_id for share;
  if not found or public.can_write_operational_cts_v1(p_cts_id) is not true then
    raise exception 'OPERATIONAL_CTS_WRITE_DENIED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb then
    raise exception 'PLAYER_PATCH_INVALID' using errcode = '22023';
  end if;
  for key_name in select jsonb_object_keys(p_patch) loop
    if key_name not in ('number','position','foot') then
      raise exception 'PLAYER_FIELD_NOT_ALLOWED: %', key_name using errcode = '22023';
    end if;
  end loop;
  select ficha.* into ficha_row
  from public.jugadores ficha
  join public.legacy_jugador_cts_links_v1 binding on binding.jugador_id = ficha.id
  join public.club_team_season_players roster
    on roster.id = binding.club_team_season_player_id
    and roster.player_id = ficha.global_player_id and roster.voided_at is null
  join public.club_team_seasons cts on cts.id = roster.club_team_season_id
  join public.player_team_memberships stage on stage.id = ficha.membership_id
    and stage.player_id = ficha.global_player_id and stage.team_id = cts.team_id
  where ficha.id = p_jugador_id and cts.id = p_cts_id
  for update of ficha;
  if not found then raise exception 'PLAYER_NOT_IN_OPERATIONAL_CTS' using errcode = '42501'; end if;
  if p_patch ? 'number' and (p_patch->>'number' is null
    or (p_patch->>'number')::integer not between 0 and 99) then
    raise exception 'PLAYER_NUMBER_INVALID' using errcode = '22023';
  end if;
  update public.jugadores set
    number = case when p_patch ? 'number' then (p_patch->>'number')::integer else number end,
    position = case when p_patch ? 'position' then left(coalesce(p_patch->>'position',''), 80) else position end,
    foot = case when p_patch ? 'foot' then left(coalesce(p_patch->>'foot',''), 40) else foot end
  where id = p_jugador_id;
  return jsonb_build_object('jugador_id', p_jugador_id, 'club_team_season_id', p_cts_id);
end;
$function$;
alter function public.edit_operational_player_v1(uuid,uuid,jsonb) owner to postgres;
revoke all on function public.edit_operational_player_v1(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.edit_operational_player_v1(uuid,uuid,jsonb)
  to authenticated;

-- Partidos de previa sin relaciones hijas: se deriva el equipo propio del CTS.
-- No acepta ID, CTS, equipo, competicion ni referencias de jugadores del cliente.
create function public.create_operational_match_v1(p_cts_id uuid, p_match jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare own_team_name text; opponent_name text; home_side boolean;
  season_starts_on date; season_ends_on date; requested_date date;
  created_id uuid; key_name text;
begin
  perform 1 from public.operational_cts_v1 active
    where active.singleton and active.club_team_season_id = p_cts_id for share;
  if not found or public.can_write_operational_cts_v1(p_cts_id) is not true then
    raise exception 'OPERATIONAL_CTS_WRITE_DENIED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_match) is distinct from 'object' then
    raise exception 'MATCH_INPUT_INVALID' using errcode = '22023';
  end if;
  for key_name in select jsonb_object_keys(p_match) loop
    if key_name not in ('date','time','type','round','stadium','opponent','isHome') then
      raise exception 'MATCH_FIELD_NOT_ALLOWED: %', key_name using errcode = '22023';
    end if;
  end loop;
  opponent_name := nullif(btrim(p_match->>'opponent'), '');
  if opponent_name is null or nullif(p_match->>'date','') is null then
    raise exception 'MATCH_DATE_AND_OPPONENT_REQUIRED' using errcode = '22023';
  end if;
  requested_date := (p_match->>'date')::date;
  home_side := coalesce((p_match->>'isHome')::boolean, true);
  select legacy_team.name, season.starts_on, season.ends_on
    into own_team_name, season_starts_on, season_ends_on
  from public.club_team_seasons cts
  join public.equipos_rivales legacy_team on legacy_team.id = cts.team_id
    and legacy_team.team_kind = 'own'
  join public.club_seasons season on season.id = cts.season_id
    and season.club_id = cts.club_id and season.status = 'open'
  where cts.id = p_cts_id;
  if own_team_name is null then raise exception 'OWN_TEAM_MISSING' using errcode = '23514'; end if;
  if requested_date not between season_starts_on and season_ends_on then
    raise exception 'MATCH_DATE_OUTSIDE_SEASON' using errcode = '22023';
  end if;
  insert into public.partidos (
    club_team_season_id, date, time, type, round, stadium, opponent,
    is_home, home_team, away_team, status
  ) values (
    p_cts_id, requested_date,
    coalesce(p_match->>'time',''), coalesce(nullif(p_match->>'type',''),'Liga'),
    coalesce(p_match->>'round',''), coalesce(p_match->>'stadium',''),
    opponent_name, home_side,
    case when home_side then own_team_name else opponent_name end,
    case when home_side then opponent_name else own_team_name end, 'Previa'
  ) returning id into created_id;
  return jsonb_build_object('partido_id', created_id, 'club_team_season_id', p_cts_id);
end;
$function$;
alter function public.create_operational_match_v1(uuid,jsonb) owner to postgres;
revoke all on function public.create_operational_match_v1(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_operational_match_v1(uuid,jsonb)
  to authenticated;

-- Solo campos de agenda de una previa del CTS operativo. No toca hijos ni
-- resultados; tampoco cambia el CTS de un partido ya creado.
create function public.edit_operational_match_v1(
  p_cts_id uuid, p_partido_id uuid, p_patch jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare match_row public.partidos%rowtype; own_team_name text;
  season_starts_on date; season_ends_on date; requested_date date;
  opponent_name text; home_side boolean; key_name text;
begin
  perform 1 from public.operational_cts_v1 active
    where active.singleton and active.club_team_season_id = p_cts_id for share;
  if not found or public.can_write_operational_cts_v1(p_cts_id) is not true then
    raise exception 'OPERATIONAL_CTS_WRITE_DENIED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb then
    raise exception 'MATCH_PATCH_INVALID' using errcode = '22023';
  end if;
  for key_name in select jsonb_object_keys(p_patch) loop
    if key_name not in ('date','time','type','round','stadium','opponent','isHome') then
      raise exception 'MATCH_FIELD_NOT_ALLOWED: %', key_name using errcode = '22023';
    end if;
  end loop;
  select * into match_row from public.partidos
    where id = p_partido_id and club_team_season_id = p_cts_id for update;
  if not found or match_row.status is distinct from 'Previa'
    or public.can_write_match(p_partido_id) is not true then
    raise exception 'MATCH_NOT_EDITABLE' using errcode = '42501';
  end if;
  if p_patch ? 'date' and nullif(p_patch->>'date','') is null then
    raise exception 'MATCH_DATE_REQUIRED' using errcode = '22023';
  end if;
  select legacy_team.name, season.starts_on, season.ends_on
    into own_team_name, season_starts_on, season_ends_on
  from public.club_team_seasons cts
  join public.equipos_rivales legacy_team on legacy_team.id = cts.team_id
    and legacy_team.team_kind = 'own'
  join public.club_seasons season on season.id = cts.season_id
    and season.club_id = cts.club_id and season.status = 'open'
  where cts.id = p_cts_id;
  requested_date := case when p_patch ? 'date'
    then (p_patch->>'date')::date else match_row.date end;
  opponent_name := case when p_patch ? 'opponent'
    then nullif(btrim(p_patch->>'opponent'),'') else match_row.opponent end;
  home_side := case when p_patch ? 'isHome'
    then (p_patch->>'isHome')::boolean else match_row.is_home end;
  if own_team_name is null or opponent_name is null or home_side is null then
    raise exception 'MATCH_PATCH_INVALID' using errcode = '22023';
  end if;
  if requested_date is null
    or requested_date not between season_starts_on and season_ends_on then
    raise exception 'MATCH_DATE_OUTSIDE_SEASON' using errcode = '22023';
  end if;
  update public.partidos set
    date = requested_date,
    time = case when p_patch ? 'time' then coalesce(p_patch->>'time','') else time end,
    type = case when p_patch ? 'type' then coalesce(nullif(p_patch->>'type',''),'Liga') else type end,
    round = case when p_patch ? 'round' then coalesce(p_patch->>'round','') else round end,
    stadium = case when p_patch ? 'stadium' then coalesce(p_patch->>'stadium','') else stadium end,
    opponent = opponent_name, is_home = home_side,
    home_team = case when home_side then own_team_name else opponent_name end,
    away_team = case when home_side then opponent_name else own_team_name end
  where id = p_partido_id;
  return jsonb_build_object('partido_id', p_partido_id, 'club_team_season_id', p_cts_id);
end;
$function$;
alter function public.edit_operational_match_v1(uuid,uuid,jsonb) owner to postgres;
revoke all on function public.edit_operational_match_v1(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.edit_operational_match_v1(uuid,uuid,jsonb)
  to authenticated;

commit;
