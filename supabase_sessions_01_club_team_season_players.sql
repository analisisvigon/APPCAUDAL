-- APPCAUDAL / Sesiones 01. Solo estructura: ninguna pertenencia se infiere ni se inserta.
-- Revisar y ejecutar manualmente en Supabase SQL Editor, tras el preflight.
-- left_on es EXCLUSIVA: presencia en fecha d = joined_on <= d AND (left_on IS NULL OR d < left_on).
begin;
set local search_path = pg_catalog, public, extensions;

do $preconditions$
declare
  v_oid oid := to_regclass('public.club_team_season_players');
  v_proc oid;
begin
  if current_setting('server_version_num')::integer < 170000 then
    raise exception 'Esta migración requiere PostgreSQL 17 o posterior';
  end if;
  if to_regnamespace('extensions') is null then
    raise exception 'Falta el esquema extensions requerido para btree_gist';
  end if;
  if to_regclass('public.equipos_rivales') is null
     or to_regclass('public.club_teams') is null
     or to_regclass('public.club_team_seasons') is null
     or to_regclass('public.club_seasons') is null
     or to_regclass('public.players_database') is null
     or to_regclass('public.player_team_memberships') is null then
    raise exception 'Falta una tabla de origen; ejecutar primero el preflight';
  end if;
  if v_oid is not null and
     obj_description(v_oid, 'pg_class') is distinct from
       'APPCAUDAL Sesiones 01: canonical dated player membership in a club team-season' then
    raise exception 'Ya existe club_team_season_players con otro diseño';
  end if;
  perform set_config('appcaudal.sessions01_was_absent', (v_oid is null)::text, true);
  if to_regprocedure('public.guard_club_team_season_player_mutation()') is not null
     and obj_description(to_regprocedure('public.guard_club_team_season_player_mutation()'), 'pg_proc')
       is distinct from 'APPCAUDAL Sesiones 01: block unauthorized and closed-season player membership mutations' then
    raise exception 'Existe un guard de igual nombre no identificado como Sesiones 01';
  end if;
  foreach v_proc in array array[
    to_regprocedure('public.can_read_club_team_season(uuid)')::oid,
    to_regprocedure('public.can_write_club_team_season(uuid)')::oid
  ] loop
    if v_proc is null or not exists (
      select 1 from pg_proc p
      where p.oid = v_proc and p.prosecdef and p.provolatile = 's'
        and p.prorettype = 'boolean'::regtype
        and p.proconfig @> array['search_path=pg_catalog']::text[]
    ) then
      raise exception 'Helper de equipo-temporada ausente o con metadatos incompatibles';
    end if;
  end loop;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.can_read_club_team_season(uuid)'::regprocedure
      and md5(regexp_replace(lower(p.prosrc), '[[:space:]]', '', 'g')) =
        '2f244dec658b347e50a0591ce1dba3dd'
  ) or not exists (
    select 1 from pg_proc p
    where p.oid = 'public.can_write_club_team_season(uuid)'::regprocedure
      and md5(regexp_replace(lower(p.prosrc), '[[:space:]]', '', 'g')) =
        '1c7f46f430cba9c9c16f298af6cd4c3b'
  ) then
    raise exception 'Los cuerpos de los helpers no coinciden con las versiones verificadas';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.club_team_seasons'::regclass
      and c.contype = 'f' and c.convalidated
      and c.confrelid = 'public.club_seasons'::regclass
  ) or not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.club_team_seasons'::regclass
      and c.contype = 'f' and c.convalidated
      and c.confrelid = 'public.club_teams'::regclass
  ) then
    raise exception 'Faltan las FK validadas de equipo-temporada';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.player_team_memberships'::regclass
      and c.contype = 'f' and c.convalidated
      and c.confrelid = 'public.players_database'::regclass
  ) or not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.player_team_memberships'::regclass
      and c.contype = 'f' and c.convalidated
      and c.confrelid = 'public.equipos_rivales'::regclass
  ) then
    raise exception 'Faltan las FK validadas de las etapas deportivas';
  end if;
  if not exists (
    select 1 from public.club_team_seasons cts
    join public.club_seasons s on s.id = cts.season_id and s.club_id = cts.club_id
    where cts.id = '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
      and cts.team_id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
      and cts.season_id = 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid
      and s.status = 'open' and s.starts_on <= s.ends_on
  ) then
    raise exception 'La relación actual o su temporada no coincide con el inventario aprobado';
  end if;
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist' and n.nspname not in ('extensions', 'public')
  ) then
    raise exception 'btree_gist existe fuera de public/extensions; revisar opclasses antes de aplicar';
  end if;
