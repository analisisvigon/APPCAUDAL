-- APPCAUDAL / Sesiones 04A. BORRADOR PARA REVISIÓN; NO INSTALAR todavía.
-- Prepara instantáneas de plantilla y excepciones de disponibilidad. No carga
-- jugadores, no altera sesiones existentes y no habilita escrituras de clientes.
-- Requiere conciliar primero el resultado de supabase_sessions_04a_preflight.sql.
begin;
set local search_path = pg_catalog;

do $pre$
begin
  if to_regclass('public.planned_training_sessions') is null
     or to_regclass('public.club_team_season_players') is null
     or to_regclass('public.players_database') is null
     or to_regclass('public.player_positions') is null
     or to_regclass('public.club_team_seasons') is null
     or to_regclass('public.club_seasons') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Sesiones 04A: falta una dependencia; revisar preflight';
  end if;
  if obj_description(to_regclass('public.club_team_season_players'),'pg_class') is distinct from
       'APPCAUDAL Sesiones 01: canonical player membership in a club team-season, dates optional'
     or obj_description(to_regclass('public.planned_training_sessions'),'pg_class') is distinct from
       'APPCAUDAL Sesiones 03A: planned_training_sessions'
     or (select count(*) from pg_attribute a
         where a.attrelid=to_regclass('public.club_team_season_players')
           and a.attnum>0 and not a.attisdropped and
           ((a.attname in ('id','club_team_season_id','player_id')
             and a.atttypid='uuid'::regtype and a.attnotnull)
            or (a.attname='voided_at'
              and a.atttypid='timestamp with time zone'::regtype)
            or (a.attname in ('joined_on','left_on')
              and a.atttypid='date'::regtype)))<>6
     or (select count(*) from pg_attribute a
         where a.attrelid=to_regclass('public.planned_training_sessions')
           and a.attnum>0 and not a.attisdropped and
           ((a.attname in ('id','club_team_season_id')
             and a.atttypid='uuid'::regtype and a.attnotnull)
            or (a.attname='revision' and a.atttypid='integer'::regtype
              and a.attnotnull)
            or (a.attname='session_date' and a.atttypid='date'::regtype
              and a.attnotnull)))<>4
     or (select count(*) from pg_attribute a
         where a.attrelid=to_regclass('public.player_positions')
           and a.attnum>0 and not a.attisdropped and
           ((a.attname='player_id' and a.atttypid='uuid'::regtype)
            or (a.attname in ('position_type','position_key')
              and a.atttypid='text'::regtype)
            or (a.attname='is_primary' and a.atttypid='boolean'::regtype)))<>4
     or (select count(*) from pg_attribute a
         where a.attrelid=to_regclass('public.players_database')
           and a.attnum>0 and not a.attisdropped and
           ((a.attname='id' and a.atttypid='uuid'::regtype)
            or (a.attname='name' and a.atttypid='text'::regtype)))<>2
     or not exists(select 1 from pg_attribute a
         where a.attrelid=to_regclass('public.club_seasons')
           and a.attname='status' and a.atttypid='text'::regtype
           and a.attnotnull and not a.attisdropped) then
    raise exception 'Sesiones 04A: columnas o procedencia de tablas fuente incompatibles';
  end if;
  if to_regclass('public.planned_session_player_roster') is not null and
     obj_description(to_regclass('public.planned_session_player_roster'),'pg_class') is distinct from
       'APPCAUDAL Sesiones 04A: immutable session roster snapshot' then
    raise exception 'Sesiones 04A: nombre de tabla de plantilla ocupado';
  end if;
  if to_regclass('public.planned_session_player_availability') is not null and
     obj_description(to_regclass('public.planned_session_player_availability'),'pg_class') is distinct from
       'APPCAUDAL Sesiones 04A: sparse session availability overrides' then
    raise exception 'Sesiones 04A: nombre de tabla de disponibilidad ocupado';
  end if;
  if to_regprocedure('public.guard_planned_session_player_roster()') is not null and
     obj_description(to_regprocedure('public.guard_planned_session_player_roster()'),'pg_proc') is distinct from
       'APPCAUDAL Sesiones 04A: validate and freeze session player snapshot' then
    raise exception 'Sesiones 04A: nombre de guard de plantilla ocupado';
  end if;
  if to_regprocedure('public.guard_planned_session_player_availability()') is not null and
     obj_description(to_regprocedure('public.guard_planned_session_player_availability()'),'pg_proc') is distinct from
       'APPCAUDAL Sesiones 04A: protect session availability mutations' then
    raise exception 'Sesiones 04A: nombre de guard de disponibilidad ocupado';
  end if;
  if exists(select 1 from pg_trigger t where
       t.tgrelid=to_regclass('public.planned_session_player_roster')
       and t.tgname='planned_session_player_roster_guard'
       and t.tgfoid is distinct from
         to_regprocedure('public.guard_planned_session_player_roster()'))
     or exists(select 1 from pg_trigger t where
       t.tgrelid=to_regclass('public.planned_session_player_availability')
       and t.tgname='planned_session_player_availability_guard'
       and t.tgfoid is distinct from
         to_regprocedure('public.guard_planned_session_player_availability()')) then
    raise exception 'Sesiones 04A: trigger preexistente incompatible';
  end if;
  if not exists (select 1 from public.club_team_seasons cts
      join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
      where cts.id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
        and cts.team_id='85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and cts.season_id='a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid) then
    raise exception 'Sesiones 04A: CTS actual no coincide con la referencia revisada';
  end if;
