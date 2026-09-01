-- APPCAUDAL - Bloque 4.1
-- Cimientos del modulo Multas: temporada, capability y sujetos sancionables.
--
-- Este bloque no crea catalogo, incidentes, multas, pagos ni frontend.
-- Debe ejecutarse una sola vez, sin una identidad JWT de aplicacion activa.

begin;

do $preconditions$
declare
  permission_constraint_definition text;
  permission_keys text[];
  helper_name text;
  helper_oid oid;
  helper_fingerprint text;
begin
  if auth.uid() is not null then
    raise exception 'Bloque 4.1 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if pg_catalog.to_regclass('public.clubs') is null
     or pg_catalog.to_regclass('public.club_memberships') is null
     or pg_catalog.to_regclass('public.club_member_permissions') is null
     or pg_catalog.to_regclass('public.jugadores') is null then
    raise exception 'Bloque 4.1: faltan tablas heredadas requeridas';
  end if;

  if pg_catalog.to_regclass('public.club_seasons') is not null
     or pg_catalog.to_regclass('public.fine_subjects') is not null
     or pg_catalog.to_regprocedure('public.can_manage_fines()') is not null
     or pg_catalog.to_regprocedure('public.guard_fine_subject_identity()') is not null then
    raise exception 'Bloque 4.1: ya existe algun objeto del bloque; revisar antes de reemplazar';
  end if;

  if (select pg_catalog.count(*) from public.clubs) <> 1 then
    raise exception 'Bloque 4.1: el vinculo jugador-club solo es inequivoco mientras exista un unico club';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.jugadores'::regclass
      and attribute.attname = 'active_in_squad'
      and attribute.atttypid = 'boolean'::regtype
      and attribute.attnotnull
      and not attribute.attisdropped
  ) then
    raise exception 'Bloque 4.1: jugadores.active_in_squad boolean NOT NULL es obligatorio';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.jugadores'::regclass
      and attribute.attname = 'name'
      and attribute.atttypid = 'text'::regtype
      and not attribute.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.jugadores'::regclass
      and attribute.attname = 'shirt_name'
      and attribute.atttypid = 'text'::regtype
      and not attribute.attisdropped
  ) then
    raise exception 'Bloque 4.1: faltan jugadores.name/shirt_name para la presentacion canonica';
  end if;

  if exists (
    select 1
    from public.jugadores player
    where player.active_in_squad
      and coalesce(
        nullif(pg_catalog.btrim(player.name), ''),
        nullif(pg_catalog.btrim(player.shirt_name), '')
      ) is null
  ) then
    raise exception 'Bloque 4.1: hay jugadores activos sin nombre canonico utilizable';
  end if;

  if pg_catalog.to_regprocedure('public.set_club_core_updated_at()') is null
     or pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.current_jugador_id()') is null
     or pg_catalog.to_regprocedure('public.is_app_staff()') is null
     or pg_catalog.to_regprocedure('public.is_player()') is null
     or pg_catalog.to_regprocedure('public.has_club_permission(uuid,text)') is null then
    raise exception 'Bloque 4.1: faltan helpers Club Core requeridos';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = 'public.club_member_permissions'::regclass
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
  ) then
    raise exception 'Bloque 4.1: club_member_permissions debe conservar RLS ON y FORCE RLS OFF';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.club_member_permissions'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and (
        (attribute.attname = 'id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
        or (attribute.attname = 'membership_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
        or (attribute.attname = 'permission_key' and attribute.atttypid = 'text'::regtype and attribute.attnotnull)
        or (attribute.attname = 'created_at' and attribute.atttypid = 'timestamptz'::regtype and attribute.attnotnull)
      )
  ) <> 4 then
    raise exception 'Bloque 4.1: columnas requeridas de club_member_permissions incompatibles';
  end if;

  select pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
  into permission_constraint_definition
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_member_permissions'::regclass
    and constraint_row.conname = 'club_member_permissions_key_check'
    and constraint_row.contype = 'c'
    and constraint_row.convalidated;

  if permission_constraint_definition is null then
    raise exception 'Bloque 4.1: falta club_member_permissions_key_check validado';
  end if;

  select pg_catalog.array_agg(match[1] order by match[1])
  into permission_keys
  from pg_catalog.regexp_matches(
    permission_constraint_definition,
    $regex$'([^']+)'$regex$,
    'g'
  ) match;

  if permission_keys is distinct from array[
    'performance_aggregate_read',
    'rpe_individual_read',
    'rpe_manage',
    'wellness_individual_read',
    'wellness_manage'
  ]::text[] then
    raise exception 'Bloque 4.1: allowlist de permisos heredada en drift: %', permission_keys;
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.club_member_permissions'::regclass
      and policy.polname in (
        'Members can read permitted permission rows',
        'Club managers can insert permissions',
        'Club managers can update permissions',
        'Club managers can delete permissions'
      )
  ) <> 4 or exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.club_member_permissions'::regclass
      and (
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')),
          '[[:space:]()]', '', 'g'
        ) = 'true'
        or pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')),
          '[[:space:]()]', '', 'g'
        ) = 'true'
      )
  ) then
    raise exception 'Bloque 4.1: RLS heredada de club_member_permissions incompatible';
  end if;

  if exists (
       select 1
       from pg_catalog.pg_class relation
       cross join lateral pg_catalog.aclexplode(
         coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
       ) acl
       where relation.oid = 'public.club_member_permissions'::regclass
         and acl.grantee = 0
         and acl.privilege_type = 'SELECT'
     )
     or pg_catalog.has_table_privilege('anon', 'public.club_member_permissions', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.club_member_permissions', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.club_member_permissions', 'INSERT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.club_member_permissions', 'UPDATE')
     or not pg_catalog.has_table_privilege('authenticated', 'public.club_member_permissions', 'DELETE') then
    raise exception 'Bloque 4.1: grants heredados de club_member_permissions incompatibles';
  end if;

  foreach helper_name in array array[
    'public.current_membership()',
    'public.current_jugador_id()',
    'public.is_app_staff()',
    'public.is_player()'
  ]
  loop
    helper_oid := pg_catalog.to_regprocedure(helper_name);
    select pg_catalog.md5(
      pg_catalog.pg_get_functiondef(procedure_row.oid)
      || coalesce(procedure_row.proacl::text, '')
      || coalesce(procedure_row.proconfig::text, '')
      || procedure_row.proowner::text
    )
    into helper_fingerprint
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = helper_oid;

    perform pg_catalog.set_config(
      'appcaudal.block_4_1_before_' || pg_catalog.replace(
        pg_catalog.replace(helper_name, 'public.', ''), '()', ''
      ),
      helper_fingerprint,
      true
    );
  end loop;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Bloque 4.1: faltan roles Supabase requeridos';
  end if;