end
$preconditions$;

-- Necesario para EXCLUDE GiST con igualdad de UUID; no toca tablas preexistentes.
create extension if not exists btree_gist with schema extensions;

create table if not exists public.club_team_season_players (
  id uuid not null default gen_random_uuid(),
  club_team_season_id uuid not null,
  player_id uuid not null,
  joined_on date not null,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_team_season_players_pkey primary key (id),
  constraint club_team_season_players_relation_fkey
    foreign key (club_team_season_id) references public.club_team_seasons(id)
    on update no action on delete restrict,
  constraint club_team_season_players_player_fkey
    foreign key (player_id) references public.players_database(id)
    on update no action on delete restrict,
  constraint club_team_season_players_period_check
    check (left_on is null or left_on > joined_on),
  constraint club_team_season_players_start_key
    unique (club_team_season_id, player_id, joined_on),
  constraint club_team_season_players_no_overlap
    exclude using gist (
      club_team_season_id with =,
      player_id with =,
      (daterange(joined_on, left_on, '[)')) with &&
    )
);

comment on table public.club_team_season_players is
  'APPCAUDAL Sesiones 01: canonical dated player membership in a club team-season';
comment on column public.club_team_season_players.left_on is
  'Exclusive exit date; NULL means no recorded exit within the season.';

create index if not exists club_team_season_players_date_idx
  on public.club_team_season_players (club_team_season_id, joined_on, left_on);
create index if not exists club_team_season_players_player_idx
  on public.club_team_season_players (player_id, club_team_season_id);

create or replace function public.guard_club_team_season_player_mutation()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_team_id uuid;
  v_starts_on date;
  v_ends_on date;
  v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'La eliminación de pertenencias históricas no está permitida'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id or
    new.club_team_season_id is distinct from old.club_team_season_id or
    new.player_id is distinct from old.player_id or
    new.created_at is distinct from old.created_at
  ) then
    raise exception 'La identidad y la procedencia de la pertenencia son inmutables'
      using errcode = '42501';
  end if;
  if auth.uid() is null or not public.can_write_club_team_season(new.club_team_season_id) then
    raise exception 'Pertenencia no permitida' using errcode = '42501';
  end if;

  -- Bloqueo de la temporada: serializa el alta/corrección con un cierre concurrente.
  select cts.team_id, s.starts_on, s.ends_on, s.status
    into v_team_id, v_starts_on, v_ends_on, v_status
  from public.club_team_seasons cts
  join public.club_seasons s on s.id = cts.season_id and s.club_id = cts.club_id
  where cts.id = new.club_team_season_id
  for update of s;
  if not found or v_status <> 'open' then
    raise exception 'Pertenencia no permitida' using errcode = '42501';
  end if;
  if auth.uid() is null or not public.can_write_club_team_season(new.club_team_season_id) then
    raise exception 'Pertenencia no permitida' using errcode = '42501';
  end if;
  if new.joined_on < v_starts_on or new.joined_on > v_ends_on
     or (new.left_on is not null and
         (new.left_on <= new.joined_on or new.left_on > v_ends_on + 1)) then
    raise exception 'Intervalo fuera de la temporada o vacío'
      using errcode = '23514';
  end if;
  -- Procedencia deportiva comprobada por UUID; no exige is_current ni infiere fechas.
  if not exists (
    select 1 from public.player_team_memberships stage
    where stage.player_id = new.player_id and stage.team_id = v_team_id
  ) then
    raise exception 'El jugador no tiene etapa deportiva acreditada en ese equipo'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end
$function$;

comment on function public.guard_club_team_season_player_mutation() is
  'APPCAUDAL Sesiones 01: block unauthorized and closed-season player membership mutations';
revoke all on function public.guard_club_team_season_player_mutation()
  from public, anon, authenticated, service_role;