end $pre$;

create table if not exists public.planned_session_player_roster (
  session_id uuid not null,
  player_id uuid not null,
  source_membership_id uuid not null,
  player_name_snapshot text not null,
  position_key_snapshot text,
  created_at timestamptz not null default now(),
  constraint planned_session_player_roster_pkey primary key (session_id,player_id),
  constraint planned_session_player_roster_source_key unique (session_id,source_membership_id),
  constraint planned_session_player_roster_session_fkey foreign key (session_id)
    references public.planned_training_sessions(id) on delete restrict,
  constraint planned_session_player_roster_player_fkey foreign key (player_id)
    references public.players_database(id) on delete restrict,
  constraint planned_session_player_roster_source_fkey foreign key (source_membership_id)
    references public.club_team_season_players(id) on delete restrict,
  constraint planned_session_player_roster_name_check
    check (nullif(btrim(player_name_snapshot),'') is not null
      and char_length(player_name_snapshot)<=300),
  constraint planned_session_player_roster_position_check
    check (position_key_snapshot is null or position_key_snapshot in
      ('goalkeeper','defender','midfielder','forward'))
);
comment on table public.planned_session_player_roster is
  'APPCAUDAL Sesiones 04A: immutable session roster snapshot';
create index if not exists planned_session_player_roster_source_idx
  on public.planned_session_player_roster(source_membership_id);

-- La ausencia de fila significa disponible SIN observación. Una observación
-- de un jugador disponible sí necesita fila, y queda vinculada a la sesión.
create table if not exists public.planned_session_player_availability (
  session_id uuid not null,
  player_id uuid not null,
  status text not null,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_session_player_availability_pkey primary key (session_id,player_id),
  constraint planned_session_player_availability_roster_fkey
    foreign key (session_id,player_id)
    references public.planned_session_player_roster(session_id,player_id) on delete restrict,
  constraint planned_session_player_availability_status_check
    check (status in ('available','absent','injured','adapted')),
  constraint planned_session_player_availability_observation_check
    check (observation is null or char_length(observation)<=1000),
  constraint planned_session_player_availability_sparse_check
    check (status<>'available' or nullif(btrim(observation),'') is not null)
);
comment on table public.planned_session_player_availability is
  'APPCAUDAL Sesiones 04A: sparse session availability overrides';

