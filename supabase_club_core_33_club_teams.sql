-- APPCAUDAL - Cambio 2: identidad de equipos propios del club.
-- Ejecutar el archivo completo en Supabase SQL Editor, despues del Cambio 1.
-- Solo crea public.club_teams y su seguridad; no modifica tablas deportivas.
-- El indice legacy equipos_rivales_one_own_club_uidx sigue limitando a un
-- solo team_kind = 'own'; ampliar ese modelo requiere un cambio posterior.

begin;

do $preconditions$
declare
  caudal_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  own_team_count bigint;
begin
  if auth.uid() is not null then
    raise exception 'Cambio 2 debe ejecutarse sin identidad JWT de aplicacion';
  end if;

  if pg_catalog.to_regclass('public.clubs') is null
     or pg_catalog.to_regclass('public.club_seasons') is null
     or pg_catalog.to_regclass('public.equipos_rivales') is null then
    raise exception 'Cambio 2: faltan clubs, club_seasons o equipos_rivales';
  end if;

  if pg_catalog.to_regprocedure('public.can_edit_club_data(uuid)') is null
     or pg_catalog.to_regprocedure('public.can_manage_club(uuid)') is null
     or pg_catalog.to_regprocedure('public.set_club_core_updated_at()') is null then
    raise exception 'Cambio 2: faltan helpers Club Core requeridos';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated', 'public.can_edit_club_data(uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.can_manage_club(uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated', 'public.equipos_rivales', 'SELECT'
     ) then
    raise exception 'Cambio 2: los helpers o la lectura legacy no estan disponibles para authenticated';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.equipos_rivales'::regclass
      and attribute.attname = 'id'
      and attribute.atttypid = 'uuid'::regtype
      and attribute.attnotnull
      and not attribute.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.equipos_rivales'::regclass
      and attribute.attname = 'name'
      and not attribute.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.equipos_rivales'::regclass
      and attribute.attname = 'team_kind'
      and attribute.atttypid = 'text'::regtype
      and not attribute.attisdropped
  ) then
    raise exception 'Cambio 2: columnas legacy de equipos_rivales incompatibles';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = any(constraint_row.conkey)
    where constraint_row.conrelid = 'public.equipos_rivales'::regclass
      and constraint_row.contype = 'p'
      and constraint_row.conkey = array[attribute.attnum]::smallint[]
      and attribute.attname = 'id'
  ) then
    raise exception 'Cambio 2: equipos_rivales.id debe ser primary key';
  end if;

  if (select pg_catalog.count(*) from public.clubs club
      where club.id = caudal_club_id
        and pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.btrim(club.name)), '[^a-z0-9]+', '', 'g'
        ) = 'cdcaudal') <> 1 then
    raise exception 'Cambio 2: el UUID estable no identifica al club C.D. Caudal';
  end if;

  select pg_catalog.count(*) into own_team_count
  from public.equipos_rivales team
  where team.team_kind = 'own';

  if own_team_count <> 1 then
    raise exception 'Cambio 2: se esperaba un unico equipo legacy own, hay %', own_team_count;
  end if;

  if not exists (
    select 1
    from public.equipos_rivales team
    where team.team_kind = 'own'
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.btrim(team.name::text)), '[^a-z0-9]+', '', 'g'
      ) in ('cdcaudal', 'caudaldeportivo', 'caudaldeportivodemieres')
  ) then
    raise exception 'Cambio 2: el unico equipo legacy own no es C.D. Caudal';
  end if;

  if pg_catalog.to_regclass('public.club_teams') is not null
     and pg_catalog.obj_description(
       pg_catalog.to_regclass('public.club_teams'), 'pg_class'
     )
         is distinct from 'APPCAUDAL Cambio 2: equipos propios vinculados al catalogo deportivo legacy.' then
    raise exception 'Cambio 2: club_teams ya existe sin el contrato de esta migracion';
  end if;
