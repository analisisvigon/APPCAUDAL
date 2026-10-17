-- APPCAUDAL / Sesiones 01. Solo estructura: ninguna pertenencia se infiere ni se inserta.
-- Revisar y ejecutar manualmente en Supabase SQL Editor, tras el preflight.
-- NULL joined_on confirma temporada, NO presencia en una fecha concreta.
-- left_on es EXCLUSIVA; NULL con has_departed=false significa salida no registrada;
-- NULL con has_departed=true significa salida acreditada, fecha desconocida.
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
     or to_regclass('public.club_memberships') is null
     or to_regclass('public.players_database') is null
     or to_regclass('public.player_team_memberships') is null then
    raise exception 'Falta una tabla de origen; ejecutar primero el preflight';
  end if;
  if v_oid is not null and
     obj_description(v_oid, 'pg_class') is distinct from
       'APPCAUDAL Sesiones 01: canonical player membership in a club team-season, dates optional' then
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
        and p.proowner = 'postgres'::regrole
        and p.prorettype = 'boolean'::regtype
        and p.proconfig @> array['search_path=pg_catalog']::text[]
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
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
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.has_club_role(uuid,text[])')
      and p.prosecdef and p.provolatile='s' and p.proowner='postgres'::regrole
      and p.prorettype='boolean'::regtype
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and md5(regexp_replace(lower(p.prosrc), '[[:space:]]', '', 'g')) =
        '774a3d46785e0253f305fb6c484f0a21'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'has_club_role no coincide con la versión owner/activa revisada';
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
    select 1 from pg_constraint c
    where c.conrelid='public.club_memberships'::regclass
      and c.conname='club_memberships_club_user_key'
      and c.contype='u' and c.convalidated
  ) then
    raise exception 'Falta unicidad de membership por club y usuario';
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
  joined_on date,
  left_on date,
  has_departed boolean not null default false,
  created_by_membership_id uuid not null,
  voided_at timestamptz,
  voided_by_membership_id uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_team_season_players_pkey primary key (id),
  constraint club_team_season_players_relation_fkey
    foreign key (club_team_season_id) references public.club_team_seasons(id)
    on update no action on delete restrict,
  constraint club_team_season_players_player_fkey
    foreign key (player_id) references public.players_database(id)
    on update no action on delete restrict,
  constraint club_team_season_players_creator_fkey
    foreign key (created_by_membership_id) references public.club_memberships(id)
    on update no action on delete restrict,
  constraint club_team_season_players_void_actor_fkey
    foreign key (voided_by_membership_id) references public.club_memberships(id)
    on update no action on delete restrict,
  constraint club_team_season_players_period_check
    check (left_on is null or (has_departed and (joined_on is null or left_on > joined_on))),
  constraint club_team_season_players_void_check
    check (
      (voided_at is null and voided_by_membership_id is null and void_reason is null)
      or (voided_at is not null and voided_by_membership_id is not null
          and void_reason is not null and length(btrim(void_reason)) between 3 and 500)
    ),
  constraint club_team_season_players_no_overlap
    exclude using gist (
      club_team_season_id with =,
      player_id with =,
      (daterange(joined_on, left_on, '[)')) with &&
    ) where (voided_at is null)
);

comment on table public.club_team_season_players is
  'APPCAUDAL Sesiones 01: canonical player membership in a club team-season, dates optional';
comment on column public.club_team_season_players.joined_on is
  'NULL: season membership confirmed but arrival date unknown; never infer date-specific presence.';
comment on column public.club_team_season_players.left_on is
  'Exclusive exit date. NULL is interpreted with has_departed; never infer a departure date.';
comment on column public.club_team_season_players.has_departed is
  'False: no departure recorded, not proof of presence on every season date. True with NULL left_on: departure date unknown.';
comment on column public.club_team_season_players.void_reason is
  'Owner-only administrative annulment reason; never represents a sporting departure.';

create unique index if not exists club_team_season_players_active_start_uidx
  on public.club_team_season_players (club_team_season_id, player_id, joined_on)
  where voided_at is null and joined_on is not null;

create index if not exists club_team_season_players_date_idx
  on public.club_team_season_players (club_team_season_id, joined_on, left_on);
create index if not exists club_team_season_players_player_idx
  on public.club_team_season_players (player_id, club_team_season_id);