-- Defensa de integridad de la NUEVA tabla: nunca aceptar un jugador de otro
-- equipo-temporada ni tomar una posición desde campos legacy. Ningún registro
-- existente se toca. Los clientes carecen de INSERT/UPDATE/DELETE directo.
create or replace function public.guard_planned_session_player_roster()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_cts uuid;
  v_status text;
  v_session_date date;
  v_joined_on date;
  v_left_on date;
  v_name text;
  v_position text;
  v_primary_count integer;
begin
  if tg_op<>'INSERT' then
    raise exception 'La instantánea de plantilla es inmutable' using errcode='42501';
  end if;
  select s.club_team_season_id,se.status,s.session_date
    into v_cts,v_status,v_session_date
  from public.planned_training_sessions s
  join public.club_team_seasons cts on cts.id=s.club_team_season_id
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where s.id=new.session_id for update of se;
  if not found or v_status<>'open' or auth.uid() is null or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Plantilla de sesión no autorizada' using errcode='42501';
  end if;
  select m.joined_on,m.left_on into v_joined_on,v_left_on
  from public.club_team_season_players m
  where m.id=new.source_membership_id and m.club_team_season_id=v_cts
    and m.player_id=new.player_id and m.voided_at is null for share of m;
  if not found then
    raise exception 'Pertenencia canónica no corresponde a esta sesión y jugador'
      using errcode='23514';
  end if;
  if (v_joined_on is not null and v_session_date<v_joined_on) or
     (v_left_on is not null and v_session_date>=v_left_on) then
    raise exception 'Pertenencia fuera del intervalo conocido de la sesión'
      using errcode='23514';
  end if;
  select p.name into v_name from public.players_database p where p.id=new.player_id;
  if nullif(btrim(v_name),'') is null then
    raise exception 'Nombre canónico de jugador vacío' using errcode='23514';
  end if;
  new.player_name_snapshot:=v_name;
  select count(*),min(pos.position_key) into v_primary_count,v_position
  from public.player_positions pos
  where pos.player_id=new.player_id and pos.position_type='natural' and pos.is_primary;
  if v_primary_count>1 then
    raise exception 'Posición natural principal ambigua' using errcode='23514';
  end if;
  new.position_key_snapshot:=v_position;
  new.created_at:=now();
  return new;
end $fn$;
comment on function public.guard_planned_session_player_roster() is
  'APPCAUDAL Sesiones 04A: validate and freeze session player snapshot';

create or replace function public.guard_planned_session_player_availability()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_session_id uuid;
  v_cts uuid;
  v_status text;
begin
  if tg_op='DELETE' then v_session_id:=old.session_id;
  else v_session_id:=new.session_id; end if;
  if tg_op='UPDATE' and
     (new.session_id is distinct from old.session_id or
      new.player_id is distinct from old.player_id or
      new.created_at is distinct from old.created_at) then
    raise exception 'Identidad de disponibilidad inmutable' using errcode='42501';
  end if;
  select s.club_team_season_id,se.status into v_cts,v_status
  from public.planned_training_sessions s
  join public.club_team_seasons cts on cts.id=s.club_team_season_id
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where s.id=v_session_id for update of se;
  if not found or v_status<>'open' or auth.uid() is null or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Disponibilidad de sesión no autorizada' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='INSERT' then new.created_at:=now(); end if;
  new.updated_at:=now();
  return new;
end $fn$;
comment on function public.guard_planned_session_player_availability() is
  'APPCAUDAL Sesiones 04A: protect session availability mutations';

drop trigger if exists planned_session_player_roster_guard
  on public.planned_session_player_roster;
create trigger planned_session_player_roster_guard before insert or update or delete
  on public.planned_session_player_roster for each row
  execute function public.guard_planned_session_player_roster();
drop trigger if exists planned_session_player_availability_guard
  on public.planned_session_player_availability;