do $trigger$
begin
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.club_team_season_players'::regclass
      and t.tgname = 'club_team_season_players_guard'
      and not t.tgisinternal
  ) then
    create trigger club_team_season_players_guard
      before insert or update or delete on public.club_team_season_players
      for each row execute function public.guard_club_team_season_player_mutation();
  end if;
end
$trigger$;

alter table public.club_team_season_players enable row level security;
revoke all on public.club_team_season_players from public, anon, authenticated, service_role;
grant select, insert on public.club_team_season_players to authenticated;
grant update (joined_on, left_on) on public.club_team_season_players to authenticated;

do $policies$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.club_team_season_players'::regclass and polname = 'ctsp_read') then
    create policy ctsp_read on public.club_team_season_players
      for select to authenticated
      using (public.can_read_club_team_season(club_team_season_id));
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.club_team_season_players'::regclass and polname = 'ctsp_insert') then
    create policy ctsp_insert on public.club_team_season_players
      for insert to authenticated
      with check (public.can_write_club_team_season(club_team_season_id));
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.club_team_season_players'::regclass and polname = 'ctsp_update') then
    create policy ctsp_update on public.club_team_season_players
      for update to authenticated
      using (public.can_write_club_team_season(club_team_season_id))
      with check (public.can_write_club_team_season(club_team_season_id));
  end if;
end
$policies$;

-- Toda divergencia estructural esencial provoca rollback, también en una segunda ejecución.
do $postconditions$
declare
  v_rel oid := 'public.club_team_season_players'::regclass;
  v_trig oid := to_regprocedure('public.guard_club_team_season_player_mutation()');
