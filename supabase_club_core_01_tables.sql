-- APPCAUDAL · Etapa A.1
-- Nucleo aditivo de clubs, memberships y permisos especiales.
-- No conecta todavia ninguna tabla deportiva.

begin;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_name_not_empty check (char_length(trim(name)) > 0)
);

create unique index if not exists clubs_name_normalized_uidx
on public.clubs (lower(trim(name)));

create table if not exists public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_memberships_role_check
    check (role in ('owner', 'admin', 'staff', 'viewer')),
  constraint club_memberships_club_user_key unique (club_id, user_id)
);

create index if not exists club_memberships_club_idx
on public.club_memberships (club_id);

create index if not exists club_memberships_user_idx
on public.club_memberships (user_id);

-- La restriccion UNIQUE ya crea un indice (club_id, user_id).
create index if not exists club_memberships_active_club_idx
on public.club_memberships (club_id, role, user_id)
where is_active;

create index if not exists club_memberships_active_user_idx
on public.club_memberships (user_id, club_id)
where is_active;

create table if not exists public.club_member_permissions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.club_memberships(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  constraint club_member_permissions_key_check check (
    permission_key in (
      'wellness_individual_read',
      'wellness_manage',
      'rpe_individual_read',
      'rpe_manage',
      'performance_aggregate_read'
    )
  ),
  constraint club_member_permissions_membership_key
    unique (membership_id, permission_key)
);

create index if not exists club_member_permissions_membership_idx
on public.club_member_permissions (membership_id);

create or replace function public.set_club_core_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clubs_updated_at on public.clubs;
create trigger set_clubs_updated_at
before update on public.clubs
for each row execute function public.set_club_core_updated_at();

drop trigger if exists set_club_memberships_updated_at on public.club_memberships;
create trigger set_club_memberships_updated_at
before update on public.club_memberships
for each row execute function public.set_club_core_updated_at();

comment on table public.clubs is
'Unidad propietaria de los datos deportivos compartidos de APPCAUDAL.';

comment on table public.club_memberships is
'Relacion entre usuarios autenticados y clubs. No concede ownership sobre datos deportivos hasta fases posteriores.';

comment on table public.club_member_permissions is
'Permisos sensibles explicitos. En Etapa A aun no se aplican a wellness, RPE ni rendimiento.';

commit;