-- Solo completar hechos antes desconocidos; corregir uno acreditado exige
-- anulación owner y alta nueva, conservando el registro original.
create or replace function public.guard_club_team_season_player_mutation()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_club_id uuid;
  v_team_id uuid;
  v_starts_on date;
  v_ends_on date;
  v_status text;
  v_actor_id uuid;
  v_void_requested boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception 'La eliminación de pertenencias históricas no está permitida'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id or
    new.club_team_season_id is distinct from old.club_team_season_id or
    new.player_id is distinct from old.player_id or
    new.created_at is distinct from old.created_at or
    new.created_by_membership_id is distinct from old.created_by_membership_id
  ) then
    raise exception 'La identidad y la procedencia de la pertenencia son inmutables'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.voided_at is not null then
      raise exception 'Una pertenencia anulada es inmutable' using errcode = '42501';
    end if;
    if new.voided_at is distinct from old.voided_at
       or new.voided_by_membership_id is distinct from old.voided_by_membership_id then
      raise exception 'Los metadatos de anulación los fija el servidor' using errcode = '42501';
    end if;
    v_void_requested := new.void_reason is distinct from old.void_reason;
    if not v_void_requested and (
      (new.joined_on is distinct from old.joined_on and
        (old.joined_on is not null or new.joined_on is null)) or
      (new.left_on is distinct from old.left_on and
        (old.left_on is not null or new.left_on is null)) or
      (new.has_departed is distinct from old.has_departed and
        (old.has_departed or not new.has_departed))
    ) then
      raise exception 'Una fecha acreditada no se sobrescribe: anular y sustituir'
        using errcode = '42501';
    end if;
    if v_void_requested and (
      new.joined_on is distinct from old.joined_on or
      new.left_on is distinct from old.left_on or
      new.has_departed is distinct from old.has_departed or
      new.void_reason is null or length(btrim(new.void_reason)) not between 3 and 500
    ) then
      raise exception 'La anulación requiere motivo y no cambia datos deportivos'
        using errcode = '23514';
    end if;
  elsif new.voided_at is not null or new.voided_by_membership_id is not null
        or new.void_reason is not null then
    raise exception 'No se puede insertar una pertenencia ya anulada' using errcode = '42501';
  end if;
  if auth.uid() is null or public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Pertenencia no permitida' using errcode = '42501';
  end if;

  -- Bloqueo de la temporada: serializa el alta/corrección con un cierre concurrente.
  select cts.club_id, cts.team_id, s.starts_on, s.ends_on, s.status
    into v_club_id, v_team_id, v_starts_on, v_ends_on, v_status
  from public.club_team_seasons cts
  join public.club_seasons s on s.id = cts.season_id and s.club_id = cts.club_id
  where cts.id = new.club_team_season_id
  for update of s;
  if not found or v_status <> 'open' then
    raise exception 'Pertenencia no permitida' using errcode = '42501';
  end if;
  if public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Pertenencia no permitida' using errcode = '42501';
  end if;
  if (new.joined_on is not null and
        (new.joined_on < v_starts_on or new.joined_on > v_ends_on))
     or (new.left_on is not null and
         (new.left_on <= v_starts_on or new.left_on > v_ends_on + 1 or
          (new.joined_on is not null and new.left_on <= new.joined_on))) then
    raise exception 'Intervalo fuera de la temporada o vacío'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    -- Procedencia deportiva por UUID; la etapa legacy no aporta temporada ni fecha.
    if not exists (
      select 1 from public.player_team_memberships stage
      where stage.player_id = new.player_id and stage.team_id = v_team_id
    ) then
      raise exception 'El jugador no tiene etapa deportiva acreditada en ese equipo'
        using errcode = '23514';
    end if;
    select actor.id into v_actor_id
    from public.club_memberships actor
    where actor.club_id = v_club_id and actor.user_id = auth.uid()
      and actor.is_active and actor.role in ('owner','admin','staff');
    if v_actor_id is null then
      raise exception 'Pertenencia no permitida' using errcode = '42501';
    end if;
    new.created_by_membership_id := v_actor_id;
    new.created_at := now();
  elsif v_void_requested then
    if public.has_club_role(v_club_id, array['owner']::text[]) is not true then
      raise exception 'Solo owner puede anular administrativamente'
        using errcode = '42501';
    end if;
    select actor.id into v_actor_id
    from public.club_memberships actor
    where actor.club_id = v_club_id and actor.user_id = auth.uid()
      and actor.is_active and actor.role = 'owner';
    if v_actor_id is null then
      raise exception 'Solo owner puede anular administrativamente'
        using errcode = '42501';
    end if;
    new.void_reason := btrim(new.void_reason);
    new.voided_at := now();
    new.voided_by_membership_id := v_actor_id;
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
grant select on public.club_team_season_players to authenticated;
grant insert (club_team_season_id, player_id, joined_on, left_on, has_departed)
  on public.club_team_season_players to authenticated;