begin
  if not exists (select 1 from pg_class where oid = v_rel and relrowsecurity and not relforcerowsecurity) then
    raise exception 'RLS ausente o configuración inesperada';
  end if;
  if current_setting('appcaudal.sessions01_was_absent', true) = 'true'
     and (select count(*) from public.club_team_season_players) <> 0 then
    raise exception 'La migración estructural requiere la tabla vacía; no altera pertenencias existentes';
  end if;
  if (select count(*) from pg_attribute a where a.attrelid=v_rel
        and a.attnum>0 and not a.attisdropped) <> 7
     or (select count(*) from pg_attribute a where a.attrelid=v_rel
        and not a.attisdropped and (
          (a.attname='id' and a.atttypid='uuid'::regtype and a.attnotnull)
          or (a.attname='club_team_season_id' and a.atttypid='uuid'::regtype and a.attnotnull)
          or (a.attname='player_id' and a.atttypid='uuid'::regtype and a.attnotnull)
          or (a.attname='joined_on' and a.atttypid='date'::regtype and a.attnotnull)
          or (a.attname='left_on' and a.atttypid='date'::regtype and not a.attnotnull)
          or (a.attname='created_at' and a.atttypid='timestamptz'::regtype and a.attnotnull)
          or (a.attname='updated_at' and a.atttypid='timestamptz'::regtype and a.attnotnull)
        )) <> 7 then
    raise exception 'Columnas de la tabla nueva incompatibles';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = v_rel and tgname = 'club_team_season_players_guard'
      and tgfoid = v_trig and tgenabled = 'O' and not tgisinternal
      and (tgtype::integer & 1) = 1 and (tgtype::integer & 2) = 2
      and (tgtype::integer & 4) = 4 and (tgtype::integer & 8) = 8
      and (tgtype::integer & 16) = 16
  ) then
    raise exception 'Guard ausente o no cubre INSERT/UPDATE/DELETE';
  end if;
  if not exists (select 1 from pg_proc where oid = v_trig and prosecdef
    and proowner = 'postgres'::regrole
    and proconfig @> array['search_path=pg_catalog']::text[]
    and md5(regexp_replace(lower(prosrc), '[[:space:]]', '', 'g')) =
      '4f389c9c1daa98720c1e4853cf8d74f3') then
    raise exception 'Guard sin SECURITY DEFINER/search_path seguro';
  end if;
  if has_function_privilege('anon', v_trig, 'EXECUTE')
     or has_function_privilege('authenticated', v_trig, 'EXECUTE') then
    raise exception 'El guard no debe ser invocable directamente por clientes';
  end if;
  if (select count(*) from pg_constraint where conrelid = v_rel and conname in (
      'club_team_season_players_pkey', 'club_team_season_players_relation_fkey',
      'club_team_season_players_player_fkey', 'club_team_season_players_period_check',
      'club_team_season_players_start_key', 'club_team_season_players_no_overlap'
    ) and convalidated) <> 6 then
    raise exception 'Falta una restricción obligatoria validada';
  end if;
  if (select count(*) from pg_constraint where conrelid=v_rel) <> 6
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_relation_fkey' and c.contype='f'
      and c.confrelid='public.club_team_seasons'::regclass and c.confdeltype='r'
      and c.conkey=array[(select attnum from pg_attribute where attrelid=v_rel and attname='club_team_season_id')]::smallint[])
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_player_fkey' and c.contype='f'
      and c.confrelid='public.players_database'::regclass and c.confdeltype='r'
      and c.conkey=array[(select attnum from pg_attribute where attrelid=v_rel and attname='player_id')]::smallint[])
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_no_overlap' and c.contype='x'
      and pg_get_constraintdef(c.oid) like '%daterange%'
      and pg_get_constraintdef(c.oid) like '%&&%') then
    raise exception 'Restricciones de identidad, relación o no solapamiento incompatibles';
  end if;
  if (select count(*) from pg_policy where polrelid = v_rel) <> 3
     or exists (select 1 from pg_policy where polrelid = v_rel and
       (not polpermissive or polroles <> array['authenticated'::regrole::oid])) then
    raise exception 'Políticas inesperadas';
  end if;
  if not exists (select 1 from pg_policy where polrelid = v_rel and polname = 'ctsp_read' and polcmd = 'r'
    and replace(regexp_replace(lower(pg_get_expr(polqual, polrelid)), '[[:space:]()]', '', 'g'), 'public.', '') = 'can_read_club_team_seasonclub_team_season_id')
  or not exists (select 1 from pg_policy where polrelid = v_rel and polname = 'ctsp_insert' and polcmd = 'a'
    and replace(regexp_replace(lower(pg_get_expr(polwithcheck, polrelid)), '[[:space:]()]', '', 'g'), 'public.', '') = 'can_write_club_team_seasonclub_team_season_id')
  or not exists (select 1 from pg_policy where polrelid = v_rel and polname = 'ctsp_update' and polcmd = 'w'
    and replace(regexp_replace(lower(pg_get_expr(polqual, polrelid)), '[[:space:]()]', '', 'g'), 'public.', '') = 'can_write_club_team_seasonclub_team_season_id'
    and replace(regexp_replace(lower(pg_get_expr(polwithcheck, polrelid)), '[[:space:]()]', '', 'g'), 'public.', '') = 'can_write_club_team_seasonclub_team_season_id') then
    raise exception 'Expresiones RLS distintas de las autorizadas';
  end if;
  if not has_table_privilege('authenticated', v_rel, 'SELECT')
     or not has_table_privilege('authenticated', v_rel, 'INSERT')
     or has_table_privilege('authenticated', v_rel, 'UPDATE')
     or not has_column_privilege('authenticated', v_rel, 'joined_on', 'UPDATE')
     or not has_column_privilege('authenticated', v_rel, 'left_on', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'id', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'player_id', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'club_team_season_id', 'UPDATE')
     or has_table_privilege('authenticated', v_rel, 'DELETE')
     or has_table_privilege('authenticated', v_rel, 'TRUNCATE')
     or has_table_privilege('authenticated', v_rel, 'TRIGGER')
     or has_table_privilege('authenticated', v_rel, 'MAINTAIN')
     or has_table_privilege('anon', v_rel, 'SELECT')
     or has_table_privilege('anon', v_rel, 'INSERT')
     or has_table_privilege('anon', v_rel, 'UPDATE')
     or has_table_privilege('anon', v_rel, 'DELETE')
     or has_table_privilege('anon', v_rel, 'TRUNCATE')
     or has_table_privilege('anon', v_rel, 'TRIGGER')
     or has_table_privilege('anon', v_rel, 'MAINTAIN') then
    raise exception 'Privilegios efectivos incompatibles';
  end if;
end
$postconditions$;
commit;