end;
$preconditions$;

create table if not exists public.club_teams (
  id uuid not null,
  club_id uuid not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint club_teams_pkey primary key (id),
  constraint club_teams_id_fkey foreign key (id)
    references public.equipos_rivales(id) on delete restrict,
  constraint club_teams_club_id_fkey foreign key (club_id)
    references public.clubs(id) on delete restrict,
  constraint club_teams_club_code_key unique (club_id, code),
  constraint club_teams_id_club_key unique (id, club_id),
  constraint club_teams_code_not_empty check (
    code = pg_catalog.btrim(code) and code <> ''
  )
);

-- Las dos UNIQUE crean los indices de club+codigo y de id+club necesarios
-- para consultas por club y futuras FKs compuestas. La PK indexa id.
alter table public.club_teams owner to postgres;
alter table public.club_teams enable row level security;

-- club_teams es el registro canonico de equipos propios. team_kind solo se
-- emplea para identificar al Caudal en la carga inicial, no para autorizar
-- futuras filas. La FK exige que el UUID deportivo exista.
do $policies$
begin
  if not exists (
    select 1 from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.club_teams'::regclass
      and policy.polname = 'club_teams_staff_select'
  ) then
    create policy club_teams_staff_select
    on public.club_teams for select to authenticated
    using (public.can_edit_club_data(club_id));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.club_teams'::regclass
      and policy.polname = 'club_teams_manager_insert'
  ) then
    create policy club_teams_manager_insert
    on public.club_teams for insert to authenticated
    with check (public.can_manage_club(club_id));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.club_teams'::regclass
      and policy.polname = 'club_teams_manager_update'
  ) then
    create policy club_teams_manager_update
    on public.club_teams for update to authenticated
    using (public.can_manage_club(club_id))
    with check (public.can_manage_club(club_id));
  end if;
end;
$policies$;

-- Una repeticion tambien corrige las policies si se aplico una version previa
-- del Cambio 2 que aun exigia team_kind = 'own'.
alter policy club_teams_staff_select on public.club_teams
  to authenticated
  using (public.can_edit_club_data(club_id));

alter policy club_teams_manager_insert on public.club_teams
  to authenticated
  with check (public.can_manage_club(club_id));

alter policy club_teams_manager_update on public.club_teams
  to authenticated
  using (public.can_manage_club(club_id))
  with check (public.can_manage_club(club_id));

-- UPDATE a clientes solo de codigo/actividad. id y club_id son identidad fija.
-- No se concede DELETE ni se define policy DELETE.
revoke all on table public.club_teams from public, anon, authenticated, service_role;
grant select, insert on table public.club_teams to authenticated;
grant update (code, is_active) on table public.club_teams to authenticated;
grant select, insert, update on table public.club_teams to service_role;

do $trigger$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_teams'::regclass
      and trigger_row.tgname = 'set_club_teams_updated_at'
      and not trigger_row.tgisinternal
  ) then
    create trigger set_club_teams_updated_at
    before update on public.club_teams
    for each row execute function public.set_club_core_updated_at();
  end if;
end;
$trigger$;

insert into public.club_teams (id, club_id, code, is_active)
select
  team.id,
  'ca0da100-0000-4000-8000-000000000001'::uuid,
  'caudal',
  true
from public.equipos_rivales team
where team.team_kind = 'own'
on conflict (id) do nothing;

comment on table public.club_teams is
'APPCAUDAL Cambio 2: equipos propios vinculados al catalogo deportivo legacy.';

do $postconditions$
declare
  caudal_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  own_team_id uuid;
  team_id_attnum smallint;
  team_club_attnum smallint;
  team_code_attnum smallint;
  legacy_id_attnum smallint;
  club_id_attnum smallint;
  expected_constraints constant text[] := array[
    'club_teams_pkey', 'club_teams_id_fkey', 'club_teams_club_id_fkey',
    'club_teams_club_code_key', 'club_teams_id_club_key',
    'club_teams_code_not_empty'
  ]::text[];