end;
$preconditions$;

alter table public.club_member_permissions
  drop constraint club_member_permissions_key_check,
  add constraint club_member_permissions_key_check check (
    permission_key in (
      'wellness_individual_read',
      'wellness_manage',
      'rpe_individual_read',
      'rpe_manage',
      'performance_aggregate_read',
      'fines_manage'
    )
  );

create table public.club_seasons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  code text not null,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint club_seasons_code_not_empty check (
    pg_catalog.char_length(pg_catalog.btrim(code)) > 0
  ),
  constraint club_seasons_label_not_empty check (
    pg_catalog.char_length(pg_catalog.btrim(label)) > 0
  ),
  constraint club_seasons_date_order_check check (starts_on <= ends_on),
  constraint club_seasons_club_code_key unique (club_id, code)
);

create unique index club_seasons_one_active_per_club_uidx
on public.club_seasons (club_id)
where is_active;

create table public.fine_subjects (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  subject_type text not null,
  jugador_id uuid null references public.jugadores(id) on delete restrict,
  staff_membership_id uuid null references public.club_memberships(id) on delete restrict,
  display_name text null,
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint fine_subjects_identity_check check (
    (
      subject_type = 'player'
      and jugador_id is not null
      and staff_membership_id is null
    )
    or
    (
      subject_type = 'staff'
      and staff_membership_id is not null
      and jugador_id is null
    )
  ),
  constraint fine_subjects_display_name_check check (
    display_name is null
    or pg_catalog.char_length(pg_catalog.btrim(display_name)) > 0
  )
);

