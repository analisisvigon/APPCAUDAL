-- APPCAUDAL · Etapa A.5
-- Alta SUPERVISADA de miembros iniciales.
--
-- Este archivo es seguro sin editar: la tabla temporal comienza vacia y no
-- incorpora automaticamente ningun usuario de auth.users.
--
-- Antes de ejecutarlo, anada filas reales inmediatamente despues del CREATE:
--   insert into initial_club_members (email, user_id, role, is_active)
--   values (...);
-- Use email O user_id. No deje ambos vacios. Roles: owner/admin/staff/viewer.
-- La primera ejecucion debe incluir al menos un owner activo.

begin;

create temporary table initial_club_members (
  email text,
  user_id uuid,
  role text not null check (role in ('owner', 'admin', 'staff', 'viewer')),
  is_active boolean not null default true,
  check (
    (email is not null and char_length(trim(email)) > 0)
    or user_id is not null
  )
) on commit drop;

-- INSERTAR AQUI LOS USUARIOS REALES ANTES DE EJECUTAR EL ARCHIVO.

do $$
declare
  caudal_club_id uuid;
  unresolved_count integer;
  configured_count integer;
  active_owner_count integer;
begin
  select id into caudal_club_id
  from public.clubs
  where lower(trim(name)) = lower('C.D. Caudal')
  limit 1;

  if caudal_club_id is null then
    raise exception 'C.D. Caudal no existe; ejecute primero la migracion 04';
  end if;

  select count(*) into configured_count from initial_club_members;
  if configured_count = 0 then
    raise notice 'No se configuraron miembros. No se insertara ninguna membership.';
    return;
  end if;

  select count(*)
    into unresolved_count
  from initial_club_members configured
  left join auth.users account
    on account.id = configured.user_id
    or (
      configured.user_id is null
      and lower(account.email) = lower(trim(configured.email))
    )
  where account.id is null;

  if unresolved_count > 0 then
    raise exception 'Hay % usuarios que no existen en auth.users', unresolved_count;
  end if;

  select count(*)
    into active_owner_count
  from initial_club_members
  where role = 'owner' and is_active;

  if active_owner_count = 0
     and not exists (
       select 1
       from public.club_memberships
       where club_id = caudal_club_id
         and role = 'owner'
         and is_active
     ) then
    raise exception 'La configuracion inicial debe conservar al menos un owner activo';
  end if;

  insert into public.club_memberships (club_id, user_id, role, is_active)
  select
    caudal_club_id,
    account.id,
    configured.role,
    configured.is_active
  from initial_club_members configured
  join auth.users account
    on account.id = configured.user_id
    or (
      configured.user_id is null
      and lower(account.email) = lower(trim(configured.email))
    )
  on conflict (club_id, user_id) do update
  set
    role = excluded.role,
    is_active = excluded.is_active,
    updated_at = now();
end;
$$;

select
  club.name as club,
  membership.user_id,
  account.email,
  membership.role,
  membership.is_active
from public.club_memberships membership
join public.clubs club on club.id = membership.club_id
join auth.users account on account.id = membership.user_id
where lower(trim(club.name)) = lower('C.D. Caudal')
order by membership.role, account.email;

commit;