grant update (joined_on, left_on, has_departed, void_reason)
  on public.club_team_season_players to authenticated;

do $policies$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.club_team_season_players'::regclass and polname = 'ctsp_read') then
    create policy ctsp_read on public.club_team_season_players
      for select to authenticated
      using (
        public.can_read_club_team_season(club_team_season_id)
        and (
          voided_at is null
          or public.has_club_role(
            (select cts.club_id from public.club_team_seasons cts
             where cts.id = club_team_season_id),
            array['owner']::text[]
          )
        )
      );
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

-- Reejecución: restaurar las expresiones de las tres políticas de esta tabla.
alter policy ctsp_read on public.club_team_season_players to authenticated
  using (
    public.can_read_club_team_season(club_team_season_id)
    and (voided_at is null or public.has_club_role(
      (select cts.club_id from public.club_team_seasons cts
       where cts.id = club_team_season_id), array['owner']::text[]
    ))
  );
alter policy ctsp_insert on public.club_team_season_players to authenticated
  with check (public.can_write_club_team_season(club_team_season_id));
alter policy ctsp_update on public.club_team_season_players to authenticated
  using (public.can_write_club_team_season(club_team_season_id))
  with check (public.can_write_club_team_season(club_team_season_id));

-- Toda divergencia estructural esencial provoca rollback, también en una segunda ejecución.
do $postconditions$
declare
  v_rel oid := 'public.club_team_season_players'::regclass;
  v_trig oid := to_regprocedure('public.guard_club_team_season_player_mutation()');