create unique index fine_subjects_club_player_uidx
on public.fine_subjects (club_id, jugador_id)
where subject_type = 'player';

create unique index fine_subjects_club_staff_uidx
on public.fine_subjects (club_id, staff_membership_id)
where subject_type = 'staff';

create index fine_subjects_club_active_idx
on public.fine_subjects (club_id, subject_type, active);

create function public.guard_fine_subject_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  canonical_club_id uuid;
  canonical_player_name text;
  player_is_active boolean;
  staff_club_id uuid;
  staff_role text;
  staff_is_active boolean;
begin
  if new.subject_type = 'player' then
    select
      (pg_catalog.array_agg(club.id order by club.id))[1],
      pg_catalog.count(*) = 1
    into canonical_club_id, player_is_active
    from public.clubs club;

    if not player_is_active or new.club_id is distinct from canonical_club_id then
      raise exception 'No existe un vinculo inequivoco entre el jugador y el club solicitado'
        using errcode = '23514';
    end if;

    select
      coalesce(
        nullif(pg_catalog.btrim(player.name), ''),
        nullif(pg_catalog.btrim(player.shirt_name), '')
      ),
      player.active_in_squad
    into canonical_player_name, player_is_active
    from public.jugadores player
    where player.id = new.jugador_id;

    if not found or canonical_player_name is null then
      raise exception 'El jugador sancionable no existe o carece de nombre canonico'
        using errcode = '23503';
    end if;

    if new.active and not player_is_active then
      raise exception 'Solo un jugador de la plantilla activa puede ser sujeto activo'
        using errcode = '23514';
    end if;

    new.display_name := canonical_player_name;
  elsif new.subject_type = 'staff' then
    select membership.club_id, membership.role, membership.is_active
    into staff_club_id, staff_role, staff_is_active
    from public.club_memberships membership
    where membership.id = new.staff_membership_id;

    if not found then
      raise exception 'La membership STAFF sancionable no existe'
        using errcode = '23503';
    end if;

    if staff_club_id is distinct from new.club_id then
      raise exception 'La membership STAFF no pertenece al club solicitado'
        using errcode = '23514';
    end if;

    if staff_role not in ('owner', 'admin', 'staff') then
      raise exception 'La membership indicada no representa STAFF de aplicacion'
        using errcode = '23514';
    end if;

    if new.active and not staff_is_active then
      raise exception 'Una membership STAFF inactiva no puede ser sujeto activo'
        using errcode = '23514';
    end if;
  else
    raise exception 'subject_type no soportado'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

comment on function public.guard_fine_subject_identity() is
'Valida la identidad estructurada y la pertenencia al club de cada sujeto de Multas; bloquea PLAYER cross-club si deja de existir el invariante de club unico.';

create trigger guard_fine_subject_identity
before insert or update of club_id, subject_type, jugador_id,
  staff_membership_id, display_name, active
on public.fine_subjects
for each row execute function public.guard_fine_subject_identity();

create trigger set_club_seasons_updated_at
before update on public.club_seasons
for each row execute function public.set_club_core_updated_at();

create trigger set_fine_subjects_updated_at
before update on public.fine_subjects
for each row execute function public.set_club_core_updated_at();

create function public.can_manage_fines()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select coalesce(
    public.is_app_staff()
    or (
      public.is_player()
      and exists (
        select 1
        from public.current_membership() membership
        where public.has_club_permission(
          membership.club_id,
          'fines_manage'
        )
      )
    ),
    false
  );
$function$;

comment on function public.can_manage_fines() is
'True para owner/admin/staff activos o para PLAYER activo con fines_manage; no concede permisos fuera del dominio Multas.';