create trigger planned_session_player_availability_guard before insert or update or delete
  on public.planned_session_player_availability for each row
  execute function public.guard_planned_session_player_availability();

alter table public.planned_session_player_roster enable row level security;
alter table public.planned_session_player_availability enable row level security;
revoke all on table public.planned_session_player_roster,
  public.planned_session_player_availability from public,anon,authenticated,service_role;
grant select on table public.planned_session_player_roster,
  public.planned_session_player_availability to authenticated,service_role;
revoke all on function public.guard_planned_session_player_roster(),
  public.guard_planned_session_player_availability()
  from public,anon,authenticated,service_role;

do $pol$
begin
  if not exists (select 1 from pg_policy where
      polrelid='public.planned_session_player_roster'::regclass
      and polname='planned_session_player_roster_read') then
    create policy planned_session_player_roster_read
      on public.planned_session_player_roster for select to authenticated
      using (exists(select 1 from public.planned_training_sessions s
        where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
  if not exists (select 1 from pg_policy where
      polrelid='public.planned_session_player_availability'::regclass
      and polname='planned_session_player_availability_read') then
    create policy planned_session_player_availability_read
      on public.planned_session_player_availability for select to authenticated
      using (exists(select 1 from public.planned_training_sessions s
        where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
end $pol$;
alter policy planned_session_player_roster_read
  on public.planned_session_player_roster to authenticated
  using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
alter policy planned_session_player_availability_read
  on public.planned_session_player_availability to authenticated
  using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));

do $post$
begin
  if not exists (select 1 from pg_class where
      oid='public.planned_session_player_roster'::regclass and relrowsecurity)
     or not exists (select 1 from pg_class where
      oid='public.planned_session_player_availability'::regclass and relrowsecurity)
     or (select count(*) from pg_policy where polrelid in
      ('public.planned_session_player_roster'::regclass,
       'public.planned_session_player_availability'::regclass))<>2
     or (select count(*) from pg_policy where polrelid in
      ('public.planned_session_player_roster'::regclass,
       'public.planned_session_player_availability'::regclass)
       and polcmd='r' and polpermissive
       and polroles=array['authenticated'::regrole::oid]
       and polwithcheck is null)<>2
     or has_table_privilege('authenticated','public.planned_session_player_roster','INSERT')
     or has_table_privilege('authenticated','public.planned_session_player_roster','UPDATE')
     or has_table_privilege('authenticated','public.planned_session_player_roster','DELETE')
     or has_table_privilege('authenticated','public.planned_session_player_availability','INSERT')
     or has_table_privilege('authenticated','public.planned_session_player_availability','UPDATE')
     or has_table_privilege('authenticated','public.planned_session_player_availability','DELETE')
     or has_table_privilege('anon','public.planned_session_player_roster','SELECT')
     or has_table_privilege('anon','public.planned_session_player_availability','SELECT')
     or exists (select 1 from pg_attribute a where
       a.attrelid in ('public.planned_session_player_roster'::regclass,
         'public.planned_session_player_availability'::regclass)
       and a.attnum>0 and not a.attisdropped and
       (has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT,UPDATE')
        or has_column_privilege('anon',a.attrelid,a.attname,'INSERT,UPDATE'))) then
    raise exception 'Sesiones 04A: RLS o privilegios inesperados';
  end if;
  if (select count(*) from pg_constraint where
      conrelid='public.planned_session_player_roster'::regclass and convalidated)<>7
     or (select count(*) from pg_constraint where
      conrelid='public.planned_session_player_availability'::regclass and convalidated)<>5
     or (select count(*) from pg_trigger where tgrelid in
      ('public.planned_session_player_roster'::regclass,
       'public.planned_session_player_availability'::regclass)
      and not tgisinternal and tgenabled='O' and tgtype=31)<>2 then
    raise exception 'Sesiones 04A: constraints o guards incompletos';
  end if;
end $post$;
commit;