begin
  if not exists (select 1 from pg_class where oid = v_rel and relrowsecurity
    and not relforcerowsecurity and relowner='postgres'::regrole) then
    raise exception 'RLS ausente o configuración inesperada';
  end if;
  if current_setting('appcaudal.sessions01_was_absent', true) = 'true'
     and (select count(*) from public.club_team_season_players) <> 0 then
    raise exception 'La migración estructural requiere la tabla vacía; no altera pertenencias existentes';
  end if;
  if (select count(*) from pg_attribute a where a.attrelid=v_rel
        and a.attnum>0 and not a.attisdropped) <> 12
     or (select count(*) from pg_attribute a where a.attrelid=v_rel
        and not a.attisdropped and (
          (a.attname='id' and a.atttypid='uuid'::regtype and a.attnotnull)
          or (a.attname='club_team_season_id' and a.atttypid='uuid'::regtype and a.attnotnull)
          or (a.attname='player_id' and a.atttypid='uuid'::regtype and a.attnotnull)
          or (a.attname='joined_on' and a.atttypid='date'::regtype and not a.attnotnull)
          or (a.attname='left_on' and a.atttypid='date'::regtype and not a.attnotnull)
          or (a.attname='has_departed' and a.atttypid='boolean'::regtype and a.attnotnull)
          or (a.attname='created_by_membership_id' and a.atttypid='uuid'::regtype and a.attnotnull)
          or (a.attname='voided_at' and a.atttypid='timestamptz'::regtype and not a.attnotnull)
          or (a.attname='voided_by_membership_id' and a.atttypid='uuid'::regtype and not a.attnotnull)
          or (a.attname='void_reason' and a.atttypid='text'::regtype and not a.attnotnull)
          or (a.attname='created_at' and a.atttypid='timestamptz'::regtype and a.attnotnull)
          or (a.attname='updated_at' and a.atttypid='timestamptz'::regtype and a.attnotnull)
        )) <> 12 then
    raise exception 'Columnas de la tabla nueva incompatibles';
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid=v_rel
      and a.attname in ('joined_on','left_on') and a.atthasdef)
     or not exists (select 1 from pg_attribute a join pg_attrdef d
         on d.adrelid=a.attrelid and d.adnum=a.attnum
       where a.attrelid=v_rel and a.attname='has_departed'
         and pg_get_expr(d.adbin,d.adrelid)='false') then
    raise exception 'Las fechas no deben tener defaults; has_departed debe iniciar false';
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
      'c44e06581eb706161ae094456b67c11c') then
    raise exception 'Guard sin SECURITY DEFINER/search_path seguro';
  end if;
  if has_function_privilege('anon', v_trig, 'EXECUTE')
     or has_function_privilege('authenticated', v_trig, 'EXECUTE') then
    raise exception 'El guard no debe ser invocable directamente por clientes';
  end if;
  if (select count(*) from pg_constraint where conrelid = v_rel and conname in (
      'club_team_season_players_pkey', 'club_team_season_players_relation_fkey',
      'club_team_season_players_player_fkey', 'club_team_season_players_creator_fkey',
      'club_team_season_players_void_actor_fkey', 'club_team_season_players_period_check',
      'club_team_season_players_void_check', 'club_team_season_players_no_overlap'
    ) and convalidated) <> 8 then
    raise exception 'Falta una restricción obligatoria validada';
  end if;
  if (select count(*) from pg_constraint where conrelid=v_rel) <> 8
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_relation_fkey' and c.contype='f'
      and c.confrelid='public.club_team_seasons'::regclass and c.confdeltype='r'
      and c.conkey=array[(select attnum from pg_attribute where attrelid=v_rel and attname='club_team_season_id')]::smallint[])
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_player_fkey' and c.contype='f'
      and c.confrelid='public.players_database'::regclass and c.confdeltype='r'
      and c.conkey=array[(select attnum from pg_attribute where attrelid=v_rel and attname='player_id')]::smallint[])
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_creator_fkey' and c.contype='f'
      and c.confrelid='public.club_memberships'::regclass and c.confdeltype='r'
      and c.conkey=array[(select attnum from pg_attribute where attrelid=v_rel
        and attname='created_by_membership_id')]::smallint[])
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_void_actor_fkey' and c.contype='f'
      and c.confrelid='public.club_memberships'::regclass and c.confdeltype='r'
      and c.conkey=array[(select attnum from pg_attribute where attrelid=v_rel
        and attname='voided_by_membership_id')]::smallint[])
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_period_check' and c.contype='c'
      and pg_get_constraintdef(c.oid) like '%has_departed%'
      and pg_get_constraintdef(c.oid) like '%left_on%joined_on%')
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_void_check' and c.contype='c'
      and pg_get_constraintdef(c.oid) like '%voided_at%'
      and pg_get_constraintdef(c.oid) like '%voided_by_membership_id%'
      and pg_get_constraintdef(c.oid) like '%void_reason%')
    or not exists (select 1 from pg_constraint c where c.conrelid=v_rel
      and c.conname='club_team_season_players_no_overlap' and c.contype='x'
      and pg_get_constraintdef(c.oid) like '%daterange%'
      and pg_get_constraintdef(c.oid) like '%&&%'
      and pg_get_constraintdef(c.oid) like '%voided_at IS NULL%')
    or not exists (select 1 from pg_index ix join pg_class i on i.oid=ix.indexrelid
      where ix.indrelid=v_rel and i.relname='club_team_season_players_active_start_uidx'
        and ix.indisunique and ix.indisvalid and ix.indpred is not null
        and pg_get_expr(ix.indpred,ix.indrelid) like '%voided_at IS NULL%'
        and pg_get_expr(ix.indpred,ix.indrelid) like '%joined_on IS NOT NULL%') then
    raise exception 'Restricciones de identidad, relación o no solapamiento incompatibles';
  end if;
  if (select count(*) from pg_policy where polrelid = v_rel) <> 3
     or exists (select 1 from pg_policy where polrelid = v_rel and
       (not polpermissive or polroles <> array['authenticated'::regrole::oid])) then
    raise exception 'Políticas inesperadas';
  end if;
  if not exists (select 1 from pg_policy where polrelid = v_rel and polname = 'ctsp_read' and polcmd = 'r'
    and polwithcheck is null
    and position('can_read_club_team_season' in lower(pg_get_expr(polqual, polrelid))) > 0
    and position('has_club_role' in lower(pg_get_expr(polqual, polrelid))) > 0
    and position('voided_at is null' in lower(pg_get_expr(polqual, polrelid))) > 0
    and position('owner' in lower(pg_get_expr(polqual, polrelid))) > 0)
  or not exists (select 1 from pg_policy where polrelid = v_rel and polname = 'ctsp_insert' and polcmd = 'a'
    and replace(regexp_replace(lower(pg_get_expr(polwithcheck, polrelid)), '[[:space:]()]', '', 'g'), 'public.', '') = 'can_write_club_team_seasonclub_team_season_id')
  or not exists (select 1 from pg_policy where polrelid = v_rel and polname = 'ctsp_update' and polcmd = 'w'
    and replace(regexp_replace(lower(pg_get_expr(polqual, polrelid)), '[[:space:]()]', '', 'g'), 'public.', '') = 'can_write_club_team_seasonclub_team_season_id'
    and replace(regexp_replace(lower(pg_get_expr(polwithcheck, polrelid)), '[[:space:]()]', '', 'g'), 'public.', '') = 'can_write_club_team_seasonclub_team_season_id') then
    raise exception 'Expresiones RLS distintas de las autorizadas';
  end if;
  if not has_table_privilege('authenticated', v_rel, 'SELECT')
     or has_table_privilege('authenticated', v_rel, 'INSERT')
     or not has_column_privilege('authenticated', v_rel, 'club_team_season_id', 'INSERT')
     or not has_column_privilege('authenticated', v_rel, 'player_id', 'INSERT')
     or not has_column_privilege('authenticated', v_rel, 'joined_on', 'INSERT')
     or not has_column_privilege('authenticated', v_rel, 'left_on', 'INSERT')
     or not has_column_privilege('authenticated', v_rel, 'has_departed', 'INSERT')
     or has_column_privilege('authenticated', v_rel, 'id', 'INSERT')
     or has_column_privilege('authenticated', v_rel, 'voided_at', 'INSERT')
     or has_column_privilege('authenticated', v_rel, 'voided_by_membership_id', 'INSERT')
     or has_column_privilege('authenticated', v_rel, 'void_reason', 'INSERT')
     or has_column_privilege('authenticated', v_rel, 'created_by_membership_id', 'INSERT')
     or has_column_privilege('authenticated', v_rel, 'created_at', 'INSERT')
     or has_column_privilege('authenticated', v_rel, 'updated_at', 'INSERT')
     or has_table_privilege('authenticated', v_rel, 'UPDATE')
     or not has_column_privilege('authenticated', v_rel, 'joined_on', 'UPDATE')
     or not has_column_privilege('authenticated', v_rel, 'left_on', 'UPDATE')
     or not has_column_privilege('authenticated', v_rel, 'has_departed', 'UPDATE')
     or not has_column_privilege('authenticated', v_rel, 'void_reason', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'id', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'player_id', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'club_team_season_id', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'created_by_membership_id', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'voided_at', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'voided_by_membership_id', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'created_at', 'UPDATE')
     or has_column_privilege('authenticated', v_rel, 'updated_at', 'UPDATE')
     or has_table_privilege('authenticated', v_rel, 'DELETE')
     or has_table_privilege('authenticated', v_rel, 'REFERENCES')
     or has_any_column_privilege('authenticated', v_rel, 'REFERENCES')
     or has_table_privilege('authenticated', v_rel, 'TRUNCATE')
     or has_table_privilege('authenticated', v_rel, 'TRIGGER')
     or has_table_privilege('authenticated', v_rel, 'MAINTAIN')
     or has_table_privilege('anon', v_rel, 'SELECT')
     or has_any_column_privilege('anon', v_rel, 'SELECT')
     or has_table_privilege('anon', v_rel, 'INSERT')
     or has_any_column_privilege('anon', v_rel, 'INSERT')
     or has_table_privilege('anon', v_rel, 'UPDATE')
     or has_any_column_privilege('anon', v_rel, 'UPDATE')
     or has_table_privilege('anon', v_rel, 'DELETE')
     or has_table_privilege('anon', v_rel, 'REFERENCES')
     or has_any_column_privilege('anon', v_rel, 'REFERENCES')
     or has_table_privilege('anon', v_rel, 'TRUNCATE')
     or has_table_privilege('anon', v_rel, 'TRIGGER')
     or has_table_privilege('anon', v_rel, 'MAINTAIN') then
    raise exception 'Privilegios efectivos incompatibles';
  end if;
end
$postconditions$;
commit;