alter function public.guard_fine_subject_identity() owner to postgres;
alter function public.can_manage_fines() owner to postgres;
alter table public.club_seasons owner to postgres;
alter table public.fine_subjects owner to postgres;

revoke all on function public.guard_fine_subject_identity()
from public, anon, authenticated, service_role;

revoke all on function public.can_manage_fines()
from public, anon, authenticated, service_role;

grant execute on function public.can_manage_fines()
to authenticated, service_role;

alter table public.club_seasons enable row level security;
alter table public.fine_subjects enable row level security;

create policy "Fines staff can read club seasons"
on public.club_seasons
for select
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
);

create policy "Fines staff can read subjects"
on public.fine_subjects
for select
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
);

revoke all on table public.club_seasons
from public, anon, authenticated, service_role;
revoke all on table public.fine_subjects
from public, anon, authenticated, service_role;

grant select on table public.club_seasons, public.fine_subjects
to authenticated;

grant select, insert, update, delete
on table public.club_seasons, public.fine_subjects
to service_role;

-- sportsSeason.js fija de forma inequivoca julio-junio y usa el anio inicial
-- como key. Las fechas son la autoridad; label solo es presentacion.
insert into public.club_seasons (
  club_id, code, label, starts_on, ends_on, is_active
)
select
  club.id,
  '2026',
  '2026/2027',
  date '2026-07-01',
  date '2027-06-30',
  true
from public.clubs club
on conflict (club_id, code) do nothing;

-- public.jugadores es la plantilla propia. No se necesita Auth ni una
-- club_membership PLAYER para crear la identidad financiera del jugador.
insert into public.fine_subjects (
  club_id, subject_type, jugador_id, display_name, active
)
select
  club.id,
  'player',
  player.id,
  coalesce(
    nullif(pg_catalog.btrim(player.name), ''),
    nullif(pg_catalog.btrim(player.shirt_name), '')
  ),
  true
from public.clubs club
cross join public.jugadores player
where player.active_in_squad
on conflict (club_id, jugador_id) where subject_type = 'player'
do nothing;

do $postconditions$
declare
  permission_constraint_definition text;
  permission_keys text[];
  helper_name text;
  helper_oid oid;
  helper_fingerprint text;
  function_oid oid := 'public.can_manage_fines()'::regprocedure;
  function_owner oid;