begin
  if (select pg_catalog.count(*) from public.equipos_rivales team
      where team.team_kind = 'own') <> 1 then
    raise exception 'Cambio 2: cambio el numero de equipos legacy own durante la migracion';
  end if;

  select team.id into own_team_id
  from public.equipos_rivales team
  where team.team_kind = 'own';

  if (select pg_catalog.count(*) from public.club_teams team
      where team.id = own_team_id
        and team.club_id = caudal_club_id
        and team.code = 'caudal') <> 1 then
    raise exception 'Cambio 2: el equipo propio no conserva identidad, club y codigo esperados';
  end if;

  if (select pg_catalog.count(*) from pg_catalog.pg_attribute attribute
      where attribute.attrelid = 'public.club_teams'::regclass
        and attribute.attnum > 0 and not attribute.attisdropped
        and (
          (attribute.attname = 'id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
          or (attribute.attname = 'club_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
          or (attribute.attname = 'code' and attribute.atttypid = 'text'::regtype and attribute.attnotnull)
          or (attribute.attname = 'is_active' and attribute.atttypid = 'boolean'::regtype and attribute.attnotnull)
          or (attribute.attname = 'created_at' and attribute.atttypid = 'timestamptz'::regtype and attribute.attnotnull)
          or (attribute.attname = 'updated_at' and attribute.atttypid = 'timestamptz'::regtype and attribute.attnotnull)
        )) <> 6 then
    raise exception 'Cambio 2: columnas de club_teams incompatibles';
  end if;

  select attribute.attnum into team_id_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_teams'::regclass
    and attribute.attname = 'id' and not attribute.attisdropped;
  select attribute.attnum into team_club_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_teams'::regclass
    and attribute.attname = 'club_id' and not attribute.attisdropped;
  select attribute.attnum into team_code_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_teams'::regclass
    and attribute.attname = 'code' and not attribute.attisdropped;
  select attribute.attnum into legacy_id_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.equipos_rivales'::regclass
    and attribute.attname = 'id' and not attribute.attisdropped;
  select attribute.attnum into club_id_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.clubs'::regclass
    and attribute.attname = 'id' and not attribute.attisdropped;

  if exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_teams'::regclass
      and constraint_row.conname = any(expected_constraints)
      and not constraint_row.convalidated
  ) or (select pg_catalog.count(*) from pg_catalog.pg_constraint constraint_row
          where constraint_row.conrelid = 'public.club_teams'::regclass
            and constraint_row.conname = any(expected_constraints)) <> 6 then
    raise exception 'Cambio 2: faltan constraints validadas de club_teams';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.club_teams'::regclass
      and c.conname = 'club_teams_pkey' and c.contype = 'p'
      and c.convalidated and not c.condeferrable
      and c.conkey = array[team_id_attnum]::smallint[]
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.club_teams'::regclass
      and c.conname = 'club_teams_club_code_key' and c.contype = 'u'
      and c.convalidated and not c.condeferrable
      and c.conkey = array[team_club_attnum, team_code_attnum]::smallint[]
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.club_teams'::regclass
      and c.conname = 'club_teams_id_club_key' and c.contype = 'u'
      and c.convalidated and not c.condeferrable
      and c.conkey = array[team_id_attnum, team_club_attnum]::smallint[]
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.club_teams'::regclass
      and c.conname = 'club_teams_code_not_empty' and c.contype = 'c'
      and c.convalidated and not c.connoinherit
      and c.conkey = array[team_code_attnum]::smallint[]
  ) then
    raise exception 'Cambio 2: PK, UNIQUE o CHECK de codigo incompatibles';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_teams'::regclass
      and constraint_row.conname = 'club_teams_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.convalidated
      and not constraint_row.condeferrable
      and constraint_row.conkey = array[team_id_attnum]::smallint[]
      and constraint_row.confrelid = 'public.equipos_rivales'::regclass
      and constraint_row.confkey = array[legacy_id_attnum]::smallint[]
      and constraint_row.confmatchtype = 's'
      and constraint_row.confdeltype = 'r'
      and constraint_row.confupdtype = 'a'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_teams'::regclass
      and constraint_row.conname = 'club_teams_club_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.convalidated
      and not constraint_row.condeferrable
      and constraint_row.conkey = array[team_club_attnum]::smallint[]
      and constraint_row.confrelid = 'public.clubs'::regclass
      and constraint_row.confkey = array[club_id_attnum]::smallint[]
      and constraint_row.confmatchtype = 's'
      and constraint_row.confdeltype = 'r'
      and constraint_row.confupdtype = 'a'
  ) then
    raise exception 'Cambio 2: claves foraneas incompatibles';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class relation
    where relation.oid = 'public.club_teams'::regclass
      and relation.relowner = 'postgres'::regrole
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
  ) or (select pg_catalog.count(*) from pg_catalog.pg_policy policy
        where policy.polrelid = 'public.club_teams'::regclass) <> 3
     or (select pg_catalog.count(*) from pg_catalog.pg_policy policy
         where policy.polrelid = 'public.club_teams'::regclass
           and policy.polpermissive
           and policy.polroles = array[
             (select role_row.oid from pg_catalog.pg_roles role_row
              where role_row.rolname = 'authenticated')
           ]::oid[]
           and (
             (policy.polname = 'club_teams_staff_select' and policy.polcmd = 'r')
             or (policy.polname = 'club_teams_manager_insert' and policy.polcmd = 'a')
             or (policy.polname = 'club_teams_manager_update' and policy.polcmd = 'w')
           )) <> 3 then
    raise exception 'Cambio 2: RLS o conjunto de policies incompatible';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.club_teams'::regclass
      and policy.polname = 'club_teams_staff_select'
      and pg_catalog.regexp_replace(pg_catalog.replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)),
        'public.', ''
      ), '[[:space:]()]', '', 'g') = 'can_edit_club_dataclub_id'
      and policy.polwithcheck is null
  ) or not exists (
    select 1 from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.club_teams'::regclass
      and policy.polname = 'club_teams_manager_insert'
      and policy.polqual is null
      and pg_catalog.regexp_replace(pg_catalog.replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)),
        'public.', ''
      ), '[[:space:]()]', '', 'g') = 'can_manage_clubclub_id'
  ) or not exists (
    select 1 from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.club_teams'::regclass
      and policy.polname = 'club_teams_manager_update'
      and pg_catalog.regexp_replace(pg_catalog.replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)),
        'public.', ''
      ), '[[:space:]()]', '', 'g') = 'can_manage_clubclub_id'
      and pg_catalog.regexp_replace(pg_catalog.replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)),
        'public.', ''
      ), '[[:space:]()]', '', 'g') = 'can_manage_clubclub_id'
  ) then
    raise exception 'Cambio 2: expresiones RLS de club_teams incompatibles';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_teams'::regclass
      and trigger_row.tgname = 'set_club_teams_updated_at'
      and trigger_row.tgfoid = 'public.set_club_core_updated_at()'::regprocedure
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 19
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Cambio 2: trigger de updated_at incompatible';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.club_teams', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.club_teams', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.club_teams', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.club_teams', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.club_teams', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.club_teams', 'TRUNCATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.club_teams', 'id', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.club_teams', 'club_id', 'UPDATE')
     or not pg_catalog.has_table_privilege('authenticated', 'public.club_teams', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.club_teams', 'INSERT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.club_teams', 'code', 'UPDATE')
     or not pg_catalog.has_column_privilege('authenticated', 'public.club_teams', 'is_active', 'UPDATE') then
    raise exception 'Cambio 2: grants cliente incompatibles';
  end if;
end;
$postconditions$;

commit;