begin
  foreach helper_name in array array[
    'public.current_membership()',
    'public.current_jugador_id()',
    'public.is_app_staff()',
    'public.is_player()'
  ]
  loop
    helper_oid := pg_catalog.to_regprocedure(helper_name);
    select pg_catalog.md5(
      pg_catalog.pg_get_functiondef(procedure_row.oid)
      || coalesce(procedure_row.proacl::text, '')
      || coalesce(procedure_row.proconfig::text, '')
      || procedure_row.proowner::text
    )
    into helper_fingerprint
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = helper_oid;

    if helper_fingerprint is distinct from pg_catalog.current_setting(
      'appcaudal.block_4_1_before_' || pg_catalog.replace(
        pg_catalog.replace(helper_name, 'public.', ''), '()', ''
      ),
      true
    ) then
      raise exception 'Bloque 4.1: el helper heredado % fue modificado', helper_name;
    end if;
  end loop;

  select pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
  into permission_constraint_definition
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.club_member_permissions'::regclass
    and constraint_row.conname = 'club_member_permissions_key_check'
    and constraint_row.contype = 'c'
    and constraint_row.convalidated;

  select pg_catalog.array_agg(match[1] order by match[1])
  into permission_keys
  from pg_catalog.regexp_matches(
    permission_constraint_definition,
    $regex$'([^']+)'$regex$,
    'g'
  ) match;

  if permission_keys is distinct from array[
    'fines_manage',
    'performance_aggregate_read',
    'rpe_individual_read',
    'rpe_manage',
    'wellness_individual_read',
    'wellness_manage'
  ]::text[] then
    raise exception 'Bloque 4.1: allowlist final de permisos incorrecta';
  end if;

  select procedure_row.proowner
  into function_owner
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_language language on language.oid = procedure_row.prolang
  where procedure_row.oid = function_oid
    and pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
    and language.lanname = 'sql'
    and procedure_row.pronargs = 0
    and procedure_row.prorettype = 'boolean'::regtype
    and procedure_row.provolatile = 's'
    and not procedure_row.prosecdef
    and procedure_row.proconfig = array['search_path=pg_catalog']::text[]
    and pg_catalog.strpos(procedure_row.prosrc, 'public.is_app_staff()') > 0
    and pg_catalog.strpos(procedure_row.prosrc, 'public.is_player()') > 0
    and pg_catalog.strpos(procedure_row.prosrc, 'public.current_membership()') > 0
    and pg_catalog.strpos(procedure_row.prosrc, 'public.has_club_permission') > 0
    and pg_catalog.strpos(procedure_row.prosrc, '''fines_manage''') > 0;

  if function_owner is null
     or exists (
       select 1
       from pg_catalog.pg_proc procedure_row
       cross join lateral pg_catalog.aclexplode(
         coalesce(procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner))
       ) acl
       where procedure_row.oid = function_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE') then
    raise exception 'Bloque 4.1: contrato o ACL de can_manage_fines() incorrecto';
  end if;

  if (select pg_catalog.count(*) from public.club_seasons) <> 1
     or not exists (
       select 1
       from public.club_seasons season
       where season.code = '2026'
         and season.label = '2026/2027'
         and season.starts_on = date '2026-07-01'
         and season.ends_on = date '2027-06-30'
         and season.is_active
     ) then
    raise exception 'Bloque 4.1: seed de temporada 2026/2027 incorrecto';
  end if;

  if (
    select pg_catalog.count(*)
    from public.fine_subjects subject
    where subject.subject_type = 'player' and subject.active
  ) <> (
    select pg_catalog.count(*)
    from public.jugadores player
    where player.active_in_squad
  ) or exists (
    select 1 from public.fine_subjects where subject_type = 'staff'
  ) then
    raise exception 'Bloque 4.1: seed de fine_subjects no coincide con la plantilla activa';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid in (
      'public.club_seasons'::regclass,
      'public.fine_subjects'::regclass
    )
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  ) then
    raise exception 'Bloque 4.1: existe una FK destructiva ON DELETE CASCADE';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class relation
    where relation.oid = 'public.club_seasons'::regclass
      and relation.relrowsecurity and not relation.relforcerowsecurity
  ) or not exists (
    select 1 from pg_catalog.pg_class relation
    where relation.oid = 'public.fine_subjects'::regclass
      and relation.relrowsecurity and not relation.relforcerowsecurity
  ) then
    raise exception 'Bloque 4.1: RLS final incorrecta';
  end if;

  if exists (
       select 1
       from pg_catalog.pg_class relation
       cross join lateral pg_catalog.aclexplode(
         coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
       ) acl
       where relation.oid in (
         'public.club_seasons'::regclass,
         'public.fine_subjects'::regclass
       )
         and acl.grantee = 0
         and acl.privilege_type = 'SELECT'
     )
     or pg_catalog.has_table_privilege('anon', 'public.club_seasons', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.fine_subjects', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.fine_subjects', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_subjects', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_subjects', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_subjects', 'DELETE') then
    raise exception 'Bloque 4.1: grants finales de tablas incorrectos';
  end if;
end;
$postconditions$;

comment on table public.club_seasons is
'Temporadas canonicas por club. Las fechas son la autoridad para el modulo Multas.';

comment on table public.fine_subjects is
'Identidades sancionables del modulo Multas. jugador_id o staff_membership_id son autoridad; display_name es solo presentacion.';

comment on column public.fine_subjects.display_name is
'Nombre de presentacion. Se deriva de jugadores para PLAYER; permanece nullable para STAFF hasta disponer de una fuente publica fiable.';

commit;
